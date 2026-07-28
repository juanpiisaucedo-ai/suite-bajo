/* Sync con Supabase (proyecto personal): biblioteca de canciones + setlists.
   Nube manda; lo local que no exista en la nube se sube al conectar (merge).
   Sin sesión, todo sigue funcionando local (offline-first). */
const SB_URL = 'https://lyoxdvhrjzwuclwwwycv.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx5b3hkdmhyanp3dWNsd3d3eWN2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyMDY0NzIsImV4cCI6MjEwMDc4MjQ3Mn0.s5XALQ85IDBfcvANX_BZD_p0FMpAGZVD1dP65-OFjZY';

const Sync = (() => {
  let sb = null, pulled = false;
  try { sb = window.supabase.createClient(SB_URL, SB_KEY); } catch { /* offline sin vendor: modo local */ }

  const aCloudC = c => ({ id: c.id, titulo: c.titulo, artista: c.artista || '', cuerpo: c.cuerpo });
  const aCloudS = s => ({ id: s.id, nombre: s.nombre, song_ids: s.songIds || [], en_vivo: s.enVivo || 0 });

  return {
    disponible: () => !!sb,
    cliente: () => sb,
    async session() {
      if (!sb) return null;
      return (await sb.auth.getSession()).data.session;
    },
    async entrar(email, pass) {
      const { error } = await sb.auth.signInWithPassword({ email, password: pass });
      if (!error) pulled = false;
      return error ? error.message : null;
    },
    async crear(email, pass) {
      const { error } = await sb.auth.signUp({ email, password: pass });
      if (!error) pulled = false;
      return error ? error.message : null;
    },
    async salir() { await sb.auth.signOut(); pulled = false; },

    /* nube → local, subiendo antes lo local que la nube no tenga */
    async pull(force = false) {
      if (!sb || (pulled && !force)) return null;
      const ses = await this.session();
      if (!ses) return null;
      const { data: cs, error: e1 } = await sb.from('canciones').select('id,titulo,artista,cuerpo');
      if (e1) return e1.message;
      const { data: sls, error: e2 } = await sb.from('setlists').select('id,nombre,song_ids,en_vivo');
      if (e2) return e2.message;
      const localC = store.get('canciones', []);
      const nubeC = new Set(cs.map(c => c.id));
      const subirC = localC.filter(c => !nubeC.has(c.id));
      if (subirC.length) await sb.from('canciones').upsert(subirC.map(aCloudC));
      const localS = store.get('setlists', []);
      const nubeS = new Set(sls.map(s => s.id));
      const subirS = localS.filter(s => !nubeS.has(s.id));
      if (subirS.length) await sb.from('setlists').upsert(subirS.map(aCloudS));
      store.set('canciones', [
        ...cs.map(c => ({ id: c.id, titulo: c.titulo, artista: c.artista, cuerpo: c.cuerpo })),
        ...subirC]);
      store.set('setlists', [
        ...sls.map(s => ({ id: s.id, nombre: s.nombre, songIds: s.song_ids || [], enVivo: s.en_vivo || 0 })),
        ...subirS]);
      pulled = true;
      return null;
    },

    /* local → nube (tras cualquier cambio; silencioso) */
    push() {
      this.session().then(ses => {
        if (!ses) return;
        const cs = store.get('canciones', []);
        if (cs.length) sb.from('canciones').upsert(cs.map(aCloudC)).then(() => {});
        const sls = store.get('setlists', []);
        if (sls.length) sb.from('setlists').upsert(sls.map(aCloudS)).then(() => {});
      });
    },
    borrarCancion(id) {
      this.session().then(ses => { if (ses) sb.from('canciones').delete().eq('id', id).then(() => {}); });
    },

    /* barra de estado + login para Ensayo */
    async pintarBarra(cont, alCambiar) {
      if (!sb) { cont.innerHTML = ''; return; }
      const ses = await this.session();
      if (ses) {
        cont.innerHTML = `<div class="dim small" style="margin-top:8px">☁️ Sincronizado — ${esc(ses.user.email)}
          · <a href="#" id="sync-out" style="color:var(--accent)">salir</a></div>`;
        cont.querySelector('#sync-out').onclick = async e => { e.preventDefault(); await this.salir(); alCambiar(); };
        const err = await this.pull();
        if (err) cont.innerHTML += `<div class="dim small">⚠️ ${esc(err)}</div>`;
      } else {
        cont.innerHTML = `
          <button class="btn mini ghost" id="sync-open" style="width:100%;margin-top:8px">☁️ Activar sync entre dispositivos</button>
          <div id="sync-form" style="display:none;margin-top:8px">
            <input type="text" id="sy-email" placeholder="correo" autocapitalize="none">
            <input type="password" id="sy-pass" placeholder="contraseña (mín. 6)">
            <div style="display:flex;gap:8px">
              <button class="btn mini" id="sy-in" style="flex:1">Entrar</button>
              <button class="btn mini ghost" id="sy-up" style="flex:1">Crear cuenta</button>
            </div>
            <div class="dim small" id="sy-msg" style="margin-top:6px"></div>
          </div>`;
        cont.querySelector('#sync-open').onclick = () => cont.querySelector('#sync-form').style.display = 'block';
        const intento = async fn => {
          const err = await fn(cont.querySelector('#sy-email').value.trim(), cont.querySelector('#sy-pass').value);
          if (err) cont.querySelector('#sy-msg').textContent = '⚠️ ' + err;
          else alCambiar();
        };
        cont.querySelector('#sy-in').onclick = () => intento((e, p) => this.entrar(e, p));
        cont.querySelector('#sy-up').onclick = () => intento((e, p) => this.crear(e, p));
      }
    },
  };
})();

