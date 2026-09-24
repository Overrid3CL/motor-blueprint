// js/kinematics.js
// ---------------------------------------------------------------------------
// Cinematica del mecanismo biela-manivela y del tren de valvulas.
// Motor 4 cilindros en linea, DOHC 16V, 1998 cc (86 x 86 mm).
//
// SISTEMA DE COORDENADAS (comun a todo el proyecto):
//   X = eje del ciguenal. -X frontal (distribucion). +X trasero (volante).
//   Y = vertical, eje de los cilindros. Y = 0 es el EJE DEL CIGUENAL.
//   Z = transversal. -Z admision. +Z escape.
//   1 unidad de three.js = 1 cm.
//
// Este modulo es PURO: no importa three.js, no crea geometria y no tiene
// estado. Solo numeros. Asi puede usarse desde cualquier modulo de piezas.
// ---------------------------------------------------------------------------

export const MOTOR = {
  diametro: 8.6,
  carrera: 8.6,
  radioManivela: 4.3,
  longitudBiela: 14.4,
  separacion: 9.6,
  cilindrosX: [-14.4, -4.8, 4.8, 14.4],
  desfase: [0, Math.PI, Math.PI, 0],
  deckY: 22.0,
  fondoBloqueY: -9.0,
  ordenEncendido: [1, 3, 4, 2],
  cilindrada: 1998
};

// --- utilidades internas ---------------------------------------------------

// Indice de cilindro saneado a 0..3 (los modulos a veces iteran de 1 a 4).
function idx(i) {
  const n = MOTOR.cilindrosX.length;
  return ((Math.trunc(i) % n) + n) % n;
}

