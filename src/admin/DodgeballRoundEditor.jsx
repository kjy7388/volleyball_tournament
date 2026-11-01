import { analyzeRounds, changeRound } from "../utils/dodgeballRules";
export default function DodgeballRoundEditor({
  rounds,
  setRounds,
  home,
  away,
}) {
  return (
    <div className="round-input-table">
      <p className="muted">
        앞 판의 승자를 바꾸면 이후 판 입력을 지웁니다. 3승 후에는 추가 판을
        입력하지 않습니다.
      </p>
      {rounds.map((round, index) => {
        const prior = analyzeRounds(rounds.slice(0, index));
        const disabled =
          prior.homeWins === 3 ||
          prior.awayWins === 3 ||
          rounds.slice(0, index).some((r) => r.winner === null);
        return (
          <label className="round-input-row" key={index}>
            <strong>{index + 1}판</strong>
            <select
              aria-label={`${index + 1}판 승리 반`}
              value={round.winner || ""}
              disabled={disabled}
              onChange={(e) =>
                setRounds((old) =>
                  changeRound(old, index, e.target.value || null),
                )
              }
            >
              <option value="">미진행</option>
              <option value="home">{home} 승리</option>
              <option value="away">{away} 승리</option>
            </select>
          </label>
        );
      })}
    </div>
  );
}
