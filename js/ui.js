/* =========================================================================
   js/ui.js - Interfaz del plano (DOM puro, sin three.js)
   API publica: createUI(opts) -> controlador
   =========================================================================

   opts = {
     pasos:   [ { indice:0, etiqueta:'Bloque motor y camisas' }, ... ],
     modulos: [ info, info, ... ],          // los 'info' de js/parts/*.js
     handlers: { play, pause, reset, scrub, paso, velocidad, marcha, rpm,
                 rejilla, etiquetas, corte, explosion, solidos, vista }
   }

   Controlador devuelto:
     setProgreso(progreso)  progreso en las MISMAS unidades que handlers.scrub,
                            es decir 0 .. pasos.length (0 = nada montado,
                            pasos.length = motor completo)
     setPaso(i), setPlaying(bool), setMarcha(bool), setRpm(n), setFps(n),
     setEstado(texto), setInfoPieza(etiqueta, desc)
   ========================================================================= */

'use strict';

/* ---------- utilidades cortas ---------- */
const $ = (sel, raiz) => (raiz || document).querySelector(sel);
const $$ = (sel, raiz) => Array.prototype.slice.call((raiz || document).querySelectorAll(sel));
const dos = (n) => String(n).padStart(2, '0');
const limita = (v, min, max) => (v < min ? min : v > max ? max : v);

// Escribe texto solo si cambia (evita layout thrashing en cada frame).
function texto(nodo, valor) {
  if (!nodo) return;
  if (nodo.textContent !== valor) nodo.textContent = valor;
}

function on(nodo, evento, fn) {
  if (nodo) nodo.addEventListener(evento, fn);
}

// Mapa de teclas numericas a vistas.
const VISTAS = ['iso', 'frontal', 'lateral', 'superior', 'detalle'];

/* =========================================================================
   createUI
   ========================================================================= */
