FORESHOCK — feel the tremor before the quake
=============================================
An outbreak early-warning system for Jordan. Student prototype for the
Sydney Innovation Challenge 2026 (SDG 3). All pharmacy and clinic data is
SIMULATED. The accounts are demo accounts.


1. START IT
-----------
You need Python 3.8 or newer (free: https://www.python.org/downloads/).
Nothing else to install. It works without internet.

  Mac:      double-click  "Start Foreshock (Mac).command"
            The first time, macOS says "Not Opened". Click Done, then:
            System Settings > Privacy & Security > scroll down >
            "Open Anyway" next to Start Foreshock > enter your Mac password.
            You only do this once.
            Or skip the launcher: open Terminal and type
              cd ~/Downloads/Foreshock && python3 server/server.py

  Windows:  double-click  "Start Foreshock (Windows).bat"
            If a blue "Windows protected your PC" box appears:
            More info > Run anyway.
            When installing Python, tick "Add python.exe to PATH".

A black window opens (that's the server) and your browser opens Foreshock.
Keep the black window open. Closing it stops Foreshock.

If the firewall asks whether to allow connections, click Allow
(private networks only). That's only needed for phones.


2. SIGN IN
----------
Every demo account uses the password:  foreshock

  admin               Dr. Rania Saleh   Ministry admin, all of Jordan
  admin.north         Omar Khalil       Admin, Irbid / Ajloun / Jerash / Mafraq
  inspector.amman     Lina Haddad       Inspector, Amman
  inspector.north     Yazan Odeh        Inspector, Irbid / Ajloun / Jerash
  inspector.east      Hala Nasser       Inspector, Zarqa / Mafraq
  inspector.central   Sami Qasem        Inspector, Balqa / Madaba
  inspector.south     Fares Tarawneh    Inspector, Karak / Tafilah / Ma'an / Aqaba

Admins manage accounts in the Team tab: a regional admin only manages
accounts inside their own governorates, and only the national admin (admin)
can add admins. "Reset password" gives a one-time password, shown once.
Anyone can change their own password: Inbox tab > My password.


3. REAL TIME (what you see when it starts)
------------------------------------------
Foreshock runs on today's real date and clock. A new world starts on "day 20":
it generates two weeks of pharmacy history from before today, then every
sale arrives the moment it happens (watch the Live feed tab). Foreshock
checks every area on the hour. The pharmacy data is simulated; the clock
and dates are real.

Hidden in today's world (all simulated):
  Irbid        fever / flu       started 5 days ago   -> red
  Kora         fever / flu       spreading from Irbid -> yellow, red in 2 days
  Jubeiha      stomach           started 3 days ago   -> yellow, red tomorrow
  Sweileh      stomach           spreading from Jubeiha -> shows up in 2 days
  Az-Zarqa     skin (scabies)    started 2 days ago   -> yellow and red
  Al-Karak     throat / chest    starts today         -> shows up in a few days
  Marka        one pharmacy till has gone silent (offline)
A new world starts by itself when this one runs out (after 10 days).
Weather is real (Open-Meteo) when the laptop has internet, and Jordan's
calendar (paydays, Ramadan, Eid, holidays) is built in, so neither looks
like an outbreak.


4. OVERRIDE AN ALERT BY HAND
----------------------------
Open an area (click it on the map or in "Alerts now"), then "Human override".
  Inspectors:  raise an area to yellow or red (their governorates only).
  Admins:      raise, lower, or "Stand down" any area they cover.
Every override needs a reason. Press "Draft with AI": it writes a draft
from the numbers and gives a second opinion ("The data supports this" or
"Think twice"). Edit it, then save. Everything goes in the Override log
(Inbox tab) and the right people get an SMS.
Safety rule: if Foreshock's own reading gets worse than both the level set
by hand and what it said at that moment, Foreshock speaks up again.


5. FORESHOCK'S AI (no API keys, nothing to pay)
-----------------------------------------------
Two kinds of AI, both running on this computer:

a) Foreshock's own trained model (always on, nothing to install)
   Insights tab > "Tomorrow's risk": the chance each area turns yellow or
   red in the next 48 hours, with the reasons (e.g. "a yellow neighbour").
   It's a machine-learning model (logistic regression) trained on 100
   simulated worlds where outbreaks spread, and tested on 20 it never saw:
   ranking accuracy (AUC) 0.83 vs 0.74 for a simple rule.
   Retrain it:  python3 server/train_model.py   (needs numpy)

b) A free local AI that writes (optional): Ollama + Qwen 2.5
   It drafts override reasons, writes the weekly briefing, and answers in
   "Ask Foreshock" and "Explain this alert". No account, no key, no internet
   once downloaded. Without it, Foreshock's built-in rules write the same
   things more simply, so everything works either way.
   One-time setup:
     1. Download Ollama from https://ollama.com and open it.
     2. In Foreshock, as admin: Data connections > "Local AI" > Download model
        (about 2 GB). Or in Terminal / PowerShell:  ollama pull qwen2.5:3b
     3. Press Test.
   A slower laptop? Pick "Qwen 2.5 1.5B" in the same card.
   The model only sees area-level numbers, never names or phone numbers.

