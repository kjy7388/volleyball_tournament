import { teamLabel } from "../utils/display";
export default function VolleyballScoreEditor({
  sets,
  terminalAt,
  data,
  match,
  rules,
  change,
  setStates,
}) {
  return (
    <div className="score-input-table">
      <div className="score-input-head">
        <span>세트 / 목표</span>
        <strong>{teamLabel(data, match, "home")}</strong>
        <span />
        <strong>{teamLabel(data, match, "away")}</strong>
      </div>
      {sets.map((s, i) => {
        const disabled = i > terminalAt;
        return (
          <div
            className={`score-input-row ${disabled ? "disabled" : ""}`}
            key={i}
          >
            <div>
              <strong>{i + 1}세트</strong>
              <small>
                {disabled
                  ? "승부 결정"
                  : `${rules[i]}점 선취 · ${setStates?.[i] === "completed" ? "종료 가능" : setStates?.[i] === "in_progress" ? "진행 중" : setStates?.[i] === "invalid" ? "입력 확인" : "미진행"}`}
              </small>
            </div>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={rules[i]}
              step="1"
              aria-label={`${i + 1}세트 ${teamLabel(data, match, "home")} 점수`}
              value={s.home}
              disabled={disabled && s.home === "" && s.away === ""}
              onChange={(e) => change(i, "home", e.target.value)}
              onKeyDown={(e) => {
                if (["-", "+", ".", "e", "E"].includes(e.key))
                  e.preventDefault();
              }}
              placeholder="–"
            />
            <span>:</span>
            <input
              type="number"
              inputMode="numeric"
              min="0"
              max={rules[i]}
              step="1"
              aria-label={`${i + 1}세트 ${teamLabel(data, match, "away")} 점수`}
              value={s.away}
              disabled={disabled && s.home === "" && s.away === ""}
              onChange={(e) => change(i, "away", e.target.value)}
              onKeyDown={(e) => {
                if (["-", "+", ".", "e", "E"].includes(e.key))
                  e.preventDefault();
              }}
              placeholder="–"
            />
          </div>
        );
      })}
    </div>
  );
}
