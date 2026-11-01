import { analyzeSets, confirmedResult as volleyballResult } from "./matchRules";
import { analyzeRounds } from "./dodgeballRules";
export function analyzeMatch(match, rules) {
  return match.rounds
    ? analyzeRounds(match.rounds)
    : analyzeSets(match.sets, match.rulesSnapshot || rules);
}
export function matchResult(match, rules) {
  if (!match.rounds) return volleyballResult(match, rules);
  if (
    match.status !== "completed" ||
    !match.homeTeamId ||
    !match.awayTeamId ||
    match.homeTeamId === match.awayTeamId
  )
    return null;
  const result = analyzeRounds(match.rounds);
  const winnerTeamId =
    result.homeWins === 3 ? match.homeTeamId : match.awayTeamId;
  return result.complete && match.winnerTeamId === winnerTeamId
    ? { ...result, winnerTeamId }
    : null;
}
export function hasResultInput(match) {
  return match.rounds
    ? match.rounds.some((r) => r.winner !== null)
    : match.sets.some((s) => s.home !== "" || s.away !== "");
}
