/* Segunda voz (estilo norteño): la voz de arriba a una 3ª DIATÓNICA de la melodía.
   Se captura la melodía por GRADOS de la tonalidad — así la tercera sale siempre
   dentro del tono (a veces mayor, a veces menor), que es lo que la hace sonar bien. */
const Segunda = (() => {
  const NOTAS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const ES = { C: 'Do', 'C#': 'Do#', D: 'Re', 'D#': 'Re#', E: 'Mi', F: 'Fa', 'F#': 'Fa#',
               G: 'Sol', 'G#': 'Sol#', A: 'La', 'A#': 'La#', B: 'Si' };
  const ESCALAS = { mayor: [0, 2, 4, 5, 7, 9, 11], menor: [0, 2, 3, 5, 7, 8, 10] };

  /* tónica en registro cómodo de voz (MIDI 50-61 = Re3 a Do#4) */
  const tonicaMidi = pc => 50 + ((pc - 2 + 12) % 12);
  /* grado 1..10 -> midi (8,9,10 son la octava de 1,2,3) */
  const midiDeGrado = (g, pc, modo) => {
    const esc = ESCALAS[modo];
    return tonicaMidi(pc) + esc[(g - 1) % 7] + 12 * Math.floor((g - 1) / 7);
  };
  const nombre = m => NOTAS[m % 12];
  const nombreEs = m => ES[nombre(m)];

  return {
    ESCALAS, NOTAS, ES, midiDeGrado, nombre, nombreEs,
    /* La segunda son SIEMPRE dos grados arriba (3ª diatónica). La "6ª abajo" es
       esa misma nota bajada una octava — no es "dos grados abajo". */
    midiSegunda: (g, pc, modo, sexta) => midiDeGrado(g + 2, pc, modo) - (sexta ? 12 : 0),
    intervaloDe(g, pc, modo, sexta) {
      const semis = Math.abs(this.midiSegunda(g, pc, modo, sexta) - midiDeGrado(g, pc, modo));
      return semis === 4 ? '3ª mayor' : semis === 3 ? '3ª menor'
        : semis === 9 ? '6ª mayor' : semis === 8 ? '6ª menor' : `${semis} semitonos`;
    },
    frases: () => store.get('segunda_frases', []),
    guardar(f) { const l = this.frases(); l.push(f); store.set('segunda_frases', l); },
    borrar(i) { const l = this.frases(); l.splice(i, 1); store.set('segunda_frases', l); },
  };
})();
window.Segunda = Segunda;

