/**
 * DAON Blockchain Client
 * 
 * Handles all blockchain interactions for content registration and verification
 * Uses RPC-based approach with manual protobuf encoding
 */

import { DirectSecp256k1HdWallet, Registry, makeAuthInfoBytes, makeSignDoc } from '@cosmjs/proto-signing';
import { SigningStargateClient, defaultRegistryTypes, QueryClient, StargateClient } from '@cosmjs/stargate';
import { Tendermint34Client } from '@cosmjs/tendermint-rpc';
import { TxRaw, TxBody } from 'cosmjs-types/cosmos/tx/v1beta1/tx.js';
import { Any } from 'cosmjs-types/google/protobuf/any.js';
import { BinaryWriter } from 'cosmjs-types/binary.js';

class BlockchainClient {
  constructor() {
    this.rpcEndpoint = process.env.BLOCKCHAIN_RPC || 'http://localhost:26657';
    this.chainId = process.env.CHAIN_ID || 'daon-mainnet-1';
    this.mnemonic = process.env.API_MNEMONIC || 'blur cause boost pass stick allow hundred odor level erosion umbrella urban need indicate inject funny anchor kiss rain equal among unhappy sad dutch';
    this.client = null;
    this.wallet = null;
    this.address = null;
    this.connected = false;
    
    // Sequence manager to handle concurrent transactions
    this.sequenceCache = null;
    this.sequenceLock = Promise.resolve();
    this.lastSequenceUpdate = 0;
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
        // Encode method - receives message object and optionally a protobuf writer
        encode: (message, writer = BinaryWriter.create()) => {
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
        ['/ccccore.contentregistry.v1.MsgRegisterContent', MsgRegisterContentType]
      ]);

      // Create Tendermint client first
      const tmClient = await Tendermint34Client.connect(this.rpcEndpoint);
      
