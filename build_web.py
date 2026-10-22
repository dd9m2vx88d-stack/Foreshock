"""Builds web/ for the Foreshock server from the app sources (run once after changing the app)."""
import json, os, shutil, re

APP = "/home/claude/app"
D3SRC = "/tmp/claude-0/-home-claude/b12c8c7a-84e5-58eb-8c59-a1a50df42e14/scratchpad/d3src"
ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, "web")
SERVER = os.path.join(ROOT, "server")
os.makedirs(WEB, exist_ok=True)

# ---- the map library, served by this server (no internet needed) ----
PKGS = ["d3-array", "d3-color", "d3-delaunay", "d3-format", "d3-geo", "d3-interpolate", "d3-path", "d3-polygon", "d3-scale",
        "d3-selection", "d3-shape", "d3-time", "d3-time-format", "internmap"]
V = os.path.join(WEB, "vendor"); shutil.rmtree(V, ignore_errors=True); os.makedirs(V)
imports = {}
for p in PKGS:
    shutil.copytree(os.path.join(D3SRC, p, "src"), os.path.join(V, p, "src"))
    shutil.copy(os.path.join(D3SRC, p, "LICENSE"), os.path.join(V, p, "LICENSE"))
    imports[p] = f"/vendor/{p}/src/index.js"
os.makedirs(os.path.join(V, "delaunator"))
for f in ("index.js", "LICENSE"): shutil.copy(os.path.join(D3SRC, "delaunator", f), os.path.join(V, "delaunator", f))
imports["delaunator"] = "/vendor/delaunator/index.js"
shutil.copytree(os.path.join(D3SRC, "robust-predicates", "esm"), os.path.join(V, "robust-predicates", "esm"))
for f in ("index.js", "LICENSE"): shutil.copy(os.path.join(D3SRC, "robust-predicates", f), os.path.join(V, "robust-predicates", f))
imports["robust-predicates"] = "/vendor/robust-predicates/index.js"
open(os.path.join(V, "d3shim.js"), "w").write(
    'import * as a from "d3-array"; import * as g from "d3-geo"; import * as dl from "d3-delaunay"; import * as sh from "d3-shape";\n'
    'import * as sc from "d3-scale"; import * as se from "d3-selection"; import * as po from "d3-polygon";\n'
    'window.d3 = Object.assign({}, a, g, dl, sh, sc, se, po);\n')

# ---- the page ----
t = open(os.path.join(APP, "template.html"), encoding="utf-8").read()
def rep(a, b):
    global t
    assert t.count(a) == 1, a[:80]
    t = t.replace(a, b)
