// Reads a web address written in a pack file and says what is wrong with it. Total: any text gives an answer.

export type PkUrlCode =
  | "pk-url-unreadable"
  | "pk-url-not-https"
  | "pk-url-credentials"
  | "pk-url-tracking"
  | "pk-url-ip-host"
  | "pk-url-shortener"
  | "pk-url-port"
  | "pk-url-host-not-listed";

export interface PkParsedUrl {
  scheme: string;
  user: string;
  host: string;
  port: string;
  path: string;
  queryNames: string[];
  hash: string;
}

const PATTERN = /^([a-z][a-z0-9+.-]*):\/\/(?:([^/?#@]*)@)?(\[[^\]]*\]|[^/?#:]*)(?::(\d*))?([^?#]*)(?:\?([^#]*))?(?:#(.*))?$/i;

/** The parts of an absolute address, or null when the text is not one. */
export function parseUrl(text: string): PkParsedUrl | null {
  if (/\s/.test(text)) return null;
  const m = PATTERN.exec(text);
  if (!m) return null;
  const query = m[6] ?? "";
  return {
    scheme: (m[1] ?? "").toLowerCase(),
    user: m[2] ?? "",
    host: (m[3] ?? "").toLowerCase(),
    port: m[4] ?? "",
    path: m[5] ?? "",
    queryNames: query === "" ? [] : query.split("&").map((p) => decodeSafe(p.split("=")[0] ?? "")),
    hash: m[7] ?? "",
  };
}

function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** Query names that only exist to follow a person from one site to another. */
export const TRACKING_NAME = /^(?:utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_cid|mc_eid|_ga|_gl|igshid|yclid|ref_src|ref|source)$/i;

export const SHORTENERS: readonly string[] = ["bit.ly", "t.co", "tinyurl.com", "goo.gl", "ow.ly", "is.gd", "buff.ly", "rebrand.ly", "cutt.ly"];

export const isIpHost = (host: string): boolean => /^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith("[") || /^0x[0-9a-f]+$/i.test(host) || /^\d{8,10}$/.test(host);

/** The hosts a host name falls under: `a.b.c` gives `a.b.c`, `b.c` and `c`. */
export function hostSuffixes(host: string): string[] {
  const parts = host.split(".").filter((p) => p !== "");
  return parts.map((_, i) => parts.slice(i).join("."));
}

export const hostIsListed = (host: string, listed: readonly string[]): boolean => hostSuffixes(host).some((h) => listed.includes(h));

export interface PkUrlProblem {
  code: PkUrlCode;
  detail: string;
}

/** Everything wrong with one address. `listed` is the hosts the pack may link to. */
export function checkUrl(text: string, listed: readonly string[]): PkUrlProblem[] {
  const u = parseUrl(text);
  if (!u) return [{ code: "pk-url-unreadable", detail: "not an address with a scheme and a host" }];
  const out: PkUrlProblem[] = [];
  if (u.scheme !== "https") out.push({ code: "pk-url-not-https", detail: `scheme ${u.scheme}` });
  if (u.user !== "") out.push({ code: "pk-url-credentials", detail: "a user name or password is written in the address" });
  if (u.host === "" || isIpHost(u.host)) out.push({ code: "pk-url-ip-host", detail: u.host === "" ? "no host" : `host ${u.host} is a number` });
  if (SHORTENERS.includes(u.host)) out.push({ code: "pk-url-shortener", detail: `${u.host} hides where the link goes` });
  if (u.port !== "" && u.port !== "443") out.push({ code: "pk-url-port", detail: `port ${u.port}` });
  const tracking = u.queryNames.filter((n) => TRACKING_NAME.test(n));
  if (tracking.length > 0) out.push({ code: "pk-url-tracking", detail: `query ${tracking.join(", ")}` });
  if (u.host !== "" && !isIpHost(u.host) && !hostIsListed(u.host, listed)) out.push({ code: "pk-url-host-not-listed", detail: `host ${u.host}` });
  return out;
}
