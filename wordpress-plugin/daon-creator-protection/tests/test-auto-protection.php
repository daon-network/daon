<?php
/**
 * Tests for the save_post auto-protection flow.
 *
 * Verifies every guard clause in protect_post() and the downstream
 * do_protect_post() logic, plus the database insert/update path.
 *
 * @package DAON_Creator_Protection
 */

class Test_Auto_Protection extends \PHPUnit\Framework\TestCase {

    /** @var DAON_Creator_Protection */
    private $plugin;

    /** @var Mock_WPDB */
    private $wpdb;

    protected function setUp(): void {
        WP_Mock_Registry::reset();

        // Set defaults that mirror plugin activation
        WP_Mock_Registry::$options = array(
            'daon_auto_protect'       => '1',
            'daon_api_url'            => 'https://api.daon.network',
            'daon_default_license'    => 'liberation_v1',
            'daon_protect_post_types' => array('post', 'page'),
            'daon_minimum_word_count' => '100',
            'daon_show_protection_notice' => '1',
        );

        // Set up mock wpdb
        $this->wpdb = new Mock_WPDB();
        $GLOBALS['wpdb'] = $this->wpdb;

        // Load the plugin class fresh — the singleton makes this tricky,
        // so we test the public protect_post() method directly.
        require_once DAON_PLUGIN_PATH . 'includes/class-daon-client.php';
        require_once DAON_PLUGIN_PATH . 'daon-creator-protection.php';

        $this->plugin = DAON_Creator_Protection::get_instance();
    }

    protected function tearDown(): void {
        unset($GLOBALS['wpdb']);
    }

    private function make_post($overrides = array()): object {
        $defaults = array(
            'ID'            => 42,
            'post_title'    => 'Test Post Title',
            'post_content'  => str_repeat('word ', 150), // 150 words
            'post_status'   => 'publish',
            'post_type'     => 'post',
            'post_author'   => 1,
            'post_date'     => '2026-05-01 10:00:00',
            'post_modified' => '2026-05-01 10:00:00',
        );
        return (object) array_merge($defaults, $overrides);
    }

    // ── Guard: auto-protect disabled ──

    public function test_skips_when_auto_protect_disabled(): void {
        WP_Mock_Registry::$options['daon_auto_protect'] = '';
        $post = $this->make_post();

        $this->plugin->protect_post(42, $post);

        // No DB insert should have happened
        $this->assertEmpty($this->wpdb->insert_log);
    }

    public function test_skips_when_auto_protect_is_zero(): void {
        WP_Mock_Registry::$options['daon_auto_protect'] = '0';
        $post = $this->make_post();

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    // ── Guard: post status ──

    public function test_skips_draft_posts(): void {
        $post = $this->make_post(array('post_status' => 'draft'));

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    public function test_skips_pending_posts(): void {
        $post = $this->make_post(array('post_status' => 'pending'));

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    public function test_skips_private_posts(): void {
        $post = $this->make_post(array('post_status' => 'private'));

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    public function test_skips_trash_posts(): void {
        $post = $this->make_post(array('post_status' => 'trash'));

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    // ── Guard: post type ──

    public function test_skips_disabled_post_type(): void {
        $post = $this->make_post(array('post_type' => 'product'));

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    public function test_protects_enabled_post_type_page(): void {
        $post = $this->make_post(array('post_type' => 'page'));
        WP_Mock_Registry::$global_post = $post;

        // Mock a successful API response
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => true,
                'tx_hash' => '0xabc123',
                'verification_url' => 'https://daon.network/verify/abc',
            )),
        );

        $this->plugin->protect_post(42, $post);

        $this->assertNotEmpty($this->wpdb->insert_log, 'Should insert protection record for page post type');
    }

    // ── Guard: already protected ──

    public function test_skips_already_protected_post(): void {
        $post = $this->make_post();

        // Simulate existing protection record
        $this->wpdb->set_query_result('post_id', 1);

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    // ── Guard: minimum word count ──

    public function test_skips_post_below_minimum_word_count(): void {
        $post = $this->make_post(array('post_content' => 'Too short'));
        WP_Mock_Registry::$global_post = $post;

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    public function test_skips_post_with_exactly_min_minus_one_words(): void {
        WP_Mock_Registry::$options['daon_minimum_word_count'] = '10';
        $post = $this->make_post(array('post_content' => str_repeat('word ', 9)));
        WP_Mock_Registry::$global_post = $post;

        $this->plugin->protect_post(42, $post);

        $this->assertEmpty($this->wpdb->insert_log);
    }

    // ── Successful protection ──

    public function test_inserts_pending_record_on_protect(): void {
        $post = $this->make_post();
        WP_Mock_Registry::$global_post = $post;

        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => true,
                'tx_hash' => '0xdeadbeef',
                'verification_url' => 'https://daon.network/verify/deadbeef',
            )),
        );

        $this->plugin->protect_post(42, $post);

        $this->assertCount(1, $this->wpdb->insert_log);
        $insert = $this->wpdb->insert_log[0];
        $this->assertSame('wp_daon_protections', $insert['table']);
        $this->assertSame(42, $insert['data']['post_id']);
        $this->assertSame('pending', $insert['data']['status']);
        $this->assertSame('liberation_v1', $insert['data']['license']);
        $this->assertStringStartsWith('sha256:', $insert['data']['content_hash']);
    }

    public function test_updates_to_verified_on_api_success(): void {
        $post = $this->make_post();
        WP_Mock_Registry::$global_post = $post;

        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => true,
                'tx_hash' => '0xdeadbeef',
                'verification_url' => 'https://daon.network/verify/deadbeef',
            )),
        );

