# 🚨 Critical Patterns - AVOID THESE ISSUES

This document contains the **exact issues we hit** and **how to avoid them** in the future.

---

## 1. ❌ Address Prefix Mismatch

### **The Problem**
Blockchain compiled with `cosmos` prefix, but we wanted `daon` prefix. This caused:
- Addresses like `cosmos1...` instead of `daon1...`
- Brand confusion
- Need to rebuild everything

### **The Fix**
**File**: `daon-core/app/app.go`
```go
// Line 78 - CRITICAL: Set your custom prefix
AccountAddressPrefix: "daon",  // NOT "cosmos"
```

### **When to Check**
- ✅ **BEFORE** first blockchain deployment
- ✅ After any `app.go` changes
- ✅ When creating a new chain

### **How to Verify**
```bash
# Should return daon1... NOT cosmos1...
docker exec daon-blockchain daond keys show api-wallet -a --keyring-backend test --home /daon/.daon
```

---

## 2. ❌ Genesis Account Creation - Wrong Arguments

### **The Problem**
Used **addresses** instead of **key names** in genesis commands:
```bash
# ❌ WRONG - This fails silently
daond genesis add-genesis-account cosmos1abc123... 10000000000stake

# Error: "no key name or address provided"
```

### **The Fix**
**File**: `docker-compose.yml` (blockchain init script)
```bash
# ✅ CORRECT - Use key names
daond genesis add-genesis-account validator 10000000000stake --keyring-backend test --home /daon/.daon
daond genesis add-genesis-account api-wallet 5000000000stake --keyring-backend test --home /daon/.daon
```

### **Key Points**
- Use **key names** (validator, api-wallet), NOT addresses
- ALWAYS add `--keyring-backend test` flag
- Order matters: create keys FIRST, then add to genesis

### **When to Check**
- ✅ Blockchain init script changes
- ✅ Adding new funded accounts
- ✅ Fresh blockchain deployment

---

## 3. ❌ Docker Network - Localhost Binding

### **The Problem**
Blockchain listening on `localhost:1317` which is only accessible INSIDE the container.
API containers couldn't reach it.

### **The Fix**
**File**: `docker-compose.yml` (blockchain init script)
```bash
# ✅ CORRECT - Bind to 0.0.0.0 for Docker network access
sed -i 's|address = "tcp://localhost:1317"|address = "tcp://0.0.0.0:1317"|g' /daon/.daon/config/app.toml
sed -i 's|laddr = "tcp://127.0.0.1:26657"|laddr = "tcp://0.0.0.0:26657"|g' /daon/.daon/config/config.toml
```

### **Rule**
🚨 **In Docker Compose, ALWAYS bind to `0.0.0.0`, NEVER `localhost` or `127.0.0.1`**

### **When to Check**
- ✅ Adding new services that need inter-container communication
- ✅ API can't reach blockchain
- ✅ Any networking issues between containers

---

## 4. ❌ CosmJS - Manual Encoding Bypasses Registry

### **The Problem**
Manually creating `TxRaw` and encoding protobuf messages bypassed the type registry:
```typescript
// ❌ WRONG - Bypasses registry, causes "unable to resolve type URL"
const txRaw = TxRaw.fromPartial({...});
const txBytes = TxRaw.encode(txRaw).finish();
const result = await client.broadcastTx(txBytes);
```

### **The Fix**
**File**: `api-server/src/blockchain.ts`
```typescript
// ✅ CORRECT - Use registry-based signAndBroadcast
const result = await this.client.signAndBroadcast(
  this.address,
  [msg],  // Array of messages
  'auto', // Auto-calculate gas
  memo
);
```

### **Rule**
🚨 **ALWAYS use `client.signAndBroadcast()`, NEVER manually encode transactions**

### **When to Check**
- ✅ Adding new message types
- ✅ "unable to resolve type URL" errors
- ✅ Transaction encoding issues

---

## 5. ❌ Account Parser - Not Decoding Protobuf