      // Create signing client with custom registry and account parser that handles daon prefix
      this.client = await SigningStargateClient.createWithSigner(
        tmClient,
        this.wallet,
        {
          registry: customRegistry,
          gasPrice: {
            denom: 'stake',
            amount: '0'
          },
          accountParser: (input) => {
            // Custom account parser that handles daon addresses
            const value = input.typeUrl === '/cosmos.auth.v1beta1.BaseAccount' ? 
              input.value : input;
            return {
              address: value.address || '',
              pubkey: value.pubKey || value.pubkey || null,
              accountNumber: value.accountNumber || 0,
              sequence: value.sequence || 0,
            };
          },
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
   * Get next sequence number with locking for concurrent transactions
   * Manages sequence locally and refreshes from chain periodically
   */
  async getNextSequence(address) {
    // Acquire lock to prevent race conditions
    const releaseLock = await this.acquireSequenceLock();
    
    try {
      const now = Date.now();
      const cacheAge = now - this.lastSequenceUpdate;
      
      // Refresh from chain if cache is stale (>10 seconds) or doesn't exist
      if (this.sequenceCache === null || cacheAge > 10000) {
        console.log('Refreshing sequence from blockchain...');
        
        // Try REST API first (faster)
        const restEndpoint = this.rpcEndpoint.replace(':26657', ':1317');
        try {
          const restResponse = await fetch(
            `${restEndpoint}/cosmos/auth/v1beta1/accounts/${address}`,
            { signal: AbortSignal.timeout(3000) }
          );
          
          if (restResponse.ok) {
            const data = await restResponse.json();
            if (data.account) {
              this.sequenceCache = {
                accountNumber: parseInt(data.account.account_number || 0),
                sequence: parseInt(data.account.sequence || 0),
              };
              this.lastSequenceUpdate = now;
              console.log(`Sequence refreshed from REST API: ${this.sequenceCache.sequence}`);
            }
          } else if (restResponse.status === 404) {
            // New account
            this.sequenceCache = { accountNumber: 0, sequence: 0 };
            this.lastSequenceUpdate = now;
            console.log('New account, starting at sequence 0');
          }
        } catch (restError) {
          console.log('REST API not available, using fallback...');
          // If REST fails, assume new account or keep existing cache
          if (this.sequenceCache === null) {
            this.sequenceCache = { accountNumber: 0, sequence: 0 };
            this.lastSequenceUpdate = now;
          }
        }
      }
      
      // Return current sequence and increment for next call
      const current = this.sequenceCache.sequence;
      this.sequenceCache.sequence++;
      
      console.log(`Using sequence ${current}, next will be ${this.sequenceCache.sequence}`);
      
      return {
        accountNumber: this.sequenceCache.accountNumber,
        sequence: current,
      };
    } finally {
      releaseLock();
    }
  }
  
  /**
   * Acquire lock for sequence management
   */
  async acquireSequenceLock() {
    let release;
    const lockPromise = new Promise(resolve => {
      release = resolve;
    });
    
    const previousLock = this.sequenceLock;
    this.sequenceLock = previousLock.then(() => lockPromise);
    
    await previousLock;
    return release;
  }

  /**
   * Manually sign and broadcast transaction
   * Bypasses CosmJS's getAccount() which has address prefix validation issues
   */
  async signAndBroadcastManual(messages, memo = '') {
    try {
      // Get signing key
      const accounts = await this.wallet.getAccounts();
      const signerAddress = accounts[0].address;
      
      // Get next sequence number (with locking for concurrent requests)
      const { accountNumber, sequence } = await this.getNextSequence(signerAddress);
      
      console.log(`Signing tx with sequence ${sequence}`);
      
      // Encode messages as google.protobuf.Any
      const encodedMessages = messages.map(msg => {
        const msgBytes = this.client.registry.encode(msg);
        return Any.fromPartial({
          typeUrl: msg.typeUrl,
          value: msgBytes,
        });
      });
      
      // Create and encode TxBody
      const txBody = TxBody.fromPartial({
        messages: encodedMessages,
        memo: memo,
      });
      
      const txBodyBytes = TxBody.encode(txBody).finish();
      
      // Create SignDoc
      const gasLimit = 200000;
      const feeAmount = [];
      
      const authInfoBytes = makeAuthInfoBytes(
        [{ pubkey: accounts[0].pubkey, sequence }],
        feeAmount,
        gasLimit,
        undefined,
        undefined
      );
      
      const signDoc = makeSignDoc(
        txBodyBytes,
        authInfoBytes,
        this.chainId,
        accountNumber
      );
      
      // Sign the transaction
      const { signature, signed } = await this.wallet.signDirect(signerAddress, signDoc);
      
      // Create TxRaw
      const txRaw = TxRaw.fromPartial({
        bodyBytes: signed.bodyBytes,
        authInfoBytes: signed.authInfoBytes,
        signatures: [Buffer.from(signature.signature, 'base64')],
      });
      
      // Encode and broadcast
      const txRawBytes = TxRaw.encode(txRaw).finish();
      const result = await this.client.broadcastTx(txRawBytes);
      
      // If transaction failed due to sequence mismatch, invalidate cache
      if (result.code === 32) { // sequence mismatch error code
        console.warn('Sequence mismatch detected, invalidating cache');
        this.sequenceCache = null;
        throw new Error('Sequence mismatch - please retry');
      }
      
      return result;
    } catch (error) {
      console.error('Manual sign and broadcast failed:', error);
      // Invalidate sequence cache on error to force refresh
      if (error.message.includes('sequence')) {
        this.sequenceCache = null;
      }
      throw error;
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
        typeUrl: '/ccccore.contentregistry.v1.MsgRegisterContent',
        value: {
          creator: this.address,
          contentHash: formattedHash,
          license: license || 'liberation_v1',
          fingerprint: metadata.fingerprint || '',
          platform: metadata.platform || 'api',
        },
      };

      console.log('Submitting transaction with manual signing...');
      
      // Use manual signing to bypass getAccount()
      const result = await this.signAndBroadcastManual(
        [msg],
        `Register content: ${metadata.title || 'Untitled'}`
      );

      if (result.code !== 0) {
        throw new Error(`Transaction failed: ${result.rawLog}`);
      }

      console.log(`✅ Transaction successful: ${result.transactionHash}`);
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
      const queryPath = `/ccccore.contentregistry.v1.Query/VerifyContent`;
      
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
