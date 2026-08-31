import { randomUUID } from 'node:crypto';

const metricRoute = request => String(request.route?.path || request.path || 'unknown')
  .replace(/\/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, '/:id');

export const createObservability = ({
  slowRequestMs = 1000,
  errorThreshold = Number(process.env.OBSERVABILITY_ERROR_THRESHOLD || 5),
  errorWindowMs = Number(process.env.OBSERVABILITY_ERROR_WINDOW_MS || 300000),
  onThreshold,
  now = Date.now
} = {}) => {
  const state = { startedAt:new Date().toISOString(), total:0, errors:0, slow:0, routes:new Map() };
  const recentServerErrors = [];

  const record = (request, status, durationMs) => {
    const route = metricRoute(request);
    const current = state.routes.get(route) || { count:0, errors:0, slow:0, totalMs:0, maxMs:0 };
    current.count += 1;
    current.totalMs += durationMs;
    current.maxMs = Math.max(current.maxMs, durationMs);
    if (status >= 500) {
      current.errors += 1;
      state.errors += 1;
      const currentTime = now();
      recentServerErrors.push(currentTime);
      while (recentServerErrors.length && currentTime - recentServerErrors[0] > Math.max(1000, errorWindowMs)) recentServerErrors.shift();
      if (recentServerErrors.length >= Math.max(2, errorThreshold)) {
        try { void onThreshold?.({ type:'error-rate', errors:recentServerErrors.length, windowMs:errorWindowMs, route, correlationId:request.correlationId }); } catch { /* alertas não interrompem a resposta */ }
      }
    }
    if (durationMs >= slowRequestMs) { current.slow += 1; state.slow += 1; }
    state.total += 1;
    state.routes.set(route, current);
    if (durationMs >= slowRequestMs) {
      try { void onThreshold?.({ type:'slow-request', route, status, durationMs, correlationId:request.correlationId }); } catch { /* métricas não interrompem a resposta */ }
    }
  };

  const middleware = (request, response, next) => {
    request.correlationId = randomUUID();
    request.observabilityStartedAt = performance.now();
    response.setHeader('X-Request-Id', request.correlationId);
    if (request.path.startsWith('/api/')) {
      response.once('finish', () => record(
        request,
        response.statusCode,
        Math.round(performance.now() - request.observabilityStartedAt)
      ));
    }
    next();
  };

  const snapshot = () => {
    const routes = [...state.routes.entries()].map(([route, value]) => ({
      route,
      count:value.count,
      errors:value.errors,
      slow:value.slow,
      averageMs:value.count ? Math.round(value.totalMs / value.count) : 0,
      maxMs:value.maxMs
    })).sort((left, right) => right.count - left.count || right.averageMs - left.averageMs);
    return {
      startedAt:state.startedAt,
      slowRequestMs,
      total:state.total,
      errors:state.errors,
      slow:state.slow,
      routes
    };
  };

  return { middleware, snapshot };
};
