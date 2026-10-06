const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'daywell.tasks.v1';
const SETTINGS_KEY = 'daywell.settings.v1';
const state = {
  tasks: loadTasks(), settings: loadSettings(), view: 'today', sort: 'time', filter: 'all',
  editingId: null, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
};
const dialog = $('#review-dialog');
const form = $('#review-form');
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: state.timezone, year: 'numeric', month: '2-digit', day: '2-digit' });

function loadTasks() { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; } }
function loadSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}'); } catch { return {}; } }
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks)); localStorage.setItem(SETTINGS_KEY, JSON.stringify(state.settings)); }
function localDate(date = new Date()) { return dateFormatter.format(date); }
function addDays(date, amount) { const copy = new Date(`${date}T12:00:00`); copy.setDate(copy.getDate() + amount); return localDate(copy); }
function dateAt(date, time = '09:00') { return new Date(`${date}T${time}:00`); }
function esc(value = '') { return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function timeLabel(time) { if (!time) return ''; const [h, m] = time.split(':').map(Number); const d = new Date(); d.setHours(h, m, 0, 0); return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: m ? '2-digit' : undefined }).format(d); }
function dateLabel(date) { if (!date) return ''; if (date === localDate()) return 'Today'; if (date === addDays(localDate(), 1)) return 'Tomorrow'; return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)); }
function dateTimeLabel(date, time) { return `${dateLabel(date)}${time ? `, ${timeLabel(time)}` : ''}`; }
function startOfWeekday(name, base, strictNext = false) { const target = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'].indexOf(name.toLowerCase()); if (target < 0) return null; const d = new Date(`${base}T12:00:00`); let delta = (target - d.getDay() + 7) % 7; if (strictNext && delta === 0) delta = 7; d.setDate(d.getDate() + delta); return localDate(d); }
function parseDatePhrase(text, base = localDate()) {
  const s = text.toLowerCase();
  if (/\bday after tomorrow\b/.test(s)) return addDays(base, 2);
  if (/\btomorrow\b/.test(s)) return addDays(base, 1);
  if (/\btoday\b/.test(s)) return base;
  let m = s.match(/\b(?:next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (m) return startOfWeekday(m[1], base, /\bnext\s+/.test(m[0]));
  m = s.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = s.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b/);
  if (m) { const year = Number(m[3] || base.slice(0,4)); const d = new Date(year, new Date(`${m[1]} 1, 2000`).getMonth(), Number(m[2]), 12); if (!m[3] && d < new Date(`${base}T00:00:00`)) d.setFullYear(year + 1); return localDate(d); }
  m = s.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (m) { let y = Number(m[3] || base.slice(0,4)); if (y < 100) y += 2000; return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`; }
  return null;
}
function parseTimePhrase(text) {
  const s = text.toLowerCase();
  let m = s.match(/\b(?:at\s*)?(\d{1,2})(?::([0-5]\d))?\s*(a\.?m\.?|p\.?m\.?)\b/);
  if (m) { let hour = Number(m[1]) % 12; if (m[3].startsWith('p')) hour += 12; return `${String(hour).padStart(2,'0')}:${m[2] || '00'}`; }
  m = s.match(/\b(?:at\s*)?(\d{1,2}):([0-5]\d)\b/);
  if (m && Number(m[1]) < 24) return `${String(Number(m[1])).padStart(2,'0')}:${m[2]}`;
  if (/\bnoon\b/.test(s)) return '12:00'; if (/\bmidnight\b/.test(s)) return '00:00';
  return null;
}
function parseDuration(text) {
  const s = text.toLowerCase();
  let m = s.match(/\b(?:for\s+)?(\d+(?:\.\d+)?)\s*(hours?|hrs?|h)\b/);
  if (m) return Math.max(5, Math.round(Number(m[1]) * 60));
  m = s.match(/\b(?:for\s+)?(\d+)\s*(minutes?|mins?|m)\b/);
  if (m) return Math.max(5, Number(m[1]));
  return 30;
}
function stripTiming(text) {
  return text.replace(/\b(?:due\s+(?:on\s+)?)?(?:today|tomorrow|day after tomorrow|next\s+)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/ig, '')
    .replace(/\b(?:due\s+)?(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?\b/ig, '')
    .replace(/\b\d{4}-\d{1,2}-\d{1,2}\b/g, '').replace(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, '')
    .replace(/\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b/ig, '').replace(/\b(?:at\s*)?\d{1,2}:[0-5]\d\b/g, '')
    .replace(/\b(?:noon|midnight)\b/ig, '').replace(/\b(?:for\s+)?\d+(?:\.\d+)?\s*(?:hours?|hrs?|h|minutes?|mins?|m)\b/ig, '')
    .replace(/\b(?:due|at|on|by)\b/ig, '').replace(/[,.!?]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function parseNatural(text) {
  const dueMatch = text.match(/\bdue\s+(?:by\s+)?(.+?)(?=\s+(?:work|start|begin)\b|$)/i);
  const workMatch = text.match(/\b(?:work|start|begin)(?:\s+(?:on|at))?\s+(.+?)(?=\s+due\b|$)/i);
  const workText = workMatch?.[1] || text;
  const dueText = dueMatch?.[1] || text;
  const workDate = parseDatePhrase(workText);
  const workTime = parseTimePhrase(workText);
  const dueDate = parseDatePhrase(dueText);
  let dueTime = null;
  if (dueMatch) dueTime = parseTimePhrase(dueMatch[1]);
  else if (dueDate) { const candidates = [...text.matchAll(/\b(?:at\s*)?(\d{1,2})(?::\d{2})?\s*(a\.?m\.?|p\.?m\.?)\b/ig)]; if (candidates.length > 1) dueTime = parseTimePhrase(candidates[candidates.length - 1][0]); }
  const duration = parseDuration(text);
  const title = stripTiming(text).replace(/^(?:and\s+)?/i, '').trim();
  return { title, workDate, workTime, dueDate, dueTime, duration, ambiguous: !workTime || (!dueDate && /\bdue\b/i.test(text)) };
}
function describeParse(parsed) {
  const parts = [];
  if (parsed.workDate && parsed.workTime) parts.push(`Work block: ${dateTimeLabel(parsed.workDate, parsed.workTime)}`);
  else if (!parsed.workTime) parts.push('No work start time found; choose a time below.');
  if (parsed.dueDate) parts.push(`Due: ${dateTimeLabel(parsed.dueDate, parsed.dueTime || '17:00')}`);
  else if (/\bdue\b/i.test($('#natural-input').value)) parts.push('Due date is unclear; set it below if needed.');
  parts.push(`Duration: ${parsed.duration} minutes${parsed.duration === 30 ? ' (default)' : ''}.`);
  return parts.join(' ');
}
function createId() { return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`; }
function taskEnd(task) { const [h,m] = task.workTime.split(':').map(Number); const d = new Date(`${task.workDate}T00:00:00`); d.setHours(h, m + Number(task.duration), 0, 0); return `${localDate(d)}T${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`; }
function taskStart(task) { return `${task.workDate}T${task.workTime}`; }
function isConflict(task, excludeId = null) {
  if (!task.workDate || !task.workTime) return false;
  const start = new Date(taskStart(task)); const end = new Date(taskEnd(task));
  return state.tasks.some(other => other.id !== excludeId && other.id !== task.id && other.calendarEventId && !other.completed && new Date(taskStart(other)) < end && new Date(taskEnd(other)) > start);
}
function render() {
  const today = localDate();
  const labels = { today: ['Today’s tasks', 'A gentle plan for your day', 'Today'], upcoming: ['Coming up', 'A little look at what’s ahead', 'Upcoming'], all: ['All tasks', 'Everything you’re keeping track of', 'All tasks'] };
  $('#section-title').textContent = labels[state.view][0]; $('#section-caption').textContent = labels[state.view][1]; $('#breadcrumb-view').textContent = labels[state.view][2];
  const greetingHour = new Intl.DateTimeFormat('en-US', { timeZone: state.timezone, hour: 'numeric', hour12: false }).format(new Date());
  $('#greeting').innerHTML = `${Number(greetingHour) < 12 ? 'Good morning' : Number(greetingHour) < 18 ? 'Good afternoon' : 'Good evening'}, Alex <span class="sun">${Number(greetingHour) < 17 ? '☀' : '☾'}</span>`;
  $('#date-label').textContent = new Intl.DateTimeFormat('en-US', { timeZone: state.timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(new Date()).toUpperCase();
  $('#timezone-label').textContent = state.timezone.toUpperCase().replaceAll('_',' ');
  const done = state.tasks.filter(t => t.completed).length; const total = state.tasks.length; const percent = total ? Math.round(done / total * 100) : 0;
  $('#progress-label').textContent = `${done} of ${total} completed`; $('#progress-percent').textContent = `${percent}%`; $('#progress-bar').style.width = `${percent}%`;
  $('#nav-count').textContent = state.tasks.filter(t => !t.completed && t.workDate === today).length;
  $('#task-total').textContent = state.tasks.length;
  $('#google-connect-label').textContent = state.settings.googleConnected ? 'Google Calendar connected' : 'Connect Google Calendar';
  const list = $('#task-list');
  let tasks = state.tasks.filter(t => state.view === 'all' || (state.view === 'today' ? t.workDate === today : t.workDate > today));
  if (state.filter === 'open') tasks = tasks.filter(t => !t.completed); if (state.filter === 'done') tasks = tasks.filter(t => t.completed);
  tasks.sort((a,b) => state.sort === 'time' ? taskStart(a).localeCompare(taskStart(b)) : a.title.localeCompare(b.title));
  $('#empty-state').classList.toggle('hidden', tasks.length > 0);
  $('#add-task-button').classList.toggle('hidden', tasks.length === 0);
  list.innerHTML = tasks.map(task => {
    const conflict = isConflict(task);
    const duePast = task.dueDate && task.dueDate < today && !task.completed;
    const sync = task.syncError ? '<span class="calendar-chip error">Sync needs attention</span>' : task.calendarEventId ? '<span class="calendar-chip"><span class="google-g">G</span> Calendar</span>' : '';
    const chips = [task.workDate && task.workTime ? `<span class="meta-chip work-time"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/></svg>${esc(dateTimeLabel(task.workDate,task.workTime))} · ${task.duration} min</span>` : '', task.dueDate ? `<span class="meta-separator"></span><span class="meta-chip due-time ${duePast?'conflict':''}"><svg viewBox="0 0 24 24"><path d="M5 5.5h14v15H5zM8 3v5m8-5v5M5 10h14"/></svg>Due ${esc(dateTimeLabel(task.dueDate,task.dueTime || '17:00'))}</span>` : '', conflict ? '<span class="meta-separator"></span><span class="meta-chip conflict">Calendar overlap</span>' : '', sync].filter(Boolean).join('');
    return `<article class="task-card ${task.completed?'is-done':''}" data-id="${esc(task.id)}"><input class="task-check" type="checkbox" aria-label="Complete ${esc(task.title)}" ${task.completed?'checked':''}><div class="task-main"><div class="task-name">${esc(task.title)}</div><div class="task-meta">${chips}</div></div><button class="task-options" aria-label="Task options" title="Edit or delete"><svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/></svg></button></article>`;
  }).join('');
  list.querySelectorAll('.task-check').forEach(input => input.addEventListener('change', () => { const task = state.tasks.find(t => t.id === input.closest('.task-card').dataset.id); task.completed = input.checked; saveState(); render(); }));
  list.querySelectorAll('.task-options').forEach(button => button.addEventListener('click', () => { const task = state.tasks.find(t => t.id === button.closest('.task-card').dataset.id); const action = prompt(`Task: ${task.title}\nType EDIT to change it, or DELETE to remove it.`); if (action?.toLowerCase() === 'delete') { state.tasks = state.tasks.filter(t => t.id !== task.id); saveState(); render(); } else if (action?.toLowerCase() === 'edit') openEditor(task); }));
  saveState();
}
function openEditor(existing = null, raw = '') {
  state.editingId = existing?.id || null; form.reset(); $('#task-id').value = existing?.id || '';
  const today = localDate();
  if (existing) {
    $('#task-title').value = existing.title; $('#natural-input').value = existing.naturalText || '';
    $('#work-date').value = existing.workDate; $('#work-time').value = existing.workTime; $('#duration').value = existing.duration || 30;
    $('#due-datetime').value = existing.dueDate ? `${existing.dueDate}T${existing.dueTime || '17:00'}` : '';
    $('#parser-note').innerHTML = '<span class="parser-dot"></span><span>Review or edit the parsed timing, then save your changes.</span>';
  } else {
    $('#natural-input').value = raw; $('#task-title').value = '';
    const parsed = parseNatural(raw);
    $('#task-title').value = parsed.title;
    $('#work-date').value = parsed.workDate || today;
    $('#work-time').value = parsed.workTime || '09:00';
    $('#duration').value = parsed.duration;
    $('#due-datetime').value = parsed.dueDate ? `${parsed.dueDate}T${parsed.dueTime || '17:00'}` : '';
    $('#parser-note').innerHTML = `<span class="parser-dot"></span><span>${esc(describeParse(parsed))}</span>`;
  }
  updateCalendarStatus(); checkConflict();
  dialog.showModal(); $('#task-title').focus();
}
function draftFromForm() {
  const due = $('#due-datetime').value;
  return { id: state.editingId || createId(), title: $('#task-title').value.trim(), naturalText: $('#natural-input').value.trim(), workDate: $('#work-date').value, workTime: $('#work-time').value, duration: Number($('#duration').value), dueDate: due ? due.slice(0,10) : '', dueTime: due ? due.slice(11,16) : '', completed: false };
}
function checkConflict() {
  const draft = draftFromForm(); const conflict = isConflict(draft, state.editingId);
  $('#calendar-warning').classList.toggle('hidden', !conflict);
  $('#save-task-button').disabled = conflict;
  if (conflict) $('#save-task-button').textContent = 'Choose another time';
  else $('#save-task-button').innerHTML = 'Add to my day <svg viewBox="0 0 24 24"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>';
  return conflict;
}
function updateCalendarStatus(message = '') {
  const connected = Boolean(state.settings.googleConnected);
  $('#calendar-status').classList.toggle('hidden', !connected && !message);
  $('#calendar-status-text').textContent = message || (connected ? `Connected as ${state.settings.googleEmail || 'Google account'}. Calendar blocks will be added after saving.` : 'Connect Google Calendar to add this work block to your calendar.');
  $('.status-icon').classList.toggle('connected', connected); $('.status-icon').classList.toggle('error', message.includes('failed'));
}
async function requestGoogleConnect() {
  try {
    const res = await fetch('/api/auth/google');
    if (!res.ok) throw new Error('Google Calendar isn’t configured on this demo yet. Add OAuth credentials to enable sync.');
    const data = await res.json(); if (!data.url) throw new Error(data.error || 'Google Calendar setup is incomplete.');
    location.href = data.url;
  } catch (error) { toast(error.message); }
}
async function syncTask(task) {
  if (!state.settings.googleConnected) return;
  try {
    const res = await fetch('/api/calendar/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: task.id, title: task.title, start: taskStart(task), end: taskEnd(task), due: task.dueDate ? `${task.dueDate}T${task.dueTime || '17:00'}` : null, timezone: state.timezone }) });
    const data = await res.json(); if (!res.ok) throw new Error(data.error || 'Calendar sync failed.');
    task.calendarEventId = data.eventId; task.syncError = ''; saveState(); render(); toast('Your work block is on Google Calendar.');
  } catch (error) { task.syncError = error.message; saveState(); render(); toast(`Task saved, but calendar sync failed: ${error.message}`); }
}
form.addEventListener('submit', async event => {
  if (event.submitter?.value === 'cancel') return;
  event.preventDefault();
  if (checkConflict() || !form.reportValidity()) return;
  const task = draftFromForm(); const old = state.tasks.find(t => t.id === task.id);
  if (old) Object.assign(old, task, { calendarEventId: old.calendarEventId, syncError: '' }); else state.tasks.push(task);
  saveState(); dialog.close('save'); render();
  if (state.settings.googleConnected && !task.calendarEventId) await syncTask(task);
  else toast(old ? 'Task updated.' : 'Task added to your day.');
});
$('#natural-input').addEventListener('input', () => {
  const parsed = parseNatural($('#natural-input').value);
  $('#parser-note').innerHTML = `<span class="parser-dot"></span><span>${esc(describeParse(parsed))}</span>`;
  if (!state.editingId && parsed.title && !$('#task-title').dataset.manuallyEdited) $('#task-title').value = parsed.title;
  if (!state.editingId) {
    if (parsed.workDate) $('#work-date').value = parsed.workDate;
    if (parsed.workTime) $('#work-time').value = parsed.workTime;
    if (parsed.duration !== 30 || /\b30\s*(?:m|min)/i.test($('#natural-input').value)) $('#duration').value = parsed.duration;
    if (parsed.dueDate) $('#due-datetime').value = `${parsed.dueDate}T${parsed.dueTime || '17:00'}`;
  }
  checkConflict();
});
$('#task-title').addEventListener('input', () => { $('#task-title').dataset.manuallyEdited = 'true'; });
['work-date','work-time','duration'].forEach(id => $(`#${id}`).addEventListener('change', checkConflict));
$('#quick-add-form').addEventListener('submit', e => { e.preventDefault(); const value = $('#quick-add-input').value.trim(); if (!value) return; openEditor(null, value); $('#quick-add-input').value = ''; });
function openNew() { openEditor(); }
$('#add-task-button').addEventListener('click', openNew); $('#empty-add-button').addEventListener('click', openNew);
$('#google-connect').addEventListener('click', requestGoogleConnect);
document.querySelectorAll('.nav-item[data-view]').forEach(item => item.addEventListener('click', () => { state.view = item.dataset.view; document.querySelectorAll('.nav-item[data-view]').forEach(x => x.classList.toggle('active', x === item)); render(); }));
$('#sort-button').addEventListener('click', () => { state.sort = state.sort === 'time' ? 'name' : 'time'; $('#sort-button').lastElementChild.textContent = `Sort: ${state.sort === 'time' ? 'Time' : 'Name'}`; render(); });
$('#filter-button').addEventListener('click', () => { const options = ['all','open','done']; state.filter = options[(options.indexOf(state.filter) + 1) % options.length]; $('#filter-button').children[1].textContent = state.filter === 'all' ? 'Filter' : state.filter === 'open' ? 'Open' : 'Completed'; render(); });
$('#add-list-button').addEventListener('click', () => toast('Custom lists are coming soon.'));
$('#help-button').addEventListener('click', () => toast('Tip: try “Read chapter 4 tomorrow at 2pm, due Friday at 5pm for 45 min”.'));
document.addEventListener('keydown', event => { if (event.key.toLowerCase() === 'n' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && !dialog.open) { event.preventDefault(); openNew(); } if (event.key === 'Escape' && dialog.open) dialog.close('cancel'); });
function toast(message) { const node = $('#toast'); node.textContent = message; node.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => node.classList.remove('show'), 3100); }
const params = new URLSearchParams(location.search);
if (params.get('google') === 'connected') { state.settings.googleConnected = true; state.settings.googleEmail = params.get('email') || ''; history.replaceState({}, '', location.pathname); saveState(); }
if (params.get('google_error')) { toast(`Google Calendar connection failed: ${params.get('google_error')}`); history.replaceState({}, '', location.pathname); }
render();
