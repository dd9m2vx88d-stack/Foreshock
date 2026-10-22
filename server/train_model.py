"""
TRAIN FORESHOCK'S RISK MODEL
============================
Builds many simulated worlds in which outbreaks start in one area and spread to
neighbours, then teaches a logistic-regression model to answer: "given how this area
and its neighbours look tonight, will it turn yellow or red in the next two days?"

  python3 train_model.py            (about 3-5 minutes; needs numpy)

Worlds 0-99 train the model; worlds 100-119 are kept aside to test it honestly
(the model never sees them while learning). Results are written into model.json.
"""
import json, math, os, random, sys
from concurrent.futures import ProcessPoolExecutor
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import engine as E                      # noqa: E402
import risk_model as R                  # noqa: E402

UNITS = json.load(open(os.path.join(HERE, "units.json"), encoding="utf-8"))
GEO = json.load(open(os.path.join(HERE, "geo_compact.json"), encoding="utf-8"))
NB = E.neighbors_of(UNITS, GEO)
AREAS = [u["name"] for u in UNITS]
GMEDS = {g: [m for m, mg, _ in E.MEDICINES if mg == g] for g in E.GROUPS}
N_TRAIN, N_TEST = 100, 20


def make_world(i):
    """A random world: an outbreak that spreads to 1-2 neighbours, sometimes a second one elsewhere."""
    r = random.Random(1000 + i)
    area = r.choice([a for a in AREAS if NB.get(a)]); group = r.choice(E.GROUPS)
    start = r.randint(12, 20); peak = round(r.uniform(2.2, 4.0), 1)
    extra = []
    for n in r.sample(NB[area], k=min(len(NB[area]), r.choice([1, 2]))):
        extra.append({"area": n, "group": group, "start": start + r.randint(2, 4), "peak": round(max(1.6, peak * r.uniform(0.55, 0.85)), 1), "delay": 2})
    if r.random() < 0.5:
        a2 = r.choice(AREAS)
        extra.append({"area": a2, "group": r.choice(E.GROUPS), "start": r.randint(12, 24), "peak": round(r.uniform(1.8, 3.5), 1), "delay": r.randint(1, 3)})
    S = E.settings({"seed": 5000 + i, "area": area, "group": group, "start": start, "peak": peak, "delay": r.randint(1, 3),
                    "trap": r.random() < 0.5, "trapDay": r.randint(10, 26), "payday": r.random() < 0.7, "heatwave": r.random() < 0.5, "extra": extra})
    return S


def rows_for(i):
    S = make_world(i)
    _, det, _ = E.run_batch(S, UNITS)
    X, y, meta = [], [], []
    for a in AREAS:
        for g in E.GROUPS:
            k = f"{a}|{g}"
            for d in range(E.FIRST_DAY, E.DAYS - 1):
                x = det.get(k, {}).get(d); n1 = det.get(k, {}).get(d + 1); n2 = det.get(k, {}).get(d + 2)
                if not x or not n1 or not n2 or x["level"] in ("Yellow", "Red"): continue      # only areas not alerting yet
                f = R.features(det, k, d, NB, GMEDS)
                X.append([f[n] for n in R.FEATURES]); y.append(1 if n1["level"] in ("Yellow", "Red") or n2["level"] in ("Yellow", "Red") else 0); meta.append((i, d))
    return X, y, meta


def auc(scores, labels):
    order = np.argsort(scores); ranks = np.empty(len(scores)); ranks[order] = np.arange(1, len(scores) + 1)
    pos = labels == 1; n1, n0 = pos.sum(), (~pos).sum()
    return float((ranks[pos].sum() - n1 * (n1 + 1) / 2) / (n1 * n0)) if n1 and n0 else float("nan")


def recall_at(scores, labels, meta, k=10):
    """Of the areas that really turned yellow/red within two days, how many were in that night's top-k list."""
    hit = tot = 0
    by = {}
    for s, l, m in zip(scores, labels, meta): by.setdefault(m, []).append((s, l))
    for rows in by.values():
        rows.sort(key=lambda t: -t[0]); tot += sum(l for _, l in rows); hit += sum(l for _, l in rows[:k])
    return hit / tot if tot else float("nan")


