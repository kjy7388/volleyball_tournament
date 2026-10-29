export const emptySets = () =>
  Array.from({ length: 5 }, () => ({ home: "", away: "" }));
export function analyzeSets(sets, rules = [25, 25, 25, 25, 15]) {
  const errors = [];
  let homeWins = 0;
  let awayWins = 0;
  let gap = false;
  if (!Array.isArray(sets) || sets.length > 5)
    return {
      errors: ["최대 5세트까지 입력할 수 있습니다."],
      homeWins,
      awayWins,
      complete: false,
    };
  sets.forEach((set, index) => {
    const h = set.home;
    const a = set.away;
    if ((h === "" || h == null) && (a === "" || a == null)) {
      gap = true;
      return;
    }
    const label = `${index + 1}세트`;
    if (homeWins === 3 || awayWins === 3) {
      errors.push(
        `${label}: 승부가 결정된 뒤에는 추가 세트를 입력할 수 없습니다.`,
      );
      return;
    }
    if (gap) errors.push(`${label}: 앞 세트부터 순서대로 입력해주세요.`);
    if (h === "" || a === "" || h == null || a == null) {
      errors.push(`${label}: 양 팀 점수를 모두 입력해주세요.`);
      return;
    }
    if (
      typeof h !== "number" ||
      typeof a !== "number" ||
      !Number.isSafeInteger(h) ||
      !Number.isSafeInteger(a) ||
      h < 0 ||
      a < 0
    ) {
      errors.push(`${label}: 0 이상의 정수를 입력해주세요.`);
      return;
    }
    const high = Math.max(h, a);
    const low = Math.min(h, a);
    const target = rules[index];
    if (!Number.isInteger(target) || target < 2) {
      errors.push(`${label}: 목표 점수 설정을 확인해주세요.`);
      return;
    }
    if (
      h === a ||
      high < target ||
      high - low < 2 ||
      (high > target && high - low !== 2)
    ) {
      errors.push(
        `${label}: ${target}점 이상, 2점 차 승리 규칙에 맞는 종료 점수가 필요합니다.`,
      );
      return;
    }
    if (h > a) homeWins++;
    else awayWins++;
  });
  return {
    errors,
    homeWins,
    awayWins,
    complete: !errors.length && (homeWins === 3 || awayWins === 3),
  };
}
export function confirmedResult(match, rules) {
  if (
    match.status !== "completed" ||
    !match.homeTeamId ||
    !match.awayTeamId ||
    match.homeTeamId === match.awayTeamId
  )
    return null;
  const result = analyzeSets(match.sets, match.rulesSnapshot || rules);
  if (!result.complete) return null;
  const winnerTeamId =
    result.homeWins === 3 ? match.homeTeamId : match.awayTeamId;
  return match.winnerTeamId === winnerTeamId
    ? { ...result, winnerTeamId }
    : null;
}
