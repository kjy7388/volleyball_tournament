import { useState } from "react";
import {
  MapPin,
  Clock3,
  ChevronRight,
  Check,
  CalendarDays,
} from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import {
  teamLabel,
  matchDate,
  stageLabel,
  statusLabel,
} from "../utils/display";
import ScoreBoard from "./ScoreBoard";
import Modal from "./Modal";
import DodgeballSummary from "./DodgeballSummary";
import { analyzeRounds } from "../utils/dodgeballRules";
export function StatusBadge({ status }) {
  return (
    <span className={`badge status-${status}`}>
      <span />
      {statusLabel[status]}
    </span>
  );
}
export function TeamAvatar({ name, group, small = false }) {
  return (
    <span
      className={`team-avatar group-${group || "neutral"} ${small ? "small" : ""}`}
    >
      {name?.match(/^\d+/)?.[0] || name?.[0] || "?"}
    </span>
  );
}
export default function MatchCard({ match, onClick, compact = false }) {
  const { data } = useTournament();
  const [detail, setDetail] = useState(false);
  const home = teamLabel(data, match, "home");
  const away = teamLabel(data, match, "away");
  const team = (id) => data.teams.find((t) => t.id === id);
  return (
    <>
      <button
        className={`match-card ${compact ? "compact" : ""}`}
        onClick={onClick || (() => setDetail(true))}
      >
        <div className="match-card-top">
          <span className="match-stage">
            <span className="match-no">
              {String(match.number).padStart(2, "0")}
            </span>
            {stageLabel(match)}
          </span>
          <StatusBadge status={match.status} />
        </div>
        <div className="match-versus">
          <div
            className={`match-team ${match.winnerTeamId === match.homeTeamId && match.winnerTeamId ? "winner" : ""}`}
          >
            <TeamAvatar name={home} group={team(match.homeTeamId)?.group} />
            <strong>{home}</strong>
            {match.winnerTeamId === match.homeTeamId && match.winnerTeamId && (
              <Check size={14} />
            )}
          </div>
          <ScoreBoard match={match} rules={data.tournament.setRules} />
          <div
            className={`match-team ${match.winnerTeamId === match.awayTeamId && match.winnerTeamId ? "winner" : ""}`}
          >
            <TeamAvatar name={away} group={team(match.awayTeamId)?.group} />
            <strong>{away}</strong>
            {match.winnerTeamId === match.awayTeamId && match.winnerTeamId && (
              <Check size={14} />
            )}
          </div>
        </div>
        <div className="match-card-bottom">
          <span>
            <Clock3 size={13} />
            {matchDate(match)}
          </span>
          <span>
            <MapPin size={13} />
            {match.location || "장소 미정"}
          </span>
          <ChevronRight size={14} />
        </div>
      </button>
      {detail && <MatchDetail match={match} onClose={() => setDetail(false)} />}
    </>
  );
}
export function MatchDetail({ match, onClose }) {
  const { data } = useTournament();
  return (
    <Modal
      title={`경기 ${String(match.number).padStart(2, "0")} · ${stageLabel(match)}`}
      onClose={onClose}
    >
      <div className="detail-info">
        <StatusBadge status={match.status} />
        <p>
          <CalendarDays size={15} />
          {matchDate(match)}
        </p>
        <p>
          <MapPin size={15} />
          {match.location}
        </p>
      </div>
      <div className="detail-score">
        <strong>{teamLabel(data, match, "home")}</strong>
        <ScoreBoard match={match} rules={data.tournament.setRules} large />
        <strong>{teamLabel(data, match, "away")}</strong>
      </div>
      {match.status === "scheduled" ? (
        <div className="empty-state">아직 경기가 시작되지 않았습니다.</div>
      ) : (
        <>
          <div className="set-results">
            <p className="muted">
              {match.rounds
                ? "기본 2세트 · 세트당 10분(6분·7분 단축 가능) · 합계 동점 시 3세트"
                : match.stage === "group"
                  ? "3세트 2선승제 · 조별리그 듀스 없음"
                  : "3세트 2선승제 · 준결승·결승 듀스 적용(2점 차)"}
            </p>
            <div className="set-row set-head">
              <span>세트</span>
              <strong>{teamLabel(data, match, "home")}</strong>
              <strong>{teamLabel(data, match, "away")}</strong>
            </div>
            {(match.rounds || match.sets).map((s, i) => (
              <div className="set-row" key={i}>
                <span>
                  {i + 1}
                  세트
                </span>
                <b
                  className={
                    (
                      match.rounds
                        ? s.winner === "home" &&
                          s.homeRemaining !== s.awayRemaining
                        : s.home !== "" && s.home > s.away
                    )
                      ? "blue"
                      : ""
                  }
                >
                  {match.rounds
                    ? s.homeRemaining !== null &&
                      s.homeRemaining === s.awayRemaining
                      ? `세트 무승부 · ${s.homeRemaining}명${s.manualWinner ? " · 경기 승자 관리자 지정" : ""}`
                      : s.winner === "home"
                        ? `승리 · ${s.homeRemaining}명${s.manualWinner ? " · 관리자 지정" : ""}`
                        : s.winner === "away"
                          ? `패배 · ${s.homeRemaining}명`
                          : s.homeRemaining !== null || s.awayRemaining !== null
                            ? `입력 중 · ${s.homeRemaining ?? "–"}명`
                            : "미진행"
                    : s.home === ""
                      ? "–"
                      : s.home}
                </b>
                <b
                  className={
                    (
                      match.rounds
                        ? s.winner === "away" &&
                          s.homeRemaining !== s.awayRemaining
                        : s.away !== "" && s.away > s.home
                    )
                      ? "blue"
                      : ""
                  }
                >
                  {match.rounds
                    ? s.awayRemaining !== null &&
                      s.homeRemaining === s.awayRemaining
                      ? `세트 무승부 · ${s.awayRemaining}명${s.manualWinner ? " · 경기 승자 관리자 지정" : ""}`
                      : s.winner === "away"
                        ? `승리 · ${s.awayRemaining}명${s.manualWinner ? " · 관리자 지정" : ""}`
                        : s.winner === "home"
                          ? `패배 · ${s.awayRemaining}명`
                          : s.homeRemaining !== null || s.awayRemaining !== null
                            ? `입력 중 · ${s.awayRemaining ?? "–"}명`
                            : "미진행"
                    : s.away === ""
                      ? "–"
                      : s.away}
                </b>
              </div>
            ))}
          </div>
          {match.rounds && (
            <DodgeballSummary
              result={analyzeRounds(match.rounds)}
              home={teamLabel(data, match, "home")}
              away={teamLabel(data, match, "away")}
              stage={match.stage}
            />
          )}
          {match.status === "live" && (
            <p className="muted">
              임시 저장된 점수입니다. 순위에는 반영되지 않습니다.
            </p>
          )}
        </>
      )}
    </Modal>
  );
}
