package contentregistry

import (
	"math/rand"

	"github.com/cosmos/cosmos-sdk/types/module"
	simtypes "github.com/cosmos/cosmos-sdk/types/simulation"
	"github.com/cosmos/cosmos-sdk/x/simulation"

	contentregistrysimulation "github.com/daon-network/daon-core/x/contentregistry/simulation"
	"github.com/daon-network/daon-core/x/contentregistry/types"
)

// GenerateGenesisState creates a randomized GenState of the module.
func (AppModule) GenerateGenesisState(simState *module.SimulationState) {
	accs := make([]string, len(simState.Accounts))
	for i, acc := range simState.Accounts {
		accs[i] = acc.Address.String()
	}
	contentregistryGenesis := types.GenesisState{
		Params: types.DefaultParams(),
	}
	simState.GenState[types.ModuleName] = simState.Cdc.MustMarshalJSON(&contentregistryGenesis)
}

// RegisterStoreDecoder registers a decoder.
func (am AppModule) RegisterStoreDecoder(_ simtypes.StoreDecoderRegistry) {}

// WeightedOperations returns the all the gov module operations with their respective weights.
func (am AppModule) WeightedOperations(simState module.SimulationState) []simtypes.WeightedOperation {
	operations := make([]simtypes.WeightedOperation, 0)
	const (
		opWeightMsgRegisterContent          = "op_weight_msg_contentregistry"
		defaultWeightMsgRegisterContent int = 100
	)

	var weightMsgRegisterContent int
	simState.AppParams.GetOrGenerate(opWeightMsgRegisterContent, &weightMsgRegisterContent, nil,
		func(_ *rand.Rand) {
			weightMsgRegisterContent = defaultWeightMsgRegisterContent
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgRegisterContent,
		contentregistrysimulation.SimulateMsgRegisterContent(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))
	const (
		opWeightMsgTransferOwnership          = "op_weight_msg_contentregistry"
		defaultWeightMsgTransferOwnership int = 100
	)

	var weightMsgTransferOwnership int
	simState.AppParams.GetOrGenerate(opWeightMsgTransferOwnership, &weightMsgTransferOwnership, nil,
		func(_ *rand.Rand) {
			weightMsgTransferOwnership = defaultWeightMsgTransferOwnership
		},
	)
	operations = append(operations, simulation.NewWeightedOperation(
		weightMsgTransferOwnership,
		contentregistrysimulation.SimulateMsgTransferOwnership(am.authKeeper, am.bankKeeper, am.keeper, simState.TxConfig),
	))

	return operations
}

// ProposalMsgs returns msgs used for governance proposals for simulations.
func (am AppModule) ProposalMsgs(simState module.SimulationState) []simtypes.WeightedProposalMsg {
	return []simtypes.WeightedProposalMsg{}
}
