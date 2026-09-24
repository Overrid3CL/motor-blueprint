// js/parts/distribucion.js
// ---------------------------------------------------------------------------
// TREN DE VALVULAS Y DISTRIBUCION
//
// Pasos de montaje que cubre este modulo:
//    7  Valvulas, muelles, platillos y taques
//    8  Arboles de levas y sombreretes
//    9  Pinones, cadena de distribucion y tensor
//   10  Tapa de distribucion
//
// (la polea de ciguenal NO se modela aqui: es cosa de ciguenal.js)
//
// Convenio de ejes del proyecto:
//   X = eje del ciguenal (-X frontal, +X volante)
//   Y = vertical (Y = 0 es el eje del ciguenal)
//   Z = transversal (-Z admision, +Z escape)
//   1 unidad = 1 cm
//
// PRESUPUESTO DE ARISTAS: este es el modulo mas repetitivo del motor (16
// valvulas con su muelle helicoidal, 16 levas, 10 sombreretes...). Por eso se
// construye UNA plantilla de cada pieza y el resto son copias ligeras que
// COMPARTEN geometria, aristas y materiales (ver copiaLigera).
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import * as BP from '../blueprint.js';
import * as K from '../kinematics.js';

// ---------------------------------------------------------------------------
// COTAS LOCALES
// ---------------------------------------------------------------------------

const GRADO = Math.PI / 180;

const Y_CIERRE = 22.5;        // cara superior de la cabeza, valvula cerrada
const Y_EJE_LEVAS = 31.6;     // eje de los dos arboles de levas
const Z_ADM = -3.6;           // plano de las valvulas / arbol de admision
const Z_ESC = 3.6;            // plano de las valvulas / arbol de escape
const DX_VALVULA = 1.85;      // separacion de las dos valvulas de cada plano
const ALZADA_MAX = 1.0;       // alzada maxima de valvula (= alzada de la leva)
const R_BASE_LEVA = 1.0;      // radio del circulo base de la leva
const X_APOYOS = [-18, -9.6, 0, 9.6, 18];   // apoyos y sombreretes de levas
const X_PLANO_DIST = -22.5;   // plano medio del tren de distribucion
const ESPESOR_RUEDA = 1.4;    // espesor de pinones y ruedas de distribucion

// Desfase de CICLO de cada cilindro, en grados de ciguenal, tal y como se suma
// al angulo antes de llamar a K.alzadaValvula:
//     alzada = K.alzadaValvula(anguloCiguenal + desfase, ...)
// Con esta convencion un desfase MAYOR adelanta el evento, asi que para que el
// orden de encendido sea 1-3-4-2 (cil.1 a 0 grados, cil.3 a 180, cil.4 a 360 y
// cil.2 a 540 dentro del ciclo de 720) hay que sumar el desfase CAMBIADO DE
// SIGNO. Modulo 720: -180 = 540, -360 = 360, -540 = 180.
// Indices 0..3 = cilindros 1..4.
const DESFASE_CICLO = [0, 180, 540, 360];

// ---------------------------------------------------------------------------
// METADATOS PARA LA UI
// ---------------------------------------------------------------------------

export const info = {
  id: 'distribucion',
  titulo: 'Distribucion y tren de valvulas',
  piezas: [
    {
      id: 'valvulas',
      etiqueta: 'Valvulas, muelles y taques',
      paso: 7,
      desc: '16 valvulas (8 de admision de 34 mm y 8 de escape de 30 mm) con su muelle, platillo, chavetas y taque de vaso.'
    },
    {
      id: 'arboles-levas',
      etiqueta: 'Arboles de levas',
      paso: 8,
      desc: 'Dos arboles en cabeza (DOHC) a 316 mm de altura, con 8 levas cada uno, 5 apoyos y rueda fonica.'
    },
    {
      id: 'sombreretes-levas',
      etiqueta: 'Sombreretes de levas',
      paso: 8,
      desc: '10 sombreretes en puente con semialojamiento de 16 mm de radio y dos tornillos de 9 mm cada uno.'
    },
    {
      id: 'distribucion',
      etiqueta: 'Cadena de distribucion',
      paso: 9,
      desc: 'Pinon de ciguenal, dos ruedas de arbol al doble de diametro (relacion 2:1), cadena, tensor hidraulico y guia.'
    },
    {
      id: 'tapa-distribucion',
      etiqueta: 'Tapa de distribucion',
      paso: 10,
      desc: 'Tapa delantera con reten del morro del ciguenal y 12 tornillos perimetrales.'
    }
  ]
};

// ---------------------------------------------------------------------------
// COPIA LIGERA
// Duplica un arbol de objetos REUTILIZANDO geometrias y materiales. No se usa
// Object3D.clone() a proposito: clone() serializa userData con JSON y los
// grupos de BP.bp() guardan ahi la geometria, lo que dispararia el coste.
// ---------------------------------------------------------------------------

