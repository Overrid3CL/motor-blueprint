// js/parts/bloque.js
// ---------------------------------------------------------------------------
// BLOQUE MOTOR, TAPAS DE BANCADA Y SISTEMA DE LUBRICACION
//
// Pasos de montaje que cubre este modulo:
//    0  Bloque motor y camisas
//    2  Tapas de bancada y tornilleria
//    4  Bomba de aceite, colador y carter
//
// Convenio de ejes del proyecto (1 unidad = 1 cm):
//    X = eje del ciguenal (-X frontal / distribucion, +X trasero / volante)
//    Y = vertical, eje de los cilindros. Y = 0 es el EJE DEL CIGUENAL.
//    Z = transversal (-Z admision, +Z escape)
//
// Todo se construye YA EN SU POSICION FINAL DE MONTAJE. El sistema de
// ensamblado desplaza cada pieza usando el vector 'explode' de su BP.tag().
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import * as BP from '../blueprint.js';
import * as K from '../kinematics.js';

// ---------------------------------------------------------------------------
// COTAS LOCALES (derivadas de la tabla de cotas del proyecto)
// ---------------------------------------------------------------------------

const CIL_X = K.MOTOR.cilindrosX;          // [-14.4, -4.8, 4.8, 14.4]
const DECK_Y = K.MOTOR.deckY;              // 22.0  plano de culata
const FONDO_Y = K.MOTOR.fondoBloqueY;      // -9.0  cara inferior del bloque

const BLOQUE_X = 21.0;                     // semilongitud del bloque en X
const BLOQUE_Z = 10.5;                     // semianchura del bloque en Z
const FALDA_Y = 6.5;                       // cota donde acaban las camisas
const APOYOS_X = [-19.2, -9.6, 0, 9.6, 19.2]; // 5 apoyos de bancada
const R_APOYO = 2.7;                       // radio del munon de bancada (diam 5.4)
const R_ALOJA = 2.78;                      // radio del alojamiento (munon + semicojinete)
const R_CASQ_INT = 2.63;                   // radio interior del semicojinete
const Z_REGISTRO = 3.35;                   // semianchura del registro de la tapa de bancada
const R_CAMISA_EXT = 4.9;                  // camisa: diam ext 9.8
const R_CAMISA_INT = 4.3;                  // camisa: diam int 8.6 (el cilindro)
const ESP_MAMPARO = 2.0;                   // espesor en X de mamparos y tapas de bancada
const ANCHO_CASQ = 3.0;                    // ancho en X de los semicojinetes (igual que ciguenal.js)

const SEG = 28;                            // segmentos radiales de las piezas grandes
const SEG_MEDIO = 16;                      // piezas medianas
const SEG_CHICO = 12;                      // taladros y tornilleria (presupuesto de aristas)

const RELACION_BOMBA = 0.06;               // la bomba gira MUY despacio: es un guino, no una simulacion

// ---------------------------------------------------------------------------
// METADATOS PARA LA UI
// ---------------------------------------------------------------------------

export const info = {
  id: 'bloque',
  titulo: 'Bloque y lubricacion',
  piezas: [
    {
      id: 'bloque',
      etiqueta: 'Bloque motor',
      paso: 0,
      desc: 'Bloque de 4 cilindros en linea con camisas humedas, cubierta de agua, 5 mamparos de bancada y galeria principal de aceite.'
    },
    {
      id: 'tapas-bancada',
      etiqueta: 'Tapas de bancada',
      paso: 2,
      desc: 'Las 5 tapas de bancada con sus semicasquillos y dos tornillos por tapa. Cierran los apoyos del ciguenal.'
    },
    {
      id: 'bomba-aceite',
      etiqueta: 'Bomba de aceite',
      paso: 4,
      desc: 'Bomba de engranajes alojada en la zona frontal del carter, arrastrada desde el morro del ciguenal.'
    },
    {
      id: 'colador',
      etiqueta: 'Colador y tubo de aspiracion',
      paso: 4,
      desc: 'Tubo de aspiracion desde la bomba hasta el colador, sumergido en la zona profunda del carter.'
    },
    {
      id: 'carter',
      etiqueta: 'Carter de aceite',
      paso: 4,
      desc: 'Carter con brida perimetral de 14 tornillos, faldon inclinado y bandeja profunda trasera con tapon de vaciado.'
    }
  ]
};

