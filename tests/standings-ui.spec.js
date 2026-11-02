import { test, expect } from "./fixtures.js";
import { createDemoData } from "../src/services/tournamentStorage.js";
import { calculateStandings } from "../src/utils/standings.js";
import { formatRatio } from "../src/utils/competitionRules.js";

async function stat(dialog, label, value) {
  const card = dialog.locator(".team-stat-card").filter({
    has: dialog.page().getByText(label, { exact: true }),
  });
  await expect(card.locator("dd")).toHaveText(String(value));
}

async function checkCardGrid(dialog, sport) {
  const labels = [
    "승점", "경기 수", "승리 경기", "패배 경기",
    ...(sport === "volleyball"
      ? ["승리 세트", "패배 세트", "총 득점", "총 실점", "세트 득실률", "점수 득실률"]
      : ["승리 판", "패배 판", "세트 득실률", "잔여 인원수 차"]),
  ];
  await expect(dialog.locator(".team-stat-card dt")).toHaveText(labels);
  await expect(dialog.locator(".team-stat-highlight dt")).toHaveText("승점");
  const layout = await dialog.evaluate(el => {
    const cards = [...el.querySelectorAll(".team-stat-card")];
    const box = node => {
      const r = node.getBoundingClientRect();
      return { x: r.x, y: r.y, width: r.width, height: r.height };
    };
    return {
      cards: cards.map(box), modal: box(el), viewportWidth: innerWidth,
      viewportHeight: innerHeight, overflow: el.scrollWidth > el.clientWidth,
      clipped: cards.some(card => [...card.querySelectorAll("dt, dd")].some(text => {
        const range = document.createRange(); range.selectNodeContents(text);
        const r = range.getBoundingClientRect(), c = card.getBoundingClientRect();
        return r.left < c.left || r.right > c.right || r.top < c.top || r.bottom > c.bottom;
      })),
    };
  });
  expect(layout.overflow).toBe(false);
  expect(layout.clipped).toBe(false);
  expect(Math.abs(layout.modal.x + layout.modal.width / 2 - layout.viewportWidth / 2)).toBeLessThan(1);
  expect(layout.modal.y).toBeGreaterThanOrEqual(0);
  expect(layout.modal.y + layout.modal.height).toBeLessThanOrEqual(layout.viewportHeight);
  expect(layout.modal.width).toBeLessThanOrEqual(480);
  for (let i = 0; i < layout.cards.length; i += 2) {
    const left = layout.cards[i], right = layout.cards[i + 1];
    expect(Math.abs(left.width - right.width)).toBeLessThan(1);
    expect(Math.abs(left.height - layout.cards[0].height)).toBeLessThan(1);
    expect(Math.abs(right.height - left.height)).toBeLessThan(1);
    expect(Math.abs(left.y - right.y)).toBeLessThan(1);
    expect(left.height).toBeGreaterThanOrEqual(68);
    expect(left.height).toBeLessThanOrEqual(70);
    expect(right.x - left.x - left.width).toBeCloseTo(10, 0);
    if (i > 0) expect(left.y - layout.cards[i - 2].y - layout.cards[i - 2].height).toBeCloseTo(10, 0);
  }
}

