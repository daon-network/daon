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
                        ? "https://explorer.daon.network/tx/{$response['tx_hash']}" 
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
        $hash = hash('sha256', $normalized);
        return "sha256:{$hash}";
    }
    
    /**
     * Normalize content for consistent hashing
     */
    private function normalize_content($content) {
        // Remove HTML tags
        $content = wp_strip_all_tags($content);
        
        // Normalize line endings and whitespace
        $content = str_replace(array("\r\n", "\r"), "\n", $content);
        $content = preg_replace('/[ \t]+/', ' ', $content);
        $content = preg_replace('/\n{3,}/', "\n\n", $content);
        
        return trim($content);
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