function acotar(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

const RAD_A_GRADOS = 180 / Math.PI;

// ---------------------------------------------------------------------------
// GEOMETRIA DEL MECANISMO
//
//   r = radioManivela (4.3)   L = longitudBiela (14.4)
//   a = angulo de manivela del cilindro i (0 rad = PMS)
//
//   munequilla:  y = r*cos(a)              z = r*sin(a)
//   bulon:       y = r*cos(a) + sqrt(L^2 - (r*sin(a))^2)   (siempre en z = 0)
//
//   Comprobacion de cotas:
//     PMS (a = 0)  -> yBulon = 4.3 + 14.4 = 18.7
//     PMI (a = PI) -> yBulon = -4.3 + 14.4 = 10.1
//     carrera = 18.7 - 10.1 = 8.6  OK
// ---------------------------------------------------------------------------

// Angulo de manivela del cilindro i, con su desfase de ciguenal aplicado.
export function anguloCilindro(anguloCiguenal, i) {
  return anguloCiguenal + MOTOR.desfase[idx(i)];
}

// Altura Y del centro del bulon (y por tanto del piston) del cilindro i.
export function yBulon(anguloCiguenal, i) {
  const a = anguloCilindro(anguloCiguenal, i);
  const r = MOTOR.radioManivela;
  const L = MOTOR.longitudBiela;
  const s = r * Math.sin(a);
  return r * Math.cos(a) + Math.sqrt(Math.max(0, L * L - s * s));
}

// Centro de la munequilla de biela del cilindro i, en el plano YZ.
// (su X es MOTOR.cilindrosX[i], que no depende del angulo)
export function posMunequilla(anguloCiguenal, i) {
  const a = anguloCilindro(anguloCiguenal, i);
  const r = MOTOR.radioManivela;
  return { y: r * Math.cos(a), z: r * Math.sin(a) };
}

// ---------------------------------------------------------------------------
// CONVENIO DE SIGNO DE anguloBiela  (LEER ANTES DE USARLO)
//
// Definicion:   anguloBiela = asin( r*sin(a) / L )
//
// CONVENIO OBLIGATORIO PARA LOS MODULOS DE PIEZAS:
//   Un Group de biela cuyo ORIGEN este en el centro del BULON y cuyo CUERPO
//   apunte hacia -Y (es decir, la cabeza de biela esta en la posicion local
//   (0, -L, 0)) queda correctamente alineado con la munequilla haciendo:
//
//        biela.position.set(cilX, K.yBulon(ang, i), 0);
//        biela.rotation.x = -K.anguloBiela(ang, i);
//
// DEMOSTRACION (por esto el signo es negativo):
//   1) Vector real del bulon a la munequilla:
//        dz = r*sin(a) - 0            = r*sin(a)
//        dy = r*cos(a) - yBulon(a)    = -sqrt(L^2 - (r*sin(a))^2)
//      (su modulo es exactamente L, como debe ser)
//
//   2) Una rotacion de angulo t alrededor de X transforma (y, z) asi:
//        y' = y*cos(t) - z*sin(t)
//        z' = y*sin(t) + z*cos(t)
//      Aplicada al eje local del cuerpo de la biela, (0, -L, 0):
//        y' = -L*cos(t)
//        z' = -L*sin(t)
//
//   3) Igualando con el vector real del paso 1:
//        -L*cos(t) = -sqrt(L^2 - (r*sin(a))^2)  ->  cos(t) = +sqrt(...)/L > 0
//        -L*sin(t) = r*sin(a)                   ->  sin(t) = -r*sin(a)/L
//
//      Luego  t = -asin( r*sin(a)/L ) = -anguloBiela(a).   QED
//
// COROLARIO UTIL (mismo razonamiento, para el propio ciguenal):
//   Una rotacion positiva sobre X lleva +Y hacia +Z, y posMunequilla cumple
//   (y, z) = (r*cos(a), r*sin(a)), que es justo +Y girado +a sobre X. Por eso
//   el ciguenal se anima con   ciguenal.rotation.x = anguloCiguenal;   (signo
//   POSITIVO, sin negar), siempre que su geometria se construya con el
//   cilindro 1 en PMS (munequilla arriba, en +Y).
// ---------------------------------------------------------------------------

// Inclinacion de la biela, en radianes. Ver el convenio de signo de arriba:
// se usa como  group.rotation.x = -anguloBiela(anguloCiguenal, i)
export function anguloBiela(anguloCiguenal, i) {
  const a = anguloCilindro(anguloCiguenal, i);
  const seno = (MOTOR.radioManivela * Math.sin(a)) / MOTOR.longitudBiela;
  return Math.asin(acotar(seno, -1, 1));
}

// ---------------------------------------------------------------------------
// TREN DE VALVULAS
//
// El ciclo completo de cuatro tiempos son 720 grados de ciguenal (el arbol de
// levas gira a la mitad de vueltas). El origen de angulos, 0 grados, es el PMS
// de COMPRESION del cilindro 1.
//
// Perfil de alzada senoidal, suave y sin escalones:
//     fuera de la ventana -> 0
//     dentro              -> alzadaMax * sin(PI * t),  con t = 0..1
// ---------------------------------------------------------------------------

export function alzadaValvula(anguloCiguenal, aperturaGrados, duracionGrados, alzadaMax = 1.0) {
  const duracion = Number(duracionGrados) || 0;
  if (duracion <= 0) return 0;

  // Angulo de ciguenal en grados, normalizado al ciclo de 720.
  const grados = (((anguloCiguenal * RAD_A_GRADOS) % 720) + 720) % 720;

  // Posicion dentro de la ventana de apertura, tambien modulo 720.
  const desde = (((grados - aperturaGrados) % 720) + 720) % 720;
  if (desde >= duracion) return 0;

  const t = desde / duracion;
  return alzadaMax * Math.sin(Math.PI * t);
}

// Diagrama de distribucion, en grados de ciguenal (0 = PMS de compresion cil.1)
export const LEVAS = {
  admision: { apertura: 340, duracion: 230 },
  escape: { apertura: 130, duracion: 230 }
};
