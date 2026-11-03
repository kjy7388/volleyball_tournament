import {
  analyzeRounds,
  canEditRound,
  changeRound,
  emptyRound,
  roundHasInput,
  roundPlayed,
} from "../utils/dodgeballRules";
export default function DodgeballRoundEditor({
  rounds,
  setRounds,
  home,
  away,
}) {
  const change = (index, patch) =>
    setRounds((old) => changeRound(old, index, patch));
  return (
    <div className="round-input-table">
      <p className="muted">
        기본 2세트 · 세트당 10분(운영 상황에 따라 6분 또는 7분). 2세트는
        내야·외야 인원을 교대합니다. 제한 시간 종료 또는 내야 전원 아웃 시 잔여
        인원을 입력하세요. 앞선 세트 수정 시 이후 기록은 자동 삭제하지 않고
        재검증합니다.
      </p>
      {rounds.map((r, index) => {
        const blocked = !canEditRound(rounds, index);
        const filled = roundHasInput(r);
        const tied = roundPlayed(r) && r.homeRemaining === r.awayRemaining;
        return (
          <fieldset
            className="round-survivors"
            key={index}
            disabled={blocked && !filled}
          >
            <legend>{index + 1}세트</legend>
            {index === 2 && (
              <p className="muted">
                1·2세트 합계 동점일 때만 진행합니다. 실제 경기에서는 양 반 내야
                5명씩 운영하며, 홈페이지에서 출전 선수는 등록하지 않습니다.
              </p>
            )}
            <div className="form-row">
              {[
                ["homeRemaining", home],
                ["awayRemaining", away],
              ].map(([key, name]) => (
                <label key={key}>
                  {name} 잔여 인원
                  <input
                    aria-label={`${index + 1}세트 ${name} 잔여 인원`}
                    type="number"
                    min="0"
                    step="1"
                    inputMode="numeric"
                    disabled={blocked}
                    value={r[key] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (
                        raw === "" ||
                        (/^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)))
                      )
                        change(index, {
                          [key]: raw === "" ? null : Number(raw),
                        });
                    }}
                  />
                </label>
              ))}
            </div>
            {roundPlayed(r) && (
              <p className="muted">
                {home} {r.homeRemaining}명 · {away} {r.awayRemaining}명 ·{" "}
                {tied
                  ? "세트 무승부"
                  : `${r.winner === "home" ? home : away} 세트 승리`}
              </p>
            )}
            {index === 2 && tied && (
              <label>
                최종 경기 승리 반 (별도 승자 확정)
                <select
                  aria-label="3세트 동률 최종 경기 승리 반"
                  value={r.winner || ""}
                  disabled={blocked}
                  onChange={(e) =>
                    change(index, { winner: e.target.value || null })
                  }
                >
                  <option value="">승부 미결정</option>
                  <option value="home">{home} 승리</option>
                  <option value="away">{away} 승리</option>
                </select>
                <p className={r.manualWinner ? "muted" : "warning"}>
                  {r.manualWinner
                    ? "3세트 동률 후 관리자 수동 승자 지정 기록 · 세트 자체는 무승부로 유지"
                    : "승부 미결정 · 별도 승자 확정 절차를 진행한 뒤 최종 경기 승리 반을 선택하세요."}
                </p>
              </label>
            )}
            {filled && (
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setRounds((old) =>
                    old.map((v, i) => (i === index ? emptyRound() : v)),
                  )
                }
              >
                {index + 1}세트 입력 비우기
              </button>
            )}
            {blocked && filled && (
              <p className="warning">
                앞선 세트와 모순되는 기록입니다. 해당 기록을 비운 뒤 다시
                입력하세요.
              </p>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
