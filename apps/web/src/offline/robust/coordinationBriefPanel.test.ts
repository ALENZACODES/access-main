// @vitest-environment jsdom
import { within } from "@testing-library/react";
import { expect, it } from "vitest";
import { COORDINATION_COPY, COORDINATION_STATUSES } from "./coordinationBriefCopy";
import { mountOfflineCoordinationBrief } from "./coordinationBriefPanel";

it.each(["en", "fr"] as const)("keeps actions in sync with the selected checkpoint (%s)", (language) => {
  const root = document.createElement("div");
  document.body.append(root);
  const unmount = mountOfflineCoordinationBrief(root, null, language);
  const ui = within(root);
  const c = COORDINATION_COPY[language];
  const button = (name: string) => ui.getByRole<HTMLButtonElement>("button", { name });
  const edit = (name: string) => button(c.edit + (language === "fr" ? "\u00a0: " : ": ") + name);
  const add = (name: string) => {
    ui.getByLabelText<HTMLInputElement>(c.name).value = name;
    ui.getByLabelText<HTMLTextAreaElement>(c.question).value = name;
    button(c.addStep).click();
  };

  try {
    add("A");
    add("B");
    expect(button(c.remove).disabled).toBe(true);

    const editA = edit("A");
    editA.focus();
    editA.click();
    expect(document.activeElement).toBe(editA);
    expect(button(c.status).disabled).toBe(false);
    expect(button(c.addNote).disabled).toBe(false);
    expect(button(c.remove).disabled).toBe(false);
    expect(button(c.moveUp).disabled).toBe(true);
    expect(button(c.moveDown).disabled).toBe(false);

    ui.getByLabelText<HTMLSelectElement>(c.changes).value = "asked";
    button(c.status).click();
    expect(edit("A").closest("li")?.textContent).toContain(COORDINATION_STATUSES[language].asked);
    ui.getByLabelText<HTMLTextAreaElement>(c.appendNote).value = "12:15";
    button(c.addNote).click();

    edit("B").click();
    expect(button(c.moveUp).disabled).toBe(false);
    expect(button(c.moveDown).disabled).toBe(true);
    button(c.moveUp).click();
    expect([...root.querySelectorAll("ol button")]).toEqual([edit("B"), edit("A")]);
    expect(button(c.moveUp).disabled).toBe(true);
    expect(button(c.moveDown).disabled).toBe(false);
    button(c.remove).click();
    expect([...root.querySelectorAll("ol button")]).toEqual([edit("A")]);

    edit("A").click();
    expect(ui.getByLabelText<HTMLTextAreaElement>(c.note).value).toBe("12:15");
    expect(button(c.moveUp).disabled).toBe(true);
    expect(button(c.moveDown).disabled).toBe(true);
    button(c.cancel).click();
    for (const action of [c.status, c.addNote, c.remove, c.moveUp, c.moveDown]) {
      expect(button(action).disabled).toBe(true);
    }
  } finally {
    unmount();
    root.remove();
  }
});
