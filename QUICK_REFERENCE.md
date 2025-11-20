# DAON Quick Reference

## Critical Configuration Points

### 1. Address Prefix (MUST be `daon`)
**File**: `daon-core/app/app.go:78`
```go
AccountAddressPrefix: "daon",  // NOT "cosmos"
```

### 2. Docker Compose Initialization Script
**File**: `docker-compose.yml:32-67`
- Creates validator and API wallet keys
- Funds both from genesis
- Uses **key names** (not addresses) for `genesis add-genesis-account`
- Enables REST API on `0.0.0.0:1317`
- Enables RPC on `0.0.0.0:26657`

### 3. API Blockchain Client Setup
**File**: `api-server/src/blockchain.ts`

**Required imports**:
```typescript
import { GasPrice } from '@cosmjs/stargate';
import { BaseAccount } from 'cosmjs-types/cosmos/auth/v1beta1/auth.js';
```

**Registry configuration** (line ~56):
```typescript
const customRegistry = new Registry([
  ...defaultRegistryTypes,
  ['/daoncore.contentregistry.v1.MsgRegisterContent', MsgRegisterContent]
]);
```

**GasPrice configuration** (line ~71):
```typescript
gasPrice: GasPrice.fromString('0stake'),  // NOT {denom: 'stake', amount: '0'}
```

**Account Parser** (line ~75):
```typescript
accountParser: (input) => {
  // MUST decode protobuf bytes!
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
},
```

### 4. Transaction Submission
**Use CosmJS's registry** (NOT manual encoding):
```typescript
const result = await this.client.signAndBroadcast(
  this.address,
  [msg],
  'auto',  // Let CosmJS calculate gas
  memo
);
```

## Common Issues & Solutions

### Issue: "unable to resolve type URL"
**Cause**: Manual protobuf encoding bypasses registry  
**Solution**: Use `client.signAndBroadcast()` instead of manual encoding

### Issue: "sequence mismatch"
**Cause**: accountParser not decoding protobuf bytes  
**Solution**: Import `BaseAccount` and use `.decode(input.value)`

### Issue: "gasPriceAmount.multiply is not a function"
**Cause**: gasPrice is plain object, not GasPrice instance  
**Solution**: Use `GasPrice.fromString('0stake')`

### Issue: "validator set is empty"
**Cause**: Genesis account added with address instead of key name  
**Solution**: Use key names: `daond genesis add-genesis-account validator ...`

### Issue: "Permission denied" in Docker
**Cause**: User constraint incompatible with Docker volumes  
**Solution**: Remove `user: "1000:1000"` from docker-compose.yml

### Issue: API can't reach blockchain
**Cause**: Blockchain listening on localhost:1317 instead of 0.0.0.0  
**Solution**: Add to init script:
```bash
sed -i 's|address = "tcp://localhost:1317"|address = "tcp://0.0.0.0:1317"|g' config/app.toml
```

## Quick Commands

### Restart Everything
```bash
docker compose down && docker compose up -d
```

### Rebuild API Only
```bash
cd api-server
docker build --no-cache -t daon-api .
docker restart daon-api-1 daon-api-2 daon-api-3
```

### Rebuild Blockchain Only
```bash
cd daon-core
docker build -t daon-blockchain .
docker compose down -v  # WARNING: Deletes blockchain data!
docker compose up -d
```

### Check Blockchain Status
```bash
curl http://localhost:1317/cosmos/base/tendermint/v1beta1/node_info | jq
```

### Query Content
```bash
docker exec daon-blockchain daond query contentregistry verify-content sha256:<hash> --home /daon/.daon
```

### Check Wallet Balance
```bash
docker exec daon-blockchain daond query bank balances daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n --home /daon/.daon
```

### View API Logs
```bash
docker logs -f daon-api-1
```

### Run Tests
```bash
./test-e2e.sh
```

## Testing Checklist

Before deploying:

- [ ] Run `./test-e2e.sh` - all 8 tests pass
- [ ] Verify addresses have `daon` prefix
- [ ] Verify wallet has funds (5B stake)
- [ ] Test content protection on all 3 API instances
- [ ] Verify content on blockchain
- [ ] Check all containers are healthy
- [ ] Review logs for errors

## File Checklist

Critical files to review before deployment:

1. **`.env`** - Environment variables (secrets!)
2. **`daon-core/app/app.go:78`** - Address prefix
3. **`api-server/src/blockchain.ts`** - Registry, accountParser, gasPrice
4. **`docker-compose.yml`** - Init script, ports, volumes
5. **`test-e2e.sh`** - Regression tests

## Expected Behavior

### Successful Transaction
1. API receives POST to `/api/v1/protect`
2. API returns `"success": true` with contentHash
3. Console shows: `Submitting transaction using client signAndBroadcast...`
4. Blockchain query returns `verified: true`
5. Creator address has `daon1` prefix

### Known Response Issue
API returns:
```json
{
  "success": true,
  "blockchainTx": null,
  "message": "Content protected (blockchain pending)"
}
```

**This is OK!** Transaction succeeded. The `null` tx is due to response parsing, not tx failure.

Verify with:
```bash
docker exec daon-blockchain daond query contentregistry verify-content sha256:<hash> --home /daon/.daon
```

Should return `verified: true`.

## Port Reference

| Port | Service | Description |
|------|---------|-------------|
| 3001 | API-1 | Content protection API |
| 3002 | API-2 | Load balanced instance |
| 3003 | API-3 | Load balanced instance |
| 5432 | PostgreSQL | Database |
| 6379 | Redis | Cache |
| 26656 | Blockchain P2P | Node communication |
| 26657 | Blockchain RPC | Transaction submission |
| 1317 | Blockchain REST | Query API |

## Wallet Details

**Mnemonic** (from `.env`):
```
blur cause boost pass stick allow hundred odor level erosion umbrella urban need indicate inject funny anchor kiss rain equal among unhappy sad dutch
```

**Address**: `daon1sjprvykgf0yj59f4nzjpwjyekj85a6gtl3qx3n`

**Initial Balance**: 5,000,000,000 stake (5 billion)

⚠️ **PRODUCTION**: Generate new mnemonic and NEVER commit to git!
