/* Segunda voz (estilo norteño): la voz que acompaña a la melodía a una 3ª o 6ª DIATÓNICA.
   Se captura la melodía por GRADOS del tono, así el intervalo sale siempre dentro de la
   tonalidad (a veces mayor, a veces menor) — eso es lo que la hace sonar bien.
   Los nombres se deletrean según el tono: en Mib mayor se dice Sib, no La#. */
const Segunda = (() => {
  const LETRAS = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const ES = { C: 'Do', D: 'Re', E: 'Mi', F: 'Fa', G: 'Sol', A: 'La', B: 'Si' };
  const ESCALAS = { mayor: [0, 2, 4, 5, 7, 9, 11], menor: [0, 2, 3, 5, 7, 8, 10] };
  /* tónicas con las dos escrituras: son la misma tecla, distinto nombre */
  const TONICAS = [
    ['C', 'Do'], ['Db', 'Reb (= Do#)'], ['D', 'Re'], ['Eb', 'Mib (= Re#)'], ['E', 'Mi'],
    ['F', 'Fa'], ['F#', 'Fa# (= Solb)'], ['G', 'Sol'], ['Ab', 'Lab (= Sol#)'],
    ['A', 'La'], ['Bb', 'Sib (= La#)'], ['B', 'Si'],
  ];
  const ARMONIAS = [
    { id: '3a', label: '3ª arriba', grados: 2, oct: 0 },
    { id: '6b', label: '6ª abajo', grados: 2, oct: -12 },
    { id: '6a', label: '6ª arriba', grados: -2, oct: 12 },
    { id: '3b', label: '3ª abajo', grados: -2, oct: 0 },
  ];

  const alteracion = t => (t.length > 1 ? (t[1] === 'b' ? -1 : 1) : 0);
  const pcDe = t => (PC[t[0]] + alteracion(t) + 12) % 12;
  const enEspanol = n => ES[n[0]] + n.slice(1);

  /* Deletrea la escala con una letra por grado: así en Mib salen Mib-Fa-Sol-Lab-Sib-Do-Re. */
  function nombresEscala(tonica, modo) {
    const li = LETRAS.indexOf(tonica[0]), pc0 = pcDe(tonica);
    return ESCALAS[modo].map((semis, i) => {
      const letra = LETRAS[(li + i) % 7];
      let d = ((pc0 + semis) % 12 - PC[letra] + 12) % 12;
      if (d > 6) d -= 12;
      return letra + (d === 2 ? '##' : d === 1 ? '#' : d === -1 ? 'b' : d === -2 ? 'bb' : '');
    });
  }
  /* tónica en registro cómodo de voz (MIDI 50-61) */
  const tonicaMidi = tonica => 50 + ((pcDe(tonica) - 2 + 12) % 12);

  /* grado (puede ser 0 o negativo) -> midi */
  function midiDeGrado(g, tonica, modo) {
    const idx = g - 1, oct = Math.floor(idx / 7), paso = ((idx % 7) + 7) % 7;
    return tonicaMidi(tonica) + ESCALAS[modo][paso] + 12 * oct;
  }
  function nombreDeGrado(g, tonica, modo) {
    const paso = (((g - 1) % 7) + 7) % 7;
    return enEspanol(nombresEscala(tonica, modo)[paso]);
  }
  const armDe = id => ARMONIAS.find(a => a.id === id) || ARMONIAS[0];

  return {
    TONICAS, ARMONIAS, ESCALAS, midiDeGrado, nombreDeGrado, nombresEscala, enEspanol, pcDe,
    gradoArmonia: (g, arm) => g + armDe(arm).grados,
    midiArmonia(g, tonica, modo, arm) {
      const a = armDe(arm);
      return midiDeGrado(g + a.grados, tonica, modo) + a.oct;
    },
    intervaloDe(g, tonica, modo, arm) {
      const semis = Math.abs(this.midiArmonia(g, tonica, modo, arm) - midiDeGrado(g, tonica, modo));
      return { 3: '3ª menor', 4: '3ª mayor', 8: '6ª menor', 9: '6ª mayor' }[semis] || `${semis} semitonos`;
    },
    /* nombre de una nota suelta (la del micrófono), escrita con el criterio del tono */
    nombreLibre(midi, tonica) {
      const usaBemoles = tonica.includes('b') || tonica === 'F';
      const SOST = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
      const BEM = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
      return enEspanol((usaBemoles ? BEM : SOST)[midi % 12]);
    },
    frases: () => store.get('segunda_frases', []),
    guardar(f) { const l = this.frases(); l.push(f); store.set('segunda_frases', l); },
    borrar(i) { const l = this.frases(); l.splice(i, 1); store.set('segunda_frases', l); },
  };
})();
window.Segunda = Segunda;

