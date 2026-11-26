export type TextStressIssueCode =
  | "text-block-width-invalid" | "text-block-height-invalid" | "text-block-clipped"
  | "text-block-overflow" | "text-block-line-count-shrank" | "text-block-font-shrank"
  | "text-block-line-height-not-raised" | "text-block-paragraph-gap-not-raised"
  | "text-block-letter-spacing-not-raised" | "text-block-word-spacing-not-raised"
  | "text-block-overlaps-next" | "text-block-content-missing";
export interface TextBlock {
  readonly id: string; readonly text: string; readonly x: number; readonly y: number;
  readonly width: number; readonly height: number; readonly scrollWidth: number;
  readonly clientWidth: number; readonly lineCount: number; readonly fontSize: number;
  readonly lineHeight: number; readonly paragraphGap: number;
  readonly letterSpacing: number; readonly wordSpacing: number;
  readonly visible: boolean;
}
export interface TextStressFrame {
  readonly viewportWidth: number; readonly blocks: readonly TextBlock[];
  readonly applied: {
    readonly lineHeight: number; readonly paragraphGap: number;
    readonly letterSpacing: number; readonly wordSpacing: number;
  };
}
export interface TextStressIssue {
  readonly code: TextStressIssueCode; readonly block: string;
  readonly measured: string; readonly expected: string; readonly severity: "error" | "review";
}
export interface TextStressReport {
  readonly issues: readonly TextStressIssue[]; readonly errors: number;
  readonly reviews: number; readonly blocks: number; readonly clean: boolean;
}
function record(out: TextStressIssue[], code: TextStressIssueCode, block: string,
  measured: string, expected: string, severity: "error" | "review" = "error") {
  out.push({ code, block, measured, expected, severity });
}
export function evaluateTextStress(frame: TextStressFrame): TextStressReport {
  const issues: TextStressIssue[] = [];
  if (!Number.isFinite(frame.viewportWidth) || frame.viewportWidth <= 0) {
    record(issues, "text-block-width-invalid", "viewport", String(frame.viewportWidth), "> 0");
  }
  for (let index = 0; index < frame.blocks.length; index += 1) {
    const block = frame.blocks[index]!;
    if (!Number.isFinite(block.width) || block.width <= 0) record(issues, "text-block-width-invalid", block.id, String(block.width), "> 0");
    if (!Number.isFinite(block.height) || block.height <= 0) record(issues, "text-block-height-invalid", block.id, String(block.height), "> 0");
    if (block.scrollWidth - block.clientWidth > 1) record(issues, "text-block-overflow", block.id, `${block.scrollWidth}px`, `${block.clientWidth}px`, "review");
    if (block.x < 0 || block.x + block.width > frame.viewportWidth) record(issues, "text-block-clipped", block.id,
      `${block.x}..${block.x + block.width}`, `0..${frame.viewportWidth}`, "review");
    if (block.visible && block.text.trim().length === 0) record(issues, "text-block-content-missing", block.id, "empty", "non-empty", "review");
    if (block.lineHeight < 1.5 * block.fontSize) record(issues, "text-block-line-height-not-raised", block.id,
      `${block.lineHeight}px`, `>= ${1.5 * block.fontSize}px`);
    if (block.paragraphGap < 2 * block.fontSize) record(issues, "text-block-paragraph-gap-not-raised", block.id,
      `${block.paragraphGap}px`, `>= ${2 * block.fontSize}px`);
    if (block.letterSpacing < .12 * block.fontSize) record(issues, "text-block-letter-spacing-not-raised", block.id,
      `${block.letterSpacing}px`, `>= ${.12 * block.fontSize}px`);
    if (block.wordSpacing < .16 * block.fontSize) record(issues, "text-block-word-spacing-not-raised", block.id,
      `${block.wordSpacing}px`, `>= ${.16 * block.fontSize}px`);
    const next = frame.blocks[index + 1];
    if (next && block.visible && next.visible && block.y + block.height > next.y + 1) {
      record(issues, "text-block-overlaps-next", block.id, `${block.y + block.height}px`, `<= ${next.y}px`, "review");
    }
  }
  const errors = issues.filter((item) => item.severity === "error").length;
  return { issues, errors, reviews: issues.length - errors, blocks: frame.blocks.length, clean: errors === 0 };
}
export function compareTextFrames(before: TextStressFrame, after: TextStressFrame): TextStressIssue[] {
  const issues: TextStressIssue[] = [];
  const afterById = new Map(after.blocks.map((block) => [block.id, block]));
  for (const first of before.blocks) {
    const second = afterById.get(first.id);
    if (!second) {
      record(issues, "text-block-content-missing", first.id, "missing after stress", "same content remains", "review");
      continue;
    }
    if (second.lineCount < first.lineCount) record(issues, "text-block-line-count-shrank", first.id,
      `${first.lineCount} -> ${second.lineCount}`, "same or more wrapped lines");
    if (second.fontSize < first.fontSize) record(issues, "text-block-font-shrank", first.id,
      `${first.fontSize}px -> ${second.fontSize}px`, "font size preserved");
  }
  return issues;
}
export function textStressKey(route: string, locale: string, width: number): string {
  return `${route}|${locale}|${width}|text-spacing`;
}
export function textStressSummary(report: TextStressReport): string {
  return [`Blocks: ${report.blocks}`, `Errors: ${report.errors}`, `Reviews: ${report.reviews}`,
    `Status: ${report.clean ? "clean" : "needs review"}`].join("\n");
}
