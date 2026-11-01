import { it, expect, vi } from "vitest";
import { createSupabaseRepository } from "./supabaseTournament";
import { createInitialData } from "../data/initialTournament";
it("스키마 지원 확인 네트워크 오류는 마이그레이션 누락으로 오인하지 않음", async () => {
  const rpc = vi.fn().mockResolvedValue({ error: { code: "TEST_NETWORK" } });
  await expect(
    createSupabaseRepository({ rpc }, "dodgeball-cup").load(),
  ).rejects.toThrow("네트워크");
});
it("지원 버전 확인은 성공한 경우에만 캐시하고 실패 후 재시도 가능", async () => {
  let failed = true;
  const rpc = vi.fn(async (name) =>
    failed
      ? { error: { code: "TEST_NETWORK" } }
      : {
          data:
            name === "get_sports_schema_version"
              ? 2
              : createInitialData("dodgeball"),
        },
  );
  const repo = createSupabaseRepository({ rpc }, "dodgeball-cup");
  await expect(repo.load()).rejects.toThrow();
  failed = false;
  await repo.load();
  await repo.load();
  expect(
    rpc.mock.calls.filter(([name]) => name === "get_sports_schema_version"),
  ).toHaveLength(2);
});
it("피구 연결은 002 지원 확인 후 정확한 종목 ID로 조회", async () => {
  const d = createInitialData("dodgeball");
  const rpc = vi.fn(async (name) => ({
    data: name === "get_sports_schema_version" ? 2 : d,
    error: null,
  }));
  expect(
    await createSupabaseRepository({ rpc }, "dodgeball-cup").load(),
  ).toEqual(d);
  expect(rpc).toHaveBeenCalledWith("get_public_tournament", {
    p_id: "dodgeball-cup",
  });
});
it("002 미적용은 초기화 화면 대신 검토·적용 필요 오류", async () => {
  const rpc = vi.fn().mockResolvedValue({ error: { code: "PGRST202" } });
  await expect(
    createSupabaseRepository({ rpc }, "dodgeball-cup").load(),
  ).rejects.toThrow("002_multi_sport");
  expect(rpc).toHaveBeenCalledTimes(1);
});
it("다른 종목의 조회 응답과 백업 저장은 거부", async () => {
  const rpc = vi.fn(async (name) => ({
    data: name === "get_sports_schema_version" ? 2 : createInitialData(),
  }));
  const repo = createSupabaseRepository({ rpc }, "dodgeball-cup");
  await expect(repo.load()).rejects.toThrow("선택한 종목");
  await expect(repo.save(createInitialData())).rejects.toThrow("대회 ID");
  expect(rpc).not.toHaveBeenCalledWith("save_tournament", expect.anything());
});
it("종목별 Realtime 필터와 채널을 분리하고 각 구독 해제", () => {
  const channels = [];
  const client = {
    channel: vi.fn(() => {
      const channel = {
        on: vi.fn().mockReturnThis(),
        subscribe: vi.fn().mockReturnThis(),
      };
      channels.push(channel);
      return channel;
    }),
    removeChannel: vi.fn(),
  };
  const cleanV = createSupabaseRepository(client).subscribe(vi.fn());
  const cleanD = createSupabaseRepository(client, "dodgeball-cup").subscribe(
    vi.fn(),
  );
  expect(channels[0].on).toHaveBeenCalledWith(
    "postgres_changes",
    expect.objectContaining({ filter: "id=eq.volleyball-cup" }),
    expect.any(Function),
  );
  expect(channels[1].on).toHaveBeenCalledWith(
    "postgres_changes",
    expect.objectContaining({ filter: "id=eq.dodgeball-cup" }),
    expect.any(Function),
  );
  cleanD();
  expect(client.removeChannel).toHaveBeenCalledWith(channels[1]);
  expect(client.removeChannel).not.toHaveBeenCalledWith(channels[0]);
  cleanV();
});
