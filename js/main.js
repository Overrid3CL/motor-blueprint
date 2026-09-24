// js/main.js
// ---------------------------------------------------------------------------
// Punto de entrada del plano. Monta la escena, construye los seis modulos de
// piezas, cablea la interfaz y lleva el bucle de animacion.
//
// Filosofia de este fichero: NADA puede dejar la pantalla en negro y muda.
// Todo va envuelto en try/catch y cualquier fallo se escribe en #error.
// Un modulo de piezas roto se registra y se salta; el resto del plano sigue.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';

import * as BP from './blueprint.js';
import * as K from './kinematics.js';
import { createUI } from './ui.js';
import { Ensamblado } from './assembly.js';

// ---------------------------------------------------------------------------
// CONSTANTES DE PUESTA EN ESCENA
// ---------------------------------------------------------------------------

// Modulos de piezas. Se cargan con import() dinamico para que un modulo que
// reviente al evaluarse no impida cargar los demas.
const RUTAS_MODULOS = [
  './parts/bloque.js',
  './parts/ciguenal.js',
  './parts/pistones.js',
  './parts/culata.js',
  './parts/distribucion.js',
  './parts/admision.js'
];

const VISTAS = {
  iso: { pos: [58, 36, 66], target: [0, 11, 0] },
  frontal: { pos: [-95, 12, 0], target: [0, 11, 0] },
  lateral: { pos: [0, 12, 98], target: [0, 11, 0] },
  superior: { pos: [0, 105, 1], target: [0, 11, 0] },
  detalle: { pos: [18, 26, 34], target: [-14.4, 16, 0] }   // cilindro 1
};

const DURACION_VISTA = 0.8;        // segundos de la transicion de camara
const VELOCIDAD_BASE = 0.55;       // pasos por segundo a velocidad 1x
const DOS_PI = Math.PI * 2;
const CUATRO_PI = Math.PI * 4;

// ---------------------------------------------------------------------------
// ERRORES VISIBLES
// ---------------------------------------------------------------------------

function nodoError() {
  return document.getElementById('error');
}

function mostrarError(titulo, err) {
  const detalle = err && err.stack ? err.stack : String(err == null ? '' : err);
  const texto = titulo + (detalle ? '\n' + detalle : '');
  console.error('[motor] ' + titulo, err);

  const nodo = nodoError();
  if (!nodo) return;
  nodo.textContent = nodo.textContent ? nodo.textContent + '\n\n' + texto : texto;
}

function quitarLoader() {
  const loader = document.getElementById('loader');
  if (loader) loader.classList.add('oculto');
}

