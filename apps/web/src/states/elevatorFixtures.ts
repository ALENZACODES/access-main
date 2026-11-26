/** Notices for tests: a few by hand and a seeded generator. Not part of the app. */
import type { ElevatorNotice } from "./packElevators";

export function notice(over: Partial<ElevatorNotice> = {}): ElevatorNotice {
  return {
    id: "n",
    station: "Pape",
    text: "Pape: Elevator 8D1L out of service between Pape Ave entrance and concourse while we perform maintenance.",
    textLanguage: "en",
    stopIds: ["13746"],
    checkedAt: "2026-11-13T19:48:29.000Z",
    checkedDay: "2026-11-13",
    sourceName: "TTC GTFS-Realtime accessibility alerts",
    sourceUrl: null,
    licence: "OGL-Toronto-1.0",
    retrievedOn: "2026-11-13",
    tier: 0,
    ...over,
  };
}

const STATIONS = ["Pape", "Finch", "Cedarvale", "Edifice Élysée", "Union", "St. Clair", "St. Clair West", "Station 10", "Station 2", "Kennedy"];

/** n notices over the stations above, with check days spread over the 30 days before 2026-11-21. */
export function manyNotices(n: number, rnd: () => number): ElevatorNotice[] {
  const out: ElevatorNotice[] = [];
  for (let i = 0; i < n; i++) {
    const station = STATIONS[Math.floor(rnd() * STATIONS.length)] ?? "Pape";
    const back = Math.floor(rnd() * 30);
    const d = new Date(Date.UTC(2026, 10, 21 - back, Math.floor(rnd() * 24), Math.floor(rnd() * 60)));
    const label = `E${Math.floor(rnd() * 90) + 10}`;
    out.push(
      notice({
        id: `id-${i}`,
        station,
        text: `${station}: Elevator ${label} out of service between the lobby and platform ${Math.floor(rnd() * 4) + 1}.`,
        stopIds: [String(10_000 + Math.floor(rnd() * 900))],
        checkedAt: d.toISOString(),
        checkedDay: d.toISOString().slice(0, 10),
      }),
    );
  }
  return out;
}
