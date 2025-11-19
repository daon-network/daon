/**
 * DAON Blockchain Client
 * 
 * Handles all blockchain interactions for content registration and verification
 * Uses CLI-based approach for reliable transaction submission
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

class BlockchainClient {
  constructor() {
    this.rpcEndpoint = process.env.BLOCKCHAIN_RPC || 'http://localhost:26657';
    this.restEndpoint = process.env.BLOCKCHAIN_REST || 'http://localhost:1317';
    this.chainId = process.env.CHAIN_ID || 'daon-mainnet-1';
    this.address = process.env.API_ADDRESS || 'daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n';
    this.connected = false;
  }

  /**
   * Initialize blockchain connection
   */
  async connect() {
    try {
      // Test RPC connection
      const response = await fetch(`${this.rpcEndpoint}/status`, { 
        signal: AbortSignal.timeout(5000) 
      });
      
      const data = await response.json();
      
      if (data && data.result) {
        this.connected = true;
        console.log(`✅ Connected to blockchain at ${this.rpcEndpoint}`);
        console.log(`   Chain ID: ${this.chainId}`);
        console.log(`   API Address: ${this.address}`);
        return true;
      }
      
      throw new Error('Invalid blockchain response');
    } catch (error) {
      console.error('❌ Failed to connect to blockchain:', error.message);
      this.connected = false;
      return false;
    }
  }

  /**
   * Register content on blockchain using CLI
   * @param {string} contentHash - SHA256 hash of content (with sha256: prefix)
   * @param {object} metadata - Content metadata
   * @param {string} license - License type
   * @returns {Promise<object>} Transaction result
   */
  async registerContent(contentHash, metadata, license) {
    if (!this.connected) {
      throw new Error('Blockchain not connected');
    }

    // Ensure hash has sha256: prefix
    const formattedHash = contentHash.startsWith('sha256:') 
      ? contentHash 
      : `sha256:${contentHash}`;

    try {
      // Use docker exec to run the CLI command directly on the blockchain container
      const cmd = `docker exec daon-blockchain daon-cored tx contentregistry register-content ` +
        `"${formattedHash}" ` +
        `"${license || 'liberation_v1'}" ` +
        `"${metadata.fingerprint || ''}" ` +
        `"${metadata.platform || 'api'}" ` +
        `--from api-wallet ` +
        `--chain-id ${this.chainId} ` +
        `--keyring-backend test ` +
        `--yes ` +
        `--output json`;

      const { stdout, stderr } = await execAsync(cmd);
      
      if (stderr && !stderr.includes('gas estimate')) {
        console.warn('Blockchain stderr:', stderr);
      }

      const result = JSON.parse(stdout);
      
      if (result.code && result.code !== 0) {
        throw new Error(`Transaction failed: ${result.raw_log || result.logs}`);
      }

      return {
        success: true,
        txHash: result.txhash || result.transactionHash,
        height: result.height,
      };
    } catch (error) {
      console.error('Failed to register content:', error.message);
      throw error;
    }
  }

  /**
   * Verify content on blockchain using CLI query
   * @param {string} contentHash - SHA256 hash to verify
   * @returns {Promise<object>} Verification result
   */
  async verifyContent(contentHash) {
    if (!this.connected) {
      throw new Error('Blockchain not connected');
    }

    // Ensure hash has sha256: prefix
    const formattedHash = contentHash.startsWith('sha256:') 
      ? contentHash 
      : `sha256:${contentHash}`;

    try {
      // Use docker exec to query the blockchain
      const cmd = `docker exec daon-blockchain daon-cored query contentregistry verify "${formattedHash}" --output json`;
      
      const { stdout, stderr } = await execAsync(cmd);
      
      if (stderr && !stderr.includes('not found')) {
        console.warn('Query stderr:', stderr);
      }

      const result = JSON.parse(stdout);

      return {
        verified: result.verified || false,
        creator: result.creator || null,
        license: result.license || null,
        timestamp: result.timestamp || null,
      };
    } catch (error) {
      // If content not found, return unverified
      if (error.message.includes('not found') || error.message.includes('does not exist')) {
        return {
          verified: false,
          creator: null,
          license: null,
          timestamp: null,
        };
      }
      
      console.error('Failed to verify content:', error.message);
      throw error;
    }
  }

  /**
   * Get blockchain status
   * @returns {Promise<object>} Status information
   */
  async getStatus() {
    if (!this.connected) {
      return { connected: false };
    }

    try {
      const response = await fetch(`${this.rpcEndpoint}/status`, { 
        signal: AbortSignal.timeout(5000) 
      });
      const data = await response.json();
      const status = data.result;
      
      return {
        connected: true,
        chainId: status.node_info.network,
        height: parseInt(status.sync_info.latest_block_height),
        rpcEndpoint: this.rpcEndpoint,
        apiAddress: this.address,
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message,
      };
    }
  }

  /**
   * Check if content exists on blockchain
   * @param {string} contentHash - Content hash to check
   * @returns {Promise<boolean>}
   */
  async contentExists(contentHash) {
    try {
      const result = await this.verifyContent(contentHash);
      return result.verified;
    } catch (error) {
      return false;
    }
  }

  /**
   * Disconnect from blockchain
   */
  async disconnect() {
    this.connected = false;
    console.log('Disconnected from blockchain');
  }
}

// Export singleton instance
const blockchainClient = new BlockchainClient();

// Auto-connect on module load if enabled
if (process.env.BLOCKCHAIN_ENABLED === 'true') {
  blockchainClient.connect().catch(err => {
    console.error('Failed to auto-connect to blockchain:', err.message);
  });
}

export default blockchainClient;
