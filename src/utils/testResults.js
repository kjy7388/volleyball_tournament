// Test fixtures shared by unit/DB/browser simulations; not imported by app code.
export function roundResult(winner, margin = 4) {
  return winner === null
    ? {
        winner: null,
        homeRemaining: null,
        awayRemaining: null,
        manualWinner: false,
      }
    : {
        winner,
        homeRemaining: winner === "home" ? 7 : 7 - margin,
        awayRemaining: winner === "away" ? 7 : 7 - margin,
        manualWinner: false,
      };
}
export const roundResults = (sequence) =>
  Array.from({ length: 3 }, (_, i) => roundResult(sequence[i] ?? null));
