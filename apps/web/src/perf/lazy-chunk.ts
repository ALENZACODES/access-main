/** Lazy loaders do not request a chunk until load() or preload() is called. */
export type ChunkLoader<T> = () => Promise<T>;
export type LazyChunkStatus = "idle" | "loading" | "loaded" | "error";

export interface LazyChunk<T> {
  load(): Promise<T>;
  preload(): Promise<T>;
  reset(): void;
  status(): LazyChunkStatus;
}

/** Deduplicate concurrent loads, cache successes and allow failed loads to retry. */
export function createLazyChunk<T>(loader: ChunkLoader<T>): LazyChunk<T> {
  let state: LazyChunkStatus = "idle";
  let pending: Promise<T> | undefined;
  let cached: T | undefined;
  let hasCachedValue = false;
  let generation = 0;

  function load(): Promise<T> {
    if (hasCachedValue) return Promise.resolve(cached as T);
    if (pending !== undefined) return pending;

    const requestGeneration = generation;
    state = "loading";
    // Defer even a synchronously throwing loader into a rejected promise.
    const request = Promise.resolve().then(loader).then(
      (result) => {
        if (generation === requestGeneration) {
          cached = result;
          hasCachedValue = true;
          pending = undefined;
          state = "loaded";
        }
        return result;
      },
      (error: unknown) => {
        if (generation === requestGeneration) {
          pending = undefined;
          state = "error";
        }
        throw error;
      },
    );
    pending = request;
    return request;
  }

  function reset(): void {
    generation += 1;
    pending = undefined;
    cached = undefined;
    hasCachedValue = false;
    state = "idle";
  }

  return { load, preload: load, reset, status: () => state };
}

/** Keep the import expression statically analyzable by the bundler. */
export function lazyImport<T>(importer: () => Promise<T>): LazyChunk<T> {
  return createLazyChunk(importer);
}

/** Select one export; this does not reduce the imported chunk's byte size. */
export function lazyExport<TModule, TValue>(
  importer: () => Promise<TModule>,
  select: (module: TModule) => TValue,
): LazyChunk<TValue> {
  return createLazyChunk(async () => select(await importer()));
}

/** Explicitly start downloads for a collection of optional features. */
export async function preloadChunks(
  chunks: readonly LazyChunk<unknown>[],
): Promise<void> {
  await Promise.all(chunks.map((chunk) => chunk.preload()));
}
