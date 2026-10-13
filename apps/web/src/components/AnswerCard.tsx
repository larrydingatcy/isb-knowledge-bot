import type { AnswerResult } from "@isb/answering/types";

import type { Language } from "../i18n.js";
import { copy } from "../i18n.js";

export function AnswerCard(props: { language: Language; answer: AnswerResult }) {
  const text = copy[props.language];
  const freshness = props.answer.status === "answered" ? props.answer.freshness : undefined;
  return (
    <article className="answer-card" aria-live="polite">
      <p className="answer-text">{props.answer.answer}</p>
      {freshness === "stale" ? <p className="freshness-warning">{text.stale}</p> : null}
      {freshness === "expired" ? <p className="freshness-warning">{text.expired}</p> : null}
      {props.answer.citations.length ? (
        <div className="citations">
          <h3>{text.sources}</h3>
          <ul>
            {props.answer.citations.map((citation) => (
              <li key={citation.id}>
                <a href={citation.url} target="_blank" rel="noreferrer">{citation.title}</a>
                <small>{text.verified}: {new Date(citation.crawledAt).toLocaleDateString(props.language)}</small>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