// ---------------------------------------------------------------------------
// AYUDAS DE PERFILES EXTRUIDOS
//
// BP.extrusion() extruye un THREE.Shape (dibujado en el plano XY de la
// geometria) a lo largo de +Z. Estas dos funciones colocan el resultado en el
// plano que interesa sin tener que pensar en rotaciones:
//
//   losa()    -> perfil dibujado en (worldX, worldZ), espesor hacia abajo
//                desde 'yTecho'.  Para el deck, las paredes, las bridas...
//   placaYZ() -> perfil dibujado en (worldZ, worldY), espesor en X centrado
//                en 'xCentro'.   Para mamparos, tapas de bancada, testeros...
// ---------------------------------------------------------------------------

function losa(shape, espesor, yTecho, opts = {}, curva = SEG_MEDIO) {
  const g = BP.extrusion(shape, { depth: espesor, curveSegments: curva }, opts);
  g.rotation.x = Math.PI / 2;   // (sx, sy, sz) -> (sx, -sz, sy)
  g.position.y = yTecho;
  return g;
}

function placaYZ(shape, espesor, xCentro, opts = {}, curva = SEG_MEDIO) {
  const g = BP.extrusion(shape, { depth: espesor, curveSegments: curva }, opts);
  g.rotation.y = -Math.PI / 2;  // (sx, sy, sz) -> (-sz, sy, sx)
  g.position.x = xCentro + espesor / 2;
  return g;
}

// Rectangulo con las cuatro esquinas achaflanadas.
function rectChaflan(x0, x1, y0, y1, ch) {
  const s = new THREE.Shape();
  s.moveTo(x0 + ch, y0);
  s.lineTo(x1 - ch, y0);
  s.lineTo(x1, y0 + ch);
  s.lineTo(x1, y1 - ch);
  s.lineTo(x1 - ch, y1);
  s.lineTo(x0 + ch, y1);
  s.lineTo(x0, y1 - ch);
  s.lineTo(x0, y0 + ch);
  s.closePath();
  return s;
}

function agujeroCirc(shape, cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  shape.holes.push(p);
  return shape;
}

function agujeroRect(shape, x0, x1, y0, y1) {
  const p = new THREE.Path();
  p.moveTo(x0, y0);
  p.lineTo(x0, y1);
  p.lineTo(x1, y1);
  p.lineTo(x1, y0);
  p.closePath();
  shape.holes.push(p);
  return shape;
}

// Coloca un objeto y le pone nombre de un tiron.
function en(obj, x, y, z, nombre) {
  obj.position.set(x, y, z);
  if (nombre) obj.name = nombre;
  return obj;
}

// ===========================================================================
// PASO 0 - BLOQUE MOTOR
// ===========================================================================

// Plano de culata: losa achaflanada con las 4 bocas de cilindro.
// Las bocas se dejan a radio 5.1 (algo mayor que la camisa) para que se lea
// el paso de agua alrededor de cada camisa.
function deck() {
  const s = rectChaflan(-BLOQUE_X - 0.6, BLOQUE_X + 0.6, -BLOQUE_Z - 0.4, BLOQUE_Z + 0.4, 1.4);
  for (const x of CIL_X) agujeroCirc(s, x, 0, 5.1);
  return losa(s, 1.6, DECK_Y, { nombre: 'bloque-deck' }, 24);
}

// Los 10 taladros de tornillo de culata (2 por lado de cada cilindro, uno en
// cada apoyo de bancada) dibujados como avellanados pasantes, mas los
// taladros de refrigeracion y de aceite del plano de culata.
function taladrosDeck() {
  const g = BP.G('bloque-taladros-deck');

  for (const x of APOYOS_X) {
    for (const z of [-7.4, 7.4]) {
      const t = BP.cilindro(0.95, 0.55, 1.62, 14, { tono: 'tenue', solido: false });
      g.add(en(t, x, DECK_Y - 0.81, z));
    }
  }

  // Taladros de refrigeracion entre cilindros.
  for (const x of [-9.6, 0, 9.6]) {
    for (const z of [-8.9, 8.9]) {
      const t = BP.cilindro(0.4, 0.4, 1.62, 10, { tono: 'tenue', solido: false });
      g.add(en(t, x, DECK_Y - 0.81, z));
    }
  }

  // Subidas de aceite a la culata (alimentan los arboles de levas).
  for (const x of [-19.2, 19.2]) {
    const t = BP.cilindro(0.5, 0.5, 1.62, 10, { tono: 'acento', solido: false });
    g.add(en(t, x, DECK_Y - 0.81, -9.2));
  }

  return g;
}