rep('<button class="tab" role="tab" id="tab-conn" aria-selected="false">', '<button class="tab" role="tab" id="tab-sms" aria-selected="false"><span data-i="tabSms">SMS log</span></button>\n    <button class="tab" role="tab" id="tab-conn" aria-selected="false">')
rep('<button class="tab" role="tab" id="tab-live" aria-selected="false">', '<button class="tab" role="tab" id="tab-insights" aria-selected="false"><span data-i="tabInsights">Insights</span></button>\n    <button class="tab" role="tab" id="tab-brief" aria-selected="false"><span data-i="tabBrief">Briefing</span></button>\n    <button class="tab" role="tab" id="tab-live" aria-selected="false">')
rep('  <section id="view-conn" hidden></section>', '  <section id="view-sms" hidden></section>\n  <section id="view-insights" hidden></section>\n  <section id="view-brief" hidden></section>\n  <section id="view-conn" hidden></section>')
rep('<span class="mono">api.foreshock.example</span>', '<span class="mono" id="apiHost">api.foreshock.example</span>')
rep('</style>', '''
.nowtag { margin-inline-start: 8px; font-family: var(--f-body); font-size: .68rem; font-weight: 700; letter-spacing: .05em; text-transform: uppercase; background: var(--accent-soft); color: var(--accent); padding: 2px 8px; border-radius: 99px; vertical-align: middle }
#backLive { margin-inline-start: 8px; vertical-align: middle }
.toast { position: fixed; inset-inline-start: 50%; transform: translateX(-50%); bottom: calc(20px + env(safe-area-inset-bottom, 0px)); z-index: 70; background: var(--ink); color: var(--surface); padding: 10px 16px; border-radius: 10px; font-size: .88rem; max-width: min(520px, calc(100% - 32px)) }
.t.smslog td { vertical-align: top } .smscell { min-width: 280px } .smscell .bubble { font-size: .8rem }
/* human overrides */
.ovtag { font-size: .8rem; color: var(--ink); background: var(--surface); border: 1px dashed var(--muted); border-radius: 8px; padding: 4px 8px; justify-self: start }
.alert.manual { border-style: dashed; border-inline-start-style: solid }
.alert.stood { border-inline-start-color: var(--muted); opacity: .9 }
.sect.ov .ov-state { margin: 0 0 8px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; font-size: .88rem }
.ov-card { border: 1px dashed var(--muted); border-radius: 10px; padding: 8px 10px; margin: 0 0 10px; font-size: .88rem }
.ov-card p { margin: 4px 0 0 }
.ov-btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 8px }
.btn.ov-R { border-color: var(--red); color: var(--red-ink) } .btn.ov-Y { border-color: var(--yellow); color: var(--yellow-ink) }
.btn.primary.ov-R { background: var(--red); border-color: var(--red); color: #fff } .btn.primary.ov-Y { background: var(--yellow); border-color: var(--yellow); color: #1a1400 }
.ov-form { display: grid; gap: 6px; border: 1px solid var(--line); border-radius: 10px; padding: 10px; margin: 0 0 8px; background: var(--bg) }
.ov-form textarea, .ov-form select { width: 100%; box-sizing: border-box; font: inherit; padding: 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink) }
.ai-row { display: grid; gap: 6px; justify-items: start }
.ai { font-size: .85rem; border-radius: 8px; padding: 7px 10px; background: var(--accent-soft); color: var(--ink); border-inline-start: 3px solid var(--accent); width: 100%; box-sizing: border-box }
.ai.caution { background: var(--yellow-soft); border-inline-start-color: var(--yellow) }
.ai small { display: block; color: var(--muted); margin-top: 3px }
.note.err:empty { display: none } .note.err { color: var(--red-ink) }
.t.ovlog td { vertical-align: top }
.alert.D { border-inline-start-color: var(--muted); background: var(--bg) } .pill.D { background: var(--muted); color: var(--surface) }
.kpi .warn { color: var(--red-ink); font-weight: 600 }
.ctxline { margin: 0 0 10px; font-size: .86rem; color: var(--ink) } .ctxline small { color: var(--muted) }
.fv-list { display: grid; gap: 8px } .fv { border: 1px solid var(--line); border-radius: 10px; padding: 8px 10px; font-size: .86rem }
.fv-top { display: flex; justify-content: space-between; gap: 8px } .fv p { margin: 6px 0 0 }
.fv-chips { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px } .chip { font-size: .76rem; background: var(--accent-soft); border-radius: 99px; padding: 2px 8px } .chip.bad { background: var(--red-soft); color: var(--red-ink) }
.fv-photos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px } .fv-photos img { width: 84px; height: 84px; object-fit: cover; border-radius: 8px; border: 1px solid var(--line) }
.brief-doc { max-width: 820px; margin: 16px auto 0; padding: 28px 32px } .brief-doc h1 { font-size: 1.4rem; margin: 4px 0 6px } .brief-doc h3 { margin: 18px 0 6px; font-size: 1rem }
.brief-doc ul { margin: 0; padding-inline-start: 20px; display: grid; gap: 4px } .brief-brand { font-size: .74rem; letter-spacing: .06em; text-transform: uppercase; color: var(--muted) }
.brief-meta { font-size: .86rem; color: var(--muted); margin: 0 0 8px } .brief-kpis { display: flex; gap: 6px; flex-wrap: wrap } .brief-head { font-size: 1.08rem; font-weight: 600; margin: 16px 0 0; padding: 10px 12px; border-inline-start: 4px solid var(--accent); background: var(--accent-soft); border-radius: 8px }
@media print { body * { visibility: hidden !important } #brief-doc, #brief-doc * { visibility: visible !important } #brief-doc { position: absolute; inset: 0 auto auto 0; width: 100%; max-width: none; margin: 0; box-shadow: none; border: 0 } }
.ask-row { display: flex; gap: 8px } .ask-row input { flex: 1; min-width: 0; font: inherit; padding: 10px 12px; border: 1px solid var(--line); border-radius: 10px; background: var(--surface); color: var(--ink) }
.ask-sugg { display: flex; flex-wrap: wrap; gap: 6px; margin: 10px 0 0 } .ask-sugg .chip { font-size: .8rem }
.ask-ans { margin: 12px 0 0; padding: 12px 14px; border-radius: 10px; background: var(--accent-soft); border-inline-start: 4px solid var(--accent); line-height: 1.55; white-space: normal } .ask-ans small { display: block; margin-top: 6px; color: var(--muted); font-size: .76rem }
#view-insights .grid2 { margin-top: 16px } .linkbtn { border: 0; background: none; padding: 0; font: inherit; color: var(--accent); cursor: pointer; text-align: start } .linkbtn:hover { text-decoration: underline }
.riskbar { display: inline-block; width: 54px; height: 8px; border-radius: 99px; background: var(--line); vertical-align: middle; overflow: hidden } .riskbar i { display: block; height: 100% }
.riskbar.high i { background: var(--red) } .riskbar.medium i { background: var(--yellow) } .riskbar.low i { background: var(--muted) }
details.model { margin-top: 10px } details.model summary { cursor: pointer; font-weight: 600; font-size: .88rem }
.abx { display: grid; gap: 4px } .abx-row { display: grid; grid-template-columns: minmax(90px, 1fr) 2fr 52px; gap: 8px; align-items: center; border: 0; background: none; font: inherit; color: inherit; padding: 4px 2px; cursor: pointer; text-align: start; border-radius: 6px } .abx-row:hover { background: var(--accent-soft) }
.abx-bar { position: relative; height: 10px; border-radius: 99px; background: var(--line) } .abx-bar i { position: absolute; inset-block: 0; inset-inline-start: 0; border-radius: 99px; background: var(--muted) } .abx-bar i.mid { background: var(--yellow) } .abx-bar i.hi { background: var(--red) }
.abx-bar b { position: absolute; inset-block: -3px; width: 2px; background: var(--ink) }
.aisect { display: grid; gap: 6px; justify-items: start } .bumpnote { padding: 6px 10px; border-radius: 8px; background: var(--accent-soft) }
.evbar { display: inline-block; width: 90px; height: 8px; border-radius: 99px; background: var(--line); vertical-align: middle; overflow: hidden } .evbar i { display: block; height: 100% } .evbar i.fs { background: var(--accent) } .evbar i.ears { background: var(--muted) }
@media (max-width: 560px) { .ask-row { flex-direction: column } .abx-row { grid-template-columns: 1fr 1.4fr 46px } }
.fs-banner { position: fixed; z-index: 80; top: calc(10px + env(safe-area-inset-top, 0px)); inset-inline: 10px; display: grid; gap: 6px; max-width: 520px; margin-inline: auto }
.fs-banner .fs-b { display: grid; text-align: start; gap: 2px; padding: 10px 40px 10px 14px; border-radius: 12px; border: 0; background: var(--ink); color: var(--surface); font: inherit; box-shadow: 0 8px 24px rgba(0,0,0,.25); cursor: pointer }
.fs-banner .fs-b.R { background: var(--red); color: #fff } .fs-banner .fs-b.Y { background: var(--yellow); color: #1a1400 } .fs-banner .fs-b span { font-size: .84rem; opacity: .9 }
.fs-banner .fs-x { position: absolute; top: 6px; inset-inline-end: 6px; border: 0; background: transparent; color: inherit; font-size: 1rem; cursor: pointer; padding: 6px; color: #fff; mix-blend-mode: difference }
.btn.bell { padding-inline: 8px }
.fv-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px } .fv-grid label { display: grid; gap: 4px; font-size: .8rem }
.fv-grid input { font: inherit; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); min-width: 0 }
@media (max-width: 520px) { .fv-grid { grid-template-columns: 1fr } }
</style>''')
t = t.replace("<title>Foreshock</title>", "<title>Foreshock</title>\n<meta name=\"robots\" content=\"noindex\">\n"
              "<link rel=\"manifest\" href=\"/manifest.webmanifest\">\n<meta name=\"theme-color\" content=\"#0e2a47\">\n"
              "<link rel=\"apple-touch-icon\" href=\"/icons/apple-touch-icon.png\">\n<meta name=\"apple-mobile-web-app-capable\" content=\"yes\">\n"
              "<meta name=\"mobile-web-app-capable\" content=\"yes\">\n<meta name=\"apple-mobile-web-app-title\" content=\"Foreshock\">\n"
              "<meta name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\">", 1)
