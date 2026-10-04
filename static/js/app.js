/* ==========================================================================
   Küresel Ekonomi — Uygulama mantığı (vanilla JS, bağımlılıksız)
   Backend: server.py  ·  API: /api/meta, /api/metric/<id>, /api/table
   ========================================================================== */
(function () {
  "use strict";

  var TABLO = {
    id: "tablo",
    sekme: "Veri Tablosu",
    baslik: "Detaylı Kapsamlı Analiz ve Veri Tablosu",
    kategori: "Veri",
    aciklama: "Seçilen ülkelerin temel göstergeleri. Sütun başlıklarına tıklayarak sıralayabilirsiniz."
  };

  var TABLO_ETIKETLERI = {
    "rank": { ad: "Sıra", fmt: function (v) { return fmtNum(v, 0); } },
    "country": { ad: "Ülke" },
    "minimum_wage": { ad: "Asgari Ücret ($)", fmt: function (v) { return fmtNum(v, 2); } },
    "gdp": { ad: "GSYH ($)", fmt: function (v) { return fmtNum(v, 0); } },
    "physicians_per_thousand": { ad: "Doktor / 1000 kişi", fmt: function (v) { return fmtNum(v, 2); } },
    "urban_population": { ad: "Kent Nüfusu", fmt: function (v) { return fmtNum(v, 0); } },
    "gross_primary_education_enrollment_(%)": { ad: "İlköğretim (%)", fmt: function (v) { return fmtNum(v, 1); } },
    "kira_alim_gucu_skoru": { ad: "Kira Alım Gücü", fmt: function (v) { return fmtNum(v, 3); } }
  };

  var FORMUL = {
    kira: "minimum_wage / rent_index",
    market: "minimum_wage / groceries_index",
    butce: "butce / minimum_wage"
  };

  var ODAK_ULKE = "Turkey";

  var state = {
    meta: null,
    metrics: [],
    selected: new Set(),
    budget: 2000,
    metricId: "kira",
    category: null,
    search: "",
    table: { rows: [], cols: [], key: null, dir: "asc" },
    controller: null,
    firstLoad: true
  };

  /* --- DOM ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };
  var dom = {
    html: document.documentElement,
    status: $("durum"),
    themeBtn: $("tema-degistir"),
    panel: $("kontrol-paneli"),
    panelOpen: $("panel-ac"),
    panelClose: $("panel-kapat"),
    scrim: $("scrim"),
    count: $("secili-sayisi"),
    chips: $("secili-ulkeler"),
    search: $("ulke-ara"),
    list: $("ulke-listesi"),
    btnDefault: $("varsayilan-btn"),
    btnClear: $("temizle-btn"),
    budget: $("butce"),
    budgetOut: $("butce-deger"),
    groups: $("kategori-sekmeleri"),
    items: $("metrik-sekmeleri"),
    kicker: $("gorunum-kategori"),
    title: $("gorunum-baslik"),
    desc: $("gorunum-aciklama"),
    tools: $("gorunum-araclar"),
    stats: $("istatistikler"),
    body: $("gorunum-govde"),
    foot: $("gorunum-dipnot"),
    tooltip: $("tooltip")
  };

  /* --- Yardımcılar ------------------------------------------------------------ */
  var nfCache = {};
  function fmtNum(v, d) {
    if (v === null || v === undefined || Number.isNaN(v)) return "—";
    var k = String(d);
    if (!nfCache[k]) nfCache[k] = new Intl.NumberFormat("tr-TR", { minimumFractionDigits: d, maximumFractionDigits: d });
    return nfCache[k].format(v);
  }
  function fmtUsd(v) { return "$" + fmtNum(v, 0); }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function debounce(fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms);
    };
  }

  function save() {
    try {
      localStorage.setItem("eko.ulkeler", JSON.stringify(Array.from(state.selected)));
      localStorage.setItem("eko.butce", String(state.budget));
    } catch (e) { /* gizli mod vb. */ }
  }

  function load(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }

  function api(path) {
    if (state.controller) state.controller.abort();
    state.controller = new AbortController();
    return fetch(path, { signal: state.controller.signal }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (!r.ok) throw new Error(data.hata || ("HTTP " + r.status));
        return data;
      });
    });
  }

  function countriesParam() {
    return encodeURIComponent(Array.from(state.selected).join("|"));
  }

  function currentMetric() {
    if (state.metricId === TABLO.id) return TABLO;
    return state.metrics.find(function (m) { return m.id === state.metricId; }) || state.metrics[0];
  }

  /* --- Tema ------------------------------------------------------------------- */
  function setTheme(t) {
    dom.html.setAttribute("data-theme", t);
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", t === "dark" ? "#101312" : "#f5f3ee");
    try { localStorage.setItem("eko.tema", t); } catch (e) { /* yok say */ }
  }
  dom.themeBtn.addEventListener("click", function () {
    setTheme(dom.html.getAttribute("data-theme") === "dark" ? "light" : "dark");
  });

  /* --- Mobil panel ------------------------------------------------------------- */
  function openPanel(open) {
    dom.panel.classList.toggle("is-open", open);
    dom.scrim.hidden = !open;
    dom.panelOpen.setAttribute("aria-expanded", String(open));
    if (open) dom.search.focus({ preventScroll: true });
  }
  dom.panelOpen.addEventListener("click", function () { openPanel(true); });
  dom.panelClose.addEventListener("click", function () { openPanel(false); });
  dom.scrim.addEventListener("click", function () { openPanel(false); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && dom.panel.classList.contains("is-open")) openPanel(false);
  });

  /* --- Ülke seçimi --------------------------------------------------------------- */
  function renderCountries() {
    var q = state.search.toLocaleLowerCase("tr");
    var list = state.meta.ulkeler.filter(function (c) {
      return !q || c.toLocaleLowerCase("tr").indexOf(q) !== -1;
    });

    var frag = document.createDocumentFragment();
    if (!list.length) {
      var li = document.createElement("li");
      li.className = "empty";
      li.textContent = "Eşleşen ülke yok";
      frag.appendChild(li);
    }
    list.forEach(function (c) {
      var li = document.createElement("li");
      li.setAttribute("role", "option");
      li.setAttribute("tabindex", "0");
      li.setAttribute("aria-selected", String(state.selected.has(c)));
      li.dataset.country = c;
      var box = document.createElement("span");
      box.className = "box";
      box.setAttribute("aria-hidden", "true");
      var name = document.createElement("span");
      name.textContent = c;
      li.append(box, name);
      frag.appendChild(li);
    });
    dom.list.replaceChildren(frag);
  }

  function renderChips() {
    var sel = Array.from(state.selected).sort(function (a, b) { return a.localeCompare(b, "tr"); });
    dom.count.textContent = String(sel.length);
    var frag = document.createDocumentFragment();
    sel.forEach(function (c) {
      var chip = document.createElement("span");
      chip.className = "chip";
      var t = document.createElement("span");
      t.textContent = c;
      var b = document.createElement("button");
      b.type = "button";
      b.dataset.remove = c;
      b.setAttribute("aria-label", c + " seçimini kaldır");
      b.textContent = "×";
      chip.append(t, b);
      frag.appendChild(chip);
    });
    dom.chips.replaceChildren(frag);
    updateStatus();
  }

  function updateStatus() {
    dom.status.textContent = state.selected.size + " ülke seçili · " + state.meta.toplam_ulke + " ülke · " + state.metrics.length + " gösterge";
  }

  var refresh = debounce(function () { loadView(); }, 120);

  function toggleCountry(c) {
    if (state.selected.has(c)) state.selected.delete(c);
    else state.selected.add(c);
    save();
    var li = dom.list.querySelector('li[data-country="' + CSS.escape(c) + '"]');
    if (li) li.setAttribute("aria-selected", String(state.selected.has(c)));
    renderChips();
    refresh();
  }

  dom.list.addEventListener("click", function (e) {
    var li = e.target.closest("li[data-country]");
    if (li) toggleCountry(li.dataset.country);
  });
  dom.list.addEventListener("keydown", function (e) {
    var li = e.target.closest("li[data-country]");
    if (!li) return;
    if (e.key === " " || e.key === "Enter") { e.preventDefault(); toggleCountry(li.dataset.country); }
    else if (e.key === "ArrowDown" && li.nextElementSibling) { e.preventDefault(); li.nextElementSibling.focus(); }
    else if (e.key === "ArrowUp" && li.previousElementSibling) { e.preventDefault(); li.previousElementSibling.focus(); }
  });
  dom.chips.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-remove]");
    if (b) toggleCountry(b.dataset.remove);
  });
  dom.search.addEventListener("input", function () {
    state.search = dom.search.value.trim();
    renderCountries();
  });
  dom.btnDefault.addEventListener("click", function () {
    state.selected = new Set(state.meta.varsayilan_ulkeler);
    save(); renderCountries(); renderChips(); loadView();
  });
  dom.btnClear.addEventListener("click", function () {
    state.selected.clear();
    save(); renderCountries(); renderChips(); loadView();
  });

  /* --- Bütçe --------------------------------------------------------------------- */
  function renderBudget() {
    var b = state.meta.butce;
    dom.budget.value = state.budget;
    dom.budgetOut.textContent = fmtUsd(state.budget);
    dom.budget.style.setProperty("--pct", ((state.budget - b.min) / (b.max - b.min) * 100) + "%");
  }
  var budgetRefresh = debounce(function () {
    if (state.metricId === "butce") loadView();
  }, 180);
  dom.budget.addEventListener("input", function () {
    state.budget = Number(dom.budget.value);
    renderBudget();
    save();
    budgetRefresh();
  });

  /* --- Sekmeler -------------------------------------------------------------------- */
  function categories() {
    var seen = [];
    state.metrics.forEach(function (m) { if (seen.indexOf(m.kategori) === -1) seen.push(m.kategori); });
    seen.push(TABLO.kategori);
    return seen;
  }

  function metricsOf(cat) {
    if (cat === TABLO.kategori) return [TABLO];
    return state.metrics.filter(function (m) { return m.kategori === cat; });
  }

  function renderTabs() {
    var cats = categories();
    var gfrag = document.createDocumentFragment();
    cats.forEach(function (c) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "group-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(c === state.category));
      b.dataset.category = c;
      b.textContent = c;
      gfrag.appendChild(b);
    });
    dom.groups.replaceChildren(gfrag);

    var ifrag = document.createDocumentFragment();
    metricsOf(state.category).forEach(function (m, i) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "item-tab";
      b.setAttribute("role", "tab");
      b.setAttribute("aria-selected", String(m.id === state.metricId));
      b.setAttribute("tabindex", m.id === state.metricId ? "0" : "-1");
      b.dataset.metric = m.id;
      b.style.animationDelay = (i * 25) + "ms";
      b.textContent = m.sekme;
      ifrag.appendChild(b);
    });
    dom.items.replaceChildren(ifrag);
  }

  function selectMetric(id, opts) {
    var valid = id === TABLO.id || state.metrics.some(function (m) { return m.id === id; });
    if (!valid) id = state.metrics[0].id;
    state.metricId = id;
    state.category = currentMetric().kategori;
    renderTabs();
    if (!opts || opts.updateHash !== false) history.replaceState(null, "", "#" + id);
    loadView();
  }

  dom.groups.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-category]");
    if (!b) return;
    var first = metricsOf(b.dataset.category)[0];
    selectMetric(first.id);
  });
  dom.items.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-metric]");
    if (b) selectMetric(b.dataset.metric);
  });
  dom.items.addEventListener("keydown", function (e) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    var btns = Array.from(dom.items.querySelectorAll("button"));
    var i = btns.indexOf(document.activeElement);
    if (i === -1) return;
    var n = btns[(i + (e.key === "ArrowRight" ? 1 : -1) + btns.length) % btns.length];
    selectMetric(n.dataset.metric);
    dom.items.querySelector('[data-metric="' + n.dataset.metric + '"]').focus();
  });
  window.addEventListener("hashchange", function () {
    var id = location.hash.slice(1);
    if (id && id !== state.metricId) selectMetric(id, { updateHash: false });
  });

  /* --- Görünüm ------------------------------------------------------------------------ */
  function setHeader(m, title) {
    dom.kicker.textContent = m.kategori;
    dom.title.textContent = title || m.baslik;
    dom.desc.textContent = m.aciklama || "";
    document.title = (title || m.baslik) + " — Küresel Ekonomi Laboratuvarı";
  }

  function destroyChart() {
    var host = dom.body.querySelector(".chart-host");
    if (host) window.BarChart.destroy(host);
    dom.tooltip.hidden = true;
  }

  function notice(kind, html) {
    destroyChart();
    dom.stats.replaceChildren();
    dom.tools.replaceChildren();
    dom.foot.innerHTML = "";
    dom.body.classList.remove("is-loading");
    dom.body.innerHTML = '<div class="notice notice--' + kind + '">' + html + "</div>";
  }

  function setStats(items) {
    dom.stats.innerHTML = items.map(function (s, i) {
      return '<div class="stat" style="animation-delay:' + (i * 50) + 'ms"><dt>' + esc(s.label) + "</dt><dd>" +
        esc(s.value) + (s.sub ? "<small>" + esc(s.sub) + "</small>" : "") + "</dd></div>";
    }).join("");
  }

  function loadView() {
    var m = currentMetric();
    if (!m) return;
    setHeader(m, m.id === "butce" ? m.baslik.replace("{butce}", state.budget) : null);

    if (!state.selected.size) {
      notice("warn", "⚠️ Lütfen sol menüden en az bir ülke seçin.");
      return;
    }

    if (!state.firstLoad) dom.body.classList.add("is-loading");

    var req = m.id === TABLO.id
      ? api("/api/table?countries=" + countriesParam()).then(renderTable)
      : api("/api/metric/" + encodeURIComponent(m.id) + "?countries=" + countriesParam() + "&budget=" + state.budget).then(renderMetric);

    req.then(function () {
      state.firstLoad = false;
      dom.body.classList.remove("is-loading");
    }).catch(function (err) {
      if (err.name === "AbortError") return;
      notice("error", "Veri alınamadı: " + esc(err.message) +
        "<br>Sunucunun çalıştığından emin olun: <code>python server.py</code>");
    });
  }

  /* Grafik görünümü */
  function renderMetric(data) {
    var m = data.metrik;
    var rows = data.satirlar;
    setHeader(m, m.baslik);

    var withVal = rows.filter(function (r) { return r.value !== null; });
    var fmt = function (v) { return window.BarChart.format(v, m.format, m.birim); };

    var stats = [];
    if (withVal.length) {
      var hi = withVal.reduce(function (a, b) { return b.value > a.value ? b : a; });
      var lo = withVal.reduce(function (a, b) { return b.value < a.value ? b : a; });
      var avg = withVal.reduce(function (s, r) { return s + r.value; }, 0) / withVal.length;
      stats.push({ label: "En yüksek", value: fmt(hi.value), sub: hi.country });
      stats.push({ label: "En düşük", value: fmt(lo.value), sub: lo.country });
      stats.push({ label: "Ortalama", value: fmt(avg), sub: withVal.length + " ülke" });
    }
    var focusIdx = rows.findIndex(function (r) { return r.country === ODAK_ULKE; });
    if (focusIdx !== -1 && rows[focusIdx].value !== null) {
      stats.push({ label: "Türkiye", value: fmt(rows[focusIdx].value), sub: (focusIdx + 1) + ". sıra / " + withVal.length });
    } else {
      stats.push({ label: "Veri kapsamı", value: withVal.length + " / " + rows.length, sub: rows.length - withVal.length ? (rows.length - withVal.length) + " ülkede veri yok" : "Tüm ülkelerde veri var" });
    }
    setStats(stats);

    dom.tools.replaceChildren();

    destroyChart();
    if (!withVal.length) {
      dom.body.innerHTML = '<div class="notice">Seçilen ülkelerin hiçbirinde bu gösterge için veri yok.</div>';
    } else {
      var host = document.createElement("div");
      host.className = "chart-host";
      var legend = document.createElement("div");
      legend.className = "legend";
      dom.body.replaceChildren(host, legend);
      window.BarChart.render(host, {
        rows: rows,
        format: m.format,
        unit: m.birim,
        scale: m.skala,
        focus: ODAK_ULKE,
        tooltip: dom.tooltip,
        legendTarget: legend,
        ariaLabel: m.baslik
      });
    }

    var foot = "Sütun: <code>" + esc(m.sutun) + "</code> · Sıralama: " + (m.artan ? "artan" : "azalan");
    if (FORMUL[m.id]) foot += " · Formül: <code>" + esc(FORMUL[m.id]) + "</code>";
    if (m.etiket) foot += " · Eksen: " + esc(m.etiket);
    dom.foot.innerHTML = foot;
  }

  /* Tablo görünümü */
  function renderTable(data) {
    destroyChart();

    state.table.rows = data.satirlar;
    state.table.cols = data.sutunlar;

    var rows = data.satirlar;
    var sum = function (k) { return rows.reduce(function (s, r) { return s + (r[k] || 0); }, 0); };
    var cnt = function (k) { return rows.filter(function (r) { return r[k] !== null; }).length; };
    var avgOf = function (k) { return cnt(k) ? sum(k) / cnt(k) : null; };
    setStats([
      { label: "Ülke", value: String(rows.length), sub: "seçili" },
      { label: "Ort. asgari ücret", value: avgOf("minimum_wage") === null ? "—" : "$" + fmtNum(avgOf("minimum_wage"), 2), sub: cnt("minimum_wage") + " ülkede veri" },
      { label: "Toplam GSYH", value: window.BarChart.format(sum("gdp"), ".2s", "$"), sub: cnt("gdp") + " ülke" },
      { label: "Ort. kira skoru", value: avgOf("kira_alim_gucu_skoru") === null ? "—" : fmtNum(avgOf("kira_alim_gucu_skoru"), 3), sub: "asgari ücret / kira" }
    ]);

    var dl = document.createElement("button");
    dl.type = "button";
    dl.className = "btn btn--ghost btn--sm";
    dl.textContent = "CSV indir";
    dl.addEventListener("click", downloadCsv);
    dom.tools.replaceChildren(dl);

    drawTable();
    dom.foot.innerHTML = "Seçilen ülkelerin temel makroekonomik ve alım gücü göstergeleri.";
  }

  function drawTable() {
    var t = state.table;
    var rows = t.rows.slice();
    if (t.key) {
      var k = t.key, dir = t.dir === "asc" ? 1 : -1;
      rows.sort(function (a, b) {
        var x = a[k], y = b[k];
        if (x === null) return 1;
        if (y === null) return -1;
        if (typeof x === "string") return x.localeCompare(y, "tr") * dir;
        return (x - y) * dir;
      });
    }

    var head = t.cols.map(function (c) {
      var lab = TABLO_ETIKETLERI[c] ? TABLO_ETIKETLERI[c].ad : c;
      var sort = t.key === c ? (t.dir === "asc" ? "ascending" : "descending") : "none";
      var num = c !== "country" ? ' class="num"' : "";
      return "<th" + num + ' aria-sort="' + sort + '" scope="col"><button type="button" data-sort="' + esc(c) + '">' + esc(lab) + "</button></th>";
    }).join("");

    var body = rows.map(function (r) {
      return "<tr>" + t.cols.map(function (c) {
        var v = r[c];
        if (c === "country") {
          return '<td class="country">' + esc(v) + (v === ODAK_ULKE ? " ●" : "") + "</td>";
        }
        var f = TABLO_ETIKETLERI[c] && TABLO_ETIKETLERI[c].fmt;
        var txt = f ? f(v) : (v === null ? "—" : v);
        return '<td class="num' + (v === null ? " muted" : "") + '">' + esc(txt) + "</td>";
      }).join("") + "</tr>";
    }).join("");

    dom.body.innerHTML = '<div class="table-wrap"><table class="data"><thead><tr>' + head + "</tr></thead><tbody>" + body + "</tbody></table></div>";
  }

  dom.body.addEventListener("click", function (e) {
    var b = e.target.closest("button[data-sort]");
    if (!b) return;
    var k = b.dataset.sort, t = state.table;
    if (t.key === k) t.dir = t.dir === "asc" ? "desc" : "asc";
    else { t.key = k; t.dir = k === "country" || k === "rank" ? "asc" : "desc"; }
    drawTable();
  });

  function downloadCsv() {
    var t = state.table;
    var q = function (v) {
      if (v === null || v === undefined) return "";
      var s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    var lines = [t.cols.join(",")].concat(t.rows.map(function (r) {
      return t.cols.map(function (c) { return q(r[c]); }).join(",");
    }));
    var blob = new Blob(["\ufeff" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "ekonomi_veri_tablosu.csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);
  }

  /* --- Başlat ----------------------------------------------------------------------------- */
  function init() {
    fetch("/api/meta")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (meta) {
        state.meta = meta;
        state.metrics = meta.metrikler;

        var known = new Set(meta.ulkeler);
        var saved = load("eko.ulkeler", null);
        var initial = Array.isArray(saved) ? saved.filter(function (c) { return known.has(c); }) : meta.varsayilan_ulkeler;
        state.selected = new Set(initial);

        var b = Number(load("eko.butce", meta.butce.value));
        state.budget = Number.isFinite(b) ? Math.min(meta.butce.max, Math.max(meta.butce.min, b)) : meta.butce.value;
        dom.budget.min = meta.butce.min;
        dom.budget.max = meta.butce.max;
        dom.budget.step = meta.butce.step;

        renderBudget();
        renderCountries();
        renderChips();
        selectMetric(location.hash.slice(1) || state.metrics[0].id, { updateHash: !!location.hash });
      })
      .catch(function (err) {
        dom.title.textContent = "Bağlantı hatası";
        notice("error", "Sunucuya ulaşılamadı (" + esc(err.message) + ").<br>Proje klasöründe <code>python server.py</code> komutunu çalıştırıp <code>http://127.0.0.1:5000</code> adresini açın.");
      });
  }

  init();
})();