        $this->plugin->protect_post(42, $post);

        $this->assertCount(1, $this->wpdb->update_log);
        $update = $this->wpdb->update_log[0];
        $this->assertSame('verified', $update['data']['status']);
        $this->assertSame('0xdeadbeef', $update['data']['tx_hash']);
    }

    public function test_updates_to_error_on_api_failure(): void {
        $post = $this->make_post();
        WP_Mock_Registry::$global_post = $post;

        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => false,
                'error' => 'Rate limit exceeded',
            )),
        );

        $this->plugin->protect_post(42, $post);

        $this->assertCount(1, $this->wpdb->update_log);
        $update = $this->wpdb->update_log[0];
        $this->assertSame('error', $update['data']['status']);
        $this->assertSame('Rate limit exceeded', $update['data']['error_message']);
    }

    // ── License handling ──

    public function test_uses_post_meta_license_when_set(): void {
        $post = $this->make_post();
        WP_Mock_Registry::$global_post = $post;
        WP_Mock_Registry::$post_meta[42]['_daon_license'] = 'cc_by_nc';

        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array('success' => true, 'tx_hash' => '0xabc')),
        );

        $this->plugin->protect_post(42, $post);

        $insert = $this->wpdb->insert_log[0];
        $this->assertSame('cc_by_nc', $insert['data']['license']);
    }

    public function test_falls_back_to_default_license(): void {
        $post = $this->make_post();
        WP_Mock_Registry::$global_post = $post;
        WP_Mock_Registry::$options['daon_default_license'] = 'all_rights_reserved';

        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array('success' => true, 'tx_hash' => '0xabc')),
        );

        $this->plugin->protect_post(42, $post);

        $insert = $this->wpdb->insert_log[0];
        $this->assertSame('all_rights_reserved', $insert['data']['license']);
    }

    // ── Content preparation ──

    public function test_hash_includes_post_title(): void {
        $post1 = $this->make_post(array('post_title' => 'Title A'));
        $post2 = $this->make_post(array('post_title' => 'Title B'));

        WP_Mock_Registry::$global_post = $post1;
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array('success' => true, 'tx_hash' => '0x1')),
        );
        $this->plugin->protect_post(42, $post1);
        $hash1 = $this->wpdb->insert_log[0]['data']['content_hash'];

        // Reset for second call
        $this->wpdb->insert_log = array();
        $this->wpdb->update_log = array();

        WP_Mock_Registry::$global_post = $post2;
        $this->plugin->protect_post(42, $post2);
        $hash2 = $this->wpdb->insert_log[0]['data']['content_hash'];

        $this->assertNotSame($hash1, $hash2, 'Different titles should produce different hashes');
    }
}
