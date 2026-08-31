export const createResourceMonitor = ({
  alerts,
  intervalMs = Number(process.env.RESOURCE_MONITOR_INTERVAL_MS || 60000),
  memoryLimitMb = Number(process.env.MEMORY_LIMIT_MB || 512),
  memoryWarningPercent = Number(process.env.MEMORY_WARNING_PERCENT || 85),
  cpuWarningPercent = Number(process.env.CPU_WARNING_PERCENT || 90),
  cpuUsage = process.cpuUsage,
  memoryUsage = process.memoryUsage,
  now = () => performance.now()
} = {}) => {
  let previousCpu = cpuUsage();
  let previousAt = now();

  const sample = async () => {
    const currentAt = now();
    const elapsedMicroseconds = Math.max(1, (currentAt - previousAt) * 1000);
    const currentCpu = cpuUsage();
    const cpuDelta = {
      user:Math.max(0, currentCpu.user - previousCpu.user),
      system:Math.max(0, currentCpu.system - previousCpu.system)
    };
    previousCpu = currentCpu;
    previousAt = currentAt;
    const cpuPercent = Math.round(((cpuDelta.user + cpuDelta.system) / elapsedMicroseconds) * 1000) / 10;
    const rssMb = Math.round((memoryUsage().rss / 1024 / 1024) * 10) / 10;
    const memoryPercent = memoryLimitMb > 0 ? Math.round((rssMb / memoryLimitMb) * 1000) / 10 : 0;
    if (cpuPercent >= cpuWarningPercent) await alerts?.send({
      severity:'warning', category:'resource-cpu', title:'CPU elevada no GPORT',
      summary:`Uso do processo atingiu ${cpuPercent}% no intervalo de medição.`
    });
    if (memoryPercent >= memoryWarningPercent) await alerts?.send({
      severity:'warning', category:'resource-memory', title:'Memória elevada no GPORT',
      summary:`RSS atingiu ${memoryPercent}% do limite configurado.`
    });
    return { cpuPercent, rssMb, memoryPercent };
  };

  const start = () => {
    const timer = setInterval(() => void sample(), Math.max(10000, intervalMs));
    timer.unref?.();
    return () => clearInterval(timer);
  };
  return { sample, start };
};
