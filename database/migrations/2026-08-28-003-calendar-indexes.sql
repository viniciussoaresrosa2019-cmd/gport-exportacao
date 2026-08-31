-- Índices parciais para a agenda pessoal por intervalo.
-- Rollback corretivo: DROP INDEX CONCURRENTLY individual após medir em HML.
CREATE INDEX IF NOT EXISTS processes_calendar_analyst_deadline_idx
  ON processes(analyst_id,deadline) WHERE deadline IS NOT NULL;
CREATE INDEX IF NOT EXISTS processes_calendar_analyst_collection_idx
  ON processes(analyst_id,container_collection_date) WHERE container_collection_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS processes_calendar_analyst_release_schedule_idx
  ON processes(analyst_id,release_schedule) WHERE release_schedule IS NOT NULL;
CREATE INDEX IF NOT EXISTS processes_calendar_analyst_release_deadline_idx
  ON processes(analyst_id,release_deadline) WHERE release_deadline IS NOT NULL;
