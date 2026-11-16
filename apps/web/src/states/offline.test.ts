import { describe, expect, it, vi } from "vitest";
import {
  type ConnectivityState,
  type ConnectivityTarget,
  MIN_TOUCH_TARGET_PX,
  connectivityReducer,
  createConnectivityMonitor,
  initialConnectivity,
  offlineBanner,
} from "./index";

class FakeTarget implements ConnectivityTarget {
  listeners: Record<string, Set<() => void>> = { online: new Set(), offline: new Set() };
  addEventListener(type: "online" | "offline", l: () => void): void {
    this.listeners[type]!.add(l);
  }
  removeEventListener(type: "online" | "offline", l: () => void): void {
    this.listeners[type]!.delete(l);
  }
  fire(type: "online" | "offline"): void {
    for (const l of [...this.listeners[type]!]) l();
  }
}

describe("connectivityReducer", () => {
  it("switches status and keeps identity when nothing changes", () => {
    const s = initialConnectivity(true);
    expect(connectivityReducer(s, { type: "online" })).toBe(s);
    expect(connectivityReducer(s, { type: "offline" }).status).toBe("offline");
  });
  it("records a valid save date and ignores a bad one", () => {
    const s = initialConnectivity(true);
    expect(connectivityReducer(s, { type: "saved", on: "2026-11-15" }).lastSavedOn).toBe("2026-11-15");
    expect(connectivityReducer(s, { type: "saved", on: "tomorrow" })).toBe(s);
  });
});

describe("offlineBanner", () => {
  const offline: ConnectivityState = { status: "offline", lastSavedOn: "2026-11-10" };
  it("is null while online", () => {
    expect(offlineBanner(initialConnectivity(true), "en")).toBeNull();
  });
  it("states the save date, not currency", () => {
    const b = offlineBanner(offline, "en")!;
    expect(b.role).toBe("status");
    expect(b.description).toBe("Showing information saved on this device on 10 November 2026.");
  });
  it("handles nothing saved yet", () => {
    expect(offlineBanner({ status: "offline", lastSavedOn: null }, "en")!.description).toBe(
      "No information is saved on this device yet.",
    );
  });
  it("is available in French with a 44px retry action", () => {
    const b = offlineBanner(offline, "fr")!;
    expect(b.title).toBe("Vous êtes hors ligne");
    expect(b.description).toContain("10 novembre 2026");
    expect(b.actions[0]!.id).toBe("retry");
    expect(b.actions[0]!.minTargetPx).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX);
  });
});

describe("createConnectivityMonitor", () => {
  it("reports initial state, then changes, then stops after unsubscribe", () => {
    const target = new FakeTarget();
    const seen: string[] = [];
    let online = true;
    const stop = createConnectivityMonitor(target, () => online, (s) => seen.push(s.status));
    expect(seen).toEqual(["online"]);
    online = false;
    target.fire("offline");
    target.fire("offline");
    target.fire("online");
    expect(seen).toEqual(["online", "offline", "online"]);
    stop();
    target.fire("offline");
    expect(seen).toHaveLength(3);
    expect(target.listeners.online!.size + target.listeners.offline!.size).toBe(0);
  });
  it("starts offline and carries the last saved date", () => {
    const cb = vi.fn();
    createConnectivityMonitor(new FakeTarget(), () => false, cb, "2026-11-01");
    expect(cb).toHaveBeenCalledWith({ status: "offline", lastSavedOn: "2026-11-01" });
  });
});
