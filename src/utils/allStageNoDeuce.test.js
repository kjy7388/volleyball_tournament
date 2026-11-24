import { it, expect } from "vitest";
import { analyzeSets, emptySets } from "./volleyballRules";
import { usesDeuce } from "./competitionRules";
import {
  createDemoData,
  planMatchUpdate,
  validateData,
} from "../services/tournamentStorage";
import { calculateStandings } from "./standings";
const result = (h, a) => [
  { home: h, away: a },
  { home: h, away: a },
  { home: "", away: "" },
];
for (const stage of ["group", "semifinal", "final"]) {
  it.each([
    [15, 14, true],
    [14, 15, true],
    [14, 14, false],
    [16, 14, false],
    [16, 15, false],
    [15, 0, true],
  ])("%s:%s " + stage + " complete=%s", (h, a, complete) => {
    expect(usesDeuce(stage)).toBe(false);
    expect(analyzeSets(result(h, a), [15, 15, 15], stage).complete).toBe(
      complete,
    );
  });
  it("2:1·미완료 임시 저장·추가 세트 방지 " + stage, () => {
    const sets = [
      { home: 15, away: 14 },
      { home: 14, away: 15 },
      { home: 15, away: 14 },
    ];
    expect(analyzeSets(sets, [15, 15, 15], stage)).toMatchObject({
      complete: true,
      homeWins: 2,
      awayWins: 1,
    });
    expect(
      analyzeSets([{ home: 14, away: 14 }], [15, 15, 15], stage),
    ).toMatchObject({ complete: false, draftErrors: [] });
    const extra = result(15, 14);
    extra[2] = { home: 1, away: 0 };
    expect(
      analyzeSets(extra, [15, 15, 15], stage).draftErrors.length,
    ).toBeGreaterThan(0);
  });
}
it("기존 데이터 조회·검증은 결과·순위·대진·선수·Revision을 수정하지 않음", () => {
  const d = createDemoData(),
    before = JSON.stringify(d);
  const rank = calculateStandings(
    d.teams,
    d.matches,
    "A",
    d.tournament.setRules,
  );
  expect(validateData(d)).toBe(d);
  expect(JSON.stringify(d)).toBe(before);
  expect(
    calculateStandings(d.teams, d.matches, "A", d.tournament.setRules),
  ).toEqual(rank);
  for (const id of ["sf-1", "final"]) {
    const plan = planMatchUpdate(d, id, result(15, 14), "confirm");
    expect(plan.affected).toEqual([]);
    expect(plan.data.matches.filter((m) => m.stage === "group")).toEqual(
      d.matches.filter((m) => m.stage === "group"),
    );
    expect(plan.data.teams).toEqual(d.teams);
    expect(plan.data.revision).toBe(d.revision);
  }
});
it("기존 결선 듀스 백업은 원본을 보존하고 거부", () => {
  const d = createDemoData();
  d.matches.find((m) => m.id === "sf-1").sets[0] = { home: 16, away: 14 };
  const before = JSON.stringify(d);
  expect(() => validateData(d)).toThrow();
  expect(JSON.stringify(d)).toBe(before);
});
it("피구 경기·순위·기록은 그대로 유지", () => {
  const d = createDemoData("dodgeball"),
    before = JSON.stringify(d);
  expect(validateData(d)).toBe(d);
  expect(JSON.stringify(d)).toBe(before);
  expect(d.matches.at(-1).winnerTeamId).toBe("team-1");
});
