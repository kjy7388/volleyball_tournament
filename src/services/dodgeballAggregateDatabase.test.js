import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createInitialData } from "../data/initialTournament";
import { createDemoData, planMatchUpdate } from "./tournamentStorage";
import { analyzeRounds, emptyRound } from "../utils/dodgeballRules";
import { calculateStandings } from "../utils/standings";
const admin = "11111111-1111-4111-8111-111111111111";
const sql = (n) =>
  readFileSync(
    new URL(`../../supabase/migrations/${n}`, import.meta.url),
    "utf8",
  );
const upgrade = () => sql("006_dodgeball_aggregate_survivors.sql");
async function setup(latest = true) {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${admin}');`,
  );
  for (const n of [
    "001_initial_schema.sql",
    "002_multi_sport_tournament.sql",
    "003_volleyball_no_deuce.sql",
    "004_three_set_points_and_survivors.sql",
    "005_unlimited_roster_registration.sql",
  ])
    await db.exec(sql(n));
  await db.exec(
    `insert into public.tournament_admins values('${admin}',now());`,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
  if (latest) await db.exec(upgrade());
  return db;
}
const load = async (db, id = "dodgeball-cup") =>
  (await db.query("select public.get_public_tournament($1) d", [id])).rows[0].d;
const save = async (db, d, init = false, ack = []) =>
  (
    await db.query("select public.save_tournament($1,$2,$3,$4) d", [
      JSON.stringify(d),
      init ? null : d.revision,
      ack,
      init,
    ])
  ).rows[0].d;
