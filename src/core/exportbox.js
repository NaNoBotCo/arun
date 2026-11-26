// Getting text out of the page: a download where the browser allows one, plus copy and a visible text box.

import { h, button, announce } from './ui.js';
import { safeFileName } from './record.js';

export function tryDownload(filename, text, mime = 'text/plain') {
  try {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = h('a', { href: url, download: safeFileName(filename) });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    return true;
  } catch {
    return false;
  }
}

export async function copyText(text, area) {
  try {
    await navigator.clipboard.writeText(text);
    announce('Copied.');
    return true;
  } catch {
    if (area) {
      area.focus();
      area.select();
      announce('Selected. Press Ctrl+C or ⌘C to copy.');
    }
    return false;
  }
}

// A panel holding one export: file name, buttons, and the text itself (so it works where downloads are blocked).
export function exportPanel(container, { filename, mime, text, note }) {
  const area = h('textarea', { class: 'export-text', readonly: true, rows: 8, spellcheck: 'false', 'aria-label': 'Export contents: ' + filename }, text);
  const panel = h('div', { class: 'export-panel' },
    h('div', { class: 'export-head' }, h('code', {}, safeFileName(filename)),
      button('Download', () => {
        const ok = tryDownload(filename, text, mime);
        announce(ok ? 'Download started. If nothing arrives, use Copy.' : 'This browser blocked the download. Use Copy.');
      }, { kind: 'primary small' }),
      button('Copy', () => copyText(area.value, area), { kind: 'small' })),
    note ? h('p', { class: 'muted small' }, note) : null,
    area);
  container.replaceChildren(panel);
  return panel;
}
