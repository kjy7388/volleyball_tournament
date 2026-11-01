import { analyzeMatch } from "../utils/sportRules";
export default function ScoreBoard({ match, rules, large = false }) {
  const r = analyzeMatch(match, rules);
  return (
    <span className={`score-board ${large ? "large" : ""}`}>
      <b>{match.status === "scheduled" ? "–" : r.homeWins}</b>
      <span>:</span>
      <b>{match.status === "scheduled" ? "–" : r.awayWins}</b>
    </span>
  );
}
