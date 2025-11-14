<?php
/**
 * Plugin Name: DAON Creator Protection
 * Plugin URI: https://daon.network/wordpress
 * Description: Protect your blog posts and creative content from AI exploitation with blockchain-verified ownership. Perfect for writers, artists, and content creators.
 * Version: 1.0.0
 * Author: DAON Network
 * Author URI: https://daon.network
 * License: MIT
 * Text Domain: daon-creator-protection
 * Domain Path: /languages
 * Requires at least: 5.0
 * Tested up to: 6.4
 * Requires PHP: 7.4
 * Network: false
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

// Define plugin constants
define('DAON_PLUGIN_VERSION', '1.0.0');
define('DAON_PLUGIN_PATH', plugin_dir_path(__FILE__));
define('DAON_PLUGIN_URL', plugin_dir_url(__FILE__));
define('DAON_PLUGIN_BASENAME', plugin_basename(__FILE__));

/**
 * Main DAON Creator Protection Plugin Class
 */
class DAON_Creator_Protection {
    
    private static $instance = null;
    
    public static function get_instance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }
    
    private function __construct() {
        add_action('init', array($this, 'init'));
    }
    
    public function init() {
        // Load plugin text domain
        load_plugin_textdomain('daon-creator-protection', false, dirname(plugin_basename(__FILE__)) . '/languages');
        
        // Initialize hooks
        $this->init_hooks();
        
        // Load required files
        $this->load_dependencies();
    }
    
    private function init_hooks() {
        // Activation and deactivation hooks
        register_activation_hook(__FILE__, array($this, 'activate'));
        register_deactivation_hook(__FILE__, array($this, 'deactivate'));
        
        // Admin hooks
        if (is_admin()) {
            add_action('admin_menu', array($this, 'add_admin_menu'));
            add_action('admin_init', array($this, 'admin_init'));
            add_action('admin_enqueue_scripts', array($this, 'admin_enqueue_scripts'));
        }
        
        // Frontend hooks
        add_action('wp_enqueue_scripts', array($this, 'enqueue_scripts'));
        
        // Post hooks
        add_action('save_post', array($this, 'protect_post'), 10, 2);
        add_action('wp_after_insert_post', array($this, 'protect_new_post'), 10, 4);
        
        // Content display hooks
        add_filter('the_content', array($this, 'add_protection_notice'));
        add_action('wp_head', array($this, 'add_structured_data'));
        
        // Meta box hooks
        add_action('add_meta_boxes', array($this, 'add_post_meta_box'));
        
        // AJAX hooks
        add_action('wp_ajax_daon_protect_post', array($this, 'ajax_protect_post'));
        add_action('wp_ajax_daon_verify_post', array($this, 'ajax_verify_post'));
        
        // REST API hooks
        add_action('rest_api_init', array($this, 'register_rest_routes'));
        
        // Settings link on plugins page
        add_filter('plugin_action_links_' . DAON_PLUGIN_BASENAME, array($this, 'add_settings_link'));
    }
    
    private function load_dependencies() {
        require_once DAON_PLUGIN_PATH . 'includes/class-daon-client.php';
        require_once DAON_PLUGIN_PATH . 'includes/class-daon-post-protection.php';
        require_once DAON_PLUGIN_PATH . 'includes/class-daon-admin.php';
        require_once DAON_PLUGIN_PATH . 'includes/class-daon-frontend.php';
        require_once DAON_PLUGIN_PATH . 'includes/class-daon-api.php';
    }
    
    public function activate() {
        // Create database table for protection records
        $this->create_protection_table();
        
        // Set default options
        $this->set_default_options();
        
        // Schedule cleanup cron job
        if (!wp_next_scheduled('daon_cleanup_job')) {
            wp_schedule_event(time(), 'daily', 'daon_cleanup_job');
        }
    }
    
    public function deactivate() {
        // Clear scheduled cron job
        wp_clear_scheduled_hook('daon_cleanup_job');
    }
    
    private function create_protection_table() {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'daon_protections';
        
        $charset_collate = $wpdb->get_charset_collate();
        
        $sql = "CREATE TABLE $table_name (
            id mediumint(9) NOT NULL AUTO_INCREMENT,
            post_id bigint(20) NOT NULL,
            content_hash varchar(70) NOT NULL,
            tx_hash varchar(70) DEFAULT NULL,
            verification_url varchar(255) DEFAULT NULL,
            blockchain_url varchar(255) DEFAULT NULL,
            license varchar(50) NOT NULL DEFAULT 'liberation_v1',
            protected_at datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
            verified_at datetime DEFAULT NULL,
            status varchar(20) NOT NULL DEFAULT 'pending',
            error_message text DEFAULT NULL,
            PRIMARY KEY (id),
            UNIQUE KEY content_hash (content_hash),
            KEY post_id (post_id),
            KEY status (status)
        ) $charset_collate;";
        
        require_once ABSPATH . 'wp-admin/includes/upgrade.php';
        dbDelta($sql);
    }
    
    private function set_default_options() {
        $defaults = array(
            'daon_auto_protect' => '1',
            'daon_default_license' => 'liberation_v1',
            'daon_api_url' => 'https://api.daon.network',
            'daon_show_protection_notice' => '1',
            'daon_protect_post_types' => array('post', 'page'),
            'daon_minimum_word_count' => '100',
        );
        
        foreach ($defaults as $option => $value) {
            if (get_option($option) === false) {
                add_option($option, $value);
            }
        }
    }
    
    public function add_admin_menu() {
        add_options_page(
            __('DAON Creator Protection', 'daon-creator-protection'),
            __('DAON Protection', 'daon-creator-protection'),
            'manage_options',
            'daon-creator-protection',
            array($this, 'admin_page')
        );
        
        add_submenu_page(
            'edit.php',
            __('Protected Content', 'daon-creator-protection'),
            __('DAON Protected', 'daon-creator-protection'),
            'edit_posts',
            'daon-protected-content',
            array($this, 'protected_content_page')
        );
    }
    
    public function admin_init() {
        register_setting('daon_settings', 'daon_auto_protect');
        register_setting('daon_settings', 'daon_default_license');
        register_setting('daon_settings', 'daon_api_url');
        register_setting('daon_settings', 'daon_show_protection_notice');
        register_setting('daon_settings', 'daon_protect_post_types');
        register_setting('daon_settings', 'daon_minimum_word_count');
    }
    
    public function admin_enqueue_scripts($hook) {
        if ('settings_page_daon-creator-protection' === $hook || 'posts_page_daon-protected-content' === $hook) {
            wp_enqueue_style('daon-admin-css', DAON_PLUGIN_URL . 'assets/admin.css', array(), DAON_PLUGIN_VERSION);
            wp_enqueue_script('daon-admin-js', DAON_PLUGIN_URL . 'assets/admin.js', array('jquery'), DAON_PLUGIN_VERSION, true);
            
            wp_localize_script('daon-admin-js', 'daon_ajax', array(
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('daon_ajax_nonce'),
                'strings' => array(
                    'protecting' => __('Protecting...', 'daon-creator-protection'),
                    'protected' => __('Protected!', 'daon-creator-protection'),
                    'error' => __('Protection failed', 'daon-creator-protection'),
                    'verifying' => __('Verifying...', 'daon-creator-protection'),
                    'verified' => __('Verified!', 'daon-creator-protection'),
                )
            ));
        }
    }
    
    public function enqueue_scripts() {
        if (is_single() || is_page()) {
            wp_enqueue_style('daon-frontend-css', DAON_PLUGIN_URL . 'assets/frontend.css', array(), DAON_PLUGIN_VERSION);
        }
    }
    
    public function add_post_meta_box() {
        $post_types = get_option('daon_protect_post_types', array('post', 'page'));
        
        foreach ($post_types as $post_type) {
            add_meta_box(
                'daon-protection',
                __('DAON Creator Protection', 'daon-creator-protection'),
                array($this, 'post_meta_box_callback'),
                $post_type,
                'side',
                'default'
            );
        }
    }
    
    public function post_meta_box_callback($post) {
        global $wpdb;
        
        $table_name = $wpdb->prefix . 'daon_protections';
        $protection = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_name WHERE post_id = %d",
            $post->ID
        ));
        
        wp_nonce_field('daon_meta_box', 'daon_meta_box_nonce');
        
        echo '<div id="daon-meta-box-content">';
        
        if ($protection) {
            $this->render_protection_status($protection);
        } else {
            $this->render_protection_form($post);
        }
        
        echo '</div>';
    }
    
    private function render_protection_status($protection) {
        $status_class = $protection->status === 'verified' ? 'protected' : 'pending';
        $status_text = $protection->status === 'verified' ? __('Protected', 'daon-creator-protection') : __('Protection Pending', 'daon-creator-protection');
        
        echo '<div class="daon-status daon-status-' . esc_attr($status_class) . '">';
        echo '<span class="daon-status-icon">🛡️</span>';
        echo '<span class="daon-status-text">' . esc_html($status_text) . '</span>';
        echo '</div>';
        
        echo '<div class="daon-details">';
        echo '<p><strong>' . __('License:', 'daon-creator-protection') . '</strong> ' . esc_html(ucfirst(str_replace('_', ' ', $protection->license))) . '</p>';
        echo '<p><strong>' . __('Protected:', 'daon-creator-protection') . '</strong> ' . esc_html(date_i18n(get_option('date_format'), strtotime($protection->protected_at))) . '</p>';
        
        if ($protection->verification_url) {
            echo '<p><a href="' . esc_url($protection->verification_url) . '" target="_blank" class="button button-small">' . __('Verify on Blockchain', 'daon-creator-protection') . '</a></p>';
        }
        
        if ($protection->status === 'error' && $protection->error_message) {
            echo '<div class="notice notice-error inline"><p>' . esc_html($protection->error_message) . '</p></div>';
            echo '<button type="button" class="button button-small daon-retry-protection" data-post-id="' . esc_attr($protection->post_id) . '">' . __('Retry Protection', 'daon-creator-protection') . '</button>';
        }
        echo '</div>';
    }
    
    private function render_protection_form($post) {
        $word_count = str_word_count(strip_tags($post->post_content));
        $min_words = get_option('daon_minimum_word_count', 100);
        
        if ($word_count < $min_words) {
            echo '<div class="notice notice-warning inline">';
            echo '<p>' . sprintf(__('Content must be at least %d words to protect. Current: %d words.', 'daon-creator-protection'), $min_words, $word_count) . '</p>';
            echo '</div>';
            return;
        }
        
        echo '<p>' . __('Protect this content with DAON blockchain verification.', 'daon-creator-protection') . '</p>';
        
        echo '<div class="daon-license-selection">';
        echo '<label for="daon_license"><strong>' . __('License:', 'daon-creator-protection') . '</strong></label>';
        echo '<select name="daon_license" id="daon_license">';
        
        $licenses = array(
            'liberation_v1' => __('Liberation License v1.0 (Recommended)', 'daon-creator-protection'),
            'cc_by_nc' => __('Creative Commons BY-NC', 'daon-creator-protection'),
            'cc_by_nc_sa' => __('Creative Commons BY-NC-SA', 'daon-creator-protection'),
            'all_rights_reserved' => __('All Rights Reserved', 'daon-creator-protection'),
        );
        
        $default_license = get_option('daon_default_license', 'liberation_v1');
        
        foreach ($licenses as $value => $label) {
            $selected = $value === $default_license ? 'selected' : '';
            echo '<option value="' . esc_attr($value) . '" ' . $selected . '>' . esc_html($label) . '</option>';
        }
        
        echo '</select>';
        echo '</div>';
        
        echo '<div class="daon-license-info">';
        echo '<p class="description">' . __('Liberation License blocks corporate AI training without compensation while allowing personal use and education.', 'daon-creator-protection') . '</p>';
        echo '</div>';
        
        echo '<button type="button" class="button button-primary daon-protect-post" data-post-id="' . esc_attr($post->ID) . '">' . __('Protect with DAON', 'daon-creator-protection') . '</button>';
    }
    
    public function protect_post($post_id, $post) {
        // Skip if auto-protect is disabled
        if (!get_option('daon_auto_protect', '1')) {
            return;
        }
        
        // Skip for revisions, autosaves, etc.
        if (wp_is_post_revision($post_id) || wp_is_post_autosave($post_id)) {
            return;
        }
        
        // Skip if not published
        if ($post->post_status !== 'publish') {
            return;
        }
        
        // Skip if post type not enabled
        $enabled_types = get_option('daon_protect_post_types', array('post', 'page'));
        if (!in_array($post->post_type, $enabled_types)) {
            return;
        }
        
        // Skip if already protected
        global $wpdb;
        $table_name = $wpdb->prefix . 'daon_protections';
        $existing = $wpdb->get_var($wpdb->prepare(
            "SELECT id FROM $table_name WHERE post_id = %d",
            $post_id
        ));
        
        if ($existing) {
            return;
        }
        
        // Protect the post
        $this->do_protect_post($post_id);
    }
    
    public function protect_new_post($post_id, $post, $update, $post_before) {
        // Only protect new posts (not updates)
        if ($update) {
            return;
        }
        
        $this->protect_post($post_id, $post);
    }
    
    private function do_protect_post($post_id) {
        $post = get_post($post_id);
        if (!$post) {
            return false;
        }
        
        // Check word count
        $word_count = str_word_count(strip_tags($post->post_content));
        $min_words = get_option('daon_minimum_word_count', 100);
        
        if ($word_count < $min_words) {
            return false;
        }
        
        try {
            // Initialize DAON client
            $daon_client = new DAON_Client();
            
            // Generate content hash
            $content = $this->get_post_content_for_protection($post);
            $content_hash = $daon_client->generate_content_hash($content);
            
            // Prepare metadata
            $metadata = $this->get_post_metadata($post);
            
            // Get license
            $license = get_post_meta($post_id, '_daon_license', true);
            if (!$license) {
                $license = get_option('daon_default_license', 'liberation_v1');
            }
            
            // Create protection record
            global $wpdb;
            $table_name = $wpdb->prefix . 'daon_protections';
            
            $wpdb->insert(
                $table_name,
                array(
                    'post_id' => $post_id,
                    'content_hash' => $content_hash,
                    'license' => $license,
                    'status' => 'pending',
                    'protected_at' => current_time('mysql')
                ),
                array('%d', '%s', '%s', '%s', '%s')
            );
            
            // Attempt blockchain registration (async would be better)
            $result = $daon_client->protect_content($content, $metadata, $license);
            
            if ($result['success']) {
                $wpdb->update(
                    $table_name,
                    array(
                        'tx_hash' => $result['tx_hash'],
                        'verification_url' => $result['verification_url'],
                        'blockchain_url' => $result['blockchain_url'],
                        'status' => 'verified',
                        'verified_at' => current_time('mysql')
                    ),
                    array('post_id' => $post_id),
                    array('%s', '%s', '%s', '%s', '%s'),
                    array('%d')
                );
            } else {
                $wpdb->update(
                    $table_name,
                    array(
                        'status' => 'error',
                        'error_message' => $result['error']
                    ),
                    array('post_id' => $post_id),
                    array('%s', '%s'),
                    array('%d')
                );
            }
            
            return true;
            
        } catch (Exception $e) {
            error_log('DAON Protection Error: ' . $e->getMessage());
            return false;
        }
    }
    
    private function get_post_content_for_protection($post) {
        // Combine title and content for protection
        $content = $post->post_title . "\n\n" . $post->post_content;
        
        // Strip HTML and normalize
        $content = wp_strip_all_tags($content);
        $content = trim($content);
        
        return $content;
    }
    
    private function get_post_metadata($post) {
        $metadata = array(
            'title' => $post->post_title,
            'author' => get_the_author_meta('display_name', $post->post_author),
            'url' => get_permalink($post->ID),
            'published_at' => $post->post_date,
            'updated_at' => $post->post_modified,
            'word_count' => str_word_count(strip_tags($post->post_content)),
            'post_type' => $post->post_type,
            'platform' => 'wordpress'
        );
        
        // Add categories and tags
        $categories = wp_get_post_categories($post->ID, array('fields' => 'names'));
        if ($categories) {
            $metadata['categories'] = $categories;
        }
        
        $tags = wp_get_post_tags($post->ID, array('fields' => 'names'));
        if ($tags) {
            $metadata['tags'] = $tags;
        }
        
        return $metadata;
    }
    
    public function add_protection_notice($content) {
        if (!is_single() && !is_page()) {
            return $content;
        }
        
        if (!get_option('daon_show_protection_notice', '1')) {
            return $content;
        }
        
        global $post, $wpdb;
        
        $table_name = $wpdb->prefix . 'daon_protections';
        $protection = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_name WHERE post_id = %d AND status = 'verified'",
            $post->ID
        ));
        
        if (!$protection) {
            return $content;
        }
        
        $notice = $this->get_protection_notice_html($protection);
        
        return $content . $notice;
    }
    
    private function get_protection_notice_html($protection) {
        $license_text = $this->get_license_text($protection->license);
        
        ob_start();
        ?>
        <div class="daon-protection-notice">
            <div class="daon-protection-header">
                <span class="daon-shield">🛡️</span>
                <strong><?php _e('This content is protected by DAON blockchain verification.', 'daon-creator-protection'); ?></strong>
            </div>
            <div class="daon-protection-details">
                <p>
                    <strong><?php _e('License:', 'daon-creator-protection'); ?></strong> <?php echo esc_html($license_text); ?>
                    <?php if ($protection->verification_url): ?>
                        | <a href="<?php echo esc_url($protection->verification_url); ?>" target="_blank"><?php _e('Verify on blockchain', 'daon-creator-protection'); ?></a>
                    <?php endif; ?>
                </p>
                <?php if ($protection->license === 'liberation_v1'): ?>
                <p class="daon-license-explanation">
                    <?php _e('This work is licensed under Liberation License v1.0, which allows personal use, education, and humanitarian purposes while blocking corporate AI training without creator compensation.', 'daon-creator-protection'); ?>
                </p>
                <?php endif; ?>
            </div>
        </div>
        <?php
        return ob_get_clean();
    }
    
    private function get_license_text($license) {
        $licenses = array(
            'liberation_v1' => __('Liberation License v1.0', 'daon-creator-protection'),
            'cc_by_nc' => __('Creative Commons BY-NC', 'daon-creator-protection'),
            'cc_by_nc_sa' => __('Creative Commons BY-NC-SA', 'daon-creator-protection'),
            'all_rights_reserved' => __('All Rights Reserved', 'daon-creator-protection'),
        );
        
        return $licenses[$license] ?? ucfirst(str_replace('_', ' ', $license));
    }
    
    public function add_structured_data() {
        if (!is_single() && !is_page()) {
            return;
        }
        
        global $post, $wpdb;
        
        $table_name = $wpdb->prefix . 'daon_protections';
        $protection = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_name WHERE post_id = %d AND status = 'verified'",
            $post->ID
        ));
        
        if (!$protection) {
            return;
        }
        
        $structured_data = array(
            '@context' => 'https://schema.org',
            '@type' => 'CreativeWork',
            'name' => get_the_title($post->ID),
            'author' => array(
                '@type' => 'Person',
                'name' => get_the_author_meta('display_name', $post->post_author)
            ),
            'datePublished' => get_the_date('c', $post->ID),
            'dateModified' => get_the_modified_date('c', $post->ID),
            'url' => get_permalink($post->ID),
            'copyrightHolder' => array(
                '@type' => 'Person',
                'name' => get_the_author_meta('display_name', $post->post_author)
            ),
            'license' => $protection->license,
            'identifier' => array(
                '@type' => 'PropertyValue',
                'propertyID' => 'DAON Content Hash',
                'value' => $protection->content_hash
            )
        );
        
        if ($protection->verification_url) {
            $structured_data['mainEntity'] = array(
                '@type' => 'DigitalDocument',
                'url' => $protection->verification_url,
                'name' => 'DAON Blockchain Verification'
            );
        }
        
        echo '<script type="application/ld+json">' . wp_json_encode($structured_data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES) . '</script>' . "\n";
    }
    
    // AJAX handlers
    public function ajax_protect_post() {
        check_ajax_referer('daon_ajax_nonce', 'nonce');
        
        if (!current_user_can('edit_posts')) {
            wp_die(__('You do not have permission to do this.', 'daon-creator-protection'));
        }
        
        $post_id = intval($_POST['post_id']);
        $license = sanitize_text_field($_POST['license'] ?? 'liberation_v1');
        
        // Save license preference
        update_post_meta($post_id, '_daon_license', $license);
        
        // Protect the post
        $success = $this->do_protect_post($post_id);
        
        if ($success) {
            wp_send_json_success(array(
                'message' => __('Post protected successfully!', 'daon-creator-protection')
            ));
        } else {
            wp_send_json_error(array(
                'message' => __('Failed to protect post.', 'daon-creator-protection')
            ));
        }
    }
    
    public function ajax_verify_post() {
        check_ajax_referer('daon_ajax_nonce', 'nonce');
        
        $post_id = intval($_POST['post_id']);
        
        global $wpdb;
        $table_name = $wpdb->prefix . 'daon_protections';
        $protection = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_name WHERE post_id = %d",
            $post_id
        ));
        
        if (!$protection) {
            wp_send_json_error(array(
                'message' => __('No protection record found.', 'daon-creator-protection')
            ));
        }
        
        try {
            $daon_client = new DAON_Client();
            $result = $daon_client->verify_content($protection->content_hash);
            
            wp_send_json_success(array(
                'verified' => $result['verified'],
                'details' => $result
            ));
            
        } catch (Exception $e) {
            wp_send_json_error(array(
                'message' => __('Verification failed: ', 'daon-creator-protection') . $e->getMessage()
            ));
        }
    }
    
    // REST API
    public function register_rest_routes() {
        register_rest_route('daon/v1', '/verify/(?P<id>\d+)', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_verify_post'),
            'permission_callback' => '__return_true',
            'args' => array(
                'id' => array(
                    'validate_callback' => function($param, $request, $key) {
                        return is_numeric($param);
                    }
                ),
            ),
        ));
        
        register_rest_route('daon/v1', '/protected', array(
            'methods' => 'GET',
            'callback' => array($this, 'rest_get_protected_posts'),
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            },
        ));
    }
    
    public function rest_verify_post($request) {
        $post_id = $request['id'];
        
        global $wpdb;
        $table_name = $wpdb->prefix . 'daon_protections';
        $protection = $wpdb->get_row($wpdb->prepare(
            "SELECT * FROM $table_name WHERE post_id = %d AND status = 'verified'",
            $post_id
        ));
        
        if (!$protection) {
            return new WP_Error('not_protected', __('Post is not protected.', 'daon-creator-protection'), array('status' => 404));
        }
        
        return array(
            'verified' => true,
            'content_hash' => $protection->content_hash,
            'license' => $protection->license,
            'protected_at' => $protection->protected_at,
            'verification_url' => $protection->verification_url,
            'blockchain_url' => $protection->blockchain_url
        );
    }
    
    public function rest_get_protected_posts($request) {
        global $wpdb;
        $table_name = $wpdb->prefix . 'daon_protections';
        
        $protections = $wpdb->get_results(
            "SELECT p.*, pt.post_title, pt.post_date 
             FROM $table_name p 
             LEFT JOIN {$wpdb->posts} pt ON p.post_id = pt.ID 
             WHERE p.status = 'verified' 
             ORDER BY p.protected_at DESC"
        );
        
        $formatted = array();
        foreach ($protections as $protection) {
            $formatted[] = array(
                'id' => $protection->post_id,
                'title' => $protection->post_title,
                'content_hash' => $protection->content_hash,
                'license' => $protection->license,
                'protected_at' => $protection->protected_at,
                'verification_url' => $protection->verification_url,
                'url' => get_permalink($protection->post_id)
            );
        }
        
        return $formatted;
    }
    
    // Admin pages
    public function admin_page() {
        require_once DAON_PLUGIN_PATH . 'admin/settings-page.php';
    }
    
    public function protected_content_page() {
        require_once DAON_PLUGIN_PATH . 'admin/protected-content-page.php';
    }
    
    public function add_settings_link($links) {
        $settings_link = '<a href="options-general.php?page=daon-creator-protection">' . __('Settings', 'daon-creator-protection') . '</a>';
        array_unshift($links, $settings_link);
        return $links;
    }
}

// Initialize the plugin
function DAON_Creator_Protection() {
    return DAON_Creator_Protection::get_instance();
}

// Start the plugin
DAON_Creator_Protection();