"""
REAL WEATHER for real-time worlds (Open-Meteo: free, no key, non-commercial use).
Gets the daily maximum temperature for all 64 areas for the 30 days of the world:
the past 19 days, today and the 10-day forecast. Heat raises ORS sales, and the
detector expects that, so real heat never looks like an outbreak.

If there is no internet, Foreshock uses its simulated weather instead and says so.
Standard library only.
"""
import json, os, urllib.parse, urllib.request
from datetime import date, timedelta

URL = "https://api.open-meteo.com/v1/forecast"


def _centroid(geom):
    pts = geom["coordinates"][0] if geom["type"] == "Polygon" else [pt for poly in geom["coordinates"] for pt in poly[0]]
    return sum(p[1] for p in pts) / len(pts), sum(p[0] for p in pts) / len(pts)


def coords(units, geo):
    """(lat, lng) of every area: neighbourhood points, district centres."""
    out, shapes = {}, {d["name"]: d["geom"] for d in geo["districts"]}
    for u in units:
        if u.get("lat") is not None: out[u["name"]] = (u["lat"], u["lng"])
        elif u["name"] in shapes: out[u["name"]] = _centroid(shapes[u["name"]])
    return out


def fetch(units, geo, date0, days, cache_path=None, ssl_context=None, timeout=20):
    """{area: [max °C for day 1..days]} or None if it couldn't be fetched."""
    d0 = date.fromisoformat(date0); d1 = d0 + timedelta(days=days - 1)
    if cache_path and os.path.exists(cache_path):
        try:
            c = json.load(open(cache_path, encoding="utf-8"))
            if c.get("date0") == date0 and c.get("fetched") == date.today().isoformat(): return c["temps"]
        except Exception: pass
    xy = coords(units, geo); names = [u["name"] for u in units if u["name"] in xy]
    q = {"latitude": ",".join(f"{xy[n][0]:.3f}" for n in names), "longitude": ",".join(f"{xy[n][1]:.3f}" for n in names),
         "daily": "temperature_2m_max", "timezone": "Asia/Amman", "start_date": d0.isoformat(), "end_date": d1.isoformat()}
    req = urllib.request.Request(URL + "?" + urllib.parse.urlencode(q), headers={"User-Agent": "Foreshock student prototype"})
    with urllib.request.urlopen(req, timeout=timeout, context=ssl_context) as r:
        res = json.loads(r.read())
    if isinstance(res, dict): res = [res]
    temps = {}
    for n, loc in zip(names, res):
        vals = (loc.get("daily") or {}).get("temperature_2m_max") or []
        vals = (vals + [None] * days)[:days]
        last = next((v for v in vals if v is not None), 30.0)
        clean = []
        for v in vals:                                  # fill gaps with the day before
            last = v if v is not None else last; clean.append(round(float(last), 1))
        temps[n] = clean
    if len(temps) != len(units): return None
    if cache_path:
        try: json.dump({"date0": date0, "fetched": date.today().isoformat(), "temps": temps}, open(cache_path, "w", encoding="utf-8"))
        except Exception: pass
    return temps
