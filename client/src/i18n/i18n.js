const LANGUAGES = {
  en: () => import('./en.json'),
};

let strings = {};
let language = null;

export async function loadLanguage(lang = 'en') {
  const loader = LANGUAGES[lang];
  if (!loader) throw new Error(`unknown language: ${lang}`);
  const mod = await loader();
  strings = mod.default ?? mod;
  language = lang;
  return strings;
}

export function currentLanguage() {
  return language;
}

/** Looks up a string and replaces {placeholders}. Unknown keys return the key. */
export function t(key, params = {}) {
  let s = strings[key] ?? key;
  for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  return s;
}
