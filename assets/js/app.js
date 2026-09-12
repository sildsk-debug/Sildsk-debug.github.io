
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

// ── PERSISTENCE ────────────────────────────────────────
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { entries: [], goals: {} };
  } catch { return { entries: [], goals: {} }; }
}
function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
}

// ── HELPERS ────────────────────────────────────────────
function today() { return new Date().toISOString().split('T')[0]; }

function fmtDate(d) {
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function deltaHTML(val, unit, key) {
  if (val === null || isNaN(val)) return '';
  const inv = INVERT.includes(key);
  const up = val > 0;
  const good = inv ? !up : up;
  const cls = (up ? 'delta-up' : 'delta-down') + (inv ? ' inv' : '');
  const arrow = up ? '▲' : '▼';
  return `<span class="${cls}">${arrow} ${Math.abs(val).toFixed(1)}${unit}</span>`;
}

// ── TABS ───────────────────────────────────────────────
function switchTab(i) {
  activeTab = i;
  document.querySelectorAll('.tab-btn').forEach((b, j) => b.classList.toggle('active', i === j));
  document.querySelectorAll('.panel').forEach((p, j) => p.classList.toggle('active', i === j));
  if (i === 1) renderChart();
  if (i === 3) renderHistory();
  updateSubtitle();
}

function updateSubtitle() {
  const n = db.entries.length;
  document.getElementById('subtitle').textContent = `${n} entrée${n !== 1 ? 's' : ''} · stockage local`;
}

// ── TAB 0: SAISIR ──────────────────────────────────────
function buildSaisirGrid() {
  const grid = document.getElementById('grid-saisir');
  grid.innerHTML = MEASUREMENT_GROUPS.map(g => `
    <div class="segment">
      <div class="segment-title">${g.icon} ${g.title}</div>
      <div class="grid">
        ${g.keys.map(k => {
          const m = MEASUREMENTS.find(x => x.key === k);
          return `<div class="grid-cell">
              <label>${m.icon} ${m.label} <span class="unit">${m.unit}</span></label>
              <input type="number" step="0.1" placeholder="—" id="f-${k}">
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function saveEntry() {
  const date = document.getElementById('input-date').value || today();
  const note = document.getElementById('input-note').value.trim();
  const entry = { id: Date.now(), date, note };
  let hasVal = false;
  MEASUREMENTS.forEach(m => {
    const v = document.getElementById('f-' + m.key).value;
    if (v !== '') { entry[m.key] = parseFloat(v); hasVal = true; }
  });
  if (!hasVal) { alert('Entre au moins une mesure !'); return; }

  // Si entrée même date → confirmation
  const existing = db.entries.findIndex(e => e.date === date);
  if (existing !== -1) {
    if (!confirm('Une entrée existe déjà pour cette date. La remplacer ?')) return;
    db.entries.splice(existing, 1);
  }

  db.entries.push(entry);
  db.entries.sort((a, b) => b.date.localeCompare(a.date));
  persist();

  // Reset form
  MEASUREMENTS.forEach(m => { document.getElementById('f-' + m.key).value = ''; });
  document.getElementById('input-note').value = '';

  // Feedback
  const btn = document.getElementById('btn-save');
  btn.textContent = '✅ Sauvegardé !';
  btn.classList.add('success');
  setTimeout(() => { btn.textContent = '💾 Enregistrer cette entrée'; btn.classList.remove('success'); }, 2000);
  updateSubtitle();
}

// ── TAB 1: GRAPHIQUES ──────────────────────────────────
function buildChips() {
  const container = document.getElementById('chips-metrics');
  container.innerHTML = '';
  MEASUREMENTS.forEach(m => {
    const btn = document.createElement('button');
    btn.className = 'chip' + (m.key === chartMetric ? ' active' : '');
    btn.textContent = m.icon + ' ' + m.label;
    btn.onclick = () => { chartMetric = m.key; buildChips(); renderChart(); };
    container.appendChild(btn);
  });
}

function renderChart() {
  buildChips();
  const m = MEASUREMENTS.find(x => x.key === chartMetric);

  const points = db.entries
    .filter(e => e[chartMetric] !== undefined)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => ({ x: fmtDate(e.date), y: e[chartMetric] }));

  // Stat pills
  const sorted = db.entries.filter(e => e[chartMetric] !== undefined).sort((a, b) => b.date.localeCompare(a.date));
  const latest = sorted[0] ? sorted[0][chartMetric] : null;
  const prev = sorted[1] ? sorted[1][chartMetric] : null;
  const delta = (latest !== null && prev !== null) ? latest - prev : null;
  const goal = db.goals[chartMetric] !== undefined ? parseFloat(db.goals[chartMetric]) : null;

  const pills = document.getElementById('stat-pills');
  pills.innerHTML = '';
  if (latest !== null) {
    pills.innerHTML += pill('Dernier', `${latest} ${m.unit}`, 'var(--green)');
    if (delta !== null) pills.innerHTML += pill('Évolution', deltaHTML(delta, m.unit, chartMetric), 'var(--blue)');
    if (goal !== null) pills.innerHTML += pill('Objectif', `${goal} ${m.unit}`, 'var(--yellow)');
    if (goal !== null) pills.innerHTML += pill('Écart obj.', deltaHTML(latest - goal, m.unit, chartMetric), 'var(--purple)');
  }

  // Chart
  const box = document.getElementById('chart-box');
  const empty = document.getElementById('chart-empty');
  if (points.length < 2) {
    box.style.display = 'none';
    empty.style.display = 'block';
    document.getElementById('chart-empty-msg').textContent =
      points.length === 1 ? 'Au moins 2 entrées requises pour voir l\'évolution' : 'Aucune donnée pour cette métrique';
    return;
  }
  box.style.display = 'block';
  empty.style.display = 'none';

  document.getElementById('chart-title').textContent = `${m.icon} ${m.label} (${m.unit})`;

  if (chartInstance) chartInstance.destroy();
  const ctx = document.getElementById('myChart').getContext('2d');
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

  // Ligne objectif
  if (goal !== null) {
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
    data: { labels: points.map(p => p.x), datasets },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: goal !== null, labels: { color: '#8aa09d', font: { size: 11 } } },
        tooltip: {
          backgroundColor: '#0e1620', borderColor: 'rgba(255,255,255,0.14)', borderWidth: 1,
          titleColor: '#e9f2ee', bodyColor: '#34d399',
          callbacks: { label: ctx => ` ${ctx.parsed.y} ${m.unit}` }
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

// ── TAB 2: HISTORIQUE ──────────────────────────────────
function renderHistory() {
  const list = document.getElementById('history-list');
  if (db.entries.length === 0) {
    list.innerHTML = `<div class="empty"><div class="empty-icon">📭</div><p>Aucune entrée pour l'instant</p></div>`;
    return;
  }
  list.innerHTML = db.entries.map(e => entryCard(e)).join('');
}

function entryCard(e) {
  const vals = MEASUREMENTS.filter(m => e[m.key] !== undefined)
    .map(m => `<span class="entry-val"><span>${m.label}:</span> ${e[m.key]} ${m.unit}</span>`).join('');
  const actions = pendingDelete === e.id
    ? `<div class="entry-actions">
    <button class="btn-sm btn-del-confirm" onclick="confirmDelete(${e.id})">Supprimer</button>
    <button class="btn-sm btn-cancel" onclick="cancelDelete()">Annuler</button>
   </div>`
    : `<button class="btn-sm btn-del" onclick="askDelete(${e.id})">🗑</button>`;

  return `<div class="entry-card" id="card-${e.id}">
<div class="entry-header">
  <div>
    <div class="entry-date">${fmtDate(e.date)}</div>
    ${e.note ? `<div class="entry-note">${e.note}</div>` : ''}
  </div>
  ${actions}
</div>
<div class="entry-vals">${vals || '<span style="color:var(--muted);font-size:0.78em">Aucune mesure</span>'}</div>
  </div>`;
}

function askDelete(id) { pendingDelete = id; renderHistory(); }
function cancelDelete() { pendingDelete = null; renderHistory(); }
function confirmDelete(id) {
  db.entries = db.entries.filter(e => e.id !== id);
  persist(); pendingDelete = null;
  renderHistory(); updateSubtitle();
}

// ── TAB 3: OBJECTIFS ───────────────────────────────────
function buildGoalsGrid() {
  const grid = document.getElementById('grid-goals');
  grid.innerHTML = MEASUREMENT_GROUPS.map(g => `
    <div class="segment">
      <div class="segment-title">${g.icon} ${g.title}</div>
      <div class="grid">
        ${g.keys.map(k => {
          const m = MEASUREMENTS.find(x => x.key === k);
          const val = db.goals[k] !== undefined ? db.goals[k] : '';
          return `<div class="grid-cell">
              <label>${m.icon} ${m.label} <span class="unit">${m.unit}</span></label>
              <input class="goal-input" type="number" step="0.1" placeholder="—" id="g-${k}" value="${val}">
            </div>`;
        }).join('')}
      </div>
    </div>`).join('');
}

function saveGoals() {
  MEASUREMENTS.forEach(m => {
    const v = document.getElementById('g-' + m.key).value;
    if (v !== '') db.goals[m.key] = parseFloat(v);
    else delete db.goals[m.key];
  });
  persist();
  const btn = document.getElementById('btn-save-goals');
  btn.textContent = '✅ Objectifs sauvegardés !';
  setTimeout(() => { btn.textContent = '🎯 Sauvegarder les objectifs'; }, 1800);
}

// ── EXPORT / IMPORT ────────────────────────────────────
function exportJSON() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fittracker_backup_${today()}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importJSON(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const d = JSON.parse(ev.target.result);
      if (!d.entries) throw new Error();
      db = d;
      persist();
      buildGoalsGrid();
      updateSubtitle();
      alert(`✅ Import réussi ! ${db.entries.length} entrée(s) chargée(s).`);
    } catch { alert('❌ Fichier invalide.'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

function exportCSV() {
  const headers = ['date', 'note', ...MEASUREMENTS.map(m => m.key)];
  const rows = db.entries.map(e => headers.map(h => e[h] !== undefined ? e[h] : '').join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `fittracker_${today()}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// ── INIT ───────────────────────────────────────────────
document.getElementById('input-date').value = today();
buildSaisirGrid();
buildGoalsGrid();
buildChips();
updateSubtitle();


// ── SERVICE WORKER ─────────────────────────────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(err => console.error('Échec SW:', err));
  });
}
