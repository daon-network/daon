package keeper

import (
	"context"

	"github.com/daon-network/daon-core/x/contentregistry/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func (q queryServer) VerifyContent(ctx context.Context, req *types.QueryVerifyContentRequest) (*types.QueryVerifyContentResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	if req.ContentHash == "" {
		return nil, status.Error(codes.InvalidArgument, "content hash cannot be empty")
	}

	// Get content record from store
	store := q.k.storeService.OpenKVStore(ctx)
	recordBytes, err := store.Get([]byte(req.ContentHash))
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to query content")
	}

	// If content not found, return unverified response
	if recordBytes == nil {
		return &types.QueryVerifyContentResponse{
			Verified:  false,
			Creator:   "",
			License:   "",
			Timestamp: 0,
		}, nil
	}

	// Unmarshal content record
	var contentRecord types.ContentRecord
	q.k.cdc.MustUnmarshal(recordBytes, &contentRecord)

	// Return verification details
	return &types.QueryVerifyContentResponse{
		Verified:  true,
		Creator:   contentRecord.Creator,
		License:   contentRecord.License,
		Timestamp: contentRecord.Timestamp,
	}, nil
}
