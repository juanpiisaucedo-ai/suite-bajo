/* Sintetizador de bajo y metrónomo (Web Audio). Sin samples ni librerías. */
const SBAudio = (() => {
  let ctx = null, metro = null;
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
  }

  function click(fuerte = false, t0 = 0) {
    const c = contexto(), t = c.currentTime + t0;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'square'; o.frequency.value = fuerte ? 1900 : 1400;
    g.gain.setValueAtTime(fuerte ? 0.22 : 0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + 0.04);
  }

  /* timbre claro para registro vocal (el de bajo suena opaco arriba de MIDI 50) */
  function voz(midi, dur = 0.7, t0 = 0, gain = 0.5) {
    const c = contexto(), t = c.currentTime + t0, f = freq(midi);
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    const g = c.createGain(), g2 = c.createGain(), lp = c.createBiquadFilter();
    o1.type = 'triangle'; o1.frequency.value = f;
    o2.type = 'sawtooth'; o2.frequency.value = f; g2.gain.value = 0.16;
    lp.type = 'lowpass'; lp.frequency.value = 2600; lp.Q.value = 0.6;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.03);
    g.gain.setValueAtTime(gain, t + dur * 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    o1.connect(lp); o2.connect(g2); g2.connect(lp);
    lp.connect(g); g.connect(c.destination);
    o1.start(t); o2.start(t); o1.stop(t + dur + 0.1); o2.stop(t + dur + 0.1);
  }

  return {
    ctx: contexto,
    voz,
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
    async listo() {
      const c = contexto();
      if (c.state === 'suspended') await c.resume();
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
