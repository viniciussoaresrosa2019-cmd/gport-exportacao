import { spawn } from 'node:child_process';

export const parsePostgresTarget = value => {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('A conexão deve usar PostgreSQL.');
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!url.hostname || !database || !url.username) throw new Error('Conexão PostgreSQL incompleta.');
  return {
    host:url.hostname,
    port:url.port || '5432',
    username:decodeURIComponent(url.username),
    password:decodeURIComponent(url.password),
    database,
    sslmode:url.searchParams.get('sslmode') || (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname) ? 'disable' : 'require')
  };
};

export const connectionArguments = target => [
  '--host', target.host,
  '--port', target.port,
  '--username', target.username,
  '--dbname', target.database
];

export const postgresEnvironment = target => ({
  ...process.env,
  PGPASSWORD:target.password,
  PGSSLMODE:target.sslmode
});

export const runPostgresTool = ({ executable, arguments:args, target }) => new Promise((resolve, reject) => {
  const child = spawn(executable, args, {
    env:postgresEnvironment(target),
    windowsHide:true,
    stdio:['ignore', 'ignore', 'pipe']
  });
  let errorCode = '';
  child.stderr.on('data', chunk => { errorCode = String(chunk).slice(-2000); });
  child.once('error', error => reject(Object.assign(new Error(`${executable} não pôde ser iniciado.`), { code:error.code || 'TOOL_START_FAILED' })));
  child.once('close', code => code === 0
    ? resolve()
    : reject(Object.assign(new Error(`${executable} falhou.`), {
      code:`${executable.toUpperCase().replace(/\W/g, '_')}_EXIT_${code}`,
      // stderr não é propagado para evitar que ferramentas revelem host/usuário.
      internalStderrPresent:Boolean(errorCode)
    })));
});

export const comparableTarget = target => `${target.host.toLowerCase()}:${target.port}/${target.database.toLowerCase()}`;

export const assertIsolatedRestoreTarget = ({ target, marker = 'restore', protectedUrls = [] }) => {
  const normalizedMarker = String(marker).toLowerCase();
  if (normalizedMarker.length < 4 || !target.database.toLowerCase().includes(normalizedMarker)) {
    throw Object.assign(new Error('O banco não possui marcador de isolamento válido.'), { code:'RESTORE_TARGET_NOT_ISOLATED' });
  }
  for (const protectedUrl of protectedUrls.filter(Boolean)) {
    if (comparableTarget(parsePostgresTarget(protectedUrl)) === comparableTarget(target)) {
      throw Object.assign(new Error('O destino coincide com um banco protegido.'), { code:'RESTORE_TARGET_PROTECTED' });
    }
  }
};
