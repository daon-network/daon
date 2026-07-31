<?php
/**
 * Tests for JSON-LD structured data injected into wp_head.
 *
 * @package DAON_Creator_Protection
 */

class Test_Structured_Data extends \PHPUnit\Framework\TestCase {

    /** @var DAON_Creator_Protection */
    private $plugin;

    /** @var Mock_WPDB */
    private $wpdb;

    protected function setUp(): void {
        WP_Mock_Registry::reset();

        WP_Mock_Registry::$options = array(
            'daon_auto_protect'          => '1',
            'daon_api_url'               => 'https://api.daon.network',
            'daon_default_license'       => 'liberation_v1',
            'daon_protect_post_types'    => array('post', 'page'),
            'daon_minimum_word_count'    => '100',
            'daon_show_protection_notice' => '1',
        );

        $this->wpdb = new Mock_WPDB();
        $GLOBALS['wpdb'] = $this->wpdb;

        require_once DAON_PLUGIN_PATH . 'includes/class-daon-client.php';
        require_once DAON_PLUGIN_PATH . 'daon-creator-protection.php';

        $this->plugin = DAON_Creator_Protection::get_instance();
    }

    protected function tearDown(): void {
        unset($GLOBALS['wpdb']);
        unset($GLOBALS['post']);
    }

    private function make_protection($overrides = array()): object {
        return (object) array_merge(array(
            'id'               => 1,
            'post_id'          => 42,
            'content_hash'     => 'sha256:abc123def456',
            'tx_hash'          => '0xdeadbeef',
            'verification_url' => 'https://daon.network/verify/abc123',
            'blockchain_url'   => 'https://explorer.daon.network/tx/0xdeadbeef',
            'license'          => 'liberation_v1',
            'protected_at'     => '2026-05-01 10:00:00',
            'verified_at'      => '2026-05-01 10:00:05',
            'status'           => 'verified',
            'error_message'    => null,
        ), $overrides);
    }

    private function capture_structured_data(): string {
        ob_start();
        $this->plugin->add_structured_data();
        return ob_get_clean();
    }

    // ── Not output in wrong contexts ──

    public function test_no_output_on_archive(): void {
        WP_Mock_Registry::$is_single = false;
        WP_Mock_Registry::$is_page = false;

        $output = $this->capture_structured_data();

        $this->assertEmpty($output);
    }

    public function test_no_output_for_unprotected_post(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $output = $this->capture_structured_data();

        $this->assertEmpty($output);
    }

    // ── Valid JSON-LD output ──

    public function test_outputs_valid_json_ld_script_tag(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $protection = $this->make_protection();
        $this->wpdb->set_query_result('post_id', $protection);

        $output = $this->capture_structured_data();

        $this->assertStringContainsString('<script type="application/ld+json">', $output);
        $this->assertStringContainsString('</script>', $output);
    }

    public function test_json_ld_is_valid_json(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $protection = $this->make_protection();
        $this->wpdb->set_query_result('post_id', $protection);

        $output = $this->capture_structured_data();

        // Extract JSON from script tag
        preg_match('/<script type="application\/ld\+json">(.*?)<\/script>/s', $output, $matches);
        $this->assertNotEmpty($matches[1]);

        $data = json_decode($matches[1], true);
        $this->assertNotNull($data, 'JSON-LD should be valid JSON');
    }

    public function test_json_ld_schema_context(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $this->wpdb->set_query_result('post_id', $this->make_protection());

        $data = $this->extract_json_ld();

        $this->assertSame('https://schema.org', $data['@context']);
        $this->assertSame('CreativeWork', $data['@type']);
    }

    public function test_json_ld_contains_author(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $this->wpdb->set_query_result('post_id', $this->make_protection());

        $data = $this->extract_json_ld();

        $this->assertSame('Person', $data['author']['@type']);
        $this->assertSame('Test Author', $data['author']['name']);
    }

