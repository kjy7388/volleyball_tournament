import { test, expect, login } from "./fixtures.js";
import { createDemoData } from "../src/services/tournamentStorage.js";
import { fillRound, makeRosterSpace } from "./resultHelpers.js";
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
test("배구 준결승 15:14 임시·16:14 확정과 결승 기록 보호", async ({
  page,
  backend,
}) => {
  await backend.replace(createDemoData());
  await login(page);
  await page.goto("/admin/volleyball/matches");
  const d = await openMatch(page, 7);
  await expect(d.locator(".score-input-row")).toHaveCount(3);
  const first = d.locator(".score-input-row").first().locator("input");
  await first.nth(1).fill("14");
  await expect(
    d.getByRole("button", { name: "경기 결과 확정", exact: true }),
  ).toBeDisabled();
  await first.nth(0).fill("16");
  await confirm(page);
  const saved = await backend.snapshot();
  expect(saved.matches.find((m) => m.id === "sf-1").sets[0]).toEqual({
    home: 16,
    away: 14,
  });
  expect(saved.matches.find((m) => m.id === "final").status).toBe("completed");
});
test("피구 잔여 인원·동률 수동 지정·2:1 승점·모달 스크롤 복원", async ({
  page,
  backend,
}) => {
  await backend.initialize(
    (await import("../src/data/initialTournament.js")).createInitialData(
      "dodgeball",
    ),
  );
  await login(page);
  await page.goto("/admin/dodgeball/matches");
  const d = await openMatch(page);
  await fillRound(d, 1, "home");
  await fillRound(d, 2, "home", 5, 5);
  await expect(d).toContainText("승부 미결정");
  await expect(
    d.getByRole("button", { name: "경기 결과 확정", exact: true }),
  ).toBeDisabled();
  await d.getByLabel("2판 승리 반", { exact: true }).selectOption("away");
  await fillRound(d, 3, "home");
  await d.screenshot({ path: "test-results/three-set-dodgeball-editor.png" });
  await confirm(page);
  const saved = (await backend.snapshot("dodgeball-cup")).matches[0];
  expect(saved.rounds[1]).toMatchObject({
    homeRemaining: 5,
    awayRemaining: 5,
    winner: "away",
    manualWinner: true,
  });
  expect(saved.winnerTeamId).toBe("team-1");
  await page.goto("/dodgeball/groups");
  await expect(page.locator(".standing-points").first()).toHaveText("2");
  await page.locator(".match-card").first().click();
  await expect(page.locator("dialog")).toContainText("관리자 지정");
  await expect(page.locator("dialog")).toContainText("7명");
  await page.keyboard.press("Escape");
  expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
});
test("등록 인원 안내와 10명 이상 추가·삭제 관리", async ({ page }) => {
  await login(page);
  await page.goto("/admin/volleyball/teams");
  const card = page.locator(".team-editor").first();
  await expect(card).toContainText("등록 선수 10명");
  await expect(card.getByRole("button", { name: "선수 추가" })).toBeEnabled();
  await makeRosterSpace(page, card);
  await expect(card).toContainText("등록 선수 9명");
  await expect(card.getByRole("button", { name: "선수 추가" })).toBeEnabled();
  await page
    .getByRole("button", { name: "변경 사항 저장", exact: true })
    .first()
    .click();
  await expect(page.locator(".toast")).toContainText("저장");
});
for (const width of [320, 390])
  test(`${width}px 승점 순위·상세 비율·잔여 인원 차 확인`, async ({
    page,
    backend,
  }) => {
    await backend.replace(createDemoData());
    await backend.initialize(createDemoData("dodgeball"));
    await page.setViewportSize({ width, height: 900 });
    for (const sport of ["volleyball", "dodgeball"]) {
      await page.goto(`/${sport}/groups`);
      await expect(page.locator(".standings tbody tr")).toHaveCount(6);
      const row = page.locator(".standings tbody tr").first();
      await row.getByText("상세 기록", { exact: true }).click();
      const stats = page.getByRole("dialog");
      await expect(stats).toContainText("승점");
      await expect(stats).toContainText("세트 득실률");
      await expect(stats).toContainText(
        sport === "volleyball" ? "점수 득실률" : "잔여 인원수 차",
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.screenshot({
        path: `test-results/three-set-${sport}-${width}.png`,
        fullPage: true,
      });
      await page.keyboard.press("Escape");
    }
  });
