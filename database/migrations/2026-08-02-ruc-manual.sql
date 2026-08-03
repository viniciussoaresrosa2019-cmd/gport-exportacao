-- Exportadores marcados como RUC manual não exigem DU-E no lançamento.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ruc_manual BOOLEAN NOT NULL DEFAULT FALSE;
