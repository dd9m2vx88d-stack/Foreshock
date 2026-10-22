"""
FORESHOCK ENGINE (Python): simulates the pharmacies and clinics of a world, and
holds the detector. A faithful port of the browser engine (engine.js): the same
seed gives exactly the same numbers, so the app and the server always agree.

  World(settings, units)       the "truth": sales and clinic visits that will happen
  detect_daily(...)            normal / watch / yellow / red per area, group and day
  HourlyStepper                the same check every hour, one hour at a time
  run_batch(settings, units)   everything at once (used for checks and the stress test)

Standard library only.
"""
import math, threading
from contextlib import contextmanager
from datetime import date, timedelta

MEDICINES = [  # name, illness group, boxes an average area sells on a normal day
    ("Paracetamol", "Fever / flu", 40), ("Cold & Flu paracetamol", "Fever / flu", 20),
    ("Zomax", "Throat / chest", 8), ("Amoxicillin", "Throat / chest", 12),
    ("Flagyl", "Stomach", 6), ("Protogyn", "Stomach", 4), ("ORS", "Stomach", 7),
    ("Onda", "Stomach", 3), ("Clopram", "Stomach", 5), ("Scabies cream", "Skin", 2)]
SYMPTOMS = [  # clinic visits per symptom on a normal day
    ("Diarrhea / vomiting", "Stomach", 6), ("Fever / flu", "Fever / flu", 14),
    ("Sore throat / chest", "Throat / chest", 10), ("Rash / itching", "Skin", 2)]
GROUPS = ["Stomach", "Fever / flu", "Throat / chest", "Skin"]
MED_GROUP = {m: g for m, g, _ in MEDICINES}
ANTIBIOTICS = ("Zomax", "Amoxicillin")
DAYS = 30
START = date(2026, 9, 2)                     # day 1 = Wed 2 Sep 2026
WAVE_SHAPE = [1.6, 2.3, 3.0, 3.4, 3.1, 2.5, 1.9, 1.5, 1.2]
VALLEY = {"Shuna al-Jabiniyya", "Dair Alla", "Al-Aghwar Shamaliyyeh", "Al-Safi", "Wadi Araba"}
DESERT = {"Al-Azraq", "Ar-Ruwayshid", "Sabha", "Sama as-Sarhan", "Al-Muwaqqar", "Al-Jizah", "Al-Quwayra", "Al-Husanyniyya"}
HEATWAVE = {22: 4, 23: 6, 24: 6, 25: 3}
PHARM_HOURS = [1, .6, .4, .3, .3, .4, .8, 1.5, 3, 4.5, 5.5, 6, 6, 5.5, 5, 5, 5.5, 6.5, 7.5, 8, 8, 7, 5, 2.5]
FRI_HOURS = [1, .6, .4, .3, .3, .3, .4, .6, 1, 1.5, 2, 2.5, 2, 2, 4, 6, 7.5, 8.5, 9.5, 10, 10, 9, 7, 3.5]
CLINIC_HOURS = [.8, .5, .4, .3, .3, .4, .8, 3, 7, 9, 9.5, 9, 8, 7, 7, 7, 6.5, 6, 5, 4, 3, 2.5, 2, 1.2]
DEFAULTS = {"outbreak": True, "area": "Jubeiha", "group": "Stomach", "start": 14, "peak": 3.4, "delay": 2,
            "trap": True, "trapDay": 12, "payday": True, "heatwave": True, "aware": True, "alert": 3.0, "seed": 2026}
FIRST_DAY = 10                               # 7 days of history + 2 guard days are needed before judging
WD_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
M32 = 0xFFFFFFFF


# ---------- seeded random numbers: bit-for-bit the same as the browser ----------
def _imul(a, b):
    return ((a & M32) * (b & M32)) & M32


def hash32(s):
    """cyrb53, reduced to 32 bits, over UTF-16 code units (like JavaScript's charCodeAt)."""
    h1, h2 = 0xDEADBEEF, 0x41C6CE57
    for c in _units(s):
        h1 = _imul(h1 ^ c, 2654435761)
        h2 = _imul(h2 ^ c, 1597334677)
    h1 = _imul(h1 ^ (h1 >> 16), 2246822507) ^ _imul(h2 ^ (h2 >> 13), 3266489909)
    h2 = _imul(h2 ^ (h2 >> 16), 2246822507) ^ _imul(h1 ^ (h1 >> 13), 3266489909)
    return (h1 ^ h2) & M32


