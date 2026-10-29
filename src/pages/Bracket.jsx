import { PageTitle } from "../components/Common";
import TournamentBracket from "../components/TournamentBracket";
export default function Bracket() {
  return (
    <>
      <PageTitle
        eyebrow="KNOCKOUT STAGE"
        title="우승을 향한 마지막 여정"
        description="준결승을 넘어, 단 하나의 우승 트로피를 향해."
      />
      <div className="info-strip">
        A조 1위 vs B조 2위 <span>·</span> B조 1위 vs A조 2위 <span>·</span>{" "}
        3·4위전 없음
      </div>
      <TournamentBracket />
      <div className="rules-note">
        <strong>대진은 자동으로 이어집니다</strong>
        <p>
          조별리그 종료 전에는 진출 조건을 표시합니다. 각 준결승의 결과를
          확정하면 결승에 승리 반이 배정됩니다. 경기 카드를 눌러 세트별 점수를
          확인하세요.
        </p>
      </div>
    </>
  );
}
