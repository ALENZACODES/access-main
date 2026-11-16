// @vitest-environment jsdom
import axe from "axe-core";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { catalogs } from "../i18n/index.ts";
import { DEMO_CONSENT_LEDGER, DEMO_INPUT_SETS, DEMO_PURPOSE, DEMO_REGIONS, DEMO_REPORTS, DEMO_REPORT_AS_OF } from "../reports/demo.ts";
import type { PackFile, ReportPackInput } from "../reports/pack.ts";
import { App } from "./App.tsx";
import { ReportsPanel } from "./ReportsPanel.tsx";

afterEach(cleanup);

const input: ReportPackInput = { reports: DEMO_REPORTS, inputSets: DEMO_INPUT_SETS, regions: DEMO_REGIONS, consentLedger: DEMO_CONSENT_LEDGER };
const options = { asOf: DEMO_REPORT_AS_OF, requiredPurpose: DEMO_PURPOSE };
const noLogs = { deliveries: [], citations: [], reviews: [] };

describe("report tables", () => {
  it("shows the limits, the demonstration notice and one table per published kind and period", () => {
    render(<ReportsPanel lang="en" input={input} options={options} logs={noLogs} />);
    expect(screen.getByText(/These are reports, not a census\./)).toBeTruthy();
    expect(screen.getByText(/The reports are not verified\./)).toBeTruthy();
    expect(screen.getByText(/Every report, region and source in it is synthetic/)).toBeTruthy();
    expect(screen.getByRole("table", { name: "Parking, 2026-10" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Barriers, 2026-10" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Housing waits, 2026-09" })).toBeTruthy();
    expect(screen.queryByRole("table", { name: "Coverage, 2026-10" })).toBeNull();
    expect(screen.getByText("This table is withheld because it has fewer than 5 reports.")).toBeTruthy();
  });

  it("marks suppressed cells in words and shows no number from 1 to 4 in any table cell", () => {
    render(<ReportsPanel lang="en" input={input} options={options} logs={noLogs} />);
    const parking = screen.getByRole("table", { name: "Parking, 2026-10" });
    expect(within(parking).getAllByText("Suppressed").length).toBeGreaterThanOrEqual(4);
    for (const table of within(screen.getByTestId("reports-section")).getAllByRole("table")) {
      for (const cell of within(table).getAllByRole("cell")) {
        expect(cell.textContent).toMatch(/^(Suppressed|0|[5-9]|\d{2,})$/);
      }
    }
  });

  it("gives every table a caption, column headers and row headers", () => {
    render(<ReportsPanel lang="en" input={input} options={options} logs={noLogs} />);
    const parking = screen.getByRole("table", { name: "Parking, 2026-10" });
    expect(within(parking).getByRole("columnheader", { name: "Region" })).toBeTruthy();
    expect(within(parking).getByRole("columnheader", { name: "Total" })).toBeTruthy();
    expect(within(parking).getByRole("rowheader", { name: "demo-area-east" })).toBeTruthy();
    expect(within(parking).getByRole("rowheader", { name: "Total" })).toBeTruthy();
    expect(screen.getByText("These rows cover a whole larger region: demo-area-east.")).toBeTruthy();
  });

  it("puts a wide table in a labelled box that can take keyboard focus", () => {
    render(<ReportsPanel lang="en" input={input} options={options} logs={noLogs} />);
    const box = screen.getByRole("group", { name: "Parking, 2026-10" });
    expect(box.getAttribute("tabindex")).toBe("0");
    box.focus();
    expect(document.activeElement).toBe(box);
  });

  it("exports the five files from the keyboard-operable button and announces it", () => {
    const onExportFiles = vi.fn<(files: PackFile[]) => void>();
    render(<ReportsPanel lang="en" input={input} options={options} logs={noLogs} onExportFiles={onExportFiles} />);
    const button = screen.getByRole("button", { name: "Export report pack" });
    expect(button.getAttribute("type")).toBe("button");
    fireEvent.click(button);
    expect(onExportFiles.mock.calls[0]?.[0].map((file) => file.name)).toEqual([
      "advocacy-report-pack-2026-11-15.json",
      "advocacy-report-pack-2026-11-15-tables.csv",
      "advocacy-report-pack-2026-11-15-provenance.csv",
      "advocacy-report-pack-2026-11-15.en.md",
      "advocacy-report-pack-2026-11-15.fr.md",
    ]);
    const status = screen.getByTestId("reports-export-status");
    expect(status.getAttribute("aria-live")).toBe("polite");
    expect(status.textContent).toBe("Report pack exported as 5 files.");
  });

  it("refuses to show tables when a consent was revoked, and says how many reports are affected, not which", () => {
    const ledger = DEMO_CONSENT_LEDGER.map((entry, i) => (i < 2 ? { ...entry, status: "revoked" as const } : entry));
    render(<ReportsPanel lang="en" input={{ ...input, consentLedger: ledger }} options={options} logs={noLogs} />);
    expect(screen.getByRole("heading", { name: "The pack was not built" })).toBeTruthy();
    expect(screen.getByText("Reports whose consent was revoked: 2")).toBeTruthy();
    expect(within(screen.getByTestId("reports-section")).queryByRole("table")).toBeNull();
    expect(screen.queryByRole("button", { name: "Export report pack" })).toBeNull();
    expect(document.body.textContent).not.toContain("example-report-0001");
  });

  it("is in French when the language is French", () => {
    render(<ReportsPanel lang="fr" input={input} options={options} logs={noLogs} />);
    expect(screen.getByRole("heading", { name: "Tableaux de signalements" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Stationnement, 2026-10" })).toBeTruthy();
    expect(screen.getByText(/Ce sont des signalements, pas un recensement\./)).toBeTruthy();
    expect(screen.getAllByText("Supprimée").length).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText("Suppressed")).toBeNull();
  });

  it("has a string in both languages for every topic, kind, tier, label and refusal it can show", () => {
    for (const key of Object.keys(catalogs.en).filter((k) => k.startsWith("rp.") || k.startsWith("kpi."))) {
      expect(catalogs.fr[key as keyof typeof catalogs.fr], key).toBeTruthy();
    }
  });
});

describe("indicators", () => {
  it("says no data yet where nothing has been logged, and shows counts read from the pack", () => {
    render(<ReportsPanel lang="en" input={input} options={options} logs={noLogs} />);
    const outcomes = screen.getByRole("table", { name: "Outcomes" });
    expect(within(outcomes).getAllByText("No data yet")).toHaveLength(2);
    const inputs = screen.getByRole("table", { name: "Inputs" });
    const parking = within(inputs).getByRole("rowheader", { name: "Parking reports in published tables of the latest pack" }).closest("tr");
    expect(parking?.textContent).toContain("92 (from example records)");
    const coverage = within(inputs).getByRole("rowheader", { name: "Coverage reports in published tables of the latest pack" }).closest("tr");
    expect(coverage?.textContent).toContain("No data yet");
  });

  it("shows no baseline or target", () => {
    render(<ReportsPanel lang="en" input={input} options={options} logs={noLogs} />);
    const section = screen.getByRole("heading", { name: "Indicators" }).closest("section");
    expect(section?.textContent).toContain("No baseline or target is shown.");
    expect((section?.textContent ?? "").replace("No baseline or target is shown.", "")).not.toMatch(/baseline|target|goal/i);
  });

  it("says no data yet for every indicator when the pack is refused", () => {
    render(<ReportsPanel lang="en" input={{ ...input, consentLedger: [] }} options={options} logs={noLogs} />);
    expect(screen.getAllByText("No data yet")).toHaveLength(9);
  });
});

describe("accessibility of the whole screen with the report tables", () => {
  for (const lang of ["en", "fr"] as const) {
    it(`has no axe violations in ${lang} (colour contrast is checked in the browser test)`, async () => {
      const { container } = render(<App initialLang={lang} />);
      expect(screen.getAllByRole("table").length).toBeGreaterThanOrEqual(6);
      const results = await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
      expect(results.violations.map((v) => v.id)).toEqual([]);
    });
  }
});
