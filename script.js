// ======= CONFIG =======
// If your file name is different, update here:
const DEFAULT_FILE = "Student India 64913.xlsx"; // or "students.csv"
// ======================

let RAW = [];        // full dataset (array of objects)
let FILTERED = [];   // filtered dataset
let DT = null;       // DataTable instance
let charts = {};     // Chart.js instances

// Helpers
const by = (id) => document.getElementById(id);
const safe = (v) => (v === undefined || v === null ? "" : String(v).trim());

// Parse DOB as dd-MMM-yy or similar and return age (approx.)
function computeAge(dobStr) {
  if (!dobStr) return null;
  let d = null;

  // Try SheetJS date (Excel serial) or JS Date parse
  if (typeof dobStr === "number") {
    // Excel serial date support
    const excelEpoch = new Date(Date.UTC(1899, 11, 30));
    d = new Date(excelEpoch.getTime() + dobStr * 86400000);
  } else {
    // Common formats from your sheet like "13-Jan-98"
    const parts = safe(dobStr).replace(/[^0-9A-Za-z-\/ ]/g,"").trim();
    const try1 = Date.parse(parts);
    if (!isNaN(try1)) d = new Date(try1);
  }
  if (!d || isNaN(d.getTime())) return null;

  const diff = Date.now() - d.getTime();
  const age = Math.floor(diff / (365.25 * 24 * 3600 * 1000));
  return (age >= 0 && age <= 100) ? age : null;
}

function uniqueSorted(arr) {
  return [...new Set(arr.filter(Boolean).map(x => safe(x)))].sort((a,b)=>a.localeCompare(b));
}

function topNCounts(arr, n=10) {
  const map = new Map();
  arr.forEach(v => {
    const k = safe(v);
    if (!k) return;
    map.set(k, (map.get(k) || 0) + 1);
  });
  const sorted = [...map.entries()].sort((a,b)=>b[1]-a[1]);
  return sorted.slice(0, n);
}

// Build row object in a consistent shape
function normalizeRow(r) {
  return {
    name: safe(r.name),
    gender: safe(r.gender),
    cat: safe(r.cat),
    board: safe(r.board),
    medium: safe(r.medium),
    city: safe(r.city),
    district: safe(r.district),
    state: safe(r.state),
    dob: safe(r.dob)
  };
}

// ---------- Data Loading ----------
async function autoLoad() {
  // Try to fetch the default file if served over a local server
  try {
    const res = await fetch(DEFAULT_FILE);
    if (!res.ok) throw new Error("not found");
    const buf = await res.arrayBuffer();
    if (DEFAULT_FILE.toLowerCase().endsWith(".csv")) {
      const text = new TextDecoder().decode(new Uint8Array(buf));
      const parsed = Papa.parse(text, { header: true, dynamicTyping: true });
      RAW = parsed.data.map(normalizeRow).filter(r => r.name);
      onDataReady();
    } else {
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: true });
      RAW = rows.map(normalizeRow).filter(r => r.name);
      onDataReady();
    }
  } catch {
    console.info("Auto-load skipped. Use the file picker.");
  }
}

function handleFileInput(file) {
  const reader = new FileReader();
  if (file.name.toLowerCase().endsWith(".csv")) {
    reader.onload = (e) => {
      const parsed = Papa.parse(e.target.result, { header: true, dynamicTyping: true });
      RAW = parsed.data.map(normalizeRow).filter(r => r.name);
      onDataReady();
    };
    reader.readAsText(file);
  } else {
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { raw: true });
      RAW = rows.map(normalizeRow).filter(r => r.name);
      onDataReady();
    };
    reader.readAsArrayBuffer(file);
  }
}

// ---------- Build UI ----------
function populateFilters(data) {
  const states = uniqueSorted(data.map(r => r.state));
  const boards = uniqueSorted(data.map(r => r.board));
  const cats = uniqueSorted(data.map(r => r.cat));

  const stateSel = by("stateFilter");
  const boardSel = by("boardFilter");
  const catSel = by("catFilter");

  [stateSel, boardSel, catSel].forEach(sel => {
    // keep first option
    sel.length = 1;
  });

  states.forEach(s => stateSel.add(new Option(s, s)));
  boards.forEach(s => boardSel.add(new Option(s, s)));
  cats.forEach(s => catSel.add(new Option(s, s)));
}

