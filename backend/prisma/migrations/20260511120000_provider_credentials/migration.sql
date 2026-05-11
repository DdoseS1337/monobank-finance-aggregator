-- Encrypted-at-rest credential store for external providers (Monobank, etc.).
-- Replaces the plaintext token previously kept in `accounts.metadata.token`.

CREATE TABLE "provider_credentials" (
    "id"           UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id"      UUID NOT NULL,
    "provider"     TEXT NOT NULL,
    "token_cipher" BYTEA NOT NULL,
    "token_iv"     BYTEA NOT NULL,
    "token_tag"    BYTEA NOT NULL,
    "key_version"  INTEGER NOT NULL DEFAULT 1,
    "token_last4"  VARCHAR(8) NOT NULL,
    "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rotated_at"   TIMESTAMP(3),
    "revoked_at"   TIMESTAMP(3),

    CONSTRAINT "provider_credentials_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "provider_credentials_user_id_provider_key"
    ON "provider_credentials" ("user_id", "provider");

ALTER TABLE "provider_credentials"
    ADD CONSTRAINT "provider_credentials_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users" ("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Scrub any plaintext tokens that were stored in accounts.metadata.
-- After deploying, users must re-link their Monobank account so the token
-- lands in `provider_credentials` (encrypted). This is a one-way wipe.
UPDATE "accounts"
SET    "metadata" = "metadata" - 'token'
WHERE  "metadata" ? 'token';
