// js/blueprint.js
// ---------------------------------------------------------------------------
// Libreria base del "plano tecnico" (blueprint) del motor.
//
// Todas las piezas del proyecto se dibujan igual: una superficie translucida
// oscura mas sus ARISTAS luminosas. Esa pareja la fabrica bp().
//
// REGLA DE ORO: los materiales son COMPARTIDOS. Hay una unica instancia de
// cada uno (MAT) y todas estan listadas en MATERIALES, para que main.js pueda
// recorrerlas y asignarles planos de corte, wireframe o visibilidad.
// Nunca crees un material nuevo por pieza.
//
// Convenio de ejes del proyecto:
//   X = eje del ciguenal (-X frontal, +X volante)
//   Y = vertical, eje de los cilindros (Y = 0 es el eje del ciguenal)
//   Z = transversal (-Z admision, +Z escape)
//   1 unidad = 1 cm
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';

// ---------------------------------------------------------------------------
// PALETA
// ---------------------------------------------------------------------------

export const PALETTE = {
  bg: 0x071726,
  grid: 0x123a56,
  gridFuerte: 0x1d5c86,
  linea: 0x7fdcff,
  tenue: 0x3d7ea6,
  acento: 0xffc45a,
  caliente: 0xff6b6b,
  ok: 0x6bffb0,
  texto: '#bfe9ff'
};

// ---------------------------------------------------------------------------
// MATERIALES COMPARTIDOS
// ---------------------------------------------------------------------------

// Aristas: LineBasicMaterial. clippingPlanes: [] para que main.js inyecte
// despues el plano de corte sin tener que recrear nada.
function matLinea(color, opacidad) {
  const m = new THREE.LineBasicMaterial({
    color: color,
    transparent: opacidad < 1,
    opacity: opacidad,
    clippingPlanes: [],
    clipIntersection: false,
    depthWrite: opacidad >= 1
  });
  return m;
}

// Superficies: MeshPhongMaterial translucido. depthWrite:false y DoubleSide,
// sin blending aditivo, para que el interior del motor se siga leyendo.
function matSuperficie(color, opacidad) {
  return new THREE.MeshPhongMaterial({
    color: color,
    specular: 0x5f9fc4,
    shininess: 40,
    transparent: true,
    opacity: opacidad,
    depthWrite: false,
    side: THREE.DoubleSide,
    clippingPlanes: [],
    clipIntersection: false
  });
}

const _linea = matLinea(PALETTE.linea, 1.0);
const _tenue = matLinea(PALETTE.tenue, 0.62);
const _acento = matLinea(PALETTE.acento, 1.0);
const _caliente = matLinea(PALETTE.caliente, 1.0);

const _lineaDiscont = new THREE.LineDashedMaterial({
  color: PALETTE.tenue,
  dashSize: 0.9,
  gapSize: 0.5,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
  clippingPlanes: [],
  clipIntersection: false
});

const _superficie = matSuperficie(PALETTE.linea, 0.26);
const _superficieAcento = matSuperficie(PALETTE.acento, 0.26);
const _superficieCaliente = matSuperficie(PALETTE.caliente, 0.26);
const _cristal = matSuperficie(0xbfefff, 0.12);

_linea.name = 'linea';
_tenue.name = 'tenue';
_acento.name = 'acento';
_caliente.name = 'caliente';
_lineaDiscont.name = 'lineaDiscont';
_superficie.name = 'superficie';
_superficieAcento.name = 'superficieAcento';
_superficieCaliente.name = 'superficieCaliente';
_cristal.name = 'cristal';

export const MAT = {
  linea: _linea,
  tenue: _tenue,
  acento: _acento,
  caliente: _caliente,
  lineaDiscont: _lineaDiscont,
  superficie: _superficie,
  superficieAcento: _superficieAcento,
  superficieCaliente: _superficieCaliente,
  cristal: _cristal
};

// TODAS las instancias de material del proyecto, para clipping / wireframe /
// visibilidad global desde main.js.
export const MATERIALES = [
  _linea,
  _tenue,
  _acento,
  _caliente,
  _lineaDiscont,
  _superficie,
  _superficieAcento,
  _superficieCaliente,
  _cristal
];

