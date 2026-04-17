'use strict';

// ── Age group config ─────────────────────────────────────────────────────────
const AGE_GROUPS = [
  { id: 'infant',    label: 'Infant',    color: '#FCD34D', text: '#78350F' },
  { id: 'preschool', label: 'Preschool', color: '#4ADE80', text: '#14532D' },
  { id: 'child',     label: 'Child',     color: '#60A5FA', text: '#1E3A8A' },
  { id: 'tween',     label: 'Tween',     color: '#C084FC', text: '#4C1D95' },
  { id: 'teen',      label: 'Teen',      color: '#F472B6', text: '#831843' },
  { id: 'adult',     label: 'Adult',     color: '#F87171', text: '#7F1D1D' },
  { id: 'senior',    label: 'Senior',    color: '#FB923C', text: '#7C2D12' },
  { id: 'everyone',  label: 'Everyone',  color: '#111827', text: '#FFFFFF' },
];
const AGE_MAP = Object.fromEntries(AGE_GROUPS.map(g => [g.id, g]));

// ── Date utilities ────────────────────────────────────────────────────────────
const today = new Date();

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function parseDate(s) { return new Date(s + 'T00:00:00'); }

function eachDay(startStr, endStr, cb) {
  const s = parseDate(startStr), e = parseDate(endStr || startStr);
  for (const d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) cb(fmtDate(d));
}


function timeToMinutes(t) {
  if (!t) return null;
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(m) {
  const h = Math.floor(m / 60), min = m % 60;
  const ampm = h >= 12 ? 'PM' : 'AM', h12 = h % 12 || 12;
  return `${h12}:${String(min).padStart(2,'0')} ${ampm}`;
}

function daySuffix(d) {
  if (d >= 11 && d <= 13) return 'th';
  return ['th','st','nd','rd'][d % 10] || 'th';
}

// ── XSS escape ────────────────────────────────────────────────────────────────
function esc(s) {
  if (s == null) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
                  .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── URL state ────────────────────────────────────────────────────────────────
function getState() {
  const p = new URLSearchParams(location.search);
  return {
    view:        p.get('view') || 'month',
    year:        parseInt(p.get('y'))  || today.getFullYear(),
    month:       (parseInt(p.get('m')) || today.getMonth() + 1) - 1,
    weekStart:   p.get('ws')   || null,
    date:        p.get('date') || null,
    eventId:     p.get('eid')  || null,
    filterAges:  p.get('ages')  ? p.get('ages').split(',').filter(Boolean)  : [],
    filterTypes: p.get('types') ? p.get('types').split(',').filter(Boolean) : [],
  };
}

function buildUrl(s) {
  const p = new URLSearchParams();
  if (s.view && s.view !== 'month') p.set('view', s.view);
  const v = s.view || 'month';
  if (v === 'month') {
    p.set('y', s.year); p.set('m', s.month + 1);
  } else if (v === 'week' && s.weekStart) {
    p.set('ws', s.weekStart);
  } else if (v === 'day' && s.date) {
    p.set('date', s.date);
  } else if (v === 'event') {
    if (s.eventId) p.set('eid', s.eventId);
    if (s.date)    p.set('date', s.date);
  }
  if (s.filterAges?.length)  p.set('ages',  s.filterAges.join(','));
  if (s.filterTypes?.length) p.set('types', s.filterTypes.join(','));
  return '?' + p.toString();
}

// Merge overrides into current state, then navigate
function navigate(overrides) {
  const cur = getState();
  const next = { ...cur, ...overrides };
  history.pushState({}, '', buildUrl(next));
  render();
}

window.addEventListener('popstate', render);

// ── Event cache ───────────────────────────────────────────────────────────────
const eventsCache = {};
let plannerLoggedIn = false;
let authToken = localStorage.getItem('ff_token') || null;
let releaseNotes = '';

function authHeaders(extra = {}) {
  return authToken ? { 'Authorization': `Bearer ${authToken}`, ...extra } : extra;
}

async function fetchMonth(year, month) {
  const key = `${year}-${String(month + 1).padStart(2,'0')}`;
  if (!eventsCache[key]) {
    try {
      const r = await fetch(`api/events.php?month=${key}`, { credentials: 'same-origin' });
      eventsCache[key] = r.ok ? await r.json() : [];
    } catch { eventsCache[key] = []; }
  }
  return eventsCache[key];
}

function applyFilters(events, state) {
  let f = events;
  if (state.filterAges.length) {
    f = f.filter(e => {
      const ages = e.ageGroups || [];
      if (ages.includes('everyone')) return true;
      return state.filterAges.some(a => ages.includes(a));
    });
  }
  if (state.filterTypes.length) {
    f = f.filter(e => state.filterTypes.includes(e.type));
  }
  return f;
}

function buildDayMap(events) {
  const map = {};
  events.forEach(evt => {
    eachDay(evt.startDate, evt.endDate || evt.startDate, ds => {
      (map[ds] = map[ds] || []).push(evt);
    });
  });
  return map;
}

// ── Age dots ──────────────────────────────────────────────────────────────────
function buildAgeDots(events) {
  const groups = new Set();
  events.forEach(e => {
    const ages = e.ageGroups || [];
    if (ages.includes('everyone')) groups.add('everyone');
    else ages.forEach(a => groups.add(a));
  });

  const wrap = document.createElement('div');
  wrap.className = 'age-dots';
  AGE_GROUPS.forEach(g => {
    if (!groups.has(g.id)) return;
    const dot = document.createElement('span');
    dot.className = 'age-dot' + (g.id === 'everyone' ? ' age-dot-everyone' : '');
    dot.style.background = g.color;
    dot.title = g.label;
    wrap.appendChild(dot);
  });
  return wrap;
}

function eventAgeColors(evt) {
  const ages = evt.ageGroups || [];
  if (ages.includes('everyone')) return ['#FFFFFF'];
  return ages.map(a => AGE_MAP[a]?.color).filter(Boolean);
}

// ── Nav header ────────────────────────────────────────────────────────────────
function setNav(label, onBack, onPrev, onNext) {
  const backBtn = document.getElementById('back-btn');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  backBtn.style.display = onBack ? '' : 'none';
  prevBtn.style.display = onPrev ? '' : 'none';
  nextBtn.style.display = onNext ? '' : 'none';
  document.getElementById('view-label').textContent = label;
  backBtn.onclick = onBack || null;
  prevBtn.onclick = onPrev || null;
  nextBtn.onclick = onNext || null;
}

// ── Month view ────────────────────────────────────────────────────────────────
async function renderMonthView(state) {
  const { year, month } = state;
  const events  = await fetchMonth(year, month);
  const filtered = applyFilters(events, state);
  const dayMap  = buildDayMap(filtered);
  const name    = new Date(year, month, 1).toLocaleString('default', { month: 'long' });

  const prev = new Date(year, month - 1, 1);
  const next = new Date(year, month + 1, 1);

  setNav(
    `${name} ${year}`,
    null,
    () => navigate({ view:'month', year:prev.getFullYear(), month:prev.getMonth(), weekStart:null, date:null, eventId:null }),
    () => navigate({ view:'month', year:next.getFullYear(), month:next.getMonth(), weekStart:null, date:null, eventId:null }),
  );

  const content = document.getElementById('view-content');
  content.innerHTML = '';
  const grid = document.createElement('div');
  grid.className = 'cal-grid';

  ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].forEach(d => {
    const h = document.createElement('div');
    h.className = 'cal-head'; h.textContent = d;
    grid.appendChild(h);
  });

  const todayStr      = fmtDate(today);
  const firstWeekday  = new Date(year, month, 1).getDay();
  const daysInMonth   = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < firstWeekday; i++) {
    const e = document.createElement('div');
    e.className = 'cal-cell empty'; grid.appendChild(e);
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const ds      = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const dayEvts = dayMap[ds] || [];
    const cell    = document.createElement('div');
    cell.className = 'cal-cell' +
      (ds === todayStr  ? ' today'      : '') +
      (dayEvts.length   ? ' has-events' : ' no-events');

    const num = document.createElement('span');
    num.className = 'day-num'; num.textContent = d;
    cell.appendChild(num);

    if (dayEvts.length) {
      cell.appendChild(buildAgeDots(dayEvts));
      cell.addEventListener('click', () =>
        navigate({ view:'day', date:ds, year:null, month:null, weekStart:null, eventId:null })
      );
    }
    grid.appendChild(cell);
  }
  content.appendChild(grid);
}

