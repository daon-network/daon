<?php
/**
 * PHPUnit Bootstrap for DAON Creator Protection
 *
 * This bootstrap provides WordPress function stubs so tests can run
 * without a full WordPress installation. For integration tests with
 * a real WP environment, set WP_TESTS_DIR to your wordpress-develop
 * test-lib path before running PHPUnit.
 */

// If a real WordPress test environment is available, use it.
$wp_tests_dir = getenv('WP_TESTS_DIR');
if ($wp_tests_dir && file_exists($wp_tests_dir . '/includes/functions.php')) {
    require_once $wp_tests_dir . '/includes/functions.php';

    tests_add_filter('muplugins_loaded', function () {
        require dirname(__DIR__) . '/daon-creator-protection.php';
    });

    require $wp_tests_dir . '/includes/bootstrap.php';
    return;
}

// ── Standalone mode: stub WordPress functions and constants ──

if (!defined('ABSPATH')) {
    define('ABSPATH', '/tmp/fake-wp/');
}

if (!defined('DAON_PLUGIN_VERSION')) {
    define('DAON_PLUGIN_VERSION', '1.0.0');
}

if (!defined('DAON_PLUGIN_PATH')) {
    define('DAON_PLUGIN_PATH', dirname(__DIR__) . '/');
}

if (!defined('DAON_PLUGIN_URL')) {
    define('DAON_PLUGIN_URL', 'https://example.com/wp-content/plugins/daon-creator-protection/');
}

if (!defined('DAON_PLUGIN_BASENAME')) {
    define('DAON_PLUGIN_BASENAME', 'daon-creator-protection/daon-creator-protection.php');
}

/**
 * Registry for stubbed WordPress options.
 * Tests can populate this before exercising code under test.
 */
class WP_Mock_Registry {
    public static $options = array();
    public static $post_meta = array();
    public static $remote_responses = array();
    public static $user_caps = array();
    public static $current_user_id = 1;
    public static $is_single = false;
    public static $is_page = false;
    public static $nonce_valid = true;
    public static $ajax_died = false;
    public static $ajax_response = null;
    public static $json_responses = array();
    public static $global_post = null;
    public static $global_wpdb = null;

    public static function reset() {
        self::$options = array();
        self::$post_meta = array();
        self::$remote_responses = array();
        self::$user_caps = array();
        self::$current_user_id = 1;
        self::$is_single = false;
        self::$is_page = false;
        self::$nonce_valid = true;
        self::$ajax_died = false;
        self::$ajax_response = null;
        self::$json_responses = array();
        self::$global_post = null;
        self::$global_wpdb = null;
    }
}

// ── WordPress function stubs ──

if (!function_exists('wp_strip_all_tags')) {
    function wp_strip_all_tags($string, $remove_breaks = false) {
        $string = preg_replace('@<(script|style)[^>]*?>.*?</\\1>@si', '', $string);
        $string = strip_tags($string);
        if ($remove_breaks) {
            $string = preg_replace('/[\r\n\t ]+/', ' ', $string);
        }
        return trim($string);
    }
}

if (!function_exists('get_option')) {
    function get_option($option, $default = false) {
        if (array_key_exists($option, WP_Mock_Registry::$options)) {
            return WP_Mock_Registry::$options[$option];
        }
        return $default;
    }
}

if (!function_exists('add_option')) {
    function add_option($option, $value = '') {
        if (!array_key_exists($option, WP_Mock_Registry::$options)) {
            WP_Mock_Registry::$options[$option] = $value;
            return true;
        }
        return false;
    }
}

if (!function_exists('update_option')) {
    function update_option($option, $value) {
        WP_Mock_Registry::$options[$option] = $value;
        return true;
    }
}

if (!function_exists('get_post_meta')) {
    function get_post_meta($post_id, $key = '', $single = false) {
        $meta = WP_Mock_Registry::$post_meta[$post_id][$key] ?? null;
        if ($single) {
            return $meta ?? '';
        }
        return $meta ? array($meta) : array();
    }
}

