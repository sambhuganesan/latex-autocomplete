// popup.js — settings UI logic

const DEFAULTS = { enabled: true, format: 'auto' };

const enabledToggle = document.getElementById('enabled-toggle');
const formatRadios = document.querySelectorAll('input[name="format"]');

// Load current settings
chrome.storage.sync.get(DEFAULTS, (settings) => {
  enabledToggle.checked = settings.enabled;
  for (const radio of formatRadios) {
    radio.checked = radio.value === settings.format;
  }
});

// Save on change
enabledToggle.addEventListener('change', () => {
  chrome.storage.sync.set({ enabled: enabledToggle.checked });
});

formatRadios.forEach((radio) => {
  radio.addEventListener('change', () => {
    if (radio.checked) chrome.storage.sync.set({ format: radio.value });
  });
});
