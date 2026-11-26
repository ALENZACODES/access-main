/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShellCheckLauncher } from "./ShellCheckLauncher";

const openLabel = "Open offline startup file check";
const closeLabel = "Close offline startup file check";
const frOpen = "Ouvrir le contrôle des fichiers de démarrage hors ligne";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.head.querySelectorAll("[data-test-shell]").forEach((node) => node.remove());
});

function declareModule(path: string) {
  const script = document.createElement("script");
  script.dataset.testShell = "";
  script.type = "module";
  script.src = path;
  document.head.append(script);
  return script;
}

function setBrowserCache() {
  const scope = new URL(import.meta.env.BASE_URL, location.href).href;
  const worker = { state: "activated", scriptURL: new URL("sw.js", scope).href };
  const workers = {
    controller: worker,
    getRegistration: vi.fn(async () => ({ scope, active: worker, waiting: null, installing: null })),
  };
  const navigatorStub = Object.create(window.navigator) as Navigator;
  Object.defineProperty(navigatorStub, "serviceWorker", { value: workers });
  vi.stubGlobal("navigator", navigatorStub);

  const headers = (mime: string) => new Headers({ "Content-Type": mime });
  const cache = {
    has: vi.fn(async () => true),
    match: vi.fn(async (url: string) => ({
      status: 200,
      redirected: false,
      type: "basic",
      url,
      headers: headers(url.endsWith(".html") ? "text/html" : "text/javascript"),
    })),
  };
  vi.stubGlobal("caches", cache);
  return { scope, cache, workers };
}

describe("offline startup check launcher", () => {
  it("opens an identifiable disclosure without reading storage or the worker on render", async () => {
    const { cache, workers } = setBrowserCache();
    render(<ShellCheckLauncher language="en" />);
    const button = screen.getByRole("button", { name: openLabel });
    const content = document.getElementById(button.getAttribute("aria-controls")!);
    expect(content?.hidden).toBe(true);
    button.focus();
    fireEvent.click(button);
    const check = await screen.findByRole("button", { name: "Check startup files" });
    expect(content?.hidden).toBe(false);
    expect(content?.contains(check)).toBe(true);
    expect(document.activeElement).toBe(button);
    expect(cache.has).not.toHaveBeenCalled();
    expect(workers.getRegistration).not.toHaveBeenCalled();
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(content?.hidden).toBe(true);
    expect(content?.textContent).toBe("");
  });

  it("passes the real document declarations into the scoped cache query only after a check", async () => {
    const script = declareModule("/assets/entry-2fA7Qn.js");
    declareModule("/assets/ignored.js?token=omitted-query-marker");
    const { scope, cache } = setBrowserCache();
    render(<ShellCheckLauncher language="en" />);
    fireEvent.click(screen.getByRole("button", { name: openLabel }));
    fireEvent.click(await screen.findByRole("button", { name: "Check startup files" }));
    const list = await screen.findByRole("list", { name: "Startup scripts" });
    expect(within(list).getByRole("listitem").textContent).toBe("assets/entry-2fA7Qn.js — Saved");
    expect(cache.match.mock.calls.map(([url]) => url)).toEqual([
      new URL("index.html", scope).href,
      script.src,
    ]);
    expect(document.body.textContent).not.toContain("omitted-query-marker");
    expect(screen.getByRole("list", { name: "Page document" }).textContent).toContain("index.html — Saved");
  });

  it("starts with a fresh document inventory after closing the panel", async () => {
    const first = declareModule("/assets/first.js");
    setBrowserCache();
    render(<ShellCheckLauncher language="en" />);
    fireEvent.click(screen.getByRole("button", { name: openLabel }));
    fireEvent.click(await screen.findByRole("button", { name: "Check startup files" }));
    await screen.findByText("assets/first.js");
    fireEvent.click(screen.getByRole("button", { name: closeLabel }));
    first.remove();
    declareModule("/assets/second.js");
    fireEvent.click(screen.getByRole("button", { name: openLabel }));
    expect(screen.queryByText("assets/first.js")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Check startup files" }));
    await screen.findByText("assets/second.js");
    expect(screen.queryByText("assets/first.js")).toBeNull();
  });

  it("updates the launcher and the open panel together when the language changes", async () => {
    const { cache } = setBrowserCache();
    const view = render(<ShellCheckLauncher language="fr" />);
    fireEvent.click(screen.getByRole("button", { name: frOpen }));
    const check = await screen.findByRole("button", { name: "Examiner les fichiers de démarrage" });
    check.focus();
    view.rerender(<ShellCheckLauncher language="en" />);
    expect(screen.getByRole("button", { name: closeLabel }).getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: "Check startup files" })).toBe(check);
    expect(document.activeElement).toBe(check);
    expect(cache.match).not.toHaveBeenCalled();
  });
});
