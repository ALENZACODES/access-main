/** Camera helpers that honour prefers-reduced-motion with real jumps, not 0ms eases. */

export const CAMERA_ANIMATION_MS = 200;

export type ReducedMotionQuery = { matchMedia: (query: string) => { matches: boolean } };

export function prefersReducedMotion(media: ReducedMotionQuery = window): boolean {
  return media.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export type PanMap = {
  jumpTo: (options: { center: [number, number] }) => void;
  easeTo: (options: { center: [number, number]; duration: number }) => void;
};

export type ZoomMap = {
  jumpTo: (options: { zoom: number }) => void;
  getZoom: () => number;
  zoomIn: (options: { duration: number }) => void;
  zoomOut: (options: { duration: number }) => void;
};

export type MotionMap = {
  stop: () => void;
  dragPan: {
    isEnabled: () => boolean;
    enable: (options?: {
      linearity?: number;
      easing?: (t: number) => number;
      deceleration?: number;
      maxSpeed?: number;
    }) => void;
  };
  on: (type: string, listener: () => void) => void;
};

/** Pan instantly with jumpTo when reduced motion is set; otherwise ease. */
export function panMapTo(map: PanMap, center: [number, number], reduced = prefersReducedMotion()): void {
  if (reduced) map.jumpTo({ center });
  else map.easeTo({ center, duration: CAMERA_ANIMATION_MS });
}

/** Zoom instantly with jumpTo when reduced motion is set; otherwise animate. */
export function zoomMapBy(map: ZoomMap, delta: number, reduced = prefersReducedMotion()): void {
  if (reduced) {
    map.jumpTo({ zoom: map.getZoom() + delta });
    return;
  }
  if (delta > 0) map.zoomIn({ duration: CAMERA_ANIMATION_MS });
  else map.zoomOut({ duration: CAMERA_ANIMATION_MS });
}

/**
 * Stop leftover camera animation and disable drag-pan inertia so pointer pan
 * and wheel zoom do not keep animating under reduced motion.
 */
export function silenceMapMotion(map: MotionMap, reduced = prefersReducedMotion()): void {
  if (!reduced) return;
  map.stop();
  if (map.dragPan.isEnabled()) {
    map.dragPan.enable({
      linearity: 1,
      easing: () => 1,
      deceleration: Number.POSITIVE_INFINITY,
      maxSpeed: 0,
    });
  }
  map.on("wheel", () => map.stop());
}
