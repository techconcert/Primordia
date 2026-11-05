/* SP.save — localStorage persistence (single slot) + design export/import. */
(function () {
  'use strict';
  const SP = window.SP = window.SP || {};
  const KEY = 'primordia-web-save-v1';
  const PREFIX = 'PRIMORDIA1:';

  function b64enc(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64dec(s) { return decodeURIComponent(escape(atob(s))); }

  SP.save = {
    KEY: KEY,
    has() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } },
    load() {
      try { const s = localStorage.getItem(KEY); if (!s) return null; const c = JSON.parse(s); return c && c.v === 1 ? c : null; }
      catch (e) { return null; }
    },
    save(campaign) {
      try { localStorage.setItem(KEY, JSON.stringify(campaign)); return true; }
      catch (e) { return false; }
    },
    clear() { try { localStorage.removeItem(KEY); } catch (e) {} },
    exportDesign(design) { return PREFIX + b64enc(JSON.stringify(design)); },
    importDesign(str) {
      try {
        str = String(str || '').trim();
        const json = str.indexOf(PREFIX) === 0 ? b64dec(str.slice(PREFIX.length)) : str;
        const d = JSON.parse(json);
        if (!d || typeof d !== 'object' || !Array.isArray(d.spine) && !Array.isArray(d.parts)) return null;
        if (!Array.isArray(d.parts)) d.parts = [];
        return d;
      } catch (e) { return null; }
    }
  };
})();
