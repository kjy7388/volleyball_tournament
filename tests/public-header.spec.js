import { test, expect, login } from "./fixtures.js";
const paths = ["/", "/groups", "/bracket", "/schedule", "/teams"];
const labels = ["홈", "조별리그", "토너먼트", "경기 일정", "참가 반"];
test("웹폰트가 없어도 320px 로고 중심·종목 탭·공개 메뉴 유지", async ({
  page,
}) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (route) =>
    route.abort(),
  );
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/dodgeball");
  const brand = await page.locator(".brand").boundingBox();
  expect(Math.abs(brand.x + brand.width / 2 - 160)).toBeLessThan(2);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await expect(
    page.getByRole("navigation", { name: "종목 선택" }).getByRole("link"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("navigation", { name: "주 메뉴" }).getByRole("link"),
  ).toHaveText(labels);
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
});
for (const width of [1440, 1024, 768, 390, 320]) {
  test(`${width}px 일반 화면은 공개 메뉴 5개만 표시하고 관리자 이동 링크 없음`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const path of paths) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      const navigation = page.getByRole("navigation", { name: "주 메뉴" });
      await expect(navigation.getByRole("link")).toHaveText(labels);
      await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
      await expect(page.locator(".site-header .admin-link")).toHaveCount(0);
      for (const link of await navigation.getByRole("link").all())
        await expect(link).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      // Read both rectangles in one frame so a late web-font swap cannot mix layouts.
      const { brand, nav } = await page
        .locator(".site-header")
        .evaluate((header) => {
          const rectangle = (selector) => {
            const { x, y, width, height } = header
              .querySelector(selector)
              .getBoundingClientRect();
            return { x, y, width, height };
          };
          return { brand: rectangle(".brand"), nav: rectangle(".public-nav") };
        });
      if (width > 850) expect(brand.x + brand.width).toBeLessThanOrEqual(nav.x);
      else {
        expect(brand.y + brand.height).toBeLessThanOrEqual(nav.y + 1);
        expect(Math.abs(brand.x + brand.width / 2 - width / 2)).toBeLessThan(2);
      }
    }
    await page.goto("/");
    if (width === 1440 || width === 390)
      await page
        .locator(".site-header")
        .screenshot({ path: `test-results/public-header-${width}.png` });
    await page
      .getByRole("navigation", { name: "주 메뉴" })
      .getByRole("link", { name: "조별리그", exact: true })
      .click();
    await expect(page).toHaveURL(/\/groups$/);
  });
}
test("관리자 직접 접속·로그인·로그아웃·홈페이지 이동 버튼 유지", async ({
  page,
}) => {
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "대회 홈페이지", exact: true }),
  ).toBeVisible();
  await login(page);
  await expect(
    page.getByRole("button", { name: "로그아웃", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "대회 홈페이지", exact: true }).click();
  await expect(page).toHaveURL("http://127.0.0.1:5174/volleyball");
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  await page.goto("/admin");
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "대회 홈페이지", exact: true }),
  ).toBeVisible();
});
test("빈 대회 안내에도 관리자 페이지 이동 버튼을 표시하지 않음", async ({
  page,
  backend,
}) => {
  await backend.clear();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "등록된 대회가 없습니다" }),
  ).toBeVisible();
  await expect(page.locator('a[href^="/admin"]')).toHaveCount(0);
  await page.goto("/admin");
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
});
