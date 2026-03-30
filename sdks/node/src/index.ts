/**
 * DAON Creator Protection SDK for Node.js
 *
 * Provides easy integration with DAON blockchain for content protection.
 * Perfect for Next.js, Express, and other Node.js applications.
 */

import { createHash } from 'crypto';

export interface DAONConfig {
  apiUrl?: string;
  chainId?: string;
  timeout?: number;
  retries?: number;
  defaultLicense?: string;
}

export interface ContentMetadata {
  title?: string;
  author?: string;
  fandoms?: string[];
  characters?: string[];
  relationships?: string[];
  tags?: string[];
  rating?: string;
  warnings?: string[];
  categories?: string[];
  wordCount?: number;
  chapters?: string;
  language?: string;
  publishedAt?: string | Date;
  updatedAt?: string | Date;
  url?: string;
  [key: string]: any;
}

export interface ProtectionRequest {
  content: string;
  metadata?: ContentMetadata;
  license?: string;
  creatorAddress?: string;
}

export interface ProtectionResult {
  success: boolean;
  contentHash: string;
  txHash?: string;
  verificationUrl?: string;
  blockchainUrl?: string;
  error?: string;
  timestamp: string;
}

export interface VerificationResult {
  verified: boolean;
  contentHash: string;
  creator?: string;
  license?: string;
  timestamp?: string;
  platform?: string;
  verificationUrl?: string;
  blockchainUrl?: string;
  error?: string;
}

export interface LiberationUseCase {
  entityType: 'individual' | 'corporation' | 'nonprofit';
  useType: 'personal' | 'commercial' | 'ai_training' | 'education';
  purpose: 'profit' | 'education' | 'humanitarian' | 'research';
  compensation: boolean;
  metadata?: { [key: string]: string };
}

export interface LiberationCheckResult {
  compliant: boolean;
  reason: string;
  useCase: LiberationUseCase;
  recommendations?: string[];
}

export class DAONClient {
  private config: Required<DAONConfig>;

