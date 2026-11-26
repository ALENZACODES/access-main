/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ShellReport } from "./probe";
import ShellCheckPanel from "./ShellCheckPanel";

type Read = (signal: AbortSignal) => Promise<ShellReport>;
const mixed: ShellReport = {
  worker: "controlled",
  limited: false,
  files: [
    { kind: "style", path: "assets/main.css", state: "missing" },
    { kind: "preload", path: "assets/helpers.js", state: "unknown" },
    { kind: "document", path: "index.html", state: "present" },
    { kind: "script", path: "assets/main.js", state: "present" },
    { kind: "style", path: "assets/theme.css", state: "present" },
  ],
};
const single: ShellReport = {
  worker: "controlled",
  limited: false,
  files: [{ kind: "document", path: "index.html", state: "present" }],
};

function deferred() {
  let resolve!: (report: ShellReport) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<ShellReport>((success, failure) => {
    resolve = success;
    reject = failure;
  });
  return { promise, resolve, reject };
}

function status() {
  return screen.getByRole("status").textContent;
}

function checkButton(name = "Check startup files") {
  return screen.getByRole("button", { name });
}

function start() {
  fireEvent.click(checkButton());
}

async function show(report: ShellReport = mixed) {
  const read = vi.fn<Read>().mockResolvedValue(report);
  render(<ShellCheckPanel language="en" read={read} />);
  start();
  await screen.findByRole("heading", { name: "File check results" });
  return read;
}

function fileRows(name: string) {
  const group = screen.getByRole("list", { name });
  return within(group).getAllByRole("listitem").map((row) => row.textContent);
}

function choose(filter: string) {
  fireEvent.change(screen.getByRole("combobox", { name: "Show files" }), {
    target: { value: filter },
  });
}

afterEach(cleanup);

