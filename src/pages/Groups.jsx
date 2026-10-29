import { PageTitle, SectionTitle } from "../components/Common";
import GroupStandings from "../components/GroupStandings";
import MatchCard from "../components/MatchCard";
import { useTournament } from "../context/TournamentContext";
export default function Groups() {
  const { data } = useTournament();
  return (
    <>
      <PageTitle
        eyebrow="GROUP STAGE"
        title="조별리그"
        description="세 번의 맞대결, 두 장의 준결승 티켓. 우리 반의 순위를 확인하세요."
      />
      <div className="info-strip">
        5세트 3선승제 <span>·</span> 조별 풀리그 <span>·</span> 각 조 1·2위
        준결승 진출
      </div>
      <div className="two-columns groups-columns">
        {["A", "B"].map((g) => (
          <section key={g}>
            <GroupStandings group={g} />
            <SectionTitle title={`${g}조 경기 결과`} />
            <div className="stack">
              {data.matches
                .filter((m) => m.group === g)
                .map((m) => (
                  <MatchCard key={m.id} match={m} />
                ))}
            </div>
          </section>
        ))}
      </div>
      <div className="rules-note">
        <strong>순위는 이렇게 정해집니다</strong>
        <p>
          승리 수 → 세트 득실차 → 득실점 차이 → 동률 팀 간 상대 전적. 그래도
          같으면 관리자 확인이 필요합니다. 미확정 점수는 반영하지 않으며, 양
          조의 모든 경기와 순위가 확정되면 준결승 대진을 배정합니다.
        </p>
      </div>
    </>
  );
}