function suavizar(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ---------------------------------------------------------------------------
// ARRANQUE
// ---------------------------------------------------------------------------

async function arrancar() {
  const viewport = document.getElementById('viewport');
  const capaEtiquetas = document.getElementById('labels');
  if (!viewport) throw new Error('No existe #viewport en el documento.');

  function medir() {
    const w = viewport.clientWidth || window.innerWidth || 1;
    const h = viewport.clientHeight || window.innerHeight || 1;
    return { w: Math.max(1, w), h: Math.max(1, h) };
  }

  let { w, h } = medir();

  // --- Renderer ------------------------------------------------------------
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(w, h);
  renderer.setClearColor(BP.PALETTE.bg, 1);
  renderer.localClippingEnabled = true;     // imprescindible para el corte
  viewport.appendChild(renderer.domElement);

  // --- Renderer de etiquetas CSS2D ----------------------------------------
  const css2d = new CSS2DRenderer();
  css2d.setSize(w, h);
  css2d.domElement.style.position = 'absolute';
  css2d.domElement.style.top = '0';
  css2d.domElement.style.left = '0';
  css2d.domElement.style.pointerEvents = 'none';
  (capaEtiquetas || viewport).appendChild(css2d.domElement);

  // --- Escena y camara -----------------------------------------------------
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BP.PALETTE.bg);

  const camera = new THREE.PerspectiveCamera(42, w / h, 0.5, 2000);
  camera.position.set(58, 36, 66);
  camera.lookAt(0, 11, 0);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 25;
  controls.maxDistance = 260;
  controls.target.set(0, 11, 0);
  controls.update();

  // --- Luces (sin sombras: es un plano, no un render) ----------------------
  scene.add(new THREE.AmbientLight(0x88bbdd, 0.55));
  scene.add(new THREE.HemisphereLight(0x9fd8ff, 0x0a2036, 0.7));

  const solPrincipal = new THREE.DirectionalLight(0xffffff, 0.8);
  solPrincipal.position.set(60, 80, 50);
  scene.add(solPrincipal);

  const relleno = new THREE.DirectionalLight(0x66ccff, 0.35);
  relleno.position.set(-70, 20, -60);
  scene.add(relleno);

  // -------------------------------------------------------------------------
  // CONSTRUCCION DEL MOTOR
  // -------------------------------------------------------------------------

  const raizMotor = new THREE.Group();
  raizMotor.name = 'motor';

  // Carga de modulos: cada import por separado, para que uno roto no tumbe
  // el plano entero.
  const MODULOS = [];
  for (const ruta of RUTAS_MODULOS) {
    try {
      const mod = await import(ruta);
      if (typeof mod.build !== 'function') {
        throw new Error('el modulo no exporta build()');
      }
      MODULOS.push({ ruta: ruta, mod: mod });
    } catch (err) {
      mostrarError('No se ha podido cargar el modulo ' + ruta, err);
    }
  }

  // Construccion: tambien uno a uno.
  const construidos = [];
  for (const entrada of MODULOS) {
    try {
      const g = entrada.mod.build({ THREE: THREE, BP: BP, K: K });
      if (!g) throw new Error('build() no ha devuelto nada');
      raizMotor.add(g);
      construidos.push({ m: entrada.mod, g: g, ruta: entrada.ruta, roto: false });
    } catch (err) {
      mostrarError('Fallo construyendo ' + entrada.ruta, err);
    }
  }

  const grupoRejilla = BP.rejilla();
  const grupoEjes = BP.ejes();
  scene.add(raizMotor, grupoRejilla, grupoEjes);

  // -------------------------------------------------------------------------
  // ENSAMBLADO
  // -------------------------------------------------------------------------

  const ensamblado = new Ensamblado(raizMotor);
  ensamblado.escanear();
  ensamblado.setVelocidad(VELOCIDAD_BASE);
  ensamblado.setProgreso(ensamblado.total);   // arranca montado y en pausa
  ensamblado.pause();

  // Del indice GLOBAL de paso (el que declara cada pieza) al ordinal en la
  // lista de pasos con piezas. Con los 15 pasos presentes coinciden, pero la
  // tabla se calcula igualmente por si algun modulo falla al construirse.
  const pasosEns = ensamblado.pasos;
  const ordinalPorIndice = new Map();
  pasosEns.forEach((p, orden) => ordinalPorIndice.set(p.indice, orden));

  function ordinalDe(indice) {
    if (ordinalPorIndice.has(indice)) return ordinalPorIndice.get(indice);
    return Math.max(0, Math.min(ensamblado.total - 1, Number(indice) || 0));
  }

  // -------------------------------------------------------------------------
  // POSTPROCESADO (opcional: si falla, se renderiza a pelo)
  // -------------------------------------------------------------------------

  let composer = null;
  let usarComposer = false;

  try {
    const [modComposer, modRender, modBloom, modOutput] = await Promise.all([
      import('three/addons/postprocessing/EffectComposer.js'),
      import('three/addons/postprocessing/RenderPass.js'),
      import('three/addons/postprocessing/UnrealBloomPass.js'),
      import('three/addons/postprocessing/OutputPass.js')
    ]);

    composer = new modComposer.EffectComposer(renderer);
    composer.setPixelRatio(renderer.getPixelRatio());
    composer.setSize(w, h);
    composer.addPass(new modRender.RenderPass(scene, camera));
    composer.addPass(new modBloom.UnrealBloomPass(new THREE.Vector2(w, h), 0.45, 0.6, 0.15));
    composer.addPass(new modOutput.OutputPass());
    usarComposer = true;
  } catch (err) {
    composer = null;
    usarComposer = false;
    console.warn('[motor] sin postprocesado, se renderiza directo', err);
  }

  // -------------------------------------------------------------------------
  // CAPAS: corte, solidos, rejilla, etiquetas
  // -------------------------------------------------------------------------

  // Media seccion: se conserva el lado de admision (-Z).
  const planoCorte = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const SIN_PLANOS = [];

  function aplicarCorte(activo) {
    const planos = activo ? [planoCorte] : SIN_PLANOS;
    for (const m of BP.MATERIALES) {
      m.clippingPlanes = planos;
      m.needsUpdate = true;
    }
  }

  // Los materiales de superficie son los MeshPhongMaterial de la libreria.
  // Basta con apagar el material: son compartidos por todas las piezas.
  function aplicarSolidos(activo) {
    for (const m of BP.MATERIALES) {
      if (m.isMeshPhongMaterial) m.visible = !!activo;
    }
  }

  function aplicarRejilla(activo) {
    grupoRejilla.visible = !!activo;
    grupoEjes.visible = !!activo;
  }

  function aplicarEtiquetas(activo) {
    document.body.classList.toggle('sin-etiquetas', !activo);
  }

  // -------------------------------------------------------------------------
  // VISTAS DE CAMARA (transicion suave dentro del bucle, sin setTimeout)
  // -------------------------------------------------------------------------

  const viaje = {
    activo: false,
    t: 0,
    posDesde: new THREE.Vector3(),
    posHasta: new THREE.Vector3(),
    objDesde: new THREE.Vector3(),
    objHasta: new THREE.Vector3()
  };

  function irAVista(nombre) {
    const v = VISTAS[nombre] || VISTAS.iso;
    viaje.posDesde.copy(camera.position);
    viaje.posHasta.set(v.pos[0], v.pos[1], v.pos[2]);
    viaje.objDesde.copy(controls.target);
    viaje.objHasta.set(v.target[0], v.target[1], v.target[2]);
    viaje.t = 0;
    viaje.activo = true;
  }

  function actualizarViaje(dt) {
    if (!viaje.activo) return;
    viaje.t = Math.min(1, viaje.t + dt / DURACION_VISTA);
    const e = suavizar(viaje.t);
    camera.position.lerpVectors(viaje.posDesde, viaje.posHasta, e);
    controls.target.lerpVectors(viaje.objDesde, viaje.objHasta, e);
    if (viaje.t >= 1) viaje.activo = false;
  }

  // Si el usuario toca la escena, manda el usuario.
  controls.addEventListener('start', () => { viaje.activo = false; });

  // -------------------------------------------------------------------------
  // ESTADO DEL MOTOR EN MARCHA
  // -------------------------------------------------------------------------

  let enMarcha = false;
  let rpm = 1200;
  let anguloCiguenal = 0;

  const estado = {
    tiempo: 0,
    dt: 0,
    enMarcha: false,
    rpm: rpm,
    anguloCiguenal: 0,
    anguloLeva: 0,
    montado: 0
  };

  function textoEstado() {
    if (enMarcha) return 'motor en marcha - ' + Math.round(rpm) + ' rpm';
    if (ensamblado.reproduciendo) return 'montando';
    if (ensamblado.total === 0) return 'sin piezas';
    if (ensamblado.progreso >= ensamblado.total) return 'motor montado';
    if (ensamblado.progreso <= 0) return 'despiece completo';
    return 'montaje parcial';
  }

  // -------------------------------------------------------------------------
  // INTERFAZ
  // -------------------------------------------------------------------------

  let ui = null;

  function refrescarEstado() {
    if (ui) ui.setEstado(textoEstado());
  }

  const handlers = {
    play() {
      ensamblado.play();
      if (ui) ui.setPlaying(ensamblado.reproduciendo);
      refrescarEstado();
    },
    pause() {
      ensamblado.pause();
      if (ui) ui.setPlaying(false);
      refrescarEstado();
    },
    reset() {
      ensamblado.reiniciar();
      if (ui) ui.setPlaying(false);
      refrescarEstado();
    },
    scrub(progreso) {
      ensamblado.pause();
      ensamblado.setProgreso(progreso);
      if (ui) ui.setPlaying(false);
      refrescarEstado();
    },
    paso(indice) {
      ensamblado.irAPaso(ordinalDe(indice));
      if (ui) ui.setPlaying(false);
      refrescarEstado();
    },
    velocidad(mult) {
      const m = Number(mult);
      ensamblado.setVelocidad(VELOCIDAD_BASE * (Number.isFinite(m) && m > 0 ? m : 1));
    },
    marcha(activo) {
      enMarcha = !!activo;
      refrescarEstado();
    },
    rpm(n) {
      const v = Number(n);
      if (Number.isFinite(v)) rpm = v;
      if (enMarcha) refrescarEstado();
    },
    rejilla(activo) { aplicarRejilla(activo); },
    etiquetas(activo) { aplicarEtiquetas(activo); },
    corte(activo) { aplicarCorte(activo); },
    explosion(activo) { ensamblado.setModo(activo ? 'explosionada' : 'secuencia'); },
    solidos(activo) { aplicarSolidos(activo); },
    vista(nombre) { irAVista(nombre); }
  };

  ui = createUI({
    pasos: pasosEns.map((p) => ({ indice: p.indice, etiqueta: p.etiqueta })),
    modulos: construidos.map((b) => b.m.info).filter(Boolean),
    handlers: handlers
  });

  // Aviso del paso activo -> lista, cajetin y panel de informacion.
  ensamblado.onPaso = (ordinal, etiqueta, paso) => {
    ui.setPaso(ordinal);
    refrescarEstado();

    const primera = paso && paso.piezas && paso.piezas[0];
    const datos = primera ? primera.datos : null;
    if (datos) {
      ui.setInfoPieza(
        datos.etiqueta || etiqueta,
        datos.desc || ('Paso ' + (paso.indice + 1) + ': ' + etiqueta)
      );
    }
  };

  // Estado inicial de la interfaz (el HTML ya declara las capas por defecto).
  ui.setRpm(rpm);
  ui.setMarcha(false);
  ui.setPlaying(false);
  ui.setProgreso(ensamblado.progreso);
  if (ensamblado.total > 0) ui.setPaso(ensamblado.total - 1);
  refrescarEstado();
  ui.setInfoPieza('', '');

  // -------------------------------------------------------------------------
  // REDIMENSIONADO
  // -------------------------------------------------------------------------

  function alRedimensionar() {
    const m = medir();
    w = m.w;
    h = m.h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    css2d.setSize(w, h);
    if (composer) {
      composer.setPixelRatio(renderer.getPixelRatio());
      composer.setSize(w, h);
    }
  }

  window.addEventListener('resize', alRedimensionar);
  alRedimensionar();

  // -------------------------------------------------------------------------
  // BUCLE
  // -------------------------------------------------------------------------

  const reloj = new THREE.Clock();
  let acumuladoT = 0;
  let acumuladoF = 0;

  function bucle() {
    requestAnimationFrame(bucle);

    const dt = Math.min(reloj.getDelta(), 0.05);

    // --- estado compartido -------------------------------------------------
    if (enMarcha) {
      anguloCiguenal += (rpm / 60) * DOS_PI * dt;
      // Modulo 4*PI: el ciclo completo son 720 grados; asi no se pierde
      // precision despues de un rato largo en marcha.
      anguloCiguenal = ((anguloCiguenal % CUATRO_PI) + CUATRO_PI) % CUATRO_PI;
    }

    estado.dt = dt;
    estado.tiempo += dt;
    estado.enMarcha = enMarcha;
    estado.rpm = rpm;
    estado.anguloCiguenal = anguloCiguenal;
    estado.anguloLeva = anguloCiguenal / 2;

    // --- ensamblado --------------------------------------------------------
    const reproduciendoAntes = ensamblado.reproduciendo;
    ensamblado.update(dt);
    if (reproduciendoAntes && !ensamblado.reproduciendo) {
      ui.setPlaying(false);            // ha llegado al final solo
      refrescarEstado();
    }
    estado.montado = ensamblado.total > 0 ? ensamblado.progreso / ensamblado.total : 1;

    // --- cinematica de cada modulo (siempre, tambien en reposo) ------------
    for (const b of construidos) {
      if (b.roto || typeof b.m.motion !== 'function') continue;
      try {
        b.m.motion(b.g, estado);
      } catch (err) {
        b.roto = true;                 // se desactiva para no inundar la consola
        mostrarError('Fallo animando ' + b.ruta + ' (animacion desactivada)', err);
      }
    }

    // --- camara ------------------------------------------------------------
    actualizarViaje(dt);
    controls.update();

    // --- pintado -----------------------------------------------------------
    if (usarComposer && composer) {
      composer.render(dt);
    } else {
      renderer.render(scene, camera);
    }
    css2d.render(scene, camera);

    // --- lecturas de la interfaz -------------------------------------------
    ui.setProgreso(ensamblado.progreso);

    acumuladoT += dt;
    acumuladoF++;
    if (acumuladoT >= 0.5) {
      ui.setFps(acumuladoF / acumuladoT);
      acumuladoT = 0;
      acumuladoF = 0;
    }
  }

  bucle();

  // -------------------------------------------------------------------------
  // DEPURACION Y CIERRE
  // -------------------------------------------------------------------------

  window.__motor = {
    scene: scene,
    camera: camera,
    renderer: renderer,
    ensamblado: ensamblado,
    construidos: construidos,
    estado: estado,
    controls: controls,
    ui: ui,
    planoCorte: planoCorte
  };

  quitarLoader();
}

// ---------------------------------------------------------------------------
// LANZAMIENTO
// ---------------------------------------------------------------------------

function fatal(err) {
  mostrarError('No se ha podido iniciar el plano.', err);
  quitarLoader();
  const nodo = document.getElementById('estado-lectura');
  if (nodo) nodo.textContent = 'ERROR';
}

try {
  const lanzar = () => { arrancar().catch(fatal); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', lanzar, { once: true });
  } else {
    lanzar();
  }
} catch (err) {
  fatal(err);
}