// ── Day view ──────────────────────────────────────────────────────────────────
async function renderDayView(state) {
  const ds = state.date;
  if (!ds) { navigate({ view:'month', year:today.getFullYear(), month:today.getMonth() }); return; }

  const d     = parseDate(ds);
  const year  = d.getFullYear(), month = d.getMonth();
  const events = await fetchMonth(year, month);
  const filtered = applyFilters(events, state);
  const dayMap   = buildDayMap(filtered);
  const dayEvts  = dayMap[ds] || [];

  const dayName   = d.toLocaleString('default', { weekday: 'long' });
  const monthName = d.toLocaleString('default', { month: 'long' });
  const dom       = d.getDate();
  const label     = `${monthName} ${year} \u2014 ${dayName} the ${dom}${daySuffix(dom)}`;

  const prev = new Date(d); prev.setDate(prev.getDate() - 1);
  const next = new Date(d); next.setDate(next.getDate() + 1);

  setNav(
    label,
    null,
    () => navigate({ view:'day', date:fmtDate(prev), eventId:null }),
    () => navigate({ view:'day', date:fmtDate(next), eventId:null }),
  );

  // Make the "Month Year" portion of the label a clickable link back to month view
  const viewLabel = document.getElementById('view-label');
  viewLabel.innerHTML = '';
  const monthBtn = document.createElement('button');
  monthBtn.className = 'nav-month-link';
  monthBtn.textContent = `${monthName} ${year}`;
  monthBtn.addEventListener('click', () =>
    navigate({ view:'month', year, month, weekStart:null, date:null, eventId:null })
  );
  viewLabel.appendChild(monthBtn);
  viewLabel.appendChild(document.createTextNode(` \u2014 ${dayName} the ${dom}${daySuffix(dom)}`));

  const content = document.getElementById('view-content');
  content.innerHTML = '';

  if (!dayEvts.length) {
    const empty = document.createElement('div');
    empty.className = 'day-empty'; empty.textContent = 'No events this day.';
    content.appendChild(empty);
    return;
  }

  const timedEvts = [], allDayEvts = [];
  dayEvts.forEach(evt => {
    const t     = (evt.times || []).find(t => t.date === ds);
    const start = timeToMinutes(t?.startTime);
    if (start !== null) {
      timedEvts.push({ ...evt, startMin: start, endMin: timeToMinutes(t?.endTime) || start + 60 });
    } else {
      allDayEvts.push(evt);
    }
  });

  if (allDayEvts.length) {
    const section = document.createElement('div');
    section.className = 'day-allday';
    const lbl = document.createElement('div');
    lbl.className = 'day-allday-label'; lbl.textContent = 'All day';
    section.appendChild(lbl);
    allDayEvts.forEach(evt => section.appendChild(makeEventCard(evt, ds)));
    content.appendChild(section);
  }

  if (timedEvts.length) {
    content.appendChild(renderTimeBlocks(timedEvts, ds));
  }
}

function makeEventCard(evt, ds) {
  const card    = document.createElement('div');
  card.className = 'event-card';
  const colors  = eventAgeColors(evt);
  if (colors.length) {
    card.style.borderLeft = `4px solid ${colors[0]}`;
  }

  const t = (evt.times || []).find(t => t.date === ds);
  let html = '';
  if (evt.type) html += `<span class="badge">${esc(evt.type)}</span>`;
  html += `<div class="event-card-title">${esc(evt.title)}</div>`;
  if (evt.location) html += `<div class="event-card-meta">&#128205; ${esc(evt.location)}</div>`;
  if (t?.startTime) {
    const fmt = s => minutesToTime(timeToMinutes(s));
    const time = [t.startTime, t.endTime].filter(Boolean).map(fmt).join(' \u2013 ');
    html += `<div class="event-card-meta">&#128336; ${esc(time)}</div>`;
  }
  html += evt.price > 0
    ? `<div class="event-card-price">$${Number(evt.price).toFixed(2)}</div>`
    : `<div class="event-card-meta">Free</div>`;
  card.innerHTML = html;
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => navigate({ view:'event', eventId:evt.id, date:ds }));
  return card;
}

