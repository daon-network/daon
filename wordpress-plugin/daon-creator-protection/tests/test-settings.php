<?php
/**
 * Tests for plugin activation defaults and settings handling.
 *
 * @package DAON_Creator_Protection
 */

class Test_Settings extends \PHPUnit\Framework\TestCase {

    /** @var DAON_Creator_Protection */
    private $plugin;

    /** @var Mock_WPDB */
    private $wpdb;

    protected function setUp(): void {
        WP_Mock_Registry::reset();

        $this->wpdb = new Mock_WPDB();
        $GLOBALS['wpdb'] = $this->wpdb;

        require_once DAON_PLUGIN_PATH . 'includes/class-daon-client.php';
        require_once DAON_PLUGIN_PATH . 'daon-creator-protection.php';

        $this->plugin = DAON_Creator_Protection::get_instance();
    }

    protected function tearDown(): void {
        unset($GLOBALS['wpdb']);
    }

    // ── Activation: default options ──

    public function test_activation_sets_auto_protect_enabled(): void {
        $this->plugin->activate();

        $this->assertSame('1', WP_Mock_Registry::$options['daon_auto_protect']);
    }

    public function test_activation_sets_default_license(): void {
        $this->plugin->activate();

        $this->assertSame('liberation_v1', WP_Mock_Registry::$options['daon_default_license']);
    }

    public function test_activation_sets_api_url(): void {
        $this->plugin->activate();

        $this->assertSame('https://api.daon.network', WP_Mock_Registry::$options['daon_api_url']);
    }

    public function test_activation_sets_show_protection_notice(): void {
        $this->plugin->activate();

        $this->assertSame('1', WP_Mock_Registry::$options['daon_show_protection_notice']);
    }

    public function test_activation_sets_post_types(): void {
        $this->plugin->activate();

        $this->assertSame(array('post', 'page'), WP_Mock_Registry::$options['daon_protect_post_types']);
    }

    public function test_activation_sets_minimum_word_count(): void {
        $this->plugin->activate();

        $this->assertSame('100', WP_Mock_Registry::$options['daon_minimum_word_count']);
    }

    // ── Activation: does not overwrite existing options ──

    public function test_activation_preserves_existing_auto_protect(): void {
        WP_Mock_Registry::$options['daon_auto_protect'] = '0';

        $this->plugin->activate();

        $this->assertSame('0', WP_Mock_Registry::$options['daon_auto_protect']);
    }

    public function test_activation_preserves_existing_license(): void {
        WP_Mock_Registry::$options['daon_default_license'] = 'cc_by_nc';

        $this->plugin->activate();

        $this->assertSame('cc_by_nc', WP_Mock_Registry::$options['daon_default_license']);
    }

    public function test_activation_preserves_existing_api_url(): void {
        WP_Mock_Registry::$options['daon_api_url'] = 'https://custom.api.example.com';

        $this->plugin->activate();

        $this->assertSame('https://custom.api.example.com', WP_Mock_Registry::$options['daon_api_url']);
    }

    public function test_activation_preserves_existing_word_count(): void {
        WP_Mock_Registry::$options['daon_minimum_word_count'] = '50';

        $this->plugin->activate();

        $this->assertSame('50', WP_Mock_Registry::$options['daon_minimum_word_count']);
    }

    // ── Activation: database table ──

    public function test_activation_creates_protection_table(): void {
        // The table creation uses dbDelta which we haven't mocked deeply,
        // but we can verify the method runs without error
        // In a real WP test environment, we'd check $wpdb for the table
        $this->plugin->activate();

        // If we got here without fatal errors, the activation ran
        $this->assertTrue(true);
    }

    // ── Default option retrieval ──

    public function test_auto_protect_defaults_to_enabled(): void {
        // No options set
        $value = get_option('daon_auto_protect', '1');
        $this->assertSame('1', $value);
    }

    public function test_api_url_defaults_to_production(): void {
        $value = get_option('daon_api_url', 'https://api.daon.network');
        $this->assertSame('https://api.daon.network', $value);
    }

    public function test_minimum_word_count_defaults_to_100(): void {
        $value = get_option('daon_minimum_word_count', '100');
        $this->assertSame('100', $value);
    }

    // ── Edge cases ──

    public function test_empty_string_option_is_not_overwritten(): void {
        // An empty string is a valid option value (e.g., auto_protect disabled)
        // and should NOT be treated as "not set"
        WP_Mock_Registry::$options['daon_auto_protect'] = '';

        $this->plugin->activate();

        // add_option only sets if get_option returns false (not found),
        // empty string is a found value so it should be preserved
        $this->assertSame('', WP_Mock_Registry::$options['daon_auto_protect']);
    }

    public function test_all_six_default_options_are_set(): void {
        $this->plugin->activate();

        $expected_keys = array(
            'daon_auto_protect',
            'daon_default_license',
            'daon_api_url',
            'daon_show_protection_notice',
            'daon_protect_post_types',
            'daon_minimum_word_count',
        );

        foreach ($expected_keys as $key) {
            $this->assertArrayHasKey(
                $key,
                WP_Mock_Registry::$options,
                "Missing default option: {$key}"
            );
        }
    }
}
