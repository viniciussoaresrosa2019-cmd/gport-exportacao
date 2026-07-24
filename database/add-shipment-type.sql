ALTER TABLE processes
  ADD COLUMN IF NOT EXISTS shipment_type VARCHAR(3)
  CHECK (shipment_type IN ('FCL', 'LCL'));
