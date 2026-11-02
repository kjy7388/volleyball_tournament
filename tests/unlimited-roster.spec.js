import { test, expect, login } from "./fixtures.js";
import { createDemoData } from "../src/services/tournamentStorage.js";
for (const sport of ["volleyball", "dodgeball"]) {
  test(`${sport}: 10→11→15명 등록·순서·공개 명단·경기·다른 종목 보존`, async ({
    page,
    backend,
  }) => {
    await backend.replace(createDemoData());
    await backend.initialize(createDemoData("dodgeball"));
    const otherId = sport === "volleyball" ? "dodgeball-cup" : "volleyball-cup";
    const before = await backend.snapshot(`${sport}-cup`),
      other = await backend.snapshot(otherId);
    await login(page);
    await page.setViewportSize({ width: 390, height: 900 });
    await page.goto(`/admin/${sport}/teams`);
    const card = page.locator(".team-editor").first();
    await expect(card.locator(".player-input")).toHaveCount(10);
    await expect(card.getByRole("button", { name: "선수 추가" })).toBeEnabled();
    for (let count = 11; count <= 15; count++) {
      await card.getByRole("button", { name: "선수 추가" }).click();
      await card
        .locator(".player-input input")
        .last()
        .fill(`추가 선수 ${count}`);
      if (count === 11 || count === 15) {
        await page
          .getByRole("button", { name: "변경 사항 저장", exact: true })
          .first()
          .click();
        await expect(page.locator(".toast")).toContainText("저장");
        await expect(card).toContainText(`등록 선수 ${count}명`);
      }
    }
    const saved = await backend.snapshot(`${sport}-cup`);
    expect(saved.teams[0].players).toHaveLength(15);
    expect(saved.teams[0].players.slice(0, 10)).toEqual(
      before.teams[0].players,
    );
    expect(saved.matches).toEqual(before.matches);
    expect(await backend.snapshot(otherId)).toEqual(other);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.reload();
    await expect(
      page.locator(".team-editor").first().locator(".player-input"),
    ).toHaveCount(15);
    await expect(
      page
        .locator(".team-editor")
        .first()
        .getByRole("button", { name: "선수 추가" }),
    ).toBeEnabled();
    await page.goto(`/${sport}/teams`);
    const publicCard = page.locator(".team-card").first();
    await expect(publicCard.locator(".player-list li")).toHaveCount(15);
    await expect(publicCard).toContainText("추가 선수 15");
  });
}
