/**
 * What DAON hashes when it registers content.
 *
 * The rule, from `docs/design/document-formats.md`: **register the words, not
 * the markup they arrived in.** A creator who publishes the same paragraph
 * through WordPress, a browser extension and the API should get one hash, and
 * they will not if one of those sends `<p>` tags and another does not.
 *
 * Hashing HTML also makes the hash depend on things the creator never chose —
 * a theme change, a block editor upgrade, a plugin that rewrites attributes —
 * so a registration silently stops matching its own content.
 *
 * # Deliberately minimal
 *
 * Tags are removed, entities decoded, and line endings normalised to LF.
 * **Intra-line whitespace is not touched.**
 *
 * The line between those two is deliberate. A line ending is a platform artifact
 * — nobody chooses CRLF, it is whatever their editor emitted — so the same text
 * typed on Windows and on a Mac must hash the same. Spacing *within* a line is
 * authorial: it is the shape of a poem, the indentation of a code sample, the
 * layout of concrete verse. Collapsing it would make genuinely different works
 * hash identically, and for output used in disputes a false match is far worse
 * than a missed one.
 *
 * # Effect on existing registrations
 *
 * Plain-text input with LF endings is returned **byte-identical**, so most
 * existing registrations are unaffected.
 *
 * Two groups do change, both deliberately. Content registered as HTML now hashes
 * to its words, which is the point. And plain text containing CRLF now hashes as
 * LF — worth checking against the existing table before this ships, because
 * those registrations were made against the raw bytes.
 */

/**
 * Thrown when stripping leaves nothing to hash.
 *
 * Not an edge case to tolerate: an image-only document, a scanned page, a
 * figure with no caption all reduce to the empty string, and hashing that
 * gives every one of them `e3b0c442…` — the SHA-256 of nothing. They would
 * collide with each other, the first registration would make the rest return
 * "already protected", and the one that succeeded would commit to no content
 * whatsoever.
 *
 * Refusing is the only honest answer. Content that vanishes under text
 * extraction is not text, and the text pipeline cannot make a claim about it.
 */
export class EmptyAfterStrippingError extends Error {
  constructor() {
    super(
      'this content contains no text once markup is removed. ' +
        'Images and scanned pages cannot be registered through the text path — ' +
        'hashing them here would commit to an empty document.'
    );
    this.name = 'EmptyAfterStrippingError';
  }
}

/**
 * SHA-256 of the empty string.
 *
 * Never a legitimate registration. Any path producing it has hashed nothing —
 * and because every such input produces *this* value, they would all collide
 * into a single meaningless record. Checked as a backstop at the point of
 * hashing, so a future code path that skips canonicalisation still cannot
 * register it.
 */
export const EMPTY_SHA256 =
  'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

/** Content as submitted, and what was actually hashed. */
export interface CanonicalContent {
  /** The exact text the hash commits to. */
  text: string;
  /** Whether markup was removed to produce it. */
  stripped: boolean;
}

/**
 * Does this look like markup rather than prose that merely contains `<`?
 *
 * Requires a plausible tag name after `<`, so `a < b and c > d` is left alone.
 * Being conservative matters more than being thorough here: wrongly stripping
 * changes a hash the creator did not expect to change, while wrongly keeping
 * markup produces a hash that is merely no better than today's.
 */
function looksLikeMarkup(content: string): boolean {
  return /<\/?[a-zA-Z][a-zA-Z0-9-]*(\s[^<>]*)?\/?>/.test(content);
}

/** The five XML predefined entities, plus the numeric forms. */
function decodeEntities(text: string): string {
  return text
    .replace(/&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
      if (body.startsWith('#')) {
        const code = body[1] === 'x' || body[1] === 'X'
          ? parseInt(body.slice(2), 16)
          : parseInt(body.slice(1), 10);
        // Reject anything outside Unicode, and surrogates, which would produce
        // an unpaired code unit and a string that cannot round-trip.
        if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return match;
        if (code >= 0xd800 && code <= 0xdfff) return match;
        return String.fromCodePoint(code);
      }
      const named: Record<string, string> = {
        amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
      };
      // An unknown entity is left exactly as written rather than guessed at:
      // "&foo;" in a manuscript is text, and the full HTML entity table is a
      // moving target we should not be tracking.
      return Object.prototype.hasOwnProperty.call(named, body) ? named[body] : match;
    });
}

/**
 * Reduce submitted content to the text that will be hashed.
 *
 * Block-level tags become newlines so paragraphs do not run together — hashing
 * `onetwo` where the creator wrote two paragraphs would be its own kind of
 * wrong. Everything else is removed without substitution.
 */
export function toPlainText(content: string): CanonicalContent {
  if (typeof content !== 'string') {
    throw new TypeError('content must be a string');
  }
  // A line ending is not an authorial choice, so it is normalised even when
  // there is no markup at all.
  const normalisedEndings = content.replace(/\r\n?/g, '\n');

  if (!looksLikeMarkup(normalisedEndings)) {
    return { text: normalisedEndings, stripped: false };
  }

  let text = normalisedEndings;

  // Script and style carry code, not prose. Their contents go with them.
  text = text.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
  // Comments are invisible to a reader and must not reach the hash.
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Block boundaries become newlines, so the text reads the way the page did.
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(
    /<\/?(p|div|section|article|h[1-6]|li|tr|blockquote|pre|figcaption|header|footer|main|aside|ul|ol|table|hr)\b[^>]*>/gi,
    '\n'
  );

  text = text.replace(/<[^>]*>/g, '');
  text = decodeEntities(text);

  // Tag removal can leave runs of blank lines where markup used to be. Only
  // sequences created by that removal are reduced -- three or more newlines
  // become two, which is the most a reader would ever perceive -- and single
  // and double newlines the creator wrote are left exactly alone.
  text = text.replace(/\n{3,}/g, '\n\n');

  // Trim whitespace-only lines at each end -- the newlines tag removal
  // introduced -- and nothing else. A plain `.trim()` would eat the leading
  // indentation of a `<pre>` block, which is exactly the content this is
  // supposed to protect.
  text = text.replace(/^(?:[ \t]*\n)+/, '').replace(/(?:\n[ \t]*)+$/, '');

  // Something was submitted and nothing survived. See EmptyAfterStrippingError:
  // silently hashing the empty string here would collide every image-only
  // document into one meaningless registration.
  if (text.trim() === '') {
    throw new EmptyAfterStrippingError();
  }

  return { text, stripped: true };
}