function renderTimeBlocks(events, ds) {
  const minStart = Math.min(...events.map(e => e.startMin));
  const maxEnd   = Math.max(...events.map(e => e.endMin));
  const startHour = Math.floor(Math.min(minStart, 480) / 60);  // no earlier than 8am
  const endHour   = Math.ceil (Math.max(maxEnd,  1020) / 60);  // no later than 5pm
  const PX = 1.2;

  // Assign columns greedily
  const sorted = [...events].sort((a,b) => a.startMin - b.startMin);
  const colEnds = [];
  sorted.forEach(evt => {
    let placed = false;
    for (let c = 0; c < colEnds.length; c++) {
      if (colEnds[c] <= evt.startMin) { evt._col = c; colEnds[c] = evt.endMin; placed = true; break; }
    }
    if (!placed) { evt._col = colEnds.length; colEnds.push(evt.endMin); }
  });
  const numCols = colEnds.length || 1;
  sorted.forEach(e => e._cols = numCols);

  const wrap = document.createElement('div');
  wrap.className = 'time-blocks-wrap';

  const timeCol  = document.createElement('div'); timeCol.className  = 'time-labels';
  const timeArea = document.createElement('div'); timeArea.className = 'time-area';
  const totalPx  = (endHour - startHour) * 60 * PX;
  timeArea.style.height = timeCol.style.height = totalPx + 'px';

  for (let h = startHour; h <= endHour; h++) {
    const top = (h - startHour) * 60 * PX;
    const lbl = document.createElement('div');
    lbl.className = 'time-label'; lbl.style.top = top + 'px';
    lbl.textContent = minutesToTime(h * 60);
    timeCol.appendChild(lbl);

    const line = document.createElement('div');
    line.className = 'time-line'; line.style.top = top + 'px';
    timeArea.appendChild(line);
  }

  sorted.forEach(evt => {
    const top    = (evt.startMin - startHour * 60) * PX;
    const height = Math.max((evt.endMin - evt.startMin) * PX, 28);
    const colW   = 100 / evt._cols;

    const block = document.createElement('div');
    block.className = 'time-block';
    block.style.cssText = `top:${top}px;height:${height}px;left:${evt._col * colW}%;width:${colW}%`;

    const colors = eventAgeColors(evt);
    if (colors.length) {
      block.style.borderLeftColor = colors[0];
    }

    block.innerHTML =
      `<div class="time-block-title">${esc(evt.title)}</div>` +
      `<div class="time-block-time">${minutesToTime(evt.startMin)}\u2013${minutesToTime(evt.endMin)}</div>`;
    block.addEventListener('click', () => navigate({ view:'event', eventId:evt.id, date:ds }));
    timeArea.appendChild(block);
  });

  wrap.appendChild(timeCol);
  wrap.appendChild(timeArea);
  return wrap;
}

// ── Event detail view ─────────────────────────────────────────────────────────
async function renderEventView(state) {
  const { eventId, date } = state;
  if (!eventId || !date) { navigate({ view:'month', year:today.getFullYear(), month:today.getMonth() }); return; }

  const d      = parseDate(date);
  const events = await fetchMonth(d.getFullYear(), d.getMonth());
  const evt    = events.find(e => e.id === eventId);
  if (!evt) { navigate({ view:'day', date, eventId:null }); return; }

  setNav(
    evt.title,
    () => navigate({ view:'day', date, eventId:null }),
    null, null,
  );

  const content = document.getElementById('view-content');
  content.innerHTML = '';

  const card = document.createElement('div');
  card.className = 'event-detail';

  const colors = eventAgeColors(evt);
  if (colors.length) {
    card.style.borderTop = `4px solid ${colors[0]}`;
  }

  const ages = evt.ageGroups || [];
  let html = '';

  // Age badges
  if (ages.length) {
    html += '<div class="event-detail-ages">';
    const toShow = ages.includes('everyone') ? ['everyone'] : ages;
    toShow.forEach(a => {
      const g = AGE_MAP[a];
      if (!g) return;
      html += `<span class="age-badge" style="background:${esc(g.color)};color:${esc(g.text)}">${esc(g.label)}</span>`;
    });
    html += '</div>';
  }

  if (evt.type) html += `<span class="badge">${esc(evt.type)}</span>`;
  html += `<h2 class="event-detail-title">${esc(evt.title)}</h2>`;
  if (evt.description) html += `<p class="event-detail-desc">${esc(evt.description)}</p>`;

  if (evt.location) html += `<div class="event-detail-row">&#128205; ${esc(evt.location)}</div>`;

  const dateRange = evt.endDate && evt.endDate !== evt.startDate
    ? `${evt.startDate} \u2013 ${evt.endDate}` : evt.startDate;
  html += `<div class="event-detail-row">&#128197; ${esc(dateRange)}</div>`;

  const timeEntry = (evt.times || []).find(t => t.date === date);
  if (timeEntry?.startTime) {
    const fmt = s => minutesToTime(timeToMinutes(s));
    const t = [timeEntry.startTime, timeEntry.endTime].filter(Boolean).map(fmt).join(' \u2013 ');
    html += `<div class="event-detail-row">&#128336; ${esc(t)}</div>`;
  }

  html += evt.price > 0
    ? `<div class="event-detail-row event-detail-price">$${Number(evt.price).toFixed(2)}</div>`
    : `<div class="event-detail-row">Free</div>`;

  if (evt.flyerImage) {
    html += `<img class="event-card-flyer" src="${esc(evt.flyerImage)}" alt="Event flyer" loading="lazy">`;
  }

  card.innerHTML = html;

  // Planner edit/delete toolbar
  if (plannerLoggedIn) {
    const toolbar = document.createElement('div');
    toolbar.className = 'planner-event-toolbar';

    const editBtn = document.createElement('button');
    editBtn.className = 'planner-icon-btn';
    editBtn.title = 'Edit event';
    editBtn.innerHTML = '&#9998;';

    const delBtn = document.createElement('button');
    delBtn.className = 'planner-icon-btn planner-icon-delete';
    delBtn.title = 'Delete event';
    delBtn.textContent = '\u2715';

    toolbar.append(editBtn, delBtn);
    card.insertBefore(toolbar, card.firstChild);

    delBtn.addEventListener('click', () =>
      showConfirm(
        'Delete this event? This cannot be undone.',
        async () => {
          const r = await fetch('api/delete.php', {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ id: evt.id }),
          });
          const data = await r.json();
          if (data.ok) {
            Object.keys(eventsCache).forEach(k => delete eventsCache[k]);
            navigate({ view: 'day', date, eventId: null });
          } else {
            alert(data.error || 'Delete failed. You may need to log in again.');
          }
        },
        { confirmLabel: 'DELETE', cancelLabel: 'Nevermind', confirmClass: 'btn-red' }
      )
    );

    editBtn.addEventListener('click', () => renderEventEditForm(evt, date, content));
  }

  // Google Calendar button
  const gcalBtn = document.createElement('a');
  gcalBtn.className  = 'btn btn-primary btn-full';
  gcalBtn.style.marginTop = '16px';
  gcalBtn.textContent = 'Add to Google Calendar';
  gcalBtn.target = '_blank';
  gcalBtn.rel    = 'noopener noreferrer';
  gcalBtn.href   = buildGCalUrl(evt, timeEntry);
  card.appendChild(gcalBtn);

  content.appendChild(card);
}

