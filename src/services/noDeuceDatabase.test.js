import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createInitialData } from "../data/initialTournament";
import { createDemoData } from "./tournamentStorage";
import { syncBracket } from "../utils/bracketLogic";
import { emptySets } from "../utils/matchRules";
const admin = "11111111-1111-4111-8111-111111111111";
const sql = (n) =>
  readFileSync(
    new URL(`../../supabase/migrations/${n}`, import.meta.url),
    "utf8",
  );
const v1 = "001_initial_schema.sql",
  v2 = "002_multi_sport_tournament.sql",
  v3 = "003_volleyball_no_deuce.sql";
async function setup() {
  const engine = new PGlite();
  await engine.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${admin}');`,
  );
  await engine.exec(sql(v1));
  await engine.exec(sql(v2));
  await engine.exec(
    `insert into public.tournament_admins(user_id) values('${admin}')`,
  );
  await engine.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
  return engine;
}
async function load(engine, id = "volleyball-cup") {
  return (await engine.query("select public.get_public_tournament($1) d", [id]))
    .rows[0].d;
}
async function save(engine, d, initialize = false) {
  return (
    await engine.query(
      "select public.save_tournament($1::jsonb,$2::bigint,$3::text[],$4) d",
      [
        JSON.stringify(d),
        initialize ? null : d.revision,
        d.matches.map((m) => m.id),
        initialize,
      ],
    )
  ).rows[0].d;
}
const prefix = [
  { home: 25, away: 24 },
  { home: 24, away: 25 },
  { home: 25, away: 24 },
  { home: 24, away: 25 },
];
function draftSnapshot(
  revision,
  sets,
  status = "completed",
  winner = "team-1",
) {
  const d = createInitialData();
  d.revision = revision;
  Object.assign(d.matches[0], {
    sets,
    status,
    rulesSnapshot: [25, 25, 25, 25, 15],
    winnerTeamId: status === "completed" ? winner : null,
    confirmedAt: status === "completed" ? new Date().toISOString() : null,
  });
  return syncBracket(d).data;
}
let db, beforeVolleyball, beforeDodgeball, policies;
beforeAll(async () => {
  db = await setup();
  beforeVolleyball = await save(db, createDemoData(), true);
  beforeDodgeball = await save(db, createDemoData("dodgeball"), true);
  policies = (
    await db.query(
      "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in('public','volleyball_private') order by schemaname,tablename,policyname",
    )
  ).rows;
  await db.exec(sql(v3));
}, 60000);
afterAll(async () => {
  await db?.close();
});

