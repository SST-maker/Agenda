import { store, CATEGORY_META, toISO, addDays } from './store.js?v=3.1.0';

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
const icon = (name) => `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;

const state = {
  activeView: 'home',
  activeMember: 'all',
  selectedDate: toISO(new Date()),
  weekAnchor: startOfWeek(new Date()),
  agendaMode: 'flow',
  deferredInstallPrompt: null,
  authMode: 'login'
};

const dateFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const shortWeekday = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const monthShort = new Intl.DateTimeFormat('fr-FR', { month: 'short' });
const monthLong = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' });
const weekdayNarrow = new Intl.DateTimeFormat('fr-FR', { weekday: 'short' });
const longDate = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

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
function filteredEvents(data, memberId = state.activeMember) {
  return data.events.filter((event) => memberId === 'all' || event.memberIds.includes(memberId));
}
function eventsForDate(data, date, memberId = state.activeMember) {
  return filteredEvents(data, memberId).filter((event) => event.date === date).sort((a, b) => a.time.localeCompare(b.time));
}
function memberById(data, id) { return data.members.find((member) => member.id === id); }
function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Bonjour';
  if (hour < 18) return 'Belle journée';
  return 'Bonsoir';
}

// Rendu central : chaque vue lit le même état local-first.
function render() {
  const data = store.getState();
  renderHeader(data);
  renderMemberFilter(data);
  renderDayRibbon(data);
  renderTimeline(data);
  renderInsights(data);
  renderAgenda(data);
  renderFamily(data);
  renderFocus(data);
  renderDialogMembers(data);
}

function renderHeader(data) {
  const today = new Date();
  $('#todayEyebrow').textContent = capitalize(dateFormatter.format(today));
  $('#greeting').textContent = getGreeting();
  $('#orbitDay').textContent = String(today.getDate()).padStart(2, '0');
  $('#orbitMonth').textContent = monthShort.format(today).replace('.', '').toUpperCase().slice(0, 3);
  const count = eventsForDate(data, toISO(today), 'all').length;
  $('#heroEventCount').textContent = `${count} rendez-vous`;
  $('#pulseMeterFill').style.width = `${count === 0 ? 0 : Math.min(96, Math.max(18, count * 16))}%`;
  $('#quietModeToggle').checked = Boolean(data.settings.quietMode);
}

function renderMemberFilter(data) {
  const all = `<button class="member-chip ${state.activeMember === 'all' ? 'is-active' : ''} tap" data-member="all" role="option" aria-selected="${state.activeMember === 'all'}"><span class="avatar all">∞</span>Toute la famille</button>`;
  const members = data.members.map((member) => `
    <button class="member-chip ${state.activeMember === member.id ? 'is-active' : ''} tap" data-member="${member.id}" role="option" aria-selected="${state.activeMember === member.id}">
      <span class="avatar" style="--avatar:${member.color}">${member.initials}</span>${member.name}
    </button>`).join('');
  $('#memberFilter').innerHTML = all + members;
}

function renderDayRibbon(data) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(state.weekAnchor, index));
  $('#dayRibbon').innerHTML = days.map((day) => {
    const iso = toISO(day);
    const dayEvents = eventsForDate(data, iso);
    const categories = [...new Set(dayEvents.map((event) => event.category))].slice(0, 3);
    return `<button class="day-pill tap ${state.selectedDate === iso ? 'is-selected' : ''} ${sameDay(day, new Date()) ? 'is-today' : ''}" data-date="${iso}" aria-label="${longDate.format(day)}, ${dayEvents.length} événement(s)">
      <span class="day-name">${shortWeekday.format(day).replace('.', '')}</span>
      <strong>${day.getDate()}</strong>
      <span class="day-dots">${categories.map((category) => `<i style="--dot:${CATEGORY_META[category]?.color || '#C79A5C'}"></i>`).join('')}</span>
    </button>`;
  }).join('');

  requestAnimationFrame(() => $('#dayRibbon .is-selected')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }));
}

function groupForTime(time) {
  const minutes = timeToMinutes(time);
  if (minutes < 12 * 60) return 'Matin';
  if (minutes < 18 * 60) return 'Après-midi';
  return 'Soirée';
}

function eventCard(event, data) {
  const category = CATEGORY_META[event.category] || CATEGORY_META.family;
  const people = event.memberIds.map((id) => memberById(data, id)).filter(Boolean);
  return `<article class="event-card" style="--event-color:${category.color}" data-event-id="${event.id}">
    <div class="event-top">
      <div>
        <span class="event-time">${icon('clock')}${event.time} · ${formatDuration(event.duration)}</span>
        <h3>${escapeHTML(event.title)}</h3>
      </div>
      <button class="event-menu tap" data-edit-event="${event.id}" aria-label="Modifier ${escapeHTML(event.title)}">${icon('more')}</button>
    </div>
    <div class="event-meta">
      <span>${category.label}</span>
      ${event.location ? `<span>${icon('map-pin')}${escapeHTML(event.location)}</span>` : ''}
    </div>
    <div class="event-avatars">${people.map((member) => `<span class="avatar" style="--avatar:${member.color}" title="${escapeHTML(member.name)}">${member.initials}</span>`).join('')}</div>
  </article>`;
}

function renderTimeline(data) {
  const selected = parseISO(state.selectedDate);
  const today = new Date();
  $('#selectedDateLabel').textContent = sameDay(selected, today) ? 'Aujourd’hui' : capitalize(longDate.format(selected));
  const events = eventsForDate(data, state.selectedDate);
  if (!events.length) {
    $('#timeline').innerHTML = `<div class="empty-state"><strong>Une respiration dans la semaine.</strong><p>Aucun événement pour ce filtre. Ce temps est à vous.</p><button class="primary-button tap" data-open-event>${icon('plus')}Ajouter un moment</button></div>`;
    return;
  }
  const groups = ['Matin', 'Après-midi', 'Soirée'];
  $('#timeline').innerHTML = groups.map((group) => {
    const items = events.filter((event) => groupForTime(event.time) === group);
    if (!items.length) return '';
    return `<div class="timeline-group"><span class="time-node"></span><p class="timeline-label">${group}</p>${items.map((event) => eventCard(event, data)).join('')}</div>`;
  }).join('');
}

function renderInsights(data) {
  $('#familyStack').innerHTML = data.members.map((member) => `<span class="avatar" style="--avatar:${member.color}">${member.initials}</span>`).join('');
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
        return `<div class="flow-item"><time class="flow-item-time">${event.time}</time><div><h3>${escapeHTML(event.title)}</h3><p>${escapeHTML(event.location || CATEGORY_META[event.category].label)}</p><div class="flow-member-line">${members.map((member) => `<i style="--member-color:${member.color}"></i>`).join('')}</div></div></div>`;
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
          const isOutside = day.getMonth() !== monthStart.getMonth();
          return `<button class="month-day tap ${isOutside ? 'is-outside' : ''} ${sameDay(day, new Date()) ? 'is-today' : ''} ${iso === state.selectedDate ? 'is-selected' : ''}" data-month-date="${iso}" aria-label="${capitalize(longDate.format(day))}, ${events.length} événement(s)">
            <span class="month-day-number">${day.getDate()}</span>
            <span class="month-event-list">
              ${events.slice(0, 3).map((event) => `<span class="month-event-preview" style="--month-event-color:${CATEGORY_META[event.category]?.color || '#C79A5C'}"><i></i><span>${escapeHTML(event.title)}</span></span>`).join('')}
              ${events.length > 3 ? `<small>+${events.length - 3}</small>` : ''}
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
          : `<div class="empty-state"><strong>Cette journée est libre.</strong><p>Ajoutez votre premier rendez-vous pour Nacer, Romane ou Chacha.</p><button class="primary-button tap" data-open-event>${icon('plus')}Planifier cette journée</button></div>`}
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
  $('.family-pulse-card h2').textContent = conflictCount ? 'Un rythme à rééquilibrer.' : 'Tout le monde est aligné.';
  $('#familyPulseCopy').textContent = conflictCount
    ? `${conflictCount} chevauchement${conflictCount > 1 ? 's' : ''} à vérifier dans les prochaines 48 heures.`
    : 'Aucun chevauchement détecté dans les prochaines 48 heures.';

  const weekStart = startOfWeek(new Date());
  const weekEnd = addDays(weekStart, 7);
  $('#familyCards').innerHTML = data.members.map((member) => {
    const upcoming = data.events.filter((event) => event.memberIds.includes(member.id) && parseISO(event.date) >= new Date(new Date().setHours(0,0,0,0))).sort((a,b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`))[0];
    const weekMinutes = data.events.filter((event) => event.memberIds.includes(member.id) && parseISO(event.date) >= weekStart && parseISO(event.date) < weekEnd).reduce((sum, event) => sum + event.duration, 0);
    const load = Math.min(100, Math.round((weekMinutes / (14 * 60)) * 100));
    return `<article class="family-card">
      <div class="family-card-head"><div class="family-identity"><span class="avatar" style="--avatar:${member.color}">${member.initials}</span><div><strong>${escapeHTML(member.name)}</strong><span>${escapeHTML(member.role)}</span></div></div><span class="load-pill">${load === 0 ? 'Libre' : load < 45 ? 'Léger' : load < 75 ? 'Équilibré' : 'Chargé'}</span></div>
      <div class="family-load"><div class="load-copy"><span>Rythme de la semaine</span><strong>${load}%</strong></div><div class="load-track"><span style="width:${load === 0 ? 0 : Math.max(8, load)}%;--member-color:${member.color}"></span></div></div>
      <div class="family-next"><div><span>Prochain moment</span><strong>${upcoming ? escapeHTML(upcoming.title) : 'Rien de prévu'}</strong></div><time>${upcoming ? `${capitalize(shortWeekday.format(parseISO(upcoming.date)).replace('.',''))} ${upcoming.time}` : '—'}</time></div>
    </article>`;
  }).join('');
}

function renderFocus(data) {
  const todayEvents = eventsForDate(data, toISO(new Date()), 'all');
  const lastEvent = [...todayEvents].sort((a,b) => b.time.localeCompare(a.time))[0];
  if (lastEvent) {
    const endMinutes = timeToMinutes(lastEvent.time) + lastEvent.duration;
    const hours = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
    const minutes = String(endMinutes % 60).padStart(2, '0');
    $('#calmHeadline').textContent = `Votre prochain vrai moment libre commence à ${hours} h ${minutes}.`;
  } else {
    $('#calmHeadline').textContent = 'Aujourd’hui est déjà un espace de respiration.';
  }
}

function renderDialogMembers(data) {
  $('#dialogMemberPicker').innerHTML = data.members.map((member, index) => `<label class="member-check"><input type="checkbox" name="memberIds" value="${member.id}" ${index === 0 ? 'checked' : ''}><span><i class="avatar" style="--avatar:${member.color}">${member.initials}</i>${escapeHTML(member.name)}</span></label>`).join('');
}

function switchView(view) {
  if (!['home','agenda','family','focus'].includes(view)) return;
  state.activeView = view;
  $$('.view').forEach((section) => section.classList.toggle('is-active', section.dataset.viewSection === view));
  $$('.nav-item').forEach((button) => button.classList.toggle('is-active', button.dataset.view === view));
  window.scrollTo({ top: 0, behavior: 'smooth' });
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

function openEventDialog(eventId = null) {
  const dialog = $('#eventDialog');
  const form = $('#eventForm');
  const data = store.getState();
  form.reset();
  renderDialogMembers(data);
  form.elements.eventId.value = '';
  form.elements.date.value = state.selectedDate;
  form.elements.time.value = new Date().toTimeString().slice(0, 5);
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
    form.elements.duration.value = String(item.duration);
    form.elements.category.value = item.category;
    form.elements.location.value = item.location || '';
    form.elements.notes.value = item.notes || '';
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

function handleEventSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const memberIds = form.getAll('memberIds');
  if (!memberIds.length) { showToast('Choisis au moins un membre.'); return; }
  const payload = {
    title: String(form.get('title')).trim(),
    date: String(form.get('date')),
    time: String(form.get('time')),
    duration: Number(form.get('duration')),
    category: String(form.get('category')),
    location: String(form.get('location')).trim(),
    notes: String(form.get('notes')).trim(),
    memberIds
  };
  const eventId = String(form.get('eventId') || '');
  if (eventId) {
    store.updateEvent(eventId, payload);
    showToast(navigator.onLine ? 'Modification enregistrée.' : 'Modification gardée hors-ligne.');
  } else {
    store.addEvent(payload);
    showToast(navigator.onLine ? 'Le moment a été ajouté.' : 'Moment ajouté hors-ligne.');
  }
  state.selectedDate = payload.date;
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

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function initialsFor(value = '') {
  return String(value).trim().split(/\s+/).slice(0, 2).map((word) => word[0] || '').join('').toUpperCase() || 'FA';
}

function renderAccount() {
  const user = store.getCurrentUser();
  if (!user) return;
  $('#accountAvatar').textContent = initialsFor(user.displayName);
  $('#accountName').textContent = user.displayName;
  $('#accountEmail').textContent = user.email || '';
  $('#accountRole').textContent = user.role === 'admin' ? 'Administrateur' : 'Membre';
  $('#inviteButton').hidden = user.role !== 'admin';
  $('#exportButton').hidden = false;
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
    if (viewButton) switchView(viewButton.dataset.view);

    const memberButton = event.target.closest('[data-member]');
    if (memberButton) { state.activeMember = memberButton.dataset.member; render(); vibration(); }

    const dateButton = event.target.closest('[data-date]');
    if (dateButton) selectDate(dateButton.dataset.date);

    if (event.target.closest('[data-open-event]')) openEventDialog();
    if (event.target.closest('[data-close-dialog]')) closeEventDialog();
    if (event.target.closest('[data-close-account]')) closeAccountDialog();

    const authModeButton = event.target.closest('[data-auth-mode]');
    if (authModeButton) showAuthMode(authModeButton.dataset.authMode);

    const editButton = event.target.closest('[data-edit-event]');
    if (editButton) openEventDialog(editButton.dataset.editEvent);

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
  $('#goTodayButton').addEventListener('click', () => selectDate(toISO(new Date())));
  $('#agendaTodayButton').addEventListener('click', () => { selectDate(toISO(new Date())); switchView('agenda'); });
  $('#eventForm').addEventListener('submit', handleEventSubmit);
  $('#deleteCurrentEventButton').addEventListener('click', deleteCurrentEvent);
  $('#quietModeToggle').addEventListener('change', (event) => { store.setSetting('quietMode', event.target.checked); showToast(event.target.checked ? 'Mode doux activé.' : 'Mode doux désactivé.'); });
  $('#protectMomentButton').addEventListener('click', () => { openEventDialog(); $('#eventForm').elements.title.value = 'Temps pour soi'; });
  $('#accountButton').addEventListener('click', openAccountDialog);
  $('#addMemberButton').addEventListener('click', openAccountDialog);
  $('#manageAccessButton').addEventListener('click', openAccountDialog);
  $('#inviteButton').addEventListener('click', createInvitation);
  $('#copyInviteButton').addEventListener('click', copyInviteLink);
  $('#exportButton').addEventListener('click', () => { store.exportData(); showToast('Sauvegarde téléchargée.'); });
  $('#logoutButton').addEventListener('click', async () => { closeAccountDialog(); await store.logout(); applyAuthUI(); });
  $('#resetButton').addEventListener('click', () => {
    const user = store.getCurrentUser();
    if (user?.role !== 'admin') { showToast('Seul Nacer peut réinitialiser l’agenda.'); return; }
    if (confirm('Supprimer tous les événements et restaurer uniquement Nacer, Romane et Chacha ?')) {
      store.reset();
      state.activeMember = 'all';
      state.selectedDate = toISO(new Date());
      state.weekAnchor = startOfWeek(new Date());
      showToast('L’agenda familial est maintenant vide.');
    }
  });
  $('#installButton').addEventListener('click', installApp);
  $('#eventDialog').addEventListener('click', (event) => { if (event.target === $('#eventDialog')) closeEventDialog(); });
  $('#accountDialog').addEventListener('click', (event) => { if (event.target === $('#accountDialog')) closeAccountDialog(); });
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
      await store.createFamilyForCurrentAccount(new FormData(form).get('displayName'));
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
  window.addEventListener('online', updateConnection);
  window.addEventListener('offline', updateConnection);
  store.addEventListener('change', (event) => {
    const reason = event.detail?.reason;
    if (reason === 'auth-status') applyAuthUI(event.detail);
    if (reason === 'operation-rejected') showToast(event.detail?.error?.message || 'Une modification a été refusée.');
    if (reason === 'sync-error') showToast('La synchronisation reprendra automatiquement.');
    if (store.getAuthStatus().authenticated) render();
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
  render();
  updateConnection();
  const auth = await store.init();
  applyAuthUI();
  if (auth.authenticated && new URLSearchParams(location.search).get('action') === 'add') setTimeout(() => openEventDialog(), 250);
}

bootstrap();
