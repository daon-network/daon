<?php
/**
 * Tests for content hashing and normalization.
 *
 * These tests exercise pure logic (SHA-256 + normalization) and should
 * never hit the network.  They are the most important tests in the suite
 * because a hashing change means every previously-registered piece of
 * content can no longer be verified.
 *
 * @package DAON_Creator_Protection
 */

class Test_Content_Hashing extends \PHPUnit\Framework\TestCase {

    /** @var DAON_Client */
    private $client;

    protected function setUp(): void {
        WP_Mock_Registry::reset();
        WP_Mock_Registry::$options['daon_api_url'] = 'https://api.daon.network';

        require_once DAON_PLUGIN_PATH . 'includes/class-daon-client.php';
        $this->client = new DAON_Client();
    }

    // ── Format ──

    public function test_hash_has_sha256_prefix(): void {
        $hash = $this->client->generate_content_hash('hello world');
        $this->assertStringStartsWith('sha256:', $hash);
    }

    public function test_hash_hex_portion_is_64_characters(): void {
        $hash = $this->client->generate_content_hash('hello world');
        $hex = substr($hash, 7); // strip "sha256:"
        $this->assertSame(64, strlen($hex));
        $this->assertMatchesRegularExpression('/^[0-9a-f]{64}$/', $hex);
    }

    // ── Determinism ──

    public function test_same_content_produces_same_hash(): void {
        $a = $this->client->generate_content_hash('The quick brown fox jumps over the lazy dog.');
        $b = $this->client->generate_content_hash('The quick brown fox jumps over the lazy dog.');
        $this->assertSame($a, $b);
    }

    public function test_different_content_produces_different_hash(): void {
        $a = $this->client->generate_content_hash('Content A');
        $b = $this->client->generate_content_hash('Content B');
        $this->assertNotSame($a, $b);
    }

    // ── HTML stripping ──

    public function test_html_tags_are_stripped(): void {
        $plain = $this->client->generate_content_hash('Hello World');
        $html  = $this->client->generate_content_hash('<p>Hello World</p>');
        $this->assertSame($plain, $html);
    }

    public function test_nested_html_with_attributes_stripped(): void {
        $plain = $this->client->generate_content_hash('Click here to read more');
        $html  = $this->client->generate_content_hash(
            '<div class="wrapper"><a href="https://example.com" target="_blank">Click here</a> to <strong>read</strong> more</div>'
        );
        $this->assertSame($plain, $html);
    }

    public function test_script_and_style_tags_removed(): void {
        $plain = $this->client->generate_content_hash('Hello');
        $dirty = $this->client->generate_content_hash(
            '<style>.foo{color:red}</style>Hello<script>alert("xss")</script>'
        );
        $this->assertSame($plain, $dirty);
    }

    // ── Whitespace is authorial and is preserved ──
    //
    // These assertions were inverted deliberately. The normaliser used to
    // collapse runs of spaces and tabs, which meant a poem and the same poem
    // with its indentation removed hashed identically -- and produced a hash the
    // API could not reproduce, since the API preserves them.
    // See docs/design/document-formats.md.

    public function test_multiple_spaces_are_significant(): void {
        $a = $this->client->generate_content_hash('hello world');
        $b = $this->client->generate_content_hash('hello     world');
        $this->assertNotSame($a, $b, 'spacing within a line is content');
    }

    public function test_tabs_are_significant(): void {
        $a = $this->client->generate_content_hash('hello world');
        $b = $this->client->generate_content_hash("hello\t\tworld");
        $this->assertNotSame($a, $b);
    }

    public function test_indentation_survives(): void {
        $poem = "    first line\n        second line";
        $this->assertSame(
            hash('sha256', $poem),
            substr($this->client->generate_content_hash($poem), 7),
            'indentation must reach the hash unchanged'
        );
    }

    // ── Line ending normalization ──

    public function test_crlf_normalized_to_lf(): void {
        $lf   = $this->client->generate_content_hash("line1\nline2");
        $crlf = $this->client->generate_content_hash("line1\r\nline2");
        $this->assertSame($lf, $crlf);
    }

    public function test_cr_normalized_to_lf(): void {
        $lf = $this->client->generate_content_hash("line1\nline2");
        $cr = $this->client->generate_content_hash("line1\rline2");
        $this->assertSame($lf, $cr);
    }

    public function test_excessive_blank_lines_collapsed(): void {
        $a = $this->client->generate_content_hash("paragraph1\n\nparagraph2");
        $b = $this->client->generate_content_hash("paragraph1\n\n\n\n\nparagraph2");
        $this->assertSame($a, $b);
    }

