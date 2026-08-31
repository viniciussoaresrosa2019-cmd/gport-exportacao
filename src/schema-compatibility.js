const requiredColumns = new Map([
  ['users', ['token_version']],
  ['clients', ['active', 'ruc_manual', 'due_only', 'ovacao']],
  ['processes', [
    'client_id', 'booking', 'deadline', 'container_details', 'updated_at',
    'idempotency_key', 'vgm_sent_date', 'release_deadline', 'followup_status'
  ]],
  ['process_attachments', ['scan_status', 'scan_provider']]
]);

const requiredTables = [
  'users', 'clients', 'processes', 'audit_log', 'user_notifications',
  'process_checklist_items', 'process_comments', 'process_attachments',
  'process_prelaunches'
];

export const verifySchemaCompatibility = async ({ query }) => {
  const tableResult = await query(`SELECT table_name
    FROM information_schema.tables
    WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`, [requiredTables]);
  const availableTables = new Set(tableResult.rows.map(row => row.table_name));
  const missingTables = requiredTables.filter(table => !availableTables.has(table));

  const columnResult = await query(`SELECT table_name,column_name
    FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name=ANY($1::text[])`, [[...requiredColumns.keys()]]);
  const availableColumns = new Set(columnResult.rows.map(row => `${row.table_name}.${row.column_name}`));
  const missingColumns = [];
  for (const [table, columns] of requiredColumns) {
    for (const column of columns) {
      if (!availableColumns.has(`${table}.${column}`)) missingColumns.push(`${table}.${column}`);
    }
  }

  if (missingTables.length || missingColumns.length) {
    const error = new Error('O esquema do banco precisa de migração.');
    error.code = 'SCHEMA_MIGRATION_REQUIRED';
    error.missingCount = missingTables.length + missingColumns.length;
    throw error;
  }
  return { compatible:true };
};
