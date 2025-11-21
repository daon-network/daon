/**
 * DAON Creator Protection SDK for Node.js
 *
 * Provides easy integration with DAON blockchain for content protection.
 * Perfect for Next.js, Express, and other Node.js applications.
 */
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
    metadata?: {
        [key: string]: string;
    };
}
export interface LiberationCheckResult {
    compliant: boolean;
    reason: string;
    useCase: LiberationUseCase;
    recommendations?: string[];
}
export declare class DAONClient {
    private config;
    private httpClient;
    constructor(config?: DAONConfig);
    /**
     * Protect content with DAON blockchain
     */
    protect(request: ProtectionRequest): Promise<ProtectionResult>;
    /**
     * Verify content protection status
     */
    verify(contentOrHash: string): Promise<VerificationResult>;
    /**
     * Check Liberation License compliance
     */
    checkLiberationCompliance(contentHash: string, useCase: LiberationUseCase): Promise<LiberationCheckResult>;
    /**
     * Bulk protect multiple works
     */
    protectBatch(requests: ProtectionRequest[]): Promise<ProtectionResult[]>;
    /**
     * Bulk verify multiple content hashes
     */
    verifyBatch(contentHashes: string[]): Promise<VerificationResult[]>;
    /**
     * Generate content hash
     */
    generateContentHash(content: string): string;
    /**
     * Validate content
     */
    private validateContent;
    /**
     * Normalize content for consistent hashing
     */
    private normalizeContent;
    /**
     * Normalize metadata
     */
    private normalizeMetadata;
    /**
     * Detect platform from environment
     */
    private detectPlatform;
    /**
     * Generate creator ID for anonymous protection
     */
    private generateCreatorId;
    /**
     * HTTP helpers with retry logic
     */
    private getWithRetry;
    private postWithRetry;
    private isRetryableError;
}
export declare const protect: (content: string, metadata?: ContentMetadata, license?: string) => Promise<ProtectionResult>;
export declare const verify: (contentOrHash: string) => Promise<VerificationResult>;
export declare const generateContentHash: (content: string) => string;
export default DAONClient;
//# sourceMappingURL=index.d.ts.map