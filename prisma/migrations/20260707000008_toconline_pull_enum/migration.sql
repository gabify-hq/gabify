-- API_PULL source (TOConline sales pull) — enum change isolated in its own
-- migration (ALTER TYPE ADD VALUE cannot share a transaction with usage;
-- precedent: 20260707000004_p1_client_role_enum)
ALTER TYPE "DocumentSource" ADD VALUE 'API_PULL';
