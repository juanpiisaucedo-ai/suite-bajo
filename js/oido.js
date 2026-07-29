/* Entrenamiento auditivo: preguntas generadas al vuelo (infinitas) con el sinte de bajo. */
const Oido = (() => {
  const IV = [['2m', 1], ['2M', 2], ['3m', 3], ['3M', 4], ['4J', 5], ['TT', 6],
              ['5J', 7], ['6m', 8], ['6M', 9], ['7m', 10], ['7M', 11], ['8ª', 12]];
  const nom = c => IV.find(x => x[1] === c)[0];
  const TRIADAS = [['Mayor', [0, 4, 7]], ['Menor', [0, 3, 7]],
                   ['Disminuida', [0, 3, 6]], ['Aumentada', [0, 4, 8]]];
  const SEPTIMAS = [['maj7', [0, 4, 7, 11]], ['7 (dominante)', [0, 4, 7, 10]],
                    ['m7', [0, 3, 7, 10]], ['m7b5', [0, 3, 6, 10]]];
  const ESCALAS = [['Mayor', [0, 2, 4, 5, 7, 9, 11, 12]], ['Menor natural', [0, 2, 3, 5, 7, 8, 10, 12]],
                   ['Dórico', [0, 2, 3, 5, 7, 9, 10, 12]], ['Mixolidio', [0, 2, 4, 5, 7, 9, 10, 12]],
                   ['Pentatónica menor', [0, 3, 5, 7, 10, 12]], ['Blues', [0, 3, 5, 6, 7, 10, 12]]];
  const NIVELES = [
    { n: 1, titulo: 'Intervalos básicos', desc: '2M · 3m · 3M · 4J · 5J · 8ª, uno tras otro' },
    { n: 2, titulo: 'Todos los intervalos', desc: 'los 12, ascendentes y descendentes' },
    { n: 3, titulo: 'Intervalos armónicos', desc: 'las dos notas al mismo tiempo' },
    { n: 4, titulo: 'Triadas', desc: 'mayor · menor · disminuida · aumentada' },
    { n: 5, titulo: 'Acordes de 7ª', desc: 'maj7 · dominante · m7 · m7b5' },
    { n: 6, titulo: 'Escalas y modos', desc: 'mayor, menor, dórico, mixolidio, pentatónica, blues' },
    { n: 7, titulo: 'Ritmo', desc: 'recto o sincopado · negras, corcheas o tresillos' },
  ];
  const al = a => a[Math.floor(Math.random() * a.length)];
  const baraja = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(v => v[1]);
  const raiz = (max = 12) => 28 + Math.floor(Math.random() * Math.max(1, 48 - 28 - max));

  /* Cada generador devuelve {tocar(), opciones, correcta, explica} */
  function generar(nivel) {
    if (nivel === 1 || nivel === 2) {
      const pool = nivel === 1 ? [2, 3, 4, 5, 7, 12] : IV.map(x => x[1]);
      const semis = al(pool);
      const baja = nivel === 2 && Math.random() < 0.4;
      const r = raiz(12);
      const seq = baja ? [r + semis, r] : [r, r + semis];
      const opts = baraja([...new Set([semis, ...baraja(pool).filter(s => s !== semis).slice(0, 2)])]).map(nom);
      return {
        pregunta: baja ? '¿Qué intervalo bajó?' : '¿Qué intervalo escuchaste?',
        tocar: () => SBAudio.secuencia(seq, { dur: 0.9, gap: 0.08 }),
        opciones: opts, correcta: nom(semis),
        explica: `${semis} semitono${semis === 1 ? '' : 's'} = ${nom(semis)}.`,
      };
    }
    if (nivel === 3) {
      const semis = al(IV.map(x => x[1]));
      const r = raiz(12);
      const opts = baraja([...new Set([semis, ...baraja(IV.map(x => x[1])).filter(s => s !== semis).slice(0, 2)])]).map(nom);
      return {
        pregunta: '¿Qué intervalo suena (las dos notas juntas)?',
        tocar: () => SBAudio.acorde([r, r + semis], 1.8),
        opciones: opts, correcta: nom(semis),
        explica: `${semis} semitonos = ${nom(semis)}. Juntas se llama intervalo armónico.`,
      };
    }
    if (nivel === 4 || nivel === 5) {
      const tabla = nivel === 4 ? TRIADAS : SEPTIMAS;
      const [nombre, forma] = al(tabla);
      const r = raiz(12);
      return {
        pregunta: nivel === 4 ? '¿Qué triada escuchaste?' : '¿Qué acorde de 7ª escuchaste?',
        tocar: () => SBAudio.secuencia(forma.map(s => r + s), { dur: 0.55, gap: 0.05 }),
        opciones: baraja(tabla.map(t => t[0])), correcta: nombre,
        explica: `Semitonos desde la fundamental: ${forma.join('-')} → ${nombre}.`,
      };
    }
    if (nivel === 6) {
      const [nombre, forma] = al(ESCALAS);
      const r = raiz(12);
      return {
        pregunta: '¿Qué escala escuchaste?',
        tocar: () => SBAudio.secuencia(forma.map(s => r + s), { dur: 0.42, gap: 0.03 }),
        opciones: baraja([nombre, ...baraja(ESCALAS.map(e => e[0])).filter(x => x !== nombre).slice(0, 2)]),
        correcta: nombre,
        explica: `Grados en semitonos: ${forma.join('-')} → ${nombre}.`,
      };
    }
    /* nivel 7: ritmo */
    const tipo = al(['recto', 'sincopado', 'corcheas', 'tresillos']);
    const r = raiz(6);
    const b = 0.6;
    const patrones = {
      recto: [{ midi: r, dur: b }, { midi: r, dur: b }, { midi: r, dur: b }, { midi: r, dur: b }],
      sincopado: [{ midi: r, dur: b }, { midi: 0, dur: b / 2 }, { midi: r, dur: b / 2 },
                  { midi: 0, dur: b / 2 }, { midi: r, dur: b / 2 }, { midi: r, dur: b }],
      corcheas: Array.from({ length: 8 }, () => ({ midi: r, dur: b / 2 })),
      tresillos: Array.from({ length: 6 }, () => ({ midi: r, dur: b / 3 })),
    };
    const esRitmo = tipo === 'recto' || tipo === 'sincopado';
    return {
      pregunta: esRitmo ? '¿El patrón es recto o sincopado?' : '¿Qué subdivisión escuchaste?',
      tocar: () => SBAudio.secuencia(patrones[tipo], { gap: 0 }),
      opciones: esRitmo ? ['Recto (en los pulsos)', 'Sincopado (cae en los "y")']
                        : ['Corcheas (2 por pulso)', 'Tresillos (3 por pulso)'],
      correcta: tipo === 'recto' ? 'Recto (en los pulsos)'
        : tipo === 'sincopado' ? 'Sincopado (cae en los "y")'
        : tipo === 'corcheas' ? 'Corcheas (2 por pulso)' : 'Tresillos (3 por pulso)',
      explica: {
        recto: 'Cada ataque cayó justo en el pulso.',
        sincopado: 'Hubo ataques en los "y", entre pulso y pulso: eso es síncopa.',
        corcheas: 'Dos notas por pulso: se cuentan «1 y 2 y».',
        tresillos: 'Tres notas por pulso: se cuentan «1-tre-sillo».',
      }[tipo],
    };
  }
  return { NIVELES, generar };
})();

