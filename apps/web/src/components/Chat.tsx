import { useState, type FormEvent, type KeyboardEvent } from "react";

import type { Category, Language } from "../i18n.js";
import { copy } from "../i18n.js";

export function Chat(props: {
  language: Language;
  category?: Category | undefined;
  loading: boolean;
  onAsk: (question: string) => Promise<void>;
  onShare: () => Promise<void>;
  shared: boolean;
}) {
  const [question, setQuestion] = useState("");
  const text = copy[props.language];

  async function submit(event?: FormEvent) {
    event?.preventDefault();
    const trimmed = question.trim();
    if (!trimmed || props.loading) return;
    await props.onAsk(trimmed);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <form className="chat-panel" onSubmit={submit}>
      <label htmlFor="question">{text.questionLabel}</label>
      <textarea
        id="question"
        maxLength={500}
        rows={3}
        value={question}
        placeholder={text.questionPlaceholder}
        onChange={(event) => setQuestion(event.target.value)}
        onKeyDown={onKeyDown}
      />
      <div className="chat-actions">
        <button className="primary-button" type="submit" disabled={props.loading || !question.trim()}>
          {text.ask}
        </button>
        <button className="link-button" type="button" onClick={() => void props.onShare()}>
          {props.shared ? text.shared : text.share}
        </button>
      </div>
      {props.loading ? <p className="loading" role="status">{text.loading}</p> : null}
    </form>
  );
}
