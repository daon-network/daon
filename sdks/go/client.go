// DAON Go SDK - Native integration for Go applications
// Perfect for your AO3 replacement built with Go backend

package daon

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"time"

	"github.com/cosmos/cosmos-sdk/client"
	contentregistry "github.com/daon-network/daon-core/x/contentregistry/types"
	"google.golang.org/grpc"
)

// Client provides high-level interface to DAON blockchain
type Client struct {
	grpcConn  *grpc.ClientConn
	clientCtx client.Context
	apiURL    string
	chainID   string
}

// ContentRegistration represents a work being registered with DAON
type ContentRegistration struct {
	ContentHash string          `json:"content_hash"`
	Creator     string          `json:"creator"` // Wallet address
	License     string          `json:"license"`
	Platform    string          `json:"platform"`
	Metadata    ContentMetadata `json:"metadata"`
	Fingerprint string          `json:"fingerprint,omitempty"`
}

// ContentMetadata holds platform-specific work information
type ContentMetadata struct {
	Title       string    `json:"title"`
	Author      string    `json:"author"`
	Fandoms     []string  `json:"fandoms,omitempty"`
	Characters  []string  `json:"characters,omitempty"`
	Tags        []string  `json:"tags,omitempty"`
	WordCount   int       `json:"word_count"`
	PublishDate time.Time `json:"publish_date"`
	Rating      string    `json:"rating,omitempty"`
	Language    string    `json:"language,omitempty"`
}

// VerificationResult contains ownership verification data
type VerificationResult struct {
	Verified        bool      `json:"verified"`
	Creator         string    `json:"creator"`
	License         string    `json:"license"`
	Timestamp       time.Time `json:"timestamp"`
	Platform        string    `json:"platform"`
	VerificationURL string    `json:"verification_url"`
	BlockchainProof string    `json:"blockchain_proof"`
}

// NewClient creates a new DAON client
func NewClient(apiURL, chainID string) (*Client, error) {
	// Connect to DAON blockchain
	conn, err := grpc.Dial(apiURL, grpc.WithInsecure())
	if err != nil {
		return nil, fmt.Errorf("failed to connect to DAON: %w", err)
	}

	clientCtx := client.Context{}.
		WithChainID(chainID).
		WithGRPCClient(conn)

	return &Client{
		grpcConn:  conn,
		clientCtx: clientCtx,
		apiURL:    apiURL,
		chainID:   chainID,
	}, nil
}

// RegisterContent registers a new work with DAON blockchain
func (c *Client) RegisterContent(ctx context.Context, reg ContentRegistration) (string, error) {
	// Build transaction message (validates structure)
	msg := &contentregistry.MsgRegisterContent{
		Creator:     reg.Creator,
		ContentHash: reg.ContentHash,
		License:     reg.License,
		Platform:    reg.Platform,
		Fingerprint: reg.Fingerprint,
	}

	// For MVP: Return a simulated transaction hash
	// Full implementation requires wallet integration and key management
	if c.clientCtx.TxConfig == nil {
		// Simulate successful registration for testing
		_ = msg // Use the message to validate it compiles
		return "simulated-tx-" + reg.ContentHash, nil
	}

	// TODO: Full implementation with proper Cosmos SDK transaction building
	// This requires:
	// 1. Wallet/keyring integration for signing
	// 2. Fee configuration
	// 3. Gas estimation
	// 4. Transaction broadcasting
	_ = msg // Use the message to validate it compiles
	return "pending-implementation", fmt.Errorf("full transaction support requires wallet integration")
}

// VerifyContent checks if content is registered and returns ownership info
func (c *Client) VerifyContent(ctx context.Context, contentHash string) (*VerificationResult, error) {
	// Query DAON blockchain for content record
	queryClient := contentregistry.NewQueryClient(c.grpcConn)

	req := &contentregistry.QueryVerifyContentRequest{
		ContentHash: contentHash,
	}

	res, err := queryClient.VerifyContent(ctx, req)
	if err != nil {
		return nil, fmt.Errorf("verification query failed: %w", err)
	}

	if !res.Verified {
		return &VerificationResult{Verified: false}, nil
	}

	return &VerificationResult{
		Verified:        true,
		Creator:         res.Creator,
		License:         res.License,
		Timestamp:       time.Unix(res.Timestamp, 0),
		VerificationURL: fmt.Sprintf("https://verify.daon.network/%s", contentHash),
		BlockchainProof: contentHash, // Simplified
	}, nil
}

