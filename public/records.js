let allRecords = [];
let currentId  = null;

// ── Load ──────────────────────────────────────────────────────────────────────

async function loadRecords() {
  const res = await fetch('/api/interventions');
  allRecords = await res.json();
  renderCards(allRecords);
}

function renderCards(records) {
  const el = document.getElementById('recordsList');

  if (!records.length) {
    el.innerHTML = `
      <div class="empty-state">
        <div class="icon">📋</div>
        <p>Aucune fiche enregistrée.</p>
        <a href="index.html" class="btn-primary">Créer la première fiche</a>
      </div>`;
    return;
  }

  el.innerHTML = records.map(r => {
    const date = fmtDate(r.date_intervention);
    const tags = [];
    if (r.h_bl) tags.push(`<span class="tag tag-green">Hacheuse&nbsp;${r.h_bl}</span>`);
    if (r.r_bl) tags.push(`<span class="tag tag-green">Rouleaux&nbsp;${r.r_bl}</span>`);
    if (r.c_bl) tags.push(`<span class="tag tag-blue">Complémentaire&nbsp;${r.c_bl}</span>`);

    return `
      <div class="record-card" data-id="${r.id}" onclick="openDetail(${r.id})">
        <div class="record-head">
          <span class="record-bl">${r.bl_number}</span>
          <span class="record-date">${date}</span>
        </div>
        <div class="record-prods">
          <strong>${r.ancienne_production || '—'}</strong>
          &nbsp;→&nbsp;
          <strong>${r.nouvelle_production || '—'}</strong>
        </div>
        <div class="record-meta">
          Début : ${r.heure_debut || '—'} &nbsp;|&nbsp; ${r.nombre_operateurs || 0} opérateur(s)
        </div>
        ${tags.length ? `<div class="record-tags">${tags.join('')}</div>` : ''}
      </div>`;
  }).join('');
}

// ── Search ────────────────────────────────────────────────────────────────────

function filterCards() {
  const q = document.getElementById('searchInput').value.toLowerCase();
  if (!q) { renderCards(allRecords); return; }
  renderCards(allRecords.filter(r =>
    [r.bl_number, r.ancienne_production, r.nouvelle_production,
     r.date_intervention, r.h_bl, r.r_bl, r.c_bl]
      .some(v => v && v.toLowerCase().includes(q))
  ));
}

// ── Detail panel ──────────────────────────────────────────────────────────────

async function openDetail(id) {
  currentId = id;
  const r = await fetch(`/api/interventions/${id}`).then(res => res.json());

  document.getElementById('detailTitle').textContent =
    `${r.bl_number} — ${fmtDate(r.date_intervention)}`;

  const ops = parseOps(r.noms_operateurs);

  let html = `
    <div class="detail-section">
      <h4>Informations générales</h4>
      <div class="detail-grid">
        ${item('N° BL',          r.bl_number)}
        ${item('Date',           fmtDate(r.date_intervention))}
        ${item('Ancienne prod.', r.ancienne_production)}
        ${item('Nouvelle prod.', r.nouvelle_production)}
        ${item('Heure prévue',   r.heure_prevue)}
        ${item('Heure réelle',   r.heure_reelle)}
        ${item('Heure de début', r.heure_debut)}
        ${item('Nb opérateurs',  r.nombre_operateurs)}
      </div>
      ${ops ? fullItem('Opérateurs', ops) : ''}
      ${r.observations ? fullItem('Observations', r.observations) : ''}
    </div>`;

  if (r.h_bl) {
    html += `
      <div class="detail-section">
        <h4>Nettoyage Hacheuse <span class="tag tag-green">${r.h_bl}</span></h4>
        <div class="detail-grid">
          ${item('Heure début',   r.h_debut)}
          ${item('Heure fin',     r.h_fin)}
          ${item('Nb opérateurs', r.h_ops)}
        </div>
      </div>`;
  }

  if (r.r_bl) {
    html += `
      <div class="detail-section">
        <h4>Nettoyage Rouleaux <span class="tag tag-green">${r.r_bl}</span></h4>
        <div class="detail-grid">
          ${item('Heure début',   r.r_debut)}
          ${item('Heure fin',     r.r_fin)}
          ${item('Nb opérateurs', r.r_ops)}
        </div>
      </div>`;
  }

  if (r.c_bl) {
    html += `
      <div class="detail-section">
        <h4>Nettoyage Complémentaire <span class="tag tag-blue">${r.c_bl}</span></h4>
        <div class="detail-grid">
          ${item('Type',          r.type_nettoyage)}
          ${item('Heure début',   r.c_debut)}
          ${item('Heure fin',     r.c_fin)}
          ${item('Nb opérateurs', r.c_ops)}
        </div>
      </div>`;
  }

  document.getElementById('detailBody').innerHTML = html;
  document.getElementById('detailOverlay').classList.remove('hidden');
}

function closeDetail(e) {
  if (e && e.target !== document.getElementById('detailOverlay')) return;
  document.getElementById('detailOverlay').classList.add('hidden');
  currentId = null;
}
function closeDetailBtn() {
  document.getElementById('detailOverlay').classList.add('hidden');
  currentId = null;
}

// ── Delete ────────────────────────────────────────────────────────────────────

async function deleteRecord() {
  if (!currentId) return;
  if (!confirm('Supprimer définitivement cette fiche ? Cette action est irréversible.')) return;

  await fetch(`/api/interventions/${currentId}`, { method: 'DELETE' });
  closeDetailBtn();
  await loadRecords();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function item(label, value) {
  return `
    <div class="detail-item">
      <span class="lbl">${label}</span>
      <span class="val">${value || '—'}</span>
    </div>`;
}

function fullItem(label, value) {
  return `
    <div class="detail-full">
      <div class="lbl">${label}</div>
      <div class="val">${value}</div>
    </div>`;
}

function fmtDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function parseOps(raw) {
  try {
    const arr = JSON.parse(raw || '[]');
    return arr.length ? arr.join(', ') : null;
  } catch {
    return raw || null;
  }
}

// ── Close with Escape ─────────────────────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeDetailBtn();
});

loadRecords();
