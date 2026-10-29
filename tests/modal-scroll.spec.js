import { test, expect, login } from "./fixtures.js";

async function overflowState(page) {
  return page.evaluate(() =>
    [document.documentElement, document.body].map((element) => ({
      overflow: element.style.getPropertyValue("overflow"),
      x: element.style.getPropertyValue("overflow-x"),
      y: element.style.getPropertyValue("overflow-y"),
      priority: ["overflow", "overflow-x", "overflow-y"].map((property) =>
        element.style.getPropertyPriority(property),
      ),
      classes: element.className,
      computed: getComputedStyle(element).overflow,
    })),
  );
}
async function openScoreConfirmation(page) {
  await page.locator(".match-card").first().click();
  const editor = page.locator("dialog").first();
  const scores = [
    [25, 20],
    [20, 25],
    [25, 22],
    [23, 25],
    [15, 12],
  ];
  for (let i = 0; i < scores.length; i++) {
    const inputs = editor.locator(".score-input-row").nth(i).locator("input");
    await inputs.nth(0).fill(String(scores[i][0]));
    await inputs.nth(1).fill(String(scores[i][1]));
  }
  await editor
    .getByRole("button", { name: "경기 결과 확정", exact: true })
    .click();
  await expect(page.locator("dialog[open]")).toHaveCount(2);
}
async function wheelScrolls(page) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.mouse.move(30, 160);
  await page.mouse.wheel(0, 500);
  await expect
    .poll(() => page.evaluate(() => window.scrollY))
    .toBeGreaterThan(100);
}
test("5세트 결과 저장으로 두 모달이 동시에 닫혀도 스크롤 복원", async ({
  page,
  backend,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page);
  await page.goto("/admin/matches");
  const before = await overflowState(page);
  await openScoreConfirmation(page);
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  expect((await backend.snapshot()).matches[0].winnerTeamId).toBe("team-1");
  await expect.poll(() => overflowState(page)).toEqual(before);
  await wheelScrolls(page);
});
async function expectLocked(page) {
  await expect
    .poll(() =>
      page.evaluate(() =>
        [document.documentElement, document.body].map(
          (element) => getComputedStyle(element).overflow,
        ),
      ),
    )
    .toEqual(["hidden", "hidden"]);
}
async function dismissTop(page, method) {
  if (method === "cancel")
    await page
      .locator("dialog")
      .last()
      .getByRole("button", { name: "취소", exact: true })
      .click();
  else if (method === "outside") await page.mouse.click(1, 1);
  else if (method === "escape") await page.keyboard.press("Escape");
  else
    await page
      .locator("dialog")
      .last()
      .getByRole("button", { name: "창 닫기", exact: true })
      .click();
}
for (const method of ["cancel", "escape", "outside"]) {
  test(`확인 모달 ${method} 종료는 부모 잠금을 유지하고 마지막 종료 시 복원`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 650 });
    await login(page);
    await page.goto("/admin/matches");
    const before = await overflowState(page);
    await openScoreConfirmation(page);
    await dismissTop(page, method);
    await expect(page.locator("dialog[open]")).toHaveCount(1);
    await expectLocked(page);
    const position = await page.evaluate(() => window.scrollY);
    await page.mouse.move(1, 1);
    await page.mouse.wheel(0, 500);
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve)),
        ),
    );
    expect(await page.evaluate(() => window.scrollY)).toBe(position);
    await dismissTop(page, method === "cancel" ? "close" : method);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect.poll(() => overflowState(page)).toEqual(before);
    await wheelScrolls(page);
  });
}
test("저장 실패 시 열린 모달의 잠금을 유지하고 취소·종료하면 복원", async ({
  page,
  backend,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page);
  await page.goto("/admin/matches");
  const before = await overflowState(page);
  await openScoreConfirmation(page);
  backend.setSaveFailure(true);
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.locator(".toast.error")).toContainText("실패");
  await expect(page.locator("dialog[open]")).toHaveCount(2);
  await expectLocked(page);
  expect((await backend.snapshot()).matches[0].status).toBe("scheduled");
  await dismissTop(page, "cancel");
  await expectLocked(page);
  await dismissTop(page, "close");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect.poll(() => overflowState(page)).toEqual(before);
  await wheelScrolls(page);
});
test("중첩 모달이 열린 채 페이지를 전환해도 cleanup과 native dialog 해제", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page);
  await page.goto("/admin/matches");
  const before = await overflowState(page);
  await openScoreConfirmation(page);
  await page.evaluate(() => {
    history.pushState({}, "", "/admin/settings");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "대회 설정", exact: true }),
  ).toBeVisible();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect.poll(() => overflowState(page)).toEqual(before);
  await wheelScrolls(page);
});
test("기존 축별 overflow·important·CSS 클래스와 unrelated 인라인 변경 보존", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page);
  await page.goto("/admin/matches");
  await page.evaluate(() => {
    const style = document.createElement("style");
    style.textContent =
      ".preserve-scroll-class { overflow-y: scroll !important; }";
    document.head.append(style);
    document.documentElement.classList.add("preserve-scroll-class");
    document.body.classList.add("preserve-body-class");
    document.documentElement.style.setProperty("overflow-x", "hidden");
    document.documentElement.style.setProperty(
      "overflow-y",
      "scroll",
      "important",
    );
    document.body.style.setProperty("overflow", "visible", "important");
    document.body.style.setProperty("overflow-x", "clip", "important");
  });
  const before = await overflowState(page);
  await openScoreConfirmation(page);
  await page.evaluate(() =>
    document.body.style.setProperty("padding-top", "7px"),
  );
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect.poll(() => overflowState(page)).toEqual(before);
  expect(await page.evaluate(() => document.body.style.paddingTop)).toBe("7px");
  await wheelScrolls(page);
});
test("임시 저장 성공으로 단일 모달이 닫힐 때도 스크롤 복원", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page);
  await page.goto("/admin/matches");
  const before = await overflowState(page);
  await page.locator(".match-card").first().click();
  await page
    .locator(".score-input-row")
    .first()
    .locator("input")
    .first()
    .fill("10");
  await page.getByRole("button", { name: "임시 저장", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect.poll(() => overflowState(page)).toEqual(before);
  await wheelScrolls(page);
});
test("선수 삭제·조 편성 확인·경기 상세 모달에도 동일하게 스크롤 복원", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page);
  await page.goto("/admin/teams");
  const before = await overflowState(page);
  const first = page.locator(".team-editor").first();
  await first.getByRole("button", { name: /삭제/ }).first().click();
  await dismissTop(page, "cancel");
  await expect.poll(() => overflowState(page)).toEqual(before);
  await first.getByRole("button", { name: /삭제/ }).first().click();
  await page
    .locator("dialog")
    .getByRole("button", { name: "선수 삭제", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect.poll(() => overflowState(page)).toEqual(before);
  await first.getByLabel("소속 조").selectOption("B");
  await page
    .locator(".team-editor")
    .nth(3)
    .getByLabel("소속 조")
    .selectOption("A");
  await page.getByRole("button", { name: "변경 사항 저장" }).first().click();
  await dismissTop(page, "escape");
  await expect.poll(() => overflowState(page)).toEqual(before);
  await wheelScrolls(page);
  await page.goto("/schedule");
  for (const method of ["close", "escape", "outside"]) {
    await page.locator(".match-card").first().click();
    await expectLocked(page);
    await dismissTop(page, method);
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect.poll(() => overflowState(page)).toEqual(before);
    await wheelScrolls(page);
  }
});
test("대회 설정의 최신 데이터 확인창 취소·확인도 스크롤에 영향 없음", async ({
  page,
  backend,
}) => {
  await page.setViewportSize({ width: 1280, height: 650 });
  await login(page);
  await page.goto("/admin/settings");
  const before = await overflowState(page);
  await page.getByLabel("대회명", { exact: true }).fill("입력 중");
  const next = await backend.snapshot();
  next.tournament.name = "다른 관리자 변경";
  await backend.replace(next);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.locator(".warning")).toContainText("다른 관리자");
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.getByRole("button", { name: "최신 데이터로 다시 편집" }).click();
  await expect.poll(() => overflowState(page)).toEqual(before);
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "최신 데이터로 다시 편집" }).click();
  await expect(page.getByLabel("대회명", { exact: true })).toHaveValue(
    "다른 관리자 변경",
  );
  await expect.poll(() => overflowState(page)).toEqual(before);
  await wheelScrolls(page);
});
async function swipeUp(session, x, startY, endY) {
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y: startY, id: 1 }],
  });
  for (let step = 1; step <= 8; step++) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: startY + ((endY - startY) * step) / 8, id: 1 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
}
test("모바일 터치: 모달 내부 스크롤과 5세트 확정 후 배경 스와이프 복원", async ({
  browser,
  backend,
}) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5174",
    viewport: { width: 390, height: 700 },
    isMobile: true,
    hasTouch: true,
  });
  await backend.install(context);
  try {
    const page = await context.newPage();
    const session = await context.newCDPSession(page);
    await login(page);
    await page.goto("/admin/matches");
    const before = await overflowState(page);
    await page.locator(".match-card").first().click();
    await page.locator("dialog").evaluate((dialog) => {
      dialog.scrollTop = 0;
    });
    const lockedPosition = await page.evaluate(() => window.scrollY);
    await swipeUp(session, 195, 570, 240);
    await expect
      .poll(() => page.locator("dialog").evaluate((dialog) => dialog.scrollTop))
      .toBeGreaterThan(30);
    expect(await page.evaluate(() => window.scrollY)).toBe(lockedPosition);
    await dismissTop(page, "escape");
    await openScoreConfirmation(page);
    await page
      .locator("dialog")
      .last()
      .getByRole("button", { name: "결과 확정", exact: true })
      .click();
    await expect(page.locator("dialog")).toHaveCount(0);
    await expect.poll(() => overflowState(page)).toEqual(before);
    await page.evaluate(() => window.scrollTo(0, 0));
    await swipeUp(session, 30, 570, 240);
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeGreaterThan(100);
  } finally {
    await context.close();
  }
});
