// js/parts/ciguenal.js
// ---------------------------------------------------------------------------
// CIGUENAL, COJINETES DE BANCADA, VOLANTE MOTOR Y POLEA DE ACCESORIOS.
//
// Pasos de montaje que cubre este modulo:
//    1 - Ciguenal y cojinetes de bancada
//   10 - Polea de ciguenal (acordado con distribucion.js, que NO la modela)
//   11 - Volante motor y corona de arranque
//
// Ejes del proyecto:
//   X = eje del ciguenal (-X frontal / distribucion, +X trasero / volante)
//   Y = vertical (Y = 0 es justamente el eje del ciguenal)
//   Z = transversal (-Z admision, +Z escape).  1 unidad = 1 cm.
//
// SIGNO DE LA ROTACION (critico: si se equivoca, las bielas se despegan de las
// munequillas). La geometria se construye con el ciguenal en el angulo 0, es
// decir, colocando cada munequilla en K.posMunequilla(0, i). Una rotacion
// POSITIVA alrededor de X transforma (y, z) en:
//      y' = y*cos(t) - z*sin(t)
//      z' = y*sin(t) + z*cos(t)
// Partiendo de (y, z) = (r*cos(a0), r*sin(a0)) se obtiene
//      (y', z') = (r*cos(a0 + t), r*sin(a0 + t)) = K.posMunequilla(t, i)
// que es exactamente la formula de kinematics.js. Por tanto el signo correcto
// es POSITIVO y sin negar:  ciguenal-giro.rotation.x = state.anguloCiguenal.
// (Coincide con el "COROLARIO UTIL" documentado en js/kinematics.js.)
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import * as BP from '../blueprint.js';
import * as K from '../kinematics.js';

// --- Cotas propias de este modulo (las generales vienen de K.MOTOR) ---------

const R_APOYO = 2.7;        // radio de los apoyos de bancada (diam 5.4)
const ANCHO_APOYO = 3.2;
const APOYOS_X = [-19.2, -9.6, 0, 9.6, 19.2];

const R_MUNEQUILLA = 2.4;   // diam 4.8
const ANCHO_MUNEQUILLA = 3.0;

const ESPESOR_BRAZO = 1.6;
const R_CONTRAPESO = 6.2;
const R_CUELLO = 3.0;       // radio del cuello del brazo alrededor de la munequilla
const OFFSET_BRAZO = 2.35;  // distancia del centro de la munequilla al centro del brazo

const R_MORRO = 1.6;        // diam 3.2, de X = -21 a X = -27
const R_BRIDA = 4.5;        // diam 9.0, de X = +21 a X = +23
const R_TALADROS_BRIDA = 3.2;
const R_TALADRO = 0.5;      // diam 1.0

const X_VOLANTE = 24.2;
const R_VOLANTE = 14.0;     // diam 28
const ESPESOR_VOLANTE = 2.4;
const R_CORONA = 15.0;      // diam exterior 30

const X_POLEA = -26.25;     // polea de X = -25.5 a X = -27
const ESPESOR_POLEA = 1.5;
const R_POLEA = 7.0;        // diam 14

const SEG = 28;             // segmentos radiales de los solidos principales
const SEG_FINO = 24;        // para anillos y piezas pequenas
const SEG_TALADRO = 12;     // taladros: pocos segmentos, son muchos

// ---------------------------------------------------------------------------
// METADATOS PARA LA UI
// ---------------------------------------------------------------------------

