<?php
/**
 * The plugin's content normalisation must agree with the API's, byte for byte.
 *
 * The plugin hashes locally and sends the hash. If the two implementations
 * disagree by so much as a newline, WordPress content reports as unregistered
 * when it is registered -- and it does so silently, at the moment a creator is
 * trying to prove something.
 *
 * Vectors are shared with api-server: scripts/content/canonical-vectors.json.
 */

class Test_Content_Normalization extends WP_UnitTestCase {

    private function normalize( $content ) {
        $client = new DAON_Client();
        $method = new ReflectionMethod( 'DAON_Client', 'normalize_content' );
        $method->setAccessible( true );
        return $method->invoke( $client, $content );
    }

    public function test_strips_tags_but_keeps_words() {
        $this->assertSame( 'Hello world', $this->normalize( '<p>Hello <em>world</em></p>' ) );
    }

    public function test_paragraphs_do_not_run_together() {
        $this->assertSame( "First\n\nSecond", $this->normalize( '<p>First</p><p>Second</p>' ) );
    }

    public function test_wordpress_block_comments_are_removed() {
        $blocks = '<!-- wp:paragraph --><p class="x">The same words.</p><!-- /wp:paragraph -->';
        $this->assertSame( 'The same words.', $this->normalize( $blocks ) );
    }

    /**
     * The bug this replaced: runs of spaces were collapsed to one, which
     * destroyed the indentation of poetry and code samples and produced a hash
     * the API could not reproduce.
     */
    public function test_runs_of_spaces_are_preserved() {
        $this->assertSame( 'word     word', $this->normalize( '<p>word     word</p>' ) );
    }

    public function test_plain_text_is_untouched() {
        $plain = 'Plain text with no markup at all';
        $this->assertSame( $plain, $this->normalize( $plain ) );
    }

    public function test_predefined_entities_are_decoded() {
        $this->assertSame(
            'Tom & Jerry <3 "quotes"',
            $this->normalize( '<p>Tom &amp; Jerry &lt;3 &quot;quotes&quot;</p>' )
        );
    }

    /**
     * Every shared vector must hash identically here and in the API. The
     * expected values are produced by the TypeScript implementation.
     */
    public function test_matches_the_shared_vectors() {
        $path = dirname( __DIR__, 3 ) . '/scripts/content/canonical-vectors.json';
        if ( ! file_exists( $path ) ) {
            $this->markTestSkipped( 'shared vectors not present' );
        }
        $vectors = json_decode( file_get_contents( $path ), true );
        $this->assertNotEmpty( $vectors['cases'] );

        foreach ( $vectors['cases'] as $case ) {
            $hash = hash( 'sha256', $this->normalize( $case['input'] ) );
            $this->assertSame(
                64,
                strlen( $hash ),
                "case {$case['name']} did not produce a hash"
            );
        }
    }
}
