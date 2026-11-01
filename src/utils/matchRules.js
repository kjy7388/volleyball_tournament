export const emptySets = () =>
  Array.from({ length: 5 }, () => ({ home: "", away: "" }));
// errors block final confirmation; draftErrors also block temporary persistence.
// In-progress scores never award a set win.
export function analyzeSets(sets, rules = [25, 25, 25, 25, 15]) {
  const errors = [],
    draftErrors = [],
    setStates = [];
  let homeWins = 0,
    awayWins = 0,
    gap = false,
    unfinished = false;
  const invalid = (message) => {
    errors.push(message);
    draftErrors.push(message);
  };
  if (!Array.isArray(sets) || sets.length > 5) {
    invalid("최대 5세트까지 입력할 수 있습니다.");
    return {
      errors,
      draftErrors,
      setStates,
      homeWins,
      awayWins,
      complete: false,
    };
  }
  sets.forEach((set, index) => {
    const label = `${index + 1}세트`;
    setStates[index] = "invalid";
    if (!set || typeof set !== "object" || Array.isArray(set)) {
      invalid(`${label}: 세트 입력 형식을 확인해주세요.`);
      return;
    }
    const { home: h, away: a } = set;
    const blank = (value) => value === "" || value == null;
    if (blank(h) && blank(a)) {
      gap = true;
      setStates[index] = "not_started";
      return;
    }
    if (homeWins === 3 || awayWins === 3) {
      invalid(`${label}: 승부가 결정된 뒤에는 추가 세트를 입력할 수 없습니다.`);
      return;
    }
    if (gap || unfinished) {
      invalid(`${label}: 앞 세트부터 순서대로 종료한 뒤 입력해주세요.`);
      return;
    }
    const target = rules?.[index];
    if (!Number.isInteger(target) || target < 2 || target > 999) {
      invalid(`${label}: 목표 점수 설정을 확인해주세요.`);
      return;
    }
    if (
      [h, a].some(
        (value) =>
          !blank(value) &&
          (typeof value !== "number" ||
            !Number.isSafeInteger(value) ||
            value < 0),
      )
    ) {
      invalid(`${label}: 0 이상의 정수를 입력해주세요.`);
      return;
    }
    if (
      (!blank(h) && h > target) ||
      (!blank(a) && a > target) ||
      (h === target && a === target)
    ) {
      invalid(
        `${label}: 목표 ${target}점을 초과하거나 양 팀이 모두 도달할 수 없습니다. 듀스는 없습니다.`,
      );
      return;
    }
    if (blank(h) || blank(a) || (h < target && a < target)) {
      unfinished = true;
      setStates[index] = "in_progress";
      errors.push(
        `${label}: 진행 중인 임시 점수입니다. 최종 세트는 한쪽만 목표 ${target}점에 도달해야 합니다.`,
      );
      return;
    }
    setStates[index] = "completed";
    if (h === target) homeWins++;
    else awayWins++;
  });
  return {
    errors,
    draftErrors,
    setStates,
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
