/**
 * What gets hashed when content is registered.
 *
 * The contract these protect: the words are hashed, the markup is not, and
 * whitespace the creator wrote survives untouched.
 */
import {
  toPlainText,
  EmptyAfterStrippingError,
  EMPTY_SHA256,
} from '../utils/content-canonical.js';

describe('toPlainText', () => {
  describe('leaves plain text alone', () => {
    it('returns prose byte-identical', () => {
      const prose = 'It was the best of times, it was the worst of times.';
      expect(toPlainText(prose)).toEqual({ text: prose, stripped: false });
    });

    // The reason registrations made before stripping existed still verify.
    it('does not alter content that has no markup', () => {
      const original = 'Line one\n\n\n\nLine two   with   spacing\n\tand a tab\n';
      const { text, stripped } = toPlainText(original);
      expect(stripped).toBe(false);
      expect(text).toBe(original);
    });

    // Prose containing < and > is not markup, and treating it as such would
    // change a hash the creator never asked to change.
    it('does not mistake comparisons for tags', () => {
      const maths = 'if a < b and c > d then the set is 3 < x > 1';
      expect(toPlainText(maths).stripped).toBe(false);
    });
  });

  describe('strips markup', () => {
    it('removes tags but keeps the words', () => {
      const { text, stripped } = toPlainText('<p>Hello <em>world</em></p>');
      expect(stripped).toBe(true);
      expect(text).toBe('Hello world');
    });

    it('keeps paragraphs apart rather than running them together', () => {
      const { text } = toPlainText('<p>First</p><p>Second</p>');
      expect(text).toBe('First\n\nSecond');
      expect(text).not.toContain('FirstSecond');
    });

    it('turns line breaks into newlines', () => {
      expect(toPlainText('one<br>two<br/>three').text).toBe('one\ntwo\nthree');
    });

    it('drops script and style contents entirely', () => {
      const { text } = toPlainText(
        '<p>Real words</p><script>alert("x")</script><style>p{color:red}</style>'
      );
      expect(text).toBe('Real words');
      expect(text).not.toContain('alert');
      expect(text).not.toContain('color');
    });

    it('drops comments, which no reader ever saw', () => {
      expect(toPlainText('<p>Visible<!-- hidden note --></p>').text).toBe('Visible');
    });

    it('decodes the predefined entities', () => {
      const { text } = toPlainText('<p>Tom &amp; Jerry &lt;3 &quot;quotes&quot;</p>');
      expect(text).toBe('Tom & Jerry <3 "quotes"');
    });

    it('decodes numeric entities', () => {
      expect(toPlainText('<p>caf&#233; and &#x2014; dash</p>').text).toBe('café and — dash');
    });

    // The HTML entity table is a moving target; an unknown name in a manuscript
    // is text, not something to guess at.
    it('leaves unknown entities as written', () => {
      expect(toPlainText('<p>&notarealentity; stays</p>').text).toBe('&notarealentity; stays');
    });

    it('does not emit unpaired surrogates', () => {
      const { text } = toPlainText('<p>&#xD800;</p>');
      expect(text).toBe('&#xD800;');
    });
  });

  describe('does not collapse whitespace', () => {
    // Spacing is content in poetry, concrete verse and code samples.
    // Collapsing it would make different works hash identically.
    it('preserves indentation inside markup', () => {
      const { text } = toPlainText('<pre>    indented\n        further</pre>');
      expect(text).toContain('    indented');
      expect(text).toContain('        further');
    });

    it('preserves runs of spaces the creator wrote', () => {
      const { text } = toPlainText('<p>word     word</p>');
      expect(text).toBe('word     word');
    });

    it('preserves single and double newlines', () => {
      const { text } = toPlainText('<div>a\nb\n\nc</div>');
      expect(text).toContain('a\nb\n\nc');
    });
  });

  describe('the reason this exists', () => {
    // The same paragraph through WordPress and through the API must produce one
    // hash. Before stripping, these were two different registrations.
    it('gives the same text for the same words in different markup', () => {
      const fromWordpress =
        '<!-- wp:paragraph --><p class="has-text-align-left">The same words.</p><!-- /wp:paragraph -->';
      const fromEditor = '<div><span style="font-weight:400">The same words.</span></div>';
      const typed = 'The same words.';

      expect(toPlainText(fromWordpress).text).toBe(typed);
      expect(toPlainText(fromEditor).text).toBe(typed);
    });

    // A theme change or block-editor upgrade rewrites attributes. The words did
    // not change, so the hash must not either.
    it('is unaffected by attribute churn', () => {
      const before = '<p class="entry" data-block="a1">Unchanged prose</p>';
      const after = '<p class="entry wp-block-paragraph" data-block="b2" dir="ltr">Unchanged prose</p>';
      expect(toPlainText(before).text).toBe(toPlainText(after).text);
    });
  });

  it('rejects non-strings rather than hashing "[object Object]"', () => {
    expect(() => toPlainText({} as unknown as string)).toThrow(TypeError);
  });
});

