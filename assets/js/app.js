
const STORAGE_KEY = 'fittracker_v2';

const MEASUREMENTS = [
  { key: 'poids', label: 'Poids', unit: 'kg', icon: '⚖️' },
  { key: 'poitrine', label: 'Poitrine', unit: 'cm', icon: '📏' },
  { key: 'taille', label: 'Taille', unit: 'cm', icon: '📏' },
  { key: 'hanches', label: 'Hanches', unit: 'cm', icon: '📏' },
  { key: 'epaules', label: 'Épaules', unit: 'cm', icon: '🏋️' },
  { key: 'bras_g', label: 'Bras G', unit: 'cm', icon: '💪' },
  { key: 'bras_d', label: 'Bras D', unit: 'cm', icon: '💪' },
  { key: 'avantbras_g', label: 'Avant-bras G', unit: 'cm', icon: '💪' },
  { key: 'avantbras_d', label: 'Avant-bras D', unit: 'cm', icon: '💪' },
  { key: 'cuisse_g', label: 'Cuisse G', unit: 'cm', icon: '🦵' },
  { key: 'cuisse_d', label: 'Cuisse D', unit: 'cm', icon: '🦵' },
  { key: 'mollet_g', label: 'Mollet G', unit: 'cm', icon: '🦵' },
  { key: 'mollet_d', label: 'Mollet D', unit: 'cm', icon: '🦵' },
  { key: 'cou', label: 'Cou', unit: 'cm', icon: '📏' },
];

const INVERT = ['taille']; // métriques où baisser = bien

const MEASUREMENT_GROUPS = [
  { title: 'Poids', icon: '⚖️', keys: ['poids'] },
  { title: 'Tronc', icon: '🧍', keys: ['poitrine', 'taille', 'hanches', 'epaules', 'cou'] },
  { title: 'Bras', icon: '💪', keys: ['bras_g', 'bras_d', 'avantbras_g', 'avantbras_d'] },
  { title: 'Jambes', icon: '🦵', keys: ['cuisse_g', 'cuisse_d', 'mollet_g', 'mollet_d'] },
];

// ── STATE ──────────────────────────────────────────────
let db = load();
let activeTab = 0;
let chartMetric = 'poids';
let chartInstance = null;
let pendingDelete = null;
let editingId = null;
let toastTimer = null;
let confirmResolve = null;

// ── PERSISTENCE ────────────────────────────────────────
// Normalise aussi les données importées : elles peuvent être invalides.
function normalize(data) {
  return {
    entries: Array.isArray(data && data.entries)
      ? data.entries
          .filter(e => e && typeof e.date === 'string')
          // L'id est interpolé dans des gestionnaires onclick : le forcer en nombre.
          .map((e, i) => ({ ...e, id: Number.isFinite(Number(e.id)) ? Number(e.id) : i + 1 }))
      : [],
    goals: data && data.goals && typeof data.goals === 'object' && !Array.isArray(data.goals)
      ? data.goals
      : {}
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : { entries: [], goals: {} };
  } catch { return { entries: [], goals: {} }; }
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    toast('Stockage local plein ou indisponible : exporte tes données.', 'error');
  }
}

// ── HELPERS ────────────────────────────────────────────
function $(id) { return document.getElementById(id); }

// Échappe tout texte venant du stockage ou d'un import avant insertion HTML.
function esc(value) {
  return (value === undefined || value === null ? '' : String(value))
    .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function today() { return new Date().toISOString().split('T')[0]; }

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtDateShort(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

function monthLabel(ym) {
  const [year, month] = ym.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
}

function deltaHTML(val, unit, key) {
  if (val === null || val === undefined || isNaN(val)) return '';
  const n = Number(val);
  const up = n > 0;
  const cls = (up ? 'delta-up' : 'delta-down') + (INVERT.includes(key) ? ' inv' : '');
  return `<span class="${cls}">${up ? '▲' : '▼'} ${Math.abs(n).toFixed(1)}${esc(unit)}</span>`;
}

function toast(message, type = 'info') {
  const el = $('toast');
  if (!el) return;
  clearTimeout(toastTimer);
  el.textContent = message;
  el.className = 'toast show ' + type;
  toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
}

function askConfirm(message, label = 'Confirmer') {
  const dialog = $('confirm-dialog');
  $('confirm-msg').textContent = message;
  $('dialog-ok').textContent = label;
  return new Promise(resolve => {
    if (!dialog || typeof dialog.showModal !== 'function') {
      resolve(window.confirm(message));
      return;
    }
    confirmResolve = resolve;
    dialog.showModal();
  });
}

function closeConfirm(result) {
  const dialog = $('confirm-dialog');
  if (dialog && dialog.open) dialog.close(); // déclenche l'événement « close »
  if (confirmResolve) {
    const resolve = confirmResolve;
    confirmResolve = null;
    resolve(result);
  }
}

// ── TABS ───────────────────────────────────────────────
function switchTab(i) {
  activeTab = i;
  // Les deux navigations (desktop et mobile) doivent refléter le même onglet.
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const on = Number(btn.dataset.tab) === i;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-selected', String(on));
    btn.tabIndex = on ? 0 : -1;
  });
  document.querySelectorAll('.panel').forEach((panel, j) => {
    const on = j === i;
    panel.classList.toggle('active', on);
    panel.setAttribute('aria-hidden', String(!on));
  });
  if (i === 1) renderChart();
  if (i === 3) renderHistory();
  updateSubtitle();
}