/* ---------- Show en vivo: líder transmite, la banda sigue por código ---------- */
const ShowVivo = (() => {
  const sb = () => Sync.cliente();
  let canal = null, poll = null;
  const CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return {
    codigoDe(slId) {
      let c = store.get(`show_code_${slId}`, null);
      if (!c) {
        c = Array.from({ length: 4 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
        store.set(`show_code_${slId}`, c);
      }
      return c;
    },
    async transmitir(codigo, nombre, cancionesLista, idx) {
      const cli = sb(); if (!cli) return 'sin conexión';
      const { error } = await cli.from('shows_en_vivo').upsert({
        codigo, nombre,
        canciones: cancionesLista.map(c => ({ titulo: c.titulo, cuerpo: c.cuerpo })),
        idx, updated_at: new Date().toISOString(),
      });
      return error ? error.message : null;
    },
    async avanzar(codigo, idx) {
      const cli = sb(); if (!cli) return;
      await cli.from('shows_en_vivo').update({ idx, updated_at: new Date().toISOString() }).eq('codigo', codigo);
    },
    async unirse(codigo) {
      const cli = sb(); if (!cli) return { error: 'sin conexión' };
      const { data, error } = await cli.from('shows_en_vivo').select('*').eq('codigo', codigo).single();
      return error ? { error: 'No encontré un show con ese código.' } : { show: data };
    },
    seguir(codigo, cb) {
      this.dejarDeSeguir();
      const cli = sb(); if (!cli) return;
      canal = cli.channel('show-' + codigo).on('postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'shows_en_vivo', filter: `codigo=eq.${codigo}` },
        p => cb(p.new)).subscribe();
      poll = setInterval(async () => { // respaldo por si el realtime se cae en el escenario
        const r = await this.unirse(codigo);
        if (r.show) cb(r.show);
      }, 5000);
    },
    dejarDeSeguir() {
      if (canal) { canal.unsubscribe(); canal = null; }
      if (poll) { clearInterval(poll); poll = null; }
    },
  };
})();
