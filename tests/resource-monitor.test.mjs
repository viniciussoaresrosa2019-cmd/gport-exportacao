import assert from 'node:assert/strict';
import test from 'node:test';
import { createResourceMonitor } from '../src/resource-monitor.js';

test('monitor de recursos calcula CPU/memória e alerta acima dos limites', async () => {
  const events = [];
  let cpuCall = 0;
  const cpuUsage = () => {
    cpuCall += 1;
    return cpuCall === 1 ? { user:1000, system:0 } : { user:951_000, system:50_000 };
  };
  let instant = 0;
  const monitor = createResourceMonitor({
    alerts:{ send:event => events.push(event) },
    cpuUsage,
    memoryUsage:() => ({ rss:95 * 1024 * 1024 }),
    now:() => { instant += 1000; return instant; },
    memoryLimitMb:100,
    memoryWarningPercent:90,
    cpuWarningPercent:90
  });
  const sample = await monitor.sample();
  assert.equal(sample.cpuPercent, 100);
  assert.equal(sample.memoryPercent, 95);
  assert.deepEqual(events.map(event => event.category), ['resource-cpu', 'resource-memory']);
});
