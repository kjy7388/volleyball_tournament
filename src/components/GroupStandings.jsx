import { calculateStandings } from "../utils/standings";
import { useTournament } from "../context/TournamentContext";
import { TeamAvatar } from "./MatchCard";
export default function GroupStandings({ group, mini = false }) {
  const { data, sport } = useTournament();
  const result = calculateStandings(
    data.teams,
    data.matches,
    group,
    data.tournament.setRules,
    data.manualRankings[group],
  );
  return (
    <section className={`panel standings group-panel-${group}`}>
      <div className="panel-head">
        <h3>
          <span className={`group-label group-${group}`}>{group}</span>
          {group}조 순위
        </h3>
        <span className="muted">
          {
            data.matches.filter(
              (m) => m.group === group && m.status === "completed",
            ).length
          }{" "}
          / 3 경기 종료
        </span>
      </div>
      <div className="table-wrap">
        <table className={mini ? "mini-table" : ""}>
          <thead>
            <tr>
              <th>순위</th>
              <th className="align-left">참가 반</th>
              <th>경기</th>
              <th>승</th>
              <th>패</th>
              {sport.key === "dodgeball" ? (
                <>
                  <th>승리 판</th>
                  <th>패배 판</th>
                  <th>판 득실차</th>
                </>
              ) : (
                <th>세트 득실</th>
              )}
              {!mini && (
                <>
                  {sport.key === "volleyball" && <th>득실점</th>}
                  <th>진출</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.team.id} className={r.qualified ? "qualified" : ""}>
                <td>
                  <span className={`rank rank-${r.rank}`}>
                    {r.played ? (r.tied ? "=" : r.rank) : "–"}
                  </span>
                </td>
                <td className="align-left">
                  <span className="table-team">
                    <TeamAvatar name={r.team.name} group={group} small />
                    <strong>{r.team.name}</strong>
                    {r.manuallyResolved && (
                      <small className="qualified-tag">관리자 확정</small>
                    )}
                  </span>
                </td>
                <td>{r.played}</td>
                <td className="blue">{r.wins}</td>
                <td>{r.losses}</td>
                {sport.key === "dodgeball" ? (
                  <>
                    <td>{r.setsFor}</td>
                    <td>{r.setsAgainst}</td>
                    <td>
                      {r.setDiff > 0 ? "+" : ""}
                      {r.setDiff}
                    </td>
                  </>
                ) : (
                  <td>
                    {r.setsFor}:{r.setsAgainst}{" "}
                    <small className="muted">
                      ({r.setDiff > 0 ? "+" : ""}
                      {r.setDiff})
                    </small>
                  </td>
                )}
                {!mini && (
                  <>
                    {sport.key === "volleyball" && (
                      <td>
                        {r.pointDiff > 0 ? "+" : ""}
                        {r.pointDiff}
                      </td>
                    )}
                    <td>
                      {r.qualified ? (
                        <span className="qualified-tag">진출 확정</span>
                      ) : (
                        <span className="muted">
                          {result.finished && r.tied ? "확인 필요" : "–"}
                        </span>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-foot">
        {result.finished && !result.resolved
          ? "동률 순위 · 관리자 수동 확인이 필요합니다."
          : result.resolved
            ? "각 조 1·2위가 준결승에 진출합니다."
            : "경기 결과 확정 후 순위가 자동 반영됩니다."}
      </div>
    </section>
  );
}
