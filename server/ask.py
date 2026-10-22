"""
ASK FORESHOCK / EXPLAIN THIS ALERT
==================================
Turns a question ("where should I send inspectors first?", "why is Jubeiha red?") into:
  1. a short list of facts from the live system (alerts, tomorrow's risk, antibiotics,
     silent tills, supply, and one area's numbers when an area is asked about), and
  2. a built-in answer written from those facts by simple rules.

The local AI (ai.ask) gets the facts and writes a nicer answer. Without it, the built-in
answer is shown. Either way, every number comes from the system, never from the AI.
"""
import json, os, re

import texts as TX

_AR = {u["name"]: u.get("ar") or TX.AR_NAMES.get(u["name"], u["name"]) for u in json.load(open(os.path.join(os.path.dirname(__file__), "units.json"), encoding="utf-8"))}

LVN = {"R": "red", "Y": "yellow", "W": "watch", "N": "normal"}
LVN_AR = {"R": "أحمر", "Y": "أصفر", "W": "مراقبة", "N": "طبيعي"}

INTENTS = [
    ("risk", r"tomorrow|risk|next|predict|forecast|coming|غد|خطر|توقع|القادم|بكرا|بكرة"),
    ("abx", r"antibiotic|amoxi|zomax|azith|مضاد|اموكس|أموكس|زوماكس"),
    ("silent", r"silent|offline|quiet|till|not report|صامت|متوقف|منقطع|لا ترسل"),
    ("supply", r"supply|stock|shortage|run out|running low|مخزون|نقص|نفاد|ينفد"),
    ("priority", r"inspector|send|first|priority|where should|focus|مفتش|أرسل|ارسل|أولوية|اولوية|وين|أين"),
    ("alerts", r"alert|red|yellow|outbreak|warning|تنبيه|أحمر|احمر|أصفر|اصفر|تفش|إنذار|انذار"),
]


def intent(q):
    ql = q.lower()
    for name, rx in INTENTS:
        if re.search(rx, ql): return name
    return "summary"


def area_in(q, areas):
    """An area named in the question (English or Arabic name), longest name first."""
    ql = q.lower()
    for a in sorted(areas, key=len, reverse=True):
        if a.lower() in ql or (_AR.get(a) and _AR[a] in q): return a
    return None


def _name(a, ar): return _AR.get(a, a) if ar else a
def _grp(g, ar): return TX.AR_GROUP[g] if ar else g.lower()


def gather(P, govs, question, lang, area=None, grp=None, role="inspector", in_scope=None):
    """Everything the answer may use. Call with the server's lock held."""
    inscope = in_scope or (lambda a: True)
    b = P.briefing_facts(govs)
    risk = [r for r in P.risk() if inscope(r["area"])]
    abx = P.antibiotics(); abx_rows = [r for r in abx.get("rows", []) if inscope(r["area"])]
    named = area or area_in(question, [a for a in P.area_names() if inscope(a)])
    detail = None
    if named:
        groups = [grp] if grp else P.groups()
        detail = []
        eff = P.effective_levels()
        for g in groups:
            k = f"{named}|{g}"; lv = (eff.get(k) or "N")[-1]
            if grp or lv != "N" or any(r["area"] == named and r["group"] == g for r in risk):
                f = P.facts(named, g, lv, role)
                detail.append({"group": g, "level": lv, "facts": f, "bump": P.bumps.get(k)})
    return {"b": b, "risk": risk, "abx": abx_rows, "abx_median": abx.get("median"), "area": named, "detail": detail or []}


def facts_text(G, describe):
    b = G["b"]; L = [f"Time window: {b['from']} to {b['to']} (simulated data). Scope: {b['scope']}."]
    if b["current"]:
        L.append("Areas on alert now: " + "; ".join(f"{x['place']} {x['group']} {LVN[x['level']]} since {x['since']}" + (" (set by hand)" if x["manual"] else "") for x in b["current"]))
    else: L.append("No area is yellow or red right now.")
    if G["risk"]:
        L.append("Tomorrow's risk (Foreshock's model, chance of turning yellow/red within 48 h): " +
                 "; ".join(f"{r['area']} {r['group']} {round(r['p'] * 100)}% ({', '.join(r['why']) or 'small rise'})" for r in G["risk"][:6]))
    if G["abx"]:
        top = [r for r in G["abx"] if r["index"] >= 1.3][:5]
        if top: L.append(f"Antibiotics without a doctor (boxes per throat/chest clinic visit vs national middle {G['abx_median']}): " +
                         "; ".join(f"{r['area']} {r['index']}x, ~{r['extra']} extra boxes" for r in top))
    if b["silent"]: L.append("Pharmacy tills gone silent: " + "; ".join(f"{s['code']} in {s['area']} ({s['hours']} h)" for s in b["silent"]))
    if b["supply"]: L.append("Pharmacies about to run out: " + b["supply"])
    if b["hot"]: L.append("Heat: " + b["hot"])
    if b["upcoming"]: L.append("Coming up: " + "; ".join(e["name"] + " " + e["start"] for e in b["upcoming"]))
    for x in G["detail"]:
        L.append(""); L.append("\n".join(l for l in describe(x["facts"], "en").split("\n") if not l.startswith("Requested change")))
        L.append(f"Level shown to users now: {LVN[x['level']]}")
        if x["bump"]: L.append(f"After a false-alarm report, the alert bar for this area is raised until day {x['bump']['to']}.")
    return "\n".join(L)