def _units(s):
    b = s.encode("utf-16-le")
    return [b[i] | (b[i + 1] << 8) for i in range(0, len(b), 2)]


class Rng:
    """mulberry32."""
    __slots__ = ("a",)

    def __init__(self, seed_str):
        self.a = hash32(seed_str)

    def __call__(self):
        a = (self.a + 0x6D2B79F5) & M32
        self.a = a
        t = _imul(a ^ (a >> 15), 1 | a)
        t = ((t + _imul(t ^ (t >> 7), 61 | t)) & M32) ^ t
        return ((t ^ (t >> 14)) & M32) / 4294967296

    def gauss(self, mu, sd):
        u = 0.0
        while u == 0.0:
            u = self()
        return mu + sd * math.sqrt(-2 * math.log(u)) * math.cos(2 * math.pi * self())


def poisson(mean, r):
    if mean > 60:
        return max(0, js_round(r.gauss(mean, math.sqrt(mean))))
    L, k, p = math.exp(-mean), 0, 1.0
    while True:
        p *= r()
        if p <= L:
            return k
        k += 1


def js_round(x):
    return math.floor(x + 0.5)


def r1(x):
    return js_round(x * 10) / 10


def r2(x):
    return js_round(x * 100) / 100


# ---------- calendar ----------
_LOCAL = threading.local()


def set_start(iso):
    """Move day 1 of the running world to another date (real-time worlds start 19 days before today)."""
    global START
    START = date.fromisoformat(iso) if iso else date(2026, 9, 2)


@contextmanager
def scoped_start(iso):
    """Use another day 1 in this thread only (for trying out candidate worlds while one keeps running)."""
    old = getattr(_LOCAL, "start", None)
    _LOCAL.start = date.fromisoformat(iso) if iso else date(2026, 9, 2)
    try: yield
    finally: _LOCAL.start = old


def date_of(d):
    return (getattr(_LOCAL, "start", None) or START) + timedelta(days=d - 1)


def js_day(d):           # 0 Sunday ... 5 Friday, 6 Saturday
    return (date_of(d).weekday() + 1) % 7


def day_type(d):
    j = js_day(d)
    return "Friday" if j == 5 else "Saturday" if j == 6 else "Weekday"


def cumulative(p):
    t = 0.0
    for x in p:
        t += x
    c, out = 0.0, []
    for x in p:
        c += x / t
        out.append(c)
    out[23] = 1
    return out


CUM_P, CUM_F, CUM_C = cumulative(PHARM_HOURS), cumulative(FRI_HOURS), cumulative(CLINIC_HOURS)


def split(total, cum, r):
    counts = [0] * 24
    for _ in range(total):
        x = r()
        h = 0
        while h < 23 and x > cum[h]:
            h += 1
        counts[h] += 1
    return counts


def settings(s=None):
    out = dict(DEFAULTS)
    out.update(s or {})
    out["seed"] = int(out["seed"]); out["start"] = int(out["start"]); out["delay"] = int(out["delay"]); out["trapDay"] = int(out["trapDay"])
    out["peak"] = float(out["peak"]); out["alert"] = float(out["alert"])
    for k in ("outbreak", "trap", "payday", "heatwave", "aware"):
        out[k] = bool(out[k])
    out["realtime"] = bool(out.get("realtime", False))
    out["eid"] = bool(out.get("eid", False))
    out["misuse"] = {str(k): float(v) for k, v in (out.get("misuse") or {}).items()}
    out["date0"] = out.get("date0") or "2026-09-02"
    out["extra"] = [{"area": str(x["area"]), "group": str(x["group"]), "start": int(x["start"]), "peak": float(x["peak"]), "delay": int(x.get("delay", 2))}
                    for x in (out.get("extra") or [])]
    return out