// Tono -> pareja (material de arista, material de superficie).
// Los cuatro tonos del contrato son: linea, acento, tenue y caliente.
// 'cristal' se acepta como alias tolerado para piezas transparentes.
const TONOS = {
  linea: { arista: _linea, cara: _superficie },
  tenue: { arista: _tenue, cara: _superficie },
  acento: { arista: _acento, cara: _superficieAcento },
  caliente: { arista: _caliente, cara: _superficieCaliente },
  cristal: { arista: _tenue, cara: _cristal }
};

function tonoDe(nombre) {
  return TONOS[nombre] || TONOS.linea;
}

// ---------------------------------------------------------------------------
// FABRICA PRINCIPAL
// ---------------------------------------------------------------------------

/**
 * Envuelve una geometria en la pareja malla translucida + aristas luminosas.
 * OJO: no clona la geometria, la usa tal cual (se puede compartir).
 *
 * opts = {
 *   tono: 'linea' | 'acento' | 'tenue' | 'caliente'   (por defecto 'linea')
 *   umbral: number    angulo en grados para EdgesGeometry (por defecto 24)
 *   solido: boolean   por defecto true; false -> solo aristas
 *   nombre: string
 * }
 */
export function bp(geometry, opts = {}) {
  const t = tonoDe(opts.tono);
  const umbral = opts.umbral ?? 24;
  const conSolido = opts.solido !== false;
  const nombre = opts.nombre || '';

  const grupo = new THREE.Group();
  grupo.name = nombre;
  grupo.userData.esBp = true;
  grupo.userData.geometria = geometry;

  if (conSolido) {
    const malla = new THREE.Mesh(geometry, t.cara);
    malla.name = nombre ? nombre + '-cara' : 'cara';
    malla.renderOrder = 1;
    grupo.add(malla);
  }

  const aristas = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, umbral), t.arista);
  aristas.name = nombre ? nombre + '-aristas' : 'aristas';
  aristas.renderOrder = 2;
  grupo.add(aristas);

  return grupo;
}

// ---------------------------------------------------------------------------
// ATAJOS DE GEOMETRIA
// Todos los solidos de revolucion tienen su EJE EN Y (usa ejeX / ejeZ para
// tumbarlos). Manten los segmentos entre 24 y 32: el plano se dibuja con
// aristas y un numero alto genera miles de lineas.
// ---------------------------------------------------------------------------

export function caja(ancho, alto, fondo, opts = {}) {
  return bp(new THREE.BoxGeometry(ancho, alto, fondo), opts);
}

// Cilindro / cono truncado con eje Y, centrado en el origen.
export function cilindro(rSup, rInf, alto, seg = 28, opts = {}) {
  return bp(new THREE.CylinderGeometry(rSup, rInf, alto, seg), opts);
}

// Anillo hueco (tubo) con eje Y, centrado en el origen. Se construye por
// revolucion de su seccion rectangular, asi que queda cerrado por los extremos
// y sus cuatro aristas circulares salen limpias.
export function tubo(rExt, rInt, alto, seg = 28, opts = {}) {
  if (!(rInt > 0) || rInt >= rExt) {
    return cilindro(rExt, rExt, alto, seg, opts);
  }
  const h = alto / 2;
  const perfil = [
    new THREE.Vector2(rInt, -h),
    new THREE.Vector2(rExt, -h),
    new THREE.Vector2(rExt, h),
    new THREE.Vector2(rInt, h),
    new THREE.Vector2(rInt, -h)
  ];
  return bp(new THREE.LatheGeometry(perfil, seg), opts);
}

// Toro TUMBADO: su eje de revolucion es Y (coherente con cilindro y tubo,
// no con el toro por defecto de three.js, que vive en el plano XY).
export function toro(radio, grosor, opts = {}) {
  const geo = new THREE.TorusGeometry(radio, grosor, 8, 28);
  geo.rotateX(-Math.PI / 2);
  return bp(geo, opts);
}

// Esfera de baja resolucion: con 14 meridianos el angulo entre caras (25.7
// grados) supera el umbral de 24, asi que las aristas dibujan los meridianos
// y la esfera se lee como tal en el plano.
export function esfera(radio, opts = {}) {
  return bp(new THREE.SphereGeometry(radio, 14, 10), opts);
}

// Extrusion de un THREE.Shape. 'opciones' son las de ExtrudeGeometry.
export function extrusion(shape, opciones, opts = {}) {
  const cfg = Object.assign(
    { depth: 1, bevelEnabled: false, curveSegments: 10, steps: 1 },
    opciones || {}
  );
  return bp(new THREE.ExtrudeGeometry(shape, cfg), opts);
}

