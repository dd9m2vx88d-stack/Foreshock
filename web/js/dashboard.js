function boot(DATA) {
"use strict";
if (window.__fsStop) window.__fsStop();
const LIVE = DATA.live, CTX = DATA.ctx, SC = DATA.scenario, RES = DATA.result;
const OKEY = SC.area + "|" + SC.group;
const ACODE = "JO-" + SC.area.toUpperCase().replace(/[^A-Z]+/g, "-").replace(/^-|-$/g, "");

/* ======================= basics ======================= */
const GROUPS = ["Stomach", "Fever / flu", "Throat / chest", "Skin"];
const RANK = { N: 0, W: 1, Y: 2, R: 3 };
const UNIT = Object.fromEntries(DATA.units.map(u => [u.name, u]));
const GA = new Set(DATA.geo.greaterAmman);
const HOODS = DATA.units.filter(u => u.kind === "neighborhood").map(u => u.name);
const MEDS = Object.keys(DATA.gtin);
const MED_GROUP = DATA.medGroup;
const FIRST = LIVE.first_day, LAST = DATA.days[DATA.days.length - 1];
const LIVE_MODE = !!DATA.server;
const TSPAN = (LAST - FIRST + 1) * 24 - 1;                       // the whole period the strip covers
const TMAX = LIVE_MODE ? Math.max(0, Math.min(TSPAN, LIVE.now)) : TSPAN;   // the latest hour you can look at
let CLOCK = DATA.clock || null;
const FR = (SC.outbreak && (RES.red || RES.yellow)) || [17, 20];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const fmt = (n) => Math.round(n).toLocaleString("en-US");
const pad = (n, w = 2) => String(n).padStart(w, "0");

/* ======================= language ======================= */
const AR_NAMES = {
  "Amman": "عمّان", "Irbid": "إربد", "Zarqa": "الزرقاء", "Balqa": "البلقاء", "Mafraq": "المفرق", "Jerash": "جرش",
  "Ajloun": "عجلون", "Madaba": "مأدبا", "Karak": "الكرك", "Tafilah": "الطفيلة", "Ma'an": "معان", "Aqaba": "العقبة",
  "Al-Azraq": "الأزرق", "Ar-Ruwayshid": "الرويشد", "Sabha": "صبحا", "Sama as-Sarhan": "سما السرحان", "Bal'ama": "بلعما",
  "Al-Mafraq": "قصبة المفرق", "Al-Jizah": "الجيزة", "Al-Muwaqqar": "الموقر", "Um al-Basatin": "أم البساتين", "Na'ur": "ناعور",
  "Dhiban": "ذيبان", "Madaba": "مأدبا", "Az-Zarqa": "قصبة الزرقاء", "Birin": "بيرين", "Ar Ramtha": "الرمثا",
  "Wastiyyeh": "الوسطية", "Tayybeh": "الطيبة", "Mazar Shamaliyyeh": "المزار الشمالي", "Bani Knana": "بني كنانة",
  "Al-Aghwar Shamaliyyeh": "الأغوار الشمالية", "Kora": "الكورة", "Irbid ": "قصبة إربد", "As-Salt": "السلط",
  "Ardhah": "العارضة", "Al-Balqa": "البلقاء", "Shuna al-Jabiniyya": "الشونة الجنوبية", "Dair Alla": "دير علا",
  "Kofranjah": "كفرنجة", "Aljun": "قصبة عجلون", "Jerash ": "قصبة جرش", "Wadi Araba": "وادي عربة", "Al-Quwayra": "القويرة",
  "Al-Aqaba": "قصبة العقبة", "Al-Qasr": "القصر", "Al-Safi": "غور الصافي", "Faqqu": "فقوع", "Al-Mazra'a": "المزرعة",
  "Ayy": "عي", "Al-Karak": "قصبة الكرك", "Al-Mazar al-Janubiyya": "المزار الجنوبي", "Wadi Musa": "وادي موسى",
  "Al-Husanyniyya": "الحسينية", "Ash-Shibek": "الشوبك", "Al-Tafila": "قصبة الطفيلة", "Birsayra": "بصيرا", "Al-Hasa": "الحسا",
};
const AR_MED = { "Paracetamol": "باراسيتامول", "Cold & Flu paracetamol": "باراسيتامول للزكام", "Zomax": "زوماكس",
  "Amoxicillin": "أموكسيسيلين", "Flagyl": "فلاجيل", "Protogyn": "بروتوجين", "ORS": "أملاح الإماهة", "Onda": "أوندا",
  "Clopram": "كلوبرام", "Scabies cream": "كريم الجرب" };
const AR_GROUP = { "Stomach": "المعدة", "Fever / flu": "حرارة / إنفلونزا", "Throat / chest": "الحلق / الصدر", "Skin": "الجلد", "All": "الكل" };
const WD = { en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], ar: ["الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة", "السبت"] };
const MON = { en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  ar: ["كانون الثاني", "شباط", "آذار", "نيسان", "أيار", "حزيران", "تموز", "آب", "أيلول", "تشرين الأول", "تشرين الثاني", "كانون الأول"] };

const T = {
  en: {
    appName: "Foreshock", proto: "Student prototype", appSub: "Feel the tremor before the quake · pharmacy sales + clinic visits",
    simTime: "Simulated time", tabSim: "Simulation", tabMap: "Overview", tabLive: "Live feed", tabSupply: "Supply", tabConn: "Data connections", tabMethod: "How it works",
    showWatch: "Show watch", lvN: "Normal", lvW: "Watch", lvY: "Yellow", lvR: "Red", lvS: "Supply",
    lgY: "Yellow: pharmacy warning", lgR: "Red: clinics confirm", lgS: "Supply warning",
    lgStrip: "The strip shows alerts nationwide, hour by hour. Drag it to move in time.",
    kAlerts: "Active alerts", kScans: "Boxes scanned today", kVisits: "Clinic visits today", kVisitsSub: "via Hakeem (simulated)",
    kSupply: "Supply warnings", kSupplySub: "shelves empty before delivery", kPharm: "Pharmacies reporting", kPharmSub: "64 areas · 12 governorates",
    alertsTitle: "Alerts now", feedTitle: "Incoming sales", logTitle: "API log", todayTitle: "Sold nationwide today", supTitle: "Supply warnings",
    play: "Go live", pause: "Pause", live: "Live · receiving data", paused: "Paused", day: "Day",
    yellowN: "yellow", redN: "red", noAlerts: "No alerts. Every area is within its normal range right now.",
    confirm: "Confirm", falseAlarm: "False alarm", confirmed: "Confirmed by inspector", markedFalse: "Marked false alarm",
    since: "since", jordan: "Jordan", govSuffix: " Governorate", greaterAmman: "Greater Amman",
    hintJordan: "Click a governorate to see its districts", hintGov: "Click a district for details",
    hintGovAmman: "Click Greater Amman for neighborhoods, or a district for details", hintCity: "Click a neighborhood for details",
    noteJordan: "Governorate borders: geoBoundaries. A governorate takes the color of its most serious area. Keys: ← → move one hour, space plays.",
    noteGov: "District borders: geoBoundaries. Keys: ← → move one hour, space plays.",
    noteCity: "Neighborhood areas are drawn around each neighborhood's center, not official borders.",
    selected: "Selected area", hood: "Greater Amman neighborhood", districtIn: "District in", pharmacies: "pharmacies reporting",
    learning: "Still learning what normal looks like here.",
    todayChart: "Today so far", dailyChart: "Pharmacy sales, 30 days", clinicChart: "Clinic visits, 30 days",
    expected: "expected", boxes: "boxes", visits: "visits", band: "alert line",
    medicine: "Medicine", soFar: "Sold so far", expSoFar: "Expected", wob: "Wobbles", adj: "Adjusted",
    shelves: "Shelf stock (last night's count)", daysLeft: "days left", out: "empty",
    spread: "Spread check: neighboring areas", noSpread: "No neighboring area is rising. The outbreak looks contained.",
    someSpread: "neighboring area(s) also on alert. Possible spread.",
    watchSpread: "neighboring area(s) slightly above normal (watch). No sign of spread yet, but worth keeping an eye on.",
    moreSupply: "more supply warnings in the Supply tab", box: "box", boxesW: "boxes",
    tabInbox: "Inbox", tabMine: "My reports", tabTeam: "Team", signOut: "Sign out", adminRole: "Admin", inspRole: "Inspector",
    confirmDots: "Confirm…", noteLabel: "Note for the Ministry (optional)", notePh: "What did you find? e.g. checked 3 restaurants, one failed hygiene", sendTo: "Send to", send: "Send to the Ministry", cancel: "Cancel",
    stWaiting: "Sent to {a} · waiting for a decision", stApproved: "{a} approved · residents' SMS sent", stClosed: "{a} closed it · no public SMS", stNotedMe: "You marked it a false alarm", stNoted: "{i} marked it a false alarm",
    byInsp: "{i} confirmed", waitInsp: "Waiting for {i} to check it", noInsp: "No inspector covers this area", approve: "Approve residents' SMS", closeIt: "Close, no public SMS", notYours: "Outside your governorates",
    inboxTitle: "Reports from inspectors", mineTitle: "My reports", toMe: "Sent to me", allAdmins: "All admins", inboxEmpty: "No reports in this world yet. When an inspector confirms an alert, it lands here.",
    mineEmpty: "You haven't reported an alert in this world yet. Open an alert on the Overview, then confirm it or mark it a false alarm.", smsGot: "SMS received", reported: "Reported", decided: "Decided", noteW: "Note", decisionW: "Decision",
    smsAuto: "Sent automatically", smsHeldS: "Held for Ministry approval", smsSentBy: "Sent · approved by {a}", smsAdmin: "Ministry admin", smsAdminWait: "Sent when an inspector confirms", smsInspNote: "SMS to the inspector",
    yourArea: "Your governorates", smsPerson: "inspector", sentTo: "Sent to",
    tabSms: "SMS log", tabBrief: "Briefing", tabInsights: "Insights", nowTag: "Now", backLive: "Back to now", ended: "Simulation finished", waitData: "Waiting for pharmacy data",
    tryTitle: "Try it: send a sale yourself", tryLead: "Paste this into Terminal (Mac) or PowerShell (Windows) on any computer on this Wi-Fi. The sale lands in the live feed within a second.",
    tryNoKey: "An admin can see a pharmacy key here.", smsLogTitle: "SMS sent by the system", smsCols: ["Time", "Type", "To", "Area", "Message", "Status"], reviewsW: "Inspector reports in this world",
    msgTitle: "Full report to the Ministry (preview, Arabic)",
    smsTitle: "SMS warnings (simulated)", smsInsp: "Health inspectors", smsPharm: "Pharmacies in the area", smsPublic: "Residents",
    smsPublicHold: "Held: residents only get an SMS for red alerts, after the Ministry approves it, so a yellow that turns out false never scares anyone.",
    smsTo: "to", smsPeople: "inspectors", smsPh: "pharmacies", smsRes: "phones in the area (cell broadcast)", smsEn: "In English:", smsApproval: "Goes out only after the Ministry approves it.", privacy: "Exact numbers hidden: fewer than 5 pharmacies report here, so sharing them could identify a pharmacy.",
    showOnMap: "Show on map", grp: "Illness group",
    feedSub: "a sample of scans as they arrive", scansMin: "scans/min",
    time: "Time", pharmacy: "Pharmacy", area: "Area", qty: "Qty",
    supSub: "as of last night's shelf count", supNone: "No supply warnings today.",
    supCols: ["Area", "Medicine", "Left", "Days left", "Delivery in", "Send now", "Alert"],
    delivery: "days", sendNote: "boxes",
  },
  ar: {
    appName: "Foreshock", proto: "نموذج طلابي", appSub: "نشعر بالهزّة قبل الزلزال · مبيعات الصيدليات + زيارات العيادات",
    simTime: "وقت محاكاة", tabSim: "المحاكاة", tabMap: "نظرة عامة", tabLive: "البث المباشر", tabSupply: "المخزون", tabConn: "ربط البيانات", tabMethod: "طريقة العمل",
    showWatch: "إظهار المراقبة", lvN: "طبيعي", lvW: "مراقبة", lvY: "أصفر", lvR: "أحمر", lvS: "مخزون",
    lgY: "أصفر: تحذير من الصيدليات", lgR: "أحمر: تأكيد من العيادات", lgS: "تحذير مخزون",
    lgStrip: "يعرض الشريط التنبيهات في المملكة ساعة بساعة. اسحبه للتنقل في الزمن.",
    kAlerts: "تنبيهات نشطة", kScans: "علب مُمسوحة اليوم", kVisits: "زيارات العيادات اليوم", kVisitsSub: "عبر نظام حكيم (محاكاة)",
    kSupply: "تحذيرات المخزون", kSupplySub: "رفوف تفرغ قبل موعد التوريد", kPharm: "صيدليات مُبلِّغة", kPharmSub: "64 منطقة · 12 محافظة",
    alertsTitle: "التنبيهات الآن", feedTitle: "المبيعات الواردة", logTitle: "سجل الواجهة البرمجية", todayTitle: "المبيعات في المملكة اليوم", supTitle: "تحذيرات المخزون",
    play: "تشغيل مباشر", pause: "إيقاف مؤقت", live: "مباشر · استقبال البيانات", paused: "متوقف", day: "اليوم",
    yellowN: "أصفر", redN: "أحمر", noAlerts: "لا توجد تنبيهات. كل المناطق ضمن معدلها الطبيعي الآن.",
    confirm: "تأكيد", falseAlarm: "إنذار كاذب", confirmed: "أكّده المفتش", markedFalse: "سُجّل كإنذار كاذب",
    since: "منذ", jordan: "الأردن", govSuffix: "", greaterAmman: "عمّان الكبرى",
    hintJordan: "اضغط على محافظة لعرض ألويتها", hintGov: "اضغط على لواء لعرض التفاصيل",
    hintGovAmman: "اضغط على عمّان الكبرى لعرض الأحياء، أو على لواء للتفاصيل", hintCity: "اضغط على حي لعرض التفاصيل",
    noteJordan: "حدود المحافظات: geoBoundaries. تأخذ المحافظة لون أخطر منطقة فيها. المفاتيح: ← → ساعة واحدة، المسافة للتشغيل.",
    noteGov: "حدود الألوية: geoBoundaries. المفاتيح: ← → ساعة واحدة، المسافة للتشغيل.",
    noteCity: "مساحات الأحياء مرسومة حول مركز كل حي، وليست حدوداً رسمية.",
    selected: "المنطقة المختارة", hood: "حي في عمّان الكبرى", districtIn: "لواء في محافظة", pharmacies: "صيدلية مُبلِّغة",
    learning: "ما زال النظام يتعلّم ما هو الطبيعي هنا.",
    todayChart: "اليوم حتى الآن", dailyChart: "مبيعات الصيدليات، 30 يوماً", clinicChart: "زيارات العيادات، 30 يوماً",
    expected: "المتوقع", boxes: "علبة", visits: "زيارة", band: "خط التنبيه",
    medicine: "الدواء", soFar: "المبيع حتى الآن", expSoFar: "المتوقع", wob: "تذبذبات", adj: "تعديل",
    shelves: "المخزون على الرفوف (جرد الليلة الماضية)", daysLeft: "أيام متبقية", out: "فارغ",
    spread: "فحص الانتشار: المناطق المجاورة", noSpread: "لا ترتفع أي منطقة مجاورة. يبدو التفشي محصوراً.",
    someSpread: "منطقة مجاورة في حالة تنبيه أيضاً. احتمال انتشار.",
    watchSpread: "منطقة مجاورة أعلى قليلاً من المعتاد (مراقبة). لا علامة على الانتشار بعد، لكن تستحق المتابعة.",
    moreSupply: "تحذيرات مخزون أخرى في تبويب المخزون", box: "علبة", boxesW: "علبة",
    tabInbox: "البريد الوارد", tabMine: "تقاريري", tabTeam: "الفريق", signOut: "خروج", adminRole: "مشرف", inspRole: "مفتش",
    confirmDots: "تأكيد…", noteLabel: "ملاحظة للوزارة (اختياري)", notePh: "ماذا وجدت؟ مثلاً: فُحصت 3 مطاعم وفشل واحد في النظافة", sendTo: "إرسال إلى", send: "إرسال إلى الوزارة", cancel: "إلغاء",
    stWaiting: "أُرسل إلى {a} · بانتظار القرار", stApproved: "وافق {a} · أُرسلت رسالة السكان", stClosed: "أغلقه {a} · دون رسالة للسكان", stNotedMe: "سجّلته كإنذار كاذب", stNoted: "سجّله {i} كإنذار كاذب",
    byInsp: "أكّده {i}", waitInsp: "بانتظار فحص {i}", noInsp: "لا يغطي أي مفتش هذه المنطقة", approve: "الموافقة على رسالة السكان", closeIt: "إغلاق دون رسالة عامة", notYours: "خارج محافظاتك",
    inboxTitle: "تقارير المفتشين", mineTitle: "تقاريري", toMe: "المرسلة إليّ", allAdmins: "كل المشرفين", inboxEmpty: "لا توجد تقارير في هذا العالم بعد. عندما يؤكّد مفتش تنبيهاً يصل إلى هنا.",
    mineEmpty: "لم تُبلّغ عن أي تنبيه في هذا العالم بعد. افتح تنبيهاً في النظرة العامة ثم أكّده أو سجّله كإنذار كاذب.", smsGot: "الرسالة المستلمة", reported: "وقت البلاغ", decided: "وقت القرار", noteW: "ملاحظة", decisionW: "القرار",
    smsAuto: "تُرسل تلقائياً", smsHeldS: "بانتظار موافقة الوزارة", smsSentBy: "أُرسلت · بموافقة {a}", smsAdmin: "مشرف الوزارة", smsAdminWait: "تُرسل عندما يؤكّد مفتش", smsInspNote: "رسالة إلى المفتش",
    yourArea: "محافظاتك", smsPerson: "مفتش", sentTo: "أُرسل إلى",
    tabSms: "سجل الرسائل", tabBrief: "الموجز", tabInsights: "رؤى", nowTag: "الآن", backLive: "العودة إلى الآن", ended: "انتهت المحاكاة", waitData: "بانتظار بيانات الصيدليات",
    tryTitle: "جرّبها: أرسل عملية بيع بنفسك", tryLead: "الصق هذا في Terminal (ماك) أو PowerShell (ويندوز) على أي حاسوب على نفس شبكة الواي فاي. تظهر عملية البيع في البث المباشر خلال ثانية.",
    tryNoKey: "يستطيع المشرف رؤية مفتاح صيدلية هنا.", smsLogTitle: "الرسائل التي أرسلها النظام", smsCols: ["الوقت", "النوع", "إلى", "المنطقة", "الرسالة", "الحالة"], reviewsW: "تقارير المفتشين في هذا العالم",
    msgTitle: "التقرير الكامل إلى الوزارة (معاينة)",
    smsTitle: "رسائل SMS التحذيرية (محاكاة)", smsInsp: "المفتشون الصحيون", smsPharm: "صيدليات المنطقة", smsPublic: "السكان",
    smsPublicHold: "مُعلّقة: لا تصل رسالة للسكان إلا عند التنبيه الأحمر وبعد موافقة الوزارة، حتى لا يُخيف تحذيرٌ أصفر قد يكون كاذباً أحداً.",
    smsTo: "إلى", smsPeople: "مفتشين", smsPh: "صيدلية", smsRes: "هاتف في المنطقة (بث خلوي)", smsEn: "", smsApproval: "تُرسل فقط بعد موافقة الوزارة.", privacy: "الأرقام الدقيقة مخفية: أقل من 5 صيدليات تُبلِّغ هنا، وقد تكشف الأرقامُ هويةَ صيدلية.",
    showOnMap: "عرض على الخريطة", grp: "المجموعة المرضية",
    feedSub: "عينة من عمليات المسح لحظة وصولها", scansMin: "مسح/دقيقة",
    time: "الوقت", pharmacy: "الصيدلية", area: "المنطقة", qty: "الكمية",
    supSub: "حسب جرد الرفوف الليلة الماضية", supNone: "لا توجد تحذيرات مخزون اليوم.",
    supCols: ["المنطقة", "الدواء", "المتبقي", "أيام متبقية", "التوريد بعد", "أرسل الآن", "التنبيه"],
    delivery: "أيام", sendNote: "علبة",
  },
};
Object.assign(T.en, {
  ovTitle: "Human override", ovReads: "Foreshock reads", ovNow: "showing", ovSetBy: "{w} set it to {l} by hand", ovBy: "Set by hand by {w}",
  ovBroke: "Foreshock's own reading has since risen above the manual level, so the map shows Foreshock's level.",
  ovGoNow: "Overrides change the present. Press \"Back to now\" to override this area.", ovToR: "Raise to red", ovRaiseY: "Raise to yellow", ovLowerY: "Lower to yellow", ovToN: "Stand down",
  ovEnd: "End override", ovDraft: "Draft with AI", ovRedraft: "Draft again", ovDrafting: "Drafting…", ovReason: "Reason (saved in the log; everyone on this alert sees it)",
  ovReasonPh: "What did you find? For example: three families sick after eating at the same restaurant.", ovNotify: "Tell this admin", ovRes: "Also send the residents' SMS now",
  ovApply: "Set to {l}", ovDone: "Override saved. Everyone sees it now.", ovEnded: "Override ended. Back to Foreshock's own reading.", ovStood: "Stood down", ovStoodBy: "Stood down by {w}",
  aiSupports: "The data supports this.", aiCaution: "Think twice.", aiByClaude: "Drafted by AI ({m}) from area-level numbers only. Read it and make it yours.",
  aiOffline: "Drafted by Foreshock's built-in rules (local AI not running).", aiShortC: "AI ({m})", aiShortO: "Built-in drafter", aiEdited: "edited",
  ovLogTitle: "Override log", ovCols: ["Time", "Area", "Change", "By", "Reason", "Status"], ovActive: "Active", ovEndedBy: "Ended by {w}", ovLogEmpty: "No manual overrides in this world yet.",
  ovInspNote: "Inspectors can raise an alert. Only an admin can lower one or stand it down.",
  ovRule: "Safety rule: if Foreshock's own reading rises above both the level set by hand and what it said at that moment, Foreshock speaks up again.",
  fvTitle: "Field visits", fvNone: "No field visits logged for this area and illness yet.", fvLog: "Log a field visit", fvPlaces: "Places inspected", fvSick: "Sick people interviewed",
  fvClosed: "Premises closed", fvWaterTested: "Water tested", fvWaterFailed: "Water test failed", fvSamplesQ: "Samples sent to the lab", fvStaffQ: "Food handlers sick",
  fvNote: "What did you find?", fvPhotos: "Photos (up to 3)", fvSave: "Save visit", fvSaving: "Saving…", fvDone: "Field visit saved.", fvPhoto: "Photo from the field visit", fvBadPhoto: "That file isn't a photo this browser can read.",
  fvPlacesN: "{n} places inspected", fvSickN: "{n} sick people", fvClosedN: "{n} closed", fvWaterOk: "water passed", fvWaterFail: "water failed", fvSamples: "samples to lab", fvStaff: "food handlers sick",
  pwTitle: "My password", pwOld: "Current password", pwNew: "New password (8+ characters)", pwSave: "Change password", pwDone: "Password changed.",
  silentN: "tills silent", silent1: "1 till silent", silentPill: "Till silent", silentWhy: "No sales for {h} h. A normal till would have sold about {m} boxes by now, so it's probably offline. This area may look calmer than it is.",
  netTitle: "Pharmacy network", netLead: "Every till should send something every few hours. When one goes quiet for so long that it would happen less than 1 time in 100 by chance, Foreshock flags it: its area may look calmer than it really is.",
  netCols: ["Pharmacy", "Area", "Last sale", "Silent for", "Chance it's normal"], netAllOk: "All tills are reporting.",
  ovVerdict: "Set by hand by {w}. Foreshock's own reading: {s}. Details below.", liveRT: "Live · real time", waitRT: "Live · waiting for the pharmacies",
});
Object.assign(T.ar, {
  ovTitle: "تعديل بشري", ovReads: "قراءة Foreshock", ovNow: "المعروض", ovSetBy: "غيّره {w} يدوياً إلى {l}", ovBy: "عُدّل يدوياً بواسطة {w}",
  ovBroke: "ارتفعت قراءة Foreshock بعد ذلك فوق المستوى اليدوي، لذا تعرض الخريطة مستوى Foreshock.",
  ovGoNow: "التعديل يغيّر الحاضر. اضغط «العودة إلى الآن» لتعديل هذه المنطقة.", ovToR: "رفع إلى أحمر", ovRaiseY: "رفع إلى أصفر", ovLowerY: "خفض إلى أصفر", ovToN: "إيقاف التنبيه",
  ovEnd: "إنهاء التعديل", ovDraft: "صياغة بالذكاء الاصطناعي", ovRedraft: "صياغة من جديد", ovDrafting: "جارٍ الصياغة…", ovReason: "السبب (يُحفظ في السجل ويراه كل من يتابع التنبيه)",
  ovReasonPh: "ماذا وجدت؟ مثلاً: ثلاث عائلات مرضت بعد الأكل في المطعم نفسه.", ovNotify: "أبلغ هذا المشرف", ovRes: "أرسل رسالة السكان الآن أيضاً",
  ovApply: "تغيير إلى {l}", ovDone: "حُفظ التعديل. الجميع يراه الآن.", ovEnded: "انتهى التعديل. عادت قراءة Foreshock.", ovStood: "أُوقف", ovStoodBy: "أوقفه {w}",
  aiSupports: "البيانات تدعم ذلك.", aiCaution: "فكّر مرة أخرى.", aiByClaude: "صاغه الذكاء الاصطناعي ({m}) من أرقام المنطقة فقط. اقرأه واجعله بكلماتك.",
  aiOffline: "صاغته قواعد Foreshock المدمجة (الذكاء الاصطناعي المحلي لا يعمل).", aiShortC: "ذكاء اصطناعي ({m})", aiShortO: "الصياغة المدمجة", aiEdited: "مُعدَّل",
  ovLogTitle: "سجل التعديلات", ovCols: ["الوقت", "المنطقة", "التغيير", "بواسطة", "السبب", "الحالة"], ovActive: "فعّال", ovEndedBy: "أنهاه {w}", ovLogEmpty: "لا تعديلات يدوية في هذا العالم بعد.",
  ovInspNote: "يستطيع المفتش رفع التنبيه. خفضه أو إيقافه للمشرف فقط.",
  ovRule: "قاعدة الأمان: إذا ارتفعت قراءة Foreshock فوق المستوى اليدوي وفوق ما قاله لحظة التعديل، يعود Foreshock للتنبيه.",
  fvTitle: "الزيارات الميدانية", fvNone: "لا زيارات ميدانية مسجّلة لهذه المنطقة والمرض بعد.", fvLog: "تسجيل زيارة ميدانية", fvPlaces: "أماكن تم تفتيشها", fvSick: "مرضى تمت مقابلتهم",
  fvClosed: "منشآت أُغلقت", fvWaterTested: "تم فحص المياه", fvWaterFailed: "فشل فحص المياه", fvSamplesQ: "أُرسلت عينات للمختبر", fvStaffQ: "عمّال أغذية مرضى",
  fvNote: "ماذا وجدت؟", fvPhotos: "صور (حتى 3)", fvSave: "حفظ الزيارة", fvSaving: "جارٍ الحفظ…", fvDone: "حُفظت الزيارة الميدانية.", fvPhoto: "صورة من الزيارة الميدانية", fvBadPhoto: "لا يستطيع المتصفح قراءة هذا الملف كصورة.",
  fvPlacesN: "{n} أماكن مفتشة", fvSickN: "{n} مرضى", fvClosedN: "{n} مغلقة", fvWaterOk: "المياه سليمة", fvWaterFail: "فشل فحص المياه", fvSamples: "عينات للمختبر", fvStaff: "عمّال أغذية مرضى",
  pwTitle: "كلمة المرور", pwOld: "كلمة المرور الحالية", pwNew: "كلمة مرور جديدة (8 أحرف أو أكثر)", pwSave: "تغيير كلمة المرور", pwDone: "تم تغيير كلمة المرور.",
  silentN: "صيدليات صامتة", silent1: "صيدلية واحدة صامتة", silentPill: "صيدلية صامتة", silentWhy: "لا مبيعات منذ {h} ساعة. كانت ستبيع نحو {m} علبة حتى الآن، فالأرجح أن نظامها منقطع. قد تبدو المنطقة أهدأ من حقيقتها.",
  netTitle: "شبكة الصيدليات", netLead: "يجب أن ترسل كل صيدلية شيئاً كل بضع ساعات. إذا صمتت مدة لا تحدث صدفةً إلا مرة من كل 100، ينبّه Foreshock: قد تبدو منطقتها أهدأ من حقيقتها.",
  netCols: ["الصيدلية", "المنطقة", "آخر بيع", "صامتة منذ", "احتمال أن يكون طبيعياً"], netAllOk: "كل الصيدليات تُبلّغ.",
  ovVerdict: "عدّله {w} يدوياً. قراءة Foreshock: {s}. التفاصيل أدناه.", liveRT: "مباشر · الوقت الحقيقي", waitRT: "مباشر · بانتظار الصيدليات",
});
const PREV = window.__fsPrev || {};
const SAME = !!DATA.server && PREV.world === DATA.world_id;
const state = { lang: PREV.lang || "en", t: 0, sec: DATA.server ? 3599 : 0, group: SAME ? PREV.group : "All", area: SAME ? PREV.area : SC.area,
  detailGroup: SAME ? PREV.detailGroup : null, showWatch: SAME ? PREV.showWatch : false, view: SAME && PREV.view ? PREV.view : { level: "jordan" },
  playing: false, speed: PREV.speed || 1, tab: PREV.tab || "map", reviews: {}, reviewOpen: SAME ? PREV.reviewOpen : null, rvDraft: SAME ? PREV.rvDraft : null,
  world: DATA.world_id ?? null, following: SAME ? PREV.following !== false : true, prevT: SAME ? PREV.t : null };
