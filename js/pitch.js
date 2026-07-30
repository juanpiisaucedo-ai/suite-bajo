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
  let fuente = null, filtro = null, ctxPropio = false;
  let ultimo = null, rmsAct = 0, corriendo = false, techo = 400;
  let escuchas = [];          // callbacks de onset

  /* --- YIN sobre x (ya decimada), devuelve frecuencia o 0 --- */
  function yin(x, sr, fMin = 35, fMax = techo) {
    const N = x.length;
    const tauMin = Math.max(2, Math.floor(sr / fMax));
    const tauMax = Math.min(N - 2, Math.ceil(sr / fMin));
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
      if (dp[mejor] > 0.5) return { f: 0, cl: 1 };   // demasiado sucio: no hay nota
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
    return { f: sr / (tau + ajuste), cl: dp[tau] };
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
    const { f } = yin(x, ctx.sampleRate / DEC);
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
      /* Reusar el contexto de SBAudio: en iOS abrir uno aparte para el micrófono
         deja mudo al de reproducción cuando se cierra. */
      if (window.SBAudio) { ctx = await SBAudio.listo(); SBAudio.modoGrabar(); ctxPropio = false; }
      else { ctx = new (window.AudioContext || window.webkitAudioContext)(); ctxPropio = true; }
      if (ctx.state === 'suspended') await ctx.resume();
      fuente = ctx.createMediaStreamSource(stream);
      filtro = ctx.createBiquadFilter();        // deja pasar solo el rango útil:
      filtro.type = 'lowpass'; filtro.frequency.value = agudo ? 1100 : 500; filtro.Q.value = 0.7;
      analyser = ctx.createAnalyser();
      analyser.fftSize = VENTANA;
      cruda = new Float32Array(analyser.fftSize);
      fuente.connect(filtro); filtro.connect(analyser);
      corriendo = true;
      bucle();
    },
    detener() {
      corriendo = false;
      if (timer) { clearInterval(timer); timer = null; }
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      try { if (fuente) fuente.disconnect(); if (filtro) filtro.disconnect(); } catch {}
      if (ctxPropio && ctx) { try { ctx.close(); } catch {} }   // el compartido NO se cierra
      try { if (window.SBAudio) SBAudio.modoReproducir(); } catch {}   // salida de vuelta a la bocina
      ctx = null; fuente = null; filtro = null;
      analyser = null; ultimo = null; escuchas = [];
    },
    onNota(cb) { escuchas.push(cb); },

    /* ANÁLISIS OFFLINE de una pista de voz aislada.
       Dos fuentes de información, porque ninguna basta sola:
       · la ALTURA dice qué nota es (pero liga las sílabas seguidas en la misma nota),
       · los ATAQUES (sílabas: las consonantes cortan la energía) dicen cuándo entra
         cada nota aunque la altura no cambie.
       Además hay que corregir octavas (la voz engaña al detector con sus armónicos)
       y aplanar el vibrato para no picar las notas. */
    analizarBuffer(datos, sampleRate, opciones = {}) {
      const { minDurMs = 100, hopMs = 20, umbralRms = 0.006, claridadMax = 0.45,
              fMin = 80, fMax = 500, tolerancia = 0.7 } = opciones;
      const DECF = Math.max(1, Math.round(sampleRate / 11025));
      const sr = sampleRate / DECF;
      const N = 1024, hop = Math.max(64, Math.round(sr * hopMs / 1000));
      const x = new Float32Array(Math.floor(datos.length / DECF));
      for (let i = 0; i < x.length; i++) {
        let s = 0;
        for (let k = 0; k < DECF; k++) s += datos[i * DECF + k] || 0;
        x[i] = s / DECF;
      }
      /* 1) contorno de altura + energía marco a marco */
      const cont = [], rmsArr = [], win = new Float32Array(N);
      for (let p = 0; p + N < x.length; p += hop) {
        let rms = 0;
        for (let i = 0; i < N; i++) { win[i] = x[p + i]; rms += win[i] * win[i]; }
        rms = Math.sqrt(rms / N);
        rmsArr.push(rms);
        let m = null;
        if (rms >= umbralRms) {
          const { f, cl } = yin(win, sr, fMin, fMax);
          if (f >= fMin && f <= fMax && cl < claridadMax) m = 69 + 12 * Math.log2(f / 440);
        }
        cont.push(m);
      }
      const dt = hop / sr;
      const mediana = a => { const v = a.filter(z => z != null).sort((p, q) => p - q);
        return v.length ? v[Math.floor(v.length / 2)] : null; };

      /* 2) ATAQUES: subidas de energía = sílaba nueva (aunque la nota sea la misma) */
      const refract = Math.max(3, Math.round(0.11 / dt));
      const ataques = new Set();
      let ultA = -99;
      for (let i = 2; i < rmsArr.length - 1; i++) {
        const prev = Math.max(rmsArr[i - 1], rmsArr[i - 2]) + 1e-9;
        if (rmsArr[i] > umbralRms * 1.6 && rmsArr[i] / prev > 1.45 && i - ultA >= refract) {
          ataques.add(i); ultA = i;
        }
      }

      /* 3) corregir octavas: contra el centro global y luego el local */
      const centro = mediana(cont);
      if (centro == null) return [];
      const ajusta = (m, ref) => {
        while (m - ref > 6) m -= 12;
        while (ref - m > 6) m += 12;
        return m;
      };
      const c1 = cont.map(m => (m == null ? null : ajusta(m, centro)));
      const vent = Math.max(3, Math.round(0.75 / dt));
      const c2 = c1.map((m, i) => {
        if (m == null) return null;
        const loc = mediana(c1.slice(Math.max(0, i - vent), i + vent));
        return loc == null ? m : ajusta(m, loc);
      });
      /* 4) mediana móvil: aplana el vibrato sin borrar los saltos reales */
      const suave = c2.map((m, i) => (m == null ? null : mediana(c2.slice(Math.max(0, i - 3), i + 4))));

      /* 5) segmentar: corta por ataque, por cambio de altura sostenido o por silencio */
      const notas = [];
      let act = null, fuera = 0, huecos = 0;
      const cerrar = fin => {
        if (act && (fin - act.ini) * 1000 >= minDurMs) {
          const prom = act.suma / act.n;
          notas.push({ t: +act.ini.toFixed(3), dur: +(fin - act.ini).toFixed(3),
                       midi: Math.round(prom), cents: Math.round((prom - Math.round(prom)) * 100) });
        }
        act = null;
      };
      suave.forEach((m, i) => {
        const t = i * dt;
        if (m == null) {
          if (act && ++huecos >= 5) cerrar(t - 5 * dt);
          return;
        }
        huecos = 0;
        if (act && ataques.has(i) && (t - act.ini) * 1000 >= minDurMs) {
          cerrar(t);                                  // sílaba nueva sobre la misma nota
          act = { ini: t, suma: m, n: 1, centro: m }; fuera = 0;
          return;
        }
        if (!act) { act = { ini: t, suma: m, n: 1, centro: m }; fuera = 0; return; }
        if (Math.abs(m - act.centro) <= tolerancia) {
          act.suma += m; act.n++; act.centro = act.suma / act.n; fuera = 0;
        } else if (++fuera >= 4) {
          cerrar(t - 4 * dt);
          act = { ini: t - 4 * dt, suma: m, n: 1, centro: m };
          fuera = 0;
        }
      });
      cerrar(suave.length * dt);

      /* 6) quitar notas muy cortas y aisladas: son el deslizamiento entre dos notas,
            no una nota cantada (si la altura no coincide con ningún vecino, es basura) */
      const limpias = notas.filter((n, i) => {
        if (n.dur >= 0.16) return true;
        const a = notas[i - 1], b = notas[i + 1];
        return (a && a.midi === n.midi) || (b && b.midi === n.midi);
      });
      notas.length = 0;
      notas.push(...limpias);

      /* 7) estirar cada nota hasta la siguiente (cantando se liga), salvo pausa real */
      const PAUSA_REAL = 0.35;
      notas.forEach((n, i) => {
        const sig = notas[i + 1];
        if (!sig) { n.dur = +(n.dur + 0.2).toFixed(3); return; }
        const hueco = sig.t - (n.t + n.dur);
        if (hueco > 0 && hueco < PAUSA_REAL) n.dur = +(sig.t - n.t - 0.02).toFixed(3);
      });
      return notas;
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