// ---------------------------------------------------------------------------
// UTILIDADES DE ESCENA
// ---------------------------------------------------------------------------

export function G(nombre) {
  const g = new THREE.Group();
  g.name = nombre || '';
  return g;
}

// Pasa un objeto de eje Y a eje X (+Y -> +X).
export function ejeX(obj) {
  obj.rotation.z = -Math.PI / 2;
  return obj;
}

// Pasa un objeto de eje Y a eje Z (+Y -> +Z).
export function ejeZ(obj) {
  obj.rotation.x = Math.PI / 2;
  return obj;
}

/**
 * Marca un Object3D como pieza animable del ensamblado.
 * datos = { id, etiqueta, paso, explode, giro, desc }
 * Lo guarda todo en obj.userData.pieza y devuelve obj.
 */
export function tag(obj, datos = {}) {
  const pieza = {
    id: datos.id || obj.name || '',
    etiqueta: datos.etiqueta || datos.id || '',
    paso: datos.paso ?? 0,
    explode: datos.explode ? datos.explode.clone() : new THREE.Vector3(0, 0, 0),
    giro: datos.giro ? datos.giro.clone() : new THREE.Euler(0, 0, 0),
    desc: datos.desc || ''
  };
  obj.userData.pieza = pieza;
  if (!obj.name && pieza.id) obj.name = pieza.id;
  return obj;
}

// ---------------------------------------------------------------------------
// ETIQUETAS 2D
// ---------------------------------------------------------------------------

/**
 * Etiqueta flotante. Devuelve un CSS2DObject; quien llama decide donde lo anade.
 * opts = { tono: 'linea' | 'acento', posicion: THREE.Vector3 }
 */
export function etiqueta(texto, opts = {}) {
  const div = document.createElement('div');
  div.className = 'bp-etiqueta' + (opts.tono === 'acento' ? ' bp-etiqueta--acento' : '');
  div.textContent = texto == null ? '' : String(texto);

  const obj = new CSS2DObject(div);
  obj.name = 'etiqueta';
  obj.userData.esEtiqueta = true;
  if (opts.posicion) obj.position.copy(opts.posicion);
  return obj;
}

// ---------------------------------------------------------------------------
// ACOTACION
// ---------------------------------------------------------------------------

const EJES_UNIDAD = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1)
};

// Geometrias compartidas de las flechitas de cota (una sola vez).
const GEO_FLECHA = new THREE.ConeGeometry(0.36, 1.2, 10);
const GEO_FLECHA_ARISTAS = new THREE.EdgesGeometry(GEO_FLECHA, 24);
const ARRIBA = new THREE.Vector3(0, 1, 0);

function segmento(a, b, material) {
  const geo = new THREE.BufferGeometry().setFromPoints([a, b]);
  const l = new THREE.Line(geo, material);
  l.renderOrder = 2;
  return l;
}

// Flecha con la punta exactamente en 'apice' y apuntando hacia 'dir'.
function flecha(apice, dir, t) {
  const g = new THREE.Group();
  const malla = new THREE.Mesh(GEO_FLECHA, t.cara);
  malla.renderOrder = 1;
  const borde = new THREE.LineSegments(GEO_FLECHA_ARISTAS, t.arista);
  borde.renderOrder = 2;
  g.add(malla, borde);
  g.quaternion.setFromUnitVectors(ARRIBA, dir.clone().normalize());
  // El cono tiene el apice en +Y local, a media altura del centro.
  g.position.copy(apice).addScaledVector(dir.clone().normalize(), -0.6);
  return g;
}

// Eje de desplazamiento por defecto: el mas perpendicular a la medida.
function ejePorDefecto(dir) {
  let mejor = 'y';
  let min = Infinity;
  for (const k of ['y', 'z', 'x']) {
    const d = Math.abs(EJES_UNIDAD[k].dot(dir));
    if (d < min - 1e-6) {
      min = d;
      mejor = k;
    }
  }
  return mejor;
}

/**
 * Cota entre dos puntos: dos lineas de referencia perpendiculares, la linea de
 * cota con dos flechitas y el texto en el punto medio.
 * opts = { desplazamiento:number, eje:'x'|'y'|'z', tono, nombre }
 */
