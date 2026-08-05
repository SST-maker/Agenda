const STORAGE_KEY = 'agenda-family-v1';
const FAMILY_KEY = 'agenda-family-code';
const CHANNEL_NAME = 'agenda-family-sync';

const uid = () => {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

export const CATEGORY_META = {
  family: { label: 'Famille', color: '#C79A5C' },
  school: { label: 'École', color: '#739A87' },
  health: { label: 'Santé', color: '#A77887' },
  work: { label: 'Travail', color: '#224A54' },
  sport: { label: 'Sport', color: '#8B5E3C' },
  home: { label: 'Maison', color: '#6D8C7E' }
};

const toISO = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

function createSeed() {
  const today = new Date();
  const date = (offset) => toISO(addDays(today, offset));

  return {
    version: 1,
    settings: { quietMode: false },
    members: [
      { id: 'nora', name: 'Nora', role: 'Parent', initials: 'NO', color: '#224A54' },
      { id: 'adam', name: 'Adam', role: 'Parent', initials: 'AD', color: '#8B5E3C' },
      { id: 'lina', name: 'Lina', role: 'Enfant', initials: 'LI', color: '#A77887' },
      { id: 'yanis', name: 'Yanis', role: 'Enfant', initials: 'YA', color: '#739A87' }
    ],
    events: [
      { id: uid(), title: 'Petit-déjeuner tous ensemble', date: date(0), time: '07:30', duration: 45, memberIds: ['nora','adam','lina','yanis'], category: 'family', location: 'À la maison', notes: '' },
      { id: uid(), title: 'Rendez-vous pédiatre', date: date(0), time: '10:15', duration: 45, memberIds: ['nora','yanis'], category: 'health', location: 'Cabinet du Dr Martin', notes: 'Prendre le carnet de santé.' },
      { id: uid(), title: 'Déjeuner avec Mamie', date: date(0), time: '12:30', duration: 90, memberIds: ['lina','yanis'], category: 'family', location: 'Chez Mamie', notes: '' },
      { id: uid(), title: 'Cours de natation', date: date(0), time: '17:15', duration: 60, memberIds: ['lina'], category: 'sport', location: 'Piscine municipale', notes: '' },
      { id: uid(), title: 'Dîner sans écrans', date: date(0), time: '19:45', duration: 75, memberIds: ['nora','adam','lina','yanis'], category: 'family', location: 'À la maison', notes: '' },
      { id: uid(), title: 'Présentation projet', date: date(1), time: '09:00', duration: 60, memberIds: ['adam'], category: 'work', location: 'Bureau', notes: '' },
      { id: uid(), title: 'Sortie bibliothèque', date: date(1), time: '14:00', duration: 90, memberIds: ['nora','lina','yanis'], category: 'school', location: 'Médiathèque', notes: '' },
      { id: uid(), title: 'Dîner tous ensemble', date: date(1), time: '19:30', duration: 90, memberIds: ['nora','adam','lina','yanis'], category: 'family', location: 'À la maison', notes: '' },
      { id: uid(), title: 'Télétravail', date: date(2), time: '08:30', duration: 420, memberIds: ['nora'], category: 'work', location: 'Maison', notes: '' },
      { id: uid(), title: 'Foot avec les copains', date: date(2), time: '17:30', duration: 75, memberIds: ['yanis'], category: 'sport', location: 'Stade', notes: '' },
      { id: uid(), title: 'Marché du samedi', date: date(3), time: '09:30', duration: 90, memberIds: ['adam','lina'], category: 'home', location: 'Centre-ville', notes: '' },
      { id: uid(), title: 'Cinéma en famille', date: date(3), time: '16:00', duration: 120, memberIds: ['nora','adam','lina','yanis'], category: 'family', location: 'Cinéma', notes: '' },
      { id: uid(), title: 'Brunch tranquille', date: date(4), time: '11:00', duration: 120, memberIds: ['nora','adam','lina','yanis'], category: 'family', location: 'Maison', notes: '' },
      { id: uid(), title: 'Réunion parents-profs', date: date(6), time: '18:00', duration: 60, memberIds: ['nora','adam','lina'], category: 'school', location: 'Collège', notes: '' },
      { id: uid(), title: 'Contrôle orthodontiste', date: date(-1), time: '16:30', duration: 45, memberIds: ['adam','lina'], category: 'health', location: 'Centre médical', notes: '' }
    ]
  };
}

/**
 * Couche de données locale-first.
 * L'UI fonctionne avec localStorage, puis active automatiquement l'API temps réel
 * quand l'application est servie par le serveur Node fourni.
 */
class AgendaStore extends EventTarget {
  constructor() {
    super();
    this.clientId = uid();
    this.familyId = this.resolveFamilyId();
    this.remoteReady = false;
    this.syncTimer = null;
    this.eventSource = null;
    this.channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
    this.state = this.load();

    this.channel?.addEventListener('message', (event) => {
      if (event.data?.familyId !== this.familyId || event.data?.clientId === this.clientId) return;
      this.state = this.load();
      this.emit('remote-update');
    });

    window.addEventListener('storage', (event) => {
      if (event.key === this.storageKey) {
        this.state = this.load();
        this.emit('remote-update');
      }
    });

    this.connectRemote();
  }

  resolveFamilyId() {
    const queryCode = new URLSearchParams(location.search).get('family')?.toUpperCase();
    const storedCode = this.safeStorageGet(FAMILY_KEY)?.toUpperCase();
    const code = [queryCode, storedCode, 'HORIZON-24'].find((value) => /^[A-Z0-9-]{4,32}$/.test(value || ''));
    this.safeStorageSet(FAMILY_KEY, code);
    return code;
  }

  get storageKey() { return `${STORAGE_KEY}:${this.familyId}`; }

  safeStorageGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
  }

  safeStorageSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* navigation privée stricte */ }
  }

  load() {
    try {
      const raw = this.safeStorageGet(this.storageKey);
      if (!raw) {
        const seed = createSeed();
        this.safeStorageSet(this.storageKey, JSON.stringify(seed));
        return seed;
      }
      return JSON.parse(raw);
    } catch (error) {
      console.warn('Données locales illisibles, réinitialisation.', error);
      return createSeed();
    }
  }

  save(reason = 'update', { pushRemote = true } = {}) {
    this.safeStorageSet(this.storageKey, JSON.stringify(this.state));
    this.channel?.postMessage({ reason, familyId: this.familyId, clientId: this.clientId, at: Date.now() });
    this.emit(reason);
    if (pushRemote) this.scheduleRemotePush();
  }

  emit(reason, extra = {}) {
    this.dispatchEvent(new CustomEvent('change', { detail: { reason, ...extra } }));
  }

  getState() { return structuredClone(this.state); }
  getFamilyId() { return this.familyId; }
  isRemoteReady() { return this.remoteReady; }

  addEvent(event) {
    this.state.events.push({ id: uid(), ...event });
    this.save('event-added');
  }

  deleteEvent(id) {
    this.state.events = this.state.events.filter((event) => event.id !== id);
    this.save('event-deleted');
  }

  addMember(member) {
    this.state.members.push({ id: uid(), ...member });
    this.save('member-added');
  }

  setSetting(key, value) {
    this.state.settings[key] = value;
    this.save('setting-updated');
  }

  reset() {
    this.state = createSeed();
    this.save('reset');
  }

  async connectRemote() {
    if (!/^https?:$/.test(location.protocol)) return;
    if (this.remoteReady && this.eventSource?.readyState === EventSource.OPEN) return;
    try {
      const health = await fetch('/api/health', { headers: { Accept: 'application/json' } });
      if (!health.ok) return;
      this.remoteReady = true;
      this.emit('sync-status', { remoteReady: true });
      await this.pullRemote();
      this.openEventStream();
    } catch {
      this.remoteReady = false;
      this.emit('sync-status', { remoteReady: false });
    }
  }

  async pullRemote() {
    if (!this.remoteReady) return;
    const response = await fetch(`/api/state?familyId=${encodeURIComponent(this.familyId)}`, { headers: { Accept: 'application/json' } });
    if (response.status === 404) {
      await this.pushRemote();
      return;
    }
    if (!response.ok) throw new Error(`Synchronisation impossible (${response.status})`);
    const payload = await response.json();
    if (!payload.state || !Array.isArray(payload.state.members) || !Array.isArray(payload.state.events)) return;
    this.state = payload.state;
    this.save('remote-update', { pushRemote: false });
  }

  scheduleRemotePush() {
    if (!this.remoteReady) return;
    clearTimeout(this.syncTimer);
    this.syncTimer = setTimeout(() => this.pushRemote(), 220);
  }

  async pushRemote() {
    if (!this.remoteReady) return;
    try {
      const response = await fetch('/api/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ familyId: this.familyId, clientId: this.clientId, state: this.state })
      });
      if (!response.ok) throw new Error(`Enregistrement impossible (${response.status})`);
      this.emit('sync-complete', { remoteReady: true });
    } catch (error) {
      console.warn(error);
      this.remoteReady = false;
      this.emit('sync-status', { remoteReady: false });
    }
  }

  openEventStream() {
    this.eventSource?.close();
    this.eventSource = new EventSource(`/api/events?familyId=${encodeURIComponent(this.familyId)}`);
    this.eventSource.addEventListener('update', async (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (payload.clientId === this.clientId) return;
        await this.pullRemote();
      } catch (error) {
        console.warn('Mise à jour temps réel ignorée.', error);
      }
    });
    this.eventSource.addEventListener('error', () => {
      this.remoteReady = false;
      this.emit('sync-status', { remoteReady: false });
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = setTimeout(() => this.connectRemote(), 5000);
    });
  }
}

export const store = new AgendaStore();
export { toISO, addDays };