/* ---------- lista de niveles ---------- */
App.route(/^#\/oido$/, view => {
  view.innerHTML = `
    <h1>Entrenamiento auditivo</h1>
    <p class="dim small">Preguntas infinitas: cada ronda son 10, generadas al momento. Ponte
    audífonos si puedes — el bajo grave se pierde en la bocina del teléfono.</p>
    ${Oido.NIVELES.map(l => {
      const best = store.get(`oido_best_${l.n}`, null);
      return `<a class="card" href="#/oido/${l.n}">
        <div class="row"><h3>${l.n}. ${esc(l.titulo)}</h3>
        ${best !== null ? `<span class="badge ${best >= 80 ? 'ok' : ''}">${best}%</span>`
                        : '<span class="badge">nuevo</span>'}</div>
        <div class="dim small">${esc(l.desc)}</div>
      </a>`;
    }).join('')}`;
});

/* ---------- ronda de 10 preguntas ---------- */
App.route(/^#\/oido\/(\d+)$/, (view, nStr) => {
  const n = +nStr;
  const info = Oido.NIVELES.find(l => l.n === n);
  if (!info) { location.hash = '#/oido'; return; }
  let i = 0, aciertos = 0, q = null, ultimasCorrectas = [];

  const arranque = () => {
    view.innerHTML = `
      <a class="dim small" href="#/oido">← Niveles</a>
      <h1>${esc(info.titulo)}</h1>
      <p class="dim">${esc(info.desc)}</p>
      <button class="btn full" id="oi-go">▶ Empezar</button>`;
    $('#oi-go').onclick = async () => { await SBAudio.listo(); siguiente(); };
  };

  const siguiente = () => {
    if (i >= 10) {
      const pct = Math.round((aciertos / 10) * 100);
      store.set(`oido_best_${n}`, Math.max(store.get(`oido_best_${n}`, 0), pct));
      marcarPracticaHoy();
      view.innerHTML = `
        <div class="q-score">${pct >= 80 ? '👂✅' : '👂'} ${aciertos}/10 — ${pct}%</div>
        <p class="dim" style="text-align:center">${pct >= 80
          ? 'Tu oído va bien. Súbele de nivel.'
          : 'El oído se entrena en rondas cortas y diarias, no en maratones.'}</p>
        <button class="btn full" id="oi-otra">Otra ronda</button>
        <a class="btn full ghost" href="#/oido" style="margin-top:8px">Volver a niveles</a>`;
      $('#oi-otra').onclick = () => { i = 0; aciertos = 0; siguiente(); };
      return;
    }
    /* que no se repita la misma respuesta más de dos veces seguidas */
    let intentos = 0;
    do { q = Oido.generar(n); intentos++; }
    while (intentos < 8 && ultimasCorrectas.length >= 2 &&
           ultimasCorrectas.slice(-2).every(c => c === q.correcta));
    ultimasCorrectas.push(q.correcta);

    view.innerHTML = `
      <a class="dim small" href="#/oido">← Salir</a>
      <div class="dim small" style="margin-top:6px">Pregunta ${i + 1} de 10 · aciertos: ${aciertos}</div>
      <h2>${esc(q.pregunta)}</h2>
      <button class="btn full ghost" id="oi-rep" style="margin-bottom:12px">🔊 Repetir</button>
      ${q.opciones.map((o, j) => `<button class="q-opt" data-j="${j}">${esc(o)}</button>`).join('')}
      <div id="oi-zone"></div>`;
    q.tocar();
    $('#oi-rep').onclick = () => q.tocar();
    view.querySelectorAll('.q-opt').forEach(btn => btn.onclick = () => {
      const elegida = q.opciones[+btn.dataset.j];
      const ok = elegida === q.correcta;
      if (ok) aciertos++;
      view.querySelectorAll('.q-opt').forEach((b, k) => {
        b.disabled = true;
        if (q.opciones[k] === q.correcta) b.classList.add('correct');
        else if (k === +btn.dataset.j) b.classList.add('wrong');
      });
      $('#oi-zone').innerHTML = `
        <div class="q-explain">${ok ? '✓ ' : ''}${esc(q.explica)}</div>
        <button class="btn full" id="oi-next">Continuar</button>`;
      $('#oi-next').onclick = () => { i++; siguiente(); };
    });
  };

  arranque();
  window._cleanup = () => { try { SBAudio.metronomo.parar(); } catch {} };
});

window.Oido = Oido;
