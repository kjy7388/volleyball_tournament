import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createInitialData } from "../data/initialTournament";
import {
  createDemoData,
  planMatchUpdate,
  planTeamsUpdate,
} from "./tournamentStorage";
let db;
const adminId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const sql = readFileSync(
  new URL("../../supabase/migrations/001_initial_schema.sql", import.meta.url),
  "utf8",
);
async function as(role, uid = "") {
  await db.exec(`reset role; set role ${role};`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [uid]);
}
async function load() {
  return (await db.query("select public.get_public_tournament() as data"))
    .rows[0].data;
}
async function save(data, { initialize = false, ack = [] } = {}) {
  return (
    await db.query(
      "select public.save_tournament($1::jsonb,$2::bigint,$3::text[],$4::boolean) as data",
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
    `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users values ('${adminId}'),('${userId}');`,
  );
  await db.exec(sql);
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/002_multi_sport_tournament.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    readFileSync(
      new URL(
        "../../supabase/migrations/003_volleyball_no_deuce.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  await db.exec(
    `insert into public.tournament_admins(user_id) values ('${adminId}');`,
  );
}, 60000);
afterAll(async () => {
  await db?.close();
});
describe("실제 로컬 PostgreSQL 마이그레이션·RLS·트랜잭션 (원격 Supabase 아님)", () => {
  it("마이그레이션 재실행과 빈 데이터 조회", async () => {
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/002_multi_sport_tournament.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      readFileSync(
        new URL(
          "../../supabase/migrations/003_volleyball_no_deuce.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await as("anon");
    expect(await load()).toBeNull();
  });
  it("익명·일반 사용자 테이블 INSERT UPDATE DELETE 차단과 관리자 목록 비공개", async () => {
    for (const [role, uid] of [
      ["anon", ""],
      ["authenticated", userId],
    ]) {
      await as(role, uid);
      for (const statement of [
        "insert into public.tournaments(id) values('bad')",
        "update public.teams set name='bad'",
        "delete from public.matches",
        "select * from public.tournament_admins",
        "insert into public.tournament_admins(user_id) values('11111111-1111-4111-8111-111111111111')",
      ])
        await expect(db.query(statement)).rejects.toThrow(/permission denied/);
    }
  });
  it("관리자 판정은 세션 UID만 사용, 일반 로그인 RPC 저장 거부", async () => {
    await as("authenticated", userId);
    expect(
      (await db.query("select public.is_tournament_admin() ok")).rows[0].ok,
    ).toBe(false);
    await expect(
      save(createInitialData(), { initialize: true }),
    ).rejects.toThrow("ADMIN_REQUIRED");
    await as("anon");
    await expect(
      save(createInitialData(), { initialize: true }),
    ).rejects.toThrow("permission denied");
  });
  it("관리자가 최초 1회 등록, 6팀·48선수·9경기·45세트 저장", async () => {
    await as("authenticated", adminId);
    const d = await save(createInitialData(), { initialize: true });
    expect(d.revision).toBe(1);
    expect(d.teams).toHaveLength(6);
    expect(d.teams.flatMap((t) => t.players)).toHaveLength(48);
    expect(d.matches).toHaveLength(9);
    expect(d.matches.every((m) => m.sets.length === 5)).toBe(true);
    await expect(
      save(createInitialData(), { initialize: true }),
    ).rejects.toThrow("ALREADY_EXISTS");
  });
  it("비로그인 조회는 동일한 공용 DB 데이터 사용", async () => {
    await as("anon");
    const d = await load();
    expect(d.teams[0].name).toBe("1반");
    expect(d.revision).toBe(1);
  });
  it("임시 저장·결과 확정·진출·우승 서버 재검증", async () => {
    await as("authenticated", adminId);
    const d = await load();
    const demo = { ...createDemoData(), revision: d.revision };
    const saved = await save(demo);
    expect(saved.tournament.status).toBe("completed");
    expect(saved.matches.find((m) => m.id === "final").winnerTeamId).toBe(
      "team-1",
    );
  });
  it("잘못된 점수·위조 승자·결선 대진을 서버에서 차단", async () => {
    const d = await load();
    const bad = structuredClone(d);
    bad.matches[0].sets[0] = { home: 26, away: 24 };
    await expect(save(bad)).rejects.toThrow("SCORE_OVER_TARGET");
    const win = structuredClone(d);
    win.matches[0].winnerTeamId = "team-2";
    await expect(save(win)).rejects.toThrow("INVALID_WINNER");
    const bracket = structuredClone(d);
    bracket.matches.find((m) => m.id === "final").awayTeamId = "team-5";
    await expect(save(bracket)).rejects.toThrow("INVALID_FINAL");
    expect((await load()).revision).toBe(d.revision);
  });
  it("결선 기록에 영향이 있는 수정은 명시적 확인 없이 거부", async () => {
    const d = await load();
    const sets = d.matches[0].sets.map((s) => ({ home: s.away, away: s.home }));
    const p = planMatchUpdate(d, "g-A-1", sets, "confirm");
    await expect(save(p.data)).rejects.toThrow("ACK_REQUIRED");
    const next = await save(p.data, { ack: ["g-A-1", ...p.affected] });
    expect(next.matches.find((m) => m.id === "final").status).toBe("scheduled");
  });
  it("오래된 revision 저장 거부와 원자적 롤백", async () => {
    const before = await load();
    const d = structuredClone(before);
    d.tournament.name = "변경됨";
    const after = await save(d);
    await expect(save(before)).rejects.toThrow("REVISION_CONFLICT");
    const bad = structuredClone(after);
    bad.teams[0].name = "롤백되어야함";
    bad.matches[0].scheduledAt = "2026-02-30T10:00";
    await expect(save(bad)).rejects.toThrow();
    const persisted = await load();
    expect(persisted.revision).toBe(after.revision);
    expect(persisted.teams[0].name).toBe(after.teams[0].name);
  });
  it("조 변경 시 정규화된 FK 유지와 순위·결선 초기화", async () => {
    const d = await load();
    const teams = structuredClone(d.teams);
    teams[0].group = "B";
    teams[3].group = "A";
    const p = planTeamsUpdate(d, teams);
    const saved = await save(p.data, { ack: p.affected });
    expect(saved.matches.every((m) => m.status === "scheduled")).toBe(true);
    expect(saved.teams.filter((t) => t.group === "A")).toHaveLength(3);
  });
  it("직접 쓰기·관리자 목록 수정은 관리자도 불가, 감사 백업 비공개", async () => {
    await as("authenticated", adminId);
    await expect(
      db.query("update public.teams set name='bypass'"),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("select * from public.tournament_admins"),
    ).rejects.toThrow("permission denied");
    await expect(
      db.query("select * from volleyball_private.tournament_history"),
    ).rejects.toThrow("permission denied");
    await as("postgres");
    expect(
      Number(
        (
          await db.query(
            "select count(*) from volleyball_private.tournament_history",
          )
        ).rows[0].count,
      ),
    ).toBeGreaterThan(0);
  });
});
