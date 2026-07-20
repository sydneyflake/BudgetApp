const CAT_COLORS = {
  Food: "#E0B24F", Transport: "#6FB5D9", Housing: "#9B6FDB", Utilities: "#6FD9AE",
  Entertainment: "#D97AB0", Health: "#B98FE8", Shopping: "#E08F6F", Other: "#8B7FA3"
};

let currentMonth = new Date();
currentMonth.setDate(1);
let activeTab = "dashboard";
let entryType = "expense";
let budgets = {};

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n) => "$" + Math.round(Math.abs(n)).toLocaleString();
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

async function fetchJSON(url, options) {
  const res = await fetch(url, options);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}

async function loadAndRender() {
  const key = monthKey(currentMonth);
  const [txs, budgetData] = await Promise.all([
    fetchJSON(`/api/transactions?month=${key}`),
    fetchJSON(`/api/budgets`)
  ]);
  budgets = budgetData;
  render(txs);
}

function render(txs) {
  const label = currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("#monthLabel").textContent = label;
  $("#entriesMonthLabel").textContent = currentMonth.toLocaleDateString(undefined, { month: "long" });

  const income = txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  $("#sideIncome").textContent = fmt(income);
  $("#sideExpense").textContent = fmt(expense);
  $("#sideNet").textContent = (income - expense < 0 ? "-" : "") + fmt(income - expense);

  renderRing(txs);
  renderCategoryBudgets(txs);
  renderEntries(txs);
}

function spendByCategory(txs) {
  const byCat = {};
  txs.filter(t => t.type === "expense").forEach(t => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  return byCat;
}

function renderRing(txs) {
  const byCat = spendByCategory(txs);
  const totalBudget = Object.values(budgets).reduce((s, v) => s + v, 0);
  const totalSpent = Object.values(byCat).reduce((s, v) => s + v, 0);
  const capacity = totalBudget > 0 ? totalBudget : Math.max(totalSpent, 1);

  $("#ringSpent").textContent = fmtShort(totalSpent);
  $("#ringBudget").textContent = totalBudget > 0 ? fmtShort(totalBudget) : "—";

  const r = 92, cx = 110, cy = 110;
  const circumference = 2 * Math.PI * r;
  let offset = 0;
  const segments = [];

  CATEGORIES.forEach(cat => {
    const spent = byCat[cat] || 0;
    if (spent <= 0) return;
    const frac = Math.min(spent / capacity, 1 - offset / circumference);
    const len = frac * circumference;
    segments.push({ cat, spent, len, offset });
    offset += len;
  });

  const remaining = Math.max(circumference - offset, 0);

  let svg = `<g transform="rotate(-90 ${cx} ${cy})">`;
  svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--track)" stroke-width="16"/>`;
  segments.forEach(seg => {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
      stroke="${CAT_COLORS[seg.cat] || '#8B7FA3'}" stroke-width="16"
      stroke-dasharray="${seg.len} ${circumference - seg.len}"
      stroke-dashoffset="${-seg.offset}" stroke-linecap="butt"/>`;
  });
  if (totalSpent > capacity && totalBudget > 0) {
    svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="var(--wine)" stroke-width="16" opacity="0.9"/>`;
  }
  svg += `</g>`;
  $("#ringSvg").innerHTML = svg;

  const legend = $("#ringLegend");
  if (!segments.length) {
    legend.innerHTML = `<div class="legend-empty">No spending logged yet this month.</div>`;
  } else {
    legend.innerHTML = segments.map(seg => `
      <div class="legend-row">
        <span class="legend-dot" style="background:${CAT_COLORS[seg.cat] || '#8B7FA3'}"></span>
        <span class="legend-name">${seg.cat}</span>
        <span class="legend-val mono">${fmt(seg.spent)}</span>
      </div>
    `).join("");
  }
}

function renderCategoryBudgets(txs) {
  const byCat = spendByCategory(txs);
  const el = $("#categoryList");
  el.innerHTML = CATEGORIES.map(cat => {
    const limit = budgets[cat] || 0;
    const spent = byCat[cat] || 0;
    const pct = limit > 0 ? Math.min(100, (spent / limit * 100)) : (spent > 0 ? 100 : 0);
    const over = limit > 0 && spent > limit;
    const color = CAT_COLORS[cat] || "#8B7FA3";
    return `
      <div class="cat-row">
        <div class="cat-head">
          <span class="cat-name"><span class="cat-dot" style="background:${color}"></span>${cat}</span>
          <span class="cat-figures">
            ${fmt(spent)} of
            <input type="number" min="0" step="1" class="budget-input mono" data-cat="${cat}" value="${limit || ""}" placeholder="0">
          </span>
        </div>
        <div class="bar-track"><div class="bar-fill ${over ? "over" : ""}" style="width:${pct}%; background:${over ? "" : color}"></div></div>
        ${limit > 0 ? `<div class="cat-foot"><span>${over ? "over by " + fmt(spent - limit) : fmt(limit - spent) + " left"}</span></div>` : ""}
      </div>
    `;
  }).join("");

  el.querySelectorAll(".budget-input").forEach(inp => {
    inp.addEventListener("change", async () => {
      const val = parseFloat(inp.value);
      await fetchJSON("/api/budgets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: inp.dataset.cat, limit: isNaN(val) ? null : val })
      });
      loadAndRender();
    });
  });
}

