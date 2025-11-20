/**
 * DAON Blockchain Client
 * 
 * Handles all blockchain interactions for content registration and verification
 * Uses RPC-based approach with manual protobuf encoding
 */

import { DirectSecp256k1HdWallet, Registry } from '@cosmjs/proto-signing';
import { SigningStargateClient, defaultRegistryTypes } from '@cosmjs/stargate';

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

      // Create a proper GeneratedType for CosmJS Registry
      // This must match the protobuf Writer interface that CosmJS expects
      const MsgRegisterContentType = {
        // Encode method - receives message object and protobuf writer
        encode: (message, writer) => {
          // Field 1: creator (string)
          if (message.creator) {
            writer.uint32(10).string(message.creator);
          }
          // Field 2: content_hash (string)  
          if (message.contentHash) {
            writer.uint32(18).string(message.contentHash);
          }
          // Field 3: license (string)
          if (message.license) {
            writer.uint32(26).string(message.license);
          }
          // Field 4: fingerprint (string)
          if (message.fingerprint) {
            writer.uint32(34).string(message.fingerprint);
          }
          // Field 5: platform (string)
          if (message.platform) {
            writer.uint32(42).string(message.platform);
          }
          return writer;
        },
        
        // Decode method - receives protobuf reader
        decode: (input, length) => {
          return {
            creator: '',
            contentHash: '',
            license: '',
            fingerprint: '',
            platform: '',
          };
        },
        
        // FromPartial - converts partial object to full message
        fromPartial: (object) => {
          return {
            creator: object.creator || '',
            contentHash: object.contentHash || '',
            license: object.license || '',
            fingerprint: object.fingerprint || '',
            platform: object.platform || '',
          };
        },
      };

      const customRegistry = new Registry([
        ...defaultRegistryTypes,
        ['/daoncore.contentregistry.v1.MsgRegisterContent', MsgRegisterContentType]
      ]);

      // Create signing client with custom registry and zero gas price
      this.client = await SigningStargateClient.connectWithSigner(
        this.rpcEndpoint,
        this.wallet,
        {
          registry: customRegistry,
          gasPrice: {
            denom: 'stake',
            amount: '0'
          }
        }
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
      // Create the message - Registry will encode it using our custom type
      const msg = {
        typeUrl: '/daoncore.contentregistry.v1.MsgRegisterContent',
        value: {
          creator: this.address,
          contentHash: formattedHash,
          license: license || 'liberation_v1',
          fingerprint: metadata.fingerprint || '',
          platform: metadata.platform || 'api',
        },
      };

      // Sign and broadcast with fixed gas
      const result = await this.client.signAndBroadcast(
        this.address,
        [msg],
        {
          amount: [],
          gas: '200000',
        },
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
