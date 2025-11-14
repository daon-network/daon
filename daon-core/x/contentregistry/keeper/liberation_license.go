package keeper

import (
	"strings"
	"time"

	errorsmod "cosmossdk.io/errors"
	"github.com/daon-network/daon-core/x/contentregistry/types"
)

// LiberationLicense implements Liberation License v1.0 enforcement
type LiberationLicense struct {
	Version string `json:"version"`
}

// Liberation License v1.0 Terms as defined in https://github.com/liberationlicense/license
var LiberationLicenseV1 = LiberationLicense{
	Version: "1.0",
}

// EnforceLiberationLicense checks if a proposed use violates Liberation License terms
func (k Keeper) EnforceLiberationLicense(contentRecord *types.ContentRecord, proposedUse ProposedUse) error {
	if contentRecord.License != "liberation_v1" {
		return nil // Not a Liberation License work
	}

	// Check prohibited uses
	if err := k.checkProhibitedUses(proposedUse); err != nil {
		return errorsmod.Wrap(types.ErrLiberationViolation, err.Error())
	}

	// Check corporate restrictions
	if proposedUse.EntityType == "corporation" {
		if err := k.checkCorporateRestrictions(proposedUse); err != nil {
			return errorsmod.Wrap(types.ErrLiberationViolation, err.Error())
		}
	}

	// Check AI/automation restrictions
	if proposedUse.UseType == "ai_training" || proposedUse.UseType == "automation" {
		if err := k.checkAIRestrictions(proposedUse); err != nil {
			return errorsmod.Wrap(types.ErrLiberationViolation, err.Error())
		}
	}

	return nil
}

// ProposedUse represents a potential use of Liberation Licensed content
type ProposedUse struct {
	EntityType     string            `json:"entity_type"`      // individual, corporation, nonprofit, cooperative
	UseType        string            `json:"use_type"`         // personal, commercial, ai_training, automation
	Purpose        string            `json:"purpose"`          // humanitarian, profit, education, research
	Compensation   bool              `json:"compensation"`     // true if creators are compensated
	OpenSource     bool              `json:"open_source"`      // true if derivative work will be open source
	Metadata       map[string]string `json:"metadata"`         // additional context
	ProposedByAddr string            `json:"proposed_by_addr"` // blockchain address of proposer
	Timestamp      time.Time         `json:"timestamp"`        // when use was proposed
}

// checkProhibitedUses enforces Liberation License prohibited uses
func (k Keeper) checkProhibitedUses(use ProposedUse) error {
	// 1. Corporate Exploitation - extracting value from human labor through coercive relationships
	if use.EntityType == "corporation" && use.Purpose == "profit" && !use.Compensation {
		return errorsmod.Wrap(types.ErrLiberationViolation, "corporate exploitation: profit extraction without creator compensation")
	}

	// 2. Surveillance Capitalism - collecting/monetizing personal data without consent
	if strings.Contains(use.UseType, "surveillance") || strings.Contains(use.Purpose, "data_collection") {
		return errorsmod.Wrap(types.ErrLiberationViolation, "surveillance capitalism: unauthorized data collection/monetization")
	}

	// 3. Authoritarian Control - restricting human freedom or enforcing oppressive systems
	if strings.Contains(use.Purpose, "control") || strings.Contains(use.Purpose, "surveillance") {
		return errorsmod.Wrap(types.ErrLiberationViolation, "authoritarian control: use restricts human freedom")
	}

	// 4. Manipulation - deceiving or exploiting human psychology for profit/control
	if strings.Contains(use.Purpose, "manipulation") || strings.Contains(use.UseType, "advertising") {
		return errorsmod.Wrap(types.ErrLiberationViolation, "manipulation: psychological exploitation detected")
	}

	// 5. Systemic Subjugation - discrimination, bigotry, or hatred
	if strings.Contains(use.Purpose, "discrimination") {
		return errorsmod.Wrap(types.ErrLiberationViolation, "systemic subjugation: discriminatory use prohibited")
	}

	// 6. Wealth Concentration - concentrating wealth/power at expense of many
	if use.Purpose == "wealth_concentration" {
		return errorsmod.Wrap(types.ErrLiberationViolation, "wealth concentration: use concentrates power at expense of many")
	}

	return nil
}

// checkCorporateRestrictions enforces Liberation License corporate restrictions
func (k Keeper) checkCorporateRestrictions(use ProposedUse) error {
	// Prohibited corporate uses
	prohibitedCorporateUses := map[string]bool{
		"profit_maximization":   true,
		"worker_exploitation":   true,
		"consumer_manipulation": true,
		"rent_seeking":          true,
		"financial_extraction":  true,
		"surveillance_systems":  true,
		"competitive_advantage": true,
	}

	if prohibitedCorporateUses[use.Purpose] {
		return errorsmod.Wrap(types.ErrLiberationViolation, "prohibited corporate use: "+use.Purpose)
	}

	// Permitted corporate uses (humanitarian/ecological alignment)
	permittedCorporateUses := map[string]bool{
		"humanitarian_work":      true,
		"ecological_restoration": true,
		"community_empowerment":  true,
		"educational_liberation": true,
		"healthcare_access":      true,
		"housing_justice":        true,
		"food_security":          true,
	}

	if !permittedCorporateUses[use.Purpose] {
		return errorsmod.Wrap(types.ErrLiberationViolation, "corporate use must align with humanitarian/ecological goals")
	}

	// Corporate compliance requirements
	if use.Metadata["mission_alignment"] != "humanitarian_ecological" {
		return errorsmod.Wrap(types.ErrLiberationViolation, "corporate mission must align with humanitarian/ecological goals")
	}

	if use.Metadata["benefit_distribution"] != "serves_mission" {
		return errorsmod.Wrap(types.ErrLiberationViolation, "corporate profits must serve humanitarian mission, not private enrichment")
	}

	return nil
}

