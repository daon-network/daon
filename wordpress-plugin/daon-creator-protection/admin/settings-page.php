<?php

if (!defined('ABSPATH')) {
    exit;
}

?>

<div class="wrap">
    <h1><?php _e('DAON Creator Protection Settings', 'daon-creator-protection'); ?></h1>
    
    <div class="daon-admin-header">
        <div class="daon-logo">
            <span class="daon-shield">🛡️</span>
            <h2><?php _e('Protect Your Content with Blockchain Technology', 'daon-creator-protection'); ?></h2>
            <p class="description"><?php _e('DAON provides cryptographic proof of ownership to prevent AI exploitation of your creative work.', 'daon-creator-protection'); ?></p>
        </div>
    </div>
    
    <?php
    // Show success message if settings were saved
    if (isset($_GET['settings-updated']) && $_GET['settings-updated']) {
        echo '<div class="notice notice-success is-dismissible"><p>' . __('Settings saved successfully!', 'daon-creator-protection') . '</p></div>';
    }
    
    // Get current stats
    global $wpdb;
    $table_name = $wpdb->prefix . 'daon_protections';
    $stats = array(
        'total' => $wpdb->get_var("SELECT COUNT(*) FROM $table_name"),
        'verified' => $wpdb->get_var("SELECT COUNT(*) FROM $table_name WHERE status = 'verified'"),
        'pending' => $wpdb->get_var("SELECT COUNT(*) FROM $table_name WHERE status = 'pending'"),
        'errors' => $wpdb->get_var("SELECT COUNT(*) FROM $table_name WHERE status = 'error'")
    );
    ?>
    
    <div class="daon-stats-cards">
        <div class="daon-stat-card">
            <div class="daon-stat-number"><?php echo esc_html($stats['total']); ?></div>
            <div class="daon-stat-label"><?php _e('Total Protected', 'daon-creator-protection'); ?></div>
        </div>
        <div class="daon-stat-card">
            <div class="daon-stat-number"><?php echo esc_html($stats['verified']); ?></div>
            <div class="daon-stat-label"><?php _e('Verified on Blockchain', 'daon-creator-protection'); ?></div>
        </div>
        <div class="daon-stat-card">
            <div class="daon-stat-number"><?php echo esc_html($stats['pending']); ?></div>
            <div class="daon-stat-label"><?php _e('Pending Protection', 'daon-creator-protection'); ?></div>
        </div>
        <?php if ($stats['errors'] > 0): ?>
        <div class="daon-stat-card error">
            <div class="daon-stat-number"><?php echo esc_html($stats['errors']); ?></div>
            <div class="daon-stat-label"><?php _e('Protection Errors', 'daon-creator-protection'); ?></div>
        </div>
        <?php endif; ?>
    </div>
    
    <form method="post" action="options.php">
        <?php
        settings_fields('daon_settings');
        do_settings_sections('daon_settings');
        ?>
        
        <table class="form-table" role="presentation">
            <tbody>
                <tr>
                    <th scope="row">
                        <label for="daon_auto_protect"><?php _e('Auto-Protect Content', 'daon-creator-protection'); ?></label>
                    </th>
                    <td>
                        <label for="daon_auto_protect">
                            <input name="daon_auto_protect" type="checkbox" id="daon_auto_protect" value="1" <?php checked('1', get_option('daon_auto_protect', '1')); ?> />
                            <?php _e('Automatically protect new posts and pages when published', 'daon-creator-protection'); ?>
                        </label>
                        <p class="description"><?php _e('When enabled, all new content will be automatically registered with DAON blockchain for protection.', 'daon-creator-protection'); ?></p>
                    </td>
                </tr>
                
                <tr>
                    <th scope="row">
                        <label for="daon_default_license"><?php _e('Default License', 'daon-creator-protection'); ?></label>
                    </th>
                    <td>
                        <select name="daon_default_license" id="daon_default_license">
                            <option value="liberation_v1" <?php selected('liberation_v1', get_option('daon_default_license', 'liberation_v1')); ?>><?php _e('Liberation License v1.0 (Recommended)', 'daon-creator-protection'); ?></option>
                            <option value="cc_by_nc" <?php selected('cc_by_nc', get_option('daon_default_license')); ?>><?php _e('Creative Commons BY-NC', 'daon-creator-protection'); ?></option>
                            <option value="cc_by_nc_sa" <?php selected('cc_by_nc_sa', get_option('daon_default_license')); ?>><?php _e('Creative Commons BY-NC-SA', 'daon-creator-protection'); ?></option>
                            <option value="all_rights_reserved" <?php selected('all_rights_reserved', get_option('daon_default_license')); ?>><?php _e('All Rights Reserved', 'daon-creator-protection'); ?></option>
                        </select>
                        <p class="description">
                            <?php _e('Liberation License blocks corporate AI training without compensation while allowing personal use, education, and humanitarian purposes.', 'daon-creator-protection'); ?>
                            <br>
                            <a href="https://docs.daon.network/licenses" target="_blank"><?php _e('Learn more about license options', 'daon-creator-protection'); ?></a>
                        </p>
                    </td>
                </tr>
                
                <tr>
                    <th scope="row">
                        <label for="daon_protect_post_types"><?php _e('Protect Post Types', 'daon-creator-protection'); ?></label>
                    </th>
                    <td>
                        <?php
                        $selected_types = get_option('daon_protect_post_types', array('post', 'page'));
                        $post_types = get_post_types(array('public' => true), 'objects');
                        
                        foreach ($post_types as $post_type) {
                            $checked = in_array($post_type->name, $selected_types) ? 'checked' : '';
                            echo '<label><input type="checkbox" name="daon_protect_post_types[]" value="' . esc_attr($post_type->name) . '" ' . $checked . '> ' . esc_html($post_type->labels->name) . '</label><br>';
                        }
                        ?>
                        <p class="description"><?php _e('Select which post types should be automatically protected.', 'daon-creator-protection'); ?></p>
                    </td>
                </tr>
                
                <tr>
                    <th scope="row">
                        <label for="daon_minimum_word_count"><?php _e('Minimum Word Count', 'daon-creator-protection'); ?></label>
                    </th>
                    <td>
                        <input name="daon_minimum_word_count" type="number" id="daon_minimum_word_count" value="<?php echo esc_attr(get_option('daon_minimum_word_count', '100')); ?>" min="10" max="10000" />
                        <p class="description"><?php _e('Content must have at least this many words to be protected. Prevents protection of very short posts.', 'daon-creator-protection'); ?></p>
                    </td>
                </tr>
                
                <tr>
                    <th scope="row">
                        <label for="daon_show_protection_notice"><?php _e('Show Protection Notice', 'daon-creator-protection'); ?></label>
                    </th>
                    <td>
                        <label for="daon_show_protection_notice">
                            <input name="daon_show_protection_notice" type="checkbox" id="daon_show_protection_notice" value="1" <?php checked('1', get_option('daon_show_protection_notice', '1')); ?> />
                            <?php _e('Display protection notice on protected posts and pages', 'daon-creator-protection'); ?>
                        </label>
                        <p class="description"><?php _e('Shows visitors that your content is protected by DAON blockchain verification.', 'daon-creator-protection'); ?></p>
                    </td>
                </tr>
            </tbody>
        </table>
        
        <h2><?php _e('Advanced Settings', 'daon-creator-protection'); ?></h2>
        
        <table class="form-table" role="presentation">
            <tbody>
                <tr>
                    <th scope="row">
                        <label for="daon_api_url"><?php _e('DAON API URL', 'daon-creator-protection'); ?></label>
                    </th>
                    <td>
                        <input name="daon_api_url" type="url" id="daon_api_url" value="<?php echo esc_attr(get_option('daon_api_url', 'https://api.daon.network')); ?>" class="regular-text" />
                        <p class="description"><?php _e('URL for the DAON API. Only change this if you\'re using a custom DAON deployment.', 'daon-creator-protection'); ?></p>
                    </td>
                </tr>
            </tbody>
        </table>
        
        <?php submit_button(); ?>
    </form>
    
    <div class="daon-info-section">
        <h2><?php _e('About DAON Creator Protection', 'daon-creator-protection'); ?></h2>
        
        <div class="daon-info-grid">
            <div class="daon-info-card">
                <h3>🛡️ <?php _e('What is DAON?', 'daon-creator-protection'); ?></h3>
                <p><?php _e('DAON (Digital Asset Ownership Network) provides cryptographic proof of content ownership using blockchain technology. This helps protect your creative work from unauthorized AI training and exploitation.', 'daon-creator-protection'); ?></p>
            </div>
            
            <div class="daon-info-card">
                <h3>⚖️ <?php _e('Liberation License', 'daon-creator-protection'); ?></h3>
                <p><?php _e('Our recommended license that allows personal use, education, and humanitarian purposes while blocking corporate AI training without creator compensation. Perfect for blogs and creative content.', 'daon-creator-protection'); ?></p>
            </div>
            
            <div class="daon-info-card">
                <h3>🔗 <?php _e('Blockchain Verification', 'daon-creator-protection'); ?></h3>
                <p><?php _e('Each protected post gets a unique cryptographic hash stored on the DAON blockchain, providing tamper-proof evidence of ownership and publication date.', 'daon-creator-protection'); ?></p>
            </div>
            
            <div class="daon-info-card">
                <h3>🌍 <?php _e('Global Protection', 'daon-creator-protection'); ?></h3>
                <p><?php _e('DAON protection works across platforms and jurisdictions. Your ownership proof travels with your content wherever it goes on the internet.', 'daon-creator-protection'); ?></p>
            </div>
        </div>
        
        <div class="daon-support-links">
            <h3><?php _e('Support DAON', 'daon-creator-protection'); ?></h3>
            <div class="daon-support-card" style="background: linear-gradient(135deg, #ff5e5b, #ff9500); padding: 16px; border-radius: 8px; margin-bottom: 16px; color: white;">
                <h4 style="margin-top: 0; color: white;">☕ <?php _e('Help Keep DAON Free', 'daon-creator-protection'); ?></h4>
                <p><?php _e('DAON provides free creator protection tools powered by blockchain technology. Your support helps us maintain servers, develop new features, and fight against AI exploitation of creative works.', 'daon-creator-protection'); ?></p>
                <a href="https://ko-fi.com/greenfieldoverride" target="_blank" style="
                    display: inline-block;
                    background: white;
                    color: #ff5e5b;
                    padding: 8px 16px;
                    text-decoration: none;
                    border-radius: 4px;
                    font-weight: bold;
                    margin-top: 8px;
                "><?php _e('Support on Ko-fi', 'daon-creator-protection'); ?></a>
            </div>
            
            <h3><?php _e('Need Help?', 'daon-creator-protection'); ?></h3>
            <ul>
                <li><a href="https://docs.daon.network" target="_blank"><?php _e('Documentation', 'daon-creator-protection'); ?></a></li>
                <li><a href="https://community.daon.network" target="_blank"><?php _e('Community Support', 'daon-creator-protection'); ?></a></li>
                <li><a href="https://ko-fi.com/greenfieldoverride" target="_blank"><?php _e('Support Development', 'daon-creator-protection'); ?></a></li>
                <li><a href="https://daon.network/contact" target="_blank"><?php _e('Contact Support', 'daon-creator-protection'); ?></a></li>
                <li><a href="https://github.com/daon-network/wordpress-plugin" target="_blank"><?php _e('GitHub Repository', 'daon-creator-protection'); ?></a></li>
            </ul>
        </div>
    </div>
</div>