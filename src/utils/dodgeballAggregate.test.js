import { it, expect } from "vitest";
import {
  analyzeRounds,
  changeRound,
  emptyRound,
  canEditRound,
} from "./dodgeballRules";
import { createInitialData } from "../data/initialTournament";
import {
  createDemoData,
  planMatchUpdate,
  validateData,
} from "../services/tournamentStorage";
import { calculateStandings } from "./standings";
const r = (h, a, w = null) => ({
  homeRemaining: h,
  awayRemaining: a,
  winner: h === a ? w : h > a ? "home" : "away",
  manualWinner: h === a && w !== null,
});
const rs = (a, b, c = emptyRound()) => [a, b, c];
it.each([
  [rs(r(7, 3), r(2, 5)), "home", 3, 0, 1, 1],
  [rs(r(3, 7), r(5, 2)), "away", 0, 3, 1, 1],
  [rs(r(7, 3), r(3, 7), r(4, 1)), "home", 2, 1, 2, 1],
  [rs(r(7, 3), r(3, 7), r(1, 4)), "away", 1, 2, 1, 2],
  [rs(r(5, 5), r(7, 3)), "home", 3, 0, 1, 0],
  [rs(r(5, 5), r(5, 5), r(3, 3, "home")), "home", 2, 1, 0, 0],
  [rs(r(5, 5), r(5, 5), r(3, 3, "away")), "away", 1, 2, 0, 0],
])(
  "합산 판정·승점·무승부 세트 제외 %j",
  (rounds, winnerSide, hp, ap, hw, aw) => {
    expect(analyzeRounds(rounds)).toMatchObject({
      complete: true,
      winnerSide,
      homeMatchPoints: hp,
      awayMatchPoints: ap,
      homeWins: hw,
      awayWins: aw,
    });
  },
);
it.each([
  rs(r(7, 3), r(3, 7)),
  rs(r(5, 5), r(5, 5), r(3, 3)),
  rs(r(7, 3), emptyRound()),
])("미완료는 확정 불가·임시 저장 가능 %j", (...rounds) => {
  expect(analyzeRounds(rounds)).toMatchObject({
    complete: false,
    draftErrors: [],
  });
  expect(() =>
    planMatchUpdate(createInitialData("dodgeball"), "g-A-1", rounds, "confirm"),
  ).toThrow();
  expect(() =>
    planMatchUpdate(createInitialData("dodgeball"), "g-A-1", rounds, "draft"),
  ).not.toThrow();
});
it.each([-1, 1.2, "5", NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])(
  "잘못된 잔여 인원 %s",
  (value) => {
    expect(
      analyzeRounds(rs({ ...r(7, 3), homeRemaining: value }, emptyRound()))
        .draftErrors.length,
    ).toBeGreaterThan(0);
  },
);
it("별도 인원 상한 없음·정확한 큰 정수 합계", () => {
  expect(analyzeRounds(rs(r(15, 11), r(20, 21)))).toMatchObject({
    complete: true,
    winnerSide: "home",
    baseHomeTotal: "35",
    baseAwayTotal: "32",
  });
  const max = Number.MAX_SAFE_INTEGER;
  expect(analyzeRounds(rs(r(max, 0), r(max, 0))).homeTotal).toBe(
    "18014398509481982",
  );
});
it("합계가 다르면 3세트 거부·동률일 때만 활성화", () => {
  const rounds = rs(r(7, 3), r(3, 7));
  expect(canEditRound(rounds, 2)).toBe(true);
  const next = changeRound(rounds, 1, { homeRemaining: 8 });
  expect(canEditRound(next, 2)).toBe(false);
  expect(
    analyzeRounds(rs(r(7, 3), r(8, 7), r(2, 1))).draftErrors.length,
  ).toBeGreaterThan(0);
  expect(() => changeRound(next, 2, { homeRemaining: 1 })).toThrow();
});
it("개별 세트 동률은 임의 승자 금지·3세트 수동 지정 기록 유지", () => {
  expect(
    analyzeRounds(rs(r(5, 5, "home"), r(7, 3))).draftErrors.length,
  ).toBeGreaterThan(0);
  const rounds = changeRound(rs(r(5, 5), r(5, 5), r(2, 2)), 2, {
    winner: "away",
  });
  expect(rounds[2].manualWinner).toBe(true);
  expect(analyzeRounds(rounds)).toMatchObject({
    complete: true,
    winnerSide: "away",
    homeWins: 0,
    awayWins: 0,
  });
});
it("승점은 세트 스코어와 독립·합산 차이·임시/결선 제외·확정 취소", () => {
  let d = createInitialData("dodgeball");
  const rounds = rs(r(7, 3), r(2, 5));
  d = planMatchUpdate(d, "g-A-1", rounds, "confirm").data;
  expect(
    calculateStandings(d.teams, d.matches, "A", null).rows.find(
      (x) => x.team.id === "team-1",
    ),
  ).toMatchObject({
    matchPoints: 3,
    setsFor: 1,
    setsAgainst: 1,
    remainingDiff: 1,
  });
  expect(validateData(d)).toBe(d);
  d = planMatchUpdate(d, "g-A-1", rounds, "draft").data;
  expect(
    calculateStandings(d.teams, d.matches, "A", null).rows.every(
      (x) => x.matchPoints === 0,
    ),
  ).toBe(true);
  const final = createDemoData("dodgeball");
  const before = calculateStandings(final.teams, final.matches, "A", null).rows;
  final.matches.find((x) => x.id === "final").rounds = rs(r(20, 10), r(20, 10));
  expect(
    calculateStandings(final.teams, final.matches, "A", null).rows,
  ).toEqual(before);
});
it("두 종목 독립·9경기 완주·수정 시 결선 보호", () => {
  const volleyball = createDemoData(),
    snapshot = JSON.stringify(volleyball);
  const dodge = createDemoData("dodgeball");
  expect(dodge.matches.every((x) => x.status === "completed")).toBe(true);
  expect(dodge.matches.at(-1).winnerTeamId).toBe("team-1");
  expect(
    planMatchUpdate(dodge, "g-A-1", rs(r(0, 7), r(0, 7)), "confirm").affected,
  ).toEqual(expect.arrayContaining(["sf-1", "sf-2", "final"]));
  expect(JSON.stringify(volleyball)).toBe(snapshot);
});