// Paredes exteriores del banco de cilindros: una losa hueca (marco), no un
// ladrillo macizo. Deja ver las camisas y la cubierta de agua del interior.
function paredesBanco() {
  const s = rectChaflan(-BLOQUE_X, BLOQUE_X, -BLOQUE_Z, BLOQUE_Z, 1.2);
  agujeroRect(s, -BLOQUE_X + 1.8, BLOQUE_X - 1.8, -BLOQUE_Z + 1.8, BLOQUE_Z - 1.8);
  return losa(s, DECK_Y - 1.6 - FALDA_Y, DECK_Y - 1.6, { nombre: 'bloque-paredes' }, 8);
}

// Las 4 camisas: tubos de 9.8 / 8.6 desde el deck hasta Y = 6.5.
function camisas() {
  const g = BP.G('bloque-camisas');
  const alto = DECK_Y - FALDA_Y;               // 15.5
  const yc = (DECK_Y + FALDA_Y) / 2;           // 14.25
  for (let i = 0; i < CIL_X.length; i++) {
    const c = BP.tubo(R_CAMISA_EXT, R_CAMISA_INT, alto, SEG, { nombre: 'camisa-' + (i + 1) });
    g.add(en(c, CIL_X[i], yc, 0));
  }
  return g;
}

// Cubierta de agua: solo aristas, para sugerir el volumen de refrigerante que
// rodea las camisas sin tapar nada.
function cubiertaAgua() {
  const s = rectChaflan(-19.0, 19.0, -8.5, 8.5, 1.0);
  for (const x of CIL_X) agujeroCirc(s, x, 0, 5.45);
  return losa(s, 11.5, 20.0, { nombre: 'bloque-agua', tono: 'tenue', solido: false }, SEG_MEDIO);
}

// Nervios verticales de refuerzo en las caras laterales, alineados con los
// mamparos de bancada.
function nervios() {
  const g = BP.G('bloque-nervios');
  for (const x of APOYOS_X) {
    for (const z of [-1, 1]) {
      const n = BP.caja(1.4, 12.8, 0.7, { tono: 'tenue' });
      g.add(en(n, x, 13.4, z * (BLOQUE_Z + 0.15)));
    }
  }
  return g;
}

// Faldon: dos paredes laterales que se estrechan hacia abajo, del banco de
// cilindros (Z +-10.5) al fondo del bloque (Z +-9.4).
function faldon() {
  const g = BP.G('bloque-faldon');

  const perfil = (signo) => {
    const s = new THREE.Shape();
    s.moveTo(signo * 10.5, FALDA_Y);
    s.lineTo(signo * 9.4, FONDO_Y);
    s.lineTo(signo * 7.9, FONDO_Y);
    s.lineTo(signo * 8.9, FALDA_Y);
    s.closePath();
    return s;
  };

  g.add(placaYZ(perfil(-1), 2 * BLOQUE_X, 0, { nombre: 'faldon-admision' }, 6));
  g.add(placaYZ(perfil(1), 2 * BLOQUE_X, 0, { nombre: 'faldon-escape' }, 6));
  return g;
}

// Testeros delantero y trasero, con el paso del ciguenal (retenes).
function testeros() {
  const g = BP.G('bloque-testeros');
  for (const x of [-BLOQUE_X, BLOQUE_X - 0.8]) {
    const s = new THREE.Shape();
    s.moveTo(-10.4, FALDA_Y);
    s.lineTo(10.4, FALDA_Y);
    s.lineTo(9.4, FONDO_Y + 0.2);
    s.lineTo(-9.4, FONDO_Y + 0.2);
    s.closePath();
    agujeroCirc(s, 0, 0, 3.4);
    g.add(placaYZ(s, 0.8, x + 0.4, { nombre: 'testero' }, SEG_MEDIO));
  }
  return g;
}

