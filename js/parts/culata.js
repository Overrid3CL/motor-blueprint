// js/parts/culata.js
// ---------------------------------------------------------------------------
// Junta de culata, culata DOHC 16V, bujias y tapa de balancines.
//
// Pasos de montaje que cubre este modulo:
//    5  Junta de culata
//    6  Culata
//   14  Bujias y tapa de balancines
//
// Convenio de ejes del proyecto:
//   X = eje del ciguenal (-X frontal, +X volante)
//   Y = vertical (Y = 0 es el eje del ciguenal)
//   Z = transversal (-Z admision, +Z escape)
//   1 unidad = 1 cm
//
// Todo se construye YA EN SU POSICION FINAL DE MONTAJE: del desmontado se
// encarga el sistema de ensamblado con el vector explode de cada BP.tag.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import * as BP from '../blueprint.js';
import * as K from '../kinematics.js';

// ---------------------------------------------------------------------------
// COTAS DEL MODULO (todas salen de la tabla de cotas del proyecto)
// ---------------------------------------------------------------------------

const CIL_X = K.MOTOR.cilindrosX;          // [-14.4, -4.8, 4.8, 14.4]
const DECK_Y = K.MOTOR.deckY;              // 22.0  plano de culata del bloque

const JUNTA_ALTO = 0.15;
const JUNTA_Y = DECK_Y + JUNTA_ALTO;       // 22.15 cara superior de la junta
const CULATA_Y = 33.5;                     // cara superior de la culata
const TAPA_Y = 38.0;                       // cara superior de la tapa

const MEDIO_X = 21.0;                      // huella X de bloque / culata / tapa
const MEDIO_Z = 10.5;                      // huella Z

const Z_ADM = -3.6;                        // eje de valvulas de admision
const Z_ESC = 3.6;                         // eje de valvulas de escape
const DX_VALVULA = 1.85;                   // separacion de las dos valvulas en X

const X_TORNILLOS = [-19.2, -9.6, 0, 9.6, 19.2];   // 5 posiciones x 2 lados = 10
const Z_TORNILLOS = [-7.6, 7.6];

const X_APOYOS = [-18, -9.6, 0, 9.6, 18];  // semialojamientos de arbol de levas
const Y_LEVA = 31.6;                       // eje de los arboles de levas

// Presupuesto de aristas: el plano se dibuja con EdgesGeometry, asi que los
// segmentos radiales se mantienen bajos. Con 16 o mas segmentos el angulo
// entre caras cae por debajo del umbral de 24 grados y las aristas verticales
// se descartan solas, que es justo lo que interesa.
const SEG = 16;        // piezas pequenas (guias, asientos, tornillos)
const SEG_M = 20;      // piezas medianas (pozos de bujia, camaras, tapon)
const SEG_HEX = 6;     // cabezas hexagonales

// ---------------------------------------------------------------------------
// METADATOS PARA LA UI
// ---------------------------------------------------------------------------

export const info = {
  id: 'culata',
  titulo: 'Culata y tapa',
  piezas: [
    {
      id: 'junta-culata',
      etiqueta: 'Junta de culata (multicapa)',
      paso: 5,
      desc: 'Junta metalica multicapa de 1.5 mm con los cuatro pasos de cilindro, ' +
            'diez taladros de tornillo y los conductos de agua y aceite.'
    },
    {
      id: 'culata',
      etiqueta: 'Culata DOHC 16V',
      paso: 6,
      desc: 'Culata de aluminio con camaras pent-roof, 16 asientos y guias, ' +
            'conductos de admision y escape y los diez apoyos de los arboles de levas.'
    },
    {
      id: 'bujias',
      etiqueta: 'Bujias',
      paso: 14,
      desc: 'Cuatro bujias centrales, una por camara, roscadas en el fondo del pozo.'
    },
    {
      id: 'tapa-balancines',
      etiqueta: 'Tapa de balancines',
      paso: 14,
      desc: 'Tapa en artesa invertida con junta perimetral, tapon de llenado de ' +
            'aceite, respiradero PCV y pasos de bujia.'
    }
  ]
};

// ---------------------------------------------------------------------------
// UTILIDADES INTERNAS
// ---------------------------------------------------------------------------