window.__fsPrev = state;
const AUTH = window.FSAuth;
const WORLD = DATA.server ? DATA.world_id : ["w", SC.seed, SC.area, SC.group, SC.start, SC.peak, SC.delay, +SC.outbreak, +SC.trap, SC.trapDay, +SC.payday, +SC.heatwave, +SC.aware, SC.alert].join("|");
const ME = () => AUTH ? AUTH.user() : null;
// the override form lives outside boot(): an AI draft that takes 10 seconds survives the screen being rebuilt meanwhile
const OVST = window.__fsOv || (window.__fsOv = { world: null, open: null, draft: null });
if (OVST.world !== WORLD) { OVST.world = WORLD; OVST.open = null; OVST.draft = null; }
const isInsp = () => ME()?.role === "inspector", isAdm = () => ME()?.role === "admin";
const mine = (area) => !isInsp() || AUTH.covers(ME(), UNIT[area].gov);
const canAct = (area) => !!ME() && AUTH.covers(ME(), UNIT[area].gov);   // regional admins act only in their governorates
const who = (u) => { const a = AUTH && AUTH.find(u); return a ? AUTH.nameOf(a) : u; };
const fill2 = (s, o) => s.replace(/\{(\w)\}/g, (_, k) => o[k] ?? "");
const inspectorFor = (gov) => (AUTH ? AUTH.accounts() : []).filter(a => a.role === "inspector" && a.active && (a.govs || []).includes(gov));
const t = (k) => (T[state.lang][k] ?? T.en[k] ?? k);
const nm = (n) => state.lang === "ar" && AR_NAMES[n] ? AR_NAMES[n] : n;
const gname = (g) => state.lang === "ar" ? AR_GROUP[g] : g;
const mname = (m) => state.lang === "ar" ? AR_MED[m] : m;
const lname = (l) => t("lv" + l);

/* ======================= time ======================= */
const dayOf = (tt = state.t) => FIRST + Math.floor(tt / 24);
const hourOf = (tt = state.t) => tt % 24;
const dIdx = (d) => DATA.days.indexOf(d);
function dateOf(d) { return new Date(DATA.date[dIdx(d)] + "T12:00:00"); }
function fmtDate(d, withWd = true) {
  const x = dateOf(d), L = state.lang;
  return (withWd ? WD[L][x.getDay()] + " " : "") + x.getDate() + " " + MON[L][x.getMonth()] + " " + x.getFullYear();
}
const isFriday = (d) => dateOf(d).getDay() === 5;
const cumP = (d, h) => (isFriday(d) ? LIVE.cum.friday : LIVE.cum.weekday)[h];
const cumC = (h) => LIVE.cum.clinic[h];

/* ======================= levels ======================= */
const rawLvl = (area, g, tt = state.t) => { const s = LIVE.levels[area + "|" + g]; return s ? s[tt] : "N"; };
const lvl = (area, g, tt = state.t) => { const l = rawLvl(area, g, tt); return l === "W" && !state.showWatch ? "N" : l; };
const worst = (ls) => ls.reduce((b, l) => RANK[l] > RANK[b] ? l : b, "N");
const activeGroups = () => state.group === "All" ? GROUPS : [state.group];
const unitLevel = (n, tt = state.t) => worst(activeGroups().map(g => lvl(n, g, tt)));
const govLevel = (gov) => worst(DATA.units.filter(u => u.gov === gov).map(u => unitLevel(u.name)));
const gaLevel = () => worst(HOODS.map(n => unitLevel(n)));
const districtLevel = (n) => GA.has(n) ? gaLevel() : unitLevel(n);
const fill = (l) => ({ N: "var(--cell)", W: "var(--watch)", Y: "var(--yellow)", R: "var(--red)" })[l];
const det = (area, g, d) => (DATA.det[area + "|" + g] || {})[d];
function worstGroup(area) {
  let best = "Stomach", br = 0;
  for (const g of GROUPS) { const r = RANK[lvl(area, g)]; if (r > br) { br = r; best = g; } }
  return best;
}
const hidden = (area) => (CTX.pharmacies[area] || 0) < 5;
function supplyNow(d = dayOf()) { return LIVE.supply_alerts.filter(s => s.day === d - 1); }
function sinceText(area, g) {
  const s = LIVE.levels[area + "|" + g]; let i = state.t; const cur = s[i];
  while (i > 0 && s[i - 1] === cur) i--;
  return `${t("since")} ${fmtDate(dayOf(i), false)} ${pad(hourOf(i))}:00`;
}

/* ======================= human overrides ======================= */
const OVS = (LIVE.overrides || []);
const sysLvl = (area, g, tt = state.t) => { const s = (LIVE.sys_levels || LIVE.levels)[area + "|" + g]; return s ? s[tt] : "N"; };
const ovAt = (area, g, tt = state.t) => { let o = null; for (const x of OVS) if (x.area === area && x.group === g && x.t0 <= tt && (x.t1 == null || tt < x.t1)) o = x; return o; };
const tAt = (tt) => ({ day: FIRST + Math.floor(tt / 24), hour: tt % 24 });
const aiName = (ai) => (state.lang === "ar" ? "محلي · " : "local · ") + (ai.model || "AI");
const aiShort = (ai) => `${ai.engine !== "offline" ? fill2(t("aiShortC"), { m: aiName(ai) }) : t("aiShortO")}: ${ai.verdict === "caution" ? t("aiCaution") : t("aiSupports")}`;

/* ======================= sales so far ======================= */
const hourly = (area, med, d) => LIVE.hourly[`${area}|${med}|${d}`];
function soFar(area, med, d, h, frac = 1) {
  const a = hourly(area, med, d); if (!a) return 0;
  let s = 0; for (let i = 0; i < h; i++) s += a[i]; return s + a[h] * frac;
}
function clinicSoFar(area, g, d, h, frac = 1) {
  const a = LIVE.clinic_hourly[`${area}|${g}|${d}`]; if (!a) return 0;
  let s = 0; for (let i = 0; i < h; i++) s += a[i]; return s + a[h] * frac;
}
// nationwide hourly totals per medicine, computed once
const NAT = {};
for (const [k, arr] of Object.entries(LIVE.hourly)) {
  const [, med, d] = k.split("|"); const key = med + "|" + d;
  if (!NAT[key]) NAT[key] = new Array(24).fill(0);
  arr.forEach((v, i) => NAT[key][i] += v);
}
const NATC = {};
for (const [k, arr] of Object.entries(LIVE.clinic_hourly)) {
  const d = k.split("|")[2]; if (!NATC[d]) NATC[d] = new Array(24).fill(0);
  arr.forEach((v, i) => NATC[d][i] += v);
}
function natSoFar(med, d, h, frac) { const a = NAT[med + "|" + d]; let s = 0; for (let i = 0; i < h; i++) s += a[i]; return s + a[h] * frac; }

/* ======================= geography ======================= */
function feature(name, geom, props = {}) {
  const f = { type: "Feature", properties: { name, ...props }, geometry: JSON.parse(JSON.stringify(geom)) };
  if (d3.geoArea(f) > 2 * Math.PI) {
    const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
    polys.forEach(p => p.forEach(r => r.reverse()));
  }
  return f;
}
const GOVS = DATA.geo.govs.map(g => feature(g.name, g.geom));
const DISTS = DATA.geo.districts.map(d => feature(d.name, d.geom, { gov: d.gov }));
const W = 640, H = 600;
const svg = d3.select("#map");
let paint = () => {};

function drawJordan() {
  svg.selectAll("*").remove();
  const proj = d3.geoMercator().fitExtent([[24, 16], [W - 24, H - 16]], { type: "FeatureCollection", features: GOVS });
  const path = d3.geoPath(proj);
  const regions = svg.append("g").selectAll("path").data(GOVS).join("path")
    .attr("class", "region").attr("d", path).attr("stroke", "var(--cell-line)").attr("stroke-width", 1.5)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => f.properties.name)
    .on("click", (_, f) => go({ level: "gov", gov: f.properties.name }))
    .on("keydown", (e, f) => { if (e.key === "Enter") go({ level: "gov", gov: f.properties.name }); });
  const small = new Set(["Amman", "Zarqa", "Balqa", "Madaba", "Jerash", "Ajloun", "Irbid"]);
  const nudge = { Jerash: [14, 6], Ajloun: [-16, -4], Balqa: [-8, 0], Madaba: [-6, 6], Zarqa: [16, -4], Amman: [6, 8], Irbid: [-4, -6] };
  const labels = svg.append("g").selectAll("g").data(GOVS).join("g").attr("transform", f => {
    const [x, y] = path.centroid(f); const n = nudge[f.properties.name] || [0, 0]; return `translate(${x + n[0]},${y + n[1]})`; });
  labels.append("text").attr("class", f => "lbl" + (small.has(f.properties.name) ? " sm" : "")).attr("y", f => small.has(f.properties.name) ? 3 : -2);
  labels.filter(f => !small.has(f.properties.name)).append("text").attr("class", "lbl ar").attr("y", 13);
  // pulsing ring on the place of every red area
  const pulses = svg.append("g");
  paint = () => {
    regions.attr("fill", f => fill(govLevel(f.properties.name)));
    labels.select("text").text(f => nm(f.properties.name));
    labels.select("text.ar").text(f => state.lang === "ar" ? f.properties.name : AR_NAMES[f.properties.name]);
    labels.selectAll("text").classed("onred", f => govLevel(f.properties.name) === "R").classed("onyel", f => govLevel(f.properties.name) === "Y");
    const reds = DATA.units.filter(u => unitLevel(u.name) === "R").map(u => u.kind === "neighborhood" ? [u.lng, u.lat] : DATA.geo.districts.find(d => d.name === u.name).pt);
    pulses.selectAll("circle").data(reds).join("circle").attr("class", "pulse").attr("r", 16).attr("cx", p => proj(p)[0]).attr("cy", p => proj(p)[1]);
  };
  $("mapHint").textContent = t("hintJordan"); $("mapNote").textContent = t("noteJordan");
}

function drawGov(gov) {
  svg.selectAll("*").remove();
  const govF = GOVS.find(f => f.properties.name === gov);
  const proj = d3.geoMercator().fitExtent([[30, 24], [W - 30, H - 24]], govF);
  const path = d3.geoPath(proj);
  svg.append("g").selectAll("path").data(GOVS.filter(f => f !== govF)).join("path").attr("class", "ctx").attr("d", path);
  const ctxLabels = svg.append("g").selectAll("text").data(GOVS.filter(f => f !== govF)).join("text")
    .attr("class", "lbl sm").attr("fill-opacity", .45).attr("transform", f => `translate(${path.centroid(f)})`);
  const ds = DISTS.filter(f => f.properties.gov === gov);
  const regions = svg.append("g").selectAll("path").data(ds).join("path")
    .attr("class", "region").attr("d", path)
    .attr("stroke", f => GA.has(f.properties.name) ? "none" : "var(--cell-line)").attr("stroke-width", 1.5)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", f => GA.has(f.properties.name) ? "Greater Amman" : f.properties.name)
    .on("click", (_, f) => pick(f)).on("keydown", (e, f) => { if (e.key === "Enter") pick(f); });
  svg.append("path").datum(govF).attr("d", path).attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-opacity", .35).attr("stroke-width", 1.2).attr("pointer-events", "none");
  const selOutline = svg.append("path").attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 2.5).attr("pointer-events", "none");
  const items = ds.filter(f => !GA.has(f.properties.name)).map(f => ({ name: f.properties.name, pt: path.centroid(f), ga: false }));
  if (ds.some(f => GA.has(f.properties.name))) {
    const pts = HOODS.map(n => proj([UNIT[n].lng, UNIT[n].lat]));
    items.push({ name: "Greater Amman", pt: [d3.mean(pts, p => p[0]), d3.mean(pts, p => p[1])], ga: true });
  }
  const labels = svg.append("g").selectAll("g").data(items).join("g").attr("transform", d => `translate(${d.pt})`);
  labels.append("text").attr("class", d => "lbl" + (d.ga ? "" : " sm")).attr("y", 4);
  const pulses = svg.append("g");
  function pick(f) {
    if (GA.has(f.properties.name)) go({ level: "city" });
    else { state.area = f.properties.name; state.detailGroup = null; renderAll(); }
  }
  const lv = (d) => d.ga ? gaLevel() : unitLevel(d.name);
  paint = () => {
    ctxLabels.text(f => { const c = path.centroid(f); return (c[0] > 10 && c[0] < W - 10 && c[1] > 10 && c[1] < H - 10) ? nm(f.properties.name) : ""; });
    regions.attr("fill", f => fill(districtLevel(f.properties.name)));
    labels.select("text").text(d => d.ga ? t("greaterAmman") : nm(d.name));
    labels.selectAll("text").classed("onred", d => lv(d) === "R").classed("onyel", d => lv(d) === "Y");
    const s = ds.find(f => f.properties.name === state.area); selOutline.attr("d", s ? path(s) : null);
    const reds = items.filter(d => lv(d) === "R").map(d => d.pt);
    pulses.selectAll("circle").data(reds).join("circle").attr("class", "pulse").attr("r", 18).attr("cx", p => p[0]).attr("cy", p => p[1]);
  };
  $("mapHint").textContent = items.some(d => d.ga) ? t("hintGovAmman") : t("hintGov"); $("mapNote").textContent = t("noteGov");
}

