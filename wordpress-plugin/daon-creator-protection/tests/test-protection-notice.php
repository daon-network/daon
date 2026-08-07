<?php
/**
 * Tests for the content filter that appends the DAON protection notice.
 *
 * @package DAON_Creator_Protection
 */

class Test_Protection_Notice extends \PHPUnit\Framework\TestCase {

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
            'content_hash'     => 'sha256:abc123',
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

    // ── Not shown in wrong contexts ──

    public function test_notice_not_added_on_archive_pages(): void {
        WP_Mock_Registry::$is_single = false;
        WP_Mock_Registry::$is_page = false;

        $content = '<p>Post content here.</p>';
        $result = $this->plugin->add_protection_notice($content);

        $this->assertSame($content, $result);
    }

    public function test_notice_not_added_when_disabled_in_settings(): void {
        WP_Mock_Registry::$is_single = true;
        WP_Mock_Registry::$options['daon_show_protection_notice'] = '';

        $content = '<p>Post content here.</p>';
        $result = $this->plugin->add_protection_notice($content);

        $this->assertSame($content, $result);
    }

    public function test_notice_not_added_when_disabled_with_zero(): void {
        WP_Mock_Registry::$is_single = true;
        WP_Mock_Registry::$options['daon_show_protection_notice'] = '0';

        $content = '<p>Post content here.</p>';
        $result = $this->plugin->add_protection_notice($content);

        $this->assertSame($content, $result);
    }

    public function test_notice_not_added_for_unprotected_post(): void {
        WP_Mock_Registry::$is_single = true;

        $GLOBALS['post'] = (object) array('ID' => 42);
        // No query result = no protection record
        $this->wpdb->set_query_result('nonexistent', null);

        $content = '<p>Post content here.</p>';
        $result = $this->plugin->add_protection_notice($content);

        $this->assertSame($content, $result);
    }

    public function test_notice_not_added_for_pending_protection(): void {
        WP_Mock_Registry::$is_single = true;

        $GLOBALS['post'] = (object) array('ID' => 42);
        // The query explicitly filters for status = 'verified', so a pending
        // record should not be returned by the mock
        // (no query result match = null)

        $content = '<p>Post content here.</p>';
        $result = $this->plugin->add_protection_notice($content);

        $this->assertSame($content, $result);
    }

    // ── Notice displayed correctly ──

    public function test_notice_appended_for_verified_post(): void {
        WP_Mock_Registry::$is_single = true;

        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection();
        $this->wpdb->set_query_result('post_id', $protection);

        $content = '<p>Post content here.</p>';
        $result = $this->plugin->add_protection_notice($content);

        $this->assertStringContainsString('<p>Post content here.</p>', $result);
        $this->assertStringContainsString('daon-protection-notice', $result);
    }

    public function test_notice_contains_protection_class(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection();
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        $this->assertStringContainsString('class="daon-protection-notice"', $result);
    }

    public function test_notice_contains_license_text(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection(array('license' => 'liberation_v1'));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        $this->assertStringContainsString('Liberation License v1.0', $result);
    }

    public function test_notice_contains_verification_link(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection(array(
            'verification_url' => 'https://daon.network/verify/test123',
        ));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        $this->assertStringContainsString('https://daon.network/verify/test123', $result);
        $this->assertStringContainsString('Verify on blockchain', $result);
    }

    public function test_notice_shows_liberation_license_explanation(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection(array('license' => 'liberation_v1'));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        $this->assertStringContainsString('daon-license-explanation', $result);
        $this->assertStringContainsString('corporate AI training', $result);
    }

    public function test_notice_omits_liberation_explanation_for_other_licenses(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection(array('license' => 'cc_by_nc'));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        $this->assertStringContainsString('Creative Commons BY-NC', $result);
        $this->assertStringNotContainsString('daon-license-explanation', $result);
    }

    public function test_notice_without_verification_url(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection(array('verification_url' => null));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        $this->assertStringContainsString('daon-protection-notice', $result);
        $this->assertStringNotContainsString('Verify on blockchain', $result);
    }

    public function test_notice_works_on_page_post_type(): void {
        WP_Mock_Registry::$is_single = false;
        WP_Mock_Registry::$is_page = true;

        $GLOBALS['post'] = (object) array('ID' => 99);

        $protection = $this->make_protection(array('post_id' => 99));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('page content');

        $this->assertStringContainsString('daon-protection-notice', $result);
    }

    // ── License text mapping ──

    /**
     * @dataProvider license_provider
     */
    public function test_license_text_mapping(string $license_key, string $expected_text): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection(array('license' => $license_key));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        $this->assertStringContainsString($expected_text, $result);
    }

    public function license_provider(): array {
        return array(
            'liberation'       => array('liberation_v1', 'Liberation License v1.0'),
            'cc_by_nc'         => array('cc_by_nc', 'Creative Commons BY-NC'),
            'cc_by_nc_sa'      => array('cc_by_nc_sa', 'Creative Commons BY-NC-SA'),
            'all_rights'       => array('all_rights_reserved', 'All Rights Reserved'),
        );
    }

    public function test_unknown_license_gets_formatted_fallback(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection(array('license' => 'custom_license_v2'));
        $this->wpdb->set_query_result('post_id', $protection);

        $result = $this->plugin->add_protection_notice('content');

        // The fallback uses ucfirst(str_replace('_', ' ', ...))
        $this->assertStringContainsString('Custom license v2', $result);
    }

    // ── Content integrity ──

    public function test_original_content_preserved_before_notice(): void {
        WP_Mock_Registry::$is_single = true;
        $GLOBALS['post'] = (object) array('ID' => 42);

        $protection = $this->make_protection();
        $this->wpdb->set_query_result('post_id', $protection);

        $original = '<p>This is <strong>important</strong> content with <a href="#">links</a>.</p>';
        $result = $this->plugin->add_protection_notice($original);

        // The original content should appear verbatim before the notice
        $this->assertStringStartsWith($original, $result);
    }
}
