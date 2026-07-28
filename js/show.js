/* Modo Show — setlists para el escenario.
   Esqueleto: CRUD de setlists (canciones de la biblioteca) + vista en vivo local.
   Fase 2: sync en tiempo real (Supabase Realtime con internet · servidor local
   vía Capacitor cuando no hay señal — el líder sirve app y sync por su hotspot). */
const setlists = {
  todas: () => store.get('setlists', []),
  guardar(l) { store.set('setlists', l); Sync.push(); },
  por(id) { return this.todas().find(s => s.id === id); },
  actualizar(sl) { this.guardar(this.todas().map(s => s.id === sl.id ? sl : s)); },
};

App.route(/^#\/show$/, async view => {
  await Sync.pull();
  const lista = setlists.todas();
  view.innerHTML = `
    <h1>Show</h1>
    <div class="notice">🔗 Sync en vivo con la banda: <b>fase 2</b>. Con internet va por Supabase
    Realtime (KB por show); sin señal, el teléfono líder servirá la app y el sync por su hotspot
    (Capacitor). El esqueleto de setlists ya funciona offline.</div>
    <button class="btn full" id="sl-new">+ Nuevo setlist</button>
    <div style="margin-top:14px">
      ${lista.length === 0 ? '<p class="dim">Crea el setlist de tu próxima tocada.</p>'
      : lista.map(s => `<a class="card" href="#/setlist/${s.id}">
          <div class="row"><h3>${esc(s.nombre)}</h3><span class="badge">${s.songIds.length} canciones</span></div>
        </a>`).join('')}
    </div>`;
  $('#sl-new').onclick = () => {
    const nombre = prompt('Nombre del setlist (ej. "Boda Sáb 8pm"):');
    if (!nombre) return;
    const l = setlists.todas();
    l.push({ id: Date.now().toString(36), nombre: nombre.trim(), songIds: [], enVivo: 0 });
    setlists.guardar(l);
    App.render();
  };
});

App.route(/^#\/setlist\/(\w+)$/, (view, id) => {
  const sl = setlists.por(id);
  if (!sl) { location.hash = '#/show'; return; }
  const lib = canciones.todas();
  const enSet = sl.songIds.map(sid => lib.find(c => c.id === sid)).filter(Boolean);
  const fuera = lib.filter(c => !sl.songIds.includes(c.id));
  view.innerHTML = `
    <a class="dim small" href="#/show">← Setlists</a>
    <h1>${esc(sl.nombre)}</h1>
    ${enSet.length ? `<button class="btn full" id="sl-live">🎤 Modo en vivo</button>` : ''}
    <h2>Orden del show</h2>
    ${enSet.length === 0 ? '<p class="dim">Agrega canciones de tu biblioteca de Ensayo.</p>' : ''}
    ${enSet.map((c, i) => `<div class="card setlist-song">
      <span class="dim">${i + 1}.</span><span class="title">${esc(c.titulo)}</span>
      <button class="btn mini ghost" data-up="${i}">↑</button>
      <button class="btn mini ghost" data-out="${i}">✕</button>
    </div>`).join('')}
    <h2>Biblioteca</h2>
    ${fuera.length === 0 ? '<p class="dim small">No hay más canciones. Agrégalas en Ensayo.</p>' : ''}
    ${fuera.map(c => `<div class="card setlist-song">
      <span class="title">${esc(c.titulo)}</span>
      <button class="btn mini" data-in="${c.id}">+ al set</button>
    </div>`).join('')}`;
  $$('#view [data-in]').forEach(b => b.onclick = () => { sl.songIds.push(b.dataset.in); setlists.actualizar(sl); App.render(); });
  $$('#view [data-out]').forEach(b => b.onclick = () => { sl.songIds.splice(+b.dataset.out, 1); setlists.actualizar(sl); App.render(); });
  $$('#view [data-up]').forEach(b => b.onclick = () => {
    const i = +b.dataset.up;
    if (i > 0) { [sl.songIds[i - 1], sl.songIds[i]] = [sl.songIds[i], sl.songIds[i - 1]]; setlists.actualizar(sl); App.render(); }
  });
  const live = $('#sl-live');
  if (live) live.onclick = () => pintarEnVivo(view, sl);
});

