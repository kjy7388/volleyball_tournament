import { useState } from "react";
import {
  Save,
  CheckCircle2,
  MapPin,
  CalendarDays,
  AlertTriangle,
  LockKeyhole,
} from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import { PageTitle, SectionTitle } from "../components/Common";
import MatchCard, { StatusBadge } from "../components/MatchCard";
import Modal, { ConfirmModal } from "../components/Modal";
import { planMatchUpdate } from "../services/tournamentStorage";
import DodgeballRoundEditor from "./DodgeballRoundEditor";
import VolleyballScoreEditor from "./VolleyballScoreEditor";
import { analyzeRounds } from "../utils/dodgeballRules";
import { analyzeSets } from "../utils/matchRules";
import { calculateStandings } from "../utils/standings";
import { syncBracket } from "../utils/bracketLogic";
import { teamLabel, matchDate, stageLabel } from "../utils/display";
export default function MatchManager() {
  const { data, sport } = useTournament();
  const [selected, setSelected] = useState(null);
  return (
    <>
      <PageTitle
        eyebrow="MATCH CONTROL"
        title="경기 결과 관리"
        description={`${sport.unit}별 결과를 입력하고 확정하세요. 순위와 다음 대진이 자동 반영됩니다.`}
      />
      <div className="notice">
        임시 저장은 순위에 반영되지 않습니다. 결과 확정 전 점수와 승리 반을 다시
        확인해주세요.
      </div>
      <TieResolver />
      {[
        ["A", "A조 예선"],
        ["B", "B조 예선"],
        ["semifinal", "준결승"],
        ["final", "결승"],
      ].map(([key, title]) => (
        <section className="match-manager-section" key={key}>
          <SectionTitle title={title} />
          <div className="match-grid">
            {data.matches
              .filter((m) => m.group === key || m.stage === key)
              .map((m) => (
                <MatchCard
                  key={m.id}
                  match={m}
                  onClick={() => setSelected(m.id)}
                />
              ))}
          </div>
        </section>
      ))}
      {selected && (
        <ScoreEditor
          key={selected}
          match={data.matches.find((m) => m.id === selected)}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
function ScoreEditor({ match, onClose }) {
  const { data, commit, notify } = useTournament();
  const dodgeball = !!match.rounds;
  const [sets, setSets] = useState(() =>
    structuredClone(match.rounds || match.sets),
  );
  const [plan, setPlan] = useState(null);
  const [base] = useState(data);
  const rules = match.rulesSnapshot || data.tournament.setRules;
  const result = dodgeball ? analyzeRounds(sets) : analyzeSets(sets, rules);
  const ready = match.homeTeamId && match.awayTeamId;
  const terminalAt = (() => {
    if (dodgeball) return 4;
    let h = 0;
    let a = 0;
    for (let i = 0; i < sets.length; i++) {
      const r = analyzeSets(sets.slice(0, i + 1), rules);
      h = r.homeWins;
      a = r.awayWins;
      if (h === 3 || a === 3) return i;
    }
    return 4;
  })();
  const change = (index, side, raw) => {
    if (raw !== "" && !/^\d+$/.test(raw)) return;
    const n = raw === "" ? "" : Number(raw);
    if (n !== "" && (!Number.isSafeInteger(n) || n > 9999)) return;
    setSets((old) =>
      old.map((s, i) => (i === index ? { ...s, [side]: n } : s)),
    );
  };
  const save = async (mode) => {
    try {
      const p = planMatchUpdate(base, match.id, sets, mode);
      if (
        mode === "confirm" ||
        p.affected.length ||
        match.status === "completed"
      )
        setPlan({ ...p, mode });
      else if (
        await commit(
          p.data,
          "점수를 임시 저장했습니다. 순위에는 반영되지 않습니다.",
        )
      )
        onClose();
    } catch (e) {
      notify(e.message, "error");
    }
  };
  return (
    <>
      <Modal
        wide
        title={`경기 ${String(match.number).padStart(2, "0")} · ${stageLabel(match)}`}
        onClose={onClose}
      >
        {base.revision !== data.revision && (
          <div className="warning">
            다른 관리자가 변경했습니다. 입력은 보관됩니다. 창을 닫고 최신
            데이터를 확인한 뒤 다시 입력해주세요. 이전 버전의 저장은 서버가
            거부합니다.
          </div>
        )}
        <div className="editor-meta">
          <StatusBadge status={match.status} />
          <span>
            <CalendarDays size={15} />
            {matchDate(match)}
          </span>
          <span>
            <MapPin size={15} />
            {match.location}
          </span>
        </div>
        {!ready ? (
          <div className="locked-state">
            <LockKeyhole size={32} />
            <h3>진출 반이 확정되지 않았습니다</h3>
            <p>이전 라운드의 경기와 순위를 먼저 확정해주세요.</p>
          </div>
        ) : (
          <>
            <div className="editor-score">
              <strong>{teamLabel(data, match, "home")}</strong>
              <div>
                <b>{result.homeWins}</b>
                <span>:</span>
                <b>{result.awayWins}</b>
                <small>{dodgeball ? "판" : "세트"} 스코어</small>
              </div>
              <strong>{teamLabel(data, match, "away")}</strong>
            </div>
            {match.status === "completed" && (
              <div className="warning">
                <AlertTriangle size={17} />
                확정된 결과를 수정 중입니다. 대진이 바뀌면 영향을 받는 결선
                기록을 확인 후 초기화합니다. 임시 저장 시 이 경기는 순위에서
                제외됩니다.
              </div>
            )}
            {dodgeball ? (
              <DodgeballRoundEditor
                rounds={sets}
                setRounds={setSets}
                home={teamLabel(data, match, "home")}
                away={teamLabel(data, match, "away")}
              />
            ) : (
              <VolleyballScoreEditor
                {...{ sets, terminalAt, data, match, rules, change }}
                setStates={result.setStates}
              />
            )}
            {result.errors.length > 0 && (
              <div className="validation-errors" role="alert">
                {result.errors.map((e) => (
                  <p key={e}>{e}</p>
                ))}
              </div>
            )}
            {result.complete && (
              <div className="result-preview">
                <CheckCircle2 size={20} />
                <strong>
                  {teamLabel(
                    data,
                    match,
                    result.homeWins === 3 ? "home" : "away",
                  )}{" "}
                  승리
                </strong>
                <span>
                  {result.homeWins}:{result.awayWins}
                </span>
              </div>
            )}
            <p className="muted small-text">
              {dodgeball
                ? "먼저 3판 승리 · 미진행 판은 승리 반을 선택하지 않습니다."
                : "듀스 없음 · 목표 점수 선취(1점 차 허용) · 먼저 3세트 승리. 진행 중인 점수는 임시 저장할 수 있습니다."}
            </p>
            <div className="modal-actions">
              <button
                className="button secondary"
                disabled={!dodgeball && result.draftErrors.length > 0}
                onClick={() => save("draft")}
              >
                <Save size={17} />
                임시 저장
              </button>
              <button
                className="button"
                disabled={!result.complete}
                onClick={() => save("confirm")}
              >
                <CheckCircle2 size={17} />
                경기 결과 확정
              </button>
            </div>
          </>
        )}
      </Modal>
      {plan && (
        <ConfirmModal
          title={
            plan.mode === "confirm"
              ? "경기 결과를 확정할까요?"
              : "확정 결과를 임시 점수로 바꿀까요?"
          }
          description={
            plan.mode === "confirm"
              ? `${teamLabel(data, match, result.homeWins === 3 ? "home" : "away")}의 ${Math.max(result.homeWins, result.awayWins)}:${Math.min(result.homeWins, result.awayWins)} 승리로 확정합니다. 변경된 순위와 진출 반이 반영됩니다.`
              : "이 경기의 확정 결과와 승자가 해제되고 순위에서 제외됩니다."
          }
          affected={plan.affected.map(
            (id) =>
              `${stageLabel(data.matches.find((m) => m.id === id))} · 경기 ${data.matches.find((m) => m.id === id).number}`,
          )}
          danger={plan.affected.length > 0}
          confirmLabel={
            plan.mode === "confirm" ? "결과 확정" : "임시 저장으로 변경"
          }
          onClose={() => setPlan(null)}
          onConfirm={async () => {
            if (
              await commit(
                plan.data,
                plan.mode === "confirm"
                  ? "경기 결과를 확정했습니다."
                  : "임시 저장했습니다.",
                { acknowledgedMatchIds: [match.id, ...plan.affected] },
              )
            )
              onClose();
          }}
        />
      )}
    </>
  );
}
function TieResolver() {
  const { data, commit, notify } = useTournament();
  const [orders, setOrders] = useState({ A: [], B: [] });
  const [plan, setPlan] = useState(null);
  const unresolved = ["A", "B"]
    .map((group) => ({
      group,
      ...calculateStandings(
        data.teams,
        data.matches,
        group,
        data.tournament.setRules,
        data.manualRankings[group],
      ),
    }))
    .filter((r) => r.finished && !r.resolved);
  if (!unresolved.length) return null;
  return (
    <section className="panel tie-resolver">
      <h2>
        <AlertTriangle size={20} />
        동률 순위를 확인해주세요
      </h2>
      <p>
        규칙으로 순위를 결정할 수 없습니다. 동률인 반의 순서만 관리자가
        지정해주세요. 다른 순위는 유지됩니다.
      </p>
      {unresolved.map((r) => (
        <div key={r.group}>
          <h3>{r.group}조 관리자 순위 확인</h3>
          {r.ties.flatMap((cluster) =>
            cluster.map((id, i) => (
              <label className="inline-label" key={id}>
                {r.rows.findIndex((row) => row.team.id === cluster[0]) + i + 1}
                위
                <select
                  aria-label={`${r.group}조 동률 ${i + 1}순위`}
                  value={
                    orders[r.group][
                      r.rows.findIndex((row) => row.team.id === id)
                    ] || ""
                  }
                  onChange={(e) => {
                    const index = r.rows.findIndex((row) => row.team.id === id);
                    setOrders((old) => {
                      const o = [...old[r.group]];
                      o[index] = e.target.value;
                      return { ...old, [r.group]: o };
                    });
                  }}
                >
                  <option value="">반 선택</option>
                  {cluster.map((teamId) => (
                    <option key={teamId} value={teamId}>
                      {data.teams.find((t) => t.id === teamId).name}
                    </option>
                  ))}
                </select>
              </label>
            )),
          )}
          <button
            className="button secondary"
            onClick={() => {
              const order = r.rows.map((row, i) =>
                row.tied ? orders[r.group][i] : row.team.id,
              );
              if (order.some((id) => !id) || new Set(order).size !== 3) {
                notify("동률인 반을 중복 없이 선택해주세요.", "error");
                return;
              }
              const next = structuredClone(data);
              next.manualRankings[r.group] = order;
              setPlan(syncBracket(next));
            }}
          >
            순위 확인
          </button>
        </div>
      ))}
      {plan && (
        <ConfirmModal
          title="관리자 순위를 확정할까요?"
          description="지정한 순위로 진출 반을 계산합니다. 점수를 수정하면 이 수동 확인은 해제됩니다."
          affected={plan.affected}
          onClose={() => setPlan(null)}
          onConfirm={async () => {
            if (
              await commit(plan.data, "동률 순위를 확정했습니다.", {
                acknowledgedMatchIds: plan.affected,
              })
            )
              setPlan(null);
          }}
        />
      )}
    </section>
  );
}