if (!function_exists('update_post_meta')) {
    function update_post_meta($post_id, $key, $value) {
        WP_Mock_Registry::$post_meta[$post_id][$key] = $value;
        return true;
    }
}

if (!function_exists('get_post')) {
    function get_post($post_id) {
        return WP_Mock_Registry::$global_post;
    }
}

if (!function_exists('wp_remote_get')) {
    function wp_remote_get($url, $args = array()) {
        foreach (WP_Mock_Registry::$remote_responses as $pattern => $response) {
            if (strpos($url, $pattern) !== false) {
                return $response;
            }
        }
        // Default: return a WP_Error-like array
        return new WP_Error('http_request_failed', 'No mock response configured for: ' . $url);
    }
}

if (!function_exists('wp_remote_post')) {
    function wp_remote_post($url, $args = array()) {
        foreach (WP_Mock_Registry::$remote_responses as $pattern => $response) {
            if (strpos($url, $pattern) !== false) {
                return $response;
            }
        }
        return new WP_Error('http_request_failed', 'No mock response configured for: ' . $url);
    }
}

if (!function_exists('wp_remote_retrieve_response_code')) {
    function wp_remote_retrieve_response_code($response) {
        if (is_array($response) && isset($response['response']['code'])) {
            return $response['response']['code'];
        }
        return 0;
    }
}

if (!function_exists('wp_remote_retrieve_body')) {
    function wp_remote_retrieve_body($response) {
        if (is_array($response) && isset($response['body'])) {
            return $response['body'];
        }
        return '';
    }
}

if (!function_exists('is_wp_error')) {
    function is_wp_error($thing) {
        return $thing instanceof WP_Error;
    }
}

if (!function_exists('wp_is_post_revision')) {
    function wp_is_post_revision($post_id) {
        return false;
    }
}

if (!function_exists('wp_is_post_autosave')) {
    function wp_is_post_autosave($post_id) {
        return false;
    }
}

if (!function_exists('is_single')) {
    function is_single() {
        return WP_Mock_Registry::$is_single;
    }
}

if (!function_exists('is_page')) {
    function is_page() {
        return WP_Mock_Registry::$is_page;
    }
}

if (!function_exists('current_user_can')) {
    function current_user_can($capability) {
        return WP_Mock_Registry::$user_caps[$capability] ?? false;
    }
}

if (!function_exists('get_current_user_id')) {
    function get_current_user_id() {
        return WP_Mock_Registry::$current_user_id;
    }
}

if (!function_exists('get_site_url')) {
    function get_site_url() {
        return 'https://example.com';
    }
}

if (!function_exists('get_permalink')) {
    function get_permalink($post_id = 0) {
        return "https://example.com/?p={$post_id}";
    }
}

if (!function_exists('get_the_title')) {
    function get_the_title($post_id = 0) {
        if (WP_Mock_Registry::$global_post) {
            return WP_Mock_Registry::$global_post->post_title;
        }
        return 'Test Post';
    }
}

if (!function_exists('get_the_author_meta')) {
    function get_the_author_meta($field, $user_id = 0) {
        if ($field === 'display_name') {
            return 'Test Author';
        }
        return '';
    }
}

if (!function_exists('get_the_date')) {
    function get_the_date($format = '', $post_id = 0) {
        return '2026-05-05T12:00:00+00:00';
    }
}

if (!function_exists('get_the_modified_date')) {
    function get_the_modified_date($format = '', $post_id = 0) {
        return '2026-05-05T12:00:00+00:00';
    }
}

if (!function_exists('wp_json_encode')) {
    function wp_json_encode($data, $options = 0, $depth = 512) {
        return json_encode($data, $options, $depth);
    }
}

if (!function_exists('wp_get_post_categories')) {
    function wp_get_post_categories($post_id, $args = array()) {
        return array();
    }
}

if (!function_exists('wp_get_post_tags')) {
    function wp_get_post_tags($post_id, $args = array()) {
        return array();
    }
}

