import { Link } from "react-router-dom";
import {
  ArrowUpRight,
  CalendarDays,
  MapPin,
  Trophy,
  Flag,
  CircleCheck,
  Timer,
  Users,
  ArrowRight,
} from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import { SectionTitle, Stats, Empty } from "../components/Common";
import MatchCard from "../components/MatchCard";
import GroupStandings from "../components/GroupStandings";
import { nextMatch, tournamentDates } from "../utils/display";
import { calculateStandings } from "../utils/standings";
export default function Home() {
  const { sport, data } = useTournament();
  const done = data.matches.filter((m) => m.status === "completed");
  const next = nextMatch(data);
  const recent = [...done]
    .sort((a, b) => b.confirmedAt.localeCompare(a.confirmedAt))
    .slice(0, 2);
  const final = data.matches.find((m) => m.id === "final");
  const winner = data.teams.find((t) => t.id === final.winnerTeamId);
  return (
    <>
      <section className={`hero ${winner ? "champion-hero" : ""}`}>
        <div className="hero-copy">
          <span className="hero-tag">
            <span />
            {winner
              ? "CHAMPIONS CROWNED"
              : data.isDemo
                ? "DEMO TOURNAMENT"
                : "OUR CLASS. OUR COURT."}
          </span>
          <h1>
            {winner ? (
              <>
                <span>올해의 챔피언</span>
                <br />
                {winner.name}
                <Trophy className="inline-trophy" />
              </>
            ) : (
              <>{sport.label} 대회 현황</>
            )}
          </h1>
          <p>
            {winner
              ? `${data.tournament.name} 우승을 축하합니다!`
              : `6개의 반, 하나의 코트. 함께 뛰고, 함께 응원하는 ${sport.label}대회.`}
          </p>
          <div className="hero-meta">
            <span>
              <CalendarDays size={16} />
              {tournamentDates(data.tournament)}
            </span>
            <span>
              <MapPin size={16} />
              {[
                ...new Set(
                  Object.values(data.tournament.locations).filter(Boolean),
                ),
              ].join(" · ")}
            </span>
          </div>
          <Link
            className="button hero-button"
            to={`/${sport.key}${winner ? "/bracket" : "/schedule"}`}
          >
            {winner ? "우승 여정 보기" : "경기 일정 확인"}
            <ArrowUpRight size={17} />
          </Link>
        </div>
        <div className="hero-art" aria-hidden="true">
          <div className="court-line court-one" />
          <div className="court-line court-two" />
          <div className="ball-orbit" />
          <div className="volley-ball">
            <svg viewBox="0 0 300 300">
              <defs>
                <radialGradient id="ball">
                  <stop stopColor="#fff" />
                  <stop offset="1" stopColor="#c8dcff" />
                </radialGradient>
                <clipPath id="clip">
                  <circle cx="150" cy="150" r="122" />
                </clipPath>
              </defs>
              <circle cx="150" cy="150" r="122" fill="url(#ball)" />
              <g
                clipPath="url(#clip)"
                fill="none"
                stroke="#2862ca"
                strokeWidth="31"
              >
                <path d="M111 19C68 91 93 134 129 159S221 187 285 147" />
                <path d="M175 30c-22 51-14 84 26 121M126 157C99 204 110 253 144 283M26 179c23 2 57-1 87-17" />
                <path d="M32 94c11 51 34 75 66 84M171 179c22 30 60 40 103 31" />
              </g>
              <circle
                cx="150"
                cy="150"
                r="122"
                fill="none"
                stroke="#ffffffaa"
                strokeWidth="2"
              />
            </svg>
          </div>
          <div className="hero-art-caption">
            VOLLEYBALL<span>CUP</span>
          </div>
          <span className="art-coordinates">
            6 CLASSES / 9 MATCHES / 1 CHAMPION
          </span>
        </div>
        <div className="hero-bottom">
          <strong>{data.tournament.name}</strong>
          <span>
            THE COURT IS OURS <ArrowRight size={15} />
          </span>
        </div>
      </section>
      <Stats
        items={[
          {
            label: "참가 반",
            value: data.teams.length,
            sub: "개 반",
            icon: Users,
          },
          { label: "전체 경기", value: data.matches.length, icon: Flag },
          { label: "종료된 경기", value: done.length, icon: CircleCheck },
          {
            label: "남은 경기",
            value: data.matches.length - done.length,
            icon: Timer,
          },
        ]}
      />
      <div className="home-grid">
        <section>
          <SectionTitle
            title="코트 위의 다음 순간"
            sub="다음 경기와 가장 최근의 결과를 확인하세요."
            to={`/${sport.key}/schedule`}
          />
          {next ? (
            <MatchCard match={next} />
          ) : (
            <div className="panel all-done">
              <Trophy size={32} />
              <h3>모든 경기가 끝났습니다</h3>
              <p>함께 뛰어준 모든 반에 박수를 보냅니다.</p>
            </div>
          )}
          <SectionTitle title="최근 경기 결과" />
          {recent.length ? (
            <div className="recent-grid">
              {recent.map((m) => (
                <MatchCard key={m.id} match={m} compact />
              ))}
            </div>
          ) : (
            <Empty>
              아직 종료된 경기가 없습니다.
              <br />
              <small>첫 경기가 끝나면 이곳에서 결과를 확인할 수 있어요.</small>
            </Empty>
          )}
        </section>
        <aside className="journey-panel">
          <span className="eyebrow">ROAD TO THE TROPHY</span>
          <h2>우승까지, 한 걸음씩.</h2>
          {[
            [
              "01",
              "조별리그",
              `${done.filter((m) => m.stage === "group").length} / 6 경기 종료`,
              `/${sport.key}/groups`,
            ],
            [
              "02",
              "준결승",
              `${done.filter((m) => m.stage === "semifinal").length} / 2 경기 종료`,
              `/${sport.key}/bracket`,
            ],
            [
              "03",
              "결승",
              winner ? `${winner.name} 우승` : "최후의 두 팀을 기다립니다",
              `/${sport.key}/bracket`,
            ],
          ].map(([num, title, desc, to]) => (
            <Link className="journey-step" to={to} key={num}>
              <span>{num}</span>
              <div>
                <strong>{title}</strong>
                <small>{desc}</small>
              </div>
              <ArrowUpRight size={17} />
            </Link>
          ))}
          <div className="leaders">
            <span>현재 조별 선두</span>
            {["A", "B"].map((g) => {
              const r = calculateStandings(
                data.teams,
                data.matches,
                g,
                data.tournament.setRules,
                data.manualRankings[g],
              );
              return (
                <strong key={g}>
                  {g}조{" "}
                  <span>
                    {r.rows[0]?.played && !r.rows[0].tied
                      ? r.rows[0].team.name
                      : "순위 대기"}
                  </span>
                </strong>
              );
            })}
          </div>
        </aside>
      </div>
      <section>
        <SectionTitle
          title="조별리그 순위"
          sub="각 조 상위 2개 반이 준결승에 진출합니다."
          to={`/${sport.key}/groups`}
        />
        <div className="two-columns">
          <GroupStandings group="A" mini />
          <GroupStandings group="B" mini />
        </div>
      </section>
    </>
  );
}
