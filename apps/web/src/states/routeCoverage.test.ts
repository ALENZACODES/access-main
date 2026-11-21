import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { ERROR_STATES } from "../shell/errorStates";
import { BARE_ALERT_ALLOWLIST, ROUTE_COVERAGE, ROUTE_STATES, type Mechanism } from "./index";

const SRC = fileURLToPath(new URL("../", import.meta.url));
const read = (file: string) => readFileSync(join(SRC, file), "utf8");
const router = read("router.tsx");

/** The `path` of each route in router.tsx; the index route is "". */
function routerPaths(): string[] {
  const out: string[] = [];
  for (const line of router.split("\n")) {
    if (/\{\s*index:\s*true/.test(line)) out.push("");
    const m = /\{\s*path:\s*"([^"]*)"/.exec(line);
    if (m && m[1] !== "/") out.push(m[1]!);
  }
  return out;
}

function sourceFiles(dir = SRC): string[] {
  const files: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules" || name === "states" || name === "design") continue;
      files.push(...sourceFiles(full));
    } else if (/\.tsx$/.test(name) && !/\.test\.tsx$/.test(name)) {
      files.push(relative(SRC, full));
    }
  }
  return files.sort();
}

describe("route coverage table", () => {
  const paths = routerPaths();

  it("reads the routes from router.tsx", () => {
    expect(paths.length).toBeGreaterThanOrEqual(19);
    expect(new Set(paths).size).toBe(paths.length);
    expect(paths).toContain("");
    expect(paths).toContain("*");
  });
  it("lists every route, and nothing that is not a route", () => {
    expect([...paths].sort()).toEqual(Object.keys(ROUTE_COVERAGE).sort());
  });
  it("gives every route a reason", () => {
    for (const [path, c] of Object.entries(ROUTE_COVERAGE)) expect(c.why.trim().length, path).toBeGreaterThan(10);
  });
  it("points every file at a page that exists", () => {
    for (const [path, c] of Object.entries(ROUTE_COVERAGE)) {
      if (c.mechanism === "other-lane") expect(c.file, path).toBeNull();
      else {
        expect(c.file, path).not.toBeNull();
        expect(existsSync(join(SRC, c.file!)), `${path} -> ${c.file}`).toBe(true);
      }
    }
  });
  it("points every 'states' route at a real state set, and its page at the shared components", () => {
    for (const [path, c] of Object.entries(ROUTE_COVERAGE)) {
      if (c.mechanism !== "states") continue;
      expect(c.stateRoute, path).toBeDefined();
      expect(ROUTE_STATES[c.stateRoute!], path).toBeDefined();
      const text = read(c.file!);
      expect(text, `${path}: ${c.file} does not use the shared states`).toMatch(/from "(\.\.\/)+(states|\.\.\/states)\/index\.ts"|from "\.\.\/states\/index\.ts"/);
      expect(text, `${path}: ${c.file} has no StateNotice`).toContain("StateNotice");
    }
  });
  it("gives every state set a route, so no set is unused", () => {
    const used = new Set(Object.values(ROUTE_COVERAGE).flatMap((c) => (c.stateRoute ? [c.stateRoute] : [])));
    // "saved" and "page" are used by components that are not routes of their own.
    const exempt = new Set(["saved", "page"]);
    for (const id of Object.keys(ROUTE_STATES)) expect(used.has(id as never) || exempt.has(id), id).toBe(true);
  });
  it("points every 'shell' route at shell states that exist, and its page at their actions", () => {
    for (const [path, c] of Object.entries(ROUTE_COVERAGE)) {
      if (c.mechanism !== "shell") continue;
      expect(c.shellStates?.length, path).toBeGreaterThan(0);
      for (const id of c.shellStates!) expect(Object.keys(ERROR_STATES), `${path}: ${id}`).toContain(id);
      expect(read(c.file!), `${path}: ${c.file}`).toMatch(/ErrorActions|errorStates|profile\.dataStatusLink/);
    }
  });
  it("uses only known mechanisms", () => {
    const known: Mechanism[] = ["states", "shell", "static", "form", "other-lane"];
    for (const [path, c] of Object.entries(ROUTE_COVERAGE)) expect(known, path).toContain(c.mechanism);
  });
});

describe("a failed page load is never a bare alert", () => {
  it("wraps every lazy route in Section, which shows the shared page-load state", () => {
    const direct = new Set(["", "onboarding", "*"]);
    for (const line of router.split("\n")) {
      const m = /\{\s*path:\s*"([^"]*)",\s*element:\s*(.*?)\s*\},?\s*$/.exec(line);
      if (!m || m[1] === "/" || direct.has(m[1]!)) continue;
      expect(m[2], `route ${m[1]}`).toMatch(/^<Section>/);
    }
  });
  it("shows the shared page-load state with a retry", () => {
    const section = read("modules/Section.tsx");
    expect(section).toContain("StateNotice");
    expect(section).toContain('"page-load-failed"');
    expect(section).not.toMatch(/<p role="alert">/);
  });
});

describe("bare alerts", () => {
  const withAlert = sourceFiles().filter((f) => /role="alert"/.test(read(f)));
  it("are only in files that say why, so a new error cannot skip its next action", () => {
    const unlisted = withAlert.filter((f) => !(f in BARE_ALERT_ALLOWLIST));
    expect(unlisted, `these files render role="alert" outside StateNotice; use a shared state or add them to BARE_ALERT_ALLOWLIST with a reason`).toEqual([]);
  });
  it("are listed only while the file still has one, so the list does not go stale", () => {
    const stale = Object.keys(BARE_ALERT_ALLOWLIST).filter((f) => !withAlert.includes(f));
    expect(stale).toEqual([]);
  });
  it("each have a reason that names what the person can do", () => {
    for (const [file, why] of Object.entries(BARE_ALERT_ALLOWLIST)) {
      expect(existsSync(join(SRC, file)), file).toBe(true);
      expect(why.length, file).toBeGreaterThan(20);
    }
  });
  it("no longer includes the pages that now use the shared states", () => {
    for (const f of ["modules/Section.tsx", "pages/HelpPage.tsx", "pages/ModulePage.tsx", "pages/PlaceDetailPage.tsx"]) {
      expect(withAlert, f).not.toContain(f);
    }
  });
});
