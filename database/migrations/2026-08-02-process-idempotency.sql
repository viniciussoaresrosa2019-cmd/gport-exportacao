-- Evita processos duplicados por reenvio da mesma tentativa de lançamento.
-- É seguro executar em bancos existentes: chaves anteriores permanecem NULL.
ALTER TABLE processes ADD COLUMN IF NOT EXISTS idempotency_key UUID;

CREATE UNIQUE INDEX IF NOT EXISTS processes_idempotency_key_unique_idx
  ON processes (idempotency_key)
  WHERE idempotency_key IS NOT NULL;
