let searchRegion: string | null = null;

/** The region Places searches when nothing is stored on this device; null means the data client's default. */
export function setPlacesSearchRegion(id: string | null): void {
  searchRegion = id;
}

export function placesSearchRegion(): string | null {
  return searchRegion;
}
