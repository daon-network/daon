package daon

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// Known SHA-256 test vector
const testContent = "test"

var testHashHex = func() string {
	sum := sha256.Sum256([]byte(testContent))
	return hex.EncodeToString(sum[:])
}()

var testHash = "sha256:" + testHashHex

// ---------------------------------------------------------------------------
// GenerateContentHash
// ---------------------------------------------------------------------------

func TestGenerateContentHash_KnownVector(t *testing.T) {
	got := GenerateContentHash(testContent)
	if got != testHash {
		t.Errorf("got %q, want %q", got, testHash)
	}
}

func TestGenerateContentHash_Format(t *testing.T) {
	h := GenerateContentHash("anything")
	if !strings.HasPrefix(h, "sha256:") {
		t.Errorf("hash should start with sha256:, got %q", h)
	}
	if len(h) != 7+64 {
		t.Errorf("unexpected length %d: %q", len(h), h)
	}
}

func TestGenerateContentHash_NoWhitespaceNormalisation(t *testing.T) {
	if GenerateContentHash("foo  bar") == GenerateContentHash("foo bar") {
		t.Error("double space and single space should produce different hashes")
	}
}

func TestGenerateContentHash_NoLineEndingNormalisation(t *testing.T) {
	if GenerateContentHash("foo\r\nbar") == GenerateContentHash("foo\nbar") {
		t.Error("CRLF and LF should produce different hashes")
	}
}

func TestGenerateContentHash_NoStrip(t *testing.T) {
	if GenerateContentHash("  test  ") == GenerateContentHash("test") {
		t.Error("leading/trailing whitespace should not be stripped before hashing")
	}
}

// ---------------------------------------------------------------------------
// CheckLiberationCompliance
// ---------------------------------------------------------------------------

func TestLiberationCompliance_BlocksCorporateAINoCompensation(t *testing.T) {
	r := CheckLiberationCompliance(LiberationUseCase{
		EntityType:   "corporation",
		UseType:      "ai_training",
		Purpose:      "profit",
		Compensation: false,
	})
	if r.Compliant {
		t.Error("corporate AI training without compensation should not be compliant")
	}
	if !strings.Contains(strings.ToLower(r.Reason), "training") {
		t.Errorf("reason should mention training, got %q", r.Reason)
	}
}

func TestLiberationCompliance_BlocksCorporateProfitNoCompensation(t *testing.T) {
	r := CheckLiberationCompliance(LiberationUseCase{
		EntityType:   "corporation",
		UseType:      "commercial",
		Purpose:      "profit",
		Compensation: false,
	})
	if r.Compliant {
		t.Error("corporate profit use without compensation should not be compliant")
	}
}

func TestLiberationCompliance_AllowsCorporateWithCompensation(t *testing.T) {
	r := CheckLiberationCompliance(LiberationUseCase{
		EntityType:   "corporation",
		UseType:      "ai_training",
		Purpose:      "profit",
		Compensation: true,
	})
	if !r.Compliant {
		t.Errorf("corporate use with compensation should be compliant, got reason: %q", r.Reason)
	}
}

func TestLiberationCompliance_AllowsIndividualPersonal(t *testing.T) {
	r := CheckLiberationCompliance(LiberationUseCase{
		EntityType:   "individual",
		UseType:      "personal",
		Purpose:      "education",
		Compensation: false,
	})
	if !r.Compliant {
		t.Errorf("individual personal use should be compliant, got: %q", r.Reason)
	}
}

// ---------------------------------------------------------------------------
// ProtectContent (HTTP)
// ---------------------------------------------------------------------------

func TestProtectContent_SendsContentNotHash(t *testing.T) {
	var gotBody map[string]interface{}

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/protect" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
		}
		if err := json.NewDecoder(r.Body).Decode(&gotBody); err != nil {
			t.Errorf("decode body: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":         true,
			"contentHash":     testHashHex,
			"verificationUrl": "https://app.daon.network/verify/" + testHashHex,
			"timestamp":       "2026-01-01T00:00:00.000Z",
			"license":         "liberation_v1",
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL)
	_, err := client.ProtectContent(context.Background(), ProtectionRequest{
		Content: testContent,
		License: "liberation_v1",
	})
	if err != nil {
		t.Fatalf("ProtectContent error: %v", err)
	}

	if _, ok := gotBody["content_hash"]; ok {
		t.Error("body should not contain content_hash")
	}
	if _, ok := gotBody["creator"]; ok {
		t.Error("body should not contain creator")
	}
	if v, ok := gotBody["content"]; !ok || v != testContent {
		t.Errorf("expected body.content=%q, got %v", testContent, v)
	}
}

func TestProtectContent_PrefixesHashFromResponse(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":         true,
			"contentHash":     testHashHex,
			"verificationUrl": "https://app.daon.network/verify/" + testHashHex,
			"timestamp":       "2026-01-01T00:00:00.000Z",
			"license":         "liberation_v1",
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL)
	result, err := client.ProtectContent(context.Background(), ProtectionRequest{Content: testContent})
	if err != nil {
		t.Fatalf("ProtectContent error: %v", err)
	}

	if result.ContentHash != testHash {
		t.Errorf("expected ContentHash=%q, got %q", testHash, result.ContentHash)
	}
}

// ---------------------------------------------------------------------------
// VerifyHash (HTTP)
// ---------------------------------------------------------------------------

func TestVerifyHash_StripsSha256Prefix(t *testing.T) {
	var gotPath string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":         true,
			"isValid":         true,
			"contentHash":     testHashHex,
			"license":         "liberation_v1",
			"timestamp":       "2026-01-01T00:00:00.000Z",
			"verificationUrl": "https://app.daon.network/verify/" + testHashHex,
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL)
	client.VerifyHash(context.Background(), testHash)

	wantPath := "/api/v1/verify/" + testHashHex
	if gotPath != wantPath {
		t.Errorf("expected path %q, got %q", wantPath, gotPath)
	}
	if strings.Contains(gotPath, "sha256:") {
		t.Error("path should not contain sha256: prefix")
	}
}

func TestVerifyHash_MapsIsValidToVerified(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success":         true,
			"isValid":         true,
			"contentHash":     testHashHex,
			"license":         "liberation_v1",
			"timestamp":       "2026-01-01T00:00:00.000Z",
			"verificationUrl": "https://app.daon.network/verify/" + testHashHex,
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL)
	result, err := client.VerifyHash(context.Background(), testHash)
	if err != nil {
		t.Fatalf("VerifyHash error: %v", err)
	}

	if !result.Verified {
		t.Error("expected Verified=true")
	}
	if result.License != "liberation_v1" {
		t.Errorf("expected License=liberation_v1, got %q", result.License)
	}
}

func TestVerifyHash_ReturnsFalseOn404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.NotFound(w, r)
	}))
	defer srv.Close()

	client := NewClient(srv.URL)
	result, err := client.VerifyHash(context.Background(), testHash)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result.Verified {
		t.Error("expected Verified=false for 404")
	}
}

func TestVerifyContent_HashesAndVerifies(t *testing.T) {
	var gotPath string

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"success": true, "isValid": true,
			"contentHash": testHashHex, "license": "liberation_v1",
			"timestamp": "2026-01-01T00:00:00.000Z",
		})
	}))
	defer srv.Close()

	client := NewClient(srv.URL)
	client.VerifyContent(context.Background(), testContent)

	if gotPath != "/api/v1/verify/"+testHashHex {
		t.Errorf("unexpected path %q", gotPath)
	}
}
