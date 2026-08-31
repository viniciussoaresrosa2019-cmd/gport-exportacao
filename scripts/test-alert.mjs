import 'dotenv/config';
import { createAlertDispatcher } from '../src/alerts.js';
import { createStructuredLogger } from '../src/structured-logger.js';

if (!process.argv.includes('--confirm')) {
  console.error('Alerta não enviado. Execute npm run alert:test -- --confirm somente no canal de homologação autorizado.');
  process.exitCode = 2;
} else {
  const logger = createStructuredLogger();
  const dispatcher = createAlertDispatcher({ logger });
  if (!dispatcher.enabled) {
    console.error('ALERT_WEBHOOK_URL não está configurada no ambiente.');
    process.exitCode = 2;
  } else {
    const result = await dispatcher.send({
      severity:'info',
      category:'controlled-test',
      title:'Teste controlado de alerta do GPORT',
      summary:'Este é um teste autorizado do canal de homologação.'
    });
    console.log(JSON.stringify({ status:result.status, provider:dispatcher.provider }));
    if (result.status !== 'sent') process.exitCode = 1;
  }
}