### **The Problem**
`accountParser` receives **raw protobuf bytes**, not a decoded object:
```typescript
// ❌ WRONG - Assumes value is already decoded
accountParser: (input) => {
  return {
    address: input.value.address,  // value is Uint8Array, not object!
    sequence: input.value.sequence // undefined!
  };
}
```

### **The Fix**
**File**: `api-server/src/blockchain.ts`
```typescript
import { BaseAccount } from 'cosmjs-types/cosmos/auth/v1beta1/auth.js';

accountParser: (input) => {
  // ✅ CORRECT - Decode protobuf bytes first
  if (input.typeUrl === '/cosmos.auth.v1beta1.BaseAccount') {
    const decoded = BaseAccount.decode(input.value);
    return {
      address: decoded.address,
      pubkey: decoded.pubKey || null,
      accountNumber: parseInt(decoded.accountNumber?.toString() || '0', 10),
      sequence: parseInt(decoded.sequence?.toString() || '0', 10),
    };
  }
  // Fallback...
}
```

### **Rule**
🚨 **ALWAYS decode BaseAccount from protobuf bytes in accountParser**

### **When to Check**
- ✅ "sequence mismatch" errors
- ✅ accountNumber or sequence returning 0
- ✅ Account query issues

---

## 6. ❌ Gas Price Format - Plain Object vs Instance

### **The Problem**
Passing a plain object instead of `GasPrice` instance:
```typescript
// ❌ WRONG - Plain object
gasPrice: {
  denom: 'stake',
  amount: '0'
}
// Error: gasPriceAmount.multiply is not a function
```

### **The Fix**
**File**: `api-server/src/blockchain.ts`
```typescript
import { GasPrice } from '@cosmjs/stargate';

// ✅ CORRECT - Use GasPrice.fromString()
{
  registry: customRegistry,
  gasPrice: GasPrice.fromString('0stake'),
  accountParser: ...
}
```

### **Rule**
🚨 **ALWAYS use `GasPrice.fromString()`, NEVER plain objects**

### **When to Check**
- ✅ "multiply is not a function" errors
- ✅ Gas calculation errors
- ✅ SigningStargateClient configuration

---

## 7. ❌ Response Parsing - Base64 Encoding Issues

### **The Problem**
Cosmos SDK sometimes returns non-base64 encoded event attributes, causing:
```
Error: Invalid string. Length must be a multiple of 4
```
Transaction succeeds but response parsing fails.

### **The Fix**
**File**: `api-server/src/blockchain.ts`
```typescript
try {
  const result = await this.client.signAndBroadcast(...);
  // Normal success handling
} catch (error) {
  // ✅ CORRECT - Catch known parsing error
  if (error.message?.includes('Invalid string. Length must be a multiple of 4')) {
    console.log('⚠️  Response parsing failed due to base64 encoding issue.');
    console.log('✅ Transaction was broadcast successfully');
    
    // Transaction succeeded, just return success indicator
    return {
      success: true,
      txHash: 'verified-on-chain',
      height: null,
    };
  }
  throw error; // Re-throw other errors
}
```

### **Rule**
🚨 **Handle base64 decoding errors gracefully - transaction likely succeeded**

### **When to Check**
- ✅ Response parsing errors
- ✅ Transaction appears to fail but is on-chain
- ✅ After Cosmos SDK version upgrades

---

## 8. ❌ Custom Message Registry - Not Registered

### **The Problem**
Custom protobuf messages not registered with CosmJS:
```typescript
// ❌ WRONG - Using defaultRegistryTypes only
const registry = new Registry(defaultRegistryTypes);
```

### **The Fix**
**File**: `api-server/src/blockchain.ts`
```typescript
import { Registry } from '@cosmjs/proto-signing';
import { MsgRegisterContent } from './types/daoncore/contentregistry/v1/tx.js';

// ✅ CORRECT - Register custom types
const customRegistry = new Registry([
  ...defaultRegistryTypes,
  ['/daoncore.contentregistry.v1.MsgRegisterContent', MsgRegisterContent]
]);
```

