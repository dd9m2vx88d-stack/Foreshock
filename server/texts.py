"""SMS texts in Arabic and English. Each function returns (arabic, english)."""
import json, os

_N = json.load(open(os.path.join(os.path.dirname(__file__), "names.json"), encoding="utf-8"))
AR_NAMES, AR_GROUP = _N["AR_NAMES"], _N["AR_GROUP"]
FSI, PDI = "\u2068", "\u2069"   # keeps an English note readable inside Arabic text
MON_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
MON_AR = ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"]
CARE = {
    "Stomach": ("اغسل يديك جيداً، وتجنّب الطعام غير المطهو جيداً، واشرب سوائل كافية. راجع الطبيب إذا استمر الإسهال أو ظهرت علامات جفاف.",
                "Wash your hands, avoid undercooked food and drink plenty of fluids. See a doctor if diarrhea continues or you feel dehydrated."),
    "Fever / flu": ("الزم البيت إذا كنت مريضاً، وغطِّ فمك عند السعال، وراجع الطبيب إذا ارتفعت الحرارة لأكثر من 3 أيام.",
                    "Stay home if sick, cover coughs, and see a doctor if the fever lasts more than 3 days."),
    "Throat / chest": ("الزم البيت إذا كنت مريضاً، واستخدم الكمامة عند السعال، وراجع الطبيب عند ضيق التنفس.",
                       "Stay home if sick, wear a mask when coughing, and see a doctor if breathing gets hard."),
    "Skin": ("لا تشارك المناشف والملابس، واغسل الأغطية بماء ساخن، وراجع الطبيب عند الحكّة الشديدة.",
             "Don't share towels or clothes, wash bedding in hot water, and see a doctor if itching is severe."),
}


def place(unit):
    if unit["kind"] == "neighborhood":
        return f"{unit['ar']}، عمّان", f"{unit['name']}, Amman"
    return f"{AR_NAMES.get(unit['name'], unit['name'])}، {AR_NAMES.get(unit['gov'], unit['gov'])}", f"{unit['name']}, {unit['gov']}"


def when(d_date, hour):
    return f"{d_date.day} {MON_AR[d_date.month - 1]} {hour:02d}:00", f"{d_date.day} {MON_EN[d_date.month - 1]} {hour:02d}:00"


def inspectors(unit, group, level, d_date, hour):
    pa, pe = place(unit); wa, we = when(d_date, hour); ga = AR_GROUP[group]
    if level == "R":
        return (f"Foreshock 🔴 تنبيه أحمر: {pa}. ارتفاع أدوية {ga} وتأكيد العيادات. توجّه الفريق للتفتيش على المطاعم ومصادر المياه. {wa}",
                f"Foreshock 🔴 RED: {pe}. {group} medicines up and clinics confirm. Send the team to inspect restaurants and water sources. {we}")
    return (f"Foreshock 🟡 تحذير أصفر: ارتفاع غير معتاد في أدوية {ga} في {pa}. تابعوا مع المراكز الصحية خلال 24 ساعة. {wa}",
            f"Foreshock 🟡 YELLOW: unusual rise in {group.lower()} medicines in {pe}. Follow up with health centers within 24 hours. {we}")


def pharmacies(unit, group):
    ga = AR_GROUP[group]; ors = group == "Stomach"
    return (f"Foreshock: ارتفاع حالات {ga} في منطقتكم. اسألوا المرضى عن مكان تناول الطعام، ووجّهوا الحالات الشديدة إلى المركز الصحي.{' شحنة أملاح الإماهة في الطريق.' if ors else ''}",
            f"Foreshock: {group.lower()} cases rising in your area. Ask patients where they ate and send severe cases to the health center.{' An ORS delivery is on the way.' if ors else ''}")


def residents(unit, group):
    pa, pe = place(unit); ca, ce = CARE[group]
    return f"تنبيه صحي – {pa}: ارتفاع حالات {AR_GROUP[group]}. {ca}", f"Health alert – {pe}: {group.lower()} cases rising. {ce}"


