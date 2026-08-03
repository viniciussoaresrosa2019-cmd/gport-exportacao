-- Permite o fluxo simplificado para exportadores atendidos apenas por DU-E.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS due_only BOOLEAN NOT NULL DEFAULT FALSE;

-- Esses campos continuam obrigatórios para exportadores comuns na validação da API.
-- Tornam-se nulos somente no fluxo "Apenas DU-E".
ALTER TABLE public.processes
  ALTER COLUMN importer DROP NOT NULL,
  ALTER COLUMN origin_port DROP NOT NULL,
  ALTER COLUMN destination_port DROP NOT NULL,
  ALTER COLUMN deadline DROP NOT NULL;
