// Historical 001–003 migration fixtures only. Never imported by the application.
import { createInitialData as current } from "../data/initialTournament";
export const emptySets = () =>
  Array.from({ length: 5 }, () => ({ home: "", away: "" }));
export function createInitialData(sport = "volleyball") {
  const d = current(sport);
  d.schemaVersion = 1;
  d.tournament.setRules = sport === "volleyball" ? [25, 25, 25, 25, 15] : null;
  d.matches.forEach((m) => {
    if (sport === "volleyball") m.sets = emptySets();
    else m.rounds = Array.from({ length: 5 }, () => ({ winner: null }));
  });
  return d;
}
export function createDemoData(sport = "volleyball") {
  const d = createInitialData(sport);
  d.isDemo = true;
  d.tournament.status = "completed";
  const pairs = [
    ["team-1", "team-5"],
    ["team-4", "team-2"],
    ["team-1", "team-4"],
  ];
  d.matches.forEach((m, i) => {
    if (i >= 6) [m.homeTeamId, m.awayTeamId] = pairs[i - 6];
    if (sport === "volleyball") {
      m.sets = emptySets();
      for (let j = 0; j < 3; j++) m.sets[j] = { home: 25, away: 20 };
      m.rulesSnapshot = [25, 25, 25, 25, 15];
    } else
      m.rounds = Array.from({ length: 5 }, (_, j) => ({
        winner: j < 3 ? "home" : null,
      }));
    m.status = "completed";
    m.winnerTeamId = m.homeTeamId;
    m.confirmedAt = "2026-01-01T00:00:00.000Z";
  });
  return d;
}
