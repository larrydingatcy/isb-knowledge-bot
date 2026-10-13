import type { KnowledgeItem, KnowledgeManifest } from "@isb/knowledge/schema";

import type { Language } from "../i18n.js";
import { copy } from "../i18n.js";

export function RecentUpdates(props: {
  language: Language;
  items: KnowledgeItem[];
  manifest?: KnowledgeManifest | undefined;
}) {
  const text = copy[props.language];
  const recent = props.items
    .slice()
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt))
    .slice(0, 4);
  return (
    <section className="updates-section" aria-labelledby="recent-updates-title">
      <div className="section-heading updates-heading">
        <div>
          <p className="section-kicker">LATEST</p>
          <h2 id="recent-updates-title">{text.recent}</h2>
          <p>{text.recentSubtitle}</p>
        </div>
        {props.manifest ? (
          <span className="knowledge-status">{text.serviceCurrent} · {new Date(props.manifest.generatedAt).toLocaleDateString(props.language)}</span>
        ) : null}
      </div>
      {recent.length ? (
        <div className="updates-list">
          {recent.map((entry) => (
            <article key={entry.id}>
              <p>{entry.category}</p>
              <h3>{entry.title}</h3>
              <span>{new Date(entry.publishedAt).toLocaleDateString(props.language)}</span>
              <a href={entry.sourceUrl} target="_blank" rel="noreferrer">{text.sources} ↗</a>
            </article>
          ))}
        </div>
      ) : <p>{text.noUpdates}</p>}
    </section>
  );
}
