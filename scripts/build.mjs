import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

const root = path.resolve(import.meta.dirname, '..');
const publicRoot = path.join(root, 'public');
const outputRoot = path.join(publicRoot, 'dist');
const assetRoot = path.join(publicRoot, 'assets');
const indexSource = await readFile(path.join(publicRoot, 'index.html'), 'utf8');
const deployEnvironment = String(process.env.DEPLOY_ENV || process.env.NODE_ENV || 'development').toLowerCase();
const sourceMaps = process.env.BUILD_SOURCEMAPS === 'true' && deployEnvironment !== 'production';

const referencedAssets = new Set();
for (const match of indexSource.matchAll(/(?:src|href)="assets\/([^"?]+)(?:\?[^"\s]*)?"/g)) referencedAssets.add(match[1]);
const initialAssets = new Set(referencedAssets);
for (const secondary of ['reports.js']) referencedAssets.add(secondary);
await rm(outputRoot, { recursive:true, force:true });
await mkdir(path.join(outputRoot, 'assets'), { recursive:true });

const manifest = {};
for (const sourceName of referencedAssets) {
  const extension = path.extname(sourceName).toLowerCase();
  const source = await readFile(path.join(assetRoot, sourceName), 'utf8');
  const transformed = await transform(source, {
    loader:extension === '.css' ? 'css' : 'js',
    minify:true,
    sourcemap:sourceMaps ? 'external' : false,
    sourcefile:sourceName,
    legalComments:'none',
    target:'es2022',
    charset:'utf8'
  });
  const hash = createHash('sha256').update(transformed.code, 'utf8').digest('hex').slice(0, 12).toUpperCase();
  const outputName = `${path.basename(sourceName, extension)}-${hash}${extension}`;
  let code = transformed.code;
  if (sourceMaps && transformed.map) {
    const mapName = `${outputName}.map`;
    await writeFile(path.join(outputRoot, 'assets', mapName), transformed.map, 'utf8');
    code += extension === '.css' ? `\n/*# sourceMappingURL=${mapName} */\n` : `\n//# sourceMappingURL=${mapName}\n`;
  }
  await writeFile(path.join(outputRoot, 'assets', outputName), code, 'utf8');
  manifest[`assets/${sourceName}`] = `assets/${outputName}`;
}

let builtIndex = indexSource;
for (const [source, output] of Object.entries(manifest)) {
  const escaped = source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  builtIndex = builtIndex.replace(new RegExp(`${escaped}(?:\\?[^"\\s]*)?`, 'g'), output);
}
await writeFile(path.join(outputRoot, 'index.html'), builtIndex, 'utf8');

for (const entry of await readdir(publicRoot, { withFileTypes:true })) {
  if (['assets', 'dist', 'index.html'].includes(entry.name)) continue;
  await cp(path.join(publicRoot, entry.name), path.join(outputRoot, entry.name), { recursive:true });
}

const sizes = async directory => {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes:true })) {
    if (!entry.isFile() || !/\.(?:js|css)$/.test(entry.name)) continue;
    const content = await readFile(path.join(directory, entry.name));
    files.push({ file:entry.name, bytes:content.length, gzipBytes:gzipSync(content).length });
  }
  return files;
};
const sourceFiles = await sizes(assetRoot);
const outputFiles = await sizes(path.join(outputRoot, 'assets'));
const initialSourceFiles = sourceFiles.filter(file => initialAssets.has(file.file));
const initialOutputNames = new Set([...initialAssets].map(file => path.basename(manifest[`assets/${file}`] || '')));
const initialOutputFiles = outputFiles.filter(file => initialOutputNames.has(file.file));
const metrics = {
  generatedAt:new Date().toISOString(),
  deployEnvironment,
  sourceMaps,
  source:{ bytes:sourceFiles.reduce((sum, file) => sum + file.bytes, 0), gzipBytes:sourceFiles.reduce((sum, file) => sum + file.gzipBytes, 0), files:sourceFiles },
  output:{ bytes:outputFiles.reduce((sum, file) => sum + file.bytes, 0), gzipBytes:outputFiles.reduce((sum, file) => sum + file.gzipBytes, 0), files:outputFiles },
  initial:{
    sourceBytes:initialSourceFiles.reduce((sum, file) => sum + file.bytes, 0),
    sourceGzipBytes:initialSourceFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
    outputBytes:initialOutputFiles.reduce((sum, file) => sum + file.bytes, 0),
    outputGzipBytes:initialOutputFiles.reduce((sum, file) => sum + file.gzipBytes, 0),
    deferred:[...referencedAssets].filter(file => !initialAssets.has(file))
  }
};
await writeFile(path.join(outputRoot, 'asset-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await writeFile(path.join(outputRoot, 'build-metrics.json'), `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status:'built', assets:Object.keys(manifest).length, sourceMaps, sourceBytes:metrics.source.bytes, outputBytes:metrics.output.bytes }));
