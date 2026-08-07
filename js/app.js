import { store, CATEGORY_META, toISO, addDays } from './store.js?v=4.2.1';
import { VAPID_PUBLIC_KEY } from './push-config.js?v=4.2.1';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const state = {
  activeView: 'home',
  activeMember: 'all',
  selectedDate: toISO(new Date()),
  weekAnchor: startOfWeek(new Date()),
  agendaMode: 'flow',
  taskFilter: 'today',
  shoppingFilter: 'open',
  routineFilter: 'today',
  searchFilter: 'all',
  deepLinkEvent: new URLSearchParams(location.search).get('event') || '',
  deepLinkTask: new URLSearchParams(location.search).get('task') || '',
  notificationAction: new URLSearchParams(location.search).get('notificationAction') || '',
  notificationEntityType: new URLSearchParams(location.search).get('entityType') || '',
  notificationEntityId: new URLSearchParams(location.search).get('entityId') || '',
  notificationMinutes: Number(new URLSearchParams(location.search).get('minutes') || 30),
  deferredInstallPrompt: null,
  authMode: 'login'
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const weekdayNarrow = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const longDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const SHOPPING_CATEGORY_META = {
  fresh: { label: 'Frais', icon: '🍎' },
  grocery: { label: 'Épicerie', icon: '🥫' },
  household: { label: 'Maison', icon: '🧽' },
  hygiene: { label: 'Hygiène', icon: '🧴' },
  other: { label: 'Autre', icon: '🛍️' }
};
const WEEKDAY_LABELS = { 1: 'Lun', 2: 'Mar', 3: 'Mer', 4: 'Jeu', 5: 'Ven', 6: 'Sam', 7: 'Dim' };

function parseISO(value) {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function startOfWeek(date) {
  const copy = new Date(date);
  const day = copy.getDay() || 7;
  copy.setDate(copy.getDate() - day + 1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function startOfMonth(date) {
  const copy = new Date(date);
  copy.setDate(1);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function sameDay(a, b) { return toISO(a) === toISO(b); }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function timeToMinutes(time) { const [h, m] = time.split(':').map(Number); return h * 60 + m; }
function formatDuration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
}
function vibration() { navigator.vibrate?.(8); }
function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}
function initialsFor(value = '') {
  return String(value).trim().split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase() || 'FA';
}
function renderAvatar(entity, { className = 'avatar', title = '', fallback = '' } = {}) {
  if (!entity) return `<span class="${className}">${escapeHTML(fallback || '??')}</span>`;
  const label = entity.nickname || entity.name || entity.displayName || '';
  const attrTitle = title || label ? ` title="${escapeHTML(title || label)}"` : '';
  const style = entity.color ? ` style="--avatar:${entity.color}"` : '';
  const initials = entity.initials || initialsFor(label);
  if (entity.avatarUrl) return `<span class="${className} has-photo"${style}${attrTitle}><img src="${escapeHTML(entity.avatarUrl)}" alt="${escapeHTML(label ? `Photo de ${label}` : 'Photo de profil')}"></span>`;
  return `<span class="${className}"${style}${attrTitle}>${escapeHTML(initials)}</span>`;
}
function nextUpcomingEvent(data, memberId = state.activeMember) {
  const now = new Date();
  return filteredEvents(data, memberId)
    .map((event) => ({ ...event, startsAt: new Date(`${event.date}T${event.time}:00`) }))
    .filter((event) => event.startsAt >= now)
    .sort((a, b) => a.startsAt - b.startsAt)[0] || null;
}
function filteredEvents(data, memberId = state.activeMember) {
  return data.events.filter((event) => memberId === 'all' || event.memberIds.includes(memberId));
}
function eventsForDate(data, date, memberId = state.activeMember) {
  return filteredEvents(data, memberId).filter((event) => event.date === date).sort((a, b) => a.time.localeCompare(b.time));
}
function memberById(data, id) { return data.members.find((member) => member.id === id); }
function memberDisplayName(member) { return member?.nickname || member?.name || 'Membre'; }
function familyDisplayName(data) { return data.family?.name || 'La famille'; }
function taskResponsible(data, task) { return task.responsibleMemberId ? memberById(data, task.responsibleMemberId) : null; }
function tasksForMember(data, memberId = state.activeMember) {
  return (data.tasks || []).filter((task) => memberId === 'all' || !task.responsibleMemberId || task.responsibleMemberId === memberId);
}
function taskDueLabel(task) {
  const today = toISO(new Date());
  if (task.dueDate < today) return `En retard${task.dueTime ? ` · ${task.dueTime}` : ''}`;
  if (task.dueDate === today) return task.dueTime ? `Aujourd’hui · ${task.dueTime}` : 'Aujourd’hui';
  const date = parseISO(task.dueDate);
  return `${capitalize(shortWeekday.format(date).replace('.', ''))} ${date.getDate()}${task.dueTime ? ` · ${task.dueTime}` : ''}`;
}
function weekdayNumber(date = new Date()) { const day = date.getDay(); return day === 0 ? 7 : day; }
function routineIsScheduled(routine, date = new Date()) { return routine.active !== false && Array.isArray(routine.weekdays) && routine.weekdays.includes(weekdayNumber(date)); }
function routineIsCompleted(data, routineId, iso = toISO(new Date())) { return (data.routineCompletions || []).some((item) => item.routineId === routineId && item.date === iso); }
function routineResponsible(data, routine) { return routine.responsibleMemberId ? memberById(data, routine.responsibleMemberId) : null; }
function shoppingOpenItems(data) { return (data.shoppingItems || []).filter((item) => !item.checked); }
function shoppingCategory(item) { return SHOPPING_CATEGORY_META[item.category] || SHOPPING_CATEGORY_META.other; }

function memberForUserId(data, userId) {
  return data.members.find((member) => member.linkedUserId === userId) || null;
}
function userDisplayName(data, userId) {
  const member = memberForUserId(data, userId);
  if (member) return memberDisplayName(member);
  const current = store.getCurrentUser();
  if (current?.id === userId) return current.displayName || 'Membre';
  return 'Membre';
}
function contentItems(data, parentType, parentId) {
  return {
    comments: (data.comments || []).filter((item) => item.parentType === parentType && item.parentId === parentId),
    reactions: (data.reactions || []).filter((item) => item.parentType === parentType && item.parentId === parentId),
    reads: (data.reads || []).filter((item) => item.parentType === parentType && item.parentId === parentId),
    attachments: (data.attachments || []).filter((item) => item.parentType === parentType && item.parentId === parentId),
    activity: (data.activity || []).filter((item) => item.entityType === parentType && item.entityId === parentId)
  };
}
function collaborationSummary(data, parentType, parentId) {
  const items = contentItems(data, parentType, parentId);
  const reactionCount = items.reactions.length;
  return { comments: items.comments.length, attachments: items.attachments.length, reads: new Set(items.reads.map((item) => item.userId)).size, reactions: reactionCount };
}
function formatFileSize(bytes = 0) {
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} Mo`;
}
function formatActivityTime(value) {
  const date = new Date(value);
  const today = new Date();
  if (toISO(date) === toISO(today)) return `Aujourd’hui · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
}

function birthdayMembersForDate(data, iso) {
  const md = iso.slice(5);
  return data.members.filter((member) => member.birthday && member.birthday.slice(5) === md);
}
function formatBirthday(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(parseISO(value));
}
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Belle journée';
  return 'Bonsoir';
}

const APP_VERSION = '4.2.1';
const VERSION_SEEN_KEY = 'agenda-version-seen';
let temporalTimer = 0;
let previousOnlineState = navigator.onLine;
const SMART_CONTEXT_KEY = 'agenda-smart-context-v42';
const WEATHER_ENABLED_KEY = 'agenda-weather-enabled-v42';
const WEATHER_CACHE_KEY = 'agenda-weather-cache-v42';
let weatherRefreshTimer = 0;

function smartContextEnabled() { return localStorage.getItem(SMART_CONTEXT_KEY) !== 'off'; }
function weatherEnabled() { return localStorage.getItem(WEATHER_ENABLED_KEY) === 'on'; }
function setSmartContextEnabled(enabled) { localStorage.setItem(SMART_CONTEXT_KEY, enabled ? 'on' : 'off'); render(); }
function setWeatherEnabled(enabled) { localStorage.setItem(WEATHER_ENABLED_KEY, enabled ? 'on' : 'off'); }

function seasonFor(date = new Date()) {
  const month = date.getMonth() + 1;
  if ([12,1,2].includes(month)) return 'winter';
  if ([3,4,5].includes(month)) return 'spring';
  if ([6,7,8].includes(month)) return 'summer';
  return 'autumn';
}
function seasonLabel(season) { return ({ winter:'Hiver', spring:'Printemps', summer:'Été', autumn:'Automne' })[season] || ''; }
function isWeekendMoment(date = new Date()) { return date.getDay() === 0 || date.getDay() === 6 || (date.getDay() === 5 && date.getHours() >= 17); }

function weatherDescriptor(code) {
  const value = Number(code);
  if (value === 0) return { icon:'☀️', label:'Ciel clair', kind:'sun' };
  if ([1,2].includes(value)) return { icon:'🌤️', label:'Éclaircies', kind:'sun' };
  if (value === 3) return { icon:'☁️', label:'Couvert', kind:'cloud' };
  if ([45,48].includes(value)) return { icon:'🌫️', label:'Brume', kind:'cloud' };
  if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return { icon:'🌧️', label:'Pluie', kind:'rain' };
  if ((value >= 71 && value <= 77) || (value >= 85 && value <= 86)) return { icon:'❄️', label:'Neige', kind:'snow' };
  if (value >= 95) return { icon:'⛈️', label:'Orage', kind:'storm' };
  return { icon:'🌤️', label:'Météo', kind:'neutral' };
}
function cachedWeather() {
  try {
    const parsed = JSON.parse(localStorage.getItem(WEATHER_CACHE_KEY) || 'null');
    if (!parsed || !Number.isFinite(parsed.temperature) || !Number.isFinite(parsed.code)) return null;
    return parsed;
  } catch { return null; }
}
async function refreshWeather({ requestPermission = false } = {}) {
  if (!weatherEnabled() || !navigator.geolocation || !navigator.onLine) return null;
  const cached = cachedWeather();
  if (!requestPermission && cached && Date.now() - Number(cached.at || 0) < 30 * 60 * 1000) return cached;
  const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy:false, timeout:9000, maximumAge:30*60*1000 }));
  const { latitude, longitude } = position.coords;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(latitude));
  url.searchParams.set('longitude', String(longitude));
  url.searchParams.set('current', 'temperature_2m,weather_code,is_day');
  url.searchParams.set('timezone', 'auto');
  const response = await fetch(url);
  if (!response.ok) throw new Error('Météo indisponible');
  const payload = await response.json();
  const weather = { temperature:Number(payload.current?.temperature_2m), code:Number(payload.current?.weather_code), isDay:Number(payload.current?.is_day), at:Date.now() };
  if (!Number.isFinite(weather.temperature) || !Number.isFinite(weather.code)) throw new Error('Météo indisponible');
  localStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify(weather));
  renderContextualHome(store.getState());
  return weather;
}

function eventTiming(event) {
  const start = new Date(`${event.date}T${event.allDay ? '00:00' : event.time}:00`);
  const duration = event.allDay ? 24 * 60 : Math.max(1, Number(event.duration || 60));
  return { start, end: new Date(start.getTime() + duration * 60000) };
}

function currentDayPhase(date = new Date()) {
  const hour = date.getHours();
  if (hour < 7) return 'night';
  if (hour < 12) return 'morning';
  if (hour < 18) return 'day';
  if (hour < 22) return 'evening';
  return 'night';
}

const AMBIENT_KEYFRAMES = [
  { minute: 0,    warm:[128,111,92], cool:[34,74,84],  wash:[20,45,49],   warmA:.035, coolA:.105, washA:.035, x:76, y:10, cx:10, cy:72, stars:.34 },
  { minute: 390,  warm:[224,177,103],cool:[66,118,116], wash:[246,238,216],warmA:.145, coolA:.070, washA:.035, x:18, y:22, cx:84, cy:74, stars:.05 },
  { minute: 510,  warm:[226,191,126],cool:[74,129,124], wash:[255,248,228],warmA:.125, coolA:.065, washA:.050, x:34, y:12, cx:79, cy:68, stars:0 },
  { minute: 750,  warm:[239,216,164],cool:[64,125,132], wash:[255,250,237],warmA:.100, coolA:.055, washA:.045, x:57, y:7,  cx:14, cy:68, stars:0 },
  { minute: 1020, warm:[228,184,112],cool:[58,110,116], wash:[250,238,216],warmA:.120, coolA:.065, washA:.038, x:76, y:13, cx:10, cy:70, stars:0 },
  { minute: 1170, warm:[211,143,79], cool:[45,88,98],   wash:[244,222,190],warmA:.185, coolA:.095, washA:.048, x:87, y:22, cx:9,  cy:66, stars:.025 },
  { minute: 1320, warm:[154,119,82], cool:[36,73,84],   wash:[29,53,57],   warmA:.065, coolA:.120, washA:.035, x:84, y:11, cx:12, cy:72, stars:.22 },
  { minute: 1440, warm:[128,111,92], cool:[34,74,84],   wash:[20,45,49],   warmA:.035, coolA:.105, washA:.035, x:76, y:10, cx:10, cy:72, stars:.34 }
];

function lerp(a, b, t) { return a + (b - a) * t; }
function lerpRGB(a, b, t) { return a.map((value, index) => Math.round(lerp(value, b[index], t))); }
function ambientStateFor(date = new Date()) {
  const minute = date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
  let left = AMBIENT_KEYFRAMES[0];
  let right = AMBIENT_KEYFRAMES[AMBIENT_KEYFRAMES.length - 1];
  for (let index = 0; index < AMBIENT_KEYFRAMES.length - 1; index += 1) {
    const a = AMBIENT_KEYFRAMES[index];
    const b = AMBIENT_KEYFRAMES[index + 1];
    if (minute >= a.minute && minute <= b.minute) { left = a; right = b; break; }
  }
  const span = Math.max(1, right.minute - left.minute);
  const raw = Math.min(1, Math.max(0, (minute - left.minute) / span));
  const t = raw * raw * (3 - 2 * raw);
  return {
    warm: lerpRGB(left.warm, right.warm, t), cool: lerpRGB(left.cool, right.cool, t), wash: lerpRGB(left.wash, right.wash, t),
    warmA: lerp(left.warmA, right.warmA, t), coolA: lerp(left.coolA, right.coolA, t), washA: lerp(left.washA, right.washA, t),
    x: lerp(left.x, right.x, t), y: lerp(left.y, right.y, t), cx: lerp(left.cx, right.cx, t), cy: lerp(left.cy, right.cy, t),
    stars: lerp(left.stars, right.stars, t), progress: Math.min(1, Math.max(0, minute / 1440))
  };
}

function applyDynamicAmbience(date = new Date()) {
  const root = document.documentElement;
  const ambient = ambientStateFor(date);
  root.dataset.dayPhase = currentDayPhase(date);
  root.dataset.season = seasonFor(date);
  root.dataset.weekend = isWeekendMoment(date) ? 'true' : 'false';
  root.style.setProperty('--ambient-warm-rgb', ambient.warm.join(','));
  root.style.setProperty('--ambient-cool-rgb', ambient.cool.join(','));
  root.style.setProperty('--ambient-wash-rgb', ambient.wash.join(','));
  root.style.setProperty('--ambient-warm-a', ambient.warmA.toFixed(3));
  root.style.setProperty('--ambient-cool-a', ambient.coolA.toFixed(3));
  root.style.setProperty('--ambient-wash-a', ambient.washA.toFixed(3));
  root.style.setProperty('--ambient-sun-x', `${ambient.x.toFixed(1)}%`);
  root.style.setProperty('--ambient-sun-y', `${ambient.y.toFixed(1)}%`);
  root.style.setProperty('--ambient-cool-x', `${ambient.cx.toFixed(1)}%`);
  root.style.setProperty('--ambient-cool-y', `${ambient.cy.toFixed(1)}%`);
  root.style.setProperty('--ambient-stars', ambient.stars.toFixed(3));
  root.style.setProperty('--day-progress', `${(ambient.progress * 100).toFixed(2)}%`);
}

