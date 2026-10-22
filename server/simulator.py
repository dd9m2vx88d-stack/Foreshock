"""
FORESHOCK PHARMACY NETWORK SIMULATOR
====================================
Pretends to be every pharmacy till in Jordan, plus the Hakeem clinic system.
It talks to the Foreshock server only over HTTP, exactly like real tills would:

  each pharmacy  -> POST /v1/sales            with its own API key
  Hakeem         -> POST /hakeem/v1/visits     with the Hakeem key
  at go-live     -> POST /v1/history           the last two weeks of records, in bulk

The server starts it automatically. You can also run it on its own:
    python3 simulator.py --url http://127.0.0.1:8000
Standard library only.
"""
import argparse, json, os, queue, sys, threading, time
import http.client
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
KEYS = os.path.join(os.path.dirname(HERE), "data", "keys.json")
sys.path.insert(0, HERE)
import engine as E  # noqa: E402

UNITS = json.load(open(os.path.join(HERE, "units.json"), encoding="utf-8"))
# a few tills lose their connection (to show Foreshock noticing): (area, which pharmacy, hours before go-live it went quiet)
SILENT = [("Marka", 3, 40), ("Irbid", 11, 26), ("Az-Zarqa", 6, -5)]      # -5: goes quiet 5 hours after go-live


def silent_tills(by_area, start):
    out = {}
    for area, i, before in SILENT:
        phs = by_area.get(area) or []
        if len(phs) > i: out[phs[i][0]] = start - before
    return out
ICD_SPLIT = {"Stomach": ("A09", "R11", 0.6), "Fever / flu": ("R50.9", "J11", 0.55), "Throat / chest": ("J02", "J20", 0.6), "Skin": ("B86", "L29", 0.5)}
MEDS = [m for m, _, _ in E.MEDICINES]


def gtin13(body12):
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(body12))
    return body12 + str((10 - s % 10) % 10)
GTIN = {m: "0" + gtin13(f"6250000{100 + i * 7:03d}{i:02d}") for i, m in enumerate(MEDS)}