// checkAIRestrictions enforces Liberation License AI and automation restrictions
func (k Keeper) checkAIRestrictions(use ProposedUse) error {
	// AI/Automation requirements
	requirements := map[string]bool{
		"human_agency":       false, // Humans retain meaningful control
		"transparency":       false, // AI processes are explainable
		"consent":            false, // Affected individuals consent
		"benefit_sharing":    false, // Benefits shared with displaced workers
		"privacy_protection": false, // AI protects rather than exploits privacy
	}

	// Check each requirement
	for requirement := range requirements {
		if use.Metadata[requirement] != "true" {
			return errorsmod.Wrap(types.ErrLiberationViolation, "AI use missing requirement: "+requirement)
		}
	}

	// Special restrictions for AI training
	if use.UseType == "ai_training" {
		if use.EntityType == "corporation" && use.Purpose == "profit" && !use.Compensation {
			return errorsmod.Wrap(types.ErrLiberationViolation, "AI training for corporate profit requires creator compensation")
		}

		if use.Metadata["training_purpose"] == "surveillance" || use.Metadata["training_purpose"] == "manipulation" {
			return errorsmod.Wrap(types.ErrLiberationViolation, "AI training for surveillance or manipulation prohibited")
		}
	}

	return nil
}

// IsLiberationLicenseCompliant checks if an entity/use case complies with Liberation License
func (k Keeper) IsLiberationLicenseCompliant(entityAddr string, useCase ProposedUse) (bool, string, error) {
	// Worker cooperatives get broader permissions
	if useCase.EntityType == "cooperative" || useCase.EntityType == "worker_owned" {
		return true, "worker-owned enterprise permitted", nil
	}

	// Individual use generally permitted
	if useCase.EntityType == "individual" {
		return true, "individual use permitted", nil
	}

	// Check against prohibited/restricted uses
	if err := k.checkProhibitedUses(useCase); err != nil {
		return false, err.Error(), err
	}

	if useCase.EntityType == "corporation" {
		if err := k.checkCorporateRestrictions(useCase); err != nil {
			return false, err.Error(), err
		}
	}

	if useCase.UseType == "ai_training" || useCase.UseType == "automation" {
		if err := k.checkAIRestrictions(useCase); err != nil {
			return false, err.Error(), err
		}
	}

	return true, "use compliant with Liberation License", nil
}

// GenerateLiberationLicenseViolationReport creates a detailed violation report
func (k Keeper) GenerateLiberationLicenseViolationReport(contentRecord *types.ContentRecord, violation ProposedUse) LiberationViolationReport {
	return LiberationViolationReport{
		ContentHash:     contentRecord.ContentHash,
		Creator:         contentRecord.Creator,
		LicenseVersion:  "liberation_v1",
		ViolationType:   violation.UseType,
		ViolatingEntity: violation.ProposedByAddr,
		ViolationReason: k.analyzeViolationReason(violation),
		Timestamp:       time.Now(),
		LegalRemedies:   k.suggestLegalRemedies(violation),
	}
}

type LiberationViolationReport struct {
	ContentHash     string    `json:"content_hash"`
	Creator         string    `json:"creator"`
	LicenseVersion  string    `json:"license_version"`
	ViolationType   string    `json:"violation_type"`
	ViolatingEntity string    `json:"violating_entity"`
	ViolationReason string    `json:"violation_reason"`
	Timestamp       time.Time `json:"timestamp"`
	LegalRemedies   []string  `json:"legal_remedies"`
}

func (k Keeper) analyzeViolationReason(violation ProposedUse) string {
	if violation.EntityType == "corporation" && violation.Purpose == "profit" {
		return "Corporate exploitation: using Liberation Licensed work for profit without creator compensation"
	}
	if violation.UseType == "ai_training" && !violation.Compensation {
		return "AI training violation: commercial AI training without creator consent or compensation"
	}
	return "Liberation License violation: use does not align with liberation principles"
}

func (k Keeper) suggestLegalRemedies(violation ProposedUse) []string {
	remedies := []string{
		"Cease and desist letter citing Liberation License violation",
		"DMCA takedown notice for unauthorized use",
		"Federal court filing under Copyright Act",
	}

	if violation.UseType == "ai_training" {
		remedies = append(remedies, "AI training dataset removal request")
		remedies = append(remedies, "Commercial licensing negotiation for fair compensation")
	}

	return remedies
}
