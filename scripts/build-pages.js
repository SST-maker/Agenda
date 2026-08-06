'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, '_site');
const url = String(process.env.SUPABASE_URL || '').trim();
const key = String(process.env.SUPABASE_PUBLISHABLE_KEY || '').trim();

if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url)) {
  throw new Error('Variable GitHub SUPABASE_URL absente ou invalide.');
}
if (key.length < 30 || /service_role/i.test(key)) {
  throw new Error('Variable GitHub SUPABASE_PUBLISHABLE_KEY absente, invalide ou dangereuse.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

const files = ['index.html', 'styles.css', 'manifest.json', 'service-worker.js', 'robots.txt'];
for (const file of files) fs.copyFileSync(path.join(root, file), path.join(output, file));
fs.cpSync(path.join(root, 'assets'), path.join(output, 'assets'), { recursive: true });
fs.cpSync(path.join(root, 'js'), path.join(output, 'js'), { recursive: true });

const config = `// Généré automatiquement par GitHub Actions.\nexport const SUPABASE_URL = ${JSON.stringify(url)};\nexport const SUPABASE_PUBLISHABLE_KEY = ${JSON.stringify(key)};\n`;
fs.writeFileSync(path.join(output, 'js/config.js'), config);
fs.writeFileSync(path.join(output, '.nojekyll'), '');
console.log(`Site statique généré dans ${output}`);
