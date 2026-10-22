"""
FORESHOCK'S OWN AI: the "tomorrow's risk" model
================================================
A small machine-learning model (logistic regression) that looks at one area and one
illness group at the end of a day and estimates the chance it turns yellow or red within
the next two days. It was trained on simulated outbreaks that spread between neighbouring areas
(see train_model.py) and is stored in model.json. No internet, no API key, no download:
the model is a dozen numbers and a formula, run right here.

What it looks at (the "features"):
  own medicines   how far above normal the group's medicines are, how many are rising
  own clinics     whether clinic visits for the illness are rising
  yesterday       whether it was already high the day before
  neighbours      how many nearby areas are yellow or red, and whether their medicines are rising
Standard library only (training needs numpy; using the model doesn't).
"""
import json, math, os

FEATURES = ["max_z", "sum_pos_z", "prev_max_z", "n_watch", "n_high", "clinic_z", "nb_red", "nb_yellow", "nb_recent", "nb_max_z", "is_watch", "single_med"]
NAMES = {"sum_pos_z": "several medicines up", "prev_max_z": "already high yesterday", "nb_max_z": "neighbours' medicines rising", "max_z": "medicines above normal", "n_watch": "medicines rising", "n_high": "medicines far above normal", "clinic_z": "clinic visits rising",
         "trend": "rising since yesterday", "nb_red": "a red neighbour", "nb_yellow": "a yellow neighbour", "nb_recent": "outbreak next door this week",
         "is_watch": "already on watch", "single_med": "single-medicine illness"}
NAMES_AR = {"sum_pos_z": "عدة أدوية مرتفعة", "prev_max_z": "مرتفع منذ الأمس", "nb_max_z": "أدوية الجوار في ارتفاع", "max_z": "أدوية فوق المعتاد", "n_watch": "أدوية في ارتفاع", "n_high": "أدوية أعلى بكثير من المعتاد", "clinic_z": "زيارات العيادات في ارتفاع",
            "trend": "ارتفاع منذ الأمس", "nb_red": "منطقة مجاورة حمراء", "nb_yellow": "منطقة مجاورة صفراء", "nb_recent": "تفشٍّ في الجوار هذا الأسبوع",
            "is_watch": "تحت المراقبة أصلاً", "single_med": "مرض بدواء واحد"}


def features(det, key, d, neighbors, groups_meds):
    """The model's inputs for one area|group at the end of day d (det = daily detector output)."""
    a, g = key.split("|")
    x = det.get(key, {}).get(d)
    if not x: return None
    zs = [v["z"] for v in x["meds"].values()]
    prev = det.get(key, {}).get(d - 1)
    pz = max([v["z"] for v in prev["meds"].values()] or [0]) if prev else 0
    lv = lambda k, dd: (det.get(k, {}).get(dd) or {}).get("level", "Normal")
    nks = [f"{n}|{g}" for n in neighbors.get(a, [])]
    nbz = [max([v["z"] for v in (det.get(k, {}).get(d) or {"meds": {}})["meds"].values()] or [0]) for k in nks]
    f = {
        "max_z": max(zs or [0]), "sum_pos_z": sum(max(0, z) for z in zs), "prev_max_z": pz, "nb_max_z": max(nbz or [0]),
        "n_watch": sum(1 for z in zs if z >= 2), "n_high": sum(1 for z in zs if z >= 3),
        "clinic_z": x["clinic"]["z"] or 0,
        "nb_red": sum(1 for k in nks if lv(k, d) == "Red"), "nb_yellow": sum(1 for k in nks if lv(k, d) == "Yellow"),
        "nb_recent": 1 if any(lv(k, dd) in ("Yellow", "Red") for k in nks for dd in (d - 2, d - 1, d)) else 0,
        "is_watch": 1 if x["level"] == "Watch" else 0, "single_med": 1 if len(groups_meds[g]) == 1 else 0,
    }
    return f


class Model:
    def __init__(self, path=None):
        path = path or os.path.join(os.path.dirname(__file__), "model.json")
        m = json.load(open(path, encoding="utf-8"))
        self.mean, self.std, self.w, self.b, self.info = m["mean"], m["std"], m["weights"], m["bias"], m.get("info", {})

    def predict(self, f):
        """Chance (0..1) of yellow or red within 48 hours, plus each feature's push up or down."""
        parts = {}
        s = self.b
        for k in FEATURES:
            v = (f[k] - self.mean[k]) / (self.std[k] or 1)
            parts[k] = self.w[k] * v; s += parts[k]
        s = max(-30, min(30, s))
        return 1 / (1 + math.exp(-s)), parts

    def reasons(self, parts, f, lang="en", n=2):
        """The strongest reasons this area is at risk, in plain words."""
        names = NAMES_AR if lang == "ar" else NAMES
        top = sorted(((v, k) for k, v in parts.items() if v > 0.15 and f[k]), reverse=True)[:n]
        return [names[k] for _, k in top]
