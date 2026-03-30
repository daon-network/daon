<?php

namespace Daon;

use GuzzleHttp\Client as HttpClient;
use GuzzleHttp\Exception\GuzzleException;
use GuzzleHttp\Exception\RequestException;

/**
 * DAON Creator Protection Client for PHP
 * 
 * Provides easy integration with DAON blockchain for content protection.
 * Perfect for WordPress, Laravel, Symfony and other PHP applications.
 */
class DaonClient
{
    private const DEFAULT_API_URL = 'https://api.daon.network';
    private const DEFAULT_CHAIN_ID = 'daon-mainnet-1';
    private const DEFAULT_TIMEOUT = 30;
    private const DEFAULT_RETRIES = 3;
    private const DEFAULT_LICENSE = 'liberation_v1';

    private string $apiUrl;
    private string $chainId;
    private int $timeout;
    private int $retries;
    private string $defaultLicense;
    private HttpClient $httpClient;

    public function __construct(array $config = [], HttpClient $httpClient = null)
    {
        $this->apiUrl = $config['api_url'] ?? self::DEFAULT_API_URL;
        $this->chainId = $config['chain_id'] ?? self::DEFAULT_CHAIN_ID;
        $this->timeout = $config['timeout'] ?? self::DEFAULT_TIMEOUT;
        $this->retries = $config['retries'] ?? self::DEFAULT_RETRIES;
        $this->defaultLicense = $config['default_license'] ?? self::DEFAULT_LICENSE;

        $this->httpClient = $httpClient ?? new HttpClient([
            'base_uri' => $this->apiUrl,
            'timeout' => $this->timeout,
            'headers' => [
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'User-Agent' => 'DAON-PHP-SDK/1.0.0',
            ],
        ]);
    }

    /**
     * Protect content with DAON blockchain
     */
    public function protect(ProtectionRequest $request): ProtectionResult
    {
        try {
            $this->validateContent($request->getContent());

            $license = $request->getLicense() ?? $this->defaultLicense;

            $payload = [
                'content' => $request->getContent(),
                'metadata' => $this->normalizeMetadata($request->getMetadata()),
                'license' => $license,
            ];

            $response = $this->postWithRetry('/api/v1/protect', $payload);

            $apiHash = $response['contentHash'] ?? null;
            $contentHash = $apiHash ? "sha256:{$apiHash}" : $this->generateContentHash($request->getContent());
            $blockchainTx = $response['blockchainTx'] ?? $response['blockchain']['tx'] ?? null;

            return new ProtectionResult([
                'success' => $response['success'] ?? false,
                'content_hash' => $contentHash,
                'tx_hash' => $blockchainTx,
                'verification_url' => $response['verificationUrl'] ?? null,
                'blockchain_url' => $blockchainTx
                    ? "https://explorer.daon.network/tx/{$blockchainTx}"
                    : null,
                'timestamp' => isset($response['timestamp']) ? new \DateTime($response['timestamp']) : new \DateTime(),
            ]);

        } catch (\Exception $e) {
            return new ProtectionResult([
                'success' => false,
                'content_hash' => $this->generateContentHash($request->getContent()),
                'error' => $e->getMessage(),
                'timestamp' => new \DateTime(),
            ]);
        }
    }

    /**
     * Verify content protection status
     */
    public function verify(string $contentOrHash): VerificationResult
    {
        try {
            $contentHash = str_starts_with($contentOrHash, 'sha256:')
                ? $contentOrHash
                : $this->generateContentHash($contentOrHash);

            // API expects 64-char hex only — strip sha256: prefix
            $apiHash = str_starts_with($contentHash, 'sha256:') ? substr($contentHash, 7) : $contentHash;
            $response = $this->getWithRetry("/api/v1/verify/{$apiHash}");

            return new VerificationResult([
                'verified' => $response['isValid'] ?? false,
                'content_hash' => $contentHash,
                'license' => $response['license'] ?? null,
                'timestamp' => isset($response['timestamp']) ? new \DateTime($response['timestamp']) : null,
                'verification_url' => $response['verificationUrl'] ?? null,
                'blockchain_url' => "https://explorer.daon.network/content/{$apiHash}",
            ]);

        } catch (\Exception $e) {
            return new VerificationResult([
                'verified' => false,
                'content_hash' => str_starts_with($contentOrHash, 'sha256:')
                    ? $contentOrHash
                    : $this->generateContentHash($contentOrHash),
                'error' => $e->getMessage(),
            ]);
        }
    }

    /**
     * Check Liberation License compliance (evaluated locally — no API endpoint)
     */
    public function checkLiberationCompliance(string $contentHash, LiberationUseCase $useCase): LiberationCheckResult
    {
        $entityType = $useCase->getEntityType();
        $useType = $useCase->getUseType();
        $purpose = $useCase->getPurpose();
        $compensation = $useCase->isCompensated();

        if ($entityType === 'corporation' && $useType === 'ai_training' && !$compensation) {
            return new LiberationCheckResult([
                'compliant' => false,
                'reason' => 'Commercial AI training without creator compensation violates the Liberation License.',
                'use_case' => $useCase,
                'recommendations' => [
                    'Obtain explicit permission from the creator',
                    'Compensate creators for use in AI training datasets',
                ],
            ]);
        }

        if ($entityType === 'corporation' && $purpose === 'profit' && !$compensation) {
            return new LiberationCheckResult([
                'compliant' => false,
                'reason' => 'Corporate profit extraction without creator compensation violates the Liberation License.',
                'use_case' => $useCase,
                'recommendations' => [
                    'Negotiate a licensing agreement with the creator',
                    'Include creator compensation in your budget',
                ],
            ]);
        }

        return new LiberationCheckResult([
            'compliant' => true,
            'reason' => 'Use case is compliant with Liberation License terms.',
            'use_case' => $useCase,
        ]);
    }

