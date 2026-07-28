/* Modo Entrenamiento — 14 lecciones con refuerzo pedagógico:
   teoría progresiva (En corto + checkpoint por sección), quiz mixto (texto + oído)
   y repaso espaciado (cajas de Leitner: 1, 3, 7, 14 días). */
let _indice = null;
async function cargarIndice() {
  if (!_indice) _indice = await (await fetch('lessons/index.json')).json();
  return _indice;
}
const _docs = {};
async function cargarLeccion(folder) {
  if (!_docs[folder]) _docs[folder] = await (await fetch(`lessons/${folder}/lesson.json`)).json();
  return _docs[folder];
}
const mejorScore = num => store.get(`quiz_best_${num}`, null);
const superada = num => (mejorScore(num) ?? 0) >= 80;
function desbloqueada(num, lecciones) {
  const idx = lecciones.findIndex(l => l.number === num);
  return idx === 0 || superada(lecciones[idx - 1].number);
}

/* ==================== repaso espaciado (Leitner) ==================== */
const SRS_DIAS = { 1: 1, 2: 3, 3: 7, 4: 14 };
function ymdMas(dias) {
  const d = new Date(); d.setDate(d.getDate() + dias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function preguntasDeLeccion(folder, doc) {
  const qs = [];
  doc.theory.sections.forEach((s, i) => {
    if (s.checkpoint) qs.push({ qid: `${folder}|chk|${i}`, ...s.checkpoint });
  });
  (doc.quiz || []).forEach((q, i) => qs.push({ qid: `${folder}|quiz|${i}`, ...q }));
  (doc.exercises || []).forEach((ex, i) => {
    if (ex.check) qs.push({ qid: `${folder}|exc|${i}`, ...ex.check });
  });
  (doc.ear_quiz || []).forEach((q, i) => qs.push({ qid: `${folder}|ear|${i}`, ...q, folder }));
  return qs;
}
function sembrarSRS(folder, doc) {
  const srs = store.get('srs', {});
  let nuevos = 0;
  for (const q of preguntasDeLeccion(folder, doc)) {
    if (!srs[q.qid]) { srs[q.qid] = { box: 1, due: ymdMas(1) }; nuevos++; }
  }
  if (nuevos) store.set('srs', srs);
}
const repasoPendientes = () =>
  Object.values(store.get('srs', {})).filter(e => e.due <= hoyYMD()).length;

App.route(/^#\/repaso$/, async view => {
  const srs = store.get('srs', {});
  const dueIds = Object.keys(srs).filter(id => srs[id].due <= hoyYMD())
    .sort((a, b) => srs[a].due.localeCompare(srs[b].due)).slice(0, 12);
  if (!dueIds.length) {
    view.innerHTML = `<h1>Repaso</h1><p class="dim">Nada pendiente por hoy. 🔥 Vuelve mañana —
      las preguntas de tus lecciones superadas regresan a los 1, 3, 7 y 14 días.</p>
      <a class="btn full" href="#/entrenar">Volver</a>`;
    return;
  }
  const lecciones = await cargarIndice();
  const items = [];
  for (const qid of dueIds) {
    const [folder, kind, idx] = qid.split('|');
    const info = lecciones.find(l => l.folder === folder);
    if (!info) continue;
    const doc = await cargarLeccion(folder);
    const pool = preguntasDeLeccion(folder, doc);
    const q = pool.find(p => p.qid === qid);
    if (q) items.push({ ...q, lessonTitle: `${info.number}. ${info.title}`, folder });
  }
  let i = 0, aciertos = 0;
  const pinta = () => {
    if (i >= items.length) {
      marcarPracticaHoy();
      view.innerHTML = `<h1>Repaso</h1>
        <div class="q-score">🔁 ${aciertos}/${items.length}</div>
        <p class="dim" style="text-align:center">Lo que fallaste regresa mañana; lo que acertaste se aleja (1→3→7→14 días).</p>
        <a class="btn full" href="#/entrenar">Listo</a>`;
      return;
    }
    const q = items[i];
    pintarPregunta(view, q, `Repaso ${i + 1}/${items.length} · ${esc(q.lessonTitle)}`, ok => {
      const srsNow = store.get('srs', {});
      const e = srsNow[q.qid] || { box: 1 };
      if (ok) { aciertos++; e.box = Math.min(4, (e.box || 1) + 1); }
      else e.box = 1;
      e.due = ymdMas(SRS_DIAS[e.box]);
      srsNow[q.qid] = e;
      store.set('srs', srsNow);
      i++; pinta();
    });
  };
  pinta();
});

/* Pregunta genérica (texto o auditiva) — usada por quiz, checkpoints y repaso. */
function pintarPregunta(cont, q, encabezado, alTerminar) {
  cont.innerHTML = `
    <div class="dim small">${encabezado}</div>
    <h2>${esc(q.question)}</h2>
    ${q.audio_ref ? `<audio controls preload="auto" src="lessons/${q.folder}/${q.audio_ref}" style="width:100%;margin:6px 0 12px"></audio>` : ''}
    ${q.options.map((o, j) => `<button class="q-opt" data-j="${j}">${esc(o)}</button>`).join('')}
    <div id="q-zone"></div>`;
  cont.querySelectorAll('.q-opt').forEach(btn => btn.onclick = () => {
    const j = +btn.dataset.j;
    const ok = j === q.answer;
    cont.querySelectorAll('.q-opt').forEach((b, k) => {
      b.disabled = true;
      if (k === q.answer) b.classList.add('correct');
      else if (k === j) b.classList.add('wrong');
    });
    cont.querySelector('#q-zone').innerHTML = `
      <div class="q-explain">${esc(q.explain || '')}</div>
      <button class="btn full" id="q-next">Continuar</button>`;
    cont.querySelector('#q-next').onclick = () => alTerminar(ok);
  });
}

/* ==================== lista de lecciones ==================== */
App.route(/^#\/entrenar$/, async view => {
  const lecciones = await cargarIndice();
  const hechas = lecciones.filter(l => superada(l.number)).length;
  const nRepaso = repasoPendientes();
  view.innerHTML = `
    <h1>Entrenamiento</h1>
    ${nRepaso > 0 ? `<a class="card" href="#/repaso" style="border-color:var(--accent)">
      <div class="row"><h3>🔁 Repaso de hoy</h3><span class="badge">${nRepaso} pendientes</span></div>
      <div class="dim small">Preguntas de tus lecciones superadas — 3 minutos y a otra cosa.</div>
    </a>` : ''}
    <div class="dim small">Progreso: ${hechas}/${lecciones.length} lecciones superadas (quiz ≥ 80%)</div>
    <div class="progressbar"><div style="width:${(hechas / lecciones.length) * 100}%"></div></div>
    ${lecciones.map(l => {
      const abierta = desbloqueada(l.number, lecciones);
      const score = mejorScore(l.number);
      const badge = !abierta ? '<span class="badge lock">🔒</span>'
        : superada(l.number) ? `<span class="badge ok">✓ ${score}%</span>`
        : score !== null ? `<span class="badge">${score}%</span>`
        : `<span class="badge">${l.minutes} min</span>`;
      return `<a class="card ${abierta ? '' : 'locked'}" href="${abierta ? `#/leccion/${l.number}` : '#/entrenar'}">
        <div class="row"><h3>${l.number}. ${esc(l.title)}</h3>${badge}</div>
        <div class="dim small">${esc(l.difficulty)}</div>
      </a>`;
    }).join('')}`;
});

