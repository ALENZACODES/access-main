import { discoverShellFiles } from "./assets";
import { browserShellEnvironment, inspectShell, type ShellReport } from "./probe";

/** Capture the current document only when the person requests a check. */
export async function readShellReport(signal: AbortSignal): Promise<ShellReport> {
  signal.throwIfAborted();
  const inventory = discoverShellFiles(document, import.meta.env.BASE_URL);
  return inspectShell(inventory, browserShellEnvironment(), signal);
}