# ======================= 1. THE WORLD (what will really happen) =======================
class World:
    def __init__(self, S, units, truth=True):
        """truth=False: only the public context (weather, calendar, pharmacy registry, shelf sizes).
        The server uses that; only the pharmacy simulator generates the sales themselves."""
        self.S = S = settings(S)
        self.units = units
        self.areas = [u["name"] for u in units]
        sizes = {u["name"]: u["size"] for u in units}
        self.temps, self.pharmacies = {}, {}
        for u in units:
            r = Rng(f"weather-{S['seed']}-{u['name']}")
            hot = u["name"] in VALLEY or u["gov"] == "Aqaba"
            base = 38.5 if hot else 36.0 if u["name"] in DESERT else 31.5
            self.temps[u["name"]] = [r1(base - 0.08 * d + (r() * 2.4 - 1.2) + ((HEATWAVE.get(d, 0)) if (S["heatwave"] and hot) else 0)) for d in range(1, DAYS + 1)]
            if S.get("temps") and u["name"] in S["temps"]: self.temps[u["name"]] = list(S["temps"][u["name"]])   # real weather
            self.pharmacies[u["name"]] = max(3, js_round(u["size"] * 30))
        MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
        pay = [d for d in range(1, DAYS + 1) if date_of(d).day == 1]      # salaries land on the 1st of the month
        self.calendar = {d: {"name": f"Payday (1 {MON[date_of(d).month - 1]})", "name_ar": "يوم صرف الرواتب", "factor": 1.25} for d in pay} if S["payday"] else {}
        extra = dict((S.get("calendar") or {}))                     # Ramadan, Eids, holidays on real dates
        if S["eid"] and not S["realtime"]:                           # the demo story's optional Eid
            extra.update({"25": {"name": "Eve of Eid (shopping)", "name_ar": "قبل العيد (تسوّق)", "factor": 1.3}})
            extra.update({str(d): {"name": f"Eid holiday (day {d - 25})", "name_ar": f"عطلة العيد (اليوم {d - 25})", "factor": 0.7} for d in (26, 27, 28)})
        for k, v in extra.items():
            d = int(k)
            if d in self.calendar:
                c = self.calendar[d]; self.calendar[d] = {"name": c["name"] + " + " + v["name"], "name_ar": c["name_ar"] + " + " + v["name_ar"], "factor": r2(c["factor"] * v["factor"])}
            else: self.calendar[d] = dict(v)

        def waves(o):
            pw, cw = {}, {}
            for i, b in enumerate(WAVE_SHAPE):
                m = 1 + (b - 1) / 2.4 * (o["peak"] - 1)
                d = o["start"] + i
                if d <= DAYS: pw[d] = m
                if d + o["delay"] <= DAYS: cw[d + o["delay"]] = m
            return pw, cw
        # the main (story) outbreak, plus any extra ones (real-time worlds have a few)
        self.outbreaks = ([dict(area=S["area"], group=S["group"], start=S["start"], peak=S["peak"], delay=S["delay"])] if S["outbreak"] else []) + S["extra"]
        for o in self.outbreaks: o["pw"], o["cw"] = waves(o)

        def outbreak_factor(o, area, group, day, name, wave):
            if area != o["area"]:
                return 1
            m = wave.get(day, 1)
            if group == o["group"]:
                return 1 + (m - 1) * (0.4 if name == "Protogyn" else 1)
            if o["group"] == "Stomach" and name == "Paracetamol":
                return 1 + (m - 1) * 0.15
            return 1

        self.full = {f"{a}|{m}": js_round(normal * sizes[a] * 10) for a in self.areas for m, _, normal in MEDICINES}
        self._hourly = {}
        if not truth:
            return
        heat = lambda t: 1 + 0.08 * max(0, t - 36)
        R = {a: Rng(f"{S['seed']}-{a}") for a in self.areas}
        self.pharm = {f"{a}|{m}": [0] * (DAYS + 1) for a in self.areas for m, _, _ in MEDICINES}
        self.clinic = {f"{a}|{s}": [0] * (DAYS + 1) for a in self.areas for s, _, _ in SYMPTOMS}
        for day in range(1, DAYS + 1):
            wd = js_day(day)
            for a in self.areas:
                size = sizes[a]
                for m, g, normal in MEDICINES:
                    mean = normal * size
                    if wd == 5: mean *= 0.6
                    if wd == 6: mean *= 0.9
                    if g == "Fever / flu": mean *= 1 + 0.01 * (day - 1)
                    for o in self.outbreaks: mean *= outbreak_factor(o, a, g, day, m, o["pw"])
                    if S["trap"] and a == S["area"] and day == S["trapDay"] and m == "Paracetamol": mean *= 1.4
                    if day in self.calendar: mean *= self.calendar[day]["factor"]
                    if m == "ORS": mean *= heat(self.temps[a][day - 1])
                    if S["misuse"] and m in ANTIBIOTICS: mean *= S["misuse"].get(a, 1)   # antibiotics bought without seeing a doctor
                    self.pharm[f"{a}|{m}"][day] = poisson(mean, R[a])
                for s, g, normal in SYMPTOMS:
                    mean = normal * size * (0.85 if wd == 5 else 1)
                    if g == "Fever / flu": mean *= 1 + 0.01 * (day - 1)
                    for o in self.outbreaks: mean *= outbreak_factor(o, a, g, day, s, o["cw"])
                    self.clinic[f"{a}|{s}"][day] = poisson(mean, R[a])
        # clinic visits summed per illness group
        self.csum = {}
        for a in self.areas:
            for g in GROUPS:
                arr = [0] * (DAYS + 1)
                for s, sg, _ in SYMPTOMS:
                    if sg == g:
                        src = self.clinic[f"{a}|{s}"]
                        for d in range(1, DAYS + 1): arr[d] += src[d]
                self.csum[f"{a}|{g}"] = arr

    def ctx(self):
        return {"calendar": {str(k): v for k, v in self.calendar.items()}, "temps": self.temps, "pharmacies": self.pharmacies,
                "heat": {"medicine": "ORS", "per_degree": 0.08, "above": 36}}

    # the hour-by-hour split of each day (same streams as the browser)
    def hourly_sales(self, a, m, d):
        k = ("h", a, m, d)
        if k not in self._hourly:
            cum = CUM_F if js_day(d) == 5 else CUM_P
            self._hourly[k] = split(self.pharm[f"{a}|{m}"][d], cum, Rng(f"h-{self.S['seed']}-{a}-{m}-{d}"))
        return self._hourly[k]

    def hourly_visits(self, a, g, d):
        k = ("c", a, g, d)
        if k not in self._hourly:
            self._hourly[k] = split(self.csum[f"{a}|{g}"][d], CUM_C, Rng(f"c-{self.S['seed']}-{a}-{g}-{d}"))
        return self._hourly[k]


