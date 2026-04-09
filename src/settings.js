// settings.js — read/write extension settings via chrome.storage.sync
//
// Settings schema:
//   enabled: boolean       (default: true)
//   format:  'auto'|'decimal'|'fraction'  (default: 'auto')

const LatexSettings = (() => {
  const DEFAULTS = {
    enabled: true,
    format: 'auto',
  };

  let _cache = { ...DEFAULTS };
  let _loaded = false;
  const _listeners = [];

  function load(cb) {
    if (typeof chrome === 'undefined' || !chrome.storage) {
      _loaded = true;
      if (cb) cb(_cache);
      return;
    }
    chrome.storage.sync.get(DEFAULTS, (result) => {
      _cache = result;
      _loaded = true;
      if (cb) cb(_cache);
    });
  }

  function get(key) {
    return _cache[key] ?? DEFAULTS[key];
  }

  function set(updates, cb) {
    _cache = { ..._cache, ...updates };
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set(updates, cb);
    } else if (cb) {
      cb();
    }
    _listeners.forEach(fn => fn(_cache));
  }

  function onChange(fn) {
    _listeners.push(fn);
  }

  // Listen for changes from popup
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes) => {
      for (const [key, { newValue }] of Object.entries(changes)) {
        _cache[key] = newValue;
      }
      _listeners.forEach(fn => fn(_cache));
    });
  }

  return { load, get, set, onChange, DEFAULTS };
})();

if (typeof module !== 'undefined' && module.exports) {
  module.exports = LatexSettings;
}
