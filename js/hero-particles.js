/* ==========================================================================
   BEYOND — hero-particles.js
   --------------------------------------------------------------------------
   The animation behind the Home page hero: thousands of fine dots that
   travel from one shape to the next, one field at a time:
     Physics → Medicine → Mathematics → Finance → Engineering → Computer science
   Each time the loop comes back to a field, it shows that field's next shape
   (see FIELDS below), so people who stay on the page keep seeing new ones.

   HOW IT STAYS FAST ON EVERY DEVICE
   - Only two shapes are on the graphics chip (GPU) at any moment: the one on
     screen and the next one. The next shape is calculated while the current
     one is holding still, never in the middle of a movement.
   - The GPU moves every dot (WebGL). Each frame, JavaScript only updates a
     few numbers and asks for one drawing, however many dots there are.
   - If a device struggles, fewer dots are drawn (no pause, no rebuild).
   - The animation pauses when the hero is off screen or the tab is hidden,
     and recovers by itself if the browser resets the graphics.
   - No WebGL, or any error: a still drawing of the first shape is shown instead.
   - "Reduce motion" turned on in the system: one still frame, no animation.

   You can change the look, timing and field names in SETTINGS below
   (js/content.js can override the names with strings → heroFields, for translations).
   ========================================================================== */

(function () {
  "use strict";

  var canvas = document.getElementById("hero-canvas");
  if (!canvas) return;
  var hero = canvas.parentElement;
  var label = document.getElementById("hero-field-label");

  /* ------------------------------------------------------------------------
     SETTINGS
     ------------------------------------------------------------------------ */
  var SETTINGS = {
    dotsDesktop:   9000,      // dots on computers
    dotsMobile:    3500,      // dots on phones and less powerful devices
    dotsMinimum:   1200,      // never fewer than this, even on very slow devices
    dotSize:       2.4,       // dot size in pixels
    brightness:    0.55,      // 0 to 1
    dotColor:      [1.0, 1.0, 1.0],              // white
    accentColor:   [0.0, 0.663, 0.957],          // cyan (#00A9F4), about 1 dot in 8
    sizeDesktop:   0.47,      // shape size on laptops and desktops, as a share of the hero height
    dimBehindText: 0.35,      // dots passing behind the hero text keep this much brightness (0 to 1)
    holdSeconds:   3.5,       // how long each shape stays
    morphSeconds:  2.2,       // how long the dots take to travel to the next shape
    showLabel:     true,      // field name under the shape (desktop only)
    labels:        ["Physics", "Medicine", "Mathematics", "Finance", "Engineering", "Computer science"]
  };

  // Shapes for each field, in the order they appear (the first one is shown on
  // the first loop). Field order matches SETTINGS.labels.
  var FIELDS = [
    ["atom", "orbital"],                // Physics
    ["dna", "neuron"],                  // Medicine
    ["lorenz", "mobius"],               // Mathematics
    ["candles"],                        // Finance
    ["rocket", "chip", "robot"],        // Engineering
    ["network"]                         // Computer science
  ];

  // Testing helpers: index.html?hero=fallback | low | static
  //                  index.html?heroAt=12        (jump 12 seconds into the animation)
  //                  index.html?heroShape=rocket (show one shape, still)
  var FORCE = (location.search.match(/[?&]hero=(\w+)/) || [])[1] || "";
  var START_AT = parseFloat((location.search.match(/[?&]heroAt=([\d.]+)/) || [])[1]) || 0;
  var SHOW = (location.search.match(/[?&]heroShape=(\w+)/) || [])[1] || "";

  // Field names: from content.js if present (so they can be translated)
  var lang = (document.documentElement.lang || "en").slice(0, 2);
  var strings = window.BEYOND && window.BEYOND.strings && (window.BEYOND.strings[lang] || window.BEYOND.strings.en);
  var LABELS = (strings && strings.heroFields) || SETTINGS.labels;

  var PI = Math.PI;
  var TAU = PI * 2;

  /* ========================================================================
     1. SHAPES
     Each shape is a list of points (x, y, z) roughly inside -1 … 1.
     "cloud" is a loose cloud used only for the opening.
     ======================================================================== */

  // Small seeded random generator: the shapes look the same on every visit
  var seed = 20251020;
  function random() {
    seed = (seed + 0x6D2B79F5) | 0;
    var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function jitter(amount) {
    return (random() + random() + random() - 1.5) * amount;
  }

  // Random point inside (or on the surface of) a ball
  function ball(P, r, cx, cy, cz, surface) {
    var u = random() * 2 - 1;
    var a = random() * TAU;
    var s = Math.sqrt(1 - u * u);
    var rr = surface ? r * (0.92 + random() * 0.08) : r * Math.pow(random(), 1 / 3);
    P[0] = cx + Math.cos(a) * s * rr;
    P[1] = cy + u * rr;
    P[2] = cz + Math.sin(a) * s * rr;
  }

  // Index of a random entry in a running total (longer pieces get more dots)
  function pickIndex(cum, total) {
    var d = random() * total, lo = 0, hi = cum.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (cum[mid] < d) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // Picks points evenly along a set of straight segments [x1,y1,z1,x2,y2,z2, ...]
  function segments(list, blur, zSpread) {
    var n = list.length / 6;
    var cum = new Float32Array(n);
    var total = 0;
    for (var i = 0; i < n; i++) {
      var o = i * 6;
      var dx = list[o + 3] - list[o], dy = list[o + 4] - list[o + 1], dz = list[o + 5] - list[o + 2];
      total += Math.sqrt(dx * dx + dy * dy + dz * dz);
      cum[i] = total;
    }
    return function (P) {
      var o2 = pickIndex(cum, total) * 6, t = random();
      P[0] = list[o2] + (list[o2 + 3] - list[o2]) * t + jitter(blur);
      P[1] = list[o2 + 1] + (list[o2 + 4] - list[o2 + 1]) * t + jitter(blur);
      P[2] = list[o2 + 2] + (list[o2 + 5] - list[o2 + 2]) * t + jitter(blur) + (random() * 2 - 1) * (zSpread || 0);
    };
  }

  // Picks points on the surface of round tubes [x1,y1,z1,x2,y2,z2,r1,r2, ...]
  // (r1 and r2: tube radius at each end). Thicker tubes get more dots.
  function rods(list) {
    var n = list.length / 8;
    var cum = new Float32Array(n);
    var total = 0;
    for (var i = 0; i < n; i++) {
      var o = i * 8;
      var dx = list[o + 3] - list[o], dy = list[o + 4] - list[o + 1], dz = list[o + 5] - list[o + 2];
      total += Math.sqrt(dx * dx + dy * dy + dz * dz) * ((list[o + 6] + list[o + 7]) / 2 + 0.015);
      cum[i] = total;
    }
    var Q = [0, 0, 0];
    return function (P) {
      var o2 = pickIndex(cum, total) * 8, t = random();
      ball(Q, list[o2 + 6] + (list[o2 + 7] - list[o2 + 6]) * t, 0, 0, 0, true);
      P[0] = list[o2] + (list[o2 + 3] - list[o2]) * t + Q[0];
      P[1] = list[o2 + 1] + (list[o2 + 4] - list[o2 + 1]) * t + Q[1];
      P[2] = list[o2 + 2] + (list[o2 + 5] - list[o2 + 2]) * t + Q[2];
    };
  }

  // Turns a list of points [x,y,z, ...] into connected segments
  function path(points, closed, out) {
    var n = points.length / 3, last = closed ? n : n - 1;
    for (var i = 0; i < last; i++) {
      var a = i * 3, b = ((i + 1) % n) * 3;
      out.push(points[a], points[a + 1], points[a + 2], points[b], points[b + 1], points[b + 2]);
    }
    return out;
  }

  // Turns a list of points into a tube, radius going from r1 to r2
  function tube(points, r1, r2, out) {
    var n = points.length / 3;
    for (var i = 0; i < n - 1; i++) {
      var a = i * 3, ra = r1 + (r2 - r1) * (i / (n - 1)), rb = r1 + (r2 - r1) * ((i + 1) / (n - 1));
      out.push(points[a], points[a + 1], points[a + 2], points[a + 3], points[a + 4], points[a + 5], ra, rb);
    }
    return out;
  }

  // Points along a smooth curve from p0 to p3 (p1, p2 pull the curve)
  function bezier(p0, p1, p2, p3, steps) {
    var pts = [];
    for (var s = 0; s <= steps; s++) {
      var t = s / steps, u = 1 - t;
      var a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      for (var k = 0; k < 3; k++) pts.push(a * p0[k] + b * p1[k] + c * p2[k] + d * p3[k]);
    }
    return pts;
  }

  // The 12 edges of a box, as segments
  function boxEdges(x0, x1, y0, y1, z0, z1, out) {
    out.push(
      x0, y0, z0, x1, y0, z0,  x0, y1, z0, x1, y1, z0,  x0, y0, z1, x1, y0, z1,  x0, y1, z1, x1, y1, z1,
      x0, y0, z0, x0, y1, z0,  x1, y0, z0, x1, y1, z0,  x0, y0, z1, x0, y1, z1,  x1, y0, z1, x1, y1, z1,
      x0, y0, z0, x0, y0, z1,  x1, y0, z0, x1, y0, z1,  x0, y1, z0, x0, y1, z1,  x1, y1, z0, x1, y1, z1
    );
    return out;
  }

  // Fills a shape: parts = [{ weight, place: function (P) {...} }, ...]
  function makeShape(count, parts) {
    var out = new Float32Array(count * 3);
    var P = [0, 0, 0];
    var total = 0, i, k, idx = 0;
    for (k = 0; k < parts.length; k++) total += parts[k].weight;
    for (k = 0; k < parts.length; k++) {
      var m = k === parts.length - 1 ? count - idx : Math.round(count * parts[k].weight / total);
      for (i = 0; i < m && idx < count; i++, idx++) {
        parts[k].place(P);
        out[idx * 3] = P[0]; out[idx * 3 + 1] = P[1]; out[idx * 3 + 2] = P[2];
      }
    }
    // Shuffle, so that ANY first N dots are an even sample of the whole shape.
    // This is what lets slow devices simply draw fewer dots.
    for (i = count - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      for (k = 0; k < 3; k++) {
        var tmp = out[i * 3 + k]; out[i * 3 + k] = out[j * 3 + k]; out[j * 3 + k] = tmp;
      }
    }
    return out;
  }

  function rotateZ(points, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    for (var i = 0; i < points.length; i += 3) {
      var x = points[i], y = points[i + 1];
      points[i] = x * c - y * s;
      points[i + 1] = x * s + y * c;
    }
    return points;
  }

  // Tilts a shape towards (positive angle) or away from (negative) the viewer
  function rotateX(points, angle) {
    var c = Math.cos(angle), s = Math.sin(angle);
    for (var i = 0; i < points.length; i += 3) {
      var y = points[i + 1], z = points[i + 2];
      points[i + 1] = y * c - z * s;
      points[i + 2] = y * s + z * c;
    }
    return points;
  }

  // Shifts a shape (dx, dy), then scales it
  function move(points, dx, dy, scale) {
    for (var i = 0; i < points.length; i += 3) {
      points[i] = (points[i] + dx) * scale;
      points[i + 1] = (points[i + 1] + dy) * scale;
      points[i + 2] *= scale;
    }
    return points;
  }

  /* --- Opening cloud --- */
  function shapeCloud(n) {
    return makeShape(n, [{ weight: 1, place: function (P) { ball(P, 1.15, 0, 0, 0, false); P[1] *= 0.8; } }]);
  }

  /* --- Physics: atom --- */
  function shapeAtom(n) {
    function orbit(k) {
      var rot = (k * PI) / 3, c = Math.cos(rot), s = Math.sin(rot);
      return function (P) {
        var t = random() * TAU;
        var x = Math.cos(t) * 1.0 + jitter(0.014);
        var y = Math.sin(t) * 0.36 + jitter(0.014);
        P[0] = x * c - y * s;
        P[1] = x * s + y * c;
        P[2] = Math.sin(t) * 0.18 * (k - 1) + jitter(0.025);
      };
    }
    function electron(k) {
      var rot = (k * PI) / 3, t = 0.7 + k * 2.2;
      var x = Math.cos(t), y = Math.sin(t) * 0.36;
      var ex = x * Math.cos(rot) - y * Math.sin(rot), ey = x * Math.sin(rot) + y * Math.cos(rot);
      return function (P) { ball(P, 0.045, ex, ey, Math.sin(t) * 0.18 * (k - 1), false); };
    }
    return makeShape(n, [
      { weight: 0.2,  place: orbit(0) },
      { weight: 0.2,  place: orbit(1) },
      { weight: 0.2,  place: orbit(2) },
      { weight: 0.28, place: function (P) { ball(P, 0.17, 0, 0, 0, random() < 0.7); } },
      { weight: 0.04, place: electron(0) },
      { weight: 0.04, place: electron(1) },
      { weight: 0.04, place: electron(2) }
    ]);
  }

  /* --- Physics: quantum orbital (two lobes and a ring, like the d-orbital),
         drawn as a wireframe so it reads clearly --- */
  function shapeOrbital(n) {
    function lobeAt(P, sign, ct, ph) {
      var st = Math.sqrt(1 - ct * ct), r = 0.95 * Math.pow(ct, 1.5);
      P[0] = st * Math.cos(ph) * r + jitter(0.006);
      P[1] = sign * ct * r + jitter(0.006);
      P[2] = st * Math.sin(ph) * r + jitter(0.006);
    }
    function randomCt() { return 1 - random() * (1 - Math.cos(1.45)); }
    function meridians(P) {                          // 8 lines from tip to centre on each lobe
      lobeAt(P, random() < 0.5 ? 1 : -1, randomCt(), Math.floor(random() * 8) * (PI / 4));
    }
    function parallels(P) {                          // 3 rings around each lobe
      lobeAt(P, random() < 0.5 ? 1 : -1, [0.55, 0.75, 0.9][Math.floor(random() * 3)], random() * TAU);
    }
    function ring(P) {                               // the ring: 4 circles around a doughnut
      var u = random() * TAU, v = Math.floor(random() * 4) * (PI / 2) + PI / 4, r = 0.13;
      P[0] = (0.52 + r * Math.cos(v)) * Math.cos(u) + jitter(0.006);
      P[1] = r * Math.sin(v) + jitter(0.006);
      P[2] = (0.52 + r * Math.cos(v)) * Math.sin(u) + jitter(0.006);
    }
    return rotateX(makeShape(n, [
      { weight: 0.38, place: meridians },
      { weight: 0.2,  place: parallels },
      { weight: 0.36, place: ring },
      { weight: 0.06, place: function (P) { ball(P, 0.06, 0, 0, 0, false); } }
    ]), 0.4);
  }

  /* --- Medicine: DNA double helix --- */
  function shapeDNA(n) {
    var turns = 2.2, R = 0.34, RUNGS = 22;
    function strand(offset) {
      return function (P) {
        var y = random() * 2 - 1, a = y * turns * PI + offset;
        P[0] = Math.cos(a) * R + jitter(0.012);
        P[1] = y;
        P[2] = Math.sin(a) * R + jitter(0.012);
      };
    }
    function rung(P) {
      var k = Math.floor(random() * RUNGS);
      var y = -1 + ((k + 0.5) * 2) / RUNGS, a = y * turns * PI, t = random();
      var x1 = Math.cos(a) * R, z1 = Math.sin(a) * R;
      P[0] = x1 + (-2 * x1) * t + jitter(0.006);
      P[1] = y + jitter(0.006);
      P[2] = z1 + (-2 * z1) * t + jitter(0.006);
    }
    return rotateZ(makeShape(n, [
      { weight: 0.33, place: strand(0) },
      { weight: 0.33, place: strand(PI) },
      { weight: 0.34, place: rung }
    ]), -0.35);
  }

  /* --- Medicine: neuron (branching dendrites, cell body, axon) --- */
  function shapeNeuron(n) {
    var soma = [-0.42, 0.04, 0], branches = [], tips = [], i;
    function branch(x, y, z, angle, len, r, depth) {
      var ex = x + Math.cos(angle) * len, ey = y + Math.sin(angle) * len, ez = z + (random() * 2 - 1) * 0.25 * len;
      var mx = (x + ex) / 2 + jitter(0.04), my = (y + ey) / 2 + jitter(0.04), mz = (z + ez) / 2;
      branches.push(x, y, z, mx, my, mz, r, r * 0.8, mx, my, mz, ex, ey, ez, r * 0.8, r * 0.6);
      if (depth > 0) {
        var spread = 0.35 + random() * 0.25;
        branch(ex, ey, ez, angle - spread, len * 0.68, r * 0.6, depth - 1);
        branch(ex, ey, ez, angle + spread, len * 0.62, r * 0.6, depth - 1);
      }
    }
    [1.25, 1.85, 2.5, 3.1, 3.75, 4.4, 5.0].forEach(function (a) {
      branch(soma[0] + Math.cos(a) * 0.11, soma[1] + Math.sin(a) * 0.11, 0, a + jitter(0.15), 0.28 + random() * 0.08, 0.03, 2);
    });
    // Axon: a long wavy tube to the right, wrapped in myelin sheaths with gaps
    var axon = bezier([-0.31, 0.0, 0], [0.0, -0.18, 0.08], [0.35, 0.14, -0.05], [0.78, -0.05, 0], 60);
    tube(axon, 0.022, 0.016, branches);
    var myelin = [];
    for (i = 0; i < 4; i++) tube(axon.slice((10 + i * 12) * 3, (19 + i * 12) * 3), 0.055, 0.055, myelin);
    // Axon terminals: short branches ending in small buttons
    var terminals = [], end = axon.slice(-3);
    for (i = 0; i < 5; i++) {
      var a = -0.9 + i * 0.45, tx = end[0] + Math.cos(a) * 0.16, ty = end[1] + Math.sin(a) * 0.16, tz = jitter(0.06);
      terminals.push(end[0], end[1], end[2], tx, ty, tz, 0.014, 0.01);
      tips.push(tx, ty, tz);
    }
    return move(makeShape(n, [
      { weight: 0.14, place: function (P) { ball(P, 0.12, soma[0], soma[1], soma[2], random() < 0.75); } },
      { weight: 0.48, place: rods(branches) },
      { weight: 0.24, place: rods(myelin) },
      { weight: 0.07, place: rods(terminals) },
      { weight: 0.07, place: function (P) { var k = Math.floor(random() * 5) * 3; ball(P, 0.03, tips[k], tips[k + 1], tips[k + 2], false); } }
    ]), 0.08, 0, 0.95);
  }

  /* --- Mathematics: Lorenz attractor (the "butterfly" curve) --- */
  function shapeLorenz(n) {
    // About 14 loops: enough to show both wings, few enough to see each line
    var x = 0.1, y = 0, z = 0, dt = 0.004, pts = [];
    for (var i = 0; i < 3800; i++) {
      var dx = 10 * (y - x), dy = x * (28 - z) - y, dz = x * y - (8 / 3) * z;
      x += dx * dt; y += dy * dt; z += dz * dt;
      if (i > 1000 && i % 4 === 0) pts.push(x / 23, (z - 25) / 27, (y / 27) * 0.5);
    }
    return makeShape(n, [{ weight: 1, place: segments(path(pts, false, []), 0.005, 0) }]);
  }

  /* --- Mathematics: Möbius strip --- */
  function shapeMobius(n) {
    var w = 0.42, k = 0.7;
    function at(P, u, v) {
      var c = Math.cos(u / 2);
      P[0] = (1 + v * c) * Math.cos(u) * k;
      P[1] = (1 + v * c) * Math.sin(u) * k;
      P[2] = v * Math.sin(u / 2) * k;
    }
    return rotateZ(rotateX(makeShape(n, [
      { weight: 0.5, place: function (P) {           // the single edge
        at(P, random() * TAU, random() < 0.5 ? w : -w);
        P[0] += jitter(0.006); P[1] += jitter(0.006); P[2] += jitter(0.006);
      } },
      { weight: 0.35, place: function (P) {          // cross lines, so the twist is visible
        at(P, Math.floor(random() * 36) * (TAU / 36), (random() * 2 - 1) * w);
        P[0] += jitter(0.004); P[1] += jitter(0.004); P[2] += jitter(0.004);
      } },
      { weight: 0.15, place: function (P) { at(P, random() * TAU, (random() * 2 - 1) * w); } }
    ]), 0.75), 0.25);
  }

  /* --- Finance: candlestick chart with a moving-average line --- */
  function shapeCandles(n) {
    var dirs = [1, 1, -1, 1, 1, -1, 1, 1, -1, 1], N = dirs.length;
    var price = 0, c = [], lo = Infinity, hi = -Infinity, i;
    for (i = 0; i < N; i++) {
      var open = price, close = open + dirs[i] * (0.12 + random() * 0.2) + 0.04;
      var high = Math.max(open, close) + 0.02 + random() * 0.07;
      var low = Math.min(open, close) - 0.02 - random() * 0.07;
      c.push([open, close, high, low]);
      lo = Math.min(lo, low); hi = Math.max(hi, high);
      price = close;
    }
    function Y(v) { return -0.75 + ((v - lo) / (hi - lo)) * 1.6; }
    var edges = [], wicks = [], fills = [], avg = [], hw = 0.065;
    for (i = 0; i < N; i++) {
      var x = -0.85 + (i * 1.7) / (N - 1);
      var top = Y(Math.max(c[i][0], c[i][1])), bottom = Y(Math.min(c[i][0], c[i][1]));
      if (top - bottom < 0.02) top = bottom + 0.02;
      path([x - hw, bottom, 0, x + hw, bottom, 0, x + hw, top, 0, x - hw, top, 0], true, edges);
      wicks.push(x, Y(c[i][2]), 0, x, top, 0, x, bottom, 0, x, Y(c[i][3]), 0);
      if (c[i][1] < c[i][0]) fills.push(x, bottom, top);  // falling candles are filled, rising ones hollow
      var from = Math.max(0, i - 2), sum = 0;
      for (var j = from; j <= i; j++) sum += c[j][1];
      avg.push(x, Y(sum / (i - from + 1)) + 0.04, -0.15);
    }
    return makeShape(n, [
      { weight: 0.36, place: segments(edges, 0.004, 0) },
      { weight: 0.22, place: function (P) {
        var k = Math.floor(random() * (fills.length / 3)) * 3;
        P[0] = fills[k] + (random() * 2 - 1) * hw;
        P[1] = fills[k + 1] + random() * (fills[k + 2] - fills[k + 1]);
        P[2] = 0;
      } },
      { weight: 0.14, place: segments(wicks, 0.004, 0) },
      { weight: 0.2,  place: segments(path(avg, false, []), 0.006, 0) },
      { weight: 0.08, place: segments([-1.0, -0.92, 0, 1.0, -0.92, 0], 0.004, 0) }
    ]);
  }

  /* --- Engineering: rocket, with fins and an exhaust plume --- */
  function shapeRocket(n) {
    var RB = 0.17, TOP = 0.42, BOTTOM = -0.5, NOSE = 0.95, fins = [], k;
    for (k = 0; k < 4; k++) {
      var f = PI / 4 + (k * PI) / 2, cf = Math.cos(f), sf = Math.sin(f);
      var outline = [RB, -0.12, 0.42, -0.5, 0.42, -0.68, RB, -0.5];
      for (var e = 0; e < 4; e++) {
        var a = e * 2, b = ((e + 1) % 4) * 2;
        fins.push(outline[a] * cf, outline[a + 1], outline[a] * sf, outline[b] * cf, outline[b + 1], outline[b] * sf);
      }
    }
    function around(P, r, y) {
      var a = random() * TAU;
      P[0] = Math.cos(a) * r; P[1] = y; P[2] = Math.sin(a) * r;
    }
    var shape = makeShape(n, [
      { weight: 0.26, place: function (P) { around(P, RB, BOTTOM + random() * (TOP - BOTTOM)); } },
      { weight: 0.14, place: function (P) {          // nose cone
        var t = random();
        around(P, RB * Math.pow(1 - t, 0.6), TOP + t * (NOSE - TOP));
      } },
      { weight: 0.05, place: function (P) {          // bands
        around(P, RB + 0.006, [TOP, 0.0, BOTTOM][Math.floor(random() * 3)] + jitter(0.006));
      } },
      { weight: 0.04, place: function (P) {          // round window
        var a = random() * TAU, r = random() < 0.6 ? 0.065 : 0.045;
        P[0] = Math.cos(a) * r; P[1] = 0.2 + Math.sin(a) * r;
        P[2] = Math.sqrt(RB * RB - P[0] * P[0]) + 0.01;
      } },
      { weight: 0.1,  place: segments(fins, 0.005, 0) },
      { weight: 0.08, place: function (P) {          // fin surfaces
        var f2 = PI / 4 + Math.floor(random() * 4) * (PI / 2), s = random(), t = random();
        var r = RB + (0.42 - RB) * t, y = (-0.12 - 0.38 * s) * (1 - t) + (-0.5 - 0.18 * s) * t;
        P[0] = Math.cos(f2) * r; P[1] = y; P[2] = Math.sin(f2) * r;
      } },
      { weight: 0.05, place: function (P) {          // nozzle
        var t = random();
        around(P, 0.1 + 0.04 * t, BOTTOM - 0.12 * t);
      } },
      { weight: 0.28, place: function (P) {          // exhaust plume
        var t = Math.pow(random(), 1.6), a = random() * TAU, r = (0.06 + t * 0.2) * Math.sqrt(random());
        P[0] = Math.cos(a) * r; P[1] = -0.64 - t * 0.5; P[2] = Math.sin(a) * r;
      } }
    ]);
    return rotateZ(move(shape, 0, 0.1, 0.95), -0.55);
  }

  /* --- Engineering: chip with circuit traces fanning out, seen at an angle --- */
  function shapeChip(n) {
    var S = 0.3, HT = 0.08, box = [], die = [], pins = [], traces = [], vias = [], k, j;
    boxEdges(-S, S, -S, S, 0, HT, box);
    path([-0.14, -0.14, HT, 0.14, -0.14, HT, 0.14, 0.14, HT, -0.14, 0.14, HT], true, die);
    for (k = 0; k < 4; k++) {
      var ang = (k * PI) / 2, dx = Math.cos(ang), dy = Math.sin(ang), ex = -dy, ey = dx;
      for (j = 0; j < 5; j++) {
        var p = -0.2 + j * 0.1;
        var ax = dx * S + ex * p, ay = dy * S + ey * p;
        var bx = ax + dx * 0.06, by = ay + dy * 0.06;
        pins.push(ax, ay, HT * 0.4, bx, by, HT * 0.4);
        // Trace: out, a 45° bend away from the middle, then out again to a round pad
        var sgn = Math.abs(p) < 0.01 ? 0 : p > 0 ? 1 : -1;
        var l1 = 0.08 + random() * 0.18, l2 = 0.08 + random() * 0.12;
        var cx = bx + dx * l1, cy = by + dy * l1;
        var d2 = sgn ? l2 / Math.SQRT2 : l2;
        var qx = cx + dx * d2 + ex * sgn * d2, qy = cy + dy * d2 + ey * sgn * d2;
        var reach = Math.abs(qx * dx + qy * dy);
        var l3 = Math.max(0.03, 0.95 - reach - random() * 0.15);
        var fx = qx + dx * l3, fy = qy + dy * l3;
        path([bx, by, 0, cx, cy, 0, qx, qy, 0, fx, fy, 0], false, traces);
        vias.push(fx, fy);
      }
    }
    var shape = makeShape(n, [
      { weight: 0.16, place: segments(box, 0.004, 0) },
      { weight: 0.1,  place: function (P) { P[0] = (random() * 2 - 1) * S; P[1] = (random() * 2 - 1) * S; P[2] = HT; } },
      { weight: 0.06, place: segments(die, 0.004, 0) },
      { weight: 0.01, place: function (P) { ball(P, 0.025, -0.21, 0.21, HT, false); } },
      { weight: 0.08, place: segments(pins, 0.006, 0) },
      { weight: 0.38, place: segments(traces, 0.006, 0) },
      { weight: 0.14, place: function (P) {          // round pads at the end of each trace
        var v = Math.floor(random() * (vias.length / 2)) * 2, a = random() * TAU;
        P[0] = vias[v] + Math.cos(a) * 0.028; P[1] = vias[v + 1] + Math.sin(a) * 0.028; P[2] = 0;
      } }
    ]);
    return move(rotateX(shape, -0.95), 0, 0, 1.05);
  }

  /* --- Engineering: robot arm --- */
  function shapeRobot(n) {
    var SH = [0, -0.62, 0], EL = [-0.38, 0.12, 0], WR = [0.3, 0.46, 0], HD = [0.44, 0.36, 0];
    var arm1 = [SH[0], SH[1], 0, EL[0], EL[1], 0, 0.08, 0.07];
    var arm2 = [EL[0], EL[1], 0, WR[0], WR[1], 0, 0.06, 0.05];
    var hand = [WR[0], WR[1], 0, HD[0], HD[1], 0, 0.05, 0.05];
    var fingers = [];
    tube([HD[0], HD[1], 0, 0.56, 0.46, 0, 0.68, 0.42, 0], 0.024, 0.02, fingers);
    tube([HD[0], HD[1], 0, 0.52, 0.24, 0, 0.65, 0.25, 0], 0.024, 0.02, fingers);
    // Upright cylinder (base, turntable): side and top face
    function cylinderY(r, y0, y1) {
      return function (P) {
        var a = random() * TAU;
        if (random() < 0.6) { P[0] = Math.cos(a) * r; P[1] = y0 + random() * (y1 - y0); P[2] = Math.sin(a) * r; }
        else { var rr = Math.sqrt(random()) * r; P[0] = Math.cos(a) * rr; P[1] = y1; P[2] = Math.sin(a) * rr; }
      };
    }
    // Joint: short cylinder lying front to back
    function joint(c, r, h) {
      return function (P) {
        var a = random() * TAU;
        if (random() < 0.55) { P[0] = c[0] + Math.cos(a) * r; P[1] = c[1] + Math.sin(a) * r; P[2] = (random() * 2 - 1) * h; }
        else { var rr = Math.sqrt(random()) * r; P[0] = c[0] + Math.cos(a) * rr; P[1] = c[1] + Math.sin(a) * rr; P[2] = random() < 0.5 ? h : -h; }
      };
    }
    return move(makeShape(n, [
      { weight: 0.14, place: cylinderY(0.32, -0.98, -0.86) },
      { weight: 0.06, place: cylinderY(0.18, -0.86, -0.74) },
      { weight: 0.1,  place: joint(SH, 0.12, 0.12) },
      { weight: 0.2,  place: rods(arm1) },
      { weight: 0.08, place: joint(EL, 0.095, 0.1) },
      { weight: 0.16, place: rods(arm2) },
      { weight: 0.05, place: function (P) { ball(P, 0.07, WR[0], WR[1], 0, true); } },
      { weight: 0.05, place: rods(hand) },
      { weight: 0.08, place: rods(fingers) }
    ]), -0.12, 0.2, 1);
  }

  /* --- Computer science: neural network (layers of nodes, fully connected) --- */
  function shapeNetwork(n) {
    var layers = [3, 5, 5, 2], cols = [], nodes = [], edges = [];
    layers.forEach(function (count, li) {
      var x = -0.85 + (li * 1.7) / (layers.length - 1), col = [];
      for (var j = 0; j < count; j++) {
        var node = [x, (j - (count - 1) / 2) * 0.38, (j % 2 ? 0.08 : -0.08) * (li % 2 ? 1 : -1)];
        col.push(node);
        nodes.push(node);
      }
      cols.push(col);
    });
    for (var li = 0; li < cols.length - 1; li++) {
      cols[li].forEach(function (a) {
        cols[li + 1].forEach(function (b) { edges.push(a[0], a[1], a[2], b[0], b[1], b[2]); });
      });
    }
    return makeShape(n, [
      { weight: 0.5, place: function (P) {
        var c = nodes[Math.floor(random() * nodes.length)];
        ball(P, 0.085, c[0], c[1], c[2], random() < 0.85);
      } },
      { weight: 0.5, place: segments(edges, 0.003, 0) }
    ]);
  }

  var BUILDERS = {
    cloud: shapeCloud,
    atom: shapeAtom, orbital: shapeOrbital,
    dna: shapeDNA, neuron: shapeNeuron,
    lorenz: shapeLorenz, mobius: shapeMobius,
    candles: shapeCandles,
    rocket: shapeRocket, chip: shapeChip, robot: shapeRobot,
    network: shapeNetwork
  };

  // Shape for step k of the loop (0 = first shape after the opening cloud)
  function shapeAt(k) {
    var variants = FIELDS[k % FIELDS.length];
    return variants[Math.floor(k / FIELDS.length) % variants.length];
  }
  function fieldOf(name) {
    for (var f = 0; f < FIELDS.length; f++) if (FIELDS[f].indexOf(name) !== -1) return f;
    return -1;
  }

  /* ========================================================================
     2. DEVICE CHECK: how many dots to start with
     ======================================================================== */
  var smallScreen = Math.min(screen.width, screen.height) < 768 || window.innerWidth < 900;
  var lowPower = (navigator.hardwareConcurrency || 4) <= 4 || (navigator.deviceMemory || 4) <= 2;
  var COUNT = smallScreen || lowPower ? SETTINGS.dotsMobile : SETTINGS.dotsDesktop;
  var drawCount = FORCE === "low" ? SETTINGS.dotsMinimum : COUNT;
  var dprCap = smallScreen ? 1.5 : 2;

  // Each shape is calculated once, the first time it is needed, and kept
  var shapes = {};
  function getShape(name) {
    if (!shapes[name]) shapes[name] = BUILDERS[name](COUNT);
    return shapes[name];
  }

  // One random value per dot: gives each dot its own timing, size and colour
  var rands = null;
  function buildRands() {
    var r = new Float32Array(COUNT);
    for (var i = 0; i < COUNT; i++) r[i] = random();
    return r;
  }

  /* ========================================================================
     3. LAYOUT: where the shape sits in the hero
     ======================================================================== */
  var W = 0, H = 0, DPR = 1, CX = 0, CY = 0, R = 0, FADE = 1, TEXT_EDGE = 0, DIM = 1;

  // Right edge of the hero text, so dots passing behind it can be dimmed
  function textEdge() {
    var box = hero.getBoundingClientRect(), right = 0;
    hero.querySelectorAll(".hero-content > *").forEach(function (el) {
      right = Math.max(right, el.getBoundingClientRect().right - box.left);
    });
    return right;
  }

  function layout() {
    W = hero.clientWidth;
    H = hero.clientHeight;
    DPR = Math.min(window.devicePixelRatio || 1, dprCap);
    if (W >= 900) {
      // Laptop and desktop: large, on the right, reaching behind the text
      R = Math.min(H * SETTINGS.sizeDesktop, W * 0.3);
      CX = W * 0.67;
      CY = H * 0.47;
      FADE = 1;
      TEXT_EDGE = textEdge();
      DIM = SETTINGS.dimBehindText;
    } else {
      // Mobile: large and partly off-screen, softer behind the text
      R = Math.max(W * 0.5, 180);
      CX = W * 0.8;
      CY = H * 0.8;
      FADE = 0.45;
      TEXT_EDGE = 0;
      DIM = 1;
    }
    if (label) {
      label.style.left = CX + "px";
      label.style.top = Math.min(CY + R + 10, H - 36) + "px";
    }
  }

  /* ========================================================================
     4. WEBGL
     ======================================================================== */
  var VERTEX_SHADER = [
    "precision highp float;",
    "attribute vec3 aFrom, aTo;",                // the shape we come from / go to
    "attribute float aRand;",
    "uniform float uProgress, uTime, uPointSize, uFade, uTextEdge, uDim;",
    "uniform mat3 uRot;",
    "uniform vec2 uCenter, uScale;",
    "varying float vAlpha, vAccent;",
    "void main() {",
    // each dot leaves a little later than the previous one: a wave, not a jump
    "  float t = clamp((uProgress - aRand * 0.35) / 0.65, 0.0, 1.0);",
    "  t = t * t * (3.0 - 2.0 * t);",
    "  vec3 p = mix(aFrom, aTo, t);",
    "  p *= 1.0 + sin(t * 3.14159) * 0.22 * (0.4 + aRand);", // swirl outward mid-journey
    "  float ph = aRand * 6.2831;",
    "  p += 0.012 * vec3(sin(uTime*0.7 + ph), cos(uTime*0.9 + ph*1.3), sin(uTime*0.5 + ph*2.1));",
    "  p = uRot * p;",
    "  float persp = 3.0 / (3.0 - p.z);",
    "  gl_Position = vec4(uCenter + p.xy * uScale * persp, 0.0, 1.0);",
    "  gl_PointSize = uPointSize * persp * (0.7 + 0.6 * fract(aRand * 7.31));",
    "  vAlpha = (0.3 + 0.7 * clamp((p.z + 1.0) * 0.5, 0.0, 1.0)) * uFade;",
    // softer behind the hero text, so the text stays easy to read
    "  vAlpha *= mix(uDim, 1.0, smoothstep(uTextEdge - 0.05, uTextEdge + 0.2, gl_Position.x));",
    "  vAccent = step(0.88, fract(aRand * 13.7));",
    "}"
  ].join("\n");

  var FRAGMENT_SHADER = [
    "precision mediump float;",
    "uniform vec3 uColor, uAccent;",
    "varying float vAlpha, vAccent;",
    "void main() {",
    "  vec2 c = gl_PointCoord - 0.5;",
    "  float d = dot(c, c);",
    "  if (d > 0.25) discard;",            // round dots
    "  float a = (1.0 - d * 4.0) * vAlpha;", // soft edge
    "  gl_FragColor = vec4(mix(uColor, uAccent, vAccent) * a, a);",
    "}"
  ].join("\n");

  var gl = null, U = {}, LOC = {}, buffers = {}, pointMax = 64, glReady = false;
  var ROT = new Float32Array(9); // reused every frame: no memory churn

  function compile(type, source) {
    var shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    return shader;
  }

  // The GPU copy of a shape, uploaded the first time it is needed
  function shapeBuffer(name) {
    if (!buffers[name]) {
      buffers[name] = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffers[name]);
      gl.bufferData(gl.ARRAY_BUFFER, getShape(name), gl.STATIC_DRAW);
    }
    return buffers[name];
  }

  // Frees the GPU copies of shapes that are not on screen or coming next
  function releaseBuffers(keep) {
    Object.keys(buffers).forEach(function (name) {
      if (keep.indexOf(name) === -1) { gl.deleteBuffer(buffers[name]); delete buffers[name]; }
    });
  }

  function initGL() {
    var options = { alpha: false, antialias: false, depth: false, stencil: false,
                    premultipliedAlpha: true, preserveDrawingBuffer: false, powerPreference: "low-power" };
    gl = canvas.getContext("webgl", options) || canvas.getContext("experimental-webgl", options);
    if (!gl) throw new Error("WebGL not available");

    var program = gl.createProgram();
    gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX_SHADER));
    gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);

    ["aFrom", "aTo", "aRand"].forEach(function (name) {
      LOC[name] = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(LOC[name]);
    });
    var randBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, randBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, rands, gl.STATIC_DRAW);
    gl.vertexAttribPointer(LOC.aRand, 1, gl.FLOAT, false, 0, 0);

    ["uProgress", "uTime", "uPointSize", "uFade", "uTextEdge", "uDim",
     "uRot", "uCenter", "uScale", "uColor", "uAccent"].forEach(function (name) {
      U[name] = gl.getUniformLocation(program, name);
    });

    // Additive blending: no need to sort dots by depth
    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);

    var bg = backgroundColor();
    gl.clearColor(bg[0], bg[1], bg[2], 1);
    var c = SETTINGS.dotColor, a = SETTINGS.accentColor, k = SETTINGS.brightness;
    gl.uniform3f(U.uColor, c[0] * k, c[1] * k, c[2] * k);
    gl.uniform3f(U.uAccent, a[0] * k * 1.4, a[1] * k * 1.4, a[2] * k * 1.4);
    pointMax = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE)[1] || 64;

    buffers = {}; // after a graphics reset, the old GPU copies are gone
    glReady = true;
    setShapes(fromShape, toShape);
    resizeGL();
  }

  // The hero's navy, read from the page so the two always match
  function backgroundColor() {
    var m = getComputedStyle(hero).backgroundColor.match(/\d+(\.\d+)?/g);
    return m ? [m[0] / 255, m[1] / 255, m[2] / 255] : [5 / 255, 28 / 255, 44 / 255];
  }

  function resizeGL() {
    layout();
    canvas.width = Math.max(1, Math.round(W * DPR));
    canvas.height = Math.max(1, Math.round(H * DPR));
    if (!glReady) return;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uCenter, (CX / W) * 2 - 1, 1 - (CY / H) * 2);
    gl.uniform2f(U.uScale, (R / W) * 2, (R / H) * 2);
    gl.uniform1f(U.uPointSize, Math.min(SETTINGS.dotSize * DPR, pointMax / 2));
    gl.uniform1f(U.uFade, FADE);
    gl.uniform1f(U.uTextEdge, (TEXT_EDGE / W) * 2 - 1);
    gl.uniform1f(U.uDim, DIM);
  }

  function setShapes(from, to) {
    if (!glReady) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, shapeBuffer(from));
    gl.vertexAttribPointer(LOC.aFrom, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, shapeBuffer(to));
    gl.vertexAttribPointer(LOC.aTo, 3, gl.FLOAT, false, 0, 0);
  }

  // Rotation: gentle swing left/right plus the mouse tilt (column-major 3×3)
  function setRotation(turn, tilt) {
    var cy = Math.cos(turn), sy = Math.sin(turn), ct = Math.cos(tilt), st = Math.sin(tilt);
    ROT[0] = cy;  ROT[1] = st * sy;  ROT[2] = -ct * sy;
    ROT[3] = 0;   ROT[4] = ct;       ROT[5] = st;
    ROT[6] = sy;  ROT[7] = -st * cy; ROT[8] = ct * cy;
  }

  function render() {
    setRotation(Math.sin(clock * 0.18) * 0.55 + turnNow, 0.12 + tiltNow);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uTime, clock);
    gl.uniform1f(U.uProgress, progress);
    gl.uniformMatrix3fv(U.uRot, false, ROT);
    gl.drawArrays(gl.POINTS, 0, drawCount);
  }

  /* ========================================================================
     5. TIMELINE: hold a shape, travel to the next, repeat
     ======================================================================== */
  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var SHOW_ONE = BUILDERS[SHOW] && SHOW !== "cloud" ? SHOW : "";
  var STATIC = reduceMotion || FORCE === "static" || !!SHOW_ONE;
  var STILL_SHAPE = SHOW_ONE || shapeAt(0);

  var step = 0;                                        // how many shapes into the loop
  var fromShape = STATIC ? STILL_SHAPE : "cloud";      // start from the cloud
  var toShape = STATIC ? STILL_SHAPE : shapeAt(0);
  var morphing = !STATIC, phase = 0, progress = 0, clock = 0, labelShown = false;

  // Works out the next shape in a quiet moment, so the movement never stutters
  var later = window.requestIdleCallback || function (fn) { return setTimeout(fn, 60); };
  function prepareNext() {
    var next = shapeAt(step + 1);
    later(function () {
      getShape(next);
      if (glReady) {
        shapeBuffer(next);
        releaseBuffers([fromShape, toShape, next]);
      }
    });
  }

  function showLabel(name) {
    if (!label || !SETTINGS.showLabel) return;
    label.textContent = LABELS[fieldOf(name)] || "";
    label.classList.add("is-visible");
  }
  function hideLabel() {
    if (label) label.classList.remove("is-visible");
  }

  function advance(dt) {
    clock += dt;
    phase += dt;
    if (morphing) {
      progress = Math.min(phase / SETTINGS.morphSeconds, 1);
      if (!labelShown && progress > 0.6) { showLabel(toShape); labelShown = true; }
      if (phase >= SETTINGS.morphSeconds) {
        morphing = false;
        phase = 0;
        progress = 0;
        fromShape = toShape;
        setShapes(fromShape, fromShape);
        prepareNext();
      }
    } else if (phase >= SETTINGS.holdSeconds) {
      morphing = true;
      phase = 0;
      labelShown = false;
      step++;
      toShape = shapeAt(step);
      debug.shape = toShape;
      setShapes(fromShape, toShape);
      hideLabel();
    }
  }

  /* ========================================================================
     6. LOOP, with pausing and automatic quality
     ======================================================================== */
  var running = false, frameId = 0, last = 0;
  var inView = true, pageVisible = !document.hidden;
  var turnNow = 0, tiltNow = 0, turnTarget = 0, tiltTarget = 0;
  var monitor = { skip: 30, frames: 0, sum: 0, steps: 0 };
  var debug = window.__beyondHero = { mode: "starting", count: drawCount, dpr: 1, avgFrameMs: 0, shape: toShape };

  function frame(now) {
    if (!running) return;
    var raw = last ? now - last : 16;
    last = now;
    advance(Math.min(raw, 50) / 1000); // a slow frame never makes the animation jump
    turnNow += (turnTarget - turnNow) * 0.05;
    tiltNow += (tiltTarget - tiltNow) * 0.05;
    render();
    checkSpeed(raw);
    frameId = requestAnimationFrame(frame);
  }

  // Every 60 frames: if frames take too long, draw fewer dots (up to 4 steps)
  function checkSpeed(ms) {
    if (monitor.skip > 0) { monitor.skip--; return; }
    monitor.sum += ms;
    if (++monitor.frames < 60) return;
    var avg = monitor.sum / monitor.frames;
    debug.avgFrameMs = Math.round(avg * 10) / 10;
    monitor.sum = 0;
    monitor.frames = 0;
    if (avg > 22 && monitor.steps < 4) {
      monitor.steps++;
      monitor.skip = 30;
      if (drawCount > SETTINGS.dotsMinimum) {
        drawCount = Math.max(SETTINGS.dotsMinimum, Math.round(drawCount * 0.7));
      } else if (dprCap > 1) {
        dprCap = 1;
        resizeGL();
      }
      debug.count = drawCount;
      debug.dpr = DPR;
    }
  }

  function start() {
    if (running) return;
    running = true;
    last = 0;
    frameId = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    cancelAnimationFrame(frameId);
  }

  function update() {
    if (glReady && !STATIC && inView && pageVisible) start(); else stop();
  }

  /* ========================================================================
     7. FALLBACK: a still drawing of the first shape, without WebGL
     ======================================================================== */
  function fallback(error) {
    if (error) console.warn("Beyond hero: using the still image.", error);
    stop();
    glReady = false;
    debug.mode = "fallback";
    // A canvas that already tried WebGL cannot switch to 2D, so use a fresh one
    var fresh = canvas.cloneNode(false);
    canvas.parentNode.replaceChild(fresh, canvas);
    canvas = fresh;
    var ctx = canvas.getContext("2d");
    if (!ctx) return;
    var pts = getShape(STILL_SHAPE);

    function draw() {
      layout();
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      setRotation(0.35, 0.12);
      for (var i = 0; i < COUNT; i += 2) {
        var x = pts[i * 3], y = pts[i * 3 + 1], z = pts[i * 3 + 2];
        var rx = ROT[0] * x + ROT[3] * y + ROT[6] * z;
        var ry = ROT[1] * x + ROT[4] * y + ROT[7] * z;
        var rz = ROT[2] * x + ROT[5] * y + ROT[8] * z;
        var s = 3 / (3 - rz), px = CX + rx * R * s;
        var alpha = (0.25 + 0.4 * (rz + 1) / 2) * FADE * (px < TEXT_EDGE + 40 ? DIM : 1);
        ctx.fillStyle = "rgba(255,255,255," + alpha.toFixed(3) + ")";
        ctx.fillRect(px - 0.8, CY - ry * R * s - 0.8, 1.6, 1.6);
      }
    }
    draw();
    onResize = draw;
    showLabel(STILL_SHAPE);
  }

  /* ========================================================================
     8. START
     ======================================================================== */
  var onResize = function () {
    resizeGL();
    if (glReady && !running) render(); // keep a picture while paused or still
  };

  function boot() {
    try {
      if (FORCE === "fallback") throw new Error("forced for testing");
      rands = buildRands();
      initGL();
      debug.mode = STATIC ? "static" : "webgl";
      debug.dpr = DPR;
      if (!STATIC) prepareNext();
      for (var t = 0; !STATIC && t < START_AT; t += 0.05) advance(0.05); // testing only
      render();
      if (STATIC) showLabel(STILL_SHAPE);
      update();
    } catch (error) {
      fallback(error);
    }
  }

  // The browser can reset the graphics (common on phones). Wait, then rebuild.
  canvas.addEventListener("webglcontextlost", function (event) {
    event.preventDefault();
    glReady = false;
    debug.mode = "lost";
    stop();
  });
  canvas.addEventListener("webglcontextrestored", function () {
    try {
      initGL();
      debug.mode = STATIC ? "static" : "webgl";
      render();
      update();
    } catch (error) {
      fallback(error);
    }
  });

  // Pause when the hero is off screen or the tab is hidden
  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      update();
    }).observe(hero);
  }
  document.addEventListener("visibilitychange", function () {
    pageVisible = !document.hidden;
    update();
  });

  // Resize, at most once per frame
  var resizeQueued = false;
  function queueResize() {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(function () { resizeQueued = false; onResize(); });
  }
  if ("ResizeObserver" in window) new ResizeObserver(queueResize).observe(hero);
  else window.addEventListener("resize", queueResize);

  // Gentle tilt following the mouse
  hero.addEventListener("pointermove", function (e) {
    if (e.pointerType !== "mouse" || STATIC) return;
    var rect = hero.getBoundingClientRect();
    turnTarget = ((e.clientX - rect.left) / rect.width - 0.5) * 0.6;
    tiltTarget = ((e.clientY - rect.top) / rect.height - 0.5) * 0.3;
  });
  hero.addEventListener("pointerleave", function () {
    turnTarget = 0;
    tiltTarget = 0;
  });

  boot();
})();
