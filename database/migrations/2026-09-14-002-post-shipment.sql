-- Aba de Pós-embarque: a data do embarque é independente do envio do draft.
ALTER TABLE processes ADD COLUMN IF NOT EXISTS post_shipment_date DATE;

CREATE INDEX IF NOT EXISTS processes_post_shipment_date_idx
  ON processes (post_shipment_date ASC);
