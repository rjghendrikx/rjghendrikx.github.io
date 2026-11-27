import { C } from './content.js';
export const DISKS = C.disks;
export const CV = DISKS.filter((d) => d.page).length;
export const bySlug = (s) => DISKS.find((d) => d.slug === s) ?? null;
export const byName = (n) => DISKS.find((d) => d.name === n) ?? null;
export const number = (d) => String(DISKS.indexOf(d) + 1).padStart(2, '0');
export function screenRows(d) {
  const rows = [];
  d.page.forEach((b, i) => { if (i) rows.push(''); rows.push(...b.map((l) => l.toUpperCase())); });
  return rows;
}
const CARD_WORDS = [[/\bBeta-gamma\b/g, 'Bèta-gamma'], [/\bWartsila\b/g, 'Wärtsilä']];
export function cardText(d) {
  const join = (b, sep) => b.reduce((s, l) => (!s ? l : s.endsWith('-') && sep === ' ' ? s + l : /([,:]| and)$/.test(s) ? `${s} ${l}` : `${s}${sep}${l}`), '');
  const t = d.page.map((b) => join(b.map((l) => l.replace(/ {2,}/g, ' ')), b.at(-1).endsWith('.') ? ' ' : '\n')).join('\n\n');
  return CARD_WORDS.reduce((s, [re, w]) => s.replace(re, w), t);
}