/* ==================== lección ==================== */
App.route(/^#\/leccion\/(\d+)$/, async (view, numStr) => {
  const num = +numStr;
  const lecciones = await cargarIndice();
  const info = lecciones.find(l => l.number === num);
  if (!info) { location.hash = '#/entrenar'; return; }
  const base = `lessons/${info.folder}`;
  const doc = await cargarLeccion(info.folder);
  view.innerHTML = `
    <a class="dim small" href="#/entrenar">← Lecciones</a>
    <h1>${num}. ${esc(doc.meta.title)}</h1>
    <div class="seg">
      <button data-t="teoria" class="active">Teoría</button>
      <button data-t="quiz">Quiz</button>
      <button data-t="ejercicio">Ejercicios</button>
    </div>
    <div id="lec-panel"></div>`;
  const panel = $('#lec-panel');
  const pintar = t => {
    $$('.seg button').forEach(b => b.classList.toggle('active', b.dataset.t === t));
    if (t === 'teoria') pintarTeoria(panel, doc, base, info);
    if (t === 'quiz') pintarQuiz(panel, doc, num, info);
    if (t === 'ejercicio') pintarEjercicio(panel, doc, base);
  };
  $$('.seg button').forEach(b => b.onclick = () => pintar(b.dataset.t));
  pintar('teoria');
});