it("003 전후 유효한 배구·피구 기록/Revision/정책/관리자 유지·재실행", async () => {
  expect(await load(db)).toEqual(beforeVolleyball);
  expect(await load(db, "dodgeball-cup")).toEqual(beforeDodgeball);
  expect(
    (
      await db.query(
        "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname in('public','volleyball_private') order by schemaname,tablename,policyname",
      )
    ).rows,
  ).toEqual(policies);
  expect(
    (await db.query("select count(*) n from public.tournament_admins")).rows[0]
      .n,
  ).toBe(1);
  await db.exec(sql(v3));
  expect(
    (await db.query("select public.get_volleyball_scoring_version() n")).rows[0]
      .n,
  ).toBe(3);
  expect(
    (await db.query("select public.get_sports_schema_version() n")).rows[0].n,
  ).toBe(2);
  const inspection = (
    await db.query(
      readFileSync(
        new URL(
          "../../supabase/checks/volleyball_no_deuce_preflight.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    )
  ).rows[0].volleyball_no_deuce_preflight;
  expect(inspection.obvious_score_conflicts).toEqual([]);
  expect(
    inspection.score_functions.find((f) => f.name === "save_tournament")
      .security_definer,
  ).toBe(true);
  expect(
    inspection.score_functions.find((f) => f.name === "score_result"),
  ).toMatchObject({ anon_execute: false, authenticated_execute: false });
});
for (const index of [0, 4]) {
  const target = index === 4 ? 15 : 25;
  it.each([
    [target, target - 1],
    [target - 1, target],
    [target, 0],
    [0, target],
  ])(`RPC ${index + 1}세트 %s:%s 확정`, async (home, away) => {
    const current = await load(db),
      sets = emptySets();
    if (index === 4) prefix.forEach((s, i) => (sets[i] = { ...s }));
    else for (let i = 0; i < 3; i++) sets[i] = { home, away };
    if (index === 4) sets[4] = { home, away };
    const winner = home === target ? "team-1" : "team-2";
    const saved = await save(
      db,
      draftSnapshot(current.revision, sets, "completed", winner),
    );
    expect(saved.matches[0]).toMatchObject({
      status: "completed",
      winnerTeamId: winner,
    });
    expect(await load(db, "dodgeball-cup")).toEqual(beforeDodgeball);
  });
  it(`RPC ${target - 1}:${target - 1} 임시 저장 후 최종 확정 거부`, async () => {
    const current = await load(db),
      sets = emptySets();
    if (index === 4) prefix.forEach((s, i) => (sets[i] = { ...s }));
    sets[index] = { home: target - 1, away: target - 1 };
    const saved = await save(db, draftSnapshot(current.revision, sets, "live"));
    expect(saved.matches[0]).toMatchObject({
      status: "live",
      winnerTeamId: null,
    });
    await expect(save(db, draftSnapshot(saved.revision, sets))).rejects.toThrow(
      "INVALID_FINAL_SCORE",
    );
    expect((await load(db)).revision).toBe(saved.revision);
  });
  it.each([
    [target + 1, target - 1],
    [target + 1, target],
    [target, target],
  ])(`RPC ${index + 1}세트 %s:%s 임시·확정 모두 거부`, async (home, away) => {
    const current = await load(db),
      sets = emptySets();
    if (index === 4) prefix.forEach((s, i) => (sets[i] = { ...s }));
    sets[index] = { home, away };
    for (const status of ["live", "completed"])
      await expect(
        save(db, draftSnapshot(current.revision, sets, status)),
      ).rejects.toThrow("SCORE_OVER_TARGET");
    expect(await load(db)).toEqual(current);
    expect(await load(db, "dodgeball-cup")).toEqual(beforeDodgeball);
  });
}
it("RPC 3승 이후 추가 점수 거부·순위와 결선의 기존 회귀 검증 유지", async () => {
  const current = await load(db),
    sets = emptySets();
  for (let i = 0; i < 3; i++) sets[i] = { home: 25, away: 24 };
  sets[3] = { home: 1, away: 0 };
  await expect(save(db, draftSnapshot(current.revision, sets))).rejects.toThrow(
    "SCORE_AFTER_WIN",
  );
});
it("003 이후 익명/일반 사용자 쓰기 거부와 private 점수 함수 비공개 유지", async () => {
  await db.exec("set role anon");
  expect(
    (await db.query("select public.get_volleyball_scoring_version() n")).rows[0]
      .n,
  ).toBe(3);
  await expect(save(db, createInitialData(), true)).rejects.toThrow(
    "permission denied",
  );
  await expect(
    db.query("select volleyball_private.score_result('[]','[]',false)"),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await expect(save(db, createInitialData(), true)).rejects.toThrow(
    "ADMIN_REQUIRED",
  );
  await db.exec("reset role");
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
});
it.each(["completed", "live"])(
  "과거 비호환 %s 기록은 변환/삭제하지 않고 003 전체 롤백",
  async (status) => {
    const isolated = await setup();
    try {
      const d = createInitialData();
      const sets = emptySets();
      if (status === "completed") {
        sets[0] = { home: 26, away: 24 };
        sets[1] = { home: 25, away: 20 };
        sets[2] = { home: 25, away: 20 };
      } else {
        sets[0] = { home: 24, away: 24 };
        sets[1] = { home: 25, away: 20 };
      }
      const old = await save(
        isolated,
        draftSnapshot(d.revision, sets, status),
        true,
      );
      await expect(isolated.exec(sql(v3))).rejects.toThrow(
        "NO_DEUCE_EXISTING_RESULT_REVIEW_REQUIRED",
      );
      await isolated.exec("rollback");
      expect(await load(isolated)).toEqual(old);
      expect(
        (
          await isolated.query(
            "select to_regprocedure('public.get_volleyball_scoring_version()') f",
          )
        ).rows[0].f,
      ).toBeNull();
    } finally {
      await isolated.close();
    }
  },
);