function copiaLigera(obj) {
  let copia;
  if (obj.isMesh) copia = new THREE.Mesh(obj.geometry, obj.material);
  else if (obj.isLineSegments) copia = new THREE.LineSegments(obj.geometry, obj.material);
  else if (obj.isLine) copia = new THREE.Line(obj.geometry, obj.material);
  else copia = new THREE.Group();

  copia.name = obj.name;
  copia.position.copy(obj.position);
  copia.quaternion.copy(obj.quaternion);
  copia.scale.copy(obj.scale);
  copia.renderOrder = obj.renderOrder;
  if (obj.userData && obj.userData.esBp) copia.userData.esBp = true;

  for (let i = 0; i < obj.children.length; i++) {
    copia.add(copiaLigera(obj.children[i]));
  }
  return copia;
}

// Devuelve la plantilla la primera vez y copias ligeras a partir de ahi.
function instancia(estado, clave, fabrica) {
  if (!estado[clave]) {
    estado[clave] = fabrica();
    return estado[clave];
  }
  return copiaLigera(estado[clave]);
}

// ---------------------------------------------------------------------------
// GEOMETRIAS COMPARTIDAS (se construyen una vez y se reutilizan)
// ---------------------------------------------------------------------------

let _geoMuelle = null;
let _geoTaque = null;
let _geoLeva = null;
let _geoTornillo = null;

// Muelle de valvula: helice de radio 1.2, 6 vueltas, de y=2.0 a y=6.7.
function geoMuelle() {
  if (_geoMuelle) return _geoMuelle;
  const radio = 1.2;
  const vueltas = 6;
  const y0 = 2.0;
  const y1 = 6.7;
  const puntos = [];
  const n = 96;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * vueltas * Math.PI * 2;
    puntos.push(new THREE.Vector3(
      Math.cos(a) * radio,
      y0 + (y1 - y0) * t,
      Math.sin(a) * radio
    ));
  }
  const curva = new THREE.CatmullRomCurve3(puntos);
  _geoMuelle = new THREE.TubeGeometry(curva, 90, 0.2, 6, false);
  return _geoMuelle;
}

// Taque de vaso: copa cerrada por arriba, de y=6.9 a y=8.1, diam 3.4.
// Una sola revolucion en vez de fondo + falda: la mitad de objetos.
function geoTaque() {
  if (_geoTaque) return _geoTaque;
  const perfil = [
    new THREE.Vector2(0, 8.1),
    new THREE.Vector2(1.7, 8.1),
    new THREE.Vector2(1.7, 6.9),
    new THREE.Vector2(1.48, 6.9),
    new THREE.Vector2(1.48, 7.9),
    new THREE.Vector2(0, 7.9)
  ];
  _geoTaque = new THREE.LatheGeometry(perfil, 24);
  return _geoTaque;
}

// Tornillo generico (vastago + cabeza), eje Y, base en y=0.
function geoTornillo() {
  if (_geoTornillo) return _geoTornillo;
  const perfil = [
    new THREE.Vector2(0, -0.6),
    new THREE.Vector2(0.45, -0.6),
    new THREE.Vector2(0.45, 1.9),
    new THREE.Vector2(0.8, 1.9),
    new THREE.Vector2(0.8, 2.5),
    new THREE.Vector2(0, 2.5)
  ];
  _geoTornillo = new THREE.LatheGeometry(perfil, 12);
  return _geoTornillo;
}

// --- perfil de leva --------------------------------------------------------
//
// La ventana de la leva en grados de ARBOL es la mitad que en grados de
// ciguenal (el arbol gira a la mitad de vueltas), asi que una duracion de 230
// grados de ciguenal son 115 grados de leva. Se usa el mismo perfil senoidal
// que K.alzadaValvula, de modo que el dibujo de la leva y el movimiento de la
// valvula cuentan exactamente la misma historia.

const VENTANA_LEVA = (K.LEVAS.admision.duracion / 2) * GRADO;   // 115 grados

// Radio de la leva en funcion del angulo medido desde la NARIZ.
function radioLeva(angulo) {
  let a = angulo;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  const media = VENTANA_LEVA / 2;
  if (Math.abs(a) >= media) return R_BASE_LEVA;
  const t = (a + media) / (2 * media);
  return R_BASE_LEVA + ALZADA_MAX * Math.sin(Math.PI * t);
}

// Contorno de la leva. El plano del THREE.Shape se lleva luego al plano YZ
// girando la pieza 90 grados sobre Y, con lo que:  sx -> -Z   y   sy -> +Y.
// Por eso el punto a un angulo 'a' (medido desde +Y hacia +Z) es
// (sx, sy) = (-R*sin(a), R*cos(a)).  Con fase 0 la nariz apunta a +Y.
function formaLeva() {
  const forma = new THREE.Shape();
  const n = 96;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radioLeva(a);
    const sx = -Math.sin(a) * r;
    const sy = Math.cos(a) * r;
    if (i === 0) forma.moveTo(sx, sy);
    else forma.lineTo(sx, sy);
  }
  forma.closePath();
  return forma;
}

