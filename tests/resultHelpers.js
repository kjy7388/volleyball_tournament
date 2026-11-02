export async function fillRound(dialog, number, winner = "home", h, a) {
  const fields = dialog.getByLabel(new RegExp(`^${number}판 .* 잔여 인원$`));
  await fields.nth(0).fill(String(h ?? (winner === "home" ? 7 : 3)));
  await fields.nth(1).fill(String(a ?? (winner === "away" ? 7 : 3)));
}
export async function makeRosterSpace(page, card) {
  await card.locator(".player-input button").last().click();
  await page.getByRole("button", { name: "선수 삭제", exact: true }).click();
}