function relativeMomentLabel(minutes) {
  if (minutes <= 0) return 'Maintenant';
  if (minutes < 60) return `Dans ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `Dans ${hours} h ${rest}` : `Dans ${hours} h`;
}

function liveMomentFor(data = store.getState()) {
  const now = new Date();
  const today = toISO(now);
  const events = eventsForDate(data, today).map((event) => ({ event, ...eventTiming(event) }));
  const inProgress = events
    .filter(({ event, start, end }) => !event.allDay && start <= now && end > now)
    .sort((a, b) => a.end - b.end)[0];
  if (inProgress) {
    const minutesLeft = Math.max(1, Math.ceil((inProgress.end - now) / 60000));
    return { type: 'active', event: inProgress.event, kicker: 'En cours', title: inProgress.event.title, meta: `${minutesLeft} min restantes` };
  }
  const upcoming = events.filter(({ start }) => start > now).sort((a, b) => a.start - b.start)[0];
  if (upcoming) {
    const minutes = Math.max(1, Math.ceil((upcoming.start - now) / 60000));
    return { type: minutes <= 120 ? 'soon' : 'upcoming', event: upcoming.event, kicker: relativeMomentLabel(minutes), title: upcoming.event.title, meta: upcoming.event.allDay ? 'Toute la journée' : upcoming.event.time };
  }
  const pendingTasks = tasksForMember(data).filter((task) => task.status !== 'done' && task.dueDate <= today).length;
  const routinesLeft = (data.routines || []).filter((routine) => routineIsScheduled(routine, now) && !routineIsCompleted(data, routine.id, today)).length;
  if (pendingTasks || routinesLeft) {
    const bits = [pendingTasks ? `${pendingTasks} tâche${pendingTasks > 1 ? 's' : ''}` : '', routinesLeft ? `${routinesLeft} routine${routinesLeft > 1 ? 's' : ''}` : ''].filter(Boolean);
    return { type: 'todo', event: null, kicker: 'Maintenant', title: 'La journée continue doucement', meta: bits.join(' · ') };
  }
  return { type: 'calm', event: null, kicker: 'Maintenant', title: 'Tout est calme', meta: 'Profitez du moment' };
}

function renderLiveMoment(data = store.getState()) {
  const button = $('#liveMomentButton');
  if (!button) return;
  const now = new Date();
  applyDynamicAmbience(now);
  const live = liveMomentFor(data);
  $('#liveMomentKicker').textContent = live.kicker;
  $('#liveMomentTitle').textContent = live.title;
  $('#liveMomentClock').textContent = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  $('#liveMomentMeta').textContent = live.meta;
  button.dataset.liveEventId = live.event?.id || '';
  button.className = `live-moment tap is-${live.type}`;
  let urgency = 'calm';
  if (live.event && live.type !== 'active') {
    const { start } = eventTiming(live.event);
    const minutesUntil = Math.max(0, Math.ceil((start - now) / 60000));
    urgency = minutesUntil <= 30 ? 'near' : minutesUntil <= 120 ? 'soon' : 'calm';
  } else if (live.type === 'active') urgency = 'active';
  button.dataset.urgency = urgency;
  button.setAttribute('aria-label', live.event ? `Ouvrir ${live.event.title}` : `${live.title}, ${live.meta}`);
}

function timelineNowMarker() {
  const now = new Date();
  return `<div class="timeline-now" aria-label="Maintenant ${now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}"><span class="timeline-now-dot"></span><strong class="timeline-now-time">${now.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}</strong><small>Maintenant</small></div>`;
}

function completionBurst(anchor, kind = 'done') {
  if (!anchor || motionIsReduced()) return;
  anchor.classList.remove('completion-pop');
  requestAnimationFrame(() => anchor.classList.add('completion-pop'));
  const rect = anchor.getBoundingClientRect();
  const burst = document.createElement('span');
  burst.className = `completion-burst is-${kind}`;
  burst.style.left = `${rect.left + rect.width / 2}px`;
  burst.style.top = `${rect.top + rect.height / 2}px`;
  for (let index = 0; index < 7; index += 1) {
    const spark = document.createElement('i');
    spark.style.setProperty('--spark-angle', `${index * (360 / 7) - 90}deg`);
    spark.style.setProperty('--spark-distance', `${24 + (index % 3) * 5}px`);
    spark.style.setProperty('--spark-delay', `${index * 18}ms`);
    burst.append(spark);
  }
  document.body.append(burst);
  window.setTimeout(() => burst.remove(), 950);
}

function maybeCelebrateClearDay(hadPending = false) {
  if (!hadPending) return;
  window.setTimeout(() => {
    const data = store.getState();
    const today = toISO(new Date());
    const pendingTasks = tasksForMember(data).some((task) => task.status !== 'done' && task.dueDate <= today);
    const pendingRoutines = (data.routines || []).some((routine) => routineIsScheduled(routine) && !routineIsCompleted(data, routine.id, today));
    if (!pendingTasks && !pendingRoutines) showToast('✨ Tout est fait pour aujourd’hui');
  }, 80);
}

function setupTemporalUI() {
  let lastGroup = groupForTime(new Date().toTimeString().slice(0,5));
  const tick = () => {
    if (document.hidden || !store.getAuthStatus().authenticated) return;
    renderLiveMoment(store.getState());
    const marker = $('.timeline-now-time');
    if (marker) marker.textContent = new Date().toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
    const group = groupForTime(new Date().toTimeString().slice(0,5));
    if (state.activeView === 'home' && state.selectedDate === toISO(new Date()) && group !== lastGroup) renderTimeline(store.getState());
    renderContextualHome(store.getState());
    if (state.activeView === 'daily') renderDailyHub(store.getState());
    lastGroup = group;
  };
  window.clearInterval(temporalTimer);
  temporalTimer = window.setInterval(tick, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pageshow', tick);
  tick();
}

function minutesUntilEvent(event, now = new Date()) {
  if (!event || event.allDay) return Infinity;
  return Math.ceil((new Date(`${event.date}T${event.time}:00`) - now) / 60000);
}


function nextBirthdayWithin(data, days = 7) {
  const today = new Date(); today.setHours(0,0,0,0);
  for (let offset = 0; offset <= days; offset += 1) {
    const date = addDays(today, offset);
    const members = birthdayMembersForDate(data, toISO(date));
    if (members.length) return { offset, date, members };
  }
  return null;
}

function contextualTimeLabel(date = new Date()) {
  const phase = currentDayPhase(date);
  const season = seasonFor(date);
  if (isWeekendMoment(date)) return `${phase === 'night' ? 'Soirée' : 'Mode week-end'} · ${seasonLabel(season)}`;
  return ({ morning:'Matin doux', day:'Belle journée', evening:'Soirée tranquille', night:'Mode nuit' })[phase] + ` · ${seasonLabel(season)}`;
}

function renderContextualHome(data = store.getState()) {
  const strip = $('#contextStrip');
  if (!strip) return;
  const enabled = smartContextEnabled();
  strip.hidden = !enabled;
  document.documentElement.dataset.smartContext = enabled ? 'true' : 'false';
  if (!enabled) return;

  const now = new Date();
  applyDynamicAmbience(now);
  const timeChip = $('#contextTimeChip span:last-child');
  if (timeChip) timeChip.textContent = contextualTimeLabel(now);

  const weekend = $('#contextWeekendChip');
  const weekendActive = isWeekendMoment(now);
  weekend.hidden = !weekendActive;
  if (weekendActive) weekend.querySelector('span:last-child').textContent = now.getDay() === 5 ? 'Le week-end commence' : 'Mode week-end';

  const birthday = nextBirthdayWithin(data, 7);
  const birthdayChip = $('#contextBirthdayChip');
  birthdayChip.hidden = !birthday;
  if (birthday) {
    const names = birthday.members.map(memberDisplayName).join(' & ');
    birthdayChip.querySelector('span:last-child').textContent = birthday.offset === 0 ? `Aujourd’hui · ${names}` : birthday.offset === 1 ? `Demain · ${names}` : `Anniversaire dans ${birthday.offset} j · ${names}`;
    if (birthday.offset === 0) document.body.dataset.celebration = 'birthday';
    else delete document.body.dataset.celebration;
  } else delete document.body.dataset.celebration;

  const next = nextUpcomingEvent(data, now);
  const nextChip = $('#contextNextChip');
  const mins = next ? minutesUntilEvent(next, now) : Infinity;
  nextChip.hidden = !(mins > 0 && mins <= 180);
  if (!nextChip.hidden) {
    nextChip.dataset.eventId = next.id;
    nextChip.querySelector('span').textContent = mins <= 60 ? `${next.title} · ${relativeMomentLabel(mins)}` : `${next.title} · ${next.time}`;
  } else nextChip.dataset.eventId = '';

  const weatherChip = $('#contextWeatherChip');
  const weather = weatherEnabled() ? cachedWeather() : null;
  weatherChip.hidden = !weather;
  if (weather) {
    const meta = weatherDescriptor(weather.code);
    $('#contextWeatherIcon').textContent = meta.icon;
    $('#contextWeatherText').textContent = `${Math.round(weather.temperature)}° · ${meta.label}`;
    document.documentElement.dataset.weather = meta.kind;
  } else delete document.documentElement.dataset.weather;
}

function renderDailyHub(data = store.getState()) {
  if (!$('#view-daily')) return;
  const now = new Date();
  const today = toISO(now);
  const tomorrowDate = addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1);
  const tomorrow = toISO(tomorrowDate);

  const pendingTasks = tasksForMember(data).filter((task) => task.status !== 'done' && task.dueDate <= today);
  const routines = (data.routines || []).filter((routine) => routineIsScheduled(routine, now));
  const routinesLeft = routines.filter((routine) => !routineIsCompleted(data, routine.id, today));
  const shopping = shoppingOpenItems(data);
  $('#dailyTasksCount').textContent = `${pendingTasks.length} à faire`;
  $('#dailyTasksMeta').textContent = pendingTasks.some((task) => task.dueDate < today) ? 'Dont du retard' : 'Aujourd’hui';
  $('#dailyRoutinesCount').textContent = `${routinesLeft.length} restante${routinesLeft.length > 1 ? 's' : ''}`;
  $('#dailyRoutinesMeta').textContent = routines.length ? `${routines.length - routinesLeft.length}/${routines.length} terminées` : 'Aucune prévue';
  $('#dailyShoppingCount').textContent = shopping.length ? `${shopping.length} article${shopping.length > 1 ? 's' : ''}` : 'Liste vide';
  $('#dailyShoppingMeta').textContent = shopping.length ? 'À acheter' : 'Tout est bon';

  const total = pendingTasks.length + routinesLeft.length + shopping.length;
  $('#dailyStatusTitle').textContent = total === 0 ? 'Tout est fluide aujourd’hui ✨' : total <= 3 ? 'Une journée légère' : total <= 7 ? 'Quelques choses à garder en tête' : 'Une journée bien remplie';
  $('#dailyStatusCopy').textContent = total === 0 ? 'Rien ne presse, profitez de ce temps' : `${pendingTasks.length} tâche${pendingTasks.length > 1 ? 's' : ''} · ${routinesLeft.length} routine${routinesLeft.length > 1 ? 's' : ''} · ${shopping.length} course${shopping.length > 1 ? 's' : ''}`;

  const tomorrowEvents = eventsForDate(data, tomorrow, 'all').sort((a,b) => (a.allDay ? '00:00' : a.time).localeCompare(b.allDay ? '00:00' : b.time));
  const first = tomorrowEvents[0];
  $('#tomorrowFirstEvent').textContent = first ? first.title : 'Rien de prévu';
  $('#tomorrowFirstEventMeta').textContent = first ? (first.allDay ? 'Toute la journée' : first.time) : '—';
  const tomorrowTasks = (data.tasks || []).filter((task) => task.status !== 'done' && task.dueDate === tomorrow).length;
  const tomorrowRoutines = (data.routines || []).filter((routine) => routineIsScheduled(routine, tomorrowDate)).length;
  const load = tomorrowEvents.length + tomorrowTasks + tomorrowRoutines;
  $('#tomorrowWorkload').textContent = load ? `${load} élément${load > 1 ? 's' : ''}` : 'Rien à signaler';
  $('#tomorrowWorkloadMeta').textContent = [tomorrowEvents.length ? `${tomorrowEvents.length} RDV` : '', tomorrowTasks ? `${tomorrowTasks} tâche${tomorrowTasks>1?'s':''}` : '', tomorrowRoutines ? `${tomorrowRoutines} routine${tomorrowRoutines>1?'s':''}` : ''].filter(Boolean).join(' · ') || 'Profitez-en';
  $('#tomorrowBadge').textContent = load === 0 ? 'Calme' : load <= 3 ? 'Léger' : load <= 6 ? 'Équilibré' : 'Chargé';
}

function openQuickAddDialog() {
  $('#quickAddDialog')?.showModal();
  vibration();
}
function closeQuickAddDialog() { if ($('#quickAddDialog')?.open) $('#quickAddDialog').close(); }

function announceVersionIfNeeded() {
  const previous = localStorage.getItem(VERSION_SEEN_KEY);
  localStorage.setItem(VERSION_SEEN_KEY, APP_VERSION);
  if (previous && previous !== APP_VERSION) window.setTimeout(() => showToast('AGENDA 4.2 est prête ✨'), 900);
}

// Rendu central : chaque vue lit le même état local-first.
function render() {
  const data = store.getState();
  applyUserPreferences(data);
  renderHeader(data);
  renderLiveMoment(data);
  renderContextualHome(data);
  renderDailyHub(data);
  renderMemberFilter(data);
  renderFamilyFeed(data);
  renderHomeTools(data);
  renderTasksHome(data);
  renderShoppingDialog(data);
  renderRoutinesDialog(data);
  renderDayRibbon(data);
  renderTimeline(data);
  renderInsights(data);
  renderAgenda(data);
  renderFamily(data);
  renderFamilyCover(data);
  renderFocus(data);
  renderDialogMembers(data);
  renderNotificationIndicator(data);
}

function resolvedTheme(choice = 'system') {
  if (choice === 'dark' || choice === 'light') return choice;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

const MOTION_MODE_KEY = 'agenda-motion-mode-v4';
function getMotionMode() {
  const saved = localStorage.getItem(MOTION_MODE_KEY);
  return ['system','subtle','live'].includes(saved) ? saved : 'live';
}
function motionIsReduced() {
  const mode = getMotionMode();
  return mode === 'system' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}
function applyMotionPreference() {
  const mode = getMotionMode();
  document.documentElement.dataset.animationMode = mode;
  document.documentElement.dataset.motionReduced = motionIsReduced() ? 'true' : 'false';
  $$('[data-motion-choice]').forEach((button) => button.classList.toggle('is-active', button.dataset.motionChoice === mode));
  const note = $('#motionSettingNote');
  if (note) note.textContent = mode === 'live' ? 'Vivantes garde les détails premium actifs en continu' : mode === 'subtle' ? 'Discrètes conserve les mouvements essentiels sans effets lumineux continus' : 'Système suit le réglage Mouvement de cet appareil';
  window.dispatchEvent(new CustomEvent('agenda-motion-change', { detail: { mode } }));
}
function setMotionMode(mode) {
  const next = ['system','subtle','live'].includes(mode) ? mode : 'live';
  localStorage.setItem(MOTION_MODE_KEY, next);
  applyMotionPreference();
}

function applyUserPreferences(data = store.getState()) {
  const choice = data.settings?.theme || 'system';
  const theme = resolvedTheme(choice);
  const themeChanged = document.documentElement.dataset.theme && document.documentElement.dataset.theme !== theme;
  if (themeChanged && !motionIsReduced()) {
    document.documentElement.classList.add('theme-transitioning');
    window.setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 380);
  }
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#101816' : '#F6EED8');
  const widgets = data.settings?.homeWidgets || {};
  $$('[data-home-widget]').forEach((section) => { section.hidden = widgets[section.dataset.homeWidget] === false; });
}

function isStandaloneApp() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true);
}

function renderSettingsDialog() {
  const data = store.getState();
  const user = store.getCurrentUser();
  const choice = data.settings?.theme || 'system';
  $$('[data-theme-choice]').forEach((button) => button.classList.toggle('is-active', button.dataset.themeChoice === choice));
  applyMotionPreference();
  $$('[data-home-widget-toggle]').forEach((input) => { input.checked = data.settings?.homeWidgets?.[input.dataset.homeWidgetToggle] !== false; });
  if ($('#smartContextToggle')) $('#smartContextToggle').checked = smartContextEnabled();
  if ($('#weatherToggle')) $('#weatherToggle').checked = weatherEnabled();
  if ($('#weatherSettingCopy')) { const weather = cachedWeather(); $('#weatherSettingCopy').textContent = weatherEnabled() ? (weather ? `Active · dernière mise à jour ${new Date(weather.at).toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'})}` : 'Active · autorisation de localisation nécessaire') : 'Optionnelle · position utilisée uniquement pour récupérer la météo'; }

  const checks = [
    { label: 'Identité famille', done: Boolean(data.family?.name && data.family?.symbol) },
    { label: 'Photo de famille', done: Boolean(data.family?.photoUrl) },
    { label: 'Photo de profil', done: Boolean(user?.avatarUrl) },
    { label: 'Notifications', done: Boolean(data.notificationPreferences?.pushEnabled && (!('Notification' in window) || Notification.permission === 'granted')) },
    { label: 'Installée sur l’appareil', done: isStandaloneApp() }
  ];
  const done = checks.filter((item) => item.done).length;
  const percent = Math.round(done / checks.length * 100);
  $('#setupProgressFill').style.width = `${percent}%`;
  $('#setupProgressCopy').textContent = `${done}/${checks.length} étapes terminées · ${percent}%`;
  $('#setupChecks').innerHTML = checks.map((item) => `<div class="setup-check ${item.done ? 'is-done' : ''}"><i>${item.done ? '✓' : '•'}</i><span>${escapeHTML(item.label)}</span></div>`).join('');

  const online = navigator.onLine;
  const remote = store.isRemoteReady();
  const pending = store.hasPendingChanges();
  const setHealth = (dotId, copyId, ok, warn, copy) => {
    const dot = $(dotId); dot.classList.remove('is-ok','is-warn','is-error'); dot.classList.add(ok ? 'is-ok' : warn ? 'is-warn' : 'is-error');
    $(copyId).textContent = copy;
  };
  setHealth('#healthNetworkDot','#healthNetworkCopy', online, false, online ? 'Connecté' : 'Hors-ligne');
  setHealth('#healthSyncDot','#healthSyncCopy', online && remote && !pending, online && (pending || !remote), !online ? 'En attente réseau' : pending ? 'Modifs en attente' : remote ? 'À jour' : 'Connexion…');
  setHealth('#healthInstallDot','#healthInstallCopy', isStandaloneApp(), true, isStandaloneApp() ? 'App installée' : 'Navigateur');
  $('#settingsSyncCopy').textContent = !online ? 'Le mode hors-ligne est actif' : pending ? 'Des modifications vont être synchronisées' : remote ? 'Toutes les données sont synchronisées' : 'Connexion à Supabase en cours';
  $('#restoreBackupInput').disabled = user?.role !== 'admin';
  document.querySelector('.settings-restore-button')?.classList.toggle('is-disabled', user?.role !== 'admin');
}

function openSettingsDialog() {
  closeAccountDialog();
  renderSettingsDialog();
  $('#settingsDialog').showModal();
  vibration();
}
function closeSettingsDialog() { if ($('#settingsDialog').open) $('#settingsDialog').close(); }

async function handleBackupRestore(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  try {
    if (!confirm('Fusionner cette sauvegarde avec les données actuelles ? Les éléments plus récents ne seront pas supprimés.')) return;
    showToast('Restauration en cours…');
    const restored = await store.restoreBackup(file);
    render();
    renderSettingsDialog();
    showToast(`${restored.events + restored.tasks + restored.shoppingItems + restored.routines} éléments restaurés`);
  } catch (error) { showToast(error.message || 'Restauration impossible'); }
  finally { event.currentTarget.value = ''; }
}

async function forceSyncNow() {
  const button = $('#forceSyncButton');
  button.disabled = true;
  try { await store.forceSync(); renderSettingsDialog(); showToast('Synchronisation terminée'); }
  catch (error) { showToast(error.message || 'Synchronisation impossible'); }
  finally { button.disabled = false; }
}

function renderHeader(data) {
  const today = new Date();
  const todayIso = toISO(today);
  const todayEvents = eventsForDate(data, todayIso, 'all');
  const count = todayEvents.length;
  $('#todayEyebrow').textContent = capitalize(dateFormatter.format(today));
  $('#greeting').textContent = getGreeting();
  $('#familyGreeting').textContent = familyDisplayName(data);
  $('#familyNameTitle').textContent = familyDisplayName(data);
  $('#familySymbolTitle').textContent = data.family?.symbol || '🌿';
  $('#orbitDay').textContent = String(today.getDate()).padStart(2, '0');
  $('#orbitMonth').textContent = monthShort.format(today).replace('.', '').toUpperCase().slice(0, 3);
  $('#heroEventCount').textContent = `${count} rendez-vous`;
  $('#pulseMeterFill').style.width = `${count === 0 ? 0 : Math.min(96, Math.max(18, count * 16))}%`;

  const birthdaysToday = birthdayMembersForDate(data, todayIso);
  if (birthdaysToday.length) $('#heroTitle').innerHTML = `🎂 Joyeux anniversaire ${escapeHTML(birthdaysToday.map(memberDisplayName).join(' & '))} !<br><em>Une journée à célébrer</em>`;
  else if (count === 0) $('#heroTitle').innerHTML = `Aujourd’hui respire<br><em>Profitez-en ensemble</em>`;
  else if (count === 1) $('#heroTitle').innerHTML = `Un seul moment prévu<br><em>Le reste vous appartient</em>`;
  else $('#heroTitle').innerHTML = `${count} moments aujourd’hui<br><em>Tout est sous contrôle</em>`;

  const perMember = data.members.map((member) => ({ member, count: todayEvents.filter((event) => event.memberIds.includes(member.id)).length }));
  const pendingTasksToday = (data.tasks || []).filter((task) => task.status !== 'done' && task.dueDate <= todayIso).length;
  const routinesToday = (data.routines || []).filter((routine) => routineIsScheduled(routine, today) && !routineIsCompleted(data, routine.id, todayIso)).length;
  const shoppingCount = shoppingOpenItems(data).length;
  const memberSummary = perMember.map(({ member, count: memberCount }) => `${memberDisplayName(member)} : ${memberCount ? `${memberCount} prévu${memberCount > 1 ? 's' : ''}` : 'libre'}`).join(' · ');
  const extras = [pendingTasksToday ? `${pendingTasksToday} tâche${pendingTasksToday > 1 ? 's' : ''}` : '', routinesToday ? `${routinesToday} routine${routinesToday > 1 ? 's' : ''}` : '', shoppingCount ? `${shoppingCount} article${shoppingCount > 1 ? 's' : ''} à acheter` : ''].filter(Boolean);
  $('#heroSummary').textContent = `${memberSummary}${extras.length ? ` · ${extras.join(' · ')}` : ''}`;

  const nextEvent = nextUpcomingEvent(data);
  $('#heroNextMoment').textContent = nextEvent ? `Prochain : ${nextEvent.title} · ${nextEvent.allDay ? 'journée' : nextEvent.time}` : 'Aucun prochain rendez-vous';
  const member = state.activeMember === 'all' ? null : memberById(data, state.activeMember);
  $('#heroFilterHint').textContent = member ? `Filtre actif : ${memberDisplayName(member)}` : `${data.family?.symbol || '🌿'} Vue famille active`;
  $('#quietModeToggle').checked = Boolean(data.settings.quietMode);
}

function renderMemberFilter(data) {
  const all = `<button class="member-chip ${state.activeMember === 'all' ? 'is-active' : ''} tap" data-member="all" role="option" aria-selected="${state.activeMember === 'all'}"><span class="avatar all">∞</span>Toute la famille</button>`;
  const members = data.members.map((member) => `
    <button class="member-chip ${state.activeMember === member.id ? 'is-active' : ''} tap" data-member="${member.id}" role="option" aria-selected="${state.activeMember === member.id}">
      ${renderAvatar(member)}${escapeHTML(memberDisplayName(member))}
    </button>`).join('');
  $('#memberFilter').innerHTML = all + members;
}

function renderHomeTools(data) {
  const openCount = shoppingOpenItems(data).length;
  const todayIso = toISO(new Date());
  const todayRoutines = (data.routines || []).filter((routine) => routineIsScheduled(routine));
  const routinesLeft = todayRoutines.filter((routine) => !routineIsCompleted(data, routine.id, todayIso)).length;
  $('#shoppingShortcutCount').textContent = openCount ? `${openCount} à acheter` : 'Liste vide';
  $('#routineShortcutCount').textContent = todayRoutines.length ? `${routinesLeft} restante${routinesLeft > 1 ? 's' : ''} aujourd’hui` : 'Aucune aujourd’hui';
}

function buildFamilyFeed(data) {
  const today = new Date();
  const todayIso = toISO(today);
  const items = [];
  for (const member of birthdayMembersForDate(data, todayIso)) {
    items.push({ type: 'birthday', sort: '00:00', title: `Anniversaire de ${memberDisplayName(member)}`, subtitle: 'Une journée à célébrer 🎂', member });
  }
  for (const event of eventsForDate(data, todayIso, 'all')) {
    const responsible = event.responsibleMemberId ? memberById(data, event.responsibleMemberId) : null;
    items.push({ type: 'event', sort: event.allDay ? '00:10' : event.time, title: event.title, subtitle: `${event.allDay ? 'Toute la journée' : event.time}${responsible ? ` · ${memberDisplayName(responsible)} s’en occupe` : ''}`, event });
  }
  for (const task of (data.tasks || []).filter((task) => task.status !== 'done' && task.dueDate <= todayIso)) {
    const responsible = taskResponsible(data, task);
    items.push({ type: 'task', sort: task.dueDate < todayIso ? '00:05' : (task.dueTime || '19:00'), title: task.title, subtitle: `${task.dueDate < todayIso ? 'En retard' : task.dueTime || 'À faire aujourd’hui'}${responsible ? ` · ${memberDisplayName(responsible)}` : ''}`, task });
  }
  for (const routine of (data.routines || []).filter((routine) => routineIsScheduled(routine, today))) {
    const done = routineIsCompleted(data, routine.id, todayIso);
    const responsible = routineResponsible(data, routine);
    items.push({ type: 'routine', sort: routine.time || '18:30', title: routine.title, subtitle: `${done ? 'Terminée' : routine.time || 'Routine du jour'}${responsible ? ` · ${memberDisplayName(responsible)}` : ''}`, routine, done });
  }
  const shoppingCount = shoppingOpenItems(data).length;
  if (shoppingCount) items.push({ type: 'shopping', sort: '23:55', title: 'Liste de courses', subtitle: `${shoppingCount} article${shoppingCount > 1 ? 's' : ''} encore à acheter` });
  return items.sort((a,b) => a.sort.localeCompare(b.sort));
}

function renderFamilyFeed(data) {
  const items = buildFamilyFeed(data);
  $('#familyFeedCount').textContent = items.length ? `${items.length} repère${items.length > 1 ? 's' : ''}` : 'Journée légère';
  $('#familyFeedList').innerHTML = items.length ? items.slice(0, 7).map((item) => {
    const iconName = item.type === 'event' ? 'calendar' : item.type === 'task' ? 'clipboard' : item.type === 'routine' ? 'repeat' : item.type === 'shopping' ? 'cart' : 'heart';
    const action = item.type === 'event' ? `data-edit-event="${item.event.id}"` : item.type === 'task' ? `data-edit-task="${item.task.id}"` : item.type === 'routine' ? `data-toggle-routine="${item.routine.id}"` : item.type === 'shopping' ? 'data-open-shopping' : '';
    return `<button class="family-feed-item tap type-${item.type} ${item.done ? 'is-done' : ''}" type="button" ${action}>
      <span class="family-feed-icon">${icon(iconName)}</span>
      <span class="family-feed-copy"><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle)}</small></span>
      <span class="family-feed-arrow">${item.type === 'routine' ? (item.done ? icon('check') : icon('circle-check')) : icon('chevron-right')}</span>
    </button>`;
  }).join('') : `<div class="family-feed-empty"><span>${icon('sparkles')}</span><div><strong>Rien ne presse aujourd’hui</strong><p>Profitez de ce temps libre en famille.</p></div></div>`;
}

function shoppingItemCard(item) {
  const category = shoppingCategory(item);
  return `<article class="shopping-item ${item.checked ? 'is-checked' : ''}">
    <button class="shopping-check tap" type="button" data-toggle-shopping="${item.id}" aria-label="${item.checked ? 'Remettre' : 'Cocher'} ${escapeHTML(item.name)}">${item.checked ? icon('check') : ''}</button>
    <span class="shopping-category-icon">${category.icon}</span>
    <div class="shopping-item-copy"><strong>${escapeHTML(item.name)}</strong><small>${item.quantity ? `${escapeHTML(item.quantity)} · ` : ''}${escapeHTML(category.label)}</small></div>
    <button class="shopping-delete tap" type="button" data-delete-shopping="${item.id}" aria-label="Supprimer ${escapeHTML(item.name)}">${icon('trash')}</button>
  </article>`;
}

function renderShoppingDialog(data = store.getState()) {
  const all = data.shoppingItems || [];
  const openItems = all.filter((item) => !item.checked);
  const checked = all.filter((item) => item.checked);
  $$('[data-shopping-filter]').forEach((button) => button.classList.toggle('is-active', button.dataset.shoppingFilter === state.shoppingFilter));
  $('#shoppingDialogCount').textContent = `${openItems.length} article${openItems.length > 1 ? 's' : ''} à acheter`;
  const items = state.shoppingFilter === 'checked' ? checked : openItems;
  $('#shoppingList').innerHTML = items.length ? items.map(shoppingItemCard).join('') : `<div class="empty-state"><strong>${state.shoppingFilter === 'checked' ? 'Rien de coché.' : 'La liste est vide.'}</strong><p>${state.shoppingFilter === 'checked' ? 'Les articles pris apparaîtront ici.' : 'Ajoutez ce qu’il manque en quelques secondes.'}</p></div>`;
  $('#clearCheckedShoppingButton').hidden = checked.length === 0;
}

function routineDaysLabel(routine) {
  const days = routine.weekdays || [];
  if (days.length === 7) return 'Tous les jours';
  if ([1,2,3,4,5].every((day) => days.includes(day)) && days.length === 5) return 'Du lundi au vendredi';
  return days.map((day) => WEEKDAY_LABELS[day]).filter(Boolean).join(' · ') || 'Aucun jour';
}

function routineCard(routine, data) {
  const todayIso = toISO(new Date());
  const scheduledToday = routineIsScheduled(routine);
  const done = scheduledToday && routineIsCompleted(data, routine.id, todayIso);
  const responsible = routineResponsible(data, routine);
  return `<article class="routine-card ${!routine.active ? 'is-paused' : ''} ${done ? 'is-done' : ''}">
    <button class="routine-check tap" type="button" data-toggle-routine="${routine.id}" ${scheduledToday ? '' : 'disabled'} aria-label="${done ? 'Rouvrir' : 'Terminer'} ${escapeHTML(routine.title)}">${done ? icon('check') : icon('repeat')}</button>
    <div class="routine-card-copy"><strong>${escapeHTML(routine.title)}</strong><small>${escapeHTML(routineDaysLabel(routine))}${routine.time ? ` · ${routine.time}` : ''}${responsible ? ` · ${escapeHTML(memberDisplayName(responsible))}` : ''}</small></div>
    <button class="routine-edit tap" type="button" data-edit-routine="${routine.id}" aria-label="Modifier ${escapeHTML(routine.title)}">${icon('more')}</button>
  </article>`;
}

function renderRoutinesDialog(data = store.getState()) {
  const routines = data.routines || [];
  $$('[data-routine-filter]').forEach((button) => button.classList.toggle('is-active', button.dataset.routineFilter === state.routineFilter));
  const visible = state.routineFilter === 'today' ? routines.filter((routine) => routineIsScheduled(routine)) : routines;
  $('#routinesDialogCount').textContent = routines.length ? `${routines.length} routine${routines.length > 1 ? 's' : ''}` : 'Aucune routine';
  $('#routinesList').innerHTML = visible.length ? visible.map((routine) => routineCard(routine, data)).join('') : `<div class="empty-state"><strong>${state.routineFilter === 'today' ? 'Aucune routine aujourd’hui' : 'Aucune routine créée'}</strong><p>Les habitudes familiales apparaîtront ici automatiquement.</p><button class="primary-button tap" data-open-routine>${icon('plus')}Créer une routine</button></div>`;
}

function taskCard(task, data, compact = false) {
  const responsible = taskResponsible(data, task);
  const overdue = task.status !== 'done' && task.dueDate < toISO(new Date());
  const shared = collaborationSummary(data, 'task', task.id);
  return `<article class="task-card ${compact ? 'is-compact' : ''} ${task.status === 'done' ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}" data-task-id="${task.id}">
    <button class="task-check tap" type="button" data-toggle-task="${task.id}" aria-label="${task.status === 'done' ? 'Rouvrir' : 'Terminer'} ${escapeHTML(task.title)}">${task.status === 'done' ? icon('check') : ''}</button>
    <div class="task-main">
      <div class="task-title-row"><strong>${escapeHTML(task.title)}</strong>${task.priority === 'high' ? '<span class="task-priority">Important</span>' : ''}</div>
      <div class="task-meta"><span>${icon('clock')}${escapeHTML(taskDueLabel(task))}</span>${responsible ? `<span>${renderAvatar(responsible, { className: 'task-avatar' })}${escapeHTML(memberDisplayName(responsible))}</span>` : `<span>${icon('users')}Toute la famille</span>`}</div>
      <button class="collaboration-entry tap" type="button" data-collaborate-type="task" data-collaborate-id="${task.id}" aria-label="Ouvrir Documents et échanges">
        <span class="collaboration-entry-label">${icon('paperclip')}<span>Documents & échanges</span></span>
        <span class="collaboration-entry-stats"><span>${icon('message')} ${shared.comments}</span><span>${icon('paperclip')} ${shared.attachments}</span><span>${icon('eye')} ${shared.reads}</span></span>
      </button>
    </div>
    <button class="task-more tap" type="button" data-edit-task="${task.id}" aria-label="Modifier ${escapeHTML(task.title)}">${icon('more')}</button>
  </article>`;
}

function renderTasksHome(data) {
  const today = toISO(new Date());
  const tasks = tasksForMember(data).filter((task) => task.status !== 'done' && task.dueDate <= today).sort((a,b) => `${a.dueDate}${a.dueTime || '23:59'}`.localeCompare(`${b.dueDate}${b.dueTime || '23:59'}`));
  const overdue = tasks.filter((task) => task.dueDate < today).length;
  $('#tasksHomeSummary').innerHTML = `<span><strong>${tasks.length}</strong> à faire</span>${overdue ? `<span class="is-alert"><strong>${overdue}</strong> en retard</span>` : '<span><strong>✓</strong> à jour</span>'}`;
  $('#tasksHomeList').innerHTML = tasks.length
    ? tasks.slice(0, 3).map((task) => taskCard(task, data, true)).join('')
    : `<div class="tasks-empty-mini"><span>${icon('circle-check')}</span><div><strong>Tout est fait</strong><p>Rien ne presse pour aujourd’hui.</p></div></div>`;
}

function tasksForFilter(data, filter = state.taskFilter) {
  const today = toISO(new Date());
  const tasks = tasksForMember(data);
  if (filter === 'done') return tasks.filter((task) => task.status === 'done').sort((a,b) => String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
  if (filter === 'upcoming') return tasks.filter((task) => task.status !== 'done' && task.dueDate > today).sort((a,b) => `${a.dueDate}${a.dueTime || '23:59'}`.localeCompare(`${b.dueDate}${b.dueTime || '23:59'}`));
  return tasks.filter((task) => task.status !== 'done' && task.dueDate <= today).sort((a,b) => `${a.dueDate}${a.dueTime || '23:59'}`.localeCompare(`${b.dueDate}${b.dueTime || '23:59'}`));
}

function renderTasksDialog(data = store.getState()) {
  $$('[data-task-filter]').forEach((button) => button.classList.toggle('is-active', button.dataset.taskFilter === state.taskFilter));
  const tasks = tasksForFilter(data);
  $('#tasksDialogList').innerHTML = tasks.length ? tasks.map((task) => taskCard(task, data)).join('') : `<div class="empty-state"><strong>Aucune tâche ici</strong><p>Votre famille est à jour dans cette catégorie.</p><button class="primary-button tap" data-open-task>${icon('plus')}Ajouter une tâche</button></div>`;
}

function renderDayRibbon(data) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekAnchor, index));
  $('#dayRibbon').innerHTML = days.map((day) => {
    const iso = toISO(day);
    const dayEvents = eventsForDate(data, iso);
    const categories = [...new Set(dayEvents.map((event) => event.category))].slice(0, 3);
    const birthdays = birthdayMembersForDate(data, iso);
    return `<button class="day-pill tap ${state.selectedDate === iso ? 'is-selected' : ''} ${sameDay(day, new Date()) ? 'is-today' : ''}" data-date="${iso}" aria-label="${longDate.format(day)}, ${dayEvents.length} événement(s)">
      <span class="day-name">${shortWeekday.format(day).replace('.', '')}</span>
      <strong>${day.getDate()}</strong>
      <span class="day-dots">${birthdays.length ? '<i style="--dot:#D49A42"></i>' : ''}${categories.map((category) => `<i style="--dot:${CATEGORY_META[category]?.color || '#C79A5C'}"></i>`).join('')}</span>
    </button>`;
  }).join('');

  requestAnimationFrame(() => $('#dayRibbon .is-selected')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
}

