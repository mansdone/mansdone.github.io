(function () {
  "use strict";

  // ------------------------------------------------------------ theme
  var root = document.documentElement;
  var toggle = document.getElementById("theme-toggle");
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  function isDark() {
    var t = root.getAttribute("data-theme");
    return t ? t === "dark" : mq.matches;
  }
  function label() { if (toggle) toggle.textContent = isDark() ? "Day" : "Night"; }
  if (toggle) {
    toggle.addEventListener("click", function () {
      var next = isDark() ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("mjs-theme", next); } catch (e) {}
      label();
      document.dispatchEvent(new Event("themechange"));
    });
  }
  if (mq.addEventListener) mq.addEventListener("change", label);
  label();

  // ------------------------------------------------------------ evidence grid
  var cols = [
    ["Ground station", "#case-station"], ["Wildfire", "#case-wildfire"], ["Urdu ASR", "#case-asr"],
    ["ASCEND", "#case-ascend"], ["Job Hunt", "#case-jobs"], ["Crime Risk"], ["Data Quality"],
    ["MediBot"], ["Hostel"], ["Ryzklytix", "#log"]
  ];
  // one letter per column, in the order above: G W U A J C D M H R
  var rows = [
    ["Python", "GWUJCDM"],
    ["TypeScript", "A"],
    ["JavaScript · Node.js", "DHR"],
    ["React · Next.js", "ADR"],
    ["SQL — Postgres, MySQL, SQLite", "AJH"],
    ["Java · Spring Boot", "H"],
    ["REST APIs — Flask, FastAPI, Express", "GJHR"],
    ["PyTorch", "WU"],
    ["Hugging Face Transformers", "U"],
    ["scikit-learn · XGBoost", "WC"],
    ["Pandas · NumPy", "GWCD"],
    ["Orbital & geospatial maths", "GW"],
    ["Signal processing — FFT, Welch", "G"],
    ["ROS2 · Nav2 · SLAM", "M"],
    ["Validation & testing", "GWUAJ"],
    ["Shipped for others to use", "UACR"]
  ];
  var keys = "GWUAJCDMHR";
  var head = document.getElementById("ev-head");
  var body = document.getElementById("ev-body");
  if (head && body) {
    head.innerHTML = "<tr><th scope=\"col\"><span class=\"label\">Skill</span></th>" + cols.map(function (c) {
      return "<th scope=\"col\">" + (c[1] ? "<a href=\"" + c[1] + "\">" + c[0] + "</a>" : c[0]) + "</th>";
    }).join("") + "</tr>";
    body.innerHTML = rows.map(function (r) {
      return "<tr><th scope=\"row\">" + r[0] + "</th>" + keys.split("").map(function (k, i) {
        return r[1].indexOf(k) > -1 ? "<td><span role=\"img\" aria-label=\"Used in " + cols[i][0] + "\"></span></td>" : "<td></td>";
      }).join("") + "</tr>";
    }).join("");
  }

  // ------------------------------------------------------------ element-set signature
  var pre = document.getElementById("tle");
  var decode = document.getElementById("tle-decode");
  var result = document.getElementById("tle-result");
  if (!pre) return;

  var ENROLLED = Date.UTC(2023, 7, 1);

  function epochField(d) {
    var y = d.getUTCFullYear();
    var doy = (d - Date.UTC(y, 0, 1)) / 864e5 + 1;
    return String(y % 100).padStart(2, "0") + doy.toFixed(8).padStart(12, "0");
  }
  function revField(d) { return String(Math.floor((d - ENROLLED) / 864e5) % 100000).padStart(5, " "); }
  function digitSum(s) {
    var sum = 0;
    for (var i = 0; i < 68 && i < s.length; i++) {
      var ch = s[i];
      if (ch >= "0" && ch <= "9") sum += +ch;
      else if (ch === "-") sum += 1;
    }
    return sum;
  }

  var now = new Date();
  var lines = [
    [["0 MOHAMMED JAWWAAD SHERIFF", "Line zero: the name, written the way SatNOGS writes it."]],
    [
      ["1", "Line number."], [" "],
      ["27001", "Catalogue number. 27, for the class of 2027."],
      ["U", "Classification: U, unclassified. Everything on this page is public."], [" "],
      ["23PESA  ", "International designator: launched 2023, from PES University, piece A."], [" "],
      [epochField(now), "Epoch: this second, as you read it. The checksum is recomputed with it.", "epoch"], [" "],
      [" .00000000", "First derivative of mean motion: zero. No orbital decay planned."], [" "],
      [" 00000-0", "Second derivative of mean motion: also zero."], [" "],
      [" 00000-0", "B* drag term: zero."], [" "],
      ["0", "Ephemeris type 0: SGP4, the model the sky plot at the top of this page runs."], [" "],
      ["   1", "Element set number: this is version 1 of the site."],
      ["", "Checksum: every digit on the line summed, a minus sign counting as 1, modulo 10.", "cs"]
    ],
    [
      ["2", "Line number."], [" "],
      ["27001", "Catalogue number, repeated."], [" "],
      [" 12.9500", "Inclination field, holding the station’s latitude: 12.9500° N."], [" "],
      [" 77.6670", "Right ascension field, holding the station’s longitude: 77.6670° E."], [" "],
      ["0000888", "Eccentricity field (decimal point assumed), holding the station’s altitude: 888 m."], [" "],
      [" 25.0000", "Argument of perigee, holding the dish’s 25° elevation floor."], [" "],
      ["185.0000", "Mean anomaly, holding the elevation axis’s full travel: 185°, past zenith."], [" "],
      [" 1.00273791", "Mean motion: 1.0027 revolutions a day, which is geosynchronous. Based in Bengaluru; happy to relocate."],
      [revField(now), "Revolution number: days since I started at PES University.", "rev"],
      ["", "Checksum: every digit on the line summed, modulo 10.", "cs"]
    ]
  ];

  var live = { epoch: null, rev: null, cs: [] };
  pre.textContent = "";
  lines.forEach(function (fields, li) {
    var col = 1;
    fields.forEach(function (f) {
      var text = f[0];
      if (f[2] === "cs") text = "0";
      var node;
      if (f[1]) {
        node = document.createElement("span");
        node.tabIndex = 0;
        node.dataset.note = f[1];
        node.dataset.cols = li === 0 ? "" : (text.length > 1 ? pad2(col) + "–" + pad2(col + text.length - 1) : pad2(col));
        node.textContent = text;
        if (f[2] === "epoch") live.epoch = node;
        if (f[2] === "rev") live.rev = node;
        if (f[2] === "cs") live.cs[li] = node;
      } else {
        node = document.createTextNode(text);
      }
      pre.appendChild(node);
      col += text.length;
    });
    if (li < lines.length - 1) pre.appendChild(document.createTextNode("\n"));
  });
  function pad2(n) { return String(n).padStart(2, "0"); }

  // read the line back from the DOM, so the checksum is computed on exactly what's shown
  function lineText(li) { return pre.textContent.split("\n")[li] || ""; }
  function update() {
    var d = new Date();
    live.epoch.textContent = epochField(d);
    live.rev.textContent = revField(d);
    [1, 2].forEach(function (li) {
      live.cs[li].textContent = String(digitSum(lineText(li)) % 10);
    });
  }
  update();
  setInterval(update, 1000);

  function show(el) {
    var cols = el.dataset.cols ? '<span class="mono">COLS ' + el.dataset.cols + " · “" + el.textContent.trim() + "”</span><br>" : "";
    decode.innerHTML = cols + el.dataset.note;
  }
  pre.addEventListener("mouseover", function (e) { if (e.target.dataset && e.target.dataset.note) show(e.target); });
  pre.addEventListener("focusin", function (e) { if (e.target.dataset && e.target.dataset.note) show(e.target); });

  var verify = document.getElementById("tle-verify");
  if (verify) {
    verify.addEventListener("click", function () {
      var parts = [1, 2].map(function (li) {
        var text = lineText(li);
        var sum = digitSum(text);
        var ok = sum % 10 === +text[68];
        live.cs[li].classList.add("is-on");
        return "Line " + li + ": digits sum to " + sum + " → " + (sum % 10) + (ok ? " ✓" : " ✗");
      });
      result.textContent = parts.join("   ·   ");
      setTimeout(function () { live.cs.forEach(function (n) { if (n) n.classList.remove("is-on"); }); }, 1800);
    });
  }
})();
