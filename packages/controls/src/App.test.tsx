// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { App } from "./App.tsx";
import { CATALOGS } from "./i18n/catalog.ts";
import { CONTROL_MODES, type ControlMode } from "./types.ts";

afterEach(cleanup);

const widget = () => screen.getByTestId("widget");
const select = (mode: ControlMode) => fireEvent.click(screen.getByTestId(`mode-${mode}`));
const announcement = () => screen.getByTestId("announcement").textContent;

describe("shell", () => {
  it("offers a native radio per mode, so the switcher is keyboard operable", () => {
    render(<App />);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(4);
    expect(radios.every((r) => r.tagName === "INPUT" && !r.hasAttribute("tabindex"))).toBe(true);
    expect(screen.getByRole("group", { name: CATALOGS.en["mode.legend"] })).toBeTruthy();
  });

  it("keyboard mode: arrows, Enter, C and Escape drive the widget; Tab is left alone", () => {
    render(<App />);
    const list = screen.getByTestId("chooser");
    list.focus();
    fireEvent.keyDown(list, { key: "ArrowDown" });
    fireEvent.keyDown(list, { key: "Enter" });
    expect(widget().dataset.chosen).toBe("b");
    fireEvent.keyDown(list, { key: "c" });
    expect(widget().dataset.confirmed).toBe("true");
    expect(announcement()).toBe("Option B confirmed.");
    fireEvent.keyDown(list, { key: "Escape" });
    expect(widget().dataset.chosen).toBe("");
    expect(fireEvent.keyDown(list, { key: "Tab" })).toBe(true);
  });

  it("keyboard mode ignores keys typed in other controls", () => {
    render(<App />);
    expect(fireEvent.keyDown(screen.getByTestId("mode-keyboard"), { key: "ArrowDown" })).toBe(true);
    expect(widget().dataset.focus).toBe("0");
  });

  it("switch mode: step and select reach every action", () => {
    render(<App initialMode="switch" />);
    const step = screen.getByTestId("switch-step");
    const pick = screen.getByTestId("switch-select");
    fireEvent.click(pick); // next
    fireEvent.click(step);
    fireEvent.click(step);
    fireEvent.click(pick); // choose
    expect(widget().dataset.chosen).toBe("b");
    fireEvent.click(step);
    fireEvent.click(pick); // confirm
    expect(widget().dataset.confirmed).toBe("true");
  });

  it("switch mode: hardware keys 1 and 2", () => {
    render(<App initialMode="switch" />);
    const root = screen.getByTestId("switch-step");
    fireEvent.keyDown(root, { key: "2" });
    expect(widget().dataset.focus).toBe("1");
  });

  it("voice mode: runs commands, announces what it heard, and refuses unknown ones", () => {
    render(<App initialMode="voice" />);
    const input = screen.getByTestId("voice-input");
    const send = (text: string) => {
      fireEvent.change(input, { target: { value: text } });
      fireEvent.click(screen.getByTestId("voice-send"));
    };
    send("next");
    send("choose");
    expect(widget().dataset.chosen).toBe("b");
    expect(announcement()).toContain("Heard “choose”.");
    send("dance");
    expect(announcement()).toContain("Command not recognised: “dance”. Nothing was changed.");
    expect(widget().dataset.chosen).toBe("b");
    send("confirm");
    expect(widget().dataset.confirmed).toBe("true");
    send("help");
    expect(announcement()).toMatch(/^Commands:/);
    send("");
    expect(announcement()).toBe("No command entered.");
  });

  it("gaze mode: a simulated dwell is labelled as simulated; pressing a target counts as a finished dwell", () => {
    render(<App initialMode="gaze" />);
    expect(screen.getByText(/Simulated gaze/)).toBeTruthy();
    fireEvent.click(screen.getByTestId("gaze-next"));
    fireEvent.click(screen.getByTestId("gaze-choose"));
    fireEvent.click(screen.getByTestId("gaze-confirm"));
    expect(widget().dataset.chosen).toBe("b");
    expect(widget().dataset.confirmed).toBe("true");
  });

  it("gaze dwell time defaults to 800 milliseconds and can be adjusted, turned off, or raised to 8000 milliseconds", () => {
    render(<App initialMode="gaze" />);
    const control = screen.getByLabelText("Dwell time");
    expect((control as HTMLInputElement).value).toBe("800");
    expect((control as HTMLInputElement).max).toBe("8000");
    expect(screen.getByTestId("gaze-dwell-value").textContent).toBe("800 milliseconds");
    fireEvent.change(control, { target: { value: "1200" } });
    expect((control as HTMLInputElement).value).toBe("1200");
    expect(screen.getByTestId("gaze-dwell-value").textContent).toBe("1200 milliseconds");
    fireEvent.change(control, { target: { value: "8000" } });
    expect((control as HTMLInputElement).value).toBe("8000");
    expect(screen.getByTestId("gaze-dwell-value").textContent).toBe("8000 milliseconds");
    fireEvent.click(screen.getByTestId("gaze-dwell-off"));
    expect((control as HTMLInputElement).value).toBe("0");
    expect(screen.getByTestId("gaze-dwell-value").textContent).toBe("Off");
    expect(screen.getByText(/Dwell selection is off/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(screen.getByLabelText("Durée de fixation")).toBeTruthy();
    expect(screen.getByTestId("gaze-dwell-value").textContent).toBe("Désactivé");
  });

  it("the widget works in every mode without using the mode's own input", () => {
    for (const mode of CONTROL_MODES) {
      render(<App initialMode={mode} />);
      fireEvent.click(screen.getByRole("option", { name: "Option C" }));
      fireEvent.click(within(widget()).getByRole("button", { name: "Confirm" }));
      expect(widget().dataset.confirmed, mode).toBe("true");
      cleanup();
    }
  });

  it("French: sets the document language and uses the French catalogue", () => {
    render(<App initialLang="fr" initialMode="voice" />);
    expect(document.documentElement.lang).toBe("fr");
    fireEvent.change(screen.getByTestId("voice-input"), { target: { value: "danser" } });
    fireEvent.click(screen.getByTestId("voice-send"));
    expect(announcement()).toBe("Commande non reconnue : « danser ». Rien n'a été modifié. Dites « aide » pour entendre les commandes.");
  });

  it("switching language clears an announcement written in the other language", () => {
    render(<App />);
    fireEvent.keyDown(screen.getByTestId("chooser"), { key: "ArrowDown" });
    expect(announcement()).toMatch(/^Now on/);
    fireEvent.click(screen.getByRole("button", { name: "Français" }));
    expect(announcement()).toBe(CATALOGS.fr["announce.none"]);
  });
});

describe("axe in jsdom (colour contrast is checked in the browser tests)", () => {
  for (const lang of ["en", "fr"] as const) {
    for (const mode of CONTROL_MODES) {
      it(`${lang} ${mode}: no violations`, async () => {
        const { container } = render(<App initialLang={lang} initialMode={mode} />);
        select(mode);
        const results = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
        expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      });
    }
  }
});

describe("direct clicks", () => {
  it("are announced in the shared status region", () => {
    render(<App />);
    fireEvent.click(screen.getByRole("option", { name: "Option C" }));
    expect(announcement()).toBe("Option C chosen.");
    fireEvent.click(within(widget()).getByRole("button", { name: "Clear" }));
    expect(announcement()).toBe("Choice cleared.");
  });
});
