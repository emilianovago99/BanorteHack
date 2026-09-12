-- Desarrollo local. TimescaleDB es la extensión utilizada por Tiger Data.
CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_subject TEXT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'MXN',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  kind TEXT NOT NULL CHECK (kind IN ('income', 'payment', 'transfer', 'investment')),
  amount NUMERIC(18,2) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
);
SELECT create_hypertable('transactions', 'created_at');
CREATE INDEX transactions_account_time_idx ON transactions (account_id, created_at DESC);

CREATE TABLE debts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  label TEXT NOT NULL,
  principal NUMERIC(18,2) NOT NULL CHECK (principal >= 0),
  annual_rate NUMERIC(8,5) NOT NULL CHECK (annual_rate >= 0),
  due_at DATE
);

CREATE TABLE investments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id),
  instrument TEXT NOT NULL,
  principal NUMERIC(18,2) NOT NULL CHECK (principal > 0),
  opened_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
