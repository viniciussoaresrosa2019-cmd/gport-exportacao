const redactCode = value => String(value || 'unknown')
  .replace(/[^A-Za-z0-9_.:-]/g, '_')
  .slice(0, 80);

const allowedLevels = new Set(['debug', 'info', 'warning', 'error', 'critical']);

export const createStructuredLogger = ({
  service = 'gport-api',
  environment = process.env.DEPLOY_ENV || process.env.NODE_ENV || 'development',
  sink = console
} = {}) => {
  const write = (level, category, fields = {}) => {
    const event = {
      time:new Date().toISOString(),
      level:allowedLevels.has(level) ? level : 'info',
      service,
      environment:String(environment).slice(0, 40),
      category:redactCode(category),
      correlationId:fields.correlationId || null,
      method:fields.method || null,
      path:fields.path || null,
      status:Number.isInteger(fields.status) ? fields.status : null,
      durationMs:Number.isFinite(fields.durationMs) ? Math.round(fields.durationMs) : null,
      code:redactCode(fields.code)
    };
    const serialized = JSON.stringify(event);
    const output = event.level === 'error' || event.level === 'critical' ? sink.error : sink.log;
    output.call(sink, serialized);
    return event;
  };

  return {
    debug:(category, fields) => write('debug', category, fields),
    info:(category, fields) => write('info', category, fields),
    warning:(category, fields) => write('warning', category, fields),
    error:(category, fields) => write('error', category, fields),
    critical:(category, fields) => write('critical', category, fields)
  };
};

