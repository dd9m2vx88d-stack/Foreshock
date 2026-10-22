"""
HOW GOOD IS FORESHOCK? A FAIR TEST AGAINST A STANDARD METHOD
=============================================================
100 simulated worlds, 20 for each outbreak size (1.5x to 3.5x normal sales at the peak),
each with the outbreak in a random area and illness, plus the usual real-life traps
(payday, heatwaves, a one-medicine spike). Every world is judged twice:

  Foreshock   this project's detector (group of medicines, calendar + weather aware,
              clinic confirmation), using its daily verdicts
  EARS C2     the "Early Aberration Reporting System" method many health agencies use:
              alarm when today's total is more than 3 standard deviations above the
              7 days that ended 3 days ago; it doesn't know about payday or heat

For each method:  caught (alerted during the outbreak's first 9 days), days from the start
to the first alert, and false alarms (alert-days anywhere there was no outbreak).

Because EARS can catch more by raising far more false alarms, the fair comparison tunes
EARS until it makes about as many false alarms as Foreshock, then compares what each catches.

  python3 evaluate.py          (about 3 minutes) -> evaluation.json
"""
import json, os, random, statistics, sys
from concurrent.futures import ProcessPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as E   # noqa: E402

UNITS = json.load(open(os.path.join(HERE, "units.json"), encoding="utf-8"))
AREAS = [u["name"] for u in UNITS]
SIZES = [1.5, 2.0, 2.5, 3.0, 3.5]
PER_SIZE = 20


def world(i):
    r = random.Random(9000 + i); size = SIZES[i // PER_SIZE]
    big = [u["name"] for u in UNITS if u["size"] >= 0.5]      # areas with enough pharmacies to show numbers
    return E.settings({"seed": 7000 + i, "area": r.choice(big), "group": r.choice(E.GROUPS), "start": r.randint(13, 21), "peak": size,
                       "delay": r.randint(1, 3), "trap": True, "trapDay": r.randint(10, 26), "payday": True, "heatwave": True})


THRESHOLDS = [3, 4, 5, 6, 8, 10]


def ears_alarm(series, d, th):
    base = series[d - 9:d - 2]                                 # 7 days, ending 3 days before today
    if len(base) < 7: return False
    mu = sum(base) / 7; sd = statistics.pstdev(base) or 0
    return (series[d] - mu) / max(sd, 1.0) > th


def judge(i):
    S = world(i)
    w, det, st = E.run_batch(S, UNITS)
    key = f"{S['area']}|{S['group']}"; window = range(S["start"], S["start"] + 9)
    fa = [d for d in window if det.get(key, {}).get(d, {}).get("level") in ("Yellow", "Red")]
    false_fs = sum(1 for k, days in det.items() for d, v in days.items()
                   if v["level"] in ("Yellow", "Red") and not (k == key and d >= S["start"]))
    out = {"size": S["peak"], "group": S["group"], "area": S["area"],
           "foreshock": {"caught": bool(fa), "delay": (fa[0] - S["start"]) if fa else None, "false": false_fs}, "ears": {}}
    series = {f"{a}|{g}": [sum(w.pharm[f"{a}|{m}"][d] for m, mg, _ in E.MEDICINES if mg == g) for d in range(E.DAYS + 1)] for a in AREAS for g in E.GROUPS}
    for th in THRESHOLDS:
        alarms, false = [], 0
        for k, ser in series.items():
            for d in range(E.FIRST_DAY, E.DAYS + 1):
                if ears_alarm(ser, d, th):
                    if k == key and d >= S["start"]:
                        if d in window: alarms.append(d)
                    else: false += 1
        out["ears"][th] = {"caught": bool(alarms), "delay": (alarms[0] - S["start"]) if alarms else None, "false": false}
    return out


def summary(rows, get):
    caught = [get(o) for o in rows if get(o)["caught"]]
    return {"caught": len(caught), "of": len(rows), "false_per_world": round(sum(get(o)["false"] for o in rows) / len(rows), 1),
            "median_delay_days": statistics.median([c["delay"] for c in caught]) if caught else None,
            "by_size": [sum(1 for o in rows if o["size"] == sz and get(o)["caught"]) for sz in SIZES]}


def main():
    with ProcessPoolExecutor() as ex:
        res = list(ex.map(judge, range(len(SIZES) * PER_SIZE)))
    fs = summary(res, lambda o: o["foreshock"])
    ears = [dict(summary(res, lambda o, th=th: o["ears"][th]), z=th) for th in THRESHOLDS]
    fair = min(ears, key=lambda e: abs(e["false_per_world"] - fs["false_per_world"]))   # EARS tuned to Foreshock's false-alarm level
    misses = {}
    for o in res:
        if not o["foreshock"]["caught"]: misses[o["group"]] = misses.get(o["group"], 0) + 1
    out = {"worlds": len(res), "per_size": PER_SIZE, "sizes": SIZES, "foreshock": fs, "ears": ears, "ears_same_false_alarms": fair,
           "foreshock_misses_by_group": misses,
           "method": "Daily verdicts. Caught = an alert for the outbreak's area and illness within 9 days of its start. "
                     "False alarm = an alert-day for any other area/illness, or before the start. EARS C2: 7-day baseline ending 3 days earlier, alarm when z > threshold."}
    json.dump(out, open(os.path.join(HERE, "evaluation.json"), "w"), indent=1)
    print(json.dumps({k: out[k] for k in ("foreshock", "ears_same_false_alarms", "foreshock_misses_by_group")}, indent=1))


if __name__ == "__main__":
    main()
