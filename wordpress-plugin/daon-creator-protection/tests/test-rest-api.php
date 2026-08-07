<?php
/**
 * Tests for the REST API endpoint callbacks.
 *
 * These test the callback methods directly with mocked WP_REST_Request
 * objects and wpdb results, without needing a running REST server.
 *
 * @package DAON_Creator_Protection
 */

class Test_REST_API extends \PHPUnit\Framework\TestCase {

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

    // ── GET /daon/v1/verify/{id} ──

    public function test_verify_returns_protection_details(): void {
        $protection = $this->make_protection();
        $this->wpdb->set_query_result('post_id', $protection);

        $request = new WP_REST_Request('GET', '/daon/v1/verify/42');
        $request->set_param('id', 42);

        $result = $this->plugin->rest_verify_post($request);

        $this->assertIsArray($result);
        $this->assertTrue($result['verified']);
        $this->assertSame('sha256:abc123def456', $result['content_hash']);
        $this->assertSame('liberation_v1', $result['license']);
        $this->assertSame('2026-05-01 10:00:00', $result['protected_at']);
        $this->assertSame('https://daon.network/verify/abc123', $result['verification_url']);
        $this->assertSame('https://explorer.daon.network/tx/0xdeadbeef', $result['blockchain_url']);
    }

    public function test_verify_returns_error_for_unprotected_post(): void {
        // No protection record in DB
        $request = new WP_REST_Request('GET', '/daon/v1/verify/999');
        $request->set_param('id', 999);

        $result = $this->plugin->rest_verify_post($request);

        $this->assertInstanceOf(WP_Error::class, $result);
        $this->assertSame('not_protected', $result->get_error_code());
    }

    public function test_verify_error_has_404_status(): void {
        $request = new WP_REST_Request('GET', '/daon/v1/verify/999');
        $request->set_param('id', 999);

        $result = $this->plugin->rest_verify_post($request);

        $this->assertInstanceOf(WP_Error::class, $result);
        $data = $result->get_error_data();
        $this->assertSame(404, $data['status']);
    }

    public function test_verify_includes_all_expected_fields(): void {
        $protection = $this->make_protection();
        $this->wpdb->set_query_result('post_id', $protection);

        $request = new WP_REST_Request('GET', '/daon/v1/verify/42');
        $request->set_param('id', 42);

        $result = $this->plugin->rest_verify_post($request);

        $expected_keys = array(
            'verified',
            'content_hash',
            'license',
            'protected_at',
            'verification_url',
            'blockchain_url',
        );

        foreach ($expected_keys as $key) {
            $this->assertArrayHasKey($key, $result, "Missing key: {$key}");
        }
    }

    // ── GET /daon/v1/protected ──

    public function test_protected_posts_returns_formatted_list(): void {
        $protections = array(
            (object) array(
                'post_id'          => 42,
                'post_title'       => 'First Post',
                'post_date'        => '2026-05-01',
                'content_hash'     => 'sha256:aaa',
                'license'          => 'liberation_v1',
                'protected_at'     => '2026-05-01 10:00:00',
                'verification_url' => 'https://daon.network/verify/aaa',
            ),
            (object) array(
                'post_id'          => 43,
                'post_title'       => 'Second Post',
                'post_date'        => '2026-05-02',
                'content_hash'     => 'sha256:bbb',
                'license'          => 'cc_by_nc',
                'protected_at'     => '2026-05-02 10:00:00',
                'verification_url' => 'https://daon.network/verify/bbb',
            ),
        );

        $this->wpdb->set_query_result('daon_protections', $protections);

        $request = new WP_REST_Request('GET', '/daon/v1/protected');
        $result = $this->plugin->rest_get_protected_posts($request);

        $this->assertCount(2, $result);

        $this->assertSame(42, $result[0]['id']);
        $this->assertSame('First Post', $result[0]['title']);
        $this->assertSame('sha256:aaa', $result[0]['content_hash']);
        $this->assertSame('liberation_v1', $result[0]['license']);

        $this->assertSame(43, $result[1]['id']);
        $this->assertSame('cc_by_nc', $result[1]['license']);
    }

    public function test_protected_posts_includes_permalink(): void {
        $protections = array(
            (object) array(
                'post_id'          => 42,
                'post_title'       => 'Test',
                'post_date'        => '2026-05-01',
                'content_hash'     => 'sha256:aaa',
                'license'          => 'liberation_v1',
                'protected_at'     => '2026-05-01 10:00:00',
                'verification_url' => null,
            ),
        );

        $this->wpdb->set_query_result('daon_protections', $protections);

        $request = new WP_REST_Request('GET', '/daon/v1/protected');
        $result = $this->plugin->rest_get_protected_posts($request);

        $this->assertSame('https://example.com/?p=42', $result[0]['url']);
    }

    public function test_protected_posts_returns_empty_when_none(): void {
        // Default mock returns empty array for unmatched queries
        $request = new WP_REST_Request('GET', '/daon/v1/protected');
        $result = $this->plugin->rest_get_protected_posts($request);

        $this->assertIsArray($result);
        $this->assertEmpty($result);
    }

    public function test_protected_posts_response_shape(): void {
        $protections = array(
            (object) array(
                'post_id'          => 42,
                'post_title'       => 'Test Post',
                'post_date'        => '2026-05-01',
                'content_hash'     => 'sha256:hash',
                'license'          => 'liberation_v1',
                'protected_at'     => '2026-05-01 10:00:00',
                'verification_url' => 'https://daon.network/verify/hash',
            ),
        );

        $this->wpdb->set_query_result('daon_protections', $protections);

        $request = new WP_REST_Request('GET', '/daon/v1/protected');
        $result = $this->plugin->rest_get_protected_posts($request);

        $item = $result[0];
        $expected_keys = array('id', 'title', 'content_hash', 'license', 'protected_at', 'verification_url', 'url');

        foreach ($expected_keys as $key) {
            $this->assertArrayHasKey($key, $item, "Response item missing key: {$key}");
        }

        // Verify no extra keys leak through (e.g., raw DB fields)
        $this->assertCount(count($expected_keys), $item, 'Unexpected extra keys in response');
    }

    // ── AJAX handlers ──

    public function test_ajax_protect_requires_nonce(): void {
        WP_Mock_Registry::$nonce_valid = false;

        $this->expectException(\RuntimeException::class);

        $this->plugin->ajax_protect_post();
    }

    public function test_ajax_protect_requires_edit_posts_capability(): void {
        WP_Mock_Registry::$nonce_valid = true;
        WP_Mock_Registry::$user_caps['edit_posts'] = false;

        $this->expectException(\RuntimeException::class);
        $this->expectExceptionMessage('wp_die');

        $this->plugin->ajax_protect_post();
    }

    public function test_ajax_verify_requires_nonce(): void {
        WP_Mock_Registry::$nonce_valid = false;

        $this->expectException(\RuntimeException::class);

        $this->plugin->ajax_verify_post();
    }

    public function test_ajax_verify_returns_error_for_missing_protection(): void {
        WP_Mock_Registry::$nonce_valid = true;
        $_POST['post_id'] = '42';

        $this->plugin->ajax_verify_post();

        $this->assertNotEmpty(WP_Mock_Registry::$json_responses);
        $response = WP_Mock_Registry::$json_responses[0];
        $this->assertFalse($response['success']);
        $this->assertStringContainsString('No protection record', $response['data']['message']);
    }
}
