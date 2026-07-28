/* Suite Bajo — núcleo: router por hash, storage y racha de práctica. */
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const store = {
  get(k, def) {
    try { const v = localStorage.getItem('sb_' + k); return v === null ? def : JSON.parse(v); }
    catch { return def; }
  },
  set(k, v) { localStorage.setItem('sb_' + k, JSON.stringify(v)); },
};

/* ---------- racha de práctica ---------- */
function hoyYMD() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function marcarPracticaHoy() {
  const dias = store.get('practica_dias', []);
  if (!dias.includes(hoyYMD())) { dias.push(hoyYMD()); store.set('practica_dias', dias); }
  pintarRacha();
}
function rachaActual() {
  const dias = new Set(store.get('practica_dias', []));
  let racha = 0;
  const d = new Date();
  if (!dias.has(hoyYMD())) d.setDate(d.getDate() - 1); // la racha sobrevive hasta que hoy termine
  for (;;) {
    const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!dias.has(ymd)) break;
    racha++; d.setDate(d.getDate() - 1);
  }
  return racha;
}
function pintarRacha() {
  const r = rachaActual();
  $('#streak').textContent = r > 0 ? `🔥 ${r}` : '';
}

/* ---------- router ---------- */
const App = {
  routes: [],
  route(re, fn) { this.routes.push([re, fn]); },
  async render() {
    window.onkeydown = null; // cada vista registra sus teclas (pedal bluetooth)
    const hash = location.hash || '#/entrenar';
    const tab = hash.split('/')[1] || 'entrenar';
    $$('#tabbar a').forEach(a => a.classList.toggle('active',
      tab.startsWith(a.dataset.tab) || (a.dataset.tab === 'entrenar' && tab === 'leccion')
      || (a.dataset.tab === 'ensayo' && tab === 'cancion')
      || (a.dataset.tab === 'show' && tab === 'setlist')));
    for (const [re, fn] of this.routes) {
      const m = hash.match(re);
      if (m) { await fn($('#view'), ...m.slice(1)); return; }
    }
    location.hash = '#/entrenar';
  },
  start() {
    window.addEventListener('hashchange', () => this.render());
    pintarRacha();
    this.render();
  },
};
