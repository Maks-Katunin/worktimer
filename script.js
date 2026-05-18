function timeToMinutes(time) {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function roundToQuarter(hours) {
  return Math.round(hours * 4) / 4;
}

/* =========================
   DATA
========================= */

let entries = JSON.parse(localStorage.getItem("entries") || "[]");

function saveEntries() {
  localStorage.setItem("entries", JSON.stringify(entries));
}

/* =========================
   PAYROLL CALENDAR (FIXED)
   Based on your payslip:
   Week 1 = 22 March 2026
========================= */

function getPayrollStart() {
  const start = new Date(2026, 2, 22); // 22 March 2026
  start.setHours(0, 0, 0, 0);
  return start;
}

function getWeekNumber(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);

  const start = getPayrollStart();

  const diffDays = Math.floor(
    (d - start) / (1000 * 60 * 60 * 24)
  );

  if (diffDays < 0) return 1;

  return Math.floor(diffDays / 7) + 1;
}

/* =========================
   WEEK RANGE (PAYSLIP STYLE)
========================= */

function getWeekRange(weekNumber) {
  const start = getPayrollStart();

  const weekStart = new Date(start);
  weekStart.setDate(start.getDate() + (weekNumber - 1) * 7);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return { start: weekStart, end: weekEnd };
}

function formatDate(date) {
  return date.toLocaleDateString("en-GB");
}

/* =========================
   CALCULATION (BREAK LOGIC FIXED)
========================= */

function calculate() {
  const dateValue = document.getElementById("workDate").value;
  const startVal = document.getElementById("start").value;
  const finishVal = document.getElementById("finish").value;

  if (!dateValue || !startVal || !finishVal) {
    alert("Fill all fields");
    return;
  }

  const start = timeToMinutes(startVal);
  const finish = timeToMinutes(finishVal);

  if (finish <= start) {
    alert("Finish must be after start");
    return;
  }

  const b1 = Number(document.getElementById("b1").value);
  const lunch = Number(document.getElementById("lunch").value);
  const b2 = Number(document.getElementById("b2").value);

  // break thresholds
  const t1 = timeToMinutes("10:00");
  const t2 = timeToMinutes("12:30");
  const t3 = timeToMinutes("15:00");

  let breakMin = 0;

  if (finish > t1) breakMin += b1;
  if (finish > t2) breakMin += lunch;
  if (finish > t3) breakMin += b2;

  const totalMinutes = finish - start - breakMin;
  const hours = roundToQuarter(totalMinutes / 60);

  document.getElementById("result").style.display = "block";
  document.getElementById("result").innerText =
    "Today: " + hours.toFixed(2) + " h";

  const entry = {
    date: dateValue,
    start: startVal,
    finish: finishVal,
    b1,
    lunch,
    b2,
    hours
  };

  const index = entries.findIndex(e => e.date === dateValue);

  if (index >= 0) {
    entries[index] = entry;
  } else {
    entries.push(entry);
  }

  entries.sort((a, b) => b.date.localeCompare(a.date));

  saveEntries();
  updateJournal();
  updateWeek();
}

/* =========================
   WEEK SUMMARY (TOP PANEL)
========================= */

function updateWeek() {
  const selectedDate =
    document.getElementById("workDate").value
      ? new Date(document.getElementById("workDate").value)
      : new Date();

  const weekNumber = getWeekNumber(selectedDate);
  const range = getWeekRange(weekNumber);

  document.getElementById("weekNumber").innerText =
    `${weekNumber} (${formatDate(range.start)} - ${formatDate(range.end)})`;

  const total = entries
    .filter(e => getWeekNumber(new Date(e.date)) === weekNumber)
    .reduce((sum, e) => sum + e.hours, 0);

  document.getElementById("week").innerText =
    total.toFixed(2);
}

/* =========================
   EDIT / DELETE
========================= */

function editEntry(date) {
  const entry = entries.find(e => e.date === date);
  if (!entry) return;

  document.getElementById("workDate").value = entry.date;
  document.getElementById("start").value = entry.start;
  document.getElementById("finish").value = entry.finish;
  document.getElementById("b1").value = entry.b1;
  document.getElementById("lunch").value = entry.lunch;
  document.getElementById("b2").value = entry.b2;

  updateWeek();

  window.scrollTo({ top: 0, behavior: "smooth" });
}

function deleteEntry(date) {
  if (!confirm("Delete entry?")) return;

  entries = entries.filter(e => e.date !== date);

  saveEntries();
  updateJournal();
  updateWeek();
}

/* =========================
   JOURNAL
========================= */

function updateJournal() {
  const journal = document.getElementById("journal");
  journal.innerHTML = "";

  if (entries.length === 0) {
    journal.innerHTML = "<p>No entries</p>";
    return;
  }

  const groups = {};

  entries.forEach(e => {
    const w = getWeekNumber(new Date(e.date));
    if (!groups[w]) groups[w] = [];
    groups[w].push(e);
  });

  const weeks = Object.keys(groups)
    .map(Number)
    .sort((a, b) => b - a);

  weeks.forEach(w => {
    const list = groups[w];

    const total = list.reduce((s, e) => s + e.hours, 0);
    const range = getWeekRange(w);

    const header = document.createElement("h4");
    header.innerText =
      `Week ${w} (${formatDate(range.start)} - ${formatDate(range.end)}) — ${total.toFixed(2)} h`;

    journal.appendChild(header);

    list
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach(e => {
        const row = document.createElement("div");
        row.className = "entry";

        const info = document.createElement("div");
        info.innerHTML = `
          <strong>${e.date}</strong><br>
          ${e.start} - ${e.finish}<br>
          ${e.hours.toFixed(2)} h
        `;

        const actions = document.createElement("div");
        actions.style.display = "flex";
        actions.style.flexDirection = "column";
        actions.style.gap = "5px";

        const edit = document.createElement("button");
        edit.textContent = "✏️";
        edit.onclick = () => editEntry(e.date);

        const del = document.createElement("button");
        del.textContent = "🗑️";
        del.onclick = () => deleteEntry(e.date);

        actions.appendChild(edit);
        actions.appendChild(del);

        row.appendChild(info);
        row.appendChild(actions);

        journal.appendChild(row);
      });
  });
}

/* =========================
   INIT
========================= */

document.getElementById("workDate").value =
  new Date().toISOString().split("T")[0];

updateJournal();
updateWeek();
