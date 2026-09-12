# Supabase Assets

This is the native Supabase CLI root. It contains no project credentials and no command here applies changes remotely.

- `config.toml` defines local CLI configuration and requires JWT verification for `validate-ecf-certificate`.
- `migrations/` contains forward-only Supabase CLI migrations. Apply files lexicographically and never edit a migration that has been applied.
- `functions/validate-ecf-certificate/` contains the certificate validator. It validates the caller JWT, derives the tenant from a canonical `tenant UUID/filename.p12` object key, and verifies an active administrative membership before using server-only credentials.
- `migrations/` is the complete, ordered Supabase CLI migration history, including the security-forward migration.
- `../sql/` contains canonical SQL sources used by tests. `cyberbistro_register_tenant.sql` grants execution to `authenticated` only.

When remote changes are authorized, install the Supabase CLI, review the migration sequence and function secrets, then use the approved deployment workflow. Do not place `SUPABASE_SERVICE_ROLE_KEY` or `ECF_ENCRYPTION_KEY` in this repository, a renderer environment variable, or `config.toml`.

`ECF_ENCRYPTION_KEY` is a server-only Edge Function and worker secret. Its only accepted format is `ecf-v1:<base64url of 32 random bytes, without padding>`. Generate it with Node.js and store the output in the platform secret manager: `node -e "console.log('ecf-v1:' + require('crypto').randomBytes(32).toString('base64url'))"`. Do not reuse legacy text keys; they are rejected rather than padded or truncated.
