package keeper

import (
	"context"
	"fmt"

	errorsmod "cosmossdk.io/errors"
	sdk "github.com/cosmos/cosmos-sdk/types"
	"github.com/daon-network/daon-core/x/contentregistry/types"
)

func (k msgServer) TransferOwnership(ctx context.Context, msg *types.MsgTransferOwnership) (*types.MsgTransferOwnershipResponse, error) {
	// Validate current owner address
	if _, err := k.addressCodec.StringToBytes(msg.Creator); err != nil {
		return nil, errorsmod.Wrap(err, "invalid current owner address")
	}

	// Validate new owner address
	if _, err := k.addressCodec.StringToBytes(msg.NewOwner); err != nil {
		return nil, errorsmod.Wrap(err, "invalid new owner address")
	}

	// Get content record
	sdkCtx := sdk.UnwrapSDKContext(ctx)
	store := k.storeService.OpenKVStore(ctx)

	recordBytes, err := store.Get([]byte(msg.ContentHash))
	if err != nil {
		return nil, errorsmod.Wrap(err, "failed to get content record")
	}
	if recordBytes == nil {
		return nil, errorsmod.Wrap(types.ErrContentNotFound, "content not found")
	}

	// Unmarshal content record
	var contentRecord types.ContentRecord
	k.cdc.MustUnmarshal(recordBytes, &contentRecord)

	// Verify current owner is the one requesting transfer
	if contentRecord.Creator != msg.Creator {
		return nil, errorsmod.Wrap(types.ErrUnauthorizedTransfer, "only current owner can transfer ownership")
	}

	// Check Liberation License restrictions
	if err := k.validateTransferPermissions(&contentRecord, msg.NewOwner); err != nil {
		return nil, errorsmod.Wrap(err, "transfer violates license terms")
	}

	// Update ownership
	transferRecord := fmt.Sprintf("%s->%s@%d",
		contentRecord.Creator,
		msg.NewOwner,
		sdkCtx.BlockTime().Unix())

	contentRecord.Creator = msg.NewOwner
	contentRecord.TransferHistory = append(contentRecord.TransferHistory, transferRecord)

	// Store updated record
	updatedBytes := k.cdc.MustMarshal(&contentRecord)
	if err := store.Set([]byte(msg.ContentHash), updatedBytes); err != nil {
		return nil, errorsmod.Wrap(err, "failed to update content record")
	}

	// Emit transfer event
	sdkCtx.EventManager().EmitEvent(
		sdk.NewEvent(
			"ownership_transferred",
			sdk.NewAttribute("content_hash", msg.ContentHash),
			sdk.NewAttribute("from", msg.Creator),
			sdk.NewAttribute("to", msg.NewOwner),
		),
	)

	return &types.MsgTransferOwnershipResponse{}, nil
}

// validateTransferPermissions checks if transfer is allowed under current license
func (k msgServer) validateTransferPermissions(record *types.ContentRecord, newOwner string) error {
	// Liberation License specific checks
	if record.License == "liberation_v1" {
		// Liberation License allows transfers between individuals and humanitarian orgs
		// For simplicity, we allow all transfers but could add specific restrictions
		return nil
	}

	// Other licenses generally allow transfers by the owner
	return nil
}