function pintarEnVivo(view, sl) {
  const lib = canciones.todas();
  const lista = sl.songIds.map(sid => lib.find(c => c.id === sid)).filter(Boolean);
  let i = Math.min(sl.enVivo || 0, lista.length - 1);
  let timer = null;
  const paraScroll = () => { if (timer) { clearInterval(timer); timer = null; } };
  const pinta = () => {
    paraScroll();
    const actual = lista[i], sig = lista[i + 1];
    sl.enVivo = i; setlists.actualizar(sl);
    view.innerHTML = `
      <div class="live-head">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">
          <a class="dim small" href="#/setlist/${sl.id}" id="lv-exit">← Salir</a>
          <span class="dim small">${i + 1}/${lista.length}</span>
          <span class="dim small">${sig ? `Sigue: ${esc(sig.titulo)}` : 'Última 🏁'}</span>
        </div>
        <h1>${esc(actual.titulo)}</h1>
      </div>
      <div class="song-body" style="font-size:${store.get('song_fs', 15)}px">${esc(actual.cuerpo)}</div>
      <div style="height:70px"></div>
      <div class="scroll-ctl">
        <button class="btn mini ghost" id="lv-fsm">A−</button>
        <button class="btn mini ghost" id="lv-fsp">A+</button>
        <button class="btn mini ghost" id="lv-prev" ${i === 0 ? 'disabled' : ''}>⏮</button>
        <button class="btn mini" id="lv-play">▶</button>
        <input type="range" id="lv-speed" min="10" max="120" value="${store.get('scroll_v', 40)}">
        <button class="btn" id="lv-next" ${sig ? '' : 'disabled'} style="padding:8px 18px">${sig ? '⏭' : 'Fin'}</button>
      </div>`;
    $('#view').scrollTop = 0;
    window._cleanup = paraScroll; // al salir de la vista, muere el autoscroll
    $('#lv-exit').onclick = e => { e.preventDefault(); paraScroll(); App.render(); };
    const toggle = () => {
      if (timer) { paraScroll(); $('#lv-play').textContent = '▶'; }
      else {
        $('#lv-play').textContent = '⏸';
        timer = setInterval(() => $('#view').scrollBy(0, 1), 1000 / (+$('#lv-speed').value / 10));
      }
    };
    const ajustaFS = d => {
      const fs = Math.min(22, Math.max(9, store.get('song_fs', 15) + d));
      store.set('song_fs', fs);
      view.querySelector('.song-body').style.fontSize = fs + 'px';
    };
    $('#lv-fsm').onclick = () => ajustaFS(-1);
    $('#lv-fsp').onclick = () => ajustaFS(1);
    $('#lv-prev').onclick = () => { i--; pinta(); };
    $('#lv-next').onclick = () => { if (sig) { i++; pinta(); } };
    $('#lv-play').onclick = toggle;
    view.querySelector('.song-body').onclick = toggle; // tap en la letra = play/pausa
    $('#lv-speed').onchange = () => store.set('scroll_v', +$('#lv-speed').value);
    /* pedal bluetooth (manda teclas): ↓/AvPág scrollea · ↑/RePág regresa ·
       →/← cambia canción · espacio/enter = autoscroll on-off */
    window.onkeydown = e => {
      const k = e.key;
      if (['ArrowDown', 'PageDown'].includes(k)) { e.preventDefault(); $('#view').scrollBy({ top: innerHeight * 0.4, behavior: 'smooth' }); }
      else if (['ArrowUp', 'PageUp'].includes(k)) { e.preventDefault(); $('#view').scrollBy({ top: -innerHeight * 0.4, behavior: 'smooth' }); }
      else if (k === 'ArrowRight') { e.preventDefault(); if (sig) { i++; pinta(); } }
      else if (k === 'ArrowLeft') { e.preventDefault(); if (i > 0) { i--; pinta(); } }
      else if (k === ' ' || k === 'Enter') { e.preventDefault(); toggle(); }
    };
  };
  pinta();
}
