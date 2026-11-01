import { mkdirSync, writeFileSync } from "node:fs";
import {
  test,
  smoke,
  check,
  open,
  hash,
  SITE,
  SPORTS,
  LABELS,
} from "./readOnly.js";

let before = null;
let preservationReader = null;
const snapshots = async (api) => {
  const result = {};
  for (const sport of SPORTS) {
    const response = await api(
      `/rest/v1/rpc/get_public_tournament?p_id=${sport}-cup`,
    );
    check(response.status === 200, "공개 대회 API HTTP 실패: " + sport);
    const d = response.data;
    check(
      d?.tournament?.id === `${sport}-cup`,
      "종목별 응답 ID 불일치: " + sport,
    );
    check(
      d.teams?.length === 6 && d.matches?.length === 9,
      "6개 반/9경기 불일치: " + sport,
    );
    const ids = new Set(d.teams.map((t) => t.id));
    check(
      d.matches.every((m) =>
        sport === "dodgeball"
          ? Array.isArray(m.rounds) &&
            m.rounds.length === 5 &&
            !Object.hasOwn(m, "sets")
          : Array.isArray(m.sets) &&
            m.sets.length === 5 &&
            !Object.hasOwn(m, "rounds"),
      ),
      "공개 응답의 종목별 기록 모델 불일치",
    );
    check(
      d.matches.every((m) =>
        [m.homeTeamId, m.awayTeamId, m.winnerTeamId].every(
          (id) => id === null || ids.has(id),
        ),
      ),
      "다른 대회/미등록 반 참조: " + sport,
    );
    const privateKey = (value) =>
      value &&
      typeof value === "object" &&
      Object.entries(value).some(
        ([key, item]) =>
          /^(email|password|encrypted_password|access_token|refresh_token|service_role|tournament_admins|actor_id)$/i.test(
            key,
          ) || privateKey(item),
      );
    check(!privateKey(d), "공개 스냅샷에 관리자/인증 전용 필드 노출");
    result[sport] = {
      revision: d.revision,
      teams: d.teams.length,
      matches: d.matches.length,
      hash: hash(d),
      completed: d.matches.filter((m) => m.status === "completed").length,
      matchesWithoutDateTime: d.matches.filter((m) => !m.scheduledAt).length,
      tournamentDatesUnset: !d.tournament.startDate || !d.tournament.endDate,
      examplePlayerNames: d.teams
        .flatMap((t) => t.players)
        .filter((p) => p.name.startsWith("예시선수")).length,
    };
  }
  return result;
};

smoke(
  "운영 공개 API: 버전 2·6개 반·9경기·종목 분리·비공개 필드 없음",
  async ({ page, audit }) => {
    await open(page, audit, "/volleyball", ".hero");
    const version = await audit.api("/rest/v1/rpc/get_sports_schema_version");
    check(
      version.status === 200 && version.data === 2,
      "통합 DB 버전 2 확인 실패",
    );
    before = await snapshots(audit.api);
    preservationReader = audit.api;
  },
);

for (const width of [1440, 390, 320])
  for (const sport of SPORTS) {
    smoke(
      `${width}px ${sport}: 공개 메뉴 5개·직접 접속·새로고침·데이터·리소스·배치`,
      async ({ page, audit }) => {
        await page.setViewportSize({ width, height: 900 });
        for (const [suffix, selector, title] of [
          ["", ".hero", null],
          ["/groups", ".standings", "조별리그"],
          ["/bracket", ".bracket", null],
          ["/schedule", ".match-card", "모든 경기를 한눈에"],
          ["/teams", ".team-card", "함께 뛰는 우리 반"],
        ]) {
          const route = `/${sport}${suffix}`;
          await open(page, audit, route, selector);
          await open(page, audit, route, selector, true);
          const navigation = page.getByRole("navigation", { name: "주 메뉴" });
          check(
            JSON.stringify(
              await navigation.getByRole("link").allTextContents(),
            ) === JSON.stringify(LABELS),
            "일반 메뉴 5개 텍스트 불일치",
          );
          check(
            (await page.locator('a[href^="/admin"]').count()) === 0,
            "공개 화면에 관리자 링크 노출",
          );
          const selected = page
            .getByRole("navigation", { name: "종목 선택" })
            .getByRole("link", {
              name: sport === "volleyball" ? "배구" : "피구",
              exact: true,
            });
          check(
            (await selected.getAttribute("aria-current")) === "page",
            "선택 종목 강조 없음",
          );
          if (title)
            check(
              await page
                .getByRole("heading", { name: title, exact: true })
                .isVisible(),
              "페이지 제목 불일치: " + suffix,
            );
          if (suffix === "/groups") {
            check(
              (await page.locator(".standings tbody tr").count()) === 6,
              "조별 순위표 반 수 오류",
            );
            const text = await page.locator(".standings").first().innerText();
            check(
              sport === "dodgeball"
                ? text.includes("판 득실차") && !text.includes("득실점")
                : text.includes("세트 득실"),
              "종목별 순위표 항목 오류",
            );
          }
          if (suffix === "/schedule")
            check(
              (await page.locator(".match-card").count()) === 9,
              "일정 9경기 표시 오류",
            );
          if (suffix === "/teams")
            check(
              (await page.locator(".team-card").count()) === 6,
              "참가 반 카드 6개 표시 오류",
            );
          if (suffix === "/bracket")
            check(
              (await page.locator(".bracket .match-card").count()) === 3,
              "준결승 2경기/결승 1경기 표시 오류",
            );
        }
        for (const resource of ["script", "stylesheet", "image"])
          check(
            audit.report.resources[resource] > 0,
            "필수 정적 리소스 로딩 누락: " + resource,
          );
      },
    );
  }

