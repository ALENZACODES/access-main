// The shell piece that makes the privacy panel a page: it watches the address,
// shows or hides the panel, sets the document title and language, moves focus to
// the page heading on arrival, and puts everything back when the person leaves.
// It takes the window and container as small structural types so it can be
// tested without a browser; a real window and element satisfy them.

import type { PrivacyController } from "./controller";
import type { ExportFile } from "./localData";
import { installPersistentGuard } from "./egressLog";
import type { EgressPolicy, GuardHost, InstalledGuard } from "./egress";
import type { StorageLike } from "./storage";
import { mountPrivacyPanel, type PanelRoot } from "./mount";
import { PAGE_TITLES, matchRoute, routeHref } from "./route";

export interface Focusable {
  focus(): void;
}

export interface ShellHost {
  document: {
    title: string;
    documentElement: { lang: string };
    readonly activeElement: Focusable | null;
  };
  location: { hash: string };
  addEventListener(type: "hashchange", handler: () => void): void;
  removeEventListener(type: "hashchange", handler: () => void): void;
}

export interface ShellContainer extends PanelRoot {
  hidden: boolean;
}

export interface RouteOptions {
  host: ShellHost;
  container: ShellContainer;
  /** Called each time the page is entered, so each visit starts from what is stored now. */
  createController: () => PrivacyController;
  onExport?: (file: ExportFile) => void;
  /**
   * Starts the network guard when the route is installed, so requests the App
   * makes from any page are checked, and stops it on dispose.
   */
  guard?: { host: GuardHost; policy: EgressPolicy; storage: StorageLike | null; prefix: string; now?: () => Date };
}

export interface InstalledRoute {
  /** Re-reads the address. Called for you on every hashchange. */
  sync(): void;
  /** Stops listening and leaves the page if it is showing. */
  dispose(): void;
}

const HEADING = "#privacy-panel-title";

export function installPrivacyRoute(o: RouteOptions): InstalledRoute {
  const { host, container } = o;
  let controller: PrivacyController | null = null;
  let render: (() => void) | null = null;
  let unsubscribe: (() => void) | null = null;
  let previous: { title: string; lang: string; focus: Focusable | null } | null = null;

  function enter(): void {
    previous = { title: host.document.title, lang: host.document.documentElement.lang, focus: host.document.activeElement };
    const c = o.createController();
    controller = c;
    render = mountPrivacyPanel(container, c, o.onExport === undefined ? {} : { onExport: o.onExport }).render;
    unsubscribe = c.subscribe((state) => {
      // The person switched language inside the panel: follow it in the address.
      if (matchRoute(host.location.hash) !== state.prefs.locale) {
        host.location.hash = routeHref(state.prefs.locale);
        sync();
      }
    });
  }

  function leave(): void {
    unsubscribe?.();
    unsubscribe = null;
    controller = null;
    render = null;
    container.innerHTML = "";
    container.hidden = true;
    if (previous !== null) {
      host.document.title = previous.title;
      host.document.documentElement.lang = previous.lang;
      previous.focus?.focus();
      previous = null;
    }
  }

  function sync(): void {
    const locale = matchRoute(host.location.hash);
    if (locale === null) {
      if (controller !== null) leave();
      return;
    }
    let moveFocus = false;
    if (controller === null) {
      enter();
      moveFocus = true;
    }
    if (controller !== null && controller.getState().prefs.locale !== locale) {
      controller.dispatch({ type: "set-locale", locale });
      render?.();
      moveFocus = true;
    }
    container.hidden = false;
    host.document.title = PAGE_TITLES[locale];
    host.document.documentElement.lang = locale;
    if (moveFocus) container.querySelector(HEADING)?.focus();
  }

  const guard: InstalledGuard | null =
    o.guard === undefined
      ? null
      : installPersistentGuard(o.guard.host, o.guard.policy, o.guard.storage, o.guard.prefix, o.guard.now);
  host.addEventListener("hashchange", sync);
  sync();

  return {
    sync,
    dispose: () => {
      host.removeEventListener("hashchange", sync);
      guard?.uninstall();
      if (controller !== null) leave();
    },
  };
}
