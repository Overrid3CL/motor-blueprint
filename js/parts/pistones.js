// js/parts/pistones.js
// ---------------------------------------------------------------------------
// MODULO DE PIEZAS: los cuatro conjuntos piston-biela.
//
// Paso de montaje: 3 (una pieza montable por cilindro, cuatro en total).
//
// Estructura que espera motion() (no la cambies sin tocar motion):
//   mod-pistones
//     +- conjunto-1 .. conjunto-4   Group montable, en X = K.MOTOR.cilindrosX[i]
//     |    +- piston-N              origen en el CENTRO DEL BULON
//     |    +- biela-N               origen en el CENTRO DEL BULON, cuerpo a -Y
//     +- ejes-cilindros             lineas de eje (no montables)
//     +- cota-carrera               acotacion de la carrera (no montable)
//
// ---------------------------------------------------------------------------
// VERIFICACION DE LA CINEMATICA  (lo mas importante del fichero)
//
// La biela se construye con su origen en el bulon y la CABEZA en la posicion
// local (0, -L, 0), con L = 14.4. En cada fotograma se hace:
//
//     biela.position.y = K.yBulon(ang, i);
//     biela.rotation.x = -K.anguloBiela(ang, i);
//
// Comprobacion de que la cabeza cae EXACTAMENTE sobre la munequilla:
//   Sea t = -anguloBiela(ang, i) = -asin(r*sin(a)/L), con a = anguloCilindro.
//   Una rotacion t sobre X transforma (0, -L, 0) en:
//       y' = -L*cos(t)      z' = -L*sin(t)
//   Como cos(t) = +sqrt(L^2 - (r*sin a)^2)/L  y  sin(t) = -r*sin(a)/L:
//       y' = -sqrt(L^2 - (r*sin a)^2)
//       z' = +r*sin(a)
//   Sumando la traslacion del bulon, yBulon = r*cos(a) + sqrt(L^2-(r*sin a)^2):
//       y_mundo = r*cos(a)      z_mundo = r*sin(a)
//   Que es exactamente K.posMunequilla(ang, i) = { y: r*cos a, z: r*sin a }.
//
//   CONCLUSION: el signo negativo de la spec es el correcto y coincide con el
//   convenio documentado en kinematics.js. No hay nada que corregir aqui.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import * as BP from '../blueprint.js';
import * as K from '../kinematics.js';

// Segmentos radiales (el plano se dibuja con aristas: se conservador).
const SEG = 28;
const SEG_FINO = 24;

// ---------------------------------------------------------------------------
// COTAS LOCALES DEL PISTON  (origen = centro del bulon)
// Cara superior de la corona en y = +3.2 ; fondo del faldon en y = -3.4.
// Altura total 6.6 y bulon a 3.2 por debajo de la corona, como pide la tabla.
// ---------------------------------------------------------------------------
const P = {
  coronaR: 4.29,          // diam 8.58
  coronaBaja: 2.6,
  coronaAlta: 3.2,
  landaExt: 4.22,         // cuerpo de la zona de segmentos (algo mas fino)
  landaInt: 3.50,
  segExt: 4.30,           // segmentos: diam ext 8.6
  segInt: 3.95,           //            diam int 7.9
  segEsp: 0.18,
  segY: [2.6, 1.9, 0.9],
  faldonExt: 4.25,        // diam 8.5
  faldonInt: 3.80,        // diam 7.6
  faldonY0: 0.4,
  faldonY1: -3.4,
  alojExt: 1.70,          // alojamientos del bulon: diam ext 3.4
  alojInt: 1.12,
  alojLargo: 0.9,
  alojX: 1.5,
  bulonExt: 1.10,         // bulon: diam 2.2
  bulonInt: 0.62,
  bulonLargo: 7.0,
  rebajeR: 1.40,          // rebajes de valvula en la corona
  rebajeProf: 0.22,
  rebajeX: 1.85,
  rebajeZ: 2.15
};