# ======================= 2. DAILY DETECTOR =======================
def detect_daily(areas, pharm, csum, ctx, aware, alert, last_day=DAYS, bump=None):
    """pharm: "area|medicine" -> counts by day; csum: "area|group" -> clinic visits by day.
    bump(key, day) -> extra wobbles for that area|group on that day (inspector feedback), or None.
    Days after the data received so far are simply zeros; their results are not used."""
    WATCH, ALERT, SOLO, GUARD, MIN_HIST, RED_WINDOW, LOOKBACK, MIN_EXTRA = 2.0, alert, alert + 1, 2, 7, 3, 14, 5
    cal, temps = ctx["calendar"], ctx["temps"]

    def known(area, name, day):
        if not aware:
            return 1
        f = cal.get(str(day), cal.get(day, {})).get("factor", 1) if cal else 1
        if name == "ORS":
            f *= 1 + 0.08 * max(0, temps[area][day - 1] - 36)
        return f

    def learn(series):
        tot = [0] * (DAYS + 1)
        n = len(series)
        for arr in series.values():
            for d in range(1, DAYS + 1):
                tot[d] += arr[d]

        def factors(before):
            T = {"Weekday": 0, "Friday": 0, "Saturday": 0}; C = {"Weekday": 0, "Friday": 0, "Saturday": 0}
            for d in range(1, before):
                T[day_type(d)] += tot[d]; C[day_type(d)] += n
            base = T["Weekday"] / max(C["Weekday"], 1)
            return {t: ((T[t] / C[t]) / base if C[t] and base else 1) for t in ("Weekday", "Friday", "Saturday")}
        return factors

    pF, cF = learn(pharm), learn(csum)

    def wobbles(arr, day, factors, flagged, kn):
        past = []
        for d in range(max(1, day - GUARD - LOOKBACK), day - GUARD):
            if d not in flagged:
                past.append(arr[d] / factors[day_type(d)] / kn(d))
        if len(past) < MIN_HIST:
            return None
        s = 0.0
        for x in past: s += x
        normal = s / len(past)
        q = 0.0
        for x in past: q += (x - normal) ** 2
        spread = math.sqrt(q / (len(past) - 1))
        f = factors[day_type(day)] * kn(day)
        expected = normal * f
        wobble = max(spread * f, math.sqrt(max(expected, 1)), 1)
        return (arr[day] - expected) / wobble, expected, wobble

    flagged, last_yellow, det = {}, {}, {}
    fl = lambda k: flagged.setdefault(k, set())
    meds_by_group = {g: [m for m, mg, _ in MEDICINES if mg == g] for g in GROUPS}
    for day in range(1, last_day + 1):
        pf, cf = pF(day), cF(day)
        for a in areas:
            for g in GROUPS:
                meds = meds_by_group[g]
                ck = f"{a}|{g}"
                extra = bump(ck, day) if bump else 0
                AL = ALERT + extra if extra else ALERT
                scores = {}
                for m in meds:
                    k = f"{a}|{m}"; arr = pharm[k]
                    w = wobbles(arr, day, pf, fl(k), lambda d, a=a, m=m: known(a, m, d))
                    if not w: continue
                    z, exp, wob = w
                    scores[m] = {"z": r1(z), "sold": arr[day], "expected": r1(exp), "extra": r1(arr[day] - exp), "wobble": r2(wob), "adjusted": r2(known(a, m, day))}
                    if z >= AL and arr[day] - exp >= MIN_EXTRA: fl(k).add(day)
                carr = csum[ck]
                cw = wobbles(carr, day, cf, fl(ck + "|CLINIC"), lambda d: 1)
                if cw and cw[0] >= AL: fl(ck + "|CLINIC").add(day)
                if not scores: continue
                high = [m for m, v in scores.items() if v["z"] >= AL and v["extra"] >= MIN_EXTRA]
                need = 2 if len(meds) >= 2 else 1
                if len(meds) == 1: high = [m for m in high if scores[m]["z"] >= AL + 1]
                level = "Normal"
                if any(v["z"] >= WATCH for v in scores.values()): level = "Watch"
                if len(high) >= need:
                    level = "Yellow"; last_yellow[ck] = day
                recent = ck in last_yellow and day - last_yellow[ck] <= RED_WINDOW
                if recent and cw and cw[0] >= AL and carr[day] - cw[1] >= MIN_EXTRA: level = "Red"
                det.setdefault(ck, {})[day] = {"level": level, "high": high, "meds": scores,
                    "clinic": {"z": r1(cw[0]) if cw else None, "visits": carr[day], "expected": r1(cw[1]) if cw and cw[1] else None, "wobble": r2(cw[2]) if cw else None}}
    return det


