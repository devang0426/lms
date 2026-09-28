/* Reciprocal rank fusion (feature 13). Pure.

   Each list is a ranking, best first. An item scores Σ 1 / (K + rank) over
   the lists it appears in (rank from 1), so an item near the top of both
   the vector and the full-text ranking beats one that tops only one. K = 60
   is the usual constant: it keeps one list's first place from swamping
   everything else. */

export const RRF_K = 60;

export function reciprocalRankFusion<T extends { id: string }>(lists: T[][], k = RRF_K): { item: T; score: number }[] {
  const fused = new Map<string, { item: T; score: number; best: number }>();
  for (const list of lists) {
    list.forEach((item, index) => {
      const entry = fused.get(item.id) ?? { item, score: 0, best: Infinity };
      entry.score += 1 / (k + index + 1);
      entry.best = Math.min(entry.best, index);
      fused.set(item.id, entry);
    });
  }
  // Ties (same score) go to the item ranked higher in any list, then by id,
  // so the order is stable.
  return [...fused.values()]
    .sort((a, b) => b.score - a.score || a.best - b.best || a.item.id.localeCompare(b.item.id))
    .map(({ item, score }) => ({ item, score }));
}
