import { lintCopy } from "./copyLint";
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

/** True when the text passes the copy lint and, in French, the French typography lint. */
export const copyLintOk = (s: string, l: Locale): boolean => lintCopy(s, l).length === 0 && (l !== "fr" || lintFrench(s).length === 0);