// ---------------------------------------------------------------------------
// COTAS LOCALES DE LA BIELA  (origen = centro del bulon, cuerpo hacia -Y)
// ---------------------------------------------------------------------------
const B = {
  pieExt: 1.80,           // pie: diam ext 3.6
  pieInt: 1.125,          //      diam int 2.25
  pieEsp: 2.6,            //      espesor en X

  cuerpoY0: -1.8,         // arranque del cuerpo (tangente al pie)
  cuerpoY1: -11.2,        // fin del cuerpo (se mete en la cabeza)
  anchoArriba: 2.30,      // ancho total en Z arriba  (troncoconico:
  anchoAbajo: 2.90,       //            y en Z abajo   mas ancho abajo)
  ala: 0.60,              // ancho en Z de cada ala del perfil en doble T
  espesorAla: 1.40,       // espesor en X de las alas (el maximo del cuerpo)
  espesorAlma: 0.80,      // espesor en X del alma (rehundida: se ve la doble T)

  cabezaY: -14.4,         // centro de la cabeza = centro de la munequilla
  cabezaExt: 3.50,        // diam ext 7.0
  cabezaInt: 2.40,        // diam int 4.8
  cabezaEsp: 3.0,         // espesor en X

  casquilloExt: 2.40,     // semicasquillos: diam 4.8
  casquilloInt: 2.275,    //                 diam 4.55
  casquilloEsp: 2.6,

  tornilloR: 0.45,        // tornillos del sombrerete: diam 0.9
  tornilloLargo: 3.4,
  tornilloZ: 2.7
};

// ---------------------------------------------------------------------------
// METADATOS PARA LA UI
// ---------------------------------------------------------------------------

function descripcionConjunto(n) {
  return 'Piston de aluminio con tres segmentos, bulon flotante y biela de ' +
    'perfil en doble T con sombrerete atornillado. Cilindro ' + n +
    ', carrera 86 mm, longitud de biela 144 mm.';
}

export const info = {
  id: 'pistones',
  titulo: 'Pistones y bielas',
  piezas: [1, 2, 3, 4].map(function (n) {
    return {
      id: 'conjunto-' + n,
      etiqueta: 'Conjunto piston-biela ' + n,
      paso: 3,
      desc: descripcionConjunto(n)
    };
  })
};

// ---------------------------------------------------------------------------
// AYUDAS DE FORMA
//
// Convenio de las extrusiones de este fichero:
//   El THREE.Shape se dibuja en (u, v) y se extruye en profundidad w.
//   Al grupo devuelto se le aplica rotation.y = PI/2, que lleva
//       u -> -Z        v -> +Y        w -> +X
//   y despues se centra la profundidad con position.x = -profundidad/2.
//   Como todas las formas de aqui son simetricas en u, el cambio de signo de
//   u es irrelevante.
// ---------------------------------------------------------------------------

const CUARTO_GIRO = Math.PI / 2;

// Coloca una extrusion segun el convenio de arriba.
function tumbarEnX(grupo, profundidad, y) {
  grupo.rotation.y = CUARTO_GIRO;
  grupo.position.set(-profundidad / 2, y || 0, 0);
  return grupo;
}

// Trapecio: (uA,uB) arriba en v0, (uC,uD) abajo en v1.
function formaTrapecio(uA, uB, uC, uD, v0, v1) {
  const s = new THREE.Shape();
  s.moveTo(uA, v0);
  s.lineTo(uB, v0);
  s.lineTo(uD, v1);
  s.lineTo(uC, v1);
  s.closePath();
  return s;
}

// Medio anillo (semicorona circular) centrado en el origen del Shape.
// arriba = true -> mitad v >= 0 ; false -> mitad v <= 0.
function formaMedioAnillo(rExt, rInt, arriba) {
  const s = new THREE.Shape();
  if (arriba) {
    s.moveTo(rExt, 0);
    s.absarc(0, 0, rExt, 0, Math.PI, false);
    s.lineTo(-rInt, 0);
    s.absarc(0, 0, rInt, Math.PI, 0, true);
  } else {
    s.moveTo(-rExt, 0);
    s.absarc(0, 0, rExt, Math.PI, 2 * Math.PI, false);
    s.lineTo(rInt, 0);
    s.absarc(0, 0, rInt, 2 * Math.PI, Math.PI, true);
  }
  s.closePath();
  return s;
}