# installable app: icons, manifest, service worker
ASSETS = os.path.join(ROOT, "assets"); os.makedirs(os.path.join(WEB, "icons"), exist_ok=True)
for f in os.listdir(ASSETS):
    shutil.copy(os.path.join(ASSETS, f), os.path.join(WEB, "icons", f) if f.endswith(".png") else os.path.join(WEB, f))
rep('<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>\n__SCRIPT__',
    f'<script type="importmap">{json.dumps({"imports": imports})}</script>\n<script type="module" src="/vendor/d3shim.js"></script>\n__SCRIPT__')

units = json.load(open(os.path.join(SERVER, "units.json"), encoding="utf-8"))
geo = json.load(open(os.path.join(SERVER, "geo_compact.json"), encoding="utf-8"))
def gtin13(body12):
    s = sum(int(c) * (3 if i % 2 else 1) for i, c in enumerate(body12))
    return body12 + str((10 - s % 10) % 10)
MEDS = ["Paracetamol", "Cold & Flu paracetamol", "Zomax", "Amoxicillin", "Flagyl", "Protogyn", "ORS", "Onda", "Clopram", "Scabies cream"]
static = {"gtin": {m: "0" + gtin13(f"6250000{100 + i * 7:03d}{i:02d}") for i, m in enumerate(MEDS)},
          "ingredient": {"Paracetamol": "Paracetamol", "Cold & Flu paracetamol": "Paracetamol + decongestant", "Zomax": "Azithromycin",
                         "Amoxicillin": "Amoxicillin", "Flagyl": "Metronidazole", "Protogyn": "Nitroimidazole (antiparasitic)",
                         "ORS": "Oral rehydration salts", "Onda": "Ondansetron", "Clopram": "Metoclopramide", "Scabies cream": "Permethrin"}}
j = lambda o: json.dumps(o, ensure_ascii=False, separators=(",", ":")).replace("</", "<\\/")
os.makedirs(os.path.join(WEB, "js"), exist_ok=True)
open(os.path.join(WEB, "js", "data.js"), "w", encoding="utf-8").write(f"window.FS_SERVER=true;window.FS_UNITS={j(units)};window.FS_GEO={j(geo)};window.FS_STATIC={j(static)};\n")
for f in ("engine.js", "auth_server.js", "dashboard.js", "app.js", "live.js", "alerts.js"):
    shutil.copy(os.path.join(APP, f), os.path.join(WEB, "js", f))
scripts = "\n".join(f'<script src="/js/{f}"></script>' for f in ("data.js", "engine.js", "auth_server.js", "dashboard.js", "app.js", "live.js", "alerts.js"))
t = t.replace("__SCRIPT__", scripts)
head = ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<style>body{margin:0}</style>\n')
end = t.index("</style>") + len("</style>")
open(os.path.join(WEB, "index.html"), "w", encoding="utf-8").write(head + t[:end] + "\n</head>\n<body>\n" + t[end:] + "\n</body>\n</html>\n")
print("web/ built:", sum(len(fs) for _, _, fs in os.walk(WEB)), "files")