// Mamparos de bancada (webs): placas transversales con el semialojamiento
// superior del apoyo (radio 2.7 centrado en el eje del ciguenal, Y = 0) y el
// registro vertical por el que entra la tapa de bancada, hasta Y = -4.2.
function mamparos() {
  const g = BP.G('bloque-mamparos');

  for (let i = 0; i < APOYOS_X.length; i++) {
    const s = new THREE.Shape();
    s.moveTo(-8.85, FALDA_Y);
    s.lineTo(8.85, FALDA_Y);
    s.lineTo(8.18, -4.2);
    s.lineTo(Z_REGISTRO, -4.2);
    s.lineTo(Z_REGISTRO, 0);        // pared del registro de la tapa
    s.lineTo(R_ALOJA, 0);           // hombro de apoyo de la tapa
    // Arco del alojamiento: de (2.78, 0) a (-2.78, 0) por arriba (0, 2.78).
    s.absarc(0, 0, R_ALOJA, 0, Math.PI, false);
    s.lineTo(-Z_REGISTRO, 0);
    s.lineTo(-Z_REGISTRO, -4.2);
    s.lineTo(-8.18, -4.2);
    s.closePath();

    const m = placaYZ(s, ESP_MAMPARO, APOYOS_X[i], { nombre: 'mamparo-' + (i + 1) }, 20);
    g.add(m);
  }

  return g;
}

// Rail inferior del bloque: la brida a la que atornilla el carter (Y = -9).
function railInferior() {
  const s = rectChaflan(-20.0, 20.0, -9.5, 9.5, 1.0);
  agujeroRect(s, -18.3, 18.3, -7.8, 7.8);
  return losa(s, 0.9, FONDO_Y + 0.9, { nombre: 'bloque-rail' }, 6);
}

// Galeria principal de aceite: taladro longitudinal, solo aristas.
function galeriaAceite() {
  const t = BP.cilindro(0.5, 0.5, 40.0, SEG_CHICO, {
    tono: 'tenue',
    solido: false,
    nombre: 'bloque-galeria'
  });
  BP.ejeX(t);
  return en(t, 0, -2.0, -7.0);
}

function construirBloque() {
  const g = BP.G('bloque');

  g.add(deck());
  g.add(taladrosDeck());
  g.add(paredesBanco());
  g.add(camisas());
  g.add(cubiertaAgua());
  g.add(nervios());
  g.add(faldon());
  g.add(testeros());
  g.add(mamparos());
  g.add(railInferior());
  g.add(galeriaAceite());

  g.add(BP.etiqueta('Bloque motor', {
    posicion: new THREE.Vector3(-6.0, 15.0, -12.6)
  }));

  return BP.tag(g, {
    id: 'bloque',
    etiqueta: 'Bloque motor',
    paso: 0,
    explode: new THREE.Vector3(0, -16, 0),
    desc: 'Bloque de fundicion con 4 camisas, cubierta de agua, 5 mamparos de bancada y galeria principal de aceite.'
  });
}

// ===========================================================================
// PASO 2 - TAPAS DE BANCADA Y TORNILLERIA
// ===========================================================================

// Cuerpo de una tapa: rectangulo de 6.6 (Z) x 3.4 (Y) con el semialojamiento
// inferior del apoyo, abierto hacia arriba. Entra justo en el registro que
// dejan los mamparos del bloque.
const TAPA_Z = 3.3;
const TAPA_H = 3.4;

function perfilTapa() {
  const s = new THREE.Shape();
  s.moveTo(-TAPA_Z, 0);
  s.lineTo(-TAPA_Z, -TAPA_H);
  s.lineTo(TAPA_Z, -TAPA_H);
  s.lineTo(TAPA_Z, 0);
  s.lineTo(R_ALOJA, 0);
  // Arco de (2.78, 0) a (-2.78, 0) pasando por abajo (0, -2.78).
  s.absarc(0, 0, R_ALOJA, 0, Math.PI, true);
  s.lineTo(-TAPA_Z, 0);
  s.closePath();
  return s;
}

// Semicasquillo inferior: media corona de 2.78 / 2.63, la misma pared que usa
// ciguenal.js para los semicojinetes superiores, para que el anillo cierre.
function perfilCasquillo() {
  const s = new THREE.Shape();
  s.moveTo(R_ALOJA, 0);
  s.absarc(0, 0, R_ALOJA, 0, Math.PI, true);              // exterior, por abajo
  s.lineTo(-R_CASQ_INT, 0);
  s.absarc(0, 0, R_CASQ_INT, Math.PI, 2 * Math.PI, false); // interior, de vuelta
  s.lineTo(R_ALOJA, 0);
  s.closePath();
  return s;
}

