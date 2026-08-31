const severities = new Set(['info', 'warning', 'critical']);
const providers = new Set(['generic', 'teams-workflow', 'slack']);

const safeText = (value, maximum = 180) => String(value || '')
  .replace(/[\r\n\t]+/g, ' ')
  .replace(/\b(password|senha|token|secret|authorization)\s*[:=]\s*[^\s,;]+/gi, '[REDACTED]')
  .replace(/\s{2,}/g, ' ')
  .trim()
  .slice(0, maximum);

const payloadFor = (provider, event) => {
  const summary = `[${event.severity.toUpperCase()}] ${event.title} — ${event.summary}`;
  if (provider === 'slack') return { text:summary };
  if (provider === 'teams-workflow') return {
    severity:event.severity,
    title:event.title,
    summary:event.summary,
    category:event.category,
    occurredAt:event.occurredAt,
    correlationId:event.correlationId
  };
  return event;
};

export const createAlertDispatcher = ({
  webhookUrl = process.env.ALERT_WEBHOOK_URL,
  provider = process.env.ALERT_WEBHOOK_PROVIDER || 'generic',
  timeoutMs = Number(process.env.ALERT_WEBHOOK_TIMEOUT_MS || 5000),
  cooldownMs = Number(process.env.ALERT_COOLDOWN_MS || 300000),
  fetchImpl = globalThis.fetch,
  now = () => Date.now(),
  logger
} = {}) => {
  const configuredProvider = providers.has(provider) ? provider : 'generic';
  let endpoint = null;
  if (webhookUrl) {
    endpoint = new URL(webhookUrl);
    if (endpoint.protocol !== 'https:') throw new Error('ALERT_WEBHOOK_URL deve usar HTTPS.');
  }
  const sentAtByKey = new Map();

  const send = async input => {
    if (!endpoint) return { status:'disabled' };
    const severity = severities.has(input?.severity) ? input.severity : 'warning';
    const category = safeText(input?.category || 'application', 60);
    const event = {
      severity,
      category,
      title:safeText(input?.title || 'Evento operacional', 100),
      summary:safeText(input?.summary || 'Consulte os logs pelo identificador de correlação.'),
      occurredAt:new Date(now()).toISOString(),
      correlationId:safeText(input?.correlationId || '', 80) || null
    };
    const key = `${severity}:${category}:${event.title}`;
    const previous = sentAtByKey.get(key) || 0;
    if (now() - previous < Math.max(1000, cooldownMs)) return { status:'suppressed' };
    sentAtByKey.set(key, now());

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, timeoutMs));
    try {
      const response = await fetchImpl(endpoint, {
        method:'POST',
        headers:{ 'Content-Type':'application/json' },
        body:JSON.stringify(payloadFor(configuredProvider, event)),
        signal:controller.signal
      });
      if (!response.ok) throw Object.assign(new Error('Alert endpoint rejected event.'), { code:`ALERT_HTTP_${response.status}` });
      logger?.info('alert.delivery', { code:'ALERT_DELIVERED' });
      return { status:'sent' };
    } catch (error) {
      sentAtByKey.delete(key);
      logger?.error('alert.delivery', { code:error?.code || error?.name || 'ALERT_FAILED' });
      return { status:'failed', code:safeText(error?.code || error?.name || 'ALERT_FAILED', 80) };
    } finally {
      clearTimeout(timer);
    }
  };

  return { enabled:Boolean(endpoint), provider:configuredProvider, send };
};
