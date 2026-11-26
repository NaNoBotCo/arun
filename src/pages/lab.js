// The catalogue: every exhibit, core first, with status and a one-line description.
import { h, statusTag } from '../core/ui.js';
import { EXHIBITS } from '../exhibits/index.js';
import { t } from '../core/i18n.js';
import { exTitle, exBlurb } from '../i18n/exhibits.js';
import { glyph } from '../viz/glyphs.js';

export function exhibitCard(m) {
  const meta = m.meta;
  const card = h('a', { href: '#' + meta.id.toLowerCase(), class: 'ex-card' + (meta.placeholder ? ' placeholder' : ''), dataset: { kind: meta.kind, pri: meta.priority } },
    h('span', { class: 'ex-card-glyph', 'aria-hidden': 'true' }, glyph(meta.id)),
    h('span', { class: 'ex-card-top' }, h('span', { class: 'ex-id' }, meta.id), statusTag(meta.dataStatus)),
    h('span', { class: 'ex-card-title' }, exTitle(meta.id, meta.title)),
    meta.subtitle ? h('span', { class: 'ex-card-sub' }, meta.subtitle) : null,
    h('span', { class: 'ex-card-blurb' }, exBlurb(meta.id, meta.blurb)),
    meta.whoPays ? h('span', { class: 'ex-card-buyer' }, meta.whoPays.buyer) : h('span', { class: 'ex-card-buyer research' }, 'Research'));
  return card;
}

export function labGrid() {
  const core = EXHIBITS.filter((m) => m.meta.priority === 'P0');
  const rest = EXHIBITS.filter((m) => m.meta.priority !== 'P0');
  return h('div', { class: 'lab-grid-wrap' },
    h('h2', { class: 'lab-h' }, t('lab.core'), h('span', { class: 'count' }, ` ${core.length}`)),
    h('div', { class: 'lab-grid core' }, core.map(exhibitCard)),
    h('h2', { class: 'lab-h' }, t('lab.research'), h('span', { class: 'count' }, ` ${rest.length}`)),
    h('div', { class: 'lab-grid' }, rest.map(exhibitCard)));
}

export function lab(main) {
  main.replaceChildren(h('div', { class: 'wrap page lab' },
    h('h1', {}, t('home.labTitle')),
    h('p', { class: 'lede' }, t('home.labLede')),
    labGrid()));
  return { destroy() {} };
}
