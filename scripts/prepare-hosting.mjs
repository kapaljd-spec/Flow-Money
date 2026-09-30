import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hostingRoot = resolve(projectRoot, 'public');
const files = ['index.html', 'styles.css', 'script.js', 'firebase.js', 'firebase-config.js', 'runtime-config.js'];

await mkdir(hostingRoot, { recursive: true });
await mkdir(resolve(hostingRoot, 'functions'), { recursive: true });
await rm(resolve(hostingRoot, 'dashboard'), { recursive: true, force: true });

for (const file of files) {
  await cp(resolve(projectRoot, file), resolve(hostingRoot, file));
}

await cp(resolve(projectRoot, 'src'), resolve(hostingRoot, 'src'), { recursive: true, force: true });
await mkdir(resolve(hostingRoot, 'dashboard'), { recursive: true });
for (const file of ['index.html', 'dashboard.css', 'app.js']) {
  await cp(resolve(projectRoot, 'dashboard', file), resolve(hostingRoot, 'dashboard', file));
}
await cp(resolve(projectRoot, 'functions/telegram.js'), resolve(hostingRoot, 'functions/telegram.js'));