import { describe, it, expect, beforeEach, vi } from "vitest";
import { analyzeSets, emptySets } from "./matchRules";
import { calculateStandings } from "./standings";
import { syncBracket } from "./bracketLogic";
import { createInitialData } from "../data/initialTournament";
import {
  planMatchUpdate,
  planTeamsUpdate,
  createDemoData,
  validateData,
  tournamentStorage,
  STORAGE_KEY,
} from "../services/tournamentStorage";
const score = (homeWin = true) =>
  emptySets().map((s, i) =>
    i < 3 ? (homeWin ? { home: 25, away: 20 } : { home: 20, away: 25 }) : s,
  );
const rank = (d, g = "A") =>
  calculateStandings(
    d.teams,
    d.matches,
    g,
    d.tournament.setRules,
    d.manualRankings[g],
  );
describe("세트 규칙", () => {
  it.each([
    [25, 23, true],
    [25, 24, false],
    [26, 24, true],
    [27, 25, true],
    [26, 23, false],
    [24, 22, false],
    [25, 0, true],
    [25, 25, false],
    [-1, 25, false],
    [1.5, 25, false],
    ["25", 23, false],
    [Infinity, 25, false],
  ])("%s:%s 점수 검증", (home, away, valid) =>
    expect(analyzeSets([{ home, away }]).errors.length === 0).toBe(valid),
  );
  it("5세트 목표 15점과 듀스 판정", () => {
    const sets = [
      { home: 25, away: 20 },
      { home: 20, away: 25 },
      { home: 25, away: 20 },
      { home: 20, away: 25 },
      { home: 17, away: 15 },
    ];
    expect(analyzeSets(sets)).toMatchObject({
      complete: true,
      homeWins: 3,
      awayWins: 2,
    });
  });
  it("3세트 선승", () =>
    expect(analyzeSets(score())).toMatchObject({
      complete: true,
      homeWins: 3,
      awayWins: 0,
    }));
  it("3세트 이후 추가 점수 거부", () => {
    const s = score();
    s[3] = { home: 25, away: 20 };
    expect(analyzeSets(s).complete).toBe(false);
  });
  it("건너뛴 세트 거부", () =>
    expect(
      analyzeSets([emptySets()[0], { home: 25, away: 20 }]).errors.join(),
    ).toContain("순서"));
  it("미완료 경기 확정 불가", () =>
    expect(() =>
      planMatchUpdate(createInitialData(), "g-A-1", emptySets(), "confirm"),
    ).toThrow());
  it("양쪽 점수 필요", () =>
    expect(analyzeSets([{ home: 25, away: "" }]).errors.length).toBe(1));
  it("변경된 목표 점수 사용", () =>
    expect(
      analyzeSets([{ home: 21, away: 19 }], [21, 21, 21, 21, 11]).errors,
    ).toEqual([]));
});
describe("대진과 순위", () => {
  it("초기 9경기와 중복 없는 6개 예선", () => {
    const d = createInitialData();
    expect(d.matches).toHaveLength(9);
    expect(
      new Set(
        d.matches
          .filter((m) => m.stage === "group")
          .map((m) => [m.homeTeamId, m.awayTeamId].sort().join()),
      ).size,
    ).toBe(6);
    expect(d.matches.every((m) => m.status === "scheduled")).toBe(true);
    expect(validateData(d)).toBe(d);
  });
  it("임시 점수는 순위에서 제외", () => {
    const d = planMatchUpdate(
      createInitialData(),
      "g-A-1",
      score(),
      "draft",
    ).data;
    expect(rank(d).rows.every((r) => r.played === 0)).toBe(true);
  });
  it("확정 경기에서 승리, 득실 세트, 득실점 계산", () => {
    const d = planMatchUpdate(
      createInitialData(),
      "g-A-1",
      score(),
      "confirm",
    ).data;
    expect(rank(d).rows[0]).toMatchObject({
      played: 1,
      wins: 1,
      setDiff: 3,
      pointDiff: 15,
    });
  });
  it("한 조만 끝나면 결선 배정하지 않음", () => {
    let d = createInitialData();
    ["g-A-1", "g-A-2", "g-A-3"].forEach(
      (id) => (d = planMatchUpdate(d, id, score(), "confirm").data),
    );
    expect(rank(d).resolved).toBe(true);
    expect(d.matches.find((m) => m.id === "sf-1").homeTeamId).toBe(null);
  });
  it("양 조 순위로 교차 준결승 생성", () => {
    const d = createDemoData();
    expect(d.matches.find((m) => m.id === "sf-1")).toMatchObject({
      homeTeamId: "team-1",
      awayTeamId: "team-5",
    });
    expect(d.matches.find((m) => m.id === "sf-2")).toMatchObject({
      homeTeamId: "team-4",
      awayTeamId: "team-2",
    });
  });
  it("준결승 승자로 결승 생성과 우승 확정", () => {
    const d = createDemoData();
    expect(d.matches.find((m) => m.id === "final")).toMatchObject({
      homeTeamId: "team-1",
      awayTeamId: "team-4",
      winnerTeamId: "team-1",
    });
    expect(d.tournament.status).toBe("completed");
    expect(validateData(d)).toBe(d);
  });
  it("3자 순환 동률을 임의 확정하지 않음", () => {
    let d = createInitialData();
    [
      ["g-A-1", true],
      ["g-A-2", false],
      ["g-A-3", true],
    ].forEach(
      ([id, win]) => (d = planMatchUpdate(d, id, score(win), "confirm").data),
    );
    expect(rank(d).finished).toBe(true);
    expect(rank(d).resolved).toBe(false);
    expect(rank(d).ties[0]).toHaveLength(3);
    expect(rank(d).rows.every((r) => !r.qualified)).toBe(true);
  });
  it("동률 관리자 순위 적용", () => {
    let d = createInitialData();
    [
      ["g-A-1", true],
      ["g-A-2", false],
      ["g-A-3", true],
    ].forEach(
      ([id, win]) => (d = planMatchUpdate(d, id, score(win), "confirm").data),
    );
    d.manualRankings.A = ["team-3", "team-1", "team-2"];
    expect(rank(d).resolved).toBe(true);
    expect(rank(d).rows[0].team.id).toBe("team-3");
  });
  it("승수/득실 동률일 때 상대 전적 적용", () => {
    let d = createInitialData();
    d = planMatchUpdate(
      d,
      "g-A-1",
      [
        { home: 25, away: 20 },
        { home: 20, away: 25 },
        { home: 25, away: 20 },
        { home: 20, away: 25 },
        { home: 15, away: 10 },
      ],
      "confirm",
    ).data;
    d = planMatchUpdate(d, "g-A-2", score(false), "confirm").data;
    d = planMatchUpdate(
      d,
      "g-A-3",
      [
        { home: 25, away: 20 },
        { home: 20, away: 25 },
        { home: 25, away: 20 },
        { home: 25, away: 20 },
        { home: "", away: "" },
      ],
      "confirm",
    ).data;
    const result = rank(d);
    expect(
      result.rows.slice(0, 2).map((r) => [r.wins, r.setDiff, r.pointDiff]),
    ).toEqual([
      [1, 1, 5],
      [1, 1, 5],
    ]);
    expect(result.rows.map((r) => r.team.id)).toEqual([
      "team-2",
      "team-3",
      "team-1",
    ]);
    expect(result.resolved).toBe(true);
  });
});
describe("기록 수정과 무결성", () => {
  it("예선 수정으로 진출팀 변경 시 결선 기록 초기화", () => {
    const before = createDemoData();
    const p = planMatchUpdate(before, "g-A-1", score(false), "confirm");
    expect(p.affected).toContain("sf-1");
    expect(p.affected).toContain("sf-2");
    expect(p.affected).toContain("final");
    expect(p.data.matches.find((m) => m.id === "final").status).toBe(
      "scheduled",
    );
    expect(before.matches.find((m) => m.id === "final").status).toBe(
      "completed",
    );
    expect(validateData(p.data)).toBe(p.data);
  });
  it("준결승 승자 수정 시 결승 기록 초기화", () => {
    const p = planMatchUpdate(
      createDemoData(),
      "sf-1",
      score(false),
      "confirm",
    );
    expect(p.affected).toEqual(["final"]);
    expect(p.data.matches.find((m) => m.id === "final").homeTeamId).toBe(
      "team-5",
    );
    expect(p.data.matches.find((m) => m.id === "final").winnerTeamId).toBe(
      null,
    );
  });
  it("진출팀 변화 없는 점수 수정은 결선 보존", () => {
    const d = createDemoData();
    const s = score();
    s[0].away = 21;
    const p = planMatchUpdate(d, "g-A-1", s, "confirm");
    expect(p.affected).toEqual([]);
    expect(p.data.matches.find((m) => m.id === "final").status).toBe(
      "completed",
    );
  });
  it("확정 예선을 임시 저장하면 결선 진출 해제", () => {
    const p = planMatchUpdate(createDemoData(), "g-A-1", score(), "draft");
    expect(p.affected).toContain("final");
    expect(p.data.matches.find((m) => m.id === "sf-1").homeTeamId).toBe(null);
  });
  it("반 이름 변경은 ID와 경기 결과 보존", () => {
    const d = createDemoData();
    const teams = structuredClone(d.teams);
    teams[0].name = "새 이름";
    const p = planTeamsUpdate(d, teams);
    expect(p.affected).toEqual([]);
    expect(p.data.matches.find((m) => m.id === "final").winnerTeamId).toBe(
      "team-1",
    );
  });
  it("조 변경은 예선과 결선 기록 재생성", () => {
    const d = createDemoData();
    const teams = structuredClone(d.teams);
    teams[0].group = "B";
    teams[3].group = "A";
    const p = planTeamsUpdate(d, teams);
    expect(p.affected).toHaveLength(9);
    expect(p.data.matches.every((m) => m.status === "scheduled")).toBe(true);
    expect(validateData(p.data)).toBe(p.data);
  });
  it("조별 3팀 미준수 거부", () => {
    const d = createInitialData();
    d.teams[0].group = "B";
    expect(() => planTeamsUpdate(createInitialData(), d.teams)).toThrow(
      "3개 반",
    );
  });
  it("미배정 결선 점수 입력 거부", () =>
    expect(() =>
      planMatchUpdate(createInitialData(), "sf-1", score(), "confirm"),
    ).toThrow());
  it("규칙 변경 후에도 확정 경기 당시 규칙 유지", () => {
    const d = createDemoData();
    d.tournament.setRules = [21, 21, 21, 21, 11];
    expect(validateData(d)).toBe(d);
    expect(syncBracket(d).affected).toEqual([]);
  });
  it("중복 경기와 잘못된 확정 점수 거부", () => {
    const d = createDemoData();
    d.matches[0].sets[0] = { home: 25, away: 24 };
    expect(() => validateData(d)).toThrow();
    const b = createInitialData();
    b.matches[1].homeTeamId = b.matches[0].homeTeamId;
    b.matches[1].awayTeamId = b.matches[0].awayTeamId;
    expect(() => validateData(b)).toThrow("중복");
  });
  it("호환되지 않는 저장 버전 거부", () =>
    expect(() =>
      validateData({ ...createInitialData(), schemaVersion: 99 }),
    ).toThrow("버전"));
});
describe("저장 서비스", () => {
  let store;
  beforeEach(() => {
    store = new Map();
    vi.stubGlobal("localStorage", {
      getItem: (k) => store.get(k) || null,
      setItem: (k, v) => store.set(k, v),
    });
  });
  it("저장과 재로드", () => {
    const d = createDemoData();
    tournamentStorage.save(d, 0);
    expect(tournamentStorage.load()).toEqual(d);
  });
  it("다른 탭의 변경을 덮어쓰지 않음", () => {
    tournamentStorage.save({ ...createInitialData(), revision: 4 });
    expect(() => tournamentStorage.save(createInitialData(), 0)).toThrow(
      "다른 탭",
    );
  });
  it("손상된 원본을 유지하고 오류 표시", () => {
    store.set(STORAGE_KEY, "broken");
    expect(() => tournamentStorage.load()).toThrow();
    expect(store.get(STORAGE_KEY)).toBe("broken");
  });
});
