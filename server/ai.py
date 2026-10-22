"""
FORESHOCK'S WRITING AI (no API keys)
====================================
Three jobs that need words, not just numbers:
  - drafting the reason for a manual override, with a second opinion
  - writing the weekly briefing for the Ministry
  - answering questions in "Ask Foreshock" and "Explain this alert"

Two engines, tried in this order:
  1. A free AI model running on this computer through Ollama (https://ollama.com).
     No account, no key, no internet once it's downloaded. Default model: qwen2.5:3b
     (about 2 GB, good at Arabic and English). Only area-level numbers go in.
  2. Built-in rules and templates, when Ollama isn't installed or running.

The person always reads, edits and decides. Standard library only.
"""
import json, os, re, socket, ssl, sys, threading, time, urllib.parse, urllib.request, urllib.error

LV = {"N": "Normal", "W": "Watch", "Y": "Yellow", "R": "Red"}
LV_AR = {"N": "طبيعي", "W": "مراقبة", "Y": "أصفر", "R": "أحمر"}
RANK = {"N": 0, "W": 1, "Y": 2, "R": 3}
DEFAULT_MODEL = "qwen2.5:3b"
MODELS = [("qwen2.5:3b", "Qwen 2.5 3B (recommended, ~2 GB)"), ("qwen2.5:1.5b", "Qwen 2.5 1.5B (faster, ~1 GB)"), ("llama3.2:3b", "Llama 3.2 3B (~2 GB, weaker Arabic)")]


def ssl_context():
    """Python from python.org on a Mac ships without trusted certificates until you run its
    "Install Certificates" step. macOS keeps a copy in /etc/ssl/cert.pem, so load that too."""
    ctx = ssl.create_default_context()
    for p in ("/etc/ssl/cert.pem", "/etc/ssl/certs/ca-certificates.crt", "/opt/homebrew/etc/openssl@3/cert.pem", "/usr/local/etc/openssl@3/cert.pem"):
        if sys.platform != "win32" and os.path.exists(p):
            try: ctx.load_verify_locations(p); break
            except Exception: pass
    try:
        import certifi                      # if it happens to be installed
        ctx.load_verify_locations(certifi.where())
    except Exception: pass
    return ctx


def net_reason(e):
    """Say what really went wrong with a connection, in plain words."""
    r = getattr(e, "reason", e)
    txt = str(r)
    if isinstance(r, ssl.SSLCertVerificationError) or "CERTIFICATE_VERIFY_FAILED" in txt:
        return ("Python couldn't check the AI service's security certificate. On a Mac: open Applications > Python 3.x and "
                "double-click \"Install Certificates.command\", then restart Foreshock.")
    if isinstance(r, socket.gaierror) or "nodename nor servname" in txt or "Name or service not known" in txt or "getaddrinfo" in txt:
        return "This computer couldn't find the AI service. Check the internet connection (and that no VPN or school filter blocks it)."
    if isinstance(r, (socket.timeout, TimeoutError)) or "timed out" in txt:
        return "The AI service took too long to answer. Try again."
    if isinstance(r, ssl.SSLError):
        return f"A secure connection couldn't be made ({txt[:120]}). A VPN, antivirus or school network may be getting in the way."
    return f"Couldn't connect to the AI service ({txt[:120]})."


