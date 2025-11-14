package keeper

import (
	"context"
	"strings"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/daon-network/daon-core/x/contentregistry/types"
)

func (k msgServer) RegisterContent(ctx context.Context, msg *types.MsgRegisterContent) (*types.MsgRegisterContentResponse, error) {
	// Validate creator address format
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid creator address")
	}

	// Validate content hash format
	if !strings.HasPrefix(msg.ContentHash, "sha256:") || len(msg.ContentHash) != 71 {
		return nil, errorsmod.Wrap(types.ErrInvalidContentHash, "content hash must be sha256: format")
	}

	// Check if content already exists
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	store := k.storeService.OpenKVStore(ctx)

	if has, err := store.Has([]byte(msg.ContentHash)); err != nil {
		return nil, errorsmod.Wrap(err, "failed to check content existence")
	} else if has {
		return nil, errorsmod.Wrap(types.ErrContentAlreadyExists, "content already registered")
	}

	// Validate Liberation License if specified
	if err := k.validateLicense(msg.License); err != nil {
		return nil, errorsmod.Wrap(err, "invalid license terms")
	}

	// Create content record
	contentRecord := types.ContentRecord{
		ContentHash:     msg.ContentHash,
		Creator:         msg.Creator,
		License:         msg.License,
		Timestamp:       sdkCtx.BlockTime().Unix(),
		Platform:        msg.Platform,
		Fingerprint:     msg.Fingerprint,
		RevisionHistory: []string{}, // Start empty
		TransferHistory: []string{}, // Start empty
	}

	// Store content record
	recordBytes := k.cdc.MustMarshal(&contentRecord)
	if err := store.Set([]byte(msg.ContentHash), recordBytes); err != nil {
		return nil, errorsmod.Wrap(err, "failed to store content record")
	}

	// Emit event for indexing
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"content_registered",
			sdk.NewAttribute("content_hash", msg.ContentHash),
			sdk.NewAttribute("creator", msg.Creator),
			sdk.NewAttribute("license", msg.License),
			sdk.NewAttribute("platform", msg.Platform),
		),
	)

	return &types.MsgRegisterContentResponse{}, nil
}

// validateLicense checks if the license is valid and enforces Liberation License terms
func (k msgServer) validateLicense(license string) error {
	validLicenses := map[string]bool{
		"liberation_v1":       true, // Liberation License v1.0
		"cc_by":               true, // Creative Commons Attribution
		"cc_by_sa":            true, // Creative Commons Attribution-ShareAlike
		"cc_by_nc":            true, // Creative Commons Attribution-NonCommercial
		"cc_by_nc_sa":         true, // Creative Commons Attribution-NonCommercial-ShareAlike
		"all_rights_reserved": true, // Traditional copyright
		"public_domain":       true, // No restrictions
	}

	if !validLicenses[license] && !strings.HasPrefix(license, "custom:") {
		return types.ErrInvalidLicense
	}

	// Liberation License specific validation
	if license == "liberation_v1" {
		// Liberation License is always valid - framework handles enforcement
		return nil
	}

	// Custom license validation
	if strings.HasPrefix(license, "custom:") {
		if len(license) > 1000 { // Reasonable limit for custom terms
			return errorsmod.Wrap(types.ErrInvalidLicense, "custom license too long")
		}
	}

	return nil
}
