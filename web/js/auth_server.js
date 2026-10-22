/* ============================================================================
   FORESHOCK ACCOUNTS (server edition): the same screens as the app, but every
   sign-in, report and account change goes to the Foreshock server and its database.
   ========================================================================== */
window.FSAuth = (() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  const GOVS = (window.FS_GEO?.govs || []).map(g => ({ name: g.name, ar: g.ar }));
  const ALL = GOVS.map(g => g.name);
  const DEMO_PW = "foreshock";
  // the demo accounts the server creates on first start (shown on the sign-in screen)
  const DEMO = [
    { u: "admin", name: "Dr. Rania Saleh", name_ar: "د. رانيا صالح", role: "admin", title: "Outbreak desk, Ministry of Health", title_ar: "مكتب الأوبئة، وزارة الصحة", govs: ALL },
    { u: "admin.north", name: "Omar Khalil", name_ar: "عمر خليل", role: "admin", title: "North region, Ministry of Health", title_ar: "إقليم الشمال، وزارة الصحة", govs: ["Irbid", "Ajloun", "Jerash", "Mafraq"] },
    { u: "inspector.amman", name: "Lina Haddad", name_ar: "لينا حداد", role: "inspector", govs: ["Amman"] },
    { u: "inspector.north", name: "Yazan Odeh", name_ar: "يزن عودة", role: "inspector", govs: ["Irbid", "Ajloun", "Jerash"] },
    { u: "inspector.east", name: "Hala Nasser", name_ar: "هلا ناصر", role: "inspector", govs: ["Zarqa", "Mafraq"] },
    { u: "inspector.central", name: "Sami Qasem", name_ar: "سامي قاسم", role: "inspector", govs: ["Balqa", "Madaba"] },
    { u: "inspector.south", name: "Fares Tarawneh", name_ar: "فارس الطراونة", role: "inspector", govs: ["Karak", "Tafilah", "Ma'an", "Aqaba"] },
  ];
  let me = null, accounts = [], reports = [], visits = [];

  async function api(method, path, body) {
    const r = await fetch(path, { method, credentials: "same-origin", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    let j = {}; try { j = await r.json(); } catch (e) { /* empty reply */ }
    if (!r.ok) { const err = new Error(j.message || r.statusText || "Request failed"); err.code = j.error; err.status = r.status; throw err; }
    return j;
  }
  async function refresh() { const s = await api("GET", "/api/state"); me = s.me; accounts = s.accounts; reports = s.reports; visits = s.field_visits || []; return s; }
  const changed = async () => { try { await refresh(); } catch (e) { /* next poll retries */ } if (window.__fsAuthChanged) window.__fsAuthChanged(); };
  const toast = (m) => { if (window.__fsToast) window.__fsToast(m); else console.warn(m); };

  const user = () => me;
  const isAdmin = () => me?.role === "admin";
  const find = (u) => accounts.find(a => a.u === u) || (me && me.u === u ? me : null);
  const covers = (acc, gov) => !!acc && (acc.govs || []).includes(gov);
  const admins = () => accounts.filter(a => a.role === "admin" && a.active);
  const defaultAdminFor = (gov) => admins().filter(a => covers(a, gov)).sort((x, y) => x.govs.length - y.govs.length)[0] || admins()[0];
  const reportFor = (world, area, group) => reports.filter(r => r.area === area && r.group === group).slice(-1)[0] || null;
  const inbox = (world, all) => (me?.role === "admin" ? reports.filter(r => all || r.to === me.u) : reports.filter(r => r.by === me?.u)).slice().reverse();
  const waitingFor = () => me?.role === "admin" ? reports.filter(r => r.to === me.u && r.status === "waiting").length : 0;
  const unseenUpdates = () => me?.role === "inspector" ? reports.filter(r => r.by === me.u && r.admin && !r.seen).length : 0;
  function markSeen() { if (!unseenUpdates()) return; reports.forEach(r => { if (r.admin) r.seen = true; }); api("POST", "/api/reports/seen", {}).then(changed, () => {}); }
  function submit(o) {
    api("POST", "/api/reports", { area: o.area, group: o.group, level: o.level, decision: o.decision, note: o.note, to: o.to }).then(changed, e => toast(e.message));
    return true;
  }
  function decide(id, action) { api("POST", `/api/reports/${id}/decide`, { action }).then(changed, e => toast(e.message)); }
  async function login(u, p) {
    try { await api("POST", "/api/login", { username: u, password: p }); await refresh(); return { ok: true }; }
    catch (e) { return { ok: false, err: e.code || "wrong", message: e.code === "wrong" ? t("wrong") : e.code === "inactive" ? t("inactive") : e.message }; }
  }
  async function logout() { me = null; reports = []; try { await api("POST", "/api/logout", {}); } catch (e) { /* already out */ } }
  async function addAccount(o) {
    try { await api("POST", "/api/accounts", o); await changed(); return { ok: true }; }
    catch (e) { return { ok: false, err: e.code || "bad", message: e.message }; }
  }
  const setActive = (u, on) => api("POST", `/api/accounts/${u}/active`, { on }).then(changed);
  const resetPassword = (u) => api("POST", `/api/accounts/${u}/reset`, {}).then(async (r) => { await changed(); return r; });
  const removeAccount = (u) => api("DELETE", `/api/accounts/${u}`).then(changed);
  const resetDemo = () => api("POST", "/api/accounts/reset-demo", {});

  /* ---------- text ---------- */
  const L = {
    en: { signIn: "Sign in", welcome: "Sign in to Foreshock", sub: "National outbreak early warning for Jordan's Ministry of Health inspectors and outbreak desk.",
      user: "Username", pw: "Password", go: "Sign in", wrong: "That username and password don't match. Try a demo account below.", inactive: "This account has been switched off by an admin.",
      demo: "Demo accounts", demoNote: "Click one to fill it in. Every demo password is", proto: "Student prototype running on your Foreshock server. Passwords are stored hashed (scrypt). Change the demo passwords before showing it to anyone outside your team.",
      admin: "Admin", inspector: "Inspector", f1: "Pharmacy sales checked every hour", f2: "Clinic visits confirm the warning", f3: "Inspectors confirm, the Ministry decides",
      team: "Team", teamLead: "Who can sign in, and which governorates each inspector covers. Reports from an inspector go to the admin they choose.",
      name: "Name", role: "Role", govs: "Governorates", status: "Status", active: "Active", off: "Switched off", you: "you",
      add: "Add an account", create: "Create account", newPw: "Password (6+ characters)", allGovs: "All 12",
      switchOff: "Switch off", switchOn: "Switch on", reset: "Reset password", del: "Delete", sure: "Click again to delete", resetDone: "New one-time password:", resetOnce: "write it down, it won't be shown again",
      badUser: "Usernames use 3–32 lowercase letters, numbers, dots or dashes.", takenUser: "That username is taken.", noName: "Add a name.", shortPw: "Use at least 6 characters.", noGov: "Pick at least one governorate.", added: "Account created.",
      resetDemo: "Reset all demo accounts and reports", resetDemoSure: "Click again to reset everything" },
    ar: { signIn: "تسجيل الدخول", welcome: "تسجيل الدخول إلى Foreshock", sub: "نظام وطني للإنذار المبكر بالأوبئة لمفتشي وزارة الصحة ومكتب الأوبئة.",
      user: "اسم المستخدم", pw: "كلمة المرور", go: "دخول", wrong: "اسم المستخدم وكلمة المرور غير متطابقين. جرّب أحد الحسابات التجريبية أدناه.", inactive: "أوقف أحد المشرفين هذا الحساب.",
      demo: "حسابات تجريبية", demoNote: "اضغط على حساب لتعبئته. كلمة المرور لكل الحسابات التجريبية", proto: "نموذج طلابي يعمل على خادم Foreshock الخاص بك. كلمات المرور محفوظة مشفّرة (scrypt). غيّر كلمات المرور التجريبية قبل عرضه على أي شخص خارج فريقك.",
      admin: "مشرف", inspector: "مفتش", f1: "مبيعات الصيدليات تُفحص كل ساعة", f2: "زيارات العيادات تؤكّد التحذير", f3: "المفتشون يؤكّدون والوزارة تقرّر",
      team: "الفريق", teamLead: "من يستطيع الدخول، وأي محافظات يغطيها كل مفتش. تذهب تقارير المفتش إلى المشرف الذي يختاره.",
      name: "الاسم", role: "الدور", govs: "المحافظات", status: "الحالة", active: "فعّال", off: "موقوف", you: "أنت",
      add: "إضافة حساب", create: "إنشاء الحساب", newPw: "كلمة المرور (6 أحرف أو أكثر)", allGovs: "الكل (12)",
      switchOff: "إيقاف", switchOn: "تفعيل", reset: "إعادة تعيين كلمة المرور", del: "حذف", sure: "اضغط مرة أخرى للحذف", resetDone: "كلمة مرور جديدة لمرة واحدة:", resetOnce: "دوّنها، لن تظهر مرة أخرى",
      badUser: "اسم المستخدم من 3 إلى 32 حرفاً إنجليزياً صغيراً أو أرقاماً أو نقاطاً أو شرطات.", takenUser: "اسم المستخدم مستخدم.", noName: "أضف اسماً.", shortPw: "استخدم 6 أحرف على الأقل.", noGov: "اختر محافظة واحدة على الأقل.", added: "أُنشئ الحساب.",
      resetDemo: "إعادة ضبط كل الحسابات والتقارير التجريبية", resetDemoSure: "اضغط مرة أخرى لإعادة الضبط" },
  };
  let lang = "en";
  const t = (k) => L[lang][k] ?? L.en[k] ?? k;
  const nameOf = (a) => !a ? "" : lang === "ar" && a.name_ar ? a.name_ar : a.name;
  const titleOf = (a) => !a ? "" : lang === "ar" ? (a.title_ar || (a.role === "admin" ? "وزارة الصحة" : "مفتش صحي")) : (a.title || (a.role === "admin" ? "Ministry of Health" : "Health inspector"));
  const govName = (g) => lang === "ar" ? (GOVS.find(x => x.name === g)?.ar || g) : g;
  const govList = (a) => a.govs.length === ALL.length ? t("allGovs") : a.govs.map(govName).join(lang === "ar" ? "، " : ", ");

  /* ---------- login screen ---------- */
  function renderLogin(l) {
    lang = l || lang;
    let el = document.getElementById("login");
    if (user()) { if (el) el.hidden = true; document.body.classList.remove("locked"); return; }
    if (!el) { el = document.createElement("div"); el.id = "login"; el.className = "login"; document.body.appendChild(el); }
    el.hidden = false; document.body.classList.add("locked");
    const demo = DEMO;
    el.innerHTML = `
      <div class="login-art">
        <div class="login-brand">
          <svg width="44" height="44" viewBox="0 0 100 100" aria-hidden="true"><rect width="100" height="100" rx="24" fill="#0B2A4A"/><path d="M50 55 L58 55 L64 26 L71 84 L78 34 L84 68 L88 55 L92 55" fill="none" stroke="#F5F7F6" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" opacity="0.32"/><path d="M8 55 L24 55" fill="none" stroke="#2BB3AB" stroke-width="7" stroke-linecap="round"/><path d="M24 55 L30 42 L36 68 L42 46 L46 58 L50 55" fill="none" stroke="#F2B705" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
          <div><b>Foreshock</b><span>${lang === "ar" ? "نشعر بالهزّة قبل الزلزال" : "Feel the tremor before the quake"}</span></div>
        </div>
        <svg class="login-quake" viewBox="0 0 400 120" preserveAspectRatio="none" aria-hidden="true"><path d="M0 60 H120 l8 -6 8 12 8 -10 8 8 H200 l6 -18 8 44 10 -70 10 84 9 -56 7 28 6 -12 H400" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        <ul class="login-feats"><li>${t("f1")}</li><li>${t("f2")}</li><li>${t("f3")}</li></ul>
      </div>
      <div class="login-panel">
        <div class="login-lang lang" role="group" aria-label="Language">
          <button type="button" data-l="en" aria-pressed="${lang === "en"}">EN</button><button type="button" data-l="ar" aria-pressed="${lang === "ar"}">عربي</button>
        </div>
        <form class="login-form" id="login-form" novalidate>
          <h1>${t("welcome")}</h1>
          <p class="sub">${t("sub")}</p>
          <label for="login-u">${t("user")}</label>
          <input id="login-u" name="username" autocomplete="off" autocapitalize="off" spellcheck="false" dir="ltr">
          <label for="login-p">${t("pw")}</label>
          <input id="login-p" name="password" type="password" autocomplete="off" dir="ltr">
          <p class="login-err" id="login-err" role="alert" hidden></p>
          <button type="submit" class="btn primary">${t("go")}</button>
        </form>
        <div class="login-demo">
          <h2>${t("demo")}</h2>
          <p class="note">${t("demoNote")} <code>${DEMO_PW}</code></p>
          <div class="demo-list">${demo.map(a => `<button type="button" class="demo-acc" data-u="${esc(a.u)}"><span class="pill ${a.role === "admin" ? "A" : "I"}">${a.role === "admin" ? t("admin") : t("inspector")}</span><b>${esc(nameOf(a))}</b><small>${esc(a.role === "admin" ? titleOf(a) : govList(a))}</small><code>${esc(a.u)}</code></button>`).join("")}</div>
        </div>
        <p class="login-proto">${t("proto")}</p>
      </div>`;
    el.querySelectorAll("[data-l]").forEach(b => b.onclick = () => { lang = b.dataset.l; if (window.__fsPrev) window.__fsPrev.lang = lang; document.documentElement.lang = lang; document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"; renderLogin(); });
    el.querySelectorAll(".demo-acc").forEach(b => b.onclick = () => { el.querySelector("#login-u").value = b.dataset.u; el.querySelector("#login-p").value = DEMO_PW; el.querySelector("#login-p").focus(); });
    el.querySelector("#login-form").onsubmit = async (e) => {
      e.preventDefault();
      const btn = el.querySelector("#login-form button[type=submit]"); btn.disabled = true;
      const r = await login(el.querySelector("#login-u").value, el.querySelector("#login-p").value);
      btn.disabled = false;
      if (!r.ok) { const er = el.querySelector("#login-err"); er.hidden = false; er.textContent = r.message || t(r.err); return; }
      el.hidden = true; document.body.classList.remove("locked");
      if (window.__fsAfterLogin) window.__fsAfterLogin();
    };
    setTimeout(() => el.querySelector("#login-u")?.focus(), 30);
  }

  /* ---------- team page (admins) ---------- */
  let teamMsg = "", armed = null;
  function renderTeam(el, l) {
    lang = l || lang; if (!el) return;
    const me = user();
    if (!me || me.role !== "admin") { el.innerHTML = ""; return; }
    const rows = accounts.slice().sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "admin" ? -1 : 1));
    el.innerHTML = `<div class="grid2">
      <div class="card"><h2><span>${t("team")}</span><span class="mono">${accounts.length}</span></h2><p class="note" style="margin:0 0 10px">${t("teamLead")}</p>
        <div class="tablewrap"><table class="t team"><thead><tr><th>${t("name")}</th><th>${t("role")}</th><th>${t("govs")}</th><th>${t("status")}</th><th></th></tr></thead><tbody>
        ${rows.map(a => `<tr><td><b>${esc(nameOf(a))}</b>${a.u === me.u ? ` <small>(${t("you")})</small>` : ""}<br><code class="mono">${esc(a.u)}</code></td>
          <td><span class="pill ${a.role === "admin" ? "A" : "I"}">${a.role === "admin" ? t("admin") : t("inspector")}</span></td>
          <td>${esc(govList(a))}</td>
          <td>${a.active ? t("active") : `<span style="color:var(--red-ink)">${t("off")}</span>`}</td>
          <td class="n"><span class="row-actions">${a.u === me.u ? "" : `
            <button type="button" class="btn sm" data-act="toggle" data-u="${esc(a.u)}">${a.active ? t("switchOff") : t("switchOn")}</button>
            <button type="button" class="btn sm" data-act="reset" data-u="${esc(a.u)}">${t("reset")}</button>
            <button type="button" class="btn sm danger" data-act="del" data-u="${esc(a.u)}">${armed === a.u ? t("sure") : t("del")}</button>`}</span></td></tr>`).join("")}
        </tbody></table></div>
        <p style="margin:12px 0 0"><button type="button" class="btn sm ghost" id="team-reset">${armed === "__all" ? t("resetDemoSure") : t("resetDemo")}</button></p>
      </div>
      <div class="card form"><h2><span>${t("add")}</span></h2>
        <form id="team-form" novalidate>
          <label class="row"><span>${t("name")}</span><input id="tf-name" autocomplete="off"></label>
          <label class="row"><span>${t("user")}</span><input id="tf-user" autocomplete="off" autocapitalize="off" spellcheck="false" dir="ltr" placeholder="inspector.madaba"></label>
          <label class="row"><span>${t("newPw")}</span><input id="tf-pw" type="text" autocomplete="off" dir="ltr"></label>
          <div class="row"><span>${t("role")}</span><div class="seg wide" id="tf-role" role="group"><button type="button" data-v="inspector" aria-pressed="true">${t("inspector")}</button><button type="button" data-v="admin" aria-pressed="false">${t("admin")}</button></div></div>
          <div class="row"><span>${t("govs")}</span><div class="govpick">${GOVS.map(g => `<label><input type="checkbox" value="${esc(g.name)}"> ${esc(govName(g.name))}</label>`).join("")}</div></div>
          ${teamMsg ? `<p class="note" role="status" style="margin:10px 0 0">${esc(teamMsg)}</p>` : ""}
          <div class="actions"><button type="submit" class="btn primary">${t("create")}</button></div>
        </form></div></div>`;
    let role = "inspector";
    el.querySelectorAll("#tf-role button").forEach(b => b.onclick = () => { role = b.dataset.v; el.querySelectorAll("#tf-role button").forEach(x => x.setAttribute("aria-pressed", x === b)); });
    el.querySelector("#team-form").onsubmit = async (e) => {
      e.preventDefault();
      const r = await addAccount({ name: el.querySelector("#tf-name").value, u: el.querySelector("#tf-user").value, pw: el.querySelector("#tf-pw").value, role,
        govs: [...el.querySelectorAll(".govpick input:checked")].map(i => i.value) });
      teamMsg = r.ok ? t("added") : (L[lang][r.err] ? t(r.err) : r.message); armed = null; renderTeam(el);
    };
    el.querySelectorAll("[data-act]").forEach(b => b.onclick = async () => {
      const u = b.dataset.u;
      try {
        if (b.dataset.act === "toggle") { const a = find(u); await setActive(u, !a.active); teamMsg = ""; armed = null; }
        if (b.dataset.act === "reset") { const r = await resetPassword(u); teamMsg = `${t("resetDone")} "${r.password}" (${u}) · ${t("resetOnce")}`; armed = null; }
        if (b.dataset.act === "del") { if (armed === u) { await removeAccount(u); armed = null; teamMsg = ""; } else armed = u; }
      } catch (err) { teamMsg = err.message; }
      renderTeam(el);
    });
    el.querySelector("#team-reset").onclick = async () => { if (armed === "__all") { await resetDemo(); armed = null; teamMsg = ""; location.reload(); } else { armed = "__all"; renderTeam(el); } };
  }

  return { user, isAdmin, covers, admins, defaultAdminFor, accounts: () => accounts.slice(), find, nameOf: (a) => nameOf(a), setLang: (l) => { lang = l; },
    fieldVisits: (area, group) => visits.filter(v => (!area || v.area === area) && (!group || v.group === group)).slice().reverse(),
    login, logout, submit, decide, reportFor, inbox, waitingFor, unseenUpdates, markSeen, renderLogin, renderTeam, refresh, api, DEMO_PW };
})();
