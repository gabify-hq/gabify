-- Fase P1 — portal do cliente final: novo role CLIENT.
-- Separate migration: PostgreSQL forbids using a new enum value in the same
-- transaction that adds it, and the follow-up migration's CHECK constraints
-- reference 'CLIENT'.
ALTER TYPE "UserRole" ADD VALUE 'CLIENT';
