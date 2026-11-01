import { test } from "@playwright/test";
import { createHash } from "node:crypto";

export { test };
export const SITE = "https://volleyball-tournament-omega.vercel.app";
const API = "https://bkfluqugazkimgipbrle.supabase.co";
export const SPORTS = ["volleyball", "dodgeball"];
export const LABELS = ["홈", "조별리그", "토너먼트", "경기 일정", "참가 반"];
export const hash = (value) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");
const endpoint = (raw) => {
  try {
    const u = new URL(raw);
    return u.origin + u.pathname;
  } catch {
    return "unknown endpoint";
  }
};
class SafeFailure extends Error {}
export function check(value, label) {
  if (!value) throw new SafeFailure(label);
}

// The key is discovered from the site's public request in memory. Never attach
// headers, bodies, storage, screenshots, DOM snapshots or raw console messages.
export async function monitor(context, page) {
  let publicKey = "";
  const report = {
    paths: [],
    httpFailures: [],
    networkFailures: [],
    navigationAborts: 0,
    consoleErrors: [],
    jsErrors: [],
    warnings: 0,
    blockedRequests: [],
    resources: { script: 0, stylesheet: 0, image: 0, font: 0 },
    publicResponses: [],
  };
  await context.route("**/*", async (route) => {
    const request = route.request();
    const u = new URL(request.url());
    const method = request.method();
    if (u.origin === API) {
      let body = {};
      try {
        body = request.postDataJSON() || {};
      } catch {}
      const id = body.p_id || u.searchParams.get("p_id");
      const getSnapshot =
        u.pathname === "/rest/v1/rpc/get_public_tournament" &&
        SPORTS.some((sport) => id === `${sport}-cup`);
      const getVersion =
        u.pathname === "/rest/v1/rpc/get_sports_schema_version" ||
        u.pathname === "/rest/v1/rpc/get_volleyball_scoring_version";
      if (["GET", "POST"].includes(method) && (getSnapshot || getVersion)) {
        const header = request.headers().apikey;
        if (header?.startsWith("sb_publishable_")) publicKey = header;
        return route.continue();
      }
    } else if (
      ["GET", "HEAD"].includes(method) &&
      [
        SITE,
        "https://fonts.googleapis.com",
        "https://fonts.gstatic.com",
      ].includes(u.origin)
    ) {
      return route.continue();
    }
    report.blockedRequests.push({ method, endpoint: endpoint(request.url()) });
    return route.abort();
  });
  page.on("pageerror", (error) => report.jsErrors.push({ name: error.name }));
  page.on("console", (message) => {
    if (message.type() === "error")
      report.consoleErrors.push({ endpoint: endpoint(message.location().url) });
    if (message.type() === "warning") report.warnings++;
  });
  page.on("requestfailed", (request) => {
    if (request.failure()?.errorText === "net::ERR_ABORTED")
      report.navigationAborts++;
    else
      report.networkFailures.push({
        endpoint: endpoint(request.url()),
        kind: request.resourceType(),
      });
  });
  page.on("response", (response) => {
    if (response.status() >= 400)
      report.httpFailures.push({
        endpoint: endpoint(response.url()),
        status: response.status(),
      });
    const kind = response.request().resourceType();
    if (response.ok() && Object.hasOwn(report.resources, kind))
      report.resources[kind]++;
    if (response.url().startsWith(API + "/rest/v1/rpc/get_public_tournament")) {
      let body = {};
      try {
        body = response.request().postDataJSON() || {};
      } catch {}
      report.publicResponses.push({
        requestedId:
          body.p_id || new URL(response.url()).searchParams.get("p_id"),
        status: response.status(),
      });
    }
  });
  return {
    report,
    async api(resource) {
      // This helper permits only these explicit anonymous GET reads. It cannot
      // log in, execute save RPCs, change roles, migrate or mutate any records.
      check(publicKey.length > 20, "공개 키를 화면 요청에서 확인하지 못함");
      const u = new URL(resource, API);
      const allowed =
        u.origin === API &&
        (u.pathname === "/rest/v1/rpc/get_public_tournament" ||
          u.pathname === "/rest/v1/rpc/get_sports_schema_version" ||
          u.pathname === "/rest/v1/rpc/get_volleyball_scoring_version" ||
          u.pathname === "/rest/v1/tournament_admins" ||
          u.pathname === "/rest/v1/matches");
      check(allowed, "허용하지 않은 운영 API 조회");
      try {
        const response = await fetch(u, {
          headers: { apikey: publicKey },
          signal: AbortSignal.timeout(15000),
        });
        return { status: response.status, data: await response.json() };
      } catch {
        throw new SafeFailure("운영 읽기 전용 API 요청 실패: " + u.pathname);
      }
    },
    async finish() {
      await page.waitForLoadState("networkidle");
      check(
        report.blockedRequests.length === 0,
        "허용하지 않은 요청 차단: " + JSON.stringify(report.blockedRequests),
      );
      check(
        report.jsErrors.length === 0,
        "JavaScript 오류: " + JSON.stringify(report.jsErrors),
      );
      check(
        report.consoleErrors.length === 0,
        "콘솔 오류: " + JSON.stringify(report.consoleErrors),
      );
      check(
        report.httpFailures.length === 0,
        "HTTP 리소스 오류: " + JSON.stringify(report.httpFailures),
      );
      check(
        report.networkFailures.length === 0,
        "실패한 네트워크 요청: " + JSON.stringify(report.networkFailures),
      );
      // Browser audit inspects completed HTTP metadata, never CDP response
      // bodies. Explicit anonymous GET checks validate the actual data model.
      check(
        report.publicResponses.every(
          (item) =>
            item.status === 200 &&
            SPORTS.some((sport) => item.requestedId === sport + "-cup"),
        ),
        "Public RPC status or requested tournament mismatch",
      );
    },
  };
}

