export interface BreakpointObservation {
  readonly width: number; readonly mobileNavigationVisible: boolean;
  readonly desktopNavigationVisible: boolean; readonly columns: number;
  readonly horizontalOverflow: number; readonly sidePanelVisible: boolean;
  readonly contentVisible: boolean;
}
export interface BreakpointIssue {
  readonly code: "both-navigation-visible" | "no-navigation-visible" | "columns-invalid"
    | "overflow-at-breakpoint" | "content-hidden" | "panel-toggle-inconsistent"
    | "non-monotonic-columns" | "duplicate-width";
  readonly width: number; readonly detail: string; readonly severity: "error" | "review";
}
export interface BreakpointReport {
  readonly issues: readonly BreakpointIssue[]; readonly widths: number[];
  readonly clean: boolean; readonly errors: number; readonly reviews: number;
}
export function inspectBreakpoint(observation: BreakpointObservation): BreakpointIssue[] {
  const issues: BreakpointIssue[] = [];
  const add = (code: BreakpointIssue["code"], detail: string, severity: "error" | "review" = "error") =>
    issues.push({ code, width: observation.width, detail, severity });
  if (observation.mobileNavigationVisible && observation.desktopNavigationVisible) add("both-navigation-visible", "Mobile and desktop navigation are visible at the same time");
  if (!observation.mobileNavigationVisible && !observation.desktopNavigationVisible) add("no-navigation-visible", "No primary navigation is visible");
  if (!Number.isInteger(observation.columns) || observation.columns < 1 || observation.columns > 12) add("columns-invalid", `Column count ${observation.columns} is outside 1..12`);
  if (observation.horizontalOverflow > 1) add("overflow-at-breakpoint", `${observation.horizontalOverflow}px horizontal overflow`);
  if (!observation.contentVisible) add("content-hidden", "Main content is not visible");
  if (observation.sidePanelVisible && observation.width < 600) add("panel-toggle-inconsistent", "Side panel is visible below the compact-layout threshold", "review");
  return issues;
}
export function inspectBreakpointSeries(observations: readonly BreakpointObservation[]): BreakpointReport {
  const sorted = [...observations].sort((a, b) => a.width - b.width);
  const issues = sorted.flatMap(inspectBreakpoint);
  const seen = new Set<number>();
  for (const item of sorted) {
    if (seen.has(item.width)) issues.push({ code: "duplicate-width", width: item.width, detail: "Viewport width was observed more than once", severity: "review" });
    seen.add(item.width);
  }
  for (let index = 1; index < sorted.length; index += 1) {
    const before = sorted[index - 1]!;
    const after = sorted[index]!;
    if (after.width > before.width && after.columns < before.columns) {
      issues.push({ code: "non-monotonic-columns", width: after.width, detail: "Column count decreased as the viewport widened", severity: "review" });
    }
  }
  const errors = issues.filter((item) => item.severity === "error").length;
  return { issues, widths: sorted.map((item) => item.width), clean: errors === 0, errors, reviews: issues.length - errors };
}
export function breakpointKey(observation: BreakpointObservation): string {
  return `${observation.width}|${observation.columns}|${observation.mobileNavigationVisible ? "m" : ""}${observation.desktopNavigationVisible ? "d" : ""}`;
}
export function breakpointSummary(report: BreakpointReport): string {
  return [`Widths: ${report.widths.join(", ")}`, `Errors: ${report.errors}`,
    `Reviews: ${report.reviews}`, `Status: ${report.clean ? "clean" : "needs attention"}`].join("\n");
}