export const info = {
  id: 'ciguenal',
  titulo: 'Ciguenal, volante y polea',
  piezas: [
    {
      id: 'ciguenal',
      etiqueta: 'Ciguenal',
      paso: 1,
      desc: 'Ciguenal forjado de 5 apoyos y 4 munequillas, radio de manivela 4.3 cm ' +
            '(carrera 8.6). Contrapesos a radio 6.2 y taladros de engrase desde los ' +
            'apoyos hasta las munequillas.'
    },
    {
      id: 'cojinetes-bancada',
      etiqueta: 'Cojinetes de bancada',
      paso: 1,
      desc: 'Los 5 semicojinetes superiores, alojados en el bloque. Son fijos: el ' +
            'ciguenal gira dentro de ellos.'
    },
    {
      id: 'polea-ciguenal',
      etiqueta: 'Polea de ciguenal',
      paso: 10,
      desc: 'Polea de accesorios de 6 acanaladuras con amortiguador torsional y ' +
            'marca de PMS, montada en el morro del ciguenal.'
    },
    {
      id: 'volante',
      etiqueta: 'Volante motor',
      paso: 11,
      desc: 'Volante de inercia de 28 cm atornillado a la brida trasera, con cara de ' +
            'embrague y corona de arranque de 30 cm.'
    }
  ]
};

// ---------------------------------------------------------------------------
// AYUDAS INTERNAS
// ---------------------------------------------------------------------------

// Solido de revolucion con el eje en X, centrado en (x, y, z).
function revolucionX(hijo, x, y, z) {
  BP.ejeX(hijo);
  hijo.position.set(x, y || 0, z || 0);
  return hijo;
}

// Varilla fina entre dos puntos (taladros de engrase, ejes de referencia...).
// Pocos segmentos a proposito: son hilos, no solidos.
function varilla(a, b, radio, opts) {
  const cfg = Object.assign({}, opts);
  const dir = new THREE.Vector3().subVectors(b, a);
  const largo = dir.length();
  const g = BP.G(cfg.nombre || 'varilla');
  if (largo < 1e-4) return g;
  cfg.nombre = g.name + '-cuerpo';   // nombres unicos: el grupo y su solido
  g.add(BP.cilindro(radio, radio, largo, 8, cfg));
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
  g.position.copy(a).addScaledVector(dir, 0.5);
  return g;
}

// Corona de taladros pasantes paralelos a X, en un circulo de radio 'radio'.
function taladrosEnCorona(grupo, x, largo, radio, cantidad, prefijo) {
  for (let k = 0; k < cantidad; k++) {
    const a = (k / cantidad) * Math.PI * 2;
    const t = BP.cilindro(R_TALADRO, R_TALADRO, largo, SEG_TALADRO, {
      tono: 'tenue',
      solido: false,
      nombre: prefijo + '-' + (k + 1)
    });
    grupo.add(revolucionX(t, x, radio * Math.cos(a), radio * Math.sin(a)));
  }
}

// ---------------------------------------------------------------------------
// PASO 1 - CIGUENAL
// ---------------------------------------------------------------------------

// Perfil de un brazo/contrapeso en el plano de la seccion.
// Coordenadas del Shape: u (horizontal) y v (vertical). Al extruirlo y girarlo
// 90 grados sobre Y, v pasa a ser +Y y la profundidad pasa a ser +X.
// El lobulo del cuello envuelve la munequilla (arriba, en +v) y la masa del
// contrapeso queda en el lado OPUESTO (abajo, en -v), a radio 6.2.
function perfilBrazo() {
  const d = K.MOTOR.radioManivela;          // 4.3, excentricidad de la munequilla
  const gr = Math.PI / 180;
  const a0 = 200 * gr;                      // inicio del arco del contrapeso
  const a1 = 340 * gr;                      // fin del arco del contrapeso
  const b0 = -20 * gr;                      // inicio del arco del cuello
  const b1 = 200 * gr;                      // fin del arco del cuello

  const s = new THREE.Shape();
  // Lado derecho: del borde del contrapeso hasta el cuello.
  s.moveTo(R_CONTRAPESO * Math.cos(a1), R_CONTRAPESO * Math.sin(a1));
  s.lineTo(R_CUELLO * Math.cos(b0), d + R_CUELLO * Math.sin(b0));
  // Cuello alrededor de la munequilla.
  s.absarc(0, d, R_CUELLO, b0, b1, false);
  // Lado izquierdo: del cuello al contrapeso.
  s.lineTo(R_CONTRAPESO * Math.cos(a0), R_CONTRAPESO * Math.sin(a0));
  // Masa del contrapeso.
  s.absarc(0, 0, R_CONTRAPESO, a0, a1, false);
  return s;
}

