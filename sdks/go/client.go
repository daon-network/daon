// Package daon provides a Go client for the DAON content protection API.
//
// DAON registers a SHA-256 fingerprint of your content on the blockchain,
// providing tamper-proof proof of existence and ownership.
//
// Basic usage:
//
//	client := daon.NewClient("https://api.daon.network")
//	result, err := client.ProtectContent(ctx, daon.ProtectionRequest{
//	    Content: "my story text",
//	    License: "liberation_v1",
//	})
package daon

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const (
	defaultAPIURL = "https://api.daon.network"
	defaultTimeout = 30 * time.Second
	sdkUserAgent   = "DAON-Go-SDK/1.0.0"
)

// Client is the DAON API client.
type Client struct {
	apiURL     string
	httpClient *http.Client
}

// NewClient creates a new DAON client targeting the given API URL.
// Pass an empty string to use the default (https://api.daon.network).
func NewClient(apiURL string) *Client {
	if apiURL == "" {
		apiURL = defaultAPIURL
	}
	return &Client{
		apiURL: apiURL,
		httpClient: &http.Client{
			Timeout: defaultTimeout,
		},
	}
}

// ProtectionRequest holds the data needed to register content.
type ProtectionRequest struct {
	Content  string                 `json:"content"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
	License  string                 `json:"license,omitempty"`
}

// ProtectionResult is returned by ProtectContent.
type ProtectionResult struct {
	Success         bool   `json:"success"`
	ContentHash     string `json:"contentHash"`  // sha256:<hex>
	VerificationURL string `json:"verificationUrl"`
	Timestamp       string `json:"timestamp"`
	License         string `json:"license"`
	BlockchainTx    string `json:"blockchainTx,omitempty"`
}

// VerificationResult is returned by VerifyContent and VerifyHash.
type VerificationResult struct {
	Verified        bool      `json:"isValid"`
	ContentHash     string    `json:"contentHash"` // sha256:<hex>
	License         string    `json:"license"`
	Timestamp       time.Time `json:"timestamp"`
	VerificationURL string    `json:"verificationUrl"`
}

// ContentMetadata is a convenience struct for building the Metadata map.
type ContentMetadata struct {
	Title     string   `json:"title,omitempty"`
	Author    string   `json:"author,omitempty"`
	Fandoms   []string `json:"fandoms,omitempty"`
	Tags      []string `json:"tags,omitempty"`
	WordCount int      `json:"word_count,omitempty"`
	Language  string   `json:"language,omitempty"`
}

// ToMap converts the struct to a map suitable for ProtectionRequest.Metadata.
func (m ContentMetadata) ToMap() map[string]interface{} {
	b, _ := json.Marshal(m)
	var out map[string]interface{}
	_ = json.Unmarshal(b, &out)
	return out
}

// LiberationUseCase describes a proposed use of Liberation-licensed content.
type LiberationUseCase struct {
	EntityType   string // "individual", "corporation", "nonprofit"
	UseType      string // "personal", "commercial", "ai_training"
	Purpose      string // "profit", "education", "humanitarian"
	Compensation bool   // whether creators will be compensated
}

// LiberationCheckResult holds the outcome of a local compliance evaluation.
type LiberationCheckResult struct {
	Compliant       bool
	Reason          string
	Recommendations []string
}

// ProtectContent registers content with DAON and returns the protection record.
func (c *Client) ProtectContent(ctx context.Context, req ProtectionRequest) (*ProtectionResult, error) {
	if req.Content == "" {
		return nil, fmt.Errorf("content cannot be empty")
	}
	if req.License == "" {
		req.License = "liberation_v1"
	}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, c.apiURL+"/api/v1/protect", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("POST /api/v1/protect: %w", err)
	}
	defer resp.Body.Close()

	if err := checkStatus(resp); err != nil {
		return nil, err
	}

	var raw struct {
		Success         bool   `json:"success"`
		ContentHash     string `json:"contentHash"`
		VerificationURL string `json:"verificationUrl"`
		Timestamp       string `json:"timestamp"`
		License         string `json:"license"`
		BlockchainTx    string `json:"blockchainTx"`
		Blockchain      struct {
			Tx string `json:"tx"`
		} `json:"blockchain"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	blockchainTx := raw.BlockchainTx
	if blockchainTx == "" {
		blockchainTx = raw.Blockchain.Tx
	}

	return &ProtectionResult{
		Success:         raw.Success,
		ContentHash:     "sha256:" + raw.ContentHash,
		VerificationURL: raw.VerificationURL,
		Timestamp:       raw.Timestamp,
		License:         raw.License,
		BlockchainTx:    blockchainTx,
	}, nil
}

