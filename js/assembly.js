// js/assembly.js
// ---------------------------------------------------------------------------
// Motor de ENSAMBLADO: convierte las piezas marcadas con BP.tag() en una
// secuencia de montaje reproducible (y en una vista explosionada).
//
// IDEA CLAVE (y motivo de que esto funcione sin pelearse con los modulos):
// escanear() NO toca la pieza. Inserta un Group ENVOLTORIO entre la pieza y su
// padre, y solo mueve el envoltorio. Asi los modulos de piezas pueden seguir
// escribiendo obj.position / obj.rotation en su motion() (pistones, valvulas,
// ciguenal...) sin que el ensamblado les pise nada, y viceversa.
//
//     padre  ->  [pieza]                 antes de escanear
//     padre  ->  pieza__asm  ->  [pieza] despues de escanear
//
// UNIDADES DE 'progreso': numero de pasos montados, de 0 a total.
//   progreso = 0      -> nada montado (todas las piezas ocultas)
//   progreso = k + t  -> pasos 0..k-1 montados, paso k entrando con avance t
//   progreso = total  -> motor completo
// Son las MISMAS unidades que usa ui.js en handlers.scrub / setProgreso.
// ---------------------------------------------------------------------------

import * as THREE from 'three';
import * as BP from './blueprint.js';

// Etiquetas oficiales de los 15 pasos de montaje (numeracion GLOBAL).
// Si un modulo declara un paso fuera de esta tabla se usa la etiqueta de su
// primera pieza.
const ETIQUETAS_PASO = [
  'Bloque motor y camisas',
  'Ciguenal y cojinetes de bancada',
  'Tapas de bancada y tornilleria',
  'Pistones, segmentos, bulones y bielas',
  'Bomba de aceite, colador y carter',
  'Junta de culata',
  'Culata',
  'Valvulas, muelles, platillos y taques',
  'Arboles de levas y sombreretes',
  'Pinones, cadena de distribucion y tensor',
  'Tapa de distribucion y polea de ciguenal',
  'Volante motor y corona de arranque',
  'Colector de admision, mariposa e inyectores',
  'Colector de escape',
  'Bujias y tapa de balancines'
];

const VELOCIDAD_POR_DEFECTO = 0.55;   // pasos por segundo
const EPS = 1e-4;