function drawCity() {
  svg.selectAll("*").remove();
  const PAD = 80;
  const x = d3.scaleLinear().domain(d3.extent(HOODS, n => UNIT[n].lng)).range([PAD, W - PAD]);
  const y = d3.scaleLinear().domain(d3.extent(HOODS, n => UNIT[n].lat)).range([H - PAD, PAD]);
  const pts = HOODS.map(n => [x(UNIT[n].lng), y(UNIT[n].lat)]);
  const hull = d3.polygonHull(pts); const cx = d3.mean(hull, p => p[0]), cy = d3.mean(hull, p => p[1]);
  const grown = hull.map(([px, py]) => { const dx = px - cx, dy = py - cy, L = Math.hypot(dx, dy); return [px + dx / L * 60, py + dy / L * 60]; });
  const outline = d3.line().curve(d3.curveCatmullRomClosed.alpha(0.6))(grown);
  svg.append("defs").append("clipPath").attr("id", "city").append("path").attr("d", outline);
  svg.append("path").attr("d", outline).attr("fill", "var(--surface-2)").attr("stroke", "var(--line)").attr("stroke-width", 2);
  const vor = d3.Delaunay.from(pts).voronoi([0, 0, W, H]);
  const cells = svg.append("g").attr("clip-path", "url(#city)").selectAll("path").data(HOODS).join("path")
    .attr("class", "region").attr("d", (_, i) => vor.renderCell(i)).attr("stroke", "var(--cell-line)").attr("stroke-width", 3)
    .attr("tabindex", 0).attr("role", "button").attr("aria-label", n => n)
    .on("click", (_, n) => { state.area = n; state.detailGroup = null; renderAll(); })
    .on("keydown", (e, n) => { if (e.key === "Enter") { state.area = n; state.detailGroup = null; renderAll(); } });
  const sel = svg.append("path").attr("clip-path", "url(#city)").attr("fill", "none").attr("stroke", "var(--ink)").attr("stroke-width", 2.5).attr("pointer-events", "none");
  const pulses = svg.append("g");
  const OFF = { "Shmeisani": [-22, -6], "Jabal al-Hussein": [16, 10], "Nuzha": [6, -6] };
  const labels = svg.append("g").selectAll("g").data(HOODS).join("g").attr("transform", (n, i) => { const o = OFF[n] || [0, 0]; return `translate(${pts[i][0] + o[0]},${pts[i][1] + o[1]})`; });
  labels.append("text").attr("class", "lbl").attr("y", -2);
  labels.append("text").attr("class", "lbl ar").attr("y", 13);
  paint = () => {
    cells.attr("fill", n => fill(unitLevel(n)));
    labels.select("text").text(n => state.lang === "ar" ? UNIT[n].ar : (n === "Hashmi al-Shamali" ? "Hashmi" : n));
    labels.select("text.ar").text(n => state.lang === "ar" ? "" : UNIT[n].ar);
    labels.selectAll("text").classed("onred", n => unitLevel(n) === "R").classed("onyel", n => unitLevel(n) === "Y");
    const i = HOODS.indexOf(state.area); sel.attr("d", i >= 0 ? vor.renderCell(i) : null);
    pulses.selectAll("circle").data(HOODS.map((n, i) => [n, pts[i]]).filter(([n]) => unitLevel(n) === "R"))
      .join("circle").attr("class", "pulse").attr("r", 22).attr("cx", d => d[1][0]).attr("cy", d => d[1][1]);
  };
  $("mapHint").textContent = t("hintCity"); $("mapNote").textContent = t("noteCity");
}

function go(view) {
  state.view = view;
  if (view.level === "jordan") drawJordan(); else if (view.level === "gov") drawGov(view.gov); else drawCity();
  renderAll();
}
function drawCrumbs() {
  const v = state.view, c = $("crumbs"); c.innerHTML = "";
  const add = (text, view) => {
    if (c.childElementCount) c.insertAdjacentHTML("beforeend", '<span class="sep" aria-hidden="true">›</span>');
    if (view) { const b = document.createElement("button"); b.type = "button"; b.textContent = text; b.onclick = () => go(view); c.appendChild(b); }
    else c.insertAdjacentHTML("beforeend", `<span class="here" aria-current="page">${esc(text)}</span>`);
  };
  add(t("jordan"), v.level === "jordan" ? null : { level: "jordan" });
  if (v.level === "gov") add(nm(v.gov) + t("govSuffix"), null);
  if (v.level === "city") { add(nm("Amman") + t("govSuffix"), { level: "gov", gov: "Amman" }); add(t("greaterAmman"), null); }
}
function showOnMap(name) {
  const u = UNIT[name];
  if (u.kind === "neighborhood") { if (state.view.level !== "city") go({ level: "city" }); }
  else if (!(state.view.level === "gov" && state.view.gov === u.gov)) go({ level: "gov", gov: u.gov });
}

/* ======================= timeline strip ======================= */
const NATLEVEL = [];   // per hour: [yellow count, red count] across all areas & groups (watch excluded)
for (let i = 0; i <= TMAX; i++) {   // nationwide alerts per hour, up to now
  let y = 0, r = 0;
  for (const u of DATA.units) for (const g of GROUPS) { const l = LIVE.levels[u.name + "|" + g][i]; if (l === "Y") y++; else if (l === "R") r++; }
  NATLEVEL.push([y, r]);
}
function drawStrip() {
  const el = $("strip"); el.setAttribute("aria-valuemax", TMAX);
  const FUT = LIVE_MODE && TMAX < TSPAN;
  const w = 1000, h = 46, top = 4, base = 30;
  const xs = (i) => (i / (TSPAN + 1)) * w;
  const maxN = Math.max(2, ...NATLEVEL.map(([y, r]) => y + r));
  let s = `<svg viewBox="0 0 ${w} ${base + 6}" preserveAspectRatio="none" aria-hidden="true" style="height:36px">`;
  s += `<rect x="0" y="${top}" width="${w}" height="${base - top}" fill="var(--surface-2)"/>`;
  NATLEVEL.forEach(([y, r], i) => {
    const bw = w / (TSPAN + 1) + .4, hy = (y / maxN) * (base - top), hr = (r / maxN) * (base - top);
    if (r) s += `<rect x="${xs(i)}" y="${base - hr}" width="${bw}" height="${hr}" fill="var(--red)"/>`;
    if (y) s += `<rect x="${xs(i)}" y="${base - hr - hy}" width="${bw}" height="${hy}" fill="var(--yellow)"/>`;
  });
  for (let d = FIRST; d <= LAST; d++) {
    const i = (d - FIRST) * 24, sup = LIVE.supply_alerts.filter(a => a.day === d - 1).length;
    s += `<line x1="${xs(i)}" x2="${xs(i)}" y1="${top}" y2="${base + 4}" stroke="var(--line)" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if (sup) s += `<rect x="${xs(i) + 2}" y="${base + 2}" width="${Math.min(22, sup * 3)}" height="3" fill="var(--clinic)"/>`;
  }
  if (FUT) s += `<rect x="${xs(TMAX + 1)}" y="${top}" width="${w - xs(TMAX + 1)}" height="${base - top}" fill="url(#fsfut)"/><defs><pattern id="fsfut" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="var(--surface-2)"/><line x1="0" y1="0" x2="0" y2="8" stroke="var(--line)" stroke-width="3"/></pattern></defs>`;
  s += `<line id="ph" y1="0" y2="${base + 6}" stroke="var(--ink)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  let tk = '<div style="position:relative;height:14px;font-family:var(--f-data);font-size:10px;color:var(--muted)">';
  for (let d = FIRST; d <= LAST; d += 2) tk += `<span style="position:absolute;left:${((d - FIRST) * 24 / (TSPAN + 1) * 100).toFixed(2)}%;padding-left:3px">${d}</span>`;
  el.innerHTML = s + tk + "</div>";
  const setFromEvent = (e) => {
    const r = el.getBoundingClientRect(); const fx = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    state.t = Math.min(TMAX, Math.floor(fx * (TSPAN + 1))); state.sec = LIVE_MODE ? 3599 : 0; state.following = state.t === TMAX; renderAll(true);
  };
  let drag = false;
  el.onpointerdown = (e) => { drag = true; el.setPointerCapture(e.pointerId); setFromEvent(e); };
  el.onpointermove = (e) => { if (drag) setFromEvent(e); };
  el.onpointerup = () => { drag = false; };
  el.onkeydown = (e) => { if (e.key === "ArrowRight") { step(1); e.preventDefault(); } if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); } };
}
function moveHead() {
  const ph = $("strip").querySelector("#ph"); const x = ((state.t + state.sec / 3600) / (TSPAN + 1)) * 1000;
  ph.setAttribute("x1", x); ph.setAttribute("x2", x); $("strip").setAttribute("aria-valuenow", state.t);
  $("strip").setAttribute("aria-valuetext", `${t("day")} ${dayOf()} ${pad(hourOf())}:00`);
}

/* ======================= words ======================= */
function listJoin(a) { return state.lang === "ar" ? a.join(" و") : a.length > 1 ? a.slice(0, -1).join(", ") + " and " + a[a.length - 1] : (a[0] || ""); }
function nowHigh(area, g) {
  const d = dayOf(), h = hourOf(), info = det(area, g, d); if (!info) return [];
  const F = cumP(d, h), out = [];
  for (const [m, v] of Object.entries(info.m)) {
    const sf = soFar(area, m, d, h), exp = v[1] * F, wob = Math.max(v[3] * Math.sqrt(F), Math.sqrt(Math.max(exp, 1)), 1);
    if ((sf - exp) / wob >= 3 && sf - exp >= 5) out.push(m);
  }
  if (!out.length && h === 23) return info.h;
  return out.length ? out : info.h;
}
function explain(area, g) {
  const d = dayOf(), info = det(area, g, d); if (!info) return t("learning");
  const L = lvl(area, g), hi = nowHigh(area, g).map(mname), ar = state.lang === "ar";
  if (L === "R") return ar ? `حذّرت الصيدليات وأكّدت العيادات: ${hi.length ? listJoin(hi) + " تُباع بأكثر بكثير من المعتاد، و" : ""}زيارات العيادات لأعراض ${gname(g)} مرتفعة. يُنصح بإرسال فريق تفتيش صحي.`
    : `Pharmacies warned and clinics confirmed: ${hi.length ? listJoin(hi) + " selling far above normal, and " : ""}clinic visits for ${g.toLowerCase()} symptoms are up. Send health inspectors.`;
  if (L === "Y") return ar ? `${listJoin(hi)} تُباع بأكثر بكثير من المعتاد في الوقت نفسه، وزيارات العيادات ما زالت دون مستوى التأكيد. يُنصح بالمتابعة وانتظار تأكيد العيادات.`
    : `${listJoin(hi)} ${hi.length > 1 ? "are" : "is"} selling far above normal at the same time. Clinic visits haven't confirmed it yet. Look closer and watch the clinics.`;
  if (rawLvl(area, g) === "W") return ar ? "دواء أعلى قليلاً من المعتاد. يحدث هذا كثيراً بالصدفة، لذا لا تنبيه." : "A medicine is a little above normal. That happens often by chance, so no alert.";
  return ar ? "المبيعات وزيارات العيادات ضمن المعدل الطبيعي." : "Sales and clinic visits are in the normal range.";
}
function arabicMessage(area, g) {
  const L = lvl(area, g), d = dayOf(), h = hourOf(), u = UNIT[area];
  const hi = nowHigh(area, g).map(m => AR_MED[m]);
  const place = u.kind === "neighborhood" ? `${u.ar}، عمّان` : `${AR_NAMES[area] || area}، محافظة ${AR_NAMES[u.gov]}`;
  const x = dateOf(d); const when = `${x.getDate()} ${MON.ar[x.getMonth()]} ${x.getFullYear()}، الساعة ${pad(h)}:00`;
  const cz = det(area, g, d)?.cz;
  return [
    `Foreshock | تنبيه ${L === "R" ? "أحمر" : "أصفر"}`,
    `المنطقة: ${place}`,
    `المجموعة المرضية: ${AR_GROUP[g]}`,
    hi.length ? `ارتفاع غير معتاد في مبيعات: ${hi.join("، ")}` : "",
    L === "R" ? `زيارات العيادات (حكيم): مرتفعة وتؤكّد التحذير` : `زيارات العيادات (حكيم): لم تؤكّد بعد`,
    L === "R" ? "الإجراء المقترح: إرسال فريق تفتيش صحي، وفحص المطاعم ومصادر المياه في المنطقة." : "الإجراء المقترح: متابعة المنطقة خلال الـ 24 ساعة القادمة والتواصل مع المراكز الصحية.",
    `الوقت: ${when}`,
  ].filter(Boolean).join("\n");
}
function smsTexts(area, g) {
  const L = lvl(area, g), u = UNIT[area], d = dayOf(), h = hourOf(), x = dateOf(d);
  const place = u.kind === "neighborhood" ? `${u.ar}، عمّان` : `${AR_NAMES[area] || area}، ${AR_NAMES[u.gov]}`;
  const placeEn = u.kind === "neighborhood" ? `${area}, Amman` : `${area}, ${u.gov}`;
  const when = `${x.getDate()} ${MON.ar[x.getMonth()]} ${pad(h)}:00`, whenEn = `${x.getDate()} ${MON.en[x.getMonth()]} ${pad(h)}:00`;
  const grpAr = AR_GROUP[g], grpEn = g.toLowerCase();
  const red = L === "R";
  const care = { "Stomach": ["اغسل يديك جيداً، وتجنّب الطعام غير المطهو جيداً، واشرب سوائل كافية. راجع الطبيب إذا استمر الإسهال أو ظهرت علامات جفاف.",
                             "Wash your hands, avoid undercooked food and drink plenty of fluids. See a doctor if diarrhea continues or you feel dehydrated."],
                 "Fever / flu": ["الزم البيت إذا كنت مريضاً، وغطِّ فمك عند السعال، وراجع الطبيب إذا ارتفعت الحرارة لأكثر من 3 أيام.",
                                 "Stay home if sick, cover coughs, and see a doctor if the fever lasts more than 3 days."],
                 "Throat / chest": ["الزم البيت إذا كنت مريضاً، واستخدم الكمامة عند السعال، وراجع الطبيب عند ضيق التنفس.",
                                    "Stay home if sick, wear a mask when coughing, and see a doctor if breathing gets hard."],
                 "Skin": ["لا تشارك المناشف والملابس، واغسل الأغطية بماء ساخن، وراجع الطبيب عند الحكّة الشديدة.",
                          "Don't share towels or clothes, wash bedding in hot water, and see a doctor if itching is severe."] }[g];
  return {
    insp: red ? [`Foreshock 🔴 تنبيه أحمر: ${place}. ارتفاع أدوية ${grpAr} وتأكيد العيادات. توجّه الفريق للتفتيش على المطاعم ومصادر المياه. ${when}`,
                 `Foreshock 🔴 RED: ${placeEn}. ${g} medicines up and clinics confirm. Send the team to inspect restaurants and water sources. ${whenEn}`]
               : [`Foreshock 🟡 تحذير أصفر: ارتفاع غير معتاد في أدوية ${grpAr} في ${place}. تابعوا مع المراكز الصحية خلال 24 ساعة. ${when}`,
                  `Foreshock 🟡 YELLOW: unusual rise in ${grpEn} medicines in ${placeEn}. Follow up with health centers within 24 hours. ${whenEn}`],
    pharm: [`Foreshock: ارتفاع حالات ${grpAr} في منطقتكم. اسألوا المرضى عن مكان تناول الطعام، ووجّهوا الحالات الشديدة إلى المركز الصحي.${g === "Stomach" ? " شحنة أملاح الإماهة في الطريق." : ""}`,
            `Foreshock: ${grpEn} cases rising in your area. Ask patients where they ate and send severe cases to the health center.${g === "Stomach" ? " An ORS delivery is on the way." : ""}`],
    pub: red ? [`تنبيه صحي – ${place}: ارتفاع حالات ${grpAr}. ${care[0]}`, `Health alert – ${placeEn}: ${grpEn} cases rising. ${care[1]}`] : null,
  };
}
const AREA_AR = (n) => UNIT[n]?.ar || AR_NAMES[n] || n;
const placeLabel = (n) => UNIT[n].kind === "neighborhood" ? `${nm("Amman")} › ${state.lang === "ar" ? UNIT[n].ar : n}` : `${nm(UNIT[n].gov)} › ${nm(n)}`;
const areaName = (n) => UNIT[n].kind === "neighborhood" && state.lang === "ar" ? UNIT[n].ar : nm(n);

/* ======================= overview ======================= */
function renderKPIs() {
  const d = dayOf(), h = hourOf(), frac = state.sec / 3600;
  let y = 0, r = 0;
  for (const u of DATA.units) for (const g of activeGroups()) { const l = lvl(u.name, g); if (l === "Y") y++; if (l === "R") r++; }
  $("kAlerts").textContent = y + r;
  $("kAlertsSub").innerHTML = `<span style="color:var(--red-ink)">${r} ${t("redN")}</span> · <span style="color:var(--yellow-ink)">${y} ${t("yellowN")}</span>`;
  let scans = 0; for (const m of MEDS) scans += natSoFar(m, d, h, frac);
  $("kScans").textContent = fmt(scans);
  const prevH = h > 0 ? h - 1 : 0; let rate = 0; for (const m of MEDS) rate += NAT[m + "|" + d][h];
  $("kScansSub").textContent = `~${fmt(rate / 60)} ${t("scansMin")}`;
  const cv = NATC[d]; let v = 0; for (let i = 0; i < h; i++) v += cv[i]; v += cv[h] * frac;
  $("kVisits").textContent = fmt(v);
  const sup = supplyNow().length; $("kSupply").textContent = sup;
  $("supplyBadge").textContent = sup; $("supplyBadge").classList.toggle("on", sup > 0);
  const totPh = Object.values(CTX.pharmacies).reduce((a, b) => a + b, 0), sil = LIVE_MODE ? (DATA.silent || []).length : 0;
  $("kPharm").textContent = sil ? `${fmt(totPh - sil)} / ${fmt(totPh)}` : fmt(totPh);
  const sub = $("kPharm").nextElementSibling;
  if (sub) { sub.textContent = sil ? (sil === 1 ? t("silent1") : `${sil} ${t("silentN")}`) : t("kPharmSub"); sub.classList.toggle("warn", !!sil); }
}
function statusText(r) {
  const a = who(r.admin || r.to), i = who(r.by);
  if (r.status === "waiting") return fill2(t("stWaiting"), { a });
  if (r.status === "approved") return fill2(t("stApproved"), { a });
  if (r.status === "closed") return fill2(t("stClosed"), { a });
  return r.by === ME()?.u ? t("stNotedMe") : fill2(t("stNoted"), { i });
}
function nowAt() { return { day: dayOf(), hour: hourOf() }; }
function reviewBlock(o, key) {
  if (!AUTH || !ME()) return "";
  const r = AUTH.reportFor(WORLD, o.a, o.g), gov = UNIT[o.a].gov;
  if (isInsp()) {
    if (r) return `<div class="rv-status ${r.status}">${esc(statusText(r))}</div>`;
    if (state.reviewOpen === key) {
      const def = AUTH.defaultAdminFor(gov);
      return `<div class="rv-form" data-k="${esc(key)}">
        <label for="rv-note">${t("noteLabel")}</label><textarea id="rv-note" rows="2" maxlength="400" placeholder="${esc(t("notePh"))}"></textarea>
        <label for="rv-to">${t("sendTo")}</label><select id="rv-to">${AUTH.admins().map(a => `<option value="${esc(a.u)}"${a.u === def?.u ? " selected" : ""}>${esc(AUTH.nameOf(a))}</option>`).join("")}</select>
        <span class="rv-btns"><button type="button" class="btn sm primary" data-send="${esc(key)}" data-lv="${o.l}">${t("send")}</button><button type="button" class="btn sm" data-cancel="1">${t("cancel")}</button></span></div>`;
    }
    return `<span class="review"><button type="button" data-open="${esc(key)}">${t("confirmDots")}</button><button type="button" data-false="${esc(key)}" data-lv="${o.l}">${t("falseAlarm")}</button></span>`;
  }
  if (!r) { const ins = inspectorFor(gov); return `<div class="rv-status none">${ins.length ? esc(fill2(t("waitInsp"), { i: ins.map(a => AUTH.nameOf(a)).join(", ") })) : t("noInsp")}</div>`; }
  const head = r.decision === "confirm" ? `<b>${esc(fill2(t("byInsp"), { i: who(r.by) }))}</b>${r.note ? `: “<bdi>${esc(r.note)}</bdi>”` : ""}` : esc(statusText(r));
  const act = r.status === "waiting" && canAct(r.area) ? `<span class="rv-btns"><button type="button" class="btn sm primary" data-dec="approved" data-id="${r.id}">${t("approve")}</button><button type="button" class="btn sm" data-dec="closed" data-id="${r.id}">${t("closeIt")}</button></span>` : "";
  return `<div class="rv-status ${r.status}">${head}${r.decision === "confirm" && r.status !== "waiting" ? `<br>${esc(statusText(r))}` : ""}${act}</div>`;
}
function wireReview(root) {
  root.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { state.reviewOpen = b.dataset.open; renderAll(); setTimeout(() => $("rv-note")?.focus(), 0); });
  root.querySelectorAll("[data-cancel]").forEach(b => b.onclick = () => { state.reviewOpen = null; renderAll(); });
  const send = (key, lv, decision, note, to) => { const [area, group] = key.split("|");
    AUTH.submit({ world: WORLD, area, gov: UNIT[area].gov, group, level: lv, decision, note, to: to || AUTH.defaultAdminFor(UNIT[area].gov)?.u, at: nowAt() });
    state.reviewOpen = null;
    if (!LIVE_MODE) LOG.unshift(`<div><span class="d">${pad(hourOf())}:${pad(Math.floor(state.sec / 60))}:00.000</span> <span class="w">SMS</span> ${decision === "confirm" ? "inspector confirmed" : "false alarm"} ${area} → ${esc(who(to || AUTH.defaultAdminFor(UNIT[area].gov)?.u))} <span class="ok">sent</span></div>`); };
  root.querySelectorAll("[data-send]").forEach(b => b.onclick = () => send(b.dataset.send, b.dataset.lv, "confirm", $("rv-note")?.value || "", $("rv-to")?.value));
  root.querySelectorAll("[data-false]").forEach(b => b.onclick = () => send(b.dataset.false, b.dataset.lv, "false", "", null));
  root.querySelectorAll("[data-dec]").forEach(b => b.onclick = () => { AUTH.decide(b.dataset.id, b.dataset.dec, nowAt());
    if (b.dataset.dec === "approved" && !LIVE_MODE) LOG.unshift(`<div><span class="d">${pad(hourOf())}:00:02.000</span> <span class="w">SMS</span> residents' health alert approved by ${esc(who(ME().u))} <span class="ok">broadcast</span></div>`); });
  root.querySelectorAll("[data-map]").forEach(b => b.onclick = () => { state.area = b.dataset.map; state.detailGroup = b.dataset.g; setTab("map"); showOnMap(state.area); renderAll(); });
}
function adminSms(r) {
  const u = UNIT[r.area], placeAr = u.kind === "neighborhood" ? `${u.ar}، عمّان` : `${AR_NAMES[r.area] || r.area}، ${AR_NAMES[u.gov]}`, placeEn = u.kind === "neighborhood" ? `${r.area}, Amman` : `${r.area}, ${u.gov}`;
  const insp = AUTH.find(r.by), inAr = insp?.name_ar || insp?.name || r.by, inEn = insp?.name || r.by, red = r.level === "R";
  if (r.decision !== "confirm") return [`Foreshock: سجّل المفتش ${inAr} تنبيه ${AR_GROUP[r.group]} في ${placeAr} كإنذار كاذب.`, `Foreshock: inspector ${inEn} marked the ${r.group.toLowerCase()} alert in ${placeEn} as a false alarm.`];
  return [`Foreshock: أكّد المفتش ${inAr} التنبيه ${red ? "الأحمر" : "الأصفر"} (${AR_GROUP[r.group]}) في ${placeAr}.${r.note ? ` ملاحظة: «${r.note}».` : ""} افتح Foreshock للموافقة على رسالة السكان.`,
          `Foreshock: inspector ${inEn} confirmed the ${red ? "RED" : "YELLOW"} ${r.group.toLowerCase()} alert in ${placeEn}.${r.note ? ` Note: "${r.note}".` : ""} Open Foreshock to approve the residents' SMS.`];
}
function inspSms(r) {
  const u = UNIT[r.area], placeAr = u.kind === "neighborhood" ? u.ar : (AR_NAMES[r.area] || r.area), a = AUTH.find(r.admin), aAr = a?.name_ar || a?.name || r.admin, aEn = a?.name || r.admin;
  if (r.status === "approved") return [`Foreshock: وافق ${aAr} على رسالة السكان في ${placeAr}. شكراً على التأكيد.`, `Foreshock: ${aEn} approved the residents' SMS for ${r.area}. Thanks for confirming.`];
  if (r.status === "closed") return [`Foreshock: أغلق ${aAr} البلاغ عن ${placeAr} دون رسالة عامة.`, `Foreshock: ${aEn} closed your report on ${r.area} with no public SMS.`];
  return null;
}
const bilingual = (pair) => pair ? `<p class="bubble" dir="rtl" lang="ar">${esc(pair[0])}</p><p class="bubble en" dir="ltr" lang="en">${esc(pair[1])}</p>` : "";
const atText = (x) => x ? `${t("day")} ${x.day} · ${pad(x.hour)}:00` : "—";
let inboxAll = false;
/* ======================= insights: Ask Foreshock, tomorrow's risk, antibiotics ======================= */
const AK = window.__fsAsk || (window.__fsAsk = { q: "", ans: null, busy: false, err: "", exp: {} });
const riskMine = () => (DATA.risk || []).filter(r => mine(r.area));
const pct = (p) => Math.round(p * 100) + "%";
const engNote = (r) => r.engine === "local" ? (state.lang === "ar" ? `كتبه الذكاء الاصطناعي المحلي (${r.model}) من أرقام Foreshock` : `Written by the local AI (${r.model}) from Foreshock's numbers`)
  : (state.lang === "ar" ? "إجابة قواعد Foreshock المدمجة" : "Foreshock's built-in answer") + (r.fallback ? ` (${r.fallback})` : "");
