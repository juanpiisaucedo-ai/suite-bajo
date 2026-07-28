# Suite Bajo

PWA para bajistas con 3 modos (spec: `Suite_Bajo_App_Especificacion.md` en Obsidian):

- **🎓 Entrenar** — las 14 lecciones del Super-Book Trainer. **Funcional.**
  - Teoría PROGRESIVA: "💡 En corto" por sección + checkpoint (contestas para seguir).
  - Quiz mixto: 5 de texto + 2-3 AUDITIVAS (🎧 clips sintetizados: ¿mayor o menor?, etc.).
  - 3 ejercicios por lección (base → aplicación → reto) con tab + audio.
  - REPASO ESPACIADO: al superar una lección (≥80%), sus preguntas entran a cajas de
    Leitner (1·3·7·14 días); la lista muestra "🔁 Repaso de hoy" con las vencidas.
  - Desbloqueo secuencial + racha diaria 🔥.
- **📖 Ensayo** — biblioteca de canciones (pegar tab/acordes) con autoscroll. **Esqueleto**
  (transposición por tap: fase 2).
- **🎤 Show** — setlists armados desde la biblioteca + modo en vivo (canción actual/siguiente).
  **Esqueleto** (sync con la banda: fase 2).

## Stack

Vanilla JS + hash router, sin build. `localStorage` para progreso/canciones/setlists.
Service worker: app shell precacheada y lecciones en caché al visitarlas (offline-first).
Instalable como PWA (manifest + íconos).

## Correr local (SIN tocar cuentas del trabajo)

```
python3 -m http.server 3000
```

- En la Mac: http://localhost:3000 (PWA completa, incluido offline/instalación).
- En el teléfono (misma WiFi): http://IP-de-la-Mac:3000 — todo funciona para probar;
  instalar/offline no (eso requiere https o localhost; llega con el deploy real).
- `file://` no funciona por los `fetch()` de lecciones.

⚠️ **NO usar `vercel dev` ni `vercel deploy` aquí todavía**: el CLI de esta Mac está
logueado con la cuenta del TRABAJO (soporte-9191). Este proyecto es personal: se
desplegará conectando un GitHub personal a un Vercel personal (por dashboard, no CLI).
Supabase tampoco se usa aún (todo es localStorage); en fase 2 será un proyecto en
cuenta personal.

## Contenido

`lessons/` se copia desde la fuente en Obsidian
(`~/Documents/UCNL/1ER TETRAMESTRE/suite_bajo_lecciones/`). Si regeneras lecciones con
`tools/build_all.py` (allá), re-copia las carpetas `lesson_*` + regenera `lessons/index.json`.

## Fase 2 (plan)

1. **Sync del Modo Show** — dos transportes sobre el mismo protocolo de mensajes:
   - con internet: Supabase Realtime (KB por show; un teléfono comparte hotspot);
   - sin señal: envolver con **Capacitor** y correr servidor local en el teléfono líder
     (sirve la app + WebSocket por su hotspot; los demás abren su IP en el navegador).
2. **Backing tracks** por lección (batería + armonía sin bajo) — generables con el motor Python.
3. **Detección de pitch** (Web Audio + YIN) para calificar ejercicios con `exercise.data.notes`.
4. Transposición por tap en Ensayo; más ejercicios por lección; rutinas Bass Fitness 5-10.
