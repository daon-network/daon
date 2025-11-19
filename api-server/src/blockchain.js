/**
 * DAON Blockchain Client
 * 
 * Handles all blockchain interactions for content registration and verification
 */

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, StargateClient, defaultRegistryTypes } from '@cosmjs/stargate';
import { stringToPath } from '@cosmjs/crypto';

// Protobuf encoding helper
class ProtobufEncoder {
  static encodeString(fieldNumber, value) {
    if (!value) return new Uint8Array(0);
    
    const fieldTag = (fieldNumber << 3) | 2; // Wire type 2 for strings
    const strBytes = new TextEncoder().encode(value);
    
    const tagBytes = this.encodeVarint(fieldTag);
    const lengthBytes = this.encodeVarint(strBytes.length);
    
    const result = new Uint8Array(tagBytes.length + lengthBytes.length + strBytes.length);
    result.set(tagBytes, 0);
    result.set(lengthBytes, tagBytes.length);
    result.set(strBytes, tagBytes.length + lengthBytes.length);
    
    return result;
  }
  
  static encodeVarint(value) {
    const bytes = [];
    while (value > 0x7f) {
      bytes.push((value & 0x7f) | 0x80);
      value = Math.floor(value / 128);
    }
    bytes.push(value & 0x7f);
    return new Uint8Array(bytes);
  }
  
  static concat(...arrays) {
    const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const arr of arrays) {
      result.set(arr, offset);
      offset += arr.length;
    }
    return result;
  }
}

// Define custom registry types for DAON blockchain
const daonRegistryTypes = [
  ['/daoncore.contentregistry.v1.MsgRegisterContent', {
    encode: (message) => {
      return ProtobufEncoder.concat(
        ProtobufEncoder.encodeString(1, message.creator),
        ProtobufEncoder.encodeString(2, message.content_hash),
        ProtobufEncoder.encodeString(3, message.license),
        ProtobufEncoder.encodeString(4, message.fingerprint),
        ProtobufEncoder.encodeString(5, message.platform)
      );
    },
    decode: (input) => {
      // Decode not needed for transactions
      return {};
    }
  }]
];

class BlockchainClient {
  constructor() {
    this.rpcEndpoint = process.env.BLOCKCHAIN_RPC || 'http://localhost:26657';
    this.chainId = process.env.CHAIN_ID || 'daon-mainnet-1';
    this.client = null;
    this.signingClient = null;
    this.wallet = null;
    this.address = null;
    this.connected = false;
  }

  /**
   * Initialize blockchain connection
   */
  async connect() {
    try {
      // Connect to blockchain for queries (no signing needed)
      this.client = await StargateClient.connect(this.rpcEndpoint);
      
      // Initialize wallet for transactions
      await this.initializeWallet();
      
      this.connected = true;
      console.log(`✅ Connected to blockchain at ${this.rpcEndpoint}`);
      console.log(`   Chain ID: ${this.chainId}`);
      console.log(`   API Address: ${this.address}`);
      
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to blockchain:', error.message);
      this.connected = false;
      return false;
    }
  }

  /**
   * Initialize wallet for signing transactions
   */
  async initializeWallet() {
    const mnemonic = process.env.API_MNEMONIC;
    
    if (!mnemonic) {
      console.warn('⚠️  No API_MNEMONIC found - will use default test mnemonic');
      // Default test mnemonic for development
      // TODO: Generate secure mnemonic for production
      const defaultMnemonic = 'surround miss nominee dream gap cross assault thank captain prosper drop duty group candy wealth weather scale put';
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(defaultMnemonic, {
        prefix: 'daon',
      });
    } else {
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(mnemonic, {
        prefix: 'daon',
      });
    }

    // Get first account
    const [firstAccount] = await this.wallet.getAccounts();
    this.address = firstAccount.address;

    // Create custom registry with DAON types
    const registry = new Registry([...defaultRegistryTypes, ...daonRegistryTypes]);
    
    // Create signing client with custom registry
    this.signingClient = await SigningStargateClient.connectWithSigner(
      this.rpcEndpoint,
      this.wallet,
      {
        registry,
        gasPrice: { denom: 'stake', amount: '0.025' }
      }
    );
  }

  /**
   * Register content on blockchain
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

    // Create properly encoded protobuf message
    const msgValue = {
      creator: this.address,
      content_hash: formattedHash,  // Use snake_case as in proto
      license: license || 'liberation_v1',
      fingerprint: metadata.fingerprint || '',
      platform: metadata.platform || 'api',
    };

    const msg = {
      typeUrl: '/daoncore.contentregistry.v1.MsgRegisterContent',
      value: msgValue,
    };

    try {
      // Broadcast transaction
      const result = await this.signingClient.signAndBroadcast(
        this.address,
        [msg],
        'auto',
        `Register content: ${metadata.title || 'Untitled'}`
      );

      if (result.code !== 0) {
        throw new Error(`Transaction failed: ${result.rawLog}`);
      }

      return {
        success: true,
        txHash: result.transactionHash,
        height: result.height,
      };
    } catch (error) {
      console.error('Failed to register content:', error.message);
      throw error;
    }
  }

  /**
   * Verify content on blockchain
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
      // Query the blockchain
      const queryData = {
        content_hash: formattedHash,
      };

      const result = await this.client.queryContractSmart(
        // Use ABCI query for custom modules
        `/daoncore.contentregistry.v1.Query/VerifyContent`,
        queryData
      );

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
      const status = await this.client.getStatus();
      const height = await this.client.getHeight();
      
      return {
        connected: true,
        chainId: status.chainId,
        height: height,
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
    if (this.client) {
      this.client.disconnect();
    }
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
