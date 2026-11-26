// Home: the pitch over a live globe at dawn, five steps, then the lab.
import { h, fmt } from '../core/ui.js';
import { t } from '../core/i18n.js';
import { CONFIG } from '../config.js';
import { createGlobe, isLand } from '../viz/globe.js';
import { createLoop } from '../core/loop.js';
import * as K from '../kernels/e01.js';
import { labGrid } from './lab.js';

function hm(hours) {
  const m = Math.round(hours * 60);
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min`;
}

export function home(main) {
  const reduced = document.documentElement.dataset.motion === 'reduced';
  const nOpen = new Date();
  const dawnLonOpen = K.wrapLon(15 * (6 - (nOpen.getUTCHours() + nOpen.getUTCMinutes() / 60)));
  const globeLayer = h('div', { class: 'hero-globe', role: 'img', 'aria-label': 'Earth as it is lit right now: day side, night side and the band of dawn and dusk between them.' });
  const chip = h('div', { class: 'globe-chip', 'aria-live': 'polite', hidden: true });
  const acts = [1, 2, 3, 4, 5].map((i) => {
    const target = ['e02', 'e02', 'e03', 'e05', 'e07'][i - 1];
    return h('a', { class: 'act', href: '#' + target, dataset: { i } },
      h('span', { class: 'act-n' }, String(i)),
      h('span', { class: 'act-t' }, t(`home.act${i}.t`)),
      h('span', { class: 'act-d' }, t(`home.act${i}.d`)));
  });
  const page = h('div', { class: 'home' },
    globeLayer,
    h('section', { class: 'hero' },
      h('div', { class: 'hero-in wrap' },
        h('p', { class: 'eyebrow' }, h('span', {}, CONFIG.name), h('span', { class: 'dot' }, '·'), h('span', { lang: 'th' }, 'อรุณ'), h('span', { class: 'dot' }, '·'), h('span', { lang: 'km' }, 'អរុណ'), h('span', { class: 'dot' }, '·'), h('span', {}, 'dawn')),
        h('h1', { class: 'strap1' }, t('strap1')),
        h('p', { class: 'strap2' }, t('strap2')),
        h('p', { class: 'pitch' }, t('pitch')),
        h('div', { class: 'ctas' },
          h('a', { class: 'btn primary big glow', href: '#tour' }, t('home.ctaTour')),
          h('a', { class: 'btn big', href: '#lab' }, t('home.ctaLab'))),
        h('p', { class: 'globe-hint' }, `Dawn is crossing ${Math.abs(Math.round(dawnLonOpen))}°${dawnLonOpen >= 0 ? 'E' : 'W'} as this page opens. `, t('home.globeHint')),
        chip)),
    h('section', { class: 'acts-band' },
      h('div', { class: 'wrap' }, h('div', { class: 'acts' }, acts))),
    h('section', { class: 'home-lab' },
      h('div', { class: 'wrap' },
        h('h2', {}, t('home.labTitle')),
        h('p', { class: 'lede' }, t('home.labLede')),
        labGrid(),
        h('p', { class: 'muted small fiction' }, t('home.statusNote'), ' ', t('footer.fiction')))));
  main.replaceChildren(page);

  const wide = () => window.innerWidth >= 900;
  // Centre the view on the line where it is dawn right now (local solar time 06:00).
  const globe = createGlobe(globeLayer, {
    spinDegPerSec: 0,
    streamlines: !reduced,
    particles: wide() ? 1100 : 600,
    lon0: dawnLonOpen,
    lat0: 12,
    cxFrac: wide() ? 0.7 : 0.5,
    cyFrac: wide() ? 0.52 : 0.3,
    scale: wide() ? 1.02 : 0.9,
  });
  const setNow = () => {
    const n = new Date();
    globe.setTime(Math.min(365, K.dayOfYearUTC(n)), n.getUTCHours() + n.getUTCMinutes() / 60 + n.getUTCSeconds() / 3600);
  };
  setNow();
  globe.draw();

  function showPlace(lat, lon) {
    const n = new Date();
    const day = Math.min(365, K.dayOfYearUTC(n));
    const utc = n.getUTCHours() + n.getUTCMinutes() / 60;
    const elev = K.sunElevationDeg(lat, lon, day, utc);
    const rs = K.sunriseSunset(lat, day);
    const solar = K.localSolarHour(utc, lon);
    const flux = K.toaFlux(lat, day, solar);
    const daylight = rs.polar === 'day' ? '24 h (the sun does not set)' : rs.polar === 'night' ? '0 h (the sun does not rise)' : hm(K.daylightHours(lat, day));
    chip.hidden = false;
    chip.replaceChildren(
      h('b', {}, `${fmt(Math.abs(lat), 1)}°${lat >= 0 ? 'N' : 'S'}, ${fmt(Math.abs(lon), 1)}°${lon >= 0 ? 'E' : 'W'}`, isLand(lat, lon) ? ' · land' : ' · sea'),
      h('span', {}, `Daylight today: ${daylight}`),
      h('span', {}, elev > 0 ? `Sun now ${fmt(elev, 1)}° above the horizon · ${fmt(flux, 0)} W/m² at the top of the air` : `Sun now ${fmt(-elev, 1)}° below the horizon`),
      h('a', { href: '#e01' }, 'Open the planetary clock →'));
  }
  globeLayer.addEventListener('pointerup', (e) => {
    const p = globe.pick(e.clientX, e.clientY);
    if (!p) return;
    globe.setMarker(p);
    globe.pulse(p.lat, p.lon);
    if (reduced) globe.draw();
    showPlace(p.lat, p.lon);
  });

  let visible = true;
  const io = new IntersectionObserver((es) => {
    visible = es.some((x) => x.isIntersecting);
    if (visible && !reduced) loop.start();
    else loop.stop();
  }, { threshold: 0 });
  io.observe(page.querySelector('.hero'));
  let secs = 0;
  const loop = createLoop((dt) => {
    secs += dt;
    if (secs > 20) {
      setNow();
      secs = 0;
    }
    globe.frame(dt);
  });
  if (!reduced) loop.start();
  const onResize = () => {
    // Positioning depends on width; the globe reads it at creation, so a big change re-lays the page.
  };
  window.addEventListener('resize', onResize);
  return {
    destroy() {
      loop.dispose();
      io.disconnect();
      globe.destroy();
      window.removeEventListener('resize', onResize);
    },
  };
}
