# Motor Blueprint

**Ver en vivo:** https://overrid3cl.github.io/motor-blueprint/

Plano tecnico animado de un motor de **4 cilindros en linea DOHC 16V** (1998 cc, 86.0 x 86.0 mm),
dibujado como un plano de ingenieria: fondo azul noche, rejilla, aristas luminosas cian sobre
superficies translucidas, cotas, ejes discontinuos, etiquetas y cajetin tecnico.

Dos modos:

- **Secuencia de montaje**: 15 pasos, del bloque a la tapa de balancines, con vista explosionada.
- **Motor en marcha**: cinematica real de ciguenal, bielas, pistones, arboles de levas y valvulas,
  con regimen ajustable de 600 a 7000 rpm.

Proyecto web puro: HTML + CSS + JavaScript (modulos ES). Sin build, sin bundler, sin npm.

---

## Como se abre

Los modulos ES **no funcionan abriendo el fichero con doble clic** (`file://` bloquea los imports).
Hace falta un servidor local. Tres opciones, de mas comoda a menos:

1. **Doble clic en `iniciar.bat`** (Windows). Abre el navegador en `http://localhost:8123` y levanta
   el servidor probando, en este orden, `py`, `python` y `npx serve`.
2. **Python a mano**, desde esta carpeta:
   ```
   py -m http.server 8123
   ```
   o bien `python -m http.server 8123`.
3. **Node a mano**, desde esta carpeta:
   ```
   npx --yes serve -l 8123 .
   ```

Luego abre `http://localhost:8123` en el navegador.
Para detener el servidor: `Ctrl + C` en la ventana de consola.

> **Conexion a internet**: `three.js` (version fijada **r0.169.0**) se carga desde el CDN
> `cdn.jsdelivr.net` mediante un *importmap*, y la tipografia mono desde Google Fonts.
> La primera carga necesita red; despues suele quedar en la cache del navegador.
> Si no hay red, el plano no se dibuja (se vera el mensaje de error) pero la interfaz si carga,
> con la tipografia de respaldo del sistema.

Navegadores: cualquiera moderno con soporte de *import maps* y WebGL
(Chrome / Edge 89+, Firefox 108+, Safari 16.4+).

---

## Controles

### Barra inferior (transporte)

| Control | Que hace |
| --- | --- |
| Montar / Pausa | Reproduce o detiene la animacion de ensamblado |
| Reiniciar | Vuelve al paso 0, con el motor desmontado |
| Anterior / Siguiente | Salta al paso previo o al siguiente |
| Barra de scrub | Arrastra el montaje completo, de 0 % a 100 % |
| PASO 04/15 | Paso activo y nombre del paso |
| 0.5x / 1x / 2x | Velocidad de la animacion |

### Panel derecho

- **Secuencia de montaje**: los 15 pasos. El activo se resalta en ambar, los ya montados llevan
  un check y los pendientes quedan atenuados. Se puede hacer clic en cualquier paso para saltar a el.
- **Despiece por conjunto**: todas las piezas agrupadas por modulo. Al hacer clic se selecciona la
  pieza, se muestra su descripcion y se salta a su paso de montaje.
- **Pieza seleccionada**: nombre y descripcion corta de la ultima pieza elegida.

### Panel izquierdo

- **Cajetin**: datos tecnicos del motor, escala, revision, fecha y estado del visor.
- **Motor en marcha**: interruptor ON/OFF y regimen (600 .. 7000 rpm).
- **Vista**: ISO, Frontal, Lateral, Superior y Detalle.
- **Capas**: rejilla, etiquetas, corte (media seccion), vista explosionada y superficies solidas.
  Al desactivar las superficies queda solo el alambre de aristas.

### Esquina inferior derecha

Lectura de FPS y recordatorio de los atajos.

---

## Atajos de teclado

| Tecla | Accion |
| --- | --- |
| `Espacio` | Reproducir / pausa |
| `R` | Reiniciar la secuencia |
| `Flecha izquierda` / `Flecha derecha` | Paso anterior / paso siguiente |
| `E` | Vista explosionada |
| `M` | Motor en marcha |
| `C` | Corte (media seccion) |
| `G` | Rejilla |
| `L` | Etiquetas |
| `S` | Superficies solidas |
| `1` .. `5` | Vistas ISO / Frontal / Lateral / Superior / Detalle |

Los atajos se ignoran mientras el foco esta dentro de un campo (`input`, `select`, `textarea`).

Con el raton: boton izquierdo orbita, rueda acerca y aleja, boton derecho desplaza (OrbitControls).

---

## Estructura de ficheros

```
motor-blueprint/
  index.html            Documento, importmap de three.js y todo el overlay de interfaz
  iniciar.bat           Levanta el servidor local y abre el navegador (Windows)
  README.md             Este fichero
  css/
    styles.css          Estetica de plano, paneles, controles, cargador y responsive
  js/
    main.js             Escena, camara, render, ciclo de animacion y montaje de modulos
    blueprint.js        Libreria de dibujo: materiales, fabricas bp(), cotas, etiquetas, rejilla
    kinematics.js       Matematica del motor: manivela-biela, alzada de valvulas, cotas
    ui.js               Interfaz (DOM puro): createUI(opts) y su controlador
    assembly.js         Secuencia de montaje y vista explosionada
    parts/
      bloque.js         Bloque, camisas, tapas de bancada, bomba de aceite y carter
      ciguenal.js       Ciguenal, cojinetes, volante y corona de arranque
      pistones.js       Pistones, segmentos, bulones y bielas
      culata.js         Junta, culata, bujias y tapa de balancines
      distribucion.js   Valvulas, muelles, taques, arboles de levas, pinones y cadena
      admision.js       Colector de admision, mariposa, inyectores y colector de escape
```

### Sistema de coordenadas

1 unidad de three.js = 1 cm.

- **X** = eje del ciguenal. `-X` frontal (distribucion), `+X` trasero (volante).
- **Y** = vertical, eje de los cilindros. `Y = 0` es el eje del ciguenal.
- **Z** = transversal. `-Z` lado admision, `+Z` lado escape.

---

## Notas de desarrollo

- `js/ui.js` es **DOM puro**: no importa three.js ni toca la escena. Solo necesita que existan
  `#app`, `#viewport`, `#labels`, `#loader` y `#error` en `index.html`.
- `createUI(opts)` devuelve el controlador con `setProgreso`, `setPaso`, `setPlaying`, `setMarcha`,
  `setRpm`, `setFps`, `setEstado` y `setInfoPieza`. Ninguno de esos metodos dispara handlers:
  sirven para que `main.js` refleje su estado en la interfaz sin realimentacion.
- `setProgreso(progreso)` usa las **mismas unidades que `handlers.scrub`**: `0 .. pasos.length`
  (0 = desmontado, 15 = motor completo). La barra del DOM es 0..1 y la conversion la hace `ui.js`.
- Las etiquetas 3D se ocultan anadiendo la clase `sin-etiquetas` al `<body>`; de eso se encarga
  `ui.js` al conmutar la capa de etiquetas.
- Todo el dibujo es determinista: no se usa `Math.random()` para la geometria.
