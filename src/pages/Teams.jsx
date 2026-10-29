import { Users } from "lucide-react";
import { PageTitle } from "../components/Common";
import { TeamAvatar } from "../components/MatchCard";
import { useTournament } from "../context/TournamentContext";
import { confirmedResult } from "../utils/matchRules";
export default function Teams() {
  const { data } = useTournament();
  return (
    <>
      <PageTitle
        eyebrow="THE SIX TEAMS"
        title="함께 뛰는 우리 반"
        description="코트 위에서는 하나의 팀. 6개 반의 선수들을 만나보세요."
      />
      <div className="notice">
        초기 선수 명단은 모두 가상 예시입니다. 관리자가 등록한 명단이 이곳에
        반영됩니다.
      </div>
      <div className="teams-grid">
        {data.teams.map((t) => {
          const matches = data.matches.filter(
            (m) =>
              [m.homeTeamId, m.awayTeamId].includes(t.id) &&
              confirmedResult(m, data.tournament.setRules),
          );
          const wins = matches.filter((m) => m.winnerTeamId === t.id).length;
          return (
            <section className="panel team-card" key={t.id}>
              <div className="team-card-header">
                <TeamAvatar name={t.name} group={t.group} />
                <div>
                  <span className="eyebrow">GROUP {t.group}</span>
                  <h2>{t.name}</h2>
                </div>
                <span className="player-count">
                  <Users size={15} />
                  {t.players.length}명
                </span>
              </div>
              <div className="team-record">
                <span>현재 성적</span>
                <strong>
                  {wins}
                  <small>승</small> {matches.length - wins}
                  <small>패</small>
                </strong>
                <span>{matches.length}경기</span>
              </div>
              <h3 className="roster-title">선수 명단</h3>
              {t.players.length ? (
                <ul className="player-list">
                  {t.players.map((p) => (
                    <li key={p.id}>{p.name}</li>
                  ))}
                </ul>
              ) : (
                <p className="muted">등록된 선수가 없습니다.</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