describe('line endings', () => {
  // A line ending is whatever the author's editor emitted. Nobody chooses CRLF,
  // so the same text from Windows and from a Mac must hash the same -- unlike
  // spacing within a line, which is authorial and is left alone.
  it('normalises CRLF and CR to LF', () => {
    const lf = 'first line\nsecond line';
    expect(toPlainText('first line\r\nsecond line').text).toBe(lf);
    expect(toPlainText('first line\rsecond line').text).toBe(lf);
  });

  it('gives one result for mixed endings', () => {
    const mixed = 'a\r\nb\rc\nd';
    expect(toPlainText(mixed).text).toBe('a\nb\nc\nd');
  });

  it('normalises endings even with no markup present', () => {
    const { text, stripped } = toPlainText('plain\r\ntext');
    expect(stripped).toBe(false);
    expect(text).toBe('plain\ntext');
  });

  it('still leaves intra-line spacing alone', () => {
    expect(toPlainText('a    b\r\n    indented').text).toBe('a    b\n    indented');
  });
});

describe('content that vanishes under stripping', () => {
  // The bug this closes: an image-only document strips to "" and hashes to
  // e3b0c442… — the SHA-256 of nothing. Every such work collided, the first
  // registration made the rest return "already protected", and the one that
  // succeeded committed to an empty document.
  it('refuses image-only content instead of hashing nothing', () => {
    expect(() => toPlainText('<img src="cliffs.jpg" alt="">')).toThrow(
      EmptyAfterStrippingError
    );
  });

  it('refuses a scanned page', () => {
    expect(() => toPlainText('<figure><img src="page001.tiff"></figure>')).toThrow(
      EmptyAfterStrippingError
    );
  });

  it('refuses markup carrying no text at all', () => {
    expect(() => toPlainText('<div><span></span><br><hr></div>')).toThrow(
      EmptyAfterStrippingError
    );
  });

  it('refuses a document whose only content is a script', () => {
    expect(() => toPlainText('<script>const a = 1;</script>')).toThrow(
      EmptyAfterStrippingError
    );
  });

  // Distinctness is the point: three different works must not share a hash.
  it('would otherwise have collided them', () => {
    const works = [
      '<img src="cliffs.jpg">',
      '<img src="portrait-of-my-mother.jpg">',
      '<figure><img src="page001.tiff"></figure>',
    ];
    for (const w of works) {
      expect(() => toPlainText(w)).toThrow(EmptyAfterStrippingError);
    }
  });

  it('still accepts an illustrated page that has a caption', () => {
    const { text } = toPlainText('<img src="plate1.png"><p>Plate I</p>');
    expect(text).toBe('Plate I');
  });

  // Plain text is never routed through stripping, so whitespace-only input is
  // returned unchanged rather than refused. It hashes distinctly from empty.
  it('leaves whitespace-only plain text alone', () => {
    const { text, stripped } = toPlainText('   ');
    expect(stripped).toBe(false);
    expect(text).toBe('   ');
  });
});

describe('the empty hash is never registrable', () => {
  // Belt and braces: toPlainText refuses these inputs, and the hash they would
  // have produced is refused independently at the point of hashing.
  it('names the value so it can be checked at the hash site', () => {
    const { createHash } = require('node:crypto');
    expect(createHash('sha256').update('', 'utf8').digest('hex')).toBe(EMPTY_SHA256);
  });
});