// Extrusion recta, sin bisel, con arcos suaves pero baratos.
// 14 divisiones por arco = 12.9 grados, por debajo del umbral de aristas (24),
// asi que los arcos salen limpios y sin lineas radiales parasitas.
function extruir(shape, profundidad, opts) {
  return BP.extrusion(
    shape,
    { depth: profundidad, bevelEnabled: false, steps: 1, curveSegments: 14 },
    opts
  );
}

// ---------------------------------------------------------------------------
// PISTON
// Todo en coordenadas locales con el origen en el CENTRO DEL BULON.
// ---------------------------------------------------------------------------

function construirPiston(n) {
  const g = BP.G('piston-' + n);

  // --- Corona -------------------------------------------------------------
  const alturaCorona = P.coronaAlta - P.coronaBaja;
  const corona = BP.cilindro(P.coronaR, P.coronaR, alturaCorona, SEG, { nombre: 'corona' });
  corona.position.y = (P.coronaAlta + P.coronaBaja) / 2;
  g.add(corona);

  // --- Rebajes de valvula -------------------------------------------------
  // Cuatro rebajes (dos de admision hacia -Z, dos de escape hacia +Z), uno por
  // valvula, hundidos en la corona y dibujados en tono tenue.
  const rebajes = BP.G('rebajes-valvula');
  const yRebaje = P.coronaAlta - P.rebajeProf / 2;
  for (let sx = -1; sx <= 1; sx += 2) {
    for (let sz = -1; sz <= 1; sz += 2) {
      const d = BP.cilindro(P.rebajeR, P.rebajeR, P.rebajeProf, SEG_FINO, { tono: 'tenue' });
      d.position.set(sx * P.rebajeX, yRebaje, sz * P.rebajeZ);
      rebajes.add(d);
    }
  }
  g.add(rebajes);

  // --- Zona de segmentos (cuerpo entre la corona y el faldon) -------------
  const landaAlto = P.coronaBaja - P.faldonY0;
  const landa = BP.tubo(P.landaExt, P.landaInt, landaAlto, SEG, { nombre: 'zona-segmentos' });
  landa.position.y = (P.coronaBaja + P.faldonY0) / 2;
  g.add(landa);

  // --- Tres segmentos, en acento para que se distingan --------------------
  const segmentos = BP.G('segmentos');
  for (let s = 0; s < P.segY.length; s++) {
    const anillo = BP.tubo(P.segExt, P.segInt, P.segEsp, SEG_FINO, { tono: 'acento' });
    anillo.name = 'segmento-' + (s + 1);
    anillo.position.y = P.segY[s];
    segmentos.add(anillo);
  }
  g.add(segmentos);

  // --- Faldon -------------------------------------------------------------
  const faldonAlto = P.faldonY0 - P.faldonY1;
  const faldon = BP.tubo(P.faldonExt, P.faldonInt, faldonAlto, SEG, { nombre: 'faldon' });
  faldon.position.y = (P.faldonY0 + P.faldonY1) / 2;
  g.add(faldon);

  // --- Alojamientos del bulon --------------------------------------------
  const alojamientos = BP.G('alojamientos-bulon');
  for (let sx = -1; sx <= 1; sx += 2) {
    const a = BP.ejeX(BP.tubo(P.alojExt, P.alojInt, P.alojLargo, SEG_FINO, { nombre: 'alojamiento' }));
    a.position.x = sx * P.alojX;
    alojamientos.add(a);
  }
  g.add(alojamientos);

  // --- Bulon (hueco, como el real; diametro exterior 2.2) -----------------
  const bulon = BP.G('bulon-' + n);
  bulon.add(BP.ejeX(BP.tubo(P.bulonExt, P.bulonInt, P.bulonLargo, SEG, { tono: 'acento' })));
  g.add(bulon);

  return g;
}

// ---------------------------------------------------------------------------
// BIELA
// Origen en el CENTRO DEL BULON, cuerpo hacia -Y, cabeza en y = -14.4.
// ---------------------------------------------------------------------------

