import Modal from "./Modal";
import { formatRatio } from "../utils/competitionRules";

// Present the same calculated row as the table, without maintaining a second
// copy of the standings or introducing a separate ranking calculation.
export default function TeamStatsModal({ row, sport, group, onClose }) {
  const dodge = sport.key === "dodgeball";
  const stats = [
    ["승점", row.matchPoints],
    ["경기 수", row.played],
    ["승리 경기", row.wins],
    ["패배 경기", row.losses],
    [dodge ? "승리 판" : "승리 세트", row.setsFor],
    [dodge ? "패배 판" : "패배 세트", row.setsAgainst],
    ...(dodge
      ? [
          ["세트 득실률", formatRatio(row.setsFor, row.setsAgainst)],
          ["잔여 인원수 차", row.remainingDiff > 0 ? `+${row.remainingDiff}` : row.remainingDiff],
        ]
      : [
          ["총 득점", row.pointsFor],
          ["총 실점", row.pointsAgainst],
          ["세트 득실률", formatRatio(row.setsFor, row.setsAgainst)],
          ["점수 득실률", formatRatio(row.pointsFor, row.pointsAgainst)],
        ]),
  ];
  return (
    <Modal title={`${row.team.name} 상세 기록`} onClose={onClose} preserveScroll>
      <div className="team-stats">
        <p className="team-stats-meta">{sport.icon} {sport.label} · {group}조</p>
        <dl className="team-stats-grid">
          {stats.map(([label, value], index) => (
            <div key={label} className={`team-stat-card ${index === 0 ? "team-stat-highlight" : ""}`}>
              <dt>{label}</dt><dd>{value}</dd>
            </div>
          ))}
        </dl>
        {!row.played && <p className="team-stats-note">아직 확정된 조별리그 경기 기록이 없습니다.</p>}
        {row.manuallyResolved && <p className="team-stats-note">관리자 확정 순위</p>}
      </div>
    </Modal>
  );
}
