import { smoke, check, open, SPORTS } from "./readOnly.js";

const title = "화곡중학교 배구·피구 대진표";
smoke(
  "운영 배구 규칙 버전 3·통합 버전 2 Data API 조회",
  async ({ page, audit }) => {
    await open(page, audit, "/volleyball", ".hero");
    for (const [name, expected] of [
      ["get_volleyball_scoring_version", 3],
      ["get_sports_schema_version", 2],
    ]) {
      const response = await audit.api(`/rest/v1/rpc/${name}`);
      check(
        response.status === 200 && response.data === expected,
        `${name} 서버 규칙 버전 불일치`,
      );
    }
  },
);

for (const width of [320, 375, 390, 430, 1440])
  smoke(
    `${width}px 운영 학교 문구·U+00B7·로고와 텍스트 중앙 정렬`,
    async ({ page, audit }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const sport of SPORTS) {
        await open(page, audit, `/${sport}`, ".hero");
        const content = await page
          .locator(".tournament-intro")
          .evaluate((el) => ({
            label: el.querySelector(".intro-label").textContent,
            title: el.querySelector(".intro-title").textContent,
            subtitle: el.querySelector(".intro-subtitle").textContent,
            slogan: el.querySelector(".intro-slogan").textContent,
          }));
        check(content.label === "SPORTS TOURNAMENT", "영문 라벨 불일치");
        check(
          content.title === title &&
            [...content.title].filter((c) => c.codePointAt(0) === 0xb7)
              .length === 1,
          "학교 제목 또는 가운뎃점 불일치",
        );
        check(content.subtitle === "3학년 전환기 프로그램", "부제목 불일치");
        check(
          content.slogan === "CLASS TOGETHER. PLAY TOGETHER.",
          "슬로건 불일치",
        );
        const layout = await page.locator(".brand").evaluate((brand) => {
          const logo = brand.querySelector("img"),
            intro = brand.querySelector(".tournament-intro");
          const elements = [logo, ...intro.children];
          const boxes = elements.map((e) => {
            const r = e.getBoundingClientRect();
            return {
              center: r.x + r.width / 2,
              top: r.top,
              bottom: r.bottom,
              x: r.x,
              right: r.right,
            };
          });
          const textCenters = [...intro.children].flatMap((e) => {
            const range = document.createRange();
            range.selectNodeContents(e);
            return [...range.getClientRects()]
              .filter((r) => r.width > 0)
              .map((r) => r.x + r.width / 2);
          });
          return {
            direction: getComputedStyle(brand).flexDirection,
            boxes,
            textCenters,
            clipped: elements.some(
              (e) =>
                e.scrollWidth > e.clientWidth + 1 ||
                e.scrollHeight > e.clientHeight + 1,
            ),
            overflow: document.documentElement.scrollWidth > innerWidth,
          };
        });
        check(!layout.clipped && !layout.overflow, "헤더 잘림 또는 가로 넘침");
        if (width <= 600) {
          check(layout.direction === "column", "모바일 로고 독립 배치 없음");
          check(
            layout.boxes.every(
              (b) =>
                Math.abs(b.center - width / 2) < 1 &&
                b.x >= 0 &&
                b.right <= width,
            ),
            "모바일 요소 중심축 불일치",
          );
          check(
            layout.textCenters.every((c) => Math.abs(c - width / 2) < 1.5),
            "모바일 텍스트 줄 중심축 불일치",
          );
          check(
            layout.boxes.every(
              (b, i) => !i || b.top >= layout.boxes[i - 1].bottom,
            ),
            "로고·문구 순서 또는 겹침 오류",
          );
        } else {
          check(
            layout.direction === "row" &&
              layout.boxes[0].right <= layout.boxes[1].x,
            "PC 가로 배치 변경",
          );
        }
      }
    },
  );
