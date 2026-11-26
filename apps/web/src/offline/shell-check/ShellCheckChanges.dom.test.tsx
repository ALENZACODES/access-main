/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { ShellReport, ShellState } from "./probe";
import ShellCheckChanges from "./ShellCheckChanges";

type File = ShellReport["files"][number];
const script: File = { path: "assets/main.js", kind: "script", state: "present" };
const css: File = { path: "assets/main.css", kind: "style", state: "missing" };
const doc: File = { path: "index.html", kind: "document", state: "unknown" };

function report(files: File[], changes: Partial<Omit<ShellReport, "files">> = {}): ShellReport {
  return { worker: "controlled", limited: false, files, ...changes };
}

function openDetails(label = "Compare the two latest checks") {
  const disclosure = screen.getByText(label).closest("details");
  if (!disclosure) throw new Error("Expected a native details element");
  disclosure.open = true;
  fireEvent(disclosure, new Event("toggle"));
  return disclosure;
}

function changedRow(path: string) {
  const row = screen.getByText(path).closest("li");
  if (!row) throw new Error("Expected a changed file row");
  return within(row);
}

afterEach(cleanup);

describe("comparing consecutive completed startup checks", () => {
  it("discloses the comparison on demand and releases file rows when closed", () => {
    render(<ShellCheckChanges previous={report([])} current={report([script])} language="en" />);
    expect(screen.queryByText(script.path)).toBeNull();
    const summary = screen.getByText("Compare the two latest checks");
    expect(summary.tagName).toBe("SUMMARY");
    expect(summary.style.minHeight).toBe("44px");
    const details = openDetails();
    expect(screen.getByRole("list", { name: "Differences between the file lists" })).toBeDefined();
    details.open = false;
    fireEvent(details, new Event("toggle"));
    expect(screen.queryByText(script.path)).toBeNull();
  });

  it("matches paths across reordering without claiming a file changed", () => {
    render(<ShellCheckChanges previous={report([script, css])} current={report([css, script])} language="en" />);
    openDetails();
    expect(screen.getByText("Both lists contain the same paths, file types and cache results.")).toBeDefined();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("preserves latest order followed by earlier-only paths in their original order", () => {
    const before = report([script, css, doc]);
    const latestScript = { ...script, path: "assets/new.js" };
    const after = report([latestScript, { ...doc, state: "present" }]);
    render(<ShellCheckChanges previous={before} current={after} language="en" />);
    openDetails();
    const rows = screen.getAllByRole("listitem");
    expect(rows.map((row) => row.querySelector("code")?.textContent)).toEqual([
      latestScript.path, doc.path, script.path, css.path,
    ]);
    expect(changedRow(latestScript.path).getByText("Listed only in the latest check")).toBeDefined();
    expect(changedRow(script.path).getByText("Listed only in the earlier check")).toBeDefined();
    expect(changedRow(css.path).getByText("Style sheets — Missing")).toBeDefined();
  });

  it("distinguishes same basenames in different build directories", () => {
    const earlier = { ...script, path: "assets/previous/main.js" };
    const latest = { ...script, path: "assets/latest/main.js" };
    render(<ShellCheckChanges previous={report([earlier])} current={report([latest])} language="en" />);
    openDetails();
    expect(changedRow(earlier.path).getByText("Listed only in the earlier check")).toBeDefined();
    expect(changedRow(latest.path).getByText("Listed only in the latest check")).toBeDefined();
    expect(screen.queryByText("Earlier cache result")).toBeNull();
  });

  const transitions: [ShellState, ShellState, string, string][] = [
    ["unknown", "present", "UNKNOWN", "Saved"],
    ["unknown", "missing", "UNKNOWN", "Missing"],
    ["present", "unknown", "Saved", "UNKNOWN"],
    ["missing", "unknown", "Missing", "UNKNOWN"],
    ["present", "missing", "Saved", "Missing"],
    ["missing", "present", "Missing", "Saved"],
  ];
  it.each(transitions)("shows the cache evidence in order for %s → %s", (earlier, latest, from, to) => {
    render(<ShellCheckChanges previous={report([{ ...script, state: earlier }])}
      current={report([{ ...script, state: latest }])} language="en" />);
    openDetails();
    const row = changedRow(script.path);
    expect(row.getByText("Earlier cache result").nextElementSibling?.textContent).toBe(from);
    expect(row.getByText("Latest cache result").nextElementSibling?.textContent).toBe(to);
    expect(row.queryByText("Earlier file type")).toBeNull();
  });

  it("separates a role change from a cache result change", () => {
    const before = report([{ ...script, kind: "preload" }]);
    const view = render(<ShellCheckChanges previous={before} current={report([script])} language="en" />);
    openDetails();
    const row = changedRow(script.path);
    expect(row.getByText("Earlier file type").nextElementSibling?.textContent).toBe("Module preload hints");
    expect(row.getByText("Latest file type").nextElementSibling?.textContent).toBe("Startup scripts");
    expect(row.queryByText("Earlier cache result")).toBeNull();

    view.rerender(<ShellCheckChanges previous={before} current={report([{ ...script, state: "unknown" }])} language="en" />);
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(changedRow(script.path).getByText("Earlier file type")).toBeDefined();
    expect(changedRow(script.path).getByText("Latest cache result").nextElementSibling?.textContent).toBe("UNKNOWN");
  });

  it("shows a new worker observation even when the listed files are unchanged", () => {
    render(<ShellCheckChanges previous={report([doc], { worker: "unavailable" })}
      current={report([doc])} language="en" />);
    openDetails();
    expect(screen.getByRole("heading", { name: "Change in offline worker information" })).toBeDefined();
    expect(screen.getByText("Earlier check").nextElementSibling?.textContent).toMatch(/identify/);
    expect(screen.getByText("Latest check").nextElementSibling?.textContent).toMatch(/controls this page/);
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("marks both partial lists and keeps cache evidence unknown for unobserved sides", () => {
    render(<ShellCheckChanges previous={report([script], { limited: true })}
      current={report([css], { limited: true })} language="en" />);
    openDetails();
    expect(screen.getByText("The earlier check listed only some startup files.")).toBeDefined();
    expect(screen.getByText("The latest check listed only some startup files.")).toBeDefined();
    expect(screen.getByText(/Its cache status for the other check is UNKNOWN/)).toBeDefined();
    const disappeared = changedRow(script.path);
    expect(disappeared.getByText("Startup scripts — Saved")).toBeDefined();
    expect(disappeared.queryByText(/Missing/)).toBeNull();
  });

  it("retains the partial qualifier on an empty list beside a complete empty list", () => {
    render(<ShellCheckChanges previous={report([], { limited: true })} current={report([])} language="en" />);
    openDetails();
    expect(screen.getByText("The earlier check listed only some startup files.")).toBeDefined();
    expect(screen.queryByText("The latest check listed only some startup files.")).toBeNull();
    expect(screen.getByText(/Both lists contain the same paths/)).toBeDefined();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("switches language without changing the evidence or losing the open disclosure", () => {
    const before = report([doc]);
    const after = report([{ ...doc, state: "present" }, css], { limited: true });
    const view = render(<ShellCheckChanges previous={before} current={after} language="en" />);
    const details = openDetails();
    view.rerender(<ShellCheckChanges previous={before} current={after} language="fr" />);
    expect(details.open).toBe(true);
    expect(details.lang).toBe("fr");
    expect(screen.getByText("Comparer les deux derniers examens")).toBeDefined();
    expect(screen.getByRole("list", { name: "Différences entre les listes de fichiers" })).toBeDefined();
    const row = changedRow(doc.path);
    expect(row.getByText("Résultat précédent du cache").nextElementSibling?.textContent).toBe("UNKNOWN");
    expect(row.getByText("Dernier résultat du cache").nextElementSibling?.textContent).toBe("En cache");
    expect(changedRow(css.path).getByText("Présent seulement dans la dernière liste")).toBeDefined();
    expect(changedRow(css.path).getByText("Feuilles de style — Absent")).toBeDefined();
  });
});
