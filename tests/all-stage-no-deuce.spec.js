import { test, expect, login } from "./fixtures.js";
import { createDemoData } from "../src/services/tournamentStorage.js";
for (const width of [375, 1440])
  test(`${width}px 배구 결선 무듀스 입력·상세·규칙·기존 기록·로그아웃`, async ({
    page,
    backend,
  }) => {
    await backend.replace(createDemoData());
    await backend.initialize(createDemoData("dodgeball"));
    const original = await backend.snapshot();
    const dodge = JSON.stringify(await backend.snapshot("dodgeball-cup"));
    await page.setViewportSize({ width, height: 900 });
    await login(page);
    for (const number of [7, 9]) {
      await page.goto("/admin/volleyball/matches");
      await page
        .locator(".match-card")
        .filter({
          has: page.locator(".match-no", {
            hasText: String(number).padStart(2, "0"),
          }),
        })
        .click();
      const dialog = page.getByRole("dialog").first();
      await expect(dialog.locator(".competition-rules")).toContainText(
        "현재 경기: 결선 · 듀스 없음",
      );
      const fields = dialog
        .locator(".score-input-row")
        .first()
        .locator("input");
      await fields.nth(0).fill("14");
      await fields.nth(1).fill("14");
      await expect(
        dialog.getByRole("button", { name: "경기 결과 확정", exact: true }),
      ).toBeDisabled();
      await fields.nth(0).fill("16");
      await expect(
        dialog.getByRole("button", { name: "경기 결과 확정", exact: true }),
      ).toBeDisabled();
      await fields.nth(0).fill("15");
      await dialog
        .getByRole("button", { name: "경기 결과 확정", exact: true })
        .click();
      await expect(page.getByRole("dialog").last()).not.toContainText(
        "초기화됩니다",
      );
      await page
        .getByRole("dialog")
        .last()
        .getByRole("button", { name: "결과 확정", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
      const saved = await backend.snapshot();
      expect(saved.matches.filter((m) => m.stage === "group")).toEqual(
        original.matches.filter((m) => m.stage === "group"),
      );
      expect(saved.teams).toEqual(original.teams);
      expect(
        saved.matches.map((m) => [
          m.id,
          m.homeTeamId,
          m.awayTeamId,
          m.winnerTeamId,
          m.status,
        ]),
      ).toEqual(
        original.matches.map((m) => [
          m.id,
          m.homeTeamId,
          m.awayTeamId,
          m.winnerTeamId,
          m.status,
        ]),
      );
      await page.goto("/volleyball/bracket");
      await page
        .locator(".match-card")
        .filter({
          has: page.locator(".match-no", {
            hasText: String(number).padStart(2, "0"),
          }),
        })
        .click();
      await expect(page.getByRole("dialog")).toContainText(
        "준결승·결승 듀스 없음",
      );
      await expect(
        page.getByRole("dialog").locator(".set-row").nth(1).locator("b"),
      ).toHaveText(["15", "14"]);
      await page.keyboard.press("Escape");
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
    }
    expect(JSON.stringify(await backend.snapshot("dodgeball-cup"))).toBe(dodge);
    await page.goto("/volleyball");
    await expect(page.locator(".competition-rules")).toContainText(
      "조별리그·준결승·결승 모두 듀스 없음",
    );
    await page.goto("/volleyball/groups");
    await expect(page.locator(".notice").first()).toContainText(
      "모두 듀스 없음",
    );
    await page.goto("/admin/volleyball/settings");
    await expect(page.locator("form")).toContainText(
      "조별리그·준결승·결승 모두 듀스 없음",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByRole("button", { name: "로그아웃", exact: true }).click();
    await expect(page.locator(".login-panel")).toBeVisible();
  });
