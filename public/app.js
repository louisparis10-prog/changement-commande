let opCount = 1;

// ── BL preview ───────────────────────────────────────────────────────────────

async function refreshBLPreview() {
  const res  = await fetch('/api/preview-bl?count=4');
  const { bls } = await res.json();
  document.getElementById('blMain').textContent    = bls[0];
  document.getElementById('blHacheuse').textContent = bls[1];
  document.getElementById('blRouleaux').textContent = bls[2];
  document.getElementById('blCompl').textContent    = bls[3];
}

// ── Section toggle ────────────────────────────────────────────────────────────

function toggleSection(prefix) {
  const cb   = document.getElementById(`${prefix}_active`);
  const body = document.getElementById(`${prefix}_body`);
  body.classList.toggle('hidden', !cb.checked);
}

// ── Operators ─────────────────────────────────────────────────────────────────

function addOp() {
  opCount++;
  const row = document.createElement('div');
  row.className = 'operator-row';
  row.innerHTML = `
    <input type="text" placeholder="Opérateur ${opCount}" class="op-input">
    <button type="button" class="btn-remove" onclick="removeOp(this)">×</button>`;
  document.getElementById('operatorList').appendChild(row);
}

function removeOp(btn) {
  const rows = document.querySelectorAll('.operator-row');
  if (rows.length > 1) btn.closest('.operator-row').remove();
}

function getOperatorNames() {
  return [...document.querySelectorAll('.op-input')]
    .map(i => i.value.trim())
    .filter(Boolean);
}

// ── Reset ─────────────────────────────────────────────────────────────────────

function resetForm() {
  document.getElementById('mainForm').reset();
  document.getElementById('operatorList').innerHTML = `
    <div class="operator-row">
      <input type="text" placeholder="Opérateur 1" class="op-input">
      <button type="button" class="btn-remove" onclick="removeOp(this)">×</button>
    </div>`;
  opCount = 1;
  ['h', 'r', 'c'].forEach(p => document.getElementById(`${p}_body`).classList.add('hidden'));
  document.getElementById('date_intervention').value = todayISO();
  refreshBLPreview();
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function closeModal() {
  document.getElementById('successModal').classList.add('hidden');
  resetForm();
}

// ── Submit ────────────────────────────────────────────────────────────────────

document.getElementById('mainForm').addEventListener('submit', async e => {
  e.preventDefault();

  const hActive = document.getElementById('h_active').checked;
  const rActive = document.getElementById('r_active').checked;
  const cActive = document.getElementById('c_active').checked;

  const payload = {
    date_intervention:   document.getElementById('date_intervention').value,
    ancienne_production: document.getElementById('ancienne_production').value,
    nouvelle_production: document.getElementById('nouvelle_production').value,
    heure_prevue:        document.getElementById('heure_prevue').value,
    heure_reelle:        document.getElementById('heure_reelle').value,
    heure_debut:         document.getElementById('heure_debut').value,
    nombre_operateurs:   document.getElementById('nombre_operateurs').value,
    noms_operateurs:     getOperatorNames(),
    observations:        document.getElementById('observations').value,

    nettoyage_hacheuse: hActive ? {
      active:            true,
      heure_debut:       document.getElementById('h_debut').value,
      heure_fin:         document.getElementById('h_fin').value,
      nombre_operateurs: document.getElementById('h_ops').value,
    } : null,

    nettoyage_rouleaux: rActive ? {
      active:            true,
      heure_debut:       document.getElementById('r_debut').value,
      heure_fin:         document.getElementById('r_fin').value,
      nombre_operateurs: document.getElementById('r_ops').value,
    } : null,

    nettoyage_complementaire: cActive ? {
      active:            true,
      type_nettoyage:    document.getElementById('c_type').value,
      heure_debut:       document.getElementById('c_debut').value,
      heure_fin:         document.getElementById('c_fin').value,
      nombre_operateurs: document.getElementById('c_ops').value,
    } : null,
  };

  const btn = document.getElementById('submitBtn');
  btn.disabled = true;
  btn.textContent = 'Enregistrement…';

  try {
    const res  = await fetch('/api/interventions', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(payload),
    });
    if (!res.ok) throw new Error((await res.json()).error || 'Erreur serveur');
    const data = await res.json();

    // Build BL chips in modal
    const chips = [];
    chips.push(blChip(data.bl_main, 'Fiche principale', 'tag-blue'));
    if (data.bl_hacheuse)      chips.push(blChip(data.bl_hacheuse,      'Hacheuse',      'tag-green'));
    if (data.bl_rouleaux)      chips.push(blChip(data.bl_rouleaux,      'Rouleaux',      'tag-green'));
    if (data.bl_complementaire) chips.push(blChip(data.bl_complementaire, 'Complémentaire', 'tag-blue'));

    document.getElementById('modalBLs').innerHTML = chips.join('');
    document.getElementById('successModal').classList.remove('hidden');
  } catch (err) {
    alert('Erreur lors de l\'enregistrement :\n' + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Enregistrer la fiche';
  }
});

function blChip(bl, label, cls) {
  return `<span class="tag ${cls}" style="font-size:.85rem;padding:.3rem .75rem;">
    <span style="opacity:.7;font-size:.7rem;">${label} </span>${bl}
  </span>`;
}

// ── Init ──────────────────────────────────────────────────────────────────────

function todayISO() {
  return new Date().toISOString().split('T')[0];
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('date_intervention').value = todayISO();
  refreshBLPreview();
});
