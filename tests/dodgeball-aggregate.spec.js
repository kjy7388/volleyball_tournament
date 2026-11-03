import { test, expect, login } from "./fixtures.js";
import { createInitialData } from "../src/data/initialTournament.js";
import { fillRound } from "./resultHelpers.js";
test("합산 승리·상한 해제·동점 3세트·세트 무승부·수동 경기 승자·취소", async ({
  page,
  backend,
}) => {
  await backend.initialize(createInitialData("dodgeball"));
  await login(page);
  await page.goto("/admin/dodgeball/matches");
  const other = JSON.stringify(await backend.snapshot());
  await page.locator(".match-card").first().click();
  let dialog = page.getByRole("dialog").first();
  await expect(dialog.locator(".round-survivors")).toHaveCount(3);
  await expect(dialog).toContainText("6분 또는 7분");
  await expect(dialog.locator(".round-survivors input[max]")).toHaveCount(0);
  await expect(
    dialog.getByLabel("3세트 1반 잔여 인원", { exact: true }),
  ).toBeDisabled();
  await fillRound(dialog, 1, "home", 15, 10);
  await fillRound(dialog, 2, "away", 2, 6);
  await expect(dialog.locator(".dodgeball-summary")).toContainText(
    "1반 17명 · 2반 16명",
  );
  await expect(dialog.locator(".dodgeball-summary")).toContainText(
    "1반 3점 · 2반 0점",
  );
  await expect(
    dialog.getByLabel("3세트 1반 잔여 인원", { exact: true }),
  ).toBeDisabled();
  await dialog
    .getByRole("button", { name: "경기 결과 확정", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    (await backend.snapshot("dodgeball-cup")).matches[0].winnerTeamId,
  ).toBe("team-1");
  await page.locator(".match-card").first().click();
  dialog = page.getByRole("dialog").first();
  await fillRound(dialog, 1, "home", 5, 5);
  await fillRound(dialog, 2, "away", 3, 3);
  await expect(dialog).toContainText("합계 동점 · 3세트 진행");
  await expect(
    dialog.getByLabel("3세트 1반 잔여 인원", { exact: true }),
  ).toBeEnabled();
  await expect(dialog.locator('input[type="checkbox"]')).toHaveCount(0);
  await fillRound(dialog, 3, "home", 12, 12);
  await expect(
    dialog.getByRole("button", { name: "경기 결과 확정", exact: true }),
  ).toBeDisabled();
  await dialog
    .getByLabel("3세트 동률 최종 경기 승리 반", { exact: true })
    .selectOption("away");
  await expect(dialog).toContainText("세트 자체는 무승부로 유지");
  await expect(dialog.locator(".dodgeball-summary")).toContainText(
    "1반 1점 · 2반 2점",
  );
  await dialog
    .getByRole("button", { name: "경기 결과 확정", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(JSON.stringify(await backend.snapshot())).toBe(other);
  await page.goto("/dodgeball/groups");
  const row = page.locator(".standings tbody tr").filter({ hasText: "2반" });
  await expect(row.locator(".standing-points")).toHaveText("2");
  await row.getByRole("button", { name: "2반 상세 기록", exact: true }).click();
  await expect(
    page
      .getByRole("dialog")
      .locator(".team-stat-card")
      .filter({ hasText: "세트 득실률" })
      .locator("dd"),
  ).toHaveText("—");
  await page.keyboard.press("Escape");
  await page.locator(".match-card").first().click();
  await expect(page.getByRole("dialog")).toContainText("세트 무승부");
  await expect(page.getByRole("dialog")).toContainText("최종 승리 반: 2반");
  await page.keyboard.press("Escape");
  await page.goto("/admin/dodgeball/matches");
  await page.locator(".match-card").first().click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "임시 저장", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .last()
    .getByRole("button", { name: "임시 저장으로 변경", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await backend.snapshot("dodgeball-cup")).matches[0].status).toBe(
    "live",
  );
});
