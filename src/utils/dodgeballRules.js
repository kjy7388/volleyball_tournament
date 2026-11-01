export const emptyRounds = () =>
  Array.from({ length: 5 }, () => ({ winner: null }));
export function analyzeRounds(rounds) {
  const errors = [];
  let homeWins = 0,
    awayWins = 0,
    gap = false;
  if (!Array.isArray(rounds) || rounds.length > 5)
    return {
      errors: ["최대 5판까지 입력할 수 있습니다."],
      homeWins,
      awayWins,
      complete: false,
    };
  rounds.forEach((round, i) => {
    if (
      !round ||
      Object.keys(round).length !== 1 ||
      !Object.hasOwn(round, "winner") ||
      ![null, "home", "away"].includes(round.winner)
    ) {
      errors.push(`${i + 1}판: 승리 반을 올바르게 선택해주세요.`);
      return;
    }
    if (round.winner === null) {
      gap = true;
      return;
    }
    if (homeWins === 3 || awayWins === 3) {
      errors.push(`${i + 1}판: 승부 이후 추가 판은 입력할 수 없습니다.`);
      return;
    }
    if (gap) errors.push(`${i + 1}판: 앞 판부터 순서대로 입력해주세요.`);
    if (round.winner === "home") homeWins++;
    else awayWins++;
  });
  return {
    errors,
    homeWins,
    awayWins,
    complete: !errors.length && (homeWins === 3 || awayWins === 3),
  };
}
// Earlier edits clear later input; no dependent winner is invented.
export function changeRound(rounds, index, winner) {
  if (
    !Number.isInteger(index) ||
    index < 0 ||
    index > 4 ||
    ![null, "home", "away"].includes(winner)
  )
    throw new Error("잘못된 판 입력입니다.");
  const prior = analyzeRounds(rounds.slice(0, index));
  if (
    prior.errors.length ||
    prior.homeWins === 3 ||
    prior.awayWins === 3 ||
    rounds.slice(0, index).some((r) => r.winner === null)
  )
    throw new Error("앞 판부터 입력해주세요.");
  return rounds.map((r, i) =>
    i < index ? { ...r } : { winner: i === index ? winner : null },
  );
}
