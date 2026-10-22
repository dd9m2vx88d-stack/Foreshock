/* ============================================================================
   FORESHOCK ALERTS ON THIS DEVICE
   Watches your own areas and tells you when something changes:
     - an area turns yellow or red (or gets worse)
     - a pharmacy till in your area goes silent
     - admins: a new inspector report waits for you
     - inspectors: an admin decided on your report
   How you are told depends on the device:
     - laptop (localhost): a real system notification, even if the tab is in the background
     - phone on the Wi-Fi: browsers only allow system notifications on secure (https) sites, so
       Foreshock shows a banner, plays a short sound and vibrates (Android) instead
   ========================================================================== */
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const RANK = { N: 0, W: 1, Y: 2, R: 3 };
  const KEY = "foreshock-alerts-on";
  let on = false, prev = null, prevUser = null, unread = 0, audio = null;
  try { on = localStorage.getItem(KEY) === "1"; } catch (e) { /* storage blocked: off by default */ }
  const lang = () => window.__fsPrev?.lang || "en";
  const T = {
    en: { on: "Alerts on", off: "Alerts off", R: "Red", Y: "Yellow", worse: "now", silent: "Till silent", rep: "New report", dec: "Decision on your report",
          enabled: "Alerts on for this device.", enabledPhone: "Alerts on: this phone shows a banner, plays a sound and vibrates. (System notifications need a secure https site.)",
          blocked: "Notifications are blocked for this site in the browser settings. Foreshock will still show banners here.", close: "Close" },
    ar: { on: "التنبيهات مفعّلة", off: "التنبيهات متوقفة", R: "أحمر", Y: "أصفر", worse: "الآن", silent: "صيدلية صامتة", rep: "تقرير جديد", dec: "قرار بشأن تقريرك",
          enabled: "فُعّلت التنبيهات على هذا الجهاز.", enabledPhone: "فُعّلت التنبيهات: يعرض الهاتف شريطاً وصوتاً واهتزازاً. (إشعارات النظام تحتاج موقعاً آمناً https.)",
          blocked: "الإشعارات محظورة لهذا الموقع في إعدادات المتصفح. سيعرض Foreshock الشرائط هنا.", close: "إغلاق" },
  };
  const t = (k) => T[lang()][k] ?? T.en[k];
  const canSystem = () => "Notification" in window && window.isSecureContext;

  // the installable-app helper (laptop only: phones over plain http can't run it)
  if ("serviceWorker" in navigator && window.isSecureContext) navigator.serviceWorker.register("/sw.js").catch(() => {});

  function beep() {
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const now = audio.currentTime;
      [880, 660].forEach((f, i) => {
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = f; o.type = "sine"; g.gain.setValueAtTime(0.0001, now + i * 0.22);
        g.gain.exponentialRampToValueAtTime(0.25, now + i * 0.22 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.22 + 0.2);
        o.connect(g).connect(audio.destination); o.start(now + i * 0.22); o.stop(now + i * 0.22 + 0.22);
      });
    } catch (e) { /* no sound on this device */ }
  }

  function banner(items) {
    let el = $("fs-banner");
    if (!el) { el = document.createElement("div"); el.id = "fs-banner"; el.className = "fs-banner"; el.setAttribute("role", "alert"); document.body.appendChild(el); }
    el.innerHTML = `${items.slice(0, 4).map(x => `<button type="button" class="fs-b ${x.level || ""}" data-a="${esc(x.area || "")}" data-g="${esc(x.group || "")}"><b>${esc(x.title)}</b><span>${esc(x.body)}</span></button>`).join("")}
      <button type="button" class="fs-x" aria-label="${t("close")}">✕</button>`;
    el.hidden = false;
    el.querySelector(".fs-x").onclick = () => { el.hidden = true; unread = 0; title(); };
    el.querySelectorAll(".fs-b").forEach(b => b.onclick = () => { el.hidden = true; unread = 0; title(); if (b.dataset.a && window.__fsOpenArea) window.__fsOpenArea(b.dataset.a, b.dataset.g); });
  }
  function title() { document.title = (unread ? `(${unread}) ` : "") + "Foreshock"; }

  function deliver(items) {
    if (!items.length) return;
    unread += items.length; title();
    banner(items);
    if (!on) return;
    beep();
    if (navigator.vibrate) try { navigator.vibrate([200, 100, 200]); } catch (e) { /* not supported */ }
    if (canSystem() && Notification.permission === "granted") {
      for (const x of items.slice(0, 3)) {
        try {
          const n = new Notification(x.title, { body: x.body, tag: x.tag, icon: "/icons/icon-192.png" });
          n.onclick = () => { window.focus(); if (x.area && window.__fsOpenArea) window.__fsOpenArea(x.area, x.group); n.close(); };
        } catch (e) { /* some browsers only allow notifications from the service worker */ }
      }
    }
  }

  // what this person should hear about right now
  function snapshot(DATA) {
    const A = window.FSAuth, me = A && A.user(); if (!me || !DATA || !DATA.live) return null;
    const mine = (area) => (me.govs || []).includes((DATA.units.find(u => u.name === area) || {}).gov);
    const lv = {}, i = DATA.live.now;
    for (const [k, s] of Object.entries(DATA.live.levels)) { const a = k.split("|")[0]; if (mine(a) && "YR".includes(s[i])) lv[k] = s[i]; }
    const silent = new Set((DATA.silent || []).filter(x => mine(x.area)).map(x => x.code));
    const waiting = me.role === "admin" ? A.waitingFor() : 0, decided = me.role === "inspector" ? A.unseenUpdates() : 0;
    return { user: me.u, world: DATA.world_id, lv, silent, waiting, decided };
  }

  function check(DATA) {
    const cur = snapshot(DATA); if (!cur) return;
    const AR = { "Stomach": "المعدة", "Fever / flu": "حرارة / إنفلونزا", "Throat / chest": "الحلق / الصدر", "Skin": "الجلد" };
    if (prev && prev.user === cur.user && prev.world === cur.world) {
      const items = [];
      for (const [k, L] of Object.entries(cur.lv)) {
        const before = prev.lv[k] || "N";
        if (RANK[L] > RANK[before]) {
          const [area, group] = k.split("|");
          items.push({ level: L, area, group, tag: "lv-" + k, title: `${L === "R" ? "🔴" : "🟡"} ${t(L)}: ${area}`, body: `${lang() === "ar" ? AR[group] : group} · Foreshock` });
        }
      }
      for (const code of cur.silent) if (!prev.silent.has(code)) {
        const x = (DATA.silent || []).find(s => s.code === code);
        items.push({ level: "D", area: x.area, tag: "sil-" + code, title: `📵 ${t("silent")}: ${code}`, body: `${x.area} · ${x.hours} h` });
      }
      if (cur.waiting > prev.waiting) items.push({ tag: "rep", title: `📨 ${t("rep")}`, body: "Foreshock · Inbox" });
      if (cur.decided > prev.decided) items.push({ tag: "dec", title: `✅ ${t("dec")}`, body: "Foreshock · Inbox" });
      deliver(items);
    }
    prev = cur;
  }

  // the bell next to "Sign out"
  window.__fsBell = () => {
    const who = $("who"); if (!who || !window.FSAuth?.user()) return;
    let b = $("bellBtn");
    if (!b) { b = document.createElement("button"); b.type = "button"; b.id = "bellBtn"; b.className = "btn sm bell"; who.insertBefore(b, $("signOut")); }
    b.textContent = on ? "🔔" : "🔕"; b.title = on ? t("on") : t("off"); b.setAttribute("aria-label", b.title); b.setAttribute("aria-pressed", on);
    b.onclick = async () => {
      on = !on;
      try { localStorage.setItem(KEY, on ? "1" : "0"); } catch (e) { /* fine */ }
      if (on) {
        beep();                                    // a tap unlocks sound on phones
        let msg = canSystem() ? t("enabled") : t("enabledPhone");
        if (canSystem() && Notification.permission === "default") { try { await Notification.requestPermission(); } catch (e) { /* ignore */ } }
        if (canSystem() && Notification.permission === "denied") msg = t("blocked");
        window.__fsToast && window.__fsToast(msg);
      }
      window.__fsBell();
    };
  };
  window.__fsWatch = (DATA) => { try { check(DATA); } catch (e) { /* never break the dashboard */ } window.__fsBell(); };
})();