function handleTabKeys(event) {
  const btn = event.target.closest && event.target.closest('.tab-btn');
  if (!btn || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  const list = btn.closest('.tabs, .tabbar');
  if (!list) return;
  const buttons = [...list.querySelectorAll('.tab-btn')];
  const current = buttons.indexOf(btn);
  let next = current;
  if (event.key === 'ArrowRight') next = (current + 1) % buttons.length;
  if (event.key === 'ArrowLeft') next = (current - 1 + buttons.length) % buttons.length;
  if (event.key === 'Home') next = 0;
  if (event.key === 'End') next = buttons.length - 1;
  event.preventDefault();
  switchTab(next);
  buttons[next].focus();
}

function updateSubtitle() {
  const n = db.entries.length;
  $('subtitle').textContent = `${n} entrée${n !== 1 ? 's' : ''} · stockage local`;
}

// ── TAB 0: SAISIR ──────────────────────────────────────
function buildSaisirGrid() {
  $('grid-saisir').innerHTML = MEASUREMENT_GROUPS.map(g => `
    <div class="segment">
      <div class="segment-title">${g.icon} ${g.title}</div>
      <div class="grid">
        ${g.keys.map(k => {
          const m = MEASUREMENTS.find(x => x.key === k);
          return `<div class="grid-cell">
              <label for="f-${k}">${m.icon} ${m.label} <span class="unit">${m.unit}</span></label>
              <input type="number" step="0.1" min="0" inputmode="decimal" placeholder="—" id="f-${k}">
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

async function saveEntry() {
  const wasEditing = Boolean(editingId);
  const date = $('input-date').value || today();
  const note = $('input-note').value.trim();
  const values = {};
  let hasVal = false;

  for (const m of MEASUREMENTS) {
    const raw = $(`f-${m.key}`).value;
    if (raw === '') continue;
    const v = parseFloat(raw);
    if (!Number.isFinite(v) || v < 0) {
      toast(`Valeur invalide pour ${m.label}.`, 'error');
      $(`f-${m.key}`).focus();
      return;
    }
    values[m.key] = v;
    hasVal = true;
  }
  if (!hasVal) {
    toast('Entre au moins une mesure.', 'error');
    $('f-poids').focus();
    return;
  }

  if (editingId) {
    // Éviter deux entrées pour une même date après modification.
    const other = db.entries.findIndex(e => e.date === date && e.id !== editingId);
    if (other !== -1 && !(await askConfirm('Une autre entrée existe à cette date. La remplacer par celle-ci ?', 'Remplacer'))) return;
    if (other !== -1) db.entries.splice(other, 1);
    const idx = db.entries.findIndex(e => e.id === editingId);
    const entry = { id: editingId, date, note, ...values };
    if (idx !== -1) db.entries[idx] = entry;
    else db.entries.push(entry);
  } else {
    const existing = db.entries.findIndex(e => e.date === date);
    if (existing !== -1 && !(await askConfirm('Une entrée existe déjà pour cette date. La remplacer ?', 'Remplacer'))) return;
    if (existing !== -1) db.entries.splice(existing, 1);
    db.entries.push({ id: Date.now(), date, note, ...values });
  }

  db.entries.sort((a, b) => b.date.localeCompare(a.date));
  persist();

  MEASUREMENTS.forEach(m => { $(`f-${m.key}`).value = ''; });
  $('input-note').value = '';
  setEditingUI(null);
  toast(wasEditing ? 'Entrée mise à jour.' : 'Entrée enregistrée.', 'success');
  renderDaySummary();
  updateSubtitle();
  if (activeTab === 3) renderHistory();
}

function setEditingUI(id) {
  editingId = id || null;
  const btn = $('btn-save');
  const cancel = $('btn-cancel-edit');
  if (editingId) {
    btn.classList.add('editing');
    btn.textContent = '✏️ Mettre à jour l\u2019entrée';
    cancel.style.display = '';
  } else {
    btn.classList.remove('editing');
    btn.textContent = '💾 Enregistrer cette entrée';
    cancel.style.display = 'none';
  }
}

function editEntry(id) {
  const e = db.entries.find(x => x.id === id);
  if (!e) return;
  MEASUREMENTS.forEach(m => {
    $(`f-${m.key}`).value = (e[m.key] !== undefined) ? e[m.key] : '';
  });
  $('input-date').value = e.date;
  $('input-note').value = e.note || '';
  switchTab(0);
  setEditingUI(id);
  renderDaySummary();
  window.scrollTo(0, 0);
  $('input-note').focus();
}

function cancelEdit() {
  MEASUREMENTS.forEach(m => { $(`f-${m.key}`).value = ''; });
  $('input-note').value = '';
  $('input-date').value = today();
  setEditingUI(null);
  renderDaySummary();
}

function repopulateLast() {
  const last = [...db.entries].sort((a, b) => b.date.localeCompare(a.date))[0];
  if (!last) { toast('Aucune entrée à reprendre pour l\u2019instant.', 'error'); return; }
  MEASUREMENTS.forEach(m => {
    $(`f-${m.key}`).value = (last[m.key] !== undefined) ? last[m.key] : '';
  });
  // On garde la date du jour : l'action sert à préparer une nouvelle mesure.
  $('input-date').value = today();
  $('input-note').value = last.note || '';
  setEditingUI(null);
  toast('Valeurs de la dernière entrée copiées.');
  $('f-poids').focus();
}

function renderDaySummary() {
  const el = $('day-summary');
  if (!el) return;
  const sorted = [...db.entries].sort((a, b) => b.date.localeCompare(a.date));
  if (!sorted.length) { el.style.display = 'none'; return; }

  // Synthèse de la date sélectionnée si elle existe, sinon dernière entrée.
  const selected = $('input-date').value;
  const last = sorted.find(e => e.date === selected) || sorted[0];
  const prev = sorted[sorted.indexOf(last) + 1] || null;
  const hasGoal = MEASUREMENTS.some(m => db.goals[m.key] !== undefined);

  const groups = MEASUREMENT_GROUPS.map(g => {
    const rows = g.keys.map(k => {
      const m = MEASUREMENTS.find(x => x.key === k);
      if (last[m.key] === undefined) return '';
      let delta = '';
      if (prev && prev[m.key] !== undefined) {
        const d = +(last[m.key] - prev[m.key]).toFixed(1);
        if (d !== 0) {
          const up = d > 0;
          const cls = (up ? 'delta-up' : 'delta-down') + (INVERT.includes(k) ? ' inv' : '');
          delta = `<span class="${cls}">${up ? '▲' : '▼'} ${Math.abs(d)}</span>`;
        }
      }
      let goal = '';
      if (db.goals[k] !== undefined) {
        const gv = parseFloat(db.goals[k]);
        if (Number.isFinite(gv)) {
          const ok = INVERT.includes(k) ? last[m.key] <= gv : last[m.key] >= gv;
          goal = `<span class="sum-goal ${ok ? 'ok' : 'no'}" title="Objectif ${esc(gv)} ${esc(m.unit)}">${ok ? '✓' : '✗'}</span>`;
        }
      }
      return `<div class="sum-row">
        <span class="sum-name">${esc(m.label)}</span>
        <span class="sum-val">${esc(last[m.key])}<span class="unit">&nbsp;${esc(m.unit)}</span></span>
        ${delta}${hasGoal ? goal : ''}
      </div>`;
    }).filter(Boolean).join('');
    return `<div class="sum-group">
      <div class="sum-group-title">${g.icon} ${g.title}</div>
      ${rows}
    </div>`;
  }).join('');

  el.style.display = 'block';
  el.innerHTML = `
    <div class="sum-card">
      <div class="sum-head">
        <span class="sum-title">📊 Synthèse</span>
        <span class="sum-date">${fmtDate(last.date)}${prev ? ` · vs ${fmtDate(prev.date)}` : ''}</span>
      </div>
      ${groups}
      ${last.note ? `<div class="sum-note">${esc(last.note)}</div>` : ''}
    </div>`;
}

// ── TAB 1: GRAPHIQUES ──────────────────────────────────
function buildChips() {
  const container = $('chips-metrics');
  container.innerHTML = '';
  MEASUREMENTS.forEach(m => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (m.key === chartMetric ? ' active' : '');
    btn.textContent = m.icon + ' ' + m.label;
    btn.setAttribute('aria-pressed', String(m.key === chartMetric));
    btn.onclick = () => { chartMetric = m.key; buildChips(); renderChart(); };
    container.appendChild(btn);
  });
}

function renderChart() {
  buildChips();
  const m = MEASUREMENTS.find(x => x.key === chartMetric);

  const entries = db.entries
    .filter(e => e[chartMetric] !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date));
  const points = entries.map(e => ({
    label: fmtDateShort(e.date),
    full: fmtDate(e.date),
    y: e[chartMetric]
  }));

  // Statistiques
  const latest = entries.length ? entries[entries.length - 1][chartMetric] : null;
  const prev = entries.length > 1 ? entries[entries.length - 2][chartMetric] : null;
  const delta = (latest !== null && prev !== null) ? latest - prev : null;
  const goal = db.goals[chartMetric] !== undefined ? parseFloat(db.goals[chartMetric]) : null;

  const pills = $('stat-pills');
  pills.innerHTML = '';
  if (latest !== null) {
    pills.innerHTML += pill('Dernier', `${esc(latest)} ${esc(m.unit)}`, 'var(--green)');
    if (delta !== null) pills.innerHTML += pill('Évolution', deltaHTML(delta, m.unit, chartMetric), 'var(--blue)');
    if (goal !== null && Number.isFinite(goal)) pills.innerHTML += pill('Objectif', `${esc(goal)} ${esc(m.unit)}`, 'var(--yellow)');
    if (goal !== null && Number.isFinite(goal)) pills.innerHTML += pill('Écart obj.', deltaHTML(latest - goal, m.unit, chartMetric), 'var(--purple)');
  }

  // Graphique
  const box = $('chart-box');
  const empty = $('chart-empty');
  if (typeof Chart === 'undefined') {
    box.style.display = 'none';
    empty.style.display = 'block';
    $('chart-empty-msg').textContent = 'Graphiques indisponibles (bibliothèque manquante).';
    return;
  }
  if (points.length < 2) {
    box.style.display = 'none';
    empty.style.display = 'block';
    $('chart-empty-msg').textContent =
      points.length === 1 ? 'Au moins 2 entrées requises pour voir l\'évolution' : 'Aucune donnée pour cette métrique';
    return;
  }
  box.style.display = 'block';
  empty.style.display = 'none';

  $('chart-title').textContent = `${m.icon} ${m.label} (${m.unit}) · ${points.length} relevés`;

  if (chartInstance) chartInstance.destroy();
  const ctx = $('myChart').getContext('2d');
  const datasets = [{
    label: m.label,
    data: points.map(p => p.y),
    borderColor: '#34d399',
    backgroundColor: 'rgba(52,211,153,0.12)',
    borderWidth: 2.5,
    pointBackgroundColor: '#34d399',
    pointRadius: 4,
    pointHoverRadius: 6,
    tension: 0.35,
    fill: true,
  }];

  if (goal !== null && Number.isFinite(goal)) {
    datasets.push({
      label: 'Objectif',
      data: points.map(() => goal),
      borderColor: '#f6c453',
      borderWidth: 1.5,
      borderDash: [6, 4],
      pointRadius: 0,
      tension: 0,
      fill: false,
    });
  }

  chartInstance = new Chart(ctx, {
    type: 'line',
    data: { labels: points.map(p => p.label), datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { intersect: false, mode: 'index' },
      plugins: {
        legend: { display: datasets.length > 1, labels: { color: '#8aa09d', font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#0e1620', borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1,
          titleColor: '#e9f2ee', bodyColor: '#34d399',
          callbacks: {
            title: items => points[items[0].dataIndex].full,
            label: ctx => ` ${ctx.parsed.y} ${m.unit}`
          }
        }
      },
      scales: {
        x: { ticks: { color: '#8aa09d', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.07)' } },
        y: { ticks: { color: '#8aa09d', font: { size: 11 } }, grid: { color: 'rgba(255,255,255,0.07)' } }
      }
    }
  });
}

function pill(label, valHTML, color) {
  return `<div class="pill" style="border-color:${color}44">
 <div class="pill-label">${label}</div>
 <div class="pill-val" style="color:${color}">${valHTML}</div>
   </div>`;
}

// ── TAB 3: HISTORIQUE ──────────────────────────────────
function renderHistory() {
  const list = $('history-list');
  const query = ($('history-search').value || '').trim().toLocaleLowerCase('fr');
  const all = [...db.entries].sort((a, b) => b.date.localeCompare(a.date));
  const entries = query
    ? all.filter(e => fmtDate(e.date).toLocaleLowerCase('fr').includes(query)
      || (e.note || '').toLocaleLowerCase('fr').includes(query))
    : all;

  $('history-count').textContent = `${entries.length} entrée${entries.length !== 1 ? 's' : ''}`;

  if (!all.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">📭</div><p>Aucune entrée pour l'instant</p></div>`;
    return;
  }
  if (!entries.length) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">🔍</div><p>Aucun résultat pour « ${esc(query)} »</p></div>`;
    return;
  }

  let html = '';
  let currentMonth = '';
  for (const e of entries) {
    const month = e.date.slice(0, 7);
    if (month !== currentMonth) {
      currentMonth = month;
      html += `<div class="month-label">${monthLabel(month)}</div>`;
    }
    html += entryCard(e);
  }
  list.innerHTML = html;
}

function entryCard(e) {
  const vals = MEASUREMENTS.filter(m => e[m.key] !== undefined)
    .map(m => `<span class="entry-val"><span>${esc(m.label)}:</span> ${esc(e[m.key])} ${esc(m.unit)}</span>`).join('');
  const actions = pendingDelete === e.id
    ? `<div class="entry-actions">
    <button type="button" class="btn-sm btn-del-confirm" onclick="confirmDelete(${e.id})">Supprimer</button>
    <button type="button" class="btn-sm btn-cancel" onclick="cancelDelete()">Annuler</button>
   </div>`
    : `<div class="entry-actions">
    <button type="button" class="btn-sm btn-edit" onclick="editEntry(${e.id})" aria-label="Modifier l'entrée du ${esc(fmtDate(e.date))}" title="Modifier">✏️</button>
    <button type="button" class="btn-sm btn-del" onclick="askDelete(${e.id})" aria-label="Supprimer l'entrée du ${esc(fmtDate(e.date))}" title="Supprimer">🗑</button>
   </div>`;

  return `<div class="entry-card" id="card-${e.id}">
<div class="entry-header">
  <div>
    <div class="entry-date">${fmtDate(e.date)}</div>
    ${e.note ? `<div class="entry-note">${esc(e.note)}</div>` : ''}
  </div>
  ${actions}
</div>
<div class="entry-vals">${vals || '<span style="color:var(--muted);font-size:0.78em">Aucune mesure</span>'}</div>
  </div>`;
}

function askDelete(id) {
  pendingDelete = id;
  renderHistory();
  $('history-list').querySelector('.btn-del-confirm')?.focus();
}

function cancelDelete() { pendingDelete = null; renderHistory(); }

function confirmDelete(id) {
  db.entries = db.entries.filter(e => e.id !== id);
  persist();
  pendingDelete = null;
  renderHistory();
  updateSubtitle();
  renderDaySummary();
  toast('Entrée supprimée.');
}

// ── TAB 2: OBJECTIFS ───────────────────────────────────
function buildGoalsGrid() {
  $('grid-goals').innerHTML = MEASUREMENT_GROUPS.map(g => `
    <div class="segment">
      <div class="segment-title">${g.icon} ${g.title}</div>
      <div class="grid">
        ${g.keys.map(k => {
          const m = MEASUREMENTS.find(x => x.key === k);
          const val = db.goals[k] !== undefined ? db.goals[k] : '';
          return `<div class="grid-cell">
              <label for="g-${k}">${m.icon} ${m.label} <span class="unit">${m.unit}</span></label>
              <input class="goal-input" type="number" step="0.1" min="0" inputmode="decimal" placeholder="—" id="g-${k}" value="${esc(val)}">
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function saveGoals() {
  MEASUREMENTS.forEach(m => {
    const v = $(`g-${m.key}`).value;
    if (v !== '') db.goals[m.key] = parseFloat(v);
    else delete db.goals[m.key];
  });
  persist();
  renderDaySummary();
  if (activeTab === 1) renderChart();
  toast('Objectifs sauvegardés.', 'success');
}

// ── EXPORT / IMPORT ────────────────────────────────────
function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportJSON() {
  download(new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' }), `fittracker_backup_${today()}.json`);
  toast('Sauvegarde JSON téléchargée.', 'success');
}

async function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    let data;
    try { data = JSON.parse(ev.target.result); }
    catch { toast('Fichier JSON invalide.', 'error'); return; }
    if (!data || !Array.isArray(data.entries)) {
      toast('Fichier invalide : aucune entrée trouvée.', 'error');
      return;
    }
    if (!(await askConfirm(`Importer ${data.entries.length} entrée(s) ? Tes données actuelles seront remplacées.`, 'Importer'))) return;

    db = normalize(data);
    persist();
    buildGoalsGrid();
    renderDaySummary();
    renderHistory();
    updateSubtitle();
    if (activeTab === 1) renderChart();
    toast(`Import réussi : ${db.entries.length} entrée(s).`, 'success');
  };
  reader.readAsText(file);
  event.target.value = '';
}

function csvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function exportCSV() {
  const headers = ['date', 'note', ...MEASUREMENTS.map(m => m.key)];
  const rows = db.entries.map(e => headers.map(h => csvCell(e[h])).join(';'));
  // BOM + séparateur « ; » pour une ouverture directe dans Excel en français.
  const csv = '\uFEFF' + [headers.join(';'), ...rows].join('\r\n');
  download(new Blob([csv], { type: 'text/csv;charset=utf-8;' }), `fittracker_${today()}.csv`);
  toast('Export CSV téléchargé.', 'success');
}

// ── RAPPEL ─────────────────────────────────────────────
const REMINDER_KEY = 'fittracker_reminder_v1';

function reminderState() {
  try { return JSON.parse(localStorage.getItem(REMINDER_KEY)) || null; } catch { return null; }
}

function syncReminderUI() {
  const s = reminderState();
  const on = $('btn-reminder-on');
  const off = $('btn-reminder-off');
  const time = $('reminder-time');
  const freq = $('reminder-freq');
  if (on) on.style.display = (s && s.enabled) ? 'none' : '';
  if (off) off.style.display = (s && s.enabled) ? '' : 'none';
  if (time && s) time.value = s.time || '08:00';
  if (freq && s) freq.value = s.freq || 'daily';
}

async function enableReminder() {
  const time = $('reminder-time').value || '08:00';
  const freq = $('reminder-freq').value || 'daily';
  if (!('Notification' in window)) {
    toast('Notifications non prises en charge par ce navigateur.', 'error');
    return;
  }
  let permission = Notification.permission;
  if (permission === 'default') permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    toast('Notifications refusées. Active-les dans les réglages du navigateur.', 'error');
    return;
  }
  localStorage.setItem(REMINDER_KEY, JSON.stringify({ enabled: true, time, freq }));
  syncReminderUI();
  pushReminder();
  const freqLabel = { daily: 'tous les jours', weekly: 'chaque semaine', monthly: 'chaque mois' }[freq];
  toast(`Rappel activé à ${time} (${freqLabel}).`, 'success');
}

function disableReminder() {
  localStorage.removeItem(REMINDER_KEY);
  syncReminderUI();
  cancelPush();
  toast('Rappel désactivé.');
}

function pushReminder() {
  if (!('serviceWorker' in navigator)) return;
  const s = reminderState();
  if (!s || !s.enabled) return;
  navigator.serviceWorker.ready.then(reg => {
    if (reg.active) reg.active.postMessage({ type: 'setReminder', time: s.time, freq: s.freq });
  });
}

function cancelPush() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.ready.then(reg => {
    if (reg.active) reg.active.postMessage({ type: 'clearReminder' });
  });
}

// ── INIT ───────────────────────────────────────────────
$('input-date').value = today();
$('input-date').addEventListener('change', renderDaySummary);
$('grid-saisir').addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); saveEntry(); }
});
$('history-search').addEventListener('input', renderHistory);
$('dialog-ok').addEventListener('click', () => closeConfirm(true));
$('dialog-cancel').addEventListener('click', () => closeConfirm(false));
$('confirm-dialog').addEventListener('close', () => closeConfirm(false));
document.addEventListener('keydown', handleTabKeys);

buildSaisirGrid();
buildGoalsGrid();
buildChips();
renderHistory();
renderDaySummary();
updateSubtitle();
syncReminderUI();
pushReminder();
switchTab(0);

// ── SERVICE WORKER ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('Échec SW:', err));
  });
}