# ======================= 3. HOURLY DETECTOR, one hour at a time =======================
class HourlyStepper:
    """Feeds on the hours as they arrive. step(d, h, det, sales_prefix, visits_prefix) -> new alerts."""
    ORDER = "NWYR"

    def __init__(self, areas, alert):
        self.areas = areas
        self.ALERT, self.SOLO, self.WATCH, self.MIN_EXTRA, self.RED_WINDOW, self.MIN_SHARE, self.HOLD = alert + 0.5, alert + 1.5, 2.0, 5, 3, 0.25, 2
        self.levels = {f"{a}|{g}": [] for a in areas for g in GROUPS}
        self.first_alert, self.last_yellow_day, self.streak = {}, {}, {}
        self.meds_by_group = {g: [m for m, mg, _ in MEDICINES if mg == g] for g in GROUPS}

    def step(self, d, h, det, sales, visits, bump=None):
        """sales(a, m) -> list of 24 hourly counts for day d; visits(a, g) -> same for clinics.
        Returns [(key, level)] for alerts that appear for the first time this hour."""
        O = self.ORDER
        cum = CUM_F if js_day(d) == 5 else CUM_P
        F, Fc = cum[h], CUM_C[h]
        fresh = []
        for a in self.areas:
            for g in GROUPS:
                key = f"{a}|{g}"
                if h == 0: self.streak[key] = {"Y": 0, "R": 0, "peak": "N"}
                st = self.streak[key]
                dl = det.get(key, {}).get(d); prev = det.get(key, {}).get(d - 1)
                carry = prev["level"][0] if prev and prev["level"][0] in "YR" else "N"
                meds = self.meds_by_group[g]
                extra = bump(key, d) if bump else 0
                AL, SOLO = self.ALERT + extra, self.SOLO + extra
                lvl = "N"
                if dl and F >= self.MIN_SHARE:
                    high, watch = [], False
                    for m in meds:
                        info = dl["meds"].get(m)
                        if not info: continue
                        so_far = sum(sales(a, m)[:h + 1])
                        exp = info["expected"] * F
                        wob = max(info["wobble"] * math.sqrt(F), math.sqrt(max(exp, 1)), 1)
                        z = (so_far - exp) / wob
                        if z >= (SOLO if len(meds) == 1 else AL) and so_far - exp >= self.MIN_EXTRA: high.append(m)
                        if z >= self.WATCH: watch = True
                    if watch: lvl = "W"
                    yellow_now = len(high) >= (2 if len(meds) >= 2 else 1)
                    if yellow_now: lvl = "Y"
                    c = dl["clinic"]
                    if c["expected"] is not None:
                        cs = sum(visits(a, g)[:h + 1])
                        cexp = c["expected"] * Fc
                        cwob = max(c["wobble"] * math.sqrt(Fc), math.sqrt(max(cexp, 1)), 1)
                        cz = (cs - cexp) / cwob
                        recent = yellow_now or (key in self.last_yellow_day and d - self.last_yellow_day[key] <= self.RED_WINDOW)
                        if recent and cz >= AL and cs - cexp >= self.MIN_EXTRA: lvl = "R"
                raw = lvl
                for L in "YR":
                    st[L] = st[L] + 1 if O.index(raw) >= O.index(L) else 0
                if raw == "R" and st["R"] < self.HOLD: lvl = "Y" if st["Y"] >= self.HOLD else "W"
                elif raw == "Y" and st["Y"] < self.HOLD: lvl = "W"
                if O.index(st["peak"]) > O.index(lvl) and st["peak"] in "YR": lvl = st["peak"]   # once raised today, it stays until the midnight verdict
                if O.index(lvl) > O.index(st["peak"]): st["peak"] = lvl
                if h == 23 and dl: lvl = dl["level"][0]
                if O.index(carry) > O.index(lvl) and h < 23: lvl = carry
                self.levels[key].append(lvl)
                if lvl in "YR":
                    fa = self.first_alert.setdefault(key, {})
                    if lvl not in fa:
                        fa[lvl] = [d, h]; fresh.append((key, lvl))
                    if lvl == "R" and "Y" not in fa: fa["Y"] = [d, h]
                if h == 23 and dl and dl["level"][0] in "YR":
                    self.last_yellow_day[key] = d
        return fresh


