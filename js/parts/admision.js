// js/parts/admision.js
// ---------------------------------------------------------------------------
// SISTEMA DE ADMISION (lado -Z) y SISTEMA DE ESCAPE (lado +Z).
//
// Pasos de montaje que cubre este modulo:
//   12  Colector de admision, mariposa e inyectores
//   13  Colector de escape 4-2-1
//
// Convenio de ejes del proyecto:
//   X = eje del ciguenal (-X frontal, +X volante)
//   Y = vertical, Y = 0 es el eje del ciguenal
//   Z = transversal (-Z admision, +Z escape)
//   1 unidad = 1 cm
//
// Todo se construye YA EN SU POSICION FINAL DE MONTAJE. El sistema de
// ensamblado desplaza cada pieza usando el vector 'explode' de su BP.tag().
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import * as BP from '../blueprint.js';
import * as K from '../kinematics.js';

// ---------------------------------------------------------------------------
// COTAS Y CONSTANTES
// ---------------------------------------------------------------------------

const GRADO = Math.PI / 180;

const CIL_X = K.MOTOR.cilindrosX;          // [-14.4, -4.8, 4.8, 14.4]

// --- admision --------------------------------------------------------------
const ADM_BRIDA_Z0 = -11.3;                // cara exterior de la brida
const ADM_BRIDA_ESPESOR = 0.8;             // hasta Z = -10.5 (cara de culata)
const ADM_BOCA_Y = 28.0;                   // eje de las bocas de admision
const ADM_RUNNER_R = 1.9;                  // radio exterior del runner
const PLENUM_Y = 29.0;                     // eje del plenum
const PLENUM_Z = -20.0;                    // eje del plenum
const PLENUM_R = 3.0;                      // radio del plenum (Y 26..32, Z -17..-23)
const PLENUM_X = 17.0;                     // semilongitud del plenum
const X_PLENUM = [-11.6, -4.2, 4.2, 11.6]; // entrada de cada runner al plenum
const RUNNER_LONGITUD = 9.3;               // longitud comun objetivo de los 4 runners

const MARIPOSA_X = -19.0;                  // centro del cuerpo de mariposa
const RAMPA_Y = 31.0;                      // rampa de inyeccion
const RAMPA_Z = -14.0;
const INY_INCLINACION = 36 * GRADO;        // inclinacion de los inyectores
const INY_LARGO = 4.5;

// --- escape ----------------------------------------------------------------
const ESC_BRIDA_Z0 = 10.5;
const ESC_BRIDA_ESPESOR = 0.8;             // hasta Z = +11.3
const ESC_BOCA_Y = 26.0;
const ESC_PRIM_R = 1.7;                    // primarios
const ESC_SEC_R = 2.3;                     // secundarios
const ESC_COL_R = 2.8;                     // colector final

// Uniones del colector 4-2-1: primarios 1+4 en una, 2+3 en otra.
const UNION_A = [0.0, 22.2, 17.9];         // cilindros 1 y 4 (exteriores)
const UNION_B = [0.0, 20.0, 14.6];         // cilindros 2 y 3 (interiores)
const BOCA_COLECTOR = [0.0, 18.4, 17.1];   // donde se juntan los dos secundarios

// Cada tubo se mete un poco dentro del siguiente (que es mas gordo) para que
// su boca quede escondida: si no, en cada union se amontonan los circulos de
// los extremos y la confluencia se lee como una marana de aristas.
const DENTRO_A = [-0.8, 21.0, 17.7];       // primarios 1 y 4 dentro del secundario
const DENTRO_B = [1.1, 19.5, 15.4];        // primarios 2 y 3 dentro del secundario
const DENTRO_COLECTOR = [0.3, 16.9, 17.3]; // secundarios dentro del colector final

// --- flechas de flujo ------------------------------------------------------
const FLUJO_RECORRIDO = 7.6;               // longitud del ciclo de desplazamiento
const FLUJO_ADM_Z0 = -32.0;
const FLUJO_ESC_Z0 = 24.0;

