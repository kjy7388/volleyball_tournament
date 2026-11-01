export const INTRO_TITLE = "화곡중학교 배구·피구 대진표";
export default function TournamentIntro() {
  return (
    <span className="tournament-intro">
      <span className="intro-label">SPORTS TOURNAMENT</span>
      <strong className="intro-title">{INTRO_TITLE}</strong>
      <span className="intro-subtitle">3학년 전환기 프로그램</span>
      <span className="intro-slogan">CLASS TOGETHER. PLAY TOGETHER.</span>
    </span>
  );
}