class Client:
    """A small pool of keep-alive HTTP connections."""
    def __init__(self, url, workers=8):
        u = urlparse(url); self.host, self.port = u.hostname, u.port or 80
        self.q = queue.Queue(); self.errors = 0
        for _ in range(workers): threading.Thread(target=self._work, daemon=True).start()

    def _conn(self):
        return http.client.HTTPConnection(self.host, self.port, timeout=30)

    def call(self, method, path, key, body=None, conn=None):
        own = conn is None; conn = conn or self._conn()
        for attempt in range(5):
            try:
                data = json.dumps(body).encode() if body is not None else None
                conn.request(method, path, body=data, headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"})
                r = conn.getresponse(); raw = r.read()
                if own: conn.close()
                return r.status, (json.loads(raw) if raw else {})
            except (ConnectionError, OSError, http.client.HTTPException):
                try: conn.close()
                except Exception: pass
                time.sleep(0.3 * (attempt + 1)); conn = self._conn()
        raise ConnectionError("Server not reachable")

    def _work(self):
        conn = self._conn()
        while True:
            job, done = self.q.get()
            try:
                st, _ = self.call(*job, conn=conn)
                if st >= 400: self.errors += 1
            except Exception:
                self.errors += 1; conn = self._conn()
            finally:
                done.release()

    def batch(self, jobs):
        """Send many requests in parallel and wait for all of them."""
        sem = threading.Semaphore(0)
        for j in jobs: self.q.put((j, sem))
        for _ in jobs: sem.acquire()


def iso(H, minute=0, second=0):
    d = E.date_of(H // 24 + 1)
    return f"{d.isoformat()}T{H % 24:02d}:{minute:02d}:{second:02d}+03:00"


def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--url", default="http://127.0.0.1:8000"); args = ap.parse_args()
    for st in (sys.stdout, sys.stderr):
        try: st.reconfigure(errors="replace")    # Windows consoles
        except Exception: pass
    cli = Client(args.url)
    world_id, world, keys, by_area, sched = None, None, None, {}, {}
    print("[simulator] pharmacy network starting…", flush=True)
    state = {"world_id": None, "world": None, "by_area": {}, "sched": {}}
    while True:
        try:
            step(cli, state)
        except Exception as e:                  # the server is busy or restarting: wait and carry on
            print(f"[simulator] {type(e).__name__}: {e} · retrying in 3 s", flush=True)
            time.sleep(3)


def step(cli, state):
    world_id, world, by_area, sched = state["world_id"], state["world"], state["by_area"], state["sched"]
    if True:
        try:
            keys = json.load(open(KEYS, encoding="utf-8"))
            st, clock = cli.call("GET", "/v1/sim/clock", keys["integration"])
            if st != 200: time.sleep(1); return
        except Exception:
            time.sleep(1); return
        if keys.get("world_id") != clock["world"]:       # the server is still writing the new world's keys
            time.sleep(0.5); return
        if clock["world"] != world_id or cli.errors >= 50:   # new world, or many refusals: reload everything
            if cli.errors >= 50: print("[simulator] many requests refused; reloading the pharmacy keys", flush=True)
            cli.errors = 0
            world_id = clock["world"]
            E.set_start(clock["settings"].get("date0"))
            world = E.World(clock["settings"], UNITS)                 # the "truth": what will really be sold
            by_area, sched = {}, {}
            for code, v in sorted(keys.get("pharmacies", {}).items()): by_area.setdefault(v["area"], []).append((code, v["key"]))
            state.update(world_id=world_id, world=world, by_area=by_area, sched=sched, quiet=silent_tills(by_area, clock["start_hour"]))
            print(f"[simulator] world #{world.S['seed']}{' (real time, day 1 = ' + world.S['date0'] + ')' if world.S['realtime'] else ''}: {sum(len(v) for v in by_area.values())} pharmacies online", flush=True)
        P, C, start = clock["processed"], clock["hour"], clock["start_hour"]
        # 1. history import, one day at a time, up to go-live
        if P < start - 1:
            H0 = P + 1; H1 = min(start - 1, (H0 // 24 + 1) * 24 - 1)
            d = H0 // 24 + 1; sl = slice(H0 % 24, H1 % 24 + 1)
            sales = {a: {m: world.hourly_sales(a, m, d)[sl] for m in MEDS} for a in world.areas}
            visits = {a: {g: world.hourly_visits(a, g, d)[sl] for g in E.GROUPS} for a in world.areas}
            body = {"hours": [H0, H1], "sales": sales, "visits": visits}
            if H1 == start - 1:      # last day of history: each till also reports when it last sold something
                quiet = state.get("quiet", {})
                body["pharmacy_last"] = {code: min(H1, quiet.get(code, H1)) for phs in by_area.values() for code, _ in phs}
            st, r = cli.call("POST", "/v1/history", keys["integration"], body)
            if st != 200: print("[simulator] history import refused:", r.get("message"), flush=True); time.sleep(1)
            return
        # 2. live. Every sale gets a moment inside its hour; scans at the same till in the same minute
        #    form one basket. Finished hours are sent in full, then Foreshock is told to check them.
        #    In real-time mode the hour in progress streams out second by second, as it happens.
        quiet = state.get("quiet", {})

        def schedule(H):
            if H in sched: return sched[H]
            d, h = H // 24 + 1, H % 24
            baskets = {}
            for a in world.areas:
                phs = by_area.get(a) or []
                if not phs: continue
                r = E.Rng(f"ph-{world.S['seed']}-{a}-{H}")
                for m in MEDS:
                    for _ in range(world.hourly_sales(a, m, d)[h]):
                        code, key = phs[int(r() * len(phs))]; sec = int(r() * 3600)
                        if code in quiet and H >= quiet[code]: continue      # this till is offline: its sales never arrive
                        b = baskets.setdefault((code, sec // 60), {"sec": sec, "key": key, "items": {}, "id": f"b-{world_id}-{H}-{code}-{sec // 60}"})
                        b["sec"] = min(b["sec"], sec); b["items"][m] = b["items"].get(m, 0) + 1
            jobs = sorted(((b["sec"], ("POST", "/v1/sales", b["key"], {"id": b["id"], "scanned_at": iso(H, b["sec"] // 60, b["sec"] % 60),
                                                                       "items": [{"gtin": GTIN[m], "qty": q} for m, q in b["items"].items()]}))
                           for b in baskets.values()), key=lambda x: x[0])
            sched[H] = {"jobs": jobs, "sent": 0}
            return sched[H]

        def clinic_jobs(H):
            d, h = H // 24 + 1, H % 24; jobs = []
            for a in world.areas:
                r = E.Rng(f"hk-{world.S['seed']}-{a}-{H}"); counts = {}
                for g in E.GROUPS:
                    n = world.hourly_visits(a, g, d)[h]
                    if n:
                        c1, c2, share = ICD_SPLIT[g]; k1 = sum(1 for _ in range(n) if r() < share)
                        if k1: counts[c1] = k1
                        if n - k1: counts[c2] = n - k1
                if counts: jobs.append(("POST", "/hakeem/v1/visits", keys["hakeem"], {"id": f"hk-{world_id}-{H}-{a}", "area": a, "hour": iso(H), "counts": counts}))
            return jobs

        if P < C - 1:                                   # an hour has finished: send the rest of it, then check it
            H = P + 1; sc = schedule(H)
            rest = [j for _, j in sc["jobs"][sc["sent"]:]]; hk = clinic_jobs(H)
            t = time.time(); cli.batch(rest + hk); sc["sent"] = len(sc["jobs"])
            st, r = cli.call("POST", "/v1/sim/hour-done", keys["integration"], {"hour": H})
            if st == 200:
                sched.pop(H, None)
                d, h = H // 24 + 1, H % 24
                print(f"[simulator] day {d} {h:02d}:00 checked · {len(sc['jobs'])} baskets, {len(hk)} clinic reports{' (' + str(len(rest)) + ' sent at the end)' if clock.get('realtime') and len(rest) < len(sc['jobs']) else ''} in {time.time() - t:.1f}s"
                      f"{'  errors: ' + str(cli.errors) if cli.errors else ''}", flush=True)
            return
        if clock.get("realtime") and C < 30 * 24:      # the hour in progress: send what has happened so far
            sc = schedule(C); elapsed = clock["server_time"] - (clock["epoch0"] + C * 3600)
            due = 0
            while sc["sent"] + due < len(sc["jobs"]) and sc["jobs"][sc["sent"] + due][0] <= elapsed: due += 1
            if due:
                cli.batch([j for _, j in sc["jobs"][sc["sent"]:sc["sent"] + due]]); sc["sent"] += due
            time.sleep(1); return
        time.sleep(0.1)


if __name__ == "__main__":
    main()
