/**
 * DAON Blockchain Client
 * 
 * Handles all blockchain interactions for content registration and verification
 * Uses RPC-based approach with manual protobuf encoding
 */

import { DirectSecp256k1HdWallet } from '@cosmjs/proto-signing';
import { SigningStargateClient } from '@cosmjs/stargate';
import { stringToPath } from '@cosmjs/crypto';

class BlockchainClient {
  constructor() {
    this.rpcEndpoint = process.env.BLOCKCHAIN_RPC || 'http://localhost:26657';
    this.chainId = process.env.CHAIN_ID || 'daon-mainnet-1';
    this.mnemonic = process.env.API_MNEMONIC || 'blur cause boost pass stick allow hundred odor level erosion umbrella urban need indicate inject funny anchor kiss rain equal among unhappy sad dutch';
    this.client = null;
    this.wallet = null;
    this.address = null;
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
      
      if (!data || !data.result) {
        throw new Error('Invalid blockchain response');
      }

      // Initialize wallet
      this.wallet = await DirectSecp256k1HdWallet.fromMnemonic(this.mnemonic, {
        prefix: 'daon',
      });

      const [firstAccount] = await this.wallet.getAccounts();
      this.address = firstAccount.address;

      // Create signing client (without custom registry - we'll broadcast raw)
      this.client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        this.wallet
      );
      
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
   * Manual protobuf encoding for MsgRegisterContent
   * Encodes the message according to the proto3 specification
   */
  encodeMsgRegisterContent(creator, contentHash, license, fingerprint, platform) {
    const encodeString = (fieldNumber, value) => {
      if (!value) return new Uint8Array(0);
      
      const fieldTag = (fieldNumber << 3) | 2; // Wire type 2 for string
      const strBytes = new TextEncoder().encode(value);
      
      const result = [];
      
      // Encode field tag
      let tag = fieldTag;
      while (tag > 0x7f) {
        result.push((tag & 0x7f) | 0x80);
        tag = tag >>> 7;
      }
      result.push(tag & 0x7f);
      
      // Encode length
      let len = strBytes.length;
      while (len > 0x7f) {
        result.push((len & 0x7f) | 0x80);
        len = len >>> 7;
      }
      result.push(len & 0x7f);
      
      // Append string bytes
      result.push(...strBytes);
      
      return new Uint8Array(result);
    };

    // Encode each field
    const field1 = encodeString(1, creator);       // creator
    const field2 = encodeString(2, contentHash);    // content_hash
    const field3 = encodeString(3, license);        // license
    const field4 = encodeString(4, fingerprint);    // fingerprint
    const field5 = encodeString(5, platform);       // platform

    // Concatenate all fields
    const totalLength = field1.length + field2.length + field3.length + field4.length + field5.length;
    const result = new Uint8Array(totalLength);
    let offset = 0;
    
    result.set(field1, offset); offset += field1.length;
    result.set(field2, offset); offset += field2.length;
    result.set(field3, offset); offset += field3.length;
    result.set(field4, offset); offset += field4.length;
    result.set(field5, offset);

    return result;
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

    try {
      // Encode the message manually
      const msgValue = this.encodeMsgRegisterContent(
        this.address,
        formattedHash,
        license || 'liberation_v1',
        metadata.fingerprint || '',
        metadata.platform || 'api'
      );

      // Create the message with type URL and encoded value
      const msg = {
        typeUrl: '/daoncore.contentregistry.v1.MsgRegisterContent',
        value: msgValue,
      };

      // Sign and broadcast
      const result = await this.client.signAndBroadcast(
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
   * Verify content on blockchain using RPC query
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
      // Query via ABCI query (direct RPC call)
      const queryPath = `/daoncore.contentregistry.v1.Query/VerifyContent`;
      
      // Encode query data (content_hash field)
      const queryData = Buffer.from(
        JSON.stringify({ content_hash: formattedHash })
      ).toString('base64');

      const response = await fetch(`${this.rpcEndpoint}/abci_query?path="${queryPath}"&data="${queryData}"`, {
        signal: AbortSignal.timeout(5000)
      });

      const data = await response.json();

      if (data.result && data.result.response && data.result.response.value) {
        // Decode base64 response
        const decoded = JSON.parse(
          Buffer.from(data.result.response.value, 'base64').toString('utf8')
        );

        return {
          verified: decoded.verified || false,
          creator: decoded.creator || null,
          license: decoded.license || null,
          timestamp: decoded.timestamp || null,
        };
      }

      return {
        verified: false,
        creator: null,
        license: null,
        timestamp: null,
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
