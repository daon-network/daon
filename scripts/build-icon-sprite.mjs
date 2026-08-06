#!/usr/bin/env node
/**
 * Builds the DAON SVG icon sprite from lucide-react.
 *
 * The sprite is generated from the very package the frontend imports, so the
 * icons on the marketing site, in the browser extension and in the WordPress
 * plugin cannot drift from the ones React renders.
 *
 * Usage:  node scripts/build-icon-sprite.mjs
 *
 * Note on email: transactional email is deliberately NOT a consumer of this
 * sprite. Gmail and Outlook strip both <svg> and @font-face, so an icon there
 * renders as nothing at all. Those templates use typography instead.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ICON_DIR = join(ROOT, 'daon-frontend/node_modules/lucide-react/dist/esm/icons');

/** Every icon any DAON surface uses, with the emoji it replaced. */
const ICONS = {
  shield: '🛡️',
  'triangle-alert': '⚠️',
  lock: '🔒',
  'lock-keyhole': '🔐',
  'circle-check': '✅',
  'circle-x': '❌',
  check: '✓',
  x: '✗',
  lightbulb: '💡',
  globe: '🌍 🇪🇺',
  coffee: '☕',
  scale: '⚖️',
  link: '🔗',
  search: '🔍',
  clipboard: '📋',
  'refresh-cw': '🔄',
  save: '💾',
  mail: '📧',
  'file-pen': '📝',
  'party-popper': '🎉',
  zap: '⚡',
  'satellite-dish': '📡',
  smartphone: '📱',
  bot: '🤖',
  laptop: '💻',
  target: '🎯',
  'key-round': '🔑',
  circle: '🔵 🔴 🟦',
};

/**
 * Read an icon's geometry. Lucide exports `__iconNode` from every icon module,
 * so this is a plain import -- no scraping of the bundle's source text.
 */
async function readIconNode(name) {
  const { __iconNode } = await import(pathToFileURL(join(ICON_DIR, `${name}.mjs`)).href);
  if (!Array.isArray(__iconNode)) throw new Error(`no __iconNode exported from ${name}.mjs`);
  return __iconNode;
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function toMarkup(iconNode) {
  return iconNode
    .map(([tag, attrs]) => {
      const a = Object.entries(attrs)
        .filter(([k]) => k !== 'key')
        .map(([k, v]) => `${k}="${esc(v)}"`)
        .join(' ');
      return `<${tag} ${a}/>`;
    })
    .join('');
}

// Lucide icons are strokes, not fills. These attributes must sit on each
// <symbol> rather than on the sprite's root <svg>: the root is not an ancestor
// of the symbol in the rendered tree, so a <use> elsewhere inherits nothing
// from it and every icon comes out as a solid black blob.
// stroke="currentColor" lets each icon take its colour from surrounding text.
const STROKE =
  'fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"';

const names = Object.keys(ICONS).sort();
const symbols = (
  await Promise.all(
    names.map(
      async (n) =>
        `  <symbol id="i-${n}" viewBox="0 0 24 24" ${STROKE}>${toMarkup(await readIconNode(n))}</symbol>`
    )
  )
).join('\n');

const sprite = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">
${symbols}
</svg>
`;

// The docs site inlines the sprite through a Jekyll include. An external
// <use href="file.svg#id"> would be tidier, but external references do not
// inherit currentColor in older Safari, so the icons would lose their colour.
const spritePath = join(ROOT, 'docs/_includes/icons.svg');
mkdirSync(dirname(spritePath), { recursive: true });
writeFileSync(spritePath, sprite);
console.log(`  wrote docs/_includes/icons.svg  (${(sprite.length / 1024).toFixed(1)} KB)`);

/**
 * Standalone single-icon files.
 *
 * The browser extension's content script injects markup into arbitrary third
 * party pages, where it can reference neither a sprite id nor an extension
 * asset URL, and the WordPress plugin renders straight into wp-admin. Both
 * need self-contained markup, so each icon is also emitted on its own.
 */
export function inlineSvg(iconNode, size = 20) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ` +
    `fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${toMarkup(iconNode)}</svg>`
  );
}

for (const n of names) {
  const p = join(ROOT, `brand/icons/${n}.svg`);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, inlineSvg(await readIconNode(n)) + '\n');
}
console.log(`  wrote brand/icons/*.svg      (${names.length} standalone icons)`);

// The browser extension is deliberately not a consumer. Its wallet code is a
// non-functional placeholder (a 12-word mnemonic drawn from a 12-word list via
// Math.random, storing a phrase that derives nothing), it has no CI, and the
// project docs still list it as not started. Polishing its chrome would make an
// abandoned prototype look shippable. Leave it visibly unfinished.

console.log(`\n  source: lucide-react, the same package the frontend imports`);