/* ---------- teoría progresiva: leer → contestar → seguir ---------- */
function pintarTeoria(panel, doc, base, info) {
  const secs = doc.theory.sections;
  const key = `teoria_${info.folder}`;
  let avance = store.get(key, 0); // secciones con checkpoint superado

  const render = () => {
    const visibles = Math.min(avance + 1, secs.length);
    panel.innerHTML = `<div class="teoria">
      ${secs.slice(0, visibles).map((s, i) => `
        <h2>${i < avance ? '✓ ' : ''}${esc(s.title)}</h2>
        ${s.tldr ? `<div class="tldr">💡 <b>En corto:</b> ${esc(s.tldr)}</div>` : ''}
        ${s.content.split('\n\n').map(p => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('')}
        ${s.image ? `<img src="${base}/${s.image}" alt="" loading="lazy">` : ''}
        ${(i === avance && s.checkpoint) ? `<div class="chk-card" id="chk-card"></div>` : ''}
      `).join('')}
      ${avance >= secs.length ? `
        <div class="q-score">✅ Teoría completa</div>
        <p class="dim" style="text-align:center">Ahora demuestra que se quedó: pasa al Quiz.</p>` : ''}
    </div>`;
    const card = $('#chk-card');
    if (card) {
      const s = secs[avance];
      pintarPregunta(card, { ...s.checkpoint, folder: info.folder },
        '✋ Checkpoint — contesta para seguir', ok => {
          if (ok) { avance++; store.set(key, avance); }
          render();
          if (ok) setTimeout(() => panel.querySelectorAll('h2')[Math.min(avance, secs.length - 1)]
            ?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60);
        });
    } else if (avance < secs.length) {
      // sección sin checkpoint: se libera sola
      avance++; store.set(key, avance); render();
    }
  };
  render();
}

/* ---------- quiz mixto: texto + oído ---------- */
function pintarQuiz(panel, doc, num, info) {
  const preguntas = [
    ...(doc.quiz || []),
    ...((doc.ear_quiz || []).map(q => ({ ...q, folder: info.folder }))),
  ];
  let i = 0, aciertos = 0;
  const pinta = () => {
    if (i >= preguntas.length) {
      const pct = Math.round((aciertos / preguntas.length) * 100);
      const best = Math.max(store.get(`quiz_best_${num}`, 0), pct);
      store.set(`quiz_best_${num}`, best);
      marcarPracticaHoy();
      if (pct >= 80) sembrarSRS(info.folder, doc);
      panel.innerHTML = `
        <div class="q-score">${pct >= 80 ? '✅' : '📚'} ${aciertos}/${preguntas.length} — ${pct}%</div>
        <p class="dim" style="text-align:center">${pct >= 80
          ? 'Superada. Sus preguntas entran al repaso espaciado: te las volveré a preguntar mañana, y luego a los 3, 7 y 14 días.'
          : 'Necesitas 80%. Repasa la teoría (los checkpoints te dicen dónde flaqueas) y reintenta.'}</p>
        <button class="btn full" onclick="location.hash='#/entrenar'">Volver a lecciones</button>`;
      return;
    }
    const q = preguntas[i];
    pintarPregunta(panel, q,
      `Pregunta ${i + 1} de ${preguntas.length}${q.audio_ref ? ' · 🎧 escucha primero' : ''}`,
      ok => { if (ok) aciertos++; i++; pinta(); });
  };
  pinta();
}

/* ---------- ejercicios ---------- */
function pintarEjercicio(panel, doc, base) {
  const lista = doc.exercises || (doc.exercise ? [doc.exercise] : []);
  const bk = doc.backing;
  panel.innerHTML = `<div class="ejercicio">
    ${bk ? `
      <h2>🥁 Backing track — ${esc(bk.label)}</h2>
      <p>${esc(bk.description)} <span class="dim">Batería y acordes sin bajo: el bajo eres tú. Déjala en loop.</span></p>
      <div class="dim small">♩ = ${bk.bpm} BPM · estilo ${esc(bk.style)}</div>
      <audio controls loop preload="none" src="${base}/${bk.audio_ref}"></audio>
    ` : ''}
    ${lista.map((ex, i) => `
      <h2>${i + 1}. ${esc(ex.title || 'Ejercicio')}</h2>
      <p>${esc(ex.description)}</p>
      <div class="dim small">♩ = ${ex.bpm} BPM · ${esc(ex.time_signature)} · el audio trae 1 compás de claqueta</div>
      <img src="${base}/${ex.tab_image}" alt="Tab del ejercicio ${i + 1}">
      <audio controls loop preload="none" src="${base}/${ex.audio_ref}"></audio>
      ${ex.check ? `<div class="chk-card" data-exc="${i}"></div>` : ''}
    `).join('')}
    <button class="btn full" id="ex-done">Lo practiqué hoy 🎸</button>
  </div>`;
  panel.querySelectorAll('.chk-card[data-exc]').forEach(card => {
    const ex = lista[+card.dataset.exc];
    pintarPregunta(card, ex.check, '✋ Checkpoint — ¿qué acabas de tocar?', () => {
      card.innerHTML = '<div class="dim small">✓ Checkpoint del ejercicio listo</div>';
    });
  });
  $('#ex-done').onclick = () => { marcarPracticaHoy(); $('#ex-done').textContent = '🔥 Práctica registrada'; };
}
