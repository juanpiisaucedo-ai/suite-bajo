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
  let ritmoReal = store.get('seg_ritmo', true);
  let mel = [], reproduciendo = null;            // mel: [{g, t, dur}]
  const G = g => Segunda.midiDeGrado(g, tonica, modo);
  const S = g => Segunda.midiArmonia(g, tonica, modo, arm);
  const NG = g => Segunda.nombreDeGrado(g, tonica, modo);
  const NS = g => Segunda.nombreDeGrado(Segunda.gradoArmonia(g, arm), tonica, modo);
  /* frases viejas guardaban solo el grado: se les inventa un ritmo parejo */
  const norm = n => (typeof n === 'number' ? { g: n, t: null, dur: 0.6 } : n);

  /* Arma lo que se va a tocar. Con ritmo real usa el tiempo y duración capturados;
     en modo parejo reparte todo con la misma duración. */
  const secuencia = () => {
    let t = 0;
    return mel.map(x => {
      const n = norm(x);
      const usaReal = ritmoReal && n.t != null;
      const dur = usaReal ? Math.max(0.12, n.dur || 0.5) : 0.7;
      const ini = usaReal ? n.t : t;
      t = ini + dur + 0.08;
      return { g: n.g, abajo: G(n.g), arriba: S(n.g), t: ini, dur };
    });
  };
  const siguienteT = () => {                      // dónde cae la próxima nota al picar grados
    if (!mel.length) return 0;
    const u = norm(mel[mel.length - 1]);
    return (u.t == null ? mel.length * 0.68 : u.t + (u.dur || 0.6) + 0.08);
  };

  const pinta = () => {
    const seq = secuencia();
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

      <h2>2. Captura la melodía</h2>
      <div class="dim small">Pica los grados, o cántala / impórtala con su <b>ritmo</b>.
        Lo más exacto: pasa la voz por <b>Basic Pitch</b> (gratis, de Spotify) y trae aquí
        el <b>MIDI</b> — ahí las notas ya vienen perfectas.</div>
      <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin:10px 0">
        ${[1,2,3,4,5,6,7,8,9,10].map(g => `<button class="btn mini ghost" data-g="${g}"
            style="padding:12px 0;line-height:1.2">${g}<br><span class="dim small">${esc(NG(g))}</span></button>`).join('')}
      </div>
      <div class="card" style="min-height:54px">
        ${seq.length ? seq.map(n => `<span class="badge" style="margin:2px 3px;display:inline-block">
            ${esc(NG(n.g))} <span class="dim">+ ${esc(NS(n.g))}</span></span>`).join('')
          : '<span class="dim small">Aún no capturas nada.</span>'}
      </div>
      <div style="display:flex;gap:8px;margin:8px 0">
        <button class="btn mini ghost" id="sg-cantar" style="flex:1">🎙️ Cantando</button>
        <button class="btn mini ghost" id="sg-import" style="flex:1">📁 Importar voz o MIDI</button>
      </div>
      <input type="file" id="sg-file" accept="audio/*,.mid,.midi" style="display:none">
      <div id="sg-cap"></div>
      <div style="display:flex;gap:8px;margin:8px 0 16px">
        <button class="btn mini ghost" id="sg-undo" style="flex:1">← Borrar última</button>
        <button class="btn mini ghost" id="sg-clear" style="flex:1">Limpiar</button>
      </div>

      <h2>3. Escucha la armonía</h2>
      <div class="seg" style="margin-bottom:8px">
        ${Segunda.ARMONIAS.map(a => `<button data-arm="${a.id}"
          class="${a.id === arm ? 'active' : ''}" style="font-size:13px">${esc(a.label)}</button>`).join('')}
      </div>
      <div class="seg" style="margin-bottom:10px">
        <button data-ritmo="1" class="${ritmoReal ? 'active' : ''}">Ritmo real</button>
        <button data-ritmo="0" class="${ritmoReal ? '' : 'active'}">Notas parejas</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn mini" data-play="mel" style="flex:1">▶ Melodía</button>
        <button class="btn mini" data-play="seg" style="flex:1">▶ Segunda</button>
        <button class="btn" data-play="dos" style="flex:1.4">▶ Las dos</button>
      </div>
      <div class="dim small" id="sg-diag" style="margin-top:6px"></div>
      <button class="btn full ghost" id="sg-practica" style="margin-top:10px">🎤 Practicar: suena la melodía, canta la segunda</button>
      <div id="sg-zona"></div>

      ${seq.length ? `<h2>Detalle</h2>
        <div class="song-body small">${seq.map((n, i) =>
          `${String(i + 1).padStart(2)}. ${n.t.toFixed(2)}s (${n.dur.toFixed(2)}s)  ` +
          `${esc(NG(n.g))} → ${esc(NS(n.g))}  (${esc(Segunda.intervaloDe(n.g, tonica, modo, arm))})`).join('\n')}</div>
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
      mel.push({ g, t: siguienteT(), dur: 0.6 });
      SBAudio.listo().then(() => { SBAudio.parar(); SBAudio.voz(G(g), 0.5); SBAudio.voz(S(g), 0.5, 0, 0.35); });
      pinta();
    });
    $('#sg-undo').onclick = () => { mel.pop(); pinta(); };
    $('#sg-clear').onclick = () => { mel = []; pinta(); };
    view.querySelectorAll('[data-arm]').forEach(b => b.onclick = () => {
      arm = b.dataset.arm; store.set('seg_arm', arm); pinta();
    });
    view.querySelectorAll('[data-ritmo]').forEach(b => b.onclick = () => {
      ritmoReal = b.dataset.ritmo === '1'; store.set('seg_ritmo', ritmoReal); pinta();
    });
    view.querySelectorAll('[data-play]').forEach(b => b.onclick = async () => {
      if (!seq.length) return;
      const reset = () => view.querySelectorAll('[data-play]').forEach(o =>
        o.textContent = o.textContent.replace('⏹', '▶'));
      if (SBAudio.sonando()) {
        SBAudio.parar(); reset();
        if (b.dataset.play === reproduciendo) { reproduciendo = null; return; }
      }
      await SBAudio.listo();
      const st = SBAudio.estado(), diag = $('#sg-diag');
      if (diag) diag.textContent = st === 'running'
        ? `audio ok · ${seq.length} notas · ${(seq[seq.length - 1].t + seq[seq.length - 1].dur).toFixed(1)}s`
        : `⚠️ audio bloqueado (${st}) · vuelve a tocar el botón`;
      reset();
      b.textContent = b.textContent.replace('▶', '⏹');
      reproduciendo = b.dataset.play;
      const dur = SBAudio.duetoTiempos(seq, {
        soloAbajo: b.dataset.play === 'mel', soloArriba: b.dataset.play === 'seg' });
      setTimeout(() => { if (reproduciendo === b.dataset.play) { reset(); reproduciendo = null; } }, dur * 1000);
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
      tonica = f.tonica; modo = f.modo; arm = f.arm || '3a'; mel = f.mel.map(norm); pinta();
    });
    view.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { Segunda.borrar(+b.dataset.del); pinta(); });
    $('#sg-practica').onclick = () => practicar(secuencia());
    $('#sg-cantar').onclick = () => capturar();
    $('#sg-import').onclick = () => $('#sg-file').click();
    $('#sg-file').onchange = e => { if (e.target.files[0]) importar(e.target.files[0]); };
  };

  /* lleva una nota detectada al grado más cercano del tono */
  const alGrado = midi => {
    const ref = G(1);
    let m = midi;
    while (m < ref - 6) m += 12;
    while (m > ref + 18) m -= 12;
    let mejor = 1, dist = 99;
    for (let g = 1; g <= 10; g++) { const d = Math.abs(G(g) - m); if (d < dist) { dist = d; mejor = g; } }
    return mejor;
  };

  /* Captura cantando: sigue la altura y mide cuánto dura cada nota (eso es el ritmo). */
  async function capturar() {
    const cap = $('#sg-cap');
    if (!window.Pitch || !Pitch.soportado()) {
      cap.innerHTML = '<div class="notice">🎤 Este navegador no deja usar el micrófono.</div>';
      return;
    }
    SBAudio.parar();
    cap.innerHTML = '<div class="chk-card"><div id="sg-capmsg">Pidiendo micrófono…</div></div>';
    try { await Pitch.iniciar({ agudo: true }); }
    catch (e) { cap.innerHTML = `<div class="notice">🎤 ${esc(e.message)}</div>`; return; }

    cap.innerHTML = `<div class="chk-card">
      <div id="sg-vivo" style="font-size:30px;font-weight:800;text-align:center;min-height:40px">–</div>
      <div class="dim small" style="text-align:center">canta la melodía: se guarda la nota y
        cuánto la sostienes</div>
      <div id="sg-capmsg" class="small" style="margin:10px 0;min-height:22px"></div>
      <button class="btn mini" id="sg-capfin">Listo</button></div>`;
    const vivo = $('#sg-vivo'), msg = $('#sg-capmsg');

    /* Misma lógica que el análisis de archivo: corregir octava contra el centro de lo
       que llevas cantado, y cortar nota solo si la altura se aleja y se sostiene ahí
       (si no, el vibrato picaría cada nota en pedacitos). */
    let centro = null, act = null, fuera = 0, silencio = 0, tBase = null;
    const cerrar = fin => {
      if (!act) return;
      const dur = (fin - act.ini) / 1000;
      if (dur >= 0.13) {
        const g = alGrado(Math.round(act.suma / act.n));
        mel.push({ g, t: (act.ini - tBase) / 1000, dur });
        if (msg) msg.innerHTML = `<b>${mel.length}</b> notas: ` +
          mel.slice(-10).map(x => esc(NG(norm(x).g))).join(' · ');
      }
      act = null;
    };
    const timer = setInterval(() => {
      const p = Pitch.actual(), ahora = performance.now();
      if (vivo) {
        vivo.textContent = p ? Segunda.nombreLibre(p.midi, tonica) : '–';
        vivo.style.color = p ? 'var(--accent)' : 'var(--txt-dim)';
      }
      if (!p) {
        if (++silencio >= 5) { cerrar(ahora - 125); centro = centro; fuera = 0; }
        return;
      }
      silencio = 0;
      let f = p.midi + (p.cents || 0) / 100;
      if (centro != null) {                    // corrección de octava
        while (f - centro > 6) f -= 12;
        while (centro - f > 6) f += 12;
      }
      centro = centro == null ? f : centro * 0.97 + f * 0.03;
      if (!act) {
        if (tBase == null) tBase = ahora;
        act = { ini: ahora, suma: f, n: 1, centro: f }; fuera = 0;
        return;
      }
      if (Math.abs(f - act.centro) <= 0.7) {
        act.suma += f; act.n++; act.centro = act.suma / act.n; fuera = 0;
      } else if (++fuera >= 4) {               // ~100 ms en otra altura: nota nueva
        cerrar(ahora - 100);
        act = { ini: ahora - 100, suma: f, n: 1, centro: f };
        fuera = 0;
      }
    }, 25);

    const fin = () => { clearInterval(timer); cerrar(performance.now()); Pitch.detener(); };
    window._cleanup = () => { clearInterval(timer); Pitch.detener(); };
    $('#sg-capfin').onclick = () => { fin(); pinta(); };
  }

  /* Importa una pista de VOZ YA AISLADA y saca melodía + ritmo (sin micrófono). */
  async function importar(archivo) {
    const cap = $('#sg-cap');
    cap.innerHTML = '<div class="chk-card">Leyendo el archivo…</div>';
    /* Un MIDI (por ejemplo el que saca Basic Pitch) ya trae las notas exactas:
       no hay nada que detectar, se usa tal cual. */
    if (/\.midi?$/i.test(archivo.name)) {
      let crudas;
      try { crudas = MidiLector.leer(await archivo.arrayBuffer()); }
      catch (e) { cap.innerHTML = `<div class="notice">${esc(e.message)}</div>`; return; }
      if (!crudas.length) { cap.innerHTML = '<div class="notice">Ese MIDI viene vacío.</div>'; return; }

      /* Los transcriptores (Basic Pitch y compañía) pican la voz en fragmentos:
         notas cortísimas y la misma nota partida en pedazos. Esto lo junta, y los
         dos números quedan a la mano para ajustarlo sin volver a exportar. */
      const limpiar = (notas, minDur, unir) => {
        let r = [];
        for (const n of notas) {
          const u = r[r.length - 1];
          if (u && u.midi === n.midi && n.t - (u.t + u.dur) <= unir) {
            u.dur = +(n.t + n.dur - u.t).toFixed(3);
          } else r.push({ ...n });
        }
        r = r.filter(n => n.dur >= minDur);
        const s2 = [];                                  // volver a unir tras el filtro
        for (const n of r) {
          const u = s2[s2.length - 1];
          if (u && u.midi === n.midi && n.t - (u.t + u.dur) <= unir) {
            u.dur = +(n.t + n.dur - u.t).toFixed(3);
          } else s2.push({ ...n });
        }
        s2.forEach((n, i) => {                          // ligar hasta la siguiente
          const sig = s2[i + 1];
          if (sig && sig.t - (n.t + n.dur) > 0 && sig.t - (n.t + n.dur) < 0.35) {
            n.dur = +(sig.t - n.t - 0.02).toFixed(3);
          }
        });
        return s2;
      };

      const pintaMidi = () => {
        const minDur = (+$('#mi-min').value || 120) / 1000;
        const unir = (+$('#mi-unir').value || 120) / 1000;
        const notas = limpiar(crudas, minDur, unir);
        const t0 = notas.length ? notas[0].t : 0;
        const nuevas = notas.map(n => ({ g: alGrado(n.midi), t: +(n.t - t0).toFixed(3), dur: n.dur }));
        $('#mi-res').innerHTML = `
          <div class="dim small" style="margin-top:8px">${crudas.length} notas en el MIDI →
            <b>${nuevas.length}</b> después de limpiar (tono ${esc(tonica)} ${esc(modo)}):</div>
          <div class="song-body small" style="margin:6px 0">${nuevas.map(n =>
            `${n.t.toFixed(2)}s (${n.dur.toFixed(2)}s)  ${esc(NG(n.g))}  →  ${esc(NS(n.g))}`).join('\n')}</div>
          <div style="display:flex;gap:8px">
            <button class="btn mini ghost" id="mi-oir" style="flex:1">▶ Oír</button>
            <button class="btn mini ghost" id="mi-add" style="flex:1">Agregar</button>
            <button class="btn mini" id="mi-usar" style="flex:1">Usar</button>
          </div>`;
        $('#mi-oir').onclick = async () => {
          SBAudio.parar(); await SBAudio.listo();
          SBAudio.duetoTiempos(nuevas.map(n => ({ abajo: G(n.g), arriba: S(n.g), t: n.t, dur: n.dur })),
            { soloAbajo: true });
        };
        $('#mi-usar').onclick = () => { mel = nuevas; pinta(); };
        $('#mi-add').onclick = () => {
          const off = siguienteT();
          mel = mel.concat(nuevas.map(n => ({ ...n, t: n.t + off })));
          pinta();
        };
      };

      cap.innerHTML = `<div class="chk-card">
        <div><b>${esc(archivo.name)}</b> <span class="badge ok">MIDI</span></div>
        <div class="dim small" style="margin:6px 0">Si el transcriptor picó la voz en pedacitos,
          sube estos dos números hasta que la frase se lea bien:</div>
        <div style="display:flex;gap:8px">
          <label class="small dim" style="flex:1">nota mínima (ms)
            <input type="number" id="mi-min" value="120" min="40" max="600" step="20"></label>
          <label class="small dim" style="flex:1">unir huecos de (ms)
            <input type="number" id="mi-unir" value="120" min="0" max="500" step="20"></label>
        </div>
        <button class="btn mini ghost" id="mi-rehacer" style="width:100%;margin-top:6px">Volver a limpiar</button>
        <div id="mi-res"></div></div>`;
      $('#mi-rehacer').onclick = pintaMidi;
      $('#mi-min').onchange = pintaMidi;
      $('#mi-unir').onchange = pintaMidi;
      pintaMidi();
      return;
    }
    let buf;
    try {
      buf = await SBAudio.ctx().decodeAudioData(await archivo.arrayBuffer());
    } catch {
      cap.innerHTML = '<div class="notice">No pude leer ese audio. Prueba con MP3, WAV o M4A.</div>';
      return;
    }
    const durTotal = buf.duration;
    cap.innerHTML = `<div class="chk-card">
      <div><b>${esc(archivo.name)}</b> <span class="dim small">· ${durTotal.toFixed(1)} s</span></div>
      <div class="dim small" style="margin:6px 0">Elige el pedazo (una frase a la vez sale mejor).
        Máximo 25 s.</div>
      <div style="display:flex;gap:8px;align-items:center">
        <label class="small dim" style="flex:1">desde (s)
          <input type="number" id="sg-desde" value="0" min="0" max="${Math.floor(durTotal)}" step="1"></label>
        <label class="small dim" style="flex:1">duración (s)
          <input type="number" id="sg-largo" value="${Math.min(15, Math.round(durTotal))}" min="2" max="25" step="1"></label>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn mini ghost" id="sg-oir" style="flex:1">▶ Oír pedazo</button>
        <button class="btn mini" id="sg-analiza" style="flex:1.4">Sacar las notas</button>
      </div>
      <div id="sg-res"></div></div>`;
    $('#sg-oir').onclick = async () => {
      SBAudio.parar();
      const c = await SBAudio.listo(), src = c.createBufferSource();
      src.buffer = buf; src.connect(c.destination);
      src.start(0, +$('#sg-desde').value, +$('#sg-largo').value);
    };
    $('#sg-analiza').onclick = async () => {
      const d0 = Math.max(0, +$('#sg-desde').value);
      const L = Math.min(25, Math.max(2, +$('#sg-largo').value));
      $('#sg-res').innerHTML = '<div class="dim small" style="margin-top:8px">Analizando…</div>';
      await new Promise(r => setTimeout(r, 30));
      const sr = buf.sampleRate;
      const ini = Math.floor(d0 * sr), fin = Math.min(buf.length, ini + Math.floor(L * sr));
      const mono = new Float32Array(fin - ini);
      for (let ch = 0; ch < buf.numberOfChannels; ch++) {
        const c = buf.getChannelData(ch);
        for (let i = 0; i < mono.length; i++) mono[i] += c[ini + i] / buf.numberOfChannels;
      }
      const notas = Pitch.analizarBuffer(mono, sr);
      if (!notas.length) {
        $('#sg-res').innerHTML = '<div class="notice">No encontré notas claras ahí. Prueba otro pedazo o sube el volumen de la pista.</div>';
        return;
      }
      const t0 = notas[0].t;
      const nuevas = notas.map(n => ({ g: alGrado(n.midi), t: +(n.t - t0).toFixed(3), dur: n.dur }));
      $('#sg-res').innerHTML = `
        <div class="dim small" style="margin-top:10px">${nuevas.length} notas con su ritmo
          (tono ${esc(tonica)} ${esc(modo)}):</div>
        <div class="song-body small" style="margin:6px 0">${nuevas.map(n =>
          `${n.t.toFixed(2)}s (${n.dur.toFixed(2)}s)  ${esc(NG(n.g))}  →  ${esc(NS(n.g))}`).join('\n')}</div>
        <div style="display:flex;gap:8px">
          <button class="btn mini ghost" id="sg-usar-add" style="flex:1">Agregar</button>
          <button class="btn mini" id="sg-usar" style="flex:1">Usar como frase</button>
        </div>`;
      $('#sg-usar').onclick = () => { mel = nuevas; pinta(); };
      $('#sg-usar-add').onclick = () => {
        const off = siguienteT();
        mel = mel.concat(nuevas.map(n => ({ ...n, t: n.t + off })));
        pinta();
      };
    };
  }

  /* Suena la melodía nota por nota; tú cantas la segunda y el micrófono te dice si le atinas. */
  async function practicar(seq) {
    const zona = $('#sg-zona');
    if (!seq.length) return;
    if (!window.Pitch || !Pitch.soportado()) {
      zona.innerHTML = '<div class="notice">🎤 Este navegador no deja usar el micrófono.</div>';
      return;
    }
    zona.innerHTML = '<div class="chk-card"><div id="sg-est">Pidiendo micrófono…</div></div>';
    try { await SBAudio.listo(); await Pitch.iniciar({ agudo: true }); }
    catch (e) { zona.innerHTML = `<div class="notice">🎤 ${esc(e.message)}</div>`; return; }
    const est = $('#sg-est');
    const resultados = [];
    let vivo = true;
    window._cleanup = () => { vivo = false; Pitch.detener(); };
    for (let i = 0; i < seq.length && vivo; i++) {
      const n = seq[i], DUR = Math.max(1.1, n.dur + 0.4);
      SBAudio.voz(n.abajo, DUR * 0.8, 0, 0.5);
      est.innerHTML = `<b>${i + 1}/${seq.length}</b> — melodía ${esc(NG(n.g))} ·
        canta <b style="color:var(--accent)">${esc(NS(n.g))}</b>
        <div class="dim small" id="sg-oigo">escuchando…</div>`;
      let acerto = false;
      const t0 = performance.now();
      while (performance.now() - t0 < DUR * 1000 && vivo) {
        await new Promise(r => setTimeout(r, 90));
        const p = Pitch.actual();
        if (p && performance.now() - t0 > 500) {
          const ok = p.midi % 12 === n.arriba % 12;
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
      <div class="q-score">${ok === seq.length ? '🎯' : '🎤'} ${ok}/${seq.length}</div>
      <div style="font-family:ui-monospace,Menlo,monospace;text-align:center">${resultados.map(r => r ? '✓' : '✗').join(' ')}</div>
      <p class="dim small" style="margin-top:8px">Si te vas a la melodía en vez de la segunda (pasa
      siempre al principio), canta primero la segunda sola varias veces hasta que se te pegue.</p>
      <button class="btn mini ghost" id="sg-otra">Otra vez</button></div>`;
    $('#sg-otra').onclick = () => practicar(seq);
  }

  pinta();
});
