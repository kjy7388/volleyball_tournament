import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createInitialData } from "../data/initialTournament";
import { createDemoData, planMatchUpdate } from "./tournamentStorage";
import { emptyRounds } from "../utils/dodgeballRules";
import { syncBracket } from "../utils/bracketLogic";
const admin = "11111111-1111-4111-8111-111111111111",
  viewer = "22222222-2222-4222-8222-222222222222";
const sql = (n) =>
  readFileSync(
    new URL(`../../supabase/migrations/${n}`, import.meta.url),
    "utf8",
  );
let db, legacy;
async function as(role = "authenticated", uid = admin) {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
}
async function load(id = "dodgeball-cup") {
  return (await db.query("select public.get_public_tournament($1) data", [id]))
    .rows[0].data;
}
async function save(data, initialize = false, ack = []) {
  return (
    await db.query(
      "select public.save_tournament($1::jsonb,$2::bigint,$3::text[],$4) data",
      [
        JSON.stringify(data),
        initialize ? null : data.revision,
        ack,
        initialize,
      ],
    )
  ).rows[0].data;
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users values('${admin}'),('${viewer}');`,
  );
  await db.exec(sql("001_initial_schema.sql"));
  await db.exec(
    `insert into public.tournament_admins(user_id) values('${admin}')`,
  );
  await as();
  legacy = await save(createDemoData(), true);
  await as("postgres", "");
  await db.exec(sql("002_multi_sport_tournament.sql"));
  await db.exec(sql("003_volleyball_no_deuce.sql"));
  await as();
}, 60000);
afterAll(async () => {
  await db?.close();
});
it("예상하지 못한 기존 CHECK는 제거하지 않고 마이그레이션 전체 중단·롤백", async () => {
  const isolated = new PGlite();
  try {
    await isolated.exec(
      "create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;",
    );
    await isolated.exec(sql("001_initial_schema.sql"));
    await isolated.exec(
      "alter table public.tournaments add constraint custom_identity_check check(length(id)>0)",
    );
    await expect(
      isolated.exec(sql("002_multi_sport_tournament.sql")),
    ).rejects.toThrow("SCHEMA_DRIFT_REVIEW_REQUIRED");
    await isolated.exec("rollback");
    expect(
      (
        await isolated.query(
          "select count(*) n from pg_constraint where conrelid='public.tournaments'::regclass and conname in ('custom_identity_check','tournaments_id_check')",
        )
      ).rows[0].n,
    ).toBe(2);
    expect(
      (await isolated.query("select to_regclass('public.match_rounds') t"))
        .rows[0].t,
    ).toBeNull();
  } finally {
    await isolated.close();
  }
});
it("001 데이터가 있는 DB에 002 적용 후 원본 경기·선수·Revision 보존 및 재실행", async () => {
  const actual = await load("volleyball-cup");
  expect(actual.matches).toEqual(legacy.matches);
  expect(actual.teams).toEqual(legacy.teams);
  expect(actual.revision).toBe(legacy.revision);
  await as("postgres", "");
  await db.exec(sql("002_multi_sport_tournament.sql"));
  await as();
  expect((await load("volleyball-cup")).revision).toBe(legacy.revision);
});
it("피구 최초 1회 생성, 별도 하위 테이블 사용 및 중복 생성 거부", async () => {
  const d = await save(createInitialData("dodgeball"), true);
  expect(d.revision).toBe(1);
  expect(d.matches[0].rounds).toEqual(emptyRounds());
  expect(d.matches[0].sets).toBeUndefined();
  await expect(save(createInitialData("dodgeball"), true)).rejects.toThrow(
    "ALREADY_EXISTS",
  );
  await as("postgres", "");
  expect(
    Number(
      (
        await db.query(
          "select count(*) n from public.match_sets where tournament_id='dodgeball-cup'",
        )
      ).rows[0].n,
    ),
  ).toBe(0);
  expect(
    Number(
      (
        await db.query(
          "select count(*) n from public.match_rounds where tournament_id='dodgeball-cup'",
        )
      ).rows[0].n,
    ),
  ).toBe(45);
  await as();
});
it("종목별 revision 독립: 양쪽 저장 요청을 함께 제출해도 서로 충돌하지 않음", async () => {
  const v = await load("volleyball-cup"),
    d = await load();
  v.tournament.name = "배구 유지";
  d.tournament.name = "피구 독립";
  const [nv, nd] = await Promise.all([save(v), save(d)]);
  expect(nv.revision).toBe(v.revision + 1);
  expect(nd.revision).toBe(d.revision + 1);
  await expect(save(d)).rejects.toThrow("REVISION_CONFLICT");
  expect((await load("volleyball-cup")).tournament.name).toBe("배구 유지");
});
it("단일 대회에 같은 revision의 중복 요청을 제출하면 한 번만 저장", async () => {
  const d = await load();
  const attempts = await Promise.allSettled([save(d), save(d)]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    attempts.find((r) => r.status === "rejected").reason.message,
  ).toContain("REVISION_CONFLICT");
  expect((await load()).revision).toBe(d.revision + 1);
});
it("피구 9경기 결과 서버 검증, 결선 배정, 우승과 배구 선수·결과 독립", async () => {
  const before = await load("volleyball-cup");
  const d = await load();
  const demo = createDemoData("dodgeball");
  demo.revision = d.revision;
  demo.teams[0].players[0].name = "피구 전용 선수";
  const after = await save(demo);
  expect(after.tournament.status).toBe("completed");
  expect(after.matches.find((m) => m.id === "final").winnerTeamId).toBe(
    "team-1",
  );
  expect(await load("volleyball-cup")).toEqual(before);
});
it("잘못된 피구 판, 중간 공백, 3승 이후 입력, 점수 혼입, 위조 승자 서버 거부", async () => {
  const original = await load();
  for (const mutate of [
    (d) => {
      d.matches[0].rounds[0].winner = "draw";
    },
    (d) => {
      d.matches[0].rounds[0].winner = null;
    },
    (d) => {
      d.matches[0].rounds[3].winner = "away";
    },
    (d) => {
      d.matches[0].sets = [];
    },
    (d) => {
      d.matches[0].winnerTeamId = "team-2";
    },
    (d) => {
      d.matches[0].rounds[0].home = 25;
    },
    (d) => {
      d.tournament.sport = "volleyball";
    },
  ]) {
    const bad = structuredClone(original);
    mutate(bad);
    await expect(save(bad)).rejects.toThrow();
  }
  expect(await load()).toEqual(original);
});
it("완료되지 않은 피구 결과는 확정 거부, 임시 저장은 결선 미배정", async () => {
  const original = await load();
  const clean = createInitialData("dodgeball");
  clean.revision = original.revision;
  await save(
    clean,
    false,
    original.matches.map((m) => m.id),
  );
  let d = await load();
  d = planMatchUpdate(
    d,
    "g-A-1",
    [{ winner: "home" }, ...emptyRounds().slice(1)],
    "draft",
  ).data;
  const saved = await save(d);
  expect(saved.matches.find((m) => m.id === "sf-1").homeTeamId).toBeNull();
  const bad = structuredClone(saved);
  bad.matches[0].status = "completed";
  bad.matches[0].winnerTeamId = "team-1";
  bad.matches[0].confirmedAt = new Date().toISOString();
  await expect(save(bad)).rejects.toThrow("INCOMPLETE_ROUNDS");
});
it("피구 결선 기록 수정은 ACK 없이 차단하고 명시적 확인 후만 반영", async () => {
  const current = await load();
  const d = createDemoData("dodgeball");
  d.revision = current.revision;
  await save(d);
  const plan = planMatchUpdate(
    await load(),
    "g-A-1",
    [
      { winner: "away" },
      { winner: "away" },
      { winner: "away" },
      ...emptyRounds().slice(3),
    ],
    "confirm",
  );
  await expect(save(plan.data)).rejects.toThrow("ACK_REQUIRED");
  const saved = await save(plan.data, false, ["g-A-1", ...plan.affected]);
  expect(saved.matches.find((m) => m.id === "final").status).toBe("scheduled");
});
it("피구 두 팀의 승수·판 득실 동률은 서버에서도 직접 맞대결로 해소", async () => {
  const current = await load();
  let d = createInitialData("dodgeball");
  d.revision = current.revision;
  const outcomes = {
    "g-A-1": ["home", "away", "home", "away", "home"],
    "g-A-2": ["away", "away", "away"],
    "g-A-3": ["home", "home", "home"],
  };
  for (const match of d.matches.filter((m) => m.stage === "group")) {
    const winners = outcomes[match.id] || ["home", "home", "home"];
    const rounds = Array.from({ length: 5 }, (_, i) => ({
      winner: winners[i] || null,
    }));
    d = planMatchUpdate(d, match.id, rounds, "confirm").data;
  }
  const saved = await save(
    d,
    false,
    current.matches.map((m) => m.id),
  );
  expect(saved.matches.find((m) => m.id === "sf-1")).toMatchObject({
    homeTeamId: "team-2",
    awayTeamId: "team-5",
  });
  expect(saved.matches.find((m) => m.id === "sf-2")).toMatchObject({
    homeTeamId: "team-4",
    awayTeamId: "team-3",
  });
});
it("피구 순환 동률 수동 지정 전 결선 금지, 지정 후 서버·클라이언트 순위 일치", async () => {
  const original = await load();
  let d = createInitialData("dodgeball");
  d.revision = original.revision;
  for (const match of d.matches.filter((m) => m.stage === "group"))
    d = planMatchUpdate(
      d,
      match.id,
      Array.from({ length: 5 }, (_, i) => ({
        winner: i < 3 ? (match.id === "g-A-2" ? "away" : "home") : null,
      })),
      "confirm",
    ).data;
  d = await save(
    d,
    false,
    original.matches.map((m) => m.id),
  );
  expect(d.matches.find((m) => m.id === "sf-1").homeTeamId).toBeNull();
  d.manualRankings.A = ["team-3", "team-1", "team-2"];
  d = syncBracket(d).data;
  const saved = await save(d);
  expect(saved.matches.find((m) => m.id === "sf-1").homeTeamId).toBe("team-3");
});
it("트랜잭션 중 날짜 오류 시 양쪽 대회 원본과 Revision 보존", async () => {
  const before = await load();
  const v = await load("volleyball-cup");
  const bad = structuredClone(before);
  bad.teams[0].name = "롤백";
  bad.matches[0].scheduledAt = "2026-02-30T10:00";
  await expect(save(bad)).rejects.toThrow();
  expect(await load()).toEqual(before);
  expect(await load("volleyball-cup")).toEqual(v);
});
it("관리자 수동 순위로 승수·판득실·상대전적 기준을 뒤집으면 서버 거부", async () => {
  const current = await load();
  const bad = createDemoData("dodgeball");
  bad.revision = current.revision;
  bad.manualRankings.A = ["team-3", "team-2", "team-1"];
  await expect(
    save(
      bad,
      false,
      current.matches.map((m) => m.id),
    ),
  ).rejects.toThrow("MANUAL_OVERRIDES_METRICS");
  expect(await load()).toEqual(current);
});
it("RLS: 익명·일반 사용자 쓰기/관리자 목록/감사 기록 접근 차단, 공개 데이터 조회", async () => {
  for (const [role, uid] of [
    ["anon", ""],
    ["authenticated", viewer],
  ]) {
    await as(role, uid);
    expect((await load()).teams).toHaveLength(6);
    for (const table of [
      "tournaments",
      "teams",
      "players",
      "matches",
      "match_sets",
      "match_rounds",
    ]) {
      const column =
        table === "match_sets"
          ? "set_number"
          : table === "match_rounds"
            ? "round_number"
            : table === "matches"
              ? "number"
              : "name";
      for (const query of [
        `insert into public.${table} default values`,
        `update public.${table} set ${column}=${column}`,
        `delete from public.${table}`,
      ])
        await expect(db.query(query)).rejects.toThrow("permission denied");
    }
    await expect(save(createInitialData("dodgeball"), true)).rejects.toThrow();
    await expect(
      db.query("select * from public.tournament_admins"),
    ).rejects.toThrow();
    await expect(
      db.query("select * from volleyball_private.tournament_history"),
    ).rejects.toThrow();
  }
  await as();
});
it("관리자도 RPC 밖 직접 쓰기 불가, owner의 종목별 테이블 혼용도 trigger가 차단", async () => {
  await expect(
    db.query("update public.match_rounds set winner_side='away'"),
  ).rejects.toThrow();
  await as("postgres", "");
  await expect(
    db.query(
      "insert into public.match_sets(tournament_id,match_id,set_number) values('dodgeball-cup','g-A-1',1)",
    ),
  ).rejects.toThrow("RESULT_SPORT_MISMATCH");
  await expect(
    db.query(
      "insert into public.match_rounds(tournament_id,match_id,round_number) values('volleyball-cup','g-A-1',1)",
    ),
  ).rejects.toThrow("RESULT_SPORT_MISMATCH");
  await as();
});