function geoLeva() {
  if (_geoLeva) return _geoLeva;
  _geoLeva = new THREE.ExtrudeGeometry(formaLeva(), {
    depth: 0.9, bevelEnabled: false, steps: 1, curveSegments: 1
  });
  _geoLeva.translate(0, 0, -0.45);   // centrada en su plano
  _geoLeva.rotateY(Math.PI / 2);     // extrusion a lo largo de X
  return _geoLeva;
}

// --- rueda dentada ---------------------------------------------------------
//
// Dientes INSINUADOS: un contorno poligonal de cuatro puntos por diente. No
// pretende ser un perfil de evolvente, solo leerse como engranaje en el plano.
function formaEngranaje(nDientes, rPrimitivo, rInterior, altoDiente, aligeramientos) {
  const forma = new THREE.Shape();
  const paso = (Math.PI * 2) / nDientes;
  const rPie = rPrimitivo - altoDiente * 0.55;
  const rCabeza = rPrimitivo + altoDiente * 0.45;
  let primero = true;

  for (let i = 0; i < nDientes; i++) {
    const a0 = i * paso;
    const tramos = [
      [a0 + paso * 0.08, rPie],
      [a0 + paso * 0.27, rCabeza],
      [a0 + paso * 0.53, rCabeza],
      [a0 + paso * 0.72, rPie]
    ];
    for (const [a, r] of tramos) {
      const sx = -Math.sin(a) * r;
      const sy = Math.cos(a) * r;
      if (primero) { forma.moveTo(sx, sy); primero = false; }
      else forma.lineTo(sx, sy);
    }
  }
  forma.closePath();

  // Agujero central.
  const centro = new THREE.Path();
  centro.absarc(0, 0, rInterior, 0, Math.PI * 2, true);
  forma.holes.push(centro);

  // Aligeramientos = { cantidad, radio, distancia }
  if (aligeramientos && aligeramientos.cantidad > 0) {
    for (let i = 0; i < aligeramientos.cantidad; i++) {
      const a = (i / aligeramientos.cantidad) * Math.PI * 2 + Math.PI / 4;
      const cx = -Math.sin(a) * aligeramientos.distancia;
      const cy = Math.cos(a) * aligeramientos.distancia;
      const hueco = new THREE.Path();
      hueco.absarc(cx, cy, aligeramientos.radio, 0, Math.PI * 2, true);
      forma.holes.push(hueco);
    }
  }
  return forma;
}

// Rueda dentada ya orientada: disco en el plano YZ y espesor a lo largo de X,
// centrado en x = 0 dentro de su grupo.
function ruedaDentada(forma, espesor, opts) {
  const g = BP.extrusion(forma, { depth: espesor, curveSegments: 14 }, opts);
  g.rotation.y = Math.PI / 2;
  g.position.x = -espesor / 2;
  return g;
}

// ---------------------------------------------------------------------------
// PASO 7 - VALVULAS, MUELLES, PLATILLOS Y TAQUES
//
// Cada valvula es un Group cuyo ORIGEN esta en la posicion de valvula CERRADA
// (Y = 22.5). motion() solo le toca position.y, restandole la alzada: abrir es
// bajar. En coordenadas locales:
//     cabeza      y = -0.5 .. 0      (cara superior en y = 0)
//     vastago     y =  0   .. 6.9    -> en el mundo 22.5 .. 29.4
//     taque       y =  6.9 .. 8.1    -> en el mundo 29.4 .. 30.6
// El taque toca el circulo base de la leva (31.6 - 1.0 = 30.6). Cuadra.
// ---------------------------------------------------------------------------

function plantillaValvula(tipo) {
  const esAdmision = tipo === 'adm';
  const rCabeza = esAdmision ? 1.7 : 1.5;          // diam 3.4 / 3.0
  const tono = esAdmision ? 'linea' : 'caliente';  // el escape, en tono caliente

  const g = BP.G('valvula');

  // Cabeza (con chaflan de asiento a 45 grados) y vastago en una sola
  // revolucion: menos objetos en pantalla y las aristas salen igual de limpias.
  const perfil = [
    new THREE.Vector2(0, -0.5),
    new THREE.Vector2(rCabeza - 0.32, -0.5),
    new THREE.Vector2(rCabeza, -0.18),          // chaflan 45 grados
    new THREE.Vector2(rCabeza, 0),
    new THREE.Vector2(0.3, 0),                  // cara superior de la cabeza
    new THREE.Vector2(0.3, 6.72),               // vastago diam 0.6
    new THREE.Vector2(0.22, 6.9),
    new THREE.Vector2(0, 6.9)
  ];
  g.add(BP.bp(new THREE.LatheGeometry(perfil, 24), { tono: tono, nombre: 'cuerpo' }));

  // Muelle helicoidal. Umbral alto para quedarnos con las seis generatrices
  // del tubo y no con los anillos de cada tramo.
  g.add(BP.bp(geoMuelle(), { tono: 'acento', umbral: 45, nombre: 'muelle' }));

  // Platillo superior (diam ext 2.4 / int 0.7, espesor 0.4).
  const platillo = BP.tubo(1.2, 0.35, 0.4, 24, { nombre: 'platillo' });
  platillo.position.y = 6.7;
  g.add(platillo);

  // Dos chavetas (cunas) que agarran el vastago bajo el platillo.
  for (const lado of [-1, 1]) {
    const chaveta = BP.caja(0.22, 0.34, 0.5, { tono: 'acento', nombre: 'chaveta' });
    chaveta.position.set(lado * 0.42, 6.85, 0);
    g.add(chaveta);
  }

  // Taque de vaso: hijo llamado 'taque', se mueve con la valvula.
  g.add(BP.bp(geoTaque(), { nombre: 'taque' }));

  return g;
}

