import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Writes the service worker with the list of built files so the app works offline.
function serviceWorker(): Plugin {
  return {
    name: 'anatomy-service-worker',
    apply: 'build',
    closeBundle() {
      const dist = path.resolve(__dirname, process.env.OUT_DIR || 'dist');
      const shell: string[] = ['./'];
      const data: string[] = [];
      const walk = (dir: string) => {
        for (const f of fs.readdirSync(dir)) {
          const full = path.join(dir, f);
          const rel = path.relative(dist, full).split(path.sep).join('/');
          if (fs.statSync(full).isDirectory()) walk(full);
          else if (rel === 'sw.js') continue;
          else if (rel.startsWith('data/geo/') || rel.startsWith('data/desc/')) data.push(rel);
          else shell.push(rel);
        }
      };
      walk(dist);
      const version = Date.now().toString(36);
      const src = fs.readFileSync(path.resolve(__dirname, 'src/sw.template.js'), 'utf8')
        .replace('__VERSION__', version)
        .replace('__DATAVER__', crypto.createHash('sha1').update(fs.readFileSync(path.join(dist, 'data/meta.json'))).digest('hex').slice(0, 10))
        .replace('__SHELL__', JSON.stringify(shell))
        .replace('__DATA__', JSON.stringify(data));
      fs.writeFileSync(path.join(dist, 'sw.js'), src);
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [preact(), serviceWorker()],
  build: { target: 'es2020', chunkSizeWarningLimit: 1500 },
});
