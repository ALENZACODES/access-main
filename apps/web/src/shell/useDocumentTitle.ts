import { useEffect } from "react";

export function useDocumentTitle(title: string) {
  useEffect(() => {
    const previous = document.title;
    document.title = title === "the App" ? title : `${title} — the App`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