    /**
     * Bulk protect multiple works
     */
    public function protectBatch(array $requests): array
    {
        $results = [];
        
        // Process in batches of 10
        $chunks = array_chunk($requests, 10);
        
        foreach ($chunks as $chunk) {
            $chunkResults = [];
            foreach ($chunk as $request) {
                $chunkResults[] = $this->protect($request);
            }
            $results = array_merge($results, $chunkResults);
            
            // Rate limiting
            if (count($chunks) > 1) {
                usleep(100000); // 100ms
            }
        }
        
        return $results;
    }

    /**
     * Bulk verify multiple content hashes
     */
    public function verifyBatch(array $contentHashes): array
    {
        $results = [];

        // Process in batches of 50 using individual verification
        $chunks = array_chunk($contentHashes, 50);

        foreach ($chunks as $chunk) {
            foreach ($chunk as $hash) {
                $results[] = $this->verify($hash);
            }

            // Rate limiting
            if (count($chunks) > 1) {
                usleep(100000); // 100ms
            }
        }

        return $results;
    }

    /**
     * Generate content hash (raw SHA-256, matching the API's hash function exactly)
     */
    public function generateContentHash(string $content): string
    {
        $hash = hash('sha256', $content);
        return "sha256:{$hash}";
    }

    /**
     * Normalize content for consistent hashing
     */
    private function normalizeContent(string $content): string
    {
        // Normalize line endings and whitespace
        $normalized = str_replace(["\r\n", "\r"], "\n", $content);
        $normalized = preg_replace('/[ \t]+/', ' ', $normalized);
        $normalized = preg_replace('/\n{3,}/', "\n\n", $normalized);
        return trim($normalized);
    }

    /**
     * Validate content
     */
    private function validateContent(string $content): void
    {
        if (empty(trim($content))) {
            throw new \InvalidArgumentException('Content cannot be empty');
        }
        
        if (strlen($content) < 10) {
            throw new \InvalidArgumentException('Content must be at least 10 characters');
        }
        
        if (strlen($content) > 10 * 1024 * 1024) {
            throw new \InvalidArgumentException('Content is too large (>10MB)');
        }
    }

    /**
     * Normalize metadata
     */
    private function normalizeMetadata(array $metadata): array
    {
        $normalized = [];
        
        foreach ($metadata as $key => $value) {
            if ($value === null || $value === '') {
                continue;
            }
            
            switch (strtolower($key)) {
                case 'published_at':
                case 'updated_at':
                    if ($value instanceof \DateTime) {
                        $normalized[$key] = $value->format(\DateTime::ISO8601);
                    } else {
                        $normalized[$key] = $value;
                    }
                    break;
                    
                case 'fandoms':
                case 'characters':
                case 'relationships':
                case 'tags':
                case 'warnings':
                case 'categories':
                    $normalized[$key] = is_array($value) ? $value : [$value];
                    break;
                    
                default:
                    $normalized[$key] = $value;
            }
        }
        
        return $normalized;
    }

    /**
     * Detect platform from environment
     */
    private function detectPlatform(): string
    {
        // Check for WordPress
        if (defined('ABSPATH') || function_exists('wp_version')) {
            return 'wordpress';
        }
        
        // Check for Laravel
        if (class_exists('Illuminate\\Foundation\\Application')) {
            return 'laravel';
        }
        
        // Check for Symfony
        if (class_exists('Symfony\\Component\\HttpKernel\\Kernel')) {
            return 'symfony';
        }
        
        return 'php';
    }

    /**
     * Generate creator ID for anonymous protection
     */
    private function generateCreatorId(): string
    {
        $backtrace = debug_backtrace(DEBUG_BACKTRACE_IGNORE_ARGS);
        $stack = serialize($backtrace);
        $hash = hash('sha256', $stack);
        return "anonymous_" . substr($hash, 0, 16);
    }

    /**
     * HTTP helpers with retry logic
     */
    private function getWithRetry(string $path, int $retries = null): array
    {
        $retries = $retries ?? $this->retries;
        
        try {
            $response = $this->httpClient->get($path);
            return json_decode($response->getBody()->getContents(), true);
        } catch (RequestException $e) {
            if ($retries > 0 && $this->isRetryableError($e)) {
                sleep(1);
                return $this->getWithRetry($path, $retries - 1);
            }
            throw new NetworkError("Failed to connect to DAON network: " . $e->getMessage());
        }
    }

    private function postWithRetry(string $path, array $data, int $retries = null): array
    {
        $retries = $retries ?? $this->retries;
        
        try {
            $response = $this->httpClient->post($path, [
                'json' => $data,
            ]);
            return json_decode($response->getBody()->getContents(), true);
        } catch (RequestException $e) {
            if ($retries > 0 && $this->isRetryableError($e)) {
                sleep(1);
                return $this->postWithRetry($path, $data, $retries - 1);
            }
            throw new NetworkError("Failed to connect to DAON network: " . $e->getMessage());
        }
    }

    private function isRetryableError(RequestException $e): bool
    {
        if ($e->hasResponse()) {
            $statusCode = $e->getResponse()->getStatusCode();
            return $statusCode >= 500;
        }
        
        // Network errors are retryable
        return true;
    }
}

/**
 * Exception classes
 */
class DaonException extends \Exception {}
class NetworkError extends DaonException {}
class ValidationError extends DaonException {}
class ProtectionError extends DaonException {}