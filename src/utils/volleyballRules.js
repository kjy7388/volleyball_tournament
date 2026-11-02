import {
  DEFAULT_TARGETS,
  MAX_ROUNDS,
  WINS_REQUIRED,
  usesDeuce,
} from "./competitionRules";
export const emptySets = () =>
  Array.from({ length: MAX_ROUNDS }, () => ({ home: "", away: "" }));
export function analyzeSets(sets, rules = DEFAULT_TARGETS, stage = "group") {
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
  if (!Array.isArray(sets) || sets.length > MAX_ROUNDS) {
    invalid("최대 3세트까지 입력할 수 있습니다.");
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
    const label = `${index + 1}세트`,
      target = rules?.[index];
    setStates[index] = "invalid";
    if (!set || typeof set !== "object" || Array.isArray(set))
      return invalid(`${label}: 세트 입력 형식을 확인해주세요.`);
    const { home: h, away: a } = set;
    const blank = (v) => v === "" || v == null;
    if (blank(h) && blank(a)) {
      gap = true;
      setStates[index] = "not_started";
      return;
    }
    if (homeWins === WINS_REQUIRED || awayWins === WINS_REQUIRED)
      return invalid(`${label}: 승부 이후 추가 세트를 입력할 수 없습니다.`);
    if (gap || unfinished)
      return invalid(`${label}: 앞 세트부터 순서대로 종료한 뒤 입력해주세요.`);
    if (!Number.isInteger(target) || target < 2 || target > 999)
      return invalid(`${label}: 목표 점수 설정을 확인해주세요.`);
    if (
      [h, a].some(
        (v) =>
          !blank(v) &&
          (typeof v !== "number" || !Number.isSafeInteger(v) || v < 0),
      )
    )
      return invalid(`${label}: 0 이상의 정수를 입력해주세요.`);
    if (
      !usesDeuce(stage) &&
      ((!blank(h) && h > target) ||
        (!blank(a) && a > target) ||
        (h === target && a === target))
    )
      return invalid(
        `${label}: 조별리그는 목표 ${target}점 초과 또는 양 팀 도달이 불가능합니다.`,
      );
    const high = Math.max(h, a),
      low = Math.min(h, a);
    if (
      usesDeuce(stage) &&
      !blank(h) &&
      !blank(a) &&
      high > target &&
      high - low > 2
    )
      return invalid(`${label}: 이미 종료된 듀스 점수를 초과했습니다.`);
    const ended =
      !blank(h) &&
      !blank(a) &&
      (usesDeuce(stage)
        ? high >= target && high - low >= 2
        : high === target && low < target);
    if (!ended) {
      unfinished = true;
      setStates[index] = "in_progress";
      errors.push(
        `${label}: 진행 중인 임시 점수입니다. ${usesDeuce(stage) ? `${target}점 이상, 2점 차 승리가 필요합니다.` : `한쪽만 목표 ${target}점에 도달해야 합니다.`}`,
      );
      return;
    }
    setStates[index] = "completed";
    if (h > a) homeWins++;
    else awayWins++;
  });
  return {
    errors,
    draftErrors,
    setStates,
    homeWins,
    awayWins,
    complete:
      !errors.length &&
      (homeWins === WINS_REQUIRED || awayWins === WINS_REQUIRED),
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
  const result = analyzeSets(
    match.sets,
    match.rulesSnapshot || rules,
    match.stage,
  );
  const winnerTeamId =
    result.homeWins === WINS_REQUIRED ? match.homeTeamId : match.awayTeamId;
  return result.complete && winnerTeamId === match.winnerTeamId
    ? { ...result, winnerTeamId }
    : null;
}
