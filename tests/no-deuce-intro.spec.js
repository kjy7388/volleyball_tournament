import { test, expect, login } from "./fixtures.js";
import { createInitialData } from "../src/data/initialTournament.js";
const title = "화곡중학교 배구·피구 대진표";

for (const width of [1440, 1024, 768, 390, 320])
  test(`${width}px 공통 소개 정확한 U+00B7·두 종목·관리자·반응형`, async ({
    page,
    backend,
  }) => {
    await backend.initialize(createInitialData("dodgeball"));
    await page.setViewportSize({ width, height: 900 });
    for (const sport of ["volleyball", "dodgeball"])
      for (const suffix of ["", "/groups", "/bracket", "/schedule", "/teams"]) {
        await page.goto(`/${sport}${suffix}`);
        await page.evaluate(() => document.fonts.ready);
        const intro = page.locator(".tournament-intro");
        await expect(intro.locator(".intro-label")).toHaveText(
          "SPORTS TOURNAMENT",
        );
        await expect(intro.locator(".intro-title")).toHaveText(title);
        expect(await intro.locator(".intro-title").textContent()).toBe(title);
        expect(
          [...(await intro.locator(".intro-title").textContent())]
            .filter((c) => c === "·")
            .map((c) => c.codePointAt(0)),
        ).toEqual([0x00b7]);
        await expect(intro.locator(".intro-subtitle")).toHaveText(
          "3학년 전환기 프로그램",
        );
        await expect(intro.locator(".intro-slogan")).toHaveText(
          "CLASS TOGETHER. PLAY TOGETHER.",
        );
        await expect(page.locator(".intro-title")).toHaveCount(1);
        const visual = await page.locator(".site-header").evaluate((header) => {
          const elements = [
            ".intro-label",
            ".intro-title",
            ".intro-subtitle",
            ".intro-slogan",
            ".sport-selector",
            ".public-nav",
          ].map((s) => header.querySelector(s));
          const boxes = elements.map((e) => e.getBoundingClientRect());
          return {
            overflow: document.documentElement.scrollWidth > innerWidth,
            clipped: elements.some(
              (e) =>
                e.scrollWidth > e.clientWidth + 1 ||
                e.scrollHeight > e.clientHeight + 1,
            ),
            sizes: elements.map((e) => ({
              className: e.className,
              width: e.clientWidth,
              scrollWidth: e.scrollWidth,
              height: e.clientHeight,
              scrollHeight: e.scrollHeight,
            })),
            overlap: boxes.some((a, i) =>
              boxes
                .slice(i + 1)
                .some(
                  (b) =>
                    Math.min(a.right, b.right) - Math.max(a.x, b.x) > 1 &&
                    Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y) > 1,
                ),
            ),
            titleFont: parseFloat(getComputedStyle(elements[1]).fontSize),
            subtitleFont: parseFloat(getComputedStyle(elements[2]).fontSize),
            sloganColor: getComputedStyle(elements[3]).color,
          };
        });
        expect(visual.overflow).toBe(false);
        expect(visual.clipped, JSON.stringify(visual.sizes)).toBe(false);
        expect(visual.overlap).toBe(false);
        expect(visual.titleFont).toBeGreaterThan(visual.subtitleFont);
        expect(visual.sloganColor).toBe("rgb(37, 99, 235)");
      }
    await page.goto("/admin/dodgeball");
    await expect(
      page.getByRole("heading", { name: "관리자 로그인", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".intro-title")).toHaveText(title);
    if (width === 1440 || width === 390) {
      await page.goto("/volleyball");
      await expect(page.locator(".hero")).toBeVisible();
      await page.screenshot({
        path: `test-results/no-deuce-intro-${width}.png`,
        fullPage: true,
      });
    }
  });

async function selectMatch(page, number = 1) {
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
async function fillSet(dialog, index, home, away) {
  const inputs = dialog.locator(".score-input-row").nth(index).locator("input");
  await inputs.nth(0).fill(String(home));
  await inputs.nth(1).fill(String(away));
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
test("24:24 임시 저장·25:24 확정·초과 입력 차단·스크롤 복원", async ({
  page,
  backend,
}) => {
  await login(page);
  await page.goto("/admin/volleyball/matches");
  let dialog = await selectMatch(page);
  await fillSet(dialog, 0, 26, 24);
  await expect(
    dialog.getByRole("button", { name: "임시 저장", exact: true }),
  ).toBeDisabled();
  await expect(dialog.locator(".validation-errors")).toContainText("목표 25점");
  await fillSet(dialog, 0, 24, 24);
  await expect(dialog).toContainText("진행 중");
  await expect(
    dialog.getByRole("button", { name: "경기 결과 확정", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect((await backend.snapshot()).matches[0]).toMatchObject({
    status: "live",
    winnerTeamId: null,
  });
  dialog = await selectMatch(page);
  for (let i = 0; i < 3; i++) await fillSet(dialog, i, 25, 24);
  await expect(
    dialog.locator(".score-input-row").nth(3).locator("input").first(),
  ).toBeDisabled();
  await confirm(page);
  expect((await backend.snapshot()).matches[0]).toMatchObject({
    status: "completed",
    winnerTeamId: "team-1",
  });
  expect(
    await page.evaluate(() => [
      document.body.style.overflow,
      document.documentElement.style.overflow,
    ]),
  ).toEqual(["", ""]);
  await page.mouse.move(30, 200);
  await page.mouse.wheel(0, 500);
  await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
});
test("5세트 14:14 임시 저장·16:14 차단·15:14로 3:2 확정", async ({
  page,
  backend,
}) => {
  await login(page);
  await page.goto("/admin/volleyball/matches");
  let dialog = await selectMatch(page);
  for (const [i, score] of [
    [25, 24],
    [24, 25],
    [25, 24],
    [24, 25],
    [14, 14],
  ].entries())
    await fillSet(dialog, i, ...score);
  await expect(
    dialog.getByRole("button", { name: "경기 결과 확정", exact: true }),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  dialog = await selectMatch(page);
  await fillSet(dialog, 4, 16, 14);
  await expect(
    dialog.getByRole("button", { name: "임시 저장", exact: true }),
  ).toBeDisabled();
  await fillSet(dialog, 4, 15, 14);
  await confirm(page);
  const saved = (await backend.snapshot()).matches[0];
  expect(saved.status).toBe("completed");
  expect(saved.sets[4]).toEqual({ home: 15, away: 14 });
});
test("배구 25:24로 9경기 완주·순위/결선/우승·피구 독립성", async ({
  page,
  backend,
}) => {
  await backend.initialize(createInitialData("dodgeball"));
  const dodgeBefore = JSON.stringify(await backend.snapshot("dodgeball-cup"));
  await login(page);
  await page.goto("/admin/volleyball/matches");
  for (let number = 1; number <= 9; number++) {
    const dialog = await selectMatch(page, number);
    for (let i = 0; i < 3; i++) await fillSet(dialog, i, 25, 24);
    await confirm(page);
  }
  const d = await backend.snapshot();
  expect(d.matches.every((m) => m.status === "completed")).toBe(true);
  expect(d.matches.find((m) => m.id === "final").winnerTeamId).toBe("team-1");
  expect(JSON.stringify(await backend.snapshot("dodgeball-cup"))).toBe(
    dodgeBefore,
  );
  await page.goto("/volleyball");
  await expect(page.locator(".hero")).toContainText("올해의 챔피언");
  await expect(page.locator(".intro-title")).toHaveText(title);
});
