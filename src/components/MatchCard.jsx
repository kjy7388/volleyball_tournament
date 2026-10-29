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
            <div className="set-row set-head">
              <span>세트</span>
              <strong>{teamLabel(data, match, "home")}</strong>
              <strong>{teamLabel(data, match, "away")}</strong>
            </div>
            {match.sets.map((s, i) => (
              <div className="set-row" key={i}>
                <span>{i + 1}세트</span>
                <b className={s.home !== "" && s.home > s.away ? "blue" : ""}>
                  {s.home === "" ? "–" : s.home}
                </b>
                <b className={s.away !== "" && s.away > s.home ? "blue" : ""}>
                  {s.away === "" ? "–" : s.away}
                </b>
              </div>
            ))}
          </div>
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
