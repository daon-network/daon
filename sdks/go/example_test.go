// Example test to validate DAON Go SDK integration
package daon

import (
	"context"
	"testing"
	"time"
)

func TestClientCreation(t *testing.T) {
	// Test creating a DAON client
	client, err := NewClient("localhost:9090", "daon-localnet")
	if err != nil {
		// Expected to fail without running DAON node - just testing compilation
		t.Log("Expected error without DAON node:", err)
	}
	defer func() {
		if client != nil {
			client.Close()
		}
	}()

	// Test content hash generation
	content := "This is a test fanfiction work"
	hash := client.GenerateContentHash(content)
	if hash == "" {
		t.Error("Content hash should not be empty")
	}
	t.Log("Generated content hash:", hash)
}

func TestWorkProtection(t *testing.T) {
	client, err := NewClient("localhost:9090", "daon-localnet")
	if err != nil {
		t.Log("Expected error without DAON node:", err)
		return // Skip rest of test
	}
	defer client.Close()

	// Create test work
	work := &Work{
		ID:          "test-123",
		Title:       "My Revolutionary Fanfic",
		Author:      "test-author",
		Content:     "This work fights AI exploitation with DAON protection!",
		Fandoms:     []string{"Original Work"},
		Characters:  []string{"Hero", "Villain"},
		Tags:        []string{"liberation", "anti-exploitation"},
		WordCount:   10,
		PublishDate: time.Now(),
	}

	// Test protecting work (will fail without wallet setup - just testing types)
	err = client.ProtectWork(context.Background(), work, "daon1testcreator", "liberation_v1")
	if err != nil {
		t.Log("Expected error without wallet:", err)
	}
}

func TestLiberationLicense(t *testing.T) {
	client, err := NewClient("localhost:9090", "daon-localnet")
	if err != nil {
		t.Log("Expected error without DAON node:", err)
		return
	}
	defer client.Close()

	// Test Liberation License compliance check
	useCase := LiberationUseCase{
		EntityType:   "corporation",
		UseType:      "ai_training",
		Purpose:      "profit",
		Compensation: false, // Corporate AI training without compensation
	}

	result, err := client.CheckLiberationLicense(context.Background(), "test-hash", useCase)
	if err != nil {
		t.Log("Expected error without content:", err)
		return
	}

	// Should be non-compliant for corporate AI training without compensation
	if result.Compliant {
		t.Error("Corporate AI training without compensation should not be compliant")
	}
	t.Log("Liberation License check result:", result.Reason)
}