function groupForTime(time, allDay = false) {
  if (allDay) return 'Toute la journée';
  const minutes = timeToMinutes(time);
  if (minutes < 12 * 60) return 'Matin';
  if (minutes < 18 * 60) return 'Après-midi';
  return 'Soirée';
}

function eventCard(event, data) {
  const category = CATEGORY_META[event.category] || CATEGORY_META.family;
  const people = event.memberIds.map((id) => memberById(data, id)).filter(Boolean);
  const responsible = event.responsibleMemberId ? memberById(data, event.responsibleMemberId) : null;
  const shared = collaborationSummary(data, 'event', event.id);
  const familyTogether = data.members.length > 1 && data.members.every((member) => event.memberIds.includes(member.id));
  return `<article class="event-card ${familyTogether ? 'is-family-together' : ''}" style="--event-color:${category.color}" data-event-id="${event.id}">
    <div class="event-top">
      <div>
        <span class="event-time">${icon('clock')}${event.allDay ? 'Toute la journée' : `${event.time}–${minutesToTime(timeToMinutesSafe(event.time) + Number(event.duration || 60))} · ${formatDuration(event.duration)}`}${event.seriesId ? ' · Récurrent' : ''}</span>
        <h3>${escapeHTML(event.title)}</h3>
      </div>
      <button class="event-menu tap" data-edit-event="${event.id}" aria-label="Modifier ${escapeHTML(event.title)}">${icon('more')}</button>
    </div>
    <div class="event-meta">
      <span>${category.label}</span>
      ${event.location ? `<span>${icon('map-pin')}${escapeHTML(event.location)}</span>` : ''}
      ${responsible ? `<span class="responsible-pill">${icon('user')}Responsable : ${escapeHTML(memberDisplayName(responsible))}</span>` : ''}
    </div>
    <div class="event-bottom-row">
      <div class="event-avatars">${people.map((member) => renderAvatar(member, { title: memberDisplayName(member) })).join('')}</div>
      <button class="collaboration-entry tap" type="button" data-collaborate-type="event" data-collaborate-id="${event.id}" aria-label="Ouvrir Documents et échanges">
        <span class="collaboration-entry-label">${icon('paperclip')}<span>Documents & échanges</span></span>
        <span class="collaboration-entry-stats"><span>${icon('message')} ${shared.comments}</span><span>${icon('paperclip')} ${shared.attachments}</span><span>${icon('eye')} ${shared.reads}</span></span>
      </button>
    </div>
  </article>`;
}

