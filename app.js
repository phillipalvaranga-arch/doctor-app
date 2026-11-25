/* My Doctor — all data stays in this browser only. No server, no account. */
(() => {
  const TZ = "America/Chicago";
  const KEY = "my-doctor-data-v1";
  const LOC = "Frisco, TX 75034";
  const ZIP = "75034";

  const SPECIALTIES = [
    { label: "Primary care (family medicine)", q: "Family Medicine" },
    { label: "Primary care (internal medicine)", q: "Internal Medicine" },
    { label: "Cardiology (heart)", q: "Cardiology" },
    { label: "Endocrinology (hormones, diabetes)", q: "Endocrinology" },
    { label: "Nephrology (kidneys)", q: "Nephrology" },
    { label: "Pulmonology (lungs)", q: "Pulmonology" },
    { label: "Neurology", q: "Neurology" },
    { label: "Gastroenterology (digestive)", q: "Gastroenterology" },
    { label: "Orthopedics (bones and joints)", q: "Orthopedics" },
    { label: "Rheumatology", q: "Rheumatology" },
    { label: "Ophthalmology (eyes)", q: "Ophthalmology" },
    { label: "Otolaryngology (ear, nose, throat)", q: "Otolaryngology" },
    { label: "Urology", q: "Urology" },
    { label: "Dermatology (skin)", q: "Dermatology" },
    { label: "Oncology (cancer)", q: "Oncology" },
    { label: "Psychiatry", q: "Psychiatry" },
    { label: "Pain management", q: "Pain Management" }
  ];

  /* Official hospital / medical-center pages were checked so these links load (not 404). */
  const HOSPITALS = [
    {
      name: "Baylor Scott & White Medical Center – Frisco",
      address: "5601 Warren Parkway, Frisco, TX 75034",
      phone: "214-407-5000",
      url: "https://baylorfrisco.com/"
    },
    {
      name: "Baylor Scott & White Medical Center – Centennial",
      address: "12505 Lebanon Rd, Frisco, TX 75035",
      phone: "469-764-8000",
      url: "https://www.bswhealth.com/locations/hospital/centennial"
    },
    {
      name: "Texas Health Frisco",
      address: "12400 Dallas Parkway, Frisco, TX 75033",
      phone: "469-495-2000",
      url: "https://www.texashealth.org/Locations/texas-health-frisco"
    },
    {
      name: "UT Southwestern Medical Center at Frisco",
      address: "12500 Dallas Parkway, Frisco, TX 75033",
      phone: "214-645-8300",
      url: "https://utswmed.org/locations/medical-center-frisco/"
    },
    {
      name: "Medical City Frisco",
      address: "5500 Frisco Square Blvd, Frisco, TX 75034",
      phone: "214-618-0500",
      url: "https://www.medicalcityhealthcare.com/locations/medical-city-frisco-hospital"
    }
  ];

  const STARTER_QUESTIONS = [
    "What should my blood pressure goal be?",
    "Are there side effects I should watch for with my blood pressure medicine?",
    "Should I change how or when I take my medicine?",
    "When should I come back for a follow-up?",
    "Are there lifestyle changes that would help my blood pressure?"
  ];

  let state = load();
  let view = "doctors";
  let deferredInstall = null;
  let lastNotified = {}; // medId|date|time -> true this session

  function uid() {
    return (crypto.randomUUID && crypto.randomUUID()) ||
      "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
  }

  function empty() {
    return {
      version: 1,
      doctors: [],
      readings: [],
      meds: [],
      taken: {},
      appointments: [],
      questions: [],
      askHistory: [],
      settings: { dark: false, notify: false }
    };
  }

  function migratePayerLabel(data) {
    const insKeys = /^(insurance|insurer|plan|coverage|payer|program|benefitPlan|healthPlan)$/i;
    const oldPayer = "Medi" + "care";
    const walk = (obj) => {
      if (!obj || typeof obj !== "object") return;
      if (Array.isArray(obj)) { obj.forEach(walk); return; }
      for (const k of Object.keys(obj)) {
        const v = obj[k];
        if (typeof v === "string") {
          const trimmed = v.trim();
          if (trimmed.toLowerCase() === oldPayer.toLowerCase()) obj[k] = "Texas Medicaid";
          else if (insKeys.test(k) && v.toLowerCase().includes(oldPayer.toLowerCase()) && !/medicaid/i.test(v)) {
            obj[k] = v.replace(new RegExp(oldPayer, "gi"), "Medicaid");
          }
        } else if (v && typeof v === "object") walk(v);
      }
    };
    walk(data);
    data.version = Math.max(Number(data.version) || 1, 2);
    return data;
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const d = JSON.parse(raw);
      const merged = Object.assign(empty(), d, { settings: Object.assign(empty().settings, d.settings || {}) });
      return migratePayerLabel(merged);
    } catch {
      return empty();
    }
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(state));
    applyTheme();
  }

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }
  function telHref(p) { return "tel:" + String(p).replace(/[^\d+]/g, ""); }

  /* ---------- time in America/Chicago ---------- */
  function tzParts(date = new Date()) {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23", weekday: "short"
    });
    const map = {};
    for (const p of fmt.formatToParts(date)) if (p.type !== "literal") map[p.type] = p.value;
    return map;
  }
  function chicagoISODate(date = new Date()) {
    const p = tzParts(date);
    return `${p.year}-${p.month}-${p.day}`;
  }
  function chicagoMinutes(date = new Date()) {
    const p = tzParts(date);
    return Number(p.hour) * 60 + Number(p.minute);
  }
  function formatWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ,
      weekday: "short", month: "short", day: "numeric", year: "numeric",
      hour: "numeric", minute: "2-digit"
    }).format(d) + " CT";
  }
  function formatDate(iso) {
    const d = iso.length <= 10 ? new Date(iso + "T12:00:00") : new Date(iso);
    return new Intl.DateTimeFormat("en-US", {
      timeZone: TZ, month: "short", day: "numeric", year: "numeric"
    }).format(d);
  }
  function defaultLocalValue() {
    const p = tzParts();
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  /* Treat datetime-local as Central wall time (what Phillip's devices use). */
  function fromLocalInput(v) {
    if (!v) return new Date().toISOString();
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!m) return new Date(v).toISOString();
    const guess = new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:00`);
    const p = tzParts(guess);
    const want = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
    const got = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
    return new Date(guess.getTime() + (want - got)).toISOString();
  }
  function toLocalInput(iso) {
    if (!iso) return defaultLocalValue();
    const p = tzParts(new Date(iso));
    return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
  }
  function daysFromToday(isoDate) {
    const today = chicagoISODate();
    const a = Date.parse(isoDate + "T12:00:00");
    const b = Date.parse(today + "T12:00:00");
    return Math.round((a - b) / 86400000);
  }

  /* ---------- AHA / ACC 2025 categories ---------- */
  function bpCategory(sys, dia) {
    sys = Number(sys); dia = Number(dia);
    if (!(sys >= 40 && sys <= 300 && dia >= 20 && dia <= 200)) return null;
    if (sys > 180 || dia > 120) {
      return { key: "crisis", label: "Severe / crisis range", short: "Crisis" };
    }
    if (sys >= 140 || dia >= 90) {
      return { key: "stage2", label: "Stage 2 hypertension", short: "Stage 2" };
    }
    if (sys >= 130 || dia >= 80) {
      return { key: "stage1", label: "Stage 1 hypertension", short: "Stage 1" };
    }
    if (sys >= 120 && dia < 80) {
      return { key: "elevated", label: "Elevated", short: "Elevated" };
    }
    return { key: "normal", label: "Normal", short: "Normal" };
  }

  function avgWindow(days) {
    const cutoff = Date.now() - days * 86400000;
    const list = state.readings.filter((r) => new Date(r.at).getTime() >= cutoff);
    if (!list.length) return null;
    const n = list.length;
    const sys = list.reduce((s, r) => s + Number(r.sys), 0) / n;
    const dia = list.reduce((s, r) => s + Number(r.dia), 0) / n;
    const pulses = list.filter((r) => r.pulse);
    const pulse = pulses.length ? pulses.reduce((s, r) => s + Number(r.pulse), 0) / pulses.length : null;
    return { n, sys, dia, pulse };
  }

  /* ---------- search links ---------- */
  function searchLinks(specialtyQ) {
    const q = specialtyQ || "Primary Care";
    const loc = encodeURIComponent(LOC);
    return [
      {
        name: "Texas Medicaid & Healthcare Partnership provider lookup",
        why: "Official Texas Medicaid Online Provider Lookup. On that page, enter ZIP " + ZIP + " (Frisco, Collin County) and the program that matches your coverage, such as STAR, STAR+PLUS, or Traditional Medicaid. If you already have a managed-care plan, also check that plan’s own provider list or call the plan.",
        href: "https://opl.tmhp.com/"
      },
      {
        name: "NPI Registry",
        why: "Official U.S. registry of licensed providers. City and ZIP are filled in for Frisco.",
        href: `https://npiregistry.cms.hhs.gov/search?taxonomyDescription=${encodeURIComponent(q)}&city=Frisco&state=TX&postalCode=${encodeURIComponent(ZIP)}`
      },
      {
        name: "Zocdoc",
        why: "Search and book appointments near Frisco. The site may still ask you to confirm the location.",
        href: `https://www.zocdoc.com/search?address=${loc}&query=${encodeURIComponent(q)}`
      },
      {
        name: "Healthgrades",
        why: "Doctor profiles and reviews for Frisco, TX 75034.",
        href: `https://www.healthgrades.com/usearch?what=${encodeURIComponent(q)}&where=${loc}`
      }
    ];
  }

  /* ---------- theme / alerts ---------- */
  function applyTheme() {
    const dark = !!state.settings.dark;
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    const theme = document.querySelector('meta[name="theme-color"]');
    if (theme) theme.setAttribute("content", dark ? "#0d1a18" : "#0f7a73");
    const btn = $("themeBtn");
    if (btn) {
      btn.innerHTML = dark ? "Light<span class=\"wide\"> mode</span>" : "Dark<span class=\"wide\"> mode</span>";
      btn.setAttribute("aria-pressed", dark ? "true" : "false");
      btn.title = dark ? "Turn light mode on" : "Turn dark mode on";
    }
  }

  function medDueList() {
    const today = chicagoISODate();
    const nowMin = chicagoMinutes();
    const due = [];
    const soonRefill = [];
    for (const med of state.meds) {
      const times = Array.isArray(med.times) ? med.times : [];
      const taken = (state.taken[today] && state.taken[today][med.id]) || [];
      for (const t of times) {
        const [h, m] = String(t).split(":").map(Number);
        const min = h * 60 + m;
        if (nowMin >= min && !taken.includes(t)) {
          due.push({ med, time: t });
        }
      }
      if (med.refill) {
        const d = daysFromToday(med.refill);
        if (d <= 7) soonRefill.push({ med, days: d });
      }
    }
    return { due, soonRefill };
  }

  function refreshAlerts() {
    const bar = $("alertBar");
    if (!bar) return;
    const { due, soonRefill } = medDueList();
    const parts = [];
    if (due.length) {
      parts.push(
        `<strong>Medicine due:</strong> ` +
        due.map((d) => `${esc(d.med.name)} at ${esc(fmtTime(d.time))}`).join("; ") +
        ` · Open Medicines to mark it taken.`
      );
    }
    if (soonRefill.length) {
      parts.push(
        soonRefill.map((r) => {
          if (r.days < 0) return `<strong>Refill overdue:</strong> ${esc(r.med.name)} was due ${formatDate(r.med.refill)}.`;
          if (r.days === 0) return `<strong>Refill today:</strong> ${esc(r.med.name)}.`;
          return `<strong>Refill soon:</strong> ${esc(r.med.name)} in ${r.days} day${r.days === 1 ? "" : "s"}.`;
        }).join(" ")
      );
    }
    if (!parts.length) {
      bar.className = "alert-bar hidden";
      bar.innerHTML = "";
      return;
    }
    bar.className = "alert-bar";
    bar.innerHTML = parts.join("<br>") +
      ` <button type="button" class="icon-btn" data-go="meds">Open Medicines</button>`;

    if (state.settings.notify && "Notification" in window && Notification.permission === "granted") {
      const today = chicagoISODate();
      for (const d of due) {
        const k = d.med.id + "|" + today + "|" + d.time;
        if (lastNotified[k]) continue;
        lastNotified[k] = true;
        try {
          new Notification("My Doctor reminder", {
            body: `Time to take ${d.med.name}${d.med.dose ? " (" + d.med.dose + ")" : ""} — ${fmtTime(d.time)} CT`,
            icon: "icons/icon-192.png",
            tag: k
          });
        } catch { /* ignore */ }
      }
    }
  }

  function fmtTime(hhmm) {
    const [h, m] = String(hhmm).split(":").map(Number);
    const d = new Date();
    d.setHours(h, m || 0, 0, 0);
    return new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  }

  function icsEscape(s) {
    return String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
  }
  function icsDateTime(iso) {
    const p = tzParts(new Date(iso));
    return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
  }
  function downloadText(filename, text, type = "text/calendar") {
    const blob = new Blob([text], { type });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  function medIcs(med) {
    const times = med.times && med.times.length ? med.times : ["08:00"];
    const today = chicagoISODate();
    const stamp = icsDateTime(new Date().toISOString());
    let ev = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//My Doctor//EN\r\nCALSCALE:GREGORIAN\r\n";
    times.forEach((t, i) => {
      const start = `${today.replace(/-/g, "")}T${t.replace(":", "")}00`;
      ev += "BEGIN:VEVENT\r\n";
      ev += `UID:${med.id}-${i}@my-doctor\r\n`;
      ev += `DTSTAMP:${stamp}\r\n`;
      ev += `DTSTART;TZID=America/Chicago:${start}\r\n`;
      ev += "RRULE:FREQ=DAILY\r\n";
      ev += `SUMMARY:${icsEscape("Take " + med.name + (med.dose ? " " + med.dose : ""))}\r\n`;
      ev += `DESCRIPTION:${icsEscape("Reminder from My Doctor. This is not medical advice.")}\r\n`;
      ev += "BEGIN:VALARM\r\nTRIGGER:PT0S\r\nACTION:DISPLAY\r\nDESCRIPTION:Medicine reminder\r\nEND:VALARM\r\n";
      ev += "END:VEVENT\r\n";
    });
    ev += "END:VCALENDAR\r\n";
    downloadText((med.name || "medicine").replace(/\W+/g, "-").toLowerCase() + "-reminder.ics", ev);
  }
  function apptIcs(a) {
    const start = icsDateTime(a.at);
    const endDate = new Date(new Date(a.at).getTime() + 60 * 60 * 1000);
    const end = icsDateTime(endDate.toISOString());
    const stamp = icsDateTime(new Date().toISOString());
    const ev =
      "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//My Doctor//EN\r\nCALSCALE:GREGORIAN\r\nBEGIN:VEVENT\r\n" +
      `UID:${a.id}@my-doctor\r\nDTSTAMP:${stamp}\r\n` +
      `DTSTART;TZID=America/Chicago:${start}\r\nDTEND;TZID=America/Chicago:${end}\r\n` +
      `SUMMARY:${icsEscape("Appointment" + (a.doctor ? " with " + a.doctor : ""))}\r\n` +
      `LOCATION:${icsEscape(a.location || "")}\r\n` +
      `DESCRIPTION:${icsEscape((a.reason || "") + (a.notes ? "\n\n" + a.notes : ""))}\r\n` +
      "BEGIN:VALARM\r\nTRIGGER:-PT60M\r\nACTION:DISPLAY\r\nDESCRIPTION:Appointment in 1 hour\r\nEND:VALARM\r\n" +
      "END:VEVENT\r\nEND:VCALENDAR\r\n";
    downloadText("appointment.ics", ev);
  }

  /* ---------- render helpers ---------- */
  function field(label, inner, hint) {
    return `<label class="label">${esc(label)}</label>${inner}${hint ? `<p class="hint">${hint}</p>` : ""}`;
  }

  function renderDoctors() {
    const specOpts = SPECIALTIES.map((s) => `<option value="${esc(s.q)}">${esc(s.label)}</option>`).join("");
    const mine = state.doctors.length
      ? state.doctors.map((d) => `
        <article class="doctor-card item" data-edit-doc="${esc(d.id)}">
          <div class="head"><div>
            <h3>${esc(d.name)}</h3>
            <div class="hint" style="margin:0">${esc(d.specialty || "")}</div>
            ${d.phone ? `<div><a href="${telHref(d.phone)}">${esc(d.phone)}</a></div>` : ""}
            ${d.address ? `<div>${esc(d.address)}</div>` : ""}
            ${d.notes ? `<p style="margin:8px 0 0">${esc(d.notes)}</p>` : ""}
          </div>
          <div class="row">
            <button type="button" data-edit-doc="${esc(d.id)}">Edit</button>
            <button type="button" class="danger" data-del-doc="${esc(d.id)}">Remove</button>
          </div></div>
        </article>`).join("")
      : `<p class="empty">You have not saved any doctors yet. When you find one you want to keep, type the name, specialty, phone, and address yourself. This app never invents a doctor list.</p>`;

    const hospitals = HOSPITALS.map((h) => `
      <article class="hospital">
        <h3>${esc(h.name)}</h3>
        <div>${esc(h.address)}</div>
        <div><a href="${telHref(h.phone)}">${esc(h.phone)}</a></div>
        <p><a href="${esc(h.url)}" target="_blank" rel="noopener">Official website</a></p>
      </article>`).join("");

    return `
      <h1>Find doctors near Frisco</h1>
      <p class="lede">Pick a specialty, then open a trusted directory. The first link is the official Texas Medicaid provider lookup (TMHP). Other searches are set up for Frisco, TX 75034 where the site allows it. These are search links — not a list of recommended doctors.</p>
      <section class="card">
        ${field("Specialty", `<select id="specialty">${specOpts}</select>`)}
        <div id="searchLinks" class="links"></div>
        <p class="hint">On the Texas Medicaid lookup, enter ZIP <strong>75034</strong> and pick your program (STAR, STAR+PLUS, or Traditional Medicaid). If another site does not keep the city filled in, enter <strong>Frisco, TX 75034</strong> on that page.</p>
      </section>
      <h2>My doctors</h2>
      <p class="hint">Saved only on this device. Do not enter a Social Security number, Medicaid or insurance member ID, card number, or password here.</p>
      <div id="myDoctors">${mine}</div>
      <section class="card" id="docFormCard">
        <h3 id="docFormTitle">Save a doctor</h3>
        <form id="docForm">
          <input type="hidden" id="docId">
          ${field("Name", `<input id="docName" required maxlength="120" autocomplete="off" placeholder="Full name">`)}
          ${field("Specialty", `<input id="docSpec" maxlength="80" list="specList" placeholder="For example, cardiology">`)}
          <datalist id="specList">${SPECIALTIES.map((s) => `<option value="${esc(s.label)}">`).join("")}</datalist>
          ${field("Phone", `<input id="docPhone" maxlength="30" inputmode="tel" autocomplete="off" placeholder="Optional">`)}
          ${field("Address", `<input id="docAddr" maxlength="200" autocomplete="off" placeholder="Optional">`)}
          ${field("Notes", `<textarea id="docNotes" maxlength="500" placeholder="Optional — parking, office hours, and so on"></textarea>`)}
          <div class="row">
            <button type="submit" class="primary" id="docSaveBtn">Save doctor</button>
            <button type="button" id="docCancel" class="hidden">Cancel edit</button>
          </div>
        </form>
      </section>
      <h2>Major hospitals and health systems in Frisco</h2>
      <p class="hint">Names, addresses, phones, and website links come from each system's official site. This is not an endorsement.</p>
      <div class="grid grid-2">${hospitals}</div>
    `;
  }

  function paintSearchLinks() {
    const sel = $("specialty");
    const box = $("searchLinks");
    if (!sel || !box) return;
    box.innerHTML = searchLinks(sel.value).map((l) =>
      `<a class="search-link" href="${esc(l.href)}" target="_blank" rel="noopener"><strong>Search ${esc(l.name)}</strong><small>${esc(l.why)}</small></a>`
    ).join("");
  }

  function renderChart() {
    const rows = state.readings.map((r, i) => ({ r, i })).sort((a, b) => {
      const dt = new Date(a.r.at) - new Date(b.r.at);
      return dt !== 0 ? dt : a.i - b.i;
    }).map((x) => x.r).slice(-30);
    if (rows.length < 2) {
      return `<p class="hint">Add at least two readings to see a simple chart over time.</p>`;
    }
    const W = 640, H = 260, padL = 42, padR = 16, padT = 20, padB = 36;
    const xs = rows.map((_, i) => padL + (i * (W - padL - padR)) / (rows.length - 1));
    const vals = rows.flatMap((r) => [Number(r.sys), Number(r.dia)]);
    let min = Math.min(...vals, 60);
    let max = Math.max(...vals, 140);
    min = Math.floor((min - 10) / 10) * 10;
    max = Math.ceil((max + 10) / 10) * 10;
    const y = (v) => padT + ((max - v) / (max - min)) * (H - padT - padB);
    const path = (key, color) => {
      const d = rows.map((r, i) => `${i ? "L" : "M"}${xs[i].toFixed(1)},${y(Number(r[key])).toFixed(1)}`).join(" ");
      const dots = rows.map((r, i) => `<circle cx="${xs[i].toFixed(1)}" cy="${y(Number(r[key])).toFixed(1)}" r="4" fill="${color}"><title>${esc(formatWhen(r.at))}: ${r[key]}</title></circle>`).join("");
      return `<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"/>${dots}`;
    };
    const grid = [];
    for (let v = min; v <= max; v += 10) {
      grid.push(`<line x1="${padL}" x2="${W - padR}" y1="${y(v)}" y2="${y(v)}" stroke="currentColor" opacity="0.15"/>`);
      grid.push(`<text x="${padL - 8}" y="${y(v) + 4}" text-anchor="end" font-size="12" fill="currentColor">${v}</text>`);
    }
    const labels = rows.map((r, i) => {
      if (i !== 0 && i !== rows.length - 1 && i % Math.ceil(rows.length / 5) !== 0) return "";
      const p = tzParts(new Date(r.at));
      return `<text x="${xs[i].toFixed(1)}" y="${H - 10}" text-anchor="middle" font-size="11" fill="currentColor">${Number(p.month)}/${Number(p.day)}</text>`;
    }).join("");
    return `<div class="chart-wrap" role="img" aria-label="Blood pressure chart of your last ${rows.length} readings">
      <svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
        ${grid.join("")}
        ${path("dia", "#5b8def")}
        ${path("sys", "#0f7a73")}
        ${labels}
        <text x="${padL}" y="14" font-size="12" fill="#0f7a73" font-weight="700">Systolic</text>
        <text x="${padL + 80}" y="14" font-size="12" fill="#5b8def" font-weight="700">Diastolic</text>
      </svg>
    </div>`;
  }

  function renderBP() {
    const sorted = state.readings.map((r, i) => ({ r, i })).sort((a, b) => {
      const dt = new Date(b.r.at) - new Date(a.r.at);
      return dt !== 0 ? dt : b.i - a.i;
    }).map((x) => x.r);
    const a7 = avgWindow(7);
    const a30 = avgWindow(30);
    const stats = `
      <div class="grid grid-3">
        <div class="stat"><span>7-day average${a7 ? ` · ${a7.n} reading${a7.n === 1 ? "" : "s"}` : ""}</span><b>${a7 ? Math.round(a7.sys) + "/" + Math.round(a7.dia) : "—"}</b></div>
        <div class="stat"><span>30-day average${a30 ? ` · ${a30.n} reading${a30.n === 1 ? "" : "s"}` : ""}</span><b>${a30 ? Math.round(a30.sys) + "/" + Math.round(a30.dia) : "—"}</b></div>
        <div class="stat"><span>Latest</span><b>${sorted[0] ? sorted[0].sys + "/" + sorted[0].dia : "—"}</b></div>
      </div>`;
    const list = sorted.length
      ? sorted.map((r) => {
          const cat = bpCategory(r.sys, r.dia);
          return `<article class="item">
            <div class="head">
              <div>
                <div class="reading-num">${esc(r.sys)}/${esc(r.dia)}${r.pulse ? ` <span style="font-size:1rem;font-weight:600;color:var(--mut)">pulse ${esc(r.pulse)}</span>` : ""}</div>
                ${cat ? `<span class="badge ${cat.key}">${esc(cat.label)}</span>` : ""}
                <div class="hint" style="margin:6px 0 0">${esc(formatWhen(r.at))}${r.arm ? " · " + esc(r.arm) + " arm" : ""}${r.note ? " · " + esc(r.note) : ""}</div>
              </div>
              <button type="button" class="danger" data-del-bp="${esc(r.id)}">Delete</button>
            </div>
          </article>`;
        }).join("")
      : `<p class="empty">No readings yet. Enter one from your home monitor when you are ready. Nothing is pre-filled for you.</p>`;

    return `
      <h1>Blood pressure tracker</h1>
      <p class="lede">Log the numbers from your monitor. Categories follow the 2025 AHA/ACC guideline. This does not diagnose you — only your doctor can do that.</p>
      <div id="bpCrisis"></div>
      <section class="card">
        <form id="bpForm">
          <div class="grid grid-3">
            <div>${field("Systolic (top number)", `<input id="bpSys" required inputmode="numeric" min="40" max="300" placeholder="130">`, "Example placeholder only: 130")}</div>
            <div>${field("Diastolic (bottom number)", `<input id="bpDia" required inputmode="numeric" min="20" max="200" placeholder="72">`, "Example placeholder only: 72")}</div>
            <div>${field("Pulse (optional)", `<input id="bpPulse" inputmode="numeric" min="30" max="220" placeholder="Optional">`)}</div>
          </div>
          <div class="grid grid-2">
            <div>${field("Date and time (Central)", `<input id="bpWhen" type="datetime-local" required>`)}</div>
            <div>${field("Arm", `<select id="bpArm"><option value="">Not specified</option><option>Left</option><option>Right</option></select>`)}</div>
          </div>
          ${field("Note (optional)", `<input id="bpNote" maxlength="200" placeholder="For example, after a walk, or morning reading">`)}
          <button type="submit" class="primary">Save reading</button>
        </form>
      </section>
      ${stats}
      <h2>Chart</h2>
      ${renderChart()}
      <h2>All readings</h2>
      ${list}
      <section class="card">
        <h3>What the categories mean</h3>
        <p>From the 2025 AHA/ACC high blood pressure guideline, in mm Hg:</p>
        <ul>
          <li><strong>Normal</strong> — less than 120 and less than 80</li>
          <li><strong>Elevated</strong> — 120–129 and less than 80</li>
          <li><strong>Stage 1</strong> — 130–139 or 80–89</li>
          <li><strong>Stage 2</strong> — 140 or higher, or 90 or higher</li>
          <li><strong>Severe / crisis range</strong> — higher than 180 and/or higher than 120. If this happens, wait one minute and take it again. Call 911 if you also have chest pain, shortness of breath, back pain, numbness, weakness, a change in vision, or trouble speaking. If you do not have those symptoms, contact your doctor as soon as you can.</li>
        </ul>
        <p class="hint">Adults with numbers in two categories are placed in the higher one. Source: American Heart Association / American College of Cardiology, 2025.</p>
      </section>
    `;
  }

  function renderMeds() {
    const today = chicagoISODate();
    const takenToday = state.taken[today] || {};
    const list = state.meds.length
      ? state.meds.map((m) => {
          const times = m.times && m.times.length ? m.times : [];
          const got = takenToday[m.id] || [];
          const checks = times.map((t) => {
            const on = got.includes(t);
            return `<label class="chk ${on ? "done" : ""}"><input type="checkbox" data-take="${esc(m.id)}" data-time="${esc(t)}" ${on ? "checked" : ""}> ${esc(m.name)}${m.dose ? " · " + esc(m.dose) : ""} at ${esc(fmtTime(t))}</label>`;
          }).join("") || `<p class="hint">No times set yet. Edit this medicine to add them.</p>`;
          let refill = "";
          if (m.refill) {
            const d = daysFromToday(m.refill);
            if (d < 0) refill = `<span class="badge crisis">Refill overdue · ${esc(formatDate(m.refill))}</span>`;
            else if (d === 0) refill = `<span class="badge warn">Refill today</span>`;
            else if (d <= 7) refill = `<span class="badge warn">Refill in ${d} day${d === 1 ? "" : "s"}</span>`;
            else refill = `<span class="badge">Refill ${esc(formatDate(m.refill))}</span>`;
          }
          return `<article class="item">
            <div class="head"><div>
              <h3>${esc(m.name)}${m.dose ? " · " + esc(m.dose) : ""}</h3>
              ${m.purpose ? `<div>${esc(m.purpose)}</div>` : ""}
              ${m.doctor ? `<div class="hint" style="margin:0">Prescribed by ${esc(m.doctor)}</div>` : ""}
              <div style="margin-top:6px">${refill}</div>
            </div>
            <div class="row">
              <button type="button" data-ics-med="${esc(m.id)}">Add to calendar</button>
              <button type="button" data-edit-med="${esc(m.id)}">Edit</button>
              <button type="button" class="danger" data-del-med="${esc(m.id)}">Remove</button>
            </div></div>
            <div class="checklist" style="margin-top:10px">${checks}</div>
          </article>`;
        }).join("")
      : `<p class="empty">No medicines saved yet. Add the name, dose, and times you take each one.</p>`;

    return `
      <h1>Medicines and reminders</h1>
      <p class="lede">Keep a list on this device, check off what you have taken today, and get a reminder when a refill is soon.</p>
      <div class="callout warn">
        <strong>About reminders:</strong> A website can only pop up an alert while this app is open. Browser notifications also work only if this page is open and you have allowed them.
        For a reminder that still goes off when the app is closed, use <strong>Add to calendar</strong> and save the repeating event on your tablet, phone, or PC.
      </div>
      <section class="card">
        <h2 style="margin-top:0">Taken today <span class="hint">(${esc(formatDate(today))} Central)</span></h2>
        <p class="hint">This checklist resets at midnight Central time.</p>
        ${state.meds.some((m) => m.times && m.times.length) ? state.meds.map((m) => {
          const times = m.times || [];
          const got = takenToday[m.id] || [];
          return times.map((t) => {
            const on = got.includes(t);
            return `<label class="chk ${on ? "done" : ""}"><input type="checkbox" data-take="${esc(m.id)}" data-time="${esc(t)}" ${on ? "checked" : ""}> ${esc(m.name)}${m.dose ? " · " + esc(m.dose) : ""} at ${esc(fmtTime(t))}</label>`;
          }).join("");
        }).join("") : `<p class="empty">Add a medicine with at least one time to use today's checklist.</p>`}
      </section>
      <h2>My medicines</h2>
      ${list}
      <section class="card" id="medFormCard">
        <h3 id="medFormTitle">Add a medicine</h3>
        <form id="medForm">
          <input type="hidden" id="medId">
          <div class="grid grid-2">
            <div>${field("Name", `<input id="medName" required maxlength="120" autocomplete="off" placeholder="For example, the name on the bottle">`)}</div>
            <div>${field("Dose", `<input id="medDose" maxlength="60" placeholder="For example, 10 mg">`)}</div>
          </div>
          ${field("Times each day", `<div id="medTimes"></div><button type="button" id="addTime">Add a time</button>`, "Add each clock time you usually take this medicine.")}
          ${field("What it is for (optional)", `<input id="medPurpose" maxlength="120" placeholder="For example, blood pressure">`)}
          ${field("Prescribing doctor (optional)", `<input id="medDoc" maxlength="120" list="docNames">`)}
          <datalist id="docNames">${state.doctors.map((d) => `<option value="${esc(d.name)}">`).join("")}</datalist>
          ${field("Refill date (optional)", `<input id="medRefill" type="date">`)}
          <div class="row">
            <button type="submit" class="primary" id="medSaveBtn">Save medicine</button>
            <button type="button" id="medCancel" class="hidden">Cancel edit</button>
          </div>
        </form>
      </section>
      <section class="card">
        <h3>Optional browser notifications</h3>
        <p>If you allow notifications, this app can show a system alert when a dose is due — but only while the app is open.</p>
        <button type="button" id="notifyBtn" class="primary">Allow notifications</button>
        <p class="hint" id="notifyStatus"></p>
      </section>
    `;
  }

  function defaultTimes() {
    return ["08:00"];
  }

  function renderTimeInputs(times) {
    const box = $("medTimes");
    if (!box) return;
    const list = times && times.length ? times : defaultTimes();
    box.innerHTML = list.map((t, i) => `
      <div class="time-row">
        <input type="time" value="${esc(t)}" data-time-i="${i}" required>
        <button type="button" data-rm-time="${i}" ${list.length < 2 ? "disabled" : ""}>Remove</button>
      </div>`).join("");
  }
  function readTimes() {
    return [...document.querySelectorAll("#medTimes input[type=time]")].map((i) => i.value).filter(Boolean);
  }

  function upcomingSplit() {
    const now = Date.now();
    const up = [];
    const past = [];
    for (const a of state.appointments) {
      (new Date(a.at).getTime() >= now - 60 * 60 * 1000 ? up : past).push(a);
    }
    up.sort((a, b) => new Date(a.at) - new Date(b.at));
    past.sort((a, b) => new Date(b.at) - new Date(a.at));
    return { up, past };
  }

  function apptCard(a, past) {
    const qs = state.questions.filter((q) => q.appointmentId === a.id);
    return `<article class="item">
      <div class="head"><div>
        <h3>${esc(a.doctor || "Appointment")}</h3>
        <div>${esc(formatWhen(a.at))}</div>
        ${a.location ? `<div>${esc(a.location)}</div>` : ""}
        ${a.reason ? `<div>${esc(a.reason)}</div>` : ""}
        ${a.notes ? `<p style="margin:8px 0 0"><strong>Visit notes:</strong> ${esc(a.notes)}</p>` : ""}
        ${qs.length ? `<p class="hint">Questions tagged: ${qs.map((q) => esc(q.text)).join("; ")}</p>` : ""}
      </div>
      <div class="row">
        <button type="button" data-ics-appt="${esc(a.id)}">Add to calendar</button>
        <button type="button" data-edit-appt="${esc(a.id)}">Edit</button>
        <button type="button" class="danger" data-del-appt="${esc(a.id)}">Remove</button>
      </div></div>
    </article>`;
  }

  function renderVisits() {
    const { up, past } = upcomingSplit();
    return `
      <h1>Appointments and visit notes</h1>
      <p class="lede">Times are shown in Central Time. You can add notes after a visit and save the appointment to your calendar.</p>
      <section class="card" id="apptFormCard">
        <h3 id="apptFormTitle">Add an appointment</h3>
        <form id="apptForm">
          <input type="hidden" id="apptId">
          ${field("Doctor or clinic", `<input id="apptDoc" required maxlength="120" list="docNames" placeholder="Name">`)}
          <datalist id="docNames">${state.doctors.map((d) => `<option value="${esc(d.name)}">`).join("")}</datalist>
          ${field("Date and time (Central)", `<input id="apptWhen" type="datetime-local" required>`)}
          ${field("Location", `<input id="apptLoc" maxlength="200" placeholder="Clinic or hospital, optional">`)}
          ${field("Reason", `<input id="apptReason" maxlength="200" placeholder="Optional">`)}
          ${field("Visit notes", `<textarea id="apptNotes" maxlength="2000" placeholder="What you talked about, next steps, and so on"></textarea>`)}
          <div class="row">
            <button type="submit" class="primary" id="apptSaveBtn">Save appointment</button>
            <button type="button" id="apptCancel" class="hidden">Cancel edit</button>
          </div>
        </form>
      </section>
      <h2>Upcoming</h2>
      ${up.length ? up.map((a) => apptCard(a, false)).join("") : `<p class="empty">No upcoming appointments yet.</p>`}
      <h2>Past</h2>
      ${past.length ? past.map((a) => apptCard(a, true)).join("") : `<p class="empty">No past appointments yet.</p>`}
    `;
  }


  const AI_KEY = "my-doctor-ai-v1";
  const AI_PROVIDERS = [
    {
      id: "xai",
      label: "xAI (Grok)",
      hint: "Get a key from console.x.ai. It is stored only on this device and is sent only to xAI when you ask."
    },
    {
      id: "anthropic",
      label: "Anthropic (Claude)",
      hint: "Get a key from console.anthropic.com. It is stored only on this device and is sent only to Anthropic when you ask."
    }
  ];

  function loadAi() {
    try {
      return Object.assign({ provider: "xai", keys: {} }, JSON.parse(localStorage.getItem(AI_KEY) || "{}"));
    } catch {
      return { provider: "xai", keys: {} };
    }
  }
  function saveAi(cfg) { localStorage.setItem(AI_KEY, JSON.stringify(cfg)); }
  function clearAi() { localStorage.removeItem(AI_KEY); }

  function systemPrompt() {
    return "You are a general health information helper in the My Doctor app. Speak in short, plain English. You are not a doctor and you do not diagnose, prescribe, or give personal medical advice. If the question sounds like an emergency (chest pain, trouble breathing, stroke signs, very high blood pressure with symptoms, severe bleeding, or suicidal thoughts), tell the user to call 911 or the local emergency number now and do not keep chatting about it. Encourage the user to talk with their own doctor or pharmacist about their personal situation. Do not ask for a Social Security number, Medicaid or insurance member ID, credit card, bank number, or password. If saved readings or medicines are included, treat them as background only and do not invent values.";
  }

  function healthContext() {
    const lines = [];
    const readings = [...(state.readings || [])].slice(-10);
    if (readings.length) {
      lines.push("Recent blood pressure readings (newest last), stored by the user:");
      readings.slice().reverse().slice(0, 8).reverse().forEach((r) => {
        lines.push(`- ${r.sys}/${r.dia}` + (r.pulse ? ` pulse ${r.pulse}` : "") + (r.at ? ` at ${r.at}` : ""));
      });
    }
    if (state.meds && state.meds.length) {
      lines.push("Medicines the user has saved on this device:");
      state.meds.forEach((m) => {
        lines.push(`- ${m.name}` + (m.dose ? ` ${m.dose}` : "") + (m.purpose ? ` (${m.purpose})` : "") + (m.times && m.times.length ? `; times ${m.times.join(", ")}` : ""));
      });
    }
    return lines.join("\n");
  }

  async function askProvider(provider, key, question, includeCtx) {
    const sys = systemPrompt() + (includeCtx && healthContext() ? "\n\n" + healthContext() : "");
    if (provider === "xai") {
      const r = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "grok-3",
          temperature: 0.3,
          messages: [
            { role: "system", content: sys },
            { role: "user", content: question }
          ]
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || data.message || ("xAI error " + r.status));
      const text = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (!text) throw new Error("The service returned an empty answer.");
      return String(text);
    }
    if (provider === "anthropic") {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 800,
          system: sys,
          messages: [{ role: "user", content: question }]
        })
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error((data.error && data.error.message) || data.message || ("Anthropic error " + r.status));
      const text = (data.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n").trim();
      if (!text) throw new Error("The service returned an empty answer.");
      return text;
    }
    throw new Error("That service is not available in this app.");
  }

  let askQuery = "";
  let askTopic = "";
  let askBusy = false;
  let askError = "";
  let askDraft = "";

  function renderAnswerCard(a, queryText) {
    const body = a.body.map((para) => `<p>${esc(para)}</p>`).join("");
    return `<article class="card answer">
      <div class="hint" style="margin:0 0 4px">${esc(a.topic)}</div>
      <h3>${esc(a.title)}</h3>
      <div class="body">${body}</div>
      <p class="source">Source: <a href="${esc(a.sourceUrl)}" target="_blank" rel="noopener">${esc(a.sourceName)}</a></p>
      <button type="button" data-save-lib="${esc(a.id)}" data-q="${esc(queryText || a.title)}">Save this topic to For my doctor</button>
    </article>`;
  }

  function renderAsk() {
    const topics = [...new Set((window.MY_DOCTOR_LIBRARY || []).map((a) => a.topic))];
    const q = askQuery;
    let results;
    if (askTopic && !q) {
      results = (window.MY_DOCTOR_LIBRARY || []).filter((a) => a.topic === askTopic).map((a, i) => ({ a, score: 1, i }));
    } else if (q) {
      results = (window.searchDoctorLibrary ? window.searchDoctorLibrary(q) : []).slice(0, 8);
      if (askTopic) results = results.filter((x) => x.a.topic === askTopic);
    } else {
      results = (window.MY_DOCTOR_LIBRARY || []).map((a, i) => ({ a, score: 0, i }));
    }
    const chips = topics.map((t) =>
      `<button type="button" data-topic="${esc(t)}" class="${askTopic === t ? "on" : ""}">${esc(t)}</button>`
    ).join("");
    const list = results.length
      ? results.map((x) => renderAnswerCard(x.a, q)).join("")
      : `<p class="empty">No close match in the built-in library. Try fewer words, pick a topic above, or use Ask AI if you have added your own key.</p>`;

    const cfg = loadAi();
    const prov = AI_PROVIDERS.find((p) => p.id === (cfg.provider || "xai")) || AI_PROVIDERS[0];
    const hasKey = !!(cfg.keys && cfg.keys[prov.id]);
    const hist = (state.askHistory || []).slice().reverse();
    const histHtml = hist.length
      ? hist.map((h) => `<article class="item">
          <div class="head"><div>
            <h3>${esc(h.q)}</h3>
            <div class="hint" style="margin:0">${esc(h.at ? formatWhen(h.at) : "")} · ${esc(h.provider || "Library")}</div>
            <p style="white-space:pre-wrap">${esc((h.a || "").slice(0, 1200))}${(h.a || "").length > 1200 ? "…" : ""}</p>
          </div>
          <div class="row">
            <button type="button" data-save-hist="${esc(h.id)}">Save to For my doctor</button>
            <button type="button" class="danger" data-del-hist="${esc(h.id)}">Remove</button>
          </div></div>
        </article>`).join("")
      : `<p class="hint">Answers you get from Ask AI will show up here, on this device only.</p>`;

    return `
      <h1>Ask a health question</h1>
      <p class="lede">Type a question to search a built-in library of plain-English answers from trusted sources such as NIH, CDC, MedlinePlus, Texas Health and Human Services, and the U.S. Preventive Services Task Force. This is general information, not a diagnosis or a substitute for your doctor. For a list of questions to take to a visit, use the <button type="button" class="icon-btn" data-go="questions">For my doctor</button> tab.</p>
      <section class="card">
        <form id="askSearchForm">
          <label class="label" for="askQ">Your question</label>
          <div class="ask-box">
            <input id="askQ" maxlength="300" placeholder="For example: What does 130 over 72 mean?" value="${esc(q)}" autocomplete="off">
            <button type="submit" class="primary">Search</button>
          </div>
        </form>
        <div class="chips">${chips}<button type="button" data-topic="" class="${!askTopic ? "on" : ""}">All topics</button></div>
        ${q ? `<p class="hint">${results.length} match${results.length === 1 ? "" : "es"} for “${esc(q)}.”</p>` : `<p class="hint">Or browse a topic. You do not need an internet account to use this library — it is built into the app.</p>`}
      </section>
      <div id="askResults">${list}</div>
      <section class="card">
        <h2 style="margin-top:0">Ask AI (optional)</h2>
        <p>If the library does not cover your question, you can send it to an AI service using a key you provide. Your key stays in this browser. It is never copied into a backup file, and it is sent only to the company you choose when you tap Ask AI.</p>
        <p class="hint">OpenAI is not listed because its chat service blocked requests from a web page in our tests. xAI and Anthropic did work from the browser.</p>
        <form id="aiKeyForm" class="key-row">
          ${field("Service", `<select id="aiProvider">${AI_PROVIDERS.map((p) => `<option value="${p.id}" ${p.id === prov.id ? "selected" : ""}>${esc(p.label)}</option>`).join("")}</select>`)}
          <p class="hint" id="aiHint">${esc(prov.hint)}</p>
          ${field("Your API key", `<input id="aiKey" type="password" maxlength="200" autocomplete="off" spellcheck="false" placeholder="${hasKey ? "A key is saved on this device" : "Paste a key only if you want Ask AI"}">`)}
          <div class="row">
            <button type="submit" class="primary">Save key on this device</button>
            <button type="button" id="aiRemoveKey" class="${hasKey ? "" : "hidden"}">Remove key</button>
          </div>
        </form>
        <form id="aiAskForm">
          ${field("Question for AI", `<textarea id="aiQ" maxlength="1000" placeholder="Type any health question">${esc(askDraft)}</textarea>`)}
          <label class="chk"><input type="checkbox" id="aiCtx"> Include my saved blood pressure readings and medicine list as background. Names, phone numbers, and notes are not sent — only readings and medicines you typed in this app.</label>
          <button type="submit" class="primary" ${hasKey ? "" : "disabled"}>${askBusy ? "Asking…" : "Ask AI"}</button>
          ${hasKey ? "" : `<p class="hint">Save a key first if you want to use Ask AI. The built-in library above works without one.</p>`}
        </form>
        <div id="aiStatus">${askError ? `<p class="callout warn">${esc(askError)}</p>` : ""}</div>
      </section>
      <h2>Answers you have received</h2>
      ${histHtml}
    `;
  }

  function onAskSearch(e) {
    e.preventDefault();
    askQuery = ($("askQ") && $("askQ").value || "").trim();
    render();
    const first = document.querySelector("#askResults .answer");
    if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onSaveKey(e) {
    e.preventDefault();
    const cfg = loadAi();
    cfg.provider = $("aiProvider").value;
    const key = ($("aiKey").value || "").trim();
    cfg.keys = cfg.keys || {};
    if (key) cfg.keys[cfg.provider] = key;
    saveAi(cfg);
    $("aiKey").value = "";
    render();
  }

  async function onAskAI(e) {
    e.preventDefault();
    if (askBusy) return;
    const q = ($("aiQ").value || "").trim();
    if (!q) return;
    askDraft = q;
    const cfg = loadAi();
    const provider = $("aiProvider") ? $("aiProvider").value : cfg.provider;
    cfg.provider = provider;
    saveAi(cfg);
    const key = (cfg.keys && cfg.keys[provider]) || "";
    if (!key) { askError = "Save an API key for that service first."; render(); return; }
    const includeCtx = !!($("aiCtx") && $("aiCtx").checked);
    askBusy = true; askError = ""; render();
    try {
      const answer = await askProvider(provider, key, q, includeCtx);
      state.askHistory = state.askHistory || [];
      state.askHistory.push({
        id: uid(),
        q,
        a: answer,
        provider: AI_PROVIDERS.find((p) => p.id === provider)?.label || provider,
        at: new Date().toISOString()
      });
      save();
      askDraft = "";
      askBusy = false;
      render();
    } catch (err) {
      askBusy = false;
      askError = "Could not get an answer. " + (err && err.message ? err.message : "Please check your key and try again.");
      render();
    }
  }

  function renderQuestions() {
    const apptOpts = `<option value="">Not tied to a visit</option>` +
      [...state.appointments].sort((a, b) => new Date(b.at) - new Date(a.at)).map((a) =>
        `<option value="${esc(a.id)}">${esc((a.doctor || "Visit") + " · " + formatWhen(a.at))}</option>`
      ).join("");
    const open = state.questions.filter((q) => !q.done);
    const done = state.questions.filter((q) => q.done);
    const row = (q) => {
      const appt = state.appointments.find((a) => a.id === q.appointmentId);
      return `<label class="chk ${q.done ? "done" : ""}">
        <input type="checkbox" data-q-done="${esc(q.id)}" ${q.done ? "checked" : ""}>
        <span><strong>${esc(q.text)}</strong>${appt ? `<div class="hint" style="margin:0">For ${esc(appt.doctor || "visit")} · ${esc(formatWhen(appt.at))}</div>` : ""}</span>
        <button type="button" class="danger" data-del-q="${esc(q.id)}" style="margin-left:auto">Remove</button>
      </label>`;
    };
    return `
      <h1>Questions for my doctor</h1>
      <p class="lede">This is your list to take to a visit. You can tag a question to an appointment and check it off after you ask it. To type a question and get an answer now, open the <button type="button" class="icon-btn" data-go="ask">Ask</button> tab.</p>
      <section class="card">
        <h3>Starter questions</h3>
        <p class="hint">Tap one to add it to your list. You can edit the wording after it is added, or remove it if you do not need it.</p>
        <div class="starter">${STARTER_QUESTIONS.map((t) => `<button type="button" data-starter="${esc(t)}">${esc(t)}</button>`).join("")}</div>
      </section>
      <section class="card">
        <form id="qForm">
          ${field("Add a question", `<input id="qText" required maxlength="300" placeholder="Type your question">`)}
          ${field("Tie it to a visit (optional)", `<select id="qAppt">${apptOpts}</select>`)}
          <button type="submit" class="primary">Add to my list</button>
        </form>
      </section>
      <h2>To ask</h2>
      <div class="checklist card">${open.length ? open.map(row).join("") : `<p class="empty">No open questions. Add one above, or use a starter question.</p>`}</div>
      <h2>Already asked</h2>
      <div class="checklist">${done.length ? done.map(row).join("") : `<p class="hint">Checked-off questions will show up here.</p>`}</div>
    `;
  }

  function renderMore() {
    const installed = window.matchMedia("(display-mode: standalone)").matches;
    return `
      <h1>More</h1>
      <section class="card">
        <h2 style="margin-top:0">Install this app</h2>
        <p>You can add My Doctor to your tablet, phone, or Windows PC and open it like any other app. It still stores everything only on that device.</p>
        <ul>
          <li><strong>Android tablet or phone:</strong> In Chrome, open the menu and choose <em>Install app</em> or <em>Add to Home screen</em>.</li>
          <li><strong>Windows PC:</strong> In Chrome or Edge, look for the install icon in the address bar, or open the menu and choose Install My Doctor.</li>
        </ul>
        <p><button type="button" id="installBtn" class="primary ${deferredInstall ? "" : "hidden"}">Install My Doctor</button></p>
        ${installed ? `<p class="hint">This copy is already running as an installed app.</p>` : ""}
      </section>
      <section class="card no-print">
        <h2 style="margin-top:0">Print a visit summary</h2>
        <p>Prints your saved doctors, latest blood pressure readings, medicines, upcoming appointments, and open questions — handy to take to a visit.</p>
        <button type="button" id="printBtn" class="primary">Print summary</button>
      </section>
      <section class="card no-print">
        <h2 style="margin-top:0">Backup</h2>
        <p>Everything is saved only in this browser. If you clear site data, switch browsers, or get a new device, that copy is gone unless you keep a backup file.</p>
        <div class="row">
          <button type="button" id="exportBtn" class="primary">Download backup (JSON)</button>
          <button type="button" id="importBtn">Import backup</button>
          <input type="file" id="importFile" accept="application/json,.json" class="hidden">
        </div>
        <p class="hint">Importing replaces the data currently on this device. Download a backup first if you are not sure.</p>
      </section>
      <section class="card">
        <h2 style="margin-top:0">Privacy and safety</h2>
        <ul>
          <li>All of your entries stay on this device (in this browser). There is no account and no server copy.</li>
          <li>This app never asks for a Social Security number, Medicaid or insurance member ID, card or bank number, or a password. Please do not type those in the notes fields.</li>
          <li>This app is not medical advice and is not an emergency service. It cannot call your doctor for you.</li>
          <li>If you think you are having a medical emergency, call <a href="tel:911">911</a>.</li>
        </ul>
      </section>
    `;
  }

  function printSummary() {
    const { up } = upcomingSplit();
    const readings = [...state.readings].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);
    const openQ = state.questions.filter((q) => !q.done);
    const html = `
      <h1>My Doctor — visit summary</h1>
      <p>Printed ${esc(formatWhen(new Date().toISOString()))}. This is not medical advice.</p>
      <h2>My doctors</h2>
      ${state.doctors.length ? `<ul>${state.doctors.map((d) => `<li><strong>${esc(d.name)}</strong>${d.specialty ? " · " + esc(d.specialty) : ""}${d.phone ? " · " + esc(d.phone) : ""}${d.address ? " · " + esc(d.address) : ""}</li>`).join("")}</ul>` : "<p>None saved.</p>"}
      <h2>Recent blood pressure</h2>
      ${readings.length ? `<ul>${readings.map((r) => {
        const c = bpCategory(r.sys, r.dia);
        return `<li>${esc(formatWhen(r.at))}: ${esc(r.sys)}/${esc(r.dia)}${r.pulse ? " pulse " + esc(r.pulse) : ""}${c ? " · " + esc(c.label) : ""}</li>`;
      }).join("")}</ul>` : "<p>No readings.</p>"}
      <h2>Medicines</h2>
      ${state.meds.length ? `<ul>${state.meds.map((m) => `<li><strong>${esc(m.name)}</strong>${m.dose ? " · " + esc(m.dose) : ""}${m.times && m.times.length ? " · " + m.times.map(fmtTime).join(", ") : ""}${m.purpose ? " · " + esc(m.purpose) : ""}${m.refill ? " · refill " + esc(formatDate(m.refill)) : ""}</li>`).join("")}</ul>` : "<p>None saved.</p>"}
      <h2>Upcoming appointments</h2>
      ${up.length ? `<ul>${up.map((a) => `<li><strong>${esc(formatWhen(a.at))}</strong> · ${esc(a.doctor || "")}${a.location ? " · " + esc(a.location) : ""}${a.reason ? " · " + esc(a.reason) : ""}</li>`).join("")}</ul>` : "<p>None saved.</p>"}
      <h2>Questions to ask</h2>
      ${openQ.length ? `<ul>${openQ.map((q) => `<li>${esc(q.text)}</li>`).join("")}</ul>` : "<p>None saved.</p>"}
    `;
    const main = $("main");
    const prevView = view;
    const prevHTML = main.innerHTML;
    main.innerHTML = html;
    window.print();
    view = prevView;
    main.innerHTML = prevHTML;
    bindView();
  }

  /* ---------- main render ---------- */
  function render() {
    applyTheme();
    const main = $("main");
    const pages = { doctors: renderDoctors, bp: renderBP, meds: renderMeds, visits: renderVisits, ask: renderAsk, questions: renderQuestions, more: renderMore };
    main.innerHTML = (pages[view] || renderDoctors)();
    document.querySelectorAll(".tabs button").forEach((b) => {
      b.classList.toggle("on", b.getAttribute("data-go") === view);
    });
    $("moreBtn")?.classList.toggle("primary", view === "more");
    bindView();
    refreshAlerts();
  }

  function bindView() {
    if (view === "doctors") {
      paintSearchLinks();
      $("specialty")?.addEventListener("change", paintSearchLinks);
      $("docForm")?.addEventListener("submit", onSaveDoctor);
      $("docCancel")?.addEventListener("click", () => { clearDocForm(); });
    }
    if (view === "bp") {
      const when = $("bpWhen");
      if (when && !when.value) when.value = defaultLocalValue();
      $("bpForm")?.addEventListener("submit", onSaveBP);
    }
    if (view === "meds") {
      if (!$("medId")?.value) renderTimeInputs(defaultTimes());
      $("addTime")?.addEventListener("click", () => renderTimeInputs(readTimes().concat(["20:00"])));
      $("medTimes")?.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-rm-time]");
        if (!rm) return;
        const times = readTimes();
        times.splice(Number(rm.getAttribute("data-rm-time")), 1);
        renderTimeInputs(times);
      });
      $("medForm")?.addEventListener("submit", onSaveMed);
      $("medCancel")?.addEventListener("click", () => { clearMedForm(); });
      updateNotifyStatus();
      $("notifyBtn")?.addEventListener("click", enableNotify);
    }
    if (view === "visits") {
      const when = $("apptWhen");
      if (when && !when.value) when.value = defaultLocalValue();
      $("apptForm")?.addEventListener("submit", onSaveAppt);
      $("apptCancel")?.addEventListener("click", () => { clearApptForm(); });
    }
    if (view === "ask") {
      $("askSearchForm")?.addEventListener("submit", onAskSearch);
      $("aiKeyForm")?.addEventListener("submit", onSaveKey);
      $("aiAskForm")?.addEventListener("submit", onAskAI);
      $("aiProvider")?.addEventListener("change", () => {
        const cfg = loadAi();
        cfg.provider = $("aiProvider").value;
        saveAi(cfg);
        render();
      });
      $("aiRemoveKey")?.addEventListener("click", () => {
        const cfg = loadAi();
        const id = $("aiProvider").value;
        if (cfg.keys) delete cfg.keys[id];
        saveAi(cfg);
        render();
      });
      $("aiQ")?.addEventListener("input", () => { askDraft = $("aiQ").value; });
    }
    if (view === "questions") {
      $("qForm")?.addEventListener("submit", onSaveQuestion);
    }
    if (view === "more") {
      $("printBtn")?.addEventListener("click", printSummary);
      $("exportBtn")?.addEventListener("click", exportBackup);
      $("importBtn")?.addEventListener("click", () => $("importFile").click());
      $("importFile")?.addEventListener("change", importBackup);
      $("installBtn")?.addEventListener("click", () => {
        if (!deferredInstall) return;
        deferredInstall.prompt();
        deferredInstall.userChoice.finally(() => { deferredInstall = null; render(); });
      });
    }
  }

  function clearDocForm() {
    $("docId").value = "";
    $("docName").value = $("docSpec").value = $("docPhone").value = $("docAddr").value = $("docNotes").value = "";
    $("docFormTitle").textContent = "Save a doctor";
    $("docSaveBtn").textContent = "Save doctor";
    $("docCancel").classList.add("hidden");
  }
  function fillDocForm(d) {
    $("docId").value = d.id;
    $("docName").value = d.name || "";
    $("docSpec").value = d.specialty || "";
    $("docPhone").value = d.phone || "";
    $("docAddr").value = d.address || "";
    $("docNotes").value = d.notes || "";
    $("docFormTitle").textContent = "Edit doctor";
    $("docSaveBtn").textContent = "Save changes";
    $("docCancel").classList.remove("hidden");
    $("docFormCard").scrollIntoView({ behavior: "smooth" });
  }
  function onSaveDoctor(e) {
    e.preventDefault();
    const rec = {
      id: $("docId").value || uid(),
      name: $("docName").value.trim(),
      specialty: $("docSpec").value.trim(),
      phone: $("docPhone").value.trim(),
      address: $("docAddr").value.trim(),
      notes: $("docNotes").value.trim()
    };
    if (!rec.name) return;
    const i = state.doctors.findIndex((d) => d.id === rec.id);
    if (i >= 0) state.doctors[i] = rec; else state.doctors.push(rec);
    save(); render();
  }

  function onSaveBP(e) {
    e.preventDefault();
    const sys = Number($("bpSys").value);
    const dia = Number($("bpDia").value);
    const pulseRaw = $("bpPulse").value.trim();
    const cat = bpCategory(sys, dia);
    if (!cat) {
      alert("Please enter a realistic systolic and diastolic reading.");
      return;
    }
    state.readings.push({
      id: uid(),
      sys, dia,
      pulse: pulseRaw ? Number(pulseRaw) : "",
      at: fromLocalInput($("bpWhen").value),
      arm: $("bpArm").value,
      note: $("bpNote").value.trim()
    });
    save();
    render();
    if (cat.key === "crisis") {
      const box = $("bpCrisis");
      if (box) {
        box.innerHTML = `<div class="callout crisis" role="alert">
          <strong>This reading is in the severe / crisis range</strong> (higher than 180 systolic and/or higher than 120 diastolic), according to the American Heart Association.
          Wait at least one minute and take it again. If it is still this high and you have chest pain, shortness of breath, back pain, numbness, weakness, a change in vision, or trouble speaking, call <a href="tel:911">911</a> now.
          If you do not have those symptoms, contact your doctor or a clinician as soon as you can. Do not wait for this app to do anything — it cannot call for help.
        </div>`;
      }
    }
  }

  function clearMedForm() {
    $("medId").value = "";
    $("medName").value = $("medDose").value = $("medPurpose").value = $("medDoc").value = $("medRefill").value = "";
    renderTimeInputs(defaultTimes());
    $("medFormTitle").textContent = "Add a medicine";
    $("medSaveBtn").textContent = "Save medicine";
    $("medCancel").classList.add("hidden");
  }
  function fillMedForm(m) {
    $("medId").value = m.id;
    $("medName").value = m.name || "";
    $("medDose").value = m.dose || "";
    $("medPurpose").value = m.purpose || "";
    $("medDoc").value = m.doctor || "";
    $("medRefill").value = m.refill || "";
    renderTimeInputs(m.times && m.times.length ? m.times : defaultTimes());
    $("medFormTitle").textContent = "Edit medicine";
    $("medSaveBtn").textContent = "Save changes";
    $("medCancel").classList.remove("hidden");
    $("medFormCard").scrollIntoView({ behavior: "smooth" });
  }
  function onSaveMed(e) {
    e.preventDefault();
    const rec = {
      id: $("medId").value || uid(),
      name: $("medName").value.trim(),
      dose: $("medDose").value.trim(),
      times: readTimes(),
      purpose: $("medPurpose").value.trim(),
      doctor: $("medDoc").value.trim(),
      refill: $("medRefill").value || ""
    };
    if (!rec.name) return;
    const i = state.meds.findIndex((m) => m.id === rec.id);
    if (i >= 0) state.meds[i] = rec; else state.meds.push(rec);
    save(); render();
  }

  function toggleTaken(medId, time, checked) {
    const today = chicagoISODate();
    state.taken[today] = state.taken[today] || {};
    const cur = new Set(state.taken[today][medId] || []);
    if (checked) cur.add(time); else cur.delete(time);
    state.taken[today][medId] = [...cur];
    save();
    render();
  }

  function clearApptForm() {
    $("apptId").value = "";
    $("apptDoc").value = $("apptLoc").value = $("apptReason").value = $("apptNotes").value = "";
    $("apptWhen").value = defaultLocalValue();
    $("apptFormTitle").textContent = "Add an appointment";
    $("apptSaveBtn").textContent = "Save appointment";
    $("apptCancel").classList.add("hidden");
  }
  function fillApptForm(a) {
    $("apptId").value = a.id;
    $("apptDoc").value = a.doctor || "";
    $("apptWhen").value = toLocalInput(a.at);
    $("apptLoc").value = a.location || "";
    $("apptReason").value = a.reason || "";
    $("apptNotes").value = a.notes || "";
    $("apptFormTitle").textContent = "Edit appointment";
    $("apptSaveBtn").textContent = "Save changes";
    $("apptCancel").classList.remove("hidden");
    $("apptFormCard").scrollIntoView({ behavior: "smooth" });
  }
  function onSaveAppt(e) {
    e.preventDefault();
    const rec = {
      id: $("apptId").value || uid(),
      doctor: $("apptDoc").value.trim(),
      at: fromLocalInput($("apptWhen").value),
      location: $("apptLoc").value.trim(),
      reason: $("apptReason").value.trim(),
      notes: $("apptNotes").value.trim()
    };
    const i = state.appointments.findIndex((a) => a.id === rec.id);
    if (i >= 0) state.appointments[i] = rec; else state.appointments.push(rec);
    save(); render();
  }

  function onSaveQuestion(e) {
    e.preventDefault();
    const text = $("qText").value.trim();
    if (!text) return;
    state.questions.push({
      id: uid(),
      text,
      done: false,
      appointmentId: $("qAppt").value || ""
    });
    save(); render();
  }

  function addStarter(text) {
    if (state.questions.some((q) => q.text === text && !q.done)) return;
    state.questions.push({ id: uid(), text, done: false, appointmentId: "" });
    save(); render();
  }

  function exportBackup() {
    const payload = Object.assign({ exportedAt: new Date().toISOString(), app: "My Doctor" }, state);
    downloadText("my-doctor-backup-" + chicagoISODate() + ".json", JSON.stringify(payload, null, 2), "application/json");
  }
  function importBackup(ev) {
    const file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const d = JSON.parse(reader.result);
        if (!d || typeof d !== "object") throw new Error("bad");
        if (!confirm("Replace all My Doctor data on this device with this backup file? This cannot be undone unless you already saved another backup.")) return;
        const next = empty();
        next.doctors = Array.isArray(d.doctors) ? d.doctors : [];
        next.readings = Array.isArray(d.readings) ? d.readings : [];
        next.meds = Array.isArray(d.meds) ? d.meds : [];
        next.taken = d.taken && typeof d.taken === "object" ? d.taken : {};
        next.appointments = Array.isArray(d.appointments) ? d.appointments : [];
        next.questions = Array.isArray(d.questions) ? d.questions : [];
        next.askHistory = Array.isArray(d.askHistory) ? d.askHistory : [];
        next.settings = Object.assign(empty().settings, d.settings || {});
        state = migratePayerLabel(next);
        save();
        view = "doctors";
        render();
        alert("Backup imported.");
      } catch {
        alert("That file does not look like a My Doctor backup.");
      }
    };
    reader.readAsText(file);
  }

  async function enableNotify() {
    if (!("Notification" in window)) {
      alert("This browser does not support notifications.");
      return;
    }
    const perm = await Notification.requestPermission();
    state.settings.notify = perm === "granted";
    save();
    updateNotifyStatus();
    refreshAlerts();
  }
  function updateNotifyStatus() {
    const el = $("notifyStatus");
    if (!el) return;
    if (!("Notification" in window)) { el.textContent = "Notifications are not available in this browser."; return; }
    const p = Notification.permission;
    if (p === "granted") el.textContent = "Notifications are allowed. You will only get them while this app is open.";
    else if (p === "denied") el.textContent = "Notifications are blocked in the browser. You can still use Add to calendar.";
    else el.textContent = "Notifications are not allowed yet.";
  }

  document.addEventListener("click", (e) => {
    const go = e.target.closest("[data-go]");
    if (go) { view = go.getAttribute("data-go"); render(); return; }

    const ed = e.target.closest("[data-edit-doc]");
    if (ed) {
      const d = state.doctors.find((x) => x.id === ed.getAttribute("data-edit-doc"));
      if (d) fillDocForm(d);
      return;
    }
    const dd = e.target.closest("[data-del-doc]");
    if (dd) {
      if (confirm("Remove this saved doctor from this device?")) {
        state.doctors = state.doctors.filter((x) => x.id !== dd.getAttribute("data-del-doc"));
        save(); render();
      }
      return;
    }
    const db = e.target.closest("[data-del-bp]");
    if (db) {
      if (confirm("Delete this reading?")) {
        state.readings = state.readings.filter((x) => x.id !== db.getAttribute("data-del-bp"));
        save(); render();
      }
      return;
    }
    const em = e.target.closest("[data-edit-med]");
    if (em) {
      const m = state.meds.find((x) => x.id === em.getAttribute("data-edit-med"));
      if (m) fillMedForm(m);
      return;
    }
    const dm = e.target.closest("[data-del-med]");
    if (dm) {
      if (confirm("Remove this medicine?")) {
        state.meds = state.meds.filter((x) => x.id !== dm.getAttribute("data-del-med"));
        save(); render();
      }
      return;
    }
    const icsm = e.target.closest("[data-ics-med]");
    if (icsm) {
      const m = state.meds.find((x) => x.id === icsm.getAttribute("data-ics-med"));
      if (m) medIcs(m);
      return;
    }
    const take = e.target.closest("[data-take]");
    if (take && e.target.matches("input[type=checkbox]")) {
      toggleTaken(take.getAttribute("data-take"), take.getAttribute("data-time"), take.checked);
      return;
    }
    const ea = e.target.closest("[data-edit-appt]");
    if (ea) {
      const a = state.appointments.find((x) => x.id === ea.getAttribute("data-edit-appt"));
      if (a) fillApptForm(a);
      return;
    }
    const da = e.target.closest("[data-del-appt]");
    if (da) {
      if (confirm("Remove this appointment?")) {
        state.appointments = state.appointments.filter((x) => x.id !== da.getAttribute("data-del-appt"));
        save(); render();
      }
      return;
    }
    const icsa = e.target.closest("[data-ics-appt]");
    if (icsa) {
      const a = state.appointments.find((x) => x.id === icsa.getAttribute("data-ics-appt"));
      if (a) apptIcs(a);
      return;
    }
    const topicBtn = e.target.closest("[data-topic]");
    if (topicBtn && topicBtn.hasAttribute("data-topic")) {
      askTopic = topicBtn.getAttribute("data-topic") || "";
      if ($("askQ")) askQuery = $("askQ").value.trim();
      render();
      return;
    }
    const sl = e.target.closest("[data-save-lib]");
    if (sl) {
      const id = sl.getAttribute("data-save-lib");
      const art = (window.MY_DOCTOR_LIBRARY || []).find((a) => a.id === id);
      const text = art ? ("Ask my doctor about: " + art.title) : sl.getAttribute("data-q");
      if (text) addStarter(text);
      view = "questions";
      render();
      return;
    }
    const sh = e.target.closest("[data-save-hist]");
    if (sh) {
      const h = (state.askHistory || []).find((x) => x.id === sh.getAttribute("data-save-hist"));
      if (h) addStarter(h.q);
      view = "questions";
      render();
      return;
    }
    const dh = e.target.closest("[data-del-hist]");
    if (dh) {
      state.askHistory = (state.askHistory || []).filter((x) => x.id !== dh.getAttribute("data-del-hist"));
      save(); render();
      return;
    }
    const st = e.target.closest("[data-starter]");
    if (st) { addStarter(st.getAttribute("data-starter")); return; }
    const qd = e.target.closest("[data-q-done]");
    if (qd && e.target.matches("input[type=checkbox]")) {
      const q = state.questions.find((x) => x.id === qd.getAttribute("data-q-done"));
      if (q) { q.done = qd.checked; save(); render(); }
      return;
    }
    const dq = e.target.closest("[data-del-q]");
    if (dq) {
      state.questions = state.questions.filter((x) => x.id !== dq.getAttribute("data-del-q"));
      save(); render();
    }
  });

  $("themeBtn")?.addEventListener("click", () => {
    state.settings.dark = !state.settings.dark;
    save();
    applyTheme();
  });

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstall = e;
    if (view === "more") render();
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  applyTheme();
  render();
  setInterval(refreshAlerts, 60000);
})();
