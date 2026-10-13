# Suite Bajo

Aplicación web para estudiar bajo eléctrico: detección de tono en tiempo real desde el
micrófono, síntesis de audio en el navegador, sincronización en vivo entre dispositivos y
funcionamiento completo sin conexión.

**En línea:** https://suite-bajo.vercel.app · **Autor:** Juan Pablo Saucedo Limón

Proyecto personal, escrito desde cero. ~2,300 líneas de JavaScript propio, sin framework y
sin paso de compilación, más una cadena de generación de contenido en Python.

---

## Lo que tiene de interesante

**Detección de tono (`js/pitch.js`)** — Algoritmo YIN sobre la señal decimada de 44.1 kHz a
~11 kHz, con ventana de 4096 muestras (~93 ms, suficiente para 3 o 4 periodos del mi grave de
41 Hz). Verificado contra tonos sintéticos conocidos: **±0.3 cents entre 41 y 196 Hz**, que es
el rango donde la detección de tono suele fallar.

La decisión que más costó: **el tiempo y la altura se miden por separado.** El ataque se detecta
por energía, que es casi instantáneo; la altura se mide 70 ms después, cuando la nota grave ya
se estabilizó. Si se toman juntos, el *timing* hereda la latencia del detector de tono y la
calificación rítmica queda inservible. Van separados a propósito.

**Síntesis y audio (`js/audio.js`, `js/segunda.js`)** — Sintetizador de bajo y metrónomo en Web
Audio, pistas de acompañamiento generadas (batería y armonía, sin bajo, en estilos rock, shuffle
y funk), timbre de voz con formantes, e importación de MIDI para obtener notas y ritmo exactos
sin pasar por detección.

**Sincronización en vivo (`js/show.js`)** — Durante un ensayo o una tocada, un teléfono
transmite la canción actual con un código de cuatro letras y el resto de la banda la sigue
**sin necesidad de crear cuenta**. Transporte por Realtime de Postgres con respaldo por sondeo
cada 5 segundos, porque en un escenario la conexión se cae y el respaldo tiene que ser aburrido
y confiable, no elegante.

**Offline primero (`sw.js`)** — Service worker con precarga del armazón y caché de las lecciones
al visitarlas. Instalable como aplicación. El caso de uso lo exige: se estudia y se toca en
lugares sin señal.

**Motor pedagógico (`js/entrenar.js`, `js/oido.js`)** — 16 lecciones con teoría progresiva y 57
puntos de control, exámenes que mezclan preguntas de texto con preguntas **auditivas** sobre
clips sintetizados al vuelo, y repaso espaciado con cajas de Leitner a 1, 3, 7 y 14 días.

**Generación de contenido (Python)** — Una sola fuente produce tablatura, pentagrama en clave de
Fa, audio y JSON, todos consistentes entre sí. Escribir 48 ejercicios a mano en cuatro formatos
distintos habría garantizado que se desincronizaran.

---

## Decisiones de arquitectura

**Sin framework y sin build.** La aplicación se sirve como archivos estáticos y arranca con
`python3 -m http.server`. Para una PWA que debe funcionar sin conexión y cargar rápido en
teléfonos modestos, una cadena de compilación habría sumado complejidad sin resolver ningún
problema que yo tuviera. Fue una decisión, no una limitación.

**El progreso vive en el dispositivo.** Lecciones, rachas y repaso espaciado en `localStorage`.
La nube era para compartir, no para funcionar: sin red, todo sigue sirviendo.

**Dos transportes para el modo en vivo.** Realtime cuando hay internet; el plan para la fase
siguiente era un servidor local en el teléfono que transmite, para tocar sin gastar datos.

---

## Estado actual

Lo que funciona hoy en la versión publicada: las 16 lecciones completas, los ejercicios con
tablatura y pentagrama, el afinador, la calificación por micrófono, el entrenamiento auditivo,
las pistas de acompañamiento y todo el modo sin conexión.

**Lo que no:** el proyecto de base de datos que respaldaba la cuenta de usuario, la
sincronización y el modo en vivo **fue dado de baja** y esas funciones están fuera de servicio.
El código sigue en el repositorio porque documenta cómo estaba resuelto; para revivirlo hay que
crear un proyecto nuevo y actualizar las credenciales en `js/sync.js`.

Lo digo abiertamente en lugar de esconderlo: una demo que falla sin explicación es peor que una
limitación declarada.

---

## Construido con asistencia de IA, y lo que hubo que corregir

Buena parte del código se escribió con ayuda de modelos de lenguaje. Lo que no se puede delegar
es la verificación, y estos son los casos donde el código generado parecía correcto y no lo era:

- **La detección de tono fundía las notas repetidas.** El seguimiento de altura por sí solo no
  distingue dos notas iguales seguidas: ve una sola nota larga. Hubo que agregar detección de
  ataque por energía como señal independiente. El síntoma no era un error, era una calificación
  rítmica silenciosamente equivocada.
- **Precisión asumida contra precisión medida.** En vez de confiar en que el detector
  funcionaba, lo probé contra tonos generados de frecuencia conocida en todo el registro del
  bajo. Ahí apareció que el error crecía en las cuerdas graves y que la ventana de análisis
  necesitaba al menos tres periodos del mi de 41 Hz.
- **`const X = …` en un script clásico no crea `window.X`.** Código que se veía correcto fallaba
  al cargar entre módulos, porque la constante nunca llegaba al objeto global. Hay que asignarla
  explícitamente.
- **El timbre sonaba a consola de 8 bits.** Técnicamente la síntesis estaba bien; musicalmente
  era inservible. Se resolvió con formantes y duraciones ligadas. No todo defecto se manifiesta
  como un error en la consola.

---

## Correr en local

```bash
python3 -m http.server 3000
```

Abrir `http://localhost:3000`. No funciona con `file://` porque las lecciones se cargan con
`fetch()`. Para probar desde el teléfono en la misma red, usar la IP de la computadora; la
instalación y el modo sin conexión requieren `https` o `localhost`.

## Mapa del repositorio

| Archivo | Qué resuelve |
|---|---|
| `js/pitch.js` | YIN, detección de ataque, calificación de ejecución |
| `js/segunda.js` | Importación de MIDI, síntesis de voz con formantes |
| `js/entrenar.js` | Lecciones, exámenes, desbloqueo, repaso espaciado |
| `js/show.js` | Setlists y transmisión en vivo con código de sala |
| `js/oido.js` | Entrenamiento auditivo con preguntas generadas al vuelo |
| `js/audio.js` | Sintetizador de bajo y metrónomo en Web Audio |
| `js/ensayo.js` | Biblioteca de canciones con desplazamiento automático |
| `js/sync.js` | Autenticación y sincronización en la nube (fuera de servicio) |
| `sw.js` | Service worker, caché y funcionamiento sin conexión |

## Contenido y derechos

La teoría de las lecciones está **redactada desde cero**. El temario se guió por tres métodos de
bajo reconocidos, pero no se copió ni se reprodujo texto de ninguno. El audio, las tablaturas y
los pentagramas son generados por la cadena en Python de este proyecto.