# ---------- supply: days of stock left and run-out warnings ----------
def supply(areas, pharm, full, first_day, last_day):
    sup, alerts = {}, []
    for a in areas:
        for m, _, _ in MEDICINES:
            k = f"{a}|{m}"; level = full[k]; sup[k] = {}
            for d in range(1, last_day + 1):
                if js_day(d) == 0: level = max(level, full[k])
                level = max(0, level - pharm[k][d])
                rec = [pharm[k][d]] + ([pharm[k][d - 1]] if d > 1 else [])
                rate = max(sum(rec) / len(rec), 0.5); left = level / rate
                py = (js_day(d) + 6) % 7; ttd = ((6 - py) % 7) or 7
                warn = d >= first_day and rate >= 3 and left < 1 and ttd >= 2
                sup[k][d] = [level, full[k], r1(left), 1 if warn else 0]
                if warn:
                    alerts.append({"day": d, "area": a, "medicine": m, "boxes": level, "days_left": r1(left), "delivery_in": ttd, "send": max(0, js_round(rate * (ttd + 1) - level))})
    return sup, alerts


def neighbors_of(units, geo):
    pts = {u["name"]: [u["lng"], u["lat"]] for u in units if u["kind"] == "neighborhood"}
    names = {u["name"] for u in units}
    for d in geo["districts"]:
        if d["name"] in names: pts[d["name"]] = d["pt"]
    km = lambda p, q: math.hypot((p[0] - q[0]) * 94.5, (p[1] - q[1]) * 111.0)
    out = {}
    for u in units:
        others = sorted(((km(pts[u["name"]], pts[v["name"]]), v["name"]) for v in units if v["name"] != u["name"]), key=lambda x: x[0])
        out[u["name"]] = [n for dist, n in others[:5] if dist < 45]
    return out


# ---------- everything at once: for checks and the stress test ----------
def run_batch(S, units):
    w = World(S, units)
    det = detect_daily(w.areas, w.pharm, w.csum, w.ctx(), w.S["aware"], w.S["alert"])
    st = HourlyStepper(w.areas, w.S["alert"])
    for d in range(FIRST_DAY, DAYS + 1):
        for h in range(24):
            st.step(d, h, det, lambda a, m, d=d: w.hourly_sales(a, m, d), lambda a, g, d=d: w.hourly_visits(a, g, d))
    return w, det, st
