export const FORMAT_VERSION = 4;
export const MAX_ROUNDS = 3;
export const WINS_REQUIRED = 2;
export const MATCH_PLAYER_COUNT = 10;
export const DEFAULT_TARGETS = [15, 15, 15];
export const usesDeuce = (stage = "group") =>
  ["semifinal", "final"].includes(stage);
export function matchPoints(won, lost) {
  return won === 2 ? (lost === 0 ? 3 : 2) : lost === 2 && won === 1 ? 1 : 0;
}
// 0/0 is unrecorded, n/0 is undefeated. No Infinity/NaN enters snapshots.
export function compareRatio(an, ad, bn, bd) {
  const a = [BigInt(an), BigInt(ad)],
    b = [BigInt(bn), BigInt(bd)];
  const kind = ([n, d]) => (d === 0n ? (n > 0n ? 2 : 0) : 1);
  const ak = kind(a),
    bk = kind(b);
  if (ak !== bk) return ak > bk ? 1 : -1;
  if (ak !== 1) return 0;
  const difference = a[0] * b[1] - b[0] * a[1];
  return difference > 0n ? 1 : difference < 0n ? -1 : 0;
}
export function formatRatio(numerator, denominator) {
  const n = BigInt(numerator),
    d = BigInt(denominator);
  if (d === 0n) return n === 0n ? "—" : "무패";
  const rounded = (n * 1000n + d / 2n) / d;
  return `${rounded / 1000n}.${String(rounded % 1000n).padStart(3, "0")}`;
}
