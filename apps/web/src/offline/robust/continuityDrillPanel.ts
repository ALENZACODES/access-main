import { createOfflineAction } from "./accessibilityGuard";
import type { DashboardModel } from "./offlineDashboard";
import type { Language, RegionManifest, StorageEstimate } from "./regionDownload";
import { DEFAULT_DRILL_SETTINGS, pageContinuityDrill, runContinuityDrill, type DrillScenario, type DrillResult } from "./continuityDrill";
import { continuityCopy } from "./continuityDrillCopy";
import { saveContinuityReport } from "./continuityDrillExport";
function el<K extends keyof HTMLElementTagNameMap>(doc: Document, tag: K, value?: string): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  if (value !== undefined) node.textContent = value;
  return node;
}
function button(doc: Document, value: string): HTMLButtonElement {
  return createOfflineAction(doc, value);
}
function labelledInput(doc: Document, id: string, label: string): { wrapper: HTMLLabelElement; input: HTMLInputElement } {
  const wrapper = el(doc, "label", label);
  wrapper.htmlFor = id;
  const input = el(doc, "input");
  input.type = "number";
  input.id = id;
  input.min = "0";
  input.step = "1";
  input.style.minHeight = "44px";
  wrapper.append(input);
  return { wrapper, input };
}
export function mountOfflineContinuityDrill(root: HTMLElement, manifest: RegionManifest, model: DashboardModel,
  language: Language, estimateStorage: () => Promise<StorageEstimate>): () => void {
  const doc = root.ownerDocument;
  const copy = continuityCopy(language);
  const host = el(doc, "section");
  const heading = el(doc, "h3", copy.title);
  const intro = el(doc, "p", copy.intro);
  const id = manifest.regionId.replace(/[^a-zA-Z0-9_-]/g, "-");
  const wrapper = el(doc, "label", copy.scenario);
  const select = el(doc, "select");
  select.id = `continuity-scenario-${id}`;
  select.style.minHeight = "44px";
  wrapper.htmlFor = select.id;
  for (const value of ["baseline", "evict-largest", "evict-oldest", "source-change", "quota-reduction"] as const) {
    const option = el(doc, "option", value);
    option.value = value;
    select.append(option);
  }
  wrapper.append(select);
  const count = labelledInput(doc, `continuity-count-${id}`, copy.count);
  const reduction = labelledInput(doc, `continuity-reduction-${id}`, copy.reduction);
  const reserve = labelledInput(doc, `continuity-reserve-${id}`, copy.reserve);
  count.input.value = "1";
  reduction.input.value = "0";
  reserve.input.value = "0";
  const run = button(doc, copy.run);
  const save = button(doc, copy.export);
  save.disabled = true;
  const message = el(doc, "p", copy.initial);
  message.setAttribute("role", "status");
  message.setAttribute("aria-live", "polite");
  const results = el(doc, "ol");
  host.append(heading, intro, wrapper, count.wrapper, reduction.wrapper, reserve.wrapper, run, save, message, results);
  root.append(host);
  let disposed = false;
  let sequence = 0;
  let result: DrillResult | null = null;
  const onRun = async (): Promise<void> => {
    const token = ++sequence;
    run.disabled = true;
    try {
      const estimate = await estimateStorage().catch(() => ({}));
      if (disposed || token !== sequence) return;
      const input = { ...DEFAULT_DRILL_SETTINGS, scenario: select.value as DrillScenario,
        affectedCount: Number(count.input.value), reductionBytes: Number(reduction.input.value),
        preserveReserveBytes: Number(reserve.input.value) };
      result = runContinuityDrill(manifest, model.getState().inventory, input, estimate);
      message.textContent = `${copy.result}: ${result.status}. ${result.beforeSaved} / ${result.afterSaved}`;
      results.replaceChildren();
      for (const cell of pageContinuityDrill(result, { filter: "all", sort: "listed", search: "", offset: 0, limit: 20 }).rows) {
        const item = el(doc, "li", `${cell.id}: ${cell.before} → ${cell.after} (${cell.reason})`);
        results.append(item);
      }
      if (result.cells.length === 0) results.append(el(doc, "li", copy.noRows));
      save.disabled = false;
    } catch { message.textContent = copy.unknown; save.disabled = true; result = null; }
    finally { if (!disposed && token === sequence) run.disabled = false; }
  };
  const onClick = (): void => { void onRun(); };
  const onSave = (): void => { if (result !== null) saveContinuityReport(result, language, doc); };
  run.addEventListener("click", onClick);
  save.addEventListener("click", onSave);
  return () => { disposed = true; sequence++; run.removeEventListener("click", onClick);
    save.removeEventListener("click", onSave); host.remove(); };
}
