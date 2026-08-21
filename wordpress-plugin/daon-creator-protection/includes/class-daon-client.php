<?php

if (!defined('ABSPATH')) {
    exit;
}

/**
 * DAON Client for WordPress
 * Simplified version of the full PHP SDK for WordPress integration
 */
class DAON_Client {
    
    private $api_url;
    private $timeout;
    private $retries;
    
    public function __construct() {
        $this->api_url = get_option('daon_api_url', 'https://api.daon.network');
        $this->timeout = 30;
        $this->retries = 3;
    }
    
    /**
     * Protect content with DAON blockchain
     */
    public function protect_content($content, $metadata = array(), $license = 'liberation_v1') {
        try {
            $content_hash = $this->generate_content_hash($content);
            
            $payload = array(
                'content_hash' => $content_hash,
                'creator' => $this->get_creator_address(),
                'license' => $license,
                'platform' => 'wordpress',
                'metadata' => $this->normalize_metadata($metadata)
            );
            
            $response = $this->post_with_retry('/api/v1/protect', $payload);
            
            if ($response && isset($response['success']) && $response['success']) {
                return array(
                    'success' => true,
                    'content_hash' => $content_hash,
                    'tx_hash' => $response['tx_hash'] ?? null,
                    'verification_url' => $response['verification_url'] ?? null,
                    'blockchain_url' => isset($response['tx_hash']) 
                        ? "https://api.daon.network/api/v1/verify/{$response['tx_hash']}" 
                        : null
                );
            } else {
                return array(
                    'success' => false,
                    'error' => $response['error'] ?? 'Unknown error'
                );
            }
            
        } catch (Exception $e) {
            return array(
                'success' => false,
                'error' => $e->getMessage()
            );
        }
    }
    
    /**
     * Verify content protection
     */
    public function verify_content($content_hash) {
        try {
            $response = $this->get_with_retry("/api/v1/verify/{$content_hash}");
            
            if ($response) {
                return array(
                    'verified' => $response['verified'] ?? false,
                    'content_hash' => $content_hash,
                    'creator' => $response['creator'] ?? null,
                    'license' => $response['license'] ?? null,
                    'timestamp' => $response['timestamp'] ?? null,
                    'verification_url' => $response['verification_url'] ?? null
                );
            }
            
            return array('verified' => false, 'content_hash' => $content_hash);
            
        } catch (Exception $e) {
            return array(
                'verified' => false,
                'content_hash' => $content_hash,
                'error' => $e->getMessage()
            );
        }
    }
    
    /**
     * Generate content hash
     */
    public function generate_content_hash($content) {
        $normalized = $this->normalize_content($content);

        // Content that vanishes under tag stripping -- a post that is only an
        // image, a scanned page -- would otherwise hash to the SHA-256 of the
        // empty string, which every such post shares. The API refuses these;
        // the plugin must refuse them identically or it will send a hash the
        // API would never have produced.
        if ( $content !== '' && trim( $normalized ) === '' ) {
            return new WP_Error(
                'daon_no_text_content',
                __( 'This content has no text once markup is removed. Images and scanned pages cannot be protected through the text path.', 'daon-creator-protection' )
            );
        }

        $hash = hash('sha256', $normalized);
        return "sha256:{$hash}";
    }
    
