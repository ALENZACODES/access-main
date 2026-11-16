/** Browser entry for the standalone data-status page: wires real globals into bootstrap(). */
import { registerOfflineSupport } from '../registerOffline';
import { bootstrap } from './bootstrap';

const host = document.getElementById('data-status');
if (host) {
  let storage: Storage | null = null;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  void bootstrap({
    host,
    doc: document,
    fetchText: async (url) => {
      const res = await fetch(url, { headers: { accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.text();
    },
    storage,
    search: window.location.search,
    pathname: window.location.pathname,
    browserLanguage: navigator.language,
    onSearchChange: (search) => window.history.replaceState(null, '', `${window.location.pathname}${search}`),
    onExport: (csv, filename) => {
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    },
  });
  void registerOfflineSupport(navigator, { scriptUrl: 'sw.js', isSecureContext: window.isSecureContext });
}
