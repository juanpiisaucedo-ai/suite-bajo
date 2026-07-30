/* Sintetizador de bajo y metrónomo (Web Audio). Sin samples ni librerías. */
const SBAudio = (() => {
  let ctx = null, metro = null;
  let activos = [];                    // osciladores programados, para poder cortarlos
  const registrar = (...osc) => osc.forEach(o => {
    activos.push(o);
    o.onended = () => { activos = activos.filter(x => x !== o); };
  });
  const freq = m => 440 * Math.pow(2, (m - 69) / 12);

  const contexto = () => (ctx = ctx || new (window.AudioContext || window.webkitAudioContext)());

  function nota(midi, dur = 1, t0 = 0, gain = 0.9) {
    const c = contexto(), t = c.currentTime + t0, f = freq(midi);
    const g = c.createGain(), lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(1400, t);
    lp.frequency.exponentialRampToValueAtTime(320, t + Math.min(dur, 1.2));
    lp.Q.value = 1;
    const saw = c.createOscillator(), sub = c.createOscillator(), gSub = c.createGain();
    saw.type = 'sawtooth'; saw.frequency.value = f;
    sub.type = 'sine'; sub.frequency.value = f / 2; gSub.gain.value = 0.4;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);      // ataque de dedo
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.6); // caída natural
    saw.connect(lp); sub.connect(gSub); gSub.connect(lp);
    lp.connect(g); g.connect(c.destination);
    saw.start(t); sub.start(t);
    saw.stop(t + dur + 0.7); sub.stop(t + dur + 0.7);
    registrar(saw, sub);
  }

  function click(fuerte = false, t0 = 0) {
    const c = contexto(), t = c.currentTime + t0;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = fuerte ? 1900 : 1400;
    g.gain.setValueAtTime(fuerte ? 0.22 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.04);
    registrar(o);
  }

  /* Voz sintética con FORMANTES. Un oscilador pelón suena a consola de 8 bits;
     lo que hace que algo suene "a voz" son los picos de resonancia (formantes) de
     la garganta, más un vibrato que entra después del ataque y bordes suaves. */
  const FORMANTES = [[700, 9, 4], [1150, 8, 6], [2550, 6, 8]];   // vocal "ah": [Hz, dB, Q]
  function voz(midi, dur = 0.7, t0 = 0, gain = 0.5) {
    const c = contexto(), t = c.currentTime + t0, f = freq(midi);
    const largo = Math.max(0.18, dur);

    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(f, t);
    const cuerpo = c.createOscillator(), gCuerpo = c.createGain();
    cuerpo.type = 'sine'; cuerpo.frequency.setValueAtTime(f, t); gCuerpo.gain.value = 0.35;

    /* vibrato: arranca en cero y entra poco a poco, como un cantante */
    const lfo = c.createOscillator(), lfoG = c.createGain();
    lfo.type = 'sine'; lfo.frequency.value = 5.1;
    lfoG.gain.setValueAtTime(0, t);
    lfoG.gain.linearRampToValueAtTime(f * 0.007, t + Math.min(0.4, largo * 0.6));
    lfo.connect(lfoG); lfoG.connect(osc.frequency); lfoG.connect(cuerpo.frequency);

    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = Math.min(4000, f * 12); lp.Q.value = 0.4;

    let cadena = lp;
    const filtros = FORMANTES.map(([hz, db, q]) => {
      const b = c.createBiquadFilter();
      b.type = 'peaking'; b.frequency.value = hz; b.gain.value = db; b.Q.value = q;
      cadena.connect(b); cadena = b;
      return b;
    });

    /* envolvente con bordes suaves: sin clicks y con cola natural */
    const g = c.createGain();
    const atk = Math.min(0.06, largo * 0.25), rel = Math.min(0.22, largo * 0.4);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + atk);
    g.gain.setValueAtTime(gain, t + largo - rel);
    g.gain.exponentialRampToValueAtTime(0.0001, t + largo + 0.05);

    osc.connect(lp); cuerpo.connect(gCuerpo); gCuerpo.connect(lp);
    cadena.connect(g); g.connect(c.destination);
    const finT = t + largo + 0.08;
    osc.start(t); cuerpo.start(t); lfo.start(t);
    osc.stop(finT); cuerpo.stop(finT); lfo.stop(finT);
    registrar(osc, cuerpo, lfo);
  }

  return {
    ctx: contexto,
    voz,
    /* dos voces respetando el ritmo capturado: cada nota con su tiempo y su duración */
    duetoTiempos(notas, { soloArriba = false, soloAbajo = false } = {}) {
      let fin = 0;
      notas.forEach(({ abajo, arriba, t, dur }) => {
        const d = Math.max(0.12, dur || 0.5);
        if (!soloArriba) voz(abajo, d, t, 0.45);
        if (!soloAbajo) voz(arriba, d, t, 0.45);
        fin = Math.max(fin, t + d);
      });
      return fin + 0.3;
    },
    /* dos voces a la vez (melodía + segunda) */
    dueto(pares, { dur = 0.7, gap = 0.06, soloArriba = false, soloAbajo = false } = {}) {
      let t = 0;
      pares.forEach(([abajo, arriba]) => {
        if (!soloArriba) voz(abajo, dur, t, 0.45);
        if (!soloAbajo) voz(arriba, dur, t, 0.45);
        t += dur + gap;
      });
      return t;
    },
    /* Pone al teléfono en modo REPRODUCCIÓN. En iOS, tras usar el micrófono la sesión
       queda en 'play-and-record' y el sonido se va al auricular chico (o se calla con
       el switch de silencio): esto lo regresa a la bocina. */
    modoReproducir() {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch {}
    },
    modoGrabar() {
      try { if (navigator.audioSession) navigator.audioSession.type = 'play-and-record'; } catch {}
    },
    estado: () => (ctx ? ctx.state : 'sin iniciar'),
    /* Devuelve el contexto ya sonando (nunca lo cierra: cerrarlo fuera del gesto del
       usuario deja la app muda hasta recargar). */
    async listo() {
      this.modoReproducir();
      const c = contexto();
      if (c.state !== 'running') { try { await c.resume(); } catch {} }
      return c;
    },
    nota,
    click,
    acorde(midis, dur = 1.6) { midis.forEach(m => nota(m, dur, 0, 0.55)); return dur + 0.4; },
    /* notas: array de midi o de {midi, dur}. Devuelve la duración total en segundos. */
    secuencia(notas, { gap = 0.06, dur = 0.6 } = {}) {
      let t = 0;
      notas.forEach(n => {
        const midi = typeof n === 'number' ? n : n.midi;
        const d = (typeof n === 'object' && n.dur) ? n.dur : dur;
        if (midi) nota(midi, d, t);
        t += d + gap;
      });
      return t + 0.4;
    },
    /* corta todo lo que esté sonando o programado */
    parar() {
      this.metronomo.parar();
      activos.forEach(o => { try { o.stop(); } catch {} try { o.disconnect(); } catch {} });
      activos = [];
    },
    sonando: () => activos.length > 0,
    metronomo: {
      /* programa los clicks con antelación sobre el reloj de audio: no se desfasa */
      arrancar(bpm, { compas = 4, alBeat } = {}) {
        this.parar();
        const c = contexto(), paso = 60 / bpm;
        let i = 0, prox = c.currentTime + 0.1;
        const tick = () => {
          while (prox < c.currentTime + 0.2) {
            click(i % compas === 0, prox - c.currentTime);
            const idx = i, cuando = prox;
            if (alBeat) setTimeout(() => alBeat(idx), Math.max(0, (cuando - c.currentTime) * 1000));
            prox += paso; i++;
          }
        };
        tick();
        metro = setInterval(tick, 60);
      },
      parar() { if (metro) { clearInterval(metro); metro = null; } },
    },
  };
})();

window.SBAudio = SBAudio;
