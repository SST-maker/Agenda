'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const required = [
  'index.html', 'styles.css', 'manifest.json', 'service-worker.js',
  'js/app.js', 'js/store.js', 'js/config.js', 'supabase/schema.sql',
  'assets/brand/logo-horizontal.svg', 'assets/brand/logo-symbol.svg',
  'assets/icons/agenda_app_icon_192x192.png', 'assets/icons/agenda_app_icon_512x512.png'
];

const failures = [];
for (const relative of required) {
  const target = path.join(root, relative);
  if (!fs.existsSync(target) || fs.statSync(target).size === 0) failures.push(`Fichier absent ou vide : ${relative}`);
}

try {
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(root, 'js/store.js')), stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync(process.execPath, ['--input-type=module', '--check'], { input: fs.readFileSync(path.join(root, 'js/app.js')), stdio: ['pipe', 'pipe', 'pipe'] });
  execFileSync(process.execPath, ['--check', path.join(root, 'service-worker.js')], { stdio: 'pipe' });
} catch (error) {
  failures.push(`Erreur de syntaxe JavaScript : ${error.stderr?.toString() || error.message}`);
}

try {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  if (manifest.start_url !== './' || manifest.scope !== './' || manifest.id !== './') {
    failures.push('Le manifeste doit utiliser des chemins relatifs pour GitHub Pages.');
  }
  for (const icon of manifest.icons || []) {
    if (!fs.existsSync(path.join(root, icon.src))) failures.push(`Icône introuvable : ${icon.src}`);
  }
} catch (error) {
  failures.push(`Manifest invalide : ${error.message}`);
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');
const htmlIds = new Set([...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]));
const duplicates = [...html.matchAll(/id="([^"]+)"/g)].map((match) => match[1]).filter((id, index, all) => all.indexOf(id) !== index);
if (duplicates.length) failures.push(`Identifiants HTML dupliqués : ${[...new Set(duplicates)].join(', ')}`);
const directRefs = [...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((match) => match[1]);
const missingIds = [...new Set(directRefs.filter((id) => !htmlIds.has(id)))];
if (missingIds.length) failures.push(`Identifiants HTML manquants : ${missingIds.join(', ')}`);

const sql = fs.readFileSync(path.join(root, 'supabase/schema.sql'), 'utf8');
for (const expected of ['enable row level security', 'create_agenda_family', 'join_agenda_family', 'rotate_family_invite', 'supabase_realtime']) {
  if (!sql.toLowerCase().includes(expected.toLowerCase())) failures.push(`Élément SQL manquant : ${expected}`);
}
if (/service_role/i.test(fs.readFileSync(path.join(root, 'js/config.js'), 'utf8'))) failures.push('Une clé service_role ne doit jamais être présente dans le navigateur.');

if (failures.length) {
  console.error('\nÉCHEC DU CONTRÔLE\n- ' + failures.join('\n- '));
  process.exit(1);
}
console.log('Contrôle réussi : structure, JavaScript, manifeste, assets, RLS et références HTML valides.');