const r = (h, a, w = null) => ({
  homeRemaining: h,
  awayRemaining: a,
  winner: h === a ? w : h > a ? "home" : "away",
  manualWinner: h === a && w !== null,
});
let db;
beforeAll(async () => {
  db = await setup();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it.each([
  [r(7, 3), r(2, 5), emptyRound()],
  [r(7, 3), r(3, 7), r(4, 1)],
  [r(7, 3), r(3, 7), r(1, 4)],
  [r(5, 5), r(7, 3), emptyRound()],
  [r(5, 5), r(5, 5), r(3, 3, "home")],
  [r(5, 5), r(5, 5), r(3, 3, "away")],
  [r(15, 11), r(20, 21), emptyRound()],
  [r(Number.MAX_SAFE_INTEGER, 0), r(Number.MAX_SAFE_INTEGER, 0), emptyRound()],
])("JS/SQL 판정·승점·정밀 합계 일치 %j", async (...rounds) => {
  const result = (
    await db.query("select volleyball_private.round_result($1,true) r", [
      JSON.stringify(rounds),
    ])
  ).rows[0].r;
  const js = analyzeRounds(rounds);
  for (const key of Object.keys(result))
    expect(result[key], key).toEqual(js[key]);
});
it.each([
  [r(7, 3), r(7, 3), r(1, 0)],
  [r(5, 5), r(5, 5), r(3, 3)],
  [r(5, 5, "home"), r(7, 3), emptyRound()],
  [{ ...r(7, 3), homeRemaining: -1 }, r(7, 3), emptyRound()],
  [{ ...r(7, 3), homeRemaining: "7" }, r(7, 3), emptyRound()],
  [{ ...r(7, 3), homeRemaining: 1.5 }, r(7, 3), emptyRound()],
])("잘못된 최종 결과 SQL 거부 %j", async (...rounds) => {
  await expect(
    db.query("select volleyball_private.round_result($1,true)", [
      JSON.stringify(rounds),
    ]),
  ).rejects.toThrow();
});
it("9경기 저장·조별 순위 일치·배구 독립·006 재실행 보존", async () => {
  for (const sport of ["volleyball", "dodgeball"]) {
    const d = await save(db, createDemoData(sport), true);
    expect(d.matches.every((m) => m.status === "completed")).toBe(true);
    for (const group of ["A", "B"]) {
      const rank = (
        await db.query("select volleyball_private.group_rank($1,$2) r", [
          JSON.stringify(d),
          group,
        ])
      ).rows[0].r;
      expect(rank.ids).toEqual(
        calculateStandings(
          d.teams,
          d.matches,
          group,
          d.tournament.setRules,
        ).rows.map((x) => x.team.id),
      );
      expect(rank.resolved).toBe(true);
    }
  }
  const before = [await load(db), await load(db, "volleyball-cup")];
  await db.exec(upgrade());
  expect([await load(db), await load(db, "volleyball-cup")]).toEqual(before);
});
it("확정 수정·취소·미확인 결선 보호·Revision 충돌·RLS", async () => {
  const d = await load(db);
  const plan = planMatchUpdate(
    d,
    "g-A-1",
    [r(3, 7), r(3, 7), emptyRound()],
    "confirm",
  );
  await expect(save(db, plan.data)).rejects.toThrow("ACK_REQUIRED");
  const changed = await save(db, plan.data, false, ["g-A-1", ...plan.affected]);
  await expect(
    save(db, plan.data, false, ["g-A-1", ...plan.affected]),
  ).rejects.toThrow("REVISION_CONFLICT");
  const draft = planMatchUpdate(
    changed,
    "g-A-1",
    [r(3, 7), r(3, 7), emptyRound()],
    "draft",
  );
  const canceled = await save(db, draft.data, false, [
    "g-A-1",
    ...draft.affected,
  ]);
  expect(canceled.matches[0].winnerTeamId).toBeNull();
  expect(canceled.matches[0].status).toBe("live");
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    await expect(save(db, canceled)).rejects.toThrow(
      /permission denied|ADMIN_REQUIRED/,
    );
    await expect(
      db.query("select * from public.tournament_admins"),
    ).rejects.toThrow();
    await db.exec("reset role");
  }
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
});
it("실패 시 원자적 롤백·상한 제거 후 숫자 무결성 유지", async () => {
  const before = await load(db);
  const broken = structuredClone(before);
  broken.teams[0].name = "저장되면 안 됨";
  broken.matches[0].rounds[0].homeRemaining = -1;
  await expect(save(db, broken, false, ["g-A-1"])).rejects.toThrow();
  expect(await load(db)).toEqual(before);
  for (const value of ["-1", "0.5", "9007199254740992"])
    await expect(
      db.query(
        `update public.match_rounds set home_remaining=${value} where tournament_id='dodgeball-cup' and match_id='g-A-1' and round_number=1`,
      ),
    ).rejects.toThrow();
});
it("혼합 합산 결과의 RPC 저장·수동 경기 승자·JS/SQL 순위·결선 연동", async () => {
  let d = await load(db);
  const scenarios = [
    [r(7, 3), r(2, 5), emptyRound()],
    [r(1, 5), r(5, 1), r(2, 2, "away")],
    [r(5, 5), r(4, 2), emptyRound()],
    [r(7, 3), r(3, 7), r(3, 2)],
    [r(12, 1), r(0, 2), emptyRound()],
    [r(5, 5), r(3, 3), r(2, 2, "home")],
  ];
  for (let i = 0; i < 6; i++) {
    const plan = planMatchUpdate(d, d.matches[i].id, scenarios[i], "confirm");
    d = await save(
      db,
      plan.data,
      false,
      d.matches.map((m) => m.id),
    );
  }
  for (const g of ["A", "B"]) {
    const rank = (
      await db.query("select volleyball_private.group_rank($1,$2) r", [
        JSON.stringify(d),
        g,
      ])
    ).rows[0].r;
    const js = calculateStandings(d.teams, d.matches, g, null);
    expect(rank.ids).toEqual(js.rows.map((x) => x.team.id));
    expect(rank.resolved).toBe(js.resolved);
  }
  expect(d.matches[1].winnerTeamId).toBe(d.matches[1].awayTeamId);
  expect(analyzeRounds(d.matches[1].rounds)).toMatchObject({
    homeWins: 1,
    awayWins: 1,
    winnerSide: "away",
  });
  for (const id of ["sf-1", "sf-2", "final"]) {
    const plan = planMatchUpdate(
      d,
      id,
      [r(5, 5), r(7, 3), emptyRound()],
      "confirm",
    );
    d = await save(
      db,
      plan.data,
      false,
      d.matches.map((m) => m.id),
    );
  }
  expect(d.tournament.status).toBe("completed");
});
it("비호환 과거 3판 결과는 006 전체 중단·기록·함수 보존", async () => {
  const legacy = await setup(false);
  try {
    const d = createInitialData("dodgeball");
    Object.assign(d.matches[0], {
      rounds: [r(7, 3), r(3, 6), r(7, 3)],
      status: "completed",
      winnerTeamId: "team-1",
      confirmedAt: new Date().toISOString(),
    });
    d.tournament.status = "ongoing";
    const before = await save(legacy, d, true);
    const old = (
      await legacy.query(
        "select prosrc from pg_proc where oid='volleyball_private.round_result(jsonb,boolean)'::regprocedure",
      )
    ).rows[0].prosrc;
    await expect(legacy.exec(upgrade())).rejects.toThrow(
      "006_INCOMPATIBLE_DODGEBALL_DATA",
    );
    await legacy.exec("rollback");
    expect(await load(legacy)).toEqual(before);
    expect(
      (
        await legacy.query(
          "select prosrc from pg_proc where oid='volleyball_private.round_result(jsonb,boolean)'::regprocedure",
        )
      ).rows[0].prosrc,
    ).toBe(old);
    expect(
      (
        await legacy.query(
          "select to_regprocedure('public.get_dodgeball_scoring_version()') p",
        )
      ).rows[0].p,
    ).toBeNull();
  } finally {
    await legacy.close();
  }
}, 60000);
