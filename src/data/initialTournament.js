import { emptySets } from "../utils/matchRules";
export const SCHEMA_VERSION = 1;
export function createGroupMatches(teams) {
  let number = 0;
  return ["A", "B"].flatMap((group) => {
    const members = teams.filter((t) => t.group === group);
    return [
      [0, 1],
      [0, 2],
      [1, 2],
    ].map(([a, b], i) => ({
      ...base(`g-${group}-${i + 1}`, ++number, "group", "운동장"),
      group,
      homeTeamId: members[a]?.id || null,
      awayTeamId: members[b]?.id || null,
      exampleDate: [
        "11월 24일",
        "11월 30일",
        group === "A" ? "12월 1일" : "12월 3일",
      ][i],
    }));
  });
}
function base(id, number, stage, location) {
  return {
    id,
    number,
    stage,
    group: null,
    homeTeamId: null,
    awayTeamId: null,
    scheduledAt: "",
    exampleDate: "",
    location,
    status: "scheduled",
    sets: emptySets(),
    winnerTeamId: null,
    confirmedAt: null,
  };
}
export function createInitialData() {
  const teams = Array.from({ length: 6 }, (_, i) => ({
    id: `team-${i + 1}`,
    name: `${i + 1}반`,
    group: i < 3 ? "A" : "B",
    players: Array.from({ length: 8 }, (_, j) => ({
      id: `player-${i + 1}-${j + 1}`,
      teamId: `team-${i + 1}`,
      name: `예시선수 ${i + 1}-${j + 1}`,
    })),
  }));
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    isDemo: false,
    manualRankings: { A: [], B: [] },
    tournament: {
      id: "volleyball-cup",
      name: "VOLLEYBALL CUP",
      startDate: "",
      endDate: "",
      locations: {
        default: "운동장",
        group: "운동장",
        semifinal: "홍신관",
        final: "홍신관",
      },
      setRules: [25, 25, 25, 25, 15],
      status: "upcoming",
    },
    teams,
    matches: [
      ...createGroupMatches(teams),
      { ...base("sf-1", 7, "semifinal", "홍신관"), exampleDate: "12월 11일" },
      { ...base("sf-2", 8, "semifinal", "홍신관"), exampleDate: "12월 11일" },
      { ...base("final", 9, "final", "홍신관"), exampleDate: "12월 14일" },
    ],
  };
}
