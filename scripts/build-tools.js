import { access, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = join(projectRoot, 'dist');
const ignoredDirectories = new Set(['.git', '.vercel', 'dist', 'node_modules']);

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(join(projectRoot, 'index.html'), join(outputDirectory, 'index.html'));

const entries = await readdir(projectRoot, { withFileTypes: true });
const tools = [];

for (const entry of entries) {
  if (!entry.isDirectory() || entry.name.startsWith('.') || ignoredDirectories.has(entry.name)) continue;

  const sourceDirectory = join(projectRoot, entry.name);
  try {
    await access(join(sourceDirectory, 'index.html'));
  } catch {
    continue;
  }

  await cp(sourceDirectory, join(outputDirectory, entry.name), {
    recursive: true,
    filter: sourcePath => !['.git', '.vercel', 'node_modules'].includes(basename(sourcePath))
  });
  tools.push({
    name: entry.name,
    url: `/${encodeURIComponent(entry.name)}/index.html`
  });
}

tools.sort((first, second) => first.name.localeCompare(second.name));
await writeFile(join(outputDirectory, 'tools.json'), `${JSON.stringify(tools, null, 2)}\n`);
console.log(`Built dashboard with ${tools.length} tool${tools.length === 1 ? '' : 's'}.`);