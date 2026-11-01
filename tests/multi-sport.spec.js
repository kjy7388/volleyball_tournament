import { test, expect, login } from "./fixtures.js";
import { createInitialData } from "../src/data/initialTournament.js";
import {
  createDemoData,
  planMatchUpdate,
} from "../src/services/tournamentStorage.js";
const sportTab = (page, name) =>
  page
    .getByRole("navigation", { name: "종목 선택" })
    .getByRole("link", { name, exact: true });
test("종목 전환 시 늦은 배구 응답 격리와 피구 포커스 재조회 대체 갱신", async ({
  page,
  backend,
}) => {
  await backend.initialize(createInitialData("dodgeball"));
  let release, seen;
  const held = new Promise((resolve) => {
    release = resolve;
  });
  const requested = new Promise((resolve) => {
    seen = resolve;
  });
  await page.route("**/rest/v1/rpc/get_public_tournament", async (route) => {
    if (route.request().postDataJSON()?.p_id === "volleyball-cup") {
      seen();
      await held;
    }
    await route.fallback();
  });
  await page.goto("/volleyball");
  await requested;
  await sportTab(page, "피구").click();
  await expect(page.locator(".hero-bottom")).toContainText("DODGEBALL CUP");
  const oldResponse = page.waitForResponse(
    (response) =>
      response.url().endsWith("/get_public_tournament") &&
      response.request().postDataJSON()?.p_id === "volleyball-cup",
  );
  release();
  await (await oldResponse).finished();
  await expect(page.locator(".hero-bottom")).toContainText("DODGEBALL CUP");
  const d = await backend.snapshot("dodgeball-cup");
  d.tournament.name = "포커스 갱신된 피구대회";
  await backend.replace(d);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".hero-bottom")).toContainText(
    "포커스 갱신된 피구대회",
  );
});
async function openMatch(page, number = 1) {
  await page
    .locator(".match-card")
    .filter({
      has: page.locator(".match-no", {
        hasText: String(number).padStart(2, "0"),
      }),
    })
    .click();
  return page.locator("dialog").first();
}
async function confirm(page) {
  await page
    .locator("dialog")
    .first()
    .getByRole("button", { name: "경기 결과 확정", exact: true })
    .click();
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
}
test("기존 URL 9개는 배구 새 경로로 리다이렉트", async ({ page }) => {
  for (const suffix of ["", "/groups", "/bracket", "/schedule", "/teams"]) {
    await page.goto("/" + suffix.replace(/^\//, ""));
    await expect(page).toHaveURL(new RegExp("/volleyball" + suffix + "$"));
    await expect(page.locator("h1")).toBeVisible();
  }
  for (const suffix of ["", "/teams", "/matches", "/settings"]) {
    await page.goto("/admin" + suffix);
    await expect(page).toHaveURL(
      new RegExp("/admin/volleyball" + suffix + "$"),
    );
    await expect(page.locator(".login-panel")).toBeVisible();
  }
});
test("두 종목 공개 화면 10개·탭·메뉴, 320/390/768/1440px 가로 넘침 없음", async ({
  page,
  backend,
}) => {
  await backend.initialize(createInitialData("dodgeball"));
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const sport of ["volleyball", "dodgeball"])
      for (const suffix of ["", "/groups", "/bracket", "/schedule", "/teams"]) {
        await page.goto("/" + sport + suffix);
        await expect(page.locator("h1")).toBeVisible();
        await expect(
          sportTab(page, sport === "volleyball" ? "배구" : "피구"),
        ).toHaveAttribute("aria-current", "page");
        await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth,
          ),
          width + " " + sport + suffix,
        ).toBe(true);
        await expect(
          page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link"),
        ).toHaveCount(5);
      }
    await page.goto("/dodgeball/bracket");
    expect(
      await page
        .locator(".bracket")
        .evaluate((el) => getComputedStyle(el).flexDirection),
    ).toBe(width < 768 ? "column" : "row");
    if (width === 390 || width === 1440)
      await page.screenshot({
        path: `test-results/sports-home-${width}.png`,
        fullPage: true,
      });
  }
  await page.goto("/volleyball/teams");
  await sportTab(page, "피구").click();
  await expect(page).toHaveURL(/\/dodgeball\/teams$/);
  await sportTab(page, "배구").click();
  await expect(page).toHaveURL(/\/volleyball\/teams$/);
  expect(errors).toEqual([]);
});
test("관리자 로그인 유지·양쪽 8화면·종목별 선수 및 설정 분리·로그아웃", async ({
  page,
  backend,
}) => {
  await backend.initialize(createInitialData("dodgeball"));
  await login(page);
  for (const sport of ["volleyball", "dodgeball"])
    for (const suffix of ["", "/teams", "/matches", "/settings"]) {
      await page.goto("/admin/" + sport + suffix);
      await expect(page.locator("h1")).toBeVisible();
      await expect(page.locator(".login-panel")).toHaveCount(0);
    }
  await page.goto("/admin/dodgeball/teams");
  await page
    .locator(".team-editor")
    .first()
    .getByLabel("반 이름", { exact: true })
    .fill("피구 전용 반");
  await page
    .locator(".team-editor")
    .first()
    .locator(".player-input input")
    .first()
    .fill("피구 선수");
  await page
    .getByRole("button", { name: "변경 사항 저장", exact: true })
    .first()
    .click();
  await expect(page.locator(".toast")).toContainText("저장");
  await sportTab(page, "배구").click();
  await expect(
    page.locator(".team-editor").first().getByLabel("반 이름", { exact: true }),
  ).toHaveValue("1반");
  expect((await backend.snapshot()).teams[0].players[0].name).not.toBe(
    "피구 선수",
  );
  await page.goto("/admin/dodgeball/settings");
  await expect(page.locator("main")).not.toContainText("세트별 목표 점수");
  await page.getByLabel("대회명", { exact: true }).fill("우리 피구대회");
  await page.getByRole("button", { name: "설정 저장" }).first().click();
  await expect(page.locator(".toast")).toContainText("저장");
  expect((await backend.snapshot()).tournament.name).toBe("VOLLEYBALL CUP");
  await sportTab(page, "배구").click();
  await expect(page.getByLabel("대회명", { exact: true })).toHaveValue(
    "VOLLEYBALL CUP",
  );
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(page.locator(".login-panel")).toBeVisible();
  await sportTab(page, "피구").click();
  await expect(page.locator(".login-panel")).toBeVisible();
});
test("피구 9경기 확정→순위→준결승→결승→우승, 다른 브라우저 조회·스크롤 복원", async ({
  page,
  backend,
  browser,
}) => {
  await backend.initialize(createInitialData("dodgeball"));
  await login(page);
  await page.goto("/admin/dodgeball/matches");
  const before = await backend.snapshot();
  for (let number = 1; number <= 9; number++) {
    const dialog = await openMatch(page, number);
    for (let i = 1; i <= 5; i++)
      await dialog
        .getByLabel(i + "판 승리 반", { exact: true })
        .selectOption(i % 2 === 1 ? "home" : "away");
    await expect(dialog.locator(".editor-score")).toContainText("판 스코어");
    await confirm(page);
    expect(
      await page.evaluate(() => [
        document.body.style.overflow,
        document.documentElement.style.overflow,
      ]),
    ).toEqual(["", ""]);
  }
  await page.evaluate(() => scrollTo(0, 0));
  await page.mouse.move(250, 250);
  await page.mouse.wheel(0, 600);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  expect(await backend.snapshot()).toEqual(before);
  const d = await backend.snapshot("dodgeball-cup");
  expect(d.matches.every((m) => m.status === "completed")).toBe(true);
  const other = await browser.newContext();
  await backend.install(other);
  const publicPage = await other.newPage();
  await publicPage.goto("/dodgeball");
  await expect(publicPage.locator(".hero")).toContainText("올해의 챔피언");
  await publicPage.reload();
  await expect(publicPage.locator(".hero")).toContainText("1반");
  await publicPage.goto("/dodgeball/groups");
  await expect(publicPage.locator(".qualified-tag")).toHaveCount(4);
  await expect(publicPage.locator("table").first()).toContainText("승리 판");
  await expect(publicPage.locator("table").first()).not.toContainText("득실점");
  await publicPage.goto("/dodgeball/bracket");
  await expect(publicPage.locator(".has-champion h3")).toHaveText("1반");
  await publicPage.locator(".match-card").last().click();
  await expect(publicPage.locator("dialog .set-results")).toContainText("1판");
  await expect(publicPage.locator("dialog .set-results")).toContainText("승리");
  await other.close();
});
test("피구 앞 판 변경·3승 후 비활성·임시 저장·실패·취소·확정 취소·재확정", async ({
  page,
  backend,
}) => {
  await backend.initialize(createInitialData("dodgeball"));
  await login(page);
  await page.goto("/admin/dodgeball/matches");
  let dialog = await openMatch(page);
  for (let i = 1; i <= 3; i++)
    await dialog
      .getByLabel(i + "판 승리 반", { exact: true })
      .selectOption("home");
  await expect(
    dialog.getByLabel("4판 승리 반", { exact: true }),
  ).toBeDisabled();
  await dialog.getByLabel("1판 승리 반", { exact: true }).selectOption("away");
  await expect(dialog.getByLabel("2판 승리 반", { exact: true })).toHaveValue(
    "",
  );
  await expect(
    dialog.getByRole("button", { name: "경기 결과 확정" }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await page.goto("/dodgeball/groups");
  await expect(
    page.locator(".standings tbody tr").first().locator("td").nth(2),
  ).toHaveText("0");
  await page.goto("/admin/dodgeball/matches");
  dialog = await openMatch(page);
  for (let i = 1; i <= 3; i++)
    await dialog
      .getByLabel(i + "판 승리 반", { exact: true })
      .selectOption("home");
  await dialog
    .getByRole("button", { name: "경기 결과 확정", exact: true })
    .click();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(1);
  await dialog
    .getByRole("button", { name: "경기 결과 확정", exact: true })
    .click();
  backend.setSaveFailure(true);
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("실패");
  await expect(page.locator("dialog")).toHaveCount(2);
  backend.setSaveFailure(false);
  await page.keyboard.press("Escape");
  await confirm(page);
  dialog = await openMatch(page);
  await dialog.getByRole("button", { name: "임시 저장", exact: true }).click();
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "임시 저장으로 변경", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect((await backend.snapshot("dodgeball-cup")).matches[0]).toMatchObject({
    status: "live",
    winnerTeamId: null,
  });
  dialog = await openMatch(page);
  await confirm(page);
  expect((await backend.snapshot("dodgeball-cup")).matches[0].status).toBe(
    "completed",
  );
});
test("피구 명단 최초 복사 확인, 기존 데이터 덮어쓰기 없음·데모/초기화 종목 분리", async ({
  page,
  backend,
}) => {
  const v = await backend.snapshot();
  v.teams[0].name = "복사할 반";
  v.teams[0].players[0].name = "복사할 선수";
  await backend.replace(v);
  await login(page);
  await sportTab(page, "피구").click();
  await page
    .getByRole("button", { name: "배구 참가 반·선수 명단으로 최초 생성" })
    .click();
  expect(await backend.snapshot("dodgeball-cup")).toBeNull();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await page
    .getByRole("button", { name: "배구 참가 반·선수 명단으로 최초 생성" })
    .click();
  await page.getByRole("button", { name: "확인 후 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "대회 운영 대시보드" }),
  ).toBeVisible();
  expect((await backend.snapshot("dodgeball-cup")).teams[0]).toMatchObject({
    name: "복사할 반",
    players: expect.arrayContaining([
      expect.objectContaining({ name: "복사할 선수" }),
    ]),
  });
  await expect(
    page.getByRole("button", { name: "배구 참가 반·선수 명단으로 최초 생성" }),
  ).toHaveCount(0);
  const before = await backend.snapshot();
  await page.getByRole("button", { name: "데모 적용" }).click();
  await page.getByRole("button", { name: "데모로 교체" }).click();
  await expect(page.locator(".toast")).toContainText("데모");
  expect((await backend.snapshot("dodgeball-cup")).tournament.status).toBe(
    "completed",
  );
  expect(await backend.snapshot()).toEqual(before);
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "초기화", exact: true })
    .click();
  await expect(page.locator(".toast")).toContainText("초기화");
  expect(
    (await backend.snapshot("dodgeball-cup")).matches.every(
      (m) => m.status === "scheduled",
    ),
  ).toBe(true);
  expect(await backend.snapshot()).toEqual(before);
});
test("피구 순환 동률 관리자 확정·일반 화면 표시·진행 결선 수정 보호", async ({
  page,
  backend,
}) => {
  let d = createInitialData("dodgeball");
  for (const m of d.matches.filter((m) => m.stage === "group"))
    d = planMatchUpdate(
      d,
      m.id,
      Array.from({ length: 5 }, (_, i) => ({
        winner: i < 3 ? (m.id === "g-A-2" ? "away" : "home") : null,
      })),
      "confirm",
    ).data;
  await backend.initialize(d);
  await login(page);
  await page.goto("/admin/dodgeball/matches");
  await expect(page.locator(".tie-resolver")).toBeVisible();
  for (const [i, id] of ["team-3", "team-1", "team-2"].entries())
    await page.locator(".tie-resolver select").nth(i).selectOption(id);
  await page.getByRole("button", { name: "순위 확인", exact: true }).click();
  await page.getByRole("button", { name: "확인 후 저장" }).click();
  await expect(page.locator(".tie-resolver")).toHaveCount(0);
  await page.goto("/dodgeball/groups");
  await expect(page.locator(".standings").first()).toContainText("관리자 확정");
  await backend.replace(createDemoData("dodgeball"));
  await page.goto("/admin/dodgeball/matches");
  const dialog = await openMatch(page);
  for (let i = 1; i <= 3; i++)
    await dialog
      .getByLabel(i + "판 승리 반", { exact: true })
      .selectOption("away");
  await dialog.getByRole("button", { name: "경기 결과 확정" }).click();
  await expect(page.locator("dialog").last()).toContainText("준결승");
  await expect(page.locator("dialog").last()).toContainText("결승");
  await page.keyboard.press("Escape");
  await page.keyboard.press("Escape");
  expect((await backend.snapshot("dodgeball-cup")).tournament.status).toBe(
    "completed",
  );
});
