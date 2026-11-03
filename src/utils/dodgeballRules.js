export const DODGEBALL_SCORING_VERSION = 6;
export const emptyRound = () => ({
  winner: null,
  homeRemaining: null,
  awayRemaining: null,
  manualWinner: false,
});
export const emptyRounds = () => Array.from({ length: 3 }, emptyRound);
export const roundPlayed = (r) =>
  r?.homeRemaining !== null &&
  r?.awayRemaining !== null &&
  Number.isSafeInteger(r?.homeRemaining) &&
  Number.isSafeInteger(r?.awayRemaining) &&
  r.homeRemaining >= 0 &&
  r.awayRemaining >= 0;
export const roundHasInput = (r) =>
  !!r &&
  (r.homeRemaining !== null ||
    r.awayRemaining !== null ||
    r.winner !== null ||
    r.manualWinner);
export function analyzeRounds(rounds) {
  const errors = [],
    draftErrors = [],
    setStates = [];
  let homeWins = 0,
    awayWins = 0,
    homeTotal = 0n,
    awayTotal = 0n,
    baseHomeTotal = 0n,
    baseAwayTotal = 0n;
  let winnerSide = null,
    roundsPlayed = 0,
    gap = false;
  const invalid = (message) => {
    errors.push(message);
    draftErrors.push(message);
  };
  if (!Array.isArray(rounds) || rounds.length > 3) {
    invalid("최대 3세트까지 입력할 수 있습니다.");
    rounds = [];
  }
  rounds.forEach((r, i) => {
    const label = `${i + 1}세트`;
    setStates[i] = "invalid";
    if (
      !r ||
      typeof r !== "object" ||
      Object.keys(r).sort().join(",") !==
        "awayRemaining,homeRemaining,manualWinner,winner" ||
      ![null, "home", "away"].includes(r.winner) ||
      typeof r.manualWinner !== "boolean"
    )
      return invalid(label + ": 세트 결과 형식을 확인해주세요.");
    if (
      [r.homeRemaining, r.awayRemaining].some(
        (v) => v !== null && (!Number.isSafeInteger(v) || v < 0),
      )
    )
      return invalid(
        label + ": 잔여 인원은 0 이상의 안전한 정수로 입력해주세요.",
      );
    if (!roundHasInput(r)) {
      gap = true;
      setStates[i] = "not_started";
      return;
    }
    if (gap)
      return invalid(label + ": 앞 세트부터 양 팀 잔여 인원을 입력해주세요.");
    if (i === 2 && (roundsPlayed !== 2 || baseHomeTotal !== baseAwayTotal))
      return invalid("1·2세트 합계가 같을 때만 3세트를 진행할 수 있습니다.");
    if (!roundPlayed(r)) {
      if (r.winner !== null || r.manualWinner)
        return invalid(label + ": 양 팀 잔여 인원이 필요합니다.");
      gap = true;
      setStates[i] = "in_progress";
      errors.push(label + ": 양 팀 잔여 인원을 입력해주세요.");
      return;
    }
    const h = r.homeRemaining,
      a = r.awayRemaining;
    if (
      h !== a
        ? r.manualWinner || r.winner !== (h > a ? "home" : "away")
        : i < 2
          ? r.winner !== null || r.manualWinner
          : (r.winner === null) !== !r.manualWinner
    )
      return invalid(
        label +
          ": 잔여 인원과 승리 반 또는 수동 지정 기록이 일치하지 않습니다.",
      );
    roundsPlayed++;
    homeTotal += BigInt(h);
    awayTotal += BigInt(a);
    if (i < 2) {
      baseHomeTotal += BigInt(h);
      baseAwayTotal += BigInt(a);
    }
    if (h > a) homeWins++;
    else if (a > h) awayWins++;
    setStates[i] = h === a ? "draw" : "completed";
    if (i === 1 && baseHomeTotal !== baseAwayTotal)
      winnerSide = baseHomeTotal > baseAwayTotal ? "home" : "away";
    if (i === 2) {
      winnerSide = h === a ? r.winner : h > a ? "home" : "away";
      if (!winnerSide) {
        setStates[i] = "in_progress";
        errors.push(
          "3세트 동률 · 별도 승자 확정 절차 후 최종 경기 승리 반을 지정해주세요.",
        );
      }
    }
  });
  const needsThird = roundsPlayed >= 2 && baseHomeTotal === baseAwayTotal;
  const complete = !errors.length && winnerSide !== null;
  return {
    errors,
    draftErrors,
    setStates,
    homeWins,
    awayWins,
    winnerSide,
    roundsPlayed,
    needsThird,
    baseHomeTotal: baseHomeTotal.toString(),
    baseAwayTotal: baseAwayTotal.toString(),
    homeTotal: homeTotal.toString(),
    awayTotal: awayTotal.toString(),
    homeMatchPoints: complete
      ? winnerSide === "home"
        ? needsThird
          ? 2
          : 3
        : needsThird
          ? 1
          : 0
      : 0,
    awayMatchPoints: complete
      ? winnerSide === "away"
        ? needsThird
          ? 2
          : 3
        : needsThird
          ? 1
          : 0
      : 0,
    complete,
  };
}
export function canEditRound(rounds, index) {
  if (index === 0) return true;
  const prior = analyzeRounds(rounds.slice(0, index));
  return (
    !prior.errors.length &&
    prior.roundsPlayed === index &&
    (index !== 2 || prior.needsThird)
  );
}
export function changeRound(rounds, index, patch) {
  if (!Number.isInteger(index) || index < 0 || index > 2)
    throw new Error("잘못된 세트 입력입니다.");
  if (!canEditRound(rounds, index))
    throw new Error("앞 세트부터 입력하고 1·2세트 합계를 확인해주세요.");
  const next = rounds.map((r) => ({ ...r }));
  const update =
    typeof patch === "string" || patch === null ? { winner: patch } : patch;
  const r = { ...next[index], ...update };
  if (
    Object.hasOwn(update, "homeRemaining") ||
    Object.hasOwn(update, "awayRemaining")
  ) {
    r.manualWinner = false;
    r.winner =
      !roundPlayed(r) || r.homeRemaining === r.awayRemaining
        ? null
        : r.homeRemaining > r.awayRemaining
          ? "home"
          : "away";
  } else if (Object.hasOwn(update, "winner"))
    r.manualWinner = r.winner !== null;
  next[index] = r;
  return next;
}