const ansHtml = (r) => `<div class="ask-ans" dir="auto"><bdi>${esc(r.answer).replace(/\n/g, "<br>")}</bdi><small>${esc(engNote(r))}</small></div>`;
async function askNow(body, done) {
  try { done(await AUTH.api("POST", "/api/ask", Object.assign({ lang: state.lang }, body)), null); } catch (e) { done(null, e.message); }
}
function riskTable(rows, n) {
  const ar = state.lang === "ar";
  if (!rows.length) return `<p class="note">${ar ? "لا توجد منطقة بخطر واضح خلال 48 ساعة." : "No area shows a clear risk for the next 48 hours."}</p>`;
  return `<div class="tablewrap"><table class="t risk"><thead><tr><th>${ar ? "المنطقة" : "Area"}</th><th>${t("grp")}</th><th class="n">${ar ? "الاحتمال" : "Chance"}</th><th>${ar ? "لماذا" : "Why"}</th></tr></thead><tbody>
    ${rows.slice(0, n).map(r => `<tr><td><button type="button" class="linkbtn" data-open="${esc(r.area)}" data-g="${esc(r.group)}">${esc(areaName(r.area))}</button></td><td>${esc(gname(r.group))}</td>
      <td class="n"><span class="riskbar ${r.band}"><i style="width:${Math.min(100, r.p / 0.6 * 100)}%"></i></span> <b class="num">${pct(r.p)}</b></td><td class="note">${esc((ar ? r.why_ar : r.why).join(ar ? "، " : ", "))}</td></tr>`).join("")}</tbody></table></div>`;
}
function renderInsights() {
  const el = $("view-insights"); if (!el) return;
  const ar = state.lang === "ar", MI = DATA.model_info || {}, AB = DATA.antibiotics || { rows: [] };
  const ab = AB.rows.filter(r => mine(r.area)), top = Math.max(2, ...ab.map(r => r.index));
  const sugg = ar ? ["أين أرسل المفتشين أولاً؟", "ما المناطق المعرضة للخطر غداً؟", "أين تُشترى المضادات الحيوية دون طبيب؟", "هل توقفت صيدليات عن الإرسال؟"]
    : ["Where should I send inspectors first?", "Which areas are at risk tomorrow?", "Where are antibiotics bought without a doctor?", "Have any pharmacies gone silent?"];
  const keep = $("ask-q") ? $("ask-q").value : AK.q;
  el.innerHTML = `<div class="card ask"><h2><span>✨ ${ar ? "اسأل Foreshock" : "Ask Foreshock"}</span><span class="note">${ar ? "بدون مفاتيح · يعمل على هذا الحاسوب" : "no keys · runs on this computer"}</span></h2>
      <form id="ask-f" class="ask-row"><input id="ask-q" maxlength="300" dir="auto" placeholder="${ar ? "اكتب سؤالك بالعربية أو الإنجليزية…" : "Ask in English or Arabic…"}" value="${esc(keep)}">
      <button class="btn primary" ${AK.busy ? "disabled" : ""}>${AK.busy ? (ar ? "…يفكّر" : "Thinking…") : (ar ? "اسأل" : "Ask")}</button></form>
      <div class="ask-sugg">${sugg.map(q => `<button type="button" class="chip" data-q="${esc(q)}">${esc(q)}</button>`).join("")}</div>
      ${AK.err ? `<p class="note err">${esc(AK.err)}</p>` : ""}${AK.ans ? ansHtml(AK.ans) : ""}
      <p class="note">${ar ? "يجيب من أرقام النظام فقط (التنبيهات، الخطر، المضادات، المخزون، الصيدليات الصامتة) في محافظاتك. بيانات محاكاة." : "Answers only from the system's numbers (alerts, risk, antibiotics, supply, silent tills) in your governorates. Simulated data."}</p></div>
    <div class="grid2">
      <div class="card"><h2><span>🔮 ${ar ? "خريطة خطر الغد" : "Tomorrow's risk"}</span><span class="mono">48 h</span></h2>
        <p class="prose" style="margin:0 0 8px">${ar ? "نموذج تعلّم آلي خاص بـ Foreshock يقدّر فرصة أن تصبح كل منطقة صفراء أو حمراء خلال 48 ساعة، من أدويتها وعياداتها وجيرانها. المناطق التي في حالة تنبيه الآن غير مدرجة." : "Foreshock's own machine-learning model estimates the chance each area turns yellow or red in the next 48 hours, from its medicines, clinics and neighbours. Areas already on alert aren't listed."}</p>
        ${riskTable(riskMine(), 10)}
        ${MI.auc ? `<details class="model"><summary>${ar ? "كيف اختُبر النموذج" : "How the model was tested"}</summary><ul class="list">
          <li>${ar ? `دُرّب على ${MI.trained_on_worlds} عالماً محاكى تنتشر فيها الأوبئة بين المناطق المتجاورة، واختُبر على ${MI.tested_on_worlds} عالماً لم يرها.` : `Trained on ${MI.trained_on_worlds} simulated worlds where outbreaks spread between neighbouring areas, tested on ${MI.tested_on_worlds} it never saw.`}</li>
          <li>${ar ? `دقة الترتيب (AUC): ${MI.auc} مقابل ${MI.auc_simple_rule} لقاعدة بسيطة.` : `Ranking accuracy (AUC): ${MI.auc} vs ${MI.auc_simple_rule} for a simple rule.`}</li>
          <li>${ar ? `أعلى 10 مناطق كل ليلة احتوت ${pct(MI.recall_top10)} من المناطق التي أطلقت تنبيهاً فعلاً (القاعدة البسيطة: ${pct(MI.recall_top10_simple_rule)}).` : `Each night's top 10 held ${pct(MI.recall_top10)} of the areas that really alerted (simple rule: ${pct(MI.recall_top10_simple_rule)}).`}</li>
          ${MI.bands ? `<li>${ar ? `من المناطق «عالية الخطر» أطلق ${pct(MI.bands.high.rate)} تنبيهاً، ومن «منخفضة الخطر» ${(MI.bands.low.rate * 100).toFixed(1)}%.` : `Of areas marked high risk, ${pct(MI.bands.high.rate)} really alerted; of low risk, ${(MI.bands.low.rate * 100).toFixed(1)}%.`}</li>` : ""}
          <li>${ar ? "النموذج 12 رقماً ومعادلة (انحدار لوجستي)، يعمل هنا دون إنترنت." : "The model is 12 numbers and a formula (logistic regression), running here with no internet."}</li></ul></details>` : ""}</div>
      <div class="card"><h2><span>💊 ${ar ? "خريطة سوء استخدام المضادات الحيوية" : "Antibiotic misuse map"}</span><span class="mono">14 ${ar ? "يوماً" : "days"}</span></h2>
        <p class="prose" style="margin:0 0 8px">${ar ? "علب المضادات الحيوية (Zomax وAmoxicillin) لكل زيارة عيادة للحلق والصدر، مقارنة بالمعدل الوطني. المنطقة الأعلى بكثير تشتري غالباً مضادات حيوية دون طبيب، وهذا يسرّع مقاومة المضادات." : "Antibiotic boxes (Zomax and Amoxicillin) per throat/chest clinic visit, compared with the national middle. An area far above it is probably buying antibiotics without a doctor, which speeds up antibiotic resistance."}</p>
        ${ab.length ? `<div class="abx">${ab.slice(0, 12).map(r => `<button type="button" class="abx-row" data-open="${esc(r.area)}" data-g="Throat / chest"><span>${esc(areaName(r.area))}</span>
          <span class="abx-bar"><i class="${r.index >= 1.5 ? "hi" : r.index >= 1.2 ? "mid" : ""}" style="width:${Math.min(100, r.index / top * 100)}%"></i><b style="inset-inline-start:${100 / top}%"></b></span><span class="num">${r.index.toFixed(2)}×</span></button>`).join("")}</div>
          <p class="note">${ar ? `الخط = المعدل الوطني (${AB.median} علبة لكل زيارة). الأيام ${AB.from_day}–${AB.to_day}.` : `Line = national middle (${AB.median} boxes per visit). Days ${AB.from_day}–${AB.to_day}.`}</p>` : `<p class="note">${ar ? "لا توجد بيانات كافية بعد." : "Not enough data yet."}</p>`}</div>
    </div>`;
  const go = (q) => { if (!q.trim() || AK.busy) return; AK.q = q; AK.busy = true; AK.err = ""; renderInsights();
    askNow({ question: q }, (r, e) => { AK.busy = false; AK.ans = r; AK.err = e || ""; if (state.tab === "insights") (window.__fsRenderInsights || renderInsights)(); }); };
  $("ask-f").onsubmit = (e) => { e.preventDefault(); go($("ask-q").value); };
  el.querySelectorAll("[data-q]").forEach(b => b.onclick = () => { $("ask-q").value = b.dataset.q; go(b.dataset.q); });
  el.querySelectorAll("[data-open]").forEach(b => b.onclick = () => { state.area = b.dataset.open; state.detailGroup = b.dataset.g; setTab("map"); showOnMap(state.area); renderAll(); });
}
window.__fsRenderInsights = renderInsights;
function aiSect(a, g) {
  if (!LIVE_MODE || !ME()) return "";
  const ar = state.lang === "ar", key = a + "|" + g, r = (DATA.risk || []).find(x => x.area === a && x.group === g);
  const bump = (DATA.bumps || []).find(x => x.area === a && x.group === g), ex = AK.exp[key];
  return `<div class="sect aisect">
    ${bump ? `<p class="note bumpnote">🎓 ${ar ? `سجّل مفتش إنذاراً كاذباً هنا، فرفع Foreshock حدّ التنبيه لهذه المجموعة بنصف تذبذب حتى اليوم ${bump.to}.` : `An inspector marked a false alarm here, so Foreshock raised the alert bar for this group by half a wobble until day ${bump.to}.`}</p>` : ""}
    ${r ? `<p class="note">🔮 ${ar ? `خطر التحول إلى أصفر أو أحمر خلال 48 ساعة: <b>${pct(r.p)}</b>` : `Chance of yellow or red within 48 hours: <b>${pct(r.p)}</b>`}${r.why.length ? ` · ${esc((ar ? r.why_ar : r.why).join(ar ? "، " : ", "))}` : ""}</p>` : ""}
    <button type="button" class="btn sm" id="ai-explain"${ex && ex.busy ? " disabled" : ""}>✨ ${ex && ex.busy ? (ar ? "…يشرح" : "Explaining…") : (RANK[lvl(a, g)] >= 2 ? (ar ? "اشرح هذا التنبيه" : "Explain this alert") : (ar ? "اشرح هذه الأرقام" : "Explain these numbers"))}</button>
    ${ex && ex.ans ? ansHtml(ex.ans) : ex && ex.err ? `<p class="note err">${esc(ex.err)}</p>` : ""}</div>`;
}
function wireAi(a, g) {
  const b = $("ai-explain"); if (!b) return;
  const key = a + "|" + g;
  b.onclick = () => { AK.exp[key] = { busy: true }; renderDetail();
    askNow({ area: a, group: g, question: "" }, (r, e) => { AK.exp[key] = { ans: r, err: e }; if (state.tab === "map" && state.area === a) renderDetail(); }); };
}
/* ======================= weekly briefing ======================= */
const BR = window.__fsBrief || (window.__fsBrief = { doc: null, busy: false, err: "" });
function renderBrief() {
  const el = $("view-brief"); if (!el) return;
  if (el.dataset.busy === "1" && BR.busy) return;
  const ar = state.lang === "ar", b = BR.doc;
  const L = ar ? { title: "الموجز الأسبوعي للوزارة", lead: "ملخص بنقرة واحدة لما حدث هذا الأسبوع في المحافظات التي تغطيها: التنبيهات، التعديلات، الزيارات الميدانية، المخزون، والصيدليات الصامتة، مع ما يجب مراقبته والإجراءات المقترحة.",
      write: "اكتب موجز هذا الأسبوع", again: "اكتبه من جديد", busy: "جارٍ الكتابة…", print: "طباعة / حفظ PDF", copy: "نسخ النص", copied: "نُسخ.", sit: "الوضع هذا الأسبوع", watch: "للمراقبة الأسبوع القادم", act: "الإجراءات المقترحة",
      by: "أُعدّ لـ", period: "الفترة", scope: "النطاق", aiC: "كتبه الذكاء الاصطناعي ({m}) من بيانات Foreshock. راجعه قبل إرساله.", aiO: "كتبته قواعد Foreshock المدمجة (الذكاء الاصطناعي المحلي لا يعمل).", sim: "بيانات محاكاة · نموذج طلابي" }
    : { title: "Weekly briefing for the ministry", lead: "One click sums up the week in your governorates: alerts, overrides, field visits, supply and silent pharmacies, plus what to watch and what to do next.",
      write: "Write this week's briefing", again: "Write it again", busy: "Writing…", print: "Print / save as PDF", copy: "Copy text", copied: "Copied.", sit: "This week", watch: "Watch next week", act: "Recommended actions",
      by: "Prepared for", period: "Period", scope: "Scope", aiC: "Written by AI ({m}) from Foreshock's data. Check it before sending.", aiO: "Written by Foreshock's built-in rules (local AI not running).", sim: "Simulated data · student prototype" };
  const list = (xs) => `<ul>${xs.map(x => `<li><bdi>${esc(x)}</bdi></li>`).join("")}</ul>`;
  el.innerHTML = `<div class="card brief-ctl"><h2><span>${L.title}</span></h2><p class="prose" style="margin:0 0 10px">${L.lead}</p>
      <div class="actions"><button type="button" class="btn primary" id="br-write"${BR.busy ? " disabled" : ""}>✨ ${BR.busy ? L.busy : b ? L.again : L.write}</button>
      ${b ? `<button type="button" class="btn" id="br-print">🖨 ${L.print}</button><button type="button" class="btn" id="br-copy">${L.copy}</button>` : ""}</div>
      <p class="note err" role="status" id="br-msg">${esc(BR.err)}</p></div>
    ${b ? `<article class="card brief-doc" id="brief-doc" dir="${b.lang === "ar" ? "rtl" : "ltr"}">
      <header><div class="brief-brand">Foreshock · ${esc(L.sim)}</div><h1>${esc(L.title)}</h1>
        <p class="brief-meta">${L.period}: <b>${esc(b.from)} – ${esc(b.to)}</b> · ${L.scope}: <b>${esc(b.lang === "ar" && b.scope === "All of Jordan" ? "كل الأردن" : b.scope)}</b> · ${L.by}: <b>${esc(b.by)}</b></p>
        <div class="brief-kpis"><span class="pill R">${b.counts.red} ${lname("R")}</span><span class="pill Y">${b.counts.yellow} ${lname("Y")}</span>${b.counts.silent ? `<span class="pill D">${b.counts.silent === 1 ? t("silent1") : b.counts.silent + " " + t("silentN")}</span>` : ""}</div></header>
      <p class="brief-head">${esc(b.headline)}</p>
      <h3>${L.sit}</h3>${list(b.situation)}<h3>${L.watch}</h3>${list(b.watch)}<h3>${L.act}</h3>${list(b.actions)}
      <p class="note">${b.engine !== "offline" ? esc(L.aiC.replace("{m}", aiName(b))) : L.aiO}${b.fallback ? ` (${esc(b.fallback)})` : ""}</p></article>` : ""}`;
  $("br-write").onclick = async () => {
    BR.busy = true; BR.err = ""; renderBrief();
    try { const r = await AUTH.api("POST", "/api/briefing", { lang: state.lang }); BR.doc = Object.assign(r, { lang: state.lang }); }
    catch (e) { BR.err = e.message; }
    BR.busy = false; if (state.tab === "brief") (window.__fsRenderBrief || renderBrief)();
  };
  if ($("br-print")) $("br-print").onclick = () => window.print();
  if ($("br-copy")) $("br-copy").onclick = async () => {
    const txt = `${L.title}\n${b.from} – ${b.to} · ${b.scope}\n\n${b.headline}\n\n${L.sit}:\n${b.situation.map(x => "• " + x).join("\n")}\n\n${L.watch}:\n${b.watch.map(x => "• " + x).join("\n")}\n\n${L.act}:\n${b.actions.map(x => "• " + x).join("\n")}`;
    try { await navigator.clipboard.writeText(txt); $("br-msg").textContent = L.copied; } catch (e) { $("br-msg").textContent = e.message; } };
}
window.__fsRenderBrief = renderBrief;
function ovLog() {
  const list = OVS.filter(o => mine(o.area)).slice().reverse();
  return `<div class="card" style="margin-top:16px"><h2><span>${t("ovLogTitle")}</span><span class="mono">${list.length}</span></h2>${list.length ? `<div class="tablewrap"><table class="t ovlog"><thead><tr>${t("ovCols").map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
    ${list.map(o => `<tr><td class="mono" style="white-space:nowrap">${atText(tAt(o.t0))}</td><td>${esc(placeLabel(o.area))} · ${esc(gname(o.group))}</td>
      <td style="white-space:nowrap"><span class="pill ${o.prev}">${lname(o.prev)}</span> → <span class="pill ${o.level}">${o.level === "N" ? t("ovStood") : lname(o.level)}</span></td><td>${esc(who(o.by))}</td>
      <td><bdi>${esc(o.reason)}</bdi>${o.ai ? `<br><small class="note">${esc(aiShort(o.ai))}${o.ai.draft && o.ai.draft !== o.reason ? ` · ${t("aiEdited")}` : ""}</small>` : ""}</td>
      <td>${o.t1 == null ? `<span class="sms-st ok">${t("ovActive")}</span>` : `<small>${esc(fill2(t("ovEndedBy"), { w: who(o.ended_by) }))}<br><span class="mono">${atText(tAt(o.t1))}</span></small>`}</td></tr>`).join("")}</tbody></table></div>` : `<p class="empty">${t("ovLogEmpty")}</p>`}</div>`;
}
function pwCard() {
  return `<div class="card" style="margin-top:16px"><h2><span>${t("pwTitle")}</span><span class="mono">${esc(ME().u)}</span></h2>
    <div class="form"><label class="row"><span>${t("pwOld")}</span><input type="password" id="pw-old" autocomplete="current-password"></label>
    <label class="row"><span>${t("pwNew")}</span><input type="password" id="pw-new" autocomplete="new-password" minlength="8"></label></div>
    <div class="actions"><button type="button" class="btn sm" id="pw-save">${t("pwSave")}</button></div><p class="note" id="pw-msg" role="status"></p></div>`;
}
function renderInbox() {
  const el = $("view-inbox"); if (!el || !AUTH || !ME()) return;
  const adm = isAdm(), list = AUTH.inbox(WORLD, adm && inboxAll);
  if (!adm) AUTH.markSeen(WORLD);
  el.innerHTML = `<div class="card"><h2><span>${adm ? t("inboxTitle") : t("mineTitle")}</span>
      ${adm ? `<span class="seg" role="group"><button type="button" data-all="0" aria-pressed="${!inboxAll}">${t("toMe")}</button><button type="button" data-all="1" aria-pressed="${inboxAll}">${t("allAdmins")}</button></span>` : `<span class="mono">${list.length}</span>`}</h2>
    ${list.length ? `<div class="inbox">${list.map(r => { const sms = adm ? adminSms(r) : inspSms(r);
      return `<article class="rep ${r.status}">
        <div class="rep-top"><span class="pill ${r.level}">${lname(r.level)}</span><b>${esc(placeLabel(r.area))} · ${esc(gname(r.group))}</b><span class="rep-st">${esc(statusText(r))}</span></div>
        <dl class="rep-meta"><div><dt>${adm ? t("inspRole") : t("sentTo")}</dt><dd>${esc(adm ? who(r.by) : who(r.to))}</dd></div><div><dt>${t("reported")}</dt><dd class="mono">${atText(r.at)}</dd></div>
          ${r.adminAt ? `<div><dt>${t("decided")}</dt><dd><span class="mono">${atText(r.adminAt)}</span> · ${esc(who(r.admin))}</dd></div>` : ""}
          ${r.note ? `<div class="wide"><dt>${t("noteW")}</dt><dd><bdi>${esc(r.note)}</bdi></dd></div>` : ""}</dl>
        ${LIVE_MODE ? (() => { const fv = AUTH.fieldVisits(r.area, r.group)[0]; return fv ? `<div class="fv"><div class="fv-top"><b>📋 ${t("fvTitle")} · ${esc(who(fv.by))}</b><span class="mono">${atText(fv.at)}</span></div>
          ${fvChips(fv.checks).length ? `<div class="fv-chips">${fvChips(fv.checks).map(c => `<span class="chip">${esc(c)}</span>`).join("")}</div>` : ""}${fv.note ? `<p><bdi>${esc(fv.note)}</bdi></p>` : ""}
          ${fv.photos.length ? `<div class="fv-photos">${fv.photos.map(p => `<a href="/api/photos/${esc(p)}" target="_blank" rel="noopener"><img src="/api/photos/${esc(p)}" alt="${esc(t("fvPhoto"))}" loading="lazy"></a>`).join("")}</div>` : ""}</div>` : ""; })() : ""}
        ${sms ? `<div class="sms"><div class="sms-head"><span>${adm ? t("smsGot") : t("smsInspNote")}</span></div>${bilingual(sms)}</div>` : ""}
        <span class="rv-btns">${adm && r.status === "waiting" && canAct(r.area) ? `<button type="button" class="btn sm primary" data-dec="approved" data-id="${r.id}">${t("approve")}</button><button type="button" class="btn sm" data-dec="closed" data-id="${r.id}">${t("closeIt")}</button>` : ""}
          <button type="button" class="btn sm" data-map="${esc(r.area)}" data-g="${esc(r.group)}">${t("showOnMap")}</button></span>
      </article>`; }).join("")}</div>` : `<p class="empty">${adm ? t("inboxEmpty") : t("mineEmpty")}</p>`}</div>${LIVE_MODE ? ovLog() + pwCard() : ""}`;
  el.querySelectorAll("[data-all]").forEach(b => b.onclick = () => { inboxAll = b.dataset.all === "1"; renderInbox(); });
  if ($("pw-save")) $("pw-save").onclick = async () => {
    try { await AUTH.api("POST", "/api/me/password", { old: $("pw-old").value, new: $("pw-new").value }); $("pw-old").value = $("pw-new").value = ""; $("pw-msg").textContent = t("pwDone"); }
    catch (e) { $("pw-msg").textContent = e.message; } };
  wireReview(el);
}
function renderAlerts() {
  // keep a half-typed inspector note when the list refreshes
  if ($("rv-note")) state.rvDraft = { note: $("rv-note").value, to: $("rv-to")?.value };
  const list = [];
  for (const u of DATA.units) for (const g of activeGroups()) {
    const l = lvl(u.name, g); if ((l === "Y" || l === "R") && mine(u.name)) list.push({ a: u.name, g, l });
    else if (LIVE_MODE && mine(u.name) && RANK[sysLvl(u.name, g)] >= 2 && ovAt(u.name, g)) list.push({ a: u.name, g, l: "N", stood: true });
  }
  list.sort((p, q) => RANK[q.l] - RANK[p.l]);
  const sup = supplyNow().filter(x => mine(x.area));
  const quiet = LIVE_MODE && state.t === TMAX ? (DATA.silent || []).filter(x => mine(x.area)) : [];
  $("alertsCount").textContent = `${list.length + sup.length + quiet.length}`;
  const d = dayOf();
  const alertHtml = list.map(o => {
    const key = `${o.a}|${o.g}`;
    const hi = nowHigh(o.a, o.g).map(mname), cz = det(o.a, o.g, d)?.cz;
    const why = `${hi.length ? hi.join(", ") + " ↑" : ""}${cz != null ? " · " + ((LIVE_MODE ? sysLvl(o.a, o.g) : o.l) === "R" ? (state.lang === "ar" ? "العيادات ↑" : "Clinics ↑") : (state.lang === "ar" ? "العيادات طبيعية" : "Clinics normal")) : ""}`;
    const ov = LIVE_MODE ? ovAt(o.a, o.g) : null, manual = ov && rawLvl(o.a, o.g) === ov.level;
    const tag = manual ? `<span class="ovtag">✋ ${esc(fill2(o.stood ? t("ovStoodBy") : t("ovBy"), { w: who(ov.by) }))}: “<bdi>${esc(ov.reason)}</bdi>” · ${t("ovReads")} ${lname(sysLvl(o.a, o.g))}</span>` : "";
    return `<div class="alert ${o.stood ? "N stood" : o.l}${manual ? " manual" : ""}">
      <button type="button" class="top" data-a="${esc(o.a)}" data-g="${esc(o.g)}"><span>${esc(placeLabel(o.a))} · ${esc(gname(o.g))}</span><span class="pill ${o.l}">${o.stood ? t("ovStood") : lname(o.l)}</span></button>
      <span class="why">${esc(why)}</span>${tag}
      <span class="meta"><span class="mono">${esc(sinceText(o.a, o.g))}</span>
      </span>${o.stood ? "" : reviewBlock(o, key)}
    </div>`; }).join("");
  const supSorted = [...sup].sort((p, q) => RANK[lvl(q.area, MED_GROUP[q.medicine])] - RANK[lvl(p.area, MED_GROUP[p.medicine])] || p.days_left - q.days_left);
  const supHtml = supSorted.slice(0, 3).map(s => `<div class="alert S">
      <button type="button" class="top" data-a="${esc(s.area)}" data-g="${esc(MED_GROUP[s.medicine])}"><span>${esc(placeLabel(s.area))} · ${esc(mname(s.medicine))}</span><span class="pill S">${lname("S")}</span></button>
      <span class="why">${state.lang === "ar" ? `بقي ${s.boxes} علبة (${s.days_left} يوم)، والتوريد بعد ${s.delivery_in} أيام. أرسل ${s.send} علبة.` : `${s.boxes} ${s.boxes === 1 ? "box" : "boxes"} left (${s.days_left} days), delivery in ${s.delivery_in} days. Send ${s.send} boxes.`}</span>
    </div>`).join("") + (sup.length > 3 ? `<button type="button" class="btn" id="moreSup" style="justify-self:start">+${sup.length - 3} ${t("moreSupply")}</button>` : "");
  const quietHtml = quiet.map(x => `<div class="alert D">
      <button type="button" class="top" data-a="${esc(x.area)}" data-g="${esc(state.detailGroup || "Stomach")}"><span>${esc(placeLabel(x.area))} · <span class="mono">${esc(x.code)}</span></span><span class="pill D">${t("silentPill")}</span></button>
      <span class="why">${esc(fill2(t("silentWhy"), { h: x.hours, m: x.missing }))}</span></div>`).join("");
  $("alerts").innerHTML = (alertHtml + quietHtml + supHtml) || `<p class="empty">${t("noAlerts")}</p>`;
  $("alerts").querySelectorAll(".top").forEach(b => b.onclick = () => { state.area = b.dataset.a; state.detailGroup = b.dataset.g; showOnMap(state.area); renderAll(); });
  if ($("moreSup")) $("moreSup").onclick = () => setTab("supply");
  wireReview($("alerts"));
  if ($("rv-note") && state.rvDraft) { $("rv-note").value = state.rvDraft.note || ""; if (state.rvDraft.to && $("rv-to")) $("rv-to").value = state.rvDraft.to; }
  if (!state.reviewOpen) state.rvDraft = null;
}

function lineChart(el, opts) {
  const { vals, exps, band, levels, color, title, right, xmax, xticks, cur } = opts;
  const w = 420, h = 116, m = { t: 8, r: 8, b: 20, l: 36 };
  const iw = w - m.l - m.r, ih = h - m.t - m.b;
  const xs = d3.scaleLinear().domain([opts.xmin ?? 1, xmax]).range([0, iw]);
  const all = [...vals.map(p => p[1]), ...exps.filter(p => p[1] != null).map(p => p[1]), ...(band || []).map(p => p[1])];
  const ys = d3.scaleLinear().domain([0, Math.max(4, d3.max(all) * 1.1)]).nice(3).range([ih, 0]);
  const s = d3.select(el).html("").append("svg").attr("viewBox", `0 0 ${w} ${h}`);
  const g = s.append("g").attr("transform", `translate(${m.l},${m.t})`);
  ys.ticks(3).forEach(v => {
    g.append("line").attr("x1", 0).attr("x2", iw).attr("y1", ys(v)).attr("y2", ys(v)).attr("stroke", "var(--line)");
    g.append("text").attr("x", -6).attr("y", ys(v) + 4).attr("text-anchor", "end").attr("font-size", 10).attr("fill", "var(--muted)").attr("font-family", "var(--f-data)").text(v);
  });
  xticks.forEach(([v, lab]) => g.append("text").attr("x", xs(v)).attr("y", ih + 15).attr("text-anchor", "middle").attr("font-size", 10).attr("fill", "var(--muted)").attr("font-family", "var(--f-data)").text(lab));
  if (band) g.append("path").attr("d", d3.line().x(p => xs(p[0])).y(p => ys(p[1]))(band)).attr("fill", "none").attr("stroke", "var(--red)").attr("stroke-width", 1).attr("stroke-dasharray", "2 3").attr("opacity", .8);
  const ex = exps.filter(p => p[1] != null);
  g.append("path").attr("d", d3.line().x(p => xs(p[0])).y(p => ys(p[1]))(ex)).attr("fill", "none").attr("stroke", "var(--muted)").attr("stroke-width", 1.4).attr("stroke-dasharray", "4 3");
  if (vals.length) {
    g.append("path").attr("d", d3.area().x(p => xs(p[0])).y0(ih).y1(p => ys(p[1])).curve(d3.curveMonotoneX)(vals)).attr("fill", color).attr("opacity", .12);
    g.append("path").attr("d", d3.line().x(p => xs(p[0])).y(p => ys(p[1])).curve(d3.curveMonotoneX)(vals)).attr("fill", "none").attr("stroke", color).attr("stroke-width", 2.2);
    if (levels) vals.forEach(([x, v]) => { const l = levels[x]; if (l === "Y" || l === "R") g.append("circle").attr("cx", xs(x)).attr("cy", ys(v)).attr("r", 3.4).attr("fill", fill(l)).attr("stroke", "var(--surface)").attr("stroke-width", 1.5); });
    const last = vals[vals.length - 1];
    g.append("circle").attr("cx", xs(last[0])).attr("cy", ys(last[1])).attr("r", 4.5).attr("fill", color).attr("stroke", "var(--surface)").attr("stroke-width", 2);
  }
  if (cur != null) g.append("line").attr("x1", xs(cur)).attr("x2", xs(cur)).attr("y1", 0).attr("y2", ih).attr("stroke", "var(--ink)").attr("opacity", .4);
  el.insertAdjacentHTML("afterbegin", `<div class="ttl">${esc(title)}<span class="num">${esc(right)}</span></div>`);
}

function overrideSect(a, g) {
  if (!LIVE_MODE) return "";
  const o = ovAt(a, g), L = rawLvl(a, g), S = sysLvl(a, g), key = a + "|" + g, me = ME();
  let h = `<p class="ov-state">${t("ovReads")} <span class="pill ${S}">${lname(S)}</span>${o ? ` · ${t("ovNow")} <span class="pill ${L}">${lname(L)}</span>` : ""}</p>`;
  if (o) h += `<div class="ov-card"><b>✋ ${esc(fill2(t("ovSetBy"), { w: who(o.by), l: lname(o.level) }))}</b> <span class="mono">${atText(tAt(o.t0))}</span>
      <p>“<bdi>${esc(o.reason)}</bdi>”</p>${o.ai ? `<p class="note">${esc(aiShort(o.ai))}${o.ai.draft && o.ai.draft !== o.reason ? ` · ${t("aiEdited")}` : ""}</p>` : ""}${L !== o.level ? `<p class="note">${t("ovBroke")}</p>` : ""}</div>`;
  const wrap = (x) => `<div class="sect ov"><h4><span>${t("ovTitle")}</span></h4>${x}</div>`;
  if (!me || !canAct(a)) return wrap(h);
  if (state.t !== TMAX) return wrap(h + `<p class="note">${t("ovGoNow")}</p>`);
  const targets = (isAdm() ? ["R", "Y", "N"] : ["R", "Y"]).filter(x => x !== L && (isAdm() || RANK[x] > RANK[L]));
  const canEnd = o && o.t1 == null && (isAdm() || o.by === me.u);
  const label = (x) => x === "R" ? t("ovToR") : x === "N" ? t("ovToN") : RANK[L] > 2 ? t("ovLowerY") : t("ovRaiseY");
  if (OVST.open && OVST.open.key === key) {
    const lv = OVST.open.level, dr = OVST.draft || (OVST.draft = {}), ai = dr.ai;
    const def = AUTH.defaultAdminFor(UNIT[a].gov);
    h += `<div class="ov-form" data-lv="${lv}">
      <div class="ai-row"><button type="button" class="btn sm" id="ov-draft"${dr.busy ? " disabled" : ""}>✨ ${dr.busy ? t("ovDrafting") : ai ? t("ovRedraft") : t("ovDraft")}</button>
        ${ai ? `<div class="ai ${ai.verdict}"><b>${ai.verdict === "caution" ? "⚠ " + t("aiCaution") : "✓ " + t("aiSupports")}</b> ${esc(ai.advice)}<small>${ai.engine !== "offline" ? esc(fill2(t("aiByClaude"), { m: aiName(ai) })) : t("aiOffline")}${ai.fallback ? ` (${esc(ai.fallback)})` : ""}</small></div>` : ""}</div>
      <label for="ov-reason">${t("ovReason")}</label><textarea id="ov-reason" rows="3" maxlength="300" placeholder="${esc(t("ovReasonPh"))}">${esc(dr.reason || "")}</textarea>
      ${isInsp() ? `<label for="ov-to">${t("ovNotify")}</label><select id="ov-to">${AUTH.admins().map(x => `<option value="${esc(x.u)}"${x.u === (dr.notify || def?.u) ? " selected" : ""}>${esc(AUTH.nameOf(x))}</option>`).join("")}</select>` : ""}
      ${isAdm() && lv !== "N" ? `<label class="chk"><input type="checkbox" id="ov-res"${dr.res ? " checked" : ""}><span><b>${t("ovRes")}</b></span></label>` : ""}
      <p class="note err" id="ov-msg" role="status">${esc(dr.error || "")}</p>
      <span class="rv-btns"><button type="button" class="btn sm primary ov-${lv}" id="ov-apply"${dr.busy ? " disabled" : ""}>${esc(fill2(t("ovApply"), { l: lname(lv) }))}</button><button type="button" class="btn sm" id="ov-cancel">${t("cancel")}</button></span></div>`;
  } else {
    h += `<div class="ov-btns">${targets.map(x => `<button type="button" class="btn sm ov-${x}" data-ovl="${x}">${label(x)}</button>`).join("")}${canEnd ? `<button type="button" class="btn sm ghost" data-ovend="${o.id}">${t("ovEnd")}</button>` : ""}</div>`;
  }
  h += `<p class="note">${isInsp() ? t("ovInspNote") + " " : ""}${t("ovRule")}</p>`;
  return wrap(h);
}
/* ---------- field visits ---------- */
const FV = window.__fsFv || (window.__fsFv = { open: null, photos: [], busy: false, msg: "" });
const fvChips = (c) => [
  c.places ? fill2(t("fvPlacesN"), { n: c.places }) : "", c.people_sick ? fill2(t("fvSickN"), { n: c.people_sick }) : "",
  c.water_tested ? (c.water_failed ? "💧 " + t("fvWaterFail") : "💧 " + t("fvWaterOk")) : "", c.samples ? "🧪 " + t("fvSamples") : "",
  c.staff_sick ? "🤒 " + t("fvStaff") : "", c.closed ? "🚫 " + fill2(t("fvClosedN"), { n: c.closed }) : ""].filter(Boolean);
function fieldSect(a, g) {
  if (!LIVE_MODE || !AUTH || !ME()) return "";
  const list = AUTH.fieldVisits(a, g), key = a + "|" + g;
  let h = list.length ? `<div class="fv-list">${list.map(v => `<div class="fv">
      <div class="fv-top"><b>${esc(who(v.by))}</b><span class="mono">${atText(v.at)}</span></div>
      ${fvChips(v.checks).length ? `<div class="fv-chips">${fvChips(v.checks).map(c => `<span class="chip${/💧 .*(fail|فشل)/i.test(c) || c.startsWith("🤒") ? " bad" : ""}">${esc(c)}</span>`).join("")}</div>` : ""}
      ${v.note ? `<p><bdi>${esc(v.note)}</bdi></p>` : ""}
      ${v.photos.length ? `<div class="fv-photos">${v.photos.map(p => `<a href="/api/photos/${esc(p)}" target="_blank" rel="noopener"><img src="/api/photos/${esc(p)}" alt="${esc(t("fvPhoto"))}" loading="lazy"></a>`).join("")}</div>` : ""}
    </div>`).join("")}</div>` : `<p class="note">${t("fvNone")}</p>`;
  if (canAct(a) && state.t === TMAX) {
    if (FV.open === key) h += `<div class="ov-form fv-form">
        <div class="fv-grid">
          <label>${t("fvPlaces")}<input type="number" id="fv-places" min="0" max="999" inputmode="numeric"></label>
          <label>${t("fvSick")}<input type="number" id="fv-sick" min="0" max="999" inputmode="numeric"></label>
          <label>${t("fvClosed")}<input type="number" id="fv-closed" min="0" max="999" inputmode="numeric"></label>
        </div>
        <label class="chk"><input type="checkbox" id="fv-water"><span><b>${t("fvWaterTested")}</b></span></label>
        <label class="chk"><input type="checkbox" id="fv-wfail"><span><b>${t("fvWaterFailed")}</b></span></label>
        <label class="chk"><input type="checkbox" id="fv-samples"><span><b>${t("fvSamplesQ")}</b></span></label>
        <label class="chk"><input type="checkbox" id="fv-staff"><span><b>${t("fvStaffQ")}</b></span></label>
        <label for="fv-note">${t("fvNote")}</label><textarea id="fv-note" rows="2" maxlength="600"></textarea>
        <label for="fv-photo">${t("fvPhotos")}</label><input type="file" id="fv-photo" accept="image/*" capture="environment" multiple>
        <div class="fv-photos" id="fv-prev">${FV.photos.map(p => `<img src="${p}" alt="">`).join("")}</div>
        <p class="note err" id="fv-msg" role="status">${esc(FV.msg)}</p>
        <span class="rv-btns"><button type="button" class="btn sm primary" id="fv-save"${FV.busy ? " disabled" : ""}>${FV.busy ? t("fvSaving") : t("fvSave")}</button><button type="button" class="btn sm" id="fv-cancel">${t("cancel")}</button></span></div>`;
    else h += `<p style="margin:8px 0 0"><button type="button" class="btn sm" id="fv-open">📋 ${t("fvLog")}</button></p>`;
  }
  return `<div class="sect"><h4><span>${t("fvTitle")}</span><span class="mono">${list.length}</span></h4>${h}</div>`;
}
function shrinkPhoto(file) {        // phone photos are big: make each one ~1280 px JPEG before sending
  return new Promise((res, rej) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement("canvas");
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); res(c.toDataURL("image/jpeg", 0.8)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error(t("fvBadPhoto"))); };
    img.src = url;
  });
}
function wireField(a, g) {
  const key = a + "|" + g, val = (id) => $(id) ? $(id).value : "";
  if ($("fv-open")) $("fv-open").onclick = () => { FV.open = key; FV.photos = []; FV.msg = ""; FV.vals = null; renderDetail(); $("fv-places")?.focus(); };
  if ($("fv-cancel")) $("fv-cancel").onclick = () => { FV.open = null; FV.photos = []; renderDetail(); };
  if ($("fv-photo")) $("fv-photo").onchange = async (e) => {
    const files = [...e.target.files].slice(0, 3 - FV.photos.length);
    for (const f of files) { try { FV.photos.push(await shrinkPhoto(f)); } catch (err) { $("fv-msg").textContent = err.message; } }
    $("fv-prev").innerHTML = FV.photos.map(p => `<img src="${p}" alt="">`).join("");
  };
  if ($("fv-save")) $("fv-save").onclick = async () => {
    const num = (id) => val(id) === "" ? undefined : +val(id), chk = (id) => $(id)?.checked || undefined;
    const body = { area: a, group: g, note: val("fv-note"), photos: FV.photos,
      checks: { places: num("fv-places"), people_sick: num("fv-sick"), closed: num("fv-closed"), water_tested: chk("fv-water") || chk("fv-wfail"), water_failed: chk("fv-wfail"), samples: chk("fv-samples"), staff_sick: chk("fv-staff") } };
    $("fv-save").disabled = true; $("fv-save").textContent = t("fvSaving");
    try { await AUTH.api("POST", "/api/field-visits", body); FV.open = null; FV.photos = []; FV.vals = null; await AUTH.refresh(); window.__fsToast && window.__fsToast(t("fvDone")); renderAll(); }
    catch (err) { $("fv-msg").textContent = err.message; $("fv-save").disabled = false; $("fv-save").textContent = t("fvSave"); }
  };
}
function keepOvDraft() {
  if (!$("ov-reason") || !OVST.draft) return null;
  const dr = OVST.draft; dr.reason = $("ov-reason").value; if ($("ov-to")) dr.notify = $("ov-to").value; if ($("ov-res")) dr.res = $("ov-res").checked;
  const f = document.activeElement === $("ov-reason") ? [$("ov-reason").selectionStart, $("ov-reason").selectionEnd] : null;
  return f;
}
function wireOverride(a, g) {
  const root = $("detail"), key = a + "|" + g, rerender = () => window.__fsOvRerender();
  const draft = async () => {
    keepOvDraft(); const dr = OVST.draft; dr.busy = true; dr.error = ""; rerender();
    try {
      const r = await AUTH.api("POST", "/api/overrides/draft", { area: a, group: g, level: OVST.open.level, lang: state.lang });
      if (!dr.reason || dr.reason === dr.ai?.reason) { dr.reason = r.reason; if ($("ov-reason")) $("ov-reason").value = r.reason; }
      dr.ai = r;
    } catch (e) { dr.error = e.message; }
    dr.busy = false; if (OVST.open?.key === key && OVST.draft === dr) rerender();
  };
  root.querySelectorAll("[data-ovl]").forEach(b => b.onclick = () => { OVST.open = { key, level: b.dataset.ovl }; OVST.draft = {}; renderDetail(); draft(); });
  root.querySelectorAll("[data-ovend]").forEach(b => b.onclick = async () => {
    b.disabled = true;
    try { await AUTH.api("POST", `/api/overrides/${b.dataset.ovend}/end`, {}); window.__fsToast && window.__fsToast(t("ovEnded")); window.__fsServer?.reload(); }
    catch (e) { window.__fsToast && window.__fsToast(e.message); b.disabled = false; } });
  if ($("ov-draft")) $("ov-draft").onclick = draft;
  if ($("ov-cancel")) $("ov-cancel").onclick = () => { OVST.open = null; OVST.draft = null; renderDetail(); };
  if ($("ov-apply")) $("ov-apply").onclick = async () => {
    keepOvDraft(); const dr = OVST.draft, ai = dr.ai;
    dr.busy = true; dr.error = ""; rerender();
    try {
      await AUTH.api("POST", "/api/overrides", { area: a, group: g, level: OVST.open.level, reason: dr.reason || "", notify: dr.notify || AUTH.defaultAdminFor(UNIT[a].gov)?.u, residents: !!dr.res,
        ai: ai ? { engine: ai.engine, verdict: ai.verdict, advice: ai.advice, draft: ai.reason, model: ai.model || "" } : null });
      OVST.open = null; OVST.draft = null; window.__fsToast && window.__fsToast(t("ovDone")); window.__fsServer?.reload();
    } catch (e) { dr.busy = false; dr.error = e.message; if (OVST.draft === dr) rerender(); }
  };
}
window.__fsOvRerender = () => { const f = keepOvDraft(); renderDetail(); if (f && $("ov-reason")) { $("ov-reason").focus(); $("ov-reason").setSelectionRange(f[0], f[1]); } };
const FV_IDS = ["fv-places", "fv-sick", "fv-closed", "fv-water", "fv-wfail", "fv-samples", "fv-staff", "fv-note"];
function keepFv() { if (!$("fv-note")) return; FV.vals = {}; FV_IDS.forEach(id => { const el = $(id); FV.vals[id] = el.type === "checkbox" ? el.checked : el.value; }); }
function restoreFv() { if (!$("fv-note") || !FV.vals) return; FV_IDS.forEach(id => { const el = $(id); if (el.type === "checkbox") el.checked = !!FV.vals[id]; else el.value = FV.vals[id] ?? ""; }); }
function renderDetail() {
  const ovFocus = keepOvDraft(); keepFv();
  const a = state.area, u = UNIT[a], d = dayOf(), h = hourOf(), di = dIdx(d), ar = state.lang === "ar";
  const dg = state.detailGroup || (state.group !== "All" ? state.group : worstGroup(a));
  const L = lvl(a, dg), info = det(a, dg, d), hide = hidden(a);
  const F = cumP(d, h), Fc = cumC(h);
  const sub = u.kind === "neighborhood" ? `${t("hood")} · ${ar ? a : u.ar}` : `${t("districtIn")} ${nm(u.gov)} · ${CTX.pharmacies[a]} ${t("pharmacies")}`;
  const rows = info ? Object.entries(info.m).map(([m, v]) => {
    const sf = soFar(a, m, d, h), exp = v[1] * F, wob = Math.max(v[3] * Math.sqrt(F), Math.sqrt(Math.max(exp, 1)), 1), z = (sf - exp) / wob;
    return { m, sf, exp, z, adj: v[4] };
  }).sort((p, q) => q.z - p.z) : [];
  const fz = (z) => (z > 0 ? "+" : "") + z.toFixed(1);
  const table = hide ? `<p class="note">${t("privacy")}</p>` : `<div class="tablewrap"><table class="t">
      <thead><tr><th>${t("medicine")}</th><th class="n">${t("soFar")}</th><th class="n">${t("expSoFar")}</th><th class="n">${t("wob")}</th><th class="n">${t("adj")}</th></tr></thead>
      <tbody>${rows.map(r => `<tr class="${r.z >= 3 ? "hi" : ""}"><td>${esc(mname(r.m))}</td><td class="n num">${fmt(r.sf)}</td><td class="n num">${r.exp.toFixed(1)}</td><td class="n num" style="${r.z >= 3 ? "color:var(--red-ink)" : ""}">${fz(r.z)}</td><td class="n num">${r.adj && r.adj !== 1 ? "×" + r.adj.toFixed(2) : "—"}</td></tr>`).join("")}</tbody></table></div>`;
  // shelves
  const meds = Object.keys(DATA.gtin).filter(m => MED_GROUP[m] === dg);
  const shelves = meds.map(m => {
    const s = LIVE.supply[`${a}|${m}`]?.[d - 1]; if (!s) return "";
    const [boxes, full, left] = s, pct = Math.min(100, boxes / Math.max(full, 1) * 100);
    return `<tr><td>${esc(mname(m))}</td><td style="width:40%"><div class="sbar"><i class="${left < 1.5 ? "low" : ""}" style="width:${pct}%"></i></div></td><td class="n num">${hide ? "—" : boxes}</td><td class="n num">${boxes === 0 ? t("out") : left.toFixed(1)}</td></tr>`;
  }).join("");
  // neighbors
  const nbs = LIVE.neighbors[a] || [];
  const alerting = nbs.filter(n => RANK[rawLvl(n, dg)] >= 2), watching = nbs.filter(n => rawLvl(n, dg) === "W");
  const nbHtml = `<div class="nbrs">${nbs.map(n => { const l = rawLvl(n, dg); return `<button type="button" class="nb" data-n="${esc(n)}"><span class="pill ${l}">${lname(l)}</span>${esc(areaName(n))}</button>`; }).join("")}</div>
    <p class="note">${alerting.length ? `${alerting.length} ${t("someSpread")}` : watching.length ? `${watching.length} ${t("watchSpread")}` : t("noSpread")}</p>`;
  let msg = "";
  if (L === "Y" || L === "R") {
    const S = smsTexts(a, dg), rep = AUTH ? AUTH.reportFor(WORLD, a, dg) : null;
    const nInsp = Math.max(1, inspectorFor(UNIT[a].gov).length);
    const bubble = (whoTo, count, status, cls, pair, extra) => `<div class="sms"><div class="sms-head"><span>${whoTo} · <span class="mono">${t("smsTo")} ${count}</span></span><span class="sms-st ${cls}">${status}</span></div>
      ${pair ? bilingual(pair) : `<p class="trans">${t("smsPublicHold")}</p>`}${extra || ""}</div>`;
    const pubStatus = rep && rep.status === "approved" ? [esc(fill2(t("smsSentBy"), { a: who(rep.admin) })), "ok"] : [t("smsHeldS"), "held"];
    msg = `<div class="sect"><h4><span>${t("smsTitle")}</span><span class="mono">${pad(hourOf())}:00</span></h4><div class="smsgrid">
        ${bubble(t("smsInsp"), `${nInsp} ${nInsp === 1 ? t("smsPerson") : t("smsPeople")}`, t("smsAuto"), "ok", S.insp)}
        ${bubble(t("smsPharm"), `${CTX.pharmacies[a]} ${t("smsPh")}`, t("smsAuto"), "ok", S.pharm)}
        ${bubble(t("smsAdmin"), esc(rep ? who(rep.to) : (AUTH?.defaultAdminFor(UNIT[a].gov) ? who(AUTH.defaultAdminFor(UNIT[a].gov).u) : "—")), rep ? t("smsAuto") : t("smsAdminWait"), rep ? "ok" : "held", rep ? adminSms(rep) : null, rep ? "" : "")}
        ${bubble(t("smsPublic"), `~${fmt(UNIT[a].size * 250000 * 0.9)} ${t("smsRes")}`, pubStatus[0], pubStatus[1], S.pub)}
      </div></div>
      <div class="sect"><h4>${t("msgTitle")}</h4><pre class="msg">${esc(arabicMessage(a, dg))}</pre></div>`;
  }

  $("detail").innerHTML = `
    <h2><span>${t("selected")}</span><span class="mono">${esc(a)}</span></h2>
    <h3>${esc(areaName(a))}</h3><div class="sub">${esc(sub)}</div>
    <div class="verdict"><span class="pill ${L}" style="margin-inline-end:8px">${lname(L)}</span>${esc((() => { const o = LIVE_MODE ? ovAt(a, dg) : null;
      return o && rawLvl(a, dg) === o.level ? fill2(t("ovVerdict"), { w: who(o.by), s: lname(sysLvl(a, dg)) }) : explain(a, dg); })())}</div>
    ${(() => { const tp = CTX.temps[a]?.[d - 1], ev = CTX.calendar[d] || CTX.calendar[String(d)];
      return `<p class="ctxline">🌡 ${tp != null ? tp.toFixed(1) + " °C" : "—"}${LIVE_MODE ? ` <small>${DATA.weather === "open-meteo" ? (ar ? "طقس حقيقي · Open-Meteo" : "real weather · Open-Meteo") : (ar ? "طقس محاكى" : "simulated weather")}</small>` : ""}${tp > 36 ? ` · ${ar ? "حر: يُتوقع المزيد من أملاح الإماهة" : "hot: more ORS expected"}` : ""}${ev ? ` · 📅 ${esc(ar ? ev.name_ar : ev.name)} (×${ev.factor})` : ""}</p>`; })()}
    ${aiSect(a, dg)}
    ${overrideSect(a, dg)}
    <div class="groups" role="group" aria-label="${t("grp")}">
      ${GROUPS.map(g => { const l = lvl(a, g); const tot = meds.length && !hide ? "" : "";
        let sf = 0, ex = 0; const inf = det(a, g, d);
        if (inf) for (const [m, v] of Object.entries(inf.m)) { sf += soFar(a, m, d, h); ex += v[1] * F; }
        return `<button type="button" class="grow" data-g="${esc(g)}" aria-pressed="${g === dg}"><span class="g">${esc(gname(g))}</span><span class="v num">${hide ? "—" : `${fmt(sf)} / ${fmt(ex)}`}</span><span class="pill ${l}">${lname(l)}</span></button>`; }).join("")}
    </div>
    <div class="chart" id="c0"></div>
    <div class="chart" id="c1"></div>
    <div class="chart" id="c2"></div>
    <div class="sect"><h4><span>${t("medicine")} · ${esc(gname(dg))}</span><span class="mono">${pad(h)}:00</span></h4>${table}</div>
    <div class="sect"><h4><span>${t("shelves")}</span></h4><div class="tablewrap"><table class="t"><tbody>${shelves}</tbody></table></div></div>
    <div class="sect"><h4><span>${t("spread")}</span></h4>${nbHtml}</div>
    ${fieldSect(a, dg)}
    ${msg}
    <p style="margin:12px 0 0"><button type="button" class="btn" id="locate">${t("showOnMap")}</button></p>`;
  $("detail").querySelectorAll(".grow").forEach(b => b.onclick = () => { state.detailGroup = b.dataset.g; renderDetail(); });
  $("detail").querySelectorAll(".nb").forEach(b => b.onclick = () => { state.area = b.dataset.n; state.detailGroup = dg; showOnMap(state.area); renderAll(); });
  $("locate").onclick = () => { showOnMap(a); renderAll(); };
  wireOverride(a, dg); restoreFv(); wireField(a, dg); wireAi(a, dg);
  if (ovFocus && $("ov-reason")) { $("ov-reason").focus(); $("ov-reason").setSelectionRange(ovFocus[0], ovFocus[1]); }

  if (hide) { ["c0", "c1", "c2"].forEach(id => $(id).innerHTML = ""); return; }
  // chart 0: today so far vs expected (hour by hour) with the alert line
  if (info) {
    const exps = [], band = [], vals = [];
    let wob2 = 0; for (const v of Object.values(info.m)) wob2 += v[3] * v[3];
    const totExp = Object.values(info.m).reduce((s, v) => s + v[1], 0);
    for (let i = 0; i < 24; i++) {
      const f = cumP(d, i), e = totExp * f;
      exps.push([i + 1, e]); band.push([i + 1, e + 3.5 * Math.max(Math.sqrt(wob2 * f), Math.sqrt(Math.max(e, 1)))]);
    }
    let c = 0; for (let i = 0; i <= h; i++) { for (const m of Object.keys(info.m)) c += (hourly(a, m, d)?.[i] || 0) * (i === h ? state.sec / 3600 || 1 : 1); vals.push([i + 1, c]); }
    lineChart($("c0"), { vals, exps, band, color: "var(--accent)", title: `${t("todayChart")} · ${fmtDate(d)}`, right: `${fmt(c)} ${t("boxes")} · ${t("expected")} ${fmt(totExp * F)}`,
      xmin: 1, xmax: 24, xticks: [[1, "00"], [7, "06"], [13, "12"], [19, "18"], [24, "24"]], cur: h + 1 });
  } else $("c0").innerHTML = `<p class="note">${t("learning")}</p>`;
  // chart 1 + 2: 30 days
  const s = DATA.series[a + "|" + dg];
  const dl = {}; DATA.days.forEach(dd => { if (dd >= FIRST) dl[dd] = lvl(a, dg, (dd - FIRST) * 24 + 23 <= state.t ? (dd - FIRST) * 24 + 23 : state.t); });
  const shown = DATA.days.filter(dd => dd < d).map(dd => [dd, s.p[dIdx(dd)]]); shown.push([d, rows.reduce((x, r) => x + r.sf, 0)]);
  lineChart($("c1"), { vals: shown, exps: DATA.days.map(dd => [dd, det(a, dg, dd)?.ep ?? null]), levels: dl, color: "var(--accent)",
    title: t("dailyChart"), right: `${t("day")} ${d}`, xmax: 30, xticks: [[1, "1"], [10, "10"], [20, "20"], [30, "30"]] });
  const cshown = DATA.days.filter(dd => dd < d).map(dd => [dd, s.c[dIdx(dd)]]); cshown.push([d, clinicSoFar(a, dg, d, h)]);
  lineChart($("c2"), { vals: cshown, exps: DATA.days.map(dd => [dd, det(a, dg, dd)?.ec ?? null]), levels: dl, color: "var(--clinic)",
    title: t("clinicChart"), right: `${fmt(clinicSoFar(a, dg, d, h))} ${t("visits")} · ${t("expected")} ${fmt((info?.ec || 0) * Fc)}`, xmax: 30, xticks: [[1, "1"], [10, "10"], [20, "20"], [30, "30"]] });
}

