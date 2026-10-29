import { describe, it, expect, vi } from "vitest";
import { checkSupabaseConfig } from "../lib/supabaseClient";
import {
  createSupabaseRepository,
  parseBackupFile,
} from "./supabaseTournament";
import { createInitialData } from "../data/initialTournament";
const valid = {
  VITE_SUPABASE_URL: "https://bkfluqugazkimgipbrle.supabase.co",
  VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_local_test_only",
};
describe("Supabase 구성·저장 어댑터", () => {
  it("환경변수 누락과 예시 키에 안내 제공", () => {
    expect(checkSupabaseConfig({})).toContain(".env.local");
    expect(
      checkSupabaseConfig({
        ...valid,
        VITE_SUPABASE_PUBLISHABLE_KEY:
          "sb_publishable_REPLACE_WITH_YOUR_PROJECT_KEY",
      }),
    ).toContain(".env.local");
  });
  it.each([
    "sb_secret_forbidden",
    "eyJ.mock_service_role.not_a_real_signature",
    "service_role",
  ])("서버 키 거부: %s", (key) =>
    expect(
      checkSupabaseConfig({ ...valid, VITE_SUPABASE_PUBLISHABLE_KEY: key }),
    ).toContain("공개 키"),
  );
  it("정상 공개 구성만 허용", () => {
    expect(checkSupabaseConfig(valid)).toBe("");
    expect(
      checkSupabaseConfig({
        ...valid,
        VITE_SUPABASE_URL: "https://user:password@example.com",
      }),
    ).not.toBe("");
  });
  it("빈 DB를 localStorage나 초기 데이터로 대체하지 않음", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    expect(await createSupabaseRepository({ rpc }).load()).toBeNull();
  });
  it("SQL 미적용 오류 안내", async () => {
    const rpc = vi.fn().mockResolvedValue({ error: { code: "PGRST202" } });
    await expect(createSupabaseRepository({ rpc }).load()).rejects.toThrow(
      "마이그레이션",
    );
  });
  it("저장은 서버 응답을 기다리고 서버 revision 반환", async () => {
    const initial = createInitialData();
    const response = { ...initial, revision: 7 };
    const rpc = vi.fn().mockResolvedValue({ data: response, error: null });
    const saved = await createSupabaseRepository({ rpc }).save(initial, {
      acknowledgedMatchIds: ["final"],
    });
    expect(saved.revision).toBe(7);
    expect(rpc).toHaveBeenCalledWith(
      "save_tournament",
      expect.objectContaining({
        p_expected_revision: 0,
        p_acknowledged_ids: ["final"],
        p_initialize: false,
      }),
    );
  });
  it("최초 등록은 expected revision이 null", async () => {
    const d = createInitialData();
    const rpc = vi.fn().mockResolvedValue({ data: { ...d, revision: 1 } });
    await createSupabaseRepository({ rpc }).save(d, { initialize: true });
    expect(rpc).toHaveBeenCalledWith(
      "save_tournament",
      expect.objectContaining({
        p_expected_revision: null,
        p_initialize: true,
      }),
    );
  });
  it.each([
    "REVISION_CONFLICT",
    "ACK_REQUIRED",
    "ALREADY_EXISTS",
    "ADMIN_REQUIRED",
  ])("서버 실패는 성공으로 처리하지 않음: %s", async (message) => {
    const rpc = vi.fn().mockResolvedValue({ error: { message } });
    await expect(
      createSupabaseRepository({ rpc }).save(createInitialData()),
    ).rejects.toThrow();
  });
  it("Realtime은 대회 revision만 구독하고 정리", () => {
    const channel = {
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    };
    const client = { channel: vi.fn(() => channel), removeChannel: vi.fn() };
    const onChange = vi.fn();
    const cleanup = createSupabaseRepository(client).subscribe(onChange);
    expect(channel.on).toHaveBeenCalledWith(
      "postgres_changes",
      expect.objectContaining({
        table: "tournaments",
        filter: "id=eq.volleyball-cup",
      }),
      onChange,
    );
    cleanup();
    expect(client.removeChannel).toHaveBeenCalledWith(channel);
  });
  it("기존 JSON 백업 검증과 파일 크기 제한", async () => {
    const d = createInitialData();
    expect(
      await parseBackupFile(new File([JSON.stringify(d)], "backup.json")),
    ).toEqual(d);
    await expect(
      parseBackupFile(new File(["bad"], "bad.json")),
    ).rejects.toThrow("JSON");
    await expect(parseBackupFile({ size: 2000001 })).rejects.toThrow("2MB");
  });
});
