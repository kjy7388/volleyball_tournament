import {
  analyzeRounds,
  changeRound,
  emptyRound,
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
        각 판 10분 · 잔여 인원 0~10명 · 먼저 2판 승리. 앞 판을 수정하면 이후
        기록을 재검증하며 자동 삭제하지 않습니다.
      </p>
      {rounds.map((r, index) => {
        const prior = analyzeRounds(rounds.slice(0, index));
        const blocked =
          prior.errors.length > 0 ||
          prior.homeWins === 2 ||
          prior.awayWins === 2 ||
          rounds.slice(0, index).some((p) => !p.winner);
        const filled =
          r.homeRemaining !== null ||
          r.awayRemaining !== null ||
          r.winner !== null;
        const tied =
          r.homeRemaining !== null &&
          r.awayRemaining !== null &&
          r.homeRemaining === r.awayRemaining;
        return (
          <fieldset
            className="round-survivors"
            key={index}
            disabled={blocked && !filled}
          >
            <legend>{index + 1}판 · 10분</legend>
            <div className="form-row">
              {[
                ["homeRemaining", home],
                ["awayRemaining", away],
              ].map(([key, name]) => (
                <label key={key}>
                  {name} 잔여 인원
                  <input
                    aria-label={`${index + 1}판 ${name} 잔여 인원`}
                    type="number"
                    min="0"
                    max="10"
                    step="1"
                    inputMode="numeric"
                    disabled={blocked}
                    value={r[key] ?? ""}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === "" || /^\d+$/.test(raw))
                        change(index, {
                          [key]: raw === "" ? null : Number(raw),
                        });
                    }}
                  />
                </label>
              ))}
            </div>
            <label>
              최종 승리 반
              <select
                aria-label={`${index + 1}판 승리 반`}
                value={r.winner || ""}
                disabled={!tied || blocked}
                onChange={(e) =>
                  change(index, { winner: e.target.value || null })
                }
              >
                <option value="">
                  {tied ? "승부 미결정" : "미진행 / 자동 판정"}
                </option>
                <option value="home">{home} 승리</option>
                <option value="away">{away} 승리</option>
              </select>
            </label>
            {tied && (
              <p className={r.manualWinner ? "muted" : "warning"}>
                {r.manualWinner
                  ? "동률 후 관리자 수동 승자 지정 기록"
                  : "승부 미결정 · 연장전 또는 재경기 후 최종 승리 반을 지정하세요."}
              </p>
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
                {index + 1}판 입력 비우기
              </button>
            )}
          </fieldset>
        );
      })}
    </div>
  );
}
