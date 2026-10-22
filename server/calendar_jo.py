"""
JORDAN'S CALENDAR: days when pharmacy sales are different for a known reason.
Foreshock expects these changes, so they never look like an outbreak.

  Ramadan           people shop after iftar: sales up about 10%
  Eid eve           the last two days before each Eid: stocking up, +30%
  Eid holidays      many pharmacies close or open late: -30%
  Public holidays   New Year, Labour Day, Independence Day, Christmas: -20%
  Payday            the 1st of the month: +25%

Islamic dates follow the moon and can move by a day; these are the expected dates.
"""
from datetime import date, timedelta

# (first day of Ramadan, Eid al-Fitr, Eid al-Adha) - expected dates
HIJRI = [
    (date(2026, 2, 18), date(2026, 3, 20), date(2026, 5, 27)),
    (date(2027, 2, 8), date(2027, 3, 10), date(2027, 5, 16)),
    (date(2028, 1, 28), date(2028, 2, 27), date(2028, 5, 5)),
    (date(2029, 1, 16), date(2029, 2, 14), date(2029, 4, 24)),
]
FIXED = [((1, 1), "New Year's Day", "رأس السنة الميلادية"), ((5, 1), "Labour Day", "عيد العمال"),
         ((5, 25), "Independence Day", "عيد الاستقلال"), ((12, 25), "Christmas", "عيد الميلاد المجيد")]


def events_between(d0, d1):
    """{date: {"name", "name_ar", "factor"}} for every special day from d0 to d1 (inclusive)."""
    out = {}

    def add(d, name, name_ar, factor):
        if d0 <= d <= d1:
            e = out.get(d)
            if e: e["name"] += " + " + name; e["name_ar"] += " + " + name_ar; e["factor"] = round(e["factor"] * factor, 3)
            else: out[d] = {"name": name, "name_ar": name_ar, "factor": factor}

    for ram, fitr, adha in HIJRI:
        d = ram
        while d < fitr - timedelta(days=2):
            add(d, f"Ramadan (day {(d - ram).days + 1})", f"رمضان (اليوم {(d - ram).days + 1})", 1.10); d += timedelta(days=1)
        for k in (2, 1):
            add(fitr - timedelta(days=k), "Eve of Eid al-Fitr (shopping)", "قبل عيد الفطر (تسوّق)", 1.30)
        for k in range(3):
            add(fitr + timedelta(days=k), f"Eid al-Fitr (day {k + 1})", f"عيد الفطر (اليوم {k + 1})", 0.70)
        for k in (2, 1):
            add(adha - timedelta(days=k), "Eve of Eid al-Adha (shopping)", "قبل عيد الأضحى (تسوّق)", 1.30)
        for k in range(4):
            add(adha + timedelta(days=k), f"Eid al-Adha (day {k + 1})", f"عيد الأضحى (اليوم {k + 1})", 0.70)
    y = d0.year
    while y <= d1.year:
        for (m, dd), n, na in FIXED: add(date(y, m, dd), n, na, 0.80)
        y += 1
    return out


def upcoming(today, n=6):
    """The next few special days (grouped), for the dashboard."""
    ev = events_between(today, today + timedelta(days=400))
    out, last = [], None
    for d in sorted(ev):
        base = ev[d]["name"].split(" (")[0]
        if last and last["base"] == base and (d - last["end"]).days == 1:
            last["end"] = d; continue
        last = {"base": base, "start": d, "end": d, "name": base, "name_ar": ev[d]["name_ar"].split(" (")[0], "factor": ev[d]["factor"]}
        out.append(last)
    return [{"start": e["start"].isoformat(), "end": e["end"].isoformat(), "name": e["name"], "name_ar": e["name_ar"], "factor": e["factor"]} for e in out[:n]]