function construirValvulas() {
  const g = BP.G('valvulas');
  BP.tag(g, {
    id: 'valvulas',
    etiqueta: 'Valvulas, muelles y taques',
    paso: 7,
    explode: new THREE.Vector3(0, 20, 0),
    desc: '16 valvulas: admision de 34 mm en Z=-36, escape de 30 mm en Z=+36. Alzada maxima 10 mm.'
  });

  const plantillas = {};

  for (let c = 0; c < 4; c++) {
    const xCil = K.MOTOR.cilindrosX[c];
    for (const tipo of ['adm', 'esc']) {
      for (const lado of ['a', 'b']) {
        const v = instancia(plantillas, tipo, () => plantillaValvula(tipo));
        v.name = 'valvula-' + tipo + '-' + (c + 1) + '-' + lado;
        v.position.set(
          xCil + (lado === 'a' ? -DX_VALVULA : DX_VALVULA),
          Y_CIERRE,
          tipo === 'adm' ? Z_ADM : Z_ESC
        );
        // Datos que necesita motion(): tipo de leva y desfase de ciclo.
        v.userData.valvula = {
          esAdmision: tipo === 'adm',
          desfase: DESFASE_CICLO[c] * GRADO
        };
        g.add(v);
      }
    }
  }

  g.add(BP.etiqueta('Valvulas 16V', {
    posicion: new THREE.Vector3(-20.5, 26.5, -6.5)
  }));

  return g;
}

// ---------------------------------------------------------------------------
// PASO 8 - ARBOLES DE LEVAS Y SOMBRERETES
//
// FASE DE CADA LEVA
// El grupo de cada leva gira sobre X un angulo fijo 'fase'; encima, el arbol
// entero gira state.anguloLeva. La nariz, que en la geometria apunta a +Y,
// queda por tanto a un angulo total (fase + anguloLeva) medido de +Y hacia +Z.
// Como el taque esta DEBAJO del arbol, la valvula esta abierta del todo cuando
// la nariz mira hacia abajo, o sea cuando ese angulo vale PI:
//
//     fase = PI - anguloLeva(en el maximo de alzada)
//          = PI - (anguloCiguenalDelMaximo / 2)
//
// y el maximo de alzada del cilindro c cae en
//     anguloCiguenal = apertura + duracion/2 - desfaseCiclo[c]
// (el desfase se resta porque en motion() se SUMA al angulo de ciguenal).
// ---------------------------------------------------------------------------

function faseLeva(leva, desfaseGrados) {
  const anguloCiguenal = leva.apertura + leva.duracion / 2 - desfaseGrados;
  return Math.PI - (anguloCiguenal / 2) * GRADO;
}

function construirArbol(nombre, z, leva) {
  const g = BP.G(nombre);
  g.position.set(0, Y_EJE_LEVAS, z);   // el grupo gira sobre su propio eje

  const estado = {};

  // Cuerpo del arbol: diam 2.4, de x = -20 a x = +21.
  const cuerpo = BP.cilindro(1.2, 1.2, 41, 24, { nombre: nombre + '-cuerpo' });
  BP.ejeX(cuerpo);
  cuerpo.position.x = 0.5;
  g.add(cuerpo);

  // Morro delantero, donde monta la rueda de distribucion (x = -20 .. -21.8).
  const morro = BP.cilindro(0.8, 0.8, 1.8, 16, { nombre: nombre + '-morro' });
  BP.ejeX(morro);
  morro.position.x = -20.9;
  g.add(morro);

  // Cinco apoyos de diam 3.2 y ancho 1.4.
  for (const x of X_APOYOS) {
    const apoyo = instancia(estado, 'apoyo', () => {
      const a = BP.cilindro(1.6, 1.6, 1.4, 24, { nombre: 'apoyo' });
      BP.ejeX(a);
      return a;
    });
    apoyo.position.x = x;
    g.add(apoyo);
  }

  // Ocho levas: dos por cilindro, en x = cilX +- 1.85.
  for (let c = 0; c < 4; c++) {
    const fase = faseLeva(leva, DESFASE_CICLO[c]);
    for (const lado of ['a', 'b']) {
      const gl = BP.G('leva-' + nombre + '-' + (c + 1) + '-' + lado);
      gl.position.x = K.MOTOR.cilindrosX[c] + (lado === 'a' ? -DX_VALVULA : DX_VALVULA);
      gl.rotation.x = fase;
      gl.add(instancia(estado, 'leva', () => BP.bp(geoLeva(), { nombre: 'leva' })));
      g.add(gl);
    }
  }

  // Rueda fonica al final del arbol y chavetero de referencia.
  const fonica = ruedaDentada(
    formaEngranaje(12, 2.2, 1.25, 0.5, null), 0.8,
    { tono: 'acento', nombre: nombre + '-fonica' }
  );
  fonica.position.x = 20.4;
  g.add(fonica);

  const chavetero = BP.caja(1.4, 0.35, 0.45, { tono: 'acento', nombre: nombre + '-chavetero' });
  chavetero.position.set(-19.0, 1.15, 0);
  g.add(chavetero);

  return g;
}