  constructor(config: DAONConfig = {}) {
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
  async protect(request: ProtectionRequest): Promise<ProtectionResult> {
    try {
      this.validateContent(request.content);

      const license = request.license || this.config.defaultLicense;

      const payload = {
        content: request.content,
        metadata: this.normalizeMetadata(request.metadata || {}),
        license,
      };

      const data = await this.postWithRetry('/api/v1/protect', payload);

      const contentHash = data.contentHash ? `sha256:${data.contentHash}` : this.generateContentHash(request.content);
      return {
        success: data.success,
        contentHash,
        txHash: data.blockchainTx ?? data.blockchain?.tx ?? undefined,
        verificationUrl: data.verificationUrl,
        blockchainUrl: data.blockchainTx ? `https://explorer.daon.network/tx/${data.blockchainTx}` : undefined,
        timestamp: data.timestamp ?? new Date().toISOString()
      };
    } catch (error) {
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
  async verify(contentOrHash: string): Promise<VerificationResult> {
    try {
      const contentHash = contentOrHash.startsWith('sha256:')
        ? contentOrHash
        : this.generateContentHash(contentOrHash);

      // API expects 64-char hex only — strip sha256: prefix
      const apiHash = contentHash.startsWith('sha256:') ? contentHash.slice(7) : contentHash;
      const data = await this.getWithRetry(`/api/v1/verify/${apiHash}`);

      return {
        verified: data.isValid,
        contentHash,
        license: data.license,
        timestamp: data.timestamp,
        verificationUrl: data.verificationUrl,
        blockchainUrl: `https://explorer.daon.network/content/${apiHash}`
      };
    } catch (error) {
      return {
        verified: false,
        contentHash: contentOrHash.startsWith('sha256:') ? contentOrHash : this.generateContentHash(contentOrHash),
        error: error instanceof Error ? error.message : 'Verification failed'
      };
    }
  }

  /**
   * Check Liberation License compliance (evaluated locally — no API endpoint)
   */
  checkLiberationCompliance(contentHash: string, useCase: LiberationUseCase): LiberationCheckResult {
    const { entityType, useType, purpose, compensation } = useCase;

    if (entityType === 'corporation' && useType === 'ai_training' && !compensation) {
      return {
        compliant: false,
        reason: 'Commercial AI training without creator compensation violates the Liberation License.',
        useCase,
        recommendations: ['Obtain explicit permission from the creator', 'Compensate creators for use in AI training datasets']
      };
    }

    if (entityType === 'corporation' && purpose === 'profit' && !compensation) {
      return {
        compliant: false,
        reason: 'Corporate profit extraction without creator compensation violates the Liberation License.',
        useCase,
        recommendations: ['Negotiate a licensing agreement with the creator', 'Include creator compensation in your budget']
      };
    }

    return {
      compliant: true,
      reason: 'Use case is compliant with Liberation License terms.',
      useCase
    };
  }

  /**
   * Bulk protect multiple works
   */
  async protectBatch(requests: ProtectionRequest[]): Promise<ProtectionResult[]> {
    const results: ProtectionResult[] = [];

    // Process in batches of 10
    for (let i = 0; i < requests.length; i += 10) {
      const batch = requests.slice(i, i + 10);
      const batchResults = await Promise.all(
        batch.map(request => this.protect(request))
      );
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
  async verifyBatch(contentHashes: string[]): Promise<VerificationResult[]> {
    const results: VerificationResult[] = [];

    // Process in batches of 50, falling back to individual verification
    for (let i = 0; i < contentHashes.length; i += 50) {
      const batch = contentHashes.slice(i, i + 50);

      // Fallback to individual verification (batch endpoint not available)
      const individualResults = await Promise.all(
        batch.map(hash => this.verify(hash))
      );
      results.push(...individualResults);

      // Rate limiting
      if (i + 50 < contentHashes.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return results;
  }

  /**
   * Generate content hash (raw SHA-256, matching the API's hash function exactly)
   */
  generateContentHash(content: string): string {
    const hash = createHash('sha256').update(content, 'utf8').digest('hex');
    return `sha256:${hash}`;
  }

  /**
   * Validate content
   */
  private validateContent(content: string): void {
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
  private normalizeContent(content: string): string {
    return content
      .replace(/\r\n/g, '\n')    // Normalize line endings
      .replace(/\r/g, '\n')      // Handle old Mac line endings
      .replace(/[ \t]+/g, ' ')   // Normalize spaces and tabs
      .replace(/\n{3,}/g, '\n\n') // Limit consecutive newlines
      .trim();                   // Remove leading/trailing whitespace
  }

  /**
   * Normalize metadata
   */
  private normalizeMetadata(metadata: ContentMetadata): { [key: string]: any } {
    const normalized: { [key: string]: any } = {};

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
  private detectPlatform(): string {
    // Check for common Node.js frameworks
    if (process.env.NEXT_PHASE) return 'nextjs';
    if (process.env.NUXT_ENV_CURRENT_ENV) return 'nuxtjs';
    if (process.env.NODE_ENV === 'development' && process.env.PWD?.includes('express')) return 'express';

    return 'nodejs';
  }

  /**
   * Generate creator ID for anonymous protection
   */
  private generateCreatorId(): string {
    const stack = new Error().stack || 'unknown';
    const hash = createHash('sha256').update(stack).digest('hex');
    return `anonymous_${hash.substring(0, 16)}`;
  }

  /**
   * HTTP helpers with retry logic using native fetch
   */
  private get defaultHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'User-Agent': 'DAON-Node-SDK/1.0.0'
    };
  }

  private async fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
    const signal = AbortSignal.timeout(this.config.timeout);
    return fetch(url, { ...options, signal });
  }

  private async getWithRetry(path: string, retries: number = this.config.retries): Promise<any> {
    try {
      const response = await this.fetchWithTimeout(`${this.config.apiUrl}${path}`, {
        method: 'GET',
        headers: this.defaultHeaders
      });
      if (!response.ok) {
        const err: any = new Error(`HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.getWithRetry(path, retries - 1);
      }
      throw error;
    }
  }

  private async postWithRetry(path: string, data: any, retries: number = this.config.retries): Promise<any> {
    try {
      const response = await this.fetchWithTimeout(`${this.config.apiUrl}${path}`, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(data)
      });
      if (!response.ok) {
        const err: any = new Error(`HTTP ${response.status}`);
        err.status = response.status;
        throw err;
      }
      return response.json();
    } catch (error) {
      if (retries > 0 && this.isRetryableError(error)) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return this.postWithRetry(path, data, retries - 1);
      }
      throw error;
    }
  }

  private isRetryableError(error: any): boolean {
    // Network-level failures (fetch throws TypeError for connection errors)
    if (error instanceof TypeError) return true;
    // Retry on 5xx server errors but not 4xx client errors
    if (error.status !== undefined) return error.status >= 500;
    return false;
  }
}

// Export convenience functions
export const protect = async (content: string, metadata?: ContentMetadata, license?: string): Promise<ProtectionResult> => {
  const client = new DAONClient();
  return client.protect({ content, metadata, license });
};

export const verify = async (contentOrHash: string): Promise<VerificationResult> => {
  const client = new DAONClient();
  return client.verify(contentOrHash);
};

export const generateContentHash = (content: string): string => {
  const client = new DAONClient();
  return client.generateContentHash(content);
};

// Default export
export default DAONClient;
