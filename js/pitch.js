/* Detección de pitch del bajo: YIN sobre señal decimada + onset por energía.
   El TIEMPO se toma del onset (casi instantáneo); la ALTURA se mide 70 ms después,
   cuando la nota grave ya se estabilizó. Así el timing no hereda la latencia del pitch. */
const Pitch = (() => {
  const NOMBRES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const CUERDAS = [{ n: 'E', midi: 28 }, { n: 'A', midi: 33 }, { n: 'D', midi: 38 }, { n: 'G', midi: 43 }];
  const DEC = 4;              // decimación: 44.1 kHz -> ~11 kHz (sobra para 41-400 Hz)
  const VENTANA = 4096;       // ~93 ms: 3-4 periodos del mi grave (41 Hz)
  const nombreDe = m => NOMBRES[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);

  let ctx = null, stream = null, analyser = null, cruda = null, timer = null;
  let ultimo = null, rmsAct = 0, corriendo = false, techo = 400;
  let escuchas = [];          // callbacks de onset

  /* --- YIN sobre x (ya decimada), devuelve frecuencia o 0 --- */
  function yin(x, sr) {
    const N = x.length;
    const tauMin = Math.max(2, Math.floor(sr / techo));
    const tauMax = Math.min(N - 2, Math.ceil(sr / 35));
    const d = new Float32Array(tauMax + 1);
    for (let tau = tauMin; tau <= tauMax; tau++) {
      let s = 0;
      for (let i = 0, lim = N - tau; i < lim; i++) { const dif = x[i] - x[i + tau]; s += dif * dif; }
      d[tau] = s;
    }
    const dp = new Float32Array(tauMax + 1);   // diferencia media normalizada acumulada
    let run = 0;
    for (let tau = tauMin; tau <= tauMax; tau++) {
      run += d[tau];
      dp[tau] = run === 0 ? 1 : d[tau] * (tau - tauMin + 1) / run;
    }
    const UMBRAL = 0.12;
    let tau = -1;
    for (let t = tauMin; t <= tauMax - 1; t++) {
      if (dp[t] < UMBRAL) { while (t + 1 <= tauMax && dp[t + 1] < dp[t]) t++; tau = t; break; }
    }
    if (tau < 0) {                              // nada bajo el umbral: mínimo global
      let mejor = tauMin;
      for (let t = tauMin; t <= tauMax; t++) if (dp[t] < dp[mejor]) mejor = t;
      if (dp[mejor] > 0.5) return 0;            // demasiado sucio: no hay nota
      tau = mejor;
    }
    /* Guarda de octava SOLO cuando el candidato es dudoso: si dp[tau] no es
       convincente pero el doble del periodo sí lo es, la fundamental es la grave.
       (Sin la condición de "dudoso" esto parte a la mitad toda nota limpia.) */
    const t2 = tau * 2;
    if (dp[tau] > 0.35 && t2 <= tauMax && dp[t2] < dp[tau] * 0.6) tau = t2;
    /* interpolación parabólica para precisión sub-muestra */
    const y0 = d[tau - 1] ?? d[tau], y1 = d[tau], y2 = d[tau + 1] ?? d[tau];
    const den = 2 * (2 * y1 - y0 - y2);
    const ajuste = den !== 0 ? (y2 - y0) / den : 0;
    return sr / (tau + ajuste);
  }

  function analizar() {
    if (!analyser) return;
    analyser.getFloatTimeDomainData(cruda);
    let suma = 0;
    for (let i = 0; i < cruda.length; i++) suma += cruda[i] * cruda[i];
    rmsAct = Math.sqrt(suma / cruda.length);
    if (rmsAct < 0.004) { ultimo = null; return; }
    const n = Math.floor(cruda.length / DEC);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {              // promediar de 4 en 4 = anti-alias simple
      x[i] = (cruda[i * DEC] + cruda[i * DEC + 1] + cruda[i * DEC + 2] + cruda[i * DEC + 3]) / 4;
    }
    const f = yin(x, ctx.sampleRate / DEC);
    if (!f || f < 35 || f > techo + 30) { ultimo = null; return; }
    const exacto = 69 + 12 * Math.log2(f / 440);
    const midi = Math.round(exacto);
    ultimo = { freq: f, midi, nombre: nombreDe(midi), cents: Math.round((exacto - midi) * 100), rms: rmsAct };
  }

  /* --- bucle: análisis + detección de onset por energía --- */
  function bucle() {
    let mediaLenta = 0, ultOnset = -1e9, pendiente = null;
    timer = setInterval(() => {
      analizar();
      const ahora = performance.now();
      mediaLenta = mediaLenta * 0.85 + rmsAct * 0.15;
      const subida = rmsAct > 0.012 && rmsAct > mediaLenta * 1.8;
      if (subida && ahora - ultOnset > 90) {    // refractario: no contar dos veces
        ultOnset = ahora;
        pendiente = { t: ahora };
      }
      if (pendiente && ahora - pendiente.t >= 70) {   // ya se estabilizó: leer altura
        const p = ultimo;
        const nota = { t_ms: pendiente.t, midi: p ? p.midi : null, freq: p ? p.freq : 0, cents: p ? p.cents : 0 };
        pendiente = null;
        escuchas.forEach(cb => { try { cb(nota); } catch {} });
      }
    }, 25);
  }

  return {
    soportado: () => !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
                        (window.AudioContext || window.webkitAudioContext)),
    actual: () => ultimo,
    async iniciar({ agudo = false } = {}) {
      techo = agudo ? 700 : 400;   // voz cantada llega más arriba que el bajo
      if (corriendo) return;
      if (!this.soportado()) throw new Error('Este navegador no permite usar el micrófono.');
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 1 },
        });
      } catch {
        throw new Error('No me diste permiso del micrófono (o está ocupado por otra app).');
      }
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (ctx.state === 'suspended') await ctx.resume();
      const src = ctx.createMediaStreamSource(stream);
      const lp = ctx.createBiquadFilter();      // deja pasar solo el rango del bajo:
      lp.type = 'lowpass'; lp.frequency.value = agudo ? 1100 : 500; lp.Q.value = 0.7;  // filtra el metrónomo
      analyser = ctx.createAnalyser();
      analyser.fftSize = VENTANA;
      cruda = new Float32Array(analyser.fftSize);
      src.connect(lp); lp.connect(analyser);
      corriendo = true;
      bucle();
    },
    detener() {
      corriendo = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      if (ctx) { try { ctx.close(); } catch {} ctx = null; }
      analyser = null; ultimo = null; escuchas = [];
    },
    onNota(cb) { escuchas.push(cb); },

    /* Graba 'segundos' y devuelve las notas detectadas con su tiempo desde t=0. */
    grabar({ segundos, alOnset, alNivel } = {}) {
      return new Promise(resolve => {
        const t0 = performance.now(), salida = [];
        const cb = n => {
          const nota = { ...n, t_ms: n.t_ms - t0 };
          salida.push(nota);
          if (alOnset) alOnset(nota);
        };
        escuchas.push(cb);
        const medidor = alNivel ? setInterval(() => alNivel(rmsAct), 80) : null;
        setTimeout(() => {
          escuchas = escuchas.filter(f => f !== cb);
          if (medidor) clearInterval(medidor);
          resolve(salida);
        }, segundos * 1000);
      });
    },

    /* Función PURA: compara lo esperado con lo tocado. */
    calificar(esperadas, detectadas, opciones = {}) {
      const { bpm = 80, beatsPorCompas = 4, toleranciaCents = 50, toleranciaMs = 120, offsetMs = 0 } = opciones;
      const beatMs = 60000 / bpm;
      const objetivo = (esperadas || []).filter(n => !n.rest).map(n => ({
        ...n,
        t: ((n.bar - 1) * beatsPorCompas + (n.beat - 1)) * beatMs + offsetMs,
      }));
      const usadas = new Set();
      const detalle = objetivo.map(e => {
        let mejor = -1, dist = 351;
        (detectadas || []).forEach((d, i) => {
          if (usadas.has(i)) return;
          const dt = Math.abs(d.t_ms - e.t);
          if (dt < dist) { dist = dt; mejor = i; }
        });
        const tocada = mejor >= 0 ? detectadas[mejor] : null;
        if (mejor >= 0) usadas.add(mejor);
        const deltaMs = tocada ? Math.round(tocada.t_ms - e.t) : null;
        const timingOK = !!tocada && Math.abs(deltaMs) <= toleranciaMs;
        const pitchOK = e.dead ? timingOK
          : !!tocada && tocada.midi === e.midi && Math.abs(tocada.cents || 0) <= toleranciaCents;
        return { esperada: e, tocada, pitchOK, timingOK, deltaMs, cents: tocada ? tocada.cents : null };
      });
      const total = detalle.length || 1;
      const suma = detalle.reduce((a, d) => a + 0.7 * (d.pitchOK ? 1 : 0) + 0.3 * (d.timingOK ? 1 : 0), 0);
      return {
        pct: Math.round((suma / total) * 100),
        aciertos: detalle.filter(d => d.pitchOK && d.timingOK).length,
        total: detalle.length,
        detalle,
      };
    },

    /* Afinador cromático dentro de 'cont'. */
    async afinador(cont, alSalir) {
      cont.innerHTML = `<div class="card"><div id="af-msg" class="dim">Pidiendo permiso del micrófono…</div></div>`;
      try { await this.iniciar(); } catch (e) {
        cont.innerHTML = `<div class="notice">🎤 ${esc(e.message)}</div>
          <button class="btn full" id="af-out">Volver</button>`;
        cont.querySelector('#af-out').onclick = alSalir;
        return;
      }
      cont.innerHTML = `
        <div class="card" style="text-align:center">
          <div id="af-nota" style="font-size:64px;font-weight:800;line-height:1.1">–</div>
          <div id="af-cuerda" class="dim">toca una cuerda</div>
          <div style="position:relative;height:26px;margin:16px 0 6px;background:var(--panel-2);border-radius:99px">
            <div style="position:absolute;left:50%;top:0;bottom:0;width:2px;background:var(--txt-dim)"></div>
            <div id="af-aguja" style="position:absolute;left:50%;top:3px;bottom:3px;width:10px;
                 margin-left:-5px;border-radius:99px;background:var(--accent);transition:left .08s"></div>
          </div>
          <div class="dim small"><span>−50</span> · afinado · <span>+50 cents</span></div>
          <div id="af-cents" class="small" style="margin-top:6px">&nbsp;</div>
        </div>
        <div class="dim small">Afinación estándar: E · A · D · G. Verde = afinado (±5 cents).</div>
        <button class="btn full ghost" id="af-out" style="margin-top:12px">Cerrar afinador</button>`;
      cont.querySelector('#af-out').onclick = () => { this.detener(); alSalir(); };
      const refrescar = setInterval(() => {
        if (!document.body.contains(cont)) { clearInterval(refrescar); this.detener(); return; }
        const p = ultimo;
        const $n = cont.querySelector('#af-nota'), $c = cont.querySelector('#af-cuerda');
        const $a = cont.querySelector('#af-aguja'), $ct = cont.querySelector('#af-cents');
        if (!p) { $n.textContent = '–'; $c.textContent = 'toca una cuerda'; $ct.innerHTML = '&nbsp;'; return; }
        const cuerda = CUERDAS.reduce((a, b) => Math.abs(b.midi - p.midi) < Math.abs(a.midi - p.midi) ? b : a);
        const afinado = Math.abs(p.cents) <= 5;
        $n.textContent = p.nombre.replace(/\d/, '');
        $n.style.color = afinado ? 'var(--ok)' : 'var(--txt)';
        $c.textContent = `cuerda ${cuerda.n} · ${p.nombre} · ${Math.round(p.freq)} Hz`;
        $a.style.left = `calc(50% + ${Math.max(-50, Math.min(50, p.cents)) * 0.9}%)`;
        $a.style.background = afinado ? 'var(--ok)' : 'var(--accent)';
        $ct.textContent = afinado ? '✓ afinada' : (p.cents > 0 ? `${p.cents} cents ALTA — afloja` : `${p.cents} cents BAJA — tensa`);
        $ct.style.color = afinado ? 'var(--ok)' : 'var(--txt-dim)';
      }, 90);
    },
  };
})();

/* exponer como global de ventana (const no lo hace solo) */
window.Pitch = Pitch;
