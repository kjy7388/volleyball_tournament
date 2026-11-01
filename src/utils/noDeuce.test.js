import { it, expect } from "vitest";
import { analyzeSets, emptySets } from "./matchRules";
import { createInitialData } from "../data/initialTournament";
import {
  planMatchUpdate,
  validateData,
  createDemoData,
} from "../services/tournamentStorage";
import {
  parseBackupFile,
  createSupabaseRepository,
} from "../services/supabaseTournament";

const prefix = [
  { home: 25, away: 20 },
  { home: 20, away: 25 },
  { home: 25, away: 20 },
  { home: 20, away: 25 },
];
for (const index of [0, 4]) {
  const target = index === 4 ? 15 : 25;
  it.each([
    [target, target - 1],
    [target - 1, target],
    [target, 0],
    [0, target],
  ])(`${index + 1}세트 %s:%s 최종 승리`, (home, away) => {
    const sets = index === 4 ? [...prefix, { home, away }] : [{ home, away }];
    const r = analyzeSets(sets);
    expect(r.errors).toEqual([]);
    expect(r.draftErrors).toEqual([]);
    expect(r.setStates[index]).toBe("completed");
    if (index === 4) expect(r.complete).toBe(true);
  });
  it(`${index + 1}세트 ${target - 1}:${target - 1} 임시 저장 허용·최종 확정 금지·백업 복원`, async () => {
    const sets = emptySets();
    if (index === 4) prefix.forEach((s, i) => (sets[i] = { ...s }));
    sets[index] = { home: target - 1, away: target - 1 };
    const initial = createInitialData();
    const draft = planMatchUpdate(initial, "g-A-1", sets, "draft").data;
    expect(draft.matches[0].status).toBe("live");
    expect(draft.matches[0].winnerTeamId).toBeNull();
    expect(analyzeSets(sets)).toMatchObject({
      complete: false,
      draftErrors: [],
    });
    expect(() => planMatchUpdate(initial, "g-A-1", sets, "confirm")).toThrow();
    expect(
      await parseBackupFile(new File([JSON.stringify(draft)], "draft.json")),
    ).toEqual(draft);
  });
  it.each([
    [target + 1, target - 1],
    [target + 1, target],
    [target, target],
  ])(
    `${index + 1}세트 %s:%s 초과 점수는 임시·최종 저장 모두 거부`,
    (home, away) => {
      const sets = emptySets();
      if (index === 4) prefix.forEach((s, i) => (sets[i] = { ...s }));
      sets[index] = { home, away };
      const d = createInitialData();
      expect(analyzeSets(sets).draftErrors.length).toBeGreaterThan(0);
      for (const mode of ["draft", "confirm"])
        expect(() => planMatchUpdate(d, "g-A-1", sets, mode)).toThrow();
    },
  );
}
it("완료되지 않은 앞 세트 뒤에 새 세트를 입력할 수 없음", () => {
  const sets = emptySets();
  sets[0] = { home: 24, away: 24 };
  sets[1] = { home: 25, away: 20 };
  expect(() =>
    planMatchUpdate(createInitialData(), "g-A-1", sets, "draft"),
  ).toThrow("순서");
});
it("25:24 세 세트로 승리 확정 후 추가 세트 거부", () => {
  const sets = emptySets();
  for (let i = 0; i < 3; i++) sets[i] = { home: 25, away: 24 };
  expect(analyzeSets(sets)).toMatchObject({
    complete: true,
    homeWins: 3,
    awayWins: 0,
  });
  sets[3] = { home: 1, away: 0 };
  expect(() =>
    planMatchUpdate(createInitialData(), "g-A-1", sets, "draft"),
  ).toThrow("추가 세트");
});
it("과거 듀스 JSON은 원본 변환 없이 거부·유효한 운영 백업은 유지", async () => {
  const old = createDemoData();
  old.matches[0].sets[0] = { home: 26, away: 24 };
  const raw = JSON.stringify(old);
  await expect(
    parseBackupFile(new File([raw], "old-deuce.json")),
  ).rejects.toThrow("목표");
  expect(JSON.stringify(old)).toBe(raw);
  expect(validateData(createDemoData()).tournament.status).toBe("completed");
});
it("피구 저장은 배구 003 확인과 무관함", async () => {
  const d = createInitialData("dodgeball"),
    calls = [];
  const rpc = async (name) => {
    calls.push(name);
    return { data: { ...d, revision: 1 } };
  };
  await createSupabaseRepository({ rpc }, "dodgeball-cup").save(d, {
    initialize: true,
  });
  expect(calls).toEqual(["save_tournament"]);
});
it("003 미적용 또는 알 수 없는 버전은 배구 쓰기 전에 차단", async () => {
  for (const response of [{ error: { code: "PGRST202" } }, { data: 2 }]) {
    const calls = [];
    const rpc = async (name) => {
      calls.push(name);
      return response;
    };
    await expect(
      createSupabaseRepository({ rpc }).save(createInitialData(), {
        initialize: true,
      }),
    ).rejects.toThrow("003_volleyball_no_deuce");
    expect(calls).toEqual(["get_volleyball_scoring_version"]);
  }
});
