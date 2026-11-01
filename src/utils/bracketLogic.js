import { calculateStandings } from "./standings";
import { emptySets } from "./matchRules";
import { matchResult as confirmedResult, hasResultInput } from "./sportRules";
import { emptyRounds } from "./dodgeballRules";
export const clearResult = (m) => ({
  ...m,
  status: "scheduled",
  ...(m.rounds ? { rounds: emptyRounds() } : { sets: emptySets() }),
  winnerTeamId: null,
  confirmedAt: null,
  rulesSnapshot: null,
  updatedAt: null,
});
export function syncBracket(data) {
  const next = structuredClone(data);
  const affected = [];
  const ranks = Object.fromEntries(
    ["A", "B"].map((g) => [
      g,
      calculateStandings(
        next.teams,
        next.matches,
        g,
        next.tournament.setRules,
        next.manualRankings[g],
      ),
    ]),
  );
  // Both groups must finish and resolve ties before either semifinal receives teams.
  const ready = ranks.A.resolved && ranks.B.resolved;
  const pairings = ready
    ? [
        [ranks.A.rows[0].team.id, ranks.B.rows[1].team.id],
        [ranks.B.rows[0].team.id, ranks.A.rows[1].team.id],
      ]
    : [
        [null, null],
        [null, null],
      ];
  const assign = (id, home, away) => {
    const index = next.matches.findIndex((m) => m.id === id);
    const m = next.matches[index];
    if (m.homeTeamId !== home || m.awayTeamId !== away) {
      if (m.status !== "scheduled" || hasResultInput(m)) affected.push(m.id);
      next.matches[index] = {
        ...clearResult(m),
        homeTeamId: home,
        awayTeamId: away,
      };
    }
  };
  pairings.forEach((p, i) => assign(`sf-${i + 1}`, ...p));
  const semis = next.matches.filter((m) => m.stage === "semifinal");
  assign(
    "final",
    ...semis.map(
      (m) => confirmedResult(m, next.tournament.setRules)?.winnerTeamId || null,
    ),
  );
  const final = next.matches.find((m) => m.id === "final");
  next.tournament.status = confirmedResult(final, next.tournament.setRules)
    ? "completed"
    : next.matches.some((m) => m.status !== "scheduled")
      ? "ongoing"
      : "upcoming";
  return { data: next, affected };
}
