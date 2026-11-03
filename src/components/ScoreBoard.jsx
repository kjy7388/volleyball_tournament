import { analyzeMatch } from "../utils/sportRules";
export default function ScoreBoard({ match, rules, large = false }) {
  const r = analyzeMatch(match, rules);
  return (
    <span
      className={`score-board ${large ? "large" : ""}`}
      title={match.rounds ? "합산 잔여 인원" : "세트 스코어"}
    >
      <b>
        {match.status === "scheduled"
          ? "–"
          : match.rounds
            ? r.homeTotal
            : r.homeWins}
      </b>
      <span>:</span>
      <b>
        {match.status === "scheduled"
          ? "–"
          : match.rounds
            ? r.awayTotal
            : r.awayWins}
      </b>
    </span>
  );
}
