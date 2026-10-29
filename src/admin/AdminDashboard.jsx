import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Users,
  Flag,
  CircleCheck,
  FlaskConical,
  RotateCcw,
  ArrowRight,
  Download,
} from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import { PageTitle, Stats, SectionTitle, Empty } from "../components/Common";
import MatchCard from "../components/MatchCard";
import { ConfirmModal } from "../components/Modal";
import { createDemoData } from "../services/tournamentStorage";
import { createInitialData } from "../data/initialTournament";
import { nextMatch } from "../utils/display";
export default function AdminDashboard() {
  const { data, commit, backup } = useTournament();
  const navigate = useNavigate();
  const [action, setAction] = useState(null);
  const done = data.matches.filter((m) => m.status === "completed");
  const next = nextMatch(data);
  const recent = data.matches
    .filter((m) => m.updatedAt)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 3);
  return (
    <>
      <PageTitle
        eyebrow="CONTROL CENTER"
        title="대회 운영 대시보드"
        description="오늘의 코트를 준비하는 곳. 경기부터 선수 명단까지 관리하세요."
        action={
          <Link className="button" to="/admin/matches">
            결과 입력 <ArrowRight size={17} />
          </Link>
        }
      />
      <Stats
        items={[
          {
            label: "등록 참가 반",
            value: data.teams.length,
            sub: "개 반",
            icon: Users,
          },
          {
            label: "등록 선수",
            value: data.teams.reduce((s, t) => s + t.players.length, 0),
            sub: "명",
            icon: Users,
          },
          { label: "전체 경기", value: data.matches.length, icon: Flag },
          {
            label: "종료 / 남은 경기",
            value: `${done.length} / ${9 - done.length}`,
            icon: CircleCheck,
          },
        ]}
      />
      <div className="two-columns admin-overview">
        <section>
          <SectionTitle title="다음 경기" />
          {next ? (
            <MatchCard
              match={next}
              onClick={() => navigate("/admin/matches")}
            />
          ) : (
            <Empty>모든 경기가 종료되었습니다.</Empty>
          )}
        </section>
        <section>
          <SectionTitle title="라운드 진행 상황" />
          <div className="panel progress-panel">
            {[
              ["group", "조별리그", 6],
              ["semifinal", "준결승", 2],
              ["final", "결승", 1],
            ].map(([stage, label, total]) => {
              const count = done.filter((m) => m.stage === stage).length;
              return (
                <div key={stage}>
                  <div className="progress-title">
                    <strong>{label}</strong>
                    <span>
                      {count} / {total}
                    </span>
                  </div>
                  <div className="progress-track">
                    <div style={{ width: `${(count / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      <SectionTitle title="최근 입력한 경기 결과" to="/admin/matches" />
      {recent.length ? (
        <div className="match-grid">
          {recent.map((m) => (
            <MatchCard key={m.id} match={m} compact />
          ))}
        </div>
      ) : (
        <Empty>
          아직 입력한 결과가 없습니다. 경기 결과 관리에서 첫 점수를 기록하세요.
        </Empty>
      )}
      <section className="panel data-tools">
        <div>
          <span className="eyebrow">DEVELOPMENT TOOLS</span>
          <h2>테스트 데이터 관리</h2>
          <p>
            현재:{" "}
            <strong>{data.isDemo ? "데모 데이터" : "기본 운영 데이터"}</strong>{" "}
            · 데모는 9경기 결과와 우승 화면을 채웁니다.
            <br />
            적용하거나 초기화하면 현재 데이터가 교체됩니다. 필요하면 먼저
            백업하세요.
          </p>
        </div>
        <div className="button-row">
          <button className="button secondary" onClick={backup}>
            <Download size={16} />
            백업
          </button>
          <button
            className="button secondary"
            onClick={() => setAction("demo")}
          >
            <FlaskConical size={16} />
            데모 적용
          </button>
          <button
            className="button danger-outline"
            onClick={() => setAction("reset")}
          >
            <RotateCcw size={16} />
            초기화
          </button>
        </div>
      </section>
      {action && (
        <ConfirmModal
          title={
            action === "demo"
              ? "데모 데이터를 적용할까요?"
              : "초기 데이터로 돌아갈까요?"
          }
          description="현재 반·선수·일정·경기 결과가 모두 교체됩니다. 이 작업은 되돌릴 수 없으므로 필요한 데이터는 먼저 백업해주세요."
          danger
          confirmLabel={action === "demo" ? "데모로 교체" : "초기화"}
          onClose={() => setAction(null)}
          onConfirm={() => {
            if (
              commit(
                {
                  ...(action === "demo"
                    ? createDemoData()
                    : createInitialData()),
                  revision: data.revision,
                },
                action === "demo"
                  ? "데모 데이터를 적용했습니다."
                  : "초기화했습니다.",
              )
            )
              setAction(null);
          }}
        />
      )}
    </>
  );
}
