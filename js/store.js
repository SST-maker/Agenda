import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

const STORAGE_KEY = 'agenda-family-supabase-state-v4';
const QUEUE_KEY = 'agenda-family-supabase-queue-v4';
const PENDING_ONBOARDING_KEY = 'agenda-family-supabase-onboarding-v4';
const CHANNEL_NAME = 'agenda-family-supabase-tabs';
const DATA_VERSION = 4;

const uid = () => globalThis.crypto?.randomUUID?.() || `evt-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export const CATEGORY_META = {
  family: { label: 'Famille', color: '#C79A5C' },
  school: { label: 'École', color: '#739A87' },
  health: { label: 'Santé', color: '#A77887' },
  work: { label: 'Travail', color: '#224A54' },
  sport: { label: 'Sport', color: '#8B5E3C' },
  home: { label: 'Maison', color: '#6D8C7E' }
};

export const toISO = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

function createSeed() {
  return {
    version: DATA_VERSION,
    family: { id: null, name: 'Famille Hamadi', symbol: '🌿', photoUrl: null },
    settings: { quietMode: false },
    members: [
      { id: 'local-nacer', name: 'Nacer', nickname: '', role: 'Papa', initials: 'NA', color: '#224A54', avatarUrl: null },
      { id: 'local-romane', name: 'Romane', nickname: '', role: 'Maman', initials: 'RO', color: '#C79A5C', avatarUrl: null },
      { id: 'local-chacha', name: 'Chacha', nickname: '', role: 'Enfant', initials: 'CH', color: '#739A87', avatarUrl: null }
    ],
    events: [],
    tasks: [],
    notificationPreferences: { pushEnabled: false, eventReminders: true, taskReminders: true, dailySummary: true, dailySummaryTime: '07:30' },
    syncedAt: null
  };
}

function normalizeState(candidate) {
  const seed = createSeed();
  if (!candidate || candidate.version !== DATA_VERSION) return seed;
  return {
    version: DATA_VERSION,
    family: candidate.family || seed.family,
    settings: { quietMode: Boolean(candidate.settings?.quietMode) },
    members: Array.isArray(candidate.members) && candidate.members.length ? candidate.members : seed.members,
    events: Array.isArray(candidate.events) ? candidate.events : [],
    tasks: Array.isArray(candidate.tasks) ? candidate.tasks : [],
    notificationPreferences: {
      pushEnabled: Boolean(candidate.notificationPreferences?.pushEnabled),
      eventReminders: candidate.notificationPreferences?.eventReminders !== false,
      taskReminders: candidate.notificationPreferences?.taskReminders !== false,
      dailySummary: candidate.notificationPreferences?.dailySummary !== false,
      dailySummaryTime: candidate.notificationPreferences?.dailySummaryTime || '07:30'
    },
    syncedAt: candidate.syncedAt || null
  };
}

function appBaseUrl() {
  const url = new URL(location.href);
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/[^/]*$/, '');
  return url.toString();
}

function isConfigured() {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(SUPABASE_URL)
    && typeof SUPABASE_PUBLISHABLE_KEY === 'string'
    && !SUPABASE_PUBLISHABLE_KEY.includes('VOTRE_')
    && SUPABASE_PUBLISHABLE_KEY.length > 30;
}

function mapMember(row) {
  return {
    id: row.id,
    name: row.name,
    nickname: row.nickname || '',
    birthday: row.birthday || '',
    role: row.role_label,
    initials: row.initials,
    color: row.color,
    avatarUrl: row.avatar_url || null,
    linkedUserId: row.linked_user_id,
    sortOrder: row.sort_order
  };
}

function mapEvent(row) {
  return {
    id: row.id,
    title: row.title,
    date: row.event_date,
    time: String(row.event_time || '00:00').slice(0, 5),
    duration: Number(row.duration_minutes),
    category: row.category,
    location: row.location || '',
    notes: row.notes || '',
    memberIds: Array.isArray(row.member_ids) ? row.member_ids : [],
    familyId: row.family_id,
    allDay: Boolean(row.all_day),
    responsibleMemberId: row.responsible_member_id || '',
    seriesId: row.series_id || '',
    recurrenceRule: row.recurrence_rule || 'none',
    reminderMinutes: row.reminder_minutes === null || row.reminder_minutes === undefined ? null : Number(row.reminder_minutes),
    updatedAt: row.updated_at
  };
}

function eventToRow(event, familyId, userId) {
  return {
    id: event.id,
    family_id: familyId,
    title: String(event.title || '').trim().slice(0, 80),
    event_date: event.date,
    event_time: event.time,
    duration_minutes: Number(event.duration),
    category: CATEGORY_META[event.category] ? event.category : 'family',
    location: String(event.location || '').trim().slice(0, 100) || null,
    notes: String(event.notes || '').trim().slice(0, 300) || null,
    member_ids: Array.isArray(event.memberIds) ? event.memberIds : [],
    all_day: Boolean(event.allDay),
    responsible_member_id: event.responsibleMemberId || null,
    series_id: event.seriesId || null,
    recurrence_rule: event.recurrenceRule || 'none',
    reminder_minutes: event.reminderMinutes === '' || event.reminderMinutes === null || event.reminderMinutes === undefined ? null : Number(event.reminderMinutes),
    updated_by: userId
  };
}

function mapTask(row) {
  return {
    id: row.id,
    familyId: row.family_id,
    title: row.title,
    dueDate: row.due_date,
    dueTime: row.due_time ? String(row.due_time).slice(0, 5) : '',
    responsibleMemberId: row.responsible_member_id || '',
    priority: row.priority || 'normal',
    status: row.status || 'pending',
    notes: row.notes || '',
    reminderMinutes: row.reminder_minutes === null || row.reminder_minutes === undefined ? null : Number(row.reminder_minutes),
    completedAt: row.completed_at || null,
    updatedAt: row.updated_at
  };
}

function taskToRow(task, familyId, userId) {
  return {
    id: task.id,
    family_id: familyId,
    title: String(task.title || '').trim().slice(0, 120),
    due_date: task.dueDate,
    due_time: task.dueTime || null,
    responsible_member_id: task.responsibleMemberId || null,
    priority: ['low','normal','high'].includes(task.priority) ? task.priority : 'normal',
    status: task.status === 'done' ? 'done' : 'pending',
    notes: String(task.notes || '').trim().slice(0, 300) || null,
    reminder_minutes: task.reminderMinutes === '' || task.reminderMinutes === null || task.reminderMinutes === undefined ? null : Number(task.reminderMinutes),
    completed_at: task.status === 'done' ? (task.completedAt || new Date().toISOString()) : null,
    completed_by: task.status === 'done' ? userId : null,
    updated_by: userId
  };
}

function mapNotificationPreferences(row) {
  return {
    pushEnabled: Boolean(row?.push_enabled),
    eventReminders: row?.event_reminders !== false,
    taskReminders: row?.task_reminders !== false,
    dailySummary: row?.daily_summary !== false,
    dailySummaryTime: row?.daily_summary_time ? String(row.daily_summary_time).slice(0, 5) : '07:30'
  };
}

class AgendaStore extends EventTarget {
  constructor() {
    super();
    this.clientId = uid();
    this.configured = isConfigured();
    this.supabase = this.configured
      ? createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
          realtime: { params: { eventsPerSecond: 10 } }
        })
      : null;
    this.state = this.loadState();
    this.queue = this.loadQueue();
    this.currentUser = null;
    this.session = null;
    this.authenticated = false;
    this.needsFamily = false;
    this.recoveryMode = false;
    this.remoteReady = false;
    this.offlineSession = false;
    this.flushing = false;
    this.realtimeChannel = null;
    this.pullTimer = null;
    this.sessionTask = null;
    this.sessionTaskToken = null;
    this.channel = 'BroadcastChannel' in globalThis ? new BroadcastChannel(CHANNEL_NAME) : null;

    this.channel?.addEventListener('message', (event) => {
      if (event.data?.clientId === this.clientId) return;
      this.state = this.loadState();
      this.queue = this.loadQueue();
      this.emit('remote-tab-update');
    });

    globalThis.addEventListener('storage', (event) => {
      if ([STORAGE_KEY, QUEUE_KEY].includes(event.key)) {
        this.state = this.loadState();
        this.queue = this.loadQueue();
        this.emit('remote-tab-update');
      }
    });

    globalThis.addEventListener('online', () => this.reconnect());
    globalThis.addEventListener('offline', () => {
      this.remoteReady = false;
      this.emit('sync-status');
    });
  }

  safeGet(key) { try { return localStorage.getItem(key); } catch { return null; } }
  safeSet(key, value) { try { localStorage.setItem(key, value); } catch { /* stockage privé indisponible */ } }
  safeRemove(key) { try { localStorage.removeItem(key); } catch { /* rien */ } }

  loadState() {
    try { return normalizeState(JSON.parse(this.safeGet(STORAGE_KEY) || 'null')); }
    catch { return createSeed(); }
  }

  saveState(reason = 'update') {
    this.safeSet(STORAGE_KEY, JSON.stringify(this.state));
    this.channel?.postMessage({ reason, clientId: this.clientId, at: Date.now() });
    this.emit(reason);
  }

  loadQueue() {
    try {
      const value = JSON.parse(this.safeGet(QUEUE_KEY) || '[]');
      return Array.isArray(value) ? value : [];
    } catch { return []; }
  }

  saveQueue() {
    this.safeSet(QUEUE_KEY, JSON.stringify(this.queue));
    this.channel?.postMessage({ reason: 'queue', clientId: this.clientId, at: Date.now() });
  }

  getPendingOnboarding() {
    try { return JSON.parse(this.safeGet(PENDING_ONBOARDING_KEY) || 'null'); }
    catch { return null; }
  }

  setPendingOnboarding(value) {
    if (value) this.safeSet(PENDING_ONBOARDING_KEY, JSON.stringify(value));
    else this.safeRemove(PENDING_ONBOARDING_KEY);
  }

  emit(reason, extra = {}) {
    this.dispatchEvent(new CustomEvent('change', { detail: { reason, ...extra } }));
  }

  getState() { return structuredClone(this.state); }
  getCurrentUser() { return this.currentUser ? structuredClone(this.currentUser) : null; }
  getAuthStatus() {
    return {
      configured: this.configured,
      authenticated: this.authenticated,
      needsFamily: this.needsFamily,
      recoveryMode: this.recoveryMode,
      offlineSession: this.offlineSession,
      user: this.getCurrentUser()
    };
  }
  isRemoteReady() { return this.remoteReady; }
  hasPendingChanges() { return this.queue.length > 0; }

  async init() {
    if (!this.configured) {
      this.emit('auth-status');
      return this.getAuthStatus();
    }

    this.supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') this.recoveryMode = true;
      if (event === 'SIGNED_OUT') {
        this.clearAuthenticatedState();
        this.emit('auth-status');
      }
      if (['SIGNED_IN', 'TOKEN_REFRESHED', 'USER_UPDATED'].includes(event) && session) {
        queueMicrotask(() => this.handleSession(session, event).catch((error) => this.emit('auth-status', { error })));
      }
    });

    try {
      const { data, error } = await this.supabase.auth.getSession();
      if (error) throw error;
      if (data.session) await this.handleSession(data.session, 'INITIAL_SESSION');
      else this.clearAuthenticatedState();
    } catch (error) {
      this.remoteReady = false;
      const cachedSession = this.safeGet('sb-offline-session-seen');
      this.offlineSession = Boolean(cachedSession && this.state.family?.id);
      this.authenticated = this.offlineSession;
      if (this.offlineSession) {
        this.currentUser = JSON.parse(cachedSession);
      }
      this.emit('auth-status', { error });
    }
    return this.getAuthStatus();
  }

  async handleSession(session, reason = 'SIGNED_IN') {
    const token = session?.access_token || session?.user?.id;
    if (this.sessionTask && this.sessionTaskToken === token) return this.sessionTask;
    this.sessionTaskToken = token;
    this.sessionTask = this.processSession(session, reason);
    try {
      return await this.sessionTask;
    } finally {
      if (this.sessionTaskToken === token) {
        this.sessionTask = null;
        this.sessionTaskToken = null;
      }
    }
  }

  async processSession(session, reason = 'SIGNED_IN') {
    this.session = session;
    this.authenticated = true;
    this.offlineSession = false;
    const metadataName = session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Membre';
    this.currentUser = { id: session.user.id, email: session.user.email, displayName: metadataName, role: 'member' };
    this.safeSet('sb-offline-session-seen', JSON.stringify(this.currentUser));

    await this.completePendingOnboarding();
    await this.pullRemote();
    if (!this.needsFamily) {
      this.openRealtime();
      await this.flushQueue();
    }
    this.emit('auth-status', { authEvent: reason });
  }

  clearAuthenticatedState() {
    this.session = null;
    this.authenticated = false;
    this.currentUser = null;
    this.needsFamily = false;
    this.offlineSession = false;
    this.remoteReady = false;
    this.closeRealtime();
    this.safeRemove('sb-offline-session-seen');
  }

  async setup({ displayName, familyName, familySymbol, email, password }) {
    this.setPendingOnboarding({ mode: 'create', displayName: displayName || 'Nacer', familyName: familyName || 'Famille Hamadi', familySymbol: familySymbol || '🌿' });
    const { data, error } = await this.supabase.auth.signUp({
      email: String(email || '').trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName || 'Nacer' }, emailRedirectTo: appBaseUrl() }
    });
    if (error) throw error;
    if (data.session) await this.handleSession(data.session, 'SIGNED_IN');
    return { confirmationRequired: !data.session };
  }

  async login({ email, password }) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email: String(email || '').trim().toLowerCase(),
      password
    });
    if (error) throw error;
    await this.handleSession(data.session, 'SIGNED_IN');
    return { user: this.currentUser };
  }

  stageJoin(code, displayName = 'Romane') {
    this.setPendingOnboarding({ mode: 'join', code: String(code || '').trim().toUpperCase(), displayName });
  }

  async createFamilyForCurrentAccount(displayName = 'Nacer', familyName = 'Famille Hamadi', familySymbol = '🌿') {
    this.setPendingOnboarding({ mode: 'create', displayName, familyName, familySymbol });
    await this.completePendingOnboarding();
    await this.pullRemote();
    this.openRealtime();
    this.emit('auth-status');
  }

  async acceptInvite({ token, displayName, email, password }) {
    const code = String(token || '').trim().toUpperCase();
    this.setPendingOnboarding({ mode: 'join', code, displayName: displayName || 'Romane' });
    const { data, error } = await this.supabase.auth.signUp({
      email: String(email || '').trim().toLowerCase(),
      password,
      options: { data: { display_name: displayName || 'Romane' }, emailRedirectTo: appBaseUrl() }
    });
    if (error) throw error;
    if (data.session) await this.handleSession(data.session, 'SIGNED_IN');
    return { confirmationRequired: !data.session };
  }

  async completePendingOnboarding() {
    const pending = this.getPendingOnboarding();
    if (!pending || !this.session) return;
    const functionName = pending.mode === 'join' ? 'join_agenda_family' : 'create_agenda_family';
    const args = pending.mode === 'join'
      ? { p_code: pending.code, p_display_name: pending.displayName || 'Romane' }
      : { p_display_name: pending.displayName || 'Nacer' };
    const { error } = await this.supabase.rpc(functionName, args);
    if (error) {
      if (!/déjà|already|membership/i.test(error.message || '')) throw error;
    }
    if (pending.mode === 'create' && (pending.familyName || pending.familySymbol)) {
      const { error: identityError } = await this.supabase.rpc('update_family_identity', {
        p_name: pending.familyName || 'Famille Hamadi',
        p_symbol: pending.familySymbol || '🌿'
      });
      if (identityError) throw identityError;
    }
    this.setPendingOnboarding(null);
  }

  async joinExistingAccount(code, displayName = 'Romane') {
    this.setPendingOnboarding({ mode: 'join', code: String(code).trim().toUpperCase(), displayName });
    await this.completePendingOnboarding();
    await this.pullRemote();
    this.openRealtime();
    this.emit('auth-status');
  }

  async logout() {
    this.closeRealtime();
    await this.supabase.auth.signOut();
    this.clearAuthenticatedState();
    this.emit('auth-status');
  }

  async requestPasswordReset(email) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(String(email || '').trim().toLowerCase(), {
      redirectTo: `${appBaseUrl()}?recovery=1`
    });
    if (error) throw error;
  }

  async updatePassword(password) {
    const { error } = await this.supabase.auth.updateUser({ password });
    if (error) throw error;
    this.recoveryMode = false;
    history.replaceState({}, '', location.pathname);
    this.emit('auth-status');
  }

  async pullRemote() {
    if (!this.supabase || !this.session || !navigator.onLine) {
      this.remoteReady = false;
      return;
    }

    const userId = this.session.user.id;
    const [profileResult, membershipResult] = await Promise.all([
      this.supabase.from('profiles').select('display_name, avatar_url').eq('id', userId).maybeSingle(),
      this.supabase.from('family_users').select('family_id, role').eq('user_id', userId).maybeSingle()
    ]);
    if (profileResult.error) throw profileResult.error;
    if (membershipResult.error) throw membershipResult.error;

    if (!membershipResult.data) {
      this.needsFamily = true;
      this.remoteReady = true;
      this.currentUser = {
        id: userId,
        email: this.session.user.email,
        displayName: profileResult.data?.display_name || this.currentUser?.displayName || 'Membre',
        avatarUrl: profileResult.data?.avatar_url || null,
        role: 'member'
      };
      return;
    }

    const familyId = membershipResult.data.family_id;
    const [familyResult, membersResult, eventsResult, tasksResult, notificationPreferencesResult] = await Promise.all([
      this.supabase.from('families').select('id, name, symbol, photo_url, quiet_mode, invite_expires_at').eq('id', familyId).single(),
      this.supabase.from('members').select('*').eq('family_id', familyId).order('sort_order'),
      this.supabase.from('events').select('*').eq('family_id', familyId).order('event_date').order('event_time'),
      this.supabase.from('tasks').select('*').eq('family_id', familyId).order('due_date').order('due_time'),
      this.supabase.from('notification_preferences').select('*').eq('user_id', userId).maybeSingle()
    ]);
    for (const result of [familyResult, membersResult, eventsResult, tasksResult, notificationPreferencesResult]) if (result.error) throw result.error;

    this.needsFamily = false;
    this.currentUser = {
      id: userId,
      email: this.session.user.email,
      displayName: profileResult.data?.display_name || this.currentUser?.displayName || 'Membre',
      avatarUrl: profileResult.data?.avatar_url || null,
      role: membershipResult.data.role
    };
    this.safeSet('sb-offline-session-seen', JSON.stringify(this.currentUser));
    this.state = {
      version: DATA_VERSION,
      family: { id: familyResult.data.id, name: familyResult.data.name, symbol: familyResult.data.symbol || '🌿', photoUrl: familyResult.data.photo_url || null, inviteExpiresAt: familyResult.data.invite_expires_at },
      settings: { quietMode: Boolean(familyResult.data.quiet_mode) },
      members: membersResult.data.map(mapMember),
      events: eventsResult.data.map(mapEvent),
      tasks: tasksResult.data.map(mapTask),
      notificationPreferences: mapNotificationPreferences(notificationPreferencesResult.data),
      syncedAt: new Date().toISOString()
    };
    this.remoteReady = true;
    this.saveState('remote-pull');
  }

  openRealtime() {
    const familyId = this.state.family?.id;
    if (!familyId || !this.supabase) return;
    this.closeRealtime();
    const schedulePull = () => {
      clearTimeout(this.pullTimer);
      this.pullTimer = setTimeout(() => this.pullRemote().catch((error) => this.emit('sync-error', { error })), 180);
    };
    this.realtimeChannel = this.supabase
      .channel(`agenda-family-${familyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, schedulePull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tasks' }, schedulePull)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'members' }, schedulePull)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'families' }, schedulePull)
      .subscribe((status) => {
        this.remoteReady = status === 'SUBSCRIBED';
        this.emit('sync-status');
      });
  }

  closeRealtime() {
    clearTimeout(this.pullTimer);
    if (this.realtimeChannel && this.supabase) this.supabase.removeChannel(this.realtimeChannel);
    this.realtimeChannel = null;
  }

  enqueue(type, payload) {
    const operation = { id: uid(), type, payload, createdAt: new Date().toISOString() };
    this.queue.push(operation);
    this.saveQueue();
    this.flushQueue().catch(() => undefined);
    return operation;
  }

  addEvent(event) {
    const item = { ...event, id: event.id || uid(), familyId: this.state.family.id, updatedAt: new Date().toISOString() };
    this.state.events.push(item);
    this.saveState('event-added');
    this.enqueue('upsert_event', item);
    return item;
  }

  addEvents(events) {
    const items = events.map((event) => ({ ...event, id: event.id || uid(), familyId: this.state.family.id, updatedAt: new Date().toISOString() }));
    this.state.events.push(...items);
    this.saveState('events-added');
    this.enqueue('upsert_events', items);
    return items;
  }

  deleteSeries(seriesId) {
    if (!seriesId) return;
    this.state.events = this.state.events.filter((event) => event.seriesId !== seriesId);
    this.saveState('series-deleted');
    this.enqueue('delete_series', { seriesId });
  }

  updateEvent(id, changes) {
    const index = this.state.events.findIndex((event) => event.id === id);
    if (index < 0) return null;
    this.state.events[index] = { ...this.state.events[index], ...changes, id, updatedAt: new Date().toISOString() };
    this.saveState('event-updated');
    this.enqueue('upsert_event', this.state.events[index]);
    return this.state.events[index];
  }

  deleteEvent(id) {
    this.state.events = this.state.events.filter((event) => event.id !== id);
    this.saveState('event-deleted');
    this.enqueue('delete_event', { id });
  }

  addTask(task) {
    const item = { ...task, id: task.id || uid(), familyId: this.state.family.id, status: task.status || 'pending', completedAt: null, updatedAt: new Date().toISOString() };
    this.state.tasks.push(item);
    this.saveState('task-added');
    this.enqueue('upsert_task', item);
    return item;
  }

  updateTask(id, changes) {
    const index = this.state.tasks.findIndex((task) => task.id === id);
    if (index < 0) return null;
    this.state.tasks[index] = { ...this.state.tasks[index], ...changes, id, updatedAt: new Date().toISOString() };
    this.saveState('task-updated');
    this.enqueue('upsert_task', this.state.tasks[index]);
    return this.state.tasks[index];
  }

  toggleTask(id, done) {
    return this.updateTask(id, { status: done ? 'done' : 'pending', completedAt: done ? new Date().toISOString() : null });
  }

  deleteTask(id) {
    this.state.tasks = this.state.tasks.filter((task) => task.id !== id);
    this.saveState('task-deleted');
    this.enqueue('delete_task', { id });
  }

  setSetting(key, value) {
    if (key !== 'quietMode') return;
    this.state.settings.quietMode = Boolean(value);
    this.saveState('setting-updated');
    this.enqueue('update_family', { quietMode: Boolean(value) });
  }

  reset() {
    this.state.events = [];
    this.state.tasks = [];
    this.saveState('reset');
    this.enqueue('reset_family_content', {});
  }

  async createInvitation() {
    const { data, error } = await this.supabase.rpc('rotate_family_invite');
    if (error) throw error;
    const code = typeof data === 'string' ? data : data?.code;
    return {
      token: code,
      link: `${appBaseUrl()}?join=${encodeURIComponent(code)}`,
      expiresAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString()
    };
  }

  async updateProfilePhoto(avatarUrl) {
    if (!this.supabase || !this.session?.user?.id) throw new Error('Session indisponible.');
    if (!navigator.onLine) throw new Error('Une connexion Internet est nécessaire pour changer la photo.');
    const normalized = avatarUrl || null;
    const { error } = await this.supabase.rpc('update_my_avatar', { p_avatar_url: normalized });
    if (error) throw error;
    await this.pullRemote();
    this.emit('profile-updated');
  }

  async updateFamilyIdentity({ name, symbol }) {
    if (!navigator.onLine) throw new Error('Une connexion Internet est nécessaire.');
    const { error } = await this.supabase.rpc('update_family_identity', { p_name: String(name || '').trim(), p_symbol: String(symbol || '').trim() || '🌿' });
    if (error) throw error;
    await this.pullRemote();
    this.emit('family-identity-updated');
  }

  async updateFamilyPhoto(photoUrl) {
    if (!navigator.onLine) throw new Error('Une connexion Internet est nécessaire.');
    const normalized = photoUrl || null;
    const { error } = await this.supabase.rpc('update_family_photo', { p_photo_url: normalized });
    if (error) throw error;
    await this.pullRemote();
    this.emit('family-photo-updated');
  }

  async updateMemberPresentation(memberId, { nickname = '', color, avatarUrl, birthday = '' }) {
    if (!navigator.onLine) throw new Error('Une connexion Internet est nécessaire.');
    const { error } = await this.supabase.rpc('update_member_presentation', {
      p_member_id: memberId,
      p_nickname: String(nickname || '').trim() || null,
      p_color: color || null,
      p_avatar_url: avatarUrl === undefined ? null : avatarUrl,
      p_birthday: birthday || null
    });
    if (error) throw error;
    await this.pullRemote();
    this.emit('member-updated');
  }

  async saveNotificationPreferences(preferences) {
    if (!this.session?.user?.id || !this.state.family?.id) throw new Error('Session familiale indisponible.');
    if (!navigator.onLine) throw new Error('Une connexion Internet est nécessaire pour enregistrer les notifications.');
    const row = {
      user_id: this.session.user.id,
      family_id: this.state.family.id,
      push_enabled: preferences.pushEnabled === undefined
        ? Boolean(this.state.notificationPreferences?.pushEnabled)
        : Boolean(preferences.pushEnabled),
      event_reminders: preferences.eventReminders !== false,
      task_reminders: preferences.taskReminders !== false,
      daily_summary: preferences.dailySummary !== false,
      daily_summary_time: preferences.dailySummaryTime || '07:30'
    };
    const { error } = await this.supabase.from('notification_preferences').upsert(row, { onConflict: 'user_id' });
    if (error) throw error;
    this.state.notificationPreferences = mapNotificationPreferences(row);
    this.saveState('notification-preferences-updated');
    return this.state.notificationPreferences;
  }

  async savePushSubscription(subscription) {
    if (!this.session?.user?.id || !this.state.family?.id) throw new Error('Session familiale indisponible.');
    if (!navigator.onLine) throw new Error('Une connexion Internet est nécessaire.');
    const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : subscription;
    const row = {
      user_id: this.session.user.id,
      family_id: this.state.family.id,
      endpoint: json.endpoint,
      p256dh: json.keys?.p256dh,
      auth: json.keys?.auth,
      user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 500) : null,
      updated_at: new Date().toISOString()
    };
    if (!row.endpoint || !row.p256dh || !row.auth) throw new Error('Abonnement push invalide.');
    const { error } = await this.supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' });
    if (error) throw error;
    await this.saveNotificationPreferences({ ...this.state.notificationPreferences, pushEnabled: true });
  }

  async removePushSubscription(endpoint) {
    if (!endpoint || !this.session?.user?.id || !navigator.onLine) return;
    const userId = this.session.user.id;
    const { error } = await this.supabase.from('push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', userId);
    if (error) throw error;
    const { data: remaining, error: remainingError } = await this.supabase
      .from('push_subscriptions')
      .select('id')
      .eq('user_id', userId)
      .eq('enabled', true)
      .limit(1);
    if (remainingError) throw remainingError;
    await this.saveNotificationPreferences({
      ...this.state.notificationPreferences,
      pushEnabled: Boolean(remaining?.length)
    });
  }

  exportData() {
    const payload = {
      exportedAt: new Date().toISOString(),
      family: this.state.family,
      members: this.state.members,
      events: this.state.events,
      tasks: this.state.tasks,
      notificationPreferences: this.state.notificationPreferences,
      settings: this.state.settings
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `agenda-famille-${toISO(new Date())}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async executeOperation(operation) {
    const familyId = this.state.family?.id;
    const userId = this.session?.user?.id;
    if (!familyId || !userId) throw new Error('Session familiale indisponible.');
    let result;
    switch (operation.type) {
      case 'upsert_event':
        result = await this.supabase.from('events').upsert(eventToRow(operation.payload, familyId, userId));
        break;
      case 'upsert_events':
        result = await this.supabase.from('events').upsert(operation.payload.map((event) => eventToRow(event, familyId, userId)));
        break;
      case 'delete_event':
        result = await this.supabase.from('events').delete().eq('id', operation.payload.id).eq('family_id', familyId);
        break;
      case 'delete_series':
        result = await this.supabase.from('events').delete().eq('series_id', operation.payload.seriesId).eq('family_id', familyId);
        break;
      case 'upsert_task':
        result = await this.supabase.from('tasks').upsert(taskToRow(operation.payload, familyId, userId));
        break;
      case 'delete_task':
        result = await this.supabase.from('tasks').delete().eq('id', operation.payload.id).eq('family_id', familyId);
        break;
      case 'update_family':
        result = await this.supabase.from('families').update({ quiet_mode: Boolean(operation.payload.quietMode) }).eq('id', familyId);
        break;
      case 'reset_family_content':
        {
          const [eventsResult, tasksResult] = await Promise.all([
            this.supabase.from('events').delete().eq('family_id', familyId),
            this.supabase.from('tasks').delete().eq('family_id', familyId)
          ]);
          result = eventsResult.error ? eventsResult : tasksResult;
        }
        break;
      default:
        throw new Error(`Opération inconnue : ${operation.type}`);
    }
    if (result.error) throw result.error;
  }

  async flushQueue() {
    if (this.flushing || !navigator.onLine || !this.session || !this.state.family?.id) return;
    this.flushing = true;
    this.emit('sync-status');
    try {
      while (this.queue.length) {
        const operation = this.queue[0];
        try {
          await this.executeOperation(operation);
          this.queue.shift();
          this.saveQueue();
        } catch (error) {
          const unrecoverable = /permission|policy|invalid|violates|not found|JWT/i.test(error.message || '');
          if (unrecoverable) {
            this.queue.shift();
            this.saveQueue();
            this.emit('operation-rejected', { error, operation });
            continue;
          }
          throw error;
        }
      }
      await this.pullRemote();
    } finally {
      this.flushing = false;
      this.emit('sync-status');
    }
  }

  async reconnect() {
    if (!this.authenticated || !this.supabase) return;
    try {
      const { data } = await this.supabase.auth.getSession();
      if (data.session) {
        this.session = data.session;
        await this.pullRemote();
        this.openRealtime();
        await this.flushQueue();
      }
    } catch (error) {
      this.remoteReady = false;
      this.emit('sync-error', { error });
    }
  }
}

export const store = new AgendaStore();