// Instante de inyeccion de cada cilindro, en grados de ciguenal.
// Orden de encendido 1-3-4-2: el cilindro n enciende en indice(n) * 180 grados,
// y se inyecta 380 grados antes de su encendido siguiente (en plena admision).
const INY_APERTURA = CIL_X.map((_, i) => {
  const posicion = K.MOTOR.ordenEncendido.indexOf(i + 1);
  return (380 + posicion * 180) % 720;
});
const INY_DURACION = 55;                   // ventana de inyeccion, en grados
const INY_CARRERA = 0.08;                  // cuanto baja el inyector al inyectar

// ---------------------------------------------------------------------------
// METADATOS PARA LA UI
// ---------------------------------------------------------------------------

export const info = {
  id: 'admision',
  titulo: 'Admision y escape',
  piezas: [
    {
      id: 'colector-admision',
      etiqueta: 'Colector de admision',
      paso: 12,
      desc: 'Plenum de 6 cm de diametro y cuatro runners de igual longitud (9.3 cm) para igualar el llenado de los cuatro cilindros.'
    },
    {
      id: 'mariposa',
      etiqueta: 'Cuerpo de mariposa',
      paso: 12,
      desc: 'Cuerpo de 60 mm con disco de mariposa motorizado. La apertura del disco sigue a las rpm: de 20 grados al ralenti a 88 grados a plena carga.'
    },
    {
      id: 'inyectores',
      etiqueta: 'Rampa e inyectores',
      paso: 12,
      desc: 'Rampa comun de combustible y cuatro inyectores que pulverizan sobre la boca de cada cilindro, sincronizados con el orden 1-3-4-2.'
    },
    {
      id: 'colector-escape',
      etiqueta: 'Colector de escape 4-2-1',
      paso: 13,
      desc: 'Primarios 1+4 y 2+3 unidos en dos secundarios, y estos en el colector final con brida de salida y sonda lambda.'
    }
  ]
};

// ---------------------------------------------------------------------------
// AYUDAS INTERNAS
// ---------------------------------------------------------------------------

function v3(p) {
  return new THREE.Vector3(p[0], p[1], p[2]);
}

// Curva suave que pasa por una lista de puntos [x, y, z].
function curvaDe(puntos) {
  return new THREE.CatmullRomCurve3(puntos.map(v3), false, 'catmullrom', 0.2);
}

// Tubo sobre una curva.
//
// PRESUPUESTO DE ARISTAS: con 10 caras alrededor, el angulo entre caras
// vecinas es de 36 grados y el umbral 32 deja pasar SOLO las 10 aristas
// longitudinales; los anillos entre tramos (unos pocos grados, porque la
// curva es suave) quedan fuera. Asi el tubo se lee como un tubo, con sus
// nervios a lo largo, en vez de convertirse en una rejilla de cuadritos.
const TUBO_RADIALES = 10;
const TUBO_UMBRAL = 32;

function tuboCurva(curva, radio, tubulares, opts = {}) {
  const geo = new THREE.TubeGeometry(curva, tubulares, radio, TUBO_RADIALES, false);
  return BP.bp(geo, Object.assign({ umbral: TUBO_UMBRAL }, opts));
}

// Interpolacion lineal entre dos numeros.
function mezcla(a, b, t) {
  return a + (b - a) * t;
}