App.route(/^#\/segunda$/, view => {
  let tonica = store.get('seg_tonica', 'G');
  let modo = store.get('seg_modo', 'mayor');
  let arm = store.get('seg_arm', '3a');
  let mel = [];
  const G = g => Segunda.midiDeGrado(g, tonica, modo);
  const S = g => Segunda.midiArmonia(g, tonica, modo, arm);
  const NG = g => Segunda.nombreDeGrado(g, tonica, modo);
  const NS = g => Segunda.nombreDeGrado(Segunda.gradoArmonia(g, arm), tonica, modo);

  const pinta = () => {
    const pares = mel.map(g => [G(g), S(g)]);
    view.innerHTML = `
      <a class="dim small" href="#/oido">← Oído</a>
      <h1>🎤 Segunda voz</h1>
      <div class="notice">La segunda norteña va a una <b>3ª o 6ª diatónica</b> de la melodía:
      te quedas en las notas del tono, así que el intervalo sale a veces mayor y a veces menor —
      ese ajuste es lo que la hace sonar bien. La <b>3ª arriba</b> es la clásica; la
      <b>6ª abajo</b> es esa misma nota una octava abajo (para voces graves), y la
      <b>6ª arriba</b> / <b>3ª abajo</b> son el otro par. Ponte audífonos para practicar.</div>

      <h2>1. El tono de la canción</h2>
      <div style="display:flex;gap:8px;margin-bottom:6px">
        <select id="sg-ton" style="flex:2">${Segunda.TONICAS.map(([v, l]) =>
          `<option value="${v}" ${v === tonica ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
        <select id="sg-modo" style="flex:1">
          <option value="mayor" ${modo === 'mayor' ? 'selected' : ''}>mayor</option>
          <option value="menor" ${modo === 'menor' ? 'selected' : ''}>menor</option>
        </select>
      </div>
      <div class="dim small" style="margin-bottom:12px">Notas del tono:
        ${Segunda.nombresEscala(tonica, modo).map(n => esc(Segunda.enEspanol(n))).join(' · ')}</div>

      <h2>2. Toca la melodía</h2>
      <div class="dim small">Cada botón es un grado del tono. Ve picando la melodía como la cantas.</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0">
        ${[1,2,3,4,5,6,7,8,9,10].map(g => `<button class="btn mini ghost" data-g="${g}"
            style="padding:12px 0;line-height:1.2">${g}<br><span class="dim small">${esc(NG(g))}</span></button>`).join('')}
      </div>
      <div class="card" style="min-height:54px">
        ${mel.length ? mel.map(g => `<span class="badge" style="margin:2px 3px;display:inline-block">
            ${esc(NG(g))} <span class="dim">+ ${esc(NS(g))}</span></span>`).join('')
          : '<span class="dim small">Aún no capturas nada. Pica los grados de arriba.</span>'}
      </div>
      <div style="display:flex;gap:8px;margin:8px 0 16px">
        <button class="btn mini ghost" id="sg-undo" style="flex:1">← Borrar última</button>
        <button class="btn mini ghost" id="sg-clear" style="flex:1">Limpiar</button>
      </div>

      <h2>3. Escucha la armonía</h2>
      <div class="seg" style="margin-bottom:10px">
        ${Segunda.ARMONIAS.map(a => `<button data-arm="${a.id}"
          class="${a.id === arm ? 'active' : ''}" style="font-size:13px">${esc(a.label)}</button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn mini" data-play="mel" style="flex:1">▶ Melodía</button>
        <button class="btn mini" data-play="seg" style="flex:1">▶ Segunda</button>
        <button class="btn" data-play="dos" style="flex:1.4">▶ Las dos</button>
      </div>
      <button class="btn full ghost" id="sg-practica" style="margin-top:10px">🎤 Practicar: suena la melodía, canta la segunda</button>
      <div id="sg-zona"></div>

      ${mel.length ? `<h2>Detalle</h2>
        <div class="song-body small">${mel.map((g, i) =>
          `${String(i + 1).padStart(2)}.  melodía ${esc(NG(g))}   →   segunda ${esc(NS(g))}` +
          `   (${esc(Segunda.intervaloDe(g, tonica, modo, arm))})`).join('\n')}</div>
        <button class="btn full ghost" id="sg-save" style="margin-top:10px">Guardar esta frase</button>` : ''}

      ${Segunda.frases().length ? `<h2>Frases guardadas</h2>
        ${Segunda.frases().map((f, i) => `<div class="card setlist-song">
          <span class="title">${esc(f.nombre)} <span class="dim small">· ${esc(f.tonica)} ${esc(f.modo)}</span></span>
          <button class="btn mini" data-load="${i}">abrir</button>
          <button class="btn mini ghost" data-del="${i}">✕</button>
        </div>`).join('')}` : ''}`;

    $('#sg-ton').onchange = e => { tonica = e.target.value; store.set('seg_tonica', tonica); pinta(); };
    $('#sg-modo').onchange = e => { modo = e.target.value; store.set('seg_modo', modo); pinta(); };
    view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const g = +b.dataset.g;
      mel.push(g);
      SBAudio.listo().then(() => { SBAudio.voz(G(g), 0.5); SBAudio.voz(S(g), 0.5, 0, 0.35); });
      pinta();
    });
    $('#sg-undo').onclick = () => { mel.pop(); pinta(); };
    $('#sg-clear').onclick = () => { mel = []; pinta(); };
    view.querySelectorAll('[data-arm]').forEach(b => b.onclick = () => {
      arm = b.dataset.arm; store.set('seg_arm', arm); pinta();
    });
    view.querySelectorAll('[data-play]').forEach(b => b.onclick = async () => {
      if (!mel.length) return;
      await SBAudio.listo();
      SBAudio.dueto(pares, { soloAbajo: b.dataset.play === 'mel', soloArriba: b.dataset.play === 'seg' });
    });
    const sv = $('#sg-save');
    if (sv) sv.onclick = () => {
      const nom = prompt('Nombre de la frase (ej. "Mi casa nueva — coro"):');
      if (!nom) return;
      Segunda.guardar({ nombre: nom.trim(), tonica, modo, arm, mel });
      pinta();
    };
    view.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      const f = Segunda.frases()[+b.dataset.load];
      tonica = f.tonica; modo = f.modo; arm = f.arm || '3a'; mel = [...f.mel]; pinta();
    });
    view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Segunda.borrar(+b.dataset.del); pinta(); });
    $('#sg-practica').onclick = () => practicar(pares);
  };

  /* Suena la melodía nota por nota; tú cantas la segunda y el micrófono te dice si le atinas. */
  async function practicar(pares) {
    const zona = $('#sg-zona');
    if (!pares.length) return;
    if (!window.Pitch || !Pitch.soportado()) {
      zona.innerHTML = '<div class="notice">🎤 Este navegador no deja usar el micrófono.</div>';
      return;
    }
    zona.innerHTML = '<div class="chk-card"><div id="sg-est">Pidiendo micrófono…</div></div>';
    try { await SBAudio.listo(); await Pitch.iniciar(); }
    catch (e) { zona.innerHTML = `<div class="notice">🎤 ${esc(e.message)}</div>`; return; }
    const est = $('#sg-est');
    const DUR = 1.6, resultados = [];
    let vivo = true;
    window._cleanup = () => { vivo = false; Pitch.detener(); };
    for (let i = 0; i < pares.length && vivo; i++) {
      const [abajo, arriba] = pares[i];
      SBAudio.voz(abajo, DUR * 0.8, 0, 0.5);
      est.innerHTML = `<b>${i + 1}/${pares.length}</b> — melodía ${esc(Segunda.nombreLibre(abajo, tonica))} ·
        canta <b style="color:var(--accent)">${esc(Segunda.nombreLibre(arriba, tonica))}</b>
        <div class="dim small" id="sg-oigo">escuchando…</div>`;
      let acerto = false;
      const t0 = performance.now();
      while (performance.now() - t0 < DUR * 1000 && vivo) {
        await new Promise(r => setTimeout(r, 90));
        const p = Pitch.actual();
        if (p && performance.now() - t0 > 500) {
          const ok = p.midi % 12 === arriba % 12;
          if (ok) acerto = true;
          const o = $('#sg-oigo');
          if (o) {
            o.textContent = `oigo: ${Segunda.nombreLibre(p.midi, tonica)} ${ok ? '✓' : ''}`;
            o.style.color = ok ? 'var(--ok)' : 'var(--txt-dim)';
          }
        }
      }
      resultados.push(acerto);
    }
    Pitch.detener();
    if (!vivo) return;
    const ok = resultados.filter(Boolean).length;
    zona.innerHTML = `<div class="chk-card">
      <div class="q-score">${ok === pares.length ? '🎯' : '🎤'} ${ok}/${pares.length}</div>
      <div style="font-family:ui-monospace,Menlo,monospace;text-align:center">${resultados.map(r => r ? '✓' : '✗').join(' ')}</div>
      <p class="dim small" style="margin-top:8px">Si te vas a la melodía en vez de la segunda (pasa
      siempre al principio), canta primero la segunda sola varias veces hasta que se te pegue.</p>
      <button class="btn mini ghost" id="sg-otra">Otra vez</button></div>`;
    $('#sg-otra').onclick = () => practicar(pares);
  }

  pinta();
});