def fit(Z, y, pw, l2=1e-2, iters=30):
    """Logistic regression by Newton's method (IRLS), with rare positives counted pw times."""
    A = np.hstack([Z, np.ones((len(Z), 1))]); beta = np.zeros(A.shape[1]); sw = np.where(y == 1, pw, 1.0)
    for _ in range(iters):
        p = 1 / (1 + np.exp(-np.clip(A @ beta, -30, 30)))
        g = A.T @ (sw * (p - y)) + l2 * np.r_[beta[:-1], 0]
        Hd = sw * p * (1 - p)
        H = (A * Hd[:, None]).T @ A + l2 * np.diag(np.r_[np.ones(A.shape[1] - 1), 0])
        step = np.linalg.solve(H, g); beta -= step
        if np.abs(step).max() < 1e-6: break
    return beta[:-1], float(beta[-1])


def main():
    cache = os.path.join(os.environ.get("TMPDIR", "/tmp"), "foreshock_train_rows.npz")
    if os.path.exists(cache) and "--fresh" not in sys.argv:
        c = np.load(cache, allow_pickle=True); Xtr, ytr, Xte, yte, mte = c["Xtr"], c["ytr"], c["Xte"], c["yte"], [tuple(m) for m in c["mte"]]
    else:
        with ProcessPoolExecutor() as ex:
            results = list(ex.map(rows_for, range(N_TRAIN + N_TEST)))
        Xtr = np.array([r for res in results[:N_TRAIN] for r in res[0]], float); ytr = np.array([v for res in results[:N_TRAIN] for v in res[1]])
        Xte = np.array([r for res in results[N_TRAIN:] for r in res[0]], float); yte = np.array([v for res in results[N_TRAIN:] for v in res[1]])
        mte = [m for res in results[N_TRAIN:] for m in res[2]]
        np.savez(cache, Xtr=Xtr, ytr=ytr, Xte=Xte, yte=yte, mte=np.array(mte))
    mean, std = Xtr.mean(0), Xtr.std(0) + 1e-9
    pw = (ytr == 0).sum() / max(1, (ytr == 1).sum())
    w, b = fit((Xtr - mean) / std, ytr, pw)
    b_cal = b - math.log(pw)          # undo the extra weight on positives, so the chance is a real chance
    st = 1 / (1 + np.exp(-np.clip(((Xte - mean) / std) @ w + b_cal, -30, 30)))
    # calibration check: in the test worlds, how often did areas in each band really turn yellow/red?
    bands = {}
    for lo, hi, name in ((0.3, 1.01, "high"), (0.1, 0.3, "medium"), (0, 0.1, "low")):
        sel = (st >= lo) & (st < hi)
        bands[name] = {"areas": int(sel.sum()), "really_alerted": int(yte[sel].sum()), "rate": round(float(yte[sel].mean()), 3) if sel.any() else None}
    # a simple rule to beat: "flag it if a neighbour is alerting or 2+ medicines are rising"
    fi = {n: i for i, n in enumerate(R.FEATURES)}
    base = Xte[:, fi["nb_recent"]] * 2 + (Xte[:, fi["n_watch"]] >= 2) + Xte[:, fi["max_z"]] * 0.01
    info = {"trained_on_worlds": N_TRAIN, "tested_on_worlds": N_TEST, "train_rows": int(len(ytr)), "test_rows": int(len(yte)),
            "test_positive_rows": int(yte.sum()), "auc": round(auc(st, yte), 3), "auc_simple_rule": round(auc(base, yte), 3),
            "recall_top10": round(recall_at(st, yte, mte, 10), 3), "recall_top10_simple_rule": round(recall_at(base, yte, mte, 10), 3), "bands": bands, "horizon_hours": 48}
    out = {"features": R.FEATURES, "mean": dict(zip(R.FEATURES, mean.round(5).tolist())), "std": dict(zip(R.FEATURES, std.round(5).tolist())),
           "weights": dict(zip(R.FEATURES, w.round(5).tolist())), "bias": round(float(b_cal), 5), "info": info}
    json.dump(out, open(os.path.join(HERE, "model.json"), "w", encoding="utf-8"), indent=1)
    print(json.dumps(info, indent=1)); print("weights:", out["weights"])


if __name__ == "__main__":
    main()