function construirTapasBancada() {
  const g = BP.G('tapas-bancada');

  const perfil = perfilTapa();
  const casq = perfilCasquillo();

  for (let i = 0; i < APOYOS_X.length; i++) {
    const x = APOYOS_X[i];
    const sub = BP.G('tapa-bancada-' + (i + 1));

    // Cuerpo de la tapa (mismo espesor en X que el mamparo).
    sub.add(placaYZ(perfil, ESP_MAMPARO, x, { nombre: 'tapa-cuerpo-' + (i + 1) }, 20));

    // Semicasquillo antifriccion, mas estrecho que la tapa.
    sub.add(placaYZ(casq, ANCHO_CASQ, x, { tono: 'acento', nombre: 'casquillo-' + (i + 1) }, 20));

    // Dos tornillos por tapa, separados 4.4 en Z. Entran desde abajo y suben
    // al mamparo.
    for (const z of [-2.2, 2.2]) {
      const vastago = BP.cilindro(0.6, 0.6, 7.4, SEG_CHICO, { tono: 'tenue' });
      sub.add(en(vastago, x, 0.3, z));            // de Y = -3.4 a Y = +4.0
      const cabeza = BP.cilindro(0.95, 0.95, 0.9, 6, { tono: 'tenue' });
      sub.add(en(cabeza, x, -3.85, z));           // cabeza hexagonal bajo la tapa
    }

    g.add(sub);
  }

  return BP.tag(g, {
    id: 'tapas-bancada',
    etiqueta: 'Tapas de bancada',
    paso: 2,
    explode: new THREE.Vector3(0, -18, 0),
    desc: 'Cinco tapas de bancada con semicasquillos y dos tornillos cada una. Cierran los apoyos del ciguenal contra los mamparos del bloque.'
  });
}

// ===========================================================================
// PASO 4 - LUBRICACION: BOMBA, COLADOR Y CARTER
// ===========================================================================

// Posicion de la bomba: en la zona frontal del carter, justo bajo el mamparo
// delantero. Ver las notas del final del fichero.
const BOMBA_X = -18.7;
const BOMBA_Y = -6.7;

// Engranaje insinuado: un toro con seis dientes, para que se vea girar.
function engranajeBomba(nombre) {
  const g = BP.G(nombre);

  const cuerpo = BP.toro(1.6, 0.32, { tono: 'acento' });
  BP.ejeX(cuerpo);                 // eje de giro = X
  g.add(cuerpo);

  for (let j = 0; j < 6; j++) {
    const a = (j * Math.PI * 2) / 6;
    const diente = BP.caja(0.5, 0.62, 0.42, { tono: 'acento' });
    diente.rotation.x = a;
    diente.position.set(0, 1.78 * Math.cos(a), 1.78 * Math.sin(a));
    g.add(diente);
  }

  return g;
}

function construirBombaAceite() {
  const g = BP.G('bomba-aceite');

  // Carcasa y su tapa frontal.
  g.add(en(BP.caja(2.4, 4.2, 8.4), BOMBA_X, BOMBA_Y, 0, 'bomba-carcasa'));
  g.add(en(BP.caja(0.5, 3.6, 7.6, { tono: 'tenue' }), BOMBA_X - 1.45, BOMBA_Y, 0, 'bomba-tapa'));

  // Par de engranajes engranados, girando en sentidos opuestos.
  g.add(en(engranajeBomba('bomba-engranaje-1'), BOMBA_X, BOMBA_Y, -1.95));
  g.add(en(engranajeBomba('bomba-engranaje-2'), BOMBA_X, BOMBA_Y, 1.95));

  // Tornilleria de la tapa.
  for (const z of [-3.2, 3.2]) {
    for (const y of [BOMBA_Y - 1.5, BOMBA_Y + 1.5]) {
      const t = BP.cilindro(0.3, 0.3, 0.6, 6, { tono: 'tenue' });
      BP.ejeX(t);
      g.add(en(t, BOMBA_X - 1.7, y, z));
    }
  }

  // Salida de presion hacia la galeria principal.
  const salida = BP.cilindro(0.45, 0.45, 4.6, SEG_CHICO, { tono: 'acento', solido: false });
  g.add(en(salida, BOMBA_X, BOMBA_Y + 2.3, -3.4, 'bomba-salida'));

  g.add(BP.etiqueta('Bomba de aceite', {
    tono: 'acento',
    posicion: new THREE.Vector3(BOMBA_X - 2.6, BOMBA_Y - 1.4, -6.0)
  }));

  return BP.tag(g, {
    id: 'bomba-aceite',
    etiqueta: 'Bomba de aceite',
    paso: 4,
    explode: new THREE.Vector3(0, -26, 0),
    desc: 'Bomba de engranajes de dos rotores, arrastrada desde el morro del ciguenal. Envia el aceite a la galeria principal.'
  });
}