/* ======================= live feed ======================= */
const FEED = [], LOG = [];
let hourPool = null, poolKey = "";
function buildPool() {
  const d = dayOf(), h = hourOf(), k = d + "|" + h; if (k === poolKey) return; poolKey = k;
  const items = []; let tot = 0;
  for (const u of DATA.units) for (const m of MEDS) { const c = hourly(u.name, m, d)?.[h] || 0; if (c) { tot += c; items.push([u.name, m, tot]); } }
  hourPool = { items, tot };
}
function pickEvent() {
  const r = Math.random() * hourPool.tot; let lo = 0, hi = hourPool.items.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (hourPool.items[mid][2] < r) lo = mid + 1; else hi = mid; }
  return hourPool.items[lo];
}
const code3 = (n) => n.replace(/^(Al-|Ar-|As-|Az-|Ash-|Um |Wadi |Jabal |Tla' )/, "").replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
function emit(n) {
  buildPool(); if (!hourPool.tot) return;
  const d = dayOf(), h = hourOf();
  for (let i = 0; i < n; i++) {
    const [area, med] = pickEvent();
    const ph = `PH-${code3(area)}-${pad(1 + Math.floor(Math.random() * (CTX.pharmacies[area] || 3)), 3)}`;
    const sec = Math.min(3599, Math.floor(state.sec + Math.random() * 30));
    const time = `${pad(h)}:${pad(Math.floor(sec / 60))}:${pad(sec % 60)}`;
    const hot = RANK[lvl(area, MED_GROUP[med])] >= 2;
    FEED.unshift({ time, ph, area, med, qty: Math.random() < .8 ? 1 : 2, hot, isNew: true });
    if (Math.random() < .35) LOG.unshift(`<div><span class="d">${time}.${pad(Math.floor(Math.random() * 1000), 3)}</span> <span class="m">POST</span> /v1/sales <span class="ok">201</span> · ${20 + Math.floor(Math.random() * 40)} ms · ${ph}</div>`);
  }
  FEED.length = Math.min(FEED.length, 40); LOG.length = Math.min(LOG.length, 22);
}
function logHourRun() {
  if (LIVE_MODE) return;
  const d = dayOf(), h = hourOf();
  let y = 0, r = 0; for (const u of DATA.units) for (const g of GROUPS) { const l = LIVE.levels[u.name + "|" + g][state.t]; if (l === "Y") y++; if (l === "R") r++; }
  for (const [k, fa] of Object.entries(LIVE.first_alert)) for (const L of ["Y", "R"]) {
    if (fa[L] && (fa[L][0] - FIRST) * 24 + fa[L][1] === state.t) {
      const ar = k.split("|")[0];
      LOG.unshift(`<div><span class="d">${pad(h)}:00:01.204</span> <span class="w">SMS</span> ${L === "R" ? "RED" : "YELLOW"} ${ar} → 6 inspectors, ${CTX.pharmacies[ar]} pharmacies <span class="ok">queued</span>${L === "R" ? " · residents: awaiting Ministry approval" : ""}</div>`);
    }
  }
  LOG.unshift(`<div><span class="d">${pad(h)}:00:00.000</span> <span class="w">RUN</span> detector.hourly · 64 areas · 640 series · ${180 + Math.floor(Math.random() * 90)} ms · <span class="${r ? "w" : "ok"}">${r} red, ${y} yellow</span></div>`);
  LOG.unshift(`<div><span class="d">${pad(h)}:00:00.000</span> <span class="m">GET</span> hakeem/v1/visits?since=${pad(h)}:00 <span class="ok">200</span> · ${fmt(NATC[d][h])} visits</div>`);
  LOG.length = Math.min(LOG.length, 22);
}
function ingestFeed(entries) {
  const tm = (iso) => { const x = new Date(iso); return `${pad(x.getHours())}:${pad(x.getMinutes())}:${pad(x.getSeconds())}`; };
  for (const e of entries) {
    if (e.kind === "sale") {
      FEED.unshift({ time: tm(e.at), ph: e.pharmacy, area: e.area, med: e.medicine, qty: e.qty, hot: RANK[rawLvl(e.area, MED_GROUP[e.medicine])] >= 2, isNew: true });
      if (Math.random() < .4) LOG.unshift(`<div><span class="d">${tm(e.at)}</span> <span class="m">POST</span> /v1/sales <span class="ok">201</span> · ${esc(e.pharmacy)} · ${e.items} ${e.items === 1 ? "item" : "items"}</div>`);
    } else if (e.kind === "run") LOG.unshift(`<div><span class="d">${tm(e.at)}</span> <span class="w">RUN</span> ${esc(e.text)}</div>`);
    else if (e.kind === "sms") LOG.unshift(`<div><span class="d">${tm(e.at)}</span> <span class="w">SMS</span> ${esc(e.text)} <span class="ok">sent</span></div>`);
    else LOG.unshift(`<div><span class="d">${tm(e.at)}</span> <span class="m">${esc(e.kind.toUpperCase())}</span> ${esc(e.text)}</div>`);
  }
  FEED.length = Math.min(FEED.length, 40); LOG.length = Math.min(LOG.length, 22);
}
window.__fsFeed = (entries) => { ingestFeed(entries); if (state.tab === "live") renderLive(); };
function renderLive() {
  const ar = state.lang === "ar";
  $("feedSub").textContent = t("feedSub");
  $("feed").innerHTML = `<div class="row hd"><span>${t("time")}</span><span>${t("pharmacy")}</span><span>${t("area")}</span><span>${t("medicine")} · GTIN</span><span>${t("qty")}</span></div>` +
    FEED.map(e => `<div class="row${e.isNew ? " new" : ""}${e.hot ? " hot" : ""}"><span>${e.time}</span><span>${e.ph}</span><span>${esc(areaName(e.area))}</span><span>${esc(mname(e.med))} · ${DATA.gtin[e.med]}</span><span>×${e.qty}</span></div>`).join("");
  FEED.forEach(e => e.isNew = false);
  $("log").innerHTML = LOG.join("");
  const d = dayOf(), h = hourOf(), frac = state.sec / 3600;
  const vals = MEDS.map(m => [m, natSoFar(m, d, h, frac)]); const mx = Math.max(...vals.map(v => v[1]), 1);
  $("todaySub").textContent = `${fmtDate(d)} · ${pad(h)}:${pad(Math.floor(state.sec / 60))}`;
  $("medbars").innerHTML = vals.map(([m, v]) => `<div class="medbar"><span>${esc(mname(m))}</span><span class="track"><i style="width:${(v / mx * 100).toFixed(1)}%"></i></span><span class="num" style="text-align:end">${fmt(v)}</span></div>`).join("");
}

/* ======================= supply ======================= */
function renderSupply() {
  const ar = state.lang === "ar", list = supplyNow();
  $("supSub").textContent = `${t("supSub")} · ${fmtDate(dayOf() - 1)}`;
  const c = t("supCols");
  $("supTable").innerHTML = list.length ? `<table class="t"><thead><tr><th>${c[0]}</th><th>${c[1]}</th><th class="n">${c[2]}</th><th class="n">${c[3]}</th><th class="n">${c[4]}</th><th class="n">${c[5]}</th><th>${c[6]}</th></tr></thead><tbody>` +
    list.sort((p, q) => p.days_left - q.days_left).map(s => { const l = lvl(s.area, MED_GROUP[s.medicine]);
      return `<tr class="click" data-a="${esc(s.area)}" data-g="${esc(MED_GROUP[s.medicine])}"><td>${esc(placeLabel(s.area))}</td><td>${esc(mname(s.medicine))}</td><td class="n num">${hidden(s.area) ? "—" : s.boxes}</td><td class="n num">${s.days_left.toFixed(1)}</td><td class="n num">${s.delivery_in} ${t("delivery")}</td><td class="n num" style="font-weight:600">${s.send}</td><td><span class="pill ${l}">${lname(l)}</span></td></tr>`; }).join("") + `</tbody></table>`
    : `<p class="empty">${t("supNone")}</p>`;
  $("supTable").querySelectorAll("tr.click").forEach(r => r.onclick = () => { state.area = r.dataset.a; state.detailGroup = r.dataset.g; setTab("map"); showOnMap(state.area); renderAll(); });
  $("supHow").innerHTML = ar ? `<h2>كيف تعمل تحذيرات المخزون</h2>
    <p>تُرسل كل صيدلية جرد رفوفها كل ليلة. يقسم النظام عدد العلب المتبقية على متوسط المبيعات في آخر يومين ليعرف كم يوماً سيكفي المخزون.</p>
    <p>إذا كان المخزون سيفرغ خلال أقل من يوم، والتوريد القادم (كل يوم أحد) بعد يومين أو أكثر، يظهر تحذير ويُقترح عدد العلب التي يجب إرسالها فوراً.</p>
    <p>أثناء التفشي، تفرغ الرفوف أسرع بكثير من جدول التوريد. التحذير يعطي الموزّعين وقتاً لإرسال أملاح الإماهة والأدوية قبل أن يجد المرضى الرفوف فارغة.</p>
    ${SC.heatwave ? `<p>تحذيرات الحرّ: في موجة الحر في العقبة والأغوار (الأيام 22–25) ترتفع مبيعات أملاح الإماهة، فتظهر تحذيرات مخزون دون أي تنبيه وبائي، لأن الحر متوقَّع وليس تفشياً.</p>` : ""}`
    : `<h2>How supply warnings work</h2>
    <p>Every night each pharmacy reports what's left on its shelves. The system divides the boxes left by the average sales of the last two days to see how many days the stock will last.</p>
    <p>If shelves will be empty in less than a day and the next delivery (every Sunday) is two or more days away, a warning appears with how many boxes to send now.</p>
    <p>During an outbreak, shelves empty much faster than the delivery schedule. The warning gives distributors time to send ORS and medicine before patients find empty shelves.</p>
    ${SC.heatwave ? `<p>Heat warnings: during the heatwave in Aqaba and the Jordan Valley (days 22–25), ORS sales rise and supply warnings appear without any outbreak alert, because heat is expected, not an outbreak.</p>` : ""}`;
}

/* ======================= connections & method (static, built once per language) ======================= */
function gtinRows() { return MEDS.map(m => `<tr><td class="mono">${DATA.gtin[m]}</td><td>${esc(mname(m))}</td><td>${esc(DATA.ingredient[m])}</td><td>${esc(gname(MED_GROUP[m]))}</td></tr>`).join(""); }
function renderConn() {
  const ar = state.lang === "ar";
  const L = ar ? {
    title: "كيف تصل البيانات", intro: "لا يحتاج النظام إلى أجهزة جديدة. الصيدليات تمسح أصلاً رمز GS1 DataMatrix الإلزامي على كل علبة دواء، والمراكز الصحية الحكومية تستخدم أصلاً نظام حكيم. النظام يربطهما.",
    sales: "1. الصيدليات ← واجهة المبيعات", salesP: "عند كل عملية بيع يرسل نظام الصيدلية رمز المنتج والكمية والوقت والمنطقة فقط. لا اسم مريض ولا وصفة ولا سعر.",
    lookup: "2. رمز الباركود ← الدواء والمجموعة", lookupP: "رمز GTIN في الباركود يحدد الدواء بدقة. يحتوي رمز DataMatrix أيضاً على تاريخ الانتهاء ورقم التشغيلة والرقم التسلسلي، لكن النظام يحتفظ برمز GTIN فقط.",
    clinic: "3. نظام حكيم ← عدد الزيارات", clinicP: "ترسل المراكز الصحية عدد الزيارات كل ساعة حسب رمز التشخيص (ICD-10)، دون أي بيانات شخصية.",
    alerts: "4. التنبيهات ← الوزارة والموزّعون", alertsP: "يمكن لأنظمة الوزارة قراءة التنبيهات، وتصل رسائل عربية إلى فرق التفتيش.",
    priv: "قواعد الخصوصية", note: "هذه الواجهات تصميم للنموذج الأولي، والرموز أمثلة، وكل البيانات في الصفحة محاكاة.",
    codes: "أمثلة على الرموز (ليست رموزاً حقيقية)",
    p: ["معرّف مجهول لكل صيدلية بدل رقم الترخيص.", "أعداد فقط: لا أسماء ولا وصفات ولا أسعار.", "تُخفى الأرقام في أي منطقة فيها أقل من 5 صيدليات.", "اتصال مشفّر (HTTPS) ومفتاح خاص لكل صيدلية.", "تُحذف البيانات التفصيلية بعد 90 يوماً، ويبقى المجموع فقط.", "سجلّ تدقيق لكل من يطّلع على البيانات."],
  } : {
    title: "How the data gets in", intro: "No new hardware. Pharmacies already scan the GS1 DataMatrix barcode that JFDA requires on every medicine box, and public clinics already use Hakeem. The system connects them.",
    sales: "1. Pharmacy till → Sales API", salesP: "On every sale, the pharmacy's system sends the product code, quantity, time and area. Nothing else: no patient name, no prescription, no price.",
    lookup: "2. Barcode → medicine and illness group", lookupP: "The GTIN in the barcode identifies the exact medicine. The DataMatrix also carries expiry, batch and serial number, but the system keeps only the GTIN.",
    clinic: "3. Hakeem → clinic visit counts", clinicP: "Health centers send visit counts every hour, grouped by diagnosis code (ICD-10). No personal data.",
    alerts: "4. Alerts → Ministry and distributors", alertsP: "Ministry systems can read alerts, and inspection teams get Arabic messages.",
    priv: "Privacy rules", note: "These endpoints are a design for the prototype. Codes are examples and every number on this page is simulated.",
    codes: "Example codes (not real products)",
    p: ["An anonymous ID for each pharmacy instead of its license number.", "Counts only: no names, prescriptions or prices.", "Numbers are hidden in any area with fewer than 5 pharmacies.", "Encrypted connection (HTTPS) and a separate key for each pharmacy.", "Detailed data is deleted after 90 days; only totals are kept.", "An audit log of everyone who looks at the data."],
  };
  const box = (x, y, w, h, title, sub, accent) => `<g><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="var(--surface)" stroke="${accent || "var(--line)"}" stroke-width="${accent ? 2 : 1}"/>
    <text x="${x + w / 2}" y="${y + h / 2 - 3}" text-anchor="middle" font-size="13" font-weight="600" fill="var(--ink)" font-family="var(--f-body)">${title}</text>
    <text x="${x + w / 2}" y="${y + h / 2 + 14}" text-anchor="middle" font-size="10.5" fill="var(--muted)" font-family="var(--f-data)">${sub}</text></g>`;
  const arrow = (x1, y1, x2, y2) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="var(--muted)" stroke-width="1.5" marker-end="url(#ah)"/>`;
  const A = ar ? ["صندوق الصيدلية", "مسح الباركود", "سجل JFDA", "رموز GTIN", "واجهة المبيعات", "POST /v1/sales", "فلتر الخصوصية", "أعداد حسب المنطقة", "الكاشف", "كل ساعة", "نظام حكيم", "رموز ICD-10", "لوحة الوزارة", "خريطة + تنبيهات", "رسائل عربية", "فرق التفتيش", "الموزّعون", "تحذيرات المخزون"]
    : ["Pharmacy till", "barcode scan", "JFDA registry", "GTIN codes", "Sales API", "POST /v1/sales", "Privacy filter", "counts per area", "Detector", "every hour", "Hakeem clinics", "ICD-10 codes", "Ministry dashboard", "map + alerts", "Arabic messages", "inspection teams", "Distributors", "supply warnings"];
  const diagram = `<svg viewBox="0 0 900 300" role="img" aria-label="${esc(L.title)}" style="direction:ltr">
    <defs><marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="var(--muted)"/></marker></defs>
    ${box(10, 20, 150, 56, A[0], A[1])}${box(10, 120, 150, 56, A[2], A[3])}${box(200, 20, 150, 56, A[4], A[5], "var(--accent)")}
    ${box(390, 20, 150, 56, A[6], A[7])}${box(580, 110, 140, 76, A[8], A[9], "var(--accent)")}${box(10, 224, 150, 56, A[10], A[11])}
    ${box(390, 224, 150, 56, A[6], A[7])}${box(750, 20, 140, 56, A[12], A[13])}${box(750, 120, 140, 56, A[14], A[15])}${box(750, 224, 140, 56, A[16], A[17])}
    ${arrow(160, 48, 198, 48)}${arrow(85, 120, 240, 78)}${arrow(350, 48, 388, 48)}${arrow(540, 56, 600, 108)}
    ${arrow(160, 252, 388, 252)}${arrow(540, 248, 600, 188)}${arrow(720, 130, 748, 50)}${arrow(720, 148, 748, 148)}${arrow(720, 168, 748, 250)}
  </svg>`;
  const j = (o) => esc(JSON.stringify(o, null, 2)).replace(/&quot;([^&]+)&quot;:/g, '<span class="k">"$1"</span>:').replace(/: &quot;([^&]*)&quot;/g, ': <span class="s">"$1"</span>').replace(/: (\d+)/g, ': <span class="v">$1</span>');
  const tryIt = LIVE_MODE ? `<div class="card" id="tryit"><h2><span>${t("tryTitle")}</span><span class="mono">${esc(location.origin)}</span></h2><p class="prose" style="margin:0 0 10px">${t("tryLead")}</p><div id="tryCode"><p class="note">${t("tryNoKey")}</p></div></div>` : "";
  const silentL = LIVE_MODE ? (DATA.silent || []) : [], totPh = Object.values(CTX.pharmacies).reduce((x, y) => x + y, 0);
  const health = LIVE_MODE ? `<div class="card"><h2><span>${t("netTitle")}</span><span class="mono">${fmt(totPh - silentL.length)} / ${fmt(totPh)}</span></h2>
    <p class="prose" style="margin:0 0 10px">${t("netLead")}</p>
    ${silentL.length ? `<div class="tablewrap"><table class="t"><thead><tr>${t("netCols").map(c => `<th>${c}</th>`).join("")}</tr></thead><tbody>
      ${silentL.map(x => `<tr><td class="mono">${esc(x.code)}</td><td>${esc(placeLabel(x.area))}</td><td class="mono">${atText(tAt(Math.max(0, x.last)))}</td><td class="n num">${x.hours} h</td><td class="n num">${x.chance < 0.1 ? "&lt;0.1" : x.chance}%</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="empty">${t("netAllOk")}</p>`}</div>` : "";
  $("view-conn").innerHTML = `<div class="stack">${health}${LIVE_MODE && isAdm() ? `<div id="aiCard"></div>` : ""}${tryIt}
    <div class="card"><h2><span>${L.title}</span></h2><p class="prose" style="margin:0 0 12px">${L.intro}</p><div class="arch">${diagram}</div></div>
    <div class="grid2">
      <div class="card"><h2><span>${L.sales}</span></h2><p class="prose">${L.salesP}</p>
        <div class="endpoint"><span class="verb">POST</span>/v1/sales</div>
        <pre class="code">${j({ pharmacy: "ph_7f3a91c2", area: ACODE, scanned_at: "2026-09-16T14:32:07+03:00", items: [{ gtin: DATA.gtin.ORS, qty: 2 }, { gtin: DATA.gtin.Flagyl, qty: 1 }] })}</pre>
        <div class="endpoint" style="margin-top:10px"><span class="mono" style="color:var(--ok)">201 Created</span></div>
        <pre class="code">${j({ accepted: 2, batch: "b_20260916_143207_jub", next_upload_after_s: 30 })}</pre></div>
      <div class="card"><h2><span>${L.lookup}</span></h2><p class="prose">${L.lookupP}</p>
        <pre class="code"><span class="c">// GS1 DataMatrix on the box</span>
(01)${DATA.gtin.ORS}(17)280331(10)B2409(21)8XK2Q7
<span class="c">//  ↑ GTIN kept      ↑ expiry, batch, serial: dropped</span></pre>
        <p class="note" style="margin:10px 0 6px">${L.codes}</p>
        <div class="tablewrap"><table class="t"><thead><tr><th>GTIN</th><th>${t("medicine")}</th><th>${ar ? "المادة الفعالة" : "Active ingredient"}</th><th>${t("grp")}</th></tr></thead><tbody>${gtinRows()}</tbody></table></div></div>
    </div>
    <div class="grid2">
      <div class="card"><h2><span>${L.clinic}</span></h2><p class="prose">${L.clinicP}</p>
        <div class="endpoint"><span class="verb get">GET</span>/hakeem/v1/visits?area=${ACODE}&amp;since=2026-09-17T19:00</div>
        <pre class="code">${j({ area: ACODE, hour: "2026-09-17T19:00+03:00", counts: { "A09": 7, "R11": 3, "R50.9": 5, "J06.9": 4, "B86": 0 } })}</pre>
        <div class="tablewrap" style="margin-top:10px"><table class="t"><thead><tr><th>ICD-10</th><th>${ar ? "التشخيص" : "Diagnosis"}</th><th>${t("grp")}</th></tr></thead><tbody>
          ${[["A09", ar ? "التهاب المعدة والأمعاء" : "Gastroenteritis", "Stomach"], ["R11", ar ? "غثيان وتقيؤ" : "Nausea and vomiting", "Stomach"], ["R50.9", ar ? "حمّى" : "Fever", "Fever / flu"], ["J11", ar ? "إنفلونزا" : "Influenza", "Fever / flu"], ["J02", ar ? "التهاب البلعوم" : "Sore throat", "Throat / chest"], ["J20", ar ? "التهاب القصبات" : "Bronchitis", "Throat / chest"], ["B86", ar ? "الجرب" : "Scabies", "Skin"], ["L29", ar ? "حكّة" : "Itching", "Skin"]]
            .map(([c, n, g]) => `<tr><td class="mono">${c}</td><td>${n}</td><td>${esc(gname(g))}</td></tr>`).join("")}</tbody></table></div></div>
      <div class="card"><h2><span>${L.alerts}</span></h2><p class="prose">${L.alertsP}</p>
        <div class="endpoint"><span class="verb get">GET</span>/v1/alerts?level=red</div>
        <pre class="code">${j({ alerts: [{ id: "al_jub_sto", level: "red", area: ACODE, group: "stomach", since: `${DATA.date[dIdx(FR[0])]}T${pad(FR[1])}:00+03:00`, medicines_up: ["Flagyl", "ORS", "Onda"], clinic_wobbles: 3.4 }] })}</pre>
        <h3 style="font-size:.95rem;margin:14px 0 8px">${L.priv}</h3><ul class="list">${L.p.map(x => `<li>${x}</li>`).join("")}</ul>
        <p class="note" style="margin-top:12px">${L.note}</p></div>
    </div></div>`;
  if (LIVE_MODE && isAdm() && window.__fsServer) window.__fsServer.fillTryIt($("tryCode"));
  if (LIVE_MODE && isAdm() && window.__fsServer) window.__fsServer.renderAi($("aiCard"));
}

function renderMethod() {
  const ar = state.lang === "ar", fa = SC.outbreak ? (LIVE.first_alert[OKEY] || {}) : {};
  const at = (x) => x ? `${t("day")} ${x[0]} · ${pad(x[1])}:00` : "—";
  const falseY = Object.entries(LIVE.first_alert).filter(([k, v]) => !(SC.outbreak && k === OKEY) && v.Y).map(([k]) => k);
  const falseR = Object.entries(LIVE.first_alert).filter(([k, v]) => !(SC.outbreak && k === OKEY) && v.R).length;
  const lead = fa.Y && fa.R ? ((fa.R[0] - fa.Y[0]) * 24 + fa.R[1] - fa.Y[1]) : 0;
  const reps = AUTH ? AUTH.inbox(WORLD, true).length ? AUTH.inbox(WORLD, true) : [] : [];
  const reviewed = reps.map(r => r.decision === "confirm" ? "ok" : "no");
  const steps = ar ? [
    ["تعلّم الطبيعي", "لكل منطقة ولكل دواء، يحسب النظام المعدل الطبيعي من آخر 14 يوماً، ويتجاهل آخر يومين حتى لا يخفي تفشٍّ متصاعد نفسه."],
    ["تعديل الأحداث المعروفة", "الجمعة والسبت أهدأ، ويوم صرف الرواتب ترتفع المبيعات 25%، والحر يرفع مبيعات أملاح الإماهة 8% لكل درجة فوق 36. يُضبط المتوقع قبل المقارنة."],
    ["قياس التذبذب", "كم تذبذباً فوق المتوقع؟ التذبذب هو مقدار تغيّر المبيعات عادةً من يوم لآخر في تلك المنطقة."],
    ["أصفر", "دواءان أو أكثر من المجموعة نفسها فوق 3 تذبذبات، وبزيادة 5 علب على الأقل. المجموعة ذات الدواء الواحد (الجرب) تحتاج 4 تذبذبات."],
    ["أحمر", "أصفر خلال آخر 3 أيام، وزيارات العيادات لنفس المجموعة فوق 3 تذبذبات."],
    ["كل ساعة", "يقارن المبيع حتى الآن بالمتوقع حتى هذه الساعة. يحتاج 25% من مبيعات يوم عادي قبل الحكم، وحدّاً أعلى (3.5) خلال النهار، وأن يستمر التنبيه ساعتين متتاليتين."],
  ] : [
    ["Learn normal", "For every area and medicine, normal is the average of the last 14 days, skipping the latest 2 so a growing outbreak can't hide itself."],
    ["Adjust for known events", "Fridays and Saturdays are quieter, payday adds 25%, and heat adds 8% to ORS for every degree above 36 °C. Expectations are adjusted before comparing."],
    ["Measure wobbles", "How many wobbles above expected is today? A wobble is how much sales usually move day to day in that area."],
    ["Yellow", "Two or more medicines from the same group are 3+ wobbles up and at least 5 boxes above expected. Single-medicine groups (scabies) need 4 wobbles."],
    ["Red", "Yellow within the last 3 days, and clinic visits for the same group are 3+ wobbles up."],
    ["Every hour", "Sales so far are compared with what's expected by this hour. It waits for 25% of a normal day's sales, uses a higher bar during the day (3.5), and a new alert must hold for 2 hours in a row."],
  ];
  const R = ar ? [
    ["بداية التفشي (محاكاة)", SC.outbreak ? `اليوم ${SC.start} · ${AREA_AR(SC.area)} · ${AR_GROUP[SC.group]}` : "لا يوجد تفشٍّ"], ["أول تحذير أصفر", at(fa.Y)], ["تأكيد أحمر", at(fa.R)], ["سبق الصيدليات", `${Math.floor(lead / 24)} يوم و${lead % 24} ساعات`],
    ["فخ الباراسيتامول", SC.trap ? `اليوم ${SC.trapDay}: ${RES.trapIgnored ? "تجاهله النظام" : "أطلق تنبيهاً"}` : "متوقف"], ["إنذارات يمنعها التقويم والطقس", SC.aware ? `${RES.contextSaves.length}${RES.contextSaves.length ? " (" + RES.contextSaves.map(AREA_AR).join("، ") + ")" : ""}` : "الوعي بالتقويم متوقف"],
    ["إنذارات صفراء كاذبة", `${falseY.length} (${falseY.map(k => nm(k.split("|")[0])).join("، ")})`], ["إنذارات حمراء كاذبة", String(falseR)],
    [t("reviewsW"), `${reviewed.filter(x => x === "ok").length} تأكيد · ${reviewed.filter(x => x === "no").length} كاذب`],
  ] : [
    ["Outbreak begins (simulated)", SC.outbreak ? `Day ${SC.start} · ${SC.area} · ${SC.group}` : "No outbreak"], ["First yellow", at(fa.Y)], ["Red confirmed", at(fa.R)], ["Pharmacy head start", `${Math.floor(lead / 24)} days ${lead % 24} hours`],
    ["Paracetamol trap", SC.trap ? `Day ${SC.trapDay}: ${RES.trapIgnored ? "Ignored" : "Raised an alert"}` : "Off"], ["False alarms prevented by calendar + weather", SC.aware ? `${RES.contextSaves.length}${RES.contextSaves.length ? " (" + RES.contextSaves.join(", ") + ")" : ""}` : "Calendar awareness off"],
    ["False yellows", `${falseY.length} (${falseY.map(k => k.split("|")[0]).join(", ")})`], ["False reds", String(falseR)],
    [t("reviewsW"), `${reviewed.filter(x => x === "ok").length} confirmed · ${reviewed.filter(x => x === "no").length} false`],
  ];
  const heat = Object.entries(CTX.temps).filter(([, ts]) => Math.max(...ts.slice(21, 25)) >= 40).map(([a, ts]) => [a, Math.max(...ts.slice(21, 25))]);
  $("view-method").innerHTML = `<div class="grid2">
    <div class="card prose"><h2><span>${ar ? "قواعد الكشف" : "Detection rules"}</span></h2>
      <ol class="list">${steps.map(([h, p]) => `<li><b>${h}.</b> ${p}</li>`).join("")}</ol>
      <h3>${ar ? "ملاحظات المفتشين" : "Inspector feedback"}</h3>
      <p>${ar ? LIVE_MODE ? "يمكن للمفتش تأكيد التنبيه أو تسجيله كإنذار كاذب. كل إنذار كاذب يرفع الحدّ لتلك المنطقة والمجموعة بنصف تذبذب للأيام الـ14 التالية، فيتعلّم Foreshock من الميدان. والتأكيد يلغي ذلك." : "يمكن للمفتش تأكيد التنبيه أو تسجيله كإنذار كاذب. في النظام الكامل، كل إنذار كاذب يرفع الحدّ لتلك المنطقة والمجموعة بنصف تذبذب لمدة 14 يوماً، فيتعلّم النظام من الميدان." : LIVE_MODE ? "Inspectors can confirm an alert or mark it as a false alarm. Each false alarm raises the bar for that area and group by half a wobble for the next 14 days, so Foreshock learns from the field. A confirm removes it again." : "Inspectors can confirm an alert or mark it as a false alarm. In the full system, each false alarm raises the bar for that area and group by half a wobble for 14 days, so the system learns from the field."}</p>
      <h3>${ar ? "التقويم والطقس" : "Calendar and weather"}</h3>
      <ul class="list">${Object.entries(CTX.calendar).map(([d, c]) => `<li>${t("day")} ${d}: ${ar ? c.name_ar : c.name} · ×${c.factor}</li>`).join("")}
        ${SC.heatwave ? `<li>${ar ? "موجة حر، الأيام 22–25" : "Heatwave, days 22–25"}: ${heat.map(([a, m]) => `${esc(nm(a))} ${m.toFixed(1)}°`).join(" · ")}</li>` : ""}</ul>
      ${LIVE_MODE ? `<p class="note">${DATA.weather === "open-meteo" ? (ar ? "الطقس: درجات حرارة حقيقية من Open-Meteo لكل منطقة (الأيام الماضية والتوقعات)." : "Weather: real temperatures from Open-Meteo for every area (past days and forecast).") : (ar ? "الطقس: محاكى (لا اتصال بالإنترنت عند إنشاء العالم)." : "Weather: simulated (no internet when this world was created).")}</p>` : ""}
      ${LIVE_MODE && DATA.upcoming ? `<h3>${ar ? "قادم في تقويم الأردن" : "Coming up in Jordan's calendar"}</h3><ul class="list">${DATA.upcoming.map(e => `<li><span class="mono">${esc(e.start)}${e.end !== e.start ? " → " + esc(e.end) : ""}</span> · ${esc(ar ? e.name_ar : e.name)} · ${ar ? "المبيعات" : "sales"} ×${e.factor}</li>`).join("")}</ul>
        <p class="note">${ar ? "مواعيد رمضان والأعياد تقريبية لأنها تتبع رؤية الهلال. يتوقع Foreshock هذه التغيّرات فلا تبدو كتفشٍّ." : "Ramadan and Eid dates follow the moon, so they can move by a day. Foreshock expects these changes, so they never look like an outbreak."}</p>` : ""}
    </div>
    <div class="card"><h2><span>${ar ? "نتائج الاختبار على البيانات المحاكاة" : "Test results on simulated data"}</span><span class="mono">64 × 10 × 30</span></h2>
      <table class="t"><tbody>${R.map(([k, v]) => `<tr><td>${k}</td><td class="n num" style="font-weight:600">${esc(v)}</td></tr>`).join("")}</tbody></table>
      <p class="note">${ar ? "يُعاد حساب هذه النتائج من البيانات نفسها التي تراها في الخريطة." : "Computed from the same data shown on the map."}</p></div>
  </div>${evalCard()}`;
}
function evalCard() {
  const V = DATA.evaluation; if (!V || !V.foreshock) return "";
  const ar = state.lang === "ar", F = V.foreshock, E2 = V.ears_same_false_alarms, lo = V.ears.find(e => e.z === 3) || V.ears[0];
  const bar = (n, of, cls) => `<span class="evbar"><i class="${cls}" style="width:${n / of * 100}%"></i></span>`;
  const sizes = V.sizes.map((sz, i) => `<tr><td class="num">${sz}×</td><td>${bar(F.by_size[i], V.per_size, "fs")} <b class="num">${F.by_size[i]}/${V.per_size}</b></td><td>${bar(E2.by_size[i], V.per_size, "ears")} <b class="num">${E2.by_size[i]}/${V.per_size}</b></td></tr>`).join("");
  return `<div class="card" style="margin-top:16px"><h2><span>${ar ? `اختبار عادل: ${V.worlds} عالماً محاكى ضد طريقة EARS` : `A fair test: ${V.worlds} simulated worlds vs the EARS method`}</span><span class="mono">CDC EARS C2</span></h2>
    <p class="prose" style="margin:0 0 10px">${ar ? "EARS هي طريقة إنذار مبكر تستخدمها جهات صحية كثيرة: تنبّه عندما يكون اليوم أعلى بـ3 انحرافات معيارية من أسبوع سابق، ولا تعرف الرواتب أو الحر. ضبطناها لتطلق إنذارات كاذبة بقدر Foreshock تقريباً، ثم قارنّا ما يكتشفه كل منهما." : "EARS is an early-warning method many health agencies use: it alarms when today is more than 3 standard deviations above an earlier week, and it doesn't know about payday or heat. We tuned it to make about as many false alarms as Foreshock, then compared what each one catches."}</p>
    <div class="grid2"><table class="t"><tbody>
      <tr><td></td><th>Foreshock</th><th>EARS (z > ${E2.z})</th></tr>
      <tr><td>${ar ? "تفشيات اكتُشفت" : "Outbreaks caught"}</td><td class="num"><b>${F.caught}/${V.worlds}</b></td><td class="num">${E2.caught}/${V.worlds}</td></tr>
      <tr><td>${ar ? "إنذارات كاذبة لكل عالم" : "False alarms per world"}</td><td class="num">${F.false_per_world}</td><td class="num">${E2.false_per_world}</td></tr>
      <tr><td>${ar ? "أيام حتى أول تنبيه (الوسيط)" : "Days to first alert (median)"}</td><td class="num">${F.median_delay_days ?? "—"}</td><td class="num">${E2.median_delay_days ?? "—"}</td></tr>
    </tbody></table>
    <table class="t evsize"><thead><tr><th>${ar ? "حجم التفشي" : "Outbreak size"}</th><th>Foreshock</th><th>EARS</th></tr></thead><tbody>${sizes}</tbody></table></div>
    <p class="note">${ar ? `EARS القياسية (z > 3) تكتشف ${lo.caught}/${V.worlds} لكن مع ${lo.false_per_world} إنذاراً كاذباً لكل عالم، أي أكثر من أن يتابعها المفتشون. أكثر ما يفوت Foreshock: الأمراض الجلدية (دواء واحد فقط). الحجم = المبيعات في الذروة مقارنة بالطبيعي.` : `Standard EARS (z > 3) catches ${lo.caught}/${V.worlds}, but with ${lo.false_per_world} false alarms per world, far more than inspectors could follow up. Foreshock misses most in skin illness (only one medicine to watch). Size = sales at the peak compared with normal.`}</p></div>`;
}

/* ======================= chrome ======================= */
function applyStatic() {
  document.documentElement.lang = state.lang; document.documentElement.dir = state.lang === "ar" ? "rtl" : "ltr";
  document.querySelectorAll("[data-i]").forEach(el => el.textContent = t(el.dataset.i));
  $("lang-en").setAttribute("aria-pressed", state.lang === "en"); $("lang-ar").setAttribute("aria-pressed", state.lang === "ar");
  $("chips").innerHTML = "";
  ["All", ...GROUPS].forEach(g => {
    const b = document.createElement("button"); b.type = "button"; b.className = "chip"; b.textContent = gname(g);
    b.setAttribute("aria-pressed", state.group === g);
    b.onclick = () => { state.group = g; state.detailGroup = g === "All" ? null : g; applyStatic(); renderAll(); };
    $("chips").appendChild(b);
  });
  $("speeds").innerHTML = (LIVE_MODE ? [1, 3, 10] : [1, 4, 24]).map(s => `<button type="button" data-s="${s}" aria-pressed="${(LIVE_MODE ? CLOCK?.speed : state.speed) === s}">${s}×</button>`).join("");
  $("speeds").querySelectorAll("button").forEach(b => b.onclick = () => { if (LIVE_MODE) { window.__fsServer?.setClock({ speed: +b.dataset.s }); return; } state.speed = +b.dataset.s; applyStatic(); });
  if ($("apiHost")) $("apiHost").textContent = LIVE_MODE ? location.host : "api.foreshock.example";
  $("foot").textContent = state.lang === "ar"
    ? "نموذج طلابي يعمل على بيانات محاكاة: 49 لواءً و15 حياً في عمّان الكبرى، 10 أدوية، 30 يوماً (2 أيلول إلى 1 تشرين الأول 2026). الحدود: geoBoundaries ‏(CC BY 4.0). أحجام المناطق تقريبية. ليس نظاماً رسمياً."
    : "Student prototype on simulated data: 49 districts and 15 Greater Amman neighborhoods, 10 medicines, 30 days (2 Sep to 1 Oct 2026). Borders: geoBoundaries (CC BY 4.0). Area sizes use approximate populations. Not an official system.";
  if (DATA.date) {      // the real dates of this world (real-time worlds don't start on 2 Sep)
    const f = (iso) => { const x = new Date(iso + "T12:00:00"); return `${x.getDate()} ${MON[state.lang][x.getMonth()]} ${x.getFullYear()}`; };
    $("foot").textContent = $("foot").textContent.replace(state.lang === "ar" ? /\(2 أيلول[^)]*\)/ : /\(2 Sep to 1 Oct 2026\)/, `(${f(DATA.date[0])} – ${f(DATA.date[DATA.date.length - 1])})`);
  }
  const clockLbl = document.querySelector('[data-i="simTime"]');
  if (clockLbl && LIVE_MODE && CLOCK?.realtime) clockLbl.textContent = state.lang === "ar" ? "الوقت الحقيقي · عمّان" : "Real time · Amman";
  setPlayLabel(); drawCrumbs(); renderConn(); renderMethod(); applyChrome();
  if (AUTH) AUTH.setLang(state.lang);
  if (state.tab === "team" && AUTH) AUTH.renderTeam($("view-team"), state.lang);
  if (window.__fsLang) window.__fsLang(state.lang);
  if (state.view.level === "jordan") { $("mapHint").textContent = t("hintJordan"); $("mapNote").textContent = t("noteJordan"); }
  else if (state.view.level === "city") { $("mapHint").textContent = t("hintCity"); $("mapNote").textContent = t("noteCity"); }
  else { $("mapHint").textContent = state.view.gov === "Amman" ? t("hintGovAmman") : t("hintGov"); $("mapNote").textContent = t("noteGov"); }
}
function setPlayLabel() {
  if (LIVE_MODE) {
    const run = !!CLOCK?.running, wait = !!CLOCK?.waiting_for_data, ended = !!CLOCK?.ended;
    $("play").textContent = run ? "❚❚ " + t("pause") : "▶ " + t("play");
    $("play").hidden = $("speeds").hidden = !isAdm() || ended || !!CLOCK?.realtime;
    $("speeds").querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", +b.dataset.s === CLOCK?.speed));
    $("liveDot").classList.toggle("paused", !run || wait);
    $("sysStatus").textContent = ended ? t("ended") : CLOCK?.realtime ? (wait ? t("waitRT") : t("liveRT")) : wait ? t("waitData") : run ? t("live") : t("paused");
    return;
  }
  $("play").textContent = state.playing ? "❚❚ " + t("pause") : "▶ " + t("play");
  $("liveDot").classList.toggle("paused", !state.playing); $("sysStatus").textContent = state.playing ? t("live") : t("paused");
}
window.__fsClock = (c) => { CLOCK = c; setPlayLabel(); };
const TABS = ["sim", "map", "inbox", "insights", "brief", "live", "supply", "sms", "conn", "method", "team"].filter(k => document.getElementById("tab-" + k));
const tabAllowed = (k) => !(["sim", "team", "sms", "brief"].includes(k) && !isAdm()) && !(k === "brief" && !LIVE_MODE) && !(k === "insights" && !(LIVE_MODE && ME())) && !(k === "inbox" && !ME()) && !(k === "sms" && !LIVE_MODE);
function applyChrome() {
  TABS.forEach(k => { $("tab-" + k).hidden = !tabAllowed(k); });
  const me = ME();
  $("tabInboxLabel").textContent = isAdm() ? t("tabInbox") : t("tabMine");
  const n = !AUTH ? 0 : isAdm() ? AUTH.waitingFor(WORLD) : AUTH.unseenUpdates(WORLD);
  $("inboxBadge").textContent = n; $("inboxBadge").hidden = !n;
  $("who").innerHTML = me ? `<span class="who-name"><b>${esc(AUTH.nameOf(me))}</b><small>${isAdm() ? t("adminRole") : t("inspRole") + " · " + me.govs.map(g => nm(g)).join(", ")}</small></span><button type="button" class="btn sm" id="signOut">${t("signOut")}</button>` : "";
  if (window.__fsBell) window.__fsBell();
  if ($("signOut")) $("signOut").onclick = () => { if (state.playing) togglePlay(); AUTH.logout(); window.__fsPrev.tab = "map"; AUTH.renderLogin(state.lang); };
}
function setTab(id) {
  if (!tabAllowed(id)) id = "map";
  state.tab = id;
  TABS.forEach(k => { $("tab-" + k).setAttribute("aria-selected", k === id); $("view-" + k).hidden = k !== id; });
  document.querySelector(".timeline").hidden = !["map", "live", "supply"].includes(id);
  if (id === "team" && AUTH) AUTH.renderTeam($("view-team"), state.lang);
  renderAll();
}
function renderClock() {
  const d = dayOf(), h = hourOf(), s = Math.floor(state.sec);
  if (!LIVE_MODE) $("clock").textContent = `${fmtDate(d, false)} · ${pad(h)}:${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
  const x = dateOf(d);
  $("when").innerHTML = `${t("day")} ${d} · ${pad(h)}:00<small>${WD[state.lang][x.getDay()]} ${x.getDate()} ${MON[state.lang][x.getMonth()]}</small>` +
    (LIVE_MODE ? (state.t === TMAX ? `<span class="nowtag">${t("nowTag")}</span>` : `<button type="button" class="btn sm" id="backLive">${t("backLive")}</button>`) : "");
  if ($("backLive")) $("backLive").onclick = () => { state.t = TMAX; state.following = true; renderAll(); };
  moveHead();
}
let lastT = -1;
function renderAll(fromStrip) {
  renderClock(); renderKPIs();
  if (state.tab === "map") { drawCrumbs(); paint(); renderAlerts(); renderDetail(); }
  if (state.tab === "live") renderLive();
  if (state.tab === "supply") renderSupply();
  if (state.tab === "method") renderMethod();
  if (state.tab === "inbox") renderInbox();
  if (state.tab === "brief" && !fromStrip) renderBrief();
  if (state.tab === "insights" && !fromStrip && !(document.activeElement && document.activeElement.id === "ask-q")) renderInsights();
  if (state.tab === "sms" && window.__fsServer) window.__fsServer.renderSms($("view-sms"), { t, esc, gname, placeLabel, UNIT, lang: state.lang, pad });
  applyChrome();
  $("lgWatch").hidden = !state.showWatch;
  lastT = state.t;
}
function step(n) { state.t = Math.max(0, Math.min(TMAX, state.t + n)); state.sec = LIVE_MODE ? 3599 : 0; state.following = state.t === TMAX; logHourRun(); renderAll(); }

/* ======================= live loop ======================= */
let timer = null, lastTick = 0;
window.__fsStop = () => { clearInterval(timer); timer = null; };
function togglePlay() {
  if (LIVE_MODE) { if (isAdm() && window.__fsServer) window.__fsServer.setClock({ running: !CLOCK?.running }); return; }
  state.playing = !state.playing;
  if (state.playing) { if (state.t >= TMAX) state.t = 0; lastTick = performance.now(); timer = setInterval(tick, 120); logHourRun(); }
  else { clearInterval(timer); timer = null; }
  setPlayLabel(); renderAll();
}
function tick() {
  const now = performance.now(), dt = (now - lastTick) / 1000; lastTick = now;
  const simPerSec = 3600 / 4 * state.speed;            // 1× = one simulated hour every 4 seconds
  const before = state.sec; state.sec += dt * simPerSec;
  buildPool();
  const expected = hourPool.tot * (Math.min(state.sec, 3600) - before) / 3600;
  emit(Math.min(3, Math.max(expected > 0 ? 1 : 0, Math.round(Math.min(expected, 3) * (state.speed > 4 ? .5 : 1)))));
  let hourChanged = false;
  while (state.sec >= 3600) { state.sec -= 3600; state.t++; hourChanged = true; if (state.t > TMAX) { state.t = TMAX; state.sec = 3599; togglePlay(); return; } }
  if (hourChanged) { logHourRun(); renderAll(); return; }
  renderClock(); renderKPIs();
  if (state.tab === "live") renderLive();
}

/* ======================= start ======================= */
$("lang-en").onclick = () => { state.lang = "en"; applyStatic(); go(state.view); if (AUTH && !ME()) AUTH.renderLogin("en"); };
$("lang-ar").onclick = () => { state.lang = "ar"; applyStatic(); go(state.view); if (AUTH && !ME()) AUTH.renderLogin("ar"); };
TABS.forEach(k => $("tab-" + k).onclick = () => setTab(k));
window.__fsAuthChanged = () => { applyChrome(); renderAll(); };
window.__fsSetTab = setTab;
window.__fsOpenArea = (area, group) => { if (!UNIT[area]) return; state.area = area; state.detailGroup = group || null; setTab("map"); showOnMap(area); renderAll(); };
$("play").onclick = togglePlay;
$("showWatch").onchange = (e) => { state.showWatch = e.target.checked; renderAll(); };
document.onkeydown = (e => {
  if (e.target.closest && e.target.closest("input, textarea, #strip")) return;
  if (e.key === "ArrowRight") { step(1); e.preventDefault(); }
  else if (e.key === "ArrowLeft") { step(-1); e.preventDefault(); }
  else if (e.key === " " && (e.target === document.body)) { togglePlay(); e.preventDefault(); }
});
// open on the moment the outbreak is confirmed (or day 17 evening when there is none)
state.t = Math.min(TMAX, Math.max(0, (FR[0] - FIRST) * 24 + FR[1]));
if (LIVE_MODE) {
  state.t = state.following || state.prevT == null ? TMAX : Math.min(state.prevT, TMAX);
  ingestFeed(window.__fsFeedBuf || []);
} else {
  for (let i = 0; i < 18; i++) emit(1);
  state.t -= 1; logHourRun(); state.t += 1;   // so the log also shows the SMS sent when the red alert began
  logHourRun();
}
if (isInsp() && !SAME) {
  const g0 = ME().govs[0];
  if (!mine(state.area)) state.area = (DATA.units.find(u => u.gov === g0 && u.kind === (g0 === "Amman" ? "neighborhood" : "district")) || DATA.units.find(u => u.gov === g0)).name;
}
drawStrip(); applyStatic();
$("showWatch").checked = !!state.showWatch;
go(SAME ? state.view : isInsp() ? (ME().govs[0] === "Amman" ? { level: "city" } : { level: "gov", gov: ME().govs[0] }) : { level: "jordan" });
setTab(state.tab);
if (AUTH) AUTH.renderLogin(state.lang);
}
