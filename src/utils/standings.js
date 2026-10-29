import { confirmedResult } from "./matchRules";
export function calculateStandings(
  teams,
  matches,
  group,
  rules,
  manualOrder = [],
) {
  const rows = teams
    .filter((t) => t.group === group)
    .map((team) => ({
      team,
      played: 0,
      wins: 0,
      losses: 0,
      setsFor: 0,
      setsAgainst: 0,
      pointsFor: 0,
      pointsAgainst: 0,
    }));
  const valid = matches.filter(
    (m) =>
      m.stage === "group" && m.group === group && confirmedResult(m, rules),
  );
  valid.forEach((m) => {
    const h = rows.find((r) => r.team.id === m.homeTeamId);
    const a = rows.find((r) => r.team.id === m.awayTeamId);
    if (!h || !a) return;
    const r = confirmedResult(m, rules);
    h.played++;
    a.played++;
    h.setsFor += r.homeWins;
    h.setsAgainst += r.awayWins;
    a.setsFor += r.awayWins;
    a.setsAgainst += r.homeWins;
    if (r.winnerTeamId === h.team.id) {
      h.wins++;
      a.losses++;
    } else {
      a.wins++;
      h.losses++;
    }
    m.sets.forEach((s) => {
      if (s.home === "" || s.away === "") return;
      h.pointsFor += s.home;
      h.pointsAgainst += s.away;
      a.pointsFor += s.away;
      a.pointsAgainst += s.home;
    });
  });
  rows.forEach((r) => {
    r.setDiff = r.setsFor - r.setsAgainst;
    r.pointDiff = r.pointsFor - r.pointsAgainst;
  });
  const compare = (a, b) =>
    b.wins - a.wins || b.setDiff - a.setDiff || b.pointDiff - a.pointDiff;
  rows.sort(compare);
  const ties = [];
  for (let i = 0; i < rows.length;) {
    let j = i + 1;
    while (j < rows.length && compare(rows[i], rows[j]) === 0) j++;
    if (j - i > 1) {
      const tied = rows.slice(i, j);
      const ids = tied.map((r) => r.team.id);
      const headWins = Object.fromEntries(ids.map((id) => [id, 0]));
      valid
        .filter((m) => ids.includes(m.homeTeamId) && ids.includes(m.awayTeamId))
        .forEach((m) => headWins[m.winnerTeamId]++);
      tied.sort((a, b) => headWins[b.team.id] - headWins[a.team.id]);
      for (let k = 0; k < tied.length;) {
        let l = k + 1;
        while (
          l < tied.length &&
          headWins[tied[k].team.id] === headWins[tied[l].team.id]
        )
          l++;
        if (l - k > 1) {
          const cluster = tied.slice(k, l);
          const resolved =
            cluster.every((r) => manualOrder.includes(r.team.id)) &&
            new Set(manualOrder).size === manualOrder.length;
          if (resolved)
            cluster.sort(
              (a, b) =>
                manualOrder.indexOf(a.team.id) - manualOrder.indexOf(b.team.id),
            );
          else {
            ties.push(cluster.map((r) => r.team.id));
            cluster.forEach((r) => {
              r.tied = true;
            });
          }
          tied.splice(k, l - k, ...cluster);
        }
        k = l;
      }
      rows.splice(i, j - i, ...tied);
    }
    i = j;
  }
  const groupMatches = matches.filter(
    (m) => m.stage === "group" && m.group === group,
  );
  const pairs = new Set(
    groupMatches.map((m) => [m.homeTeamId, m.awayTeamId].sort().join(":")),
  );
  const finished =
    rows.length === 3 &&
    groupMatches.length === 3 &&
    pairs.size === 3 &&
    valid.length === 3;
  let rank = 0;
  rows.forEach((r, i) => {
    if (
      !r.tied ||
      !i ||
      !rows[i - 1].tied ||
      !ties.some(
        (t) => t.includes(r.team.id) && t.includes(rows[i - 1].team.id),
      )
    )
      rank = i + 1;
    r.rank = rank;
    r.qualified = finished && !ties.length && i < 2;
  });
  return { rows, ties, finished, resolved: finished && !ties.length };
}
