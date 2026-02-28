package keeper_test

import (
	"testing"

	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/daon-network/daon-core/x/contentregistry/keeper"
	"github.com/daon-network/daon-core/x/contentregistry/types"
	"github.com/stretchr/testify/require"
)

// TestRegisterContent_Basic tests basic content registration
func TestRegisterContent_Basic(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	ctx := f.ctx

	// Create test address (valid bech32)
	testAddr := sdk.AccAddress("test_creator_____").String()

	msg := &types.MsgRegisterContent{
		Creator:     testAddr,
		ContentHash: "sha256:1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
		License:     "liberation_v1",
		Fingerprint: "test_fingerprint",
		Platform:    "test_platform",
	}

	_, err := msgServer.RegisterContent(ctx, msg)
	require.NoError(t, err, "basic registration should succeed")
}

// TestRegisterContent_WithDuplicateDetection tests duplicate detection at all levels
func TestRegisterContent_WithDuplicateDetection(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	ctx := f.ctx
	testAddr := sdk.AccAddress("test_creator_____").String()

	// Register original content
	msg := &types.MsgRegisterContent{
		Creator:        testAddr,
		ContentHash:    "sha256:0000000000000000000000000000000000000000000000000000000000000001",
		License:        "liberation_v1",
		Fingerprint:    "test_fingerprint",
		Platform:       "test_platform",
		NormalizedHash: "norm_hash_123",
		PerceptualHash: "percep_hash_456",
	}

	_, err := msgServer.RegisterContent(ctx, msg)
	require.NoError(t, err, "original registration should succeed")

	// Test Level 1: Exact duplicate (same content_hash)
	msg2 := &types.MsgRegisterContent{
		Creator:     testAddr,
		ContentHash: "sha256:0000000000000000000000000000000000000000000000000000000000000001",
		License:     "liberation_v1",
	}

	_, err = msgServer.RegisterContent(ctx, msg2)
	require.Error(t, err, "exact duplicate should be rejected")
	require.Contains(t, err.Error(), "Level 1", "should detect exact duplicate")

	// Test Level 2: Normalized duplicate (different content_hash, same normalized_hash)
	msg3 := &types.MsgRegisterContent{
		Creator:        testAddr,
		ContentHash:    "sha256:0000000000000000000000000000000000000000000000000000000000000002",
		License:        "liberation_v1",
		NormalizedHash: "norm_hash_123", // Same normalized hash
	}

	_, err = msgServer.RegisterContent(ctx, msg3)
	require.Error(t, err, "normalized duplicate should be rejected")
	require.Contains(t, err.Error(), "Level 2", "should detect normalized duplicate")

	// Test Level 3: Perceptual duplicate (different content_hash, same perceptual_hash)
	msg4 := &types.MsgRegisterContent{
		Creator:        testAddr,
		ContentHash:    "sha256:0000000000000000000000000000000000000000000000000000000000000003",
		License:        "liberation_v1",
		NormalizedHash: "norm_hash_789",   // Different normalized
		PerceptualHash: "percep_hash_456", // Same perceptual hash
	}

	_, err = msgServer.RegisterContent(ctx, msg4)
	require.Error(t, err, "perceptual duplicate should be rejected")
	require.Contains(t, err.Error(), "Level 3", "should detect perceptual duplicate")
}

// TestRegisterContent_VersionChain tests version linking
func TestRegisterContent_VersionChain(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	ctx := f.ctx
	creator := sdk.AccAddress("test_creator_____").String()

	// Register v1 (original)
	v1Hash := "sha256:0000000000000000000000000000000000000000000000000000000000000011"
	msg1 := &types.MsgRegisterContent{
		Creator:     creator,
		ContentHash: v1Hash,
		License:     "liberation_v1",
		Platform:    "test_platform",
	}

	_, err := msgServer.RegisterContent(ctx, msg1)
	require.NoError(t, err, "v1 registration should succeed")

	// Register v2 (links to v1)
	v2Hash := "sha256:0000000000000000000000000000000000000000000000000000000000000012"
	msg2 := &types.MsgRegisterContent{
		Creator:         creator,
		ContentHash:     v2Hash,
		License:         "liberation_v1",
		Platform:        "test_platform",
		PreviousVersion: v1Hash,
	}

	_, err = msgServer.RegisterContent(ctx, msg2)
	require.NoError(t, err, "v2 registration should succeed")

	// Register v3 (links to v2)
	v3Hash := "sha256:0000000000000000000000000000000000000000000000000000000000000013"
	msg3 := &types.MsgRegisterContent{
		Creator:         creator,
		ContentHash:     v3Hash,
		License:         "liberation_v1",
		Platform:        "test_platform",
		PreviousVersion: v2Hash,
	}

	_, err = msgServer.RegisterContent(ctx, msg3)
	require.NoError(t, err, "v3 registration should succeed")

	// Test: Cannot link to non-existent version
	msgBad := &types.MsgRegisterContent{
		Creator:         creator,
		ContentHash:     "sha256:0000000000000000000000000000000000000000000000000000000000000099",
		License:         "liberation_v1",
		PreviousVersion: "sha256:9999999999999999999999999999999999999999999999999999999999999999",
	}

	_, err = msgServer.RegisterContent(ctx, msgBad)
	require.Error(t, err, "linking to non-existent version should fail")
	require.Contains(t, err.Error(), "does not exist", "should indicate version not found")
}

// TestRegisterContent_VersionChain_WrongCreator tests that only original creator can create versions
func TestRegisterContent_VersionChain_WrongCreator(t *testing.T) {
	f := initFixture(t)
	msgServer := keeper.NewMsgServerImpl(f.keeper)
	ctx := f.ctx
	creator1 := sdk.AccAddress("test_creator1____").String()
	creator2 := sdk.AccAddress("test_creator2____").String()

	// Register v1 by creator1
	v1Hash := "sha256:0000000000000000000000000000000000000000000000000000000000000021"
	msg1 := &types.MsgRegisterContent{
		Creator:     creator1,
		ContentHash: v1Hash,
		License:     "liberation_v1",
	}

	_, err := msgServer.RegisterContent(ctx, msg1)
	require.NoError(t, err, "v1 registration should succeed")

	// Try to register v2 by creator2 (should fail)
	msg2 := &types.MsgRegisterContent{
		Creator:         creator2,
		ContentHash:     "sha256:0000000000000000000000000000000000000000000000000000000000000022",
		License:         "liberation_v1",
		PreviousVersion: v1Hash,
	}

	_, err = msgServer.RegisterContent(ctx, msg2)
	require.Error(t, err, "version by different creator should fail")
	require.Contains(t, err.Error(), "original creator", "should indicate creator mismatch")
}
