const STORAGE_KEY = 'agenda-family-v2';
const FAMILY_KEY = 'agenda-family-code';
const CHANNEL_NAME = 'agenda-family-sync';
const DATA_VERSION = 2;

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

/**
 * État initial volontairement vierge : Nacer, Romane et Chacha peuvent
 * construire leur propre organisation sans aucun événement de démonstration.
 */
function createSeed() {
  return {
    version: DATA_VERSION,
    settings: { quietMode: false },
    members: [
      { id: 'nacer', name: 'Nacer', role: 'Papa', initials: 'NA', color: '#224A54' },
      { id: 'romane', name: 'Romane', role: 'Maman', initials: 'RO', color: '#C79A5C' },
      { id: 'chacha', name: 'Chacha', role: 'Enfant', initials: 'CH', color: '#739A87' }
    ],
    events: []
  };
}

function normalizeState(candidate) {
  const seed = createSeed();

  // Toute ancienne version contenait les données de démonstration : on repart
  // donc volontairement sur le nouvel agenda familial vide.
  if (!candidate || candidate.version !== DATA_VERSION) return seed;

  return {
    version: DATA_VERSION,
    settings: {
      quietMode: Boolean(candidate.settings?.quietMode)
    },
    members: Array.isArray(candidate.members) && candidate.members.length
      ? candidate.members
      : seed.members,
    events: Array.isArray(candidate.events) ? candidate.events : []
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
      const normalized = normalizeState(JSON.parse(raw));
      this.safeStorageSet(this.storageKey, JSON.stringify(normalized));
      return normalized;
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

    const needsMigration = payload.state.version !== DATA_VERSION;
    this.state = normalizeState(payload.state);
    this.save('remote-update', { pushRemote: false });

    // Remplace aussi sur le serveur une éventuelle ancienne famille de démonstration.
    if (needsMigration) await this.pushRemote();
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
