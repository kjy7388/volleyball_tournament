import { calculateStandings } from "../utils/standings";
import { formatRatio } from "../utils/competitionRules";
import { useTournament } from "../context/TournamentContext";
import { TeamAvatar } from "./MatchCard";
export default function GroupStandings({ group }) {
  const { data, sport } = useTournament();
  const result = calculateStandings(
    data.teams,
    data.matches,
    group,
    data.tournament.setRules,
    data.manualRankings[group],
  );
  const dodge = sport.key === "dodgeball";
  const metrics = (r) => [
    ["경기", r.played],
    ["승", r.wins],
    ["패", r.losses],
    ["승점", r.matchPoints],
    [dodge ? "승리 판" : "승리 세트", r.setsFor],
    [dodge ? "패배 판" : "패배 세트", r.setsAgainst],
    ["세트득실률", formatRatio(r.setsFor, r.setsAgainst)],
    ...(dodge
      ? [["잔여 인원수 차", r.remainingDiff]]
      : [
          ["득점", r.pointsFor],
          ["실점", r.pointsAgainst],
          ["점수득실률", formatRatio(r.pointsFor, r.pointsAgainst)],
        ]),
  ];
  return (
    <section className={"panel standings group-panel-" + group}>
      <div className="panel-head">
        <h3>
          <span className={"group-label group-" + group}>{group}</span>
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
        <table>
          <thead>
            <tr>
              <th>순위</th>
              <th className="align-left">참가 반</th>
              <th className="standing-extra">경기</th>
              <th className="standing-extra">승</th>
              <th className="standing-extra">패</th>
              <th>승점</th>
              <th className="standing-extra">
                {dodge ? "승리 판" : "승리 세트"}
              </th>
              <th className="standing-extra">
                {dodge ? "패배 판" : "패배 세트"}
              </th>
              <th>세트득실률</th>
              {dodge ? (
                <th className="standing-extra">잔여 인원수 차</th>
              ) : (
                <>
                  <th className="standing-extra">득점</th>
                  <th className="standing-extra">실점</th>
                  <th className="standing-extra">점수득실률</th>
                </>
              )}
              <th>진출</th>
            </tr>
          </thead>
          <tbody>
            {result.rows.map((r) => (
              <tr key={r.team.id} className={r.qualified ? "qualified" : ""}>
                <td>
                  <span className={"rank rank-" + r.rank}>
                    {r.played ? (r.tied ? "=" : r.rank) : "–"}
                  </span>
                </td>
                <td className="align-left">
                  <span className="table-team">
                    <TeamAvatar name={r.team.name} group={group} small />
                    <strong>{r.team.name}</strong>
                  </span>
                  {r.manuallyResolved && (
                    <small className="qualified-tag">관리자 확정</small>
                  )}
                  <details className="standing-mobile-details">
                    <summary>상세 기록</summary>
                    <dl>
                      {metrics(r).map(([label, value]) => (
                        <div key={label}>
                          <dt>{label}</dt>
                          <dd>{String(value)}</dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                </td>
                <td className="standing-extra">{r.played}</td>
                <td className="standing-extra">{r.wins}</td>
                <td className="standing-extra">{r.losses}</td>
                <td className="standing-points">
                  <strong>{r.matchPoints}</strong>
                </td>
                <td className="standing-extra">{r.setsFor}</td>
                <td className="standing-extra">{r.setsAgainst}</td>
                <td>{formatRatio(r.setsFor, r.setsAgainst)}</td>
                {dodge ? (
                  <td className="standing-extra">
                    {r.remainingDiff > 0 ? "+" : ""}
                    {r.remainingDiff}
                  </td>
                ) : (
                  <>
                    <td className="standing-extra">{r.pointsFor}</td>
                    <td className="standing-extra">{r.pointsAgainst}</td>
                    <td className="standing-extra">
                      {formatRatio(r.pointsFor, r.pointsAgainst)}
                    </td>
                  </>
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
            : "경기 결과 확정 후 승점과 순위가 자동 반영됩니다."}
      </div>
    </section>
  );
}
