/* Modo Ensayo — biblioteca de canciones (tabs/acordes pegados) con autoscroll.
   Esqueleto: alta + vista + autoscroll. Transposición por tap = fase 2. */
const canciones = {
  todas: () => store.get('canciones', []),
  guardar(lista) { store.set('canciones', lista); },
  agregar(c) { const l = this.todas(); l.push(c); this.guardar(l); Sync.push(); },
  por(id) { return this.todas().find(c => c.id === id); },
  borrar(id) { this.guardar(this.todas().filter(c => c.id !== id)); Sync.borrarCancion(id); },
};

App.route(/^#\/ensayo$/, async view => {
  await Sync.pull();
  const lista = canciones.todas();
  view.innerHTML = `
    <h1>Ensayo</h1>
    <button class="btn full" id="add-song">+ Agregar canción (pegar tab/acordes)</button>
    <div style="display:flex;gap:8px;margin-top:8px">
      <button class="btn mini ghost" id="lib-export" style="flex:1">⬇ Exportar biblioteca</button>
      <button class="btn mini ghost" id="lib-import" style="flex:1">⬆ Importar</button>
    </div>
    <div id="sync-row"></div>
    <div id="lib-io" style="display:none;margin-top:10px">
      <textarea id="lib-io-text" placeholder="Pega aquí lo exportado en el otro dispositivo…"></textarea>
      <div style="display:flex;gap:8px">
        <button class="btn mini" id="lib-io-copy" style="flex:1">Copiar todo</button>
        <button class="btn mini" id="lib-io-apply" style="flex:1">Importar esto</button>
      </div>
      <p class="dim small" style="margin-top:6px">Exporta en la compu → cópialo → mándatelo (WhatsApp/Notas) → pégalo aquí en el teléfono → Importar. Une sin duplicar.</p>
    </div>
    <div id="song-form" style="display:none; margin-top:14px">
      <input type="text" id="sf-titulo" placeholder="Título">
      <input type="text" id="sf-artista" placeholder="Artista (opcional)">
      <textarea id="sf-cuerpo" placeholder="Pega aquí la letra con acordes o el tab…"></textarea>
      <button class="btn full" id="sf-guardar">Guardar</button>
    </div>
    <div style="margin-top:14px" id="song-list"></div>`;
  const porArtista = {};
  lista.forEach(c => {
    const a = (c.artista || '').trim() || 'Sin artista';
    (porArtista[a] = porArtista[a] || []).push(c);
  });
  $('#song-list').innerHTML = lista.length === 0
    ? '<p class="dim">Tu biblioteca está vacía. Agrega la primera canción para el ensayo.</p>'
    : Object.keys(porArtista).sort((x, y) => x.localeCompare(y, 'es')).map(a => `
        <h2>${esc(a)} <span class="dim small">· ${porArtista[a].length}</span></h2>
        ${porArtista[a].sort((x, y) => x.titulo.localeCompare(y.titulo, 'es'))
          .map(c => `<a class="card" href="#/cancion/${c.id}"><h3>${esc(c.titulo)}</h3></a>`).join('')}
      `).join('');
  Sync.pintarBarra($('#sync-row'), () => App.render());
  $('#add-song').onclick = () => { $('#song-form').style.display = 'block'; $('#sf-titulo').focus(); };
  $('#lib-export').onclick = () => {
    $('#lib-io').style.display = 'block';
    $('#lib-io-text').value = JSON.stringify(
      { canciones: canciones.todas(), setlists: store.get('setlists', []) });
  };
  $('#lib-import').onclick = () => { $('#lib-io').style.display = 'block'; $('#lib-io-text').value = ''; $('#lib-io-text').focus(); };
  $('#lib-io-copy').onclick = async () => {
    $('#lib-io-text').select();
    try { await navigator.clipboard.writeText($('#lib-io-text').value); $('#lib-io-copy').textContent = '✓ Copiado'; }
    catch { document.execCommand('copy'); $('#lib-io-copy').textContent = '✓ Copiado'; }
  };
  $('#lib-io-apply').onclick = () => {
    try {
      const d = JSON.parse($('#lib-io-text').value);
      const mias = canciones.todas();
      const ids = new Set(mias.map(c => c.id));
      (d.canciones || []).forEach(c => { if (c.id && c.titulo && !ids.has(c.id)) mias.push(c); });
      canciones.guardar(mias);
      const sls = store.get('setlists', []);
      const slIds = new Set(sls.map(s => s.id));
      (d.setlists || []).forEach(s => { if (s.id && !slIds.has(s.id)) sls.push(s); });
      store.set('setlists', sls);
      App.render();
    } catch { alert('Eso no parece un export válido. Copia TODO el texto exportado y pégalo completo.'); }
  };
  $('#sf-guardar').onclick = () => {
    const titulo = $('#sf-titulo').value.trim();
    const cuerpo = $('#sf-cuerpo').value;
    if (!titulo || !cuerpo.trim()) return;
    canciones.agregar({ id: Date.now().toString(36), titulo, artista: $('#sf-artista').value.trim(), cuerpo });
    App.render();
  };
});

App.route(/^#\/cancion\/(\w+)$/, (view, id) => {
  const c = canciones.por(id);
  if (!c) { location.hash = '#/ensayo'; return; }
  view.innerHTML = `
    <a class="dim small" href="#/ensayo" id="song-back">← Regresar</a>
    <div class="row" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h1 style="margin:6px 0">${esc(c.titulo)}</h1>
      <button class="btn mini ghost" id="song-del">🗑</button>
    </div>
    ${c.artista ? `<div class="dim" style="margin-bottom:10px">${esc(c.artista)}</div>` : ''}
    <div class="song-body" id="song-body" style="font-size:${store.get('song_fs', 15)}px">${esc(c.cuerpo)}</div>
    <div style="height:70px"></div>
    <div class="scroll-ctl">
      <button class="btn mini ghost" id="fs-menos">A−</button>
      <button class="btn mini ghost" id="fs-mas">A+</button>
      <button class="btn mini" id="sc-play">▶ Auto</button>
      <input type="range" id="sc-speed" min="10" max="120" value="40" title="Velocidad">
    </div>`;
  const ajustaFS = d => {
    const fs = Math.min(19, Math.max(11, store.get('song_fs', 15) + d));
    store.set('song_fs', fs);
    $('#song-body').style.fontSize = fs + 'px';
  };
  $('#fs-menos').onclick = () => ajustaFS(-1);
  $('#fs-mas').onclick = () => ajustaFS(1);
  $('#song-back').onclick = e => {
    e.preventDefault();
    if (history.length > 1) history.back(); else location.hash = '#/ensayo';
  };
  $('#song-del').onclick = () => { if (confirm('¿Borrar esta canción?')) { canciones.borrar(id); location.hash = '#/ensayo'; } };
  let timer = null;
  $('#sc-play').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('#sc-play').textContent = '▶ Autoscroll'; return; }
    $('#sc-play').textContent = '⏸ Pausa';
    timer = setInterval(() => $('#view').scrollBy(0, 1), 1000 / (+$('#sc-speed').value / 10));
  };
});
