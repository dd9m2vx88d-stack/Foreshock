/* ============================================================================
   FORESHOCK APP: the Simulation screen. Pick a world, run it, open the map.
   ========================================================================== */
(() => {
  "use strict";
  const UNITS = window.FS_UNITS, GEO = window.FS_GEO, EXTRAS = { static: window.FS_STATIC };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const KEY = "foreshock-settings-v1";
  let S = Object.assign({}, ENGINE.DEFAULTS), DATA = null, stress = null, lang = "en";
  try { const saved = JSON.parse(localStorage.getItem(KEY) || "null"); if (saved) S = Object.assign(S, saved); } catch (e) { /* storage blocked: start from the defaults */ }
  if (!UNITS.some(u => u.name === S.area)) S.area = ENGINE.DEFAULTS.area;

  const AR_G = { "Stomach": "المعدة", "Fever / flu": "حرارة / إنفلونزا", "Throat / chest": "الحلق / الصدر", "Skin": "الجلد" };
  const L = {
    en: {
      title: "Design a world", intro: "Choose where an outbreak hides, add traps and real-life events, then press Run. Foreshock simulates 64 areas, 10 medicines and 30 days in your browser and rebuilds every screen.",
      outbreak: "The outbreak", hide: "Hide an outbreak", where: "Where", illness: "Illness", starts: "Starts on day", peak: "Strength at its peak", peakU: "× normal sales", delay: "Clinics follow after", days: "days", day: "Day",
      life: "Traps and real life", trap: "Paracetamol trap", trapNote: "a small jump in one medicine that should be ignored", payday: "Payday on day 30", paydayNote: "people restock: sales +25%", heat: "Heatwave, days 22–25", heatNote: "Aqaba and the Jordan Valley: more ORS", eid: "Eid holiday, days 25–28", eidNote: "shopping the day before, quieter holiday after",
      det: "The detector", aware: "Knows the calendar and weather", awareNote: "switch off to see the false alarms it prevents", alert: "Alert line", wob: "wobbles", seed: "Random world", seedNote: "same number = same world",
      run: "Run simulation", reset: "Back to the original story", newWorld: "New world", stressBtn: "Stress test: 20 worlds",
      resTitle: "This world", openMap: "Open the map at this moment", caught: "Outbreak caught", yes: "Yes", no: "No", noOutbreak: "No outbreak hidden",
      firstY: "First yellow", red: "Red confirmed", after: "after it began", lead: "Pharmacy head start", trapR: "Paracetamol trap", ignored: "Ignored", raised: "Raised an alert", off: "Off",
      fy: "False yellows", fr: "False reds", saves: "False alarms prevented by calendar + weather", sup: "Supply warnings", h: "h", none: "none",
      stTitle: "Stress test", stLead: "The same story in 20 different random worlds. One lucky world proves nothing; this shows how often Foreshock gets it right.",
      stRun: "Running world", of: "of", stCaught: "caught", stMedY: "median time to yellow", stMedL: "median head start", stFR: "false reds in total", stFY: "false yellows per world",
      stCols: ["World", "Caught", "Yellow after", "Head start", "False yellow", "False red", ""], open: "Open",
      dl: "Data for Excel", dlNote: "Spreadsheets of this world (CSV), ready to open in Excel or Google Sheets.",
      dlP: "Pharmacy sales", dlC: "Clinic visits", dlS: "Shelf stock", busy: "Simulating 64 areas × 30 days…", busyStress: "Stress test",
      busyServer: "Starting a new world: registering pharmacies and importing their history…", goLive: "Go live on day", goLiveNote: "earlier days arrive as imported history",
      resTitleLive: "This world so far", clockTitle: "Server clock", clockNote: "Use Go live and the speed buttons at the top. To jump ahead, the pharmacies send the hours in between as fast as the server can check them.",
      skipTo: "Skip ahead to day", skipGo: "Skip ahead", skipping: "Skipping ahead to day",
      rtTitle: "Running in real time", rtNote: "Today is day {d} of this world ({date}). The pharmacy data is simulated, but the clock and the dates are real: each sale arrives the moment it happens, and Foreshock checks every area on the hour. A fresh world starts by itself when this one runs out.",
      rtWorld: "Outbreaks hidden in today's world", rtSwitchDemo: "Switch to the demo story (fast)", rtSwitchDemoNote: "For presenting: the September story at up to 10× speed, with Go live and Skip ahead.",
      demoTitle: "Demo story", rtSwitch: "Switch to real time (today's date)", rtSwitchNote: "Runs on today's real date and clock, with two weeks of history behind it.",
      busyRT: "Building today's world: two weeks of pharmacy history, then live from now…",
    },
    ar: {
      title: "صمّم عالماً", intro: "اختر أين يختبئ التفشي، وأضف الفخاخ وأحداث الحياة الواقعية، ثم اضغط تشغيل. يحاكي Foreshock ‏64 منطقة و10 أدوية و30 يوماً داخل متصفحك ويعيد بناء كل الشاشات.",
      outbreak: "التفشي", hide: "إخفاء تفشٍّ", where: "المكان", illness: "المرض", starts: "يبدأ في اليوم", peak: "قوته في الذروة", peakU: "× المبيعات العادية", delay: "العيادات تتبعه بعد", days: "أيام", day: "اليوم",
      life: "الفخاخ والحياة الواقعية", trap: "فخ الباراسيتامول", trapNote: "ارتفاع صغير في دواء واحد يجب تجاهله", payday: "يوم الرواتب (اليوم 30)", paydayNote: "الناس يشترون أكثر: +25%", heat: "موجة حر، الأيام 22–25", heatNote: "العقبة والأغوار: أملاح إماهة أكثر", eid: "عطلة العيد، الأيام 25–28", eidNote: "تسوّق قبل العيد، وهدوء خلال العطلة",
      det: "الكاشف", aware: "يعرف التقويم والطقس", awareNote: "أوقفه لترى الإنذارات الكاذبة التي يمنعها", alert: "خط التنبيه", wob: "تذبذبات", seed: "عالم عشوائي", seedNote: "الرقم نفسه = العالم نفسه",
      run: "تشغيل المحاكاة", reset: "العودة إلى القصة الأصلية", newWorld: "عالم جديد", stressBtn: "اختبار التحمّل: 20 عالماً",
      resTitle: "هذا العالم", openMap: "افتح الخريطة عند هذه اللحظة", caught: "اكتُشف التفشي", yes: "نعم", no: "لا", noOutbreak: "لا يوجد تفشٍّ",
      firstY: "أول تحذير أصفر", red: "تأكيد أحمر", after: "بعد بدايته", lead: "سبق الصيدليات", trapR: "فخ الباراسيتامول", ignored: "تجاهله", raised: "أطلق تنبيهاً", off: "متوقف",
      fy: "إنذارات صفراء كاذبة", fr: "إنذارات حمراء كاذبة", saves: "إنذارات يمنعها التقويم والطقس", sup: "تحذيرات المخزون", h: "س", none: "لا شيء",
      stTitle: "اختبار التحمّل", stLead: "القصة نفسها في 20 عالماً عشوائياً مختلفاً. عالم واحد محظوظ لا يثبت شيئاً؛ هذا يُظهر كم مرة يصيب Foreshock.",
      stRun: "تشغيل العالم", of: "من", stCaught: "اكتُشفت", stMedY: "متوسط الوقت حتى الأصفر", stMedL: "متوسط السبق", stFR: "إنذارات حمراء كاذبة إجمالاً", stFY: "إنذارات صفراء كاذبة لكل عالم",
      stCols: ["العالم", "اكتُشف", "الأصفر بعد", "السبق", "أصفر كاذب", "أحمر كاذب", ""], open: "افتح",
      dl: "بيانات لبرنامج Excel", dlNote: "جداول هذا العالم (CSV)، جاهزة للفتح في Excel أو Google Sheets.",
      dlP: "مبيعات الصيدليات", dlC: "زيارات العيادات", dlS: "مخزون الرفوف", busy: "محاكاة 64 منطقة × 30 يوماً…", busyStress: "اختبار التحمّل",
      busyServer: "بدء عالم جديد: تسجيل الصيدليات واستيراد سجلّاتها…", goLive: "التشغيل المباشر في اليوم", goLiveNote: "الأيام السابقة تصل كسجلّات مستوردة",
      resTitleLive: "هذا العالم حتى الآن", clockTitle: "ساعة الخادم", clockNote: "استخدم زر التشغيل المباشر وأزرار السرعة في الأعلى. للقفز إلى الأمام، ترسل الصيدليات الساعات بينهما بأسرع ما يستطيع الخادم فحصها.",
      skipTo: "القفز إلى اليوم", skipGo: "قفز", skipping: "جارٍ القفز إلى اليوم",
      rtTitle: "يعمل بالوقت الحقيقي", rtNote: "اليوم هو اليوم {d} في هذا العالم ({date}). بيانات الصيدليات محاكاة، لكن الساعة والتواريخ حقيقية: تصل كل عملية بيع لحظة حدوثها، ويفحص Foreshock كل منطقة على رأس كل ساعة. يبدأ عالم جديد تلقائياً عند انتهاء هذا العالم.",
      rtWorld: "التفشيات المخفية في عالم اليوم", rtSwitchDemo: "التبديل إلى القصة التجريبية (سريعة)", rtSwitchDemoNote: "للعرض: قصة أيلول بسرعة حتى 10×، مع التشغيل المباشر والقفز إلى الأمام.",
      demoTitle: "القصة التجريبية", rtSwitch: "التبديل إلى الوقت الحقيقي (تاريخ اليوم)", rtSwitchNote: "يعمل على تاريخ اليوم وساعته الحقيقيين، مع أسبوعين من السجلات قبله.",
      busyRT: "بناء عالم اليوم: أسبوعان من سجلات الصيدليات، ثم البث المباشر من الآن…",
    },
  };
  const t = (k) => L[lang][k] ?? L.en[k];
  const gname = (g) => lang === "ar" ? AR_G[g] : g;
  const aname = (n) => { const u = UNITS.find(x => x.name === n); return lang === "ar" ? (u?.ar || n) : n; };
  const hrs = (h) => h == null ? "—" : h >= 24 ? (lang === "ar" ? `${Math.floor(h / 24)} يوم ${h % 24} س` : `${Math.floor(h / 24)} d ${h % 24} h`) : `${h} ${t("h")}`;
  const when = (x) => x ? `${t("day")} ${x[0]} · ${String(x[1]).padStart(2, "0")}:00` : "—";
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* not saved: fine */ } };

  /* ---------- busy overlay ---------- */
  const busy = (on, text, sub) => { $("busy").hidden = !on; if (on) { $("busyText").textContent = text || t("busy"); $("busySub").textContent = sub || ""; } };
  const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

  const SERVER = !!window.FS_SERVER;
  let startDay = 13, skipDay = 20;
  async function runWorld(settings, keepTab, realtime) {
    if (SERVER) {   // the server builds the new world; live.js picks it up and redraws everything
      busy(true, realtime ? t("busyRT") : t("busyServer"));
      try { await window.__fsServer.newWorld(settings, startDay, realtime); } catch (e) { busy(false); alertMsg(e.message); }
      return;
    }
    busy(true); await nextFrame();
    try {
      DATA = ENGINE.run(settings, UNITS, GEO, EXTRAS);
      if (!keepTab && window.__fsPrev) window.__fsPrev.tab = window.__fsPrev.tab || "map";
      boot(DATA);
    } finally { busy(false); }
    render();
  }

  /* ---------- the form ---------- */
  function areaOptions() {
    const byGov = {};
    for (const u of UNITS) (byGov[u.kind === "neighborhood" ? "Greater Amman" : u.gov] ||= []).push(u);
    const govAr = Object.fromEntries((GEO.govs || []).map(g => [g.name, g.ar]));
    const order = ["Greater Amman", ...Object.keys(byGov).filter(g => g !== "Greater Amman").sort()];
    return order.map(g => `<optgroup label="${esc(lang === "ar" ? (g === "Greater Amman" ? "عمّان الكبرى" : govAr[g] || g) : g)}">${byGov[g].sort((a, b) => a.name.localeCompare(b.name))
      .map(u => `<option value="${esc(u.name)}"${u.name === S.area ? " selected" : ""}>${esc(aname(u.name))}</option>`).join("")}</optgroup>`).join("");
  }
  const seg = (id, values, cur, label) => `<div class="seg wide" role="group" aria-label="${esc(label)}" id="${id}">${values.map(([v, txt]) => `<button type="button" data-v="${esc(v)}" aria-pressed="${String(v) === String(cur)}">${esc(txt)}</button>`).join("")}</div>`;
  const slider = (id, min, max, step, val, unit) => `<div class="slide"><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${val}"><output class="mono" for="${id}" id="${id}-o">${val}${unit}</output></div>`;
  const check = (id, on, label, note) => `<label class="chk"><input type="checkbox" id="${id}"${on ? " checked" : ""}><span><b>${esc(label)}</b>${note ? `<small>${esc(note)}</small>` : ""}</span></label>`;

  function resultTable() {
    if (!DATA) return "";
    const r = DATA.result, sc = DATA.scenario;
    const rows = [
      [t("caught"), sc.outbreak ? (r.red ? `<span class="pill R">${t("yes")}</span>` : r.yellow ? `<span class="pill Y">${t("lvY") || "Yellow"}</span>` : `<span class="pill N">${t("no")}</span>`) : t("noOutbreak")],
      ...(sc.outbreak ? [[t("firstY"), `${when(r.yellow)}${r.yellowAfter != null ? `<small class="after">${hrs(r.yellowAfter)} ${t("after")}</small>` : ""}`],
        [t("red"), `${when(r.red)}${r.redAfter != null ? `<small class="after">${hrs(r.redAfter)} ${t("after")}</small>` : ""}`],
        [t("lead"), hrs(r.lead)]] : []),
      [t("trapR"), sc.trap ? (r.trapIgnored ? t("ignored") : t("raised")) : t("off")],
      [t("fy"), r.falseYellow.length ? `${r.falseYellow.length} <small>(${r.falseYellow.map(k => esc(aname(k.split("|")[0]) + " · " + gname(k.split("|")[1]))).join(", ")})</small>` : "0"],
      [t("fr"), r.falseRed.length ? `<b style="color:var(--red-ink)">${r.falseRed.length}</b> <small>(${r.falseRed.map(k => esc(aname(k.split("|")[0]))).join(", ")})</small>` : "0"],
      ...(sc.aware ? [[t("saves"), r.contextSaves.length ? `${r.contextSaves.length} <small>(${r.contextSaves.map(n => esc(aname(n))).join(", ")})</small>` : "0"]] : []),
      [t("sup"), String(DATA.live.supply_alerts.length)],
    ];
    return `<table class="t"><tbody>${rows.map(([k, v]) => `<tr><td>${k}</td><td class="n num">${v}</td></tr>`).join("")}</tbody></table>`;
  }

  function stressTable() {
    if (!stress) return `<p class="note">${t("stLead")}</p>`;
    const done = stress.rows.length, total = stress.total;
    if (done < total) return `<p class="note">${t("stRun")} ${done + 1} ${t("of")} ${total}…</p><div class="prog"><i style="width:${done / total * 100}%"></i></div>`;
    const R = stress.rows, med = (a) => { const s = a.filter(x => x != null).sort((x, y) => x - y); return s.length ? s[s.length >> 1] : null; };
    const caught = R.filter(x => x.red).length, fr = R.reduce((s, x) => s + x.falseRed.length, 0), fy = R.reduce((s, x) => s + x.falseYellow.length, 0);
    const sc = stress.settings;
    return `<div class="kpis mini">
        ${sc.outbreak ? `<div class="kpi"><small>${t("stCaught")}</small><b>${caught}/${total}</b></div>
        <div class="kpi"><small>${t("stMedY")}</small><b>${hrs(med(R.map(x => x.yellowAfter)))}</b></div>
        <div class="kpi"><small>${t("stMedL")}</small><b>${hrs(med(R.map(x => x.lead)))}</b></div>` : ""}
        <div class="kpi"><small>${t("stFR")}</small><b>${fr}</b></div>
        <div class="kpi"><small>${t("stFY")}</small><b>${(fy / total).toFixed(1)}</b></div>
      </div>
      <div class="tablewrap"><table class="t"><thead><tr>${t("stCols").map((c, i) => `<th${i > 1 ? ' class="n"' : ""}>${c}</th>`).join("")}</tr></thead><tbody>
      ${R.map(x => `<tr><td class="mono">#${x.seed}</td><td>${sc.outbreak ? (x.red ? `<span class="pill R">${t("yes")}</span>` : `<span class="pill N">${t("no")}</span>`) : "—"}</td>
        <td class="n num">${hrs(x.yellowAfter)}</td><td class="n num">${hrs(x.lead)}</td><td class="n num">${x.falseYellow.length}</td>
        <td class="n num"${x.falseRed.length ? ' style="color:var(--red-ink);font-weight:600"' : ""}>${x.falseRed.length}</td>
        <td class="n"><button type="button" class="btn sm" data-seed="${x.seed}" aria-label="${t("open")} #${x.seed}" title="${t("open")}">→</button></td></tr>`).join("")}
      </tbody></table></div>`;
  }

  function modeCard() {
    const rt = !!(DATA && DATA.scenario && DATA.scenario.realtime);
    if (rt) {
      const sc = DATA.scenario, now = DATA.live.now, d = 10 + Math.floor(now / 24), date = DATA.date[d - 1];
      const obs = [{ area: sc.area, group: sc.group, start: sc.start }, ...(sc.extra || [])].sort((a, b) => a.start - b.start);
      return `<div class="card"><h2><span>🟢 ${t("rtTitle")}</span><span class="mono">${esc(date)}</span></h2>
        <p class="prose" style="margin:0 0 10px">${t("rtNote").replace("{d}", d).replace("{date}", esc(date))}</p>
        <p class="note" style="margin:0 0 6px"><b>${t("rtWorld")}</b></p><ul class="note" style="margin:0 0 12px;padding-inline-start:18px">${obs.map(o => `<li>${esc(aname(o.area))} · ${esc(gname(o.group))} · ${t("starts").toLowerCase()} ${o.start}${o.start > d ? " ⏳" : ""}</li>`).join("")}</ul>
        <div class="actions"><button type="button" class="btn" id="f-demo">${t("rtSwitchDemo")}</button></div><p class="note">${t("rtSwitchDemoNote")}</p><p class="note" id="sim-msg" role="status"></p></div>`;
    }
    return `<div class="card"><h2><span>${t("demoTitle")} · ${t("clockTitle")}</span></h2><p class="note" style="margin:0 0 10px">${t("clockNote")}</p>
      <div class="form"><div class="row"><span>${t("skipTo")}</span>${slider("f-skip", 10, 30, 1, skipDay, "")}</div></div>
      <div class="actions"><button type="button" class="btn" id="f-skipgo">⏩ ${t("skipGo")}</button><button type="button" class="btn primary" id="f-rt">🟢 ${t("rtSwitch")}</button></div>
      <p class="note">${t("rtSwitchNote")}</p><p class="note" id="sim-msg" role="status"></p></div>`;
  }

  function render() {
    const v = $("view-sim"); if (!v) return;
    const off = !S.outbreak;
    v.innerHTML = `<div class="grid2">
      <div class="col">
        <div class="card"><h2><span>${t("title")}</span></h2><p class="prose" style="margin:0 0 6px">${t("intro")}</p></div>
        <div class="card form">
          <h2><span>${t("outbreak")}</span></h2>
          ${check("f-outbreak", S.outbreak, t("hide"))}
          <fieldset ${off ? "disabled" : ""}>
            <label class="row"><span>${t("where")}</span><select id="f-area">${areaOptions()}</select></label>
            <div class="row"><span>${t("illness")}</span>${seg("f-group", ENGINE.GROUPS.map(g => [g, gname(g)]), S.group, t("illness"))}</div>
            <div class="row"><span>${t("starts")}</span>${slider("f-start", 12, 24, 1, S.start, "")}</div>
            <div class="row"><span>${t("peak")}</span>${slider("f-peak", 1.5, 5, 0.1, S.peak, "×")}</div>
            <div class="row"><span>${t("delay")}</span>${slider("f-delay", 1, 4, 1, S.delay, " " + t("days"))}</div>
          </fieldset>
          <h2 style="margin-top:14px"><span>${t("life")}</span></h2>
          ${check("f-trap", S.trap, t("trap"), t("trapNote"))}
          <div class="row" ${S.trap ? "" : "hidden"}><span>${t("day")}</span>${slider("f-trapDay", 10, 26, 1, S.trapDay, "")}</div>
          ${check("f-payday", S.payday, t("payday"), t("paydayNote"))}
          ${check("f-heat", S.heatwave, t("heat"), t("heatNote"))}
          ${check("f-eid", !!S.eid, t("eid"), t("eidNote"))}
          <h2 style="margin-top:14px"><span>${t("det")}</span></h2>
          ${check("f-aware", S.aware, t("aware"), t("awareNote"))}
          <div class="row"><span>${t("alert")}</span>${seg("f-alert", [2.5, 3, 3.5, 4].map(x => [x, x + " " + t("wob")]), S.alert, t("alert"))}</div>
          ${SERVER ? `<div class="row"><span>${t("goLive")}<small>${t("goLiveNote")}</small></span>${slider("f-startDay", 10, 26, 1, startDay, "")}</div>` : ""}
          <div class="row"><span>${t("seed")}<small>${t("seedNote")}</small></span><span class="seedbox"><input type="number" id="f-seed" min="1" max="999999" value="${S.seed}"><button type="button" class="btn sm" id="f-dice">🎲 ${t("newWorld")}</button></span></div>
          <div class="actions">
            <button type="button" class="btn primary" id="f-run">▶ ${t("run")}</button>
            <button type="button" class="btn" id="f-stress">${t("stressBtn")}</button>
            <button type="button" class="btn ghost" id="f-reset">${t("reset")}</button>
          </div>
        </div>
      </div>
      <div class="col">
        ${SERVER ? modeCard() : ""}
        <div class="card"><h2><span>${SERVER ? t("resTitleLive") : t("resTitle")}</span><span class="mono">#${DATA ? DATA.scenario.seed : ""}</span></h2><div id="simRes">${resultTable()}</div>
          <p style="margin:12px 0 0"><button type="button" class="btn primary" id="f-open">${t("openMap")} →</button></p></div>
        <div class="card"><h2><span>${t("stTitle")}</span></h2><div id="stress">${stressTable()}</div></div>
        <div class="card"><h2><span>${t("dl")}</span></h2><p class="note" style="margin:0 0 10px">${t("dlNote")}</p>
          <div class="actions"><button type="button" class="btn sm" data-dl="pharmacy">⬇ ${t("dlP")}</button><button type="button" class="btn sm" data-dl="clinic">⬇ ${t("dlC")}</button><button type="button" class="btn sm" data-dl="stock">⬇ ${t("dlS")}</button></div></div>
      </div></div>`;
    wire();
  }

  function wire() {
    const on = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
    on("f-outbreak", "change", e => { S.outbreak = e.target.checked; render(); });
    on("f-area", "change", e => { S.area = e.target.value; });
    for (const [id, key, fix] of [["f-start", "start", 0], ["f-peak", "peak", 1], ["f-delay", "delay", 0], ["f-trapDay", "trapDay", 0]])
      on(id, "input", e => { S[key] = +(+e.target.value).toFixed(fix); $(id + "-o").textContent = S[key] + (key === "peak" ? "×" : key === "delay" ? " " + t("days") : ""); });
    on("f-trap", "change", e => { S.trap = e.target.checked; render(); });
    on("f-payday", "change", e => { S.payday = e.target.checked; });
    on("f-heat", "change", e => { S.heatwave = e.target.checked; });
    on("f-eid", "change", e => { S.eid = e.target.checked; });
    on("f-aware", "change", e => { S.aware = e.target.checked; });
    on("f-seed", "change", e => { S.seed = Math.max(1, Math.round(+e.target.value) || 1); });
    on("f-dice", "click", () => { S.seed = 1 + Math.floor(Math.random() * 99999); $("f-seed").value = S.seed; });
    document.querySelectorAll("#f-group button, #f-alert button").forEach(b => b.addEventListener("click", () => {
      const isGroup = b.parentElement.id === "f-group";
      if (isGroup) S.group = b.dataset.v; else S.alert = +b.dataset.v;
      b.parentElement.querySelectorAll("button").forEach(x => x.setAttribute("aria-pressed", x === b));
    }));
    on("f-run", "click", async () => { save(); stress = null; await runWorld(S, true); });
    on("f-startDay", "input", e => { startDay = +e.target.value; $("f-startDay-o").textContent = startDay; });
    on("f-skip", "input", e => { skipDay = +e.target.value; $("f-skip-o").textContent = skipDay; });
    on("f-skipgo", "click", async () => { try { await window.__fsServer.setClock({ skip_to_day: skipDay }); $("sim-msg").textContent = t("skipping") + " " + skipDay + "…"; } catch (e) { $("sim-msg").textContent = e.message; } });
    on("f-reset", "click", async () => { S = Object.assign({}, ENGINE.DEFAULTS); save(); stress = null; await runWorld(S, true); });
    on("f-rt", "click", async () => { stress = null; await runWorld({}, true, true); });
    on("f-demo", "click", async () => { stress = null; S = Object.assign({}, ENGINE.DEFAULTS); save(); await runWorld(S, true, false); });
    on("f-open", "click", () => window.__fsSetTab && window.__fsSetTab("map"));
    on("f-stress", "click", runStress);
    document.querySelectorAll("#stress [data-seed]").forEach(b => b.addEventListener("click", async () => {
      S.seed = +b.dataset.seed; save(); await runWorld(S, true); window.__fsSetTab && window.__fsSetTab("map"); }));
    document.querySelectorAll("[data-dl]").forEach(b => b.addEventListener("click", () => download(b.dataset.dl)));
  }

  async function runStress() {
    save();
    const base = Object.assign({}, S), total = 20, start = base.seed;
    stress = { total, rows: [], settings: base }; $("stress").innerHTML = stressTable();
    for (let i = 0; i < total; i++) {
      await nextFrame();
      const seed = start + i, r = ENGINE.run(Object.assign({}, base, { seed }), UNITS, GEO, EXTRAS).result;
      stress.rows.push(Object.assign({ seed }, r));
      if ($("stress")) $("stress").innerHTML = stressTable();
    }
    render();
  }

  async function download(kind) {
    if (!DATA) return;
    if (SERVER) { location.href = `/api/export/${kind}.csv`; return; }
    const filename = `foreshock_${kind}_world${DATA.scenario.seed}.csv`, text = ENGINE.csv(DATA.raw, kind);
    // inside Claude's viewer: ask the viewer to save it; opened from the file: a normal browser download
    const dl = window.claude && window.claude.use ? await window.claude.use("downloads").catch(() => null) : null;
    if (dl) { try { await dl.save({ filename, data: text }); } catch (e) { /* declined or unavailable: nothing to do */ } return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" })); a.download = filename;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  window.__fsLang = (l) => { lang = l; render(); };
  window.__fsReboot = () => { if (DATA) { boot(DATA); render(); } };
  window.__fsSetData = (D) => {
    const same = DATA && DATA.world_id === D.world_id; DATA = D;
    if (same && $("simRes")) { $("simRes").innerHTML = resultTable(); return; }   // same world, new hour: keep what's being edited
    if (D.scenario && !D.scenario.realtime) { S = Object.assign({}, ENGINE.DEFAULTS, D.scenario); }
    render();
  };
  const alertMsg = (m) => { const el = $("sim-msg"); if (el) el.textContent = m; };
  if (!SERVER) runWorld(S, false);
})();
