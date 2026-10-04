/* ==========================================================================
   BarChart — bağımsız, kütüphanesiz SVG yatay çubuk grafik.
   - Plotly renk skalalarının karşılıkları (RdYlGn, Blues, Viridis …)
   - d3 tarzı formatlar: .0f .1f .2f .2s
   - Negatif değer desteği, tooltip, animasyon, yeniden boyutlandırma
   ========================================================================== */
(function (global) {
  "use strict";

  var SVGNS = "http://www.w3.org/2000/svg";

  // min/max: skalanın kullanılan aralığı. Açık tonla başlayan skalalarda en
  // açık renkler kâğıt zeminde kaybolmasın diye alt sınır yükseltildi.
  var SCALES = {
    RdYlGn:  { min: 0,   max: 1, stops: ["#a50026", "#d73027", "#f46d43", "#fdae61", "#fee08b", "#d9ef8b", "#a6d96a", "#66bd63", "#1a9850", "#006837"] },
    Blues:   { min: .3,  max: 1, stops: ["#f7fbff", "#deebf7", "#c6dbef", "#9ecae1", "#6baed6", "#4292c6", "#2171b5", "#08519c", "#08306b"] },
    Purples: { min: .3,  max: 1, stops: ["#fcfbfd", "#efedf5", "#dadaeb", "#bcbddc", "#9e9ac8", "#807dba", "#6a51a3", "#54278f", "#3f007d"] },
    Greens:  { min: .3,  max: 1, stops: ["#f7fcf5", "#e5f5e0", "#c7e9c0", "#a1d99b", "#74c476", "#41ab5d", "#238b45", "#006d2c", "#00441b"] },
    Oranges: { min: .3,  max: 1, stops: ["#fff5eb", "#fee6ce", "#fdd0a2", "#fdae6b", "#fd8d3c", "#f16913", "#d94801", "#a63603", "#7f2704"] },
    Reds:    { min: .3,  max: 1, stops: ["#fff5f0", "#fee0d2", "#fcbba1", "#fc9272", "#fb6a4a", "#ef3b2c", "#cb181d", "#a50f15", "#67000d"] },
    YlOrRd:  { min: .25, max: 1, stops: ["#ffffcc", "#ffeda0", "#fed976", "#feb24c", "#fd8d3c", "#fc4e2a", "#e31a1c", "#bd0026", "#800026"] },
    OrRd:    { min: .3,  max: 1, stops: ["#fff7ec", "#fee8c8", "#fdd49e", "#fdbb84", "#fc8d59", "#ef6548", "#d7301f", "#b30000", "#7f0000"] },
    Viridis: { min: 0,   max: 1, stops: ["#440154", "#482878", "#3e4989", "#31688e", "#26828e", "#1f9e89", "#35b779", "#6ece58", "#b5de2b", "#fde725"] },
    Teal:    { min: .1,  max: 1, stops: ["#d1eeea", "#a8dbd9", "#85c4c9", "#68abb8", "#4f90a6", "#3b738f", "#2a5674"] },
    Sunset:  { min: 0,   max: 1, stops: ["#f3e79b", "#fac484", "#f8a07e", "#eb7f86", "#ce6693", "#a059a0", "#5c53a5"] }
  };

  /* --- Renk ------------------------------------------------------------- */
  function hexToRgb(h) {
    var n = parseInt(h.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function clamp01(t) { return t < 0 ? 0 : t > 1 ? 1 : t; }

  function color(scaleName, t) {
    var s = SCALES[scaleName] || SCALES.Blues;
    var tt = s.min + (s.max - s.min) * clamp01(t);
    var pos = tt * (s.stops.length - 1);
    var i = Math.min(Math.floor(pos), s.stops.length - 2);
    var f = pos - i;
    var a = hexToRgb(s.stops[i]), b = hexToRgb(s.stops[i + 1]);
    return "rgb(" + [0, 1, 2].map(function (k) { return Math.round(a[k] + (b[k] - a[k]) * f); }).join(",") + ")";
  }

  function rampCss(scaleName) {
    var parts = [];
    for (var i = 0; i <= 8; i++) parts.push(color(scaleName, i / 8) + " " + (i * 12.5) + "%");
    return "linear-gradient(to right, " + parts.join(", ") + ")";
  }

  /* --- Sayı formatları (tr-TR) --------------------------------------------- */
  var nfCache = {};
  function nf(min, max) {
    var key = min + ":" + max;
    if (!nfCache[key]) nfCache[key] = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: min, maximumFractionDigits: max });
    return nfCache[key];
  }

  var SI = [[1e12, "Tn"], [1e9, "Mr"], [1e6, "Mn"], [1e3, "bin"]];

  // d3 ".2s" karşılığı: 2 anlamlı basamak + Türkçe kısaltma (bin, Mn, Mr, Tn)
  function si(v, precision) {
    var abs = Math.abs(v);
    for (var i = 0; i < SI.length; i++) {
      if (abs >= SI[i][0]) {
        var x = Number((v / SI[i][0]).toPrecision(precision));
        return nf(0, 1).format(x) + " " + SI[i][1];
      }
    }
    return nf(0, 1).format(Number(v.toPrecision(precision)));
  }

  function withUnit(s, unit) {
    switch (unit) {
      case "$": return "$" + s;
      case "%": return "%" + s;          // Türkçe yazım: %4,5
      case "×": return s + "×";
      case "‰": return s + "‰";
      case "°": return s + "°";
      case "":
      case undefined:
      case null: return s;
      default: return s + " " + unit;
    }
  }

  function format(v, fmt, unit) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    var s;
    if (fmt === ".2s") s = si(v, 2);
    else {
      var d = parseInt(String(fmt || ".1f").replace(/\D/g, ""), 10);
      if (Number.isNaN(d)) d = 1;
      s = nf(d, d).format(v);
    }
    return withUnit(s, unit);
  }

  // Tooltip için ayrıntılı (kısaltmasız) değer
  function formatFull(v, unit) {
    if (v === null || v === undefined || Number.isNaN(v)) return "Veri yok";
    var abs = Math.abs(v);
    var d = abs >= 1000 ? 0 : abs >= 1 ? 2 : 3;
    return withUnit(nf(0, d).format(v), unit);
  }

  function formatTick(v, fmt) {
    if (Math.abs(v) >= 1000) return si(v, 3);
    var d = fmt === ".0f" ? 0 : Math.abs(v) < 1 && v !== 0 ? 2 : 1;
    return nf(0, d).format(v);
  }

  /* --- Ölçek yardımcıları -------------------------------------------------- */
  function niceStep(span, count) {
    var raw = span / Math.max(count, 1);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var norm = raw / mag;
    var step = norm >= 7.5 ? 10 : norm >= 3.5 ? 5 : norm >= 1.5 ? 2 : 1;
    return step * mag;
  }

  function el(name, attrs, parent) {
    var n = document.createElementNS(SVGNS, name);
    if (attrs) for (var k in attrs) if (attrs[k] !== undefined) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  function truncate(s, maxChars) {
    return s.length > maxChars ? s.slice(0, maxChars - 1) + "…" : s;
  }

  /* --- Çizim ------------------------------------------------------------------- */
  function draw(container, opts, animate) {
    var rows = opts.rows || [];
    var width = Math.max(container.clientWidth, 280);
    var narrow = width < 520;

    var ROW_H = narrow ? 28 : 32;
    var BAR_H = narrow ? 16 : 20;
    var TOP = 26;
    var BOTTOM = 6;
    var RANK_W = 24;
    var VALUE_PAD = narrow ? 62 : 82;

    var longest = rows.reduce(function (m, r) { return Math.max(m, r.country.length); }, 0);
    var maxChars = narrow ? 13 : 22;
    var labelW = RANK_W + Math.min(longest, maxChars) * (narrow ? 6.6 : 7.3) + 14;
    labelW = Math.max(narrow ? 90 : 120, Math.min(labelW, width * .38));

    var vals = rows.map(function (r) { return r.value; }).filter(function (v) { return v !== null && v !== undefined; });
    var vMin = vals.length ? Math.min.apply(null, vals) : 0;
    var vMax = vals.length ? Math.max.apply(null, vals) : 1;

    var dMin = Math.min(0, vMin), dMax = Math.max(0, vMax);
    if (dMin === dMax) dMax = dMin + 1;
    var step = niceStep(dMax - dMin, narrow ? 3 : 5);
    dMin = Math.floor(dMin / step) * step;
    dMax = Math.ceil(dMax / step) * step;

    var x0 = labelW + (dMin < 0 ? VALUE_PAD * .6 : 0);
    var x1 = width - VALUE_PAD;
    function x(v) { return x0 + (v - dMin) / (dMax - dMin) * (x1 - x0); }

    var height = TOP + rows.length * ROW_H + BOTTOM;
    var svg = el("svg", {
      "class": "chart" + (animate ? "" : " no-anim"),
      viewBox: "0 0 " + width + " " + height,
      width: width, height: height, role: "img",
      "aria-label": opts.ariaLabel || "Çubuk grafik"
    });

    // Izgara + eksen etiketleri
    var grid = el("g", { "class": "grid" }, svg);
    for (var t = dMin; t <= dMax + step / 2; t += step) {
      var tv = Math.abs(t) < step / 1e6 ? 0 : t;
      var gx = Math.round(x(tv)) + .5;
      el("line", { x1: gx, x2: gx, y1: TOP - 6, y2: height - BOTTOM }, grid);
      var tl = el("text", { x: gx, y: 12, "text-anchor": "middle" }, grid);
      tl.textContent = formatTick(tv, opts.format);
    }
    var zx = Math.round(x(0)) + .5;
    el("line", { "class": "zero", x1: zx, x2: zx, y1: TOP - 6, y2: height - BOTTOM }, svg);

    // Satırlar
    var tip = opts.tooltip;
    var range = vMax - vMin;

    rows.forEach(function (r, i) {
      var y = TOP + i * ROW_H;
      var cy = y + ROW_H / 2;
      var g = el("g", { "class": "row" }, svg);

      el("rect", { "class": "hit", x: 0, y: y, width: width, height: ROW_H, rx: 4 }, g);

      var rk = el("text", { "class": "rank", x: 2, y: cy, dy: ".35em" }, g);
      rk.textContent = r.value === null ? "–" : String(i + 1);

      var lb = el("text", {
        "class": "row-label" + (r.country === opts.focus ? " is-focus" : ""),
        x: RANK_W, y: cy, dy: ".35em"
      }, g);
      lb.textContent = truncate(r.country, maxChars);

      if (r.value === null || r.value === undefined) {
        var na = el("text", { "class": "na", x: x(0) + 6, y: cy, dy: ".35em" }, g);
        na.textContent = "veri yok";
      } else {
        var v = r.value;
        var bx = Math.min(x(0), x(v));
        var bw = Math.max(Math.abs(x(v) - x(0)), 1.5);
        var tcol = range > 0 ? (v - vMin) / range : 1;
        var bar = el("rect", {
          "class": "bar" + (v < 0 ? " neg" : ""),
          x: bx, y: cy - BAR_H / 2, width: bw, height: BAR_H, rx: 3,
          fill: color(opts.scale, tcol)
        }, g);
        if (animate) bar.style.animationDelay = Math.min(i * 28, 560) + "ms";

        var vl = el("text", {
          "class": "val",
          x: v < 0 ? bx - 6 : bx + bw + 6,
          y: cy, dy: ".35em",
          "text-anchor": v < 0 ? "end" : "start"
        }, g);
        vl.textContent = format(v, opts.format, opts.unit);
      }

      if (tip) {
        g.addEventListener("mouseenter", function () { svg.classList.add("has-hover"); });
        g.addEventListener("mousemove", function (e) {
          tip.innerHTML = "";
          var s = document.createElement("strong");
          s.textContent = r.country;
          var val = document.createElement("div");
          val.textContent = formatFull(r.value, opts.unit);
          var rank = document.createElement("span");
          rank.textContent = r.value === null ? "Sıralama dışı" : (i + 1) + ". sıra · " + rows.length + " ülke";
          tip.appendChild(s); tip.appendChild(val); tip.appendChild(rank);
          tip.hidden = false;
          tip.style.left = e.clientX + "px";
          tip.style.top = e.clientY + "px";
        });
        g.addEventListener("mouseleave", function () {
          svg.classList.remove("has-hover");
          tip.hidden = true;
        });
      }
    });

    container.replaceChildren(svg);

    if (opts.legendTarget) {
      opts.legendTarget.innerHTML = "";
      if (vals.length > 1) {
        var lmin = document.createElement("span");
        lmin.textContent = format(vMin, opts.format, opts.unit);
        var ramp = document.createElement("span");
        ramp.className = "legend__ramp";
        ramp.style.background = rampCss(opts.scale);
        var lmax = document.createElement("span");
        lmax.textContent = format(vMax, opts.format, opts.unit);
        opts.legendTarget.append(lmin, ramp, lmax);
      }
    }
  }

  var observers = new WeakMap();

  function render(container, opts) {
    container._chartOpts = opts;
    container._chartW = container.clientWidth;
    draw(container, opts, true);

    if (!observers.has(container) && "ResizeObserver" in global) {
      var raf = 0;
      var ro = new ResizeObserver(function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          if (!container.isConnected || !container._chartOpts) return;
          if (Math.abs(container.clientWidth - container._chartW) < 2) return;
          container._chartW = container.clientWidth;
          draw(container, container._chartOpts, false);
        });
      });
      ro.observe(container);
      observers.set(container, ro);
    }
  }

  function destroy(container) {
    container._chartOpts = null;
    var ro = observers.get(container);
    if (ro) { ro.disconnect(); observers.delete(container); }
  }

  global.BarChart = { render: render, destroy: destroy, format: format, formatFull: formatFull, color: color };
})(window);
