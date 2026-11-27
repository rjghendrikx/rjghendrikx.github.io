const FONT_WAIT = 4000;
export const FACES = { narrow: '"Archivo Narrow", "Arial Narrow", sans-serif', serif: '"Noto Serif", Georgia, serif' };
export const C = await fetch(new URL('./content.json', import.meta.url)).then((r) => r.json());
const faces = [['Archivo Narrow', 'archivo-narrow-400.woff2', '400'], ['Archivo Narrow', 'archivo-narrow-700.woff2', '700'],
  ['Noto Serif', 'noto-serif-400.woff2', '400'], ['Noto Serif', 'noto-serif-700.woff2', '700']]
  .map(([family, file, weight]) => new FontFace(family, `url(${new URL(`./${file}`, import.meta.url)})`, { weight }));
faces.forEach((f) => document.fonts.add(f));
export const fontsLoaded = await Promise.race([Promise.all(faces.map((f) => f.load())).then(() => true, () => false),
  new Promise((ok) => setTimeout(() => ok(false), FONT_WAIT))]);