    public function test_json_ld_contains_content_hash_identifier(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $protection = $this->make_protection(array('content_hash' => 'sha256:specific_hash'));
        $this->wpdb->set_query_result('post_id', $protection);

        $data = $this->extract_json_ld();

        $this->assertSame('PropertyValue', $data['identifier']['@type']);
        $this->assertSame('DAON Content Hash', $data['identifier']['propertyID']);
        $this->assertSame('sha256:specific_hash', $data['identifier']['value']);
    }

    public function test_json_ld_contains_license(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $protection = $this->make_protection(array('license' => 'cc_by_nc'));
        $this->wpdb->set_query_result('post_id', $protection);

        $data = $this->extract_json_ld();

        $this->assertSame('cc_by_nc', $data['license']);
    }

    public function test_json_ld_contains_copyright_holder(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $this->wpdb->set_query_result('post_id', $this->make_protection());

        $data = $this->extract_json_ld();

        $this->assertSame('Person', $data['copyrightHolder']['@type']);
        $this->assertSame('Test Author', $data['copyrightHolder']['name']);
    }

    public function test_json_ld_contains_dates(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $this->wpdb->set_query_result('post_id', $this->make_protection());

        $data = $this->extract_json_ld();

        $this->assertArrayHasKey('datePublished', $data);
        $this->assertArrayHasKey('dateModified', $data);
    }

    public function test_json_ld_contains_url(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $this->wpdb->set_query_result('post_id', $this->make_protection());

        $data = $this->extract_json_ld();

        $this->assertSame('https://example.com/?p=42', $data['url']);
    }

    // ── Verification URL / mainEntity ──

    public function test_json_ld_includes_main_entity_when_verification_url_present(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $protection = $this->make_protection(array(
            'verification_url' => 'https://daon.network/verify/xyz',
        ));
        $this->wpdb->set_query_result('post_id', $protection);

        $data = $this->extract_json_ld();

        $this->assertArrayHasKey('mainEntity', $data);
        $this->assertSame('DigitalDocument', $data['mainEntity']['@type']);
        $this->assertSame('https://daon.network/verify/xyz', $data['mainEntity']['url']);
        $this->assertSame('DAON Blockchain Verification', $data['mainEntity']['name']);
    }

    public function test_json_ld_omits_main_entity_without_verification_url(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $protection = $this->make_protection(array('verification_url' => null));
        $this->wpdb->set_query_result('post_id', $protection);

        $data = $this->extract_json_ld();

        $this->assertArrayNotHasKey('mainEntity', $data);
    }

    // ── Page context ──

    public function test_json_ld_output_on_page(): void {
        WP_Mock_Registry::$is_single = false;
        WP_Mock_Registry::$is_page = true;

        $GLOBALS['post'] = (object) array('ID' => 99, 'post_author' => 1);

        $this->wpdb->set_query_result('post_id', $this->make_protection(array('post_id' => 99)));

        $data = $this->extract_json_ld();

        $this->assertSame('CreativeWork', $data['@type']);
    }

    // ── No slashes in URLs (JSON_UNESCAPED_SLASHES) ──

    public function test_json_ld_urls_not_escaped(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42, 'post_author' => 1);

        $this->wpdb->set_query_result('post_id', $this->make_protection());

        $output = $this->capture_structured_data();

        // Should use unescaped slashes, not \/
        $this->assertStringNotContainsString('\/', $output);
        $this->assertStringContainsString('https://example.com', $output);
    }

    // ── Helper ──

    private function extract_json_ld(): array {
        $output = $this->capture_structured_data();
        preg_match('/<script type="application\/ld\+json">(.*?)<\/script>/s', $output, $matches);
        $this->assertNotEmpty($matches, 'JSON-LD script tag not found in output');
        $data = json_decode($matches[1], true);
        $this->assertNotNull($data, 'JSON-LD is not valid JSON');
        return $data;
    }
}
