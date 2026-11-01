import { describe, it, expect } from "vitest";
import { createInitialData } from "../data/initialTournament";
import {
  createDemoData,
  planMatchUpdate,
  planTeamsUpdate,
  validateData,
} from "../services/tournamentStorage";
import { analyzeRounds, changeRound, emptyRounds } from "./dodgeballRules";
import { calculateStandings } from "./standings";
import { syncBracket } from "./bracketLogic";
const rounds = (sequence) =>
  [...sequence]
    .map((winner) => ({ winner }))
    .concat(emptyRounds())
    .slice(0, 5);
const standings = (d, g = "A", manual = []) =>
  calculateStandings(d.teams, d.matches, g, null, manual);
describe("피구 판 결과와 배구 분리", () => {
  it.each([
    [["home", "home", "home"], 3, 0],
    [["home", "away", "home", "home"], 3, 1],
    [["home", "away", "home", "away", "home"], 3, 2],
    [["away", "home", "away", "home", "away"], 2, 3],
  ])("정상 3승 종료 %j", (sequence, h, a) => {
    expect(analyzeRounds(rounds(sequence))).toMatchObject({
      complete: true,
      homeWins: h,
      awayWins: a,
      errors: [],
    });
  });
  it.each([["home", "home", "home", "away"], [null, "home"], ["draw"], [5]])(
    "잘못된 결과 거부 %j",
    (...args) => {
      // Vitest spreads nested array parameters; each case is a sequence.
      expect(analyzeRounds(rounds(args))).not.toMatchObject({ errors: [] });
    },
  );
  it("앞 판 변경은 이후 입력 제거, 3승 이후 직접 변경 거부", () => {
    const original = rounds(["home", "away", "home", "home"]);
    expect(changeRound(original, 1, "home")).toEqual(rounds(["home", "home"]));
    expect(() =>
      changeRound(rounds(["home", "home", "home"]), 3, "away"),
    ).toThrow();
    expect(changeRound(original, 0, null)).toEqual(emptyRounds());
  });
  it("임시 결과는 순위에 제외, 미완료 확정 거부", () => {
    const d = createInitialData("dodgeball");
    const draft = planMatchUpdate(
      d,
      "g-A-1",
      rounds(["home", "home"]),
      "draft",
    ).data;
    expect(standings(draft).rows.every((r) => r.played === 0)).toBe(true);
    expect(() =>
      planMatchUpdate(d, "g-A-1", rounds(["home", "home"]), "confirm"),
    ).toThrow();
    expect(() =>
      planMatchUpdate(
        d,
        "g-A-1",
        rounds(["home", "home", "home", "away"]),
        "draft",
      ),
    ).toThrow();
  });
  it("판 득실 계산, 6경기 완료 후 준결승과 결승 자동 배정", () => {
    const d = createDemoData("dodgeball");
    expect(validateData(d)).toBe(d);
    expect(standings(d).rows.map((r) => [r.wins, r.setDiff])).toEqual([
      [2, 6],
      [1, 0],
      [0, -6],
    ]);
    expect(d.matches.find((m) => m.id === "sf-1")).toMatchObject({
      homeTeamId: "team-1",
      awayTeamId: "team-5",
    });
    expect(d.matches.find((m) => m.id === "final")).toMatchObject({
      homeTeamId: "team-1",
      awayTeamId: "team-4",
      winnerTeamId: "team-1",
    });
    expect(
      d.matches.every((m) => m.sets === undefined && m.rounds.length === 5),
    ).toBe(true);
  });
  it("한 조만 완료되면 결선 배정하지 않음", () => {
    let d = createInitialData("dodgeball");
    for (const id of ["g-A-1", "g-A-2", "g-A-3"])
      d = planMatchUpdate(
        d,
        id,
        rounds(["home", "home", "home"]),
        "confirm",
      ).data;
    expect(d.matches.find((m) => m.id === "sf-1").homeTeamId).toBeNull();
  });
  it("2팀 승수·판득실 동률은 직접 맞대결로 해결", () => {
    let d = createInitialData("dodgeball");
    // 1 beats 2 3:2, 3 beats 1 3:0, 2 beats 3 3:0 => team 2 and 3 tie (+2).
    for (const [id, seq] of [
      ["g-A-1", ["home", "away", "home", "away", "home"]],
      ["g-A-2", ["away", "away", "away"]],
      ["g-A-3", ["home", "home", "home"]],
    ])
      d = planMatchUpdate(d, id, rounds(seq), "confirm").data;
    expect(standings(d).rows.map((r) => r.team.id)).toEqual([
      "team-2",
      "team-3",
      "team-1",
    ]);
    expect(standings(d).ties).toEqual([]);
  });
  it("순환 동률은 자동 진출 금지, 동률 집단 내 관리자 순위만 반영", () => {
    let d = createInitialData("dodgeball");
    for (const m of d.matches.filter((m) => m.stage === "group"))
      d = planMatchUpdate(
        d,
        m.id,
        rounds(Array(3).fill(m.id === "g-A-2" ? "away" : "home")),
        "confirm",
      ).data;
    expect(standings(d).ties).toHaveLength(1);
    expect(d.matches.find((m) => m.id === "sf-1").homeTeamId).toBeNull();
    d.manualRankings.A = ["team-3", "team-1", "team-2"];
    d = syncBracket(d).data;
    expect(
      standings(d, "A", d.manualRankings.A).rows.every(
        (r) => r.manuallyResolved,
      ),
    ).toBe(true);
    expect(d.matches.find((m) => m.id === "sf-1").homeTeamId).toBe("team-3");
    const noTies = createDemoData("dodgeball");
    expect(
      standings(noTies, "A", ["team-3", "team-2", "team-1"]).rows[0].team.id,
    ).toBe("team-1");
  });
  it("결과 수정 시 이미 진행된 결선 영향 목록, 참가 반 변경 및 종목별 초기화 독립", () => {
    const v = createDemoData(),
      d = createDemoData("dodgeball"),
      snapshot = JSON.stringify(v);
    const plan = planMatchUpdate(
      d,
      "g-A-1",
      rounds(["away", "away", "away"]),
      "confirm",
    );
    expect(plan.affected).toEqual(
      expect.arrayContaining(["sf-1", "sf-2", "final"]),
    );
    const teams = structuredClone(d.teams);
    teams[0].group = "B";
    teams[3].group = "A";
    const regrouped = planTeamsUpdate(d, teams).data;
    expect(
      regrouped.matches.every((m) => m.rounds.every((r) => r.winner === null)),
    ).toBe(true);
    expect(validateData(regrouped)).toBe(regrouped);
    createInitialData("dodgeball");
    expect(JSON.stringify(v)).toBe(snapshot);
  });
});
