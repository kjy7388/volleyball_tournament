import { test, expect, login } from "./fixtures.js";
import { createDemoData } from "../src/services/tournamentStorage.js";
test("익명으로 일반 5개 화면 조회, 관리자 직접 URL은 로그인 요구", async ({
  page,
}) => {
  for (const path of ["/", "/groups", "/bracket", "/schedule", "/teams"]) {
    await page.goto(path);
    await expect(page.locator("h1")).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "관리자 로그인" }),
    ).toHaveCount(0);
  }
  for (const path of [
    "/admin",
    "/admin/teams",
    "/admin/matches",
    "/admin/settings",
  ]) {
    await page.goto(path);
    await expect(
      page.getByRole("heading", { name: "관리자 로그인" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "변경 사항 저장" }),
    ).toHaveCount(0);
  }
});
test("잘못된 계정 로그인 실패", async ({ page }) => {
  await login(page, "admin@example.test", "wrong-password");
  await expect(page.getByRole("alert")).toContainText("이메일 또는 비밀번호");
  await expect(page.getByLabel("비밀번호")).toBeVisible();
});
test("정상 로그인 사용자도 관리자 목록에 없으면 접근 거부", async ({
  page,
}) => {
  await login(page, "viewer@example.test");
  await expect(
    page.getByRole("heading", { name: "관리자 권한이 없습니다" }),
  ).toBeVisible();
  await expect(page.locator(".team-editor")).toHaveCount(0);
});
test("로그인 유지와 로그아웃 후 직접 관리자 접근 차단", async ({ page }) => {
  await login(page);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "대회 운영 대시보드" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "로그아웃", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
  await page.goto("/admin/matches");
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
});
test("빈 DB는 자동 생성하지 않고 최초 관리자 샘플 등록만 허용", async ({
  page,
  backend,
}) => {
  await backend.clear();
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "등록된 대회가 없습니다" }),
  ).toBeVisible();
  expect(await backend.snapshot()).toBeNull();
  await expect(
    page.getByRole("button", { name: "최초 샘플 데이터 등록" }),
  ).toHaveCount(0);
  await page.goto("/admin");
  await page.getByLabel("이메일", { exact: true }).fill("admin@example.test");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page.getByRole("button", { name: "최초 샘플 데이터 등록" }).click();
  await page.getByRole("button", { name: "확인 후 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "대회 운영 대시보드" }),
  ).toBeVisible();
  expect((await backend.snapshot()).teams).toHaveLength(6);
});
test("조회 네트워크 오류 후 재시도", async ({ page, backend }) => {
  backend.setLoadFailure(true);
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "대회 정보를 불러오지 못했습니다" }),
  ).toBeVisible();
  backend.setLoadFailure(false);
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(page.locator(".hero")).toBeVisible();
});
test("저장 실패 시 성공 표시 없음, 입력 보관 후 재시도", async ({
  page,
  backend,
}) => {
  await login(page);
  await page.goto("/admin/teams");
  await page
    .locator(".team-editor")
    .first()
    .getByLabel("반 이름")
    .fill("재시도반");
  backend.setSaveFailure(true);
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await expect(page.locator(".toast.error")).toContainText("실패");
  await expect(
    page.locator(".team-editor").first().getByLabel("반 이름"),
  ).toHaveValue("재시도반");
  expect((await backend.snapshot()).teams[0].name).toBe("1반");
  backend.setSaveFailure(false);
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await expect(page.locator(".toast.success")).toContainText("저장");
  expect((await backend.snapshot()).teams[0].name).toBe("재시도반");
});
test("별도 브라우저 문맥 공유 조회, 포커스 복귀와 새로고침 갱신", async ({
  page,
  browser,
  backend,
}) => {
  await login(page);
  const viewer = await browser.newContext({ baseURL: "http://127.0.0.1:5174" });
  await backend.install(viewer);
  const publicPage = await viewer.newPage();
  await publicPage.goto("/");
  await expect(publicPage.locator(".hero")).toBeVisible();
  await page.goto("/admin");
  await page.getByRole("button", { name: "데모 적용" }).click();
  await page.getByRole("button", { name: "데모로 교체" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await publicPage.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(publicPage.locator(".hero h1")).toContainText("올해의 챔피언");
  await publicPage.reload();
  await expect(publicPage.locator(".hero h1")).toContainText("1반");
  await expect(publicPage.locator(".admin-banner")).toHaveCount(0);
  await viewer.close();
});
test("다른 관리자 변경은 미저장 입력을 덮어쓰지 않고 오래된 저장 거부", async ({
  page,
  backend,
}) => {
  await login(page);
  await page.goto("/admin/teams");
  const input = page.locator(".team-editor").first().getByLabel("반 이름");
  await input.fill("이전 편집");
  const current = await backend.snapshot();
  current.teams[0].name = "다른 관리자";
  await backend.replace(current);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".warning")).toContainText("다른 관리자");
  await expect(input).toHaveValue("이전 편집");
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await expect(page.locator(".toast.error")).toContainText("다른 관리자");
  expect((await backend.snapshot()).teams[0].name).toBe("다른 관리자");
});
test("저장 중 중복 입력 차단과 모달 유지", async ({ page, backend }) => {
  await login(page);
  await page.goto("/admin");
  backend.setSaveDelay(700);
  await page.getByRole("button", { name: "데모 적용" }).click();
  const button = page.getByRole("button", { name: "데모로 교체" });
  await button.click();
  await expect(button).toBeDisabled();
  await expect(page.locator("dialog")).toBeVisible();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect((await backend.snapshot()).isDemo).toBe(true);
});
test("JSON 최초 복원은 DB가 비어 있을 때만 제공", async ({ page, backend }) => {
  await backend.clear();
  await page.goto("/admin");
  await page.getByLabel("이메일", { exact: true }).fill("admin@example.test");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill("local-test-password");
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "backup.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(createDemoData())),
    });
  await page.getByRole("button", { name: "확인 후 저장" }).click();
  await expect(
    page.getByRole("heading", { name: "대회 운영 대시보드" }),
  ).toBeVisible();
  expect((await backend.snapshot()).isDemo).toBe(true);
  await expect(page.locator("input[type=file]")).toHaveCount(0);
});
test("기존 localStorage는 읽기·백업 대상으로만 유지", async ({
  page,
  backend,
}) => {
  await page.addInitScript(() =>
    localStorage.setItem(
      "volleyball-cup:data:v1",
      '{"old":"do not overwrite"}',
    ),
  );
  await page.goto("/");
  await expect(page.locator(".hero")).toBeVisible();
  expect((await backend.snapshot()).teams[0].name).toBe("1반");
  expect(
    await page.evaluate(() => localStorage.getItem("volleyball-cup:data:v1")),
  ).toBe('{"old":"do not overwrite"}');
});
test("만료된 세션의 갱신 실패 시 관리자 편집 차단", async ({ page }) => {
  await login(page);
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(
      (k) => k.startsWith("sb-") && k.endsWith("-auth-token"),
    );
    const session = JSON.parse(localStorage.getItem(key));
    session.expires_at = Math.floor(Date.now() / 1000) - 60;
    localStorage.setItem(key, JSON.stringify(session));
  });
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
  await page.goto("/admin/matches");
  await expect(
    page.getByRole("heading", { name: "관리자 로그인" }),
  ).toBeVisible();
  await expect(page.locator(".score-input-table")).toHaveCount(0);
});