function construirColador() {
  const g = BP.G('colador');

  const xColador = 9.0;    // centro del colador, en la bandeja profunda
  const yTubo = -7.6;      // altura del tramo horizontal de aspiracion
  const yRejilla = -16.5;

  // Tramo horizontal: de la bomba hacia la zona trasera del carter.
  const horizontal = BP.cilindro(0.55, 0.55, 27.0, SEG_CHICO, { tono: 'tenue' });
  BP.ejeX(horizontal);
  g.add(en(horizontal, -4.5, yTubo, 0, 'colador-tubo-horizontal'));

  // Codo y bajada hasta el colador.
  g.add(en(BP.esfera(0.72, { tono: 'tenue' }), xColador, yTubo, 0, 'colador-codo'));
  const bajada = BP.cilindro(0.55, 0.55, 8.2, SEG_CHICO, { tono: 'tenue' });
  g.add(en(bajada, xColador, yTubo - 4.1, 0, 'colador-tubo-bajada'));

  // Boca de transicion al colador.
  const boca = BP.cilindro(0.55, 1.5, 1.2, SEG_CHICO, { tono: 'tenue' });
  g.add(en(boca, xColador, yRejilla + 0.95, 0, 'colador-boca'));

  // Colador: marco rectangular de 7 x 5 dibujado solo con aristas, con su
  // malla insinuada por barrotes finos.
  const marco = BP.caja(7.0, 0.55, 5.0, { tono: 'tenue', solido: false });
  g.add(en(marco, xColador, yRejilla, 0, 'colador-marco'));

  for (const z of [-1.5, -0.5, 0.5, 1.5]) {
    const barra = BP.caja(6.7, 0.1, 0.1, { tono: 'tenue' });
    g.add(en(barra, xColador, yRejilla, z));
  }
  for (const dx of [-2.0, -1.0, 0, 1.0, 2.0]) {
    const barra = BP.caja(0.1, 0.1, 4.7, { tono: 'tenue' });
    g.add(en(barra, xColador + dx, yRejilla, 0));
  }

  return BP.tag(g, {
    id: 'colador',
    etiqueta: 'Colador de aceite',
    paso: 4,
    explode: new THREE.Vector3(0, -28, 0),
    desc: 'Tubo de aspiracion y colador de malla, sumergidos en la zona profunda del carter.'
  });
}

// Brida perimetral del carter, con sus 14 taladros de tornillo.
function bridaCarter() {
  const s = rectChaflan(-20.0, 20.0, -9.5, 9.5, 1.0);
  agujeroRect(s, -18.3, 18.3, -7.8, 7.8);

  // 10 taladros en los lados largos + 4 en los cortos = 14.
  for (const x of [-16.0, -8.0, 0, 8.0, 16.0]) {
    agujeroCirc(s, x, -8.65, 0.45);
    agujeroCirc(s, x, 8.65, 0.45);
  }
  for (const z of [-4.0, 4.0]) {
    agujeroCirc(s, -19.1, z, 0.45);
    agujeroCirc(s, 19.1, z, 0.45);
  }

  return losa(s, 0.9, FONDO_Y, { nombre: 'carter-brida' }, 10);
}

// Collar inclinado que une la brida con la cubeta: cuatro chapas que se
// estrechan hacia abajo.
function collarCarter() {
  const g = BP.G('carter-collar');

  const yA = FONDO_Y - 0.9;   // -9.9, bajo la brida
  const yB = -11.7;           // arranque de la cubeta
  const dy = yA - yB;         // caida

  // Chapas de los lados largos (se cierran en Z).
  {
    const dz = 9.2 - 7.7;
    const largo = Math.hypot(dy, dz);
    const ang = Math.atan2(dz, dy);
    for (const s of [-1, 1]) {
      const p = BP.caja(38.6, largo, 0.5, { tono: 'tenue' });
      p.rotation.x = -s * ang;
      p.position.set(0, (yA + yB) / 2, s * 8.45);
      p.name = 'carter-collar-z' + (s < 0 ? 'neg' : 'pos');
      g.add(p);
    }
  }

  // Chapas de los testeros (se cierran en X).
  {
    const dx = 19.6 - 18.6;
    const largo = Math.hypot(dy, dx);
    const ang = Math.atan2(dx, dy);
    for (const s of [-1, 1]) {
      const p = BP.caja(0.5, largo, 16.2, { tono: 'tenue' });
      p.rotation.z = s * ang;
      p.position.set(s * 19.1, (yA + yB) / 2, 0);
      p.name = 'carter-collar-x' + (s < 0 ? 'neg' : 'pos');
      g.add(p);
    }
  }

  return g;
}

