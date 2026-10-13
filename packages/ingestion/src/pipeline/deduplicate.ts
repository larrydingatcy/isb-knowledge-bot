import type { KnowledgeItem } from "@isb/knowledge/schema";

export function deduplicateItems(items: KnowledgeItem[]): KnowledgeItem[] {
  const byHash = new Map<string, KnowledgeItem>();
  for (const item of items) if (!byHash.has(item.contentHash)) byHash.set(item.contentHash, item);
  return [...byHash.values()].sort((left, right) => left.id.localeCompare(right.id));
}

export function tagConflicts(items: KnowledgeItem[]): { items: KnowledgeItem[]; conflicts: Array<{ key: string; itemIds: string[] }> } {
  const groups = new Map<string, KnowledgeItem[]>();
  for (const item of items) {
    const key = `${item.category}:${item.title.toLocaleLowerCase()}`;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  const conflictIds = new Set<string>();
  const conflicts = [...groups.entries()].filter(([, group]) => group.length > 1).map(([key, group]) => {
    group.forEach((item) => conflictIds.add(item.id));
    return { key, itemIds: group.map((item) => item.id) };
  });
  return {
    items: items.map((item) => conflictIds.has(item.id) ? { ...item, warnings: [...new Set([...item.warnings, "conflicting-source-facts"])] } : item),
    conflicts
  };
}
