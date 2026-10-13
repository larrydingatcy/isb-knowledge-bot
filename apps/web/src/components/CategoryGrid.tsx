import { categories, type Category, type Language, copy } from "../i18n.js";

const icons: Record<Category, string> = {
  calendar: "日",
  activities: "动",
  dining: "餐",
  schedule: "课",
  transport: "行",
  forms: "表",
  policies: "规"
};

export function CategoryGrid(props: {
  language: Language;
  selected?: Category | undefined;
  onSelect: (category: Category) => void;
}) {
  const text = copy[props.language];
  return (
    <section className="category-section" aria-label={text.categoriesRegion}>
      <div className="section-heading">
        <p className="section-kicker">EXPLORE</p>
        <h2>{text.categoriesTitle}</h2>
      </div>
      <div className="category-grid">
        {categories.map((category) => (
          <button
            className={props.selected === category ? "category-card selected" : "category-card"}
            key={category}
            type="button"
            onClick={() => props.onSelect(category)}
          >
            <span aria-hidden="true">{icons[category]}</span>
            {text.category[category]}
          </button>
        ))}
      </div>
    </section>
  );
}