    /**
     * Normalize content for consistent hashing.
     *
     * Must match api-server/src/utils/content-canonical.ts exactly. The plugin
     * hashes locally and sends the hash, so any disagreement between the two
     * means WordPress content reports as unregistered when it is registered.
     *
     * Whitespace is deliberately NOT collapsed. An earlier version squeezed runs
     * of spaces and tabs to a single space, which silently destroyed the
     * indentation of poetry and code samples and produced a hash the API could
     * never reproduce. See docs/design/document-formats.md.
     */
    private function normalize_content($content) {
        // A line ending is a platform artifact, not an authorial choice, so the
        // same text from Windows and from a Mac must hash the same. Spacing
        // *within* a line is authorial and is left alone.
        $content = preg_replace('/\r\n?/', "\n", $content);

        // Block boundaries become newlines so paragraphs do not run together.
        $content = preg_replace('/<br\s*\/?' . '>/i', "\n", $content);
        $content = preg_replace(
            '/<\/?(p|div|section|article|h[1-6]|li|tr|blockquote|pre|figcaption|header|footer|main|aside|ul|ol|table|hr)\b[^>]*>/i',
            "\n",
            $content
        );

        // What wp_strip_all_tags does, minus its trim(). That trim is applied
        // unconditionally and would strip the leading indentation of the first
        // line -- the exact thing this normaliser exists to preserve -- so the
        // helper cannot be used here however convenient it looks.
        $content = preg_replace('@<(script|style)[^>]*?>.*?</\1>@si', '', $content);
        $content = strip_tags($content);

        // Only the five predefined entities, matching the API. ENT_QUOTES so
        // &apos; and &quot; are handled; unknown entities are left as written.
        $content = html_entity_decode($content, ENT_QUOTES | ENT_XML1, 'UTF-8');

        // Runs of blank lines left behind by tag removal, and nothing else.
        $content = preg_replace('/\n{3,}/', "\n\n", $content);

        // Whitespace-only lines at each end. Not trim(), which would eat the
        // leading indentation of a preformatted block.
        $content = preg_replace('/\A(?:[ \t]*\n)+/', '', $content);
        $content = preg_replace('/(?:\n[ \t]*)+\z/', '', $content);

        return $content;
    }
    
    /**
     * Normalize metadata
     */
    private function normalize_metadata($metadata) {
        $normalized = array();
        
        foreach ($metadata as $key => $value) {
            if (empty($value)) {
                continue;
            }
            
            if (in_array($key, array('categories', 'tags')) && !is_array($value)) {
                $value = array($value);
            }
            
            $normalized[$key] = $value;
        }
        
        return $normalized;
    }
    
    /**
     * Get creator address (simplified for WordPress)
     */
    private function get_creator_address() {
        // In a full implementation, this would be a proper wallet address
        // For now, we'll use a WordPress-specific identifier
        $site_url = get_site_url();
        $user_id = get_current_user_id();
        
        return "wp_{$user_id}_" . md5($site_url);
    }
    
    /**
     * HTTP GET with retry logic
     */
    private function get_with_retry($path, $retries = null) {
        $retries = $retries ?? $this->retries;
        
        $url = rtrim($this->api_url, '/') . $path;
        
        $args = array(
            'timeout' => $this->timeout,
            'headers' => array(
                'Accept' => 'application/json',
                'User-Agent' => 'DAON-WordPress-Plugin/' . DAON_PLUGIN_VERSION
            )
        );
        
        $response = wp_remote_get($url, $args);
        
        if (is_wp_error($response)) {
            if ($retries > 0) {
                sleep(1);
                return $this->get_with_retry($path, $retries - 1);
            }
            throw new Exception('Network error: ' . $response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code >= 500 && $retries > 0) {
            sleep(1);
            return $this->get_with_retry($path, $retries - 1);
        }
        
        if ($status_code !== 200) {
            throw new Exception("HTTP Error {$status_code}");
        }
        
        $body = wp_remote_retrieve_body($response);
        return json_decode($body, true);
    }
    
    /**
     * HTTP POST with retry logic
     */
    private function post_with_retry($path, $data, $retries = null) {
        $retries = $retries ?? $this->retries;
        
        $url = rtrim($this->api_url, '/') . $path;
        
        $args = array(
            'method' => 'POST',
            'timeout' => $this->timeout,
            'headers' => array(
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'User-Agent' => 'DAON-WordPress-Plugin/' . DAON_PLUGIN_VERSION
            ),
            'body' => json_encode($data)
        );
        
        $response = wp_remote_post($url, $args);
        
        if (is_wp_error($response)) {
            if ($retries > 0) {
                sleep(1);
                return $this->post_with_retry($path, $data, $retries - 1);
            }
            throw new Exception('Network error: ' . $response->get_error_message());
        }
        
        $status_code = wp_remote_retrieve_response_code($response);
        
        if ($status_code >= 500 && $retries > 0) {
            sleep(1);
            return $this->post_with_retry($path, $data, $retries - 1);
        }
        
        if (!in_array($status_code, array(200, 201))) {
            $body = wp_remote_retrieve_body($response);
            $error_data = json_decode($body, true);
            throw new Exception($error_data['error'] ?? "HTTP Error {$status_code}");
        }
        
        $body = wp_remote_retrieve_body($response);
        return json_decode($body, true);
    }
}