export const SPORTS = {
  volleyball: {
    key: "volleyball",
    id: "volleyball-cup",
    label: "배구",
    icon: "🏐",
    name: "VOLLEYBALL CUP",
    unit: "세트",
  },
  dodgeball: {
    key: "dodgeball",
    id: "dodgeball-cup",
    label: "피구",
    icon: "🔴",
    name: "DODGEBALL CUP",
    unit: "판",
  },
};
export function sportFromPath(path) {
  return path.split("/").includes("dodgeball")
    ? SPORTS.dodgeball
    : SPORTS.volleyball;
}
export function sportOf(data) {
  return data?.tournament?.id === "dodgeball-cup" ? "dodgeball" : "volleyball";
}