# ---------------------------------------------------------------- the local AI (Ollama)
class Settings:
    """Which local model to use (kept in data/ai.json; no keys anywhere)."""
    def __init__(self, path):
        self.path = path
        self.host = os.environ.get("OLLAMA_HOST", "http://127.0.0.1:11434").rstrip("/")
        if not self.host.startswith("http"): self.host = "http://" + self.host
        self.pull = {"running": False, "done": 0, "total": 0, "status": "", "error": ""}
        self._st, self._st_at = None, 0

    def load(self):
        try: s = json.load(open(self.path, encoding="utf-8"))
        except Exception: s = {}
        s.pop("key", None)                          # older versions stored an API key: never used again
        if s.get("model") not in [m for m, _ in MODELS]: s["model"] = DEFAULT_MODEL
        return s

    def save(self, model=None, enabled=None):
        s = self.load()
        if model: s["model"] = model
        if enabled is not None: s["enabled"] = bool(enabled)
        tmp = self.path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f: json.dump(s, f)
        os.replace(tmp, self.path)
        self._st = None

    def _get(self, path, timeout=2):
        with urllib.request.urlopen(self.host + path, timeout=timeout) as r: return json.loads(r.read())

    def status(self, fresh=False):
        """Is Ollama running here, and is the model downloaded? (cached for 10 s)"""
        if self._st and not fresh and time.time() - self._st_at < 10 and not self.pull["running"]: return dict(self._st, pull=dict(self.pull))
        s = self.load(); out = {"engine": "offline", "model": s["model"], "models": MODELS, "enabled": s.get("enabled", True), "host": self.host}
        try:
            names = [m.get("name", "") for m in self._get("/api/tags").get("models", [])]
            out["ollama"] = True; out["installed"] = names
            out["ready"] = s["model"] in names or (s["model"] + ":latest") in names
            if out["ready"] and out["enabled"]: out["engine"] = "local"
        except Exception:
            out["ollama"] = False; out["ready"] = False
        self._st, self._st_at = out, time.time()
        return dict(out, pull=dict(self.pull))

    def public(self): return self.status()

    def start_pull(self):
        """Download the model through Ollama in the background (about 2 GB, once)."""
        if self.pull["running"]: return
        model = self.load()["model"]; self.pull = {"running": True, "done": 0, "total": 0, "status": "starting", "error": ""}
        def run():
            try:
                req = urllib.request.Request(self.host + "/api/pull", data=json.dumps({"name": model, "stream": True}).encode(), method="POST",
                                             headers={"content-type": "application/json"})
                with urllib.request.urlopen(req, timeout=3600) as r:
                    for line in r:
                        try: j = json.loads(line)
                        except Exception: continue
                        if j.get("error"): self.pull["error"] = j["error"]; break
                        self.pull["status"] = j.get("status", "")
                        if j.get("total"): self.pull["total"], self.pull["done"] = j["total"], j.get("completed", 0)
            except Exception as e:
                self.pull["error"] = str(e)[:200]
            self.pull["running"] = False; self._st = None
        threading.Thread(target=run, daemon=True).start()

    def chat(self, system, user, timeout=90, as_json=True):
        """One answer from the local model, or an exception."""
        s = self.load()
        body = {"model": s["model"], "stream": False, "options": {"temperature": 0.3},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}]}
        if as_json: body["format"] = "json"
        req = urllib.request.Request(self.host + "/api/chat", data=json.dumps(body).encode(), method="POST", headers={"content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.loads(r.read()).get("message", {}).get("content", "")


def _ready(settings):
    return settings.status()["engine"] == "local"


def _json(text):
    m = re.search(r"\{.*\}", text or "", re.S)
    return json.loads(m.group(0)) if m else {}


def _why(e):
    if isinstance(e, (urllib.error.URLError, OSError)): return "the local AI didn't answer in time"
    return f"the local AI's reply couldn't be read ({type(e).__name__})"


# ---------------------------------------------------------------- the facts both engines use
def describe(f, lang):
    """Plain-language facts, one per line (also what the local AI receives)."""
    ar = lang == "ar"
    L = []
    L.append(f"Area: {f['place']} · Illness group: {f['group']} · Time: day {f['day']} {f['hour']:02d}:00 (simulated)")
    L.append(f"Foreshock's own level now: {LV[f['sys']]}" + (f" since day {f['since'][0]} {f['since'][1]:02d}:00" if f.get("since") else ""))
    if f.get("override"):
        o = f["override"]
        L.append(f"Active human override: {LV[o['level']]} set by {o['by']} ({o['role']}). Reason given: \"{o['reason']}\"")
    L.append(f"Requested change: {LV[f['current']]} -> {LV[f['target']]} by a {f['role']}")
    for m in f["meds"]:
        L.append(f"  {m['name']}: {m['sold']} sold so far today, about {m['expected']:.0f} expected by now, {m['z']:+.1f} wobbles"
                 + (f" (expected raised x{m['adj']:.2f} for a known event)" if m.get("adj") and m["adj"] != 1 else ""))
    if f.get("clinic") is not None:
        c = f["clinic"]
        L.append(f"  Clinic visits (Hakeem) for {f['group'].lower()}: {c['visits']} so far, about {c['expected']:.0f} expected, {c['z']:+.1f} wobbles")
    for d in f.get("days", []):
        L.append(f"  Day {d['day']}: {LV[d['level']]} (medicines {d['sold']} vs {d['expected']:.0f} expected; clinics {d['visits']} vs {d['cexp']:.0f})")
    if f.get("events"): L.append("Known events today: " + "; ".join(f["events"]))
    if f.get("neighbors"): L.append("Neighbouring areas on alert for this group: " + ", ".join(f["neighbors"]))
    else: L.append("No neighbouring area is on alert for this group.")
    if f.get("reports"): L.append("Inspector reports: " + " | ".join(f["reports"]))
    return "\n".join(L)


# ---------------------------------------------------------------- engine 1: Claude
SYSTEM = """You help public-health inspectors and Ministry of Health admins in Jordan use Foreshock, an outbreak early-warning system that watches pharmacy medicine sales and clinic visits per area. All data is from a student simulation.

A person wants to manually override the alert level for one area. You get the numbers. Do two things:
1. Draft the reason they will save in the audit log: 1-2 short factual sentences in the person's voice, citing the specific numbers that support the change. If the numbers do not support it, draft a neutral reason that states what they saw and leave space for their own evidence (e.g. "[add what you found on site]").
2. Give a short second opinion: "supports" if the data backs the change, "caution" if it argues against it (for example: standing down while clinic visits are high, or raising with no rise at all). Explain in one sentence.

Rules: never invent facts that are not in the data (no restaurant names, no lab results). Use "wobbles" for z-scores. Plain words, no jargon. Reply ONLY with JSON: {"reason": "...", "verdict": "supports" or "caution", "advice": "..."}"""


# ---------------------------------------------------------------- engine 2: built-in rules (offline)
def offline(f, lang):
    ar = lang == "ar"
    up = sorted([m for m in f["meds"] if m["z"] >= 3], key=lambda m: -m["z"])
    raised = [m for m in f["meds"] if m["z"] >= 2]
    c = f.get("clinic")
    clinic_up = c is not None and c["z"] >= 3
    raising = RANK[f["target"]] > RANK[f["current"]]
    vs = "مقابل" if ar else "vs"
    meds_txt = ("، " if ar else ", ").join(f"{m['name']} {m['sold']} {vs} ~{m['expected']:.0f}" for m in (up or raised)[:3])
    clinic_txt = (f"زيارات العيادات {c['visits']} مقابل ~{c['expected']:.0f}" if ar else f"clinic visits {c['visits']} vs ~{c['expected']:.0f}") if c else ""
    nb = f.get("neighbors") or []

    if raising:
        evidence = bool(up or clinic_up or nb)
        if f["target"] == "R":
            if ar:
                reason = "رفع إلى أحمر: " + (f"{meds_txt}" if meds_txt else "لا ارتفاع واضح في الأدوية بعد") + (f"، و{clinic_txt}" if clinic_txt else "") + ". [أضف ما وجدته في الموقع]"
            else:
                reason = "Raising to red: " + (meds_txt if meds_txt else "no clear rise in medicines yet") + (f"; {clinic_txt}" if clinic_txt else "") + ". [add what you found on site]"
        else:
            if ar:
                reason = "رفع إلى أصفر للمتابعة: " + (meds_txt if meds_txt else "الأرقام ما زالت طبيعية") + (f"؛ مناطق مجاورة في حالة تنبيه: {'، '.join(nb)}" if nb else "") + ". [أضف سببك]"
            else:
                reason = "Raising to yellow to keep watch: " + (meds_txt if meds_txt else "numbers still look normal") + (f"; neighbouring areas on alert: {', '.join(nb)}" if nb else "") + ". [add your reason]"
        if f["target"] == "R" and not clinic_up:
            verdict = "caution"
            advice = "العيادات لم تؤكد بعد. الأحمر يعني أن العيادات تؤكد، فتأكد من وجود دليل ميداني." if ar else "Clinics haven't confirmed yet. Red normally means clinics confirm, so make sure you have evidence from the field."
        elif evidence:
            verdict = "supports"
            advice = "الأرقام تدعم الرفع." if ar else "The numbers back this up."
        else:
            verdict = "caution"
            advice = "لا يوجد ارتفاع في الأرقام. هذا جيد إن كان لديك معلومات ميدانية، لكن اذكرها في السبب." if ar else "Nothing is rising in the numbers. That's fine if you have information from the field, but say what it is in the reason."
    else:
        target_txt = (LV_AR if ar else LV)[f["target"]]
        events = f.get("events") or []
        if ar:
            reason = f"خفض إلى {target_txt}: " + (f"الارتفاع يطابق حدثاً معروفاً ({'؛ '.join(events)})" if events and not clinic_up else (clinic_txt if c else "تم التحقق")) + ". [أضف ما وجدته]"
        else:
            reason = f"Lowering to {target_txt.lower()}: " + (f"the rise matches a known event ({'; '.join(events)})" if events and not clinic_up else (f"{clinic_txt}" if c else "checked")) + ". [add what you found]"
        if clinic_up:
            verdict = "caution"
            advice = "زيارات العيادات مرتفعة الآن. خفض التنبيه قد يُفوّت تفشّياً حقيقياً." if ar else "Clinic visits are high right now. Standing this down could miss a real outbreak."
        elif up:
            verdict = "caution"
            advice = "مبيعات الأدوية ما زالت مرتفعة. إن خفضته، سيعود Foreshock للتنبيه إذا ساءت الأمور." if ar else "Medicine sales are still high. If you lower it, Foreshock will speak up again if it gets worse."
        else:
            verdict = "supports"
            advice = "الأرقام عادت قريبة من الطبيعي." if ar else "The numbers are back near normal."
    return {"reason": reason[:300], "verdict": verdict, "advice": advice, "engine": "offline"}


def draft(f, lang, settings):
    """Override reason + second opinion: local AI first, then the built-in rules."""
    if _ready(settings):
        try:
            want = "Arabic (Modern Standard Arabic as used in Jordan)" if lang == "ar" else "English"
            j = _json(settings.chat(SYSTEM, f"Write the reason and the advice in {want}.\n\n{describe(f, lang)}", timeout=60))
            if not j.get("reason"): raise ValueError("no reason")
            return {"reason": str(j["reason"])[:300], "verdict": "caution" if j.get("verdict") == "caution" else "supports",
                    "advice": str(j.get("advice", ""))[:300], "engine": "local", "model": settings.load()["model"]}
        except Exception as e:
            out = offline(f, lang); out["fallback"] = _why(e); return out
    return offline(f, lang)


def test(settings):
    st = settings.status(fresh=True)
    if not st["ollama"]: return {"ok": False, "message": "Ollama isn't running on this computer. Install it from ollama.com, open it, then press Test again."}
    if not st["ready"]: return {"ok": False, "message": f"Ollama is running, but the model {st['model']} isn't downloaded yet. Press Download model."}
    try:
        t = time.time(); settings.chat("Reply with JSON.", 'Reply with {"ok": true}', timeout=180)
        return {"ok": True, "message": f"The local AI ({st['model']}) answered in {time.time() - t:.1f} s."}
    except Exception as e:
        return {"ok": False, "message": "Ollama is running but didn't answer: " + str(e)[:150]}


# ---------------------------------------------------------------- weekly briefing for the ministry
BRIEF_SYSTEM = """You write the weekly outbreak briefing for Jordan's Ministry of Health, from Foreshock, an early-warning system that watches pharmacy medicine sales and clinic visits. The data is from a student simulation; say "in our simulation" once.

Use ONLY the facts given. Never invent places, numbers, names or lab results. Be short, plain and specific (area names, numbers, days). Readers are busy officials.

Reply ONLY with JSON:
{"headline": "one sentence: the most important thing this week",
 "situation": ["3 to 5 bullets: what happened this week"],
 "watch": ["2 or 3 bullets: what to watch next week, including calendar or weather effects if given"],
 "actions": ["3 to 5 bullets: concrete recommended actions, each starting with a verb"]}"""


def _brief_offline(b, lang):
    ar = lang == "ar"
    cur, new = b["current"], b["new"]
    reds = [x for x in cur if x["level"] == "R"]; yel = [x for x in cur if x["level"] == "Y"]
    nm = lambda x: f"{x['place']} ({x['group_ar' if ar else 'group']})"
    if ar:
        head = (f"{len(reds)} تنبيه أحمر و{len(yel)} أصفر الآن" + (f"؛ الأخطر: {nm(reds[0])}." if reds else ".")) if cur else "لا تنبيهات نشطة هذا الأسبوع."
        sit = [f"{'أحمر' if x['level'] == 'R' else 'أصفر'}: {nm(x)} منذ {x['since']}" + (" (تعديل يدوي)" if x["manual"] else "") for x in cur[:5]]
        sit += [f"تنبيه جديد هذا الأسبوع: {nm(x)} ({x['when']})" for x in new if not any(c["place"] == x["place"] and c["group"] == x["group"] for c in cur)][:2]
        if b["overrides"]: sit.append(f"{len(b['overrides'])} تعديل يدوي هذا الأسبوع.")
        if b["silent"]: sit.append(f"{len(b['silent'])} صيدلية صامتة: قد تبدو مناطقها أهدأ من حقيقتها.")
        watch = [f"{e['name_ar']} ({e['start']})" for e in b["upcoming"][:2]] + ([f"تحذيرات مخزون: {b['supply']}"] if b["supply"] else [])
        act = ["أرسل فرق التفتيش إلى " + "، ".join(x["place"] for x in reds[:3])] if reds else []
        act += ["تابع المراكز الصحية في " + "، ".join(x["place"] for x in yel[:3])] if yel else []
        act += ["أعد توصيل الصيدليات الصامتة: " + "، ".join(s["code"] for s in b["silent"][:3])] if b["silent"] else []
        act += ["أرسل الشحنات المقترحة في تبويب المخزون"] if b["supply"] else []
    else:
        head = (f"{len(reds)} red and {len(yel)} yellow alerts right now" + (f"; most serious: {nm(reds[0])}." if reds else ".")) if cur else "No active alerts this week."
        sit = [f"{'Red' if x['level'] == 'R' else 'Yellow'}: {nm(x)} since {x['since']}" + (" (set by hand)" if x["manual"] else "") for x in cur[:5]]
        sit += [f"New alert this week: {nm(x)} ({x['when']})" for x in new if not any(c["place"] == x["place"] and c["group"] == x["group"] for c in cur)][:2]
        if b["overrides"]: sit.append(f"{len(b['overrides'])} manual override{'s' if len(b['overrides']) != 1 else ''} this week.")
        if b["silent"]: sit.append(f"{len(b['silent'])} pharmacy till{'s' if len(b['silent']) != 1 else ''} silent: those areas may look calmer than they are.")
        watch = [f"{e['name']} ({e['start']}): sales ×{e['factor']}" for e in b["upcoming"][:2]] + ([f"Supply warnings: {b['supply']}"] if b["supply"] else [])
        act = ["Send inspection teams to " + ", ".join(x["place"] for x in reds[:3])] if reds else []
        act += ["Follow up with health centres in " + ", ".join(x["place"] for x in yel[:3])] if yel else []
        act += ["Reconnect silent pharmacies: " + ", ".join(s["code"] for s in b["silent"][:3])] if b["silent"] else []
        act += ["Send the suggested deliveries in the Supply tab"] if b["supply"] else []
    return {"headline": head, "situation": sit or (["لا أحداث تُذكر."] if ar else ["Nothing notable."]), "watch": watch or (["لا شيء خاص."] if ar else ["Nothing special."]),
            "actions": act or (["استمر في المراقبة المعتادة."] if ar else ["Keep normal monitoring."]), "engine": "offline"}


def brief_text(b):
    L = [f"Period: {b['from']} to {b['to']} · Scope: {b['scope']}"]
    L.append("Alerts now: " + ("; ".join(f"{x['place']} {x['group']} {'RED' if x['level'] == 'R' else 'YELLOW'} since {x['since']}" + (" (manual override)" if x["manual"] else "") for x in b["current"]) or "none"))
    L.append("New alerts this week: " + ("; ".join(f"{x['place']} {x['group']} {x['level_name']} at {x['when']}" for x in b["new"]) or "none"))
    for k, v in b["trend"].items(): L.append(f"Medicine sales, {k}: this week {v[0]} boxes, last week {v[1]} ({'+' if v[0] >= v[1] else ''}{round((v[0] - v[1]) / max(v[1], 1) * 100)}%)")
    if b["overrides"]: L.append("Manual overrides: " + "; ".join(b["overrides"]))
    if b["reports"]: L.append("Inspector reports: " + "; ".join(b["reports"]))
    if b["visits"]: L.append("Field visits: " + "; ".join(b["visits"]))
    L.append(f"Supply warnings today: {b['supply'] or 'none'}")
    L.append("Silent pharmacy tills: " + (", ".join(f"{s['code']} ({s['area']}, {s['hours']} h)" for s in b["silent"]) or "none"))
    L.append("Coming up: " + ("; ".join(f"{e['name']} {e['start']}" + (f" to {e['end']}" if e["end"] != e["start"] else "") + f" (sales x{e['factor']})" for e in b["upcoming"][:3]) or "nothing"))
    if b["hot"]: L.append("Hot days ahead (more ORS sales expected): " + b["hot"])
    return "\n".join(L)


def briefing(b, lang, settings):
    if _ready(settings):
        try:
            want = "Arabic (Modern Standard Arabic as used in Jordan)" if lang == "ar" else "English"
            j = _json(settings.chat(BRIEF_SYSTEM, f"Write the briefing in {want}.\n\n{brief_text(b)}", timeout=180))
            if not j.get("headline"): raise ValueError("no headline")
            clean = lambda xs: [str(x)[:300] for x in (xs or [])][:6]
            return {"headline": str(j["headline"])[:300], "situation": clean(j.get("situation")), "watch": clean(j.get("watch")), "actions": clean(j.get("actions")),
                    "engine": "local", "model": settings.load()["model"]}
        except Exception as e:
            out = _brief_offline(b, lang); out["fallback"] = _why(e); return out
    return _brief_offline(b, lang)


# ---------------------------------------------------------------- Ask Foreshock / Explain this alert
ASK_SYSTEM = """You are Foreshock's assistant for Jordan's Ministry of Health and its health inspectors. Foreshock is an outbreak early-warning system that watches pharmacy medicine sales and clinic visits per area. The data is from a student simulation.

Answer the question using ONLY the facts given. If the facts don't contain the answer, say so plainly. Never invent places, numbers, names or lab results. Be short: 2 to 5 sentences, or up to 5 bullets for lists. Name areas and give numbers. Answer in the language of the question.

Reply ONLY with JSON: {"answer": "..."}"""


def ask(question, facts_text, lang, settings, offline_answer):
    """Answer from the local AI if it's here, else the built-in template answer."""
    if _ready(settings):
        try:
            j = _json(settings.chat(ASK_SYSTEM, f"Facts:\n{facts_text}\n\nQuestion: {question}", timeout=90))
            if not j.get("answer"): raise ValueError("no answer")
            return {"answer": str(j["answer"])[:1500], "engine": "local", "model": settings.load()["model"]}
        except Exception as e:
            return {"answer": offline_answer, "engine": "offline", "fallback": _why(e)}
    return {"answer": offline_answer, "engine": "offline"}
