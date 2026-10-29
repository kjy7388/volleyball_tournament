import {
  createInitialData,
  createGroupMatches,
  SCHEMA_VERSION,
} from "../data/initialTournament";
import { analyzeSets, emptySets } from "../utils/matchRules";
import { syncBracket, clearResult } from "../utils/bracketLogic";
export const STORAGE_KEY = "volleyball-cup:data:v1";
export function validateData(d) {
  if (!d || d.schemaVersion !== SCHEMA_VERSION)
    throw new Error(
      "저장 데이터 버전을 지원하지 않습니다. 원본을 백업한 뒤 초기화해주세요.",
    );
  if (
    !Number.isSafeInteger(d.revision) ||
    d.revision < 0 ||
    !d.tournament ||
    !Array.isArray(d.tournament.setRules) ||
    d.tournament.setRules.length !== 5 ||
    d.tournament.setRules.some(
      (n) => !Number.isInteger(n) || n < 2 || n > 999,
    ) ||
    !d.tournament.locations ||
    !d.manualRankings ||
    !Array.isArray(d.manualRankings.A) ||
    !Array.isArray(d.manualRankings.B) ||
    !Array.isArray(d.teams) ||
    d.teams.length !== 6 ||
    !Array.isArray(d.matches) ||
    d.matches.length !== 9
  )
    throw new Error("저장 데이터 구조가 올바르지 않습니다.");
  if (
    new Set(d.teams.map((t) => t.id)).size !== 6 ||
    d.teams.some(
      (t) =>
        !t.id ||
        !t.name?.trim() ||
        !["A", "B"].includes(t.group) ||
        !Array.isArray(t.players) ||
        t.players.some((p) => !p.id || !p.name?.trim() || p.teamId !== t.id),
    )
  )
    throw new Error("참가 반 또는 선수 데이터가 올바르지 않습니다.");
  const players = d.teams.flatMap((t) => t.players);
  if (new Set(players.map((p) => p.id)).size !== players.length)
    throw new Error("선수 ID가 중복되었습니다.");
  if (["A", "B"].some((g) => d.teams.filter((t) => t.group === g).length !== 3))
    throw new Error("각 조는 3개 반이어야 합니다.");
  const ids = d.teams.map((t) => t.id);
  if (new Set(d.teams.map((t) => t.name.trim())).size !== 6)
    throw new Error("반 이름이 중복되었습니다.");
  ["A", "B"].forEach((g) => {
    const order = d.manualRankings[g];
    if (
      order.length &&
      (order.length !== 3 ||
        new Set(order).size !== 3 ||
        order.some((id) => !d.teams.some((t) => t.id === id && t.group === g)))
    )
      throw new Error("관리자 지정 순위가 올바르지 않습니다.");
  });
  const expected = [
    "g-A-1",
    "g-A-2",
    "g-A-3",
    "g-B-1",
    "g-B-2",
    "g-B-3",
    "sf-1",
    "sf-2",
    "final",
  ];
  if (
    new Set(d.matches.map((m) => m.id)).size !== 9 ||
    expected.some((id) => !d.matches.some((m) => m.id === id))
  )
    throw new Error("경기 ID가 올바르지 않습니다.");
  d.matches.forEach((m) => {
    const stage = m.id.startsWith("g-")
      ? "group"
      : m.id === "final"
        ? "final"
        : "semifinal";
    if (
      m.stage !== stage ||
      !["scheduled", "live", "completed"].includes(m.status) ||
      !Array.isArray(m.sets) ||
      m.sets.length !== 5 ||
      m.sets.some(
        (s) =>
          !s ||
          ["home", "away"].some(
            (k) => s[k] !== "" && (!Number.isSafeInteger(s[k]) || s[k] < 0),
          ),
      ) ||
      [m.homeTeamId, m.awayTeamId].some(
        (id) => id !== null && !ids.includes(id),
      ) ||
      (m.homeTeamId && m.homeTeamId === m.awayTeamId)
    )
      throw new Error("경기 데이터가 올바르지 않습니다.");
    if (
      stage === "group" &&
      (!["A", "B"].includes(m.group) ||
        [m.homeTeamId, m.awayTeamId].some(
          (id) => !d.teams.some((t) => t.id === id && t.group === m.group),
        ))
    )
      throw new Error("조별 대진이 조 편성과 일치하지 않습니다.");
    if (m.status === "completed") {
      const r = analyzeSets(m.sets, m.rulesSnapshot || d.tournament.setRules);
      if (
        !r.complete ||
        !m.homeTeamId ||
        !m.awayTeamId ||
        m.winnerTeamId !== (r.homeWins === 3 ? m.homeTeamId : m.awayTeamId)
      )
        throw new Error("확정 경기 점수에 오류가 있습니다.");
    } else if (m.winnerTeamId)
      throw new Error("미확정 경기에 승자가 지정되어 있습니다.");
  });
  ["A", "B"].forEach((g) => {
    if (
      new Set(
        d.matches
          .filter((m) => m.group === g)
          .map((m) => [m.homeTeamId, m.awayTeamId].sort().join(":")),
      ).size !== 3
    )
      throw new Error("조별 경기가 중복되었습니다.");
  });
  const aligned = syncBracket(d).data;
  if (
    d.matches.some((m) => {
      const a = aligned.matches.find((n) => n.id === m.id);
      return a.homeTeamId !== m.homeTeamId || a.awayTeamId !== m.awayTeamId;
    })
  )
    throw new Error("결선 대진 데이터가 이전 라운드 결과와 일치하지 않습니다.");
  return d;
}
export const tournamentStorage = {
  load() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createInitialData();
    try {
      return validateData(JSON.parse(raw));
    } catch (e) {
      throw new Error(`데이터를 불러오지 못했습니다. ${e.message}`);
    }
  },
  save(data, expectedRevision) {
    validateData(data);
    const raw = localStorage.getItem(STORAGE_KEY);
    if (
      raw &&
      expectedRevision !== undefined &&
      JSON.parse(raw).revision !== expectedRevision
    )
      throw new Error(
        "다른 탭에서 데이터가 변경되었습니다. 새로고침 후 다시 저장해주세요.",
      );
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
  raw() {
    return localStorage.getItem(STORAGE_KEY) || "";
  },
  reset(data) {
    validateData(data);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  },
};
export function planMatchUpdate(data, id, sets, mode) {
  if (
    !["confirm", "draft"].includes(mode) ||
    !Array.isArray(sets) ||
    sets.length !== 5
  )
    throw new Error("경기 입력 형식이 올바르지 않습니다.");
  const next = structuredClone(data);
  const m = next.matches.find((m) => m.id === id);
  if (!m?.homeTeamId || !m?.awayTeamId)
    throw new Error("이전 라운드와 순위를 먼저 확정해주세요.");
  const normalized = emptySets().map((_, i) => ({
    home: sets[i]?.home ?? "",
    away: sets[i]?.away ?? "",
  }));
  if (
    normalized.some((s) =>
      ["home", "away"].some(
        (k) => s[k] !== "" && (!Number.isSafeInteger(s[k]) || s[k] < 0),
      ),
    )
  )
    throw new Error("점수는 0 이상의 정수로 입력해주세요.");
  const rules = m.rulesSnapshot || next.tournament.setRules;
  const result = analyzeSets(normalized, rules);
  if (mode === "confirm" && !result.complete)
    throw new Error(
      result.errors[0] || "먼저 3세트를 승리해야 결과를 확정할 수 있습니다.",
    );
  // Drafts may hold incomplete sets, but never scores after a completed match.
  if (mode !== "confirm" && result.errors.some((e) => e.includes("추가 세트")))
    throw new Error("승부가 결정된 뒤의 세트 점수를 지워주세요.");
  Object.assign(m, {
    sets: normalized,
    status: mode === "confirm" ? "completed" : "live",
    winnerTeamId:
      mode === "confirm"
        ? result.homeWins === 3
          ? m.homeTeamId
          : m.awayTeamId
        : null,
    confirmedAt: mode === "confirm" ? new Date().toISOString() : null,
    updatedAt: new Date().toISOString(),
    rulesSnapshot: [...rules],
  });
  if (m.stage === "group") next.manualRankings[m.group] = [];
  return syncBracket(next);
}
export function planTeamsUpdate(data, teams) {
  if (
    teams.length !== 6 ||
    teams.some((t) => !t.name.trim()) ||
    new Set(teams.map((t) => t.name.trim())).size !== 6
  )
    throw new Error("서로 다른 반 이름 6개를 입력해주세요.");
  if (["A", "B"].some((g) => teams.filter((t) => t.group === g).length !== 3))
    throw new Error("A·B조에 각각 3개 반을 배정해주세요.");
  if (teams.some((t) => t.players.some((p) => !p.name.trim())))
    throw new Error("빈 선수 이름을 입력하거나 저장할 수 없습니다.");
  const next = structuredClone(data);
  next.teams = teams.map((t) => ({
    ...t,
    name: t.name.trim(),
    players: t.players.map((p) => ({ ...p, name: p.name.trim() })),
  }));
  const regrouped = teams.some(
    (t) => data.teams.find((old) => old.id === t.id)?.group !== t.group,
  );
  let affected = [];
  if (regrouped) {
    affected = next.matches
      .filter(
        (m) =>
          m.status !== "scheduled" ||
          m.sets.some((s) => s.home !== "" || s.away !== ""),
      )
      .map((m) => m.id);
    next.manualRankings = { A: [], B: [] };
    const groups = createGroupMatches(teams).map((m) => {
      const old = data.matches.find((n) => n.id === m.id);
      return { ...m, scheduledAt: old.scheduledAt, location: old.location };
    });
    next.matches = [
      ...groups,
      ...next.matches
        .filter((m) => m.stage !== "group")
        .map((m) => ({
          ...clearResult(m),
          homeTeamId: null,
          awayTeamId: null,
        })),
    ];
  }
  const synced = syncBracket(next);
  return {
    ...synced,
    affected: [...new Set([...affected, ...synced.affected])],
    regrouped,
  };
}
export function createDemoData() {
  let d = createInitialData();
  d.isDemo = true;
  const winners = [true, true, true, true, true, true, true, true, true];
  d.matches
    .map((m) => m.id)
    .forEach((id, i) => {
      const sets = emptySets();
      for (let j = 0; j < 3; j++)
        sets[j] = winners[i]
          ? { home: 25, away: 18 + j }
          : { home: 18, away: 25 };
      d = planMatchUpdate(d, id, sets, "confirm").data;
    });
  return d;
}
