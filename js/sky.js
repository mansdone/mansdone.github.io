/*
 * Overhead now: the sky above the PES University ground station.
 *
 * Every position is propagated here, in the browser, with SGP4 (satellite.js)
 * from element sets bundled in js/tles.js - the same "compute it locally"
 * rule the station dashboard follows. If the bundle is more than a few days
 * old, fresher sets are pulled from CelesTrak and cached for 12 hours.
 */
(function () {
  "use strict";

  var STATION = { lat: 12.95, lon: 77.667, altKm: 0.888 }; // must match Gpredict's QTH
  var FLOOR = 25;          // deg - the tracker never commands the dish below this
  var MIN_PASS_EL = 10;    // deg - same cut-off as the dashboard's pass list
  var LOOKAHEAD_H = 12;
  var STEP_S = 30;
  var S_BAND_HZ = 2.25e9;
  var C_KMS = 299792.458;
  var STALE_DAYS = 5;
  var CACHE_KEY = "mjs-tle-cache";
  var GROUPS = ["stations", "weather", "resource", "science", "cubesat"];

  var canvas = document.getElementById("sky-canvas");
  var tip = document.getElementById("sky-tip");
  var countEl = document.getElementById("sky-count");
  var rowsEl = document.getElementById("pass-rows");
  var ageEl = document.getElementById("tle-age");
  var nextEl = document.getElementById("bar-next");
  var clockEl = document.getElementById("bar-clock");
  if (!canvas) return;

  var istTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  var istHM = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
  var dayFmt = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

  function tickClock() { if (clockEl) clockEl.textContent = istTime.format(new Date()); }
  tickClock();
  setInterval(tickClock, 1000);

  var S = window.satellite;
  var bundle = window.STATION_TLES;
  if (!S || !bundle) {
    countEl.textContent = "Offline";
    rowsEl.innerHTML = '<tr><td colspan="4">The orbit library didn’t load, so there’s nothing to propagate. Reload with a connection.</td></tr>';
    if (nextEl) nextEl.textContent = "";
    return;
  }

  var D2R = Math.PI / 180, R2D = 180 / Math.PI;
  var observer = { latitude: STATION.lat * D2R, longitude: STATION.lon * D2R, height: STATION.altKm };

  // ------------------------------------------------------------ orbit maths
  function epochOf(l1) {
    var yy = parseInt(l1.substr(18, 2), 10);
    var day = parseFloat(l1.substr(20, 12));
    return new Date(Date.UTC(yy < 57 ? 2000 + yy : 1900 + yy, 0, 1) + (day - 1) * 864e5);
  }

  function makeSats(list) {
    var out = [];
    list.forEach(function (s) {
      try {
        var rec = S.twoline2satrec(s.l1, s.l2);
        if (rec && !rec.error) out.push({ norad: s.norad, name: s.name, l1: s.l1, l2: s.l2, rec: rec, epoch: epochOf(s.l1) });
      } catch (e) { /* a malformed set is skipped, not fatal */ }
    });
    return out;
  }

  function look(rec, date) {
    var pv = S.propagate(rec, date);
    if (!pv || !pv.position || typeof pv.position !== "object") return null;
    var ecf = S.eciToEcf(pv.position, S.gstime(date));
    var la = S.ecfToLookAngles(observer, ecf);
    return { az: (la.azimuth * R2D + 360) % 360, el: la.elevation * R2D, range: la.rangeSat };
  }

  function elAt(sat, t) { var p = look(sat.rec, new Date(t)); return p ? p.el : -90; }

  // bisect a horizon crossing between ta and tb to about a second
  function crossing(sat, ta, tb) {
    var ea = elAt(sat, ta);
    for (var i = 0; i < 14; i++) {
      var tm = (ta + tb) / 2, em = elAt(sat, tm);
      if ((em > 0) === (ea > 0)) { ta = tm; ea = em; } else { tb = tm; }
    }
    return (ta + tb) / 2;
  }

  function predict(sat, t0, t1) {
    var passes = [], cur = null, prevT = null;
    for (var t = t0; t <= t1; t += STEP_S * 1000) {
      var p = look(sat.rec, new Date(t));
      if (!p) break;
      if (p.el > 0) {
        if (!cur) {
          var aos = prevT === null ? t : crossing(sat, prevT, t);
          var a = look(sat.rec, new Date(aos));
          cur = { sat: sat, aos: aos, los: null, maxEl: -90, track: a ? [{ az: a.az, el: Math.max(a.el, 0) }] : [] };
        }
        cur.track.push({ az: p.az, el: p.el });
        if (p.el > cur.maxEl) cur.maxEl = p.el;
      } else if (cur) {
        cur.los = crossing(sat, prevT, t);
        var l = look(sat.rec, new Date(cur.los));
        if (l) cur.track.push({ az: l.az, el: Math.max(l.el, 0) });
        passes.push(cur);
        cur = null;
      }
      prevT = t;
    }
    if (cur) passes.push(cur);
    return passes;
  }

  // ------------------------------------------------------------ state
  var sats = makeSats(bundle.sats);
  var source = "bundle";
  var passes = [];
  var computing = false;
  var hover = null;      // norad of the satellite under the pointer
  var preview = null;    // pass previewed from the table
  var positions = [];    // satellites up right now, in canvas px

  function computePasses() {
    if (computing) return;
    computing = true;
    var now = Date.now();
    var t0 = now - 25 * 60 * 1000, t1 = now + LOOKAHEAD_H * 3600 * 1000;
    var queue = sats.slice(), found = [];
    (function work() {
      var start = performance.now();
      while (queue.length && performance.now() - start < 14) found = found.concat(predict(queue.shift(), t0, t1));
      if (queue.length) { setTimeout(work, 0); return; }
      passes = found.sort(function (a, b) { return a.aos - b.aos; });
      computing = false;
      renderTable();
      draw();
    })();
  }

  function upcoming() {
    var now = Date.now();
    return passes.filter(function (p) { return p.aos > now && p.maxEl >= MIN_PASS_EL; });
  }
  function currentPass(norad) {
    var now = Date.now();
    for (var i = 0; i < passes.length; i++) {
      var p = passes[i];
      if (p.sat.norad === norad && p.aos <= now && (p.los === null || p.los > now)) return p;
    }
    return null;
  }

  // ------------------------------------------------------------ text output
  function inWords(ms) {
    var m = Math.max(0, Math.round(ms / 60000));
    if (m < 1) return "now";
    if (m < 60) return m + " min";
    return Math.floor(m / 60) + " h " + String(m % 60).padStart(2, "0");
  }
  function countdown(ms) {
    var s = Math.max(0, Math.floor(ms / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(r).padStart(2, "0");
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  var shown = [];
  function renderTable() {
    shown = upcoming().slice(0, 5);
    if (!shown.length) {
      rowsEl.innerHTML = '<tr><td colspan="4">No passes above ' + MIN_PASS_EL + '° in the next ' + LOOKAHEAD_H + ' hours.</td></tr>';
      return;
    }
    var now = Date.now();
    rowsEl.innerHTML = shown.map(function (p, i) {
      var el = Math.round(p.maxEl);
      var low = p.maxEl < FLOOR;
      return '<tr tabindex="0" data-i="' + i + '" aria-label="' + esc(p.sat.name) + ' rises at ' + istHM.format(new Date(p.aos)) + ' IST, maximum elevation ' + el + ' degrees' + (low ? ', below the 25 degree floor' : '') + '">' +
        "<td>" + esc(p.sat.name) + "</td>" +
        "<td>" + istHM.format(new Date(p.aos)) + "</td>" +
        "<td>" + inWords(p.aos - now) + "</td>" +
        '<td class="r' + (low ? " tag-low" : "") + '">' + el + "°" + (low ? " low" : "") + "</td></tr>";
    }).join("");
  }

  rowsEl.addEventListener("pointerover", function (e) { var tr = e.target.closest("tr[data-i]"); if (tr) setPreview(+tr.dataset.i); });
  rowsEl.addEventListener("pointerleave", function () { setPreview(null); });
  rowsEl.addEventListener("focusin", function (e) { var tr = e.target.closest("tr[data-i]"); if (tr) setPreview(+tr.dataset.i); });
  rowsEl.addEventListener("focusout", function () { setPreview(null); });
  function setPreview(i) {
    preview = i === null ? null : shown[i] || null;
    Array.prototype.forEach.call(rowsEl.querySelectorAll("tr"), function (tr) { tr.classList.toggle("is-on", preview !== null && +tr.dataset.i === i); });
    draw();
  }

  function renderAge() {
    var ages = sats.map(function (s) { return (Date.now() - s.epoch) / 864e5; }).sort(function (a, b) { return a - b; });
    var med = ages[Math.floor(ages.length / 2)] || 0;
    var medEpoch = new Date(Date.now() - med * 864e5);
    var days = Math.round(med);
    var what = source === "celestrak" ? "fresh CelesTrak element sets" : "the station’s own element sets";
    ageEl.innerHTML = what + ' <span class="mono">(median epoch ' + dayFmt.format(medEpoch) + ", " + (days <= 0 ? "today" : days + (days === 1 ? " day" : " days") + " old") + ")</span>";
    return med;
  }

  // ------------------------------------------------------------ drawing
  var ctx = canvas.getContext("2d");
  var dpr = 1, size = 0, cx = 0, cy = 0, R = 0;
  var C = {}, hatch = null;

  function readColors() {
    var cs = getComputedStyle(document.documentElement);
    ["ink", "ink-2", "ink-3", "rule", "rule-strong", "mark", "panel", "hatch"].forEach(function (k) { C[k] = cs.getPropertyValue("--" + k).trim(); });
    var p = document.createElement("canvas");
    p.width = p.height = Math.round(6 * dpr);
    var pc = p.getContext("2d");
    pc.strokeStyle = C["ink-3"];
    pc.globalAlpha = 0.55;
    pc.lineWidth = 1 * dpr;
    pc.beginPath();
    pc.moveTo(0, p.height); pc.lineTo(p.width, 0);
    pc.moveTo(-p.width / 2, p.height / 2); pc.lineTo(p.width / 2, -p.height / 2);
    pc.moveTo(p.width / 2, p.height * 1.5); pc.lineTo(p.width * 1.5, p.height / 2);
    pc.stroke();
    hatch = ctx.createPattern(p, "repeat");
  }

  function resize() {
    var r = canvas.getBoundingClientRect();
    if (!r.width) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    size = r.width;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    cx = cy = size / 2;
    R = size / 2 - 26;
    readColors();
    draw();
  }

  function proj(az, el) {
    var r = R * (90 - el) / 90;
    return { x: cx + r * Math.sin(az * D2R), y: cy - r * Math.cos(az * D2R) };
  }

  function mono(px) { return px + "px 'Chivo Mono', ui-monospace, Consolas, monospace"; }

  function polyline(track) {
    ctx.beginPath();
    track.forEach(function (pt, i) { var q = proj(pt.az, pt.el); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
  }

  function draw() {
    if (!size) return;
    var now = new Date();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);

    // below-the-floor annulus
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.arc(cx, cy, R * (90 - FLOOR) / 90, 0, Math.PI * 2, true);
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0); // pattern tiles in device pixels; the path is already placed
    ctx.fillStyle = hatch;
    ctx.fill();
    ctx.restore();

    // rings
    ctx.lineWidth = 1;
    ctx.strokeStyle = C.rule;
    ctx.beginPath(); ctx.arc(cx, cy, R * 30 / 90, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C["ink-2"];
    ctx.beginPath(); ctx.arc(cx, cy, R * (90 - FLOOR) / 90, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = C.ink;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    // azimuth ticks, spokes
    for (var a = 0; a < 360; a += 10) {
      var major = a % 30 === 0;
      var s = Math.sin(a * D2R), c = Math.cos(a * D2R);
      ctx.strokeStyle = major ? C["ink-2"] : C["rule-strong"];
      ctx.beginPath();
      ctx.moveTo(cx + R * s, cy - R * c);
      ctx.lineTo(cx + (R + (major ? 6 : 3)) * s, cy - (R + (major ? 6 : 3)) * c);
      ctx.stroke();
      if (a % 90 === 0) {
        ctx.strokeStyle = C.rule;
        ctx.beginPath(); ctx.moveTo(cx + 4 * s, cy - 4 * c); ctx.lineTo(cx + R * s, cy - R * c); ctx.stroke();
      }
    }
    ctx.fillStyle = C.ink;
    ctx.font = mono(10);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText("N", cx, cy - R - 16);
    ctx.fillText("E", cx + R + 16, cy);
    ctx.fillText("S", cx, cy + R + 16);
    ctx.fillText("W", cx - R - 16, cy);

    // the cable stop at north
    ctx.fillStyle = C.ink;
    ctx.fillRect(cx - 1.5, cy - R - 8, 3, 16);

    // ring labels
    ctx.font = mono(8.5);
    ctx.fillStyle = C["ink-2"];
    ctx.textAlign = "left";
    var lf = proj(152, FLOOR), l60 = proj(152, 60);
    ctx.fillText("25°", lf.x + 4, lf.y);
    ctx.fillText("60°", l60.x + 4, l60.y);

    // zenith
    ctx.strokeStyle = C["ink-2"];
    ctx.beginPath(); ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy); ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4); ctx.stroke();

    // previewed upcoming pass
    if (preview && preview.track.length > 1) {
      ctx.save();
      ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.strokeStyle = C.mark; ctx.lineWidth = 7; polyline(preview.track); ctx.stroke();
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5; ctx.setLineDash([4, 3]); polyline(preview.track); ctx.stroke();
      ctx.setLineDash([]);
      var st = proj(preview.track[0].az, preview.track[0].el);
      var en = proj(preview.track[preview.track.length - 1].az, preview.track[preview.track.length - 1].el);
      ctx.fillStyle = C.ink;
      ctx.beginPath(); ctx.arc(st.x, st.y, 3, 0, Math.PI * 2); ctx.fill();
      ctx.font = mono(9); ctx.textAlign = "center";
      ctx.fillText("RISE " + istHM.format(new Date(preview.aos)), st.x, st.y + (st.y > cy ? 12 : -12));
      ctx.strokeStyle = C.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(en.x, en.y, 3.5, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    // satellites up now, with their pass tracks
    positions = [];
    sats.forEach(function (sat) {
      var p = look(sat.rec, now);
      if (p && p.el > 0) positions.push({ sat: sat, az: p.az, el: p.el, range: p.range, pt: proj(p.az, p.el) });
    });
    positions.sort(function (a, b) { return a.el - b.el; });

    positions.forEach(function (o) {
      var pass = currentPass(o.sat.norad);
      if (!pass || pass.track.length < 2) return;
      var on = hover === o.sat.norad;
      ctx.save();
      ctx.lineJoin = "round"; ctx.lineCap = "round";
      if (on) { ctx.strokeStyle = C.mark; ctx.lineWidth = 6; polyline(pass.track); ctx.stroke(); }
      ctx.strokeStyle = on ? C.ink : C["ink-3"];
      ctx.lineWidth = on ? 1.4 : 0.9;
      ctx.globalAlpha = on ? 1 : 0.7;
      polyline(pass.track); ctx.stroke();
      ctx.restore();
    });

    positions.forEach(function (o) {
      var on = hover === o.sat.norad;
      var up = o.el >= FLOOR;
      if (on) { ctx.fillStyle = C.mark; ctx.beginPath(); ctx.arc(o.pt.x, o.pt.y, 10, 0, Math.PI * 2); ctx.fill(); }
      ctx.lineWidth = 1.6;
      if (up) {
        ctx.fillStyle = C.ink; ctx.beginPath(); ctx.arc(o.pt.x, o.pt.y, 4.2, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.fillStyle = C.panel; ctx.strokeStyle = on ? C.ink : C["ink-2"];
        ctx.beginPath(); ctx.arc(o.pt.x, o.pt.y, 3.6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      if (up || on) {
        ctx.font = mono(9.5);
        ctx.fillStyle = C.ink;
        var right = o.pt.x < cx + R * 0.45;
        ctx.textAlign = right ? "left" : "right";
        ctx.textBaseline = "middle";
        ctx.fillText(o.sat.name, o.pt.x + (right ? 9 : -9), o.pt.y);
      }
    });

    if (!positions.length) {
      ctx.font = mono(9.5); ctx.fillStyle = C["ink-2"]; ctx.textAlign = "center";
      ctx.fillText("NOTHING ON THE WATCH LIST IS UP", cx, cy + 18);
    }

    updateReadouts();
    if (hover !== null) updateTip();
  }

  // ------------------------------------------------------------ readouts
  var lastAria = 0;
  function updateReadouts() {
    var up = positions.length;
    var trackable = positions.filter(function (o) { return o.el >= FLOOR; }).length;
    var next = upcoming()[0];
    countEl.innerHTML = "<b>" + up + "</b> up · <b>" + trackable + "</b> trackable";
    if (nextEl) {
      nextEl.textContent = next
        ? up + " up · next " + next.sat.name + " in " + countdown(next.aos - Date.now())
        : (computing ? "Predicting passes…" : up + " up");
    }
    if (Date.now() - lastAria > 15000) {
      lastAria = Date.now();
      canvas.setAttribute("aria-label", up
        ? up + " tracked satellites above the station's horizon: " + positions.slice().reverse().map(function (o) { return o.sat.name + " at " + Math.round(o.el) + " degrees"; }).join(", ")
        : "No tracked satellites are above the station's horizon right now");
    }
  }

  function updateTip() {
    var o = positions.filter(function (p) { return p.sat.norad === hover; })[0];
    if (!o) { hideTip(); return; }
    var t = Date.now();
    var a = look(o.sat.rec, new Date(t - 1000)), b = look(o.sat.rec, new Date(t + 1000));
    var rr = a && b ? (b.range - a.range) / 2 : 0;           // km/s, + = receding
    var doppler = -rr / C_KMS * S_BAND_HZ / 1000;            // kHz
    var pass = currentPass(o.sat.norad);
    var status = o.el >= FLOOR ? "Trackable" : "Below the 25° floor";
    tip.innerHTML = "<b>" + esc(o.sat.name) + "</b>" +
      row("Azimuth", o.az.toFixed(1) + "°") +
      row("Elevation", o.el.toFixed(1) + "°") +
      row("Range", Math.round(o.range).toLocaleString("en-IN") + " km") +
      row("Doppler @ 2.25 GHz", (doppler >= 0 ? "+" : "−") + Math.abs(doppler).toFixed(1) + " kHz") +
      (pass && pass.los ? row("Sets in", countdown(pass.los - t)) : "") +
      row("Status", status);
    var left = o.pt.x > size * 0.58;
    tip.style.left = o.pt.x + "px";
    tip.style.top = o.pt.y + "px";
    tip.style.transform = left ? "translate(calc(-100% - 14px), -50%)" : "translate(14px, -50%)";
    tip.hidden = false;
  }
  function row(k, v) { return '<div class="row"><span>' + k + "</span><span>" + v + "</span></div>"; }
  function hideTip() { tip.hidden = true; }

  function pick(e) {
    var r = canvas.getBoundingClientRect();
    var x = e.clientX - r.left, y = e.clientY - r.top, best = null, bd = 16;
    positions.forEach(function (o) {
      var d = Math.hypot(o.pt.x - x, o.pt.y - y);
      if (d < bd) { bd = d; best = o.sat.norad; }
    });
    return best;
  }
  canvas.addEventListener("pointermove", function (e) {
    var h = pick(e);
    if (h !== hover) { hover = h; if (h === null) hideTip(); draw(); }
  });
  canvas.addEventListener("pointerleave", function (e) {
    if (e.pointerType === "mouse") { hover = null; hideTip(); draw(); }
  });
  canvas.addEventListener("click", function (e) { hover = pick(e); if (hover === null) hideTip(); draw(); });

  // ------------------------------------------------------------ fresher sets
  function applyTles(map) {
    var changed = false;
    var list = sats.map(function (s) {
      var t = map[s.norad];
      if (t && epochOf(t[0]) > s.epoch) { changed = true; return { norad: s.norad, name: s.name, l1: t[0], l2: t[1] }; }
      return { norad: s.norad, name: s.name, l1: s.l1, l2: s.l2 };
    });
    if (changed) { sats = makeSats(list); source = "celestrak"; }
    return changed;
  }

  function parseTle(text, into) {
    var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);
    for (var i = 0; i + 1 < lines.length; i++) {
      if (lines[i][0] === "1" && lines[i + 1][0] === "2") {
        into[parseInt(lines[i].substr(2, 5), 10)] = [lines[i], lines[i + 1]];
        i++;
      }
    }
  }

  function refreshIfStale(medianAge) {
    if (medianAge < STALE_DAYS || !window.fetch) return;
    try {
      var cached = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
      if (cached && Date.now() - cached.t < 12 * 3600 * 1000) {
        if (applyTles(cached.tles)) { renderAge(); computePasses(); }
        return;
      }
    } catch (e) { /* storage unavailable - fetch instead */ }
    var map = {};
    Promise.all(GROUPS.map(function (g) {
      return fetch("https://celestrak.org/NORAD/elements/gp.php?GROUP=" + g + "&FORMAT=TLE")
        .then(function (r) { return r.ok ? r.text() : ""; })
        .then(function (t) { parseTle(t, map); })
        .catch(function () {});
    })).then(function () {
      if (!Object.keys(map).length) return;          // offline: keep the bundle, say how old it is
      try { localStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), tles: map })); } catch (e) {}
      if (applyTles(map)) { renderAge(); computePasses(); }
    });
  }

  // ------------------------------------------------------------ go
  if ("ResizeObserver" in window) new ResizeObserver(resize).observe(canvas);
  else window.addEventListener("resize", resize);
  resize();

  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  var recolor = function () { readColors(); draw(); };
  if (mq.addEventListener) mq.addEventListener("change", recolor);
  document.addEventListener("themechange", recolor);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);

  refreshIfStale(renderAge());
  computePasses();
  setInterval(draw, 1000);
  setInterval(function () { renderTable(); }, 30 * 1000);
  setInterval(computePasses, 10 * 60 * 1000);
})();
