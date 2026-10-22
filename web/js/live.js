/* ============================================================================
   FORESHOCK LIVE CLIENT: connects the dashboard to the Foreshock server.
   - asks the server for the latest picture after every checked hour
   - streams the live feed (real API requests the server received)
   - drives the server clock for admins
   ========================================================================== */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const pad = (n) => String(n).padStart(2, "0");
  const MON = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
                ar: ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"] };
  let DATA = null, clock = null, offset = 0, lastP = null, lastWorld = null, lastRev = null, lastOrev = null, feedAfter = 0, signedIn = false, loading = false;
  window.__fsFeedBuf = [];
  const lang = () => window.__fsPrev?.lang || "en";
  const api = (m, p, b) => FSAuth.api(m, p, b);

  /* ---------- small helpers the dashboard calls ---------- */
  window.__fsToast = (msg) => {
    let el = $("toast"); if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; el.setAttribute("role", "status"); document.body.appendChild(el); }
    el.textContent = msg; el.hidden = false; clearTimeout(el._t); el._t = setTimeout(() => { el.hidden = true; }, 4000);
  };
  const busy = (on, text) => { $("busy").hidden = !on; if (on) { $("busyText").textContent = text || ""; $("busySub").textContent = ""; } };
  window.__fsServer = {
    async setClock(b) { try { applyClock(await api("POST", "/api/clock", b)); } catch (e) { window.__fsToast(e.message); } },
    reload() { lastP = null; loadSnapshot(); },
    clock: () => clock,
    async newWorld(settings, startDay, realtime) {
      const r = await api("POST", "/api/world", { settings, start_day: startDay, realtime: !!realtime });
      busy(true, lang() === "ar" ? "استيراد سجلّات الصيدليات…" : "Importing the pharmacies' history…");
      lastWorld = null; return r;
    },
    async fillTryIt(el) {
      if (!el) return;
      try {
        const k = await api("GET", "/api/keys");
        if (!k.pharmacy) return;
        const base = location.origin, ors = k.gtin.ORS;
        const mac = `curl -X POST ${base}/v1/sales \\\n  -H "Authorization: Bearer ${k.pharmacy.key}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"items":[{"gtin":"${ors}","qty":3}]}'`;
        const win = `Invoke-RestMethod -Method Post -Uri ${base}/v1/sales \`\n  -Headers @{Authorization="Bearer ${k.pharmacy.key}"} \`\n  -ContentType "application/json" \`\n  -Body '{"items":[{"gtin":"${ors}","qty":3}]}'`;
        el.innerHTML = `<p class="note" style="margin:0 0 6px">${lang() === "ar" ? "صيدلية" : "Pharmacy"} <b class="mono">${k.pharmacy.code}</b> · ${k.pharmacy.area} · ORS ×3</p>
          <p class="note" style="margin:8px 0 4px">Mac / Linux</p><pre class="code">${esc(mac)}</pre>
          <p class="note" style="margin:10px 0 4px">Windows PowerShell</p><pre class="code">${esc(win)}</pre>
          <p class="note" style="margin:10px 0 0">${lang() === "ar" ? "ابحث عن الصيدلية في البث المباشر. جرّب مفتاحاً خاطئاً لترى الخادم يرفض الطلب (401)." : "Look for the pharmacy in the Live feed. Try a wrong key to see the server refuse it (401)."}</p>`;
      } catch (e) { /* not an admin, or offline */ }
    },
    async renderAi(el) {
      if (!el) return;
      const ar = lang() === "ar";
      const L = ar ? { title: "الذكاء الاصطناعي المحلي (بدون مفاتيح)", lead: "نموذج ذكاء اصطناعي مجاني يعمل على هذا الحاسوب عبر Ollama. يكتب أسباب التعديلات والإحاطة الأسبوعية ويجيب في «اسأل Foreshock». بدون إنترنت، بدون حساب، بدون مفتاح. إن لم يكن مثبتاً، تعمل قواعد Foreshock المدمجة.",
          on: "يعمل على هذا الحاسوب", off: "غير مثبت · تُستخدم القواعد المدمجة", nomodel: "Ollama يعمل · النموذج غير محمّل", paused: "متوقف · تُستخدم القواعد المدمجة", model: "النموذج", save: "حفظ", test: "اختبار", pull: "تحميل النموذج", use: "استخدم الذكاء الاصطناعي المحلي",
          priv: "لا يغادر أي شيء هذا الحاسوب: النموذج يعمل محلياً ويتلقى أرقام المناطق فقط. لا أسماء ولا أرقام هواتف ولا بيانات مرضى.",
          how: "التثبيت مرة واحدة: نزّل Ollama من ollama.com وافتحه، ثم اضغط «تحميل النموذج» (حوالي 2 غيغابايت). أو في الطرفية: ollama pull qwen2.5:3b", dl: "جارٍ التحميل" }
        : { title: "Local AI (no keys)", lead: "A free AI model that runs on this computer through Ollama. It drafts override reasons, writes the weekly briefing and answers in Ask Foreshock. No internet, no account, no key. If it isn't installed, Foreshock's built-in rules do the job.",
          on: "Running on this computer", off: "Not installed · using built-in rules", nomodel: "Ollama running · model not downloaded", paused: "Off · using built-in rules", model: "Model", save: "Save", test: "Test", pull: "Download model", use: "Use the local AI",
          priv: "Nothing leaves this computer: the model runs here and only sees area-level numbers. No names, phone numbers or patient data.",
          how: "One-time setup: download Ollama from ollama.com and open it, then press Download model (about 2 GB). Or in a terminal: ollama pull qwen2.5:3b", dl: "Downloading" };
      let st; try { st = await api("GET", "/api/ai"); } catch (e) { return; }
      const live = st.engine === "local", pill = live ? L.on : !st.ollama ? L.off : !st.ready ? L.nomodel : L.paused;
      const pl = st.pull || {}, pct = pl.total ? Math.round(pl.done / pl.total * 100) : 0;
      el.innerHTML = `<div class="card"><h2><span>✨ ${L.title}</span><span class="sms-st ${live ? "ok" : "held"}">${pill}</span></h2>
        <p class="prose" style="margin:0 0 10px">${L.lead}</p>
        <div class="form"><label class="row"><span>${L.model}</span><select id="ai-model">${(st.models || []).map(([v, n]) => `<option value="${esc(v)}"${v === st.model ? " selected" : ""}>${esc(n)}${(st.installed || []).some(x => x === v || x === v + ":latest") ? " ✓" : ""}</option>`).join("")}</select></label>
        <label class="row"><span>${L.use}</span><input type="checkbox" id="ai-on" style="justify-self:start;width:auto"${st.enabled ? " checked" : ""}></label></div>
        <div class="actions"><button type="button" class="btn sm primary" id="ai-save">${L.save}</button>
        ${st.ollama && !st.ready ? `<button type="button" class="btn sm" id="ai-pull"${pl.running ? " disabled" : ""}>⬇ ${L.pull}</button>` : ""}
        <button type="button" class="btn sm" id="ai-test">${L.test}</button></div>
        ${pl.running ? `<p class="note">${L.dl} ${esc(st.model)}… ${pct}%</p>` : pl.error ? `<p class="note err">${esc(pl.error)}</p>` : ""}
        <p class="note" id="ai-msg" role="status"></p><p class="note">${L.priv}</p><p class="note">${L.how}</p></div>`;
      const msg = (m) => { $("ai-msg").textContent = m; };
      $("ai-save").onclick = async () => { try { await api("POST", "/api/ai", { model: $("ai-model").value, enabled: $("ai-on").checked }); await this.renderAi(el); } catch (e) { msg(e.message); } };
      $("ai-test").onclick = async () => { msg("…"); try { const r = await api("POST", "/api/ai/test", {}); msg(r.message); } catch (e) { msg(e.message); } };
      if ($("ai-pull")) $("ai-pull").onclick = async () => { try { await api("POST", "/api/ai", { model: $("ai-model").value }); await api("POST", "/api/ai/pull", {}); await this.renderAi(el); } catch (e) { msg(e.message); } };
      clearTimeout(this._aiT);
      if (pl.running) this._aiT = setTimeout(() => { if (document.body.contains(el)) this.renderAi(el); }, 2000);
    },
    async renderSms(el, h) {
      if (!el) return;
      try {
        const { sms } = await api("GET", "/api/sms");
        const KIND = { inspectors: ["Health inspectors", "المفتشون"], pharmacies: ["Pharmacies", "الصيدليات"], admin: ["Ministry admin", "مشرف الوزارة"],
          "inspector update": ["Inspector update", "إشعار للمفتش"], residents: ["Residents", "السكان"] };
        el.innerHTML = `<div class="card"><h2><span>${h.t("smsLogTitle")}</span><span class="mono">${sms.length}</span></h2>
          ${sms.length ? `<div class="tablewrap"><table class="t smslog"><thead><tr>${h.t("smsCols").map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
          ${sms.map(s => `<tr><td class="mono" style="white-space:nowrap">${h.t("day")} ${Math.floor(s.sim_hour / 24) + 1} · ${h.pad(s.sim_hour % 24)}:00</td>
            <td><span class="pill ${s.kind === "residents" ? "R" : s.kind === "admin" ? "A" : "I"}">${(KIND[s.kind] || [s.kind, s.kind])[h.lang === "ar" ? 1 : 0]}</span></td>
            <td>${h.esc(s.recipients)}</td><td>${h.esc(h.placeLabel(s.area))}${s.grp ? " · " + h.esc(h.gname(s.grp)) : ""}</td>
            <td class="smscell"><p class="bubble" dir="rtl" lang="ar">${h.esc(s.text_ar)}</p><p class="bubble en" dir="ltr" lang="en">${h.esc(s.text_en)}</p></td>
            <td><span class="sms-st ok">${h.esc(s.status)}</span></td></tr>`).join("")}</tbody></table></div>`
          : `<p class="empty">${h.lang === "ar" ? "لم تُرسل أي رسالة في هذا العالم بعد." : "No SMS sent in this world yet. They appear when an area first turns yellow or red."}</p>`}</div>`;
      } catch (e) { el.innerHTML = `<p class="empty">${h.esc(e.message)}</p>`; }
    },
  };
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

  /* ---------- the clock in the header, ticking between server updates ---------- */
  function applyClock(c) {
    clock = c; offset = c.server_time - Date.now() / 1000;
    if (window.__fsClock) window.__fsClock(c);
  }
  setInterval(() => {
    if (!clock || !DATA || !$("clock")) return;
    if (clock.realtime) {          // the real time in Amman (UTC+3 all year)
      const now = new Date((Date.now() / 1000 + offset + 3 * 3600) * 1000);
      $("clock").textContent = `${now.getUTCDate()} ${MON[lang()][now.getUTCMonth()]} ${now.getUTCFullYear()} · ${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}:${pad(now.getUTCSeconds())}`;
      return;
    }
    const H = clock.running ? clock.hour : Math.max(0, clock.processed + 1);
    let frac = 0;
    if (clock.running && clock.processed >= clock.hour - 1) frac = Math.min(0.999, Math.max(0, (Date.now() / 1000 + offset - clock.since) / clock.period));
    const secs = Math.floor(frac * 3600), d0 = new Date((DATA.date && DATA.date[0] || "2026-09-02") + "T00:00:00Z"), d = new Date(d0.getTime() + Math.floor(H / 24) * 86400000);
    $("clock").textContent = `${d.getUTCDate()} ${MON[lang()][d.getUTCMonth()]} ${d.getUTCFullYear()} · ${pad(H % 24)}:${pad(Math.floor(secs / 60))}:${pad(secs % 60)}`;
  }, 250);

  /* ---------- loading the picture ---------- */
  async function loadSnapshot() {
    if (loading) return; loading = true;
    try {
      for (;;) {
        const r = await fetch("/api/snapshot", { credentials: "same-origin" });
        if (r.status === 401) { showLogin(); return; }
        const snap = await r.json();
        if (snap.pending) {
          busy(true, (lang() === "ar" ? "استيراد سجلّات الصيدليات… حتى ساعة " : "Importing the pharmacies' history… up to hour ") + Math.max(0, snap.processed));
          await sleep(800); continue;
        }
        DATA = Object.assign(snap, { units: window.FS_UNITS, geo: window.FS_GEO }, window.FS_STATIC);
        applyClock(snap.clock);
        const newWorld = lastWorld !== null && lastWorld !== DATA.world_id;
        if (newWorld && window.__fsPrev) { window.__fsPrev.world = null; window.__fsFeedBuf = []; }
        boot(DATA);
        if (window.__fsSetData) window.__fsSetData(DATA);
        if (window.__fsWatch) window.__fsWatch(DATA);
        lastP = snap.clock.processed; lastWorld = DATA.world_id; lastRev = snap.clock.rev; lastOrev = snap.clock.orev;
        busy(false);
        return;
      }
    } catch (e) {
      busy(true, lang() === "ar" ? "لا يمكن الوصول إلى الخادم. هل نافذة Foreshock ما زالت مفتوحة؟" : "Can't reach the Foreshock server. Is its window still open?");
    } finally { loading = false; }
  }

  function showLogin() {
    signedIn = false;
    if (window.__fsStop) window.__fsStop();
    busy(false);
    FSAuth.renderLogin(lang());
  }
  window.__fsAfterLogin = async () => { signedIn = true; lastP = null; await loadSnapshot(); };

  /* ---------- polling: clock every second, feed every second ---------- */
  async function poll() {
    for (;;) {
      await sleep(1000);
      if (!signedIn) continue;
      try {
        const r = await fetch("/api/clock", { credentials: "same-origin" });
        if (r.status === 401) { if (FSAuth.user()) { await FSAuth.logout(); } showLogin(); continue; }
        const c = await r.json(); applyClock(c);
        // reports and accounts change separately from the hours, so check both every time
        const revChanged = c.rev !== lastRev;
        if (revChanged) { try { await FSAuth.refresh(); lastRev = c.rev; } catch (e) { /* retry next time */ } }
        if (c.world !== lastWorld || c.processed !== lastP || c.orev !== lastOrev) await loadSnapshot();
        else if (revChanged && window.__fsAuthChanged) { window.__fsAuthChanged(); if (window.__fsWatch) window.__fsWatch(DATA); }
        const f = await (await fetch(`/api/feed?after=${feedAfter}`, { credentials: "same-origin" })).json();
        if (f.entries.length) {
          feedAfter = f.entries[f.entries.length - 1].id;
          window.__fsFeedBuf = window.__fsFeedBuf.concat(f.entries).slice(-150);
          if (window.__fsFeed) window.__fsFeed(f.entries);
        } else if (f.last < feedAfter) feedAfter = 0;   // the server restarted
      } catch (e) { /* the server may be restarting; try again */ }
    }
  }

  async function start() {
    while (!window.d3) await sleep(30);       // the map library loads from this server, no internet needed
    try { await FSAuth.refresh(); signedIn = true; }
    catch (e) { if (e.status === 401) { showLogin(); poll(); return; } busy(true, "Can't reach the Foreshock server."); }
    try {
      const f = await (await fetch("/api/feed?after=0", { credentials: "same-origin" })).json();
      window.__fsFeedBuf = f.entries.slice(-60); feedAfter = f.last;
    } catch (e) { /* fine */ }
    await loadSnapshot();
    poll();
  }
  start();
})();
