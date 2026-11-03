export default function DodgeballSummary({ result, home, away, stage }) {
  return (
    <div className="notice dodgeball-summary">
      <p>
        1·2세트 합계: {home} {result.baseHomeTotal}명 · {away}{" "}
        {result.baseAwayTotal}명
      </p>
      <p>
        {result.needsThird
          ? "합계 동점 · 3세트 진행"
          : result.complete
            ? "2세트 합산으로 경기 종료 · 3세트 미진행"
            : "1·2세트 입력 후 합계를 확인합니다."}
      </p>
      {result.complete && (
        <>
          <strong>
            최종 승리 반: {result.winnerSide === "home" ? home : away}
          </strong>
          {stage === "group" && (
            <p>
              확정 시 승점: {home} {result.homeMatchPoints}점 · {away}{" "}
              {result.awayMatchPoints}점
            </p>
          )}
        </>
      )}
      {result.needsThird && result.roundsPlayed === 3 && (
        <p>
          3세트 포함 합산 잔여 인원: {home} {result.homeTotal}명 · {away}{" "}
          {result.awayTotal}명
        </p>
      )}
    </div>
  );
}
