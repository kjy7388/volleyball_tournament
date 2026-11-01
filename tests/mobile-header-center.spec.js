import { test, expect, login } from "./fixtures.js";
import { createInitialData } from "../src/data/initialTournament.js";

const title = "화곡중학교 배구·피구 대진표";
for (const width of [320, 375, 390, 430, 768, 1440]) {
  test(`${width}px 헤더 중심축·줄바꿈·탭·공개 메뉴·관리자 유지`, async ({
    page,
    backend,
  }) => {
    await backend.initialize(createInitialData("dodgeball"));
    await page.setViewportSize({ width, height: 900 });
    for (const sport of ["volleyball", "dodgeball"]) {
      await page.goto(`/${sport}`);
      await expect(page.locator(".hero")).toBeVisible();
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator(".intro-title")).toHaveText(title);
      expect(
        [...(await page.locator(".intro-title").textContent())].filter(
          (c) => c.codePointAt(0) === 0xb7,
        ),
      ).toEqual(["·"]);
      const layout = await measure(page);
      expect(layout.overflow).toBe(false);
      expect(layout.clipped).toEqual([]);
      expect(layout.tabWidthDifference).toBeLessThan(1);
      expect(Math.abs(layout.tabsCenter - width / 2)).toBeLessThan(1);
      if (width <= 600) {
        expect(layout.direction).toBe("column");
        for (const box of layout.boxes) {
          expect(Math.abs(box.center - width / 2), box.name).toBeLessThan(1);
          expect(box.x, box.name).toBeGreaterThanOrEqual(0);
          expect(box.right, box.name).toBeLessThanOrEqual(width);
        }
        for (let i = 1; i < layout.boxes.length; i++)
          expect(layout.boxes[i].top).toBeGreaterThanOrEqual(
            layout.boxes[i - 1].bottom,
          );
      } else {
        // The pre-existing tablet/PC logo remains beside the introduction.
        expect(layout.direction).toBe("row");
        expect(layout.boxes[0].right).toBeLessThanOrEqual(layout.boxes[1].x);
        expect(layout.logoMarginTop).toBe("8px");
      }
      await expect(page.locator(".public-nav a")).toHaveText([
        "홈",
        "조별리그",
        "토너먼트",
        "경기 일정",
        "참가 반",
      ]);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
      await page
        .locator(".site-header")
        .screenshot({
          path: `test-results/header-center-${width}-${sport}.png`,
        });
      await page
        .locator(".sport-selector")
        .getByRole("link", {
          name: sport === "volleyball" ? "피구" : "배구",
          exact: true,
        })
        .click();
      await expect(page).toHaveURL(
        new RegExp(`/${sport === "volleyball" ? "dodgeball" : "volleyball"}$`),
      );
      await page
        .locator(".public-nav")
        .getByRole("link", { name: "경기 일정", exact: true })
        .click();
      await expect(page).toHaveURL(/\/schedule$/);
    }
    await login(page);
    await expect(page.locator(".admin-sidebar")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "로그아웃", exact: true }),
    ).toBeVisible();
    const adminLayout = await measure(page);
    expect(adminLayout.overflow).toBe(false);
    if (width <= 600)
      for (const box of adminLayout.boxes)
        expect(
          Math.abs(box.center - width / 2),
          `admin ${box.name}`,
        ).toBeLessThan(1);
  });
}

async function measure(page) {
  return page.locator(".site-header").evaluate((header) => {
    const selectors = [
      ".brand img",
      ".intro-label",
      ".intro-title",
      ".intro-subtitle",
      ".intro-slogan",
    ];
    const elements = selectors.map((s) => header.querySelector(s));
    const rect = (e) => {
      const r = e.getBoundingClientRect();
      return {
        x: r.x,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        center: r.x + r.width / 2,
      };
    };
    const tabs = [...header.querySelectorAll(".sport-selector a")];
    return {
      direction: getComputedStyle(header.querySelector(".brand")).flexDirection,
      logoMarginTop: getComputedStyle(elements[0]).marginTop,
      overflow: document.documentElement.scrollWidth > innerWidth,
      clipped: elements
        .filter(
          (e) =>
            e.scrollWidth > e.clientWidth + 1 ||
            e.scrollHeight > e.clientHeight + 1,
        )
        .map((e) => e.className),
      boxes: elements.map((e, i) => ({ name: selectors[i], ...rect(e) })),
      tabWidthDifference: Math.abs(
        tabs[0].getBoundingClientRect().width -
          tabs[1].getBoundingClientRect().width,
      ),
      tabsCenter: (rect(tabs[0]).x + rect(tabs[1]).right) / 2,
    };
  });
}
