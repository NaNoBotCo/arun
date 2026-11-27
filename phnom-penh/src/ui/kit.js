// Small DOM helpers shared by every sheet module. Each module mounts into a container and returns a cleanup.
import { t } from '../i18n.js';

export const h = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
// Text from data or a person goes in with textContent, never innerHTML.
export const txt = (tag, cls, s) => { const e = document.createElement(tag); if (cls) e.className = cls; e.textContent = s == null ? '' : String(s); return e; };
export const nums = items => `<div class="nums">${items.map(([v, l, c]) => `<div class="num ${c || ''}"><b>${v}</b><span>${l}</span></div>`).join('')}</div>`;
export const btn = (label, on, cls = '') => h('button', 'btn ' + cls + (on ? ' on' : ''), label);
export function slider(wrap, label, min, max, step, value, fmt, oninput) {
  const l = h('label', 'sl', `${label} <output>${fmt(value)}</output>`);
  const i = h('input'); i.type = 'range'; i.min = min; i.max = max; i.step = step; i.value = value; i.setAttribute('aria-label', label);
  i.addEventListener('input', () => { l.querySelector('output').textContent = fmt(+i.value); oninput(+i.value, false); });
  i.addEventListener('change', () => oninput(+i.value, true));
  wrap.append(l, i); return i;
}
// Provenance tags: what a number is. kinds: observed · synthetic · proposed · estimated · benchmark · assumed · measured · source
export const TAG_KINDS = ['observed', 'synthetic', 'proposed', 'estimated', 'benchmark', 'assumed', 'measured', 'source', 'modelled'];
export const tag = (kind, extra = '') => `<span class="ptag ${kind}">${t('tag_' + kind)}${extra ? ' · ' + extra : ''}</span>`;
