-- Associations between a registered content hash and a provenance chain.
--
-- Appended, never updated. The main use is adoption -- a registration from 2025
-- gaining a chain in 2026 -- and editing that row would mutate a record whose
-- entire value is that it has not been edited since 2025.
--
-- Deliberately NOT unique on content_hash. Any number of accounts may assert an
-- association for the same hash and none displaces another. If a hash accepted
-- only one, whoever asserted first would squat it, and the person best placed to
-- do that is not the creator. A false assertion sits beside the true one and
-- loses on evidence, in a forum with standing to decide -- not here.
--
-- See docs/design/publication-and-versions.md and key-recovery.md.

CREATE TABLE IF NOT EXISTS content_associations (
    id SERIAL PRIMARY KEY,

    -- The registration this is about. No foreign key: a creator may assert an
    -- association for content DAON has never seen registered, and refusing that
    -- would make the registry authoritative over the chain, which it is not.
    content_hash VARCHAR(64) NOT NULL,

    -- The chain's genesis leaf hash. Better identity than a title: a hash
    -- rather than a string somebody typed.
    entity_id VARCHAR(64) NOT NULL,

    -- The head the asserter presented at this moment. A commitment, so a dated
    -- record of it pins the chain state even when DAON could not check it.
    head VARCHAR(64) NOT NULL,

    -- Who said so. Attribution is the accountability mechanism; DAON never
    -- ranks competing assertions.
    asserted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,

    -- Whether DAON checked, or merely recorded what it was told. The
    -- certificate must render these differently.
    verified BOOLEAN NOT NULL DEFAULT FALSE,

    recorded_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_assoc_content ON content_associations(content_hash);
CREATE INDEX IF NOT EXISTS idx_assoc_entity  ON content_associations(entity_id);
