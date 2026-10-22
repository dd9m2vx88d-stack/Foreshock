"""
FORESHOCK SERVER
================
The real system: a web server, a database and the detector, in one program.

  Pharmacies    -> POST /v1/sales            (each pharmacy has its own API key)
  Hakeem        -> POST /hakeem/v1/visits     (clinic visit counts by diagnosis code)
  Every hour    -> the detector checks all 64 areas and raises yellow / red alerts
  Inspectors    -> confirm alerts from their phone or laptop
  Ministry      -> approves the residents' SMS
  Everything is stored in data/foreshock.db (SQLite).

Run:  python3 server.py          (Windows: py server.py)
Options: --port 8000  --no-sim (don't start the pharmacy simulator)  --no-browser
Standard library only. Python 3.8+.
"""
import argparse, base64, collections, random, csv, gzip, hashlib, hmac, io, json, math, os, re, secrets, socket, sqlite3
import subprocess, sys, threading, time, webbrowser
from datetime import date, datetime, timezone, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
WEB = os.path.join(ROOT, "web")
DATA = os.path.join(ROOT, "data")
PUBLIC = os.environ.get("FORESHOCK_PUBLIC", "") not in ("", "0")    # on a public link: no account changes, no world resets
sys.path.insert(0, HERE)
import engine as E          # noqa: E402
import texts as TX          # noqa: E402
import ai as AI             # noqa: E402
import weather as WX        # noqa: E402
import calendar_jo as CAL   # noqa: E402
import risk_model as RM
import ask as ASK     # noqa: E402
RISK = RM.Model()
try: EVAL = json.load(open(os.path.join(HERE, "evaluation.json"), encoding="utf-8"))
except Exception: EVAL = None           # Foreshock's own trained model (model.json)
GMEDS = {g: [m for m, mg, _ in E.MEDICINES if mg == g] for g in E.GROUPS}

UNITS = json.load(open(os.path.join(HERE, "units.json"), encoding="utf-8"))
GEO = json.load(open(os.path.join(HERE, "geo_compact.json"), encoding="utf-8"))
UNIT = {u["name"]: u for u in UNITS}
AREAS = [u["name"] for u in UNITS]
GOVS = [g["name"] for g in GEO["govs"]]
NEIGHBORS = E.neighbors_of(UNITS, GEO)
RANK = {"N": 0, "W": 1, "Y": 2, "R": 3}
LEVEL_NAME = {"N": "Normal", "W": "Watch", "Y": "Yellow", "R": "Red"}
MAX_HOUR = E.DAYS * 24
FIRST_H = (E.FIRST_DAY - 1) * 24
SPEEDS = {1: 6.0, 3: 2.0, 10: 0.6}           # seconds of real time per simulated hour
DEMO_PW = "foreshock"
EAT = timezone(timedelta(hours=3))           # Amman time

def gtin13(body12):
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(body12))
    return body12 + str((10 - s % 10) % 10)
MEDS = [m for m, _, _ in E.MEDICINES]
GTIN = {m: "0" + gtin13(f"6250000{100 + i * 7:03d}{i:02d}") for i, m in enumerate(MEDS)}
BY_GTIN = {v: k for k, v in GTIN.items()}
ICD = {"A09": "Stomach", "R11": "Stomach", "R50.9": "Fever / flu", "J11": "Fever / flu",
       "J02": "Throat / chest", "J20": "Throat / chest", "B86": "Skin", "L29": "Skin"}

# ---------------------------------------------------------------- real-time worlds
# Day 1 is set 19 days before today, so "now" is always day 20 of a 30-day world: two weeks of
# history to learn from, today happening live, and ten days still to come. The pharmacy data is
# simulated, but the clock, the dates and the weekdays are real.
TODAY_DAY = 20
RT_SEEDS = [3110, 7, 2026, 1, 99, 41, 512, 808]
RT_EXTRA = [{"area": "Irbid", "group": "Fever / flu", "start": 15, "peak": 2.4, "delay": 2},
            {"area": "Az-Zarqa", "group": "Skin", "start": 18, "peak": 3.6, "delay": 2},
            {"area": "Al-Karak", "group": "Throat / chest", "start": 20, "peak": 3.0, "delay": 2},
            # outbreaks spread: Jubeiha's stomach bug reaches next-door Sweileh, Irbid's flu reaches Kora
            {"area": "Sweileh", "group": "Stomach", "start": 20, "peak": 2.4, "delay": 2},
            {"area": "Kora", "group": "Fever / flu", "start": 18, "peak": 2.2, "delay": 2}]

def realtime_settings(today=None):
    """Pick a world for today: outbreaks already under way, one turning red soon, and no false reds."""
    today = today or datetime.now(EAT).date()
    d0 = (today - timedelta(days=TODAY_DAY - 1)).isoformat()
    base = {"realtime": True, "date0": d0, "start": TODAY_DAY - 3, "trapDay": TODAY_DAY - 8, "heatwave": False, "extra": RT_EXTRA}
    # Jordan's calendar on these real dates (Ramadan, Eids, public holidays)
    first = date.fromisoformat(d0)
    ev = CAL.events_between(first, first + timedelta(days=E.DAYS - 1))
    base["calendar"] = {str((d - first).days + 1): v for d, v in ev.items()}
    # real weather for these 30 days (falls back to simulated weather when offline)
    try:
        temps = WX.fetch(UNITS, GEO, d0, E.DAYS, cache_path=os.path.join(DATA, "weather.json"), ssl_context=AI.ssl_context())
    except Exception as e:
        temps = None; print(f"[weather] real weather unavailable ({type(e).__name__}); using simulated weather", flush=True)
    # some areas buy far more antibiotics without seeing a doctor (simulated)
    rr = random.Random(f"abx-{d0}")
    base["misuse"] = {a: round(rr.uniform(1.35, 1.9), 2) for a in rr.sample([a for a in AREAS if UNIT[a]["size"] >= 0.5], 7)}
    if temps: base["temps"], base["weather"] = temps, "open-meteo"
    else: base["weather"] = "simulated"
    best = None
    for seed in RT_SEEDS:
        S = E.settings(dict(base, seed=seed))
        with E.scoped_start(S["date0"]):
            _, _, st = E.run_batch(S, UNITS)
        fa = st.first_alert; wanted = {f"{S['area']}|{S['group']}"} | {f"{x['area']}|{x['group']}" for x in RT_EXTRA}
        score = sum(1 for k, v in fa.items() if k not in wanted and "R" in v) * 10 + sum(1 for k in fa if k not in wanted)
        main = fa.get(f"{S['area']}|{S['group']}", {})
        if not (main.get("Y") and main["Y"][0] < TODAY_DAY and main.get("R") and main["R"][0] >= TODAY_DAY): score += 5
        if best is None or score < best[0]: best = (score, S)
        if score == 0: break
    return best[1]

def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")

def hour_iso(H):
    d = E.date_of(H // 24 + 1)
    return datetime(d.year, d.month, d.day, H % 24, tzinfo=EAT).isoformat()

def parse_sim_time(s):
    """'2026-09-16T14:32:07+03:00' -> simulated hour index."""
    t = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    if t.tzinfo is None: t = t.replace(tzinfo=EAT)
    t = t.astimezone(EAT)
    days = (t.date() - E.date_of(1)).days
    return days * 24 + t.hour

# ---------------------------------------------------------------- passwords & keys
def hash_pw(pw, salt=None):
    salt = salt or secrets.token_bytes(16)
    try:
        dk = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32); algo = "scrypt"
    except (AttributeError, ValueError):
        dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000); algo = "pbkdf2"
    return f"{algo}${salt.hex()}${dk.hex()}"

def check_pw(pw, stored):
    try:
        algo, salt, dk = stored.split("$")
        salt = bytes.fromhex(salt)
        if algo == "scrypt": got = hashlib.scrypt(pw.encode(), salt=salt, n=2 ** 14, r=8, p=1, dklen=32)
        else: got = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, 200_000)
        return hmac.compare_digest(got.hex(), dk)
    except Exception:
        return False

def sha(s):
    return hashlib.sha256(s.encode()).hexdigest()

# ---------------------------------------------------------------- database
SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS accounts (username TEXT PRIMARY KEY, name TEXT, name_ar TEXT, role TEXT, title TEXT, title_ar TEXT,
  govs TEXT, pw_hash TEXT, active INTEGER DEFAULT 1, demo INTEGER DEFAULT 0, created_at TEXT);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, username TEXT, created_at REAL, expires_at REAL);
CREATE TABLE IF NOT EXISTS worlds (id INTEGER PRIMARY KEY, settings TEXT, start_hour INTEGER, created_at TEXT, processed INTEGER DEFAULT -1, clock INTEGER);
CREATE TABLE IF NOT EXISTS pharmacies (id INTEGER PRIMARY KEY, world_id INTEGER, code TEXT, area TEXT, key_hash TEXT, last_heard INTEGER);
CREATE TABLE IF NOT EXISTS sales (id INTEGER PRIMARY KEY, world_id INTEGER, pharmacy_id INTEGER, area TEXT, gtin TEXT, medicine TEXT, qty INTEGER, sim_hour INTEGER, received_at TEXT);
CREATE TABLE IF NOT EXISTS visits (id INTEGER PRIMARY KEY, world_id INTEGER, area TEXT, icd TEXT, grp TEXT, count INTEGER, sim_hour INTEGER, received_at TEXT);
CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, world_id INTEGER, area TEXT, gov TEXT, grp TEXT, level TEXT, decision TEXT, note TEXT,
  by_user TEXT, to_user TEXT, at_hour INTEGER, status TEXT, admin_user TEXT, admin_hour INTEGER, seen INTEGER DEFAULT 0, created_at TEXT, decided_at TEXT);