function renderEntries(txs) {
  const el = $("#entriesList");
  el.innerHTML = txs.length ? txs.map(t => `
    <div class="tx-row">
      <div class="tx-dot" style="background:${CAT_COLORS[t.category] || '#8B7FA3'}"></div>
      <div class="meta">
        <div class="cat">${t.category}</div>
        <div class="note">${t.note ? t.note : t.date}</div>
      </div>
      <div class="amt ${t.type} mono">${t.type === "income" ? "+" : "−"}${fmt(t.amount)}</div>
      <button class="del" data-id="${t.id}">✕</button>
    </div>
  `).join("") : `<div class="empty"><span class="glyph">✎</span>Nothing logged yet. Click "Add entry" to start.</div>`;

  el.querySelectorAll(".del").forEach(btn => {
    btn.addEventListener("click", async () => {
      await fetchJSON(`/api/transactions/${btn.dataset.id}`, { method: "DELETE" });
      loadAndRender();
    });
  });
}

// ===== Tabs =====
document.querySelectorAll(".side-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".side-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    $("#tab-dashboard").style.display = activeTab === "dashboard" ? "block" : "none";
    $("#tab-entries").style.display = activeTab === "entries" ? "block" : "none";
  });
});

// ===== Month nav =====
$("#prevMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() - 1);
  loadAndRender();
});
$("#nextMonth").addEventListener("click", () => {
  currentMonth.setMonth(currentMonth.getMonth() + 1);
  loadAndRender();
});

// ===== Add entry modal =====
const backdrop = $("#sheetBackdrop");
function openSheet() {
  $("#fDate").value = new Date().toISOString().slice(0, 10);
  $("#fAmount").value = "";
  $("#fNote").value = "";
  entryType = "expense";
  $("#typeExpense").classList.add("active");
  $("#typeIncome").classList.remove("active");
  backdrop.classList.add("open");
  $("#fAmount").focus();
}
function closeSheet() { backdrop.classList.remove("open"); }

$("#addBtn").addEventListener("click", openSheet);
$("#cancelBtn").addEventListener("click", closeSheet);
backdrop.addEventListener("click", (e) => { if (e.target === backdrop) closeSheet(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet(); });

$("#typeExpense").addEventListener("click", () => {
  entryType = "expense";
  $("#typeExpense").classList.add("active");
  $("#typeIncome").classList.remove("active");
});
$("#typeIncome").addEventListener("click", () => {
  entryType = "income";
  $("#typeIncome").classList.add("active");
  $("#typeExpense").classList.remove("active");
});

$("#saveBtn").addEventListener("click", async () => {
  const amount = parseFloat($("#fAmount").value);
  if (isNaN(amount) || amount <= 0) { $("#fAmount").focus(); return; }
  const entry = {
    type: entryType,
    amount: amount,
    category: $("#fCategory").value,
    date: $("#fDate").value || new Date().toISOString().slice(0, 10),
    note: $("#fNote").value.trim()
  };
  try {
    await fetchJSON("/api/transactions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(entry)
    });
    closeSheet();
    const entryMonth = new Date(entry.date + "T00:00:00");
    currentMonth = new Date(entryMonth.getFullYear(), entryMonth.getMonth(), 1);
    loadAndRender();
  } catch (e) {
    alert(e.message);
  }
});

loadAndRender();