describe("reading startup files on demand", () => {
  it("waits for an explicit check and leaves the action focused through completion", async () => {
    const pending = deferred();
    const read = vi.fn<Read>().mockReturnValue(pending.promise);
    render(<ShellCheckPanel language="en" read={read} />);

    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Check the app’s startup files");
    expect(status()).toBe("");
    expect(screen.queryByRole("list")).toBeNull();
    expect(read).not.toHaveBeenCalled();

    const action = checkButton();
    action.focus();
    fireEvent.click(action);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]?.[0].aborted).toBe(false);
    expect(status()).toBe("Checking the browser’s saved copies…");
    expect(checkButton("Cancel file check")).toBe(action);

    await act(async () => pending.resolve(single));
    expect(status()).toBe("File check finished. 1 file listed.");
    expect(checkButton("Check startup files again")).toBe(action);
    expect(document.activeElement).toBe(action);
    expect(fileRows("Page document")).toEqual(["index.html — Saved"]);
  });

  it("shows a loading state and does not borrow an earlier list from a closed panel", async () => {
    const read = vi.fn<Read>().mockResolvedValue(mixed);
    const first = render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("assets/main.js");
    first.unmount();
    render(<ShellCheckPanel language="en" read={read} />);
    expect(status()).toBe("");
    expect(screen.queryByText("assets/main.js")).toBeNull();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps the last completed list identifiable while reading a replacement", async () => {
    const next = deferred();
    const read = vi.fn<Read>().mockResolvedValueOnce(mixed).mockReturnValueOnce(next.promise);
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("assets/main.css");

    fireEvent.click(checkButton("Check startup files again"));
    expect(screen.getByRole("heading", { name: "Last completed file check" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "File check results" })).toBeNull();
    expect(status()).toBe("Checking the browser’s saved copies…");
    expect(fileRows("Style sheets")).toHaveLength(2);

    await act(async () => next.resolve(single));
    expect(screen.queryByText("assets/main.css")).toBeNull();
    expect(screen.getByRole("heading", { name: "File check results" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Last completed file check" })).toBeNull();
  });

  it("compares completed checks only and keeps the same comparison available after a failed refresh", async () => {
    const second = deferred();
    const read = vi.fn<Read>()
      .mockResolvedValueOnce(single)
      .mockReturnValueOnce(second.promise)
      .mockRejectedValueOnce(new Error("storage unavailable"));
    const panel = render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("index.html");
    const comparison = () => screen.queryByText("Compare the two latest checks", { selector: "summary" });
    expect(comparison()).toBeNull();

    fireEvent.click(checkButton("Check startup files again"));
    expect(comparison()).toBeNull();
    await act(async () => second.resolve(mixed));
    const completed = comparison();
    expect(completed).toBeTruthy();
    fireEvent.click(checkButton("Check startup files again"));
    await screen.findByRole("button", { name: "Try the file check again" });
    expect(comparison()).toBe(completed);
    expect(fileRows("Module preload hints")).toEqual(["assets/helpers.js — UNKNOWN"]);

    panel.unmount();
    render(<ShellCheckPanel language="en" read={read} />);
    expect(comparison()).toBeNull();
    expect(screen.queryByText("assets/helpers.js")).toBeNull();
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("handles a read that throws before returning a promise and allows another attempt", async () => {
    const read = vi.fn<Read>()
      .mockImplementationOnce(() => { throw new Error("private-cache-key"); })
      .mockResolvedValueOnce(single);
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    expect(status()).toBe("The file check could not finish. You can try again.");
    expect(screen.queryByText(/private-cache-key/)).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    fireEvent.click(checkButton("Try the file check again"));
    await screen.findByText("index.html");
    expect(read).toHaveBeenCalledTimes(2);
  });

  it("advances the open comparison to the most recent pair after a third successful check", async () => {
    const read = vi.fn<Read>().mockResolvedValueOnce(mixed).mockResolvedValueOnce(single).mockResolvedValueOnce(single);
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("assets/main.css");
    fireEvent.click(checkButton("Check startup files again"));
    const summary = await screen.findByText("Compare the two latest checks", { selector: "summary" });
    fireEvent.click(summary);
    const differences = await screen.findByRole("list", { name: "Differences between the file lists" });
    expect(within(differences).getByText("assets/main.css")).toBeTruthy();
    fireEvent.click(checkButton("Check startup files again"));
    await screen.findByText("Both lists contain the same paths, file types and cache results.");
    expect(screen.queryByRole("list", { name: "Differences between the file lists" })).toBeNull();
    expect(summary.closest("details")?.open).toBe(true);
    expect(read).toHaveBeenCalledTimes(3);
  });

  it("does not label an earlier list as current when the new check rejects", async () => {
    const read = vi.fn<Read>().mockResolvedValueOnce(mixed).mockRejectedValueOnce(new Error("denied"));
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("assets/main.css");
    fireEvent.click(checkButton("Check startup files again"));
    await screen.findByRole("button", { name: "Try the file check again" });
    expect(screen.getByRole("heading", { name: "Last completed file check" })).toBeTruthy();
    expect(fileRows("Page document")).toEqual(["index.html — Saved"]);
    expect(screen.queryByText("denied")).toBeNull();
  });
});

describe("grouping and narrowing a completed file check", () => {
  it("groups results by their startup role with unambiguous names and outcomes", async () => {
    await show();
    expect(screen.getAllByRole("heading", { level: 4 }).map((h) => h.textContent)).toEqual([
      "Page document", "Startup scripts", "Style sheets", "Module preload hints",
    ]);
    expect(fileRows("Page document")).toEqual(["index.html — Saved"]);
    expect(fileRows("Startup scripts")).toEqual(["assets/main.js — Saved"]);
    expect(fileRows("Style sheets")).toEqual(["assets/main.css — Missing", "assets/theme.css — Saved"]);
    expect(fileRows("Module preload hints")).toEqual(["assets/helpers.js — UNKNOWN"]);
    expect(screen.getByRole("status").textContent).toBe("File check finished. 5 files listed.");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("exposes the counts before filtering, including zeroes for available choices", async () => {
    await show(single);
    const select = screen.getByRole("combobox", { name: "Show files" });
    const options = within(select).getAllByRole("option");
    expect(options.map((o) => o.textContent)).toEqual([
      "All results (1)", "Saved copy found (1)", "Saved copy missing (0)", "UNKNOWN (0)",
    ]);
    expect(screen.getByText("Showing 1 of 1 file.")).toBeTruthy();
  });

  it("limits rows and headings to matching entries without another cache read", async () => {
    const read = await show();
    const select = screen.getByRole("combobox", { name: "Show files" });
    select.focus();
    choose("missing");
    expect(screen.getByText("Showing 1 of 5 files.")).toBeTruthy();
    expect(fileRows("Style sheets")).toEqual(["assets/main.css — Missing"]);
    expect(screen.queryByRole("list", { name: "Page document" })).toBeNull();
    choose("unknown");
    expect(fileRows("Module preload hints")).toEqual(["assets/helpers.js — UNKNOWN"]);
    expect(screen.queryByRole("list", { name: "Style sheets" })).toBeNull();
    choose("present");
    expect(fileRows("Style sheets")).toEqual(["assets/theme.css — Saved"]);
    expect(screen.getByText("Showing 3 of 5 files.")).toBeTruthy();
    choose("all");
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(document.activeElement).toBe(select);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("keeps the selected outcome after a fresh check and explains an empty match", async () => {
    const read = vi.fn<Read>().mockResolvedValueOnce(mixed).mockResolvedValueOnce(single);
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("assets/main.css");
    choose("missing");
    fireEvent.click(checkButton("Check startup files again"));
    await screen.findByText("Showing 0 of 1 file.");
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("missing");
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.getByText(/No files have the selected result/)).toBeTruthy();
    choose("all");
    expect(fileRows("Page document")).toEqual(["index.html — Saved"]);
  });

  it("keeps the limit notice visible even when a filter hides all rows", async () => {
    await show({ ...single, limited: true });
    choose("unknown");
    expect(screen.getByText(/Only part of the startup file list/)).toBeTruthy();
    expect(screen.getByText("Showing 0 of 1 file.")).toBeTruthy();
  });

  it("accounts for an empty inventory without offering unusable file controls", async () => {
    await show({ worker: "unavailable", files: [], limited: true });
    expect(screen.getByText("No startup files could be listed for this page.")).toBeTruthy();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByRole("list")).toBeNull();
    expect(status()).toBe("File check finished. 0 files listed.");
    expect(screen.getByText(/Only part of the startup file list/)).toBeTruthy();
  });

  it.each([
    ["controlled", "The app’s offline worker controls this page."],
    ["uncontrolled", /This page has no controlling offline worker/],
    ["unavailable", /could not provide the information needed to identify/],
    ["different-scope", /does not match this app’s installation/],
  ] as const)("explains the browser's %s worker state separately from file outcomes", async (worker, message) => {
    await show({ worker, files: [], limited: false });
    expect(screen.getByText(message)).toBeTruthy();
    expect(screen.queryByText(/Only part of the startup file list/)).toBeNull();
  });

  it("explains the metadata checked, missing evidence and scope in a native disclosure", async () => {
    await show(single);
    const summary = screen.getByText("How to read these results", { selector: "summary" });
    const details = summary.closest("details");
    expect(details?.open).toBe(false);
    fireEvent.click(summary);
    expect(details?.open).toBe(true);
    expect(screen.getByText(/matched the expected address and file type/)).toBeTruthy();
    expect(screen.getByText(/finished the lookup and found no saved copy/)).toBeTruthy();
    expect(screen.getByText(/could not establish whether the cache/)).toBeTruthy();
    expect(screen.getByText(/region packs and personal records fall outside/)).toBeTruthy();
  });
});

describe("stopping an in-progress check", () => {
  it.each(["resolve", "reject"] as const)("ignores a cancelled read that later %ss", async (settle) => {
    const waiting = deferred();
    const read = vi.fn<Read>().mockReturnValue(waiting.promise);
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    const signal = read.mock.calls[0]?.[0];
    fireEvent.click(checkButton("Cancel file check"));
    expect(signal?.aborted).toBe(true);
    expect(status()).toBe("File check cancelled.");
    expect(checkButton()).toBeTruthy();
    await act(async () => {
      if (settle === "resolve") waiting.resolve(mixed);
      else waiting.reject(new Error("superseded"));
    });
    expect(screen.queryByRole("list")).toBeNull();
    expect(status()).toBe("File check cancelled.");
  });

  it("cancels the current operation even after an earlier one has finished out of order", async () => {
    const older = deferred();
    const newer = deferred();
    const read = vi.fn<Read>()
      .mockReturnValueOnce(older.promise)
      .mockReturnValueOnce(newer.promise)
      .mockResolvedValueOnce(single);
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    fireEvent.click(checkButton("Cancel file check"));
    start();
    expect(read.mock.calls[1]?.[0].aborted).toBe(false);

    await act(async () => older.resolve(mixed));
    expect(status()).toBe("Checking the browser’s saved copies…");
    fireEvent.click(checkButton("Cancel file check"));
    expect(read.mock.calls[1]?.[0].aborted).toBe(true);
    expect(status()).toBe("File check cancelled.");

    start();
    await screen.findByText("index.html");
    await act(async () => newer.reject(new Error("superseded")));
    expect(fileRows("Page document")).toEqual(["index.html — Saved"]);
    expect(status()).toBe("File check finished. 1 file listed.");
  });

  it("retains the last result and filter after cancelling a refresh", async () => {
    const refresh = deferred();
    const read = vi.fn<Read>().mockResolvedValueOnce(mixed).mockReturnValueOnce(refresh.promise);
    render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("assets/main.css");
    choose("missing");
    fireEvent.click(checkButton("Check startup files again"));
    fireEvent.click(checkButton("Cancel file check"));
    await act(async () => refresh.resolve(single));

    expect(screen.getByRole("heading", { name: "Last completed file check" })).toBeTruthy();
    expect(fileRows("Style sheets")).toEqual(["assets/main.css — Missing"]);
    expect(screen.queryByText("index.html")).toBeNull();
    expect(status()).toBe("File check cancelled.");
  });

  it("releases a pending reader on unmount without affecting a newly opened panel", async () => {
    const first = deferred();
    const read = vi.fn<Read>().mockReturnValueOnce(first.promise).mockResolvedValueOnce(single);
    const initial = render(<ShellCheckPanel language="en" read={read} />);
    start();
    const previous = read.mock.calls[0]?.[0];
    initial.unmount();
    expect(previous?.aborted).toBe(true);

    render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("index.html");
    await act(async () => first.resolve(mixed));
    expect(screen.queryByText("assets/theme.css")).toBeNull();
    expect(status()).toBe("File check finished. 1 file listed.");
    expect(read.mock.calls[1]?.[0].aborted).toBe(false);
  });
});

describe("reading the same evidence in either language", () => {
  it("localizes state, grouping and detail text without altering raw file names or UNKNOWN", async () => {
    const read = vi.fn<Read>().mockResolvedValue({ ...mixed, limited: true });
    const panel = render(<ShellCheckPanel language="en" read={read} />);
    start();
    await screen.findByText("assets/main.css");
    choose("unknown");
    panel.rerender(<ShellCheckPanel language="fr" read={read} />);
    expect(screen.getByRole("heading", { name: "Examiner les fichiers de démarrage de l’appli" }).closest("[lang]")?.getAttribute("lang")).toBe("fr");
    expect(status()).toBe("Examen terminé. 5 fichiers dans la liste.");
    const select = screen.getByRole("combobox", { name: "Afficher les fichiers" });
    expect((select as HTMLSelectElement).value).toBe("unknown");
    expect(screen.getByText(/Fichiers affichés/).textContent).toBe("Fichiers affichés\u00a0: 1 sur 5.");
    expect(fileRows("Indications de préchargement des modules")).toEqual(["assets/helpers.js — UNKNOWN"]);
    expect(screen.getByText(/L’examen couvre une partie des fichiers/)).toBeTruthy();

    fireEvent.change(select, { target: { value: "all" } });
    expect(fileRows("Scripts de démarrage")).toEqual(["assets/main.js — En cache"]);
    expect(fileRows("Feuilles de style")).toEqual(["assets/main.css — Absent", "assets/theme.css — En cache"]);
    expect(screen.getByText("Comment lire ces résultats", { selector: "summary" })).toBeTruthy();
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("announces a pending result in the new language without restarting its read", async () => {
    const waiting = deferred();
    const read = vi.fn<Read>().mockReturnValue(waiting.promise);
    const view = render(<ShellCheckPanel language="en" read={read} />);
    start();
    const button = checkButton("Cancel file check");
    button.focus();
    view.rerender(<ShellCheckPanel language="fr" read={read} />);
    expect(document.activeElement).toBe(checkButton("Annuler l’examen des fichiers"));
    expect(status()).toBe("Examen des copies conservées par le navigateur…");
    expect(read.mock.calls[0]?.[0].aborted).toBe(false);
    await act(async () => waiting.resolve(single));
    expect(status()).toBe("Examen terminé. 1 fichier dans la liste.");
    expect(checkButton("Réexaminer les fichiers de démarrage")).toBe(button);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("exposes independent filter labels when two checks appear on the same page", async () => {
    const read = vi.fn<Read>().mockResolvedValue(mixed);
    render(<><ShellCheckPanel language="en" read={read} /><ShellCheckPanel language="fr" read={read} /></>);
    start();
    fireEvent.click(checkButton("Examiner les fichiers de démarrage"));
    await screen.findByText("Examen terminé. 5 fichiers dans la liste.");
    const en = screen.getByLabelText("Show files");
    const fr = screen.getByLabelText("Afficher les fichiers");
    expect(en.id).not.toBe(fr.id);
    fireEvent.change(fr, { target: { value: "missing" } });
    expect((en as HTMLSelectElement).value).toBe("all");
    expect(fileRows("Feuilles de style")).toEqual(["assets/main.css — Absent"]);
    expect(fileRows("Style sheets")).toHaveLength(2);
  });
});
