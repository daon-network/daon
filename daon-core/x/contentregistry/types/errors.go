package types

// DONTCOVER

import (
	"cosmossdk.io/errors"
)

// x/contentregistry module sentinel errors
var (
	ErrInvalidSigner        = errors.Register(ModuleName, 1100, "expected gov account as only signer for proposal message")
	ErrInvalidContentHash   = errors.Register(ModuleName, 1101, "invalid content hash format")
	ErrContentAlreadyExists = errors.Register(ModuleName, 1102, "content already registered")
	ErrInvalidLicense       = errors.Register(ModuleName, 1103, "invalid license terms")
	ErrContentNotFound      = errors.Register(ModuleName, 1104, "content not found")
	ErrUnauthorizedTransfer = errors.Register(ModuleName, 1105, "unauthorized ownership transfer")
	ErrLiberationViolation  = errors.Register(ModuleName, 1106, "liberation license violation detected")
)
