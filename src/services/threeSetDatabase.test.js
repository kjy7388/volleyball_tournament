import { beforeAll, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createInitialData } from "../data/initialTournament";
import { createDemoData, planMatchUpdate } from "./tournamentStorage";
import { calculateStandings } from "../utils/standings";
import { createInitialData as legacyInitial } from "./legacyTestData";
const admin = "11111111-1111-4111-8111-111111111111";
const migration = (n) =>
  readFileSync(
    new URL(`../../supabase/migrations/${n}`, import.meta.url),
    "utf8",
  );
const paths = [
  "001_initial_schema.sql",
  "002_multi_sport_tournament.sql",
  "003_volleyball_no_deuce.sql",
  "004_three_set_points_and_survivors.sql",
];
async function setup(upgrade = true) {
  const e = new PGlite();
  await e.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid()returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;insert into auth.users values('${admin}');`,
  );
  for (const p of paths.slice(0, upgrade ? 4 : 3)) await e.exec(migration(p));
  await e.exec(
    `insert into public.tournament_admins values('${admin}',now());`,
  );
  await e.query("select set_config('request.jwt.claim.sub',$1,false)", [admin]);
  return e;
}
const load = async (e, id = "volleyball-cup") =>
  (await e.query("select public.get_public_tournament($1) d", [id])).rows[0].d;
const save = async (e, d, init = false) =>
  (
    await e.query(
      "select public.save_tournament($1::jsonb,$2::bigint,$3::text[],$4) d",
      [
        JSON.stringify(d),
        init ? null : d.revision,
        d.matches.map((m) => m.id),
        init,
      ],
    )
  ).rows[0].d;
let db;
beforeAll(async () => {
  db = await setup();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("004 compiles, both full tournaments save with JS/SQL standings parity", async () => {
  for (const sport of ["volleyball", "dodgeball"]) {
    const saved = await save(db, createDemoData(sport), true);
    expect(saved.matches.every((m) => m.status === "completed")).toBe(true);
    const rows = calculateStandings(
      saved.teams,
      saved.matches,
      "A",
      saved.tournament.setRules,
    ).rows;
    const rank = (
      await db.query("select volleyball_private.group_rank($1::jsonb,'A') r", [
        JSON.stringify(saved),
      ])
    ).rows[0].r;
    expect(rank.ids).toEqual(rows.map((r) => r.team.id));
    expect(rank.resolved).toBe(true);
  }
});
it.each([
  [15, 14, "group", true],
  [16, 14, "group", false],
  [15, 14, "semifinal", false],
  [16, 14, "semifinal", true],
  [17, 15, "final", true],
  [10001, 9999, "final", true],
])("SQL %s:%s %s valid=%s", async (h, a, stage, valid) => {
  const query = db.query(
    "select volleyball_private.score_result($1,'[15,15,15]',true,$2) r",
    [
      JSON.stringify([
        { home: h, away: a },
        { home: h, away: a },
        { home: "", away: "" },
      ]),
      stage,
    ],
  );
  if (valid) expect((await query).rows[0].r.complete).toBe(true);
  else await expect(query).rejects.toThrow();
});
it("survivor validation, manual tie, no third round after two wins", async () => {
  const r = (h, a, w, manual = false) => ({
    homeRemaining: h,
    awayRemaining: a,
    winner: w,
    manualWinner: manual,
  });
  const empty = r(null, null, null);
  const q = (rs) =>
    db.query("select volleyball_private.round_result($1,true) r", [
      JSON.stringify(rs),
    ]);
  expect(
    (await q([r(7, 3, "home"), r(5, 5, "home", true), empty])).rows[0].r
      .complete,
  ).toBe(true);
  for (const bad of [
    [r(7, 3, "away"), r(7, 3, "home"), empty],
    [r(11, 3, "home"), r(7, 3, "home"), empty],
    [r(5, 5, null), empty, empty],
    [r(7, 3, "home"), r(7, 3, "home"), r(7, 3, "home")],
  ])
    await expect(q(bad)).rejects.toThrow();
});
it("RPC revision conflict, atomic rollback, ten-player guard and sport isolation", async () => {
  const current = (await load(db)) || (await save(db, createDemoData(), true)),
    other =
      (await load(db, "dodgeball-cup")) ||
      (await save(db, createDemoData("dodgeball"), true));
  const next = structuredClone(current);
  next.teams[0].players.push({
    id: "eleventh",
    teamId: "team-1",
    name: "추가",
  });
  await expect(save(db, next)).rejects.toThrow("INVALID_TEAM");
  expect(await load(db)).toEqual(current);
  expect(await load(db, "dodgeball-cup")).toEqual(other);
  const stale = structuredClone(current);
  stale.revision--;
  await expect(save(db, stale)).rejects.toThrow("REVISION_CONFLICT");
  await expect(
    db.query(
      "insert into public.players(id,tournament_id,team_id,name,display_order) values('owner-eleventh','volleyball-cup','team-1','정원 검증',11)",
    ),
  ).rejects.toThrow("ROSTER_LIMIT_10");
  await expect(
    db.query(
      "insert into public.match_rounds(tournament_id,match_id,round_number) values('dodgeball-cup','g-A-1',4)",
    ),
  ).rejects.toThrow("MAX_THREE_ROUNDS");
  expect(await load(db)).toEqual(current);
});
it("anonymous/ordinary users remain unable to write; admin list private", async () => {
  await db.exec("set role anon");
  await expect(save(db, createInitialData(), true)).rejects.toThrow(
    "permission denied",
  );
  await expect(
    db.query("select * from public.tournament_admins"),
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
it("004 refuses legacy results without truncation; entire schema/rows rollback", async () => {
  const e = await setup(false);
  try {
    const d = createInitialData("dodgeball");
    d.schemaVersion = 1;
    d.matches.forEach(
      (m) => (m.rounds = Array.from({ length: 5 }, () => ({ winner: null }))),
    );
    const old = await save(e, d, true);
    await e.exec(
      "update public.match_rounds set winner_side='home' where match_id='g-A-1' and round_number=1",
    );
    const before = await load(e, "dodgeball-cup");
    await expect(e.exec(migration(paths[3]))).rejects.toThrow(
      "LEGACY_RESULTS_REVIEW_REQUIRED",
    );
    await e.exec("rollback");
    expect(await load(e, "dodgeball-cup")).toEqual(before);
    expect(
      (await e.query("select public.get_volleyball_scoring_version() n"))
        .rows[0].n,
    ).toBe(3);
  } finally {
    await e.close();
  }
});

it("empty legacy transition preserves roster/config backup/history/policies and leaves rows 4/5 untouched", async () => {
  const e = await setup(false);
  try {
    const d = legacyInitial();
    d.teams.forEach((t) => (t.players = t.players.slice(0, 8)));
    d.tournament.setRules = [21, 21, 21, 21, 11];
    d.matches[0].scheduledAt = "2026-11-24T10:00";
    const before = await save(e, d, true);
    const policies = (
      await e.query(
        "select tablename,policyname,qual,with_check from pg_policies order by tablename,policyname",
      )
    ).rows;
    await e.exec(migration(paths[3]));
    const after = await load(e);
    expect(after.teams).toEqual(before.teams);
    expect(after.schemaVersion).toBe(2);
    expect(after.revision).toBe(before.revision + 1);
    expect(after.tournament.setRules).toEqual([15, 15, 15]);
    expect(after.matches[0].scheduledAt).toBe(before.matches[0].scheduledAt);
    expect(after.matches.every((m) => m.sets.length === 3)).toBe(true);
    expect(
      (
        await e.query(
          "select payload from volleyball_private.rule_upgrade_backups",
        )
      ).rows[0].payload,
    ).toEqual(before);
    expect(
      (await e.query("select count(*) n from public.match_sets")).rows[0].n,
    ).toBe(45);
    const afterPolicies = (
      await e.query(
        "select tablename,policyname,qual,with_check from pg_policies where tablename<>'rule_upgrade_backups' order by tablename,policyname",
      )
    ).rows;
    expect(afterPolicies).toEqual(policies);
    await expect(
      e.query(
        "update public.match_sets set home_score=null where set_number=4",
      ),
    ).rejects.toThrow("MAX_THREE_SETS");
    await e.exec(migration(paths[3]));
    expect(await load(e)).toEqual(after);
  } finally {
    await e.close();
  }
});
it("over-capacity legacy roster aborts without deleting the eleventh player", async () => {
  const e = await setup(false);
  try {
    const d = legacyInitial();
    d.teams[0].players.push({
      id: "extra",
      teamId: "team-1",
      name: "보존선수",
    });
    const old = await save(e, d, true);
    await expect(e.exec(migration(paths[3]))).rejects.toThrow(
      "ROSTER_REVIEW_REQUIRED",
    );
    await e.exec("rollback");
    expect(await load(e)).toEqual(old);
  } finally {
    await e.close();
  }
});
it("unknown score constraint is retained and 004 fully rolls back", async () => {
  const e = await setup(false);
  try {
    await e.exec(
      "alter table public.match_sets add constraint unknown_score check(home_score<1000)",
    );
    await expect(e.exec(migration(paths[3]))).rejects.toThrow(
      "SCHEMA_DRIFT_REVIEW_REQUIRED",
    );
    await e.exec("rollback");
    expect(
      (
        await e.query(
          "select count(*) n from pg_constraint where conname='unknown_score'",
        )
      ).rows[0].n,
    ).toBe(1);
    expect(
      (await e.query("select public.get_volleyball_scoring_version() n"))
        .rows[0].n,
    ).toBe(3);
  } finally {
    await e.close();
  }
});
it("SQL ratios compare exactly beyond floating precision and without Infinity", async () => {
  expect(
    (
      await db.query(
        "select volleyball_private.ratio_compare(9007199254740993,3,9007199254740992,3) n",
      )
    ).rows[0].n,
  ).toBe(1);
  expect(
    (await db.query("select volleyball_private.ratio_compare(2,0,100,1) n"))
      .rows[0].n,
  ).toBe(1);
  expect(
    (await db.query("select volleyball_private.ratio_compare(0,0,0,1) n"))
      .rows[0].n,
  ).toBe(-1);
});
