import { Trophy } from "lucide-react";
import { useTournament } from "../context/TournamentContext";
import MatchCard from "./MatchCard";
export default function TournamentBracket({ small = false }) {
  const { data } = useTournament();
  const semis = data.matches.filter((m) => m.stage === "semifinal");
  const final = data.matches.find((m) => m.stage === "final");
  const winner = data.teams.find((t) => t.id === final.winnerTeamId);
  return (
    <div className={`bracket ${small ? "small-bracket" : ""}`}>
      <section className="bracket-round semifinal-round">
        <div className="round-label">
          <span>01</span> SEMI FINALS<small>준결승</small>
        </div>
        <div className="bracket-matches">
          {semis.map((m) => (
            <MatchCard key={m.id} match={m} compact />
          ))}
        </div>
      </section>
      <section className="bracket-round final-round">
        <div className="round-label">
          <span>02</span> THE FINAL<small>결승</small>
        </div>
        <div className="bracket-matches">
          <MatchCard match={final} compact />
        </div>
      </section>
      <section
        className={`bracket-round champion-round ${winner ? "has-champion" : ""}`}
      >
        <div className="round-label">
          <span>03</span> CHAMPION<small>우승</small>
        </div>
        <div className="champion-card">
          <div className="trophy-circle">
            <Trophy size={36} />
          </div>
          <span className="eyebrow">
            {winner ? "THE CHAMPIONS" : "WHO’S NEXT?"}
          </span>
          <h3>{winner?.name || "우승을 향한 도전"}</h3>
          <p>
            {winner
              ? "우승을 축하합니다!"
              : "마지막 휘슬의 주인공을 기다립니다."}
          </p>
        </div>
      </section>
    </div>
  );
}