def offline(G, question, lang, explain=False):
    ar = lang == "ar"; b = G["b"]; it = "explain" if explain else intent(question)
    J = "، " if ar else ", "
    if G["detail"] and (explain or it in ("summary", "alerts", "risk")):
        return _explain(G, ar)
    if it == "risk":
        if not G["risk"]: return "لا توجد منطقة بخطر واضح للغد حسب نموذج Foreshock." if ar else "Foreshock's model sees no area with a clear risk for the next 48 hours."
        head = "الأكثر عرضة للتحول إلى أصفر أو أحمر خلال 48 ساعة (نموذج Foreshock):" if ar else "Most likely to turn yellow or red in the next 48 hours (Foreshock's model):"
        return head + "\n" + "\n".join(f"• {_name(r['area'], ar)} · {_grp(r['group'], ar)}: {round(r['p'] * 100)}%" + (f" ({J.join(r['why_ar' if ar else 'why'])})" if r["why"] else "") for r in G["risk"][:5])
    if it == "abx":
        top = [r for r in G["abx"] if r["index"] >= 1.3][:5]
        if not top: return "لا توجد منطقة تشتري مضادات حيوية أكثر بكثير من المعتاد مقارنة بزيارات العيادات." if ar else "No area is buying far more antibiotics than its clinic visits would explain."
        head = "مناطق تشتري مضادات حيوية أكثر من المتوقع مقارنة بزيارات الحلق والصدر (غالباً دون وصفة):" if ar else "Areas buying more antibiotics than their throat/chest clinic visits explain (likely without a prescription):"
        return head + "\n" + "\n".join(f"• {_name(r['area'], ar)}: {r['index']}×" + (f"، ~{r['extra']} علبة زائدة" if ar else f", ~{r['extra']} extra boxes") for r in top) + \
            ("\nمقترح: زيارة توعوية للصيدليات في أعلى منطقة." if ar else "\nSuggestion: an awareness visit to pharmacies in the top area.")
    if it == "silent":
        if not b["silent"]: return "كل الصيدليات ترسل بياناتها." if ar else "Every pharmacy till is reporting."
        return ("صيدليات توقفت عن الإرسال (منطقتها قد تبدو أهدأ مما هي):\n" if ar else "Tills that have gone silent (their area may look calmer than it is):\n") + \
            "\n".join(f"• {s['code']} · {_name(s['area'], ar)}: {s['hours']} " + ("ساعة" if ar else "h") for s in b["silent"])
    if it == "supply":
        return (("صيدليات قد تنفد منها أدوية: " if ar else "Pharmacies about to run out: ") + b["supply"]) if b["supply"] else ("لا يوجد نقص متوقع." if ar else "No shortages expected.")
    if it == "priority":
        reds = [x for x in b["current"] if x["level"] == "R"]; yel = [x for x in b["current"] if x["level"] == "Y"]
        L = ["ترتيب مقترح لإرسال المفتشين:" if ar else "Suggested order for inspectors:"]
        n = 1
        for x in reds + yel:
            L.append(f"{n}. {_name(x['area'], ar)} · {_grp(x['group'], ar)} ({(LVN_AR if ar else LVN)[x['level']]})"); n += 1
            if n > 5: break
        for r in G["risk"]:
            if n > 6: break
            if r["band"] == "high": L.append(f"{n}. {_name(r['area'], ar)} · {_grp(r['group'], ar)} (" + (f"خطر غداً {round(r['p'] * 100)}%" if ar else f"{round(r['p'] * 100)}% risk tomorrow") + ")"); n += 1
        if b["silent"]: L.append(("وأيضاً: تحقق من الصيدليات الصامتة في " if ar else "Also: check the silent tills in ") + J.join(sorted({_name(s['area'], ar) for s in b['silent']})))
        return "\n".join(L) if n > 1 else ("لا توجد تنبيهات أو مخاطر عالية الآن." if ar else "Nothing is on alert or at high risk right now.")
    if it == "alerts" or b["current"]:
        cur = b["current"]
        if not cur: return "لا توجد منطقة باللون الأصفر أو الأحمر الآن." if ar else "No area is yellow or red right now."
        L = [("التنبيهات الآن:" if ar else "On alert now:")] + [f"• {_name(x['area'], ar)} · {_grp(x['group'], ar)}: {(LVN_AR if ar else LVN)[x['level']]}" + (" (يدوي)" if ar and x["manual"] else " (by hand)" if x["manual"] else "") for x in cur[:8]]
        if G["risk"] and it == "summary": L.append(("الأكثر خطراً غداً: " if ar else "Highest risk tomorrow: ") + f"{_name(G['risk'][0]['area'], ar)} {round(G['risk'][0]['p'] * 100)}%")
        return "\n".join(L)
    return ("يمكنني الإجابة عن: التنبيهات الآن، أين أرسل المفتشين، خطر الغد، المضادات الحيوية، الصيدليات الصامتة، المخزون، أو منطقة معينة." if ar
            else "I can answer about: alerts now, where to send inspectors, tomorrow's risk, antibiotics, silent tills, supply, or one area by name.")


