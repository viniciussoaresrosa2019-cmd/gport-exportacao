-- Define se as capas do exportador devem indicar OVAÇÃO: Sim.
ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS ovacao BOOLEAN NOT NULL DEFAULT FALSE;