function applyFilters() {
  const state = by("stateFilter").value;
  const board = by("boardFilter").value;
  const gender = by("genderFilter").value;
  const cat = by("catFilter").value;
  const q = by("searchBox").value.toLowerCase();

  FILTERED = RAW.filter(r => {
    if (state && r.state !== state) return false;
    if (board && r.board !== board) return false;
    if (gender && r.gender !== gender) return false;
    if (cat && r.cat !== cat) return false;
    if (q) {
      const hay = `${r.name} ${r.city} ${r.district} ${r.state}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  updateKPIs(FILTERED);
  updateCharts(FILTERED);
  updateTable(FILTERED);
}

function updateKPIs(data) {
  const total = data.length;
  const females = data.filter(r => r.gender === "F").length;
  const femalePct = total ? Math.round((females/total)*100) : 0;
  const states = uniqueSorted(data.map(r => r.state)).length;
  const boards = uniqueSorted(data.map(r => r.board)).length;
  by("kpiTotal").textContent = total.toLocaleString();
  by("kpiFemale").textContent = femalePct + "%";
  by("kpiStates").textContent = states;
  by("kpiBoards").textContent = boards;
}

function chartify(id, cfg) {
  if (charts[id]) charts[id].destroy();
  charts[id] = new Chart(by(id), cfg);
}

function updateCharts(data) {
  // Gender
  const gCounts = topNCounts(data.map(r => r.gender), 5);
  chartify("genderChart", {
    type: "pie",
    data: {
      labels: gCounts.map(([k]) => k || "Unknown"),
      datasets: [{ data: gCounts.map(([,v]) => v) }]
    }
  });

  // Category
  const cCounts = topNCounts(data.map(r => r.cat), 10);
  chartify("catChart", {
    type: "bar",
    data: {
      labels: cCounts.map(([k]) => k || "Unknown"),
      datasets: [{ data: cCounts.map(([,v]) => v) }]
    },
    options: { responsive: true, plugins: { legend: { display: false } } }
  });

  // Top states
  const sCounts = topNCounts(data.map(r => r.state), 10);
  chartify("stateChart", {
    type: "bar",
    data: {
      labels: sCounts.map(([k]) => k),
      datasets: [{ data: sCounts.map(([,v]) => v) }]
    },
    options: { plugins: { legend: { display: false } } }
  });

  // Top boards
  const bCounts = topNCounts(data.map(r => r.board), 10);
  chartify("boardChart", {
    type: "bar",
    data: {
      labels: bCounts.map(([k]) => k),
      datasets: [{ data: bCounts.map(([,v]) => v) }]
    },
    options: { plugins: { legend: { display: false } } }
  });

  // Age histogram
  const ages = data.map(r => computeAge(r.dob)).filter(a => a !== null);
  const buckets = new Array(11).fill(0); // 10-20,..., >60 (adjust if needed)
  const labels = ["≤10","11–15","16–20","21–25","26–30","31–35","36–40","41–45","46–50","51–60",">60"];
  ages.forEach(a => {
    let idx = 0;
    if (a <= 10) idx = 0;
    else if (a <= 15) idx = 1;
    else if (a <= 20) idx = 2;
    else if (a <= 25) idx = 3;
    else if (a <= 30) idx = 4;
    else if (a <= 35) idx = 5;
    else if (a <= 40) idx = 6;
    else if (a <= 45) idx = 7;
    else if (a <= 50) idx = 8;
    else if (a <= 60) idx = 9;
    else idx = 10;
    buckets[idx]++;
  });
  chartify("ageChart", {
    type: "bar",
    data: { labels, datasets: [{ data: buckets }] },
    options: { plugins: { legend: { display: false } } }
  });
}

function updateTable(data) {
  const rows = data.map(r => [
    r.name, r.gender, r.cat, r.board, r.medium,
    r.city, r.district, r.state, r.dob
  ]);
  if (!DT) {
    DT = new DataTable("#studentTable", {
      data: rows,
      columns: [
        { title: "Name" },
        { title: "Gender" },
        { title: "Category" },
        { title: "Board" },
        { title: "Medium" },
        { title: "City" },
        { title: "District" },
        { title: "State" },
        { title: "DOB" }
      ],
      pageLength: 10,
      deferRender: true,
      responsive: true
    });
  } else {
    DT.clear();
    DT.rows.add(rows);
    DT.draw(false);
  }
}

function onDataReady() {
  populateFilters(RAW);
  applyFilters();
}

// Event wiring
window.addEventListener("DOMContentLoaded", () => {
  autoLoad();
  by("fileInput").addEventListener("change", (e) => {
    const f = e.target.files?.[0];
    if (f) handleFileInput(f);
  });
  ["stateFilter","boardFilter","genderFilter","catFilter","searchBox"].forEach(id => {
    by(id).addEventListener("input", applyFilters);
  });
  by("clearFilters").addEventListener("click", () => {
    ["stateFilter","boardFilter","genderFilter","catFilter","searchBox"].forEach(id => by(id).value = "");
    applyFilters();
  });
});
