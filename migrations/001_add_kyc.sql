-- Migration: adiciona KYC ao Super Duelo
-- Roda no Postgres: psql $DATABASE_URL -f 001_add_kyc.sql

BEGIN;

-- 1) Campos KYC na tabela users
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS cpf VARCHAR(14) UNIQUE,
  ADD COLUMN IF NOT EXISTS full_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS kyc_status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (kyc_status IN ('pending','submitted','approved','rejected','manual_review')),
  ADD COLUMN IF NOT EXISTS kyc_provider VARCHAR(50),
  ADD COLUMN IF NOT EXISTS kyc_provider_session_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS kyc_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS kyc_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS kyc_attempts INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_cpf ON users(cpf);

-- 2) Histórico de verificações (auditoria + reanálise)
CREATE TABLE IF NOT EXISTS kyc_verifications (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        VARCHAR(50) NOT NULL,           -- 'stripe' | 'idwall' | 'unico' | 'manual'
  provider_session_id VARCHAR(255),
  status          VARCHAR(20) NOT NULL,           -- submitted | approved | rejected | manual_review
  doc_type        VARCHAR(20),                    -- 'rg' | 'cnh' | 'passport'
  doc_front_url   TEXT,                           -- só usado em modo manual / fallback
  doc_back_url    TEXT,
  selfie_url      TEXT,
  liveness_score  NUMERIC(5,4),                   -- 0.0000 a 1.0000
  face_match_score NUMERIC(5,4),
  provider_raw    JSONB,                          -- payload completo do provedor (debug + auditoria)
  rejection_reason TEXT,
  reviewed_by     INTEGER REFERENCES users(id),   -- admin que revisou (se manual)
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_kyc_user      ON kyc_verifications(user_id);
CREATE INDEX IF NOT EXISTS idx_kyc_status    ON kyc_verifications(status);
CREATE INDEX IF NOT EXISTS idx_kyc_provider_session ON kyc_verifications(provider_session_id);

COMMIT;