function buildGCalUrl(evt, timeEntry) {
  const title    = encodeURIComponent(evt.title || '');
  const location = encodeURIComponent(evt.location || '');
  let dates;
  if (timeEntry?.startTime) {
    const d   = (timeEntry.date || evt.startDate).replace(/-/g,'');
    const st  = timeEntry.startTime.replace(':','') + '00';
    const endH = timeEntry.endTime
      ? timeEntry.endTime.replace(':','') + '00'
      : String(parseInt(timeEntry.startTime) + 1).padStart(2,'0') + timeEntry.startTime.slice(3,5) + '00';
    dates = `${d}T${st}/${d}T${endH}`;
  } else {
    const s = evt.startDate.replace(/-/g,'');
    const eD = new Date((evt.endDate || evt.startDate) + 'T00:00:00');
    eD.setDate(eD.getDate() + 1);
    dates = `${s}/${fmtDate(eD).replace(/-/g,'')}`;
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&location=${location}`;
}

// ── Event edit form (planner only) ───────────────────────────────────────────
function renderEventEditForm(evt, date, container) {
  container.innerHTML = '';

  const isMulti = evt.endDate && evt.endDate !== evt.startDate;
  const firstTime = (evt.times || [])[0] || {};

  const form = document.createElement('form');
  form.className = 'section-pad';
  form.noValidate = true;

  form.innerHTML = `
    <div class="form-group">
      <label>Title <span class="req">*</span></label>
      <input type="text" name="title" value="${esc(evt.title)}" required>
    </div>
    <div class="form-group">
      <label>Location <span class="optional">(optional)</span></label>
      <input type="text" name="location" value="${esc(evt.location || '')}">
    </div>
    <div class="form-group">
      <label>Event Type <span class="optional">(optional)</span></label>
      <input type="text" name="type" value="${esc(evt.type || '')}" list="types-datalist">
    </div>
    <div class="form-group">
      <label>Age Groups <span class="optional">(optional)</span></label>
      <div class="age-checkboxes" id="edit-age-groups"></div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label>Start Date <span class="req">*</span></label>
        <input type="date" name="startDate" value="${esc(evt.startDate)}" required>
      </div>
      <div class="form-group">
        <label>End Date <span class="optional">(optional)</span></label>
        <input type="date" name="endDate" value="${esc(evt.endDate || '')}">
      </div>
    </div>
    ${!isMulti ? `
    <div class="form-row">
      <div class="form-group">
        <label>Start Time <span class="optional">(optional)</span></label>
        <input type="time" name="startTime" value="${esc(firstTime.startTime || '')}">
      </div>
      <div class="form-group">
        <label>End Time <span class="optional">(optional)</span></label>
        <input type="time" name="endTime" value="${esc(firstTime.endTime || '')}">
      </div>
    </div>` : `
    <div id="edit-times-section" style="background:var(--primary-light);border-radius:8px;padding:12px;margin-bottom:14px;">
      <h4 style="font-size:.85rem;font-weight:700;color:var(--primary-dark);margin-bottom:10px;">Daily Times <span style="font-weight:400;color:var(--text-muted)">(optional)</span></h4>
      <div id="edit-times-grid"></div>
    </div>`}
    <div class="form-group">
      <label>Price ($) <span class="optional">(0 = free)</span></label>
      <input type="number" name="price" value="${esc(String(evt.price ?? 0))}" min="0" step="0.01">
    </div>
    <div class="form-group">
      <label>Description <span class="optional">(optional)</span></label>
      <textarea name="description" rows="3" placeholder="Additional details\u2026">${esc(evt.description || '')}</textarea>
    </div>
    <div style="display:flex;gap:10px;margin-top:8px;">
      <button type="submit" class="btn btn-primary" style="flex:1">Save</button>
      <button type="button" id="edit-cancel-btn" class="btn btn-ghost" style="flex:1">Cancel</button>
    </div>
    <div id="edit-status" class="hidden"></div>
  `;

  // Age checkboxes
  const ageContainer = form.querySelector('#edit-age-groups');
  AGE_GROUPS.forEach(g => {
    const lbl = document.createElement('label');
    lbl.className = 'age-check-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox'; cb.name = 'ageGroup'; cb.value = g.id;
    cb.checked = (evt.ageGroups || []).includes(g.id);
    const dot = document.createElement('span');
    dot.className = 'age-dot' + (g.id === 'everyone' ? ' age-dot-everyone' : '');
    dot.style.background = g.color;
    lbl.append(cb, dot, ' ' + g.label);
    ageContainer.appendChild(lbl);
  });
  ageContainer.addEventListener('change', e => {
    if (e.target.value === 'everyone' && e.target.checked)
      ageContainer.querySelectorAll('input:not([value="everyone"])').forEach(cb => cb.checked = false);
    else if (e.target.value !== 'everyone' && e.target.checked) {
      const ev = ageContainer.querySelector('input[value="everyone"]');
      if (ev) ev.checked = false;
    }
  });

  // Multi-day times grid pre-populated
  if (isMulti) {
    const grid = form.querySelector('#edit-times-grid');
    eachDay(evt.startDate, evt.endDate, ds => {
      const d = parseDate(ds);
      const lbl = d.toLocaleDateString('default', { weekday:'short', month:'short', day:'numeric' });
      const existing = (evt.times || []).find(t => t.date === ds) || {};
      const row = document.createElement('div');
      row.className = 'times-row'; row.dataset.date = ds;
      row.innerHTML = `
        <span class="times-date">${esc(lbl)}</span>
        <input type="time" name="startTime" value="${esc(existing.startTime || '')}" aria-label="Start ${esc(lbl)}">
        <span class="times-sep">\u2013</span>
        <input type="time" name="endTime" value="${esc(existing.endTime || '')}" aria-label="End ${esc(lbl)}">
      `;
      grid.appendChild(row);
    });
  }

  form.querySelector('#edit-cancel-btn').addEventListener('click', () => render());

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const statusEl = form.querySelector('#edit-status');
    const saveBtn  = form.querySelector('[type="submit"]');
    saveBtn.disabled = true;
    statusEl.className = 'status-msg'; statusEl.textContent = 'Saving\u2026';
    statusEl.classList.remove('hidden');

    const sv = form.elements['startDate'].value;
    const ev2 = form.elements['endDate'].value;
    const isMultiNow = sv && ev2 && ev2 > sv;

    const times = [];
    if (isMultiNow) {
      form.querySelectorAll('#edit-times-grid .times-row').forEach(row => {
        times.push({ date: row.dataset.date,
          startTime: row.querySelector('[name="startTime"]').value,
          endTime:   row.querySelector('[name="endTime"]').value });
      });
    } else if (sv) {
      times.push({ date: sv,
        startTime: form.querySelector('[name="startTime"]')?.value || '',
        endTime:   form.querySelector('[name="endTime"]')?.value   || '' });
    }

    const ageGroups = Array.from(form.querySelectorAll('[name="ageGroup"]:checked')).map(cb => cb.value);

    try {
      const r = await fetch('api/update.php', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({
          id:          evt.id,
          title:       form.elements['title'].value.trim(),
          location:    form.elements['location'].value.trim(),
          type:        form.elements['type'].value.trim(),
          price:       parseFloat(form.elements['price'].value) || 0,
          startDate:   sv,
          endDate:     ev2 || sv,
          description: form.elements['description'].value.trim(),
          ageGroups,
          times,
        }),
      });
      const data = await r.json();
      if (data.ok) {
        Object.keys(eventsCache).forEach(k => delete eventsCache[k]);
        navigate({ view: 'event', eventId: evt.id, date: sv });
      } else {
        statusEl.className = 'status-msg error';
        statusEl.textContent = data.error || 'Save failed.';
        saveBtn.disabled = false;
      }
    } catch {
      statusEl.className = 'status-msg error';
      statusEl.textContent = 'Network error.';
      saveBtn.disabled = false;
    }
  });

  container.appendChild(form);
}

// ── Filter chips & modal ──────────────────────────────────────────────────────
let availableTypes = [];

function renderFilterChips(state) {
  const bar = document.getElementById('filter-chips');
  bar.innerHTML = '';

  state.filterAges.forEach(ag => {
    const g = AGE_MAP[ag]; if (!g) return;
    const chip = document.createElement('span');
    chip.className = 'filter-chip';
    chip.style.cssText = `background:${g.color};color:${g.text};` +
      (ag === 'everyone' ? 'border:1px solid #D1D5DB;' : '');
    chip.innerHTML = `${esc(g.label)} <button class="chip-x" data-t="age" data-v="${esc(ag)}" aria-label="remove">&#x2715;</button>`;
    bar.appendChild(chip);
  });

  state.filterTypes.forEach(t => {
    const chip = document.createElement('span');
    chip.className = 'filter-chip filter-chip-type';
    chip.innerHTML = `${esc(t)} <button class="chip-x" data-t="type" data-v="${esc(t)}" aria-label="remove">&#x2715;</button>`;
    bar.appendChild(chip);
  });

  bar.querySelectorAll('.chip-x').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const s = getState();
      if (btn.dataset.t === 'age')
        navigate({ ...s, filterAges:  s.filterAges.filter(a => a !== btn.dataset.v) });
      else
        navigate({ ...s, filterTypes: s.filterTypes.filter(t => t !== btn.dataset.v) });
    });
  });
}