function renderTimeline(data) {
  const selected = parseISO(state.selectedDate);
  const today = new Date();
  const isToday = sameDay(selected, today);
  $('#selectedDateLabel').textContent = isToday ? `Aujourd’hui · ${today.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' })}` : capitalize(longDate.format(selected));
  const events = eventsForDate(data, state.selectedDate);
  const birthdays = birthdayMembersForDate(data, state.selectedDate).filter((member) => state.activeMember === 'all' || member.id === state.activeMember);
  if (!events.length && !birthdays.length) {
    $('#timeline').innerHTML = `<div class="empty-state"><strong>Une respiration dans la semaine</strong><p>Aucun événement pour ce filtre. Ce temps est à vous.</p><button class="primary-button tap" data-open-event>${icon('plus')}Ajouter un moment</button></div>`;
    return;
  }
  const birthdayCards = birthdays.map((member) => `<article class="birthday-card">${renderAvatar(member, { className: 'birthday-avatar' })}<div><span>🎂 Anniversaire</span><strong>${escapeHTML(memberDisplayName(member))}</strong><p>Une belle journée à célébrer ensemble.</p></div></article>`).join('');
  const groups = ['Toute la journée', 'Matin', 'Après-midi', 'Soirée'];
  const nowMinutes = today.getHours() * 60 + today.getMinutes();
  const currentGroup = groupForTime(today.toTimeString().slice(0,5));
  $('#timeline').innerHTML = birthdayCards + groups.map((group) => {
    const items = events.filter((event) => groupForTime(event.time, event.allDay) === group);
    const shouldShowNow = isToday && group === currentGroup;
    if (!items.length && !shouldShowNow) return '';
    let markerInserted = false;
    const cards = items.map((event) => {
      const beforeEvent = shouldShowNow && !markerInserted && !event.allDay && timeToMinutes(event.time) > nowMinutes;
      if (beforeEvent) markerInserted = true;
      return `${beforeEvent ? timelineNowMarker() : ''}${eventCard(event, data)}`;
    }).join('');
    const tailMarker = shouldShowNow && !markerInserted ? timelineNowMarker() : '';
    return `<div class="timeline-group ${shouldShowNow ? 'has-now' : ''}"><span class="time-node"></span><p class="timeline-label">${group}</p>${cards}${tailMarker}</div>`;
  }).join('');
}

function renderInsights(data) {
  $('#familyStack').innerHTML = data.members.map((member) => renderAvatar(member)).join('');
  const occupied = eventsForDate(data, state.selectedDate, 'all').reduce((sum, event) => sum + event.duration, 0);
  const free = Math.max(0, 12 * 60 - occupied);
  $('#freeTimeValue').textContent = formatDuration(free);

  const nowKey = `${toISO(new Date())}${new Date().toTimeString().slice(0, 5)}`;
  const sharedEvent = data.events
    .filter((event) => data.members.every((member) => event.memberIds.includes(member.id)))
    .filter((event) => `${event.date}${event.time}` >= nowKey)
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];

  if (sharedEvent) {
    const eventDate = parseISO(sharedEvent.date);
    $('#protectedMomentTitle').textContent = sharedEvent.title;
    $('#protectedMomentCopy').textContent = `${capitalize(longDate.format(eventDate))} à ${sharedEvent.time}, pour toute la famille.`;
  } else {
    $('#protectedMomentTitle').textContent = 'Premier moment à créer';
    $('#protectedMomentCopy').textContent = 'Votre agenda est vide. Planifiez ici votre prochain temps partagé.';
  }
}

function renderAgenda(data) {
  const base = startOfWeek(parseISO(state.selectedDate));
  const days = Array.from({ length: 7 }, (_, index) => addDays(base, index));
  $('#agendaFlow').innerHTML = days.map((day) => {
    const iso = toISO(day);
    const events = eventsForDate(data, iso);
    return `<article class="flow-day">
      <div class="flow-date"><strong>${day.getDate()}</strong><span>${shortWeekday.format(day).replace('.', '')}</span></div>
      <div class="flow-items">${events.length ? events.map((event) => {
        const members = event.memberIds.map((id) => memberById(data, id)).filter(Boolean);
        return `<div class="flow-item"><time class="flow-item-time">${event.allDay ? 'Journée' : event.time}</time><div><h3>${escapeHTML(event.title)}</h3><p>${escapeHTML(event.location || CATEGORY_META[event.category].label)}</p><div class="flow-member-line">${members.map((member) => `<i style="--member-color:${member.color}"></i>`).join('')}</div></div></div>`;
      }).join('') : '<div class="empty-state"><strong>Journée légère</strong><p>Aucun rendez-vous.</p></div>'}</div>
    </article>`;
  }).join('');

  $('#agendaWeek').innerHTML = `<div class="week-wave">${days.map((day) => {
    const iso = toISO(day);
    const events = eventsForDate(data, iso);
    return `<article class="wave-day ${sameDay(day, new Date()) ? 'is-today' : ''}"><header><span>${shortWeekday.format(day).replace('.', '')}</span><strong>${day.getDate()}</strong></header>${events.map((event) => `<div class="wave-event"><time>${event.time}</time><strong>${escapeHTML(event.title)}</strong></div>`).join('')}</article>`;
  }).join('')}</div>`;

  renderMonth(data);
  const targets = { flow: '#agendaFlow', week: '#agendaWeek', month: '#agendaMonth' };
  Object.entries(targets).forEach(([mode, selector]) => { $(selector).hidden = state.agendaMode !== mode; });
  $$('[data-agenda-mode]').forEach((button) => button.classList.toggle('is-active', button.dataset.agendaMode === state.agendaMode));
}

function renderMonth(data) {
  const selected = parseISO(state.selectedDate);
  const monthStart = startOfMonth(selected);
  const gridStart = startOfWeek(monthStart);
  const days = Array.from({ length: 42 }, (_, index) => addDays(gridStart, index));
  const selectedEvents = eventsForDate(data, state.selectedDate);
  const weekdayLabels = Array.from({ length: 7 }, (_, index) => weekdayNarrow.format(addDays(gridStart, index)).replace('.', ''));

  $('#agendaMonth').innerHTML = `
    <section class="month-shell" aria-label="Calendrier mensuel ${capitalize(monthLong.format(monthStart))}">
      <header class="month-header">
        <div>
          <p class="eyebrow">Vue mensuelle</p>
          <h2>${capitalize(monthLong.format(monthStart))}</h2>
        </div>
        <div class="month-controls">
          <button class="icon-button mini tap" data-month-nav="-1" aria-label="Mois précédent">${icon('chevron-left')}</button>
          <button class="icon-button mini tap" data-month-nav="1" aria-label="Mois suivant">${icon('chevron-right')}</button>
        </div>
      </header>

      <div class="month-weekdays" aria-hidden="true">
        ${weekdayLabels.map((label) => `<span>${capitalize(label)}</span>`).join('')}
      </div>

      <div class="month-grid">
        ${days.map((day) => {
          const iso = toISO(day);
          const events = eventsForDate(data, iso);
          const birthdays = birthdayMembersForDate(data, iso).filter((member) => state.activeMember === 'all' || member.id === state.activeMember);
          const isOutside = day.getMonth() !== monthStart.getMonth();
          return `<button class="month-day tap ${isOutside ? 'is-outside' : ''} ${sameDay(day, new Date()) ? 'is-today' : ''} ${iso === state.selectedDate ? 'is-selected' : ''}" data-month-date="${iso}" aria-label="${capitalize(longDate.format(day))}, ${events.length} événement(s)">
            <span class="month-day-number">${day.getDate()}</span>
            <span class="month-event-list">
              ${birthdays.slice(0, 1).map((member) => `<span class="month-event-preview birthday-preview" style="--month-event-color:#D49A42"><i></i><span>🎂 ${escapeHTML(memberDisplayName(member))}</span></span>`).join('')}
              ${events.slice(0, birthdays.length ? 2 : 3).map((event) => `<span class="month-event-preview" style="--month-event-color:${CATEGORY_META[event.category]?.color || '#C79A5C'}"><i></i><span>${escapeHTML(event.title)}</span></span>`).join('')}
              ${(events.length + birthdays.length) > 3 ? `<small>+${events.length + birthdays.length - 3}</small>` : ''}
            </span>
          </button>`;
        }).join('')}
      </div>
    </section>

    <section class="month-selection" aria-live="polite">
      <header class="month-selection-header">
        <div>
          <p class="eyebrow">Jour sélectionné</p>
          <h2>${capitalize(longDate.format(selected))}</h2>
        </div>
        <button class="round-action tap" data-open-event aria-label="Ajouter un événement le ${capitalize(longDate.format(selected))}">${icon('plus')}</button>
      </header>
      <div class="month-selection-events">
        ${selectedEvents.length
          ? selectedEvents.map((event) => eventCard(event, data)).join('')
          : `<div class="empty-state"><strong>Cette journée est libre</strong><p>Ajoutez votre premier rendez-vous pour Nacer, Romane ou Chacha.</p><button class="primary-button tap" data-open-event>${icon('plus')}Planifier cette journée</button></div>`}
      </div>
    </section>`;
}

function moveMonth(direction) {
  const current = parseISO(state.selectedDate);
  const target = new Date(current.getFullYear(), current.getMonth() + direction, 1);
  state.selectedDate = toISO(target);
  state.weekAnchor = startOfWeek(target);
  render();
}

function renderFamilyCover(data) {
  const family = data.family || {};
  const media = $('#familyCoverMedia');
  const name = familyDisplayName(data);
  $('#familyCoverName').textContent = name;
  const isAdmin = store.getCurrentUser()?.role === 'admin';
  $('#familyCoverEditButton').hidden = !isAdmin;
  if (family.photoUrl) {
    media.classList.add('has-photo');
    media.innerHTML = `<img src="${escapeHTML(family.photoUrl)}" alt="Photo de ${escapeHTML(name)}">`;
    $('#familyCoverCopy').textContent = `${data.members.length} membre${data.members.length > 1 ? 's' : ''} · votre espace familial partagé`;
  } else {
    media.classList.remove('has-photo');
    media.innerHTML = `<div class="family-cover-placeholder"><span>${escapeHTML(family.symbol || '🌿')}</span><small>${isAdmin ? 'Ajoutez votre photo de famille' : 'Photo de famille à venir'}</small></div>`;
    $('#familyCoverCopy').textContent = isAdmin ? 'Ajoutez une photo qui vous ressemble pour personnaliser cet espace.' : 'Votre famille peut personnaliser cet espace avec une photo commune.';
  }
}

function renderFamily(data) {
  const now = new Date();
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  let conflictCount = 0;
  for (const member of data.members) {
    const items = data.events
      .filter((event) => event.memberIds.includes(member.id))
      .map((event) => ({ start: new Date(`${event.date}T${event.time}:00`), duration: event.duration }))
      .filter((event) => event.start >= now && event.start <= horizon)
      .sort((a, b) => a.start - b.start);
    for (let index = 1; index < items.length; index += 1) {
      const previousEnd = new Date(items[index - 1].start.getTime() + items[index - 1].duration * 60000);
      if (items[index].start < previousEnd) conflictCount += 1;
    }
  }
  $('.family-pulse-card h2').textContent = conflictCount ? 'Un rythme à rééquilibrer' : 'Tout le monde est aligné';
  $('#familyPulseCopy').textContent = conflictCount
    ? `${conflictCount} chevauchement${conflictCount > 1 ? 's' : ''} à vérifier dans les prochaines 48 heures.`
    : 'Aucun chevauchement détecté dans les prochaines 48 heures.';

  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);
  $('#familyCards').innerHTML = data.members.map((member) => {
    const upcoming = data.events.filter((event) => event.memberIds.includes(member.id) && parseISO(event.date) >= new Date(new Date().setHours(0,0,0,0))).sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
    const weekMinutes = data.events.filter((event) => event.memberIds.includes(member.id) && parseISO(event.date) >= weekStart && parseISO(event.date) < weekEnd).reduce((sum, event) => sum + event.duration, 0);
    const load = Math.min(100, Math.round((weekMinutes / (14 * 60)) * 100));
    const canEdit = store.getCurrentUser()?.role === 'admin';
    return `<article class="family-card">
      <div class="family-card-head"><div class="family-identity">${renderAvatar(member)}<div><strong>${escapeHTML(memberDisplayName(member))}</strong><span>${escapeHTML(member.role)}${member.nickname ? ` · ${escapeHTML(member.name)}` : ''}</span></div></div><span class="load-pill">${load === 0 ? 'Libre' : load < 45 ? 'Léger' : load < 75 ? 'Équilibré' : 'Chargé'}</span></div>
      <div class="family-load"><div class="load-copy"><span>Rythme de la semaine</span><strong>${load}%</strong></div><div class="load-track"><span style="width:${load === 0 ? 0 : Math.max(8, load)}%;--member-color:${member.color}"></span></div></div>
      <div class="family-next"><div><span>Prochain moment</span><strong>${upcoming ? escapeHTML(upcoming.title) : 'Rien de prévu'}</strong></div><time>${upcoming ? `${capitalize(shortWeekday.format(parseISO(upcoming.date)).replace('.',''))} ${upcoming.allDay ? 'journée' : upcoming.time}` : '—'}</time></div>
      ${member.birthday ? `<div class="birthday-line"><span>🎂 Anniversaire</span><strong>${escapeHTML(formatBirthday(member.birthday))}</strong></div>` : ''}
      ${canEdit ? `<button class="member-customize-button tap" data-edit-member="${member.id}">${icon('sparkles')} Personnaliser</button>` : ''}
    </article>`;
  }).join('');
}

function renderFocus(data) {
  const todayEvents = eventsForDate(data, toISO(new Date()), 'all');
  const hasAllDay = todayEvents.some((event) => event.allDay);
  const lastEvent = todayEvents.filter((event) => !event.allDay).sort((a,b) => b.time.localeCompare(a.time))[0];
  if (hasAllDay && !lastEvent) {
    $('#calmHeadline').textContent = 'Une journée entière est déjà réservée, gardez de petites respirations';
  } else if (lastEvent) {
    const endMinutes = timeToMinutes(lastEvent.time) + lastEvent.duration;
    const hours = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
    const minutes = String(endMinutes % 60).padStart(2, '0');
    $('#calmHeadline').textContent = `Votre prochain vrai moment libre commence à ${hours} h ${minutes}`;
  } else {
    $('#calmHeadline').textContent = 'Aujourd’hui est déjà un espace de respiration';
  }
}

function renderDialogMembers(data) {
  $('#dialogMemberPicker').innerHTML = data.members.map((member, index) => `<label class="member-check"><input type="checkbox" name="memberIds" value="${member.id}" ${index === 0 ? 'checked' : ''}><span>${renderAvatar(member, { className: 'avatar' })}${escapeHTML(memberDisplayName(member))}</span></label>`).join('');
  $('#responsibleMemberSelect').innerHTML = `<option value="">Pas de responsable précis</option>` + data.members.map((member) => `<option value="${member.id}">${escapeHTML(memberDisplayName(member))}</option>`).join('');
  $('#taskResponsibleMemberSelect').innerHTML = `<option value="">Toute la famille</option>` + data.members.map((member) => `<option value="${member.id}">${escapeHTML(memberDisplayName(member))}</option>`).join('');
  $('#routineResponsibleMemberSelect').innerHTML = `<option value="">Toute la famille</option>` + data.members.map((member) => `<option value="${member.id}">${escapeHTML(memberDisplayName(member))}</option>`).join('');
}

function switchView(view) {
  if (!['home','agenda','family','daily'].includes(view)) return;
  state.activeView = view;
  $$('.view').forEach((section) => section.classList.toggle('is-active', section.dataset.viewSection === view));
  $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  window.scrollTo({ top: 0, behavior: motionIsReduced() ? 'auto' : 'smooth' });
  requestAnimationFrame(() => replayActiveViewPremiumEntrance(view));
  vibration();
}

function selectDate(iso) {
  state.selectedDate = iso;
  const date = parseISO(iso);
  state.weekAnchor = startOfWeek(date);
  render();
}

function moveWeek(direction) {
  state.weekAnchor = addDays(state.weekAnchor, direction * 7);
  state.selectedDate = toISO(state.weekAnchor);
  render();
}

function timeToMinutesSafe(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return 0;
  return (Number(match[1]) * 60) + Number(match[2]);
}