export function cota(puntoA, puntoB, texto, opts = {}) {
  const g = G(opts.nombre || 'cota');
  g.userData.esCota = true;

  const a = puntoA.clone();
  const b = puntoB.clone();
  const dir = new THREE.Vector3().subVectors(b, a);
  const largo = dir.length();
  if (largo < 1e-5) return g;
  dir.divideScalar(largo);

  const t = tonoDe(opts.tono || 'tenue');
  const desplazamiento = opts.desplazamiento ?? 4;
  const clave = EJES_UNIDAD[opts.eje] ? opts.eje : ejePorDefecto(dir);

  // Desplazamiento perpendicular a la medida (se quita la parte paralela).
  const n = EJES_UNIDAD[clave].clone();
  n.addScaledVector(dir, -n.dot(dir));
  if (n.lengthSq() < 1e-6) n.copy(EJES_UNIDAD[ejePorDefecto(dir)]);
  n.normalize();

  const off = n.clone().multiplyScalar(desplazamiento);
  const a2 = a.clone().add(off);
  const b2 = b.clone().add(off);
  const rebase = n.clone().multiplyScalar(desplazamiento >= 0 ? 0.9 : -0.9);

  // Lineas de referencia (desde la pieza hasta un poco mas alla de la cota).
  g.add(segmento(a, a2.clone().add(rebase), t.arista));
  g.add(segmento(b, b2.clone().add(rebase), t.arista));
  // Linea de cota.
  g.add(segmento(a2, b2, t.arista));
  // Flechitas apuntando hacia afuera.
  if (largo > 2.6) {
    g.add(flecha(a2, dir.clone().negate(), t));
    g.add(flecha(b2, dir, t));
  }

  const medio = a2.clone().add(b2).multiplyScalar(0.5).addScaledVector(n, 0.8);
  const txt = texto == null || texto === '' ? largo.toFixed(1) : texto;
  g.add(etiqueta(txt, { tono: opts.tono === 'acento' ? 'acento' : 'linea', posicion: medio }));

  return g;
}

/**
 * Linea de eje discontinua. opts = { nombre }
 */
export function lineaEje(desde, hasta, opts = {}) {
  const geo = new THREE.BufferGeometry().setFromPoints([desde.clone(), hasta.clone()]);
  const l = new THREE.Line(geo, MAT.lineaDiscont);
  l.computeLineDistances(); // imprescindible para que se vea discontinua
  l.name = opts.nombre || 'linea-eje';
  l.renderOrder = 2;
  return l;
}

// ---------------------------------------------------------------------------
// FONDO DEL PLANO
// ---------------------------------------------------------------------------

// Rejilla del plano, justo por debajo del carter (Y = -19).
export function rejilla() {
  const g = G('rejilla');

  const principal = new THREE.GridHelper(240, 48, PALETTE.gridFuerte, PALETTE.grid);
  principal.name = 'rejilla-principal';
  principal.position.y = -19;
  principal.material.transparent = true;
  principal.material.opacity = 0.8;
  principal.material.depthWrite = false;
  principal.renderOrder = 0;

  const fina = new THREE.GridHelper(240, 240, PALETTE.grid, PALETTE.grid);
  fina.name = 'rejilla-fina';
  fina.position.y = -19.04;
  fina.material.transparent = true;
  fina.material.opacity = 0.16;
  fina.material.depthWrite = false;
  fina.renderOrder = 0;

  g.add(fina, principal);
  return g;
}

// Triedro de referencia en la esquina del plano, con etiquetas X / Y / Z.
export function ejes() {
  const g = G('ejes');
  g.position.set(-46, -19, -26);

  const brazo = 10;
  const def = [
    { v: new THREE.Vector3(brazo, 0, 0), txt: 'X', tono: 'acento' },
    { v: new THREE.Vector3(0, brazo, 0), txt: 'Y', tono: 'linea' },
    { v: new THREE.Vector3(0, 0, brazo), txt: 'Z', tono: 'tenue' }
  ];

  const origen = new THREE.Vector3(0, 0, 0);
  for (const d of def) {
    const t = tonoDe(d.tono);
    g.add(segmento(origen, d.v, t.arista));
    g.add(flecha(d.v, d.v.clone().normalize(), t));
    g.add(etiqueta(d.txt, {
      tono: d.tono === 'acento' ? 'acento' : 'linea',
      posicion: d.v.clone().multiplyScalar(1.22)
    }));
  }

  return g;
}
