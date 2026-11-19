/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useFailureStreak } from "./useFailureStreak";

afterEach(cleanup);
type Props = { result: unknown; failed: boolean };
const setup = (initial: Props) => renderHook((p: Props) => useFailureStreak(p.result, p.failed), { initialProps: initial });

describe("useFailureStreak", () => {
  it("starts at zero and ignores a result that has not arrived", () => {
    const { result, rerender } = setup({ result: null, failed: true });
    expect(result.current).toBe(0);
    rerender({ result: undefined, failed: true });
    expect(result.current).toBe(0);
  });
  it("adds one for each new failed result", () => {
    const { result, rerender } = setup({ result: { n: 1 }, failed: true });
    expect(result.current).toBe(1);
    rerender({ result: { n: 2 }, failed: true });
    expect(result.current).toBe(2);
    rerender({ result: { n: 3 }, failed: true });
    expect(result.current).toBe(3);
  });
  it("does not count the same result twice, even when the page renders again", () => {
    const failure = { n: 1 };
    const { result, rerender } = setup({ result: failure, failed: true });
    rerender({ result: failure, failed: true });
    rerender({ result: failure, failed: true });
    expect(result.current).toBe(1);
  });
  it("resets to zero when a good result arrives", () => {
    const { result, rerender } = setup({ result: { n: 1 }, failed: true });
    rerender({ result: { n: 2 }, failed: true });
    expect(result.current).toBe(2);
    rerender({ result: { n: 3 }, failed: false });
    expect(result.current).toBe(0);
    rerender({ result: { n: 4 }, failed: true });
    expect(result.current).toBe(1);
  });
  it("keeps counting across a loading gap", () => {
    const { result, rerender } = setup({ result: { n: 1 }, failed: true });
    rerender({ result: null, failed: false });
    expect(result.current).toBe(1);
    rerender({ result: { n: 2 }, failed: true });
    expect(result.current).toBe(2);
  });
  it("survives an unmount and mount without leaking state", () => {
    const first = setup({ result: { n: 1 }, failed: true });
    first.unmount();
    act(() => undefined);
    const second = setup({ result: { n: 1 }, failed: true });
    expect(second.result.current).toBe(1);
  });
});
