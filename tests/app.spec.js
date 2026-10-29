import { test, expect, login } from "./fixtures.js";
test.beforeEach(async ({ page, backend }) => {
  await login(page);
});
const key = "volleyball-cup:data:v1";
async function saveScore(page, number, home = true) {
  await page
    .locator(".match-card")
    .filter({
      has: page.locator(".match-no", {
        hasText: String(number).padStart(2, "0"),
      }),
    })
    .click();
  const dialog = page.locator("dialog").first();
  for (let i = 1; i <= 3; i++) {
    const inputs = dialog
      .locator(".score-input-row")
      .nth(i - 1)
      .locator("input");
    await inputs.nth(0).fill(home ? "25" : "20");
    await inputs.nth(1).fill(home ? "20" : "25");
  }
  await expect(
    dialog.locator(".score-input-row").nth(3).locator("input").first(),
  ).toBeDisabled();
  await dialog.getByRole("button", { name: "경기 결과 확정" }).click();
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
}
test("9경기 입력 → 조별 순위 → 준결승 → 결승 → 우승 → 새로고침", async ({
  page,
  backend,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/admin/matches");
  for (let i = 1; i <= 9; i++) await saveScore(page, i);
  const stored = await backend.snapshot();
  expect(stored.matches.filter((m) => m.status === "completed")).toHaveLength(
    9,
  );
  expect(stored.matches.find((m) => m.id === "final").winnerTeamId).toBe(
    "team-1",
  );
  await page.goto("/");
  await expect(page.locator(".hero h1")).toContainText("1반");
  await expect(page.locator(".hero h1")).toContainText("올해의 챔피언");
  await page.reload();
  await expect(page.locator(".hero h1")).toContainText("1반");
  await page.goto("/groups");
  await expect(page.locator(".qualified-tag")).toHaveCount(4);
  await page.goto("/bracket");
  await expect(page.locator(".has-champion h3")).toHaveText("1반");
  expect(errors).toEqual([]);
});
test("유효하지 않은 점수는 확정 불가 / 임시 저장은 순위에서 제외", async ({
  page,
  backend,
}) => {
  await page.goto("/admin/matches");
  await page.locator(".match-card").first().click();
  const d = page.locator("dialog");
  const first = d.locator(".score-input-row").first().locator("input");
  await first.nth(0).fill("25");
  await first.nth(1).fill("24");
  await expect(
    d.getByRole("button", { name: "경기 결과 확정" }),
  ).toBeDisabled();
  await expect(d.locator(".validation-errors")).toContainText("2점 차");
  await d.getByRole("button", { name: "임시 저장", exact: true }).click();
  await page.goto("/groups");
  await expect(
    page.locator(".standings tbody tr").first().locator("td").nth(2),
  ).toHaveText("0");
  await expect(page.locator(".status-live")).toHaveCount(1);
});
test("데모 적용, 이전 경기 수정 경고와 결선 기록 초기화", async ({
  page,
  backend,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "데모 적용" }).click();
  await page.getByRole("button", { name: "데모로 교체" }).click();
  await page.goto("/admin/matches");
  await page.locator(".match-card").first().click();
  const editor = page.locator("dialog").first();
  for (let i = 0; i < 3; i++) {
    const inputs = editor.locator(".score-input-row").nth(i).locator("input");
    await inputs.nth(0).fill("20");
    await inputs.nth(1).fill("25");
  }
  await editor.getByRole("button", { name: "경기 결과 확정" }).click();
  const confirmation = page.locator("dialog").last();
  await expect(confirmation).toContainText("초기화");
  await expect(confirmation).toContainText("준결승");
  await expect(confirmation).toContainText("결승");
  await confirmation
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  const data = await backend.snapshot();
  expect(
    data.matches
      .filter((m) => m.stage !== "group")
      .every((m) => m.status === "scheduled"),
  ).toBe(true);
  await page.goto("/");
  await expect(page.locator(".hero h1")).not.toContainText("올해의 챔피언");
});
test("반 이름·선수 추가/수정/삭제와 조 편성 검증", async ({
  page,
  backend,
}) => {
  await page.goto("/admin/teams");
  const card = page.locator(".team-editor").first();
  await card.getByLabel("반 이름").fill("테스트반");
  await card.getByRole("button", { name: "선수 추가" }).click();
  await card.locator(".player-input input").last().fill("새 선수");
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await expect(page.locator(".toast")).toContainText("저장");
  await page.goto("/teams");
  await expect(page.locator(".team-card").first()).toContainText("테스트반");
  await expect(page.locator(".team-card").first()).toContainText("새 선수");
  await page.goto("/admin/teams");
  await page
    .locator(".team-editor")
    .first()
    .getByLabel("소속 조")
    .selectOption("B");
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await expect(page.getByRole("alert")).toContainText("3개 반");
  await page
    .locator(".team-editor")
    .nth(3)
    .getByLabel("소속 조")
    .selectOption("A");
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await expect(page.locator("dialog")).toContainText("조 편성");
  await page.getByRole("button", { name: "확인 후 저장" }).click();
  await page
    .locator(".team-editor")
    .first()
    .getByRole("button", { name: "새 선수 삭제" })
    .click();
  await page.getByRole("button", { name: "선수 삭제", exact: true }).click();
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await page.goto("/teams");
  await expect(page.locator(".team-card").first()).not.toContainText("새 선수");
});
test("설정 변경과 일정 필터 및 상세 결과", async ({ page, backend }) => {
  await page.goto("/admin/settings");
  await page.getByLabel("대회명", { exact: true }).fill("우리 학교 배구대회");
  await page.getByLabel("시작일").fill("2026-11-24");
  await page.getByLabel("종료일").fill("2026-12-14");
  await page.getByLabel("경기 일시").first().fill("2026-11-24T14:30");
  await page.getByRole("button", { name: "설정 저장" }).first().click();
  await expect(page.locator(".toast")).toContainText("저장");
  await page.goto("/");
  await expect(page.locator(".hero-bottom")).toContainText(
    "우리 학교 배구대회",
  );
  await page.goto("/schedule");
  await page.getByRole("button", { name: "종료", exact: true }).click();
  await expect(page.locator(".empty-state")).toContainText("없습니다");
  await page.getByRole("button", { name: "예정", exact: true }).click();
  await expect(page.locator(".match-card")).toHaveCount(9);
  await page.locator(".match-card").first().click();
  await expect(page.locator("dialog")).toContainText("아직 경기가 시작되지");
});
test("PC 전체 페이지 정상 표시와 가로 넘침 검사", async ({ page, backend }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/",
    "/groups",
    "/bracket",
    "/schedule",
    "/teams",
    "/admin",
    "/admin/teams",
    "/admin/matches",
    "/admin/settings",
    "/missing",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await page.goto("/");
  await page.screenshot({
    path: "test-results/desktop-home.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
test("iPhone 크기에서 전체 페이지·브래킷·점수 입력 정상 표시", async ({
  page,
  backend,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/",
    "/groups",
    "/bracket",
    "/schedule",
    "/teams",
    "/admin",
    "/admin/teams",
    "/admin/matches",
    "/admin/settings",
  ]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
      path,
    ).toBe(true);
  }
  await page.goto("/");
  await page.screenshot({
    path: "test-results/mobile-home.png",
    fullPage: true,
  });
  await page.goto("/bracket");
  expect(
    await page
      .locator(".bracket")
      .evaluate((el) => getComputedStyle(el).flexDirection),
  ).toBe("column");
  await page.screenshot({
    path: "test-results/mobile-bracket.png",
    fullPage: true,
  });
  await page.goto("/admin/matches");
  await saveScore(page, 1);
  await page.reload();
  await expect(
    page.locator(".match-card").first().locator(".status-completed"),
  ).toBeVisible();
});
test("초기화 취소는 데이터 유지, 확인하면 예정 9경기로 복원", async ({
  page,
  backend,
}) => {
  await page.goto("/admin");
  await page.getByRole("button", { name: "데모 적용" }).click();
  await page.getByRole("button", { name: "취소", exact: true }).click();
  expect(await page.evaluate((k) => localStorage.getItem(k), key)).toBeNull();
  await page.getByRole("button", { name: "데모 적용" }).click();
  await page.getByRole("button", { name: "데모로 교체" }).click();
  await expect(page.locator(".toast")).toContainText("데모");
  await page.getByRole("button", { name: "초기화", exact: true }).click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "초기화", exact: true })
    .click();
  await page.goto("/schedule");
  await expect(page.locator(".status-scheduled")).toHaveCount(9);
});
test("3자 동률은 보류하고 관리자 확인 뒤에만 준결승 배정", async ({
  page,
  backend,
}) => {
  await page.goto("/admin/matches");
  for (let i = 1; i <= 6; i++) await saveScore(page, i, i !== 2);
  await expect(page.locator(".tie-resolver")).toBeVisible();
  let data = await backend.snapshot();
  expect(data.matches.find((m) => m.id === "sf-1").homeTeamId).toBeNull();
  const selects = page.locator(".tie-resolver select");
  await selects.nth(0).selectOption("team-3");
  await selects.nth(1).selectOption("team-1");
  await selects.nth(2).selectOption("team-2");
  await page.getByRole("button", { name: "순위 확인", exact: true }).click();
  await page.getByRole("button", { name: "확인 후 저장" }).click();
  data = await backend.snapshot();
  expect(data.matches.find((m) => m.id === "sf-1")).toMatchObject({
    homeTeamId: "team-3",
    awayTeamId: "team-5",
  });
  await expect(page.locator(".tie-resolver")).toHaveCount(0);
});
test("작은 모바일과 태블릿에서도 문서 가로 넘침 없음", async ({
  page,
  backend,
}) => {
  for (const width of [320, 375, 768, 1024]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of [
      "/",
      "/groups",
      "/bracket",
      "/admin/teams",
      "/admin/settings",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
        `${width}px ${path}`,
      ).toBe(true);
    }
  }
});
