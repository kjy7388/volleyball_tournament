import { useState, useEffect } from "react";
import { Plus, Trash2, Save, CheckCircle2, AlertCircle } from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import { PageTitle } from "../components/Common";
import { TeamAvatar } from "../components/MatchCard";
import { ConfirmModal } from "../components/Modal";
import { planTeamsUpdate } from "../services/tournamentStorage";
import { stageLabel } from "../utils/display";
export default function TeamManager() {
  const { data, commit, notify } = useTournament();
  const [base, setBase] = useState(data);
  const [dirty, setDirty] = useState(false);
  const [teams, setTeams] = useState(() => structuredClone(data.teams));
  const [plan, setPlan] = useState(null);
  const [deletion, setDeletion] = useState(null);
  useEffect(() => {
    if (!dirty) {
      setTeams(structuredClone(data.teams));
      setBase(data);
    }
  }, [data, dirty]);
  const update = (id, fn) => {
    setDirty(true);
    setTeams((old) => old.map((t) => (t.id === id ? fn(t) : t)));
  };
  const counts = ["A", "B"].map(
    (g) => teams.filter((t) => t.group === g).length,
  );
  const valid = counts.every((n) => n === 3);
  const save = async () => {
    try {
      const p = planTeamsUpdate(base, teams);
      if (p.regrouped) setPlan(p);
      else if (await commit(p.data, "참가 반과 선수 명단을 저장했습니다."))
        setDirty(false);
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <>
      <PageTitle
        eyebrow="TEAM MANAGEMENT"
        title="참가 반 및 선수 관리"
        description="6개 반을 구성하고, 우리 반의 선수 명단을 등록하세요."
        action={
          <button className="button" onClick={save}>
            <Save size={17} />
            변경 사항 저장
          </button>
        }
      />
      {dirty && base.revision !== data.revision && (
        <div className="warning">
          다른 관리자가 변경했습니다. 입력은 보관됩니다.{" "}
          <button
            onClick={() => {
              if (
                window.confirm(
                  "입력 중인 내용을 버리고 최신 데이터를 불러올까요?",
                )
              )
                setDirty(false);
            }}
          >
            최신 데이터로 다시 편집
          </button>
        </div>
      )}
      <div className={`assignment-summary ${valid ? "valid" : "invalid"}`}>
        {valid ? <CheckCircle2 size={21} /> : <AlertCircle size={21} />}
        <strong>{valid ? "조 편성 완료" : "조 편성 확인 필요"}</strong>
        <span>A조 {counts[0]} / 3개 반</span>
        <span>B조 {counts[1]} / 3개 반</span>
        <small>조 변경을 저장하면 예선 대진을 다시 생성합니다.</small>
      </div>
      <div className="team-editor-grid">
        {teams.map((t) => (
          <section className="panel team-editor" key={t.id}>
            <div className="team-editor-head">
              <TeamAvatar name={t.name} group={t.group} />
              <h2>{t.name || "이름 미입력"}</h2>
              <span className="muted">{t.players.length}명</span>
            </div>
            <div className="form-row">
              <label>
                반 이름
                <input
                  value={t.name}
                  maxLength={30}
                  onChange={(e) =>
                    update(t.id, (old) => ({ ...old, name: e.target.value }))
                  }
                />
              </label>
              <label>
                소속 조
                <select
                  value={t.group}
                  onChange={(e) =>
                    update(t.id, (old) => ({ ...old, group: e.target.value }))
                  }
                >
                  <option value="A">A조</option>
                  <option value="B">B조</option>
                </select>
              </label>
            </div>
            <div className="roster-title">
              선수 명단 <span>{t.players.length}명</span>
            </div>
            <div className="player-inputs">
              {t.players.map((p, i) => (
                <div className="player-input" key={p.id}>
                  <span>{String(i + 1).padStart(2, "0")}</span>
                  <input
                    aria-label={`${t.name} 선수 ${i + 1} 이름`}
                    value={p.name}
                    maxLength={40}
                    placeholder="선수 이름"
                    onChange={(e) =>
                      update(t.id, (old) => ({
                        ...old,
                        players: old.players.map((player) =>
                          player.id === p.id
                            ? { ...player, name: e.target.value }
                            : player,
                        ),
                      }))
                    }
                  />
                  <button
                    className="icon-button danger-text"
                    aria-label={`${p.name || "선수"} 삭제`}
                    onClick={() => setDeletion({ teamId: t.id, player: p })}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
            </div>
            {!t.players.length && (
              <p className="muted">등록된 선수가 없습니다.</p>
            )}
            <button
              className="add-player"
              onClick={() =>
                update(t.id, (old) => ({
                  ...old,
                  players: [
                    ...old.players,
                    { id: crypto.randomUUID(), teamId: t.id, name: "" },
                  ],
                }))
              }
            >
              <Plus size={16} />
              선수 추가
            </button>
          </section>
        ))}
      </div>
      <div className="sticky-save">
        <span>수정한 내용은 저장 후 참가 반 화면에 반영됩니다.</span>
        <button className="button" onClick={save}>
          <Save size={16} />
          변경 사항 저장
        </button>
      </div>
      {plan && (
        <ConfirmModal
          title="조 편성을 변경할까요?"
          description="6개 예선 대진을 다시 생성합니다. 기존 예선과 결선의 임시·확정 결과가 모두 초기화됩니다. 반 이름과 선수 명단은 유지됩니다."
          affected={plan.affected.map(
            (id) =>
              stageLabel(data.matches.find((m) => m.id === id)) + ` (${id})`,
          )}
          danger
          onClose={() => setPlan(null)}
          onConfirm={async () => {
            if (
              await commit(
                plan.data,
                "조 편성을 저장하고 대진을 재생성했습니다.",
                { acknowledgedMatchIds: plan.affected },
              )
            ) {
              setPlan(null);
              setDirty(false);
            }
          }}
        />
      )}
      {deletion && (
        <ConfirmModal
          title="선수를 명단에서 삭제할까요?"
          description={`${deletion.player.name || "이 선수"}을(를) 삭제합니다. 최종 저장 전까지는 데이터에 반영되지 않습니다.`}
          danger
          confirmLabel="선수 삭제"
          onClose={() => setDeletion(null)}
          onConfirm={() => {
            update(deletion.teamId, (old) => ({
              ...old,
              players: old.players.filter((p) => p.id !== deletion.player.id),
            }));
            setDeletion(null);
          }}
        />
      )}
    </>
  );
}