function openFilterModal() {
  const state = getState();
  const agesEl  = document.getElementById('filter-ages');
  const typesEl = document.getElementById('filter-types');
  agesEl.innerHTML = '';

  AGE_GROUPS.forEach(g => {
    const lbl = document.createElement('label');
    lbl.className = 'filter-option';
    const cb  = document.createElement('input');
    cb.type = 'checkbox'; cb.value = g.id; cb.checked = state.filterAges.includes(g.id);
    const dot = document.createElement('span');
    dot.className = 'age-dot' + (g.id === 'everyone' ? ' age-dot-everyone' : '');
    dot.style.background = g.color;
    lbl.append(cb, dot, ' ' + g.label);
    agesEl.appendChild(lbl);
  });

  typesEl.innerHTML = '';
  if (!availableTypes.length) {
    typesEl.textContent = 'No types yet.';
  } else {
    availableTypes.forEach(t => {
      const lbl = document.createElement('label');
      lbl.className = 'filter-option';
      const cb  = document.createElement('input');
      cb.type = 'checkbox'; cb.value = t; cb.checked = state.filterTypes.includes(t);
      lbl.append(cb, ' ' + t);
      typesEl.appendChild(lbl);
    });
  }

  document.getElementById('filter-modal').classList.remove('hidden');
  document.getElementById('filter-overlay').classList.remove('hidden');
}

