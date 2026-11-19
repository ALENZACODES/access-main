import { useEffect, useRef, useState } from "react";

/**
 * Counts failed results in a row. Pass the latest result object (or any value
 * that changes identity with each new result) and whether it is a failure:
 * a new failed result adds one, a new good result resets to zero, and the same
 * result seen again changes nothing. A null result (still loading) changes nothing.
 */
export function useFailureStreak(result: unknown, failed: boolean): number {
  const [count, setCount] = useState(0);
  const last = useRef<unknown>(null);
  useEffect(() => {
    if (result === null || result === undefined || result === last.current) return;
    last.current = result;
    setCount((current) => (failed ? current + 1 : 0));
  }, [result, failed]);
  return count;
}
