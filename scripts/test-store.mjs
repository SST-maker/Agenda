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
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true, userAgent: 'AgendaTest' }, configurable: true });
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


const seriesId = '55555555-5555-4555-8555-555555555555';
store.addEvents([
  { title:'Piscine', date:'2026-08-20', time:'18:00', duration:60, category:'sport', location:'', notes:'', memberIds:[store.getState().members[2].id], allDay:false, responsibleMemberId:store.getState().members[0].id, seriesId, recurrenceRule:'weekly' },
  { title:'Piscine', date:'2026-08-27', time:'18:00', duration:60, category:'sport', location:'', notes:'', memberIds:[store.getState().members[2].id], allDay:false, responsibleMemberId:store.getState().members[0].id, seriesId, recurrenceRule:'weekly' }
]);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.events.filter((event) => event.series_id === seriesId).length, 2);
store.deleteSeries(seriesId);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.events.filter((event) => event.series_id === seriesId).length, 0);

await store.updateFamilyIdentity({ name:'Famille Hamadi', symbol:'🌿' });
assert.equal(store.getState().family.name, 'Famille Hamadi');
const nacer = store.getState().members[0];
await store.updateMemberPresentation(nacer.id, { nickname:'Papa', color:'#123456', avatarUrl:null });
assert.equal(store.getState().members[0].nickname, 'Papa');

const invitation = await store.createInvitation();
assert.equal(invitation.token, 'AGENDA-ABCDEF123456');
assert.match(invitation.link, /\?join=AGENDA-ABCDEF123456$/);



const task = store.addTask({
  title: 'Récupérer le colis', dueDate: '2026-08-12', dueTime: '17:30', priority: 'high',
  responsibleMemberId: store.getState().members[0].id, notes: '', reminderMinutes: 30, status: 'pending'
});
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.tasks.length, 1);
assert.equal(store.getState().tasks[0].title, 'Récupérer le colis');
store.toggleTask(task.id, true);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.tasks[0].status, 'done');
store.deleteTask(task.id);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.tasks.length, 0);

await store.saveNotificationPreferences({ pushEnabled: false, eventReminders: true, taskReminders: true, dailySummary: true, dailySummaryTime: '08:00' });
assert.equal(store.getState().notificationPreferences.dailySummaryTime, '08:00');

const shopping = store.addShoppingItem({ name: 'Lait', quantity: 'x2', category: 'fresh' });
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.shoppingItems.length, 1);
assert.equal(store.getState().shoppingItems[0].name, 'Lait');
store.toggleShoppingItem(shopping.id, true);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.shoppingItems[0].checked, true);
store.clearCheckedShoppingItems();
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.shoppingItems.length, 0);

const routine = store.addRoutine({ title: 'Préparer le sac', weekdays: [1,2,3,4,5], time: '19:30', responsibleMemberId: store.getState().members[0].id, notes: '', active: true });
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.routines.length, 1);
assert.deepEqual(mockDb.routines[0].weekdays, [1,2,3,4,5]);
store.toggleRoutineCompletion(routine.id, '2026-08-07', true);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.routineCompletions.length, 1);
store.toggleRoutineCompletion(routine.id, '2026-08-07', false);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.routineCompletions.length, 0);
store.deleteRoutine(routine.id);
await new Promise((resolve) => setTimeout(resolve, 30));
assert.equal(mockDb.routines.length, 0);

const sharedEvent = store.addEvent({
  title: 'Réunion famille', date: '2026-08-15', time: '10:00', duration: 60, category: 'family', location: '', notes: '', memberIds: [store.getState().members[0].id]
});
await new Promise((resolve) => setTimeout(resolve, 30));
await store.addComment('event', sharedEvent.id, 'Je prends les documents.');
assert.equal(store.getState().comments.length, 1);
await store.toggleReaction('event', sharedEvent.id, '👍');
assert.equal(store.getState().reactions.length, 1);
await store.markRead('event', sharedEvent.id);
assert.equal(store.getState().reads.length, 1);
await store.toggleReaction('event', sharedEvent.id, '👍');
assert.equal(store.getState().reactions.length, 0);
await store.deleteComment(store.getState().comments[0].id);
assert.equal(store.getState().comments.length, 0);
store.deleteEvent(sharedEvent.id);
await new Promise((resolve) => setTimeout(resolve, 30));

console.log('Test du store réussi : auth, événements, séries, tâches, courses, routines, notifications, collaboration, identité familiale, profils et invitation.');
