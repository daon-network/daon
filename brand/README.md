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
gradients. The previous teal mark (`#5DD5D5 → #3FB8AF → #173F5F`) was not used anywhere in the
application and has been retired.

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
