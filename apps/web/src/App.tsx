import { useEffect, useMemo, useState } from "react";

import type { AnswerResult } from "@isb/answering/types";
import type { KnowledgeItem, KnowledgeManifest } from "@isb/knowledge/schema";

import { loadKnowledge, requestAnswer, type ChatRequest } from "./api.js";
import { AnswerCard } from "./components/AnswerCard.js";
import { CategoryGrid } from "./components/CategoryGrid.js";
import { Chat } from "./components/Chat.js";
import { RecentUpdates } from "./components/RecentUpdates.js";
import { copy, type Category, type Language } from "./i18n.js";

export type ChatClient = (input: ChatRequest) => Promise<AnswerResult>;

export interface AppProps {
  chatClient?: ChatClient;
  initialKnowledge?: { items: KnowledgeItem[]; manifest: KnowledgeManifest };
}

function initialLanguage(): Language {
  const saved = localStorage.getItem("isb-language");
  if (saved === "zh" || saved === "en") return saved;
  return navigator.language.toLocaleLowerCase().startsWith("zh") ? "zh" : "en";
}

export function App(props: AppProps) {
  const [language, setLanguage] = useState<Language>(initialLanguage);
  const [category, setCategory] = useState<Category>();
  const [answer, setAnswer] = useState<AnswerResult>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [shared, setShared] = useState(false);
  const [knowledge, setKnowledge] = useState(props.initialKnowledge);
  const chatClient = props.chatClient ?? requestAnswer;
  const text = copy[language];

  useEffect(() => {
    if (!props.initialKnowledge) {
      void loadKnowledge().then(setKnowledge).catch(() => undefined);
    }
  }, [props.initialKnowledge]);

  const visibleItems = useMemo(() => {
    const items = knowledge?.items ?? [];
    const localized = items.filter((entry) => entry.language === language);
    return localized.length ? localized : items;
  }, [knowledge, language]);

  function toggleLanguage() {
    const next = language === "zh" ? "en" : "zh";
    localStorage.setItem("isb-language", next);
    setLanguage(next);
    setAnswer(undefined);
    setError(false);
  }

  async function ask(question: string) {
    setLoading(true);
    setError(false);
    setAnswer(undefined);
    try {
      const request: ChatRequest = category
        ? { question, language, category }
        : { question, language };
      setAnswer(await chatClient(request));
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  async function share() {
    const publicUrl = new URL("/isb-knowledge-bot/", window.location.origin).toString();
    await navigator.clipboard.writeText(publicUrl);
    setShared(true);
  }

  return (
    <div className="app-shell">
      <header className="hero">
        <nav aria-label="Language and sharing">
          <a className="brand" href={import.meta.env.BASE_URL} aria-label="ISB Knowledge home">
            <span>ISB</span> KNOWLEDGE
          </a>
          <button className="language-button" type="button" onClick={toggleLanguage}>{text.switchLanguage}</button>
        </nav>
        <div className="hero-content">
          <p className="eyebrow">{text.eyebrow}</p>
          <h1>{text.title}</h1>
          <p className="subtitle">{text.subtitle}</p>
          <Chat
            language={language}
            category={category}
            loading={loading}
            onAsk={ask}
            onShare={share}
            shared={shared}
          />
          {error ? <p className="error-message" role="alert">{text.error}</p> : null}
          {answer ? <AnswerCard language={language} answer={answer} /> : null}
        </div>
      </header>
      <main>
        <CategoryGrid language={language} selected={category} onSelect={setCategory} />
        <RecentUpdates language={language} items={visibleItems} manifest={knowledge?.manifest} />
      </main>
      <footer>{text.footer}</footer>
    </div>
  );
}
