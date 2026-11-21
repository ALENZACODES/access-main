import { useLayoutEffect, useRef, type ReactNode } from "react";
import { annotateHousingEnglish } from "./HousingLanguageAnnotations";

/**
 * The embedded housing package has English-only depth and privacy sentences.
 * Annotate those specific passages before paint and after results re-render.
 * Do not hide controls, replace copy, or rewrite the document language.
 */
export function HousingLanguageBoundary({ children }: { children: ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = host.current;
    if (!root) return;
    const update = (): void => { annotateHousingEnglish(root); };
    update();
    const observer = new MutationObserver(update);
    observer.observe(root, { childList: true, characterData: true, subtree: true });
    return () => observer.disconnect();
  }, []);
  return <div ref={host}>{children}</div>;
}
