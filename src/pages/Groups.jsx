import { PageTitle, SectionTitle } from "../components/Common";
import GroupStandings from "../components/GroupStandings";
import MatchCard from "../components/MatchCard";
import { useTournament } from "../context/TournamentContext";
export default function Groups() {
  const { data, sport } = useTournament();
  return (
    <>
      <PageTitle
        eyebrow="GROUP STAGE"
        title="조별리그"
        description="세 번의 맞대결, 두 장의 준결승 티켓. 우리 반의 순위를 확인하세요."
      />
      <div className="info-strip">
        {sport.key === "dodgeball"
          ? "기본 2세트 · 합계 동점 시 3세트"
          : `3${sport.unit} 2선승제`}{" "}
        <span>·</span> 조별 풀리그 <span>·</span> 각 조 1·2위 준결승 진출
      </div>
      <div className="notice">
        {sport.key === "volleyball"
          ? "전 경기 기본 15점 · 조별리그 듀스 없음(15:14 종료) · 준결승·결승 듀스 적용(15:14 미완료, 16:14 종료)."
          : "세트당 10분(6분·7분 단축 가능) · 1·2세트 잔여 인원 합계로 승자 판정 · 합계 동점 시 3세트 · 3세트 동률은 최종 경기 승자 수동 확정."}
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
          {sport.key === "dodgeball"
            ? "승점 → 승리 경기 수 → 세트득실률 → 잔여 인원수 합산 차이 → 두 팀 간 상대 전적. 동률 세트는 세트 승패에서 제외합니다."
            : "승점 → 승리 경기 수 → 세트득실률 → 점수득실률 → 두 팀 간 상대 전적."}{" "}
          {sport.key === "dodgeball"
            ? "2세트 종료 승리 3점·패배 0점, 3세트 진행 후 승리 2점·패배 1점."
            : "2:0 승리 3점 · 2:1 승리 2점 · 1:2 패배 1점 · 0:2 패배 0점."}{" "}
          비율은 소수 셋째 자리로 표시하지만 순위는 정확한 정수 교차곱으로
          비교합니다. 분모 0·분자 양수는 무패, 0/0은 미기록입니다. 그래도 같거나
          세 팀 동률이면 관리자 확인이 필요합니다. 미확정 점수는 반영하지
          않으며, 양 조의 모든 경기와 순위가 확정되면 준결승 대진을 배정합니다.
        </p>
      </div>
    </>
  );
}
