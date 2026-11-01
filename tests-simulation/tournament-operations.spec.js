import { test, expect, login } from "../tests/fixtures.js";
import { createInitialData } from "../src/data/initialTournament.js";
import { planMatchUpdate } from "../src/services/tournamentStorage.js";
import { calculateStandings } from "../src/utils/standings.js";

const sports = ["volleyball", "dodgeball"];
const getMatch = (data, id) => data.matches.find((m) => m.id === id);
async function editor(page, number) {
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
async function enterResult(page, sport, number, winner = "home") {
  const dialog = await editor(page, number);
  if (sport === "volleyball")
    for (let i = 0; i < 3; i++) {
      const inputs = dialog.locator(".score-input-row").nth(i).locator("input");
      await inputs.nth(0).fill(winner === "home" ? "25" : "20");
      await inputs.nth(1).fill(winner === "home" ? "20" : "25");
    }
  else
    for (let i = 1; i <= 3; i++)
      await dialog
        .getByLabel(`${i}판 승리 반`, { exact: true })
        .selectOption(winner);
  await dialog
    .getByRole("button", { name: "경기 결과 확정", exact: true })
    .click();
}
async function confirm(page) {
  await page
    .locator("dialog")
    .last()
    .getByRole("button", { name: "결과 확정", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
}
async function setup(page, backend, sport) {
  // Both records are in the test's in-memory PostgreSQL instance, never Supabase.
  await backend.initialize(createInitialData("dodgeball"));
  await login(page);
  await page.goto(`/admin/${sport}/matches`);
}
for (const sport of sports) {
  test(`${sport}: 예선 A/B 단계→준결승→결승→우승→결과 수정→확정 취소·종목 독립`, async ({
    page,
    backend,
  }) => {
    await setup(page, backend, sport);
    const id = `${sport}-cup`,
      other = sport === "volleyball" ? "dodgeball-cup" : "volleyball-cup";
    const untouched = JSON.stringify(await backend.snapshot(other));
    for (let number = 1; number <= 9; number++) {
      await enterResult(page, sport, number);
      await confirm(page);
      const d = await backend.snapshot(id);
      const completed = d.matches.filter((m) => m.status === "completed");
      expect(completed).toHaveLength(number);
      if (number <= 5) expect(getMatch(d, "sf-1").homeTeamId).toBeNull();
      if (number === 3) {
        const a = calculateStandings(
          d.teams,
          d.matches,
          "A",
          d.tournament.setRules,
          d.manualRankings.A,
        );
        expect(a.rows.map((r) => r.team.id)).toEqual([
          "team-1",
          "team-2",
          "team-3",
        ]);
        expect(a.resolved).toBe(true);
      }
      if (number === 6) {
        expect(getMatch(d, "sf-1")).toMatchObject({
          homeTeamId: "team-1",
          awayTeamId: "team-5",
        });
        expect(getMatch(d, "sf-2")).toMatchObject({
          homeTeamId: "team-4",
          awayTeamId: "team-2",
        });
        expect(getMatch(d, "final")).toMatchObject({
          homeTeamId: null,
          awayTeamId: null,
        });
      }
      if (number === 7)
        expect(getMatch(d, "final")).toMatchObject({
          homeTeamId: "team-1",
          awayTeamId: null,
        });
      if (number === 8)
        expect(getMatch(d, "final")).toMatchObject({
          homeTeamId: "team-1",
          awayTeamId: "team-4",
        });
      if (number === 9) {
        expect(getMatch(d, "final").winnerTeamId).toBe("team-1");
        expect(d.tournament.status).toBe("completed");
      }
      expect(JSON.stringify(await backend.snapshot(other)) === untouched).toBe(
        true,
      );
      expect(
        await page.evaluate(() => [
          document.body.style.overflow,
          document.documentElement.style.overflow,
        ]),
      ).toEqual(["", ""]);
    }
    await page.goto(`/${sport}`);
    await expect(page.locator(".hero")).toContainText("올해의 챔피언");
    await page.goto(`/admin/${sport}/matches`);
    await enterResult(page, sport, 1, "away");
    await expect(page.locator("dialog").last()).toContainText("준결승");
    await expect(page.locator("dialog").last()).toContainText("결승");
    await confirm(page);
    let changed = await backend.snapshot(id);
    expect(getMatch(changed, "sf-1")).toMatchObject({
      homeTeamId: "team-2",
      awayTeamId: "team-5",
      status: "scheduled",
    });
    expect(getMatch(changed, "sf-2")).toMatchObject({
      homeTeamId: "team-4",
      awayTeamId: "team-1",
      status: "scheduled",
    });
    expect(getMatch(changed, "final")).toMatchObject({
      homeTeamId: null,
      awayTeamId: null,
      winnerTeamId: null,
      status: "scheduled",
    });
    const dialog = await editor(page, 1);
    await dialog
      .getByRole("button", { name: "임시 저장", exact: true })
      .click();
    await page
      .locator("dialog")
      .last()
      .getByRole("button", { name: "임시 저장으로 변경", exact: true })
      .click();
    await expect(page.locator("dialog")).toHaveCount(0);
    changed = await backend.snapshot(id);
    expect(getMatch(changed, "g-A-1")).toMatchObject({
      status: "live",
      winnerTeamId: null,
    });
    expect(getMatch(changed, "sf-1").homeTeamId).toBeNull();
    expect(JSON.stringify(await backend.snapshot(other)) === untouched).toBe(
      true,
    );
    await page.mouse.move(200, 300);
    await page.mouse.wheel(0, 500);
    await expect.poll(() => page.evaluate(() => scrollY)).toBeGreaterThan(0);
  });

  test(`${sport}: 순환 동률→자동 진출 보류→관리자 순위→공개 관리자 확정 표시`, async ({
    page,
    backend,
  }) => {
    await backend.initialize(createInitialData("dodgeball"));
    const other = sport === "volleyball" ? "dodgeball-cup" : "volleyball-cup";
    const untouched = JSON.stringify(await backend.snapshot(other));
    let d = createInitialData(sport);
    for (const match of d.matches.filter((m) => m.stage === "group")) {
      const side = match.id === "g-A-2" ? "away" : "home";
      const result = Array.from({ length: 5 }, (_, i) =>
        sport === "dodgeball"
          ? { winner: i < 3 ? side : null }
          : {
              home: i < 3 ? (side === "home" ? 25 : 20) : "",
              away: i < 3 ? (side === "away" ? 25 : 20) : "",
            },
      );
      d = planMatchUpdate(d, match.id, result, "confirm").data;
    }
    await backend.replace(d);
    await login(page);
    await page.goto(`/admin/${sport}/matches`);
    await expect(page.locator(".tie-resolver")).toBeVisible();
    expect(
      getMatch(await backend.snapshot(`${sport}-cup`), "sf-1").homeTeamId,
    ).toBeNull();
    for (const [i, id] of ["team-3", "team-1", "team-2"].entries())
      await page.locator(".tie-resolver select").nth(i).selectOption(id);
    await page.getByRole("button", { name: "순위 확인", exact: true }).click();
    await page
      .getByRole("button", { name: "확인 후 저장", exact: true })
      .click();
    await expect(page.locator(".tie-resolver")).toHaveCount(0);
    expect(
      getMatch(await backend.snapshot(`${sport}-cup`), "sf-1"),
    ).toMatchObject({ homeTeamId: "team-3", awayTeamId: "team-5" });
    await page.goto(`/${sport}/groups`);
    await expect(page.locator(".standings").first()).toContainText(
      "관리자 확정",
    );
    expect(JSON.stringify(await backend.snapshot(other)) === untouched).toBe(
      true,
    );
  });

  test(`${sport}: 반·선수 추가/수정/삭제·조 재편성·일정 저장·다른 종목 보존`, async ({
    page,
    backend,
  }) => {
    await setup(page, backend, sport);
    const other = sport === "volleyball" ? "dodgeball-cup" : "volleyball-cup";
    const untouched = JSON.stringify(await backend.snapshot(other));
    await page.goto(`/admin/${sport}/teams`);
    const card = page.locator(".team-editor").first();
    await card.getByLabel("반 이름", { exact: true }).fill("검증반");
    await card.locator(".player-input input").first().fill("수정선수");
    await card.getByRole("button", { name: "선수 추가", exact: true }).click();
    await card.locator(".player-input input").last().fill("추가선수");
    await page
      .getByRole("button", { name: "변경 사항 저장", exact: true })
      .first()
      .click();
    await expect(page.locator(".toast")).toContainText("저장");
    let current = await backend.snapshot(`${sport}-cup`);
    expect(current.teams[0].name).toBe("검증반");
    expect(current.teams[0].players).toHaveLength(9);
    await card
      .getByRole("button", { name: "추가선수 삭제", exact: true })
      .click();
    await page.getByRole("button", { name: "선수 삭제", exact: true }).click();
    await page
      .getByRole("button", { name: "변경 사항 저장", exact: true })
      .first()
      .click();
    await page.goto(`/${sport}/teams`);
    await expect(page.locator(".team-card").first()).toContainText("수정선수");
    await expect(page.locator(".team-card").first()).not.toContainText(
      "추가선수",
    );
    await page.goto(`/admin/${sport}/teams`);
    await page
      .locator(".team-editor")
      .first()
      .getByRole("combobox", { name: "소속 조", exact: true })
      .selectOption("B");
    await page
      .getByRole("button", { name: "변경 사항 저장", exact: true })
      .first()
      .click();
    await expect(page.getByRole("alert")).toContainText("3개 반");
    await page
      .locator(".team-editor")
      .nth(3)
      .getByRole("combobox", { name: "소속 조", exact: true })
      .selectOption("A");
    await page
      .getByRole("button", { name: "변경 사항 저장", exact: true })
      .first()
      .click();
    await page
      .getByRole("button", { name: "확인 후 저장", exact: true })
      .click();
    await expect(page.locator("dialog")).toHaveCount(0);
    current = await backend.snapshot(`${sport}-cup`);
    expect(current.teams.filter((t) => t.group === "A")).toHaveLength(3);
    expect(getMatch(current, "g-A-1").homeTeamId).toBe("team-2");
    expect(current.teams[0].players).toHaveLength(8);
    await page.goto(`/admin/${sport}/settings`);
    await page.getByLabel("시작일", { exact: true }).fill("2026-11-24");
    await page.getByLabel("종료일", { exact: true }).fill("2026-12-14");
    await page
      .getByLabel("경기 일시", { exact: true })
      .first()
      .fill("2026-11-24T14:30");
    await page
      .getByRole("button", { name: "설정 저장", exact: true })
      .first()
      .click();
    await expect(page.locator(".toast")).toContainText("저장");
    current = await backend.snapshot(`${sport}-cup`);
    expect(current.matches[0].scheduledAt).toBe("2026-11-24T14:30");
    expect(JSON.stringify(await backend.snapshot(other)) === untouched).toBe(
      true,
    );
  });
}
