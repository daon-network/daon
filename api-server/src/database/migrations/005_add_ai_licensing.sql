-- DAON: Add AI licensing policy fields to protected_content
-- Allows creators to set their AI training policy at registration time
-- and provide licensing contact information for the contact_required policy.

ALTER TABLE protected_content
  ADD COLUMN IF NOT EXISTS ai_training_policy VARCHAR(20) NOT NULL DEFAULT 'prohibited',
  ADD COLUMN IF NOT EXISTS licensing_email VARCHAR(255),
  ADD COLUMN IF NOT EXISTS licensing_uri TEXT;

DO $$ BEGIN
  ALTER TABLE protected_content
    ADD CONSTRAINT valid_ai_training_policy
      CHECK (ai_training_policy IN ('prohibited', 'contact_required', 'open'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Enforce: contact_required must have at least one contact method
DO $$ BEGIN
  ALTER TABLE protected_content
    ADD CONSTRAINT licensing_contact_when_required
      CHECK (
        ai_training_policy != 'contact_required'
        OR (licensing_email IS NOT NULL OR licensing_uri IS NOT NULL)
      );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_content_ai_policy ON protected_content(ai_training_policy);

COMMENT ON COLUMN protected_content.ai_training_policy IS
  'prohibited: AI training not allowed. contact_required: contact creator. open: allowed with attribution.';
COMMENT ON COLUMN protected_content.licensing_email IS
  'Contact email for licensing inquiries. Required when ai_training_policy = contact_required.';
COMMENT ON COLUMN protected_content.licensing_uri IS
  'URL to licensing portal or info page. Required when ai_training_policy = contact_required (if no email).';