export function createUI(opts) {
  const cfg = opts || {};
  const pasos = Array.isArray(cfg.pasos) ? cfg.pasos.slice() : [];
  const modulos = Array.isArray(cfg.modulos) ? cfg.modulos.slice() : [];
  const handlers = cfg.handlers || {};
  const total = pasos.length;

  // Llama a un handler si existe, sin romper la UI si falla.
  function llama(nombre) {
    const fn = handlers[nombre];
    if (typeof fn !== 'function') return;
    const args = Array.prototype.slice.call(arguments, 1);
    try {
      fn.apply(handlers, args);
    } catch (err) {
      console.error('[ui] fallo en el handler "' + nombre + '"', err);
    }
  }

  /* ---------- referencias al DOM ---------- */
  const el = {
    cuerpo: document.body,
    listaPasos: $('#lista-pasos'),
    listaModulos: $('#lista-modulos'),

    btnPlay: $('#btn-play'),
    btnPlayTexto: $('#btn-play-texto'),
    btnReset: $('#btn-reset'),
    btnAnterior: $('#btn-anterior'),
    btnSiguiente: $('#btn-siguiente'),

    scrub: $('#scrub'),
    barra: $('#progreso-barra'),
    pasoLectura: $('#paso-lectura'),
    pasoNombre: $('#paso-nombre'),

    grupoVelocidad: $('#grupo-velocidad'),
    grupoVista: $('#grupo-vista'),
    listaCapas: $('#lista-capas'),

    chkMarcha: $('#chk-marcha'),
    marchaEstado: $('#marcha-estado'),
    rpmRango: $('#rpm-rango'),
    rpmLectura: $('#rpm-lectura'),

    fpsLectura: $('#fps-lectura'),
    estadoLectura: $('#estado-lectura'),
    piezaTitulo: $('#pieza-titulo'),
    piezaDesc: $('#pieza-desc'),

    btnPanel: $('#btn-panel'),
    btnCerrarPanel: $('#btn-cerrar-panel')
  };

  /* ---------- estado interno de la interfaz ---------- */
  const est = {
    progreso: 0,        // 0 .. total
    pasoActual: 0,      // 0 .. total-1
    reproduciendo: false,
    marcha: false,
    rpm: el.rpmRango ? Number(el.rpmRango.value) : 900,
    velocidad: 1,
    arrastrando: false,
    fps: -1,
    piezaSeleccionada: null
  };

  const nodosPaso = [];   // botones de la lista de pasos, por indice
  const nodosPieza = [];  // botones del despiece

  /* =======================================================================
     Construccion de las listas
     ======================================================================= */
  function pintarListaPasos() {
    if (!el.listaPasos) return;
    el.listaPasos.textContent = '';
    nodosPaso.length = 0;

    pasos.forEach((paso, orden) => {
      const indice = typeof paso.indice === 'number' ? paso.indice : orden;
      const li = document.createElement('li');
      const boton = document.createElement('button');
      boton.type = 'button';
      boton.className = 'paso paso--pendiente';
      boton.dataset.paso = String(orden);
      boton.title = paso.etiqueta || '';

      const num = document.createElement('span');
      num.className = 'paso__num';
      num.textContent = dos(indice + 1);

      const txt = document.createElement('span');
      txt.className = 'paso__texto';
      txt.textContent = paso.etiqueta || ('Paso ' + dos(indice + 1));

      const marca = document.createElement('span');
      marca.className = 'paso__marca';
      marca.textContent = '✓';   // check

      boton.appendChild(num);
      boton.appendChild(txt);
      boton.appendChild(marca);
      boton.addEventListener('click', () => irAPaso(orden));

      li.appendChild(boton);
      el.listaPasos.appendChild(li);
      nodosPaso.push(boton);
    });
  }

  function pintarDespiece() {
    if (!el.listaModulos) return;
    el.listaModulos.textContent = '';
    nodosPieza.length = 0;

    modulos.forEach((info) => {
      if (!info) return;
      const seccion = document.createElement('section');
      seccion.className = 'modulo';

      const titulo = document.createElement('h4');
      titulo.className = 'modulo__titulo';
      titulo.textContent = info.titulo || info.id || 'Conjunto';
      seccion.appendChild(titulo);

      const ul = document.createElement('ul');
      ul.className = 'modulo__piezas';

      const piezas = Array.isArray(info.piezas) ? info.piezas : [];
      piezas.forEach((pieza) => {
        const li = document.createElement('li');
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'pieza';
        boton.dataset.pieza = pieza.id || '';
        boton.dataset.paso = String(typeof pieza.paso === 'number' ? pieza.paso : 0);

        const np = document.createElement('span');
        np.className = 'pieza__paso';
        np.textContent = dos((typeof pieza.paso === 'number' ? pieza.paso : 0) + 1);

        const et = document.createElement('span');
        et.className = 'pieza__etiqueta';
        et.textContent = pieza.etiqueta || pieza.id || 'Pieza';

        boton.appendChild(np);
        boton.appendChild(et);
        boton.addEventListener('click', () => {
          seleccionaPieza(boton);
          ctrl.setInfoPieza(pieza.etiqueta || pieza.id || '', pieza.desc || '');
          const destino = indiceDePaso(typeof pieza.paso === 'number' ? pieza.paso : 0);
          if (destino >= 0) irAPaso(destino);
        });

        li.appendChild(boton);
        ul.appendChild(li);
        nodosPieza.push(boton);
      });

      seccion.appendChild(ul);
      el.listaModulos.appendChild(seccion);
    });
  }

  // Del 'indice' declarado en opts.pasos a la posicion en la lista.
  function indiceDePaso(indice) {
    for (let i = 0; i < pasos.length; i++) {
      const v = typeof pasos[i].indice === 'number' ? pasos[i].indice : i;
      if (v === indice) return i;
    }
    return limita(indice, 0, Math.max(0, total - 1));
  }

  function seleccionaPieza(boton) {
    nodosPieza.forEach((n) => n.classList.toggle('activa', n === boton));
    est.piezaSeleccionada = boton ? boton.dataset.pieza : null;
  }

  /* =======================================================================
     Pintado del estado
     ======================================================================= */
  function pintarPasos() {
    for (let i = 0; i < nodosPaso.length; i++) {
      const n = nodosPaso[i];
      const hecho = i < est.pasoActual || (i === est.pasoActual && est.progreso >= i + 1);
      const activo = i === est.pasoActual && !hecho;
      n.classList.toggle('paso--hecho', hecho);
      n.classList.toggle('paso--activo', activo || (i === est.pasoActual && est.progreso >= total));
      n.classList.toggle('paso--pendiente', !hecho && !activo && i !== est.pasoActual);
      n.setAttribute('aria-current', i === est.pasoActual ? 'step' : 'false');
    }
  }

  function pintarLecturaPaso() {
    if (total === 0) {
      texto(el.pasoLectura, 'PASO --/--');
      texto(el.pasoNombre, 'Sin secuencia cargada');
      return;
    }
    const paso = pasos[est.pasoActual] || {};
    texto(el.pasoLectura, 'PASO ' + dos(est.pasoActual + 1) + '/' + dos(total));
    texto(el.pasoNombre, paso.etiqueta || '');
    if (el.btnAnterior) el.btnAnterior.disabled = est.pasoActual <= 0;
    if (el.btnSiguiente) el.btnSiguiente.disabled = est.pasoActual >= total - 1;
  }

  function pintarProgreso() {
    const frac = total > 0 ? limita(est.progreso / total, 0, 1) : 0;
    if (el.scrub && !est.arrastrando) {
      const v = String(frac);
      if (el.scrub.value !== v) el.scrub.value = v;
    }
    if (el.barra) {
      const ancho = (frac * 100).toFixed(2) + '%';
      if (el.barra.style.width !== ancho) el.barra.style.width = ancho;
    }
  }

  function pintarPlay() {
    if (!el.btnPlay) return;
    const icono = el.btnPlay.querySelector('.icono');
    if (icono) {
      icono.classList.toggle('icono--play', !est.reproduciendo);
      icono.classList.toggle('icono--pausa', est.reproduciendo);
    }
    el.btnPlay.classList.toggle('activo', est.reproduciendo);
    el.btnPlay.setAttribute('aria-pressed', est.reproduciendo ? 'true' : 'false');
    el.btnPlay.setAttribute('aria-label', est.reproduciendo ? 'Pausa' : 'Reproducir');
    texto(el.btnPlayTexto, est.reproduciendo ? 'Pausa' : 'Montar');
  }

  function pintarMarcha() {
    if (el.chkMarcha) el.chkMarcha.checked = est.marcha;
    texto(el.marchaEstado, est.marcha ? 'ON' : 'OFF');
    el.cuerpo.classList.toggle('en-marcha', est.marcha);
  }

  function pintarRpm() {
    const n = Math.round(est.rpm);
    if (el.rpmRango && Number(el.rpmRango.value) !== n) el.rpmRango.value = String(n);
    texto(el.rpmLectura, n.toLocaleString('es-ES') + ' rpm');
  }

  /* =======================================================================
     Acciones
     ======================================================================= */
  function irAPaso(i) {
    if (total === 0) return;
    const destino = limita(Math.round(i), 0, total - 1);
    est.pasoActual = destino;
    pintarPasos();
    pintarLecturaPaso();
    const paso = pasos[destino] || {};
    llama('paso', typeof paso.indice === 'number' ? paso.indice : destino);
  }

  function alternarPlay() {
    est.reproduciendo = !est.reproduciendo;
    pintarPlay();
    llama(est.reproduciendo ? 'play' : 'pause');
  }

  function reiniciar() {
    est.reproduciendo = false;
    est.progreso = 0;
    est.pasoActual = 0;
    pintarPlay();
    pintarProgreso();
    pintarPasos();
    pintarLecturaPaso();
    llama('reset');
  }

  function ponVelocidad(mult, boton) {
    est.velocidad = mult;
    if (el.grupoVelocidad) {
      $$('[data-velocidad]', el.grupoVelocidad).forEach((b) => {
        b.classList.toggle('activo', b === boton || Number(b.dataset.velocidad) === mult);
      });
    }
    llama('velocidad', mult);
  }

  function ponVista(nombre) {
    if (el.grupoVista) {
      $$('[data-vista]', el.grupoVista).forEach((b) => {
        b.classList.toggle('activo', b.dataset.vista === nombre);
      });
    }
    llama('vista', nombre);
  }

  function aplicaCapa(nombre, valor) {
    if (nombre === 'etiquetas') el.cuerpo.classList.toggle('sin-etiquetas', !valor);
    llama(nombre, valor);
  }

  function alternarCapa(nombre) {
    const casilla = $('[data-capa="' + nombre + '"]');
    if (!casilla) return;
    casilla.checked = !casilla.checked;
    aplicaCapa(nombre, casilla.checked);
  }

  function alternarMarcha(valor) {
    est.marcha = typeof valor === 'boolean' ? valor : !est.marcha;
    pintarMarcha();
    llama('marcha', est.marcha);
  }

  function abrePanel(abierto) {
    const estado = typeof abierto === 'boolean' ? abierto : !el.cuerpo.classList.contains('panel-abierto');
    el.cuerpo.classList.toggle('panel-abierto', estado);
    if (el.btnPanel) el.btnPanel.setAttribute('aria-expanded', estado ? 'true' : 'false');
  }

  /* =======================================================================
     Cableado de eventos
     ======================================================================= */
  on(el.btnPlay, 'click', alternarPlay);
  on(el.btnReset, 'click', reiniciar);
  on(el.btnAnterior, 'click', () => irAPaso(est.pasoActual - 1));
  on(el.btnSiguiente, 'click', () => irAPaso(est.pasoActual + 1));

  if (el.scrub) {
    const empieza = () => { est.arrastrando = true; };
    const termina = () => { est.arrastrando = false; };
    on(el.scrub, 'pointerdown', empieza);
    on(el.scrub, 'pointerup', termina);
    on(el.scrub, 'pointercancel', termina);
    on(el.scrub, 'keydown', empieza);
    on(el.scrub, 'keyup', termina);
    on(el.scrub, 'blur', termina);

    on(el.scrub, 'input', () => {
      const frac = limita(Number(el.scrub.value) || 0, 0, 1);
      est.progreso = frac * total;
      est.pasoActual = total > 0 ? limita(Math.floor(est.progreso), 0, total - 1) : 0;
      pintarProgreso();
      pintarPasos();
      pintarLecturaPaso();
      llama('scrub', est.progreso);
    });
  }

  if (el.grupoVelocidad) {
    on(el.grupoVelocidad, 'click', (ev) => {
      const boton = ev.target.closest('[data-velocidad]');
      if (!boton) return;
      ponVelocidad(Number(boton.dataset.velocidad), boton);
    });
  }

  if (el.grupoVista) {
    on(el.grupoVista, 'click', (ev) => {
      const boton = ev.target.closest('[data-vista]');
      if (!boton) return;
      ponVista(boton.dataset.vista);
    });
  }

  if (el.listaCapas) {
    on(el.listaCapas, 'change', (ev) => {
      const casilla = ev.target.closest('[data-capa]');
      if (!casilla) return;
      aplicaCapa(casilla.dataset.capa, casilla.checked);
    });
  }

  on(el.chkMarcha, 'change', () => alternarMarcha(!!el.chkMarcha.checked));

  on(el.rpmRango, 'input', () => {
    est.rpm = Number(el.rpmRango.value) || 0;
    pintarRpm();
    llama('rpm', est.rpm);
  });

  on(el.btnPanel, 'click', () => abrePanel());
  on(el.btnCerrarPanel, 'click', () => abrePanel(false));

  /* ---------- atajos de teclado ---------- */
  function esCampo(nodo) {
    if (!nodo) return false;
    if (nodo.isContentEditable) return true;
    const t = (nodo.tagName || '').toLowerCase();
    return t === 'input' || t === 'select' || t === 'textarea' || t === 'option';
  }

  document.addEventListener('keydown', (ev) => {
    if (ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (esCampo(ev.target)) return;

    const tecla = ev.key;
    const baja = tecla.length === 1 ? tecla.toLowerCase() : tecla;

    switch (baja) {
      case ' ': case 'spacebar':
        ev.preventDefault(); alternarPlay(); break;
      case 'r':
        ev.preventDefault(); reiniciar(); break;
      case 'ArrowLeft':
        ev.preventDefault(); irAPaso(est.pasoActual - 1); break;
      case 'ArrowRight':
        ev.preventDefault(); irAPaso(est.pasoActual + 1); break;
      case 'e':
        ev.preventDefault(); alternarCapa('explosion'); break;
      case 'c':
        ev.preventDefault(); alternarCapa('corte'); break;
      case 'g':
        ev.preventDefault(); alternarCapa('rejilla'); break;
      case 'l':
        ev.preventDefault(); alternarCapa('etiquetas'); break;
      case 's':
        ev.preventDefault(); alternarCapa('solidos'); break;
      case 'm':
        ev.preventDefault(); alternarMarcha(); break;
      case '1': case '2': case '3': case '4': case '5':
        ev.preventDefault(); ponVista(VISTAS[Number(baja) - 1]); break;
      default:
        break;
    }
  });

  /* =======================================================================
     Arranque
     ======================================================================= */
  pintarListaPasos();
  pintarDespiece();
  pintarPasos();
  pintarLecturaPaso();
  pintarProgreso();
  pintarPlay();
  pintarMarcha();
  pintarRpm();

  // Estado inicial de las capas leido del HTML (no dispara handlers).
  $$('[data-capa]').forEach((casilla) => {
    if (casilla.dataset.capa === 'etiquetas') {
      el.cuerpo.classList.toggle('sin-etiquetas', !casilla.checked);
    }
  });

  /* =======================================================================
     Controlador publico
     ======================================================================= */
  const ctrl = {
    // progreso en unidades de paso: 0 .. pasos.length
    setProgreso(progreso) {
      const v = Number(progreso);
      if (!isFinite(v)) return;
      est.progreso = limita(v, 0, total);
      est.pasoActual = total > 0 ? limita(Math.floor(est.progreso), 0, total - 1) : 0;
      pintarProgreso();
      pintarPasos();
      pintarLecturaPaso();
    },

    setPaso(i) {
      if (total === 0) return;
      est.pasoActual = limita(Math.round(Number(i) || 0), 0, total - 1);
      pintarPasos();
      pintarLecturaPaso();
    },

    setPlaying(bool) {
      est.reproduciendo = !!bool;
      pintarPlay();
    },

    setMarcha(bool) {
      est.marcha = !!bool;
      pintarMarcha();
    },

    setRpm(n) {
      const v = Number(n);
      if (!isFinite(v)) return;
      est.rpm = limita(v, 0, 12000);
      pintarRpm();
    },

    setFps(n) {
      const v = Math.round(Number(n) || 0);
      if (v === est.fps) return;          // solo escribe si cambia
      est.fps = v;
      texto(el.fpsLectura, String(v));
    },

    setEstado(txt) {
      texto(el.estadoLectura, String(txt == null ? '' : txt).toUpperCase());
    },

    setInfoPieza(etiqueta, desc) {
      texto(el.piezaTitulo, etiqueta ? String(etiqueta) : '—');
      texto(el.piezaDesc, desc ? String(desc) : 'Sin descripcion.');
    }
  };

  return ctrl;
}
