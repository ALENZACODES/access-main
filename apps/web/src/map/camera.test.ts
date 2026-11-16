import { describe, expect, it, vi } from "vitest";
import { CAMERA_ANIMATION_MS, panMapTo, prefersReducedMotion, silenceMapMotion, zoomMapBy } from "./camera.ts";

function media(reduced: boolean) {
  return { matchMedia: (query: string) => ({ matches: reduced && query.includes("prefers-reduced-motion: reduce") }) };
}

describe("prefersReducedMotion", () => {
  it("reads the reduced-motion media query", () => {
    expect(prefersReducedMotion(media(true))).toBe(true);
    expect(prefersReducedMotion(media(false))).toBe(false);
  });
});

describe("panMapTo", () => {
  it("uses jumpTo and never easeTo when reduced motion is set", () => {
    const map = { jumpTo: vi.fn(), easeTo: vi.fn() };
    panMapTo(map, [-79.38, 43.65], true);
    expect(map.jumpTo).toHaveBeenCalledTimes(1);
    expect(map.jumpTo).toHaveBeenCalledWith({ center: [-79.38, 43.65] });
    expect(map.easeTo).not.toHaveBeenCalled();
  });

  it("eases with a non-zero duration when motion is allowed", () => {
    const map = { jumpTo: vi.fn(), easeTo: vi.fn() };
    panMapTo(map, [-79.38, 43.65], false);
    expect(map.easeTo).toHaveBeenCalledWith({ center: [-79.38, 43.65], duration: CAMERA_ANIMATION_MS });
    expect(CAMERA_ANIMATION_MS).toBeGreaterThan(0);
    expect(map.jumpTo).not.toHaveBeenCalled();
  });
});

describe("zoomMapBy", () => {
  it("uses jumpTo at the current zoom plus delta when reduced motion is set", () => {
    const map = { jumpTo: vi.fn(), getZoom: vi.fn(() => 11), zoomIn: vi.fn(), zoomOut: vi.fn() };
    zoomMapBy(map, 1, true);
    zoomMapBy(map, -1, true);
    expect(map.jumpTo).toHaveBeenCalledWith({ zoom: 12 });
    expect(map.jumpTo).toHaveBeenCalledWith({ zoom: 10 });
    expect(map.zoomIn).not.toHaveBeenCalled();
    expect(map.zoomOut).not.toHaveBeenCalled();
  });

  it("animates zoomIn and zoomOut when motion is allowed", () => {
    const map = { jumpTo: vi.fn(), getZoom: vi.fn(() => 11), zoomIn: vi.fn(), zoomOut: vi.fn() };
    zoomMapBy(map, 1, false);
    zoomMapBy(map, -1, false);
    expect(map.zoomIn).toHaveBeenCalledWith({ duration: CAMERA_ANIMATION_MS });
    expect(map.zoomOut).toHaveBeenCalledWith({ duration: CAMERA_ANIMATION_MS });
    expect(map.jumpTo).not.toHaveBeenCalled();
  });
});

describe("silenceMapMotion", () => {
  it("does nothing when motion is allowed", () => {
    const map = { stop: vi.fn(), dragPan: { isEnabled: vi.fn(() => true), enable: vi.fn() }, on: vi.fn() };
    silenceMapMotion(map, false);
    expect(map.stop).not.toHaveBeenCalled();
    expect(map.dragPan.enable).not.toHaveBeenCalled();
    expect(map.on).not.toHaveBeenCalled();
  });

  it("stops animation, disables drag inertia, and stops wheel zoom animation", () => {
    const map = { stop: vi.fn(), dragPan: { isEnabled: vi.fn(() => true), enable: vi.fn() }, on: vi.fn() };
    silenceMapMotion(map, true);
    expect(map.stop).toHaveBeenCalledTimes(1);
    expect(map.dragPan.enable).toHaveBeenCalledWith({
      linearity: 1,
      easing: expect.any(Function),
      deceleration: Number.POSITIVE_INFINITY,
      maxSpeed: 0,
    });
    const easing = map.dragPan.enable.mock.calls[0][0].easing as (t: number) => number;
    expect(easing(0)).toBe(1);
    expect(easing(0.5)).toBe(1);
    expect(map.on).toHaveBeenCalledWith("wheel", expect.any(Function));
    const onWheel = map.on.mock.calls[0][1] as () => void;
    onWheel();
    expect(map.stop).toHaveBeenCalledTimes(2);
  });
});
