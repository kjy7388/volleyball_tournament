export const emptyRound = () => ({
  winner: null,
  homeRemaining: null,
  awayRemaining: null,
  manualWinner: false,
});
export const emptyRounds = () => Array.from({ length: 3 }, emptyRound);
export function analyzeRounds(rounds) {
  const errors = [],
    draftErrors = [],
    setStates = [];
  let homeWins = 0,
    awayWins = 0,
    gap = false,
    unfinished = false;
  const invalid = (m) => {
    errors.push(m);
    draftErrors.push(m);
  };
  if (!Array.isArray(rounds) || rounds.length > 3)
    return {
      errors: ["최대 3판까지 입력할 수 있습니다."],
      draftErrors: ["최대 3판까지 입력할 수 있습니다."],
      setStates,
      homeWins,
      awayWins,
      complete: false,
    };
  rounds.forEach((r, i) => {
    const label = i + 1 + "판";
    setStates[i] = "invalid";
    if (
      !r ||
      typeof r !== "object" ||
      Object.keys(r).sort().join(",") !==
        "awayRemaining,homeRemaining,manualWinner,winner" ||
      ![null, "home", "away"].includes(r.winner) ||
      typeof r.manualWinner !== "boolean"
    )
      return invalid(label + ": 판 결과 형식을 확인해주세요.");
    const h = r.homeRemaining,
      a = r.awayRemaining;
    if (
      [h, a].some(
        (v) => v !== null && (!Number.isInteger(v) || v < 0 || v > 10),
      )
    )
      return invalid(label + ": 잔여 인원은 0~10의 정수입니다.");
    if (h === null && a === null && r.winner === null && !r.manualWinner) {
      gap = true;
      setStates[i] = "not_started";
      return;
    }
    if (homeWins === 2 || awayWins === 2)
      return invalid(label + ": 승부 이후 추가 판은 입력할 수 없습니다.");
    if (gap || unfinished)
      return invalid(label + ": 앞 판부터 순서대로 종료해주세요.");
    if (h === null || a === null) {
      if (r.winner !== null || r.manualWinner)
        return invalid(label + ": 양 팀 잔여 인원이 필요합니다.");
      unfinished = true;
      setStates[i] = "in_progress";
      errors.push(label + ": 양 팀 잔여 인원을 입력해주세요.");
      return;
    }
    if (h === a && r.winner === null && !r.manualWinner) {
      unfinished = true;
      setStates[i] = "in_progress";
      errors.push(
        label +
          ": 승부 미결정 · 연장전 또는 재경기 후 최종 승리 반을 지정해주세요.",
      );
      return;
    }
    if (
      h === a
        ? !r.manualWinner || r.winner === null
        : r.manualWinner || r.winner !== (h > a ? "home" : "away")
    )
      return invalid(
        label +
          ": 잔여 인원과 승리 반 또는 동률 수동 지정 기록이 일치하지 않습니다.",
      );
    setStates[i] = "completed";
    if (r.winner === "home") homeWins++;
    else awayWins++;
  });
  return {
    errors,
    draftErrors,
    setStates,
    homeWins,
    awayWins,
    complete: !errors.length && (homeWins === 2 || awayWins === 2),
  };
}
export function changeRound(rounds, index, patch) {
  if (!Number.isInteger(index) || index < 0 || index > 2)
    throw new Error("잘못된 판 입력입니다.");
  const prior = analyzeRounds(rounds.slice(0, index));
  if (
    prior.errors.length ||
    prior.homeWins === 2 ||
    prior.awayWins === 2 ||
    rounds.slice(0, index).some((r) => r.winner === null)
  )
    throw new Error("앞 판부터 입력해주세요.");
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
      r.homeRemaining === null ||
      r.awayRemaining === null ||
      r.homeRemaining === r.awayRemaining
        ? null
        : r.homeRemaining > r.awayRemaining
          ? "home"
          : "away";
  } else if (Object.hasOwn(update, "winner"))
    r.manualWinner = r.winner !== null;
  next[index] = r;
  return next;
}
