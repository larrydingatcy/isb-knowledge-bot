// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AnswerResult } from "@isb/answering/types";
import type { KnowledgeItem, KnowledgeManifest } from "@isb/knowledge/schema";

import { App, type ChatClient } from "./App.js";

const item: KnowledgeItem = {
  schemaVersion: 1,
  id: "calendar",
  title: "Official school calendar",
  content: "The official calendar lists school dates.",
  language: "en",
  category: "calendar",
  tags: ["calendar"],
  sourceId: "isb-public-site",
  sourceUrl: "https://www.isb.cn/calendar",
  sourceType: "official-web",
  publishedAt: "2026-10-01T00:00:00.000Z",
  validFrom: "2026-10-01T00:00:00.000Z",
  validUntil: "2027-06-30T23:59:59.000Z",
  crawledAt: "2026-10-13T08:00:00.000Z",
  contentHash: "a".repeat(64),
  upstreamVersion: "2026-10-01",
  visibility: "public",
  reviewStatus: "approved",
  confidence: 1,
  warnings: []
};

const manifest: KnowledgeManifest = {
  schemaVersion: 1,
  indexVersion: "test-v1",
  generatedAt: "2026-10-13T08:00:00.000Z",
  itemCount: 1,
  sourceFreshness: [
    {
      sourceId: "isb-public-site",
      lastSuccessfulAt: "2026-10-13T08:00:00.000Z",
      status: "current"
    }
  ]
};

const answered: AnswerResult = {
  status: "answered",
  answer: "Registration opens in November.",
  freshness: "current",
  citations: [
    {
      id: "calendar",
      title: "Official school calendar",
      url: "https://www.isb.cn/calendar",
      publishedAt: "2026-10-01T00:00:00.000Z",
      crawledAt: "2026-10-13T08:00:00.000Z",
      freshness: "current"
    }
  ]
};

function renderApp(chatClient: ChatClient = async () => answered) {
  return render(
    <App chatClient={chatClient} initialKnowledge={{ items: [item], manifest }} />
  );
}

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window.navigator, "language", { value: "zh-CN", configurable: true });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("public assistant app", () => {
  test("defaults_to_the_browser_language", () => {
    renderApp();

    expect(screen.getByRole("heading", { name: "ISB 家长知识助手" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "切换到 English" })).toBeInTheDocument();
  });

  test("persists_a_manual_language_choice", async () => {
    const user = userEvent.setup();
    const view = renderApp();
    await user.click(screen.getByRole("button", { name: "切换到 English" }));

    expect(screen.getByRole("heading", { name: "ISB Family Knowledge Assistant" })).toBeInTheDocument();
    expect(localStorage.getItem("isb-language")).toBe("en");

    view.unmount();
    renderApp();
    expect(screen.getByRole("heading", { name: "ISB Family Knowledge Assistant" })).toBeInTheDocument();
  });

  test("shows_all_seven_quick_categories", () => {
    renderApp();
    const categories = screen.getByRole("region", { name: "快捷分类" });

    for (const label of ["校历", "课后活动", "餐饮", "课表", "交通", "表格", "政策"]) {
      expect(within(categories).getByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  test("shows_loading_then_an_answer_with_an_official_citation", async () => {
    let resolveAnswer: (value: AnswerResult) => void = () => undefined;
    const pending = new Promise<AnswerResult>((resolve) => {
      resolveAnswer = resolve;
    });
    const user = userEvent.setup();
    renderApp(async () => pending);
    await user.type(screen.getByLabelText("你的问题"), "报名什么时候开始？");
    await user.click(screen.getByRole("button", { name: "查询官方资料" }));

    expect(screen.getByRole("status")).toHaveTextContent("正在查找官方资料");
    await act(async () => resolveAnswer(answered));

    expect(screen.getByText("Registration opens in November.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Official school calendar" })).toHaveAttribute(
      "href",
      "https://www.isb.cn/calendar"
    );
  });

  test("shows_a_clear_unknown_answer", async () => {
    const user = userEvent.setup();
    renderApp(async () => ({
      status: "unknown",
      answer: "未找到足够可靠的官方资料。请向学校确认。",
      citations: []
    }));
    await user.type(screen.getByLabelText("你的问题"), "一个未知问题");
    await user.click(screen.getByRole("button", { name: "查询官方资料" }));

    expect(await screen.findByText("未找到足够可靠的官方资料。请向学校确认。")).toBeInTheDocument();
  });

  test("keeps_static_updates_visible_when_the_chat_api_fails", async () => {
    const user = userEvent.setup();
    renderApp(async () => {
      throw new Error("offline");
    });
    await user.type(screen.getByLabelText("你的问题"), "校历");
    await user.click(screen.getByRole("button", { name: "查询官方资料" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("问答服务暂时不可用");
    expect(screen.getByText("Official school calendar")).toBeInTheDocument();
  });

  test("labels_stale_answers", async () => {
    const user = userEvent.setup();
    renderApp(async () => ({ ...answered, freshness: "stale" }));
    await user.type(screen.getByLabelText("你的问题"), "报名");
    await user.click(screen.getByRole("button", { name: "查询官方资料" }));

    expect(await screen.findByText("资料可能已过期，请核对来源")).toBeInTheDocument();
  });

  test("submits_with_enter_and_keeps_shift_enter_for_newlines", async () => {
    const user = userEvent.setup();
    renderApp(async () => answered);
    const input = screen.getByLabelText("你的问题");
    await user.type(input, "报名时间");
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(screen.queryByText("Registration opens in November.")).not.toBeInTheDocument();
    fireEvent.keyDown(input, { key: "Enter" });

    expect(await screen.findByText("Registration opens in November.")).toBeInTheDocument();
  });

  test("shares_only_the_public_app_url_without_question_text", async () => {
    const user = userEvent.setup();
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(window.navigator, "clipboard", {
      value: { writeText },
      configurable: true
    });
    renderApp();
    await user.type(screen.getByLabelText("你的问题"), "私人问题内容");
    await user.click(screen.getByRole("button", { name: "复制分享链接" }));

    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain("/isb-knowledge-bot/");
    expect(writeText.mock.calls[0]?.[0]).not.toContain("私人问题内容");
  });
});