function construirArboles() {
  const g = BP.G('arboles-levas');
  BP.tag(g, {
    id: 'arboles-levas',
    etiqueta: 'Arboles de levas',
    paso: 8,
    explode: new THREE.Vector3(0, 18, 0),
    desc: 'Dos arboles en cabeza con el eje en Y=316. Giran a la mitad de vueltas que el ciguenal y en su mismo sentido.'
  });

  g.add(construirArbol('arbol-adm', Z_ADM, K.LEVAS.admision));
  g.add(construirArbol('arbol-esc', Z_ESC, K.LEVAS.escape));

  // Lineas de eje de los dos arboles.
  for (const z of [Z_ADM, Z_ESC]) {
    g.add(BP.lineaEje(
      new THREE.Vector3(-25, Y_EJE_LEVAS, z),
      new THREE.Vector3(24, Y_EJE_LEVAS, z),
      { nombre: 'eje-arbol' }
    ));
  }

  g.add(BP.etiqueta('Arboles de levas DOHC', {
    tono: 'acento',
    posicion: new THREE.Vector3(8, 35.6, 0)
  }));

  return g;
}

// --- sombreretes -----------------------------------------------------------

function plantillaSombrerete() {
  const g = BP.G('sombrerete');

  // Puente con semialojamiento de radio 1.6. El Shape se dibuja en el plano
  // (sx, sy) y luego se lleva al plano YZ: sx -> -Z, sy -> +Y (desde el eje).
  const forma = new THREE.Shape();
  forma.moveTo(-2.4, 0);
  forma.lineTo(-1.6, 0);
  forma.absarc(0, 0, 1.6, Math.PI, 0, true);   // alojamiento del arbol
  forma.lineTo(2.4, 0);
  forma.lineTo(2.4, 1.9);
  forma.lineTo(-2.4, 1.9);
  forma.closePath();

  const puente = BP.extrusion(forma, { depth: 1.4, curveSegments: 12 }, { nombre: 'puente' });
  puente.rotation.y = Math.PI / 2;
  puente.position.x = -0.7;
  g.add(puente);

  // Dos tornillos de diam 0.9.
  const estado = {};
  for (const lado of [-1, 1]) {
    const t = instancia(estado, 'tornillo',
      () => BP.bp(geoTornillo(), { tono: 'acento', nombre: 'tornillo' }));
    t.position.set(0, 0, lado * 2.05);
    g.add(t);
  }

  return g;
}

