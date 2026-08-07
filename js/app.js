import { store, CATEGORY_META, toISO, addDays } from './store.js?v=3.4.0';
import { VAPID_PUBLIC_KEY } from './push-config.js?v=3.4.0';

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
  deepLinkEvent: new URLSearchParams(location.search).get('event') || '',
  deepLinkTask: new URLSearchParams(location.search).get('task') || '',
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

// Rendu central : chaque vue lit le même état local-first.
function render() {
  const data = store.getState();
  renderHeader(data);
  renderMemberFilter(data);
  renderTasksHome(data);
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
  if (birthdaysToday.length) $('#heroTitle').innerHTML = `🎂 Joyeux anniversaire ${escapeHTML(birthdaysToday.map(memberDisplayName).join(' & '))} !<br><em>Une journée à célébrer.</em>`;
  else if (count === 0) $('#heroTitle').innerHTML = `Aujourd’hui respire.<br><em>Profitez-en ensemble.</em>`;
  else if (count === 1) $('#heroTitle').innerHTML = `Un seul moment prévu.<br><em>Le reste vous appartient.</em>`;
  else $('#heroTitle').innerHTML = `${count} moments aujourd’hui.<br><em>Tout est sous contrôle.</em>`;

  const perMember = data.members.map((member) => ({ member, count: todayEvents.filter((event) => event.memberIds.includes(member.id)).length }));
  const pendingTasksToday = (data.tasks || []).filter((task) => task.status !== 'done' && task.dueDate <= todayIso).length;
  const memberSummary = perMember.map(({ member, count: memberCount }) => `${memberDisplayName(member)} : ${memberCount ? `${memberCount} prévu${memberCount > 1 ? 's' : ''}` : 'libre'}`).join(' · ');
  $('#heroSummary').textContent = `${memberSummary}${pendingTasksToday ? ` · ${pendingTasksToday} tâche${pendingTasksToday > 1 ? 's' : ''} à faire` : ''}`;

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

function taskCard(task, data, compact = false) {
  const responsible = taskResponsible(data, task);
  const overdue = task.status !== 'done' && task.dueDate < toISO(new Date());
  return `<article class="task-card ${compact ? 'is-compact' : ''} ${task.status === 'done' ? 'is-done' : ''} ${overdue ? 'is-overdue' : ''}" data-task-id="${task.id}">
    <button class="task-check tap" type="button" data-toggle-task="${task.id}" aria-label="${task.status === 'done' ? 'Rouvrir' : 'Terminer'} ${escapeHTML(task.title)}">${task.status === 'done' ? icon('check') : ''}</button>
    <div class="task-main">
      <div class="task-title-row"><strong>${escapeHTML(task.title)}</strong>${task.priority === 'high' ? '<span class="task-priority">Important</span>' : ''}</div>
      <div class="task-meta"><span>${icon('clock')}${escapeHTML(taskDueLabel(task))}</span>${responsible ? `<span>${renderAvatar(responsible, { className: 'task-avatar' })}${escapeHTML(memberDisplayName(responsible))}</span>` : `<span>${icon('users')}Toute la famille</span>`}</div>
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
    : `<div class="tasks-empty-mini"><span>${icon('circle-check')}</span><div><strong>Tout est fait.</strong><p>Rien ne presse pour aujourd’hui.</p></div></div>`;
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
  $('#tasksDialogList').innerHTML = tasks.length ? tasks.map((task) => taskCard(task, data)).join('') : `<div class="empty-state"><strong>Aucune tâche ici.</strong><p>Votre famille est à jour dans cette catégorie.</p><button class="primary-button tap" data-open-task>${icon('plus')}Ajouter une tâche</button></div>`;
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
  return `<article class="event-card" style="--event-color:${category.color}" data-event-id="${event.id}">
    <div class="event-top">
      <div>
        <span class="event-time">${icon('clock')}${event.allDay ? 'Toute la journée' : `${event.time} · ${formatDuration(event.duration)}`}${event.seriesId ? ' · Récurrent' : ''}</span>
        <h3>${escapeHTML(event.title)}</h3>
      </div>
      <button class="event-menu tap" data-edit-event="${event.id}" aria-label="Modifier ${escapeHTML(event.title)}">${icon('more')}</button>
    </div>
    <div class="event-meta">
      <span>${category.label}</span>
      ${event.location ? `<span>${icon('map-pin')}${escapeHTML(event.location)}</span>` : ''}
      ${responsible ? `<span class="responsible-pill">${icon('user')}Responsable : ${escapeHTML(memberDisplayName(responsible))}</span>` : ''}
    </div>
    <div class="event-avatars">${people.map((member) => renderAvatar(member, { title: memberDisplayName(member) })).join('')}</div>
  </article>`;
}

function renderTimeline(data) {
  const selected = parseISO(state.selectedDate);
  const today = new Date();
  $('#selectedDateLabel').textContent = sameDay(selected, today) ? 'Aujourd’hui' : capitalize(longDate.format(selected));
  const events = eventsForDate(data, state.selectedDate);
  const birthdays = birthdayMembersForDate(data, state.selectedDate).filter((member) => state.activeMember === 'all' || member.id === state.activeMember);
  if (!events.length && !birthdays.length) {
    $('#timeline').innerHTML = `<div class="empty-state"><strong>Une respiration dans la semaine.</strong><p>Aucun événement pour ce filtre. Ce temps est à vous.</p><button class="primary-button tap" data-open-event>${icon('plus')}Ajouter un moment</button></div>`;
    return;
  }
  const birthdayCards = birthdays.map((member) => `<article class="birthday-card">${renderAvatar(member, { className: 'birthday-avatar' })}<div><span>🎂 Anniversaire</span><strong>${escapeHTML(memberDisplayName(member))}</strong><p>Une belle journée à célébrer ensemble.</p></div></article>`).join('');
  const groups = ['Toute la journée', 'Matin', 'Après-midi', 'Soirée'];
  $('#timeline').innerHTML = birthdayCards + groups.map((group) => {
    const items = events.filter((event) => groupForTime(event.time, event.allDay) === group);
    if (!items.length) return '';
    return `<div class="timeline-group"><span class="time-node"></span><p class="timeline-label">${group}</p>${items.map((event) => eventCard(event, data)).join('')}</div>`;
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
    $('#calmHeadline').textContent = 'Une journée entière est déjà réservée, gardez de petites respirations.';
  } else if (lastEvent) {
    const endMinutes = timeToMinutes(lastEvent.time) + lastEvent.duration;
    const hours = String(Math.floor(endMinutes / 60) % 24).padStart(2, '0');
    const minutes = String(endMinutes % 60).padStart(2, '0');
    $('#calmHeadline').textContent = `Votre prochain vrai moment libre commence à ${hours} h ${minutes}.`;
  } else {
    $('#calmHeadline').textContent = 'Aujourd’hui est déjà un espace de respiration.';
  }
}

function renderDialogMembers(data) {
  $('#dialogMemberPicker').innerHTML = data.members.map((member, index) => `<label class="member-check"><input type="checkbox" name="memberIds" value="${member.id}" ${index === 0 ? 'checked' : ''}><span>${renderAvatar(member, { className: 'avatar' })}${escapeHTML(memberDisplayName(member))}</span></label>`).join('');
  $('#responsibleMemberSelect').innerHTML = `<option value="">Pas de responsable précis</option>` + data.members.map((member) => `<option value="${member.id}">${escapeHTML(memberDisplayName(member))}</option>`).join('');
  $('#taskResponsibleMemberSelect').innerHTML = `<option value="">Toute la famille</option>` + data.members.map((member) => `<option value="${member.id}">${escapeHTML(memberDisplayName(member))}</option>`).join('');
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
    form.elements.duration.value = String(item.duration);
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
  form.elements.duration.disabled = allDay;
  if (allDay) {
    form.elements.time.value = '00:00';
    form.elements.duration.value = '120';
  } else if (form.elements.time.value === '00:00') {
    form.elements.time.value = new Date().toTimeString().slice(0, 5);
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
  const basePayload = {
    title: String(form.get('title')).trim(),
    date: String(form.get('date')),
    time: allDay ? '00:00' : String(form.get('time') || '00:00'),
    duration: allDay ? 1440 : Number(form.get('duration')),
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
  $('#notificationSettingCopy').textContent = enabled ? 'Rappels actifs sur cet appareil.' : permission === 'denied' ? 'Notifications bloquées dans les réglages du navigateur.' : 'Rappels de rendez-vous, tâches et résumé du matin.';
}

async function renderNotificationDialog() {
  const data = store.getState();
  const prefs = data.notificationPreferences || {};
  $('#eventRemindersToggle').checked = prefs.eventReminders !== false;
  $('#taskRemindersToggle').checked = prefs.taskReminders !== false;
  $('#dailySummaryToggle').checked = prefs.dailySummary !== false;
  $('#dailySummaryTime').value = prefs.dailySummaryTime || '07:30';
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
  $('#notificationSupportNote').textContent = !supported ? 'Sur iPhone, les notifications Web Push nécessitent une PWA ajoutée à l’écran d’accueil.' : active ? 'Les délais se règlent directement dans chaque rendez-vous ou tâche.' : 'L’activation doit être faite sur chaque téléphone qui souhaite recevoir des rappels.';
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
      dailySummary: $('#dailySummaryToggle').checked,
      dailySummaryTime: $('#dailySummaryTime').value || '07:30'
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
    if (event.target.closest('[data-open-task]')) openTaskDialog();

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
      const task = store.getState().tasks.find((item) => item.id === taskToggleButton.dataset.toggleTask);
      if (task) { store.toggleTask(task.id, task.status !== 'done'); vibration(); renderTasksDialog(); }
    }

    const taskFilterButton = event.target.closest('[data-task-filter]');
    if (taskFilterButton) { state.taskFilter = taskFilterButton.dataset.taskFilter; renderTasksDialog(); }

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
  $('#goTodayButton').addEventListener('click', () => selectDate(toISO(new Date())));
  $('#agendaTodayButton').addEventListener('click', () => { selectDate(toISO(new Date())); switchView('agenda'); });
  $('#eventForm').addEventListener('submit', handleEventSubmit);
  $('#deleteCurrentEventButton').addEventListener('click', deleteCurrentEvent);
  $('#deleteSeriesButton').addEventListener('click', deleteCurrentSeries);
  $('#allDayToggle').addEventListener('change', (event) => toggleAllDayFields(event.target.checked));
  $('#eventForm').elements.recurrence.addEventListener('change', (event) => { $('#recurrenceUntilField').hidden = event.target.value === 'none'; });
  $('#quietModeToggle').addEventListener('change', (event) => { store.setSetting('quietMode', event.target.checked); showToast(event.target.checked ? 'Mode doux activé.' : 'Mode doux désactivé.'); });
  $('#protectMomentButton').addEventListener('click', () => { openEventDialog(); $('#eventForm').elements.title.value = 'Temps pour soi'; });
  $('#accountButton').addEventListener('click', openAccountDialog);
  $('#notificationButton').addEventListener('click', openNotificationDialog);
  $('#manageNotificationsButton').addEventListener('click', openNotificationDialog);
  $('#enableNotificationsButton').addEventListener('click', toggleSystemNotifications);
  $('#saveNotificationPreferencesButton').addEventListener('click', saveNotificationPreferences);
  $('#testNotificationButton').addEventListener('click', testNotification);
  $('#quickProfileButton').addEventListener('click', openAccountDialog);
  $('#addMemberButton').addEventListener('click', openAccountDialog);
  $('#manageAccessButton').addEventListener('click', openAccountDialog);
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
  $('#exportButton').addEventListener('click', () => { store.exportData(); showToast('Sauvegarde téléchargée.'); });
  $('#logoutButton').addEventListener('click', async () => { closeAccountDialog(); await store.logout(); applyAuthUI(); });
  $('#resetButton').addEventListener('click', () => {
    const user = store.getCurrentUser();
    if (user?.role !== 'admin') { showToast('Seul Nacer peut réinitialiser l’agenda.'); return; }
    if (confirm('Supprimer tous les événements et toutes les tâches, puis restaurer uniquement Nacer, Romane et Chacha ?')) {
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
  $('#memberEditDialog').addEventListener('click', (event) => { if (event.target === $('#memberEditDialog')) closeMemberEditDialog(); });
  $('#tasksDialog').addEventListener('click', (event) => { if (event.target === $('#tasksDialog')) closeTasksDialog(); });
  $('#taskDialog').addEventListener('click', (event) => { if (event.target === $('#taskDialog')) closeTaskDialog(); });
  $('#notificationDialog').addEventListener('click', (event) => { if (event.target === $('#notificationDialog')) closeNotificationDialog(); });
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
  if (auth.authenticated && state.deepLinkEvent) setTimeout(() => openEventDialog(state.deepLinkEvent), 250);
  else if (auth.authenticated && state.deepLinkTask) setTimeout(() => openTaskDialog(state.deepLinkTask), 250);
  else if (auth.authenticated && new URLSearchParams(location.search).get('action') === 'task') setTimeout(() => openTaskDialog(), 250);
  else if (auth.authenticated && new URLSearchParams(location.search).get('action') === 'add') setTimeout(() => openEventDialog(), 250);
}

bootstrap();
