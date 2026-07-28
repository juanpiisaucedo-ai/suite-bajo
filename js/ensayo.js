/* Modo Ensayo — biblioteca de canciones (tabs/acordes pegados) con autoscroll.
   Esqueleto: alta + vista + autoscroll. Transposición por tap = fase 2. */
const canciones = {
  todas: () => store.get('canciones', []),
  guardar(lista) { store.set('canciones', lista); },
  agregar(c) { const l = this.todas(); l.push(c); this.guardar(l); },
  por(id) { return this.todas().find(c => c.id === id); },
  borrar(id) { this.guardar(this.todas().filter(c => c.id !== id)); },
};

App.route(/^#\/ensayo$/, view => {
  const lista = canciones.todas();
  view.innerHTML = `
    <h1>Ensayo</h1>
    <button class="btn full" id="add-song">+ Agregar canción (pegar tab/acordes)</button>
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
  $('#add-song').onclick = () => { $('#song-form').style.display = 'block'; $('#sf-titulo').focus(); };
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
    <a class="dim small" href="#/ensayo">← Biblioteca</a>
    <div class="row" style="display:flex;justify-content:space-between;align-items:center;gap:10px">
      <h1 style="margin:6px 0">${esc(c.titulo)}</h1>
      <button class="btn mini ghost" id="song-del">🗑</button>
    </div>
    ${c.artista ? `<div class="dim" style="margin-bottom:10px">${esc(c.artista)}</div>` : ''}
    <div class="notice">Transposición por tap: fase 2 (junto con acordes detectados).</div>
    <div class="song-body" id="song-body">${esc(c.cuerpo)}</div>
    <div style="height:70px"></div>
    <div class="scroll-ctl">
      <button class="btn mini" id="sc-play">▶ Autoscroll</button>
      <input type="range" id="sc-speed" min="10" max="120" value="40" title="Velocidad">
    </div>`;
  $('#song-del').onclick = () => { if (confirm('¿Borrar esta canción?')) { canciones.borrar(id); location.hash = '#/ensayo'; } };
  let timer = null;
  $('#sc-play').onclick = () => {
    if (timer) { clearInterval(timer); timer = null; $('#sc-play').textContent = '▶ Autoscroll'; return; }
    $('#sc-play').textContent = '⏸ Pausa';
    timer = setInterval(() => $('#view').scrollBy(0, 1), 1000 / (+$('#sc-speed').value / 10));
  };
});
