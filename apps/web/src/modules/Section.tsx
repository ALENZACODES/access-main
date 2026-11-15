import { Component, Suspense, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useLaneStrings } from "./strings.ts";

/** Shared Suspense fallback for every lazy route. A status message, so a screen reader announces it. */
export function SectionLoading() {
  const { t } = useLaneStrings();
  return <p role="status">{t("lanes.loading")}</p>;
}

function SectionFailed() {
  const { t } = useLaneStrings();
  return <p role="alert">{t("lanes.loadFailed")}</p>;
}

/**
 * Shown when another lane's entry file is not in this build. It carries
 * data-section-status="pending", and it is not a finished section: the release
 * test counts it as missing.
 */
export function PendingSection({ section }: { section: string }) {
  const { t } = useLaneStrings();
  useDocumentTitle(t("lanes.pendingTitle"));
  return (
    <div className="stack" data-section-status="pending" data-section={section}>
      <h1>{t("lanes.pendingTitle")}</h1>
      <p role="status">{t("lanes.pendingBody")}</p>
    </div>
  );
}

class SectionBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? <SectionFailed /> : this.props.children;
  }
}

/** Wraps a lazy route: a loading status while it loads, an alert if it fails. Resets on navigation. */
export function Section({ children }: { children: ReactNode }) {
  const { pathname } = useLocation();
  return (
    <SectionBoundary key={pathname}>
      <Suspense fallback={<SectionLoading />}>{children}</Suspense>
    </SectionBoundary>
  );
}
