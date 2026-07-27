import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const ignoredDirectories = new Set(['.git', '.github', 'node_modules', 'docs']);
const ignoredFiles = new Set(['.env', '.env.example', 'package-lock.json']);
const textExtensions = new Set(['.js', '.mjs', '.json', '.yaml', '.yml', '.html', '.css', '.sql']);
const detectors = [
  { name: 'URI PostgreSQL com senha', pattern: /postgres(?:ql)?:\/\/[^\s:@]+:[^\s@]+@/i },
  { name: 'token de provedor conhecido', pattern: /\b(?:ghp_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9_-]{20,}|service_role\s*[:=]\s*['"][^'"]{20,})/i },
  { name: 'JWT aparentemente incorporado', pattern: /\beyJ[a-zA-Z0-9_-]{20,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/ }
];

async function filesIn(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    if (entry.isDirectory()) return ignoredDirectories.has(entry.name) ? [] : filesIn(path.join(directory, entry.name));
    if (!entry.isFile() || ignoredFiles.has(entry.name) || !textExtensions.has(path.extname(entry.name))) return [];
    return [path.join(directory, entry.name)];
  }));
  return nested.flat();
}

const findings = [];
for (const file of await filesIn(root)) {
  const text = await readFile(file, 'utf8');
  for (const detector of detectors) {
    if (detector.pattern.test(text)) findings.push(`${path.relative(root, file)}: ${detector.name}`);
  }
}

if (findings.length) {
  console.error('Possível segredo encontrado. Remova-o do código e use variável de ambiente:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}
console.log('Verificação de segredos concluída: nenhum segredo aparente nos arquivos de código.');
