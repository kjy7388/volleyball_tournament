export const stageLabel = (m) =>
  m.stage === "group"
    ? `${m.group}조 예선`
    : m.stage === "semifinal"
      ? `준결승 ${m.id === "sf-1" ? 1 : 2}`
      : "결승";
export const statusLabel = {
  scheduled: "예정",
  live: "진행 중",
  completed: "종료",
};
export function teamLabel(data, match, side) {
  const team = data.teams.find((t) => t.id === match[`${side}TeamId`]);
  if (team) return team.name;
  const labels = {
    "sf-1": ["A조 1위", "B조 2위"],
    "sf-2": ["B조 1위", "A조 2위"],
    final: ["준결승 1 승자", "준결승 2 승자"],
  };
  return labels[match.id]?.[side === "home" ? 0 : 1] || "편성 대기";
}
export function matchDate(m) {
  if (!m.scheduledAt)
    return `${m.exampleDate || "일정 미정"} · 예시 / 시간 미정`;
  return new Date(m.scheduledAt).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
export function nextMatch(data) {
  return [...data.matches]
    .filter((m) => m.status !== "completed")
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === "live" ? -1 : 1;
      return (
        (a.scheduledAt || "9999").localeCompare(b.scheduledAt || "9999") ||
        a.number - b.number
      );
    })[0];
}
export function tournamentDates(t) {
  if (!t.startDate) return "11.24 – 12.14 · 예시 일정";
  return `${t.startDate.replaceAll("-", ".")} – ${t.endDate?.replaceAll("-", ".") || "종료일 미정"}`;
}