for (const width of [1440, 390])
  smoke(
    `${width}px 탭과 일반 메뉴를 클릭해 두 종목 전환`,
    async ({ page, audit }) => {
      await page.setViewportSize({ width, height: 900 });
      await open(page, audit, "/volleyball/teams", ".team-card");
      await page
        .getByRole("navigation", { name: "종목 선택" })
        .getByRole("link", { name: "피구", exact: true })
        .click();
      await page.locator(".team-card").first().waitFor();
      check(
        new URL(page.url()).pathname === "/dodgeball/teams",
        "피구 전환 시 메뉴 유지 실패",
      );
      await page
        .getByRole("navigation", { name: "종목 선택" })
        .getByRole("link", { name: "배구", exact: true })
        .click();
      await page.locator(".team-card").first().waitFor();
      check(
        new URL(page.url()).pathname === "/volleyball/teams",
        "배구 복귀 실패",
      );
      for (const [name, suffix, selector] of [
        ["홈", "", ".hero"],
        ["조별리그", "/groups", ".standings"],
        ["토너먼트", "/bracket", ".bracket"],
        ["경기 일정", "/schedule", ".match-card"],
        ["참가 반", "/teams", ".team-card"],
      ]) {
        await page
          .getByRole("navigation", { name: "주 메뉴" })
          .getByRole("link", { name, exact: true })
          .click();
        await page.locator(selector).first().waitFor();
        check(
          new URL(page.url()).pathname === "/volleyball" + suffix,
          "메뉴 클릭 후 주소 불일치",
        );
      }
    },
  );

smoke(
  "기존 공개·관리자 URL 9개 리다이렉트와 새로고침",
  async ({ page, audit }) => {
    for (const suffix of ["", "/groups", "/bracket", "/schedule", "/teams"]) {
      await open(
        page,
        audit,
        suffix || "/",
        suffix === "/groups"
          ? ".standings"
          : suffix === "/bracket"
            ? ".bracket"
            : suffix === "/schedule"
              ? ".match-card"
              : suffix === "/teams"
                ? ".team-card"
                : ".hero",
      );
      check(
        new URL(page.url()).pathname === "/volleyball" + suffix,
        "기존 공개 URL 리다이렉트 실패",
      );
      await open(page, audit, "/volleyball" + suffix, "h1", true);
    }
    for (const suffix of ["", "/teams", "/matches", "/settings"]) {
      await open(page, audit, "/admin" + suffix, ".login-panel");
      check(
        new URL(page.url()).pathname === "/admin/volleyball" + suffix,
        "기존 관리자 URL 리다이렉트 실패",
      );
    }
  },
);

smoke(
  "비로그인 관리자 8화면: 로그인 요구·편집 화면 차단·종목 전환",
  async ({ page, audit }) => {
    for (const sport of SPORTS)
      for (const suffix of ["", "/teams", "/matches", "/settings"]) {
        await open(page, audit, `/admin/${sport}${suffix}`, ".login-panel");
        await open(
          page,
          audit,
          `/admin/${sport}${suffix}`,
          ".login-panel",
          true,
        );
        check(
          await page
            .getByRole("heading", { name: "관리자 로그인", exact: true })
            .isVisible(),
          "관리자 로그인 화면 없음",
        );
        check(
          (await page.getByLabel("이메일", { exact: true }).isVisible()) &&
            (await page.getByLabel("비밀번호", { exact: true }).isVisible()),
          "로그인 입력 레이블 누락",
        );
        check(
          (await page
            .locator(".team-editor,.round-input-table,.score-input-table")
            .count()) === 0,
          "비로그인 편집 UI 노출",
        );
      }
    await page
      .getByRole("navigation", { name: "종목 선택" })
      .getByRole("link", { name: "배구", exact: true })
      .click();
    await page
      .getByRole("heading", { name: "관리자 로그인", exact: true })
      .waitFor();
    check(
      new URL(page.url()).pathname === "/admin/volleyball/settings",
      "관리자 탭 전환 실패",
    );
  },
);