// VerifyContent hashes the provided content and looks it up on the chain.
func (c *Client) VerifyContent(ctx context.Context, content string) (*VerificationResult, error) {
	hash := GenerateContentHash(content)
	return c.VerifyHash(ctx, hash)
}

// VerifyHash looks up a hash on the chain. Accepts both "sha256:<hex>" and
// bare 64-character hex strings.
func (c *Client) VerifyHash(ctx context.Context, contentHash string) (*VerificationResult, error) {
	// Strip sha256: prefix — API expects bare 64-char hex
	apiHash := contentHash
	if len(apiHash) > 7 && apiHash[:7] == "sha256:" {
		apiHash = apiHash[7:]
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodGet, c.apiURL+"/api/v1/verify/"+apiHash, nil)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	c.setHeaders(httpReq)

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("GET /api/v1/verify/%s: %w", apiHash, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return &VerificationResult{Verified: false, ContentHash: "sha256:" + apiHash}, nil
	}
	if err := checkStatus(resp); err != nil {
		return nil, err
	}

	var raw struct {
		IsValid         bool   `json:"isValid"`
		ContentHash     string `json:"contentHash"`
		License         string `json:"license"`
		Timestamp       string `json:"timestamp"`
		VerificationURL string `json:"verificationUrl"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	var ts time.Time
	if raw.Timestamp != "" {
		ts, _ = time.Parse(time.RFC3339, raw.Timestamp)
	}

	return &VerificationResult{
		Verified:        raw.IsValid,
		ContentHash:     "sha256:" + raw.ContentHash,
		License:         raw.License,
		Timestamp:       ts,
		VerificationURL: raw.VerificationURL,
	}, nil
}

// CheckLiberationCompliance evaluates a proposed use against Liberation License
// rules locally. No network call is made.
func CheckLiberationCompliance(useCase LiberationUseCase) LiberationCheckResult {
	if useCase.EntityType == "corporation" && useCase.UseType == "ai_training" && !useCase.Compensation {
		return LiberationCheckResult{
			Compliant: false,
			Reason:    "Commercial AI training without creator compensation violates the Liberation License.",
			Recommendations: []string{
				"Obtain explicit permission from the creator",
				"Compensate creators for use in AI training datasets",
			},
		}
	}
	if useCase.EntityType == "corporation" && useCase.Purpose == "profit" && !useCase.Compensation {
		return LiberationCheckResult{
			Compliant: false,
			Reason:    "Corporate profit extraction without creator compensation violates the Liberation License.",
			Recommendations: []string{
				"Negotiate a licensing agreement with the creator",
				"Include creator compensation in your budget",
			},
		}
	}
	return LiberationCheckResult{
		Compliant: true,
		Reason:    "Use case is compliant with Liberation License terms.",
	}
}

// GenerateContentHash returns the SHA-256 hash of content as "sha256:<hex>".
// This matches the API's hash function exactly: raw UTF-8 bytes, no normalization.
func GenerateContentHash(content string) string {
	sum := sha256.Sum256([]byte(content))
	return "sha256:" + hex.EncodeToString(sum[:])
}

// Work is a convenience struct for platform integration.
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

// ProtectWork registers a work with DAON and updates the work's DAONHash field.
func (c *Client) ProtectWork(ctx context.Context, work *Work, license string) error {
	if license == "" {
		license = "liberation_v1"
	}

	result, err := c.ProtectContent(ctx, ProtectionRequest{
		Content: work.Content,
		License: license,
		Metadata: ContentMetadata{
			Title:     work.Title,
			Author:    work.Author,
			Fandoms:   work.Fandoms,
			Tags:      work.Tags,
			WordCount: work.WordCount,
		}.ToMap(),
	})
	if err != nil {
		return fmt.Errorf("DAON registration failed: %w", err)
	}

	work.DAONHash = result.ContentHash
	work.DAONProtected = true

	fmt.Printf("Work %q protected by DAON. Hash: %s\n", work.Title, result.ContentHash)
	return nil
}

// --- internal helpers ---

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", sdkUserAgent)
}

func checkStatus(resp *http.Response) error {
	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	body, _ := io.ReadAll(resp.Body)
	return fmt.Errorf("DAON API error %d: %s", resp.StatusCode, string(body))
}
