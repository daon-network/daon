// Example tests to validate DAON Go SDK compilation and basic behavior.
package daon

import (
	"context"
	"testing"
	"time"
)

func TestClientCreation(t *testing.T) {
	client := NewClient("")
	if client == nil {
		t.Fatal("NewClient should not return nil")
	}

	// Content hash generation is pure — no network call needed.
	content := "This is a test fanfiction work"
	hash := GenerateContentHash(content)
	if hash == "" {
		t.Error("content hash should not be empty")
	}
	if len(hash) != 7+64 { // "sha256:" + 64 hex chars
		t.Errorf("unexpected hash length %d: %s", len(hash), hash)
	}
	t.Log("Generated content hash:", hash)
}

func TestWorkProtection(t *testing.T) {
	// Skip if no network is available in the test environment.
	t.Skip("requires live DAON API — run manually against a real or local server")

	client := NewClient("")

	work := &Work{
		ID:          "test-123",
		Title:       "My Revolutionary Fanfic",
		Author:      "test-author",
		Content:     "This work fights AI exploitation with DAON protection!",
		Fandoms:     []string{"Original Work"},
		Tags:        []string{"liberation", "anti-exploitation"},
		WordCount:   10,
		PublishDate: time.Now(),
	}

	err := client.ProtectWork(context.Background(), work, "liberation_v1")
	if err != nil {
		t.Log("ProtectWork error:", err)
	}
}

func TestLiberationLicense(t *testing.T) {
	// Non-compliant: corporation doing AI training without compensation.
	nonCompliant := LiberationUseCase{
		EntityType:   "corporation",
		UseType:      "ai_training",
		Purpose:      "profit",
		Compensation: false,
	}
	result := CheckLiberationCompliance(nonCompliant)
	if result.Compliant {
		t.Error("corporate AI training without compensation should not be compliant")
	}
	t.Log("non-compliant reason:", result.Reason)

	// Compliant: individual personal use.
	compliant := LiberationUseCase{
		EntityType:   "individual",
		UseType:      "personal",
		Purpose:      "education",
		Compensation: false,
	}
	result2 := CheckLiberationCompliance(compliant)
	if !result2.Compliant {
		t.Error("individual personal use should be compliant")
	}
	t.Log("compliant reason:", result2.Reason)
}