function closeFilterModal() {
  document.getElementById('filter-modal').classList.add('hidden');
  document.getElementById('filter-overlay').classList.add('hidden');
}

// ── Submit form ───────────────────────────────────────────────────────────────
function initAgeCheckboxes() {
  const container = document.getElementById('f-age-groups');
  AGE_GROUPS.forEach(g => {
    const lbl = document.createElement('label');
    lbl.className = 'age-check-label';
    const cb  = document.createElement('input');
    cb.type = 'checkbox'; cb.name = 'ageGroup'; cb.value = g.id;
    const dot = document.createElement('span');
    dot.className = 'age-dot' + (g.id === 'everyone' ? ' age-dot-everyone' : '');
    dot.style.background = g.color;
    lbl.append(cb, dot, ' ' + g.label);
    container.appendChild(lbl);
  });

  // "Everyone" is mutually exclusive
  container.addEventListener('change', e => {
    if (e.target.value === 'everyone' && e.target.checked) {
      container.querySelectorAll('input:not([value="everyone"])').forEach(cb => cb.checked = false);
    } else if (e.target.value !== 'everyone' && e.target.checked) {
      const ev = container.querySelector('input[value="everyone"]');
      if (ev) ev.checked = false;
    }
  });
}

async function loadTypes() {
  try {
    const r = await fetch('api/types.php', { credentials: 'same-origin' });
    availableTypes = r.ok ? await r.json() : [];
  } catch { availableTypes = []; }
  const dl = document.getElementById('types-datalist');
  dl.innerHTML = '';
  availableTypes.forEach(t => {
    const opt = document.createElement('option'); opt.value = t; dl.appendChild(opt);
  });
}

function setupForm() {
  document.getElementById('f-start').addEventListener('change', updateTimesUI);
  document.getElementById('f-end').addEventListener('change',   updateTimesUI);
  document.getElementById('event-form').addEventListener('submit', handleSubmit);
}

