import { appendFile } from 'node:fs/promises';

const statusFor = error => Number.isInteger(error?.status)
  ? error.status
  : error?.code === '23505'
    ? 409
    : error?.type === 'entity.too.large'
      ? 413
      : error?.type === 'entity.parse.failed'
        ? 400
        : 500;

const publicMessage = (error, status) => status === 413
  ? 'Solicitação muito grande.'
  : error?.type === 'entity.parse.failed'
    ? 'JSON inválido.'
    : status < 500
      ? error?.code === '23505' ? 'Registro já cadastrado.' : error.message
      : 'Erro interno do servidor.';

export const createErrorHandler = ({ localLogPath, logger, alerts }) => (error, request, response, _next) => {
  const status = statusFor(error);
  const durationMs = request.observabilityStartedAt
    ? Math.round(performance.now() - request.observabilityStartedAt)
    : null;
  // Corpo, usuário, query string, senha, token e pilha nunca entram no evento.
  const event = {
    time:new Date().toISOString(),
    level:status >= 500 ? 'error' : 'warning',
    category:'http',
    correlationId:request.correlationId || null,
    method:request.method,
    path:request.path,
    status,
    durationMs,
    code:String(error?.code || error?.name || 'internal').slice(0, 80)
  };
  const serialized = `${JSON.stringify(event)}\n`;
  if (localLogPath) appendFile(localLogPath, serialized, 'utf8').catch(() => {});
  // Render coleta stdout/stderr; o JSON permanece consultável e pode ser
  // encaminhado a um serviço central sem parser específico.
  if (status >= 500) {
    if (logger) logger.error('http', event);
    else console.error(JSON.stringify(event));
    void alerts?.send({
      severity:'critical',
      category:'http-500',
      title:'Erro interno na API do GPORT',
      summary:`${event.method} ${event.path} respondeu ${event.status}.`,
      correlationId:event.correlationId
    });
  }
  response.status(status).json({ error:publicMessage(error, status), correlationId:event.correlationId });
};
