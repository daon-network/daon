# DAON Go SDK

Official Go SDK for the DAON Creator Protection Network. Protect your creative works from AI exploitation with blockchain-backed ownership.

[![Go Reference](https://pkg.go.dev/badge/github.com/daon-network/daon-go-sdk.svg)](https://pkg.go.dev/github.com/daon-network/daon-go-sdk)
[![Go Report Card](https://goreportcard.com/badge/github.com/daon-network/daon-go-sdk)](https://goreportcard.com/report/github.com/daon-network/daon-go-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Features

- ✅ **Content Protection**: Register creative works on DAON blockchain
- ✅ **Ownership Verification**: Cryptographically prove content ownership
- ✅ **Liberation License**: Built-in support for creator-first licensing
- ✅ **Native Go**: Idiomatic Go API with full type safety
- ✅ **High Performance**: Direct gRPC connection to DAON blockchain
- ✅ **Zero Dependencies**: Uses standard library + Cosmos SDK

## Installation

```bash
go get github.com/daon-network/daon-go-sdk
```

## Quick Start

```go
package main

import (
    "context"
    "fmt"
    "log"
    
    daon "github.com/daon-network/daon-go-sdk"
)

func main() {
    // Connect to DAON
    client, err := daon.NewClient("https://rpc.daon.network:9090", "daon-mainnet-1")
    if err != nil {
        log.Fatal(err)
    }
    defer client.Close()
    
    // Protect your creative work
    work := &daon.Work{
        Title:      "My Revolutionary Fanfic",
        Author:     "YourName",
        Content:    "Once upon a time...",
        Fandoms:    []string{"Original Work"},
        WordCount:  5000,
    }
    
    err = client.ProtectWork(
        context.Background(),
        work,
        "daon1yourcreatoraddress",
        "liberation_v1",
    )
    if err != nil {
        log.Fatal(err)
    }
    
    fmt.Printf("✅ Work protected! Hash: %s\n", work.DAONHash)
}
```

## Use Cases

### 1. Fanfiction Platform (AO3 Alternative)

```go
// Automatically protect works when users publish
func (app *FanficApp) PublishWork(work *daon.Work, user *User) error {
    // Protect with DAON
    err := app.daonClient.ProtectWork(
        context.Background(),
        work,
        user.DAONWallet,
        "liberation_v1", // Anti-AI-exploitation license
    )
    if err != nil {
        return fmt.Errorf("DAON protection failed: %w", err)
    }
    
    // Save to your database
    return app.db.SaveWork(work)
}
```

### 2. AI Scraper Compliance Check

```go
// Before training on content, check if it's allowed
func (scraper *AIScraper) CanUseContent(contentHash string) (bool, error) {
    // Check Liberation License compliance
    result, err := scraper.daonClient.CheckLiberationLicense(
        context.Background(),
        contentHash,
        daon.LiberationUseCase{
            EntityType:   "corporation",
            UseType:      "ai_training",
            Purpose:      "profit",
            Compensation: false,
        },
    )
    if err != nil {
        return false, err
    }
    
    if !result.Compliant {
        log.Printf("⚠️  Cannot use content: %s", result.Reason)
        return false, nil
    }
    
    return true, nil
}
```

### 3. Content Verification

```go
// Verify ownership before displaying attribution
func (app *ContentApp) VerifyOwnership(contentHash string) (*daon.VerificationResult, error) {
    result, err := app.daonClient.VerifyContent(
        context.Background(),
        contentHash,
    )
    if err != nil {
        return nil, err
    }
    
    if !result.Verified {
        return nil, fmt.Errorf("content not registered with DAON")
    }
    
    // Display verified creator info
    fmt.Printf("✅ Verified creator: %s\n", result.Creator)
    fmt.Printf("📜 License: %s\n", result.License)
    fmt.Printf("🔗 Proof: %s\n", result.VerificationURL)
    
    return result, nil
}
```

### 4. Bulk Protection (AO3 Migration)

```go
// Migrate entire AO3 archive to DAON protection
func (migrator *AO3Migrator) ProtectUserWorks(userID string) error {
    works, err := migrator.FetchUserWorks(userID)
    if err != nil {
        return err
    }
    
    for _, work := range works {
        // Protect each work
        err := migrator.daonClient.ProtectWork(
            context.Background(),
            work,
            work.Author.DAONWallet,
            "liberation_v1",
        )
        if err != nil {
            log.Printf("Failed to protect '%s': %v", work.Title, err)
            continue
        }
        
        log.Printf("✅ Protected: %s (%d words)", work.Title, work.WordCount)
    }
    
    return nil
}
```

## API Reference

### Client Methods

#### `NewClient(apiURL, chainID string) (*Client, error)`
Create a new DAON client connection.

```go
client, err := daon.NewClient("https://rpc.daon.network:9090", "daon-mainnet-1")
```

#### `RegisterContent(ctx context.Context, reg ContentRegistration) (string, error)`
Register content directly on the blockchain.

```go
reg := daon.ContentRegistration{
    ContentHash: "sha256:abc123...",
    Creator:     "daon1creator...",
    License:     "liberation_v1",
    Platform:    "my-platform.org",
}
txHash, err := client.RegisterContent(ctx, reg)
```

#### `VerifyContent(ctx context.Context, contentHash string) (*VerificationResult, error)`
Verify content ownership and licensing.

```go
result, err := client.VerifyContent(ctx, "sha256:abc123...")
if result.Verified {
    fmt.Println("Content is protected!")
}
```

#### `ProtectWork(ctx context.Context, work *Work, creatorWallet, license string) error`
Convenience method to protect a work (combines hashing + registration).

```go
err := client.ProtectWork(ctx, work, "daon1creator", "liberation_v1")
```

#### `CheckLiberationLicense(ctx context.Context, contentHash string, useCase LiberationUseCase) (*LiberationCheckResult, error)`
Check if proposed use complies with Liberation License.

```go
result, err := client.CheckLiberationLicense(ctx, hash, useCase)
if !result.Compliant {
    log.Println("Use violates Liberation License:", result.Reason)
}
```

#### `GenerateContentHash(content string) string`
Generate consistent SHA-256 hash for content.

```go
hash := client.GenerateContentHash("content text")
// Returns: "sha256:a1b2c3..."
```

### Types

#### `Work`
Represents a creative work with metadata.

```go
type Work struct {
    ID            string
    Title         string
    Author        string
    Content       string
    Fandoms       []string
    Characters    []string
    Tags          []string
    WordCount     int
    PublishDate   time.Time
    DAONHash      string // Set after protection
    DAONProtected bool   // Set after protection
}
```

#### `ContentRegistration`
Direct blockchain registration structure.

```go
type ContentRegistration struct {
    ContentHash string
    Creator     string // Wallet address
    License     string
    Platform    string
    Metadata    ContentMetadata
    Fingerprint string // Optional
}
```

#### `LiberationUseCase`
Describes proposed use of Liberation Licensed content.

```go
type LiberationUseCase struct {
    EntityType   string // "individual", "corporation", "nonprofit"
    UseType      string // "personal", "commercial", "ai_training"
    Purpose      string // "profit", "education", "humanitarian"
    Compensation bool   // Will creators be compensated?
}
```

## Liberation License

The Liberation License is DAON's creator-first license designed to prevent AI exploitation while allowing beneficial uses.

### What's Allowed ✅
- Personal use by individuals
- Non-profit education
- Humanitarian projects
- AI training **with creator compensation**

### What's Not Allowed ❌
- Corporate profit extraction without compensation
- Commercial AI training without paying creators
- Claiming ownership of others' work

### Checking Compliance

```go
useCase := daon.LiberationUseCase{
    EntityType:   "corporation",
    UseType:      "ai_training",
    Purpose:      "profit",
    Compensation: true, // ✅ Creators will be paid
}

result, err := client.CheckLiberationLicense(ctx, contentHash, useCase)
if result.Compliant {
    fmt.Println("Use case complies with Liberation License")
}
```

## Configuration

### Mainnet
```go
client, err := daon.NewClient(
    "https://rpc.daon.network:9090",
    "daon-mainnet-1",
)
```

### Testnet
```go
client, err := daon.NewClient(
    "https://rpc-testnet.daon.network:9090",
    "daon-testnet-1",
)
```

### Local Development
```go
client, err := daon.NewClient(
    "localhost:9090",
    "daon-localnet",
)
```

## Error Handling

```go
result, err := client.VerifyContent(ctx, hash)
if err != nil {
    switch {
    case errors.Is(err, context.DeadlineExceeded):
        log.Println("Request timed out")
    case errors.Is(err, context.Canceled):
        log.Println("Request canceled")
    default:
        log.Printf("Verification failed: %v", err)
    }
    return err
}

if !result.Verified {
    log.Println("Content not found on blockchain")
}
```

## Testing

```bash
# Run tests
go test -v

# Run with coverage
go test -v -cover

# Run benchmarks
go test -bench=.
```

## Examples

See [`example_test.go`](example_test.go) for complete working examples.

## Requirements

- Go 1.18 or higher
- Access to DAON blockchain (mainnet/testnet/local)

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Links

- **Documentation**: https://docs.daon.network/go
- **API Server**: https://api.daon.network
- **Website**: https://daon.network
- **Discord**: https://discord.gg/daon
- **Issues**: https://github.com/daon-network/daon-go-sdk/issues

## Support

- 📧 Email: dev@daon.network
- 💬 Discord: https://discord.gg/daon
- 📖 Docs: https://docs.daon.network

---

**Fight AI exploitation. Protect creators. Use DAON.** ✊
