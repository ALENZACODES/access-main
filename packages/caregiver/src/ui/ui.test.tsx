// @vitest-environment jsdom
import axe from "axe-core";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { demoProfile } from "../fixtures.ts";
import type { Lang } from "../i18n/index.ts";
import { CaregiverService } from "../service.ts";
import { MemoryStore } from "../store.ts";
import { App } from "./App.tsx";

afterEach(cleanup);

function setup(lang: Lang = "en", view: "owner" | "caregiver" = "owner") {
  const service = new CaregiverService({ store: new MemoryStore() });
  render(<App service={service} profile={demoProfile()} demo initialLang={lang} initialView={view} />);
  return service;
}

async function violations() {
  const result = await axe.run(document.body, { rules: { "color-contrast": { enabled: false } } });
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
}

const button = (name: RegExp | string) => screen.getByRole("button", { name });

describe("owner and caregiver screens", () => {
  it("starts with nothing shared and an empty log, in English", async () => {
    setup();
    expect(await screen.findByText("You have not shared anything.")).toBeTruthy();
    expect(screen.getByText("No activity yet.")).toBeTruthy();
    expect(document.documentElement.lang).toBe("en");
    expect(screen.getByText(/Demonstration data/)).toBeTruthy();
  });

  it("grants an equipment snapshot, narrows it, shows it to the caregiver, then revokes it", async () => {
    setup();
    await screen.findByText("You have not shared anything.");
    fireEvent.change(screen.getByLabelText("Caregiver name"), { target: { value: "Sam" } });
    fireEvent.click(screen.getByLabelText("An equipment profile snapshot for booking"));
    fireEvent.click(screen.getByLabelText("Chair width"));
    fireEvent.click(screen.getByLabelText("Transfer side"));
    fireEvent.click(button("Grant access"));
    expect(await screen.findByText("Access granted to Sam.")).toBeTruthy();
    expect(screen.getByText(/Shared: Equipment snapshot: Chair width, Transfer side/)).toBeTruthy();

    fireEvent.click(button(/Stop sharing Transfer side with Sam/));
    expect(await screen.findByText("Transfer side is no longer shared with Sam.")).toBeTruthy();

    fireEvent.click(button("Caregiver view"));
    expect(await screen.findByText("680 mm")).toBeTruthy();
    expect(screen.queryByText("Left")).toBeNull();
    expect(screen.queryByText(/Routing|low_slope/i)).toBeNull();

    fireEvent.click(button("Manage sharing (owner)"));
    fireEvent.click(await screen.findByRole("button", { name: /Revoke: Sam/ }));
    expect(await screen.findByText("Access revoked for Sam.")).toBeTruthy();
    const log = within(screen.getByRole("list", { name: "Activity log" })).getAllByRole("listitem");
    expect(log.map((item) => item.textContent)).toEqual([
      expect.stringContaining("Access granted"),
      expect.stringContaining("Access narrowed"),
      expect.stringContaining("Caregiver viewed a shared item"),
      expect.stringContaining("Access revoked"),
    ]);

    fireEvent.click(button("Caregiver view"));
    expect(await screen.findByText("Nothing is shared with you right now.")).toBeTruthy();
  });

  it("refuses a phone number as a name", async () => {
    setup();
    await screen.findByText("You have not shared anything.");
    fireEvent.change(screen.getByLabelText("Caregiver name"), { target: { value: "416 555 0100" } });
    fireEvent.change(screen.getByLabelText("Journey reference"), { target: { value: "trip-1" } });
    fireEvent.change(screen.getByLabelText("Short description"), { target: { value: "Visit" } });
    fireEvent.click(button("Grant access"));
    expect((await screen.findByRole("alert")).textContent).toContain("not a phone number");
  });

  it("says so when nobody has been granted access", async () => {
    setup("en", "caregiver");
    expect(await screen.findByText("No one has been granted access yet, so there is nothing to show.")).toBeTruthy();
  });

  it("shows French text, French language attribute and no-break spaces", async () => {
    setup("fr");
    expect(await screen.findByText("Vous n'avez rien partagé.")).toBeTruthy();
    expect(document.documentElement.lang).toBe("fr");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Partage avec un aidant");
  });
});

describe("accessibility (axe, structure rules; contrast is checked in the browser test)", () => {
  for (const lang of ["en", "fr"] as const) {
    it(`has no violations in ${lang}: empty, with a grant, and in the caregiver view`, async () => {
      const service = setup(lang);
      await waitFor(() => expect(document.querySelector("#grants-heading + p")).not.toBeNull());
      expect(await violations()).toEqual([]);

      await service.createGrant({ caregiver_label: "Sam", scope: { kind: "equipment_snapshot", fields: ["chair_width_mm", "attendant_travels"] } }, demoProfile());
      cleanup();
      render(<App service={service} profile={demoProfile()} demo initialLang={lang} />);
      await waitFor(() => expect(document.querySelector("ul.cards")).not.toBeNull());
      expect(await violations()).toEqual([]);

      cleanup();
      render(<App service={service} profile={demoProfile()} demo initialLang={lang} initialView="caregiver" />);
      await waitFor(() => expect(document.querySelector("dl")).not.toBeNull());
      expect(await violations()).toEqual([]);
    });
  }
});
