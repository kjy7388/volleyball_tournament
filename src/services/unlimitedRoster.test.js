import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import {
  createDemoData,
  planTeamsUpdate,
  validateData,
} from "./tournamentStorage";
import {
  createSupabaseRepository,
  parseBackupFile,
} from "./supabaseTournament";
import { calculateStandings } from "../utils/standings";
const admin = "11111111-1111-4111-8111-111111111111";
const sql = (n) =>
  readFileSync(
    new URL(`../../supabase/migrations/${n}`, import.meta.url),
    "utf8",
  );
const upgrade = () => sql("005_unlimited_roster_registration.sql");
async function setup() {
  const e = new PGlite();
  await e.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${admin}');`,
  );
  for (const n of [
    "001_initial_schema.sql",
    "002_multi_sport_tournament.sql",
    "003_volleyball_no_deuce.sql",
    "004_three_set_points_and_survivors.sql",
  ])
    await e.exec(sql(n));
  await e.exec(
    `insert into public.tournament_admins(user_id)values('${admin}');`,
  );
  await e.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  return e;
}
const load = async (e, id) =>
  (await e.query("select public.get_public_tournament($1)d", [id])).rows[0].d;
const save = async (e, d, initialize = false) =>
  (
    await e.query(
      "select public.save_tournament($1::jsonb,$2::bigint,$3::text[],$4)d",
      [
        JSON.stringify(d),
        initialize ? null : d.revision,
        d.matches.map((m) => m.id),
        initialize,
      ],
    )
  ).rows[0].d;
function roster(d, count) {
  const teams = structuredClone(d.teams);
  const old = teams[0].players;
  while (old.length < count)
    old.push({
      id: `extra-${old.length + 1}`,
      teamId: teams[0].id,
      name: `등록선수 ${old.length + 1}`,
    });
  return planTeamsUpdate(d, teams).data;
}
let db, beforeV, beforeD, policies, history;
beforeAll(async () => {
  db = await setup();
  beforeV = await save(db, createDemoData(), true);
  beforeV = await save(db, beforeV);
  beforeD = await save(db, createDemoData("dodgeball"), true);
  policies = (
    await db.query(
      "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies order by schemaname,tablename,policyname",
    )
  ).rows;
  history = (
    await db.query(
      "select * from volleyball_private.tournament_history order by tournament_id,revision",
    )
  ).rows;
  await db.exec(upgrade());
}, 60000);
afterAll(async () => await db?.close());
it("005 preserves all records/order/revisions/policies/history/admins and reruns safely", async () => {
  expect(await load(db, "volleyball-cup")).toEqual(beforeV);
  expect(await load(db, "dodgeball-cup")).toEqual(beforeD);
  expect(
    (
      await db.query(
        "select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies order by schemaname,tablename,policyname",
      )
    ).rows,
  ).toEqual(policies);
  expect(
    (
      await db.query(
        "select * from volleyball_private.tournament_history order by tournament_id,revision",
      )
    ).rows,
  ).toEqual(history);
  expect(
    (await db.query("select count(*)n from public.tournament_admins")).rows[0]
      .n,
  ).toBe(1);
  await db.exec(upgrade());
  expect(
    (await db.query("select public.get_roster_registration_version()n")).rows[0]
      .n,
  ).toBe(5);
  expect(
    (
      await db.query(
        "select count(*)n from pg_trigger where tgrelid='public.players'::regclass and tgname='roster_limit_10'",
      )
    ).rows[0].n,
  ).toBe(0);
});
for (const sport of ["volleyball", "dodgeball"])
  it.each([10, 11, 15, 101])(
    `${sport} %s players save/restore, preserve prior players/results/standings and other sport`,
    async (count) => {
      const current = await load(db, `${sport}-cup`),
        otherId = sport === "volleyball" ? "dodgeball-cup" : "volleyball-cup",
        other = await load(db, otherId);
      const d = roster(current, count);
      expect(validateData(d)).toBe(d);
      const saved = await save(db, d);
      expect(saved.teams[0].players).toHaveLength(count);
      expect(
        saved.teams[0].players.slice(0, current.teams[0].players.length),
      ).toEqual(current.teams[0].players);
      expect(saved.matches).toEqual(current.matches);
      expect(
        calculateStandings(
          saved.teams,
          saved.matches,
          "A",
          saved.tournament.setRules,
        ).rows.map((r) => ({
          id: r.team.id,
          pts: r.matchPoints,
          rank: r.rank,
        })),
      ).toEqual(
        calculateStandings(
          current.teams,
          current.matches,
          "A",
          current.tournament.setRules,
        ).rows.map((r) => ({
          id: r.team.id,
          pts: r.matchPoints,
          rank: r.rank,
        })),
      );
      expect(await load(db, otherId)).toEqual(other);
      expect(
        await parseBackupFile(new File([JSON.stringify(saved)], "roster.json")),
      ).toEqual(saved);
    },
  );
it("005 removes direct-row roster trigger, while revision/auth guards remain", async () => {
  await db.query(
    "insert into public.players(id,tournament_id,team_id,name,display_order) values('direct-extra','volleyball-cup','team-1','추가 검증',102)",
  );
  const d = await load(db, "volleyball-cup");
  await db.exec(upgrade());
  expect(await load(db, "volleyball-cup")).toEqual(d);
  const stale = structuredClone(d);
  stale.revision--;
  await expect(save(db, stale)).rejects.toThrow("REVISION_CONFLICT");
  await db.exec("set role anon");
  expect(
    (await db.query("select public.get_roster_registration_version()n")).rows[0]
      .n,
  ).toBe(5);
  await expect(save(db, d)).rejects.toThrow("permission denied");
  await expect(
    db.query("select * from public.tournament_admins"),
  ).rejects.toThrow("permission denied");
  await db.exec("reset role;set role authenticated");
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await expect(save(db, d)).rejects.toThrow("ADMIN_REQUIRED");
  await db.exec("reset role");
});
it("unexpected validator definition aborts before removing old trigger", async () => {
  const isolated = await setup();
  try {
    await isolated.exec(
      "create or replace function volleyball_private.validate_snapshot(d jsonb)returns void language plpgsql as $$begin raise exception 'unexpected custom validation';end $$",
    );
    await expect(isolated.exec(upgrade())).rejects.toThrow(
      "SCHEMA_DRIFT_REVIEW_REQUIRED",
    );
    await isolated.exec("rollback");
    expect(
      (
        await isolated.query(
          "select count(*)n from pg_trigger where tgname='roster_limit_10'",
        )
      ).rows[0].n,
    ).toBe(1);
  } finally {
    await isolated.close();
  }
});
it("SDK keeps input and blocks 11+ save before 005, succeeds once capability available", async () => {
  const d = roster(createDemoData(), 15),
    original = JSON.stringify(d),
    calls = [];
  let ready = false;
  const rpc = async (name) => {
    calls.push(name);
    return name === "get_competition_format_version"
      ? { data: 4 }
      : name === "get_roster_registration_version"
        ? ready
          ? { data: 5 }
          : { error: { code: "PGRST202" } }
        : { data: { ...d, revision: 1 } };
  };
  const repo = createSupabaseRepository({ rpc });
  await expect(repo.save(d)).rejects.toThrow(
    "005_unlimited_roster_registration",
  );
  expect(calls).not.toContain("save_tournament");
  expect(JSON.stringify(d)).toBe(original);
  ready = true;
  expect((await repo.save(d)).teams[0].players).toHaveLength(15);
});