function updateTimesUI() {
  const sv = document.getElementById('f-start').value;
  const ev = document.getElementById('f-end').value;
  const isMulti = sv && ev && ev > sv;
  document.getElementById('single-times').classList.toggle('hidden', isMulti);
  document.getElementById('multi-times').classList.toggle('hidden', !isMulti);
  if (isMulti) {
    const grid = document.getElementById('times-grid');
    grid.innerHTML = '';
    eachDay(sv, ev, ds => {
      const d   = parseDate(ds);
      const lbl = d.toLocaleDateString('default', { weekday:'short', month:'short', day:'numeric' });
      const row = document.createElement('div');
      row.className = 'times-row'; row.dataset.date = ds;
      row.innerHTML = `
        <span class="times-date">${esc(lbl)}</span>
        <input type="time" name="startTime" aria-label="Start ${esc(lbl)}">
        <span class="times-sep">\u2013</span>
        <input type="time" name="endTime"   aria-label="End ${esc(lbl)}">
      `;
      grid.appendChild(row);
    });
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  const form     = e.target;
  const statusEl = document.getElementById('submit-status');
  const btn      = document.getElementById('submit-btn');
  btn.disabled = true;
  statusEl.className = 'status-msg'; statusEl.textContent = 'Submitting\u2026';
  statusEl.classList.remove('hidden');

  const sv = document.getElementById('f-start').value;
  const ev = document.getElementById('f-end').value;
  const isMulti = sv && ev && ev > sv;

  const times = [];
  if (isMulti) {
    document.querySelectorAll('#times-grid .times-row').forEach(row => {
      times.push({ date: row.dataset.date,
        startTime: row.querySelector('[name="startTime"]').value,
        endTime:   row.querySelector('[name="endTime"]').value });
    });
  } else if (sv) {
    times.push({ date: sv,
      startTime: document.getElementById('f-start-time').value,
      endTime:   document.getElementById('f-end-time').value });
  }

  const ageGroups = Array.from(
    document.querySelectorAll('#f-age-groups input:checked')
  ).map(cb => cb.value);

  const fd = new FormData();
  fd.append('title',       form.title.value.trim());
  fd.append('location',    form.location.value.trim());
  fd.append('type',        form.type.value.trim());
  fd.append('price',       form.price.value || '0');
  fd.append('startDate',   sv);
  fd.append('endDate',     ev || sv);
  fd.append('description', document.getElementById('f-desc').value.trim());
  fd.append('times',       JSON.stringify(times));
  fd.append('ageGroups',   JSON.stringify(ageGroups));
  if (form.flyer.files[0]) fd.append('flyer', form.flyer.files[0]);

  try {
    const r    = await fetch('api/events.php', { method:'POST', body:fd, credentials:'same-origin' });
    const data = await r.json();
    if (data.ok) {
      statusEl.className = 'status-msg success';
      statusEl.textContent = '\u2713 Event submitted! It will appear once approved by a planner.';
      form.reset();
      document.getElementById('single-times').classList.remove('hidden');
      document.getElementById('multi-times').classList.add('hidden');
      await loadTypes();
    } else {
      statusEl.className = 'status-msg error';
      statusEl.textContent = data.error || 'Submission failed. Please try again.';
    }
  } catch {
    statusEl.className = 'status-msg error';
    statusEl.textContent = 'Network error. Please check your connection and try again.';
  }
  btn.disabled = false;
}

// ── Export / Import ───────────────────────────────────────────────────────────
async function exportMonth(month) {
  const r = await fetch(`api/events.php?month=${month}`, { credentials: 'same-origin' });
  const events = await r.json();
  const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `funfinder-${month}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

async function importMonth(month, file) {
  const statusEl = document.getElementById('import-status');
  statusEl.className = 'status-msg'; statusEl.textContent = 'Importing\u2026';
  statusEl.classList.remove('hidden');
  let events;
  try {
    events = JSON.parse(await file.text());
  } catch {
    statusEl.className = 'status-msg error'; statusEl.textContent = 'Invalid JSON file.';
    return;
  }
  if (!Array.isArray(events)) {
    statusEl.className = 'status-msg error'; statusEl.textContent = 'File must contain an array of events.';
    return;
  }
  try {
    const r = await fetch('api/import.php', {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ month, events }),
    });
    const data = await r.json();
    if (data.ok) {
      Object.keys(eventsCache).forEach(k => delete eventsCache[k]);
      statusEl.className = 'status-msg success';
      statusEl.textContent = `\u2713 Imported ${data.count} event(s) for ${month}.`;
      render();
    } else {
      statusEl.className = 'status-msg error'; statusEl.textContent = data.error || 'Import failed.';
    }
  } catch {
    statusEl.className = 'status-msg error'; statusEl.textContent = 'Network error.';
  }
}

// ── Release notes ────────────────────────────────────────────────────────────
async function loadNotes() {
  try {
    const r = await fetch('api/notes.php', { credentials: 'same-origin' });
    if (r.ok) { const d = await r.json(); releaseNotes = d.notes || ''; }
  } catch {}
}

function openNotesModal() {
  document.getElementById('notes-modal-version').textContent =
    document.getElementById('version-num').textContent;
  document.getElementById('notes-modal-body').textContent =
    releaseNotes.trim() || 'No release notes yet.';
  document.getElementById('notes-modal').classList.remove('hidden');
  document.getElementById('notes-overlay').classList.remove('hidden');
}

function closeNotesModal() {
  document.getElementById('notes-modal').classList.add('hidden');
  document.getElementById('notes-overlay').classList.add('hidden');
}

function updateLoginNavBtn() {
  const btn = document.getElementById('login-nav-btn');
  btn.textContent = plannerLoggedIn ? 'Logout' : 'Login';
}

// ── Planner auth ──────────────────────────────────────────────────────────────
async function checkSession() {
  if (!authToken) return;
  try {
    const r = await fetch('api/pending.php', { headers: authHeaders() });
    if (r.ok) { plannerLoggedIn = true; showPlannerPanel(await r.json()); }
    else { authToken = null; localStorage.removeItem('ff_token'); }
  } catch {}
}


document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target, errEl = document.getElementById('login-error');
  errEl.classList.add('hidden');
  try {
    const r = await fetch('api/login.php', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:form.username.value, password:form.password.value }),
      credentials:'same-origin',
    });
    const data = await r.json();
    if (data.ok) {
      authToken = data.token;
      localStorage.setItem('ff_token', authToken);
      form.reset();
      const pending = await (await fetch('api/pending.php', { headers: authHeaders() })).json();
      showPlannerPanel(pending);
    } else { errEl.textContent = 'Invalid username or password.'; errEl.classList.remove('hidden'); }
  } catch { errEl.textContent = 'Network error.'; errEl.classList.remove('hidden'); }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  authToken = null;
  localStorage.removeItem('ff_token');
  hidePlannerPanel();
});

function showPlannerPanel(pending) {
  plannerLoggedIn = true;
  document.getElementById('login-area').classList.add('hidden');
  document.getElementById('planner-panel').classList.remove('hidden');
  renderPendingList(pending);
  updateLoginNavBtn();
  document.getElementById('notes-input').value = releaseNotes;
  // Ensure planner section is expanded
  const pt = document.getElementById('planner-toggle');
  const pb = document.getElementById('planner-body');
  if (pt && pb) { pt.setAttribute('aria-expanded', 'true'); pb.classList.add('expanded'); }
  render();
}

function hidePlannerPanel() {
  plannerLoggedIn = false;
  authToken = null;
  localStorage.removeItem('ff_token');
  document.getElementById('planner-panel').classList.add('hidden');
  document.getElementById('login-area').classList.remove('hidden');
  updateLoginNavBtn();
  render();
}

async function refreshPending() {
  try {
    const r = await fetch('api/pending.php', { headers: authHeaders() });
    renderPendingList(await r.json());
  } catch {}
}

let pendingConfirm = null;

function renderPendingList(events) {
  const empty = document.getElementById('pending-empty');
  const list  = document.getElementById('pending-list');
  list.innerHTML = '';
  if (!events?.length) { empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');

  events.forEach(evt => {
    const card = document.createElement('div');
    card.className = 'pending-card';
    const dateRange = evt.endDate && evt.endDate !== evt.startDate
      ? `${evt.startDate} \u2013 ${evt.endDate}` : evt.startDate;
    card.innerHTML = `
      <div class="pending-card-title">${esc(evt.title)}</div>
      <div class="pending-card-meta">${esc(dateRange)}${evt.type ? ' \u00b7 ' + esc(evt.type) : ''}</div>
      <div class="pending-card-meta">Submitted ${esc(new Date(evt.submittedAt).toLocaleDateString())}${evt.location ? ' \u00b7 \uD83D\uDCCD ' + esc(evt.location) : ''}</div>
      ${evt.price > 0 ? `<div class="pending-card-meta">$${Number(evt.price).toFixed(2)}</div>` : ''}
      <div class="pending-card-actions">
        <button class="btn btn-green btn-sm" data-action="approve" data-id="${esc(evt.id)}">Approve</button>
        <button class="btn btn-red   btn-sm" data-action="reject"  data-id="${esc(evt.id)}">Reject</button>
      </div>`;
    list.appendChild(card);
  });

  list.querySelectorAll('[data-action="approve"]').forEach(btn => {
    btn.addEventListener('click', () =>
      showConfirm('Approve this event? It will become visible to all visitors.', async () => {
        await fetch('api/approve.php',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
          body:JSON.stringify({id:btn.dataset.id})});
        Object.keys(eventsCache).forEach(k => delete eventsCache[k]);
        await render(); await refreshPending();
      })
    );
  });

  list.querySelectorAll('[data-action="reject"]').forEach(btn => {
    btn.addEventListener('click', () =>
      showConfirm('Reject and delete this event? This cannot be undone.', async () => {
        await fetch('api/reject.php',{method:'POST',headers:authHeaders({'Content-Type':'application/json'}),
          body:JSON.stringify({id:btn.dataset.id})});
        await refreshPending();
      })
    );
  });
}

function showConfirm(msg, onConfirm, opts = {}) {
  pendingConfirm = onConfirm;
  document.getElementById('confirm-msg').textContent = msg;
  const yesBtn = document.getElementById('confirm-yes');
  const noBtn  = document.getElementById('confirm-no');
  yesBtn.textContent = opts.confirmLabel || 'Confirm';
  yesBtn.className   = 'btn ' + (opts.confirmClass || 'btn-primary');
  noBtn.textContent  = opts.cancelLabel  || 'Cancel';
  document.getElementById('confirm-backdrop').classList.remove('hidden');
  document.getElementById('confirm-dialog').classList.remove('hidden');
}
function closeConfirm() {
  pendingConfirm = null;
  document.getElementById('confirm-backdrop').classList.add('hidden');
  document.getElementById('confirm-dialog').classList.add('hidden');
}
document.getElementById('confirm-yes').addEventListener('click', () => { const cb = pendingConfirm; closeConfirm(); if (cb) cb(); });
document.getElementById('confirm-no').addEventListener('click', closeConfirm);

// ── Main render ───────────────────────────────────────────────────────────────
async function render() {
  const state = getState();
  renderFilterChips(state);
  try {
    switch (state.view) {
      case 'day':   await renderDayView(state);   break;
      case 'event': await renderEventView(state); break;
      default:      await renderMonthView(state); break;
    }
  } catch (err) { console.error('Render error:', err); }
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  initAgeCheckboxes();

  // Notes popup
  document.getElementById('version-header').addEventListener('click', openNotesModal);
  document.getElementById('notes-close').addEventListener('click', closeNotesModal);
  document.getElementById('notes-overlay').addEventListener('click', closeNotesModal);

  // Generic collapsible helpers
  function toggleSection(toggleBtn, bodyEl) {
    const open = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', String(!open));
    bodyEl.classList.toggle('expanded', !open);
    if (!open) toggleBtn.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  function expandSection(toggleBtn, bodyEl) {
    const wasOpen = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', 'true');
    bodyEl.classList.add('expanded');
    if (!wasOpen) toggleBtn.closest('.card').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Submit section toggle
  const submitToggle = document.getElementById('submit-toggle');
  const submitBody   = document.getElementById('submit-body');
  submitToggle.addEventListener('click', () => toggleSection(submitToggle, submitBody));

  // Planner section toggle
  const plannerToggle = document.getElementById('planner-toggle');
  const plannerBody   = document.getElementById('planner-body');
  plannerToggle.addEventListener('click', () => toggleSection(plannerToggle, plannerBody));

  // Nav jump buttons (Calendar, Submit Event)
  document.querySelectorAll('.nav-jump-btn:not(#login-nav-btn)').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.target === 'section-submit') expandSection(submitToggle, submitBody);
      document.getElementById(btn.dataset.target)?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Login / Logout nav button
  document.getElementById('login-nav-btn').addEventListener('click', async () => {
    if (plannerLoggedIn) {
      hidePlannerPanel();
    } else {
      expandSection(plannerToggle, plannerBody);
    }
  });

  // Section ▲ Top buttons
  document.querySelectorAll('.top-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('top')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Export / Import
  const dataMonthEl = document.getElementById('data-month');
  const s = getState();
  dataMonthEl.value = `${s.year}-${String(s.month + 1).padStart(2, '0')}`;

  document.getElementById('export-btn').addEventListener('click', () => {
    const month = dataMonthEl.value;
    if (!month) return;
    exportMonth(month);
  });
  document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
  });
  document.getElementById('import-file').addEventListener('change', async e => {
    const file = e.target.files[0];
    if (!file) return;
    const month = dataMonthEl.value;
    if (!month) { alert('Please select a month first.'); return; }
    await importMonth(month, file);
    e.target.value = '';
  });

  // Save notes (planner)
  document.getElementById('save-notes-btn').addEventListener('click', async () => {
    const notesInput = document.getElementById('notes-input');
    const statusEl   = document.getElementById('notes-save-status');
    const saveBtn    = document.getElementById('save-notes-btn');
    saveBtn.disabled = true;
    statusEl.className = 'status-msg'; statusEl.textContent = 'Saving\u2026';
    statusEl.classList.remove('hidden');
    try {
      const r = await fetch('api/notes.php', {
        method: 'POST',
        headers: authHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ notes: notesInput.value }),
      });
      const data = await r.json();
      if (data.ok) {
        releaseNotes = notesInput.value;
        statusEl.className = 'status-msg success'; statusEl.textContent = '\u2713 Notes saved.';
      } else {
        statusEl.className = 'status-msg error'; statusEl.textContent = data.error || 'Save failed.';
      }
    } catch {
      statusEl.className = 'status-msg error'; statusEl.textContent = 'Network error.';
    }
    saveBtn.disabled = false;
  });

  document.getElementById('filter-btn').addEventListener('click', openFilterModal);
  document.getElementById('filter-overlay').addEventListener('click', closeFilterModal);
  document.getElementById('filter-close').addEventListener('click', closeFilterModal);
  document.getElementById('filter-clear').addEventListener('click', () => {
    document.querySelectorAll('#filter-ages input, #filter-types input')
      .forEach(cb => cb.checked = false);
  });
  document.getElementById('filter-apply').addEventListener('click', () => {
    const ages  = Array.from(document.querySelectorAll('#filter-ages  input:checked')).map(c => c.value);
    const types = Array.from(document.querySelectorAll('#filter-types input:checked')).map(c => c.value);
    closeFilterModal();
    const s = getState();
    navigate({ ...s, filterAges: ages, filterTypes: types });
  });

  setupForm();
  await loadNotes();
  await loadTypes();
  await checkSession();
  await render();
});