// Cuerpo con perfil en doble T: dos alas en los extremos de Z (con el espesor
// maximo, 1.4 en X) unidas por un alma central rehundida (0.8 en X). Mirando
// el motor de frente (segun X) las tres piezas dibujan la doble T; mirando por
// el eje de la biela se ve literalmente la seccion en I.
// Ligeramente troncoconico: mas ancho abajo que arriba.
function construirCuerpoBiela() {
  const g = BP.G('cuerpo-biela');

  const hA = B.anchoArriba / 2;   // semiancho total arriba
  const hB = B.anchoAbajo / 2;    // semiancho total abajo
  const almaA = hA - B.ala;       // semiancho del alma arriba
  const almaB = hB - B.ala;       // semiancho del alma abajo

  // Ala en +u y ala en -u.
  for (let s = -1; s <= 1; s += 2) {
    const forma = formaTrapecio(s * almaA, s * hA, s * almaB, s * hB, B.cuerpoY0, B.cuerpoY1);
    const ala = extruir(forma, B.espesorAla, { nombre: 'ala-biela' });
    g.add(tumbarEnX(ala, B.espesorAla, 0));
  }

  // Alma central, mas fina en X: es lo que crea la seccion en doble T.
  const formaAlma = formaTrapecio(-almaA, almaA, -almaB, almaB, B.cuerpoY0, B.cuerpoY1);
  const alma = extruir(formaAlma, B.espesorAlma, { nombre: 'alma-biela' });
  g.add(tumbarEnX(alma, B.espesorAlma, 0));

  return g;
}

function construirBiela(n) {
  const g = BP.G('biela-' + n);

  // --- Pie de biela (aloja el bulon) --------------------------------------
  const pie = BP.ejeX(BP.tubo(B.pieExt, B.pieInt, B.pieEsp, SEG, { nombre: 'pie-biela' }));
  g.add(pie);

  // --- Cuerpo en doble T --------------------------------------------------
  g.add(construirCuerpoBiela());

  // --- Cabeza: mitad superior (pertenece a la biela) ----------------------
  const mitadAlta = extruir(formaMedioAnillo(B.cabezaExt, B.cabezaInt, true), B.cabezaEsp, {
    nombre: 'cabeza-biela'
  });
  g.add(tumbarEnX(mitadAlta, B.cabezaEsp, B.cabezaY));

  // Semicasquillo superior.
  const casqAlto = extruir(formaMedioAnillo(B.casquilloExt, B.casquilloInt, true), B.casquilloEsp, {
    tono: 'acento',
    nombre: 'semicasquillo-alto'
  });
  g.add(tumbarEnX(casqAlto, B.casquilloEsp, B.cabezaY));

  // --- Sombrerete: mitad inferior + semicasquillo + dos tornillos ---------
  const sombrerete = BP.G('sombrerete-' + n);

  const mitadBaja = extruir(formaMedioAnillo(B.cabezaExt, B.cabezaInt, false), B.cabezaEsp, {
    nombre: 'tapa-cabeza'
  });
  sombrerete.add(tumbarEnX(mitadBaja, B.cabezaEsp, B.cabezaY));

  const casqBajo = extruir(formaMedioAnillo(B.casquilloExt, B.casquilloInt, false), B.casquilloEsp, {
    tono: 'acento',
    nombre: 'semicasquillo-bajo'
  });
  sombrerete.add(tumbarEnX(casqBajo, B.casquilloEsp, B.cabezaY));

  for (let s = -1; s <= 1; s += 2) {
    const t = BP.cilindro(B.tornilloR, B.tornilloR, B.tornilloLargo, SEG_FINO, { tono: 'acento' });
    t.name = 'tornillo-biela';
    t.position.set(0, B.cabezaY, s * B.tornilloZ);
    sombrerete.add(t);
  }

  g.add(sombrerete);

  // --- Numero de cilindro marcado en el pie de biela ----------------------
  g.add(BP.etiqueta('B' + n, {
    tono: 'acento',
    posicion: new THREE.Vector3(0, 0.1, 2.3)
  }));

  return g;
}