// Cubeta: perfil longitudinal con zona delantera poco profunda (Y = -14.5) y
// bandeja trasera profunda (Y = -19.0).
function cubetaCarter() {
  const s = new THREE.Shape();
  s.moveTo(-18.6, -11.7);
  s.lineTo(-17.4, -14.5);
  s.lineTo(3.4, -14.5);
  s.lineTo(5.2, -19.0);
  s.lineTo(16.8, -19.0);
  s.lineTo(18.0, -14.6);
  s.lineTo(18.6, -11.7);
  s.closePath();

  const g = BP.extrusion(s, { depth: 15.4, curveSegments: 6 }, { nombre: 'carter-cubeta' });
  g.position.z = -7.7;   // se extruye hacia +Z: queda centrada
  return g;
}

function construirCarter() {
  const g = BP.G('carter');

  g.add(bridaCarter());
  g.add(collarCarter());
  g.add(cubetaCarter());

  // Nervio de rigidizacion longitudinal del faldon.
  for (const s of [-1, 1]) {
    const n = BP.caja(34.0, 0.5, 0.5, { tono: 'tenue' });
    g.add(en(n, 0, -13.6, s * 7.5));
  }

  // Tapon de vaciado en el punto mas bajo de la bandeja.
  const vastago = BP.cilindro(0.8, 0.8, 1.4, SEG_CHICO, { tono: 'acento' });
  g.add(en(vastago, 15.6, -19.3, 0, 'carter-tapon'));
  const cabeza = BP.cilindro(1.05, 1.05, 0.7, 6, { tono: 'acento' });
  g.add(en(cabeza, 15.6, -20.3, 0, 'carter-tapon-cabeza'));

  g.add(BP.etiqueta('Carter de aceite', {
    posicion: new THREE.Vector3(2.0, -17.6, -9.4)
  }));

  return BP.tag(g, {
    id: 'carter',
    etiqueta: 'Carter de aceite',
    paso: 4,
    explode: new THREE.Vector3(0, -34, 0),
    desc: 'Carter de aceite con brida de 14 tornillos, faldon inclinado, bandeja profunda trasera y tapon de vaciado.'
  });
}

// ===========================================================================
// API DEL MODULO
// ===========================================================================

export function build(ctx) {
  void ctx; // el modulo importa THREE, BP y K directamente

  const raiz = BP.G('mod-bloque');
  raiz.add(construirBloque());
  raiz.add(construirTapasBancada());
  raiz.add(construirBombaAceite());
  raiz.add(construirColador());
  raiz.add(construirCarter());
  return raiz;
}

// Este modulo no tiene cinematica real: lo unico que se mueve son los dos
// engranajes de la bomba de aceite, que giran despacio y en sentidos opuestos
// mientras el motor esta en marcha.
export function motion(grupo, state) {
  if (!grupo) return;

  let cache = grupo.userData.bomba;
  if (!cache) {
    cache = grupo.userData.bomba = {
      a: grupo.getObjectByName('bomba-engranaje-1') || null,
      b: grupo.getObjectByName('bomba-engranaje-2') || null
    };
  }
  if (!cache.a || !cache.b) return;
  if (!state || !state.enMarcha) return;

  const dt = Math.min(Math.max(state.dt || 0, 0), 0.1);
  const rpm = state.rpm || 0;
  const w = ((rpm / 60) * Math.PI * 2) * RELACION_BOMBA;

  const paso = w * dt;
  const dosPi = Math.PI * 2;
  // Se acota a una vuelta para que el angulo no crezca sin limite.
  cache.a.rotation.x = (cache.a.rotation.x + paso) % dosPi;
  cache.b.rotation.x = (cache.b.rotation.x - paso) % dosPi;
}
