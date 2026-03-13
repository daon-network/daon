/**
 * DAON Creator Protection SDK for Node.js
 *
 * Provides easy integration with DAON blockchain for content protection.
 * Perfect for Next.js, Express, and other Node.js applications.
 */
import { createHash } from 'crypto';
export class DAONClient {
    constructor(config = {}) {
        this.config = {
            apiUrl: config.apiUrl || 'https://api.daon.network',
            chainId: config.chainId || 'daon-mainnet-1',
            timeout: config.timeout || 30000,
            retries: config.retries || 3,
            defaultLicense: config.defaultLicense || 'liberation_v1'
        };
    }
    /**
     * Protect content with DAON blockchain
     */
    async protect(request) {
        try {
            this.validateContent(request.content);
            const contentHash = this.generateContentHash(request.content);
            const license = request.license || this.config.defaultLicense;
            const payload = {
                content_hash: contentHash,
                creator: request.creatorAddress || this.generateCreatorId(),
                license,
                platform: this.detectPlatform(),
                metadata: this.normalizeMetadata(request.metadata || {})
            };
            const data = await this.postWithRetry('/api/v1/protect', payload);
            return {
                success: data.success,
                contentHash,
                txHash: data.tx_hash,
                verificationUrl: data.verification_url,
                blockchainUrl: data.tx_hash ? `https://explorer.daon.network/tx/${data.tx_hash}` : undefined,
                timestamp: new Date().toISOString()
            };
        }
        catch (error) {
            return {
                success: false,
                contentHash: this.generateContentHash(request.content),
                error: error instanceof Error ? error.message : 'Protection failed',
                timestamp: new Date().toISOString()
            };
        }
    }
    /**
     * Verify content protection status
     */
    async verify(contentOrHash) {
        try {
            const contentHash = contentOrHash.startsWith('sha256:')
                ? contentOrHash
                : this.generateContentHash(contentOrHash);
            const data = await this.getWithRetry(`/api/v1/verify/${contentHash}`);
            return {
                verified: data.verified,
                contentHash,
                creator: data.creator,
                license: data.license,
                timestamp: data.timestamp ? new Date(data.timestamp * 1000).toISOString() : undefined,
                platform: data.platform,
                verificationUrl: data.verification_url,
                blockchainUrl: `https://explorer.daon.network/content/${contentHash}`
            };
        }
        catch (error) {
            return {
                verified: false,
                contentHash: contentOrHash.startsWith('sha256:') ? contentOrHash : this.generateContentHash(contentOrHash),
                error: error instanceof Error ? error.message : 'Verification failed'
            };
        }
    }
    /**
     * Check Liberation License compliance
     */
    async checkLiberationCompliance(contentHash, useCase) {
        try {
            const payload = {
                content_hash: contentHash,
                entity_type: useCase.entityType,
                use_type: useCase.useType,
                purpose: useCase.purpose,
                compensation: useCase.compensation,
                metadata: useCase.metadata
            };
            const data = await this.postWithRetry('/api/v1/liberation/check', payload);
            return {
                compliant: data.compliant,
                reason: data.reason,
                useCase,
                recommendations: data.recommendations
            };
        }
        catch (error) {
            return {
                compliant: false,
                reason: error instanceof Error ? error.message : 'Compliance check failed',
                useCase
            };
        }
    }
    /**
     * Bulk protect multiple works
     */
    async protectBatch(requests) {
        const results = [];
        // Process in batches of 10
        for (let i = 0; i < requests.length; i += 10) {
            const batch = requests.slice(i, i + 10);
            const batchResults = await Promise.all(batch.map(request => this.protect(request)));
            results.push(...batchResults);
            // Rate limiting
            if (i + 10 < requests.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return results;
    }
    /**
     * Bulk verify multiple content hashes
     */
    async verifyBatch(contentHashes) {
        const results = [];
        // Process in batches of 50
        for (let i = 0; i < contentHashes.length; i += 50) {
            const batch = contentHashes.slice(i, i + 50);
            try {
                const data = await this.postWithRetry('/api/v1/verify/batch', {
                    content_hashes: batch
                });
                const batchResults = data.results.map((result) => ({
                    verified: result.verified,
                    contentHash: result.content_hash,
                    creator: result.creator,
                    license: result.license,
                    timestamp: result.timestamp ? new Date(result.timestamp * 1000).toISOString() : undefined,
                    platform: result.platform,
                    verificationUrl: result.verification_url,
                    blockchainUrl: `https://explorer.daon.network/content/${result.content_hash}`
                }));
                results.push(...batchResults);
            }
            catch (error) {
                // Fallback to individual verification
                const individualResults = await Promise.all(batch.map(hash => this.verify(hash)));
                results.push(...individualResults);
            }
            // Rate limiting
            if (i + 50 < contentHashes.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        return results;
    }
    /**
     * Generate content hash
     */
    generateContentHash(content) {
        const normalized = this.normalizeContent(content);
        const hash = createHash('sha256').update(normalized, 'utf8').digest('hex');
        return `sha256:${hash}`;
    }
    /**
     * Validate content
     */
    validateContent(content) {
        if (!content || content.trim().length === 0) {
            throw new Error('Content cannot be empty');
        }
        if (content.length < 10) {
            throw new Error('Content must be at least 10 characters');
        }
        if (Buffer.byteLength(content, 'utf8') > 10 * 1024 * 1024) {
            throw new Error('Content is too large (>10MB)');
        }
    }
    /**
     * Normalize content for consistent hashing
     */
    normalizeContent(content) {
        return content
            .replace(/\r\n/g, '\n') // Normalize line endings
            .replace(/\r/g, '\n') // Handle old Mac line endings
            .replace(/[ \t]+/g, ' ') // Normalize spaces and tabs
            .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
            .trim(); // Remove leading/trailing whitespace
    }
    /**
     * Normalize metadata
     */
    normalizeMetadata(metadata) {
        const normalized = {};
        Object.keys(metadata).forEach(key => {
            const value = metadata[key];
            switch (key.toLowerCase()) {
                case 'publishedat':
                case 'updatedat':
                    normalized[key] = value instanceof Date ? value.toISOString() : value;
                    break;
                case 'fandoms':
                case 'characters':
                case 'relationships':
                case 'tags':
                case 'warnings':
                case 'categories':
                    normalized[key] = Array.isArray(value) ? value : [value].filter(Boolean);
                    break;
                default:
                    normalized[key] = value;
            }
        });
        return normalized;
    }
    /**
     * Detect platform from environment
     */
    detectPlatform() {
        // Check for common Node.js frameworks
        if (process.env.NEXT_PHASE)
            return 'nextjs';
        if (process.env.NUXT_ENV_CURRENT_ENV)
            return 'nuxtjs';
        if (process.env.NODE_ENV === 'development' && process.env.PWD?.includes('express'))
            return 'express';
        return 'nodejs';
    }
    /**
     * Generate creator ID for anonymous protection
     */
    generateCreatorId() {
        const stack = new Error().stack || 'unknown';
        const hash = createHash('sha256').update(stack).digest('hex');
        return `anonymous_${hash.substring(0, 16)}`;
    }
    /**
     * HTTP helpers with retry logic using native fetch
     */
    get defaultHeaders() {
        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'DAON-Node-SDK/1.0.0'
        };
    }
    async fetchWithTimeout(url, options) {
        const signal = AbortSignal.timeout(this.config.timeout);
        return fetch(url, { ...options, signal });
    }
    async getWithRetry(path, retries = this.config.retries) {
        try {
            const response = await this.fetchWithTimeout(`${this.config.apiUrl}${path}`, {
                method: 'GET',
                headers: this.defaultHeaders
            });
            if (!response.ok) {
                const err = new Error(`HTTP ${response.status}`);
                err.status = response.status;
                throw err;
            }
            return response.json();
        }
        catch (error) {
            if (retries > 0 && this.isRetryableError(error)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.getWithRetry(path, retries - 1);
            }
            throw error;
        }
    }
    async postWithRetry(path, data, retries = this.config.retries) {
        try {
            const response = await this.fetchWithTimeout(`${this.config.apiUrl}${path}`, {
                method: 'POST',
                headers: this.defaultHeaders,
                body: JSON.stringify(data)
            });
            if (!response.ok) {
                const err = new Error(`HTTP ${response.status}`);
                err.status = response.status;
                throw err;
            }
            return response.json();
        }
        catch (error) {
            if (retries > 0 && this.isRetryableError(error)) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                return this.postWithRetry(path, data, retries - 1);
            }
            throw error;
        }
    }
    isRetryableError(error) {
        // Network-level failures (fetch throws TypeError for connection errors)
        if (error instanceof TypeError)
            return true;
        // Retry on 5xx server errors but not 4xx client errors
        if (error.status !== undefined)
            return error.status >= 500;
        return false;
    }
}
// Export convenience functions
export const protect = async (content, metadata, license) => {
    const client = new DAONClient();
    return client.protect({ content, metadata, license });
};
export const verify = async (contentOrHash) => {
    const client = new DAONClient();
    return client.verify(contentOrHash);
};
export const generateContentHash = (content) => {
    const client = new DAONClient();
    return client.generateContentHash(content);
};
// Default export
export default DAONClient;
//# sourceMappingURL=index.js.map