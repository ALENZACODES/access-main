// Connects a controller to a container element using event delegation.
// The structural types below let tests use a fake; a real HTMLElement is
// adapted with adaptElement().

import type { ExportFile } from "./localData";
import type { PrivacyController } from "./controller";

export interface ActionTarget {
  getAttribute(name: string): string | null;
}
export interface PanelEvent {
  target: { closest(selector: string): ActionTarget | null } | null;
}
export interface PanelRoot {
  innerHTML: string;
  addEventListener(type: "click" | "change", handler: (e: PanelEvent) => void): void;
  querySelector(selector: string): { focus(): void } | null;
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
      case "export": {
        const before = controller.getState().lastExport;
        const after = controller.dispatch({ type: "export" }).lastExport;
        render("[data-privacy-status]");
        if (after !== null && after !== before) options.onExport?.(after);
        break;
      }
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
      default:
        break;
    }
  });

  root.addEventListener("change", (e) => {
    const t = e.target?.closest("[data-locale-option]") ?? null;
    const v = t?.getAttribute("value");
    if (v !== "en" && v !== "fr") return;
    controller.dispatch({ type: "set-locale", locale: v });
    render(`[data-locale-option][value="${v}"]`);
  });

  render();
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
