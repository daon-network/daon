# DAON Brand Assets

The DAON mark is a fingerprint with circuit traces — identity plus provenance.

## Palette

The mark uses the application's gradient, resolved from the installed Tailwind v4 theme
(`--color-blue-600`, `--color-purple-600`, `--color-pink-600`) and converted from oklch to
hex so that tooling without oklch support renders it correctly.

| Stop | Tailwind | oklch | hex |
| --- | --- | --- | --- |
| 0% | `blue-600` | `oklch(54.6% 0.245 262.881)` | `#155DFC` |
| 50% | `purple-600` | `oklch(55.8% 0.288 302.321)` | `#9810FA` |
| 100% | `pink-600` | `oklch(59.2% 0.249 0.584)` | `#E60076` |

This matches the app's existing `from-blue-600 to-purple-600` and `from-purple-600 to-pink-600`
gradients.

Three palettes were previously in circulation and have all been retired: the teal mark
(`#5DD5D5 → #3FB8AF → #173F5F`), which themed the whole documentation site; an indigo
(`#667eea → #764ba2`) used by the browser extension, transactional email, the WordPress
plugin, and a Grafana dashboard; and the app's own blue/purple/pink, which is what everything
now uses.

## Surfaces

Everything is a **light** surface: white or a near-white tint, dark text, `600`-weight accents.
The documentation site previously ran a near-black theme (`#0a0f1c`) and has been brought onto
the application's light system, so one set of weights now works everywhere.

`docs/assets/css/daon.css` drives its theme from variables at the top of the file:

| Variable | Token | hex | contrast on white |
| --- | --- | --- | --- |
| `--md-primary-color` | `blue-600` | `#155DFC` | 5.25:1 |
| `--md-primary-light` | `blue-700` | `#1447E6` | 6.83:1 |
| `--md-primary-dark` | `blue-800` | `#193CB8` | 8.82:1 |
| `--md-accent-color` | `purple-600` | `#9810FA` | 5.54:1 |
| `--md-text-color` | `gray-900` | `#101828` | 17.75:1 |

The `-light` / `-dark` suffixes are historical. On a light surface they mean "hover tone" and
"strongest emphasis" — both *darker* than the base, not lighter. Renaming them was left alone
to keep the diff reviewable.

Page washes use the app's `blue-50 → purple-50 → pink-50` (`#EFF6FF → #FAF5FF → #FDF2F8`).
Cards are white with a `gray-200` hairline and a soft shadow.

Two surfaces stay dark on purpose, and the light-on-dark text inside them is correct: the
call-to-action footer gradient (white text on `600` weights scores 5.25 / 5.54 / 4.54, all
clearing AA) and the syntax-highlighted code blocks.

For reference, the retired indigo `#667eea` scored 3.66:1 on white — it was already failing AA
for body text wherever it was used as a link or label colour. `blue-600` at 5.25:1 fixes that.

## Which file to use

| File | Aspect | Fill | Use for |
| --- | --- | --- | --- |
| `daon-mark-gradient-square.svg` | 1:1 | gradient | Default. `<img src>`, favicons, anything square. This is what ships as `logo.svg`. |
| `daon-mark-gradient.svg` | 816:1014 | gradient | Portrait lockups where the artwork should sit tight to its own bounds. |
| `daon-mark-square.svg` | 1:1 | `currentColor` | Inline SVG in React, where the mark should inherit text colour. |
| `daon-mark.svg` | 816:1014 | `currentColor` | Inline, portrait. |

**`currentColor` only works when the SVG is inlined.** Referencing these through `<img src>` or
`background-image` gives you black, because the file has no colour of its own. All current
consumers use `<img src="/logo.svg">`, which is why the gradient variant is the one installed.

**The gradient files declare `id="daonMarkGradient"`.** Inlining a gradient variant more than once
on a page produces duplicate IDs and the second instance may pick up the first one's gradient.
For repeated inline use, take a `currentColor` variant instead.

## Print

`print/` holds 300 DPI PNGs with transparent backgrounds and a `pHYs` chunk, so print software
places them at their true physical size rather than assuming 72 DPI.

