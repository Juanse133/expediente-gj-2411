/* ============================================================
   EXPEDIENTE GJ-2411
   ============================================================ */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var SVGNS = 'http://www.w3.org/2000/svg';

  /* ----------------------------------------------------------
     0. SONIDO — todo sintetizado, sin archivos de audio

     Ningún navegador deja sonar nada antes de un gesto del usuario,
     así que el contexto se crea perezoso y se reanuda en el primer
     toque. Mientras no esté corriendo los sonidos se descartan en vez
     de encolarse: si no, al desbloquearse saldrían todos de golpe.
     ---------------------------------------------------------- */
  var audio = (function () {
    var KEY = 'gj2411-sonido';
    var ctx = null, master = null, noiseBuf = null, noiseLong = null;
    var on = true;
    var bed = null;        // lecho ambiental sonando ahora
    var bedName = null;    // el que debería sonar (aunque aún no suene)
    var ducked = false;    // ambiente bajado (pestaña en segundo plano)
    var engine = null;     // turbina del avión

    try { on = window.localStorage.getItem(KEY) !== 'off'; } catch (e) {}

    function fillNoise(seconds) {
      var len = Math.floor(ctx.sampleRate * seconds);
      var b = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = b.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return b;
    }

    function boot() {
      if (ctx) return ctx;
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }

      // Chrome deja pendiente para siempre la promesa de un resume() previo
      // al gesto, así que el lecho ambiental se engancha aquí y no a ella.
      ctx.addEventListener('statechange', function () {
        if (ctx.state === 'running') applyBed();
      });

      // el compresor deja subir el volumen general sin que los golpes
      // fuertes (sello, obturador) saturen al sumarse con el ambiente
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16;
      comp.knee.value = 22;
      comp.ratio.value = 4;
      comp.attack.value = 0.004;
      comp.release.value = 0.25;
      comp.connect(ctx.destination);

      master = ctx.createGain();
      master.gain.value = 0.95;
      master.connect(comp);

      noiseBuf  = fillNoise(0.5);   // golpes cortos
      noiseLong = fillNoise(4);     // lechos en bucle, largo para que no se note el ciclo

      return ctx;
    }

    // el contexto solo si de verdad puede sonar ahora mismo
    function live() {
      if (!on) return null;
      var c = boot();
      if (!c) return null;
      if (c.state !== 'running') { try { c.resume(); } catch (e) {} return null; }
      return c;
    }

    /* ---------- primitivas ---------- */

    function tone(freq, dur, type, peak, glideTo, delay) {
      var c = live(); if (!c) return;
      var t = c.currentTime + (delay || 0);
      var o = c.createOscillator(), g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(freq, t);
      if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(peak, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + dur + 0.03);
    }

    function hiss(dur, freq, q, peak, type, sweepTo, delay) {
      var c = live(); if (!c) return;
      var t = c.currentTime + (delay || 0);
      var s = c.createBufferSource(); s.buffer = noiseBuf;
      var f = c.createBiquadFilter();
      f.type = type || 'bandpass';
      f.frequency.setValueAtTime(freq, t);
      if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
      f.Q.value = q || 1;
      var g = c.createGain();
      g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      s.start(t); s.stop(t + dur + 0.03);
    }

    /* ---------- lechos ambientales ----------
       Cada lecho es un puñado de nodos en bucle colgando de su propia
       ganancia, para poder cruzarlos sin cortes. */

    function loopNoise(c) {
      var s = c.createBufferSource();
      s.buffer = noiseLong;
      s.loop = true;
      return s;
    }

    // oscilador lento que mueve un parámetro (la respiración del lecho)
    function breathe(c, param, freq, depth, base, nodes) {
      param.value = base;
      var o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.value = depth;
      o.connect(g); g.connect(param);
      o.start();
      nodes.push(o);
    }

    // capa de ruido filtrado, base de casi todos los lechos
    function layer(c, out, filterType, freq, q, level, nodes) {
      var s = loopNoise(c);
      var f = c.createBiquadFilter();
      f.type = filterType; f.frequency.value = freq; f.Q.value = q;
      var g = c.createGain(); g.gain.value = level;
      s.connect(f); f.connect(g); g.connect(out);
      s.start();
      nodes.push(s);
      return { src: s, filter: f, gain: g };
    }

    // evento suelto que se repite a intervalos irregulares
    function scatter(nodes, minMs, maxMs, fn) {
      var alive = true;
      (function next() {
        if (!alive) return;
        setTimeout(function () {
          if (!alive) return;
          fn();
          next();
        }, minMs + Math.random() * (maxMs - minMs));
      })();
      nodes.push({ stop: function () { alive = false; } });
    }

    // sótano de expediente: zumbido grave, aire de sala y golpes lejanos
    function bedMystery(c, out) {
      var nodes = [];

      var lp = c.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 320; lp.Q.value = 0.7;
      lp.connect(out);

      var drone = [55, 55.35, 82.5];      // los dos primeros laten entre sí
      for (var i = 0; i < drone.length; i++) {
        var o = c.createOscillator();
        o.type = i === 2 ? 'triangle' : 'sine';
        o.frequency.value = drone[i];
        var g = c.createGain();
        g.gain.value = i === 2 ? 0.09 : 0.19;
        o.connect(g); g.connect(lp);
        o.start();
        nodes.push(o);
      }

      var air = layer(c, out, 'lowpass', 380, 0.6, 0.075, nodes);
      breathe(c, air.filter.frequency, 0.03, 130, 380, nodes);

      scatter(nodes, 6000, 15000, function () {
        tone(110 + Math.random() * 40, 1.6, 'sine', 0.07);
      });

      return nodes;
    }

    // playa: oleaje que va y viene, espuma, fondo hondo y gaviotas
    function bedBeach(c, out) {
      var nodes = [];

      var waves = layer(c, out, 'lowpass', 760, 0.8, 0.12, nodes);
      breathe(c, waves.filter.frequency, 0.085, 420, 760, nodes);
      breathe(c, waves.gain.gain, 0.085, 0.085, 0.12, nodes);

      var foam = layer(c, out, 'bandpass', 2600, 0.7, 0.03, nodes);
      breathe(c, foam.gain.gain, 0.13, 0.022, 0.032, nodes);

      var deep = c.createOscillator();
      deep.type = 'sine'; deep.frequency.value = 46;
      var dg = c.createGain(); dg.gain.value = 0.07;
      deep.connect(dg); dg.connect(out);
      deep.start();
      nodes.push(deep);

      scatter(nodes, 9000, 23000, function () { api.gull(); });

      return nodes;
    }

    // sala de embarque: murmullo, aire acondicionado y campanilla
    function bedAirport(c, out) {
      var nodes = [];

      var murmur = layer(c, out, 'lowpass', 520, 0.7, 0.1, nodes);
      breathe(c, murmur.filter.frequency, 0.06, 140, 520, nodes);
      breathe(c, murmur.gain.gain, 0.09, 0.03, 0.1, nodes);

      var hum = c.createOscillator();
      hum.type = 'sine'; hum.frequency.value = 92;
      var hg = c.createGain(); hg.gain.value = 0.045;
      hum.connect(hg); hg.connect(out);
      hum.start();
      nodes.push(hum);

      scatter(nodes, 14000, 30000, function () {
        tone(880, 0.9, 'sine', 0.07);
        tone(1174.7, 0.8, 'sine', 0.055, null, 0.2);
      });

      return nodes;
    }

    // ciudad amurallada: gente lejana, tráfico y pasos sobre piedra
    function bedStreet(c, out) {
      var nodes = [];

      var crowd = layer(c, out, 'bandpass', 700, 0.8, 0.075, nodes);
      breathe(c, crowd.gain.gain, 0.07, 0.025, 0.075, nodes);

      var traffic = layer(c, out, 'lowpass', 300, 0.6, 0.055, nodes);
      breathe(c, traffic.filter.frequency, 0.04, 90, 300, nodes);

      scatter(nodes, 2200, 6000, function () {
        tone(170 + Math.random() * 60, 0.07, 'triangle', 0.05, 120);
        hiss(0.04, 1600, 3, 0.03);
      });

      return nodes;
    }

    var BEDS = {
      mystery: bedMystery,
      beach:   bedBeach,
      airport: bedAirport,
      street:  bedStreet
    };

    function killBed(b, fade) {
      if (!b || !ctx) return;
      var t = ctx.currentTime;
      try {
        b.gain.gain.cancelScheduledValues(t);
        b.gain.gain.setValueAtTime(b.gain.gain.value, t);
        b.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
      } catch (e) {}
      setTimeout(function () {
        for (var i = 0; i < b.nodes.length; i++) {
          try { b.nodes[i].stop(); } catch (e) {}
        }
        try { b.gain.disconnect(); } catch (e) {}
      }, fade * 1000 + 120);
    }

    function applyBed() {
      var c = live();
      if (!c) return;                       // aún sin permiso: queda pendiente
      if (bed && bed.name === bedName) return;

      killBed(bed, 1.6);
      bed = null;
      if (!bedName || !BEDS[bedName]) return;

      var g = c.createGain();
      g.gain.value = 0.0001;
      g.connect(master);
      var nodes = BEDS[bedName](c, g);
      g.gain.linearRampToValueAtTime(ducked ? 0.15 : 1, c.currentTime + 2.6);
      bed = { name: bedName, gain: g, nodes: nodes };
    }

    var api = {
      /* ---------- máquina de escribir ----------
         Tres capas: el tipo contra el papel, la palanca del mecanismo y
         la resonancia de la carcasa metálica. */
      key: function () {
        var v = 0.85 + Math.random() * 0.3;
        hiss(0.008, 3400 + Math.random() * 900, 11, 0.22 * v);
        tone(168 + Math.random() * 34, 0.05, 'triangle', 0.3 * v, 96);
        hiss(0.055, 820 + Math.random() * 240, 2.2, 0.13 * v);
      },
      space: function () {
        hiss(0.035, 420, 1.6, 0.18);
        tone(120, 0.05, 'sine', 0.16, 80);
      },
      bell: function () {
        tone(1780, 0.9, 'sine', 0.1);
        tone(2670, 0.6, 'sine', 0.04, null, 0.005);
      },
      ret: function () {
        hiss(0.13, 1500, 1.1, 0.25, 'bandpass', 420);
        tone(150, 0.1, 'triangle', 0.18, 88, 0.09);
      },

      warn:  function () { tone(300, 0.22, 'sawtooth', 0.13, 220); },
      click: function () { hiss(0.03, 2300, 4, 0.2); },
      thunk: function () { tone(140, 0.24, 'sine', 0.28, 68); },
      tear:  function () { hiss(0.17, 1600, 0.8, 0.28, 'lowpass', 320); },
      land:  function () { hiss(0.5, 800, 0.7, 0.22, 'lowpass', 180); },
      gull:  function () {
        tone(1250, 0.16, 'triangle', 0.07, 1750);
        tone(1650, 0.2, 'triangle', 0.06, 1050, 0.19);
      },

      // cada punto del mapa toca su nota: los cuatro forman una frase
      blip: function (i) {
        var scale = [523.25, 587.33, 659.25, 783.99];   // do re mi sol
        var f = scale[(i || 0) % scale.length];
        tone(f, 0.5, 'triangle', 0.17);
        tone(f * 2, 0.2, 'sine', 0.05);
      },

      // turbina: entra al despegar y se va con el aterrizaje
      engineOn: function () {
        var c = live(); if (!c || engine) return;
        var s = loopNoise(c);
        var f = c.createBiquadFilter();
        f.type = 'bandpass'; f.frequency.value = 380; f.Q.value = 0.9;
        var g = c.createGain(); g.gain.value = 0.0001;
        s.connect(f); f.connect(g); g.connect(master);
        s.start();
        g.gain.exponentialRampToValueAtTime(0.2, c.currentTime + 0.9);
        f.frequency.linearRampToValueAtTime(900, c.currentTime + 2.4);
        engine = { s: s, g: g };
      },
      engineOff: function () {
        if (!engine || !ctx) return;
        var e = engine, t = ctx.currentTime;
        engine = null;
        try {
          e.g.gain.cancelScheduledValues(t);
          e.g.gain.setValueAtTime(e.g.gain.value, t);
          e.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.9);
        } catch (err) {}
        setTimeout(function () { try { e.s.stop(); } catch (err) {} }, 1100);
      },

      // obturador de cámara cuando una foto termina de revelarse
      shutter: function () {
        hiss(0.016, 2800, 6, 0.26);
        hiss(0.03, 1200, 3, 0.18, 'bandpass', null, 0.055);
        tone(240, 0.05, 'triangle', 0.12, 150, 0.055);
      },

      // sello de goma sobre el papel
      rubber: function () {
        hiss(0.05, 900, 1.2, 0.38, 'lowpass');
        tone(120, 0.14, 'sine', 0.34, 70);
        hiss(0.12, 2200, 1.5, 0.14, 'bandpass', 700, 0.02);
      },

      // la carta desdoblándose
      unfold: function () {
        for (var i = 0; i < 5; i++) {
          hiss(0.06 + Math.random() * 0.05, 1800 + Math.random() * 1500,
               2.5, 0.14, 'bandpass', null, i * 0.13 + Math.random() * 0.05);
        }
      },

      // ocho compases muy simples, solo para la carta
      theme: function () {
        var seq = [220, 261.63, 329.63, 392, 440, 392, 329.63, 261.63];
        for (var i = 0; i < seq.length; i++) {
          tone(seq[i], 1.5, 'sine', 0.12, null, 0.2 + i * 0.42);
        }
        tone(110, 3.8, 'sine', 0.08, null, 0.2);
      },

      // segundero del reloj; fuerte solo en el último día
      tick: function (strong) {
        hiss(0.012, strong ? 2600 : 2000, 8, strong ? 0.14 : 0.05);
      },

      reveal: function () {
        var notes = [220, 277.18, 329.63, 440];
        for (var i = 0; i < notes.length; i++) {
          tone(notes[i], 1.9 - i * 0.15, 'sine', 0.2, null, i * 0.14);
        }
        hiss(0.9, 300, 0.6, 0.16, 'highpass', 3000);
      },
      stamp: function () {
        hiss(0.28, 260, 0.9, 0.55, 'lowpass');
        tone(92, 0.34, 'sine', 0.34, 54);
      },

      /* ---------- ambiente ---------- */
      ambient: function (name) {
        bedName = name;
        applyBed();
      },

      // baja el ambiente sin cortarlo (pestaña en segundo plano)
      duck: function (down) {
        ducked = !!down;
        if (!bed || !ctx) return;
        var t = ctx.currentTime;
        try {
          bed.gain.gain.cancelScheduledValues(t);
          bed.gain.gain.setValueAtTime(bed.gain.gain.value, t);
          bed.gain.gain.linearRampToValueAtTime(down ? 0.15 : 1, t + 0.6);
        } catch (e) {}
      },

      isOn: function () { return on; },
      toggle: function () {
        on = !on;
        try { window.localStorage.setItem(KEY, on ? 'on' : 'off'); } catch (e) {}
        if (on) { boot(); api.wake(); }
        else { killBed(bed, 0.5); bed = null; api.engineOff(); }
        return on;
      },
      wake: function () {
        if (!on) return;
        var c = boot();
        if (!c) return;
        if (c.state !== 'running') {
          try { c.resume(); } catch (e) {}
          return;   // applyBed llega por el evento statechange
        }
        applyBed();
      }
    };

    // cualquier gesto del usuario sirve para desbloquear el audio
    var evts = ['pointerdown', 'touchstart', 'keydown'];
    for (var k = 0; k < evts.length; k++) {
      document.addEventListener(evts[k], api.wake, { passive: true });
    }

    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        api.duck(true);
      } else {
        api.duck(false);
        api.wake();
      }
    });

    return api;
  })();

  /* ----------------------------------------------------------
     1. MÁQUINA DE ETAPAS
     ---------------------------------------------------------- */
  var sequence = $('#sequence');
  var stages   = $$('.stage');
  var railFill = $('#railFill');
  var seqCount = $('#seqCount');
  var current  = 0;
  var entered  = {};

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function goTo(i) {
    if (i < 0 || i >= stages.length) return;
    stages[current].classList.remove('is-active');
    current = i;
    stages[current].classList.add('is-active');
    stages[current].scrollTop = 0;
    audio.thunk();

    railFill.style.width = (current / (stages.length - 1) * 100) + '%';
    seqCount.textContent = pad2(current) + ' / ' + pad2(stages.length - 1);

    if (!entered[current]) {
      entered[current] = true;
      onEnter(current);
    }
  }

  var lastShutter = 0;
  function develop(el) {
    el.classList.add('developed');
    var now = Date.now();
    if (now - lastShutter > 220) { lastShutter = now; audio.shutter(); }
  }

  function onEnter(i) {
    // revelar fotos de la etapa
    $$('[data-develop]', stages[i]).forEach(function (el, k) {
      setTimeout(function () { develop(el); }, 260 + k * 180);
    });

    if (i === 2) { audio.engineOn(); setTimeout(flyRoute, 420); }
    if (i === 3) setTimeout(litPins, 380);
    if (i === 4) setTimeout(revealDestination, 220);
  }

  $$('[data-next]').forEach(function (btn) {
    btn.addEventListener('click', function () { audio.click(); goTo(current + 1); });
  });

  $('#btnSkip').addEventListener('click', function () {
    for (var i = 0; i <= 4; i++) { if (!entered[i]) entered[i] = (i < 4); }
    goTo(4);
  });

  /* ----------------------------------------------------------
     2. TERMINAL DE ACCESO
     ---------------------------------------------------------- */
  var lines = [
    { t: '> conectando con el archivo central...', d: 420 },
    { t: '> expediente GJ-2411 localizado.', d: 380 },
    { t: '> nivel de acceso requerido: máximo.', d: 380 },
    { t: '> verificando identidad...', d: 560 },
    { t: '> identidad confirmada: LAURA VALENTINA ROA CASTRO.', d: 460, c: 'hi' },
    { t: '> advertencia: este expediente lleva semanas abierto sin su conocimiento.', d: 520, c: 'warn' },
    { t: '> acceso concedido.', d: 300 }
  ];

  function runTerminal() {
    var out = $('#terminal');
    var btn = $('#btnStart');
    var li = 0;

    if (reduced) {
      out.innerHTML = lines.map(function (l) {
        return '<span class="' + (l.c || '') + '">' + l.t + '</span>';
      }).join('\n');
      btn.classList.remove('is-hidden');
      return;
    }

    function typeLine() {
      if (li >= lines.length) {
        var caret = $('.caret', out);
        if (caret) caret.remove();
        btn.classList.remove('is-hidden');
        btn.focus({ preventScroll: true });
        return;
      }
      var line = lines[li];
      var span = document.createElement('span');
      if (line.c) span.className = line.c;
      out.appendChild(span);
      if (line.c === 'warn') audio.warn();

      var caret = $('.caret', out);
      if (!caret) {
        caret = document.createElement('i');
        caret.className = 'caret';
      }
      out.appendChild(caret);

      var ci = 0;
      var timer = setInterval(function () {
        span.textContent = line.t.slice(0, ++ci);
        // una de cada dos teclas: el traqueteo suena más real y carga menos
        if (ci % 2) {
          if (line.t.charAt(ci - 1) === ' ') audio.space(); else audio.key();
        }
        if (ci >= line.t.length) {
          clearInterval(timer);
          audio.bell();
          setTimeout(audio.ret, 190);
          out.insertBefore(document.createTextNode('\n'), caret);
          li++;
          setTimeout(typeLine, line.d);
        }
      }, 26);
    }
    typeLine();
  }

  /* ----------------------------------------------------------
     3. BARRAS NEGRAS — desbloquean el botón de su etapa
     ---------------------------------------------------------- */
  function openBar(el) {
    if (el.classList.contains('open')) return;
    el.classList.add('open');
    el.removeAttribute('tabindex');
    el.removeAttribute('role');
    el.removeAttribute('aria-label');
    audio.tear();
    checkStageBars(el.closest('.stage'));
  }

  function checkStageBars(stage) {
    if (!stage) return;
    var bars = $$('.redact', stage);
    if (!bars.length) return;
    var done = bars.every(function (b) { return b.classList.contains('open'); });
    // la etapa 2 además exige que el vuelo haya llegado
    if (stage === stages[2] && !flightDone) done = false;
    if (!done) return;
    var btn = $('[data-next]', stage);
    if (btn) btn.disabled = false;
    var hint = $('[data-hint]', stage);
    if (hint) hint.classList.add('is-done');
  }

  $$('.redact').forEach(function (el) {
    el.addEventListener('click', function () { openBar(el); });
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openBar(el); }
    });
  });

  /* ----------------------------------------------------------
     4. MAPA DE COLOMBIA + RUTA
     ---------------------------------------------------------- */
  var COLOMBIA = [
    [-71.67, 12.46], [-72.90, 11.75], [-74.20, 11.25], [-74.85, 11.02],
    [-75.51, 10.42], [-75.62, 9.42],  [-76.90, 8.62],  [-77.40, 8.50],
    [-77.35, 7.90],  [-77.90, 7.20],  [-77.40, 6.30],  [-77.10, 3.90],
    [-78.80, 1.80],  [-78.92, 1.45],  [-77.60, 0.80],  [-76.50, 0.40],
    [-75.20, -0.15], [-74.80, -0.20], [-73.20, -1.20], [-71.00, -2.30],
    [-70.05, -2.60], [-69.95, -4.20], [-69.40, -1.10], [-69.85, 1.05],
    [-67.30, 1.90],  [-67.10, 2.90],  [-67.85, 5.30],  [-67.40, 6.20],
    [-69.40, 6.10],  [-70.10, 6.95],  [-72.00, 7.00],  [-72.50, 8.00],
    [-72.90, 9.10],  [-72.40, 10.50], [-71.10, 11.70]
  ];

  var LON0 = -79.2, LON1 = -66.6, LAT1 = 13.0;
  var MAP_W = 420, PAD = 26;
  var SCALE = (MAP_W - PAD * 2) / (LON1 - LON0);
  var Y0 = 43;

  function proj(lon, lat) {
    return [PAD + (lon - LON0) * SCALE, Y0 + (LAT1 - lat) * SCALE];
  }

  var BOG = [-74.07, 4.71];
  var CTG = [-75.51, 10.42];

  // spline cerrada (Catmull-Rom -> Bézier) para una costa orgánica
  function closedSpline(pts) {
    var n = pts.length;
    var d = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
    for (var i = 0; i < n; i++) {
      var p0 = pts[(i - 1 + n) % n], p1 = pts[i],
          p2 = pts[(i + 1) % n],     p3 = pts[(i + 2) % n];
      var c1x = p1[0] + (p2[0] - p0[0]) / 6.4, c1y = p1[1] + (p2[1] - p0[1]) / 6.4;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6.4, c2y = p2[1] - (p3[1] - p1[1]) / 6.4;
      d += ' C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) +
           ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) +
           ' ' + p2[0].toFixed(1) + ' ' + p2[1].toFixed(1);
    }
    return d + ' Z';
  }

  function buildColombia() {
    var pts = COLOMBIA.map(function (p) { return proj(p[0], p[1]); });
    $('#coOutline').setAttribute('d', closedSpline(pts));

    var a = proj(BOG[0], BOG[1]);
    var b = proj(CTG[0], CTG[1]);
    var cx = (a[0] + b[0]) / 2 + 46;
    var cy = (a[1] + b[1]) / 2;
    $('#coRoute').setAttribute('d', 'M' + a[0].toFixed(1) + ' ' + a[1].toFixed(1) +
      ' Q' + cx.toFixed(1) + ' ' + cy.toFixed(1) + ' ' + b[0].toFixed(1) + ' ' + b[1].toFixed(1));

    var g = $('#coPoints');
    g.appendChild(makePoint(a, 'BOG', 'origin', 'start', 13));
    g.appendChild(makePoint(b, '█████', 'dest', 'end', -13));
  }

  function makePoint(xy, label, cls, anchor, dx) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'pt ' + cls);

    var halo = document.createElementNS(SVGNS, 'circle');
    halo.setAttribute('class', 'halo');
    halo.setAttribute('cx', xy[0]); halo.setAttribute('cy', xy[1]); halo.setAttribute('r', 6);
    g.appendChild(halo);

    var c = document.createElementNS(SVGNS, 'circle');
    c.setAttribute('cx', xy[0]); c.setAttribute('cy', xy[1]); c.setAttribute('r', 4.5);
    g.appendChild(c);

    var t = document.createElementNS(SVGNS, 'text');
    t.setAttribute('x', xy[0] + dx);
    t.setAttribute('y', xy[1] + 4);
    t.setAttribute('text-anchor', anchor);
    t.textContent = label;
    g.appendChild(t);
    return g;
  }

  var flightDone = false;

  function landed() {
    flightDone = true;
    audio.land();
    audio.engineOff();
    var dest = $('.pt.dest');
    if (dest) dest.classList.add('live');
    checkStageBars(stages[2]);
  }

  function flyRoute() {
    var route = $('#coRoute');
    var plane = $('#coPlane');
    var len   = route.getTotalLength();

    route.style.strokeDasharray = '5 5';

    if (reduced) {
      plane.classList.add('flying');
      var end = route.getPointAtLength(len);
      plane.setAttribute('transform', 'translate(' + end.x + ',' + end.y + ')');
      landed();
      return;
    }

    // dibujar la ruta
    route.style.strokeDasharray = len + ' ' + len;
    route.style.strokeDashoffset = len;
    plane.classList.add('flying');

    var dur = 2600;
    var t0 = null;

    function frame(ts) {
      if (t0 === null) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = p < .5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; // easeInOutQuad

      route.style.strokeDashoffset = String(len * (1 - e));

      var pt = route.getPointAtLength(len * e);
      var pv = route.getPointAtLength(Math.min(len * e + 1, len));
      var ang = Math.atan2(pv.y - pt.y, pv.x - pt.x) * 180 / Math.PI + 90;
      plane.setAttribute('transform', 'translate(' + pt.x.toFixed(2) + ',' + pt.y.toFixed(2) + ') rotate(' + ang.toFixed(1) + ')');

      if (p < 1) {
        requestAnimationFrame(frame);
      } else {
        route.style.strokeDasharray = '5 5';
        route.style.strokeDashoffset = '0';
        landed();
      }
    }
    requestAnimationFrame(frame);
  }

  /* ----------------------------------------------------------
     5. MAPA DE LA CIUDAD + PINES
     ---------------------------------------------------------- */
  var PINS = [
    { x: 272, y: 250, n: '1', hidden: '██████',   name: 'Bahía',     anchor: 'end',   dx: -15 },
    { x: 330, y: 142, n: '2', hidden: '████████', name: 'San Felipe', anchor: 'end',   dx: -15 },
    { x: 80,  y: 396, n: '3', hidden: '██████',   name: 'Islas',      anchor: 'start', dx: 15 },
    { x: 300, y: 92,  n: '4', hidden: '█████',    name: 'Día libre',  anchor: 'start', dx: 15 }
  ];

  function makePin(p, masked) {
    var g = document.createElementNS(SVGNS, 'g');
    g.setAttribute('class', 'pin' + (masked ? ' masked' : ''));

    var ring = document.createElementNS(SVGNS, 'circle');
    ring.setAttribute('class', 'ring');
    ring.setAttribute('cx', p.x); ring.setAttribute('cy', p.y); ring.setAttribute('r', 12);
    g.appendChild(ring);

    var dot = document.createElementNS(SVGNS, 'circle');
    dot.setAttribute('class', 'dot');
    dot.setAttribute('cx', p.x); dot.setAttribute('cy', p.y); dot.setAttribute('r', 7);
    g.appendChild(dot);

    var num = document.createElementNS(SVGNS, 'text');
    num.setAttribute('class', 'num');
    num.setAttribute('x', p.x); num.setAttribute('y', p.y + 3);
    num.setAttribute('text-anchor', 'middle');
    num.textContent = p.n;
    g.appendChild(num);

    var lbl = document.createElementNS(SVGNS, 'text');
    lbl.setAttribute('class', 'lbl');
    lbl.setAttribute('x', p.x + p.dx);
    lbl.setAttribute('y', p.y + 4);
    lbl.setAttribute('text-anchor', p.anchor);
    lbl.textContent = masked ? p.hidden : p.name;
    g.appendChild(lbl);

    return g;
  }

  function buildPins() {
    var live = $('#cityPins');
    var stat = $('#cityPinsStatic');
    PINS.forEach(function (p) {
      if (live) live.appendChild(makePin(p, true));
      if (stat) {
        var s = makePin(p, false);
        s.classList.add('lit');
        stat.appendChild(s);
      }
    });
  }

  function litPins() {
    var pins  = $$('#cityPins .pin');
    var items = $$('#pointList li');
    var btn   = $('[data-next]', stages[3]);
    var step  = reduced ? 0 : 700;

    pins.forEach(function (pin, i) {
      setTimeout(function () {
        pin.classList.add('lit');
        audio.blip(i);
        if (items[i]) items[i].classList.add('lit');
        if (i === pins.length - 1 && btn) btn.disabled = false;
      }, i * step);
    });
  }

  /* ----------------------------------------------------------
     6. REVELACIÓN
     ---------------------------------------------------------- */
  // espera a que la etapa termine de aparecer; si el evento no llega, corta por tiempo
  function whenStageVisible(stage, cb, fallback) {
    var fired = false;
    function fire() {
      if (fired) return;
      fired = true;
      stage.removeEventListener('transitionend', onEnd);
      cb();
    }
    function onEnd(e) {
      if (e.target === stage && e.propertyName === 'opacity') fire();
    }
    stage.addEventListener('transitionend', onEnd);
    setTimeout(fire, fallback);
  }

  function revealDestination() {
    var word = $('#destWord');
    $$('span', word).forEach(function (s, i) {
      s.style.animationDelay = (i * 0.075) + 's';
    });
    word.classList.add('in');
    audio.reveal();
    setTimeout(audio.rubber, 900);
    audio.ambient('beach');
    if (reduced) return;
    // el confeti solo cuando la etapa ya está en pantalla y el nombre terminó de armarse
    whenStageVisible(stages[4], function () {
      setTimeout(function () { burst(160); }, 620);
    }, 1400);
  }

  $('#btnOpenDossier').addEventListener('click', function () {
    audio.thunk();
    audio.ambient('beach');
    sequence.classList.add('is-done');
    document.body.classList.remove('locked');
    $('#dossier').hidden = false;
    window.scrollTo(0, 0);
    setTimeout(function () { sequence.style.display = 'none'; }, 750);
    initDossier();
  });

  /* ----------------------------------------------------------
     7. CONFETI
     ---------------------------------------------------------- */
  var cvs = $('#confetti');
  var ctx = cvs.getContext('2d');
  var bits = [];
  var raf = null;
  var COLORS = ['#17A5A1', '#D9A441', '#E9E2D2', '#B3271E', '#0E6F6C'];

  function sizeCanvas() {
    var r = window.devicePixelRatio || 1;
    cvs.width = window.innerWidth * r;
    cvs.height = window.innerHeight * r;
    ctx.setTransform(r, 0, 0, r, 0, 0);
  }
  window.addEventListener('resize', sizeCanvas);
  sizeCanvas();

  function burst(n) {
    if (reduced) return;
    var W = window.innerWidth, H = window.innerHeight;
    for (var i = 0; i < n; i++) {
      bits.push({
        x: W / 2 + (Math.random() - .5) * W * .5,
        y: H * .45 + (Math.random() - .5) * 60,
        vx: (Math.random() - .5) * 9,
        vy: -Math.random() * 13 - 3,
        w: 5 + Math.random() * 7,
        h: 8 + Math.random() * 9,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - .5) * .3,
        c: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1
      });
    }
    if (!raf) raf = requestAnimationFrame(tickConfetti);
  }

  function tickConfetti() {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (var i = bits.length - 1; i >= 0; i--) {
      var b = bits[i];
      b.vy += .34;
      b.vx *= .995;
      b.x += b.vx;
      b.y += b.vy;
      b.rot += b.vr;
      b.life -= .006;
      if (b.y > window.innerHeight + 60 || b.life <= 0) { bits.splice(i, 1); continue; }
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.rot);
      ctx.globalAlpha = Math.max(b.life, 0);
      ctx.fillStyle = b.c;
      ctx.fillRect(-b.w / 2, -b.h / 2, b.w, b.h);
      ctx.restore();
    }
    if (bits.length) {
      raf = requestAnimationFrame(tickConfetti);
    } else {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
      raf = null;
    }
  }

  /* ----------------------------------------------------------
     8. EXPEDIENTE — cuenta regresiva, fotos, sello
     ---------------------------------------------------------- */
  var dossierReady = false;

  function initDossier() {
    if (dossierReady) return;
    dossierReady = true;

    startCountdown();

    // el ambiente cambia según la sección que se esté leyendo; va aparte
    // del bloque de animaciones porque no depende de reducir movimiento
    if ('IntersectionObserver' in window) {
      var aio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) audio.ambient(e.target.getAttribute('data-ambient'));
        });
      }, { threshold: 0.35 });
      $$('#dossier [data-ambient]').forEach(function (el) { aio.observe(el); });
    }

    // entrada por scroll
    var blocks = $$('#dossier section, .clock, .dossier-head');
    if ('IntersectionObserver' in window && !reduced) {
      blocks.forEach(function (b) { b.classList.add('reveal-on-scroll'); });
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) { e.target.classList.add('seen'); io.unobserve(e.target); }
        });
      }, { rootMargin: '0px 0px -12% 0px', threshold: .06 });
      blocks.forEach(function (b) { io.observe(b); });

      var pio = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) {
            var el = e.target;
            setTimeout(function () { develop(el); }, 180);
            pio.unobserve(el);
          }
        });
      }, { threshold: .25 });
      $$('#dossier [data-develop]').forEach(function (el) { pio.observe(el); });

    } else {
      $$('#dossier [data-develop]').forEach(function (el) { el.classList.add('developed'); });
    }
  }

  /* El reloj tiene tres vidas: cuenta atrás hasta el despegue, parte de
     viaje mientras estamos allá, y tiempo transcurrido desde el regreso
     para que la página siga diciendo algo dentro de diez años. */
  var DESPEGUE = new Date('2026-11-24T06:30:00-05:00').getTime();
  var REGRESO  = new Date('2026-11-28T14:30:00-05:00').getTime();

  var DIAS_VIAJE = [
    'Día 1 · Llegada y bahía al atardecer',
    'Día 2 · Ciudad amurallada en chiva',
    'Día 3 · Islas, club de playa',
    'Día 4 · Día libre, sin instrucciones',
    'Día 5 · Regreso a Bogotá'
  ];

  function startCountdown() {
    var d = $('#cd-d'), h = $('#cd-h'), m = $('#cd-m'), s = $('#cd-s');
    var note  = $('#clockNote');
    var title = $('#clockTitle');
    var grid  = $('.clock-grid');
    var dayTile = d.parentNode;
    var NOTE_FAR = note.textContent;

    // el segundero solo suena si el reloj está a la vista
    var clockSeen = false;
    var clockEl = $('.clock');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        clockSeen = entries[0].isIntersecting;
      }, { threshold: 0.4 }).observe(clockEl);
    }

    function pintar(secs, ultimoDia) {
      var days = Math.floor(secs / 86400);
      dayTile.hidden = days === 0;
      grid.classList.toggle('no-days', days === 0);
      grid.classList.toggle('final', ultimoDia && secs < 3600);
      d.textContent = pad2(days);
      h.textContent = pad2(Math.floor(secs % 86400 / 3600));
      m.textContent = pad2(Math.floor(secs % 3600 / 60));
      s.textContent = pad2(secs % 60);
    }

    function tick() {
      var now = Date.now();

      if (now < DESPEGUE) {
        // ---------- antes: cuenta atrás ----------
        var secs = Math.floor((DESPEGUE - now) / 1000);
        var days = Math.floor(secs / 86400);
        title.textContent = 'Tiempo restante para el despegue';
        if (secs < 3600) note.textContent = 'Salida inminente · El Dorado';
        else if (days === 0) note.textContent = 'Menos de un día. Empaca.';
        else note.textContent = NOTE_FAR;
        pintar(secs, true);
        if (clockSeen) audio.tick(days === 0);

      } else if (now < REGRESO) {
        // ---------- durante: parte de viaje ----------
        var dentro = Math.floor((now - DESPEGUE) / 1000);
        var dia = Math.min(Math.floor(dentro / 86400) + 1, DIAS_VIAJE.length);
        title.textContent = 'Operación en curso · día ' + dia + ' de 5';
        note.textContent = DIAS_VIAJE[dia - 1];
        grid.classList.remove('final');
        pintar(dentro, false);
        if (clockSeen) audio.tick(false);

      } else {
        // ---------- después: cuánto ha pasado ----------
        var desde = Math.floor((now - REGRESO) / 1000);
        title.textContent = 'Desde que volvimos de Cartagena';
        note.textContent = 'Operación cerrada · fueron 5 días y 4 noches';
        grid.classList.remove('final');
        pintar(desde, false);
      }
    }

    tick();
    setInterval(tick, 1000);
  }

  $('#seal').addEventListener('click', function () {
    audio.stamp();
    setTimeout(audio.unfold, 240);
    setTimeout(audio.theme, 700);
    $('#sealWrap').classList.add('is-broken');
    $('#letter').hidden = false;
    setTimeout(function () { burst(90); }, 260);
    setTimeout(function () {
      $('#letter').scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
    }, 120);
  });

  /* ----------------------------------------------------------
     9. INTERRUPTOR DE SONIDO
     ---------------------------------------------------------- */
  var btnSound = $('#btnSound');
  var btnSoundText = $('#btnSoundText');

  function paintSound() {
    var on = audio.isOn();
    btnSound.classList.toggle('is-off', !on);
    btnSound.setAttribute('aria-pressed', on ? 'true' : 'false');
    btnSoundText.textContent = on ? 'sonido' : 'silencio';
  }

  btnSound.addEventListener('click', function () {
    if (audio.toggle()) audio.click();
    paintSound();
  });
  paintSound();

  /* ----------------------------------------------------------
     10. ARRANQUE
     ---------------------------------------------------------- */
  buildColombia();
  buildPins();
  entered[0] = true;

  var boot = $('#btnBoot');
  var booted = false;

  // el primer toque arranca la conexión y, de paso, desbloquea el audio
  function connect() {
    if (booted) return;
    booted = true;
    audio.wake();
    audio.ambient('mystery');
    boot.classList.add('is-gone');
    // fuera del DOM, no solo invisible: así no puede superponerse a nada
    setTimeout(function () { if (boot.parentNode) boot.parentNode.removeChild(boot); }, 700);
    runTerminal();
  }

  boot.addEventListener('click', connect);


  if (/[?&](skip|dev)\b/.test(location.search)) {
    booted = true;
    boot.hidden = true;
    for (var i = 0; i < 4; i++) entered[i] = true;
    goTo(4);
  }
})();
