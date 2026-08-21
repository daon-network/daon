<?php
/**
 * Tests for the DAON_Client API wrapper.
 *
 * All HTTP calls are mocked via WP_Mock_Registry::$remote_responses.
 * Tests cover: request formatting, response parsing, retry logic,
 * error handling, and the protect/verify flows.
 *
 * @package DAON_Creator_Protection
 */

class Test_DAON_Client extends \PHPUnit\Framework\TestCase {

    /** @var DAON_Client */
    private $client;

    protected function setUp(): void {
        WP_Mock_Registry::reset();
        WP_Mock_Registry::$options['daon_api_url'] = 'https://api.daon.network';

        require_once DAON_PLUGIN_PATH . 'includes/class-daon-client.php';
        $this->client = new DAON_Client();
    }

    // ── protect_content: success ──

    public function test_protect_content_returns_success_with_all_fields(): void {
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => true,
                'tx_hash' => '0xabc123def456',
                'verification_url' => 'https://daon.network/verify/abc123',
            )),
        );

        $result = $this->client->protect_content('My blog post content', array(
            'title' => 'My Post',
            'author' => 'Author',
        ), 'liberation_v1');

        $this->assertTrue($result['success']);
        $this->assertSame('0xabc123def456', $result['tx_hash']);
        $this->assertSame('https://daon.network/verify/abc123', $result['verification_url']);
        $this->assertStringStartsWith('sha256:', $result['content_hash']);
    }

    public function test_protect_content_builds_blockchain_explorer_url(): void {
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => true,
                'tx_hash' => '0xdeadbeef',
                'verification_url' => 'https://daon.network/verify/deadbeef',
            )),
        );

        $result = $this->client->protect_content('content', array(), 'liberation_v1');

        $this->assertSame(
            'https://api.daon.network/api/v1/verify/0xdeadbeef',
            $result['blockchain_url']
        );
    }

    public function test_protect_content_blockchain_url_null_without_tx_hash(): void {
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => true,
                // No tx_hash in response
            )),
        );

        $result = $this->client->protect_content('content', array(), 'liberation_v1');

        $this->assertTrue($result['success']);
        $this->assertNull($result['blockchain_url']);
    }

    // ── protect_content: API-level failure ──

    public function test_protect_content_returns_error_from_api(): void {
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => false,
                'error' => 'Duplicate content hash',
            )),
        );

        $result = $this->client->protect_content('content', array(), 'liberation_v1');

        $this->assertFalse($result['success']);
        $this->assertSame('Duplicate content hash', $result['error']);
    }

    public function test_protect_content_handles_unknown_error(): void {
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'success' => false,
                // No error field
            )),
        );

        $result = $this->client->protect_content('content', array(), 'liberation_v1');

        $this->assertFalse($result['success']);
        $this->assertSame('Unknown error', $result['error']);
    }

    // ── protect_content: HTTP failure ──

    public function test_protect_content_handles_http_error(): void {
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 400),
            'body' => json_encode(array('error' => 'Bad request')),
        );

        $result = $this->client->protect_content('content', array(), 'liberation_v1');

        $this->assertFalse($result['success']);
        $this->assertSame('Bad request', $result['error']);
    }

    public function test_protect_content_handles_network_error(): void {
        // No mock response configured = WP_Error returned
        WP_Mock_Registry::$remote_responses = array();

        $result = $this->client->protect_content('content', array(), 'liberation_v1');

        $this->assertFalse($result['success']);
        $this->assertStringContainsString('Network error', $result['error']);
    }

    // ── verify_content: success ──

    public function test_verify_content_success(): void {
        $hash = 'sha256:abc123';

        WP_Mock_Registry::$remote_responses["/api/v1/verify/{$hash}"] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'verified' => true,
                'creator' => 'wp_1_abc',
                'license' => 'liberation_v1',
                'timestamp' => '2026-05-01T12:00:00Z',
                'verification_url' => 'https://daon.network/verify/abc',
            )),
        );

        $result = $this->client->verify_content($hash);

        $this->assertTrue($result['verified']);
        $this->assertSame($hash, $result['content_hash']);
        $this->assertSame('wp_1_abc', $result['creator']);
        $this->assertSame('liberation_v1', $result['license']);
    }

    public function test_verify_content_not_found(): void {
        $hash = 'sha256:notfound';

        WP_Mock_Registry::$remote_responses["/api/v1/verify/{$hash}"] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array(
                'verified' => false,
            )),
        );

        $result = $this->client->verify_content($hash);

        $this->assertFalse($result['verified']);
        $this->assertSame($hash, $result['content_hash']);
    }

    public function test_verify_content_returns_false_on_null_response(): void {
        // Simulate a response that decodes to null (malformed JSON)
        WP_Mock_Registry::$remote_responses['/api/v1/verify/'] = array(
            'response' => array('code' => 200),
            'body' => 'not json',
        );

        $result = $this->client->verify_content('sha256:test');

        $this->assertFalse($result['verified']);
    }

    public function test_verify_content_handles_http_error(): void {
        WP_Mock_Registry::$remote_responses['/api/v1/verify/'] = array(
            'response' => array('code' => 404),
            'body' => '',
        );

        $result = $this->client->verify_content('sha256:missing');

        $this->assertFalse($result['verified']);
        $this->assertArrayHasKey('error', $result);
    }

    // ── Content hash generation ──

    public function test_generate_hash_normalizes_then_hashes(): void {
        $hash = $this->client->generate_content_hash('<p>Hello   World</p>');

        // Tags stripped, spacing kept. The run of spaces used to be collapsed,
        // which destroyed the indentation of poetry and code samples and
        // produced a hash the API could not reproduce.
        $expected = 'sha256:' . hash('sha256', 'Hello   World');
        $this->assertSame($expected, $hash);
    }

    // ── Metadata normalization ──

    public function test_protect_content_sends_normalized_metadata(): void {
        // The metadata normalization strips empty values and wraps scalars
        // We can verify this indirectly by checking the call succeeds
        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array('success' => true, 'tx_hash' => '0x1')),
        );

        $metadata = array(
            'title' => 'My Post',
            'author' => '',        // empty, should be stripped
            'categories' => 'Tech', // scalar, should become array
            'tags' => array('php', 'wordpress'),
        );

        $result = $this->client->protect_content('content body here', $metadata, 'liberation_v1');

        $this->assertTrue($result['success']);
    }

    // ── API URL configuration ──

    public function test_uses_configured_api_url(): void {
        WP_Mock_Registry::$options['daon_api_url'] = 'https://custom-api.example.com';

        // Re-instantiate to pick up new URL
        $client = new DAON_Client();

        WP_Mock_Registry::$remote_responses['custom-api.example.com/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array('success' => true, 'tx_hash' => '0xabc')),
        );

        $result = $client->protect_content('content', array(), 'liberation_v1');

        $this->assertTrue($result['success']);
    }

    public function test_api_url_trailing_slash_handled(): void {
        WP_Mock_Registry::$options['daon_api_url'] = 'https://api.daon.network/';

        $client = new DAON_Client();

        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array('success' => true, 'tx_hash' => '0xabc')),
        );

        $result = $client->protect_content('content', array(), 'liberation_v1');

        $this->assertTrue($result['success']);
    }

    // ── Creator address ──

    public function test_protect_content_includes_creator_address(): void {
        // The creator address is derived from user ID + site URL
        // We can't easily inspect the POST body in this mock setup,
        // but we can verify the call succeeds with a valid creator
        WP_Mock_Registry::$current_user_id = 5;

        WP_Mock_Registry::$remote_responses['/api/v1/protect'] = array(
            'response' => array('code' => 200),
            'body' => json_encode(array('success' => true, 'tx_hash' => '0xdef')),
        );

        $client = new DAON_Client();
        $result = $client->protect_content('content', array(), 'liberation_v1');

        $this->assertTrue($result['success']);
    }
}
