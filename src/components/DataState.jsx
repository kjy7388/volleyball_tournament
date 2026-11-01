import { useState } from "react";
import { Outlet } from "react-router-dom";
import { useTournament } from "../context/TournamentContext";
import { useAuth } from "../context/AuthContext";
import { createInitialData } from "../data/initialTournament";
import {
  parseBackupFile,
  createSupabaseRepository,
} from "../services/supabaseTournament";
import { supabase } from "../lib/supabaseClient";
import { createGroupMatches } from "../data/initialTournament";
import { ConfirmModal } from "./Modal";
export function ConfigurationState() {
  const { configurationError, backupLegacy } = useTournament();
  return (
    <section className="panel connection-state">
      <span className="eyebrow">SUPABASE SETUP</span>
      <h1>Supabase 연결 설정이 필요합니다</h1>
      <p>{configurationError}</p>
      <p>
        SQL 적용과 최초 관리자 등록 절차는 프로젝트의{" "}
        <code>docs/SUPABASE_SETUP.md</code>를 확인해주세요. 기존 브라우저
        데이터는 변경하지 않았습니다.
      </p>
      <button className="button secondary" onClick={backupLegacy}>
        기존 localStorage 백업
      </button>
    </section>
  );
}
export function TournamentGate({ children }) {
  const { data, error, loading, configurationError, refresh } = useTournament();
  if (configurationError) return <ConfigurationState />;
  if (!data && loading)
    return (
      <div className="loading" role="status">
        대회 정보를 불러오는 중…
      </div>
    );
  if (!data && error)
    return (
      <section className="panel connection-state" role="alert">
        <h1>대회 정보를 불러오지 못했습니다</h1>
        <p>{error}</p>
        <button className="button" onClick={refresh}>
          다시 시도
        </button>
      </section>
    );
  if (!data) return <InitializeTournament />;
  return children || <Outlet />;
}
function InitializeTournament() {
  const { isAdmin } = useAuth();
  const { commit, notify, backupLegacy, saving, sport } = useTournament();
  const [candidate, setCandidate] = useState(null);
  const [copying, setCopying] = useState(false);
  const copyVolleyball = async () => {
    setCopying(true);
    try {
      const source = await createSupabaseRepository(
        supabase,
        "volleyball-cup",
      ).load();
      if (!source) throw new Error("복사할 배구 참가 명단이 없습니다.");
      const next = createInitialData("dodgeball");
      next.teams = structuredClone(source.teams);
      const groups = createGroupMatches(next.teams);
      next.matches = next.matches.map((m) =>
        m.stage !== "group"
          ? m
          : {
              ...m,
              homeTeamId: groups.find((g) => g.id === m.id).homeTeamId,
              awayTeamId: groups.find((g) => g.id === m.id).awayTeamId,
            },
      );
      setCandidate(next);
    } catch (e) {
      notify(e.message, "error");
    } finally {
      setCopying(false);
    }
  };
  const importFile = async (e) => {
    try {
      setCandidate(await parseBackupFile(e.target.files[0]));
    } catch (e) {
      notify(e.message, "error");
    } finally {
      e.target.value = "";
    }
  };
  return (
    <section className="panel connection-state">
      <span className="eyebrow">READY FOR THE FIRST SERVE</span>
      <h1>등록된 대회가 없습니다</h1>
      <p>
        관리자가 최초 대회 데이터를 등록하면 일정과 결과가 표시됩니다. 기존
        데이터는 자동 생성하거나 덮어쓰지 않습니다.
      </p>
      <div className="button-row">
        <button className="button secondary" onClick={backupLegacy}>
          기존 localStorage 백업
        </button>
        {isAdmin && (
          <>
            <button
              className="button"
              disabled={saving || copying}
              onClick={() => setCandidate(createInitialData(sport.key))}
            >
              최초 샘플 데이터 등록
            </button>
            {sport.key === "dodgeball" && (
              <button
                className="button secondary"
                disabled={saving || copying}
                onClick={copyVolleyball}
              >
                {copying
                  ? "명단 조회 중…"
                  : "배구 참가 반·선수 명단으로 최초 생성"}
              </button>
            )}
            <label className="button secondary file-button">
              JSON 백업으로 최초 복원
              <input
                type="file"
                accept="application/json,.json"
                onChange={importFile}
              />
            </label>
          </>
        )}
      </div>
      <p className="muted">
        JSON 복원은 DB가 비어 있을 때만 가능합니다. 기존 DB가 있으면 서버가
        복원을 거부합니다.
      </p>
      {candidate && (
        <ConfirmModal
          title="최초 대회 데이터를 등록할까요?"
          description={`${candidate.isDemo ? "데모" : "운영"} 데이터 · ${candidate.teams.length}개 반 · ${candidate.matches.length}경기를 등록합니다. 이미 데이터가 생성되어 있다면 덮어쓰지 않습니다.`}
          onClose={() => setCandidate(null)}
          onConfirm={async () => {
            if (
              await commit(candidate, "대회 데이터를 등록했습니다.", {
                initialize: true,
              })
            )
              setCandidate(null);
          }}
        />
      )}
    </section>
  );
}
