package contentregistry

import (
	autocliv1 "cosmossdk.io/api/cosmos/autocli/v1"

	"github.com/daon-network/daon-core/x/contentregistry/types"
)

// AutoCLIOptions implements the autocli.HasAutoCLIConfig interface.
func (am AppModule) AutoCLIOptions() *autocliv1.ModuleOptions {
	return &autocliv1.ModuleOptions{
		Query: &autocliv1.ServiceCommandDescriptor{
			Service: types.Query_serviceDesc.ServiceName,
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod: "Params",
					Use:       "params",
					Short:     "Shows the parameters of the module",
				},
				{
					RpcMethod:      "VerifyContent",
					Use:            "verify-content [content-hash]",
					Short:          "Query VerifyContent",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "content_hash"}},
				},

				// this line is used by ignite scaffolding # autocli/query
			},
		},
		Tx: &autocliv1.ServiceCommandDescriptor{
			Service:              types.Msg_serviceDesc.ServiceName,
			EnhanceCustomCommand: true, // only required if you want to use the custom command
			RpcCommandOptions: []*autocliv1.RpcCommandOptions{
				{
					RpcMethod: "UpdateParams",
					Skip:      true, // skipped because authority gated
				},
				{
					RpcMethod:      "RegisterContent",
					Use:            "register-content [content-hash] [license] [fingerprint] [platform]",
					Short:          "Send a RegisterContent tx",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "content_hash"}, {ProtoField: "license"}, {ProtoField: "fingerprint"}, {ProtoField: "platform"}},
				},
				{
					RpcMethod:      "TransferOwnership",
					Use:            "transfer-ownership [content-hash] [new-owner]",
					Short:          "Send a TransferOwnership tx",
					PositionalArgs: []*autocliv1.PositionalArgDescriptor{{ProtoField: "content_hash"}, {ProtoField: "new_owner"}},
				},
				// this line is used by ignite scaffolding # autocli/tx
			},
		},
	}
}