def to_admin(unit, group, level, decision, note, insp):
    pa, pe = place(unit); ia, ie = insp.get("name_ar") or insp["name"], insp["name"]
    if decision != "confirm":
        return (f"Foreshock: سجّل المفتش {ia} تنبيه {AR_GROUP[group]} في {pa} كإنذار كاذب.",
                f"Foreshock: inspector {ie} marked the {group.lower()} alert in {pe} as a false alarm.")
    red = level == "R"
    note_ar = f" ملاحظة: «{FSI}{note}{PDI}»." if note else ""
    note_en = f' Note: "{note}".' if note else ""
    return (f"Foreshock: أكّد المفتش {ia} التنبيه {'الأحمر' if red else 'الأصفر'} ({AR_GROUP[group]}) في {pa}.{note_ar} افتح Foreshock للموافقة على رسالة السكان.",
            f"Foreshock: inspector {ie} confirmed the {'RED' if red else 'YELLOW'} {group.lower()} alert in {pe}.{note_en} Open Foreshock to approve the residents' SMS.")


def to_inspector(unit, action, admin):
    pa = unit["ar"] if unit["kind"] == "neighborhood" else AR_NAMES.get(unit["name"], unit["name"])
    aa, ae = admin.get("name_ar") or admin["name"], admin["name"]
    if action == "approved":
        return f"Foreshock: وافق {aa} على رسالة السكان في {pa}. شكراً على التأكيد.", f"Foreshock: {ae} approved the residents' SMS for {unit['name']}. Thanks for confirming."
    return f"Foreshock: أغلق {aa} البلاغ عن {pa} دون رسالة عامة.", f"Foreshock: {ae} closed your report on {unit['name']} with no public SMS."


# ---- manual overrides ----
LV_EN = {"N": "NORMAL", "Y": "YELLOW", "R": "RED"}
LV_AR = {"N": "طبيعي", "Y": "أصفر", "R": "أحمر"}
EMO = {"Y": "🟡", "R": "🔴", "N": "⚪"}


def _who(p):
    return (p.get("name_ar") or p["name"]), p["name"]


def override_inspectors(unit, group, level, old, actor, reason, d_date, hour):
    """To the area's inspectors when someone changes the level by hand."""
    pa, pe = place(unit); wa, we = when(d_date, hour); ga = AR_GROUP[group]; aa, ae = _who(actor)
    ra, re_ = f" السبب: «{FSI}{reason}{PDI}»." if reason else "", f' Reason: "{reason}".' if reason else ""
    if level == "N":
        return (f"Foreshock ⚪ أوقف {aa} تنبيه {ga} في {pa} يدوياً.{ra} سيعود Foreshock للتنبيه إذا ساءت الأمور. {wa}",
                f"Foreshock ⚪ {ae} stood down the {group.lower()} alert in {pe} by hand.{re_} Foreshock will alert again if it gets worse. {we}")
    up = {"N": 0, "W": 1, "Y": 2, "R": 3}[level] > {"N": 0, "W": 1, "Y": 2, "R": 3}[old]
    return (f"Foreshock {EMO[level]} {'رفع' if up else 'خفّض'} {aa} مستوى {ga} في {pa} إلى {LV_AR[level]} يدوياً.{ra} {wa}",
            f"Foreshock {EMO[level]} {ae} {'raised' if up else 'lowered'} {group.lower()} in {pe} to {LV_EN[level]} by hand.{re_} {we}")


def override_admin(unit, group, level, insp, reason):
    """To the admin the inspector picked, when an inspector raises an area by hand."""
    pa, pe = place(unit); ia, ie = _who(insp)
    ra, re_ = f" السبب: «{FSI}{reason}{PDI}»." if reason else "", f' Reason: "{reason}".' if reason else ""
    return (f"Foreshock: رفع المفتش {ia} مستوى {AR_GROUP[group]} في {pa} إلى {LV_AR[level]} يدوياً.{ra} افتح Foreshock للمراجعة.",
            f"Foreshock: inspector {ie} raised {group.lower()} in {pe} to {LV_EN[level]} by hand.{re_} Open Foreshock to review.")


def override_ended(unit, group, actor, sys_level):
    pa, pe = place(unit); aa, ae = _who(actor)
    sa = {"N": "طبيعي", "W": "مراقبة", "Y": "أصفر", "R": "أحمر"}[sys_level]
    se = {"N": "normal", "W": "watch", "Y": "yellow", "R": "red"}[sys_level]
    return (f"Foreshock: أنهى {aa} التعديل اليدوي على {AR_GROUP[group]} في {pa}. المستوى الآن كما يقرأه Foreshock: {sa}.",
            f"Foreshock: {ae} ended the manual override for {group.lower()} in {pe}. The level is back to what Foreshock reads: {se}.")
