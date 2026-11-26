// Small generated drawings for exhibit cards, one per exhibit, drawn from each exhibit's own mathematics.
const NS = 'http://www.w3.org/2000/svg';
function svg(children, vb = '0 0 64 64') {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', vb);
  s.setAttribute('width', '64');
  s.setAttribute('height', '64');
  s.setAttribute('aria-hidden', 'true');
  s.innerHTML = children;
  return s;
}
const P = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join('');
const GLYPHS = {
  E01: () => `<circle cx="32" cy="32" r="22" fill="var(--bg-2)" stroke="var(--line)"/><path d="M32 10a22 22 0 0 1 0 44a12 22 0 0 0 0-44z" fill="var(--dawn)" opacity=".85"/><circle cx="50" cy="14" r="4" fill="var(--gold-fill)"/>`,
  E02: () => { let a = []; for (let x = 0; x <= 64; x += 4) a.push([x, 40 + 8 * Math.sin(x / 9)]); return `<path d="${P(a)} L64 64 L0 64z" fill="var(--water)" opacity=".75"/><path d="M0 30 L18 12 L30 26 L44 8 L64 28" fill="none" stroke="var(--jade)" stroke-width="2.5"/>`; },
  E03: () => { let s = ''; for (let k = 0; k < 9; k++) { let y = 32, a = [[4, 32]]; for (let x = 8; x <= 60; x += 4) { y += Math.sin(k * 7.3 + x * 0.9) * 3 + (k - 4) * 0.35; a.push([x, y]); } s += `<path d="${P(a)}" fill="none" stroke="${k === 4 ? 'var(--dawn)' : 'var(--violet)'}" stroke-width="${k === 4 ? 2.5 : 1}" opacity="${k === 4 ? 1 : 0.6}"/>`; } return s; },
  E04: () => `<rect x="6" y="6" width="52" height="52" rx="8" fill="var(--bg-2)"/>${[[18, 20], [42, 18], [30, 40], [48, 46], [16, 48]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="var(--water)" opacity=".25"/><circle cx="${x}" cy="${y}" r="3" fill="var(--water)"/>`).join('')}`,
  E05: () => `<rect x="10" y="16" width="30" height="34" rx="5" fill="none" stroke="var(--rose)" stroke-width="2.5"/>${Array.from({ length: 24 }, (_, i) => `<circle cx="${15 + (i % 6) * 4}" cy="${22 + Math.floor(i / 6) * 6}" r="1.4" fill="var(--muted)"/>`).join('')}<rect x="46" y="34" width="4" height="16" fill="var(--dawn)"/><rect x="52" y="26" width="4" height="24" fill="var(--dawn)"/><rect x="58" y="38" width="4" height="12" fill="var(--dawn)"/>`,
  E06: () => { let s = ''; for (let i = 0; i < 40; i++) { const x = 6 + ((i * 37) % 52), y = 58 - ((i * 53) % 50); s += `<circle cx="${x}" cy="${y}" r="1.6" fill="var(--muted)"/>`; } return s + `<path d="M8 10 Q24 12 36 24 T58 56" fill="none" stroke="var(--dawn)" stroke-width="2.5"/>`; },
  E07: () => `<rect x="12" y="8" width="40" height="48" rx="4" fill="var(--bg-2)" stroke="var(--line)"/><rect x="18" y="16" width="28" height="4" rx="2" fill="var(--dawn)"/><rect x="18" y="26" width="20" height="3" rx="1.5" fill="var(--muted)"/><rect x="18" y="33" width="24" height="3" rx="1.5" fill="var(--muted)"/><path d="M18 50 L26 44 L32 47 L46 38" fill="none" stroke="var(--jade)" stroke-width="2.5"/>`,
  E08: () => { let s = ''; for (let i = 0; i < 18; i++) { const a = i * 2.39996, r = 4 + 2.6 * Math.sqrt(i * 4); s += `<circle cx="${32 + r * Math.cos(a)}" cy="${32 + r * Math.sin(a)}" r="${3 + (i % 3)}" fill="var(--rose)" opacity=".8"/>`; } return s; },
  E09: () => { let x = 1, y = 1, z = 1, a = []; for (let i = 0; i < 1400; i++) { const dt = 0.008; const dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - 8 / 3 * z; x += dx * dt; y += dy * dt; z += dz * dt; if (i > 100) a.push([32 + x * 1.25, 60 - z * 1.05]); } return `<path d="${P(a)}" fill="none" stroke="var(--violet)" stroke-width=".8"/>`; },
  E10: () => Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2, r = 22; return `<circle cx="${32 + r * Math.cos(a)}" cy="${32 + r * Math.sin(a)}" r="3" fill="${i < 11 ? 'var(--jade)' : 'var(--muted)'}"/>`; }).join('') + `<path d="M32 32 L48 22" stroke="var(--dawn)" stroke-width="2.5"/>`,
  E11: () => { let a = [], b = []; for (let x = 0; x <= 64; x += 1) { a.push([x, 22 + 8 * Math.cos(x / 4)]); b.push([x, 44 + 8 * Math.cos(x / 8)]); } return `<path d="${P(a)}" fill="none" stroke="var(--water)" stroke-width="1.6"/><path d="${P(b)}" fill="none" stroke="var(--dawn)" stroke-width="2"/>`; },
  E12: () => { let s = ''; for (let n = 1; n < 150; n++) { const a = n * 2.39996, r = 2.4 * Math.sqrt(n); s += `<circle cx="${32 + r * Math.cos(a)}" cy="${32 + r * Math.sin(a)}" r="1.3" fill="var(--dawn)" opacity="${0.4 + 0.6 * (n / 150)}"/>`; } return s; },
  E13: () => `<rect x="6" y="6" width="52" height="52" rx="8" fill="var(--bg-2)"/><path d="M10 40 C20 20 30 50 40 26 S54 30 56 18" fill="none" stroke="var(--jade)" stroke-width="2" stroke-dasharray="3 3"/>${[[14, 36], [26, 32], [38, 30], [50, 22]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.8" fill="var(--dawn)"/>`).join('')}`,
  E14: () => { let s = ''; for (let k = 1; k <= 4; k++) s += `<ellipse cx="32" cy="32" rx="${k * 6}" ry="${k * 4}" fill="none" stroke="var(--water)" opacity="${1 - k * 0.18}" stroke-width="1.6"/>`; return s + `<circle cx="50" cy="32" r="3" fill="var(--dawn)"/>`; },
  E15: () => Array.from({ length: 25 }, (_, i) => { const x = 8 + (i % 5) * 11, y = 8 + Math.floor(i / 5) * 11; return `<rect x="${x}" y="${y}" width="9" height="9" rx="2" fill="${(i * 7) % 5 === 0 ? 'var(--rose)' : 'var(--jade)'}" opacity="${0.35 + ((i * 13) % 7) / 10}"/>`; }).join(''),
  E16: () => { let a = [], b = []; for (let x = 0; x <= 64; x += 2) { a.push([x, 30 + 10 * Math.sin(x / 6) + ((x * 7) % 5)]); b.push([x, 46 + 7 * Math.sin((x - 8) / 6)]); } return `<path d="${P(a)}" fill="none" stroke="var(--violet)" stroke-width="1.8"/><path d="${P(b)}" fill="none" stroke="var(--dawn)" stroke-width="1.8"/>`; },
  E17: () => { const n = [[10, 32], [26, 14], [26, 50], [42, 24], [42, 44], [56, 32]]; const e = [[0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [1, 4]]; return e.map(([a, b]) => `<line x1="${n[a][0]}" y1="${n[a][1]}" x2="${n[b][0]}" y2="${n[b][1]}" stroke="var(--water)" stroke-width="2"/>`).join('') + n.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4.5" fill="${i === 3 ? 'var(--danger)' : 'var(--jade)'}"/>`).join(''); },
  E18: () => `<rect x="16" y="12" width="32" height="40" rx="6" fill="var(--bg-2)" stroke="var(--line)"/><circle cx="32" cy="26" r="6" fill="none" stroke="var(--jade)" stroke-width="2.5"/><rect x="22" y="40" width="20" height="5" rx="2" fill="var(--dawn)"/><path d="M48 18 q6 6 0 12 M52 14 q10 10 0 20" fill="none" stroke="var(--water)" stroke-width="2"/>`,
  E19: () => Array.from({ length: 6 }, (_, i) => `<rect x="${8 + i * 9}" y="${44 - i * 5}" width="7" height="${12 + i * 5}" rx="2" fill="${i < 4 ? 'var(--violet)' : 'var(--dawn)'}"/>`).join(''),
  E20: () => `<path d="M8 56 L8 12 Q30 14 44 28 T56 56 Z" fill="var(--jade)" opacity=".25"/><path d="M8 12 Q30 14 44 28 T56 56" fill="none" stroke="var(--jade)" stroke-width="2.5"/><circle cx="36" cy="22" r="4" fill="var(--dawn)"/>`,
  E21: () => `<circle cx="20" cy="24" r="10" fill="var(--rose)" opacity=".7"/><circle cx="44" cy="24" r="10" fill="var(--water)" opacity=".7"/><circle cx="32" cy="44" r="10" fill="var(--jade)" opacity=".7"/>`,
};
export function glyph(id) {
  return svg((GLYPHS[id] || (() => ''))());
}
