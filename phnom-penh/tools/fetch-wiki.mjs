// Wikipedia article links (English, Khmer, Thai) for the landmarks, from Wikidata sitelinks.
// node tools/fetch-wiki.mjs → data/landmarks-wiki.json { id: { en, km, th } }
import { readFileSync, writeFileSync } from 'node:fs';
const R = p => new URL('../' + p, import.meta.url);
const lm = JSON.parse(readFileSync(R('data/landmarks.json')));
const ids = lm.filter(l => l.q).map(l => l.q).join('|');
const js = await (await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${ids}&props=sitelinks/urls&sitefilter=enwiki|kmwiki|thwiki&format=json`, { headers: { 'user-agent': 'arun-demo-build/1.0' } })).json();
const out = {};
for (const l of lm) {
  const e = js.entities[l.q]; if (!e) continue;
  const sl = e.sitelinks || {}, o = {};
  for (const [k, lang] of [['enwiki', 'en'], ['kmwiki', 'km'], ['thwiki', 'th']]) if (sl[k]) o[lang] = sl[k].url;
  out[l.id] = o;
}
writeFileSync(R('data/landmarks-wiki.json'), JSON.stringify(out));
console.log(Object.keys(out).length, 'landmarks;', ['en', 'km', 'th'].map(k => k + ' ' + Object.values(out).filter(o => o[k]).length).join(', '));