function construirSombreretes() {
  const g = BP.G('sombreretes-levas');
  BP.tag(g, {
    id: 'sombreretes-levas',
    etiqueta: 'Sombreretes de levas',
    paso: 8,
    explode: new THREE.Vector3(0, 22, 0),
    desc: '10 sombreretes en puente, de Y=316 a Y=335, que cierran los apoyos de los dos arboles.'
  });

  const estado = {};
  for (const z of [Z_ADM, Z_ESC]) {
    const sufijo = z < 0 ? 'adm' : 'esc';
    for (let i = 0; i < X_APOYOS.length; i++) {
      const s = instancia(estado, 'sombrerete', plantillaSombrerete);
      s.name = 'sombrerete-' + sufijo + '-' + (i + 1);
      s.position.set(X_APOYOS[i], Y_EJE_LEVAS, z);
      g.add(s);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// PASO 9 - PINONES, CADENA DE DISTRIBUCION Y TENSOR
//
// Todo el tren vive en el plano X = -22.5. Dentro de ese plano se trabaja en
// coordenadas 2D (u, v) = (Z, Y).
//
// TRAZADO DE LA CADENA: es el problema clasico de la correa alrededor de tres
// poleas. Se recorren las tres circunferencias en sentido HORARIO
// (ciguenal -> admision -> escape -> ciguenal) y para cada par consecutivo se
// calcula su tangente exterior:
//
//     los puntos de tangencia de A y B estan en el MISMO angulo fi, con
//     cos(fi - alfa) = (rA - rB) / distancia,   alfa = angulo de A hacia B
//
// De las dos soluciones se toma fi = alfa + acos(...), que es la que deja la
// normal exterior a la izquierda del avance (recorrido horario).
// Luego la cadena es: arco de contacto + tramo recto + arco + recto + ...
// ---------------------------------------------------------------------------

const CIRCULOS_CADENA = [
  { u: 0, v: 0, r: 3.0 },                        // pinon de ciguenal
  { u: Z_ADM, v: Y_EJE_LEVAS, r: 6.0 },          // rueda de admision
  { u: Z_ESC, v: Y_EJE_LEVAS, r: 6.0 }           // rueda de escape
];

let _trazado = null;

function trazadoCadena() {
  if (_trazado) return _trazado;

  const C = CIRCULOS_CADENA;
  const n = C.length;
  const tangentes = [];

  for (let i = 0; i < n; i++) {
    const a = C[i];
    const b = C[(i + 1) % n];
    const du = b.u - a.u;
    const dv = b.v - a.v;
    const dist = Math.hypot(du, dv);
    const alfa = Math.atan2(dv, du);
    const cos = Math.max(-1, Math.min(1, (a.r - b.r) / dist));
    const fi = alfa + Math.acos(cos);
    tangentes.push({
      fi: fi,
      pa: { u: a.u + a.r * Math.cos(fi), v: a.v + a.r * Math.sin(fi) },
      pb: { u: b.u + b.r * Math.cos(fi), v: b.v + b.r * Math.sin(fi) }
    });
  }

  // Poligonal cerrada: arco de cada rueda + tramo recto hasta la siguiente.
  const puntos = [];
  for (let i = 0; i < n; i++) {
    const c = C[i];
    const aEntrada = tangentes[(i - 1 + n) % n].fi;
    let aSalida = tangentes[i].fi;
    while (aSalida > aEntrada) aSalida -= Math.PI * 2;   // horario: angulo baja

    const pasos = Math.max(2, Math.ceil((aEntrada - aSalida) / (8 * GRADO)));
    for (let k = 0; k <= pasos; k++) {
      const a = aEntrada + (aSalida - aEntrada) * (k / pasos);
      puntos.push(new THREE.Vector3(
        X_PLANO_DIST,
        c.v + c.r * Math.sin(a),
        c.u + c.r * Math.cos(a)
      ));
    }

    // Tres puntos intermedios en el tramo recto (los extremos ya estan puestos
    // por los arcos de una y otra rueda).
    const A = tangentes[i].pa;
    const B = tangentes[i].pb;
    for (let k = 1; k <= 3; k++) {
      const t = k / 4;
      puntos.push(new THREE.Vector3(
        X_PLANO_DIST,
        A.v + (B.v - A.v) * t,
        A.u + (B.u - A.u) * t
      ));
    }
  }

  _trazado = { tangentes: tangentes, puntos: puntos };
  return _trazado;
}

// Inclinacion (rotacion sobre X) de un ramal recto, con el ramal apuntando
// siempre hacia arriba.
function inclinacionRamal(tangente) {
  let du = tangente.pb.u - tangente.pa.u;
  let dv = tangente.pb.v - tangente.pa.v;
  if (dv < 0) { du = -du; dv = -dv; }
  return Math.atan2(du, dv);
}

function construirPinonCiguenal() {
  const g = BP.G('pinon-ciguenal');
  g.position.set(X_PLANO_DIST, 0, 0);

  g.add(ruedaDentada(
    formaEngranaje(22, 3.0, 1.7, 0.55, null), ESPESOR_RUEDA,
    { tono: 'acento', nombre: 'pinon-ciguenal-corona' }
  ));

  const buje = BP.tubo(2.2, 1.7, 1.9, 24, { nombre: 'pinon-ciguenal-buje' });
  BP.ejeX(buje);
  g.add(buje);

  return g;
}

function construirRuedaArbol(nombre, z) {
  const g = BP.G(nombre);
  g.position.set(X_PLANO_DIST, Y_EJE_LEVAS, z);

  g.add(ruedaDentada(
    formaEngranaje(44, 6.0, 1.0, 0.55, { cantidad: 4, radio: 1.3, distancia: 3.6 }),
    ESPESOR_RUEDA,
    { tono: 'acento', nombre: nombre + '-corona' }
  ));

  const buje = BP.tubo(1.8, 0.85, 1.9, 24, { nombre: nombre + '-buje' });
  BP.ejeX(buje);
  g.add(buje);

  return g;
}

function construirCadena() {
  const curva = new THREE.CatmullRomCurve3(trazadoCadena().puntos, true);
  const geo = new THREE.TubeGeometry(curva, 170, 0.35, 5, true);
  return BP.bp(geo, { tono: 'acento', umbral: 45, nombre: 'cadena' });
}

// Patin / rail curvo: barra ligeramente abombada hacia la cadena.
// 'lado' = +1 si la cadena queda hacia -Z (tensor) y -1 si hacia +Z (guia).
// Recuerda que al girar la pieza 90 grados sobre Y, sx pasa a ser -Z.
function railCurvo(semiLargo, espesor, flecha, ancho, lado, nombre) {
  const forma = new THREE.Shape();
  const n = 6;
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    const sx = lado * flecha * (1 - t * t);        // cara de contacto
    const sy = t * semiLargo;
    if (i === 0) forma.moveTo(sx, sy); else forma.lineTo(sx, sy);
  }
  for (let i = n; i >= 0; i--) {
    const t = -1 + (2 * i) / n;
    const sx = lado * (flecha * (1 - t * t) * 0.5 - espesor);
    forma.lineTo(sx, t * semiLargo);
  }
  forma.closePath();

  const rail = BP.extrusion(forma, { depth: ancho, curveSegments: 1 }, { nombre: nombre });
  rail.rotation.y = Math.PI / 2;
  rail.position.x = -ancho / 2;
  return rail;
}

function construirTensor() {
  const g = BP.G('tensor-cadena');
  g.position.set(X_PLANO_DIST, 16, 7);

  // Patin apoyado en el ramal flojo (lado escape), con su misma inclinacion.
  const patin = BP.G('patin-tensor');
  patin.rotation.x = inclinacionRamal(trazadoCadena().tangentes[2]);
  patin.position.z = 0.35;
  patin.add(railCurvo(6.5, 0.7, 0.45, 1.2, 1, 'patin'));
  g.add(patin);

  // Piston hidraulico y cuerpo del tensor.
  const piston = BP.cilindro(0.6, 0.6, 1.8, 16, { tono: 'acento', nombre: 'piston-tensor' });
  BP.ejeZ(piston);
  piston.position.z = 1.6;
  g.add(piston);

  const cuerpo = BP.caja(1.8, 3.2, 2.0, { nombre: 'cuerpo-tensor' });
  cuerpo.position.z = 3.5;
  g.add(cuerpo);

  return g;
}

function construirGuia() {
  const g = BP.G('guia-cadena');
  g.position.set(X_PLANO_DIST, 15, -7);

  const rail = BP.G('rail-guia');
  rail.rotation.x = inclinacionRamal(trazadoCadena().tangentes[0]);
  rail.position.z = -0.15;   // justo por fuera del ramal, sin tocarlo
  rail.add(railCurvo(10.5, 0.7, 0.25, 1.2, -1, 'guia'));
  g.add(rail);

  // Dos anclajes al bloque.
  const estado = {};
  for (const y of [-9.5, 9.5]) {
    const anclaje = instancia(estado, 'anclaje', () => {
      const a = BP.cilindro(0.45, 0.45, 1.4, 12, { tono: 'acento', nombre: 'anclaje-guia' });
      BP.ejeZ(a);
      return a;
    });
    anclaje.position.set(0, y, -1.2);
    g.add(anclaje);
  }

  return g;
}

function construirTren() {
  const g = BP.G('distribucion');
  BP.tag(g, {
    id: 'distribucion',
    etiqueta: 'Cadena de distribucion',
    paso: 9,
    explode: new THREE.Vector3(-26, 0, 0),
    desc: 'Pinon de ciguenal de 22 dientes y ruedas de arbol de 44: relacion 2:1. Tensor hidraulico en el ramal flojo.'
  });

  g.add(construirPinonCiguenal());
  g.add(construirRuedaArbol('rueda-adm', Z_ADM));
  g.add(construirRuedaArbol('rueda-esc', Z_ESC));
  g.add(construirCadena());
  g.add(construirTensor());
  g.add(construirGuia());

  g.add(BP.etiqueta('Cadena de distribucion', {
    tono: 'acento',
    posicion: new THREE.Vector3(X_PLANO_DIST, 41, 0)
  }));

  return g;
}

// ---------------------------------------------------------------------------
// PASO 10 - TAPA DE DISTRIBUCION
// Placa de X = -23.2 a -24.6. El cuerpo va en modo solo aristas (solido:false)
// para no tapar visualmente la cadena que hay detras.
// ---------------------------------------------------------------------------

function rectanguloRedondeado(x0, x1, y0, y1, r) {
  const f = new THREE.Shape();
  f.moveTo(x0 + r, y0);
  f.lineTo(x1 - r, y0);
  f.absarc(x1 - r, y0 + r, r, -Math.PI / 2, 0, false);
  f.lineTo(x1, y1 - r);
  f.absarc(x1 - r, y1 - r, r, 0, Math.PI / 2, false);
  f.lineTo(x0 + r, y1);
  f.absarc(x0 + r, y1 - r, r, Math.PI / 2, Math.PI, false);
  f.lineTo(x0, y0 + r);
  f.absarc(x0 + r, y0 + r, r, Math.PI, Math.PI * 1.5, false);
  f.closePath();
  return f;
}

// Posiciones (Z, Y) de los 12 tornillos perimetrales.
const TORNILLOS_TAPA = [
  [-7, 34.5], [0, 34.5], [7, 34.5],
  [-7, -8.5], [0, -8.5], [7, -8.5],
  [-9, 26], [-9, 13], [-9, 0],
  [9, 26], [9, 13], [9, 0]
];

function construirTapa() {
  const g = BP.G('tapa-distribucion');
  BP.tag(g, {
    id: 'tapa-distribucion',
    etiqueta: 'Tapa de distribucion',
    paso: 10,
    explode: new THREE.Vector3(-26, 0, 0),
    desc: 'Tapa delantera de X=-232 a X=-246, con reten del morro del ciguenal y 12 tornillos.'
  });

  const cuerpo = BP.extrusion(
    rectanguloRedondeado(-10.5, 10.5, -10, 36, 3),
    { depth: 1.4, curveSegments: 6 },
    { solido: false, nombre: 'tapa-cuerpo' }
  );
  cuerpo.rotation.y = Math.PI / 2;
  cuerpo.position.x = -24.6;   // la extrusion crece hacia +X: -24.6 .. -23.2
  g.add(cuerpo);

  // Reten del morro del ciguenal: dos anillos concentricos.
  const anilloExt = BP.tubo(2.6, 2.1, 1.0, 24, { nombre: 'reten-exterior' });
  BP.ejeX(anilloExt);
  anilloExt.position.x = -23.9;
  g.add(anilloExt);

  const anilloInt = BP.tubo(1.95, 1.62, 1.4, 24, { tono: 'acento', nombre: 'reten-interior' });
  BP.ejeX(anilloInt);
  anilloInt.position.x = -23.9;
  g.add(anilloInt);

  // 12 tornillos perimetrales.
  const estado = {};
  for (let i = 0; i < TORNILLOS_TAPA.length; i++) {
    const t = instancia(estado, 'tornillo', () => {
      const c = BP.cilindro(0.4, 0.4, 1.8, 12, { tono: 'acento', nombre: 'tornillo-tapa' });
      BP.ejeX(c);
      return c;
    });
    t.position.set(-23.9, TORNILLOS_TAPA[i][1], TORNILLOS_TAPA[i][0]);
    g.add(t);
  }

  return g;
}

// ---------------------------------------------------------------------------
// CONSTRUCCION DEL MODULO
// ---------------------------------------------------------------------------

export function build(ctx) {   // eslint-disable-line no-unused-vars
  const g = BP.G('mod-distribucion');
  g.add(construirValvulas());
  g.add(construirArboles());
  g.add(construirSombreretes());
  g.add(construirTren());
  g.add(construirTapa());
  return g;
}

// ---------------------------------------------------------------------------
// ANIMACION
//
// - Los dos arboles y sus ruedas giran a state.anguloLeva (= anguloCiguenal/2)
//   y el pinon a state.anguloCiguenal: mismo signo, o sea mismo sentido, que
//   es lo que impone la cadena.
// - Cada valvula baja lo que diga K.alzadaValvula para su leva y su cilindro.
// - No se toca ningun material: son compartidos.
// ---------------------------------------------------------------------------

function crearCache(group) {
  const cache = {
    arbolAdm: group.getObjectByName('arbol-adm'),
    arbolEsc: group.getObjectByName('arbol-esc'),
    ruedaAdm: group.getObjectByName('rueda-adm'),
    ruedaEsc: group.getObjectByName('rueda-esc'),
    pinon: group.getObjectByName('pinon-ciguenal'),
    valvulas: []
  };

  const grupoValvulas = group.getObjectByName('valvulas');
  if (grupoValvulas) {
    for (const v of grupoValvulas.children) {
      const datos = v.userData && v.userData.valvula;
      if (!datos) continue;
      cache.valvulas.push({
        grupo: v,
        esAdmision: datos.esAdmision,
        desfase: datos.desfase
      });
    }
  }
  return cache;
}

export function motion(group, state) {
  if (!group || !state) return;

  let cache = group.userData.cacheDistribucion;
  if (!cache) {
    cache = crearCache(group);
    group.userData.cacheDistribucion = cache;
  }

  const anguloCiguenal = state.anguloCiguenal || 0;
  const anguloLeva = (state.anguloLeva === undefined || state.anguloLeva === null)
    ? anguloCiguenal / 2
    : state.anguloLeva;

  if (cache.arbolAdm) cache.arbolAdm.rotation.x = anguloLeva;
  if (cache.arbolEsc) cache.arbolEsc.rotation.x = anguloLeva;
  if (cache.ruedaAdm) cache.ruedaAdm.rotation.x = anguloLeva;
  if (cache.ruedaEsc) cache.ruedaEsc.rotation.x = anguloLeva;
  if (cache.pinon) cache.pinon.rotation.x = anguloCiguenal;

  for (const v of cache.valvulas) {
    const leva = v.esAdmision ? K.LEVAS.admision : K.LEVAS.escape;
    const alzada = K.alzadaValvula(
      anguloCiguenal + v.desfase,
      leva.apertura,
      leva.duracion,
      ALZADA_MAX
    );
    v.grupo.position.y = Y_CIERRE - alzada;
  }
}