App.route(/^#\/segunda$/, view => {
  let pc = store.get('seg_pc', 7);            // tónica (Sol por default)
  let modo = store.get('seg_modo', 'mayor');
  let sexta = false;
  let mel = [];                                // grados capturados
  const G = n => Segunda.midiDeGrado(n, pc, modo);
  const S = g => Segunda.midiSegunda(g, pc, modo, sexta);

  const pinta = () => {
    const pares = mel.map(g => [G(g), S(g)]);
    view.innerHTML = `
      <a class="dim small" href="#/oido">← Oído</a>
      <h1>🎤 Segunda voz</h1>
      <div class="notice">La segunda norteña va <b>una 3ª diatónica ARRIBA</b> de la melodía:
      te quedas en las notas del tono, así que a veces son 4 semitonos y a veces 3 — ese ajuste
      es justo lo que la hace sonar bien. Cuando se va muy alto, se usa la <b>6ª abajo</b>
      (la misma nota, otra octava). Ponte audífonos para practicar.</div>

      <h2>1. El tono de la canción</h2>
      <div style="display:flex;gap:8px;margin-bottom:12px">
        <select id="sg-pc" style="flex:2">${Segunda.NOTAS.map((n, i) =>
          `<option value="${i}" ${i === pc ? 'selected' : ''}>${esc(Segunda.ES[n])} (${esc(n)})</option>`).join('')}</select>
        <select id="sg-modo" style="flex:1">
          <option value="mayor" ${modo === 'mayor' ? 'selected' : ''}>mayor</option>
          <option value="menor" ${modo === 'menor' ? 'selected' : ''}>menor</option>
        </select>
      </div>

      <h2>2. Toca la melodía</h2>
      <div class="dim small">Cada botón es un grado del tono. Ve picando la melodía como la cantas.</div>
      <div id="sg-teclas" style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0">
        ${[1,2,3,4,5,6,7,8,9,10].map(g => `<button class="btn mini ghost" data-g="${g}"
            style="padding:12px 0;line-height:1.2">${g}<br><span class="dim small">${esc(Segunda.nombreEs(G(g)))}</span></button>`).join('')}
      </div>
      <div class="card" style="min-height:54px">
        ${mel.length ? mel.map((g, i) => `<span class="badge" style="margin:2px 3px;display:inline-block">
            ${esc(Segunda.nombreEs(G(g)))} <span class="dim">+ ${esc(Segunda.nombreEs(S(g)))}</span></span>`).join('')
          : '<span class="dim small">Aún no capturas nada. Pica los grados de arriba.</span>'}
      </div>
      <div style="display:flex;gap:8px;margin:8px 0 16px">
        <button class="btn mini ghost" id="sg-undo" style="flex:1">← Borrar última</button>
        <button class="btn mini ghost" id="sg-clear" style="flex:1">Limpiar</button>
      </div>

      <h2>3. Escucha la armonía</h2>
      <div class="seg" style="margin-bottom:10px">
        <button data-arm="3" class="${sexta ? '' : 'active'}">3ª arriba</button>
        <button data-arm="6" class="${sexta ? 'active' : ''}">6ª abajo</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn mini" data-play="mel" style="flex:1">▶ Melodía</button>
        <button class="btn mini" data-play="seg" style="flex:1">▶ Segunda</button>
        <button class="btn" data-play="dos" style="flex:1.4">▶ Las dos</button>
      </div>
      <button class="btn full ghost" id="sg-practica" style="margin-top:10px">🎤 Practicar: suena la melodía, canta la segunda</button>
      <div id="sg-zona"></div>

      ${mel.length ? `<h2>Detalle</h2>
        <div class="song-body small">${mel.map((g, i) => {
          const a = G(g), b = S(g);
          return `${String(i + 1).padStart(2)}.  melodía ${esc(Segunda.nombreEs(a))}` +
                 `   →   segunda ${esc(Segunda.nombreEs(b))}   (${esc(Segunda.intervaloDe(g, pc, modo, sexta))})`;
        }).join('\n')}</div>
        <button class="btn full ghost" id="sg-save" style="margin-top:10px">Guardar esta frase</button>` : ''}

      ${Segunda.frases().length ? `<h2>Frases guardadas</h2>
        ${Segunda.frases().map((f, i) => `<div class="card setlist-song">
          <span class="title">${esc(f.nombre)} <span class="dim small">· ${esc(Segunda.ES[Segunda.NOTAS[f.pc]])} ${esc(f.modo)}</span></span>
          <button class="btn mini" data-load="${i}">abrir</button>
          <button class="btn mini ghost" data-del="${i}">✕</button>
        </div>`).join('')}` : ''}`;

    $('#sg-pc').onchange = e => { pc = +e.target.value; store.set('seg_pc', pc); pinta(); };
    $('#sg-modo').onchange = e => { modo = e.target.value; store.set('seg_modo', modo); pinta(); };
    view.querySelectorAll('[data-g]').forEach(b => b.onclick = () => {
      const g = +b.dataset.g;
      mel.push(g);
      SBAudio.listo().then(() => {
        SBAudio.voz(G(g), 0.5);
        SBAudio.voz(S(g), 0.5, 0, 0.35);
      });
      pinta();
    });
    $('#sg-undo').onclick = () => { mel.pop(); pinta(); };
    $('#sg-clear').onclick = () => { mel = []; pinta(); };
    view.querySelectorAll('[data-arm]').forEach(b => b.onclick = () => {
      sexta = b.dataset.arm === '6'; pinta();
    });
    view.querySelectorAll('[data-play]').forEach(b => b.onclick = async () => {
      if (!mel.length) return;
      await SBAudio.listo();
      SBAudio.dueto(pares, {
        soloAbajo: b.dataset.play === 'mel',
        soloArriba: b.dataset.play === 'seg',
      });
    });
    const sv = $('#sg-save');
    if (sv) sv.onclick = () => {
      const nom = prompt('Nombre de la frase (ej. "Mi casa nueva — coro"):');
      if (!nom) return;
      Segunda.guardar({ nombre: nom.trim(), pc, modo, mel });
      pinta();
    };
    view.querySelectorAll('[data-load]').forEach(b => b.onclick = () => {
      const f = Segunda.frases()[+b.dataset.load];
      pc = f.pc; modo = f.modo; mel = [...f.mel]; pinta();
    });
    view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
      Segunda.borrar(+b.dataset.del); pinta();
    });
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
      SBAudio.voz(abajo, DUR * 0.8, 0, 0.5);                 // solo la melodía
      est.innerHTML = `<b>${i + 1}/${pares.length}</b> — melodía ${esc(Segunda.nombreEs(abajo))} ·
        canta <b style="color:var(--accent)">${esc(Segunda.nombreEs(arriba))}</b>
        <div class="dim small" id="sg-oigo">escuchando…</div>`;
      let mejor = null;
      const t0 = performance.now();
      while (performance.now() - t0 < DUR * 1000 && vivo) {       // muestrea mientras suena
        await new Promise(r => setTimeout(r, 90));
        const p = Pitch.actual();
        if (p && performance.now() - t0 > 500) {
          mejor = p;
          const ok = p.midi % 12 === arriba % 12;
          const o = $('#sg-oigo');
          if (o) {
            o.textContent = `oigo: ${Segunda.nombreEs(p.midi)} ${ok ? '✓' : ''}`;
            o.style.color = ok ? 'var(--ok)' : 'var(--txt-dim)';
          }
        }
      }
      resultados.push(mejor && mejor.midi % 12 === arriba % 12);
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