    public function test_mixed_line_endings_all_produce_same_hash(): void {
        $content_lf   = "line1\nline2\nline3";
        $content_crlf = "line1\r\nline2\r\nline3";
        $content_cr   = "line1\rline2\rline3";
        $content_mix  = "line1\r\nline2\rline3\nline4";

        $hash_lf   = $this->client->generate_content_hash($content_lf);
        $hash_crlf = $this->client->generate_content_hash($content_crlf);
        $hash_cr   = $this->client->generate_content_hash($content_cr);

        $this->assertSame($hash_lf, $hash_crlf);
        $this->assertSame($hash_lf, $hash_cr);
    }

    // ── Edge cases ──

    public function test_empty_string(): void {
        $hash = $this->client->generate_content_hash('');
        $this->assertStringStartsWith('sha256:', $hash);
        // SHA-256 of empty string is well-known
        $this->assertSame(
            'sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
            $hash
        );
    }

    public function test_whitespace_only_content_is_not_emptied(): void {
        // Only whitespace-only *lines* at the ends are removed, and a bare run
        // of spaces is not a line. Silently hashing "   " as "" would make every
        // such submission collide.
        $hash_ws    = $this->client->generate_content_hash('   ');
        $hash_empty = $this->client->generate_content_hash('');
        $this->assertNotSame($hash_empty, $hash_ws);
    }

    public function test_single_character(): void {
        $hash = $this->client->generate_content_hash('a');
        $this->assertStringStartsWith('sha256:', $hash);
        $this->assertSame(
            'sha256:ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb',
            $hash
        );
    }

    public function test_unicode_content(): void {
        // Unicode should hash identically regardless of runs
        $hash1 = $this->client->generate_content_hash('Cafe\u{0301}');
        $hash2 = $this->client->generate_content_hash('Cafe\u{0301}');
        $this->assertSame($hash1, $hash2);
    }

    public function test_emoji_content(): void {
        $content = 'I love coding! \xF0\x9F\x92\xBB Great article \xF0\x9F\x91\x8D';
        $hash1 = $this->client->generate_content_hash($content);
        $hash2 = $this->client->generate_content_hash($content);
        $this->assertSame($hash1, $hash2);
    }

    public function test_html_entities_are_decoded(): void {
        // Inverted deliberately. A reader of "Tom &amp; Jerry" sees "Tom &
        // Jerry" -- the entity encodes the text, it is not the text -- so
        // hashing the encoded form makes the hash depend on how the markup
        // happened to be written. The API decodes, and the two must agree or
        // WordPress content verifies as unregistered.
        $a = $this->client->generate_content_hash('Tom &amp; Jerry');
        $b = $this->client->generate_content_hash('Tom & Jerry');
        $this->assertSame($a, $b);
    }

    public function test_very_long_content(): void {
        // 100KB of text should hash without errors
        $content = str_repeat('Lorem ipsum dolor sit amet. ', 4000);
        $hash = $this->client->generate_content_hash($content);
        $this->assertStringStartsWith('sha256:', $hash);
        $this->assertSame(71, strlen($hash)); // "sha256:" (7) + 64 hex
    }

    public function test_content_with_only_html_tags_is_refused(): void {
        // Inverted deliberately. This previously asserted that markup-only
        // content hashes the same as the empty string -- which is the bug: every
        // image-only post, scanned page and empty div shared one hash, so the
        // first registration made the rest collide and the winner committed to
        // an empty document.
        $result = $this->client->generate_content_hash('<div><span></span></div>');
        $this->assertInstanceOf('WP_Error', $result);
    }

    public function test_wordpress_shortcodes_preserved(): void {
        // Shortcodes like [gallery] are not HTML tags, they survive stripping
        $a = $this->client->generate_content_hash('[gallery ids="1,2,3"]');
        $b = $this->client->generate_content_hash('[gallery ids="1,2,3"]');
        $this->assertSame($a, $b);

        $c = $this->client->generate_content_hash('gallery ids 1 2 3');
        $this->assertNotSame($a, $c); // Shortcode brackets matter
    }

    public function test_case_sensitivity_preserved(): void {
        $a = $this->client->generate_content_hash('Hello World');
        $b = $this->client->generate_content_hash('hello world');
        $this->assertNotSame($a, $b);
    }

    public function test_gutenberg_block_comments_stripped(): void {
        // WordPress Gutenberg block comments are HTML comments
        $plain = $this->client->generate_content_hash('Hello World');
        $gutenberg = $this->client->generate_content_hash(
            '<!-- wp:paragraph --><p>Hello World</p><!-- /wp:paragraph -->'
        );
        $this->assertSame($plain, $gutenberg);
    }
}
