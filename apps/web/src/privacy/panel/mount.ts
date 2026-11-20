// Connects a controller to a container element using event delegation.
// The structural types below let tests use a fake; a real HTMLElement is
// adapted with adaptElement().

import type { ExportFile } from "./localData";
import type { PrivacyController } from "./controller";

export interface ActionTarget {
  getAttribute(name: string): string | null;
  /** Set on a file input */
  files?: ArrayLike<{ text(): Promise<string> }> | null;
}
export interface PanelEvent {
  target: { closest(selector: string): ActionTarget | null } | null;
}
export interface PanelRoot {
  innerHTML: string;
  addEventListener(type: "click" | "change", handler: (e: PanelEvent) => void): void;
  querySelector(selector: string): { focus(): void; value?: string } | null;
}

export interface MountOptions {
  /** Called once per successful export, e.g. with browserDownload. */
  onExport?: (file: ExportFile) => void;
}

export function mountPrivacyPanel(
  root: PanelRoot,
  controller: PrivacyController,
  options: MountOptions = {},
): { render(): void } {
  const render = (focus?: string): void => {
    root.innerHTML = controller.html();
    if (focus !== undefined) root.querySelector(focus)?.focus();
  };

  root.addEventListener("click", (e) => {
    const t = e.target?.closest("[data-action]") ?? null;
    if (t === null) return;
    switch (t.getAttribute("data-action")) {
      case "export":
      case "export-list-csv":
      case "export-list-text":
      case "export-kept-csv":
      case "export-kept-text":
      case "export-features-csv":
      case "export-features-text":
      case "export-addresses-csv":
      case "export-addresses-text":
      case "export-glance-csv":
      case "export-glance-text":
      case "export-support":
      case "export-printable": {
        const action = t.getAttribute("data-action");
        const before = controller.getState().lastExport;
        const type =
          action === "export-list-csv" || action === "export-list-text" || action === "export-kept-csv" || action === "export-kept-text" || action === "export-features-csv" || action === "export-features-text" || action === "export-addresses-csv" || action === "export-addresses-text" || action === "export-glance-csv" || action === "export-glance-text" || action === "export-support" || action === "export-printable"
            ? action
            : "export";
        const after = controller.dispatch({ type }).lastExport;
        render("[data-privacy-status]");
        if (after !== null && after !== before) options.onExport?.(after);
        break;
      }
      case "check-features":
        void controller.dispatchAsync({ type: "check-features" }).then(() => render("[data-privacy-status]"));
        break;
      case "scan-device":
        void controller.dispatchAsync({ type: "scan-device" }).then(() => render("[data-privacy-status]"));
        break;
      case "clear-device-ask":
        controller.dispatch({ type: "clear-device-ask" });
        render(controller.getState().confirmingClearDevice ? '[data-action="clear-device-cancel"]' : "[data-privacy-status]");
        break;
      case "clear-device-cancel":
        controller.dispatch({ type: "clear-device-cancel" });
        render('[data-action="clear-device-ask"]');
        break;
      case "clear-device-confirm":
        void controller.dispatchAsync({ type: "clear-device-confirm" }).then(() => render("[data-privacy-status]"));
        break;
      case "export-protected": {
        const passphrase = root.querySelector("[data-protected-pass]")?.value ?? "";
        const confirm = root.querySelector("[data-protected-confirm]")?.value ?? "";
        const before = controller.getState().lastExport;
        void controller.dispatchAsync({ type: "protected-export", passphrase, confirm }).then((s) => {
          render("[data-privacy-status]");
          if (s.lastExport !== null && s.lastExport !== before) options.onExport?.(s.lastExport);
        });
        break;
      }
      case "import-confirm":
        controller.dispatch({ type: "import-confirm" });
        render("[data-privacy-status]");
        break;
      case "import-cancel":
        controller.dispatch({ type: "import-cancel" });
        render("[data-import-file]");
        break;
      case "mark-seen":
        controller.dispatch({ type: "mark-seen" });
        render("[data-privacy-status]");
        break;
      case "erase":
        controller.dispatch({ type: "erase-ask" });
        render(controller.getState().confirmingErase ? '[data-action="erase-cancel"]' : "[data-privacy-status]");
        break;
      case "erase-cancel":
        controller.dispatch({ type: "erase-cancel" });
        render('[data-action="erase"]');
        break;
      case "erase-confirm":
        controller.dispatch({ type: "erase-confirm" });
        render("[data-privacy-status]");
        break;
      case "consent-grant":
      case "consent-decline": {
        const action = t.getAttribute("data-action");
        const purposeId = t.getAttribute("data-purpose");
        if (purposeId === null) break;
        controller.dispatch({
          type: "consent",
          purposeId,
          value: action === "consent-grant" ? "granted" : "declined",
        });
        render(`[data-action="${action}"][data-purpose="${purposeId}"]`);
        break;
      }
      default:
        break;
    }
  });

  root.addEventListener("change", (e) => {
    const sealed = e.target?.closest("[data-protected-file]") ?? null;
    if (sealed !== null) {
      const f = sealed.files?.[0];
      if (f === undefined) return;
      const passphrase = root.querySelector("[data-protected-pass]")?.value ?? "";
      void f.text().then(
        (text) => controller.dispatchAsync({ type: "protected-import", text, passphrase }),
        () => controller.dispatchAsync({ type: "protected-import", text: "", passphrase }),
      ).then(() => render(controller.getState().importPending ? '[data-action="import-confirm"]' : "[data-privacy-status]"));
      return;
    }
    const file = e.target?.closest("[data-import-file]") ?? null;
    if (file !== null) {
      const f = file.files?.[0];
      if (f === undefined) return;
      void f.text().then(
        (text) => {
          controller.dispatch({ type: "import-load", text });
          render(controller.getState().importPending ? '[data-action="import-confirm"]' : "[data-privacy-status]");
        },
        () => {
          controller.dispatch({ type: "import-load", text: "" });
          render("[data-privacy-status]");
        },
      );
      return;
    }
    const t = e.target?.closest("[data-locale-option]") ?? null;
    const v = t?.getAttribute("value");
    if (v !== "en" && v !== "fr") return;
    controller.dispatch({ type: "set-locale", locale: v });
    render(`[data-locale-option][value="${v}"]`);
  });

  const before = controller.getState().signals;
  render();
  void controller.dispatchAsync({ type: "read-signals" }).then((s) => {
    if (s.signals !== before) render();
  });
  return { render: () => render() };
}

/** Adapts a real element. Needs a browser DOM; not exercised by the unit tests. */
export function adaptElement(el: HTMLElement): PanelRoot {
  return {
    get innerHTML() {
      return el.innerHTML;
    },
    set innerHTML(v: string) {
      el.innerHTML = v;
    },
    addEventListener(type, handler) {
      el.addEventListener(type, (ev) =>
        handler({ target: ev.target instanceof Element ? ev.target : null }),
      );
    },
    querySelector(selector) {
      const n = el.querySelector(selector);
      return n instanceof HTMLElement ? n : null;
    },
  };
}

/** Saves a prepared export through the browser. Needs a browser DOM; not exercised by the unit tests. */
export function browserDownload(file: ExportFile): void {
  const url = URL.createObjectURL(new Blob([file.text], { type: file.mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