| Variant | Pixels | Physical @300 DPI |
| --- | --- | --- |
| `*-portrait@300dpi.png` | 3400 × 4225 | 11.33 in × 14.08 in |
| `*-square@300dpi.png` | 4225 × 4225 | 14.08 in × 14.08 in |

Available in `gradient`, `black`, and `white`.

For professional print, prefer sending the **SVG** — it is resolution independent, and a print
shop needing CMYK can separate from vector without the quality loss of converting an sRGB raster.
The PNGs are for cases where vector is not accepted.

## Icons

Icons are [lucide](https://lucide.dev) (ISC), self-hosted. Nothing is fetched from a CDN, so
no third party sees who reads the docs.

`scripts/build-icon-sprite.mjs` generates every consumer from `lucide-react` -- the same
package the frontend imports -- so the icons on the docs site, in the browser extension and in
the WordPress plugin cannot drift from the ones React renders. Run it after changing the
`ICONS` map at the top of that script:

```
node scripts/build-icon-sprite.mjs
```

| Surface | Mechanism | Generated file |
| --- | --- | --- |
| Frontend (React) | `import { Shield } from 'lucide-react'` | -- |
| Docs site | sprite, inlined via `{% raw %}{% include icons.svg %}{% endraw %}` | `docs/_includes/icons.svg` |
| Browser extension | `daonIcon()` / `daonIconMarkup()` | `browser-extension/icons.js` |
| WordPress plugin | inline `<svg>` pasted into PHP | `brand/icons/*.svg` |
| Transactional email | **none -- see below** | -- |

Icons take their colour from `currentColor` and are sized in `em`, so they track whatever text
they sit beside. The docs stylesheet carries a matching `.icon` rule.

### Why email has no icons

Gmail and Outlook strip both `<svg>` and `@font-face`. An icon font or inline SVG in a
transactional email renders as nothing at all, which is worse than the emoji it replaced. The
templates in `api-server/src/utils/email.ts` therefore dropped their decorative emoji without
substituting anything -- the headings carry themselves. If an email ever genuinely needs an
icon, the only reliable mechanism is a hosted PNG, and it must survive being blocked, because
most clients suppress remote images by default.

The same constraint applies to a few browser-extension call sites: `chrome.contextMenus` titles,
`chrome.notifications` bodies, `confirm()` and `alert()` are plain-text APIs that cannot hold
markup. Those dropped their emoji too. The notification already passes `iconUrl: icons/icon48.png`,
which is the supported way to put an icon there.

### A note on the sprite

Stroke attributes live on each `<symbol>`, not on the sprite's root `<svg>`. The root is not an
ancestor of a symbol in the rendered tree, so a `<use>` elsewhere on the page inherits nothing
from it -- put them on the root and every icon renders as a solid black blob that disappears
against a dark background.

## Known limitation: small sizes

Below roughly 32 px the ridge gaps and circuit traces collapse into a solid blob. `icon16.png` and
`icon32.png` exist because `browser-extension/manifest.json` requires them, but they are scaled
down from the full mark and read poorly.

A proper favicon needs a **redrawn** simplification — fewer ridges, thicker strokes, dropped
circuit detail — not a scale-down. That is illustration work, not something derivable from this
path data.

## Regenerating

The PNGs were rasterised from the SVGs through a headless browser canvas at the target pixel size,
with the `pHYs` density chunk injected afterwards. Any renderer that preserves the alpha channel
works; if you re-export, check that the result is PNG colour type 6 (RGBA) and that the DPI tag
survived (`sips -g dpiWidth file.png`).

## Provenance of the source file

The mark arrived as an SVG export carrying two defects, both repaired here:

1. **No `viewBox`.** Dimensions were given as `11.333in × 14.083in` while path coordinates were in
   points, so the file could not be scaled — consumers cropped it instead. Now `viewBox="0 0 816 1014"`.
2. **Broken decimal carry in 261 coordinates.** The exporter rounded fractions to `1000` and emitted
   `331.1000` where it meant `332.000`. Repaired by carrying into the integer part.

Coordinates were then rounded to one decimal place, which is well below the visible threshold at
this scale; a pixel diff against the repaired path differs by 0.078%, entirely antialiasing.