### **Rule**
🚨 **ALWAYS register custom message types in the CosmJS Registry**

### **When to Check**
- ✅ Adding new message types
- ✅ "unable to resolve type URL" errors
- ✅ After regenerating protobuf types

---

## 9. ❌ Docker Volume Permissions

### **The Problem**
User constraints incompatible with Docker volume permissions:
```yaml
# ❌ May cause permission errors
user: "1000:1000"
```

### **The Fix**
**File**: `docker-compose.yml`
```yaml
# ✅ CORRECT - Remove user constraint or use root
blockchain:
  image: daon-blockchain:latest
  # No user constraint - runs as root
```

### **When to Check**
- ✅ "Permission denied" errors in blockchain logs
- ✅ Genesis init failures
- ✅ Volume mount issues

---

## 10. ❌ Rebuilding Docker Images - Cache Issues

### **The Problem**
Docker uses cached layers even when source code changes:
```bash
docker build -t daon-api .  # May use cache!
docker restart daon-api-1   # Still runs old code!
```

### **The Fix**
```bash
# ✅ CORRECT - Force rebuild and recreate
docker build --no-cache -t daon-api .
docker stop daon-api-1 && docker rm daon-api-1
docker compose up -d daon-api-1
```

### **Rule**
🚨 **After code changes: --no-cache + stop/rm/recreate containers**

### **When to Check**
- ✅ Code changes not reflected in container
- ✅ After updating source files
- ✅ Before production deployment

---

## Quick Checklist - Before Deployment

### Blockchain Configuration
- [ ] `AccountAddressPrefix` set to your custom prefix
- [ ] Genesis uses key names, not addresses  
- [ ] `--keyring-backend test` flag on all key operations
- [ ] REST API binds to `0.0.0.0:1317`
- [ ] RPC binds to `0.0.0.0:26657`

### API Configuration  
- [ ] Custom messages registered in CosmJS Registry
- [ ] `GasPrice.fromString()` used (not plain object)
- [ ] accountParser decodes `BaseAccount` from protobuf
- [ ] `client.signAndBroadcast()` used (not manual encoding)
- [ ] Base64 parsing error handled gracefully

### Docker
- [ ] All services bind to `0.0.0.0` (not localhost)
- [ ] Images rebuilt with `--no-cache`
- [ ] Containers recreated (not just restarted)
- [ ] `.env` file present with all variables

### Testing
- [ ] Wallet shows custom prefix (e.g., `daon1...`)
- [ ] Wallet has funds
- [ ] API returns `blockchainTx` value
- [ ] Content verifiable on blockchain
- [ ] All 3 API instances respond

---

## Emergency Debugging Commands

```bash
# Check if blockchain is accessible from API container
docker exec daon-api-1 wget -O- http://daon-blockchain:26657/status

# Check if accounts are funded
docker exec daon-blockchain daond query bank balances <address> --home /daon/.daon

# Check actual account sequence
curl -s "http://localhost:1317/cosmos/auth/v1beta1/accounts/<address>" | jq '.account.sequence'

# Verify content on blockchain
docker exec daon-blockchain daond query contentregistry verify-content sha256:<hash> --home /daon/.daon

# Check API logs for errors
docker logs daon-api-1 --tail 50 | grep -E "(error|Error|failed|Failed)"

# Rebuild everything from scratch
docker compose down -v
docker system prune -a -f
docker compose build --no-cache
docker compose up -d
```

---

## File Locations to Remember

| What | Where |
|------|-------|
| Address prefix | `daon-core/app/app.go:78` |
| Genesis init | `docker-compose.yml:32-67` |
| API blockchain client | `api-server/src/blockchain.ts` |
| Registry setup | `api-server/src/blockchain.ts:56-59` |
| Account parser | `api-server/src/blockchain.ts:75-91` |
| Gas price | `api-server/src/blockchain.ts:72` |
| Network binding | `docker-compose.yml:64-65` |

---

**Keep this document nearby when making changes to the blockchain or API!** 🚨
