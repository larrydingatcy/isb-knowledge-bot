import { expect, test } from "@playwright/test";

const answered = {
  status: "answered",
  answer: "Registration opens in November.",
  freshness: "current",
  citations: [
    {
      id: "official",
      title: "Official ASA notice",
      url: "https://www.isb.cn/activities",
      publishedAt: "2026-10-01T00:00:00.000Z",
      crawledAt: "2026-10-13T08:00:00.000Z",
      freshness: "current"
    }
  ]
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/v1/chat", async (route) => {
    const body = route.request().postDataJSON() as { question: string; language: "zh" | "en" };
    if (body.question.includes("unknown") || body.question.includes("未知")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          status: "unknown",
          answer: body.language === "zh" ? "未找到足够可靠的官方资料。" : "No reliable official information found.",
          citations: []
        })
      });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(answered) });
  });
});

test("answers in Chinese and English with an official citation", async ({ page }) => {
  await page.goto("/isb-knowledge-bot/");
  await page.getByLabel("你的问题").fill("报名什么时候开始？");
  await page.getByRole("button", { name: "查询官方资料" }).click();

  await expect(page.getByText("Registration opens in November.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Official ASA notice" })).toHaveAttribute(
    "href",
    "https://www.isb.cn/activities"
  );

  await page.getByRole("button", { name: "切换到 English" }).click();
  await page.getByLabel("Your question").fill("When does registration open?");
  await page.getByRole("button", { name: "Search official sources" }).click();
  await expect(page.getByText("Registration opens in November.")).toBeVisible();
});

test("shows an explicit unknown answer", async ({ page }) => {
  await page.goto("/isb-knowledge-bot/");
  await page.getByLabel("你的问题").fill("未知问题");
  await page.getByRole("button", { name: "查询官方资料" }).click();

  await expect(page.getByText("未找到足够可靠的官方资料。")).toBeVisible();
  await expect(page.locator(".citations")).toHaveCount(0);
});

test("keeps static knowledge visible when the API is unavailable", async ({ page }) => {
  await page.unroute("**/api/v1/chat");
  await page.route("**/api/v1/chat", (route) => route.abort("failed"));
  await page.goto("/isb-knowledge-bot/");
  await page.getByLabel("你的问题").fill("校历");
  await page.getByRole("button", { name: "查询官方资料" }).click();

  await expect(page.getByRole("alert")).toContainText("问答服务暂时不可用");
  await expect(page.getByText("International School of Beijing official website")).toBeVisible();
});

test("fits a 390px viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/isb-knowledge-bot/");

  const sizes = await page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth
  }));
  expect(sizes.content).toBeLessThanOrEqual(sizes.viewport);
  await expect(page.getByRole("heading", { name: "ISB 家长知识助手" })).toBeVisible();
});

test("reloads the public share route directly", async ({ page }) => {
  await page.goto("/isb-knowledge-bot/");
  await page.reload();

  await expect(page).toHaveURL(/\/isb-knowledge-bot\/$/);
  await expect(page.getByRole("heading", { name: "ISB 家长知识助手" })).toBeVisible();
});