// Suavizado del viaje de cada pieza (implementado a mano, sin dependencias).
function easeInOutCubic(t) {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function acotar(v, min, max) {
  return v < min ? min : (v > max ? max : v);
}

// ---------------------------------------------------------------------------

export class Ensamblado {
  /**
   * @param {THREE.Object3D} raiz  contenedor de todas las piezas (el 'motor')
   */
  constructor(raiz) {
    this.raiz = raiz || new THREE.Group();

    this._registros = [];      // { obj, w, datos }
    this._pasos = [];          // { indice, etiqueta, piezas:[registro] }

    this._progreso = 0;
    this._velocidad = VELOCIDAD_POR_DEFECTO;
    this._reproduciendo = false;
    this._modo = 'secuencia';  // 'secuencia' | 'explosionada'

    this._resaltado = -1;      // ordinal del paso con las aristas en acento
    this._activo = -1;         // ordinal del paso activo (para onPaso)

    // callback(ordinal, etiqueta, paso)
    this.onPaso = null;
  }

  // -------------------------------------------------------------------------
  // ESCANEO
  // -------------------------------------------------------------------------

  /**
   * Recorre la jerarquia buscando userData.pieza y envuelve cada pieza en su
   * propio Group. Se puede llamar mas de una vez (las piezas ya envueltas se
   * ignoran), por si se anaden modulos despues.
   */
  escanear() {
    // 1) Recoger PRIMERO la lista completa; reparentar mientras se recorre la
    //    jerarquia daria resultados impredecibles.
    const pendientes = [];
    this.raiz.traverse((obj) => {
      if (obj.userData && obj.userData.pieza && !obj.userData.asmEnvuelto) {
        pendientes.push(obj);
      }
    });

    // 2) Y despues reparentar.
    for (const obj of pendientes) {
      const padre = obj.parent;
      if (!padre) continue;

      const w = new THREE.Group();
      w.name = (obj.name || obj.userData.pieza.id || 'pieza') + '__asm';
      w.userData.esEnvoltorio = true;

      padre.add(w);
      w.add(obj);              // obj conserva su position/rotation locales
      obj.userData.asmEnvuelto = true;

      this._registros.push({ obj: obj, w: w, datos: obj.userData.pieza });
    }

    this._agruparPasos();
    this._progreso = acotar(this._progreso, 0, this.total);
    this._aplicar();
    return this;
  }

  _agruparPasos() {
    const mapa = new Map();

    for (const r of this._registros) {
      const bruto = Number(r.datos.paso);
      const i = Number.isFinite(bruto) ? Math.trunc(bruto) : 0;
      if (!mapa.has(i)) mapa.set(i, []);
      mapa.get(i).push(r);
    }

    // Solo los pasos CON piezas, ordenados por su indice global (que se
    // conserva tal cual en el campo 'indice' y en la etiqueta).
    const indices = Array.from(mapa.keys()).sort((a, b) => a - b);

    this._pasos = indices.map((i) => {
      const piezas = mapa.get(i);
      const etiqueta = ETIQUETAS_PASO[i] ||
        (piezas[0] && piezas[0].datos.etiqueta) ||
        ('Paso ' + (i + 1));
      return { indice: i, etiqueta: etiqueta, piezas: piezas };
    });

    this._resaltado = -1;
    this._activo = -1;
  }

  // -------------------------------------------------------------------------
  // LECTURA
  // -------------------------------------------------------------------------

  get pasos() {
    return this._pasos.slice();
  }

  get total() {
    return this._pasos.length;
  }

  get progreso() {
    return this._progreso;
  }

  // Extra util para main.js (no forma parte del contrato minimo).
  get reproduciendo() {
    return this._reproduciendo;
  }

  get modo() {
    return this._modo;
  }

  // -------------------------------------------------------------------------
  // CONTROL
  // -------------------------------------------------------------------------

  setProgreso(p) {
    const v = Number(p);
    this._progreso = acotar(Number.isFinite(v) ? v : 0, 0, this.total);
    this._aplicar();
    return this;
  }

  setModo(modo) {
    this._modo = modo === 'explosionada' ? 'explosionada' : 'secuencia';
    // Al volver a 'secuencia' se recalcula con el progreso que ya habia.
    this._aplicar();
    return this;
  }

  setVelocidad(v) {
    const n = Number(v);
    if (Number.isFinite(n) && n > 0) this._velocidad = n;
    return this;
  }

  play() {
    if (this.total === 0) return this;
    // Pulsar play con el motor ya montado reinicia la secuencia.
    if (this._progreso >= this.total - EPS) this.setProgreso(0);
    this._reproduciendo = true;
    return this;
  }

  pause() {
    this._reproduciendo = false;
    return this;
  }

  reiniciar() {
    this._reproduciendo = false;
    this.setProgreso(0);
    return this;
  }

  /** i = ORDINAL del paso (0 .. total-1). Deja ese paso montado del todo. */
  irAPaso(i) {
    if (this.total === 0) return this;
    const k = acotar(Math.round(Number(i) || 0), 0, this.total - 1);
    this._reproduciendo = false;
    this.setProgreso(k + 1);
    return this;
  }

  siguiente() {
    return this.setProgreso(Math.min(this.total, Math.floor(this._progreso + EPS) + 1));
  }

  anterior() {
    return this.setProgreso(Math.max(0, Math.ceil(this._progreso - EPS) - 1));
  }

  update(dt) {
    if (!this._reproduciendo) return this;

    const paso = (Number(dt) || 0) * this._velocidad;
    let p = this._progreso + paso;
    if (p >= this.total) {
      p = this.total;
      this.pause();
    }
    return this.setProgreso(p);
  }

  // -------------------------------------------------------------------------
  // APLICACION AL GRAFO DE ESCENA
  // -------------------------------------------------------------------------

  _aplicar() {
    const explosion = this._modo === 'explosionada';
    const total = this.total;

    for (let k = 0; k < total; k++) {
      const piezas = this._pasos[k].piezas;

      // En explosionada: t = 0 -> factor 1 -> explode al 100%, y todo visible.
      const t = explosion ? 0 : acotar(this._progreso - k, 0, 1);
      const f = 1 - easeInOutCubic(t);
      const visible = explosion ? true : t > 0.0001;

      for (let n = 0; n < piezas.length; n++) {
        const r = piezas[n];
        const d = r.datos;

        if (f === 0) {
          // Montado: offset CERO exacto, sin residuos de coma flotante.
          r.w.position.set(0, 0, 0);
          if (d.giro) r.w.rotation.set(0, 0, 0);
        } else {
          r.w.position.set(d.explode.x * f, d.explode.y * f, d.explode.z * f);
          if (d.giro) r.w.rotation.set(d.giro.x * f, d.giro.y * f, d.giro.z * f);
        }

        r.w.visible = visible;
      }
    }

    this._actualizarResaltado(explosion);
    this._notificarPaso();
  }

  // Resalta en acento las aristas del paso que se esta montando ahora mismo.
  // Solo se toca el grafo cuando CAMBIA el paso resaltado, nunca cada frame.
  _actualizarResaltado(explosion) {
    let k = -1;

    if (!explosion && this.total > 0) {
      const base = Math.floor(this._progreso);
      const t = this._progreso - base;
      if (base >= 0 && base < this.total && t > EPS && t < 1 - EPS) k = base;
    }

    if (k === this._resaltado) return;

    if (this._resaltado >= 0) this._pintarPaso(this._resaltado, false);
    this._resaltado = k;
    if (k >= 0) this._pintarPaso(k, true);
  }

  // No se crea ningun material: se usa BP.MAT.acento y se restaura el original.
  _pintarPaso(k, activo) {
    const paso = this._pasos[k];
    if (!paso) return;

    for (const r of paso.piezas) {
      r.obj.traverse((hijo) => {
        if (!hijo.isLineSegments) return;
        if (hijo.userData.matOriginal === undefined) {
          hijo.userData.matOriginal = hijo.material;
        }
        hijo.material = activo ? BP.MAT.acento : hijo.userData.matOriginal;
      });
    }
  }

  // Paso "activo" = el que se esta montando. Mismo criterio que ui.js
  // (Math.floor del progreso), para que la lista y el 3D no se desincronicen.
  _notificarPaso() {
    const k = this.total > 0
      ? acotar(Math.floor(this._progreso), 0, this.total - 1)
      : -1;

    if (k === this._activo) return;
    this._activo = k;

    if (typeof this.onPaso !== 'function' || k < 0) return;
    const paso = this._pasos[k];
    try {
      this.onPaso(k, paso.etiqueta, paso);
    } catch (err) {
      console.error('[ensamblado] fallo en onPaso', err);
    }
  }
}

export default Ensamblado;