const SHAPE_BRAZO = perfilBrazo();

// Un brazo: placa de 1.6 de espesor centrada en xCentro y girada el angulo de
// manivela del cilindro al que pertenece.
function brazo(xCentro, angulo, nombre) {
  const g = BP.G(nombre);
  const placa = BP.extrusion(SHAPE_BRAZO, { depth: ESPESOR_BRAZO, curveSegments: 10 }, {
    nombre: nombre + '-placa'
  });
  placa.rotation.y = Math.PI / 2;           // el espesor pasa a ir a lo largo de X
  placa.position.x = -ESPESOR_BRAZO / 2;    // y queda centrado
  g.add(placa);
  g.position.x = xCentro;
  g.rotation.x = angulo;                    // 0 para los cilindros 1 y 4, PI para 2 y 3
  return g;
}

function construirCiguenal() {
  // Pieza montable (no gira: el asssembly la desplaza con su explode).
  const pieza = BP.G('ciguenal');
  // Hijo que realmente rota, centrado en el origen y sobre el eje X.
  const giro = BP.G('ciguenal-giro');
  pieza.add(giro);

  // --- 5 apoyos de bancada -------------------------------------------------
  APOYOS_X.forEach((x, k) => {
    const a = BP.cilindro(R_APOYO, R_APOYO, ANCHO_APOYO, SEG, { nombre: 'apoyo-' + (k + 1) });
    giro.add(revolucionX(a, x, 0, 0));
  });

  // --- 4 munequillas de biela ----------------------------------------------
  // La posicion sale de la propia cinematica, para que el desfase sea
  // EXACTAMENTE el que usan pistones.js y las bielas.
  for (let i = 0; i < 4; i++) {
    const p = K.posMunequilla(0, i);
    const x = K.MOTOR.cilindrosX[i];
    const m = BP.cilindro(R_MUNEQUILLA, R_MUNEQUILLA, ANCHO_MUNEQUILLA, SEG, {
      nombre: 'munequilla-' + (i + 1)
    });
    giro.add(revolucionX(m, x, p.y, p.z));
  }

  // --- 8 brazos / contrapesos ----------------------------------------------
  for (let i = 0; i < 4; i++) {
    const x = K.MOTOR.cilindrosX[i];
    const ang = K.anguloCilindro(0, i);     // 0 o PI, el mismo que la munequilla
    giro.add(brazo(x - OFFSET_BRAZO, ang, 'brazo-' + (i + 1) + '-del'));
    giro.add(brazo(x + OFFSET_BRAZO, ang, 'brazo-' + (i + 1) + '-tra'));
  }

  // --- Taladros de engrase: del apoyo anterior a cada munequilla ------------
  for (let i = 0; i < 4; i++) {
    const p = K.posMunequilla(0, i);
    const desde = new THREE.Vector3(APOYOS_X[i], 0, 0);
    const hasta = new THREE.Vector3(K.MOTOR.cilindrosX[i], p.y, p.z);
    giro.add(varilla(desde, hasta, 0.3, {
      tono: 'tenue',
      solido: false,
      nombre: 'taladro-engrase-' + (i + 1)
    }));
  }

  // --- Morro delantero (X -21 .. -27) --------------------------------------
  const morro = BP.cilindro(R_MORRO, R_MORRO, 6.0, SEG_FINO, { nombre: 'morro-ciguenal' });
  giro.add(revolucionX(morro, -24, 0, 0));

  // Acuerdo conico entre el apoyo delantero y el morro.
  const acuerdoDel = BP.cilindro(R_APOYO, R_MORRO, 0.7, SEG_FINO, { nombre: 'acuerdo-morro' });
  giro.add(revolucionX(acuerdoDel, -21.1, 0, 0));

  // Chavetero del morro (arrastre de la polea y del pinon de distribucion).
  const chavetero = BP.caja(2.0, 0.45, 0.6, { tono: 'acento', nombre: 'chavetero-morro' });
  chavetero.position.set(-25.2, R_MORRO - 0.15, 0);
  giro.add(chavetero);

  // --- Brida trasera (X +21 .. +23) ----------------------------------------
  const brida = BP.cilindro(R_BRIDA, R_BRIDA, 2.0, SEG, { nombre: 'brida-volante' });
  giro.add(revolucionX(brida, 22, 0, 0));

  const acuerdoTra = BP.cilindro(R_BRIDA, R_APOYO, 0.7, SEG_FINO, { nombre: 'acuerdo-brida' });
  giro.add(revolucionX(acuerdoTra, 20.7, 0, 0));

  // 6 taladros de diam 1.0 en circulo de radio 3.2.
  taladrosEnCorona(giro, 22, 2.2, R_TALADROS_BRIDA, 6, 'taladro-brida');

  // Alojamiento del cojinete piloto, en el centro de la brida.
  const piloto = BP.cilindro(1.0, 1.0, 1.0, SEG_TALADRO, {
    tono: 'tenue', solido: false, nombre: 'alojamiento-piloto'
  });
  giro.add(revolucionX(piloto, 22.6, 0, 0));

  return BP.tag(pieza, {
    id: 'ciguenal',
    etiqueta: 'Ciguenal',
    paso: 1,
    explode: new THREE.Vector3(0, -30, 0),
    desc: info.piezas[0].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 1 - SEMICOJINETES SUPERIORES DE BANCADA (no giran)
// ---------------------------------------------------------------------------

// Medio anillo (mitad superior) en el plano de la seccion.
function perfilSemicojinete(rExt, rInt) {
  const s = new THREE.Shape();
  s.moveTo(rExt, 0);
  s.absarc(0, 0, rExt, 0, Math.PI, false);
  s.lineTo(-rInt, 0);
  s.absarc(0, 0, rInt, Math.PI, 0, true);
  s.lineTo(rExt, 0);
  return s;
}

function construirCojinetes() {
  const pieza = BP.G('cojinetes-bancada');
  // Pared de 0.15, a caballo del radio nominal del apoyo (2.7): el casquillo
  // abraza el munon en vez de quedar dentro de el.
  const shape = perfilSemicojinete(2.78, 2.63);

  APOYOS_X.forEach((x, k) => {
    const c = BP.extrusion(shape, { depth: 3.0, curveSegments: 14 }, {
      tono: 'acento',
      nombre: 'semicojinete-' + (k + 1)
    });
    c.rotation.y = Math.PI / 2;
    c.position.x = x - 1.5;
    pieza.add(c);
  });

  pieza.add(BP.etiqueta('Cojinetes de bancada', {
    tono: 'acento',
    posicion: new THREE.Vector3(-9.6, 4.2, 0)
  }));

  return BP.tag(pieza, {
    id: 'cojinetes-bancada',
    etiqueta: 'Cojinetes de bancada',
    paso: 1,
    explode: new THREE.Vector3(0, -22, 0),
    desc: info.piezas[1].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 11 - VOLANTE MOTOR Y CORONA DE ARRANQUE
// ---------------------------------------------------------------------------

// Dientes "insinuados" de la corona: 60 marcas axiales en la superficie
// exterior. Una sola LineSegments con el material compartido: modelar los
// dientes de verdad dispararia el numero de aristas.
function dientesCorona(radio, x0, x1, cantidad) {
  const pts = [];
  for (let k = 0; k < cantidad; k++) {
    const a = (k / cantidad) * Math.PI * 2;
    const y = radio * Math.cos(a);
    const z = radio * Math.sin(a);
    pts.push(new THREE.Vector3(x0, y, z), new THREE.Vector3(x1, y, z));
  }
  const ls = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), BP.MAT.acento);
  ls.name = 'dientes-corona';
  ls.renderOrder = 2;
  return ls;
}

function construirVolante() {
  const pieza = BP.G('volante');
  const giro = BP.G('volante-giro');   // origen en el eje del ciguenal
  pieza.add(giro);

  // Disco principal: diam 28, espesor 2.4, de X = 23.0 a X = 25.4.
  const disco = BP.cilindro(R_VOLANTE, R_VOLANTE, ESPESOR_VOLANTE, SEG, { nombre: 'disco-volante' });
  giro.add(revolucionX(disco, X_VOLANTE, 0, 0));

  // Rebaje central mecanizado en la cara de la brida.
  const rebaje = BP.cilindro(5.0, 5.0, 0.5, SEG_FINO, {
    tono: 'tenue', solido: false, nombre: 'rebaje-volante'
  });
  giro.add(revolucionX(rebaje, 23.25, 0, 0));

  // 6 taladros de fijacion, alineados con los de la brida del ciguenal.
  taladrosEnCorona(giro, X_VOLANTE, 2.6, R_TALADROS_BRIDA, 6, 'taladro-volante');

  // Cara de embrague: corona plana rectificada en la cara trasera.
  const embrague = BP.tubo(11.6, 6.2, 0.4, SEG, { nombre: 'cara-embrague' });
  giro.add(revolucionX(embrague, 25.2, 0, 0));

  // Corona de arranque calada en la llanta del volante (diam ext 30).
  const corona = BP.tubo(R_CORONA, R_VOLANTE, 1.7, SEG, { tono: 'acento', nombre: 'corona-arranque' });
  giro.add(revolucionX(corona, X_VOLANTE, 0, 0));
  giro.add(dientesCorona(R_CORONA + 0.03, X_VOLANTE - 0.85, X_VOLANTE + 0.85, 60));

  pieza.add(BP.etiqueta('Volante motor y corona de arranque', {
    posicion: new THREE.Vector3(X_VOLANTE, R_CORONA + 2.4, 0)
  }));

  return BP.tag(pieza, {
    id: 'volante',
    etiqueta: 'Volante motor',
    paso: 11,
    explode: new THREE.Vector3(30, 0, 0),
    desc: info.piezas[3].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 10 - POLEA DE CIGUENAL CON AMORTIGUADOR TORSIONAL
// ---------------------------------------------------------------------------

function construirPolea() {
  const pieza = BP.G('polea-ciguenal');
  const giro = BP.G('polea-giro');     // origen en el eje del ciguenal
  pieza.add(giro);

  // Cubo montado sobre el morro (diam 3.2).
  const cubo = BP.cilindro(2.6, 2.6, ESPESOR_POLEA, SEG_FINO, { nombre: 'polea-cubo' });
  giro.add(revolucionX(cubo, X_POLEA, 0, 0));

  // Disco de union cubo-llanta, mas fino.
  const disco = BP.tubo(5.6, 2.6, 0.9, SEG, { nombre: 'polea-disco' });
  giro.add(revolucionX(disco, X_POLEA, 0, 0));

  // Llanta exterior: masa de inercia del amortiguador torsional (diam 14).
  const llanta = BP.tubo(R_POLEA, 5.6, ESPESOR_POLEA, SEG, {
    tono: 'acento', nombre: 'polea-llanta'
  });
  giro.add(revolucionX(llanta, X_POLEA, 0, 0));

  // 6 acanaladuras de la correa de accesorios, repartidas en el espesor.
  for (let k = 0; k < 6; k++) {
    const x = -25.65 - k * 0.25;
    const anillo = BP.tubo(R_POLEA + 0.06, R_POLEA - 0.14, 0.14, SEG_FINO, {
      nombre: 'acanaladura-' + (k + 1)
    });
    giro.add(revolucionX(anillo, x, 0, 0));
  }

  // Marca de PMS grabada en la llanta.
  const marca = BP.caja(1.4, 0.5, 0.26, { tono: 'acento', nombre: 'marca-pms' });
  marca.position.set(X_POLEA, R_POLEA - 0.1, 0);
  giro.add(marca);

  pieza.add(BP.etiqueta('Polea de ciguenal', {
    posicion: new THREE.Vector3(X_POLEA, R_POLEA + 2.2, 0)
  }));

  return BP.tag(pieza, {
    id: 'polea-ciguenal',
    etiqueta: 'Polea de ciguenal',
    paso: 10,
    explode: new THREE.Vector3(-30, 0, 0),
    desc: info.piezas[2].desc
  });
}

// ---------------------------------------------------------------------------
// ANOTACIONES DEL PLANO (siempre visibles: no llevan tag ni se desmontan)
// ---------------------------------------------------------------------------

function construirAnotaciones() {
  const g = BP.G('eje-ciguenal');

  // Eje de giro del ciguenal.
  g.add(BP.lineaEje(new THREE.Vector3(-30, 0, 0), new THREE.Vector3(30, 0, 0), {
    nombre: 'eje-ciguenal-linea'
  }));

  // Separacion entre munequillas consecutivas (9.6).
  g.add(BP.cota(
    new THREE.Vector3(K.MOTOR.cilindrosX[0], -6.6, 0),
    new THREE.Vector3(K.MOTOR.cilindrosX[1], -6.6, 0),
    'Separacion 9.6',
    { eje: 'y', desplazamiento: -4, nombre: 'cota-separacion' }
  ));

  // Carrera: dos veces el radio de manivela (2 x 4.3 = 8.6).
  const r = K.MOTOR.radioManivela;
  g.add(BP.cota(
    new THREE.Vector3(K.MOTOR.cilindrosX[0], -r, 0),
    new THREE.Vector3(K.MOTOR.cilindrosX[0], r, 0),
    'Carrera 8.6',
    { eje: 'z', desplazamiento: -13, nombre: 'cota-carrera' }
  ));

  g.add(BP.etiqueta('Ciguenal - 5 apoyos', {
    posicion: new THREE.Vector3(0, -7.4, -5.0)
  }));

  return g;
}

// ---------------------------------------------------------------------------
// CONSTRUCCION DEL MODULO
// ---------------------------------------------------------------------------

/**
 * ctx = { THREE, BP, K }. Se acepta por contrato, pero el modulo usa
 * directamente sus propios imports, que son los mismos modulos.
 */
export function build(ctx) {
  void ctx;
  const raiz = BP.G('mod-ciguenal');
  raiz.add(construirCiguenal());
  raiz.add(construirCojinetes());
  raiz.add(construirPolea());
  raiz.add(construirVolante());
  raiz.add(construirAnotaciones());
  return raiz;
}

// ---------------------------------------------------------------------------
// ANIMACION
// ---------------------------------------------------------------------------

export function motion(group, state) {
  let cache = group.userData.cacheCiguenal;
  if (!cache) {
    cache = group.userData.cacheCiguenal = {
      ciguenal: group.getObjectByName('ciguenal-giro'),
      volante: group.getObjectByName('volante-giro'),
      polea: group.getObjectByName('polea-giro')
    };
  }

  // Signo POSITIVO: ver la explicacion de la cabecera del fichero. Con la
  // geometria construida en K.posMunequilla(0, i), esta rotacion lleva cada
  // munequilla a K.posMunequilla(state.anguloCiguenal, i), que es donde
  // pistones.js espera encontrarla.
  const ang = (state && state.anguloCiguenal) || 0;

  if (cache.ciguenal) cache.ciguenal.rotation.x = ang;
  if (cache.volante) cache.volante.rotation.x = ang;
  if (cache.polea) cache.polea.rotation.x = ang;
}