test("긴 참가 반 이름도 한 줄 유지하고 표 내부 가로 스크롤 제공", async ({ page, backend }) => {
  for (const sport of ["volleyball", "dodgeball"]) {
    const data = createDemoData(sport);
    data.teams[0].name = "1반 긴 참가 반 이름 표시 확인";
    if (sport === "volleyball") await backend.replace(data);
    else await backend.initialize(data);
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/${sport}/groups`);
      const panel = page.locator(".group-panel-A");
      const name = panel.locator(".table-team strong").filter({ hasText: data.teams[0].name });
      await expect(name).toBeVisible();
      expect(await name.evaluate(el => { const range = document.createRange(); range.selectNodeContents(el); return range.getClientRects().length; })).toBe(1);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const wrap = panel.locator(".table-wrap");
      expect(await wrap.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
      await wrap.evaluate(el => { el.scrollLeft = el.scrollWidth; });
      expect(await wrap.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
      if (sport === "volleyball" && width === 1440) await page.screenshot({ path: "test-results/standings-long-name-1440.png" });
    }
  }
});

for (const width of [320, 375, 390, 430, 1280, 1440]) {
  test(`${width}px 양 종목 홈·조별리그 이름 한 줄 및 상세 통계 모달`, async ({ page, backend }) => {
    await page.setViewportSize({ width, height: 900 });
    await backend.replace(createDemoData());
    await backend.initialize(createDemoData("dodgeball"));
    for (const sport of ["volleyball", "dodgeball"]) {
      const data = await backend.snapshot(`${sport}-cup`);
      for (const path of ["", "/groups"]) {
        await page.goto(`/${sport}${path}`);
        await page.evaluate(() => document.fonts.ready);
        await expect(page.locator(".standings tbody tr")).toHaveCount(6);
        await expect(page.locator(".standing-mobile-details")).toHaveCount(0);
        const geometry = await page.locator(".standings .table-team").evaluateAll((teams) => teams.map((team) => {
          const name = team.querySelector("strong"), avatar = team.querySelector(".team-avatar");
          const range = document.createRange(); range.selectNodeContents(name);
          const a = avatar.getBoundingClientRect(), n = name.getBoundingClientRect();
          return { lines: range.getClientRects().length, centerDifference: Math.abs(a.y + a.height / 2 - n.y - n.height / 2) };
        }));
        for (const item of geometry) { expect(item.lines).toBe(1); expect(item.centerDifference).toBeLessThan(1); }
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        for (const group of ["A", "B"]) {
          const panel = page.locator(`.group-panel-${group}`);
          const expected = calculateStandings(data.teams, data.matches, group, data.tournament.setRules, data.manualRankings[group]).rows;
          for (const row of expected) {
            const button = panel.getByRole("button", { name: `${row.team.name} 상세 기록`, exact: true });
            await button.scrollIntoViewIfNeeded();
            await button.focus();
            // Wait for browser focus/scroll layout to settle before recording
            // the position that opening the modal must preserve.
            await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
            const before = await page.evaluate(() => ({ y: scrollY, body: document.body.style.overflow, html: document.documentElement.style.overflow }));
            await button.press("Enter");
            const dialog = page.getByRole("dialog");
            await expect(dialog).toHaveAccessibleName(`${row.team.name} 상세 기록`);
            await checkCardGrid(dialog, sport);
            await expect(dialog.locator(".team-stats-meta")).toContainText(`${sport === "volleyball" ? "배구" : "피구"} · ${group}조`);
            for (const [label, value] of [["승점",row.matchPoints],["승리 경기",row.wins],["패배 경기",row.losses],["경기 수",row.played],["세트 득실률",formatRatio(row.setsFor,row.setsAgainst)],[sport === "volleyball" ? "승리 세트" : "승리 판",row.setsFor],[sport === "volleyball" ? "패배 세트" : "패배 판",row.setsAgainst]]) await stat(dialog,label,value);
            if (sport === "volleyball") {
              await stat(dialog,"총 득점",row.pointsFor); await stat(dialog,"총 실점",row.pointsAgainst);
              await stat(dialog,"점수 득실률",formatRatio(row.pointsFor,row.pointsAgainst));
            } else await stat(dialog,"잔여 인원수 차",row.remainingDiff > 0 ? `+${row.remainingDiff}` : row.remainingDiff);
            if ([375, 1440].includes(width) && path === "/groups" && group === "A" && row === expected[0]) {
              await page.screenshot({ path: `test-results/standings-modal-${sport}-${width}.png` });
            }
            expect(await page.evaluate(() => getComputedStyle(document.body).overflow)).toBe("hidden");
            await page.keyboard.press("Tab");
            // A one-button native dialog may Tab into browser chrome; assert
            // that background controls remain inert, then restore dialog focus.
            await button.evaluate(el => el.focus());
            await expect(button).not.toBeFocused();
            await dialog.getByRole("button", { name: "창 닫기" }).evaluate(el => el.focus({ preventScroll: true }));
            expect(await dialog.evaluate(el => el.contains(document.activeElement))).toBe(true);
            await page.keyboard.press("Escape");
            await expect(dialog).toHaveCount(0);
            await expect(button).toBeFocused();
            expect(await page.evaluate(() => ({ y: scrollY, body: document.body.style.overflow, html: document.documentElement.style.overflow }))).toEqual(before);
          }
        }
      }
    }
  });
}

test("미기록 0·— 구분, 짧은 화면 내부 스크롤, 닫기·외부 클릭 및 스크롤 복원", async ({ page, backend }) => {
  await backend.initialize((await import("../src/data/initialTournament.js")).createInitialData("dodgeball"));
  await page.setViewportSize({ width: 320, height: 420 });
  for (const sport of ["volleyball", "dodgeball"]) {
    await page.goto(`/${sport}/groups`);
    const button = page.getByRole("button", { name: "1반 상세 기록", exact: true });
    for (const close of ["button", "outside"]) {
      await button.click();
      const dialog = page.getByRole("dialog");
      await stat(dialog,"승점",0); await stat(dialog,"세트 득실률","—");
      await expect(dialog).toContainText("아직 확정된 조별리그 경기 기록이 없습니다.");
      expect(await dialog.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
      await dialog.evaluate(el => { el.scrollTop = el.scrollHeight; });
      expect(await dialog.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
      if (close === "button") await dialog.getByRole("button", { name: "창 닫기" }).click();
      else await page.mouse.click(1, 1);
      await expect(dialog).toHaveCount(0);
      await expect(button).toBeFocused();
      expect(await page.evaluate(() => document.body.style.overflow)).toBe("");
      const start = await page.evaluate(() => scrollY);
      await page.mouse.move(310, 350); await page.mouse.wheel(0, 150);
      await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(start);
    }
  }
});
