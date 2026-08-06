import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'agenda-store-test-'));
let storeSource = fs.readFileSync(path.join(root, 'js/store.js'), 'utf8');
storeSource = storeSource.replace(
  "from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'",
  "from './mock-supabase.mjs'"
);
fs.writeFileSync(path.join(temp, 'store.mjs'), storeSource);
fs.copyFileSync(path.join(root, 'tests/mock-supabase.mjs'), path.join(temp, 'mock-supabase.mjs'));
fs.writeFileSync(path.join(temp, 'config.js'), "export const SUPABASE_URL='https://mock-project.supabase.co'; export const SUPABASE_PUBLISHABLE_KEY='sb_publishable_mock_abcdefghijklmnopqrstuvwxyz0123456789';\n");

const memory = new Map();
globalThis.localStorage = {
  getItem: (key) => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: (key) => memory.delete(key)
};
globalThis.location = { href: 'https://example.test/agenda/', pathname: '/agenda/' };
globalThis.history = { replaceState() {} };
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
globalThis.addEventListener = () => {};
globalThis.BroadcastChannel = class { addEventListener() {} postMessage() {} close() {} };
if (!globalThis.CustomEvent) globalThis.CustomEvent = class extends Event { constructor(type, options={}) { super(type); this.detail = options.detail; } };

const { mockDb } = await import(pathToFileURL(path.join(temp, 'mock-supabase.mjs')).href);
const { store } = await import(`${pathToFileURL(path.join(temp, 'store.mjs')).href}?t=${Date.now()}`);
const auth = await store.init();
assert.equal(auth.authenticated, true);
assert.equal(auth.needsFamily, false);
assert.deepEqual(store.getState().members.map((member) => member.name), ['Nacer', 'Romane', 'Chacha']);
assert.equal(store.getState().events.length, 0);

const created = store.addEvent({
  title: 'Dentiste Chacha',
  date: '2026-08-12',
  time: '14:30',
  duration: 60,
  category: 'health',
  location: 'Fréjus',
  notes: '',
  memberIds: [store.getState().members[2].id]
});
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.events.length, 1);
assert.equal(store.hasPendingChanges(), false);
assert.equal(store.getState().events[0].title, 'Dentiste Chacha');

store.updateEvent(created.id, { title: 'Dentiste Chacha — contrôle' });
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.events[0].title, 'Dentiste Chacha — contrôle');

store.deleteEvent(created.id);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.events.length, 0);
assert.equal(store.getState().events.length, 0);

const invitation = await store.createInvitation();
assert.equal(invitation.token, 'AGENDA-ABCDEF123456');
assert.match(invitation.link, /\?join=AGENDA-ABCDEF123456$/);

console.log('Test du store réussi : authentification, chargement, création, modification, suppression et invitation.');