def _explain(G, ar):
    out = []
    for x in G["detail"][:3]:
        f = x["facts"]; lv = x["level"]; g = x["group"]
        up = sorted([m for m in f["meds"] if m["z"] >= 2], key=lambda m: -m["z"])
        c = f.get("clinic")
        if ar:
            s = f"{_name(G['area'], True)} · {_grp(g, True)}: {LVN_AR[lv]}."
            if up: s += " الأدوية المرتفعة اليوم: " + "، ".join(f"{m['name']} {m['sold']} مقابل ~{m['expected']:.0f}" for m in up[:3]) + "."
            else: s += " لا يوجد دواء مرتفع بوضوح اليوم."
            if c: s += f" زيارات العيادات {c['visits']} مقابل ~{c['expected']:.0f}" + (" (مرتفعة، تأكيد من العيادات)." if c["z"] >= 3 else ".")
            if f.get("neighbors"): s += " مناطق مجاورة في حالة تنبيه: " + "، ".join(_name(n, True) for n in f["neighbors"]) + "."
            if f.get("events"): s += " أحداث معروفة: " + "؛ ".join(f["events"]) + "."
            if f.get("override"): s += f" تعديل يدوي من {f['override']['by']}: \"{f['override']['reason']}\"."
            if x["bump"]: s += f" بعد بلاغ إنذار كاذب، رُفع حد التنبيه هنا حتى اليوم {x['bump']['to']}."
            r = next((r for r in G["risk"] if r["area"] == G["area"] and r["group"] == g), None)
            if r: s += f" خطر التحول إلى أصفر/أحمر خلال 48 ساعة: {round(r['p'] * 100)}%."
        else:
            s = f"{G['area']} · {g.lower()}: {LVN[lv]}."
            if up: s += " Medicines up today: " + ", ".join(f"{m['name']} {m['sold']} vs ~{m['expected']:.0f}" for m in up[:3]) + "."
            else: s += " No medicine is clearly up today."
            if c: s += f" Clinic visits {c['visits']} vs ~{c['expected']:.0f}" + (" (high: clinics confirm it)." if c["z"] >= 3 else ".")
            if lv == "Y" and not (c and c["z"] >= 3): s += " It turns red only if clinic visits rise too."
            if f.get("neighbors"): s += " Neighbours on alert: " + ", ".join(f["neighbors"]) + "."
            if f.get("events"): s += " Known events: " + "; ".join(f["events"]) + "."
            if f.get("override"): s += f" Set by hand by {f['override']['by']}: \"{f['override']['reason']}\"."
            if x["bump"]: s += f" After a false-alarm report, the alert bar here is raised until day {x['bump']['to']}."
            r = next((r for r in G["risk"] if r["area"] == G["area"] and r["group"] == g), None)
            if r: s += f" Chance of yellow/red within 48 h: {round(r['p'] * 100)}%."
        out.append(s)
    return "\n\n".join(out)