// ---------------------------------------------------------------------------
// CONJUNTO PISTON-BIELA (pieza montable del paso 3)
// ---------------------------------------------------------------------------

function construirConjunto(i) {
  const n = i + 1;
  const g = BP.G('conjunto-' + n);
  g.position.x = K.MOTOR.cilindrosX[i];

  const piston = construirPiston(n);
  const biela = construirBiela(n);

  // Posicion de reposo: angulo de ciguenal 0.
  const y0 = K.yBulon(0, i);
  piston.position.y = y0;
  biela.position.y = y0;
  biela.rotation.x = -K.anguloBiela(0, i);

  g.add(piston, biela);

  BP.tag(g, {
    id: 'conjunto-' + n,
    etiqueta: 'Conjunto piston-biela ' + n,
    paso: 3,
    explode: new THREE.Vector3(0, 36 + i * 2.5, 0),
    desc: descripcionConjunto(n)
  });

  return g;
}

// ---------------------------------------------------------------------------
// BUILD
// ---------------------------------------------------------------------------

export function build(ctx) {                 // ctx = { THREE, BP, K }
  void ctx;                                  // se usan los imports del modulo
  const raiz = BP.G('mod-pistones');

  for (let i = 0; i < K.MOTOR.cilindrosX.length; i++) {
    raiz.add(construirConjunto(i));
  }

  // --- Lineas de eje de los cuatro cilindros (no montables) ---------------
  const ejes = BP.G('ejes-cilindros');
  for (let i = 0; i < K.MOTOR.cilindrosX.length; i++) {
    const x = K.MOTOR.cilindrosX[i];
    ejes.add(BP.lineaEje(
      new THREE.Vector3(x, 4, 0),
      new THREE.Vector3(x, 40, 0),
      { nombre: 'eje-cilindro-' + (i + 1) }
    ));
  }
  raiz.add(ejes);

  // --- Cota de la carrera en el cilindro 1 --------------------------------
  // PMS de la corona: yBulon(0)  + 3.2 = 18.7 + 3.2 = 21.9
  // PMI de la corona: yBulon(PI) + 3.2 = 10.1 + 3.2 = 13.3   -> carrera 8.6
  // Se saca hacia el lado de admision (-Z) para no cruzar el bloque.
  const x1 = K.MOTOR.cilindrosX[0];
  raiz.add(BP.cota(
    new THREE.Vector3(x1, 13.3, 0),
    new THREE.Vector3(x1, 21.9, 0),
    '86.0 mm',
    { eje: 'z', desplazamiento: -13, tono: 'acento', nombre: 'cota-carrera' }
  ));

  return raiz;
}

// ---------------------------------------------------------------------------
// MOTION
// El piston NO rota nunca; la biela pivota sobre el bulon.
// Las referencias se buscan una sola vez y se cachean en group.userData.
// ---------------------------------------------------------------------------

function cachearReferencias(group) {
  const refs = [];
  for (let i = 0; i < K.MOTOR.cilindrosX.length; i++) {
    const n = i + 1;
    const conjunto = group.getObjectByName('conjunto-' + n);
    if (!conjunto) {
      refs.push(null);
      continue;
    }
    const piston = conjunto.getObjectByName('piston-' + n);
    const biela = conjunto.getObjectByName('biela-' + n);
    refs.push(piston && biela ? { piston: piston, biela: biela } : null);
  }
  return refs;
}

export function motion(group, state) {
  let refs = group.userData.refsPistones;
  if (!refs) {
    refs = cachearReferencias(group);
    group.userData.refsPistones = refs;
  }

  const angulo = state && typeof state.anguloCiguenal === 'number' ? state.anguloCiguenal : 0;

  for (let i = 0; i < refs.length; i++) {
    const r = refs[i];
    if (!r) continue;
    const y = K.yBulon(angulo, i);
    r.piston.position.y = y;
    r.biela.position.y = y;
    r.biela.rotation.x = -K.anguloBiela(angulo, i);
  }
}
