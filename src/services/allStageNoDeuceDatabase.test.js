import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createDemoData, planMatchUpdate } from "./tournamentStorage";
import { calculateStandings } from "../utils/standings";
const admin = "11111111-1111-4111-8111-111111111111";
const sql = (name) =>
  readFileSync(
    new URL(`../../supabase/migrations/${name}`, import.meta.url),
    "utf8",
  );
const upgrade = () => sql("007_volleyball_no_deuce_all_stages.sql");
const preflight = () =>
  readFileSync(
    new URL(
      "../../supabase/checks/volleyball_no_deuce_all_stages_preflight.sql",
      import.meta.url,
    ),
    "utf8",
  );
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${admin}');`,
  );
  for (const name of [
    "001_initial_schema.sql",
    "002_multi_sport_tournament.sql",
    "003_volleyball_no_deuce.sql",
    "004_three_set_points_and_survivors.sql",
    "005_unlimited_roster_registration.sql",
    "006_dodgeball_aggregate_survivors.sql",
  ])
    await db.exec(sql(name));
  await db.exec(
    `insert into public.tournament_admins values('${admin}',now());`,
  );
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
    admin,
  ]);
  return db;
}
const load = async (db, id = "volleyball-cup") =>
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
const score = (h, a) => [
  { home: h, away: a },
  { home: h, away: a },
  { home: "", away: "" },
];
async function fingerprints(db) {
  const result = {};
  for (const table of [
    "public.tournaments",
    "public.teams",
    "public.players",
    "public.matches",
    "public.match_sets",
    "public.match_rounds",
    "public.tournament_admins",
    "volleyball_private.tournament_history",
    "volleyball_private.rule_upgrade_backups",
  ])
    result[table] = (
      await db.query(
        `select md5(coalesce(jsonb_agg(to_jsonb(q)order by to_jsonb(q)::text)::text,'[]')) h from ${table} q`,
      )
    ).rows[0].h;
  result.policies = (
    await db.query(
      "select md5(jsonb_agg(to_jsonb(p)order by schemaname,tablename,policyname)::text) h from pg_policies p",
    )
  ).rows[0].h;
  for (const name of [
    "public.save_tournament(jsonb,bigint,text[],boolean)",
    "volleyball_private.round_result(jsonb,boolean)",
    "volleyball_private.validate_snapshot(jsonb)",
    "public.is_tournament_admin()",
  ])
    result[name] = (
      await db.query("select pg_get_functiondef($1::regprocedure) def", [name])
    ).rows[0].def;
  return result;
}
let db;
beforeAll(async () => {
  db = await setup();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("007은 모든 운영 행·선수 순서·확정 상태·승점·순위·대진·Revision·감사 이력·RLS·피구 보존", async () => {
  let v = await save(db, createDemoData(), true);
  const d = await save(db, createDemoData("dodgeball"), true);
  v = await save(
    db,
    v,
    false,
    v.matches.map((m) => m.id),
  );
  const before = await fingerprints(db);
  const ranks = calculateStandings(
    v.teams,
    v.matches,
    "A",
    v.tournament.setRules,
  );
  const inspection = (await db.query(preflight())).rows[0]
    .volleyball_all_stages_preflight;
  expect(inspection.obvious_score_conflicts).toEqual([]);
  expect(inspection.completed_knockouts).toHaveLength(3);
  expect(
    inspection.functions.some(
      (f) => f.name === "save_tournament" && f.security_definer,
    ),
  ).toBe(true);
  expect(JSON.stringify(inspection)).not.toContain(v.teams[0].players[0].name);
  expect(JSON.stringify(inspection)).not.toContain(admin);
  await db.exec(upgrade());
  expect(await load(db)).toEqual(v);
  expect(await load(db, "dodgeball-cup")).toEqual(d);
  expect(await fingerprints(db)).toEqual(before);
  expect(
    calculateStandings(v.teams, v.matches, "A", v.tournament.setRules),
  ).toEqual(ranks);
  const after = (await db.query(preflight())).rows[0]
    .volleyball_all_stages_preflight;
  expect(after.versions).toEqual({ ...inspection.versions, volleyball: 7 });
  expect(after.tournaments).toEqual(inspection.tournaments);
  expect(after.policies).toEqual(inspection.policies);
  expect(after.rls).toEqual(inspection.rls);
  expect(
    after.functions.map(({ definition, ...metadata }) => metadata),
  ).toEqual(
    inspection.functions.map(({ definition, ...metadata }) => metadata),
  );
  await db.exec(upgrade());
  expect(await fingerprints(db)).toEqual(before);
});
for (const stage of ["group", "semifinal", "final"])
  it.each([
    [15, 14, true],
    [14, 15, true],
    [14, 14, false],
    [16, 14, false],
    [16, 15, false],
  ])("007 SQL " + stage + " %s:%s valid=%s", async (h, a, valid) => {
    const run = db.query(
      "select volleyball_private.score_result($1,'[15,15,15]',true,$2) r",
      [JSON.stringify(score(h, a)), stage],
    );
    if (valid) expect((await run).rows[0].r.complete).toBe(true);
    else await expect(run).rejects.toThrow();
  });
it("007 RPC 결선 15:14 저장·동일 승자면 기존 결선 기록 유지·Revision 충돌·권한 보존", async () => {
  const before = await load(db);
  const plan = planMatchUpdate(before, "sf-1", score(15, 14), "confirm");
  expect(plan.affected).toEqual([]);
  const next = await save(db, plan.data, false, ["sf-1"]);
  expect(next.matches.find((m) => m.id === "final")).toEqual(
    before.matches.find((m) => m.id === "final"),
  );
  expect(next.matches.filter((m) => m.stage === "group")).toEqual(
    before.matches.filter((m) => m.stage === "group"),
  );
  expect(next.teams).toEqual(before.teams);
  await expect(save(db, plan.data, false, ["sf-1"])).rejects.toThrow(
    "REVISION_CONFLICT",
  );
  const invalid = structuredClone(next);
  invalid.matches.find((m) => m.id === "sf-1").sets = score(16, 14);
  await expect(save(db, invalid, false, ["sf-1"])).rejects.toThrow();
  expect(await load(db)).toEqual(next);
  for (const role of ["anon", "authenticated"]) {
    await db.exec(`set role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub','',false)");
    expect(
      (await db.query("select public.get_volleyball_scoring_version() n"))
        .rows[0].n,
    ).toBe(7);
    await expect(save(db, next)).rejects.toThrow(
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
it.each([
  ["sf-1", 16, 14],
  ["final", 17, 15],
])(
  "기존 %s 듀스 %s:%s는 명확한 충돌·전체 롤백·원본 보존",
  async (id, h, a) => {
    const old = await setup();
    try {
      const d = createDemoData();
      d.matches.find((m) => m.id === id).sets = score(h, a);
      const saved = await save(old, d, true),
        before = await fingerprints(old);
      const inspection = (await old.query(preflight())).rows[0]
        .volleyball_all_stages_preflight;
      expect(inspection.obvious_score_conflicts.some((m) => m.id === id)).toBe(
        true,
      );
      expect(inspection.deuce_scores.some((m) => m.id === id)).toBe(true);
      await expect(old.exec(upgrade())).rejects.toThrow(
        new RegExp("007_INCOMPATIBLE_VOLLEYBALL_RECORD: match " + id),
      );
      await old.exec("rollback");
      expect(await load(old)).toEqual(saved);
      expect(await fingerprints(old)).toEqual(before);
      expect(
        (await old.query("select public.get_volleyball_scoring_version() n"))
          .rows[0].n,
      ).toBe(4);
    } finally {
      await old.close();
    }
  },
  60000,
);
it("점검·마이그레이션 소스에 데이터 변경 명령 없음", () => {
  const stripped = upgrade().replace(/--[^\n]*/g, "");
  expect(stripped).not.toMatch(
    /\b(?:update|delete|truncate|insert|alter\s+table|drop)\b/i,
  );
  expect(
    preflight()
      .replace(/--[^\n]*/g, "")
      .trim(),
  ).toMatch(/^with\s/i);
  expect(preflight().replace(/--[^\n]*/g, "")).not.toMatch(
    /\b(?:update|delete|truncate|insert|create|alter|drop)\b/i,
  );
});
