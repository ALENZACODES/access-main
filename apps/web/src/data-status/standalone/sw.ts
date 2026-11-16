/**
 * Service worker entry for the standalone page. Build it as its own bundle and serve it
 * as `sw.js` next to index.html. Add the built asset URLs to `precache` for your bundler.
 */
import { installServiceWorker, type SwScopeLike } from '../serviceWorker';
import type { RequestLike, ResponseLike } from '../offline';

declare const self: SwScopeLike & { location: { origin: string }; fetch(req: unknown): Promise<unknown> };

installServiceWorker(self, {
  version: 'v1',
  origin: self.location.origin,
  precache: ['./', './registry.json'],
  fetcher: (req: RequestLike) => self.fetch(req) as Promise<ResponseLike>,
  makeResponse: (body, init) => new Response(body, init) as unknown as ResponseLike,
});
