package keeper

import (
	"context"
	"fmt"

	errorsmod "cosmossdk.io/errors"
	"github.com/daon-network/daon-core/x/contentregistry/types"
)

// CheckDuplicateContent performs three levels of duplicate detection
// Returns error if duplicate is found at any level
func (k msgServer) CheckDuplicateContent(ctx context.Context, contentHash, normalizedHash, perceptualHash string) error {
	store := k.storeService.OpenKVStore(ctx)

	// Level 1: Exact hash check (SHA256)
	if has, err := store.Has([]byte(contentHash)); err != nil {
		return errorsmod.Wrap(err, "failed to check exact content hash")
	} else if has {
		return errorsmod.Wrap(types.ErrContentAlreadyExists, "exact duplicate found (Level 1)")
	}

	// Level 2: Normalized hash check (whitespace/formatting removed)
	if normalizedHash != "" {
		normalizedKey := fmt.Sprintf("normalized:%s", normalizedHash)
		if has, err := store.Has([]byte(normalizedKey)); err != nil {
			return errorsmod.Wrap(err, "failed to check normalized hash")
		} else if has {
			return errorsmod.Wrap(types.ErrContentAlreadyExists, "normalized duplicate found (Level 2)")
		}
	}

	// Level 3: Perceptual hash check (semantic similarity)
	if perceptualHash != "" {
		perceptualKey := fmt.Sprintf("perceptual:%s", perceptualHash)
		if has, err := store.Has([]byte(perceptualKey)); err != nil {
			return errorsmod.Wrap(err, "failed to check perceptual hash")
		} else if has {
			return errorsmod.Wrap(types.ErrContentAlreadyExists, "perceptual duplicate found (Level 3)")
		}
	}

	return nil
}

// StoreDuplicateDetectionKeys stores all hash variants for future duplicate detection
func (k msgServer) StoreDuplicateDetectionKeys(ctx context.Context, contentHash, normalizedHash, perceptualHash string) error {
	store := k.storeService.OpenKVStore(ctx)

	// Store normalized hash pointer (points back to content_hash)
	if normalizedHash != "" {
		normalizedKey := fmt.Sprintf("normalized:%s", normalizedHash)
		if err := store.Set([]byte(normalizedKey), []byte(contentHash)); err != nil {
			return errorsmod.Wrap(err, "failed to store normalized hash")
		}
	}

	// Store perceptual hash pointer (points back to content_hash)
	if perceptualHash != "" {
		perceptualKey := fmt.Sprintf("perceptual:%s", perceptualHash)
		if err := store.Set([]byte(perceptualKey), []byte(contentHash)); err != nil {
			return errorsmod.Wrap(err, "failed to store perceptual hash")
		}
	}

	return nil
}

// ValidateVersionChain ensures previous_version exists and is owned by same creator
func (k msgServer) ValidateVersionChain(ctx context.Context, creator, previousVersion string) error {
	if previousVersion == "" {
		return nil // No version chain, this is original
	}

	store := k.storeService.OpenKVStore(ctx)

	// Check if previous version exists
	recordBytes, err := store.Get([]byte(previousVersion))
	if err != nil {
		return errorsmod.Wrap(err, "failed to get previous version")
	}
	if recordBytes == nil {
		return errorsmod.Wrap(types.ErrInvalidContentHash, "previous version does not exist")
	}

	// Unmarshal previous record
	var prevRecord types.ContentRecord
	if err := k.cdc.Unmarshal(recordBytes, &prevRecord); err != nil {
		return errorsmod.Wrap(err, "failed to unmarshal previous version")
	}

	// Verify same creator
	if prevRecord.Creator != creator {
		return errorsmod.Wrap(types.ErrUnauthorizedTransfer, "only original creator can create new versions")
	}

	return nil
}
