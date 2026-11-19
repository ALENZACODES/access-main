import { useLayoutEffect, useRef, type ReactNode } from "react";
import { annotateEnglishHousingPassages } from "./HousingLanguageAnnotations";

/**
 * Keep untranslated, English-only sentences correctly tagged even when the
 * linked housing tool replaces its results after a filter or locale change.
 * Mutation callbacks run before the browser's next paint; no hidden UI,
 * focus change, polling timer, or synthetic accessibility claim is required.
 */
export function HousingLanguageBoundary({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const annotate = (): void => {
      annotateEnglishHousingPassages(root);
    };
    annotate();
    const observer = new MutationObserver(annotate);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return <div ref={host}>{children}</div>;
}