function acotar(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

// Cilindro tumbado sobre el eje X, ya colocado.
function cilindroX(rSup, rInf, largo, seg, x, y, z, opts) {
  const c = BP.cilindro(rSup, rInf, largo, seg, opts);
  BP.ejeX(c);
  c.position.set(x, y, z);
  return c;
}

// Anillo tumbado sobre el eje X, ya colocado.
function tuboX(rExt, rInt, largo, seg, x, y, z, opts) {
  const t = BP.tubo(rExt, rInt, largo, seg, opts);
  BP.ejeX(t);
  t.position.set(x, y, z);
  return t;
}

// Anillo tumbado sobre el eje Z, ya colocado.
function tuboZ(rExt, rInt, largo, seg, x, y, z, opts) {
  const t = BP.tubo(rExt, rInt, largo, seg, opts);
  BP.ejeZ(t);
  t.position.set(x, y, z);
  return t;
}

// Taladro circular para una brida (agujero de un THREE.Shape).
function taladro(shape, cx, cy, radio) {
  const p = new THREE.Path();
  p.absarc(cx, cy, radio, 0, Math.PI * 2, true);
  shape.holes.push(p);
}

// Boca ovalada para una brida.
function bocaOval(shape, cx, cy, rx, ry) {
  const p = new THREE.Path();
  p.absellipse(cx, cy, rx, ry, 0, Math.PI * 2, true, 0);
  shape.holes.push(p);
}

// Rectangulo base de una brida, en coordenadas absolutas X / Y.
function rectangulo(x0, y0, x1, y1) {
  const s = new THREE.Shape();
  s.moveTo(x0, y0);
  s.lineTo(x1, y0);
  s.lineTo(x1, y1);
  s.lineTo(x0, y1);
  s.closePath();
  return s;
}

// ---------------------------------------------------------------------------
// PASO 12 - COLECTOR DE ADMISION
// ---------------------------------------------------------------------------

// Puntos de control de un runner. 'arco' levanta el tramo central: es el
// parametro con el que se igualan las longitudes de los cuatro runners.
function puntosRunner(i, arco) {
  const x0 = CIL_X[i];
  const x1 = X_PLENUM[i];
  return [
    [x0, ADM_BOCA_Y, ADM_BRIDA_Z0],
    [x0, ADM_BOCA_Y, -12.7],
    [mezcla(x0, x1, 0.18), 27.90 + arco * 0.06, -13.9],
    [mezcla(x0, x1, 0.55), 28.20 + arco * 0.85, -16.0],
    [x1, PLENUM_Y, -17.9],
    [x1, PLENUM_Y, -19.2]
  ];
}

// Busca por biseccion el arco que da la longitud pedida. Determinista: siempre
// el mismo numero de pasos, sin aleatoriedad.
function arcoParaLongitud(i, objetivo) {
  const min = 0;
  const max = 3.4;
  if (curvaDe(puntosRunner(i, min)).getLength() >= objetivo) return min;
  if (curvaDe(puntosRunner(i, max)).getLength() <= objetivo) return max;
  let lo = min;
  let hi = max;
  for (let k = 0; k < 18; k++) {
    const medio = (lo + hi) / 2;
    if (curvaDe(puntosRunner(i, medio)).getLength() < objetivo) lo = medio;
    else hi = medio;
  }
  return (lo + hi) / 2;
}

function bridaAdmision() {
  const s = rectangulo(-19, 25.2, 19, 30.8);
  // Cuatro bocas ovaladas, una por cilindro.
  for (const x of CIL_X) bocaOval(s, x, ADM_BOCA_Y, 2.2, 1.7);
  // Ocho taladros de fijacion, cuatro arriba y cuatro abajo.
  for (const x of [-17.6, -9.6, 9.6, 17.6]) {
    taladro(s, x, 29.9, 0.45);
    taladro(s, x, 26.1, 0.45);
  }
  const g = BP.extrusion(s, { depth: ADM_BRIDA_ESPESOR, curveSegments: 10 }, {
    nombre: 'brida-admision'
  });
  g.position.z = ADM_BRIDA_Z0;
  return g;
}

function plenum() {
  const g = BP.G('plenum');

  // Cuerpo cilindrico de eje X: Y 26..32, Z -17..-23.
  g.add(cilindroX(PLENUM_R, PLENUM_R, PLENUM_X * 2, 28, 0, PLENUM_Y, PLENUM_Z, {
    nombre: 'plenum-cuerpo'
  }));

  // Caja de transicion: la cara donde acometen los cuatro runners.
  const trans = BP.caja(PLENUM_X * 2, 3.6, 2.6, { nombre: 'plenum-transicion' });
  trans.position.set(0, PLENUM_Y, -18.3);
  g.add(trans);

  // Tapas / bridas de los dos extremos.
  g.add(cilindroX(3.7, 3.7, 0.4, 28, -PLENUM_X - 0.2, PLENUM_Y, PLENUM_Z, { tono: 'tenue' }));
  g.add(cilindroX(3.7, 3.7, 0.4, 28, PLENUM_X + 0.2, PLENUM_Y, PLENUM_Z, { tono: 'tenue' }));

  // Dos soportes que atan el plenum a la culata.
  for (const x of [-16.0, 16.0]) {
    const sop = BP.caja(0.8, 0.9, 7.6, { tono: 'tenue' });
    sop.position.set(x, 25.4, -15.2);
    g.add(sop);
  }

  return g;
}

function colectorAdmision() {
  const g = BP.G('colector-admision');

  g.add(bridaAdmision());

  // Cuatro runners de IGUAL LONGITUD y distinta curvatura.
  for (let i = 0; i < 4; i++) {
    const arco = arcoParaLongitud(i, RUNNER_LONGITUD);
    const curva = curvaDe(puntosRunner(i, arco));
    const t = tuboCurva(curva, ADM_RUNNER_R, 16, { nombre: 'runner-' + (i + 1) });
    g.add(t);
    // Collarin de union con la brida.
    g.add(tuboZ(2.3, 1.9, 0.7, 20, CIL_X[i], ADM_BOCA_Y, -11.7, { tono: 'tenue' }));
  }

  g.add(plenum());

  g.add(BP.etiqueta('Colector de admision - runners de igual longitud', {
    tono: 'linea',
    posicion: new THREE.Vector3(0, 34.6, -21.5)
  }));

  return BP.tag(g, {
    id: 'colector-admision',
    etiqueta: 'Colector de admision',
    paso: 12,
    explode: new THREE.Vector3(0, 4, -34),
    desc: info.piezas[0].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 12 - CUERPO DE MARIPOSA
// ---------------------------------------------------------------------------

function mariposa() {
  const g = BP.G('mariposa');

  // Cuerpo: tubo de diam ext 7.0 / int 6.0 y largo 4.0, eje X, en X -17..-21.
  g.add(tuboX(3.5, 3.0, 4.0, 28, MARIPOSA_X, PLENUM_Y, PLENUM_Z, {
    nombre: 'mariposa-cuerpo'
  }));

  // Brida cuadrada de union al plenum.
  const brida = BP.caja(0.4, 8.4, 8.4, { tono: 'tenue' });
  brida.position.set(-17.1, PLENUM_Y, PLENUM_Z);
  g.add(brida);

  // Brida delantera, donde acopla el cono de entrada.
  const bridaFrontal = BP.caja(0.4, 8.0, 8.0, { tono: 'tenue' });
  bridaFrontal.position.set(-21.0, PLENUM_Y, PLENUM_Z);
  g.add(bridaFrontal);

  // Eje de la mariposa: atraviesa el cuerpo de lado a lado, a lo largo de Z.
  const eje = BP.cilindro(0.35, 0.35, 8.2, 16, { tono: 'acento' });
  BP.ejeZ(eje);
  eje.position.set(MARIPOSA_X, PLENUM_Y, PLENUM_Z);
  eje.name = 'eje-mariposa';
  g.add(eje);

  // --- DISCO DE LA MARIPOSA ------------------------------------------------
  // El contrato dice que se anima con 'disco-mariposa'.rotation.x. Como el
  // conducto tiene su eje en X, un giro sobre X no cerraria nada; por eso el
  // disco cuelga de un pivote girado 90 grados sobre Y, que convierte esa
  // rotacion local en un giro alrededor de Z (el eje real de la mariposa).
  // Resultado: a 20 grados el disco queda casi perpendicular al conducto
  // (cerrada) y a 88 grados casi paralelo (abierta de par en par).
  const pivote = BP.G('mariposa-pivote');
  pivote.position.set(MARIPOSA_X, PLENUM_Y, PLENUM_Z);
  pivote.rotation.y = Math.PI / 2;

  const disco = BP.G('disco-mariposa');
  disco.rotation.x = 20 * GRADO;           // arranca cerrada, al ralenti

  const plato = BP.cilindro(2.95, 2.95, 0.18, 28, { tono: 'acento' });
  BP.ejeZ(plato);                          // su normal pasa a ser el eje local Z
  disco.add(plato);

  const buje = BP.cilindro(0.5, 0.5, 5.9, 12, { tono: 'acento' });
  BP.ejeX(buje);                           // el buje sigue al eje de giro
  disco.add(buje);

  pivote.add(disco);
  g.add(pivote);

  // Actuador (motor paso a paso) en un extremo del eje.
  const placaActuador = BP.caja(2.8, 2.8, 0.6, { tono: 'tenue' });
  placaActuador.position.set(MARIPOSA_X, PLENUM_Y, -23.9);
  g.add(placaActuador);
  const motor = BP.cilindro(1.2, 1.2, 2.6, 20, { tono: 'tenue' });
  BP.ejeZ(motor);
  motor.position.set(MARIPOSA_X, PLENUM_Y, -25.5);
  motor.name = 'actuador-mariposa';
  g.add(motor);
  const conector = BP.caja(1.4, 1.0, 0.8, { tono: 'acento' });
  conector.position.set(MARIPOSA_X, PLENUM_Y - 1.6, -25.5);
  g.add(conector);

  // Cono de entrada de aire, delante del cuerpo (la boca ancha mira a -X).
  g.add(cilindroX(3.2, 4.6, 2.8, 28, -22.6, PLENUM_Y, PLENUM_Z, {
    nombre: 'entrada-aire'
  }));
  g.add(tuboX(4.9, 4.6, 0.4, 28, -24.2, PLENUM_Y, PLENUM_Z, { tono: 'tenue' }));

  return BP.tag(g, {
    id: 'mariposa',
    etiqueta: 'Cuerpo de mariposa',
    paso: 12,
    explode: new THREE.Vector3(0, 10, -38),
    desc: info.piezas[1].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 12 - RAMPA DE INYECCION E INYECTORES
// ---------------------------------------------------------------------------

function inyector(i) {
  const x = CIL_X[i];

  // Punta apuntando a la boca del colector, con la cola dentro de la rampa.
  const dirY = Math.cos(INY_INCLINACION);
  const dirZ = Math.sin(INY_INCLINACION);
  const puntaY = 27.8;
  const puntaZ = -12.0;

  const g = BP.G('inyector-' + (i + 1));
  g.position.set(x, puntaY + INY_LARGO * dirY, puntaZ - INY_LARGO * dirZ);
  // Con esta rotacion el eje local -Y apunta hacia la boca del colector.
  g.rotation.x = -INY_INCLINACION;

  const cuerpo = BP.cilindro(0.8, 0.8, INY_LARGO, 20, { tono: 'acento' });
  cuerpo.position.y = -INY_LARGO / 2;
  g.add(cuerpo);

  // Collarin y junta torica.
  const collar = BP.tubo(0.95, 0.8, 0.3, 16, { tono: 'acento' });
  collar.position.y = -1.1;
  g.add(collar);

  // Tobera que entra en el conducto.
  const tobera = BP.cilindro(0.34, 0.26, 0.9, 14, { tono: 'acento' });
  tobera.position.y = -INY_LARGO - 0.4;
  g.add(tobera);

  // Conector electrico.
  const conector = BP.caja(1.4, 1.0, 0.9, { tono: 'acento' });
  conector.position.set(0, -0.7, -1.3);
  conector.name = 'conector-inyector-' + (i + 1);
  g.add(conector);

  return g;
}

function inyectores() {
  const g = BP.G('inyectores');

  // Rampa comun: tubo de eje X, diam 2.2, de X -17 a +17.
  g.add(tuboX(1.1, 0.75, 34, 24, 0, RAMPA_Y, RAMPA_Z, {
    tono: 'acento',
    nombre: 'rampa-inyeccion'
  }));
  g.add(cilindroX(1.1, 1.1, 0.5, 24, -17.25, RAMPA_Y, RAMPA_Z, { tono: 'acento' }));
  g.add(cilindroX(1.1, 1.1, 0.5, 24, 17.25, RAMPA_Y, RAMPA_Z, { tono: 'acento' }));

  // Entrada de combustible en el extremo trasero.
  g.add(cilindroX(0.55, 0.55, 2.4, 16, 18.7, RAMPA_Y, RAMPA_Z, { tono: 'acento' }));
  const subida = BP.cilindro(0.55, 0.55, 2.4, 16, { tono: 'acento' });
  subida.position.set(19.9, RAMPA_Y + 1.2, RAMPA_Z);
  g.add(subida);

  // Abrazaderas que sujetan la rampa al colector.
  for (const x of [-9.6, 9.6]) {
    const abr = BP.caja(0.9, 1.8, 0.7, { tono: 'tenue' });
    abr.position.set(x, RAMPA_Y - 1.4, RAMPA_Z);
    g.add(abr);
  }

  for (let i = 0; i < 4; i++) g.add(inyector(i));

  return BP.tag(g, {
    id: 'inyectores',
    etiqueta: 'Rampa e inyectores',
    paso: 12,
    explode: new THREE.Vector3(0, 14, -30),
    desc: info.piezas[2].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 13 - COLECTOR DE ESCAPE 4-2-1
// ---------------------------------------------------------------------------

function bridaEscape() {
  const s = rectangulo(-19, 23.2, 19, 28.8);
  for (const x of CIL_X) taladro(s, x, ESC_BOCA_Y, 1.6);
  for (const x of [-17.6, -9.6, 9.6, 17.6]) {
    taladro(s, x, 27.9, 0.45);
    taladro(s, x, 24.1, 0.45);
  }
  const g = BP.extrusion(s, { depth: ESC_BRIDA_ESPESOR, curveSegments: 10 }, {
    nombre: 'brida-escape'
  });
  g.position.z = ESC_BRIDA_Z0;
  return g;
}

// Trazado de cada primario. Los exteriores (1 y 4) van por fuera y por abajo,
// los interiores (2 y 3) por dentro y mas cerca de la culata: asi las dos
// parejas se cruzan lo menos posible.
function puntosPrimario(i) {
  const x = CIL_X[i];
  const z0 = ESC_BRIDA_Z0 + ESC_BRIDA_ESPESOR;   // +11.3
  const exterior = (i === 0 || i === 3);
  const signo = x < 0 ? -1 : 1;

  if (exterior) {
    return [
      [x, ESC_BOCA_Y, z0],
      [x, ESC_BOCA_Y + 0.1, 12.9],
      [x - signo * 2.4, 25.4, 15.2],
      [x - signo * 6.4, 24.6, 17.2],
      [signo * 4.0, 23.4, 17.9],
      UNION_A,
      DENTRO_A                                   // boca escondida en el secundario
    ];
  }
  return [
    [x, ESC_BOCA_Y, z0],
    [x, ESC_BOCA_Y, 12.4],
    [x - signo * 0.4, 24.2, 13.2],
    [x - signo * 2.2, 22.0, 14.0],
    UNION_B,
    DENTRO_B
  ];
}

function colectorEscape() {
  const g = BP.G('colector-escape');

  g.add(bridaEscape());

  // Cuatro primarios + su collarin de union a la brida.
  for (let i = 0; i < 4; i++) {
    const curva = curvaDe(puntosPrimario(i));
    g.add(tuboCurva(curva, ESC_PRIM_R, 18, { nombre: 'primario-' + (i + 1) }));
    g.add(tuboZ(2.1, 1.7, 0.7, 20, CIL_X[i], ESC_BOCA_Y, 11.6, { tono: 'tenue' }));
  }

  // Dos secundarios: el de los cilindros 1+4 y el de los 2+3.
  const secA = curvaDe([UNION_A, [-1.6, 19.8, 17.5], BOCA_COLECTOR, DENTRO_COLECTOR]);
  const secB = curvaDe([UNION_B, [1.8, 19.2, 15.9], BOCA_COLECTOR, DENTRO_COLECTOR]);
  g.add(tuboCurva(secA, ESC_SEC_R, 14, { nombre: 'secundario-1-4' }));
  g.add(tuboCurva(secB, ESC_SEC_R, 14, { nombre: 'secundario-2-3' }));

  // Colector final: baja desde (0, 18, +17) hasta (2, 10, +19).
  const final = curvaDe([
    [0, 18, 17],
    [0.6, 15.2, 17.6],
    [1.5, 12.2, 18.4],
    [2, 10, 19]
  ]);
  g.add(tuboCurva(final, ESC_COL_R, 14, { nombre: 'colector-final' }));

  // Brida de salida: disco de diam 8 con 3 taladros, perpendicular al tubo.
  const bridaSalida = (() => {
    const s = new THREE.Shape();
    s.absarc(0, 0, 4.0, 0, Math.PI * 2, false);
    for (const a of [90, 210, 330]) {
      taladro(s, Math.cos(a * GRADO) * 2.7, Math.sin(a * GRADO) * 2.7, 0.45);
    }
    const b = BP.extrusion(s, { depth: 0.6, curveSegments: 16 }, {
      nombre: 'brida-salida-escape'
    });
    const dir = final.getTangent(1).normalize();
    b.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    b.position.set(2, 10, 19);
    return b;
  })();
  g.add(bridaSalida);

  // Sonda lambda, roscada en el secundario de los cilindros 1 y 4.
  const lambda = BP.G('sonda-lambda');
  lambda.position.set(-1.2, 20.4, 17.6);
  lambda.rotation.x = -35 * GRADO;         // asomando hacia arriba y hacia +Z
  const cuerpoL = BP.cilindro(0.7, 0.7, 3.2, 18, { tono: 'acento' });
  cuerpoL.position.y = 1.6;
  lambda.add(cuerpoL);
  const tuercaL = BP.cilindro(1.0, 1.0, 0.8, 6, { tono: 'acento' });
  tuercaL.position.y = 0.5;
  lambda.add(tuercaL);
  const conectorL = BP.caja(1.2, 0.9, 1.0, { tono: 'acento' });
  conectorL.position.y = 3.7;
  lambda.add(conectorL);
  g.add(lambda);

  g.add(BP.etiqueta('Colector de escape 4-2-1', {
    tono: 'linea',
    posicion: new THREE.Vector3(0, 14.5, 22.5)
  }));

  return BP.tag(g, {
    id: 'colector-escape',
    etiqueta: 'Colector de escape 4-2-1',
    paso: 13,
    explode: new THREE.Vector3(0, 4, 34),
    desc: info.piezas[3].desc
  });
}

// ---------------------------------------------------------------------------
// FLECHAS DE FLUJO (no son piezas montables: cuelgan del Group raiz)
// ---------------------------------------------------------------------------

// Un cono que viaja hacia +Z, con su estela discontinua fija detras.
function conoFlujo(x, y, z0, fase, tono) {
  const g = BP.G('cono-flujo');
  const cono = BP.cilindro(0, 0.62, 1.7, 14, { tono: tono });
  BP.ejeZ(cono);                            // la punta pasa a mirar hacia +Z
  g.add(cono);
  g.position.set(x, y, z0);
  g.userData.esConoFlujo = true;
  g.userData.z0 = z0;
  g.userData.fase = fase;
  return g;
}

function grupoFlujo(nombre, y, z0, tono) {
  const g = BP.G(nombre);
  g.visible = false;                        // motion() las enciende

  for (let i = 0; i < 4; i++) {
    const x = CIL_X[i];
    // Estela fija.
    g.add(BP.lineaEje(
      new THREE.Vector3(x, y, z0 - 1.0),
      new THREE.Vector3(x, y, z0 + FLUJO_RECORRIDO + 1.4)
    ));
    // El desfase sigue el orden de encendido, para que las flechas pulsen
    // como lo hace el motor.
    const posicion = K.MOTOR.ordenEncendido.indexOf(i + 1);
    g.add(conoFlujo(x, y, z0, (posicion * FLUJO_RECORRIDO) / 4, tono));
  }

  return g;
}

// ---------------------------------------------------------------------------
// CONSTRUCCION
// ---------------------------------------------------------------------------

// ctx = { THREE, BP, K }. Son exactamente los mismos modulos que se importan
// arriba (importmap -> una sola instancia), asi que se usan los del import.
export function build(ctx) {
  void ctx;

  const g = BP.G('mod-admision');

  g.add(colectorAdmision());
  g.add(mariposa());
  g.add(inyectores());
  g.add(colectorEscape());

  g.add(grupoFlujo('flujo-admision', ADM_BOCA_Y, FLUJO_ADM_Z0, 'linea'));
  g.add(grupoFlujo('flujo-escape', ESC_BOCA_Y, FLUJO_ESC_Z0, 'caliente'));

  return g;
}

// ---------------------------------------------------------------------------
// ANIMACION
// ---------------------------------------------------------------------------

// Busca una sola vez todo lo que motion() necesita y lo guarda en el grupo.
function cacheMovimiento(grupo) {
  let c = grupo.userData.movimiento;
  if (c) return c;

  c = {
    disco: grupo.getObjectByName('disco-mariposa'),
    flujoAdmision: grupo.getObjectByName('flujo-admision'),
    flujoEscape: grupo.getObjectByName('flujo-escape'),
    inyectores: [],
    conos: []
  };

  for (let i = 0; i < 4; i++) {
    const obj = grupo.getObjectByName('inyector-' + (i + 1));
    if (obj) c.inyectores.push({ obj: obj, y0: obj.position.y, apertura: INY_APERTURA[i] });
  }

  for (const f of [c.flujoAdmision, c.flujoEscape]) {
    if (!f) continue;
    f.traverse((o) => {
      if (o.userData && o.userData.esConoFlujo) c.conos.push(o);
    });
  }

  grupo.userData.movimiento = c;
  return c;
}

export function motion(grupo, state) {
  if (!grupo || !state) return;
  const c = cacheMovimiento(grupo);

  const rpm = acotar(Number(state.rpm) || 600, 600, 7000);
  const enMarcha = !!state.enMarcha;
  const tiempo = Number(state.tiempo) || 0;

  // --- mariposa: de 20 grados (ralenti) a 88 grados (plena carga) ----------
  if (c.disco) {
    const carga = (rpm - 600) / 6400;
    c.disco.rotation.x = (20 + carga * 68) * GRADO;
  }

  // --- flechas de flujo ----------------------------------------------------
  if (c.flujoAdmision) c.flujoAdmision.visible = enMarcha;
  if (c.flujoEscape) c.flujoEscape.visible = enMarcha;

  if (enMarcha) {
    const velocidad = 5 + (rpm / 7000) * 22;      // cm/s
    for (const cono of c.conos) {
      const avance = (tiempo * velocidad + cono.userData.fase) % FLUJO_RECORRIDO;
      cono.position.z = cono.userData.z0 + (avance < 0 ? avance + FLUJO_RECORRIDO : avance);
    }
  }

  // --- inyectores: un pequeno retroceso en cada inyeccion ------------------
  // Se reutiliza el perfil senoidal de alzadaValvula sobre el ciclo de 720
  // grados, asi que el movimiento entra y sale suave en vez de dar un salto.
  for (const iny of c.inyectores) {
    const golpe = enMarcha
      ? K.alzadaValvula(state.anguloCiguenal || 0, iny.apertura, INY_DURACION, INY_CARRERA)
      : 0;
    iny.obj.position.y = iny.y0 - golpe;
  }
}