if (!function_exists('esc_html')) {
    function esc_html($text) {
        return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('esc_attr')) {
    function esc_attr($text) {
        return htmlspecialchars($text, ENT_QUOTES, 'UTF-8');
    }
}

if (!function_exists('esc_url')) {
    function esc_url($url) {
        return filter_var($url, FILTER_SANITIZE_URL);
    }
}

if (!function_exists('__')) {
    function __($text, $domain = 'default') {
        return $text;
    }
}

if (!function_exists('_e')) {
    function _e($text, $domain = 'default') {
        echo $text;
    }
}

if (!function_exists('sanitize_text_field')) {
    function sanitize_text_field($str) {
        return trim(strip_tags($str));
    }
}

if (!function_exists('check_ajax_referer')) {
    function check_ajax_referer($action, $query_arg = false) {
        if (!WP_Mock_Registry::$nonce_valid) {
            throw new \RuntimeException('Invalid nonce');
        }
        return true;
    }
}

if (!function_exists('wp_create_nonce')) {
    function wp_create_nonce($action = '') {
        return 'test_nonce_' . $action;
    }
}

if (!function_exists('wp_nonce_field')) {
    function wp_nonce_field($action, $name) {
        echo '<input type="hidden" name="' . esc_attr($name) . '" value="' . wp_create_nonce($action) . '" />';
    }
}

if (!function_exists('wp_send_json_success')) {
    function wp_send_json_success($data = null) {
        WP_Mock_Registry::$json_responses[] = array('success' => true, 'data' => $data);
    }
}

if (!function_exists('wp_send_json_error')) {
    function wp_send_json_error($data = null) {
        WP_Mock_Registry::$json_responses[] = array('success' => false, 'data' => $data);
    }
}

if (!function_exists('wp_die')) {
    function wp_die($message = '') {
        WP_Mock_Registry::$ajax_died = true;
        throw new \RuntimeException('wp_die: ' . $message);
    }
}

if (!function_exists('wp_next_scheduled')) {
    function wp_next_scheduled($hook) {
        return false;
    }
}

if (!function_exists('wp_schedule_event')) {
    function wp_schedule_event($timestamp, $recurrence, $hook) {
        return true;
    }
}

if (!function_exists('wp_clear_scheduled_hook')) {
    function wp_clear_scheduled_hook($hook) {
        return true;
    }
}

if (!function_exists('current_time')) {
    function current_time($type) {
        return date('Y-m-d H:i:s');
    }
}

if (!function_exists('date_i18n')) {
    function date_i18n($format, $timestamp = false) {
        return date($format, $timestamp ?: time());
    }
}

if (!function_exists('add_action')) {
    function add_action($hook, $callback, $priority = 10, $args = 1) {}
}

if (!function_exists('add_filter')) {
    function add_filter($hook, $callback, $priority = 10, $args = 1) {}
}

if (!function_exists('register_activation_hook')) {
    function register_activation_hook($file, $callback) {}
}

if (!function_exists('register_deactivation_hook')) {
    function register_deactivation_hook($file, $callback) {}
}

if (!function_exists('add_options_page')) {
    function add_options_page($page_title, $menu_title, $capability, $menu_slug, $callback) {}
}

if (!function_exists('add_submenu_page')) {
    function add_submenu_page($parent_slug, $page_title, $menu_title, $capability, $menu_slug, $callback) {}
}

if (!function_exists('register_setting')) {
    function register_setting($option_group, $option_name, $args = array()) {}
}

if (!function_exists('add_meta_box')) {
    function add_meta_box($id, $title, $callback, $screen = null, $context = 'advanced', $priority = 'default', $args = null) {}
}

if (!function_exists('register_rest_route')) {
    function register_rest_route($namespace, $route, $args = array()) {}
}

if (!function_exists('load_plugin_textdomain')) {
    function load_plugin_textdomain($domain, $deprecated = false, $plugin_rel_path = false) {}
}

if (!function_exists('plugin_dir_path')) {
    function plugin_dir_path($file) {
        return dirname($file) . '/';
    }
}

if (!function_exists('plugin_dir_url')) {
    function plugin_dir_url($file) {
        return DAON_PLUGIN_URL;
    }
}

if (!function_exists('plugin_basename')) {
    function plugin_basename($file) {
        return DAON_PLUGIN_BASENAME;
    }
}

if (!function_exists('is_admin')) {
    function is_admin() {
        return false;
    }
}

if (!function_exists('admin_url')) {
    function admin_url($path = '') {
        return 'https://example.com/wp-admin/' . ltrim($path, '/');
    }
}

if (!function_exists('wp_enqueue_style')) {
    function wp_enqueue_style() {}
}

if (!function_exists('wp_enqueue_script')) {
    function wp_enqueue_script() {}
}

if (!function_exists('wp_localize_script')) {
    function wp_localize_script() {}
}

// ── WP_Error stub ──

if (!class_exists('WP_Error')) {
    class WP_Error {
        private $code;
        private $message;
        private $data;

        public function __construct($code = '', $message = '', $data = '') {
            $this->code = $code;
            $this->message = $message;
            $this->data = $data;
        }

        public function get_error_message() {
            return $this->message;
        }

        public function get_error_code() {
            return $this->code;
        }

        public function get_error_data() {
            return $this->data;
        }
    }
}

// ── WP_REST_Request stub ──

if (!class_exists('WP_REST_Request')) {
    class WP_REST_Request implements ArrayAccess {
        private $params = array();

        public function __construct($method = 'GET', $route = '') {}

        public function set_param($key, $value) {
            $this->params[$key] = $value;
        }

        public function get_param($key) {
            return $this->params[$key] ?? null;
        }

        public function offsetExists($offset): bool {
            return isset($this->params[$offset]);
        }

        #[\ReturnTypeWillChange]
        public function offsetGet($offset) {
            return $this->params[$offset] ?? null;
        }

        public function offsetSet($offset, $value): void {
            $this->params[$offset] = $value;
        }

        public function offsetUnset($offset): void {
            unset($this->params[$offset]);
        }
    }
}

// ── Mock wpdb ──

if (!class_exists('Mock_WPDB')) {
    class Mock_WPDB {
        public $prefix = 'wp_';
        public $posts = 'wp_posts';
        public $insert_id = 0;
        public $last_error = '';

        private $query_results = array();
        public $insert_log = array();
        public $update_log = array();

        public function set_query_result($pattern, $result) {
            $this->query_results[$pattern] = $result;
        }

        public function prepare($query, ...$args) {
            return vsprintf(str_replace('%d', '%s', str_replace('%s', "'%s'", $query)), $args);
        }

        public function get_row($query) {
            foreach ($this->query_results as $pattern => $result) {
                if (strpos($query, $pattern) !== false) {
                    return $result;
                }
            }
            return null;
        }

        public function get_var($query) {
            foreach ($this->query_results as $pattern => $result) {
                if (strpos($query, $pattern) !== false) {
                    return $result;
                }
            }
            return null;
        }

        public function get_results($query) {
            foreach ($this->query_results as $pattern => $result) {
                if (strpos($query, $pattern) !== false) {
                    return $result;
                }
            }
            return array();
        }

        public function get_charset_collate() {
            return 'DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci';
        }

        public function insert($table, $data, $format = null) {
            $this->insert_log[] = array('table' => $table, 'data' => $data, 'format' => $format);
            $this->insert_id = count($this->insert_log);
            return true;
        }

        public function update($table, $data, $where, $format = null, $where_format = null) {
            $this->update_log[] = array(
                'table' => $table,
                'data' => $data,
                'where' => $where,
                'format' => $format,
                'where_format' => $where_format
            );
            return true;
        }
    }
}

// Autoloader for vendor if available
$autoloader = dirname(__DIR__) . '/vendor/autoload.php';
if (file_exists($autoloader)) {
    require_once $autoloader;
}