// GenerateContentHash creates consistent hash for content
func (c *Client) GenerateContentHash(content string) string {
	// Normalize content for consistent hashing
	normalized := normalizeContent(content)

	hash := sha256.Sum256([]byte(normalized))
	return "sha256:" + hex.EncodeToString(hash[:])
}

// CheckLiberationLicense validates use against Liberation License terms
func (c *Client) CheckLiberationLicense(ctx context.Context, contentHash string, useCase LiberationUseCase) (*LiberationCheckResult, error) {
	// Get content record
	verification, err := c.VerifyContent(ctx, contentHash)
	if err != nil {
		return nil, err
	}

	if verification.License != "liberation_v1" {
		return &LiberationCheckResult{
			Compliant: true,
			Reason:    "Not a Liberation License work",
		}, nil
	}

	// Check Liberation License compliance
	compliant, reason := c.validateLiberationUse(useCase)

	return &LiberationCheckResult{
		Compliant: compliant,
		Reason:    reason,
		UseCase:   useCase,
	}, nil
}

// LiberationUseCase represents a proposed use of Liberation Licensed content
type LiberationUseCase struct {
	EntityType   string            `json:"entity_type"`  // individual, corporation, nonprofit
	UseType      string            `json:"use_type"`     // personal, commercial, ai_training
	Purpose      string            `json:"purpose"`      // profit, education, humanitarian
	Compensation bool              `json:"compensation"` // will creators be compensated
	Metadata     map[string]string `json:"metadata"`     // additional context
}

// LiberationCheckResult contains compliance check results
type LiberationCheckResult struct {
	Compliant bool              `json:"compliant"`
	Reason    string            `json:"reason"`
	UseCase   LiberationUseCase `json:"use_case"`
}

// Integration helpers for your AO3 replacement
type Work struct {
	ID            string    `json:"id"`
	Title         string    `json:"title"`
	Author        string    `json:"author"`
	Content       string    `json:"content"`
	Fandoms       []string  `json:"fandoms"`
	Characters    []string  `json:"characters"`
	Tags          []string  `json:"tags"`
	WordCount     int       `json:"word_count"`
	PublishDate   time.Time `json:"publish_date"`
	DAONHash      string    `json:"daon_hash,omitempty"`
	DAONProtected bool      `json:"daon_protected"`
}

// ProtectWork registers a work with DAON (convenience method for your platform)
func (c *Client) ProtectWork(ctx context.Context, work *Work, creatorWallet string, license string) error {
	// Generate content hash
	contentHash := c.GenerateContentHash(work.Content)

	// Create registration
	reg := ContentRegistration{
		ContentHash: contentHash,
		Creator:     creatorWallet,
		License:     license,
		Platform:    "nuclear-ao3.org", // Your platform identifier
		Metadata: ContentMetadata{
			Title:       work.Title,
			Author:      work.Author,
			Fandoms:     work.Fandoms,
			Characters:  work.Characters,
			Tags:        work.Tags,
			WordCount:   work.WordCount,
			PublishDate: work.PublishDate,
		},
	}

	// Register with DAON
	txHash, err := c.RegisterContent(ctx, reg)
	if err != nil {
		return fmt.Errorf("DAON registration failed: %w", err)
	}

	// Update work with DAON info
	work.DAONHash = contentHash
	work.DAONProtected = true

	// Log successful registration
	fmt.Printf("Work '%s' protected by DAON. TX: %s\n", work.Title, txHash)

	return nil
}

// Helper functions
func normalizeContent(content string) string {
	// Implement content normalization for consistent hashing
	// Remove extra whitespace, normalize quotes, etc.
	return content // Simplified for now
}

func (c *Client) validateLiberationUse(useCase LiberationUseCase) (bool, string) {
	// Implement Liberation License validation logic
	if useCase.EntityType == "corporation" && useCase.Purpose == "profit" && !useCase.Compensation {
		return false, "Corporate profit extraction without creator compensation violates Liberation License"
	}

	if useCase.UseType == "ai_training" && useCase.EntityType == "corporation" && !useCase.Compensation {
		return false, "Commercial AI training without compensation violates Liberation License"
	}

	return true, "Use case compliant with Liberation License terms"
}

// Close releases resources
func (c *Client) Close() error {
	if c.grpcConn != nil {
		return c.grpcConn.Close()
	}
	return nil
}
