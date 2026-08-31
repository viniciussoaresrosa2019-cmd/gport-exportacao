const checklistDefaults = ['DUE', 'DRAFT', 'VGM', 'BL', 'NOTA FISCAL'];

export const registerProcessWorkspaceRoutes = ({
  app, authenticate, processEditorOnly, asyncRoute, query, audit, validId,
  upperText, cleanText, validateAttachmentInput, attachmentScanMode
}) => {
  const assertExistingProcess = async processId => {
    if (!validId(processId)) throw Object.assign(new Error('Identificador de processo inválido.'), { status:400 });
    const result = await query('SELECT id,analyst_id FROM processes WHERE id=$1', [processId]);
    if (!result.rowCount) throw Object.assign(new Error('Processo não encontrado.'), { status:404 });
    return result.rows[0];
  };
  const checklistRows = processId => query(`SELECT i.id,i.label,i.completed,i.completed_at,u.username AS completed_by,i.created_at
    FROM process_checklist_items i LEFT JOIN users u ON u.id=i.completed_by
    WHERE i.process_id=$1 ORDER BY i.completed ASC,i.created_at ASC`, [processId]);

  app.post('/api/processes/:id/checklist/defaults', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    const existing = await query('SELECT 1 FROM process_checklist_items WHERE process_id=$1 LIMIT 1', [req.params.id]);
    if (!existing.rowCount) {
      await Promise.all(checklistDefaults.map(label => query('INSERT INTO process_checklist_items(process_id,label,created_by) VALUES($1,$2,$3)', [req.params.id, label, req.user.sub])));
      await audit(req.user.sub, 'process.checklist_seeded', 'process', req.params.id);
    }
    res.json((await checklistRows(req.params.id)).rows);
  }));
  app.get('/api/processes/:id/checklist', authenticate, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    res.json((await checklistRows(req.params.id)).rows);
  }));
  app.post('/api/processes/:id/checklist', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    const label = upperText(cleanText(req.body.label, 120, 'Item do checklist', { required:true }));
    const result = await query('INSERT INTO process_checklist_items(process_id,label,created_by) VALUES($1,$2,$3) RETURNING id,label,completed,completed_at,created_at', [req.params.id, label, req.user.sub]);
    await audit(req.user.sub, 'process.checklist_item_created', 'process', req.params.id, { label });
    res.status(201).json(result.rows[0]);
  }));
  app.patch('/api/processes/:id/checklist/:itemId', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    if (!validId(req.params.itemId) || typeof req.body.completed !== 'boolean') return res.status(400).json({ error:'Item do checklist inválido.' });
    const result = await query(`UPDATE process_checklist_items SET completed=$1,completed_at=CASE WHEN $1 THEN NOW() ELSE NULL END,completed_by=CASE WHEN $1 THEN $2 ELSE NULL END
      WHERE id=$3 AND process_id=$4 RETURNING id,label,completed,completed_at`, [req.body.completed, req.user.sub, req.params.itemId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Item do checklist não encontrado.' });
    await audit(req.user.sub, 'process.checklist_item_updated', 'process', req.params.id, { label:result.rows[0].label, completed:req.body.completed });
    res.json(result.rows[0]);
  }));
  app.delete('/api/processes/:id/checklist/:itemId', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    if (!validId(req.params.itemId)) return res.status(400).json({ error:'Item do checklist inválido.' });
    const result = await query('DELETE FROM process_checklist_items WHERE id=$1 AND process_id=$2 RETURNING label', [req.params.itemId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Item do checklist não encontrado.' });
    await audit(req.user.sub, 'process.checklist_item_deleted', 'process', req.params.id, { label:result.rows[0].label });
    res.status(204).end();
  }));
  app.get('/api/processes/:id/comments', authenticate, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    const result = await query(`SELECT c.id,c.body,c.created_at,u.username FROM process_comments c JOIN users u ON u.id=c.user_id
      WHERE c.process_id=$1 ORDER BY c.created_at DESC LIMIT 100`, [req.params.id]);
    res.json(result.rows);
  }));
  app.post('/api/processes/:id/comments', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    const body = cleanText(req.body.body, 1000, 'Comentário', { required:true });
    const result = await query(`INSERT INTO process_comments(process_id,user_id,body) VALUES($1,$2,$3)
      RETURNING id,body,created_at`, [req.params.id, req.user.sub, body]);
    await audit(req.user.sub, 'process.comment_created', 'process', req.params.id);
    res.status(201).json({ ...result.rows[0], username:req.user.username });
  }));
  app.get('/api/processes/:id/attachments', authenticate, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    const result = await query(`SELECT a.id,a.file_name,a.mime_type,a.size_bytes,a.scan_status,a.scan_provider,a.scan_checked_at,a.created_at,u.username FROM process_attachments a
      JOIN users u ON u.id=a.uploaded_by WHERE a.process_id=$1 ORDER BY a.created_at DESC`, [req.params.id]);
    res.json(result.rows);
  }));
  app.post('/api/processes/:id/attachments', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    const attachment = validateAttachmentInput({ ...req.body, scanMode:attachmentScanMode });
    const result = await query(`INSERT INTO process_attachments(process_id,file_name,mime_type,size_bytes,content,uploaded_by,scan_status,scan_provider,scan_checked_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id,file_name,mime_type,size_bytes,scan_status,scan_provider,scan_checked_at,created_at`,
    [req.params.id, attachment.fileName, attachment.mimeType, attachment.sizeBytes, attachment.content, req.user.sub, attachment.scanStatus, attachment.scanProvider, attachment.scanCheckedAt]);
    await audit(req.user.sub, 'process.attachment_uploaded', 'process', req.params.id, { fileName:attachment.fileName, mimeType:attachment.mimeType, sizeBytes:attachment.sizeBytes, scanStatus:attachment.scanStatus });
    res.status(201).json({ ...result.rows[0], username:req.user.username });
  }));
  app.get('/api/processes/:id/attachments/:attachmentId/download', authenticate, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    if (!validId(req.params.attachmentId)) return res.status(400).json({ error:'Anexo inválido.' });
    const result = await query('SELECT file_name,mime_type,content,scan_status FROM process_attachments WHERE id=$1 AND process_id=$2', [req.params.attachmentId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Anexo não encontrado.' });
    const attachment = result.rows[0];
    if (attachment.scan_status !== 'approved') return res.status(423).json({ error:'Este anexo ainda não foi aprovado para download.' });
    res.setHeader('Content-Type', attachment.mime_type);
    res.setHeader('Content-Disposition', `attachment; filename="${String(attachment.file_name).replace(/["\\\r\n]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(attachment.content);
  }));
  app.delete('/api/processes/:id/attachments/:attachmentId', authenticate, processEditorOnly, asyncRoute(async (req, res) => {
    await assertExistingProcess(req.params.id);
    if (!validId(req.params.attachmentId)) return res.status(400).json({ error:'Anexo inválido.' });
    const result = await query('DELETE FROM process_attachments WHERE id=$1 AND process_id=$2 RETURNING file_name', [req.params.attachmentId, req.params.id]);
    if (!result.rowCount) return res.status(404).json({ error:'Anexo não encontrado.' });
    await audit(req.user.sub, 'process.attachment_deleted', 'process', req.params.id, { fileName:result.rows[0].file_name });
    res.status(204).end();
  }));
};

