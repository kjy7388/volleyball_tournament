import { it, expect } from "vitest";
import { analyzeSets, emptySets } from "./matchRules";
import { analyzeRounds, emptyRounds, changeRound } from "./dodgeballRules";
import { compareRatio, formatRatio, matchPoints } from "./competitionRules";
import { createInitialData } from "../data/initialTournament";
import {
  planMatchUpdate,
  planTeamsUpdate,
} from "../services/tournamentStorage";
import { calculateStandings } from "./standings";
const v = (h, a) => [
  { home: h, away: a },
  { home: h, away: a },
  { home: "", away: "" },
];
const round = (h, a, winner = null) => ({
  homeRemaining: h,
  awayRemaining: a,
  winner: h === a ? winner : h > a ? "home" : "away",
  manualWinner: h === a && winner !== null,
});
it.each([
  [15, 14, "group", true],
  [16, 14, "group", false],
  [15, 14, "semifinal", false],
  [16, 14, "semifinal", true],
  [17, 15, "final", true],
  [16, 15, "final", false],
  [10001, 9999, "final", true],
])("%s:%s %s completion=%s", (h, a, stage, complete) =>
  expect(analyzeSets(v(h, a), [15, 15, 15], stage).complete).toBe(complete),
);
it("2:1 completes, 2:0 rejects third set and unfinished scores can be drafted", () => {
  expect(
    analyzeSets([
      { home: 15, away: 14 },
      { home: 14, away: 15 },
      { home: 15, away: 13 },
    ]).complete,
  ).toBe(true);
  const extra = v(15, 14);
  extra[2] = { home: 1, away: 0 };
  expect(analyzeSets(extra).draftErrors.length).toBeGreaterThan(0);
  expect(analyzeSets([{ home: 14, away: 14 }])).toMatchObject({
    complete: false,
    draftErrors: [],
  });
});
it.each([
  [2, 0, 3],
  [2, 1, 2],
  [1, 2, 1],
  [0, 2, 0],
])("points %s:%s=%s", (w, l, p) => expect(matchPoints(w, l)).toBe(p));
it("ratio cross multiplication, undefeated and unrecorded are separate", () => {
  expect(compareRatio(2, 3, 3, 5)).toBe(1);
  expect(compareRatio(2, 0, 100, 1)).toBe(1);
  expect(compareRatio(0, 0, 0, 1)).toBe(-1);
  expect(compareRatio("9007199254740993", 3, "9007199254740992", 3)).toBe(1);
  expect(formatRatio(0, 0)).toBe("—");
  expect(formatRatio(2, 0)).toBe("무패");
  expect(formatRatio(2, 3)).toBe("0.667");
});
it("dodgeball survivor automatic winner, ties require explicit manual record", () => {
  let rounds = emptyRounds();
  rounds = changeRound(rounds, 0, { homeRemaining: 7 });
  rounds = changeRound(rounds, 0, { awayRemaining: 3 });
  expect(rounds[0].winner).toBe("home");
  rounds[1] = round(5, 5);
  expect(analyzeRounds(rounds)).toMatchObject({
    homeWins: 1,
    complete: false,
    draftErrors: [],
  });
  rounds = changeRound(rounds, 1, { winner: "home" });
  expect(analyzeRounds(rounds).complete).toBe(true);
  expect(rounds[1].manualWinner).toBe(true);
  rounds[2] = round(5, 1);
  expect(analyzeRounds(rounds).draftErrors.length).toBeGreaterThan(0);
});
it.each([-1, 11, 1.5, "7"])("survivor %s rejected", (n) =>
  expect(analyzeRounds([round(n, 3)]).draftErrors.length).toBeGreaterThan(0),
);
it("revised earlier round preserves later input and reports contradictions", () => {
  const r = [round(7, 3), round(3, 7), round(7, 3)];
  const next = changeRound(r, 1, { homeRemaining: 8 });
  expect(next[2]).toEqual(r[2]);
  expect(analyzeRounds(next).complete).toBe(false);
});
it("standings use only confirmed group results and accumulate survivors", () => {
  let d = createInitialData("dodgeball");
  d = planMatchUpdate(
    d,
    "g-A-1",
    [round(7, 3), round(2, 6), round(5, 1)],
    "confirm",
  ).data;
  const row = calculateStandings(d.teams, d.matches, "A", null).rows.find(
    (r) => r.team.id === "team-1",
  );
  expect(row).toMatchObject({
    matchPoints: 2,
    wins: 1,
    setsFor: 2,
    setsAgainst: 1,
    remainingDiff: 4,
  });
  d = planMatchUpdate(
    d,
    "g-A-1",
    [round(7, 3), round(2, 6), round(5, 1)],
    "draft",
  ).data;
  expect(
    calculateStandings(d.teams, d.matches, "A", null).rows.every(
      (r) => r.matchPoints === 0,
    ),
  ).toBe(true);
});
it("registration has no count cap, preserves original, and accepts short rosters", () => {
  const d = createInitialData();
  const teams = structuredClone(d.teams);
  teams[0].players.pop();
  expect(planTeamsUpdate(d, teams).data.teams[0].players.length).toBe(9);
  teams[0].players.push(
    ...[
      { id: "extra1", teamId: "team-1", name: "추가1" },
      { id: "extra2", teamId: "team-1", name: "추가2" },
    ],
  );
  expect(planTeamsUpdate(d, teams).data.teams[0].players.length).toBe(11);
  expect(d.teams[0].players.length).toBe(10);
});