export function smoke(name, callback) {
  test(name, async ({ context, page }, info) => {
    const audit = await monitor(context, page);
    try {
      await callback({ context, page, audit });
      await audit.finish();
    } catch (error) {
      // Scrub before rethrow: failure artifacts must not capture player rosters
      // or request credentials. Unanticipated Playwright errors are summarized.
      await page.goto("about:blank").catch(() => {});
      throw new Error(
        error instanceof SafeFailure
          ? error.message
          : `화면 검증 실패 (${error.name}); 공개 감사 첨부 확인`,
      );
    } finally {
      await info.attach("sanitized-read-only-audit", {
        body: JSON.stringify(audit.report, null, 2),
        contentType: "application/json",
      });
    }
  });
}

export async function open(page, audit, route, selector, reload = false) {
  // Close the previous page's observation before direct navigation/reload.
  await page.waitForLoadState("networkidle");
  await audit.finish();
  audit.report.paths.push({ route, reload });
  const response = reload ? await page.reload() : await page.goto(SITE + route);
  check(response?.status() === 200, "페이지 HTTP 200 실패: " + route);
  await page.locator(selector).first().waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => document.fonts.ready);
  check(
    (await page.locator("h1").count()) === 1,
    "단일 페이지 제목 확인 실패: " + route,
  );
  const visual = await page.evaluate(() => {
    const rect = (element) => {
      const r = element.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        right: r.right,
        bottom: r.bottom,
        width: r.width,
        height: r.height,
      };
    };
    const overlap = (a, b) =>
      Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
      Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1;
    const header = [
      document.querySelector(".brand"),
      document.querySelector(".sport-selector"),
      document.querySelector(".public-nav"),
    ].map(rect);
    const links = [
      ...document.querySelectorAll(".sport-selector a,.public-nav a"),
    ].map(rect);
    const scores = [...document.querySelectorAll(".match-versus")].map((el) =>
      [...el.children].map(rect),
    );
    return {
      noOverflow: document.documentElement.scrollWidth <= innerWidth,
      noOverlap:
        !header.some((a, i) =>
          header.slice(i + 1).some((b) => overlap(a, b)),
        ) &&
        !links.some((a, i) => links.slice(i + 1).some((b) => overlap(a, b))) &&
        !scores.some((items) =>
          items.some((a, i) => items.slice(i + 1).some((b) => overlap(a, b))),
        ),
      linksInside: links.every((r) => r.x >= -1 && r.right <= innerWidth + 1),
      imagesLoaded: [...document.images].every(
        (img) => img.complete && img.naturalWidth > 0,
      ),
      cssLoaded:
        document.styleSheets.length > 0 &&
        getComputedStyle(document.querySelector(".header-inner")).display ===
          "grid",
    };
  });
  for (const [name, valid] of Object.entries(visual))
    check(valid, `화면/리소스 ${name} 실패: ${route}`);
}
