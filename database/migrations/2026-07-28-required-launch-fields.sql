-- Campo adicional do lançamento. Seguro para executar mais de uma vez.
ALTER TABLE public.processes
  ADD COLUMN IF NOT EXISTS isf_lacey BOOLEAN NOT NULL DEFAULT FALSE;
