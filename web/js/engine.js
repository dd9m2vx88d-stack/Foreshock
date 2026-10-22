/* ============================================================================
   FORESHOCK ENGINE: the whole simulation, running in the browser.
   A port of generate_data.py + detect.py + detect_hourly.py.
     1. simulate(S)   -> 30 days of pharmacy sales, clinic visits, shelf stock
     2. detectDaily   -> Normal / Watch / Yellow / Red per area, group and day
     3. detectHourly  -> the same check every hour, supply warnings, spread
   S = the settings chosen on the Simulation screen (see ENGINE.DEFAULTS).
   ========================================================================== */
const ENGINE = (() => {
  "use strict";
  const MEDICINES = [ // name, illness group, boxes an average area sells on a normal day
    ["Paracetamol", "Fever / flu", 40], ["Cold & Flu paracetamol", "Fever / flu", 20],
    ["Zomax", "Throat / chest", 8], ["Amoxicillin", "Throat / chest", 12],
    ["Flagyl", "Stomach", 6], ["Protogyn", "Stomach", 4], ["ORS", "Stomach", 7],
    ["Onda", "Stomach", 3], ["Clopram", "Stomach", 5], ["Scabies cream", "Skin", 2]];
  const SYMPTOMS = [ // clinic visits per symptom on a normal day
    ["Diarrhea / vomiting", "Stomach", 6], ["Fever / flu", "Fever / flu", 14],
    ["Sore throat / chest", "Throat / chest", 10], ["Rash / itching", "Skin", 2]];
  const GROUPS = ["Stomach", "Fever / flu", "Throat / chest", "Skin"];
  const DAYS = 30, START = Date.UTC(2026, 8, 2);           // day 1 = Wed 2 Sep 2026
  const WAVE_SHAPE = [1.6, 2.3, 3.0, 3.4, 3.1, 2.5, 1.9, 1.5, 1.2]; // a stomach-flu wave, peak 3.4x
  const VALLEY = new Set(["Shuna al-Jabiniyya", "Dair Alla", "Al-Aghwar Shamaliyyeh", "Al-Safi", "Wadi Araba"]);
  const DESERT = new Set(["Al-Azraq", "Ar-Ruwayshid", "Sabha", "Sama as-Sarhan", "Al-Muwaqqar", "Al-Jizah", "Al-Quwayra", "Al-Husanyniyya"]);
  const HEATWAVE = { 22: 4, 23: 6, 24: 6, 25: 3 };       // extra degrees, Aqaba + Jordan Valley
  const PHARM_HOURS = [1, .6, .4, .3, .3, .4, .8, 1.5, 3, 4.5, 5.5, 6, 6, 5.5, 5, 5, 5.5, 6.5, 7.5, 8, 8, 7, 5, 2.5];
  const FRI_HOURS = [1, .6, .4, .3, .3, .3, .4, .6, 1, 1.5, 2, 2.5, 2, 2, 4, 6, 7.5, 8.5, 9.5, 10, 10, 9, 7, 3.5];
  const CLINIC_HOURS = [.8, .5, .4, .3, .3, .4, .8, 3, 7, 9, 9.5, 9, 8, 7, 7, 7, 6.5, 6, 5, 4, 3, 2.5, 2, 1.2];
  const DEFAULTS = { outbreak: true, area: "Jubeiha", group: "Stomach", start: 14, peak: 3.4, delay: 2,
    trap: true, trapDay: 12, payday: true, heatwave: true, aware: true, alert: 3.0, seed: 2026 };

  /* ---------- seeded random numbers (same seed = same world) ---------- */
  function hash(str) {          // cyrb53 -> 32-bit seed
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (h1 ^ h2) >>> 0;
  }
  function rng(str) {           // mulberry32
    let a = hash(str);
    const r = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    r.gauss = (mu, sd) => { let u = 0; while (u === 0) u = r(); return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * r()); };
    return r;
  }
  function poisson(mean, r) {   // a random whole number around `mean`, like real daily counts
    if (mean > 60) return Math.max(0, Math.round(r.gauss(mean, Math.sqrt(mean))));
    const L = Math.exp(-mean); let k = 0, p = 1;
    for (;;) { p *= r(); if (p <= L) return k; k++; }
  }
  const r1 = (x) => Math.round(x * 10) / 10, r2 = (x) => Math.round(x * 100) / 100;

  /* ---------- calendar ---------- */
  const dateOf = (d) => new Date(START + (d - 1) * 864e5);
  const jsDay = (d) => dateOf(d).getUTCDay();                 // 0 Sunday ... 5 Friday, 6 Saturday
  const WD = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dayType = (d) => jsDay(d) === 5 ? "Friday" : jsDay(d) === 6 ? "Saturday" : "Weekday";

  /* ======================= 1. SIMULATE ======================= */
  function simulate(S, units) {
    const sizes = Object.fromEntries(units.map(u => [u.name, u.size]));
    const areas = units.map(u => u.name);
    // weather, pharmacies, payday
    const temps = {}, pharmacies = {};
    for (const u of units) {
      const r = rng(`weather-${S.seed}-${u.name}`);
      const hot = VALLEY.has(u.name) || u.gov === "Aqaba";
      const base = hot ? 38.5 : DESERT.has(u.name) ? 36.0 : 31.5;
      temps[u.name] = [];
      for (let d = 1; d <= DAYS; d++) temps[u.name].push(r1(base - 0.08 * d + (r() * 2.4 - 1.2) + (S.heatwave && hot ? (HEATWAVE[d] || 0) : 0)));
      pharmacies[u.name] = Math.max(3, Math.round(u.size * 30));
    }
    const calendar = S.payday ? { 30: { name: "Payday (1 Oct)", name_ar: "يوم صرف الرواتب", factor: 1.25 } } : {};
    if (S.eid) {   // optional Eid in the demo story: shopping the day before, quieter holiday after
      calendar[25] = { name: "Eve of Eid (shopping)", name_ar: "قبل العيد (تسوّق)", factor: 1.3 };
      for (const d of [26, 27, 28]) calendar[d] = { name: `Eid holiday (day ${d - 25})`, name_ar: `عطلة العيد (اليوم ${d - 25})`, factor: 0.7 };
    }
    // the outbreak wave: pharmacies first, clinics `delay` days later
    const pw = {}, cw = {};
    if (S.outbreak) WAVE_SHAPE.forEach((b, i) => {
      const m = 1 + (b - 1) / 2.4 * (S.peak - 1), d = S.start + i;
      if (d <= DAYS) pw[d] = m;
      if (d + S.delay <= DAYS) cw[d + S.delay] = m;
    });
    const outbreakFactor = (area, group, day, name, wave) => {
      if (!S.outbreak || area !== S.area) return 1;
      const m = wave[day] || 1;
      if (group === S.group) return 1 + (m - 1) * (name === "Protogyn" ? 0.4 : 1);   // Protogyn: also sold for other reasons
      if (S.group === "Stomach" && name === "Paracetamol") return 1 + (m - 1) * 0.15; // stomach flu brings some fever
      return 1;
    };
    const heat = (t) => 1 + 0.08 * Math.max(0, t - 36);
    const R = Object.fromEntries(areas.map(a => [a, rng(`${S.seed}-${a}`)]));
    const pharm = {}, clinic = {};                    // "area|name" -> counts by day (index 1..30)
    for (const a of areas) { for (const [m] of MEDICINES) pharm[a + "|" + m] = new Array(DAYS + 1).fill(0); for (const [s] of SYMPTOMS) clinic[a + "|" + s] = new Array(DAYS + 1).fill(0); }
    for (let day = 1; day <= DAYS; day++) {
      const wd = jsDay(day);
      for (const a of areas) {
        const size = sizes[a];
        for (const [m, g, normal] of MEDICINES) {
          let mean = normal * size;
          if (wd === 5) mean *= 0.6;                  // Friday: many pharmacies closed or open late
          if (wd === 6) mean *= 0.9;                  // Saturday: a bit quieter
          if (g === "Fever / flu") mean *= 1 + 0.01 * (day - 1);   // flu season slowly starting
          mean *= outbreakFactor(a, g, day, m, pw);
          if (S.trap && a === S.area && day === S.trapDay && m === "Paracetamol") mean *= 1.4;  // the trap
          if (calendar[day]) mean *= calendar[day].factor;
          if (m === "ORS") mean *= heat(temps[a][day - 1]);
          pharm[a + "|" + m][day] = poisson(mean, R[a]);
        }
        for (const [s, g, normal] of SYMPTOMS) {
          let mean = normal * size * (wd === 5 ? 0.85 : 1);
          if (g === "Fever / flu") mean *= 1 + 0.01 * (day - 1);
          mean *= outbreakFactor(a, g, day, s, cw);
          clinic[a + "|" + s][day] = poisson(mean, R[a]);
        }
      }
    }
    // shelf stock: every Sunday the distributor tops shelves up to 10 days of normal sales
    const stock = {};
    for (const a of areas) for (const [m, , normal] of MEDICINES) {
      const full = Math.round(normal * sizes[a] * 10); let level = full; const arr = new Array(DAYS + 1).fill(0);
      for (let d = 1; d <= DAYS; d++) { if (jsDay(d) === 0) level = Math.max(level, full); level = Math.max(0, level - pharm[a + "|" + m][d]); arr[d] = level; }
      stock[a + "|" + m] = { full, levels: arr };
    }
    return { S, areas, pharm, clinic, stock, ctx: { calendar, temps, pharmacies, heat: { medicine: "ORS", per_degree: 0.08, above: 36 } } };
  }

  /* ======================= 2. DAILY DETECTOR ======================= */
  function detectDaily(sim, opts) {
    const { aware, alert } = opts;
    const WATCH = 2.0, ALERT = alert, SOLO = alert + 1, GUARD = 2, MIN_HIST = 7, RED_WINDOW = 3, LOOKBACK = 14, MIN_EXTRA = 5;
    const { areas, pharm, clinic, ctx } = sim;
    const known = (area, name, day) => {
      if (!aware) return 1;
      let f = ctx.calendar[day]?.factor || 1;
      if (name === "ORS") f *= 1 + 0.08 * Math.max(0, ctx.temps[area][day - 1] - 36);
      return f;
    };
    // how much quieter Fridays / Saturdays are, learned from the whole country, days already seen
    const learn = (series) => {
      const per = { Weekday: [], Friday: [], Saturday: [] };
      const tot = new Array(DAYS + 1).fill(0); const n = Object.keys(series).length;
      for (const arr of Object.values(series)) for (let d = 1; d <= DAYS; d++) tot[d] += arr[d];
      return (before) => {
        const T = { Weekday: 0, Friday: 0, Saturday: 0 }, C = { Weekday: 0, Friday: 0, Saturday: 0 };
        for (let d = 1; d < before; d++) { T[dayType(d)] += tot[d]; C[dayType(d)] += n; }
        const base = T.Weekday / Math.max(C.Weekday, 1), out = {};
        for (const t of ["Weekday", "Friday", "Saturday"]) out[t] = C[t] && base ? (T[t] / C[t]) / base : 1;
        return out;
      };
    };
    const csumAll = {};
    for (const a of areas) for (const g of GROUPS) {
      const arr = new Array(DAYS + 1).fill(0);
      for (const [s, sg] of SYMPTOMS) if (sg === g) for (let d = 1; d <= DAYS; d++) arr[d] += clinic[a + "|" + s][d];
      csumAll[a + "|" + g] = arr;
    }
    const pF = learn(pharm), cF = learn(csumAll);
    const wobbles = (arr, day, factors, flagged, kn) => {
      const past = [];
      for (let d = Math.max(1, day - GUARD - LOOKBACK); d < day - GUARD; d++) if (!flagged.has(d)) past.push(arr[d] / factors[dayType(d)] / kn(d));
      if (past.length < MIN_HIST) return null;
      const normal = past.reduce((s, x) => s + x, 0) / past.length;
      const spread = Math.sqrt(past.reduce((s, x) => s + (x - normal) ** 2, 0) / (past.length - 1));
      const f = factors[dayType(day)] * kn(day), expected = normal * f;
      const wobble = Math.max(spread * f, Math.sqrt(Math.max(expected, 1)), 1);
      return { z: (arr[day] - expected) / wobble, expected, wobble };
    };
    const flagged = {}, lastYellow = {}, det = {};
    const fl = (k) => flagged[k] || (flagged[k] = new Set());
    for (let day = 1; day <= DAYS; day++) {
      const pf = pF(day), cf = cF(day);
      for (const a of areas) for (const g of GROUPS) {
        const meds = MEDICINES.filter(m => m[1] === g).map(m => m[0]);
        const scores = {};
        for (const m of meds) {
          const k = a + "|" + m, arr = pharm[k];
          const w = wobbles(arr, day, pf, fl(k), (d) => known(a, m, d));
          if (!w) continue;
          scores[m] = { z: r1(w.z), sold: arr[day], expected: r1(w.expected), extra: r1(arr[day] - w.expected), wobble: r2(w.wobble), adjusted: r2(known(a, m, day)) };
          if (w.z >= ALERT && arr[day] - w.expected >= MIN_EXTRA) fl(k).add(day);
        }
        const ck = a + "|" + g, carr = csumAll[ck];
        const cw = wobbles(carr, day, cf, fl(ck + "|CLINIC"), () => 1);
        if (cw && cw.z >= ALERT) fl(ck + "|CLINIC").add(day);
        if (!Object.keys(scores).length) continue;
        let high = Object.entries(scores).filter(([, v]) => v.z >= ALERT && v.extra >= MIN_EXTRA).map(([m]) => m);
        const need = meds.length >= 2 ? 2 : 1;
        if (meds.length === 1) high = high.filter(m => scores[m].z >= SOLO);   // nothing to cross-check: demand more
        let level = "Normal";
        if (Object.values(scores).some(v => v.z >= WATCH)) level = "Watch";
        if (high.length >= need) { level = "Yellow"; lastYellow[ck] = day; }
        const recent = lastYellow[ck] != null && day - lastYellow[ck] <= RED_WINDOW;
        if (recent && cw && cw.z >= ALERT && carr[day] - cw.expected >= MIN_EXTRA) level = "Red";
        (det[ck] || (det[ck] = {}))[day] = { level, high, meds: scores,
          clinic: { z: cw ? r1(cw.z) : null, visits: carr[day], expected: cw && cw.expected ? r1(cw.expected) : null, wobble: cw ? r2(cw.wobble) : null } };
      }
    }
    return { det, csumAll };
  }

  /* ======================= 3. HOURLY DETECTOR, SUPPLY, SPREAD ======================= */
  const cumulative = (p) => { const t = p.reduce((s, x) => s + x, 0); let c = 0; const out = p.map(x => (c += x / t)); out[23] = 1; return out; };
  const CUM_P = cumulative(PHARM_HOURS), CUM_F = cumulative(FRI_HOURS), CUM_C = cumulative(CLINIC_HOURS);
  function split(total, cum, r) {             // hand out a day's sales to the 24 hours
    const counts = new Array(24).fill(0);
    for (let i = 0; i < total; i++) { const x = r(); let h = 0; while (h < 23 && x > cum[h]) h++; counts[h]++; }
    return counts;
  }
  function detectHourly(sim, daily, opts, neighbors) {
    const ALERT = opts.alert + 0.5, SOLO = opts.alert + 1.5, WATCH = 2.0, MIN_EXTRA = 5, RED_WINDOW = 3, MIN_SHARE = 0.25, HOLD = 2, MIN_RATE = 3;
    const { areas, pharm, stock, S } = sim, { det, csumAll } = daily;
    const firstDay = Math.min(...Object.values(det).flatMap(o => Object.keys(o).map(Number)));
    const hourly = {}, chourly = {};
    for (const a of areas) for (let d = firstDay; d <= DAYS; d++) {
      const cum = jsDay(d) === 5 ? CUM_F : CUM_P;
      for (const [m] of MEDICINES) hourly[`${a}|${m}|${d}`] = split(pharm[a + "|" + m][d], cum, rng(`h-${S.seed}-${a}-${m}-${d}`));
      for (const g of GROUPS) chourly[`${a}|${g}|${d}`] = split(csumAll[a + "|" + g][d], CUM_C, rng(`c-${S.seed}-${a}-${g}-${d}`));
    }
    const prefix = (arr) => { const o = []; let s = 0; for (const v of arr) o.push(s += v); return o; };
    const levels = {}, firstAlert = {}, lastYellowDay = {};
    const ORDER = "NWYR";
    for (const a of areas) for (const g of GROUPS) {
      const key = a + "|" + g, meds = MEDICINES.filter(m => m[1] === g).map(m => m[0]);
      let out = "";
      for (let d = firstDay; d <= DAYS; d++) {
        const dl = det[key]?.[d], prev = det[key]?.[d - 1];
        const carry = prev && "YR".includes(prev.level[0]) ? prev.level[0] : "N";
        const cum = jsDay(d) === 5 ? CUM_F : CUM_P;
        const pre = Object.fromEntries(meds.map(m => [m, prefix(hourly[`${a}|${m}|${d}`])]));
        const cpre = prefix(chourly[`${a}|${g}|${d}`]);
        const streak = { Y: 0, R: 0 }; let peak = "N";
        for (let h = 0; h < 24; h++) {
          const F = cum[h], Fc = CUM_C[h];
          let lvl = "N";
          if (dl && F >= MIN_SHARE) {
            const high = []; let watch = false;
            for (const m of meds) {
              const info = dl.meds[m]; if (!info) continue;
              const soFar = pre[m][h], exp = info.expected * F;
              const wob = Math.max(info.wobble * Math.sqrt(F), Math.sqrt(Math.max(exp, 1)), 1);
              const z = (soFar - exp) / wob;
              if (z >= (meds.length === 1 ? SOLO : ALERT) && soFar - exp >= MIN_EXTRA) high.push(m);
              if (z >= WATCH) watch = true;
            }
            if (watch) lvl = "W";
            const yellowNow = high.length >= (meds.length >= 2 ? 2 : 1);
            if (yellowNow) lvl = "Y";
            const c = dl.clinic;
            if (c.expected != null) {
              const cexp = c.expected * Fc, cwob = Math.max(c.wobble * Math.sqrt(Fc), Math.sqrt(Math.max(cexp, 1)), 1);
              const cz = (cpre[h] - cexp) / cwob;
              const recent = yellowNow || (lastYellowDay[key] != null && d - lastYellowDay[key] <= RED_WINDOW);
              if (recent && cz >= ALERT && cpre[h] - cexp >= MIN_EXTRA) lvl = "R";
            }
          }
          // checking 24 times a day: a new alert must hold for 2 hours in a row
          const raw = lvl;
          for (const L of "YR") streak[L] = ORDER.indexOf(raw) >= ORDER.indexOf(L) ? streak[L] + 1 : 0;
          if (raw === "R" && streak.R < HOLD) lvl = streak.Y >= HOLD ? "Y" : "W";
          else if (raw === "Y" && streak.Y < HOLD) lvl = "W";
          if (ORDER.indexOf(peak) > ORDER.indexOf(lvl) && "YR".includes(peak)) lvl = peak;   // once raised today, it stays until the midnight verdict
          if (ORDER.indexOf(lvl) > ORDER.indexOf(peak)) peak = lvl;
          if (h === 23 && dl) lvl = dl.level[0];                       // midnight: the full-day verdict
          if (ORDER.indexOf(carry) > ORDER.indexOf(lvl) && h < 23) lvl = carry;  // yesterday's alert stays
          out += lvl;
          if ("YR".includes(lvl)) {
            const fa = firstAlert[key] || (firstAlert[key] = {});
            if (!fa[lvl]) fa[lvl] = [d, h];
            if (lvl === "R" && !fa.Y) fa.Y = [d, h];
          }
        }
        if (dl && "YR".includes(dl.level[0])) lastYellowDay[key] = d;
      }
      levels[key] = out;
    }
    // supply: days of stock left, warning when shelves empty before the Sunday delivery
    const supply = {}, supplyAlerts = [];
    for (const a of areas) for (const [m] of MEDICINES) {
      const k = a + "|" + m, st = stock[k]; supply[k] = {};
      for (let d = 1; d <= DAYS; d++) {
        const boxes = st.levels[d], rec = [pharm[k][d]]; if (d > 1) rec.push(pharm[k][d - 1]);
        const rate = Math.max(rec.reduce((s, x) => s + x, 0) / rec.length, 0.5), left = boxes / rate;
        const py = (jsDay(d) + 6) % 7, ttd = ((6 - py) % 7) || 7;
        const warn = d >= firstDay && rate >= MIN_RATE && left < 1 && ttd >= 2;
        supply[k][d] = [boxes, st.full, r1(left), warn ? 1 : 0];
        if (warn) supplyAlerts.push({ day: d, area: a, medicine: m, boxes, days_left: r1(left), delivery_in: ttd, send: Math.max(0, Math.round(rate * (ttd + 1) - boxes)) });
      }
    }
    return { first_day: firstDay, levels, first_alert: firstAlert, hourly, clinic_hourly: chourly,
      cum: { weekday: CUM_P, friday: CUM_F, clinic: CUM_C }, supply, supply_alerts: supplyAlerts, neighbors };
  }

  /* ---------- neighbors: the 5 closest areas within 45 km ---------- */
  function neighborsOf(units, geo) {
    const pts = {};
    for (const u of units) if (u.kind === "neighborhood") pts[u.name] = [u.lng, u.lat];
    for (const d of geo.districts) if (units.some(u => u.name === d.name)) pts[d.name] = d.pt;
    const km = (p, q) => Math.hypot((p[0] - q[0]) * 94.5, (p[1] - q[1]) * 111.0);
    const out = {};
    for (const u of units) out[u.name] = units.filter(v => v.name !== u.name).map(v => [km(pts[u.name], pts[v.name]), v.name])
      .sort((x, y) => x[0] - y[0]).slice(0, 5).filter(x => x[0] < 45).map(x => x[1]);
    return out;
  }

  /* ---------- score one run: did it catch the outbreak, and how many false alarms? ---------- */
  function score(S, live, dailyUnaware, dailyAware) {
    const key = S.area + "|" + S.group, fa = S.outbreak ? (live.first_alert[key] || {}) : {};
    const t0 = (S.start - 1) * 24;
    const hrs = (x) => x ? (x[0] - 1) * 24 + x[1] - t0 : null;
    const others = Object.entries(live.first_alert).filter(([k]) => !S.outbreak || k !== key);
    // alerts a calendar-blind detector raises that the aware one does not (e.g. payday)
    const dayAlerts = (det) => { const s = new Set(); for (const [k, o] of Object.entries(det)) for (const [d, v] of Object.entries(o)) if (v.level === "Yellow" || v.level === "Red") s.add(k + "|" + d); return s; };
    let contextSaves = [];
    if (dailyUnaware) {
      const A = dayAlerts(dailyAware.det), U = dayAlerts(dailyUnaware.det);
      contextSaves = [...U].filter(x => !A.has(x) && !(S.outbreak && x.startsWith(key + "|"))).map(x => x.split("|")[0]);
      contextSaves = [...new Set(contextSaves)];
    }
    let trap = null;
    if (S.trap) { const v = dailyAware.det[S.area + "|Fever / flu"]?.[S.trapDay]; trap = v ? !(v.level === "Yellow" || v.level === "Red") : true; }
    return { key, yellow: fa.Y || null, red: fa.R || null, yellowAfter: hrs(fa.Y), redAfter: hrs(fa.R),
      lead: fa.Y && fa.R ? hrs(fa.R) - hrs(fa.Y) : null,
      falseYellow: others.filter(([, v]) => v.Y).map(([k]) => k), falseRed: others.filter(([, v]) => v.R).map(([k]) => k),
      trapIgnored: trap, contextSaves };
  }

  /* ---------- everything the dashboard needs ---------- */
  function run(settings, units, geo, extras) {
    const S = Object.assign({}, DEFAULTS, settings);
    const sim = simulate(S, units);
    const daily = detectDaily(sim, { aware: S.aware, alert: S.alert });
    const unaware = S.aware ? detectDaily(sim, { aware: false, alert: S.alert }) : null;
    const nb = extras.neighbors || (extras.neighbors = neighborsOf(units, geo));
    const live = detectHourly(sim, daily, { alert: S.alert }, nb);
    const days = Array.from({ length: DAYS }, (_, i) => i + 1);
    const series = {}, det = {};
    for (const a of sim.areas) for (const g of GROUPS) {
      const k = a + "|" + g, meds = MEDICINES.filter(m => m[1] === g).map(m => m[0]);
      series[k] = { p: days.map(d => meds.reduce((s, m) => s + sim.pharm[a + "|" + m][d], 0)), c: days.map(d => daily.csumAll[k][d]) };
      const o = daily.det[k] || {}; det[k] = {};
      for (const [d, x] of Object.entries(o)) det[k][d] = { l: x.level[0], h: x.high,
        m: Object.fromEntries(Object.entries(x.meds).map(([n, v]) => [n, [v.sold, v.expected, v.z, v.wobble, v.adjusted]])),
        ep: r1(Object.values(x.meds).reduce((s, v) => s + v.expected, 0)), cz: x.clinic.z, ec: x.clinic.expected };
    }
    return {
      scenario: S, result: score(S, live, unaware, daily), units, geo,
      days, weekday: days.map(d => WD[jsDay(d)]), date: days.map(d => dateOf(d).toISOString().slice(0, 10)),
      series, det, live, ctx: sim.ctx, raw: sim,
      medGroup: Object.fromEntries(MEDICINES.map(m => [m[0], m[1]])),
      ...extras.static,
    };
  }

  /* ---------- spreadsheet export ---------- */
  function csv(sim, kind) {
    const rows = [];
    const q = (s) => /[",]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s;
    const dstr = (d) => dateOf(d).toISOString().slice(0, 10);
    if (kind === "pharmacy") { rows.push("Day,Date,Weekday,Area,Illness group,Medicine,Boxes sold");
      for (let d = 1; d <= DAYS; d++) for (const a of sim.areas) for (const [m, g] of MEDICINES) rows.push([d, dstr(d), WD[jsDay(d)], q(a), q(g), q(m), sim.pharm[a + "|" + m][d]].join(",")); }
    if (kind === "clinic") { rows.push("Day,Date,Weekday,Area,Illness group,Symptom,Visits");
      for (let d = 1; d <= DAYS; d++) for (const a of sim.areas) for (const [s, g] of SYMPTOMS) rows.push([d, dstr(d), WD[jsDay(d)], q(a), q(g), q(s), sim.clinic[a + "|" + s][d]].join(",")); }
    if (kind === "stock") { rows.push("Day,Area,Medicine,Boxes on shelf (end of day),Full shelf");
      for (const a of sim.areas) for (const [m] of MEDICINES) for (let d = 1; d <= DAYS; d++) rows.push([d, q(a), q(m), sim.stock[a + "|" + m].levels[d], sim.stock[a + "|" + m].full].join(",")); }
    return "﻿" + rows.join("\r\n");
  }

  return { run, csv, DEFAULTS, GROUPS, DAYS };
})();