// Coloca un objeto y lo devuelve (para encadenar).
function en(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

function V(x, y, z) {
  return new THREE.Vector3(x, y, z);
}

// Lista de las 16 posiciones de valvula: 2 de admision y 2 de escape por cilindro.
function posicionesValvulas() {
  const lista = [];
  for (let i = 0; i < CIL_X.length; i++) {
    for (const dx of [-DX_VALVULA, DX_VALVULA]) {
      lista.push({ cil: i, x: CIL_X[i] + dx, dx: dx, z: Z_ADM, admision: true });
      lista.push({ cil: i, x: CIL_X[i] + dx, dx: dx, z: Z_ESC, admision: false });
    }
  }
  return lista;
}

// ---------------------------------------------------------------------------
// PASO 5 - JUNTA DE CULATA
// Placa de Y=22.0 a Y=22.15 con los agujeros recortados de verdad: un Shape
// rectangular con Paths circulares como holes, extruido y tumbado.
// En el Shape, la coordenada X es la X del motor y la Y del Shape es la Z del
// motor; al girar el grupo PI/2 sobre X, la extrusion baja en Y.
// ---------------------------------------------------------------------------

function construirJunta() {
  const g = BP.G('junta-culata');

  const forma = new THREE.Shape();
  forma.moveTo(-MEDIO_X, -MEDIO_Z);
  forma.lineTo(MEDIO_X, -MEDIO_Z);
  forma.lineTo(MEDIO_X, MEDIO_Z);
  forma.lineTo(-MEDIO_X, MEDIO_Z);
  forma.closePath();

  const agujero = (x, z, r) => {
    const p = new THREE.Path();
    p.absarc(x, z, r, 0, Math.PI * 2, false);
    forma.holes.push(p);
  };

  // Pasos de cilindro (diam 8.7, un pelo mas que el diametro nominal).
  for (const x of CIL_X) agujero(x, 0, 4.35);
  // Diez taladros de tornillo de culata (diam 1.3).
  for (const x of X_TORNILLOS) {
    for (const z of Z_TORNILLOS) agujero(x, z, 0.65);
  }
  // Conductos de refrigerante, alternados a un lado y otro.
  for (const x of [-12.0, -2.4, 7.2, 16.8]) agujero(x, -9.3, 0.4);
  for (const x of [-16.8, -7.2, 2.4, 12.0]) agujero(x, 9.3, 0.4);
  // Subidas de aceite a la culata, en los dos extremos.
  agujero(-20.0, 0, 0.5);
  agujero(20.0, 0, 0.5);

  const placa = BP.extrusion(
    forma,
    { depth: JUNTA_ALTO, curveSegments: SEG },
    { tono: 'acento', nombre: 'junta-placa' }
  );
  placa.rotation.x = Math.PI / 2;
  placa.position.y = JUNTA_Y;
  g.add(placa);

  g.add(BP.etiqueta('Junta de culata (multicapa)', {
    tono: 'acento',
    posicion: V(-25, 22.1, 12)
  }));

  return BP.tag(g, {
    id: 'junta-culata',
    etiqueta: 'Junta de culata (multicapa)',
    paso: 5,
    explode: V(0, 18, 0),
    desc: info.piezas[0].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 6 - CULATA
// ---------------------------------------------------------------------------

// Cuerpo: base con la cara de junta, zona media con las bocas de los conductos
// y galeria superior, mas estrecha, donde apoyan los arboles de levas.
function cuerpoCulata() {
  const g = BP.G('culata-cuerpo');

  // Base: huella completa, Y 22.15 .. 24.6 (camaras, asientos y tornilleria).
  g.add(en(BP.caja(2 * MEDIO_X, 2.45, 2 * MEDIO_Z, { nombre: 'culata-base' }), 0, 23.375, 0));
  // Zona media: Y 24.6 .. 30.6, algo mas estrecha (Z -9.2 .. 9.2).
  g.add(en(BP.caja(2 * MEDIO_X, 6.0, 18.4, { nombre: 'culata-medio' }), 0, 27.6, 0));
  // Galeria de arboles: Y 30.6 .. 33.5, Z -7.4 .. 7.4.
  g.add(en(BP.caja(2 * MEDIO_X, 2.9, 14.8, { nombre: 'culata-galeria' }), 0, 32.05, 0));

  // Bridas de admision (-Z, Y 26..30) y de escape (+Z, Y 24..28), una por
  // cilindro, con dos esparragos cada una.
  for (let i = 0; i < CIL_X.length; i++) {
    const x = CIL_X[i];
    g.add(en(BP.caja(7.0, 4.0, 1.4, { nombre: 'brida-adm-' + (i + 1) }), x, 28.0, -9.9));
    g.add(en(BP.caja(6.2, 4.0, 1.4, { nombre: 'brida-esc-' + (i + 1) }), x, 26.0, 9.9));

    for (const s of [-1, 1]) {
      const ea = BP.ejeZ(BP.cilindro(0.34, 0.34, 2.0, SEG_HEX, { tono: 'acento' }));
      g.add(en(ea, x + s * 2.9, 28.0 - s * 1.4, -10.2));
      const ee = BP.ejeZ(BP.cilindro(0.34, 0.34, 2.0, SEG_HEX, { tono: 'acento' }));
      g.add(en(ee, x + s * 2.6, 26.0 - s * 1.4, 10.2));
    }
  }

  // Nervios de refuerzo entre bocas, a los dos lados.
  for (const x of [-9.6, 0, 9.6]) {
    g.add(en(BP.caja(1.0, 5.2, 1.0, { tono: 'tenue', nombre: 'nervio-adm' }), x, 27.6, -9.6));
    g.add(en(BP.caja(1.0, 5.2, 1.0, { tono: 'tenue', nombre: 'nervio-esc' }), x, 25.6, 9.6));
  }

  return g;
}

// Camaras de combustion tipo pent-roof: pared cilindrica de diam 8.6 y 0.9 de
// profundidad mas los dos faldones inclinados que forman el techo a dos aguas.
function camarasCombustion() {
  const g = BP.G('culata-camaras');
  const inclinacion = Math.atan2(0.9, 4.3);   // 0.206 rad (unos 11.8 grados)
  const yMedio = JUNTA_Y + 0.45;              // 22.6, centro del hueco

  for (let i = 0; i < CIL_X.length; i++) {
    const x = CIL_X[i];
    const c = BP.G('camara-' + (i + 1));

    const pared = BP.tubo(4.3, 4.05, 0.9, SEG_M, {
      tono: 'caliente',
      nombre: 'camara-pared-' + (i + 1)
    });
    c.add(en(pared, x, yMedio, 0));

    // Faldon de admision (-Z) y faldon de escape (+Z). Cada uno sube 0.9 desde
    // el borde de la camara hasta la cumbrera, en Z = 0.
    const faldonAdm = BP.caja(8.0, 0.18, 4.5, {
      tono: 'caliente',
      nombre: 'camara-techo-adm-' + (i + 1)
    });
    faldonAdm.rotation.x = -inclinacion;
    c.add(en(faldonAdm, x, yMedio, -2.15));

    const faldonEsc = BP.caja(8.0, 0.18, 4.5, {
      tono: 'caliente',
      nombre: 'camara-techo-esc-' + (i + 1)
    });
    faldonEsc.rotation.x = inclinacion;
    c.add(en(faldonEsc, x, yMedio, 2.15));

    g.add(c);
  }
  return g;
}

// 16 asientos de valvula (anillos en la cara inferior) y sus 16 guias.
function asientosYGuias() {
  const g = BP.G('culata-asientos-guias');

  for (const v of posicionesValvulas()) {
    const rExt = v.admision ? 1.8 : 1.6;     // diam 3.6 admision / 3.2 escape
    const rInt = v.admision ? 1.5 : 1.3;
    const sufijo = (v.admision ? 'adm-' : 'esc-') + (v.cil + 1) + (v.dx < 0 ? 'a' : 'b');

    const asiento = BP.tubo(rExt, rInt, 0.3, SEG, {
      tono: 'acento',
      nombre: 'asiento-' + sufijo
    });
    g.add(en(asiento, v.x, 22.42, v.z));

    // Guia: tubo fino de Y=23.5 a Y=28.5.
    const guia = BP.tubo(0.6, 0.325, 5.0, SEG, { nombre: 'guia-' + sufijo });
    g.add(en(guia, v.x, 26.0, v.z));
  }

  return g;
}

// Conducto interno dibujado solo con aristas (solido:false) sobre una curva.
function conducto(puntos, radio, nombre) {
  const curva = new THREE.CatmullRomCurve3(puntos, false, 'catmullrom', 0.2);
  const geo = new THREE.TubeGeometry(curva, 12, radio, 8, false);
  return BP.bp(geo, { tono: 'tenue', solido: false, nombre: nombre });
}

// Cuatro conductos de admision (-Z) y cuatro de escape (+Z). Cada conducto son
// dos bocas, una por valvula, que convergen en la brida exterior.
function conductos() {
  const g = BP.G('culata-conductos');

  for (let i = 0; i < CIL_X.length; i++) {
    const x = CIL_X[i];

    for (const dx of [-DX_VALVULA, DX_VALVULA]) {
      const vx = x + dx;
      const s = dx < 0 ? -1 : 1;

      // Admision: sube desde el asiento y sale por la brida de Y 26..30.
      g.add(conducto([
        V(vx, 23.2, Z_ADM),
        V(vx, 24.8, Z_ADM - 1.6),
        V(x + dx * 0.5, 26.6, -7.0),
        V(x + s * 0.65, 28.0, -10.7)
      ], 1.15, 'conducto-adm-' + (i + 1) + (s < 0 ? 'a' : 'b')));

      // Escape: mas corto y mas tendido, brida de Y 24..28.
      g.add(conducto([
        V(vx, 23.2, Z_ESC),
        V(vx, 24.4, Z_ESC + 1.5),
        V(x + dx * 0.5, 25.4, 7.2),
        V(x + s * 0.6, 26.0, 10.7)
      ], 0.95, 'conducto-esc-' + (i + 1) + (s < 0 ? 'a' : 'b')));
    }
  }

  return g;
}

// Diez semialojamientos de arbol de levas (5 por arbol) en Y = 31.6, con su
// pedestal. La escotadura es media superficie cilindrica abierta hacia arriba.
function apoyosArboles() {
  const g = BP.G('culata-apoyos-levas');

  for (const z of [Z_ADM, Z_ESC]) {
    const lado = z < 0 ? 'adm' : 'esc';
    for (let j = 0; j < X_APOYOS.length; j++) {
      const x = X_APOYOS[j];

      // Pedestal: Y 30.8 .. 33.5.
      const pedestal = BP.caja(1.9, 2.7, 4.2, { nombre: 'pedestal-' + lado + '-' + (j + 1) });
      g.add(en(pedestal, x, 32.15, z));

      // Media caseta cilindrica de radio 1.6, abierta hacia arriba.
      const media = BP.bp(
        new THREE.CylinderGeometry(1.6, 1.6, 1.5, 12, 1, true, 0, Math.PI),
        { nombre: 'apoyo-' + lado + '-' + (j + 1) }
      );
      BP.ejeX(media);
      g.add(en(media, x, Y_LEVA, z));
    }
  }

  return g;
}

// Diez taladros pasantes de tornillo de culata y cuatro pozos de bujia.
function taladrosYPozos() {
  const g = BP.G('culata-taladros');

  const altoTaladro = CULATA_Y - JUNTA_Y;          // 11.35
  const yTaladro = (CULATA_Y + JUNTA_Y) / 2;       // 27.825
  for (const x of X_TORNILLOS) {
    for (const z of Z_TORNILLOS) {
      const t = BP.tubo(0.95, 0.65, altoTaladro, SEG, { tono: 'tenue', nombre: 'taladro-culata' });
      g.add(en(t, x, yTaladro, z));
    }
  }

  // Pozos de bujia: diam ext 2.6 / int 1.5, de Y=25 a Y=33.5.
  for (let i = 0; i < CIL_X.length; i++) {
    const pozo = BP.tubo(1.3, 0.75, 8.5, SEG_M, { nombre: 'pozo-bujia-' + (i + 1) });
    g.add(en(pozo, CIL_X[i], 29.25, 0));
  }

  return g;
}

function construirCulata() {
  const g = BP.G('culata');

  g.add(cuerpoCulata());
  g.add(camarasCombustion());
  g.add(asientosYGuias());
  g.add(conductos());
  g.add(apoyosArboles());
  g.add(taladrosYPozos());

  // Cota de la altura total de la culata, sacada por el lado del volante.
  g.add(BP.cota(
    V(21.5, JUNTA_Y, 0),
    V(21.5, CULATA_Y, 0),
    'Altura culata 11.35',
    { eje: 'x', desplazamiento: 7, tono: 'tenue', nombre: 'cota-altura-culata' }
  ));

  g.add(BP.etiqueta('Culata DOHC 16V', { posicion: V(24, 30.5, -12) }));

  return BP.tag(g, {
    id: 'culata',
    etiqueta: 'Culata DOHC 16V',
    paso: 6,
    explode: V(0, 34, 0),
    desc: info.piezas[1].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 14 (a) - BUJIAS
// ---------------------------------------------------------------------------

function construirBujias() {
  const g = BP.G('bujias');

  for (let i = 0; i < CIL_X.length; i++) {
    const x = CIL_X[i];
    const b = BP.G('bujia-' + (i + 1));

    // Rosca: diam 1.4, de Y=26.5 a Y=30.
    b.add(en(BP.cilindro(0.7, 0.7, 3.5, SEG, { nombre: 'bujia-rosca-' + (i + 1) }), x, 28.25, 0));
    // Cuerpo hexagonal: diam 1.6, de Y=30 a Y=32.
    b.add(en(BP.cilindro(0.8, 0.8, 2.0, SEG_HEX, { nombre: 'bujia-hex-' + (i + 1) }), x, 31.0, 0));
    // Aislante ceramico troncoconico: de Y=32 a Y=35.
    b.add(en(BP.cilindro(0.55, 0.92, 3.0, SEG, {
      tono: 'acento',
      nombre: 'bujia-aislante-' + (i + 1)
    }), x, 33.5, 0));
    // Borne superior.
    b.add(en(BP.cilindro(0.3, 0.3, 0.7, SEG, {
      tono: 'acento',
      nombre: 'bujia-borne-' + (i + 1)
    }), x, 35.35, 0));

    // Electrodos: la barrita central y la de masa, en L.
    b.add(en(BP.caja(0.16, 1.0, 0.16, { tono: 'acento' }), x, 26.0, 0));
    b.add(en(BP.caja(0.2, 0.95, 0.22, { tono: 'acento' }), x, 26.02, 0.62));
    b.add(en(BP.caja(0.2, 0.2, 0.72, { tono: 'acento' }), x, 25.65, 0.36));

    g.add(b);
  }

  g.add(BP.etiqueta('Bujias', { tono: 'acento', posicion: V(-20, 35.6, 4) }));

  return BP.tag(g, {
    id: 'bujias',
    etiqueta: 'Bujias',
    paso: 14,
    explode: V(0, 22, 0),
    desc: info.piezas[2].desc
  });
}

// ---------------------------------------------------------------------------
// PASO 14 (b) - TAPA DE BALANCINES
// Artesa invertida: seccion en U invertida extruida a lo largo de X. En el
// Shape, la coordenada X es -Z del motor y la Y del Shape es la Y del motor;
// el grupo se gira PI/2 sobre Y para que la extrusion corra a lo largo de X.
// ---------------------------------------------------------------------------

// Perfil hueco (pared de 1.5 en los costados y 0.8 en el techo), abierto abajo.
function perfilTapaHueco() {
  const s = new THREE.Shape();
  s.moveTo(-10.5, CULATA_Y);
  s.lineTo(-10.5, 34.2);
  s.lineTo(-8.0, TAPA_Y);
  s.lineTo(8.0, TAPA_Y);
  s.lineTo(10.5, 34.2);
  s.lineTo(10.5, CULATA_Y);
  s.lineTo(9.0, CULATA_Y);
  s.lineTo(9.0, 34.0);
  s.lineTo(6.9, 37.2);
  s.lineTo(-6.9, 37.2);
  s.lineTo(-9.0, 34.0);
  s.lineTo(-9.0, CULATA_Y);
  s.closePath();
  return s;
}

// Perfil macizo, para las dos paredes de cierre frontal y trasera.
function perfilTapaMacizo() {
  const s = new THREE.Shape();
  s.moveTo(-10.5, CULATA_Y);
  s.lineTo(10.5, CULATA_Y);
  s.lineTo(10.5, 34.2);
  s.lineTo(8.0, TAPA_Y);
  s.lineTo(-8.0, TAPA_Y);
  s.lineTo(-10.5, 34.2);
  s.closePath();
  return s;
}

function construirTapa() {
  const g = BP.G('tapa-balancines');

  // Cuerpo en artesa, de X = -20.2 a X = +20.2.
  const cuerpo = BP.extrusion(perfilTapaHueco(), { depth: 40.4 }, { nombre: 'tapa-cuerpo' });
  cuerpo.rotation.y = Math.PI / 2;
  cuerpo.position.x = -20.2;
  g.add(cuerpo);

  // Paredes de cierre en los dos extremos.
  for (const x of [-MEDIO_X, 20.2]) {
    const cierre = BP.extrusion(perfilTapaMacizo(), { depth: 0.8 }, { nombre: 'tapa-cierre' });
    cierre.rotation.y = Math.PI / 2;
    cierre.position.x = x;
    g.add(cierre);
  }

  // Junta perimetral fina en Y = 33.5 (marco rectangular hueco).
  const marco = new THREE.Shape();
  marco.moveTo(-MEDIO_X, -MEDIO_Z);
  marco.lineTo(MEDIO_X, -MEDIO_Z);
  marco.lineTo(MEDIO_X, MEDIO_Z);
  marco.lineTo(-MEDIO_X, MEDIO_Z);
  marco.closePath();
  const hueco = new THREE.Path();
  hueco.moveTo(-19.5, -9.0);
  hueco.lineTo(19.5, -9.0);
  hueco.lineTo(19.5, 9.0);
  hueco.lineTo(-19.5, 9.0);
  hueco.closePath();
  marco.holes.push(hueco);

  const junta = BP.extrusion(marco, { depth: 0.22 }, { tono: 'acento', nombre: 'tapa-junta' });
  junta.rotation.x = Math.PI / 2;
  junta.position.y = CULATA_Y + 0.22;      // 33.5 .. 33.72
  g.add(junta);

  // Cuatro pasos de bujia (diam 2.8) en el techo, sobre cada cilindro.
  for (let i = 0; i < CIL_X.length; i++) {
    const collar = BP.tubo(1.9, 1.4, 1.4, SEG, { nombre: 'paso-bujia-' + (i + 1) });
    g.add(en(collar, CIL_X[i], TAPA_Y, 0));
  }

  // Tapon de llenado de aceite: diam 4.4, alto 1.2, en (-16, 38.6, -6).
  const tapon = BP.cilindro(2.2, 2.2, 1.2, SEG_M, { tono: 'acento', nombre: 'tapon-aceite' });
  g.add(en(tapon, -16, 38.6, -6));
  g.add(en(BP.tubo(2.45, 2.2, 0.4, SEG_M, { tono: 'acento', nombre: 'tapon-cuello' }), -16, 38.1, -6));

  // Respiradero PCV en (+14, 38, +6): codo de tubo vertical + salida a +Z.
  g.add(en(BP.tubo(1.25, 0.85, 0.5, SEG, { nombre: 'pcv-base' }), 14, 38.15, 6));
  g.add(en(BP.cilindro(0.85, 0.85, 2.0, SEG, { nombre: 'pcv-vertical' }), 14, 38.9, 6));
  const codo = BP.ejeZ(BP.cilindro(0.85, 0.85, 3.0, SEG, { nombre: 'pcv-salida' }));
  g.add(en(codo, 14, 39.75, 7.5));

  // Ocho tornillos perimetrales sobre el faldon de la tapa.
  for (const x of [-16.8, -5.6, 5.6, 16.8]) {
    for (const z of [-9.75, 9.75]) {
      const t = BP.cilindro(0.55, 0.55, 1.0, SEG_HEX, { tono: 'acento', nombre: 'tornillo-tapa' });
      g.add(en(t, x, 33.9, z));
    }
  }

  g.add(BP.etiqueta('Tapa de balancines', { posicion: V(0, 39.8, -9) }));

  return BP.tag(g, {
    id: 'tapa-balancines',
    etiqueta: 'Tapa de balancines',
    paso: 14,
    explode: V(0, 26, 0),
    desc: info.piezas[3].desc
  });
}

// ---------------------------------------------------------------------------
// CONSTRUCCION DEL MODULO
// ---------------------------------------------------------------------------

export function build(ctx) {
  void ctx;   // se usan los imports del modulo (mismas instancias que ctx.BP / ctx.K)
  const g = BP.G('mod-culata');
  g.add(construirJunta());
  g.add(construirCulata());
  g.add(construirBujias());
  g.add(construirTapa());
  return g;
}

// Este modulo no tiene partes moviles: se deja como no-op para cumplir el
// contrato sin coste por frame.
export function motion(group, state) {
  void group;
  void state;
  // sin animacion
}
