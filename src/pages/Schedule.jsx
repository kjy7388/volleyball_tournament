import { useState } from "react";
import { CalendarDays } from "lucide-react";
import { PageTitle, Empty } from "../components/Common";
import MatchCard from "../components/MatchCard";
import { useTournament } from "../context/TournamentContext";
export default function Schedule() {
  const { data } = useTournament();
  const [status, setStatus] = useState("all");
  const [stage, setStage] = useState("all");
  const matches = data.matches
    .filter(
      (m) =>
        (status === "all" || m.status === status) &&
        (stage === "all" || m.stage === stage),
    )
    .sort(
      (a, b) =>
        (a.scheduledAt || "9999").localeCompare(b.scheduledAt || "9999") ||
        a.number - b.number,
    );
  const groups = matches.reduce((all, m) => {
    const key = m.scheduledAt
      ? m.scheduledAt.slice(0, 10)
      : `${m.exampleDate} · 예시 일정`;
    (all[key] ||= []).push(m);
    return all;
  }, {});
  return (
    <>
      <PageTitle
        eyebrow="MATCH SCHEDULE"
        title="모든 경기를 한눈에"
        description="첫 서브부터 마지막 매치 포인트까지, 총 9경기의 여정."
      />
      <div className="filter-bar">
        <div className="segmented" aria-label="경기 상태 필터">
          {[
            ["all", "전체"],
            ["scheduled", "예정"],
            ["live", "진행 중"],
            ["completed", "종료"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={status === value ? "active" : ""}
              onClick={() => setStatus(value)}
              aria-pressed={status === value}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="inline-label">
          라운드
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="all">모든 라운드</option>
            <option value="group">조별리그</option>
            <option value="semifinal">준결승</option>
            <option value="final">결승</option>
          </select>
        </label>
      </div>
      <div className="notice">
        연도와 시간이 없는 일정은 예시입니다. 확정 일정은 관리자 설정 후
        표시됩니다.
      </div>
      {!matches.length && <Empty>선택한 조건의 경기가 없습니다.</Empty>}
      {Object.entries(groups).map(([date, items]) => (
        <section className="schedule-day" key={date}>
          <h2>
            <CalendarDays size={20} />
            {date}
            <span>{items.length}경기</span>
          </h2>
          <div className="match-grid">
            {items.map((m) => (
              <MatchCard key={m.id} match={m} />
            ))}
          </div>
        </section>
      ))}
    </>
  );
}