function minutesToTime(totalMinutes) {
  const normalized = ((Number(totalMinutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

function setEventEndFromDuration(durationMinutes = 60) {
  const form = $('#eventForm');
  if (!form?.elements?.time || !form?.elements?.endTime) return;
  const start = timeToMinutesSafe(form.elements.time.value);
  form.elements.endTime.value = minutesToTime(start + Math.max(1, Number(durationMinutes) || 60));
  updateDurationPresetState(Math.max(1, Number(durationMinutes) || 60));
}

function durationFromEventTimes() {
  const form = $('#eventForm');
  const start = timeToMinutesSafe(form.elements.time.value);
  const end = timeToMinutesSafe(form.elements.endTime.value);
  return end - start;
}

function updateDurationPresetState(durationMinutes) {
  document.querySelectorAll('[data-duration-minutes]').forEach((button) => {
    button.classList.toggle('is-active', Number(button.dataset.durationMinutes) === Number(durationMinutes));
  });
}

function openEventDialog(eventId = null) {
  const dialog = $('#eventDialog');
  const form = $('#eventForm');
  const data = store.getState();
  form.reset();
  renderDialogMembers(data);
  form.elements.eventId.value = '';
  form.elements.date.value = state.selectedDate;
  form.elements.time.value = new Date().toTimeString().slice(0, 5);
  setEventEndFromDuration(60);
  form.elements.allDay.checked = false;
  form.elements.recurrence.value = 'none';
  form.elements.reminderMinutes.value = '60';
  form.elements.recurrenceUntil.value = toISO(addDays(parseISO(state.selectedDate), 90));
  $('#recurrenceUntilField').hidden = true;
  $('#seriesEditNote').hidden = true;
  $('#deleteSeriesButton').hidden = true;
  toggleAllDayFields(false);
  $('#dialogTitle').textContent = 'Ajouter à la vie de famille';
  $('#eventSubmitButton').innerHTML = `Créer le moment ${icon('arrow-up-right')}`;
  $('#deleteCurrentEventButton').hidden = true;

  if (eventId) {
    const item = data.events.find((event) => event.id === eventId);
    if (!item) return;
    form.elements.eventId.value = item.id;
    form.elements.title.value = item.title;
    form.elements.date.value = item.date;
    form.elements.time.value = item.time;
    form.elements.endTime.value = minutesToTime(timeToMinutesSafe(item.time) + Number(item.duration || 60));
    updateDurationPresetState(Number(item.duration || 60));
    form.elements.category.value = item.category;
    form.elements.location.value = item.location || '';
    form.elements.notes.value = item.notes || '';
    form.elements.allDay.checked = Boolean(item.allDay);
    form.elements.responsibleMemberId.value = item.responsibleMemberId || '';
    form.elements.reminderMinutes.value = item.reminderMinutes === null || item.reminderMinutes === undefined ? '' : String(item.reminderMinutes);
    form.elements.recurrence.value = 'none';
    $('#seriesEditNote').hidden = !item.seriesId;
    $('#deleteSeriesButton').hidden = !item.seriesId;
    toggleAllDayFields(Boolean(item.allDay));
    form.querySelectorAll('input[name="memberIds"]').forEach((input) => { input.checked = item.memberIds.includes(input.value); });
    $('#dialogTitle').textContent = 'Modifier ce moment';
    $('#eventSubmitButton').innerHTML = `Enregistrer ${icon('check')}`;
    $('#deleteCurrentEventButton').hidden = false;
  }

  dialog.showModal();
  requestAnimationFrame(() => form.elements.title.focus());
  vibration();
}

function closeEventDialog() { if ($('#eventDialog').open) $('#eventDialog').close(); }

function toggleAllDayFields(allDay) {
  const form = $('#eventForm');
  form.elements.time.disabled = allDay;
  form.elements.endTime.disabled = allDay;
  $('#durationPresets')?.toggleAttribute('hidden', allDay);
  if (allDay) {
    form.elements.time.value = '00:00';
    form.elements.endTime.value = '23:59';
  } else if (form.elements.time.value === '00:00') {
    form.elements.time.value = new Date().toTimeString().slice(0, 5);
    setEventEndFromDuration(60);
  } else if (!form.elements.endTime.value) {
    setEventEndFromDuration(60);
  }
}

function daysInMonth(year, monthIndex) { return new Date(year, monthIndex + 1, 0).getDate(); }

function generateRecurrenceDates(startIso, rule, untilIso) {
  const start = parseISO(startIso);
  const until = parseISO(untilIso || startIso);
  if (rule === 'none') return [startIso];
  const dates = [];
  let cursor = new Date(start);
  const originalDay = start.getDate();
  for (let index = 0; index < 366 && cursor <= until; index += 1) {
    dates.push(toISO(cursor));
    if (rule === 'daily') cursor = addDays(cursor, 1);
    else if (rule === 'weekly') cursor = addDays(cursor, 7);
    else if (rule === 'monthly') {
      const nextMonth = cursor.getMonth() + 1;
      const nextYear = cursor.getFullYear() + Math.floor(nextMonth / 12);
      const normalizedMonth = ((nextMonth % 12) + 12) % 12;
      cursor = new Date(nextYear, normalizedMonth, Math.min(originalDay, daysInMonth(nextYear, normalizedMonth)));
    } else if (rule === 'yearly') {
      const year = cursor.getFullYear() + 1;
      cursor = new Date(year, start.getMonth(), Math.min(originalDay, daysInMonth(year, start.getMonth())));
    } else break;
  }
  return dates;
}

function handleEventSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const memberIds = form.getAll('memberIds');
  if (!memberIds.length) { showToast('Choisis au moins un membre.'); return; }
  const eventId = String(form.get('eventId') || '');
  const allDay = form.get('allDay') === 'on';
  const recurrenceRule = eventId ? 'none' : String(form.get('recurrence') || 'none');
  const customDuration = allDay ? 1440 : durationFromEventTimes();
  if (!allDay && customDuration <= 0) { showToast('L’heure de fin doit être après l’heure de début'); return; }
  const basePayload = {
    title: String(form.get('title')).trim(),
    date: String(form.get('date')),
    time: allDay ? '00:00' : String(form.get('time') || '00:00'),
    duration: customDuration,
    allDay,
    category: String(form.get('category')),
    location: String(form.get('location')).trim(),
    notes: String(form.get('notes')).trim(),
    responsibleMemberId: String(form.get('responsibleMemberId') || ''),
    reminderMinutes: form.get('reminderMinutes') === '' ? null : Number(form.get('reminderMinutes')),
    memberIds
  };

  if (eventId) {
    const existing = store.getState().events.find((item) => item.id === eventId);
    store.updateEvent(eventId, { ...basePayload, seriesId: existing?.seriesId || '', recurrenceRule: existing?.recurrenceRule || 'none' });
    showToast(navigator.onLine ? 'Modification enregistrée.' : 'Modification gardée hors-ligne.');
  } else if (recurrenceRule !== 'none') {
    const until = String(form.get('recurrenceUntil') || '');
    if (!until || until < basePayload.date) { showToast('Choisis une date de fin valide pour la répétition.'); return; }
    const dates = generateRecurrenceDates(basePayload.date, recurrenceRule, until);
    const seriesId = crypto.randomUUID?.() || `series-${Date.now()}`;
    store.addEvents(dates.map((date) => ({ ...basePayload, date, seriesId, recurrenceRule })));
    showToast(`${dates.length} rendez-vous récurrents créés.`);
  } else {
    store.addEvent({ ...basePayload, seriesId: '', recurrenceRule: 'none' });
    showToast(navigator.onLine ? 'Le moment a été ajouté.' : 'Moment ajouté hors-ligne.');
  }
  state.selectedDate = basePayload.date;
  state.weekAnchor = startOfWeek(parseISO(state.selectedDate));
  closeEventDialog();
}
function deleteCurrentEvent() {
  const form = $('#eventForm');
  const id = form.elements.eventId.value;
  const item = store.getState().events.find((event) => event.id === id);
  if (!item) return;
  if (!confirm(`Supprimer « ${item.title} » ?`)) return;
  store.deleteEvent(id);
  closeEventDialog();
  showToast(navigator.onLine ? 'Événement supprimé.' : 'Suppression gardée hors-ligne.');
}

function deleteCurrentSeries() {
  const id = $('#eventForm').elements.eventId.value;
  const item = store.getState().events.find((event) => event.id === id);
  if (!item?.seriesId) return;
  if (!confirm(`Supprimer toute la série « ${item.title} » ?`)) return;
  store.deleteSeries(item.seriesId);
  closeEventDialog();
  showToast('Toute la série a été supprimée.');
}

function openTasksDialog() {
  renderTasksDialog();
  $('#tasksDialog').showModal();
  vibration();
}
function closeTasksDialog() { if ($('#tasksDialog').open) $('#tasksDialog').close(); }

function openTaskDialog(taskId = null) {
  const dialog = $('#taskDialog');
  const form = $('#taskForm');
  const data = store.getState();
  form.reset();
  renderDialogMembers(data);
  form.elements.taskId.value = '';
  form.elements.dueDate.value = state.selectedDate || toISO(new Date());
  form.elements.reminderMinutes.value = '60';
  $('#taskDialogTitle').textContent = 'Ajouter une tâche';
  $('#taskSubmitButton').innerHTML = `Ajouter la tâche ${icon('check')}`;
  $('#deleteTaskButton').hidden = true;
  if (taskId) {
    const task = data.tasks.find((item) => item.id === taskId);
    if (!task) return;
    form.elements.taskId.value = task.id;
    form.elements.title.value = task.title;
    form.elements.dueDate.value = task.dueDate;
    form.elements.dueTime.value = task.dueTime || '';
    form.elements.priority.value = task.priority || 'normal';
    form.elements.responsibleMemberId.value = task.responsibleMemberId || '';
    form.elements.reminderMinutes.value = task.reminderMinutes === null || task.reminderMinutes === undefined ? '' : String(task.reminderMinutes);
    form.elements.notes.value = task.notes || '';
    $('#taskDialogTitle').textContent = 'Modifier la tâche';
    $('#taskSubmitButton').innerHTML = `Enregistrer ${icon('check')}`;
    $('#deleteTaskButton').hidden = false;
  }
  closeTasksDialog();
  dialog.showModal();
  requestAnimationFrame(() => form.elements.title.focus());
  vibration();
}
function closeTaskDialog() { if ($('#taskDialog').open) $('#taskDialog').close(); }

function handleTaskSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const taskId = String(form.get('taskId') || '');
  const payload = {
    title: String(form.get('title') || '').trim(),
    dueDate: String(form.get('dueDate') || ''),
    dueTime: String(form.get('dueTime') || ''),
    priority: String(form.get('priority') || 'normal'),
    responsibleMemberId: String(form.get('responsibleMemberId') || ''),
    reminderMinutes: form.get('reminderMinutes') === '' ? null : Number(form.get('reminderMinutes')),
    notes: String(form.get('notes') || '').trim(),
    status: taskId ? (store.getState().tasks.find((task) => task.id === taskId)?.status || 'pending') : 'pending'
  };
  if (!payload.title || !payload.dueDate) return;
  if (taskId) { store.updateTask(taskId, payload); showToast('Tâche mise à jour.'); }
  else { store.addTask(payload); showToast('Tâche ajoutée à la famille.'); }
  closeTaskDialog();
  renderTasksDialog();
}

function deleteCurrentTask() {
  const id = $('#taskForm').elements.taskId.value;
  const task = store.getState().tasks.find((item) => item.id === id);
  if (!task || !confirm(`Supprimer « ${task.title} » ?`)) return;
  store.deleteTask(id);
  closeTaskDialog();
  showToast('Tâche supprimée.');
}

function openShoppingDialog() {
  renderShoppingDialog();
  $('#shoppingDialog').showModal();
  requestAnimationFrame(() => $('#shoppingQuickName').focus());
  vibration();
}
function closeShoppingDialog() { if ($('#shoppingDialog').open) $('#shoppingDialog').close(); }

function handleShoppingSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const name = String(form.get('name') || '').trim();
  if (!name) return;
  store.addShoppingItem({ name, quantity: String(form.get('quantity') || '').trim(), category: String(form.get('category') || 'other') });
  event.currentTarget.reset();
  event.currentTarget.elements.category.value = 'grocery';
  renderShoppingDialog();
  showToast('Ajouté à la liste de courses.');
  requestAnimationFrame(() => $('#shoppingQuickName').focus());
}

function openRoutinesDialog() {
  renderRoutinesDialog();
  $('#routinesDialog').showModal();
  vibration();
}
function closeRoutinesDialog() { if ($('#routinesDialog').open) $('#routinesDialog').close(); }

function openRoutineDialog(routineId = null) {
  const data = store.getState();
  const form = $('#routineForm');
  form.reset();
  renderDialogMembers(data);
  form.elements.routineId.value = '';
  form.elements.active.checked = true;
  form.querySelectorAll('input[name="weekdays"]').forEach((input) => { input.checked = [1,2,3,4,5].includes(Number(input.value)); });
  $('#routineDialogTitle').textContent = 'Créer une routine';
  $('#routineSubmitButton').innerHTML = `Créer la routine ${icon('check')}`;
  $('#deleteRoutineButton').hidden = true;
  if (routineId) {
    const routine = data.routines.find((item) => item.id === routineId);
    if (!routine) return;
    form.elements.routineId.value = routine.id;
    form.elements.title.value = routine.title;
    form.elements.time.value = routine.time || '';
    form.elements.responsibleMemberId.value = routine.responsibleMemberId || '';
    form.elements.notes.value = routine.notes || '';
    form.elements.active.checked = routine.active !== false;
    form.querySelectorAll('input[name="weekdays"]').forEach((input) => { input.checked = routine.weekdays.includes(Number(input.value)); });
    $('#routineDialogTitle').textContent = 'Modifier la routine';
    $('#routineSubmitButton').innerHTML = `Enregistrer ${icon('check')}`;
    $('#deleteRoutineButton').hidden = false;
  }
  closeRoutinesDialog();
  $('#routineDialog').showModal();
  requestAnimationFrame(() => form.elements.title.focus());
  vibration();
}
function closeRoutineDialog() { if ($('#routineDialog').open) $('#routineDialog').close(); }

function handleRoutineSubmit(event) {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const id = String(formData.get('routineId') || '');
  const weekdays = formData.getAll('weekdays').map(Number);
  if (!weekdays.length) { showToast('Choisis au moins un jour.'); return; }
  const payload = {
    title: String(formData.get('title') || '').trim(),
    weekdays,
    time: String(formData.get('time') || ''),
    responsibleMemberId: String(formData.get('responsibleMemberId') || ''),
    notes: String(formData.get('notes') || '').trim(),
    active: formData.get('active') === 'on'
  };
  if (!payload.title) return;
  if (id) { store.updateRoutine(id, payload); showToast('Routine mise à jour.'); }
  else { store.addRoutine(payload); showToast('Routine créée.'); }
  closeRoutineDialog();
  renderRoutinesDialog();
}

function deleteCurrentRoutine() {
  const id = $('#routineForm').elements.routineId.value;
  const routine = store.getState().routines.find((item) => item.id === id);
  if (!routine || !confirm(`Supprimer la routine « ${routine.title} » ?`)) return;
  store.deleteRoutine(id);
  closeRoutineDialog();
  showToast('Routine supprimée.');
}

function parentContent(data, parentType, parentId) {
  return parentType === 'event' ? data.events.find((item) => item.id === parentId) : data.tasks.find((item) => item.id === parentId);
}

function renderCollaborationDialog() {
  const parentType = $('#collaborationParentType').value;
  const parentId = $('#collaborationParentId').value;
  if (!parentType || !parentId) return;
  const data = store.getState();
  const parent = parentContent(data, parentType, parentId);
  if (!parent) return;
  const items = contentItems(data, parentType, parentId);
  const user = store.getCurrentUser();
  $('#collaborationTypeLabel').textContent = 'Documents & échanges';
  $('#collaborationTitle').textContent = parent.title;
  $('#collaborationSubtitle').textContent = parentType === 'event' ? `Rendez-vous · ${parent.allDay ? 'Toute la journée' : parent.time} · ${capitalize(longDate.format(parseISO(parent.date)))}` : `Tâche · ${taskDueLabel(parent)}`;

  const reactionTypes = ['👍','❤️','✅'];
  $('#collaborationReactions').innerHTML = reactionTypes.map((reaction) => {
    const matching = items.reactions.filter((item) => item.reaction === reaction);
    const active = matching.some((item) => item.userId === user?.id);
    return `<button class="reaction-button tap ${active ? 'is-active' : ''}" type="button" data-reaction="${reaction}"><span>${reaction}</span><strong>${matching.length || ''}</strong></button>`;
  }).join('');

  const readerIds = [...new Set(items.reads.map((item) => item.userId))];
  $('#collaborationSeen').innerHTML = readerIds.length
    ? `${icon('eye')}<span>Vu par ${readerIds.map((id) => escapeHTML(userDisplayName(data, id))).join(', ')}</span>`
    : `${icon('eye')}<span>Pas encore consulté par la famille</span>`;

  $('#commentCount').textContent = `${items.comments.length}`;
  $('#commentList').innerHTML = items.comments.length ? items.comments.map((comment) => {
    const mine = comment.authorUserId === user?.id;
    const canDelete = mine || user?.role === 'admin';
    return `<article class="comment-item ${mine ? 'is-mine' : ''}"><div class="comment-avatar">${renderAvatar(memberForUserId(data, comment.authorUserId), { fallback: initialsFor(userDisplayName(data, comment.authorUserId)) })}</div><div class="comment-bubble"><div><strong>${escapeHTML(userDisplayName(data, comment.authorUserId))}</strong><time>${formatActivityTime(comment.createdAt)}</time></div><p>${escapeHTML(comment.body)}</p></div>${canDelete ? `<button class="comment-delete tap" type="button" data-delete-comment="${comment.id}" aria-label="Supprimer">${icon('trash')}</button>` : ''}</article>`;
  }).join('') : `<div class="collaboration-empty">Aucun commentaire. Écris le premier message.</div>`;

  $('#attachmentCount').textContent = `${items.attachments.length}`;
  $('#attachmentList').innerHTML = items.attachments.length ? items.attachments.map((attachment) => {
    const canDelete = attachment.uploadedBy === user?.id || user?.role === 'admin';
    return `<article class="attachment-item"><button class="attachment-open tap" type="button" data-open-attachment="${attachment.id}"><span class="attachment-icon">${attachment.mimeType === 'application/pdf' ? 'PDF' : 'IMG'}</span><div><strong>${escapeHTML(attachment.fileName)}</strong><small>${formatFileSize(attachment.fileSize)}</small></div></button>${canDelete ? `<button class="comment-delete tap" type="button" data-delete-attachment="${attachment.id}" aria-label="Supprimer">${icon('trash')}</button>` : ''}</article>`;
  }).join('') : `<div class="collaboration-empty">Aucune pièce jointe.</div>`;

  const activityLabels = { created:'a créé', updated:'a modifié', deleted:'a supprimé', completed:'a terminé', reopened:'a rouvert', commented:'a commenté', attached:'a joint un fichier' };
  $('#collaborationActivity').innerHTML = items.activity.length ? items.activity.slice(0, 12).map((entry) => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${escapeHTML(userDisplayName(data, entry.actorUserId))} ${escapeHTML(activityLabels[entry.action] || 'a mis à jour')}</strong><p>${escapeHTML(entry.summary || parent.title)}</p><time>${formatActivityTime(entry.createdAt)}</time></div></div>`).join('') : `<div class="collaboration-empty">L’historique commencera avec les prochaines modifications.</div>`;
}

async function openCollaborationDialog(parentType, parentId) {
  $('#collaborationParentType').value = parentType;
  $('#collaborationParentId').value = parentId;
  renderCollaborationDialog();
  $('#collaborationDialog').showModal();
  vibration();
  try { await store.markRead(parentType, parentId); renderCollaborationDialog(); } catch { /* le vu par se synchronisera plus tard */ }
}
function closeCollaborationDialog() { if ($('#collaborationDialog').open) $('#collaborationDialog').close(); }

async function submitComment(event) {
  event.preventDefault();
  const input = $('#commentInput');
  const body = input.value.trim();
  if (!body) return;
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await store.addComment($('#collaborationParentType').value, $('#collaborationParentId').value, body);
    input.value = '';
    renderCollaborationDialog();
  } catch (error) { showToast(error.message || 'Commentaire impossible.'); }
  finally { button.disabled = false; }
}

async function handleCollaborationAttachment(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  try {
    showToast('Envoi du fichier…');
    await store.uploadAttachment($('#collaborationParentType').value, $('#collaborationParentId').value, file);
    renderCollaborationDialog();
    showToast('Pièce jointe ajoutée.');
  } catch (error) { showToast(error.message || 'Envoi impossible.'); }
  finally { event.currentTarget.value = ''; }
}

function searchAll(query, filter = state.searchFilter) {
  const data = store.getState();
  const q = String(query || '').trim().toLocaleLowerCase('fr');
  if (q.length < 2) return [];
  const results = [];
  const push = (type, id, title, detail, haystack, parentType = '', parentId = '') => {
    if (String(haystack || '').toLocaleLowerCase('fr').includes(q)) results.push({ type, id, title, detail, parentType, parentId });
  };
  data.events.forEach((item) => push('event', item.id, item.title, `${item.date} · ${item.allDay ? 'journée' : item.time}`, `${item.title} ${item.location} ${item.notes}`));
  data.tasks.forEach((item) => push('task', item.id, item.title, taskDueLabel(item), `${item.title} ${item.notes}`));
  data.shoppingItems.forEach((item) => push('shopping', item.id, item.name, 'Courses', `${item.name} ${item.quantity} ${shoppingCategory(item).label}`));
  data.routines.forEach((item) => push('routine', item.id, item.title, 'Routine', `${item.title} ${item.notes} ${routineDaysLabel(item)}`));
  data.comments.forEach((item) => push('comment', item.id, item.body, 'Commentaire', item.body, item.parentType, item.parentId));
  data.attachments.forEach((item) => push('attachment', item.id, item.fileName, 'Pièce jointe', item.fileName, item.parentType, item.parentId));
  data.activity.forEach((item) => {
    const parentType = item.entityType === 'event' || item.entityType === 'task' ? item.entityType : '';
    if (parentType) push('activity', item.id, item.summary || 'Activité familiale', 'Historique', `${item.summary} ${item.action}`, parentType, item.entityId);
  });
  const allowed = filter === 'all' ? results : filter === 'attachment' ? results.filter((item) => ['attachment','comment','activity'].includes(item.type)) : results.filter((item) => item.type === filter);
  return allowed.slice(0, 40);
}

function renderSearchResults() {
  const results = searchAll($('#globalSearchInput').value, state.searchFilter);
  const box = $('#globalSearchResults');
  if ($('#globalSearchInput').value.trim().length < 2) {
    const data = store.getState();
    const labels = { created:'a créé', updated:'a modifié', deleted:'a supprimé', completed:'a terminé', reopened:'a rouvert', commented:'a commenté', attached:'a joint un fichier', shopping_added:'a ajouté aux courses', shopping_checked:'a pris', shopping_updated:'a modifié une course', shopping_deleted:'a retiré une course', routine_created:'a créé une routine', routine_updated:'a modifié une routine', routine_deleted:'a supprimé une routine' };
    box.innerHTML = data.activity?.length ? `<div class="search-recent-title"><strong>Activité récente</strong><small>Dernières actions de la famille</small></div>${data.activity.slice(0, 12).map((item) => `<div class="search-activity-row"><span class="activity-dot"></span><div><strong>${escapeHTML(userDisplayName(data, item.actorUserId))} ${escapeHTML(labels[item.action] || 'a mis à jour')}</strong><small>${escapeHTML(item.summary || 'AGENDA')} · ${formatActivityTime(item.createdAt)}</small></div></div>`).join('')}` : `<div class="empty-state"><strong>Recherche dans toute la famille</strong><p>Écris au moins deux lettres. L’activité récente apparaîtra ici dès les prochaines modifications.</p></div>`;
    return;
  }
  box.innerHTML = results.length ? results.map((item) => `<button class="search-result tap" type="button" data-search-result-type="${item.type}" data-search-result-id="${item.id}" data-search-parent-type="${item.parentType}" data-search-parent-id="${item.parentId}"><span class="search-result-icon">${item.type === 'event' ? icon('calendar') : item.type === 'task' ? icon('clipboard') : item.type === 'shopping' ? icon('cart') : item.type === 'routine' ? icon('repeat') : item.type === 'attachment' ? icon('paperclip') : item.type === 'activity' ? icon('history') : icon('message')}</span><div><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.detail)}</small></div>${icon('chevron-right')}</button>`).join('') : `<div class="empty-state"><strong>Aucun résultat</strong><p>Essaie un autre mot.</p></div>`;
}

function openSearchDialog() {
  $$('[data-search-filter]').forEach((button) => button.classList.toggle('is-active', button.dataset.searchFilter === state.searchFilter));
  $('#searchDialog').showModal();
  requestAnimationFrame(() => $('#globalSearchInput').focus());
  vibration();
}
function closeSearchDialog() { if ($('#searchDialog').open) $('#searchDialog').close(); }

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function notificationsSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window && Boolean(VAPID_PUBLIC_KEY);
}

async function currentPushSubscription() {
  if (!notificationsSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function renderNotificationIndicator(data = store.getState()) {
  const dot = $('#notificationStatusDot');
  if (!dot) return;
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  const enabled = Boolean(data.notificationPreferences?.pushEnabled && permission === 'granted');
  dot.classList.toggle('is-active', enabled);
  dot.classList.toggle('is-blocked', permission === 'denied');
  $('#notificationSettingCopy').textContent = enabled ? 'Rappels avancés actifs sur cet appareil' : permission === 'denied' ? 'Notifications bloquées dans les réglages du navigateur' : 'Rappels ciblés, changements, routines et résumé personnalisé';
}

async function renderNotificationDialog() {
  const data = store.getState();
  const prefs = data.notificationPreferences || {};
  $('#eventRemindersToggle').checked = prefs.eventReminders !== false;
  $('#taskRemindersToggle').checked = prefs.taskReminders !== false;
  $('#routineRemindersToggle').checked = prefs.routineReminders !== false;
  $('#changeAlertsToggle').checked = prefs.changeAlerts !== false;
  $('#departureRemindersToggle').checked = prefs.departureReminders !== false;
  $('#departureMinutesSelect').value = String(prefs.departureMinutes || 20);
  $('#overdueTaskRemindersToggle').checked = prefs.overdueTaskReminders !== false;
  $('#dailySummaryToggle').checked = prefs.dailySummary !== false;
  $('#dailySummaryTime').value = prefs.dailySummaryTime || '07:30';
  $('#snoozeMinutesSelect').value = String(prefs.snoozeMinutes || 30);
  const supported = notificationsSupported();
  const permission = supported ? Notification.permission : 'unsupported';
  let subscription = null;
  if (supported && permission === 'granted') { try { subscription = await currentPushSubscription(); } catch { subscription = null; } }
  const active = Boolean(subscription);
  $('#notificationHero').classList.toggle('is-active', active);
  $('#notificationHeroTitle').textContent = !supported ? 'Notifications non disponibles' : permission === 'denied' ? 'Notifications bloquées' : active ? 'Notifications activées' : 'Activer les notifications';
  $('#notificationHeroCopy').textContent = !supported
    ? 'Installe AGENDA comme application sur un appareil compatible pour utiliser les rappels système.'
    : permission === 'denied' ? 'Autorise AGENDA dans les réglages du navigateur ou de l’iPhone, puis reviens ici.'
    : active ? 'Cet appareil peut recevoir les rappels même quand AGENDA n’est pas ouvert.'
    : 'AGENDA peut prévenir les bonnes personnes au bon moment.';
  $('#enableNotificationsButton').textContent = active ? 'Désactiver' : 'Activer';
  $('#enableNotificationsButton').disabled = !supported || permission === 'denied';
  $('#testNotificationButton').disabled = !active;
  $('#notificationSupportNote').textContent = !supported ? 'Sur iPhone, les notifications Web Push nécessitent une PWA ajoutée à l’écran d’accueil.' : active ? 'Les rappels sont ciblés selon les personnes concernées et peuvent être reportés depuis la notification' : 'L’activation doit être faite sur chaque téléphone qui souhaite recevoir des rappels';
}

async function openNotificationDialog() {
  await renderNotificationDialog();
  $('#notificationDialog').showModal();
  vibration();
}
function closeNotificationDialog() { if ($('#notificationDialog').open) $('#notificationDialog').close(); }

async function toggleSystemNotifications() {
  if (!notificationsSupported()) { showToast('Notifications système non disponibles sur cet appareil.'); return; }
  const button = $('#enableNotificationsButton');
  button.disabled = true;
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    if (existing) {
      const endpoint = existing.endpoint;
      await existing.unsubscribe();
      await store.removePushSubscription(endpoint);
      showToast('Notifications désactivées sur cet appareil.');
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Autorisation de notification refusée.');
      const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) });
      await store.savePushSubscription(subscription);
      showToast('Notifications activées sur cet appareil.');
    }
    renderNotificationIndicator();
    await renderNotificationDialog();
  } catch (error) { showToast(error.message || 'Activation impossible.'); }
  finally { button.disabled = false; }
}

async function saveNotificationPreferences() {
  const button = $('#saveNotificationPreferencesButton');
  button.disabled = true;
  try {
    await store.saveNotificationPreferences({
      eventReminders: $('#eventRemindersToggle').checked,
      taskReminders: $('#taskRemindersToggle').checked,
      routineReminders: $('#routineRemindersToggle').checked,
      changeAlerts: $('#changeAlertsToggle').checked,
      departureReminders: $('#departureRemindersToggle').checked,
      departureMinutes: Number($('#departureMinutesSelect').value || 20),
      overdueTaskReminders: $('#overdueTaskRemindersToggle').checked,
      dailySummary: $('#dailySummaryToggle').checked,
      dailySummaryTime: $('#dailySummaryTime').value || '07:30',
      snoozeMinutes: Number($('#snoozeMinutesSelect').value || 30)
    });
    showToast('Préférences de notification enregistrées.');
    await renderNotificationDialog();
  } catch (error) { showToast(error.message || 'Enregistrement impossible.'); }
  finally { button.disabled = false; }
}

async function testNotification() {
  try {
    if (Notification.permission !== 'granted') throw new Error('Active d’abord les notifications.');
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification('AGENDA · Test', {
      body: `${familyDisplayName(store.getState())} est prête à recevoir ses rappels.`,
      icon: './assets/icons/agenda_app_icon_192x192.png',
      badge: './assets/icons/agenda_app_icon_96x96.png',
      tag: 'agenda-test',
      data: { url: './' }
    });
  } catch (error) { showToast(error.message || 'Test impossible.'); }
}

async function processNotificationAction() {
  if (!state.notificationAction || !state.notificationEntityId) return false;
  const action = state.notificationAction;
  const entityType = state.notificationEntityType;
  const entityId = state.notificationEntityId;
  try {
    if (action === 'snooze') {
      await store.snoozeNotification(entityType, entityId, state.notificationMinutes || 30);
      showToast(`Rappel reporté de ${state.notificationMinutes || 30} min`);
    } else if (action === 'completeTask' && entityType === 'task') {
      store.toggleTask(entityId, true);
      showToast('Tâche terminée depuis la notification');
    }
    state.notificationAction = '';
    state.notificationEntityType = '';
    state.notificationEntityId = '';
    history.replaceState({}, '', location.pathname);
    return true;
  } catch (error) {
    showToast(error.message || 'Action de notification impossible');
    return false;
  }
}

function setupMobileViewportStability() {
  const viewport = window.visualViewport;
  const sync = () => {
    const keyboardLikelyOpen = Boolean(viewport && window.innerHeight - viewport.height > 120);
    const keyboardOffset = keyboardLikelyOpen && viewport ? Math.max(0, Math.round(window.innerHeight - (viewport.height + viewport.offsetTop))) : 0;
    document.documentElement.classList.toggle('keyboard-open', keyboardLikelyOpen);
    document.documentElement.style.setProperty('--keyboard-offset', `${keyboardOffset}px`);
  };
  viewport?.addEventListener('resize', sync);
  viewport?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  document.addEventListener('focusout', () => setTimeout(sync, 250));
  window.addEventListener('orientationchange', () => setTimeout(sync, 300));
  sync();
}


function premiumAnimateNode(node, delay = 0) {
  if (!(node instanceof Element) || motionIsReduced()) return;
  if (node.classList.contains('premium-enter')) return;
  node.style.setProperty('--premium-delay', `${Math.min(delay, 180)}ms`);
  node.classList.add('premium-enter');
}

function premiumAnimateContainer(container) {
  if (!(container instanceof Element)) return;
  const selector = '.hero-card, .quick-action-card, .family-tool-card, .family-feed-card, .tasks-home-card, .event-card, .task-card, .family-card, .memory-card, .month-shell, .month-selection, .settings-group, .setup-progress-card, .collaboration-entry, .empty-state';
  const nodes = [];
  if (container.matches?.(selector)) nodes.push(container);
  nodes.push(...container.querySelectorAll?.(selector) || []);
  nodes.slice(0, 20).forEach((node, index) => premiumAnimateNode(node, index * 24));
}

function replayActiveViewPremiumEntrance(view = state.activeView) {
  const section = document.querySelector(`[data-view-section="${view}"]`);
  if (!section || motionIsReduced()) return;
  const nodes = [...section.querySelectorAll('.hero-card, .quick-action-card, .family-tool-card, .family-feed-card, .tasks-home-card, .event-card, .task-card, .family-card, .memory-card, .month-shell, .month-selection')].slice(0, 18);
  nodes.forEach((node) => node.classList.remove('premium-enter'));
  requestAnimationFrame(() => nodes.forEach((node, index) => premiumAnimateNode(node, index * 24)));
}

function setupPremiumUX() {
  const reducedMotion = () => Boolean(motionIsReduced());
  let scrollFrame = 0;
  const syncScrollState = () => {
    scrollFrame = 0;
    document.body.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = requestAnimationFrame(syncScrollState);
  }, { passive: true });
  syncScrollState();

  const releasePressed = () => $$('.is-pressed').forEach((element) => element.classList.remove('is-pressed'));
  document.addEventListener('pointerdown', (event) => {
    const target = event.target.closest('.tap, .primary-button, .secondary-button, .quick-action-card, .family-tool-card, .nav-item, .nav-add');
    if (!target || target.disabled || target.getAttribute('aria-disabled') === 'true') return;
    target.classList.add('is-pressed');
    if (reducedMotion()) return;
    const rect = target.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const ripple = document.createElement('span');
    ripple.className = 'premium-ripple';
    ripple.style.setProperty('--ripple-x', `${event.clientX - rect.left}px`);
    ripple.style.setProperty('--ripple-y', `${event.clientY - rect.top}px`);
    target.classList.add('premium-ripple-host');
    target.append(ripple);
    ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
  }, { passive: true });
  document.addEventListener('pointerup', releasePressed, { passive: true });
  document.addEventListener('pointercancel', releasePressed, { passive: true });
  window.addEventListener('blur', releasePressed);

  const valueIds = new Set(['heroEventCount','shoppingShortcutCount','routineShortcutCount','familyFeedCount','tasksHomeSummary']);
  const valueObserver = new MutationObserver((records) => {
    if (reducedMotion()) return;
    for (const record of records) {
      const element = record.target.nodeType === Node.TEXT_NODE ? record.target.parentElement : record.target;
      const target = element?.closest?.('[id]');
      if (!target || !valueIds.has(target.id)) continue;
      target.classList.remove('premium-value-pop');
      requestAnimationFrame(() => target.classList.add('premium-value-pop'));
    }
  });
  valueIds.forEach((id) => { const element = document.getElementById(id); if (element) valueObserver.observe(element, { childList:true, characterData:true, subtree:true }); });

  const contentObserver = new MutationObserver((records) => {
    for (const record of records) {
      record.addedNodes.forEach((node) => { if (node instanceof Element) premiumAnimateContainer(node); });
    }
  });
  contentObserver.observe(document.body, { childList:true, subtree:true });
  premiumAnimateContainer(document.querySelector('.view.is-active'));
}

function setupPersistentMotion() {
  let criticalAnimations = [];
  let watchdogTimer = 0;
  let lastProbe = new Map();

  const cancelCritical = () => {
    criticalAnimations.forEach((item) => { try { item.animation.cancel(); } catch {} });
    criticalAnimations = [];
    lastProbe.clear();
  };

  const makeSpin = (element, duration, reverse = false) => {
    if (!element || motionIsReduced()) return;
    const direction = reverse ? -360 : 360;
    try {
      const animation = element.animate([
        { transform: 'rotate(0deg) translateZ(0)' },
        { transform: `rotate(${direction}deg) translateZ(0)` }
      ], { duration, iterations: Infinity, easing: 'linear' });
      animation.id = `agenda-persistent-${duration}-${reverse ? 'reverse' : 'forward'}`;
      criticalAnimations.push({ element, animation, duration, reverse });
    } catch {
      element.classList.add('persistent-motion-css');
    }
  };

  const rebuildCritical = () => {
    cancelCritical();
    if (motionIsReduced() || document.hidden) return;
    const mode = getMotionMode();
    const multiplier = mode === 'subtle' ? 1.45 : 1;
    makeSpin(document.querySelector('.date-orbit-ring'), 8000 * multiplier, false);
    makeSpin(document.querySelector('.pulse-orbit'), 20000 * multiplier, false);
    makeSpin(document.querySelector('.orbit-core'), 20000 * multiplier, true);
  };

  const watchdog = () => {
    if (document.hidden || motionIsReduced()) return;
    let needsRestart = false;
    for (const item of criticalAnimations) {
      const current = Number(item.animation.currentTime || 0);
      const previous = lastProbe.get(item.element);
      if (item.animation.playState !== 'running' || (previous != null && current <= previous + 40)) needsRestart = true;
      lastProbe.set(item.element, current);
    }
    if (needsRestart || criticalAnimations.some((item) => !item.element.isConnected)) rebuildCritical();
  };

  const observer = new MutationObserver((records) => {
    const touchedOrbit = records.some((record) => [...record.addedNodes, ...record.removedNodes].some((node) => node instanceof Element && (node.matches?.('.pulse-orbit,.orbit-core,.date-orbit-ring') || node.querySelector?.('.pulse-orbit,.orbit-core,.date-orbit-ring'))));
    if (touchedOrbit) requestAnimationFrame(rebuildCritical);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  const resume = () => { if (!document.hidden) requestAnimationFrame(rebuildCritical); };
  document.addEventListener('visibilitychange', resume);
  window.addEventListener('pageshow', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('agenda-motion-change', rebuildCritical);
  watchdogTimer = window.setInterval(watchdog, 3500);
  rebuildCritical();

  return () => {
    observer.disconnect();
    cancelCritical();
    window.clearInterval(watchdogTimer);
  };
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `${icon('check')}<span>${escapeHTML(message)}</span>`;
  $('#toastRegion').append(toast);
  setTimeout(() => {
    toast.classList.add('is-leaving');
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

function updateConnection() {
  const pill = $('#connectionPill');
  const online = navigator.onLine;
  const remote = store.isRemoteReady();
  const pending = store.hasPendingChanges();
  pill.classList.toggle('is-offline', !online);
  pill.classList.toggle('has-pending', pending && online);
  pill.querySelector('span:last-child').textContent = !online
    ? pending ? 'Hors-ligne · à synchroniser' : 'Mode hors-ligne'
    : pending ? 'Synchronisation…' : remote ? 'Partagé en direct' : 'Connexion…';
}

function applyAvatarToElement(element, entity) {
  element.classList.toggle('has-photo', Boolean(entity?.avatarUrl));
  if (entity?.avatarUrl) element.innerHTML = `<img src="${escapeHTML(entity.avatarUrl)}" alt="${escapeHTML(entity.displayName || entity.name || 'Photo de profil')}">`;
  else element.textContent = entity?.initials || initialsFor(entity?.displayName || entity?.name || 'FA');
}

function renderAccount() {
  const user = store.getCurrentUser();
  if (!user) return;
  applyAvatarToElement($('#accountAvatar'), { ...user, initials: initialsFor(user.displayName), color: '#224A54' });
  $('#accountName').textContent = user.displayName;
  $('#accountEmail').textContent = user.email || '';
  $('#accountRole').textContent = user.role === 'admin' ? 'Administrateur' : 'Membre';
  $('#profilePhotoHint').textContent = user.avatarUrl
    ? 'Ta photo est visible dans les filtres, les cartes famille et le compte.'
    : 'Ajoute une photo carrée ou portrait : elle sera recadrée automatiquement et visible dans toute la famille.';
  $('#removeProfilePhotoButton').hidden = !user.avatarUrl;
  $('#inviteButton').hidden = user.role !== 'admin';
  $('#exportButton').hidden = false;
  const data = store.getState();
  $('#familyNameInput').value = data.family?.name || 'Famille Hamadi';
  $('#familySymbolInput').value = data.family?.symbol || '🌿';
  $('#familyIdentityPanel').hidden = user.role !== 'admin';
  const familyPhotoPreview = $('#familyPhotoPreview');
  if (data.family?.photoUrl) {
    familyPhotoPreview.classList.add('has-photo');
    familyPhotoPreview.innerHTML = `<img src="${escapeHTML(data.family.photoUrl)}" alt="Photo de ${escapeHTML(familyDisplayName(data))}">`;
  } else {
    familyPhotoPreview.classList.remove('has-photo');
    familyPhotoPreview.innerHTML = `<span>${escapeHTML(data.family?.symbol || '🌿')}</span>`;
  }
  $('#removeFamilyPhotoButton').hidden = !data.family?.photoUrl;
  const accountButton = $('#accountButton');
  accountButton.classList.toggle('with-avatar', Boolean(user.avatarUrl));
  accountButton.innerHTML = user.avatarUrl
    ? `<span class="topbar-avatar has-photo"><img src="${escapeHTML(user.avatarUrl)}" alt="${escapeHTML(user.displayName)}"></span>`
    : icon('user');
}

function openAccountDialog() {
  renderAccount();
  $('#inviteResult').hidden = true;
  $('#accountDialog').showModal();
  vibration();
}

function closeAccountDialog() { if ($('#accountDialog').open) $('#accountDialog').close(); }

async function createInvitation() {
  const button = $('#inviteButton');
  button.disabled = true;
  try {
    const result = await store.createInvitation();
    $('#inviteLink').value = result.link;
    $('#inviteCode').textContent = result.token;
    $('#inviteResult').hidden = false;
    showToast('Invitation créée pour 72 heures.');
  } catch (error) {
    showToast(error.message || 'Invitation impossible.');
  } finally {
    button.disabled = false;
  }
}

async function copyInviteLink() {
  const value = $('#inviteLink').value;
  try {
    await navigator.clipboard.writeText(value);
    showToast('Lien d’invitation copié.');
  } catch {
    window.prompt('Copie ce lien :', value);
  }
}

function setProfilePhotoBusy(busy) {
  $('#removeProfilePhotoButton').disabled = busy;
  const picker = $('#profilePhotoInput');
  picker.disabled = busy;
  const label = document.querySelector('label[for="profilePhotoInput"]');
  if (label) label.classList.toggle('is-busy', busy);
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Lecture du fichier impossible.'));
    reader.readAsDataURL(file);
  });
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Image invalide.'));
    image.src = src;
  });
}

async function optimizeProfilePhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choisis une image valide.');
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  const sourceSize = Math.min(image.width, image.height);
  const sourceX = (image.width - sourceSize) / 2;
  const sourceY = (image.height - sourceSize) / 2;
  context.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, size, size);
  return canvas.toDataURL('image/jpeg', 0.84);
}

async function handleProfilePhotoSelection(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  setProfilePhotoBusy(true);
  try {
    const optimized = await optimizeProfilePhoto(file);
    await store.updateProfilePhoto(optimized);
    render();
    renderAccount();
    showToast('Photo de profil mise à jour.');
  } catch (error) {
    showToast(error.message || 'Impossible de mettre à jour la photo.');
  } finally {
    event.currentTarget.value = '';
    setProfilePhotoBusy(false);
  }
}

async function removeProfilePhoto() {
  if (!confirm('Retirer la photo de profil ?')) return;
  setProfilePhotoBusy(true);
  try {
    await store.updateProfilePhoto(null);
    render();
    renderAccount();
    showToast('Photo de profil retirée.');
  } catch (error) {
    showToast(error.message || 'Impossible de retirer la photo.');
  } finally {
    setProfilePhotoBusy(false);
  }
}

async function optimizeFamilyPhoto(file) {
  if (!file || !file.type.startsWith('image/')) throw new Error('Choisis une image valide.');
  const source = await fileToDataUrl(file);
  const image = await loadImage(source);
  const width = 960;
  const height = 600;
  const targetRatio = width / height;
  const sourceRatio = image.width / image.height;
  let sx = 0; let sy = 0; let sw = image.width; let sh = image.height;
  if (sourceRatio > targetRatio) {
    sw = image.height * targetRatio;
    sx = (image.width - sw) / 2;
  } else {
    sh = image.width / targetRatio;
    sy = (image.height - sh) / 2;
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const context = canvas.getContext('2d');
  context.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  let quality = .78;
  let output = canvas.toDataURL('image/jpeg', quality);
  while (output.length > 650000 && quality > .46) {
    quality -= .08;
    output = canvas.toDataURL('image/jpeg', quality);
  }
  if (output.length > 700000) throw new Error('Cette photo reste trop lourde. Essaie une image plus légère.');
  return output;
}

async function handleFamilyPhotoSelection(event) {
  const file = event.currentTarget.files?.[0];
  if (!file) return;
  const label = document.querySelector('label[for="familyPhotoInput"]');
  label?.classList.add('is-busy');
  event.currentTarget.disabled = true;
  try {
    const photoUrl = await optimizeFamilyPhoto(file);
    await store.updateFamilyPhoto(photoUrl);
    render();
    renderAccount();
    showToast('Photo de famille mise à jour.');
  } catch (error) {
    showToast(error.message || 'Impossible de mettre à jour la photo de famille.');
  } finally {
    event.currentTarget.value = '';
    event.currentTarget.disabled = false;
    label?.classList.remove('is-busy');
  }
}

async function removeFamilyPhoto() {
  if (!confirm('Retirer la photo de famille ?')) return;
  const button = $('#removeFamilyPhotoButton');
  button.disabled = true;
  try {
    await store.updateFamilyPhoto(null);
    render();
    renderAccount();
    showToast('Photo de famille retirée.');
  } catch (error) {
    showToast(error.message || 'Impossible de retirer la photo de famille.');
  } finally { button.disabled = false; }
}

async function saveFamilyIdentity() {
  const user = store.getCurrentUser();
  if (user?.role !== 'admin') return;
  const name = $('#familyNameInput').value.trim();
  const symbol = $('#familySymbolInput').value.trim() || '🌿';
  if (name.length < 2) { showToast('Choisis un nom de famille valide.'); return; }
  const button = $('#saveFamilyIdentityButton');
  button.disabled = true;
  try {
    await store.updateFamilyIdentity({ name, symbol });
    render();
    renderAccount();
    showToast(`Bienvenue, ${name}.`);
  } catch (error) { showToast(error.message || 'Modification impossible.'); }
  finally { button.disabled = false; }
}

function openMemberEditDialog(memberId) {
  const member = memberById(store.getState(), memberId);
  if (!member || store.getCurrentUser()?.role !== 'admin') return;
  $('#memberEditId').value = member.id;
  $('#memberNicknameInput').value = member.nickname || '';
  $('#memberColorInput').value = member.color || '#224A54';
  $('#memberBirthdayInput').value = member.birthday || '';
  $('#memberPhotoInput').value = '';
  $('#removeMemberPhotoButton').hidden = !member.avatarUrl;
  $('#memberEditTitle').textContent = `Personnaliser ${member.name}`;
  $('#memberEditPreview').innerHTML = `${renderAvatar(member, { className: 'member-edit-avatar' })}<div><strong>${escapeHTML(memberDisplayName(member))}</strong><span>${escapeHTML(member.role)}</span></div>`;
  $('#memberEditDialog').showModal();
  vibration();
}

function closeMemberEditDialog() { if ($('#memberEditDialog').open) $('#memberEditDialog').close(); }

async function saveMemberPresentation() {
  const id = $('#memberEditId').value;
  const member = memberById(store.getState(), id);
  if (!member) return;
  const file = $('#memberPhotoInput').files?.[0];
  const avatarUrl = file ? await optimizeProfilePhoto(file) : member.avatarUrl;
  const button = $('#saveMemberPresentationButton');
  button.disabled = true;
  try {
    await store.updateMemberPresentation(id, { nickname: $('#memberNicknameInput').value, color: $('#memberColorInput').value, avatarUrl, birthday: $('#memberBirthdayInput').value });
    closeMemberEditDialog();
    render();
    showToast(`${member.name} a été personnalisé.`);
  } catch (error) { showToast(error.message || 'Modification impossible.'); }
  finally { button.disabled = false; }
}

async function removeMemberPhoto() {
  const id = $('#memberEditId').value;
  const member = memberById(store.getState(), id);
  if (!member || !confirm(`Retirer la photo de ${member.name} ?`)) return;
  try {
    await store.updateMemberPresentation(id, { nickname: $('#memberNicknameInput').value, color: $('#memberColorInput').value, avatarUrl: null, birthday: $('#memberBirthdayInput').value });
    openMemberEditDialog(id);
    render();
    showToast('Photo retirée.');
  } catch (error) { showToast(error.message || 'Impossible de retirer la photo.'); }
}

function setAuthBusy(form, busy) {
  form.querySelectorAll('button, input').forEach((element) => { element.disabled = busy; });
}

function showAuthError(message = '') {
  const box = $('#authError');
  box.textContent = message;
  box.hidden = !message;
}

function showAuthMode(mode) {
  state.authMode = mode;
  const panels = {
    config: '#configPanel',
    login: '#loginForm',
    setup: '#setupForm',
    invite: '#inviteForm',
    resetRequest: '#resetRequestForm',
    recovery: '#recoveryForm',
    confirmation: '#confirmationPanel',
    noFamily: '#noFamilyPanel'
  };
  Object.values(panels).forEach((selector) => { const panel = $(selector); if (panel) panel.hidden = true; });
  const target = $(panels[mode] || panels.login);
  if (target) target.hidden = false;
  const subtitles = {
    config: 'Connecte l’interface à ton projet Supabase avant la première utilisation.',
    login: 'Connectez-vous pour retrouver l’agenda partagé.',
    setup: 'Nacer crée le compte administrateur et l’agenda familial.',
    invite: 'Romane peut créer son propre accès à la famille.',
    resetRequest: 'Demande un lien sécurisé de réinitialisation.',
    recovery: 'Définis maintenant ton nouveau mot de passe.',
    confirmation: 'Une dernière vérification protège votre accès.',
    noFamily: 'Associe ce compte à la famille avant de continuer.'
  };
  $('#authSubtitle').textContent = subtitles[mode] || subtitles.login;
  showAuthError('');
}

function unlockApp() {
  const gate = $('#authGate');
  $('#appShell').classList.remove('is-locked');
  $('#appShell').setAttribute('aria-hidden', 'false');
  document.body.classList.remove('is-authenticating');
  gate.classList.add('is-leaving');
  setTimeout(() => { gate.hidden = true; gate.classList.remove('is-leaving'); }, 430);
  render();
  updateConnection();
}

function lockApp(mode = 'login') {
  $('#appShell').classList.add('is-locked');
  $('#appShell').setAttribute('aria-hidden', 'true');
  const gate = $('#authGate');
  gate.hidden = false;
  document.body.classList.add('is-authenticating');
  showAuthMode(mode);
}

function invitationCodeFromUrl() {
  return new URLSearchParams(location.search).get('join') || '';
}

function applyAuthUI(detail = {}) {
  const auth = store.getAuthStatus();
  const joinCode = invitationCodeFromUrl();
  const offlineWithoutAccess = !navigator.onLine && !auth.authenticated;
  $('#authOffline').textContent = offlineWithoutAccess
    ? 'Aucune connexion disponible. Connecte cet appareil à Internet pour ouvrir une première session.'
    : 'Connexion indisponible. Les données déjà synchronisées restent accessibles sur cet appareil.';
  $('#authOffline').hidden = !(offlineWithoutAccess || (auth.authenticated && auth.offlineSession));

  if (!auth.configured) {
    lockApp('config');
    return;
  }

  if (auth.recoveryMode || new URLSearchParams(location.search).get('recovery') === '1') {
    lockApp('recovery');
    return;
  }

  if (auth.authenticated) {
    if (auth.needsFamily) {
      lockApp('noFamily');
      return;
    }
    history.replaceState({}, '', location.pathname);
    unlockApp();
    renderAccount();
    if (state.notificationAction) setTimeout(() => processNotificationAction(), 80);
    if (detail.expired) showToast('La session a expiré. Reconnecte-toi.');
    return;
  }

  if (joinCode) {
    store.stageJoin(joinCode, 'Romane');
    $('#inviteForm').elements.token.value = joinCode;
    lockApp('invite');
  } else {
    lockApp(state.authMode === 'confirmation' ? 'confirmation' : 'login');
  }
}

async function submitAuthForm(form, action) {
  showAuthError('');
  const data = new FormData(form);
  const password = String(data.get('password') || '');
  const confirmation = String(data.get('passwordConfirm') || '');
  if (confirmation && password !== confirmation) {
    showAuthError('Les deux mots de passe ne correspondent pas.');
    return;
  }
  if (password && password.length < 10) {
    showAuthError('Le mot de passe doit contenir au moins 10 caractères.');
    return;
  }
  setAuthBusy(form, true);
  try {
    const payload = Object.fromEntries(data.entries());
    const result = await action(payload);
    if (result?.confirmationRequired) {
      showAuthMode('confirmation');
      return;
    }
    applyAuthUI();
    showToast('Bienvenue dans votre agenda familial.');
  } catch (error) {
    showAuthError(error.message || 'Opération impossible.');
  } finally {
    setAuthBusy(form, false);
  }
}

function setupSwipe() {
  const timeline = $('#timeline');
  let startX = 0;
  let startY = 0;
  timeline.addEventListener('pointerdown', (event) => { startX = event.clientX; startY = event.clientY; });
  timeline.addEventListener('pointerup', (event) => {
    const dx = event.clientX - startX;
    const dy = event.clientY - startY;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.3) {
      selectDate(toISO(addDays(parseISO(state.selectedDate), dx < 0 ? 1 : -1)));
    }
  });
}

function setupEvents() {
  document.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-view]');
    if (viewButton) {
      if (viewButton.dataset.forceMode) state.agendaMode = viewButton.dataset.forceMode;
      switchView(viewButton.dataset.view);
      if (viewButton.dataset.forceMode) renderAgenda(store.getState());
    }

    if (event.target.closest('[data-open-quick-add]')) openQuickAddDialog();
    if (event.target.closest('[data-close-quick-add]')) closeQuickAddDialog();
    const quickTarget = event.target.closest('[data-quick-add-target]');
    if (quickTarget) {
      const target = quickTarget.dataset.quickAddTarget;
      closeQuickAddDialog();
      if (target === 'event') openEventDialog();
      else if (target === 'task') openTaskDialog();
      else if (target === 'shopping') openShoppingDialog();
      else if (target === 'routine') openRoutineDialog();
    }

    const memberButton = event.target.closest('[data-member]');
    if (memberButton) { state.activeMember = memberButton.dataset.member; render(); vibration(); }

    const dateButton = event.target.closest('[data-date]');
    if (dateButton) selectDate(dateButton.dataset.date);

    if (event.target.closest('[data-open-event]')) openEventDialog();
    if (event.target.closest('[data-close-dialog]')) closeEventDialog();
    if (event.target.closest('[data-close-account]')) closeAccountDialog();
    if (event.target.closest('[data-close-member-edit]')) closeMemberEditDialog();
    if (event.target.closest('[data-close-tasks]')) closeTasksDialog();
    if (event.target.closest('[data-close-task-dialog]')) closeTaskDialog();
    if (event.target.closest('[data-close-notifications]')) closeNotificationDialog();
    if (event.target.closest('[data-close-shopping]')) closeShoppingDialog();
    if (event.target.closest('[data-close-routines]')) closeRoutinesDialog();
    if (event.target.closest('[data-close-routine-dialog]')) closeRoutineDialog();
    if (event.target.closest('[data-close-collaboration]')) closeCollaborationDialog();
    if (event.target.closest('[data-close-search]')) closeSearchDialog();
    if (event.target.closest('[data-open-task]')) openTaskDialog();
    if (event.target.closest('[data-open-shopping]')) openShoppingDialog();
    if (event.target.closest('[data-open-routine]')) openRoutineDialog();

    const liveMomentButton = event.target.closest('#liveMomentButton');
    if (liveMomentButton?.dataset.liveEventId) openEventDialog(liveMomentButton.dataset.liveEventId);

    const contextNextButton = event.target.closest('#contextNextChip');
    if (contextNextButton?.dataset.eventId) openEventDialog(contextNextButton.dataset.eventId);

    const collaborationButton = event.target.closest('[data-collaborate-type]');
    if (collaborationButton) openCollaborationDialog(collaborationButton.dataset.collaborateType, collaborationButton.dataset.collaborateId);

    const reactionButton = event.target.closest('[data-reaction]');
    if (reactionButton) {
      store.toggleReaction($('#collaborationParentType').value, $('#collaborationParentId').value, reactionButton.dataset.reaction).then(renderCollaborationDialog).catch((error) => showToast(error.message || 'Réaction impossible.'));
    }
    const deleteCommentButton = event.target.closest('[data-delete-comment]');
    if (deleteCommentButton) store.deleteComment(deleteCommentButton.dataset.deleteComment).then(renderCollaborationDialog).catch((error) => showToast(error.message || 'Suppression impossible.'));
    const openAttachmentButton = event.target.closest('[data-open-attachment]');
    if (openAttachmentButton) store.openAttachment(openAttachmentButton.dataset.openAttachment).catch((error) => showToast(error.message || 'Ouverture impossible.'));
    const deleteAttachmentButton = event.target.closest('[data-delete-attachment]');
    if (deleteAttachmentButton && confirm('Supprimer cette pièce jointe ?')) store.deleteAttachment(deleteAttachmentButton.dataset.deleteAttachment).then(renderCollaborationDialog).catch((error) => showToast(error.message || 'Suppression impossible.'));

    const searchResult = event.target.closest('[data-search-result-type]');
    if (searchResult) {
      closeSearchDialog();
      const type = searchResult.dataset.searchResultType;
      if (type === 'event' || type === 'task') openCollaborationDialog(type, searchResult.dataset.searchResultId);
      else if (type === 'comment' || type === 'attachment' || type === 'activity') openCollaborationDialog(searchResult.dataset.searchParentType, searchResult.dataset.searchParentId);
      else if (type === 'shopping') openShoppingDialog();
      else if (type === 'routine') openRoutinesDialog();
    }

    const authModeButton = event.target.closest('[data-auth-mode]');
    if (authModeButton) showAuthMode(authModeButton.dataset.authMode);

    const memberEditButton = event.target.closest('[data-edit-member]');
    if (memberEditButton) openMemberEditDialog(memberEditButton.dataset.editMember);

    const editButton = event.target.closest('[data-edit-event]');
    if (editButton) openEventDialog(editButton.dataset.editEvent);

    const taskEditButton = event.target.closest('[data-edit-task]');
    if (taskEditButton) openTaskDialog(taskEditButton.dataset.editTask);

    const taskToggleButton = event.target.closest('[data-toggle-task]');
    if (taskToggleButton) {
      const before = store.getState();
      const task = before.tasks.find((item) => item.id === taskToggleButton.dataset.toggleTask);
      if (task) {
        const completing = task.status !== 'done';
        const hadPending = completing && (tasksForMember(before).some((item) => item.status !== 'done' && item.dueDate <= toISO(new Date())) || (before.routines || []).some((routine) => routineIsScheduled(routine) && !routineIsCompleted(before, routine.id, toISO(new Date()))));
        if (completing) completionBurst(taskToggleButton, 'task');
        store.toggleTask(task.id, completing);
        vibration();
        if (completing) maybeCelebrateClearDay(hadPending);
        renderTasksDialog();
      }
    }

    const taskFilterButton = event.target.closest('[data-task-filter]');
    if (taskFilterButton) { state.taskFilter = taskFilterButton.dataset.taskFilter; renderTasksDialog(); }

    const shoppingToggle = event.target.closest('[data-toggle-shopping]');
    if (shoppingToggle) {
      const item = store.getState().shoppingItems.find((entry) => entry.id === shoppingToggle.dataset.toggleShopping);
      if (item) {
        const checking = !item.checked;
        if (checking) completionBurst(shoppingToggle, 'shopping');
        store.toggleShoppingItem(item.id, checking);
        vibration();
        renderShoppingDialog();
      }
    }
    const shoppingDelete = event.target.closest('[data-delete-shopping]');
    if (shoppingDelete) {
      const item = store.getState().shoppingItems.find((entry) => entry.id === shoppingDelete.dataset.deleteShopping);
      if (item && confirm(`Retirer « ${item.name} » de la liste ?`)) { store.deleteShoppingItem(item.id); renderShoppingDialog(); }
    }
    const shoppingFilter = event.target.closest('[data-shopping-filter]');
    if (shoppingFilter) { state.shoppingFilter = shoppingFilter.dataset.shoppingFilter; renderShoppingDialog(); }

    const routineToggle = event.target.closest('[data-toggle-routine]');
    if (routineToggle) {
      const data = store.getState();
      const routine = data.routines.find((item) => item.id === routineToggle.dataset.toggleRoutine);
      if (routine && routineIsScheduled(routine)) {
        const iso = toISO(new Date());
        const completing = !routineIsCompleted(data, routine.id, iso);
        const hadPending = completing && (tasksForMember(data).some((item) => item.status !== 'done' && item.dueDate <= iso) || (data.routines || []).some((item) => routineIsScheduled(item) && !routineIsCompleted(data, item.id, iso)));
        if (completing) completionBurst(routineToggle, 'routine');
        store.toggleRoutineCompletion(routine.id, iso, completing);
        vibration();
        if (completing) maybeCelebrateClearDay(hadPending);
        render();
      }
    }
    const routineEdit = event.target.closest('[data-edit-routine]');
    if (routineEdit) openRoutineDialog(routineEdit.dataset.editRoutine);
    const routineFilter = event.target.closest('[data-routine-filter]');
    if (routineFilter) { state.routineFilter = routineFilter.dataset.routineFilter; renderRoutinesDialog(); }

    const modeButton = event.target.closest('[data-agenda-mode]');
    if (modeButton) {
      state.agendaMode = modeButton.dataset.agendaMode;
      renderAgenda(store.getState());
      vibration();
    }

    const monthDateButton = event.target.closest('[data-month-date]');
    if (monthDateButton) selectDate(monthDateButton.dataset.monthDate);

    const monthNavButton = event.target.closest('[data-month-nav]');
    if (monthNavButton) moveMonth(Number(monthNavButton.dataset.monthNav));
  });

  $('#previousWeek').addEventListener('click', () => moveWeek(-1));
  $('#nextWeek').addEventListener('click', () => moveWeek(1));
  $('#quickAddButton').addEventListener('click', () => openEventDialog());
  $('#quickAddTaskButton').addEventListener('click', () => openTaskDialog());
  $('#openTasksButton').addEventListener('click', openTasksDialog);
  $('#addTaskFromListButton').addEventListener('click', () => openTaskDialog());
  $('#taskForm').addEventListener('submit', handleTaskSubmit);
  $('#deleteTaskButton').addEventListener('click', deleteCurrentTask);
  $('#shoppingShortcutButton').addEventListener('click', openShoppingDialog);
  $('#routineShortcutButton').addEventListener('click', openRoutinesDialog);
  $('#shoppingForm').addEventListener('submit', handleShoppingSubmit);
  $('#clearCheckedShoppingButton').addEventListener('click', () => { if (confirm('Retirer tous les articles déjà pris ?')) { store.clearCheckedShoppingItems(); renderShoppingDialog(); showToast('Articles cochés retirés.'); } });
  $('#addRoutineButton').addEventListener('click', () => openRoutineDialog());
  $('#routineForm').addEventListener('submit', handleRoutineSubmit);
  $('#deleteRoutineButton').addEventListener('click', deleteCurrentRoutine);
  $('#goTodayButton').addEventListener('click', () => selectDate(toISO(new Date())));
  $('#agendaTodayButton').addEventListener('click', () => { selectDate(toISO(new Date())); switchView('agenda'); });
  $('#eventForm').addEventListener('submit', handleEventSubmit);
  $('#deleteCurrentEventButton').addEventListener('click', deleteCurrentEvent);
  $('#deleteSeriesButton').addEventListener('click', deleteCurrentSeries);
  $('#allDayToggle').addEventListener('change', (event) => toggleAllDayFields(event.target.checked));
  $('#eventForm')?.elements?.time?.addEventListener('change', () => {
    const currentDuration = Math.max(1, durationFromEventTimes() || 60);
    setEventEndFromDuration(currentDuration);
  });
  $('#eventForm')?.elements?.endTime?.addEventListener('change', () => {
    const duration = durationFromEventTimes();
    updateDurationPresetState(duration);
  });
  document.querySelectorAll('[data-duration-minutes]').forEach((button) => button.addEventListener('click', () => {
    setEventEndFromDuration(Number(button.dataset.durationMinutes));
    vibration();
  }));
  $('#eventForm').elements.recurrence.addEventListener('change', (event) => { $('#recurrenceUntilField').hidden = event.target.value === 'none'; });
  $('#quietModeToggle').addEventListener('change', (event) => { store.setSetting('quietMode', event.target.checked); showToast(event.target.checked ? 'Mode doux activé.' : 'Mode doux désactivé.'); });
  $('#protectMomentButton').addEventListener('click', () => { openEventDialog(); $('#eventForm').elements.title.value = 'Temps pour soi'; });
  $('#accountButton').addEventListener('click', openAccountDialog);
  $('#searchButton').addEventListener('click', openSearchDialog);
  $('#notificationButton').addEventListener('click', openNotificationDialog);
  $('#manageNotificationsButton').addEventListener('click', openNotificationDialog);
  $('#enableNotificationsButton').addEventListener('click', toggleSystemNotifications);
  $('#saveNotificationPreferencesButton').addEventListener('click', saveNotificationPreferences);
  $('#testNotificationButton').addEventListener('click', testNotification);
  $('#quickProfileButton').addEventListener('click', openAccountDialog);
  $('#addMemberButton').addEventListener('click', openAccountDialog);
  $('#settingsButton').addEventListener('click', openSettingsDialog);
  $('#dailyTasksButton')?.addEventListener('click', openTasksDialog);
  $('#dailyRoutinesButton')?.addEventListener('click', openRoutinesDialog);
  $('#dailyShoppingButton')?.addEventListener('click', openShoppingDialog);
  $('#dailySettingsButton')?.addEventListener('click', openSettingsDialog);
  $('#inviteButton').addEventListener('click', createInvitation);
  $('#copyInviteButton').addEventListener('click', copyInviteLink);
  $('#saveFamilyIdentityButton').addEventListener('click', saveFamilyIdentity);
  $('#familyPhotoInput').addEventListener('change', handleFamilyPhotoSelection);
  $('#removeFamilyPhotoButton').addEventListener('click', removeFamilyPhoto);
  $('#familyCoverEditButton').addEventListener('click', openAccountDialog);
  $('#profilePhotoInput').addEventListener('change', handleProfilePhotoSelection);
  $('#removeProfilePhotoButton').addEventListener('click', removeProfilePhoto);
  $('#saveMemberPresentationButton').addEventListener('click', saveMemberPresentation);
  $('#removeMemberPhotoButton').addEventListener('click', removeMemberPhoto);
  $('#exportButton').addEventListener('click', () => { store.exportData(); showToast('Sauvegarde téléchargée'); });
  $('#settingsExportButton').addEventListener('click', () => { store.exportData(); showToast('Sauvegarde téléchargée'); });
  $('#restoreBackupInput').addEventListener('change', handleBackupRestore);
  $('#forceSyncButton').addEventListener('click', forceSyncNow);
  $$('[data-theme-choice]').forEach((button) => button.addEventListener('click', () => { store.setSetting('theme', button.dataset.themeChoice); applyUserPreferences(store.getState()); renderSettingsDialog(); vibration(); }));
  $$('[data-motion-choice]').forEach((button) => button.addEventListener('click', () => { setMotionMode(button.dataset.motionChoice); renderSettingsDialog(); vibration(); showToast(`Animations ${button.textContent.toLowerCase()}`); }));
  $('#smartContextToggle')?.addEventListener('change', (event) => { setSmartContextEnabled(event.target.checked); renderSettingsDialog(); showToast(event.target.checked ? 'Ambiance intelligente activée' : 'Ambiance intelligente désactivée'); });
  $('#weatherToggle')?.addEventListener('change', async (event) => {
    const enabled = event.target.checked; setWeatherEnabled(enabled);
    if (!enabled) { localStorage.removeItem(WEATHER_CACHE_KEY); delete document.documentElement.dataset.weather; render(); renderSettingsDialog(); showToast('Météo locale désactivée'); return; }
    try { showToast('Autorisation de localisation…'); await refreshWeather({ requestPermission:true }); render(); renderSettingsDialog(); showToast('Météo locale activée'); }
    catch (error) { setWeatherEnabled(false); event.target.checked = false; renderSettingsDialog(); showToast(error?.code === 1 ? 'Localisation refusée · météo non activée' : 'Météo indisponible pour le moment'); }
  });
  $$('[data-home-widget-toggle]').forEach((input) => input.addEventListener('change', () => { store.setSetting('homeWidgets', { [input.dataset.homeWidgetToggle]: input.checked }); applyUserPreferences(store.getState()); renderSettingsDialog(); }));
  $('#logoutButton').addEventListener('click', async () => { closeAccountDialog(); await store.logout(); applyAuthUI(); });
  $('#resetButton')?.addEventListener('click', () => {
    const user = store.getCurrentUser();
    if (user?.role !== 'admin') { showToast('Seul Nacer peut réinitialiser l’agenda.'); return; }
    if (confirm('Supprimer événements, tâches, courses et routines, puis restaurer uniquement les profils familiaux ?')) {
      store.reset();
      state.activeMember = 'all';
      state.selectedDate = toISO(new Date());
      state.weekAnchor = startOfWeek(new Date());
      showToast('L’agenda familial est maintenant vide.');
    }
  });
  $('#installButton')?.addEventListener('click', installApp);
  $('#eventDialog').addEventListener('click', (event) => { if (event.target === $('#eventDialog')) closeEventDialog(); });
  $('#accountDialog').addEventListener('click', (event) => { if (event.target === $('#accountDialog')) closeAccountDialog(); });
  $('#memberEditDialog').addEventListener('click', (event) => { if (event.target === $('#memberEditDialog')) closeMemberEditDialog(); });
  $('#tasksDialog').addEventListener('click', (event) => { if (event.target === $('#tasksDialog')) closeTasksDialog(); });
  $('#taskDialog').addEventListener('click', (event) => { if (event.target === $('#taskDialog')) closeTaskDialog(); });
  $('#notificationDialog').addEventListener('click', (event) => { if (event.target === $('#notificationDialog')) closeNotificationDialog(); });
  $('#shoppingDialog').addEventListener('click', (event) => { if (event.target === $('#shoppingDialog')) closeShoppingDialog(); });
  $('#routinesDialog').addEventListener('click', (event) => { if (event.target === $('#routinesDialog')) closeRoutinesDialog(); });
  $('#routineDialog').addEventListener('click', (event) => { if (event.target === $('#routineDialog')) closeRoutineDialog(); });
  $('#collaborationDialog').addEventListener('click', (event) => { if (event.target === $('#collaborationDialog')) closeCollaborationDialog(); });
  $('#searchDialog').addEventListener('click', (event) => { if (event.target === $('#searchDialog')) closeSearchDialog(); });
  $('#settingsDialog').addEventListener('click', (event) => { if (event.target === $('#settingsDialog')) closeSettingsDialog(); });
  $('#quickAddDialog')?.addEventListener('click', (event) => { if (event.target === $('#quickAddDialog')) closeQuickAddDialog(); });
  $('[data-close-settings]').addEventListener('click', closeSettingsDialog);
  $('#commentForm').addEventListener('submit', submitComment);
  $('#collaborationAttachmentInput').addEventListener('change', handleCollaborationAttachment);
  $('#globalSearchInput').addEventListener('input', renderSearchResults);
  $$('[data-search-filter]').forEach((button) => button.addEventListener('click', () => { state.searchFilter = button.dataset.searchFilter; $$('[data-search-filter]').forEach((item) => item.classList.toggle('is-active', item === button)); renderSearchResults(); vibration(); }));
  $('#loginForm').addEventListener('submit', (event) => { event.preventDefault(); submitAuthForm(event.currentTarget, (payload) => store.login(payload)); });
  $('#setupForm').addEventListener('submit', (event) => { event.preventDefault(); submitAuthForm(event.currentTarget, (payload) => store.setup(payload)); });
  $('#inviteForm').addEventListener('submit', (event) => { event.preventDefault(); submitAuthForm(event.currentTarget, (payload) => store.acceptInvite(payload)); });
  $('#forgotPasswordButton').addEventListener('click', () => showAuthMode('resetRequest'));
  $('#inviteExistingLoginButton').addEventListener('click', () => {
    const code = $('#inviteForm').elements.token.value;
    store.stageJoin(code, $('#inviteForm').elements.displayName.value || 'Romane');
    showAuthMode('login');
  });
  $('#resetRequestForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setAuthBusy(form, true);
    try {
      await store.requestPasswordReset(new FormData(form).get('email'));
      showAuthMode('confirmation');
      $('#confirmationPanel .auth-notice span').textContent = 'Le lien de réinitialisation vient d’être envoyé. Ouvre-le sur cet appareil.';
    } catch (error) { showAuthError(error.message || 'Envoi impossible.'); }
    finally { setAuthBusy(form, false); }
  });
  $('#recoveryForm').addEventListener('submit', (event) => {
    event.preventDefault();
    submitAuthForm(event.currentTarget, ({ password }) => store.updatePassword(password));
  });
  $('#createCurrentFamilyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    setAuthBusy(form, true);
    try {
      const data = new FormData(form);
      await store.createFamilyForCurrentAccount(data.get('displayName'), data.get('familyName'), data.get('familySymbol'));
      applyAuthUI();
      showToast('La famille est prête.');
    } catch (error) { showAuthError(error.message || 'Création impossible.'); }
    finally { setAuthBusy(form, false); }
  });
  $('#joinCurrentFamilyForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    setAuthBusy(form, true);
    try {
      await store.joinExistingAccount(data.get('code'), data.get('displayName'));
      history.replaceState({}, '', location.pathname);
      applyAuthUI();
      showToast('Bienvenue dans la famille.');
    } catch (error) { showAuthError(error.message || 'Code invalide.'); }
    finally { setAuthBusy(form, false); }
  });
  $('#orphanLogoutButton').addEventListener('click', async () => { await store.logout(); applyAuthUI(); });
  window.addEventListener('online', () => {
    updateConnection();
    if (!previousOnlineState) showToast('Connexion retrouvée · synchronisation en cours');
    previousOnlineState = true;
  });
  window.addEventListener('offline', () => {
    updateConnection();
    if (previousOnlineState) showToast('Mode hors ligne · vos changements sont conservés');
    previousOnlineState = false;
  });
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if ((store.getState().settings?.theme || 'system') === 'system') applyUserPreferences(store.getState()); });
  window.matchMedia?.('(prefers-reduced-motion: reduce)').addEventListener?.('change', () => { if (getMotionMode() === 'system') applyMotionPreference(); });
  store.addEventListener('change', (event) => {
    const reason = event.detail?.reason;
    if (reason === 'auth-status') applyAuthUI(event.detail);
    if (reason === 'operation-rejected') showToast(event.detail?.error?.message || 'Une modification a été refusée.');
    if (reason === 'sync-error') showToast('La synchronisation reprendra automatiquement.');
    if (store.getAuthStatus().authenticated) render();
    if ($('#collaborationDialog').open) renderCollaborationDialog();
    if ($('#searchDialog').open) renderSearchResults();
    if ($('#settingsDialog').open) renderSettingsDialog();
    updateConnection();
  });
  setupSwipe();
}

async function installApp() {
  if (state.deferredInstallPrompt) {
    state.deferredInstallPrompt.prompt();
    await state.deferredInstallPrompt.userChoice;
    state.deferredInstallPrompt = null;
    return;
  }
  showToast('Sur iPhone : Partager puis « Sur l’écran d’accueil ».');
}

function setupPWA() {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    state.deferredInstallPrompt = event;
  });
  if ('serviceWorker' in navigator) {
    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      location.reload();
    });
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        await registration.update();
      } catch (error) {
        console.warn('Service Worker non enregistré', error);
      }
    });
  }
}

async function bootstrap() {
  document.body.classList.add('is-authenticating');
  setupEvents();
  setupPWA();
  setupMobileViewportStability();
  applyMotionPreference();
  setupPremiumUX();
  render();
  setupPersistentMotion();
  updateConnection();
  const auth = await store.init();
  applyAuthUI();
  setupTemporalUI();
  if (auth.authenticated) announceVersionIfNeeded();
  if (auth.authenticated && weatherEnabled()) { refreshWeather().catch(() => {}); window.clearInterval(weatherRefreshTimer); weatherRefreshTimer = window.setInterval(() => refreshWeather().catch(() => {}), 30 * 60 * 1000); }
  if (auth.authenticated && state.deepLinkEvent) setTimeout(() => openEventDialog(state.deepLinkEvent), 250);
  else if (auth.authenticated && state.deepLinkTask) setTimeout(() => openTaskDialog(state.deepLinkTask), 250);
  else if (auth.authenticated && new URLSearchParams(location.search).get('action') === 'task') setTimeout(() => openTaskDialog(), 250);
  else if (auth.authenticated && new URLSearchParams(location.search).get('action') === 'add') setTimeout(() => openEventDialog(), 250);
}

bootstrap();
