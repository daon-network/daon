package keeper

import (
	"context"

	"github.com/daon-network/daon-core/x/contentregistry/types"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// VersionHistory returns the complete version history for a piece of content
// Walks backwards from current content_hash to original version
func (q queryServer) VersionHistory(ctx context.Context, req *types.QueryVersionHistoryRequest) (*types.QueryVersionHistoryResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "invalid request")
	}

	if req.ContentHash == "" {
		return nil, status.Error(codes.InvalidArgument, "content hash cannot be empty")
	}

	store := q.k.storeService.OpenKVStore(ctx)

	// Get the current content record
	recordBytes, err := store.Get([]byte(req.ContentHash))
	if err != nil {
		return nil, status.Error(codes.Internal, "failed to get content record")
	}
	if recordBytes == nil {
		return nil, status.Error(codes.NotFound, "content not found")
	}

	var record types.ContentRecord
	q.k.cdc.MustUnmarshal(recordBytes, &record)

	// Build version chain by walking backwards
	versions := []*types.VersionInfo{
		{
			ContentHash:     record.ContentHash,
			Creator:         record.Creator,
			Timestamp:       record.Timestamp,
			PreviousVersion: record.PreviousVersion,
		},
	}

	// Walk backwards through version chain
	currentHash := record.PreviousVersion
	maxDepth := 100 // Prevent infinite loops
	for i := 0; i < maxDepth && currentHash != ""; i++ {
		prevBytes, err := store.Get([]byte(currentHash))
		if err != nil {
			return nil, status.Error(codes.Internal, "failed to get previous version")
		}
		if prevBytes == nil {
			break // Chain broken, stop here
		}

		var prevRecord types.ContentRecord
		q.k.cdc.MustUnmarshal(prevBytes, &prevRecord)

		versions = append(versions, &types.VersionInfo{
			ContentHash:     prevRecord.ContentHash,
			Creator:         prevRecord.Creator,
			Timestamp:       prevRecord.Timestamp,
			PreviousVersion: prevRecord.PreviousVersion,
		})

		currentHash = prevRecord.PreviousVersion
	}

	return &types.QueryVersionHistoryResponse{
		Versions: versions,
	}, nil
}