Also in the Insights tab:
   Antibiotic misuse map: antibiotic boxes sold per throat/chest clinic visit,
   compared with the national middle. Far above it = probably bought without
   a doctor, which drives antibiotic resistance.
   Ask Foreshock: "Where should I send inspectors first?", "وين أرسل المفتشين؟"

Learning from inspectors: when an inspector marks an alert as a false alarm,
Foreshock raises the bar for that area and illness by half a wobble for the
next 14 days (the area page says so). A confirm removes it.

How it works tab > "A fair test": 100 simulated outbreaks, Foreshock vs the
EARS method many health agencies use. At the same false-alarm level,
Foreshock caught 61/100 and EARS 28/100.  Re-run:  python3 server/evaluate.py


6. MORE THINGS TO TRY
---------------------
  Briefing tab (admins): one click writes the week's briefing for the
    Ministry. Print it or save it as a PDF.
  Field visits: on an area page, an inspector logs what they found
    (places checked, water test, samples, photos).
  Silent tills: a pharmacy that stops sending data is flagged, because its
    area would look calmer than it really is.
  On a phone: "Add to Home Screen" installs Foreshock like an app. The bell
    button turns on alerts (banner, sound, vibration).


7. PUT IT ONLINE
----------------
a) A temporary public link from your laptop (free, no account):
   Install cloudflared once:   Mac: brew install cloudflared
                               Windows: winget install Cloudflare.cloudflared
   Then double-click "Share Foreshock online (Mac).command" (or Windows .bat).
   The black window shows a link like https://xxxx.trycloudflare.com that
   works on any phone or computer while the window stays open.
b) Always online: the folder has a Dockerfile and render.yaml. Put the folder
   in a GitHub repository, then on render.com: New > Blueprint > pick it.
On a public link, safe mode is on: accounts, passwords, settings and the
world can't be changed. Anyone with the link can still sign in with the demo
accounts, so only share it with people you trust (judges, teachers).


8. THE FAST DEMO (for presenting, about 2 minutes)
-------------------------------------------------
Simulation tab > "Switch to the demo story (fast)". Then:
 1. Sign in as  admin  on the laptop.
 2. On a phone (same Wi-Fi), open the "On phones" address shown in the black
    window, and sign in as  inspector.amman.
 3. On the laptop choose 10× and press  Go live. The pharmacies start sending
    real sales to the server. Watch them arrive in the Live feed tab.
 4. About 40 seconds later Jubeiha turns YELLOW. The inspector's phone shows it.
 5. On the phone: Confirm… > pick the admin > write a note > Send.
 6. On the laptop: the Inbox shows the report. Approve it.
 7. The phone shows "approved". The SMS log tab shows every message the
    system sent, in Arabic and English.
Back to today: Simulation tab > "Switch to real time (today's date)".
Want a different outbreak? Change the settings > Run simulation.


9. SEND A REAL REQUEST YOURSELF
-------------------------------
Data connections tab > "Try it". It shows a ready-made command with a real
pharmacy key. Paste it into Terminal (Mac) or PowerShell (Windows).
Your sale appears in the Live feed. Change one letter of the key and the
server refuses it (401).


10. START OVER
-------------
Stop Foreshock, delete the "data" folder, start it again.
(The data folder holds the database and the pharmacy keys. It is created
automatically.)

Other options (type after the file name in a terminal):
  --port 8000      use another port (it also tries the next 9 by itself)
  --no-sim         don't start the pharmacy simulator (only real requests)
  --no-browser     don't open the browser
  --share          also make a temporary public link (see 7)


11. WHAT'S INSIDE
----------------
  server/server.py      the server: website, API, database, accounts, clock
  server/engine.py      the detector (and the simulated world)
  server/simulator.py   pretends to be 1,317 pharmacy tills + Hakeem
  server/texts.py       the SMS messages, Arabic and English
  server/ai.py          the local AI (Ollama), with built-in rules as backup
  server/ask.py         Ask Foreshock / Explain this alert
  server/risk_model.py  Foreshock's own risk model (model.json = its numbers)
  server/train_model.py trains the risk model;  server/evaluate.py = EARS test
  server/weather.py, calendar_jo.py   real weather, Jordan's calendar
  web/                  the dashboard (HTML, JavaScript, the map library)
  data/                 created on first start: foreshock.db, keys.json, ai.json
  Dockerfile, render.yaml   for putting it online

Made by Yousef. Map library: d3 (ISC licence, in web/vendor).
