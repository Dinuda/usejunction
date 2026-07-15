# Security operations

## Required production controls

- Generate independent random values for `AUTH_SECRET`, `INGEST_SECRET`,
  `CRON_SECRET`, `LITELLM_MASTER_KEY`, database passwords, Langfuse secrets,
  and `INTEGRATION_ENCRYPTION_KEY`.
- Bind `INGEST_SECRET` to one organization with `INGEST_ORG_ID`. The server
  ignores caller-supplied organization IDs.
- Keep Postgres, LiteLLM, and Langfuse on private networks. The reference
  Compose stack binds LiteLLM and Langfuse to loopback and does not publish
  Postgres.
- Terminate TLS at a trusted reverse proxy and set `AUTH_TRUST_HOST=true` only
  when that proxy validates and overwrites forwarded host/IP headers.
- Keep `SEED_DEMO_DATA=false`. The production image refuses insecure-development
  mode, known default service secrets, and demo seeding.

## Credential migration

Migration `202607150004_security_hardening` hashes existing device bearer
tokens with SHA-256 before removing the plaintext column. Existing agents keep
working because they continue presenting the same high-entropy token.
Connect-invite browser tokens and terminal polling tokens are separate, and raw
team/enrollment tokens are no longer persisted.

Back up the database before applying migrations. Rollback requires restoring
that backup; plaintext device tokens cannot be reconstructed from their hashes.

## Abuse controls

The application has process-local throttles for public identity and enrollment
routes. Multi-instance and internet-facing deployments must also enforce
distributed rate limits at the reverse proxy or WAF.

## Verification

CI runs unit tests, a production build, dependency audit, `govulncheck`, secret
scanning, filesystem/container scanning, and the community/commercial boundary
check. Release operators should additionally run DAST against a production-like
deployment and verify tenant isolation for every API route.