smoke(
  "익명 관리자 권한 테이블 조회는 거부됨 (GET만, 쓰기/우회 없음)",
  async ({ page, audit }) => {
    await open(page, audit, "/volleyball", ".hero");
    const result = await audit.api(
      "/rest/v1/tournament_admins?select=user_id&limit=1",
    );
    check(
      [401, 403].includes(result.status) && result.data?.code === "42501",
      "관리자 권한 테이블 비공개 확인 실패",
    );
    audit.report.adminTableRead = {
      status: result.status,
      code: result.data?.code,
    };
  },
);

smoke(
  "잘못된 URL은 404 안내·존재하지 않는 경기 ID는 빈 조회",
  async ({ page, audit }) => {
    await open(page, audit, "/volleyball", ".hero");
    for (const sport of SPORTS) {
      const missing = await audit.api(
        `/rest/v1/matches?tournament_id=eq.${sport}-cup&id=eq.production-smoke-not-found&select=id&limit=1`,
      );
      check(
        missing.status === 200 &&
          Array.isArray(missing.data) &&
          missing.data.length === 0,
        "없는 경기 ID 처리 실패",
      );
      await open(
        page,
        audit,
        `/${sport}/matches/production-smoke-not-found`,
        ".not-found",
      );
      check(
        await page
          .getByRole("heading", { name: "404", exact: true })
          .isVisible(),
        "잘못된 URL 404 안내 없음",
      );
      await page
        .getByRole("link", { name: "홈으로 돌아가기", exact: true })
        .click();
      await page.locator(".hero").waitFor();
    }
  },
);

for (const sport of SPORTS)
  smoke(
    `${sport} 경기 상세 조회·ESC 종료·마우스 스크롤 복원`,
    async ({ page, audit }) => {
      await open(page, audit, `/${sport}/schedule`, ".match-card");
      const original = await page.evaluate(() => [
        document.body.style.overflow,
        document.documentElement.style.overflow,
      ]);
      await page.locator(".match-card").first().click();
      await page.getByRole("dialog").waitFor();
      check(
        await page
          .getByRole("button", { name: "창 닫기", exact: true })
          .isVisible(),
        "경기 상세 닫기 버튼 없음",
      );
      check(
        (await page
          .getByRole("dialog")
          .getByRole("button", { name: "경기 결과 확정", exact: true })
          .count()) === 0,
        "일반 상세보기에서 결과 변경 버튼 노출",
      );
      await page.keyboard.press("Escape");
      await page.getByRole("dialog").waitFor({ state: "detached" });
      check(
        JSON.stringify(
          await page.evaluate(() => [
            document.body.style.overflow,
            document.documentElement.style.overflow,
          ]),
        ) === JSON.stringify(original),
        "상세 모달 종료 후 overflow 복원 실패",
      );
      await page.evaluate(() => scrollTo(0, 0));
      await page.mouse.move(200, 300);
      await page.mouse.wheel(0, 500);
      await page.waitForFunction(() => scrollY > 0);
    },
  );

test.afterAll(async () => {
  if (!before || !preservationReader) return;
  const after = await snapshots(preservationReader);
  const unchanged = SPORTS.every(
    (sport) =>
      after[sport].hash === before[sport].hash &&
      after[sport].revision === before[sport].revision,
  );
  mkdirSync("test-results/production", { recursive: true });
  writeFileSync(
    "test-results/production/data-preservation.json",
    JSON.stringify(
      {
        before,
        after,
        unchanged,
        requestPolicy:
          "Public read RPCs and anonymous SELECT only; all other HTTP operations blocked",
        realtimeEventDeliveryVerified: false,
      },
      null,
      2,
    ),
  );
  check(
    unchanged,
    "테스트 기간 운영 스냅샷 변경 감지: 외부 수정 여부 확인 필요, 원본은 변경하지 않음",
  );
});
