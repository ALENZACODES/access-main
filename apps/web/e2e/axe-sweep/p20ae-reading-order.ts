import type { Rect } from "./p20ae-reflow-contracts.ts";
export interface OrderedItem {
  readonly id: string; readonly domIndex: number; readonly rect: Rect;
  readonly visible: boolean; readonly column: number;
}
export interface ReadingOrderIssue {
  readonly code: "visual-order-inversion" | "duplicate-dom-index" | "duplicate-item-id" | "negative-dom-index" | "overlap-in-reading-order";
  readonly first: string; readonly second: string; readonly detail: string;
}
export interface ReadingOrderReport {
  readonly issues: readonly ReadingOrderIssue[];
  readonly visibleItems: number; readonly orderedItems: number;
  readonly clean: boolean;
}
function sameColumn(a: OrderedItem, b: OrderedItem, tolerance: number): boolean {
  const overlap = Math.min(a.rect.right, b.rect.right) - Math.max(a.rect.left, b.rect.left);
  return overlap > tolerance || a.column === b.column;
}
export function compareReadingOrder(items: readonly OrderedItem[], tolerance = 2): ReadingOrderReport {
  const issues: ReadingOrderIssue[] = [];
  const ids = new Set<string>();
  const indexes = new Set<number>();
  for (const item of items) {
    if (ids.has(item.id)) issues.push({ code: "duplicate-item-id", first: item.id, second: item.id, detail: "Item identity appears more than once" });
    ids.add(item.id);
    if (indexes.has(item.domIndex)) issues.push({ code: "duplicate-dom-index", first: String(item.domIndex), second: item.id, detail: "DOM order index appears more than once" });
    indexes.add(item.domIndex);
    if (item.domIndex < 0) issues.push({ code: "negative-dom-index", first: item.id, second: String(item.domIndex), detail: "DOM order index is negative" });
  }
  const ordered = [...items].filter((item) => item.visible).sort((a, b) => a.domIndex - b.domIndex);
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const first = ordered[index]!;
    const second = ordered[index + 1]!;
    if (sameColumn(first, second, tolerance) && second.rect.top + tolerance < first.rect.top) {
      issues.push({ code: "visual-order-inversion", first: first.id, second: second.id, detail: "Later DOM item appears above the preceding item in the same visual column" });
    }
    const verticalOverlap = Math.min(first.rect.bottom, second.rect.bottom) - Math.max(first.rect.top, second.rect.top);
    const horizontalOverlap = Math.min(first.rect.right, second.rect.right) - Math.max(first.rect.left, second.rect.left);
    if (verticalOverlap > tolerance && horizontalOverlap > tolerance) {
      issues.push({ code: "overlap-in-reading-order", first: first.id, second: second.id, detail: "Adjacent reading-order items overlap visually" });
    }
  }
  return { issues, visibleItems: ordered.length, orderedItems: items.length, clean: issues.length === 0 };
}
export function readingOrderKey(items: readonly OrderedItem[]): string {
  return [...items].sort((a, b) => a.domIndex - b.domIndex).map((item) => item.id).join(">");
}
export function readingOrderSummary(report: ReadingOrderReport): string {
  return [`Visible: ${report.visibleItems}`, `Observed: ${report.orderedItems}`,
    `Issues: ${report.issues.length}`, `Status: ${report.clean ? "clean" : "review"}`].join("\n");
}
