// ARUN shell: top bar, hash router, language and motion switches.

import { h, announce } from './core/ui.js';
import { t, initLang, setLang, lang, onLang, SWITCHABLE, LOCALES } from './core/i18n.js';
import { BY_ID } from './exhibits/index.js';
import { renderExhibit } from './core/frame.js';
import { restoreRuns } from './core/tray.js';
import { CONFIG } from './config.js';
import { PAGES } from './pages/index.js';

const NAV = ['tour', 'lab', 'desk', 'trust', 'sources', 'compare', 'ideas', 'status'];
let current = null;

function setMotion(mode) {
  document.documentElement.dataset.motion = mode;
  try {
    localStorage.setItem('arun.motion', mode);
  } catch {}
}

function initMotion() {
  let m = null;
  try {
    m = localStorage.getItem('arun.motion');
  } catch {}
  if (!m) m = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'reduced' : 'full';
  setMotion(m);
}

function buildChrome() {
  const app = document.getElementById('app');
  const navList = h('ul', { class: 'nav-list', id: 'nav-list' });
  const menuBtn = h('button', { type: 'button', class: 'menu-btn', 'aria-expanded': 'false', 'aria-controls': 'nav-list' }, h('span', { 'aria-hidden': 'true' }, '☰ '), h('span', { class: 'menu-label' }, t('nav.menu')));
  menuBtn.addEventListener('click', () => {
    const open = menuBtn.getAttribute('aria-expanded') !== 'true';
    menuBtn.setAttribute('aria-expanded', String(open));
    document.body.classList.toggle('nav-open', open);
  });
  const langSel = h('div', { class: 'lang', role: 'group', 'aria-label': 'Language' },
    SWITCHABLE.map((c) => {
      const b = h('button', { type: 'button', class: 'lang-btn', lang: c, 'aria-pressed': String(c === lang()), dataset: { code: c } }, LOCALES[c].meta.native);
      b.addEventListener('click', () => setLang(c));
      return b;
    }));
  const motionBtn = h('button', { type: 'button', class: 'motion-btn', 'aria-pressed': 'false' });
  const paintMotion = () => {
    const full = document.documentElement.dataset.motion !== 'reduced';
    motionBtn.textContent = full ? t('motion.on') : t('motion.off');
    motionBtn.setAttribute('aria-pressed', String(!full));
  };
  motionBtn.addEventListener('click', () => {
    setMotion(document.documentElement.dataset.motion === 'reduced' ? 'full' : 'reduced');
    paintMotion();
    route();
  });
  const bar = h('header', { class: 'topbar' },
    h('div', { class: 'topbar-in' },
      h('a', { href: '#home', class: 'brand', 'aria-label': CONFIG.name + ' home' },
        h('span', { class: 'brand-sun', 'aria-hidden': 'true' }), h('span', { class: 'brand-word' }, CONFIG.name)),
      h('nav', { 'aria-label': 'Main' }, menuBtn, navList),
      h('div', { class: 'top-tools' }, langSel, motionBtn)));
  const main = h('main', { id: 'main', tabindex: '-1' });
  const announcer = h('div', { id: 'announcer', class: 'sr-only', 'aria-live': 'polite', role: 'status' });
  const toast = h('div', { id: 'toast', class: 'toast', hidden: true, 'aria-hidden': 'true' });
  const skip = h('a', { href: '#main', class: 'skip', onclick: (e) => { e.preventDefault(); main.focus(); } }, 'Skip to content');
  app.replaceChildren(skip, bar, main, announcer, toast);
  const paintNav = () => {
    navList.replaceChildren(...NAV.map((k) => h('li', {}, h('a', { href: '#' + k, dataset: { route: k } }, t('nav.' + k)))));
    menuBtn.querySelector('.menu-label').textContent = t('nav.menu');
    langSel.querySelectorAll('.lang-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.code === lang())));
    paintMotion();
    markNav();
  };
  paintNav();
  onLang(() => {
    paintNav();
    route();
  });
  return main;
}

function markNav() {
  const r = (location.hash || '#home').slice(1).toLowerCase();
  document.querySelectorAll('.nav-list a').forEach((a) => {
    const on = a.dataset.route === r || (a.dataset.route === 'lab' && /^e\d\d$/.test(r));
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

let mainEl = null;

function route() {
  const name = (location.hash || '#home').slice(1).toLowerCase() || 'home';
  if (current) {
    try {
      current.destroy();
    } catch (e) {
      console.error(e);
    }
    current = null;
  }
  document.body.classList.remove('nav-open');
  const mb = document.querySelector('.menu-btn');
  if (mb) mb.setAttribute('aria-expanded', 'false');
  const exId = /^e(\d\d)$/.test(name) ? 'E' + name.slice(1) : null;
  document.documentElement.dataset.route = exId ? 'exhibit' : name;
  if (exId && BY_ID[exId]) {
    current = renderExhibit(mainEl, BY_ID[exId]);
    document.title = `${BY_ID[exId].meta.id} ${BY_ID[exId].meta.title} · ${CONFIG.name}`;
  } else {
    const page = PAGES[name] || PAGES.home;
    if (!PAGES[name] && name !== 'home') announce(`No page called “${name}”. Showing home.`);
    current = page(mainEl) || { destroy() {} };
    document.title = name === 'home' || !PAGES[name] ? `${CONFIG.name} · ${t('strap2')}` : `${t('nav.' + name)} · ${CONFIG.name}`;
  }
  markNav();
  if (!exId) window.scrollTo(0, 0);
}

function boot() {
  initMotion();
  initLang();
  mainEl = buildChrome();
  restoreRuns();
  window.addEventListener('hashchange', route);
  route();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

// For tests and debugging: a read-only view of what is running.
window.__arun = { BY_ID, route: () => location.hash };
