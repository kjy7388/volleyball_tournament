// Auth and transport are simulated; the RPCs execute the real migration in local
// PostgreSQL (PGlite). No Supabase project or user credentials are contacted.
import { test as base, expect } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { createInitialData } from "../src/data/initialTournament.js";
const adminId = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
const encode = (value) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
function token(id) {
  return `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600, iat: Math.floor(Date.now() / 1000) })}.local-test-signature`;
}
export const test = base.extend({
  backend: [
    async ({ context }, use) => {
      const db = new PGlite();
      await db.exec(
        `create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; insert into auth.users values('${adminId}'),('${userId}');`,
      );
      await db.exec(
        readFileSync(
          new URL(
            "../supabase/migrations/001_initial_schema.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(
        readFileSync(
          new URL(
            "../supabase/migrations/002_multi_sport_tournament.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(
        readFileSync(
          new URL(
            "../supabase/migrations/003_volleyball_no_deuce.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      await db.exec(
        `insert into public.tournament_admins(user_id) values('${adminId}');`,
      );
      let chain = Promise.resolve();
      let failSave = false;
      let failLoad = false;
      let delaySave = 0;
      let loads = 0;
      const serial = (fn) => {
        const promise = chain.then(fn);
        chain = promise.catch(() => {});
        return promise;
      };
      const role = async (uid) => {
        await db.exec(`reset role; set role ${uid ? "authenticated" : "anon"}`);
        await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
          uid || "",
        ]);
      };
      const snapshot = (id = "volleyball-cup") =>
        serial(async () => {
          await role("");
          return (
            await db.query("select public.get_public_tournament($1) data", [id])
          ).rows[0].data;
        });
      const rpcSave = async (data, initialize = false, ack = []) => {
        await role(adminId);
        return (
          await db.query(
            "select public.save_tournament($1::jsonb,$2::bigint,$3::text[],$4::boolean) data",
            [
              JSON.stringify(data),
              initialize ? null : data.revision,
              ack,
              initialize,
            ],
          )
        ).rows[0].data;
      };
      await rpcSave(createInitialData(), true);
      const install = async (ctx) => {
        await ctx.routeWebSocket("**/realtime/v1/websocket*", (socket) =>
          socket.close(),
        );
        await ctx.route(
          "https://mock-project.supabase.co/**",
          async (route) => {
            const request = route.request();
            const url = new URL(request.url());
            const json = (data, status = 200) =>
              route.fulfill({
                status,
                contentType: "application/json",
                body: JSON.stringify(data),
              });
            if (request.method() === "OPTIONS")
              return route.fulfill({ status: 204 });
            if (url.pathname === "/auth/v1/token") {
              const body = request.postDataJSON();
              if (
                body.password !== "local-test-password" ||
                !["admin@example.test", "viewer@example.test"].includes(
                  body.email,
                )
              )
                return json(
                  {
                    code: "invalid_credentials",
                    msg: "Invalid login credentials",
                  },
                  400,
                );
              const uid =
                body.email === "admin@example.test" ? adminId : userId;
              return json({
                access_token: token(uid),
                refresh_token: "local-refresh",
                token_type: "bearer",
                expires_in: 3600,
                user: {
                  id: uid,
                  aud: "authenticated",
                  role: "authenticated",
                  email: body.email,
                  app_metadata: {},
                  user_metadata: {},
                  created_at: new Date().toISOString(),
                },
              });
            }
            if (url.pathname === "/auth/v1/logout") return json({});
            if (url.pathname === "/auth/v1/user")
              return json({ id: adminId, email: "admin@example.test" });
            const name = url.pathname.split("/").at(-1);
            const body = request.postDataJSON() || {};
            let uid = "";
            try {
              uid =
                JSON.parse(
                  Buffer.from(
                    (request.headers().authorization || "").split(".")[1],
                    "base64url",
                  ).toString(),
                ).sub || "";
            } catch {}
            if (name === "save_tournament" && delaySave)
              await new Promise((resolve) => setTimeout(resolve, delaySave));
            if (
              (name === "save_tournament" && failSave) ||
              (name === "get_public_tournament" && failLoad)
            )
              return json(
                { code: "TEST_NETWORK", message: "Simulated network failure" },
                503,
              );
            try {
              const value = await serial(async () => {
                await role(uid);
                if (name === "is_tournament_admin")
                  return (
                    await db.query("select public.is_tournament_admin() data")
                  ).rows[0].data;
                if (name === "get_volleyball_scoring_version")
                  return (
                    await db.query(
                      "select public.get_volleyball_scoring_version() data",
                    )
                  ).rows[0].data;
                if (name === "get_sports_schema_version")
                  return (
                    await db.query(
                      "select public.get_sports_schema_version() data",
                    )
                  ).rows[0].data;
                if (name === "get_public_tournament") {
                  loads++;
                  return (
                    await db.query(
                      "select public.get_public_tournament($1) data",
                      [body.p_id],
                    )
                  ).rows[0].data;
                }
                if (name === "save_tournament")
                  return (
                    await db.query(
                      "select public.save_tournament($1::jsonb,$2::bigint,$3::text[],$4::boolean) data",
                      [
                        JSON.stringify(body.p_snapshot),
                        body.p_expected_revision,
                        body.p_acknowledged_ids,
                        body.p_initialize,
                      ],
                    )
                  ).rows[0].data;
                throw new Error("Unexpected mock route: " + name);
              });
              return json(value);
            } catch (e) {
              return json(
                { code: e.code || "P0001", message: e.message },
                e.code === "42501" ? 403 : 400,
              );
            }
          },
        );
      };
      await install(context);
      const backend = {
        snapshot,
        initialize: (data) => serial(() => rpcSave(data, true)),
        install,
        setSaveFailure: (value) => {
          failSave = value;
        },
        setLoadFailure: (value) => {
          failLoad = value;
        },
        setSaveDelay: (value) => {
          delaySave = value;
        },
        loadCount: () => loads,
        replace: (data) =>
          serial(async () => {
            const current = (
              await db.query("select public.get_public_tournament($1) data", [
                data.tournament.id,
              ])
            ).rows[0].data;
            return rpcSave(
              { ...data, revision: current.revision },
              false,
              current.matches.map((m) => m.id),
            );
          }),
        clear: () =>
          serial(async () => {
            await db.exec(
              "reset role; delete from public.match_rounds; delete from public.match_sets; delete from public.matches; delete from public.players; delete from public.teams; delete from public.tournaments;",
            );
          }),
      };
      await use(backend);
      await db.close();
    },
    { auto: true },
  ],
});
export { expect };
export async function login(
  page,
  email = "admin@example.test",
  password = "local-test-password",
) {
  await page.goto("/admin");
  await page.getByLabel("이메일", { exact: true }).fill(email);
  await page.getByLabel("비밀번호", { exact: true }).fill(password);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  if (email === "admin@example.test" && password === "local-test-password")
    await expect(
      page.getByRole("heading", { name: "대회 운영 대시보드" }),
    ).toBeVisible();
}