CREATE TABLE IF NOT EXISTS sms (id INTEGER PRIMARY KEY, world_id INTEGER, sim_hour INTEGER, kind TEXT, recipients TEXT, area TEXT, grp TEXT,
  text_ar TEXT, text_en TEXT, status TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS overrides (id INTEGER PRIMARY KEY, world_id INTEGER, area TEXT, grp TEXT, level TEXT, base TEXT, prev TEXT,
  from_hour INTEGER, to_hour INTEGER, by_user TEXT, reason TEXT, ai TEXT, ended_by TEXT, end_reason TEXT, created_at TEXT, ended_at TEXT);
CREATE TABLE IF NOT EXISTS field_visits (id INTEGER PRIMARY KEY, world_id INTEGER, area TEXT, gov TEXT, grp TEXT, by_user TEXT, at_hour INTEGER,
  checks TEXT, note TEXT, photos TEXT, created_at TEXT);
CREATE TABLE IF NOT EXISTS idem (world_id INTEGER, k TEXT, PRIMARY KEY (world_id, k));
CREATE INDEX IF NOT EXISTS sales_w ON sales(world_id, sim_hour);
CREATE INDEX IF NOT EXISTS visits_w ON visits(world_id, sim_hour);
"""
LOCK = threading.RLock()

class DB:
    def __init__(self, path):
        self.c = sqlite3.connect(path, check_same_thread=False, isolation_level=None)
        self.c.row_factory = sqlite3.Row
        self.c.executescript(SCHEMA)
        self.c.execute("PRAGMA synchronous=NORMAL")
        self.migrate()

    def migrate(self):
        """An older foreshock.db may miss columns added later: add them (data is kept)."""
        for m in re.finditer(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\);", SCHEMA, re.S):
            table = m.group(1)
            have = {r[1] for r in self.c.execute(f"PRAGMA table_info({table})").fetchall()}
            for col in re.split(r",\s*(?![^()]*\))", m.group(2)):
                col = col.strip()
                name = col.split()[0] if col else ""
                if not name or name.upper() == "PRIMARY" or name in have: continue
                self.c.execute(f"ALTER TABLE {table} ADD COLUMN {col}")

    def q(self, sql, args=()):
        with LOCK: return [dict(r) for r in self.c.execute(sql, args).fetchall()]

    def one(self, sql, args=()):
        r = self.q(sql, args); return r[0] if r else None

    def x(self, sql, args=()):
        with LOCK: return self.c.execute(sql, args)

    def many(self, sql, rows):
        with LOCK:
            self.c.execute("BEGIN")
            try: self.c.executemany(sql, rows); self.c.execute("COMMIT")
            except Exception: self.c.execute("ROLLBACK"); raise

SEED_ACCOUNTS = [
    ("admin", "Dr. Rania Saleh", "د. رانيا صالح", "admin", "Outbreak desk, Ministry of Health", "مكتب الأوبئة، وزارة الصحة", GOVS),
    ("admin.north", "Omar Khalil", "عمر خليل", "admin", "North region, Ministry of Health", "إقليم الشمال، وزارة الصحة", ["Irbid", "Ajloun", "Jerash", "Mafraq"]),
    ("inspector.amman", "Lina Haddad", "لينا حداد", "inspector", "", "", ["Amman"]),
    ("inspector.north", "Yazan Odeh", "يزن عودة", "inspector", "", "", ["Irbid", "Ajloun", "Jerash"]),
    ("inspector.east", "Hala Nasser", "هلا ناصر", "inspector", "", "", ["Zarqa", "Mafraq"]),
    ("inspector.central", "Sami Qasem", "سامي قاسم", "inspector", "", "", ["Balqa", "Madaba"]),
    ("inspector.south", "Fares Tarawneh", "فارس الطراونة", "inspector", "", "", ["Karak", "Tafilah", "Ma'an", "Aqaba"]),
]

def seed_accounts(db, wipe=False):
    if wipe: db.x("DELETE FROM accounts"); db.x("DELETE FROM sessions")
    if db.one("SELECT COUNT(*) n FROM accounts")["n"]: return
    for u, n, na, role, t, ta, govs in SEED_ACCOUNTS:   # demo accounts: password "foreshock"
        db.x("INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,1,1,?)", (u, n, na, role, t, ta, json.dumps(govs), hash_pw(DEMO_PW), now_iso()))

def public_account(a):
    return {"u": a["username"], "name": a["name"], "name_ar": a["name_ar"], "role": a["role"], "title": a["title"], "title_ar": a["title_ar"],
            "govs": json.loads(a["govs"]), "active": bool(a["active"]), "demo": bool(a["demo"])}

# ---------------------------------------------------------------- the pipeline
class Pipeline:
    """Received data, the clock and the detector for the current world."""

    def __init__(self, db):
        self.db = db
        self.feed = collections.deque(maxlen=400); self.feed_seq = 0
        self.rev = 0                     # bumps when reports / accounts change
        self.orev = 0                    # bumps when a manual override changes the map
        self.world_id = None
        self.idem = set()
        self.running, self.speed, self.last_advance, self.skip_to = False, 1, 0.0, None
        self.realtime, self.epoch0 = False, 0
        self.snapshot_cache = (None, None)
        self.last_data_at = time.time()
        self.keys = self._load_keys()

    # ---- keys for the pharmacy network and Hakeem (kept on this computer) ----
    def _load_keys(self):
        p = os.path.join(DATA, "keys.json")
        k = json.load(open(p, encoding="utf-8")) if os.path.exists(p) else {}
        changed = False
        for name in ("integration", "hakeem"):
            if name not in k: k[name] = "fsk_" + secrets.token_urlsafe(24); changed = True
        if changed: self._save_keys(k)
        return k

    def _save_keys(self, k):
        p = os.path.join(DATA, "keys.json"); tmp = p + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f: json.dump(k, f, indent=1)
        try: os.chmod(tmp, 0o600)                  # only this computer's user can read the keys
        except Exception: pass
        for attempt in range(50):                  # Windows refuses while another program has the file open
            try: os.replace(tmp, p); return
            except PermissionError: time.sleep(0.1)
        raise OSError("Couldn't save keys.json (another program is holding it open)")

    def log(self, kind, text, **extra):
        with LOCK:
            self.feed_seq += 1
            e = {"id": self.feed_seq, "kind": kind, "text": text, "hour": self.C if self.world_id else 0, "at": now_iso()}
            e.update(extra); self.feed.append(e)

    def bump(self):
        with LOCK: self.rev += 1

    # ---- worlds ----
    def new_world(self, settings, start_day=13, start_hour=18, realtime=False):
        S = realtime_settings() if realtime else E.settings(dict(settings or {}, realtime=False, date0=None, extra=[]))
        with LOCK:
            E.set_start(S["date0"])
            if realtime: start = self.real_hour(S)
            else:
                day = min(max(int(start_day), E.FIRST_DAY), E.DAYS); hour = min(max(int(start_hour), 0), 23)
                start = max(FIRST_H, (day - 1) * 24 + hour)
            if start >= MAX_HOUR: raise LookupError("That start is after the end of the world.")
            self.db.c.execute("BEGIN")
            try:
                cur = self.db.c.execute("INSERT INTO worlds (settings, start_hour, created_at, processed, clock) VALUES (?,?,?,?,?)", (json.dumps(S), start, now_iso(), -1, start))
                wid = cur.lastrowid
                # register the pharmacies of this world, each with its own API key
                ph = {}; rows = []
                ctxw = E.World(S, UNITS, truth=False)
                for a in AREAS:
                    for i in range(ctxw.pharmacies[a]):
                        code = f"PH-{re.sub('[^A-Z]', '', a.upper().replace('AL-', '').replace('AR-', '').replace('AZ-', '').replace('AS-', '').replace('ASH-', ''))[:3]}-{i + 1:03d}"
                        while code in ph: code += "X"
                        key = "ph_" + secrets.token_urlsafe(18)
                        ph[code] = {"area": a, "key": key}; rows.append((wid, code, a, sha(key)))
                self.db.c.executemany("INSERT INTO pharmacies (world_id, code, area, key_hash) VALUES (?,?,?,?)", rows)
                keys = dict(self.keys, world_id=wid, pharmacies=ph); self._save_keys(keys)
                self.db.c.execute("COMMIT")
            except Exception:
                self.db.c.execute("ROLLBACK"); E.set_start(self.S["date0"] if self.world_id else None); raise
            self.keys = keys
            self.load_world(wid)
            self.log("world", (f"Real-time world for today ({E.date_of(TODAY_DAY).isoformat()}) created" if realtime else f"New world #{S['seed']} created")
                     + f" · {len(rows)} pharmacies registered · waiting for history up to day {start // 24 + 1} {start % 24:02d}:00")
        return wid

    def load_world(self, wid):
        w = self.db.one("SELECT * FROM worlds WHERE id=?", (wid,))
        with LOCK:
            self.world_id = wid; self.S = E.settings(json.loads(w["settings"])); self.start_hour = w["start_hour"]
            E.set_start(self.S["date0"])
            self.realtime = self.S["realtime"]
            self.epoch0 = datetime.combine(E.date_of(1), datetime.min.time(), EAT).timestamp()
            self.ctxw = E.World(self.S, UNITS, truth=False)
            self.ctx = self.ctxw.ctx()
            self.ph_by_key = {r["key_hash"]: (r["id"], r["area"], r["code"]) for r in self.db.q("SELECT id, area, code, key_hash FROM pharmacies WHERE world_id=?", (wid,))}
            self.idem = {r["k"] for r in self.db.q("SELECT k FROM idem WHERE world_id=?", (wid,))}
            # when each pharmacy's till was last heard (to spot tills that have gone silent)
            rows = self.db.q("SELECT id, code, area, last_heard FROM pharmacies WHERE world_id=?", (wid,))
            self.ph_code = {r["code"]: r["id"] for r in rows}; self.ph_info = {r["id"]: (r["code"], r["area"]) for r in rows}
            self.last_heard = {r["id"]: r["last_heard"] for r in rows if r["last_heard"] is not None}
            for r in self.db.q("SELECT pharmacy_id, MAX(sim_hour) h FROM sales WHERE world_id=? AND pharmacy_id IS NOT NULL GROUP BY pharmacy_id", (wid,)):
                self.last_heard[r["pharmacy_id"]] = max(self.last_heard.get(r["pharmacy_id"], -1), r["h"])
            z = lambda: [[0] * 24 for _ in range(E.DAYS + 1)]
            self.sales = {f"{a}|{m}": z() for a in AREAS for m in MEDS}
            self.visits = {f"{a}|{g}": z() for a in AREAS for g in E.GROUPS}
            self.daily = {k: [0] * (E.DAYS + 1) for k in self.sales}
            self.cdaily = {k: [0] * (E.DAYS + 1) for k in self.visits}
            self.det, self.det_blind, self.stepper = {}, None, E.HourlyStepper(AREAS, self.S["alert"])
            self.load_bumps()
            self.P, self.C = -1, w["clock"] if w["clock"] is not None else self.start_hour
            self.running, self.skip_to, self.snapshot_cache = False, None, (None, None)
            # replay what was already received (after a restart)
            for r in self.db.q("SELECT area, medicine, qty, sim_hour FROM sales WHERE world_id=?", (wid,)): self._add_sale(r["area"], r["medicine"], r["qty"], r["sim_hour"])
            for r in self.db.q("SELECT area, grp, count, sim_hour FROM visits WHERE world_id=?", (wid,)): self._add_visit(r["area"], r["grp"], r["count"], r["sim_hour"])
            done = w["processed"]
            if done >= FIRST_H:   # one detector pass covers every finished day, then replay the hours
                self.det = E.detect_daily(AREAS, self.daily, self.cdaily, self.ctx, self.S["aware"], self.S["alert"], last_day=done // 24 + 1, bump=self.bar_bump)
            for H in range(0, done + 1): self.process_hour(H, replay=True)
            if done >= FIRST_H and self.S["aware"]:
                self.det_blind = E.detect_daily(AREAS, self.daily, self.cdaily, self.ctx, False, self.S["alert"], last_day=done // 24 + 1)

    def _add_sale(self, area, med, qty, H):
        d, h = H // 24 + 1, H % 24
        self.sales[f"{area}|{med}"][d][h] += qty; self.daily[f"{area}|{med}"][d] += qty

    def _add_visit(self, area, grp, n, H):
        d, h = H // 24 + 1, H % 24
        self.visits[f"{area}|{grp}"][d][h] += n; self.cdaily[f"{area}|{grp}"][d] += n

    # ---- receiving data ----
    def accept_hour(self, H):
        if H <= self.P: return "That hour is already closed and checked."
        if H > self.C: return "That time is in the future."
        if H >= MAX_HOUR: return "The simulation has ended."
        return None

    def _seen(self, uid):
        """True if this exact message was already received (pharmacies may resend after a restart)."""
        return bool(uid) and uid in self.idem

    def _remember(self, uid):
        if uid: self.idem.add(uid); self.db.x("INSERT OR IGNORE INTO idem VALUES (?,?)", (self.world_id, uid))

    def ingest_sales(self, pharmacy, items, H, uid=None):
        pid, area, code = pharmacy
        rows, total = [], 0
        for it in items:
            med = BY_GTIN.get(str(it.get("gtin")))
            qty = int(it.get("qty", 0))
            if not med: raise ValueError(f"Unknown product code {it.get('gtin')}")
            if not 0 < qty <= 500: raise ValueError("qty must be between 1 and 500")
            rows.append((self.world_id, pid, area, GTIN[med], med, qty, H, now_iso())); total += qty
        with LOCK:
            if self._seen(uid): return -1
            err = self.accept_hour(H)
            if err: raise LookupError(err)
            self.db.many("INSERT INTO sales (world_id, pharmacy_id, area, gtin, medicine, qty, sim_hour, received_at) VALUES (?,?,?,?,?,?,?,?)", rows)
            self._remember(uid)
            for r in rows: self._add_sale(area, r[4], r[5], H)
            self.last_heard[pid] = max(self.last_heard.get(pid, -1), H)
            self.last_data_at = time.time()
            first = rows[0]
            self.log("sale", "", pharmacy=code, area=area, medicine=first[4], gtin=first[3], qty=total, sim=H, items=len(rows))
        return len(rows)

    def ingest_visits(self, area, counts, H, uid=None):
        if area not in UNIT: raise ValueError("Unknown area")
        rows = []
        for icd, n in counts.items():
            grp = ICD.get(icd)
            if not grp: raise ValueError(f"Unknown diagnosis code {icd}")
            if int(n) < 0: raise ValueError("counts can't be negative")
            if int(n): rows.append((self.world_id, area, icd, grp, int(n), H, now_iso()))
        with LOCK:
            if self._seen(uid): return -1
            err = self.accept_hour(H)
            if err: raise LookupError(err)
            self._remember(uid)
            if rows: self.db.many("INSERT INTO visits (world_id, area, icd, grp, count, sim_hour, received_at) VALUES (?,?,?,?,?,?,?)", rows)
            for r in rows: self._add_visit(area, r[3], r[4], H)
            self.last_data_at = time.time()
        return len(rows)

    def ingest_history(self, hours, sales, visits, pharmacy_last=None):
        """Bulk import of past hours (the pharmacies' records from before the system went live)."""
        with LOCK:
            H0, H1 = hours
            if H0 != self.P + 1 or H1 >= self.start_hour or H1 < H0 or H1 // 24 != H0 // 24:
                raise LookupError("History must continue from the last checked hour, stay within one day and end before go-live.")
            n = H1 - H0 + 1
            for a, meds in sales.items():
                if a not in UNIT: raise ValueError(f"Unknown area {a}")
                for m, arr in meds.items():
                    if m not in GTIN or len(arr) != n: raise ValueError(f"Bad sales history for {a} · {m}")
            for a, grps in visits.items():
                if a not in UNIT: raise ValueError(f"Unknown area {a}")
                for g, arr in grps.items():
                    if g not in E.GROUPS or len(arr) != n: raise ValueError(f"Bad visits history for {a} · {g}")
            srows, vrows = [], []
            for a, meds in sales.items():
                for m, arr in meds.items():
                    for i, n in enumerate(arr):
                        if n: srows.append((self.world_id, None, a, GTIN[m], m, int(n), H0 + i, now_iso()))
            for a, grps in visits.items():
                for g, arr in grps.items():
                    for i, n in enumerate(arr):
                        if n: vrows.append((self.world_id, a, "IMPORT", g, int(n), H0 + i, now_iso()))
            self.db.many("INSERT INTO sales (world_id, pharmacy_id, area, gtin, medicine, qty, sim_hour, received_at) VALUES (?,?,?,?,?,?,?,?)", srows)
            self.db.many("INSERT INTO visits (world_id, area, icd, grp, count, sim_hour, received_at) VALUES (?,?,?,?,?,?,?)", vrows)
            for r in srows: self._add_sale(r[2], r[4], r[5], r[6])
            for r in vrows: self._add_visit(r[1], r[3], r[4], r[5])
            if pharmacy_last:     # each till's own record of when it last sold something
                upd = [(int(h), self.ph_code[c]) for c, h in pharmacy_last.items() if c in self.ph_code and int(h) <= H1]
                self.db.many("UPDATE pharmacies SET last_heard=? WHERE id=?", upd)
                for h, pid in upd: self.last_heard[pid] = max(self.last_heard.get(pid, -1), h)
            for H in range(H0, H1 + 1): self.process_hour(H)
            self.last_data_at = time.time()
            self.log("import", f"History imported: day {H0 // 24 + 1} {H0 % 24:02d}:00 to day {H1 // 24 + 1} {H1 % 24:02d}:00 · {len(srows):,} sales rows")

    # ---- the detector, once per finished hour ----
    def process_hour(self, H, replay=False):
        if H != self.P + 1: raise LookupError(f"Hour {H} can't be checked before hour {self.P + 1}.")
        d, h = H // 24 + 1, H % 24
        if d >= E.FIRST_DAY:
            if not replay and (h in (0, 23) or not self.det):
                self.det = E.detect_daily(AREAS, self.daily, self.cdaily, self.ctx, self.S["aware"], self.S["alert"], last_day=d, bump=self.bar_bump)
                if h == 23 and self.S["aware"]:   # what a calendar-blind detector would have said (for the results page)
                    self.det_blind = E.detect_daily(AREAS, self.daily, self.cdaily, self.ctx, False, self.S["alert"], last_day=d)
            fresh = self.stepper.step(d, h, self.det, lambda a, m: self.sales[f"{a}|{m}"][d], lambda a, g: self.visits[f"{a}|{g}"][d], bump=self.bar_bump)
            if not replay:
                y = r = 0
                for k, lv in self.stepper.levels.items():
                    if lv[-1] == "Y": y += 1
                    elif lv[-1] == "R": r += 1
                self.log("run", f"detector.hourly · day {d} {h:02d}:00 · 64 areas · 256 checks · {r} red, {y} yellow", red=r, yellow=y)
                for key, lvl in fresh: self.auto_sms(key, lvl, H)
        self.P = H
        if not replay:
            self.db.x("UPDATE worlds SET processed=?, clock=? WHERE id=?", (self.P, self.C, self.world_id))
            self.snapshot_cache = (None, None)

    # ---- learning from inspectors ----
    # When an inspector marks an alert as a false alarm, the bar for that area and illness goes up by
    # half a wobble for 14 days (from the next day), so the same harmless pattern doesn't keep alerting.
    # A later "confirm" report for the same area and illness removes it.
    BUMP, BUMP_DAYS = 0.5, 14

    def load_bumps(self):
        self.bumps = {}
        for r in self.db.q("SELECT * FROM reports WHERE world_id=? ORDER BY at_hour, created_at", (self.world_id,)):
            k = f"{r['area']}|{r['grp']}"; d = r["at_hour"] // 24 + 1
            if r["decision"] == "false": self.bumps[k] = {"from": d + 1, "to": d + self.BUMP_DAYS, "by": r["by_user"], "day": d}
            else: self.bumps.pop(k, None)

    def bar_bump(self, key, day):
        b = self.bumps.get(key) if hasattr(self, "bumps") else None
        return self.BUMP if b and b["from"] <= day <= b["to"] else 0

    def area_names(self): return AREAS
    def groups(self): return E.GROUPS

    # ---- Foreshock's own AI: who might turn yellow or red in the next 48 hours ----
    def risk(self, eff=None):
        H = self.P; today = H // 24 + 1; d = today if H % 24 == 23 else today - 1
        if d < E.FIRST_DAY + 1: return []
        eff = eff or self.effective_levels()
        rows = []
        for k, lv in eff.items():
            if lv and lv[-1] in "YR": continue
            f = RM.features(self.det, k, d, NEIGHBORS, GMEDS)
            if not f: continue
            p, parts = RISK.predict(f)
            if p < 0.02: continue
            a, g = k.split("|")
            rows.append({"area": a, "group": g, "p": round(p, 3), "band": "high" if p >= 0.3 else "medium" if p >= 0.1 else "low",
                         "why": RISK.reasons(parts, f, "en"), "why_ar": RISK.reasons(parts, f, "ar")})
        rows.sort(key=lambda r: -r["p"])
        return rows[:15]

    # ---- antibiotics bought without seeing a doctor ----
    # Antibiotic boxes sold per throat/chest clinic visit over the last 14 days, compared with the
    # national middle value. An area far above it is probably buying antibiotics without a doctor.
    def antibiotics(self):
        H = self.P; today = H // 24 + 1; d1 = today if H % 24 == 23 else today - 1; d0 = max(1, d1 - 13)
        if d1 < d0: return {"rows": []}
        rows = []
        for a in AREAS:
            abx = sum(self.daily[f"{a}|{m}"][d] for m in E.ANTIBIOTICS for d in range(d0, d1 + 1))
            vis = sum(self.cdaily[f"{a}|Throat / chest"][d] for d in range(d0, d1 + 1))
            if vis >= 20 and self.ctx["pharmacies"][a] >= 5: rows.append({"area": a, "gov": UNIT[a]["gov"], "abx": abx, "visits": vis, "ratio": abx / vis})
        if not rows: return {"rows": []}
        med = sorted(r["ratio"] for r in rows)[len(rows) // 2]
        for r in rows:
            r["index"] = round(r["ratio"] / med, 2); r["extra"] = max(0, round(r["abx"] - med * r["visits"])); r["ratio"] = round(r["ratio"], 2)
        rows.sort(key=lambda r: -r["index"])
        return {"rows": rows, "median": round(med, 2), "from_day": d0, "to_day": d1}

    # ---- manual overrides ----
    # A person can set an area's level by hand. The rule that keeps it safe:
    # the override wins, UNLESS Foreshock's own level rises above both what it said when the
    # override was made and the level the person chose. Then Foreshock speaks up again.
    def overrides(self):
        return self.db.q("SELECT * FROM overrides WHERE world_id=? ORDER BY id", (self.world_id,))

    def active_override(self, key):
        a, g = key.split("|")
        return self.db.one("SELECT * FROM overrides WHERE world_id=? AND area=? AND grp=? AND to_hour IS NULL ORDER BY id DESC LIMIT 1", (self.world_id, a, g))

    def sys_level(self, key, H):
        s = self.stepper.levels.get(key)
        i = H - FIRST_H
        return s[i] if s and 0 <= i < len(s) else "N"

    @staticmethod
    def combine(sys, ov):
        return sys if RANK[sys] > max(RANK[ov["base"]], RANK[ov["level"]]) else ov["level"]

    def effective_levels(self, ovs=None):
        out = {k: list(v) for k, v in self.stepper.levels.items()}
        for ov in (self.overrides() if ovs is None else ovs):
            k = f"{ov['area']}|{ov['grp']}"; arr = out.get(k)
            if not arr: continue
            sysarr = self.stepper.levels[k]
            end = len(arr) if ov["to_hour"] is None else min(len(arr), ov["to_hour"] - FIRST_H)
            for i in range(max(0, ov["from_hour"] - FIRST_H), end):
                arr[i] = self.combine(sysarr[i], ov)
        return {k: "".join(v) for k, v in out.items()}

    def level_now(self, key):
        H = self.P; ov = self.active_override(key); sys = self.sys_level(key, H)
        return (self.combine(sys, ov) if ov else sys), sys, ov

    def set_override(self, user, area, grp, level, reason, notify=None, residents=False, ai_info=None):
        key = f"{area}|{grp}"; H = self.P
        with LOCK:
            cur, sys, old = self.level_now(key)
            if cur == level: raise LookupError(f"{area} is already {LEVEL_NAME[level].lower()} for this group.")
            if old: self.db.x("UPDATE overrides SET to_hour=?, ended_by=?, end_reason=?, ended_at=? WHERE id=?", (H, user["username"], "replaced by a new override", now_iso(), old["id"]))
            oid = self.db.x("INSERT INTO overrides (world_id, area, grp, level, base, prev, from_hour, by_user, reason, ai, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                            (self.world_id, area, grp, level, sys, cur, H, user["username"], reason, json.dumps(ai_info) if ai_info else None, now_iso())).lastrowid
            u = UNIT[area]; d = E.date_of(H // 24 + 1)
            insp = [a for a in self.db.q("SELECT * FROM accounts WHERE role='inspector' AND active=1") if u["gov"] in json.loads(a["govs"])]
            self.sms("inspectors", ", ".join(a["name"] for a in insp) or "no inspector assigned", area, grp,
                     TX.override_inspectors(u, grp, level, cur, user, reason, d, H % 24), "sent", H)
            if RANK[level] > RANK[cur] and level in ("Y", "R"):
                self.sms("pharmacies", f"{self.ctx['pharmacies'][area]} pharmacies in {area}", area, grp, TX.pharmacies(u, grp), "sent", H)
            if user["role"] == "inspector":
                to = self.db.one("SELECT * FROM accounts WHERE username=? AND role='admin' AND active=1", (notify,)) or \
                     next((a for a in self.db.q("SELECT * FROM accounts WHERE role='admin' AND active=1 ORDER BY username") if u["gov"] in json.loads(a["govs"])), None)
                if to: self.sms("admin", to["name"], area, grp, TX.override_admin(u, grp, level, user, reason), "sent", H)
            if residents and user["role"] == "admin" and level in ("Y", "R"):
                self.sms("residents", f"~{int(u['size'] * 250000 * 0.9):,} phones in {area} (cell broadcast)", area, grp, TX.residents(u, grp), "sent", H)
            self.log("override", f"{user['name']} set {area} · {grp} to {LEVEL_NAME[level]} by hand (was {LEVEL_NAME[cur]})", area=area)
            self.orev += 1; self.rev += 1
        return oid

    def end_override(self, user, oid, reason=""):
        with LOCK:
            ov = self.db.one("SELECT * FROM overrides WHERE id=? AND world_id=?", (oid, self.world_id))
            if not ov or ov["to_hour"] is not None: raise LookupError("That override has already ended.")
            H = self.P
            self.db.x("UPDATE overrides SET to_hour=?, ended_by=?, end_reason=?, ended_at=? WHERE id=?", (H, user["username"], reason[:300], now_iso(), oid))
            key = f"{ov['area']}|{ov['grp']}"; u = UNIT[ov["area"]]
            insp = [a for a in self.db.q("SELECT * FROM accounts WHERE role='inspector' AND active=1") if u["gov"] in json.loads(a["govs"])]
            self.sms("inspectors", ", ".join(a["name"] for a in insp) or "no inspector assigned", ov["area"], ov["grp"],
                     TX.override_ended(u, ov["grp"], user, self.sys_level(key, H)), "sent", H)
            self.log("override", f"{user['name']} ended the manual override on {ov['area']} · {ov['grp']}", area=ov["area"])
            self.orev += 1; self.rev += 1

    def facts(self, area, grp, target, role):
        """The numbers behind one area right now, for the AI helper."""
        key = f"{area}|{grp}"; H = self.P; d, h = H // 24 + 1, H % 24
        cur, sys, ov = self.level_now(key)
        F = (E.CUM_F if E.js_day(d) == 5 else E.CUM_P)[h]; Fc = E.CUM_C[h]
        today = self.det.get(key, {}).get(d)
        meds = []
        for m, mg, _ in E.MEDICINES:
            if mg != grp: continue
            sold = sum(self.sales[f"{area}|{m}"][d][:h + 1]); v = (today or {}).get("meds", {}).get(m)
            if not v: continue
            exp = v["expected"] * F; wob = max(v["wobble"] * math.sqrt(F), math.sqrt(max(exp, 1)), 1)
            meds.append({"name": m, "sold": sold, "expected": exp, "z": round((sold - exp) / wob, 1), "adj": v.get("adjusted")})
        clinic = None
        if today and today["clinic"]["expected"] is not None:
            vis = sum(self.visits[key][d][:h + 1]); ce = today["clinic"]["expected"] * Fc
            cw = max((today["clinic"]["wobble"] or 1) * math.sqrt(Fc), math.sqrt(max(ce, 1)), 1)
            clinic = {"visits": vis, "expected": ce, "z": round((vis - ce) / cw, 1)}
        days = []
        for dd in range(max(E.FIRST_DAY, d - 3), d):
            x = self.det.get(key, {}).get(dd)
            if x: days.append({"day": dd, "level": x["level"][0], "sold": sum(v["sold"] for v in x["meds"].values()),
                               "expected": sum(v["expected"] for v in x["meds"].values()), "visits": x["clinic"]["visits"], "cexp": x["clinic"]["expected"] or 0})
        events = []
        cal = self.ctx["calendar"].get(str(d))
        if cal: events.append(f"{cal['name']} (sales usually x{cal['factor']})")
        t = self.ctx["temps"][area][d - 1]
        if t > 36: events.append(f"heatwave {t}°C (more ORS is normal)")
        s = self.stepper.levels.get(key, ""); since = None
        if s:
            i = len(s) - 1
            while i > 0 and s[i - 1] == s[-1]: i -= 1
            since = ((FIRST_H + i) // 24 + 1, (FIRST_H + i) % 24)
        nb = [n for n in NEIGHBORS.get(area, []) if RANK[self.sys_level(f"{n}|{grp}", H)] >= 2]
        reps = [f"{r['by_user']}: {r['decision']}" + (f" - \"{r['note']}\"" if r["note"] else "") for r in
                self.db.q("SELECT * FROM reports WHERE world_id=? AND area=? AND grp=?", (self.world_id, area, grp))]
        for v in self.db.q("SELECT * FROM field_visits WHERE world_id=? AND area=? AND grp=? ORDER BY id DESC LIMIT 3", (self.world_id, area, grp)):
            c = json.loads(v["checks"] or "{}")
            bits = [f"{c['places']} places inspected" if c.get("places") else "", f"{c['people_sick']} sick people interviewed" if c.get("people_sick") else "",
                    "water tested" + (" and FAILED" if c.get("water_failed") else " and passed") if c.get("water_tested") else "", "samples sent to the lab" if c.get("samples") else "",
                    "food handlers sick" if c.get("staff_sick") else "", f"{c['closed']} premises closed" if c.get("closed") else ""]
            reps.append(f"Field visit day {v['at_hour'] // 24 + 1} {v['at_hour'] % 24:02d}:00 by {v['by_user']}: " + ", ".join(x for x in bits if x) + (f" - \"{v['note']}\"" if v["note"] else ""))
        who = self.db.one("SELECT name, role FROM accounts WHERE username=?", (ov["by_user"],)) if ov else None
        place = f"{area}, Amman" if UNIT[area]["kind"] == "neighborhood" else f"{area}, {UNIT[area]['gov']}"
        return {"place": place, "group": grp, "day": d, "hour": h, "sys": sys, "current": cur, "target": target, "role": role, "since": since,
                "override": {"level": ov["level"], "by": who["name"] if who else ov["by_user"], "role": who["role"] if who else "", "reason": ov["reason"]} if ov else None,
                "meds": meds, "clinic": clinic, "days": days, "events": events, "neighbors": nb, "reports": reps}

    # ---- the week, for the ministry's briefing ----
    def briefing_facts(self, govs):
        H = self.P; d_now = H // 24 + 1; H0 = max(FIRST_H, H - 167)
        inscope = lambda a: UNIT[a]["gov"] in govs
        when = lambda h: f"{E.date_of(h // 24 + 1).strftime('%a %d %b')} {h % 24:02d}:00"
        place = lambda a: f"{a} (Amman)" if UNIT[a]["kind"] == "neighborhood" else a if a == UNIT[a]["gov"] else f"{a} ({UNIT[a]['gov']})"
        eff = self.effective_levels()
        cur, new = [], []
        for k, lv in eff.items():
            a, g = k.split("|")
            if not lv or not inscope(a): continue
            L = lv[-1]
            if L in "YR":
                i = len(lv) - 1
                while i > 0 and lv[i - 1] == L: i -= 1
                ov = self.active_override(k)
                cur.append({"place": place(a), "area": a, "group": g, "group_ar": TX.AR_GROUP[g], "level": L, "since": when(FIRST_H + i), "manual": bool(ov and ov["level"] == L)})
        for k, fa in self.stepper.first_alert.items():
            a, g = k.split("|")
            if not inscope(a): continue
            for L in ("Y", "R"):
                if L in fa:
                    h = (fa[L][0] - 1) * 24 + fa[L][1]
                    if H0 <= h <= H: new.append({"place": place(a), "group": g, "group_ar": TX.AR_GROUP[g], "level_name": LEVEL_NAME[L], "when": when(h)})
        cur.sort(key=lambda x: (x["level"] != "R", x["place"]))
        trend = {}
        for g in E.GROUPS:
            meds = [m for m, mg, _ in E.MEDICINES if mg == g]
            tw = sum(self.daily[f"{a}|{m}"][d] for a in AREAS if inscope(a) for m in meds for d in range(max(1, d_now - 7), d_now))
            lw = sum(self.daily[f"{a}|{m}"][d] for a in AREAS if inscope(a) for m in meds for d in range(max(1, d_now - 14), max(1, d_now - 7)))
            trend[g] = (tw, lw)
        names = {r["username"]: r["name"] for r in self.db.q("SELECT username, name FROM accounts")}
        ovs = [f"{names.get(o['by_user'], o['by_user'])} set {o['area']} {o['grp']} to {LEVEL_NAME[o['level']]} ({when(o['from_hour'])}): \"{o['reason']}\""
               for o in self.overrides() if o["from_hour"] >= H0 and inscope(o["area"])]
        reps = [f"{names.get(r['by_user'], r['by_user'])} {'confirmed' if r['decision'] == 'confirm' else 'marked false alarm'} {r['area']} {r['grp']}"
                + (f" (\"{r['note']}\")" if r["note"] else "") + f" -> {r['status']}" for r in self.db.q("SELECT * FROM reports WHERE world_id=? AND at_hour>=?", (self.world_id, H0)) if inscope(r["area"])]
        vis = []
        for v in self.db.q("SELECT * FROM field_visits WHERE world_id=? AND at_hour>=?", (self.world_id, H0)):
            if not inscope(v["area"]): continue
            c = json.loads(v["checks"] or "{}")
            vis.append(f"{v['area']} {v['grp']}: " + ", ".join(x for x in [f"{c['places']} places" if c.get("places") else "", "water FAILED" if c.get("water_failed") else "water ok" if c.get("water_tested") else "",
                                                                        f"{c['closed']} closed" if c.get("closed") else "", "samples sent" if c.get("samples") else ""] if x) + (f" - {v['note'][:120]}" if v["note"] else ""))
        last_full = d_now if H % 24 == 23 else d_now - 1
        _, sup = E.supply(AREAS, self.daily, self.ctxw.full, E.FIRST_DAY, max(1, last_full))
        sup_now = [x for x in sup if x["day"] == d_now - 1 and inscope(x["area"])]
        hot = [f"{a} {max(self.ctx['temps'][a][d_now - 1:d_now + 4])}°C" for a in AREAS if inscope(a) and d_now <= E.DAYS and max(self.ctx["temps"][a][d_now - 1:d_now + 4] or [0]) > 36]
        return {"from": when(H0), "to": when(H), "scope": "All of Jordan" if set(GOVS) <= set(govs) else ", ".join(govs),
                "current": cur, "new": new, "trend": trend, "overrides": ovs, "reports": reps, "visits": vis,
                "supply": (f"{len(sup_now)} (e.g. " + "; ".join(f"{x['area']} {x['medicine']}: send {x['send']}" for x in sup_now[:3]) + ")") if sup_now else "",
                "silent": [x for x in self.silent() if inscope(x["area"])], "hot": ", ".join(hot[:5]),
                "upcoming": [e for e in CAL.upcoming(E.date_of(d_now)) if date.fromisoformat(e["start"]) <= E.date_of(d_now) + timedelta(days=14)]}

    # ---- tills that have gone silent ----
    # Each pharmacy normally sells a few of the 10 tracked medicines every hour it's open. If one sends
    # nothing for so long that silence would happen less than 1 time in 100 by chance, its till is
    # probably offline. Its area then looks calmer than it really is, so people need to know.
    def silent(self):
        if self.P < self.start_hour - 1: return []
        daily = {a: sum(n for _, _, n in E.MEDICINES) * UNIT[a]["size"] / max(1, self.ctx["pharmacies"][a]) for a in AREAS}
        shares = {}
        def share(H):
            d, h = H // 24 + 1, H % 24
            if d not in shares:
                prof = E.FRI_HOURS if E.js_day(d) == 5 else E.PHARM_HOURS; t = sum(prof)
                f = 0.6 if E.js_day(d) == 5 else 0.9 if E.js_day(d) == 6 else 1.0
                shares[d] = [x / t * f * (self.ctx["calendar"].get(str(d), {}).get("factor", 1)) for x in prof]
            return shares[d][h]
        out = []
        for pid, (code, area) in self.ph_info.items():
            last = self.last_heard.get(pid, self.start_hour - 1)
            gap = self.P - last
            if gap < 2: continue
            lam = sum(daily[area] * share(H) for H in range(max(last + 1, self.P - 96), self.P + 1))
            if lam >= 4.6:
                out.append({"code": code, "area": area, "last": last - FIRST_H, "hours": gap, "chance": round(math.exp(-lam) * 100, 3),
                            "missing": round(lam, 1)})
        return sorted(out, key=lambda x: -x["hours"])

    # ---- SMS outbox ----
    def sms(self, kind, recipients, area, grp, pair, status, H):
        self.db.x("INSERT INTO sms (world_id, sim_hour, kind, recipients, area, grp, text_ar, text_en, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                  (self.world_id, H, kind, recipients, area, grp, pair[0], pair[1], status, now_iso()))
        self.log("sms", f"{kind} · {recipients}", area=area)

    def auto_sms(self, key, lvl, H):
        area, grp = key.split("|"); u = UNIT[area]
        insp = [a for a in self.db.q("SELECT * FROM accounts WHERE role='inspector' AND active=1") if u["gov"] in json.loads(a["govs"])]
        d = E.date_of(H // 24 + 1)
        self.sms("inspectors", ", ".join(a["name"] for a in insp) or "no inspector assigned", area, grp, TX.inspectors(u, grp, lvl, d, H % 24), "sent", H)
        self.sms("pharmacies", f"{self.ctx['pharmacies'][area]} pharmacies in {area}", area, grp, TX.pharmacies(u, grp), "sent", H)

    # ---- clock ----
    def real_hour(self, S=None):
        e0 = datetime.combine(date.fromisoformat((S or self.S)["date0"]), datetime.min.time(), EAT).timestamp() if S else self.epoch0
        return int((time.time() - e0) // 3600)

    def expired(self):
        return self.realtime and self.real_hour() >= MAX_HOUR

    def tick(self):
        with LOCK:
            if not self.world_id: return
            if self.realtime:          # the clock on the wall decides
                h = min(MAX_HOUR, self.real_hour())
                if h > self.C: self.C = h; self.last_advance = time.time()
                self.running = self.C < MAX_HOUR
                return
            if self.C >= MAX_HOUR: return
            if self.P == self.C - 1:
                if self.skip_to is not None and self.C < self.skip_to:
                    self.C += 1; self.last_advance = time.time()
                elif self.skip_to is not None:
                    self.skip_to = None
                elif self.running and time.time() - self.last_advance >= SPEEDS[self.speed]:
                    self.C += 1; self.last_advance = time.time()
                if self.C >= MAX_HOUR: self.running = False

    def clock(self):
        waiting = self.P < self.C - 1 and time.time() - self.last_data_at > (90 if self.realtime else 4)
        return {"world": self.world_id, "hour": self.C, "processed": self.P, "running": self.running, "speed": self.speed,
                "period": SPEEDS[self.speed], "since": self.last_advance, "server_time": time.time(), "rev": self.rev, "orev": self.orev,
                "waiting_for_data": waiting, "start_hour": self.start_hour, "ended": self.C >= MAX_HOUR and self.P >= MAX_HOUR - 1,
                "realtime": self.realtime, "epoch0": self.epoch0, "date0": self.S["date0"] if self.world_id else None}

    # ---- the picture the dashboards draw ----
    def snapshot(self):
        with LOCK:
            key = (self.world_id, self.P, self.orev)
            if self.snapshot_cache[0] == key: return self.snapshot_cache[1]
            if self.P < FIRST_H:
                body = {"pending": True, "processed": self.P, "start_hour": self.start_hour}
                raw = json.dumps(body).encode(); self.snapshot_cache = (key, raw); return raw
            S, P = self.S, self.P
            ovs = self.overrides()
            today, hP = P // 24 + 1, P % 24
            days = list(range(1, E.DAYS + 1))
            series, det = {}, {}
            for a in AREAS:
                for g in E.GROUPS:
                    k = f"{a}|{g}"; meds = [m for m, mg, _ in E.MEDICINES if mg == g]
                    series[k] = {"p": [sum(self.daily[f"{a}|{m}"][d] for m in meds) for d in days], "c": [self.cdaily[k][d] for d in days]}
                    det[k] = {}
                    for d, x in self.det.get(k, {}).items():
                        if d > today: continue
                        det[k][d] = {"l": x["level"][0], "h": x["high"], "m": {n: [v["sold"], v["expected"], v["z"], v["wobble"], v["adjusted"]] for n, v in x["meds"].items()},
                                     "ep": E.r1(sum(v["expected"] for v in x["meds"].values())), "cz": x["clinic"]["z"], "ec": x["clinic"]["expected"]}
            hourly, chourly = {}, {}
            for d in range(E.FIRST_DAY, today + 1):
                for a in AREAS:
                    for m in MEDS: hourly[f"{a}|{m}|{d}"] = self.sales[f"{a}|{m}"][d]
                    for g in E.GROUPS: chourly[f"{a}|{g}|{d}"] = self.visits[f"{a}|{g}"][d]
            last_full = today if hP == 23 else today - 1
            sup, sup_alerts = E.supply(AREAS, self.daily, self.ctxw.full, E.FIRST_DAY, max(1, last_full))
            data = {
                "server": True, "world_id": self.world_id, "scenario": {k: v for k, v in S.items() if k != "temps"}, "result": self.result(),
                "weather": S.get("weather", "simulated"), "upcoming": CAL.upcoming(E.date_of(today)), "silent": self.silent(),
                "risk": self.risk(), "model_info": RISK.info, "evaluation": EVAL, "antibiotics": self.antibiotics(),
                "bumps": [{"area": k.split("|")[0], "group": k.split("|")[1], **v} for k, v in self.bumps.items() if v["to"] >= today],
                "days": days, "weekday": [E.WD_NAMES[E.js_day(d)] for d in days], "date": [E.date_of(d).isoformat() for d in days],
                "series": series, "det": det, "ctx": self.ctx, "medGroup": E.MED_GROUP,
                "live": {"first_day": E.FIRST_DAY, "levels": self.effective_levels(ovs), "sys_levels": {k: "".join(v) for k, v in self.stepper.levels.items()},
                         "overrides": [self.ov_public(o) for o in ovs], "first_alert": self.stepper.first_alert,
                         "hourly": hourly, "clinic_hourly": chourly, "cum": {"weekday": E.CUM_P, "friday": E.CUM_F, "clinic": E.CUM_C},
                         "supply": sup, "supply_alerts": sup_alerts, "neighbors": NEIGHBORS, "now": P - FIRST_H},
                "clock": self.clock(),
            }
            raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).encode()
            self.snapshot_cache = (key, raw)
            return raw

    def ov_public(self, o):
        ai = json.loads(o["ai"]) if o["ai"] else None
        return {"id": o["id"], "area": o["area"], "group": o["grp"], "level": o["level"], "base": o["base"], "prev": o["prev"],
                "t0": o["from_hour"] - FIRST_H, "t1": None if o["to_hour"] is None else o["to_hour"] - FIRST_H,
                "by": o["by_user"], "reason": o["reason"], "ai": ai, "ended_by": o["ended_by"], "end_reason": o["end_reason"]}

    def result(self):
        S, fa_all = self.S, self.stepper.first_alert
        key = f"{S['area']}|{S['group']}"
        fa = fa_all.get(key, {}) if S["outbreak"] else {}
        t0 = (S["start"] - 1) * 24
        hrs = lambda x: (x[0] - 1) * 24 + x[1] - t0 if x else None
        others = [(k, v) for k, v in fa_all.items() if not S["outbreak"] or k != key]
        saves = []
        if self.det_blind and S["aware"]:
            done_days = (self.P + 1) // 24
            A = {(k, d) for k, o in self.det.items() for d, v in o.items() if d <= done_days and v["level"] in ("Yellow", "Red")}
            U = {(k, d) for k, o in self.det_blind.items() for d, v in o.items() if d <= done_days and v["level"] in ("Yellow", "Red")}
            saves = sorted({k.split("|")[0] for k, d in U - A if not (S["outbreak"] and k == key)})
        trap = None
        if S["trap"] and (self.P + 1) // 24 >= S["trapDay"]:
            v = self.det.get(f"{S['area']}|Fever / flu", {}).get(S["trapDay"])
            trap = not (v and v["level"] in ("Yellow", "Red"))
        return {"key": key, "yellow": fa.get("Y"), "red": fa.get("R"), "yellowAfter": hrs(fa.get("Y")), "redAfter": hrs(fa.get("R")),
                "lead": hrs(fa.get("R")) - hrs(fa.get("Y")) if fa.get("Y") and fa.get("R") else None,
                "falseYellow": [k for k, v in others if "Y" in v], "falseRed": [k for k, v in others if "R" in v],
                "trapIgnored": trap, "contextSaves": saves}

# ---------------------------------------------------------------- HTTP
class App:
    def __init__(self, db, pipe):
        self.db, self.pipe = db, pipe
        self.ai = AI.Settings(os.path.join(DATA, "ai.json"))
        self.fails = collections.defaultdict(list)
        self.asks = collections.defaultdict(list)

    def user_for(self, handler):
        m = re.search(r"(?:^|;\s*)fs_session=([A-Za-z0-9_\-]+)", handler.headers.get("Cookie", ""))
        if not m: return None
        s = self.db.one("SELECT * FROM sessions WHERE token_hash=?", (sha(m.group(1)),))
        if not s or s["expires_at"] < time.time(): return None
        a = self.db.one("SELECT * FROM accounts WHERE username=?", (s["username"],))
        return a if a and a["active"] else None

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Foreshock/1.0"
    app = None

    def log_message(self, fmt, *args):
        pass

    # ---- responses ----
    def send(self, code, body=b"", ctype="application/json; charset=utf-8", headers=None, gz=False):
        self._drain()
        if isinstance(body, (dict, list)): body = json.dumps(body, ensure_ascii=False).encode()
        if isinstance(body, str): body = body.encode()
        if gz and "gzip" in self.headers.get("Accept-Encoding", "") and len(body) > 2048:
            body = gzip.compress(body, 5); headers = dict(headers or {}, **{"Content-Encoding": "gzip"})
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        if not (headers and "Cache-Control" in headers): self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        for k, v in (headers or {}).items(): self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD": self.wfile.write(body)

    def err(self, code, error, message):
        self.send(code, {"error": error, "message": message})

    def _drain(self):
        """Read any request body nobody read (e.g. on an early error), or close the connection."""
        if getattr(self, "_read", True): return
        self._read = True
        try: n = int(self.headers.get("Content-Length", 0) or 0)
        except ValueError: n = 0
        if 0 < n <= 4_000_000: self.rfile.read(n)
        elif n: self.close_connection = True

    def body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        if n > 4_000_000: self.close_connection = True; self._read = True; raise ValueError("Request too large")
        self._read = True
        raw = self.rfile.read(n) if n else b""
        if not raw: return {}
        return json.loads(raw.decode("utf-8"))

    def bearer(self):
        m = re.match(r"Bearer\s+(\S+)", self.headers.get("Authorization", ""))
        return m.group(1) if m else None

    # ---- routing ----
    def do_HEAD(self): self.do_GET()
    def do_GET(self): self.route("GET")
    def do_POST(self): self.route("POST")
    def do_DELETE(self): self.route("DELETE")

    def route(self, method):
        self._read = False
        try:
            u = urlparse(self.path); path, qs = u.path, parse_qs(u.query)
            A, P = self.app, self.app.pipe
            if path.startswith("/v1/") or path.startswith("/hakeem/"): return self.machine(method, path, qs)
            if path.startswith("/api/"): return self.api(method, path, qs)
            if method != "GET": return self.err(405, "method", "Not allowed")
            return self.static(path)
        except (ValueError, KeyError, TypeError, json.JSONDecodeError) as e:
            return self.err(400, "bad_request", str(e) or "Bad request")
        except LookupError as e:
            return self.err(409, "conflict", str(e))
        except Exception as e:  # keep the server alive, report the problem
            import traceback; traceback.print_exc()
            return self.err(500, "server_error", "Something went wrong on the server: " + str(e))

    def static(self, path):
        if path in ("/", ""): path = "/index.html"
        full = os.path.normpath(os.path.join(WEB, path.lstrip("/")))
        if not full.startswith(WEB + os.sep) or not os.path.isfile(full): return self.err(404, "not_found", "No such page")
        ext = os.path.splitext(full)[1]
        ctype = {".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
                 ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".webmanifest": "application/manifest+json"}.get(ext, "application/octet-stream")
        with open(full, "rb") as f: data = f.read()
        self.send(200, data, ctype, gz=ext in (".html", ".js", ".css", ".json"))

    # ---- machine APIs: pharmacies, Hakeem, the integration ----
    def machine(self, method, path, qs):
        A, P = self.app, self.app.pipe
        key = self.bearer()
        if path == "/v1/health": return self.send(200, {"ok": True, "world": P.world_id, "hour": P.C})
        if path == "/v1/sales" and method == "POST":
            ph = P.ph_by_key.get(sha(key or ""))
            if not ph: return self.err(401, "unauthorized", "Missing or unknown pharmacy API key")
            b = self.body(); items = b.get("items") or []
            if not items or len(items) > 200: return self.err(422, "invalid", "Send between 1 and 200 items")
            H = parse_sim_time(b["scanned_at"]) if b.get("scanned_at") else P.C
            n = P.ingest_sales(ph, items, H, str(b["id"])[:80] if b.get("id") else None)
            if n == -1: return self.send(200, {"duplicate": True, "id": b.get("id")})
            return self.send(201, {"accepted": n, "pharmacy": ph[2], "hour": hour_iso(H), "batch": f"b_{P.world_id}_{H}_{secrets.token_hex(3)}"})
        if path == "/hakeem/v1/visits" and method == "POST":
            if not key or not hmac.compare_digest(key, P.keys["hakeem"]): return self.err(401, "unauthorized", "Missing or unknown Hakeem key")
            b = self.body(); H = parse_sim_time(b["hour"]) if b.get("hour") else P.C
            n = P.ingest_visits(b.get("area"), b.get("counts") or {}, H, str(b["id"])[:80] if b.get("id") else None)
            if n == -1: return self.send(200, {"duplicate": True, "id": b.get("id")})
            return self.send(201, {"accepted": n, "area": b.get("area"), "hour": hour_iso(H)})
        if path == "/v1/alerts" and method == "GET":
            user = A.user_for(self)
            if not user and not (key and hmac.compare_digest(key, P.keys["integration"])): return self.err(401, "unauthorized", "Sign in or send the integration key")
            lv = (qs.get("level") or ["yellow"])[0][0].upper()
            out = []
            with LOCK:
                for k in P.stepper.levels:
                    if not P.stepper.levels[k]: continue
                    cur, sys_lv, ov = P.level_now(k)
                    if cur in "YR" and (lv != "R" or cur == "R"):
                        a, g = k.split("|"); v = P.stepper.first_alert.get(k, {})
                        out.append({"area": a, "governorate": UNIT[a]["gov"], "group": g, "level": "red" if cur == "R" else "yellow",
                                    "since": hour_iso((v[cur][0] - 1) * 24 + v[cur][1]) if cur in v else None,
                                    "system_level": LEVEL_NAME[sys_lv].lower(), "manual": bool(ov and cur == ov["level"])})
            return self.send(200, {"alerts": out, "as_of": hour_iso(max(P.P, 0))})
        # the integration: the pharmacy-network simulator and history import
        if not key or not hmac.compare_digest(key, P.keys["integration"]): return self.err(401, "unauthorized", "Missing or unknown integration key")
        if path == "/v1/sim/clock": return self.send(200, dict(P.clock(), settings=P.S))
        if path == "/v1/sim/hour-done" and method == "POST":
            H = int(self.body()["hour"])
            with LOCK:
                if H >= P.C: raise LookupError("That hour hasn't finished yet")
                P.process_hour(H)
            return self.send(200, {"processed": H})
        if path == "/v1/history" and method == "POST":
            b = self.body(); P.ingest_history(b["hours"], b.get("sales", {}), b.get("visits", {}), b.get("pharmacy_last"))
            return self.send(200, {"processed": P.P})
        return self.err(404, "not_found", "No such endpoint")

    def secure(self):
        return "; Secure" if self.headers.get("X-Forwarded-Proto", "").lower() == "https" else ""

    # ---- browser APIs (signed-in people) ----
    def api(self, method, path, qs):
        A, P, db = self.app, self.app.pipe, self.app.db
        if path == "/api/login" and method == "POST":
            b = self.body(); uname = str(b.get("username", "")).strip().lower(); ip = self.client_address[0]
            k = (ip, uname); A.fails[k] = [t for t in A.fails[k] if t > time.time() - 300]
            if len(A.fails[k]) >= 8: return self.err(429, "too_many", "Too many attempts. Wait 5 minutes and try again.")
            a = db.one("SELECT * FROM accounts WHERE username=?", (uname,))
            if not a or not check_pw(str(b.get("password", "")), a["pw_hash"]):
                A.fails[k].append(time.time()); return self.err(401, "wrong", "That username and password don't match.")
            if not a["active"]: return self.err(403, "inactive", "This account has been switched off by an admin.")
            token = secrets.token_urlsafe(32)
            db.x("INSERT INTO sessions VALUES (?,?,?,?)", (sha(token), a["username"], time.time(), time.time() + 12 * 3600))
            return self.send(200, {"ok": True}, headers={"Set-Cookie": f"fs_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200" + self.secure()})
        user = A.user_for(self)
        if path == "/api/logout" and method == "POST":
            m = re.search(r"fs_session=([A-Za-z0-9_\-]+)", self.headers.get("Cookie", ""))
            if m: db.x("DELETE FROM sessions WHERE token_hash=?", (sha(m.group(1)),))
            return self.send(200, {"ok": True}, headers={"Set-Cookie": "fs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + self.secure()})
        if not user: return self.err(401, "signed_out", "Please sign in")
        admin = user["role"] == "admin"
        govs = json.loads(user["govs"])
        if PUBLIC and method == "POST" and (path.startswith("/api/accounts") or path in ("/api/me/password", "/api/world", "/api/clock", "/api/ai", "/api/ai/pull")):
            return self.err(403, "public", "This is the public demo link, so accounts and settings can't be changed here. Run Foreshock on your own computer to try that.")
        if path == "/api/state":
            accts = [public_account(a) for a in db.q("SELECT * FROM accounts ORDER BY role, name")]
            if admin: reps = db.q("SELECT * FROM reports WHERE world_id=?", (P.world_id,))
            else: reps = db.q("SELECT * FROM reports WHERE world_id=? AND by_user=?", (P.world_id, user["username"]))
            fv = [self.fv(v) for v in db.q("SELECT * FROM field_visits WHERE world_id=? ORDER BY id", (P.world_id,)) if v["gov"] in govs]
            return self.send(200, {"me": public_account(user), "accounts": accts if admin else [a for a in accts if a["active"]], "reports": [self.rep(r) for r in reps], "field_visits": fv,
                                   "clock": P.clock(), "world": P.world_id})
        if path == "/api/clock" and method == "GET": return self.send(200, P.clock())
        if path == "/api/me/password" and method == "POST":
            b = self.body()
            if not check_pw(str(b.get("old", "")), user["pw_hash"]): return self.err(422, "wrong", "Your current password isn't right.")
            if len(str(b.get("new", ""))) < 8: return self.err(422, "shortPw", "Use at least 8 characters.")
            db.x("UPDATE accounts SET pw_hash=? WHERE username=?", (hash_pw(str(b["new"])), user["username"]))
            return self.send(200, {"ok": True})
        if path == "/api/snapshot": return self.send(200, P.snapshot(), gz=True)
        if path == "/api/feed":
            after = int((qs.get("after") or ["0"])[0])
            return self.send(200, {"entries": [e for e in list(P.feed) if e["id"] > after][-120:], "last": P.feed_seq})
        if path == "/api/reports" and method == "POST":
            if user["role"] != "inspector": return self.err(403, "forbidden", "Only inspectors report on alerts")
            b = self.body(); area, grp = b["area"], b["group"]
            if area not in UNIT or grp not in E.GROUPS: raise ValueError("Unknown area or group")
            if UNIT[area]["gov"] not in govs: return self.err(403, "forbidden", "That area is outside your governorates")
            to = db.one("SELECT * FROM accounts WHERE username=? AND role='admin' AND active=1", (b.get("to"),)) or db.one("SELECT * FROM accounts WHERE role='admin' AND active=1 ORDER BY username")
            decision = "confirm" if b.get("decision") == "confirm" else "false"
            if b.get("level") not in ("Y", "R"): raise ValueError("level must be Y or R")
            rid = "rep_" + secrets.token_hex(6)
            db.x("INSERT INTO reports (id, world_id, area, gov, grp, level, decision, note, by_user, to_user, at_hour, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                 (rid, P.world_id, area, UNIT[area]["gov"], grp, b.get("level", "Y")[:1], decision, str(b.get("note", ""))[:400], user["username"], to["username"], P.P,
                  "waiting" if decision == "confirm" else "noted", now_iso()))
            P.sms("admin", to["name"], area, grp, TX.to_admin(UNIT[area], grp, b.get("level", "Y")[:1], decision, str(b.get("note", ""))[:400], user), "sent", P.P)
            with LOCK: P.load_bumps(); P.orev += 1          # a false alarm raises the bar from tomorrow
            P.bump()
            return self.send(201, {"id": rid})
        m = re.match(r"^/api/reports/(rep_[0-9a-f]+)/decide$", path)
        if m and method == "POST":
            if not admin: return self.err(403, "forbidden", "Only admins decide")
            r = db.one("SELECT * FROM reports WHERE id=?", (m.group(1),))
            if not r or r["world_id"] != P.world_id: return self.err(404, "not_found", "No such report in this world")
            if r["gov"] not in govs: return self.err(403, "forbidden", "That report is outside your governorates")
            if r["status"] != "waiting": return self.err(409, "conflict", "This report has already been decided")
            action = self.body().get("action")
            if action not in ("approved", "closed"): raise ValueError("action must be approved or closed")
            db.x("UPDATE reports SET status=?, admin_user=?, admin_hour=?, decided_at=? WHERE id=?", (action, user["username"], P.P, now_iso(), r["id"]))
            u, insp = UNIT[r["area"]], db.one("SELECT * FROM accounts WHERE username=?", (r["by_user"],))
            P.sms("inspector update", insp["name"] if insp else r["by_user"], r["area"], r["grp"], TX.to_inspector(u, action, user), "sent", P.P)
            if action == "approved":
                P.sms("residents", f"~{int(u['size'] * 250000 * 0.9):,} phones in {r['area']} (cell broadcast)", r["area"], r["grp"], TX.residents(u, r["grp"]), "sent", P.P)
            P.bump()
            return self.send(200, {"ok": True})
        if path == "/api/reports/seen" and method == "POST":
            db.x("UPDATE reports SET seen=1 WHERE by_user=? AND world_id=? AND admin_user IS NOT NULL", (user["username"], P.world_id)); P.bump()
            return self.send(200, {"ok": True})
        # ---- field visits: what an inspector found on site, with photos ----
        if path == "/api/field-visits" and method == "POST":
            b = self.body(); area, grp = b.get("area"), b.get("group")
            if area not in UNIT or grp not in E.GROUPS: raise ValueError("Unknown area or group")
            if UNIT[area]["gov"] not in govs: return self.err(403, "forbidden", "That area is outside your governorates")
            CHECKS = {"places": int, "people_sick": int, "closed": int, "water_tested": bool, "water_failed": bool, "samples": bool, "staff_sick": bool}
            checks = {}
            for k, typ in CHECKS.items():
                v = (b.get("checks") or {}).get(k)
                if v is None: continue
                checks[k] = bool(v) if typ is bool else max(0, min(999, int(v)))
            note = str(b.get("note", "")).strip()[:600]
            if not checks and not note: return self.err(422, "empty", "Fill in at least one item or a note.")
            photos_in = b.get("photos") or []
            if len(photos_in) > 3: return self.err(422, "photos", "Up to 3 photos per visit.")
            os.makedirs(os.path.join(DATA, "photos"), exist_ok=True)
            names = []
            for i, durl in enumerate(photos_in):
                m = re.match(r"^data:image/jpeg;base64,([A-Za-z0-9+/=]+)$", str(durl))
                raw = base64.b64decode(m.group(1)) if m else b""
                if not raw.startswith(b"\xff\xd8\xff") or len(raw) > 1_500_000: return self.err(422, "photos", "Photos must be JPEG pictures under 1.5 MB.")
                name = f"w{P.world_id}-{secrets.token_hex(8)}.jpg"
                with open(os.path.join(DATA, "photos", name), "wb") as f: f.write(raw)
                names.append(name)
            vid = db.x("INSERT INTO field_visits (world_id, area, gov, grp, by_user, at_hour, checks, note, photos, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                       (P.world_id, area, UNIT[area]["gov"], grp, user["username"], max(P.P, 0), json.dumps(checks), note, json.dumps(names), now_iso())).lastrowid
            P.log("visit", f"{user['name']} logged a field visit · {area} · {grp}" + (f" · {len(names)} photo{'s' if len(names) != 1 else ''}" if names else ""), area=area)
            P.bump()
            return self.send(201, {"id": vid})
        m = re.match(r"^/api/photos/(w\d+-[0-9a-f]{16}\.jpg)$", path)
        if m and method == "GET":
            v = next((v for v in db.q("SELECT gov, photos FROM field_visits WHERE photos LIKE ?", (f'%"{m.group(1)}"%',))), None)
            if not v or v["gov"] not in govs: return self.err(404, "not_found", "No such photo")
            full = os.path.join(DATA, "photos", m.group(1))
            if not os.path.isfile(full): return self.err(404, "not_found", "No such photo")
            with open(full, "rb") as f: return self.send(200, f.read(), "image/jpeg", headers={"Cache-Control": "private, max-age=86400"})
        # ---- manual overrides (inspectors within their governorates, admins within theirs) ----
        if path in ("/api/overrides", "/api/overrides/draft") and method == "POST":
            b = self.body(); area, grp, level = b.get("area"), b.get("group"), b.get("level")
            if area not in UNIT or grp not in E.GROUPS: raise ValueError("Unknown area or group")
            if UNIT[area]["gov"] not in govs: return self.err(403, "forbidden", "That area is outside your governorates")
            if level not in (("Y", "R", "N") if admin else ("Y", "R")):
                return self.err(403, "forbidden", "Inspectors can raise an alert. Only an admin can stand one down.")
            if P.P < FIRST_H: return self.err(409, "not_ready", "Foreshock hasn't started checking yet.")
            cur, _, _ = P.level_now(f"{area}|{grp}")
            if cur == level: raise LookupError(f"{area} is already {LEVEL_NAME[level].lower()} for this group.")
            if not admin and RANK[level] <= RANK[cur]: return self.err(403, "forbidden", "Inspectors can only raise an alert, not lower it.")
            if path.endswith("/draft"):
                f = P.facts(area, grp, level, user["role"])
                return self.send(200, AI.draft(f, "ar" if b.get("lang") == "ar" else "en", A.ai))
            reason = str(b.get("reason", "")).strip()
            if len(reason) < 8: return self.err(422, "reason", "Write a reason (at least a few words). Everyone who sees the alert will see it.")
            if "[add" in reason or "[أضف" in reason: return self.err(422, "reason", "Replace the part in [brackets] with what you found.")
            if not admin:
                cur, _, _ = P.level_now(f"{area}|{grp}")
                if RANK[level] <= RANK[cur]: return self.err(403, "forbidden", "Inspectors can only raise an alert, not lower it.")
            ai_info = b.get("ai") if isinstance(b.get("ai"), dict) else None
            if ai_info: ai_info = {k: str(ai_info.get(k, ""))[:300] for k in ("engine", "verdict", "advice", "draft", "model")}
            oid = P.set_override(user, area, grp, level, reason[:300], b.get("notify"), bool(b.get("residents")), ai_info)
            return self.send(201, {"id": oid})
        m = re.match(r"^/api/overrides/(\d+)/end$", path)
        if m and method == "POST":
            ov = db.one("SELECT * FROM overrides WHERE id=?", (int(m.group(1)),))
            if not ov: return self.err(404, "not_found", "No such override")
            if UNIT[ov["area"]]["gov"] not in govs: return self.err(403, "forbidden", "That area is outside your governorates")
            if not admin and ov["by_user"] != user["username"]: return self.err(403, "forbidden", "Inspectors can only end their own overrides.")
            P.end_override(user, ov["id"], str(self.body().get("reason", ""))[:300])
            return self.send(200, {"ok": True})
        if path == "/api/ai" and method == "GET": return self.send(200, A.ai.public())
        if path == "/api/ask" and method == "POST":
            b = self.body(); q = str(b.get("question", "")).strip()[:300]; lang = "ar" if b.get("lang") == "ar" else "en"
            area, grp = b.get("area"), b.get("group")
            if area is not None and (area not in UNIT or (grp is not None and grp not in E.GROUPS)): raise ValueError("Unknown area or group")
            if area and UNIT[area]["gov"] not in govs: return self.err(403, "forbidden", "That area is outside your governorates")
            if not q and not area: raise ValueError("Ask a question")
            if P.P < FIRST_H: return self.err(409, "not_ready", "Foreshock hasn't started checking yet.")
            now = time.time(); hits = [t for t in A.asks[user["username"]] if now - t < 600]
            if len(hits) >= 30: return self.err(429, "slow_down", "That's a lot of questions. Wait a few minutes and ask again.")
            A.asks[user["username"]] = hits + [now]
            with LOCK:
                G = ASK.gather(P, govs, q, lang, area, grp, user["role"], in_scope=lambda a: UNIT[a]["gov"] in govs)
                text = ASK.facts_text(G, AI.describe); fallback = ASK.offline(G, q, lang, explain=bool(area))
            if not q: q = (f"Explain why {area} {grp or ''} is at this level now, in plain words." if lang == "en" else f"اشرح لماذا {area} {grp or ''} في هذا المستوى الآن بكلمات بسيطة.")
            out = AI.ask(q, text, lang, A.ai, fallback)
            out["area"] = G["area"]; return self.send(200, out)
        # ---- admins only from here ----
        if not admin: return self.err(403, "forbidden", "Admins only")
        if path == "/api/clock" and method == "POST":
            b = self.body()
            if P.realtime: return self.err(409, "realtime", "Real-time mode follows the real clock. Switch to the demo story in the Simulation tab to fast-forward.")
            with LOCK:
                if "running" in b: P.running = bool(b["running"]); P.last_advance = time.time() - (SPEEDS[P.speed] if P.running else 0)
                if "speed" in b and int(b["speed"]) in SPEEDS: P.speed = int(b["speed"])
                if "skip_to_day" in b:
                    target = (int(b["skip_to_day"]) - 1) * 24
                    if target > P.C: P.skip_to = min(target, MAX_HOUR)
            return self.send(200, P.clock())
        if path == "/api/world" and method == "POST":
            b = self.body()
            wid = P.new_world(b.get("settings") or {}, b.get("start_day", 13), b.get("start_hour", 18), realtime=bool(b.get("realtime")))
            return self.send(201, {"world": wid})
        if path == "/api/ai" and method == "POST":
            b = self.body(); model = str(b.get("model", "")).strip()
            if model and model not in [m for m, _ in AI.MODELS]: return self.err(422, "model", "Unknown model")
            A.ai.save(model=model or None, enabled=b.get("enabled") if "enabled" in b else None)
            return self.send(200, A.ai.public())
        if path == "/api/ai/pull" and method == "POST":
            st = A.ai.status(fresh=True)
            if not st["ollama"]: return self.err(409, "no_ollama", "Ollama isn't running on this computer. Install it from ollama.com and open it first.")
            if PUBLIC: return self.err(403, "public", "Downloading models is turned off on the public link.")
            A.ai.start_pull(); return self.send(202, A.ai.public())
        if path == "/api/ai/test" and method == "POST": return self.send(200, AI.test(A.ai))
        if path == "/api/briefing" and method == "POST":
            if P.P < FIRST_H: return self.err(409, "not_ready", "Foreshock hasn't started checking yet.")
            with LOCK: facts = P.briefing_facts(govs)
            out = AI.briefing(facts, "ar" if self.body().get("lang") == "ar" else "en", A.ai)
            out.update({"from": facts["from"], "to": facts["to"], "scope": facts["scope"], "by": user["name"], "counts": {"red": sum(1 for x in facts["current"] if x["level"] == "R"),
                        "yellow": sum(1 for x in facts["current"] if x["level"] == "Y"), "silent": len(facts["silent"]), "overrides": len(facts["overrides"]), "visits": len(facts["visits"])}})
            return self.send(200, out)
        if path == "/api/sms":
            rows = db.q("SELECT * FROM sms WHERE world_id=? ORDER BY id DESC LIMIT 300", (P.world_id,))
            return self.send(200, {"sms": rows})
        if path == "/api/keys":
            ph = sorted(P.keys.get("pharmacies", {}).items())
            demo = next(((c, v) for c, v in ph if v["area"] == P.S["area"]), ph[0] if ph else (None, None))
            return self.send(200, {"pharmacy": {"code": demo[0], "area": demo[1]["area"], "key": demo[1]["key"]} if demo[0] else None,
                                   "hakeem": P.keys["hakeem"], "gtin": GTIN, "icd": ICD})
        national = set(GOVS) <= set(govs)
        def can_manage(t):
            return set(json.loads(t["govs"])) <= set(govs) and (t["role"] != "admin" or national)
        if path == "/api/accounts/reset-demo" and method == "POST":
            if not national: return self.err(403, "forbidden", "Only a national admin can reset everything")
            seed_accounts(db, wipe=True); db.x("DELETE FROM reports"); P.bump()
            return self.send(200, {"ok": True}, headers={"Set-Cookie": "fs_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0" + self.secure()})
        if path == "/api/accounts" and method == "POST":
            b = self.body(); u = str(b.get("u", "")).strip().lower()
            if not re.match(r"^[a-z0-9._-]{3,32}$", u): return self.err(422, "badUser", "Usernames use 3–32 lowercase letters, numbers, dots or dashes.")
            if db.one("SELECT 1 FROM accounts WHERE username=?", (u,)): return self.err(422, "takenUser", "That username is taken.")
            name = re.sub(r"[<>&\"]", "", str(b.get("name", ""))).strip()
            if not name: return self.err(422, "noName", "Add a name.")
            if len(str(b.get("pw", ""))) < 6: return self.err(422, "shortPw", "Use at least 6 characters.")
            g = [x for x in (b.get("govs") or []) if x in GOVS]
            if not g: return self.err(422, "noGov", "Pick at least one governorate.")
            role = "admin" if b.get("role") == "admin" else "inspector"
            if not set(g) <= set(govs): return self.err(403, "forbidden", "You can only add accounts inside your own governorates.")
            if role == "admin" and not national: return self.err(403, "forbidden", "Only a national admin can add admins.")
            db.x("INSERT INTO accounts VALUES (?,?,?,?,?,?,?,?,1,0,?)", (u, name[:80], "", role, "Ministry of Health" if role == "admin" else "", "", json.dumps(g), hash_pw(b["pw"]), now_iso()))
            P.bump(); return self.send(201, {"ok": True})
        m = re.match(r"^/api/accounts/([a-z0-9._-]+)(?:/(active|reset))?$", path)
        if m:
            target = db.one("SELECT * FROM accounts WHERE username=?", (m.group(1),))
            if not target: return self.err(404, "not_found", "No such account")
            if target["username"] == user["username"]: return self.err(409, "self", "You can't change your own account here")
            if not can_manage(target): return self.err(403, "forbidden", "That account is outside what you manage.")
            if method == "DELETE": db.x("DELETE FROM accounts WHERE username=?", (target["username"],)); db.x("DELETE FROM sessions WHERE username=?", (target["username"],))
            elif m.group(2) == "active":
                on = bool(self.body().get("on")); db.x("UPDATE accounts SET active=? WHERE username=?", (1 if on else 0, target["username"]))
                if not on: db.x("DELETE FROM sessions WHERE username=?", (target["username"],))
            elif m.group(2) == "reset":       # a fresh one-time password, shown once to the admin; old sign-ins end
                temp = "fs-" + "".join(secrets.choice("abcdefghjkmnpqrstuvwxyz23456789") for _ in range(8))
                db.x("UPDATE accounts SET pw_hash=? WHERE username=?", (hash_pw(temp), target["username"]))
                db.x("DELETE FROM sessions WHERE username=?", (target["username"],))
                P.bump(); return self.send(200, {"ok": True, "password": temp})
            P.bump(); return self.send(200, {"ok": True})
        m = re.match(r"^/api/export/(pharmacy|clinic|stock)\.csv$", path)
        if m: return self.export(m.group(1))
        return self.err(404, "not_found", "No such endpoint")

    def fv(self, v):
        return {"id": v["id"], "area": v["area"], "group": v["grp"], "by": v["by_user"], "at": {"day": v["at_hour"] // 24 + 1, "hour": v["at_hour"] % 24},
                "checks": json.loads(v["checks"] or "{}"), "note": v["note"], "photos": json.loads(v["photos"] or "[]")}

    def rep(self, r):
        return {"id": r["id"], "world": r["world_id"], "area": r["area"], "gov": r["gov"], "group": r["grp"], "level": r["level"], "decision": r["decision"],
                "note": r["note"], "by": r["by_user"], "to": r["to_user"], "at": {"day": r["at_hour"] // 24 + 1, "hour": r["at_hour"] % 24},
                "status": r["status"], "admin": r["admin_user"], "adminAt": {"day": r["admin_hour"] // 24 + 1, "hour": r["admin_hour"] % 24} if r["admin_hour"] is not None else None,
                "seen": bool(r["seen"])}

    def export(self, kind):
        P = self.app.pipe; buf = io.StringIO(); w = csv.writer(buf)
        last = P.P // 24 + 1
        with LOCK:
            if kind == "pharmacy":
                w.writerow(["Day", "Date", "Weekday", "Area", "Illness group", "Medicine", "Boxes sold"])
                for d in range(1, last + 1):
                    for a in AREAS:
                        for m, g, _ in E.MEDICINES: w.writerow([d, E.date_of(d).isoformat(), E.WD_NAMES[E.js_day(d)], a, g, m, P.daily[f"{a}|{m}"][d]])
            elif kind == "clinic":
                w.writerow(["Day", "Date", "Weekday", "Area", "Illness group", "Visits"])
                for d in range(1, last + 1):
                    for a in AREAS:
                        for g in E.GROUPS: w.writerow([d, E.date_of(d).isoformat(), E.WD_NAMES[E.js_day(d)], a, g, P.cdaily[f"{a}|{g}"][d]])
            else:
                sup, _ = E.supply(AREAS, P.daily, P.ctxw.full, E.FIRST_DAY, max(1, last - 1))
                w.writerow(["Day", "Area", "Medicine", "Boxes on shelf (end of day)", "Full shelf"])
                for k, days in sup.items():
                    a, m = k.split("|")
                    for d, v in days.items(): w.writerow([d, a, m, v[0], v[1]])
        self.send(200, "﻿" + buf.getvalue(), "text/csv; charset=utf-8",
                  headers={"Content-Disposition": f'attachment; filename="foreshock_{kind}_world{P.world_id}.csv"'}, gz=True)

# ---------------------------------------------------------------- start
def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM); s.connect(("10.255.255.255", 1)); ip = s.getsockname()[0]; s.close(); return ip
    except Exception:
        return None

class Server(ThreadingHTTPServer):
    # On Windows "reuse address" lets two programs share one port, so a second Foreshock
    # window would steal requests silently. Turn it off there; macOS needs it on for quick restarts.
    allow_reuse_address = os.name != "nt"

    def handle_error(self, request, client_address):
        # a browser or phone that hangs up mid-request is normal; only print real problems
        if isinstance(sys.exc_info()[1], (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, TimeoutError)): return
        super().handle_error(request, client_address)


def safe_console():
    """Windows consoles can't always print Arabic or '…'. Replace what they can't show instead of crashing."""
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(errors="replace")
        except Exception: pass


def share_link(port):
    """A free temporary https link through Cloudflare (no account): https://<random>.trycloudflare.com"""
    import shutil
    exe = shutil.which("cloudflared") or next((p for p in (os.path.join(ROOT, "cloudflared"), os.path.join(ROOT, "cloudflared.exe")) if os.path.isfile(p)), None)
    if not exe:
        print("  --share needs cloudflared. Install it once:\n    Mac:     brew install cloudflared\n    Windows: winget install Cloudflare.cloudflared\n  then start Foreshock again.\n")
        return
    global PUBLIC
    PUBLIC = True
    proc = subprocess.Popen([exe, "tunnel", "--no-autoupdate", "--url", f"http://127.0.0.1:{port}"], stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    def watch():
        for line in proc.stderr:
            m = re.search(r"https://[a-z0-9-]+\.trycloudflare\.com", line)
            if m:
                print(f"\n  PUBLIC LINK (works anywhere, while this window is open): {m.group(0)}\n  Safe mode is on: accounts and settings can't be changed through it.\n", flush=True)
    threading.Thread(target=watch, daemon=True).start()
    import atexit; atexit.register(proc.terminate)


def main():
    safe_console()
    ap = argparse.ArgumentParser(description="Foreshock server")
    ap.add_argument("--port", type=int, default=int(os.environ.get("PORT", 8000)))
    ap.add_argument("--share", action="store_true", help="also make a temporary public https link (needs cloudflared)")
    ap.add_argument("--host", default="0.0.0.0")
    ap.add_argument("--no-sim", action="store_true", help="don't start the pharmacy network simulator")
    ap.add_argument("--no-browser", action="store_true")
    args = ap.parse_args()
    os.makedirs(DATA, exist_ok=True)
    db = DB(os.path.join(DATA, "foreshock.db"))
    seed_accounts(db)
    db.x("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
    pipe = Pipeline(db)
    last = db.one("SELECT id FROM worlds ORDER BY id DESC LIMIT 1")
    if last: pipe.load_world(last["id"])
    if not last or pipe.expired(): pipe.new_world({}, realtime=True)       # first start: run on today's date
    Handler.app = App(db, pipe)
    srv = None
    for port in range(args.port, args.port + 10):
        try: srv = Server((args.host, port), Handler); break
        except OSError: continue
    if not srv: sys.exit("Couldn't find a free port. Close other Foreshock windows and try again.")
    srv.daemon_threads = True
    port = srv.server_address[1]

    state = {"next_roll": 0.0, "sim": None, "sim_check": 0.0}
    def clock_loop():
        while True:
            try:
                if pipe.expired() and time.time() >= state["next_roll"]:   # a new month begins
                    state["next_roll"] = time.time() + 60
                    pipe.new_world({}, realtime=True)
                pipe.tick()
                sim = state["sim"]
                if sim and time.time() >= state["sim_check"]:
                    state["sim_check"] = time.time() + 5
                    if sim.poll() is not None:                                # the pharmacy simulator stopped: start it again
                        print("[server] restarting the pharmacy simulator", flush=True)
                        state["sim"] = subprocess.Popen(sim.args, cwd=HERE)
            except Exception: import traceback; traceback.print_exc()
            time.sleep(0.05)
    threading.Thread(target=clock_loop, daemon=True).start()

    sim = None
    if not args.no_sim:
        sim = subprocess.Popen([sys.executable, os.path.join(HERE, "simulator.py"), "--url", f"http://127.0.0.1:{port}"], cwd=HERE)
        state["sim"] = sim
    ip = lan_ip()
    print("\n  FORESHOCK is running\n  " + "-" * 44)
    print(f"  On this computer:   http://localhost:{port}")
    if ip: print(f"  On phones (same Wi-Fi): http://{ip}:{port}")
    print(f"  Demo password for every demo account: {DEMO_PW}")
    print("  Keep this window open. Close it (or press Ctrl+C) to stop.\n")
    if args.share: share_link(port)
    if not args.no_browser:
        threading.Timer(1.0, lambda: webbrowser.open(f"http://localhost:{port}")).start()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping…")
    finally:
        if state["sim"]: state["sim"].terminate()

if __name__ == "__main__":
    main()
