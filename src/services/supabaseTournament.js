import { validateData, STORAGE_KEY } from "./tournamentStorage";
export const TOURNAMENT_ID = "volleyball-cup";
export function dataError(error) {
  if (error?.message?.includes("REVISION_CONFLICT"))
    return new Error(
      "다른 관리자가 먼저 변경했습니다. 최신 데이터를 다시 불러온 뒤 내용을 확인하고 재시도해주세요.",
    );
  if (error?.message?.includes("ACK_REQUIRED"))
    return new Error(
      "기존 경기 기록 변경의 영향 확인이 필요합니다. 확인창에서 다시 저장해주세요.",
    );
  if (error?.message?.includes("ALREADY_EXISTS"))
    return new Error(
      "이미 대회 데이터가 있습니다. 최초 생성·복원으로 덮어쓸 수 없습니다.",
    );
  if (
    ["42501", "PGRST301", "PGRST302"].includes(error?.code) ||
    /ADMIN_REQUIRED|JWT|session/i.test(error?.message || "")
  )
    return new Error(
      "관리자 권한 또는 로그인 세션을 확인해주세요. 다시 로그인한 뒤 재시도하세요.",
    );
  if (["42883", "42P01", "PGRST202", "PGRST205"].includes(error?.code))
    return new Error(
      "Supabase SQL 마이그레이션이 적용되지 않았거나 Data API 설정이 누락되었습니다. docs/SUPABASE_SETUP.md를 확인해주세요.",
    );
  return new Error(
    "Supabase 요청에 실패했습니다. 네트워크와 설정을 확인하고 다시 시도해주세요." +
      (error?.code ? ` (오류 ${error.code})` : ""),
  );
}
export function createSupabaseRepository(client) {
  return {
    async load() {
      const { data, error } = await client.rpc("get_public_tournament", {
        p_id: TOURNAMENT_ID,
      });
      if (error) throw dataError(error);
      return data ? validateData(data) : null;
    },
    async save(
      snapshot,
      { initialize = false, acknowledgedMatchIds = [] } = {},
    ) {
      validateData(snapshot);
      if (snapshot.tournament.id !== TOURNAMENT_ID)
        throw new Error("이 앱의 대회 ID와 백업 파일의 대회 ID가 다릅니다.");
      const { data, error } = await client.rpc("save_tournament", {
        p_snapshot: snapshot,
        p_expected_revision: initialize ? null : snapshot.revision,
        p_acknowledged_ids: acknowledgedMatchIds,
        p_initialize: initialize,
      });
      if (error) throw dataError(error);
      return validateData(data);
    },
    subscribe(onChange, onStatus = () => {}) {
      // Revision changes last in each transaction. One revision event covers all six tables.
      const channel = client
        .channel(`tournament-${TOURNAMENT_ID}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "tournaments",
            filter: `id=eq.${TOURNAMENT_ID}`,
          },
          onChange,
        )
        .subscribe(onStatus);
      return () => {
        void client.removeChannel(channel);
      };
    },
  };
}
export function downloadBackup(data, name = "volleyball-backup.json") {
  const raw = typeof data === "string" ? data : JSON.stringify(data, null, 2);
  if (!raw || raw === "null") throw new Error("백업할 데이터가 없습니다.");
  const url = URL.createObjectURL(
    new Blob([raw], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
export function backupLegacyData() {
  downloadBackup(
    localStorage.getItem(STORAGE_KEY),
    "volleyball-localStorage-original.json",
  );
}
export async function parseBackupFile(file) {
  if (!file || file.size > 2_000_000)
    throw new Error("2MB 이하의 JSON 백업 파일을 선택해주세요.");
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error("올바른 JSON 백업 파일이 아닙니다.");
  }
  validateData(data);
  return data;
}
