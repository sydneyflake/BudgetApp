const CAT_COLORS = {
  Groceries: "#E0B24F", Dining: "#f3b01f", Transport: "#6FB5D9", Utilities: "#6FD9AE",
  Entertainment: "#D97AB0", Health: "#B98FE8", Shopping: "#E08F6F", Other: "#8B7FA3"
};

let currentMonth = new Date();
currentMonth.setDate(1);
let activeTab = "dashboard";
let entryType = "expense";
let budgets = {};
let fixedAmounts = { income: 0, rent: 0 };
let annualFunds = { transportation: 0, wellness: 0 };

const $ = (sel) => document.querySelector(sel);
const fmt = (n) => "$" + Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtShort = (n) => "$" + Math.round(Math.abs(n)).toLocaleString();
const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
const yearKey = (d) => String(d.getFullYear());

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
  const [txs, budgetData, fixedData, fundData, yearlyTxs] = await Promise.all([
    fetchJSON(`/api/transactions?month=${key}`),
    fetchJSON(`/api/budgets?month=${key}`),
    fetchJSON(`/api/fixed-amounts`),
    fetchJSON(`/api/annual-funds`),
    fetchJSON(`/api/transactions?year=${yearKey(currentMonth)}`)
  ]);
  budgets = budgetData;
  fixedAmounts = fixedData;
  annualFunds = fundData;
  render(txs, yearlyTxs);
}

function render(txs, yearlyTxs) {
  const label = currentMonth.toLocaleDateString(undefined, { month: "long", year: "numeric" });
  $("#monthLabel").textContent = label;
  $("#entriesMonthLabel").textContent = currentMonth.toLocaleDateString(undefined, { month: "long" });

  const income = fixedAmounts.income + txs.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const expense = fixedAmounts.rent + txs.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  $("#sideIncome").textContent = fmt(income);
  $("#sideExpense").textContent = fmt(expense);
  $("#sideNet").textContent = (income - expense < 0 ? "-" : "") + fmt(income - expense);

  renderRing(txs);
  renderFixedAmounts();
  renderAnnualFunds();
  renderCategoryBudgets(txs, yearlyTxs);
  renderEntries(txs);
  renderYearReview(yearlyTxs);
}

function renderFixedAmounts() {
  $("#fixedIncome").value = fixedAmounts.income || "";
  $("#fixedRent").value = fixedAmounts.rent || "";
}

async function saveFixedAmounts() {
  const income = parseFloat($("#fixedIncome").value);
  const rent = parseFloat($("#fixedRent").value);
  const status = $("#fixedStatus");
  try {
    fixedAmounts = await fetchJSON("/api/fixed-amounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        income: Number.isNaN(income) ? 0 : income,
        rent: Number.isNaN(rent) ? 0 : rent
      })
    });
    status.textContent = "Saved";
    loadAndRender();
  } catch (error) {
    status.textContent = error.message;
  }
}

function renderAnnualFunds() {
  $("#transportationFund").value = annualFunds.transportation || "";
  $("#wellnessFund").value = annualFunds.wellness || "";
}

async function saveAnnualFunds() {
  const transportation = parseFloat($("#transportationFund").value);
  const wellness = parseFloat($("#wellnessFund").value);
  const status = $("#fundStatus");
  try {
    annualFunds = await fetchJSON("/api/annual-funds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transportation: Number.isNaN(transportation) ? 0 : transportation,
        wellness: Number.isNaN(wellness) ? 0 : wellness
      })
    });
    status.textContent = "Saved";
    loadAndRender();
  } catch (error) {
    status.textContent = error.message;
  }
}

function spendByCategory(txs) {
  const byCat = {};
  txs.filter(t => t.type === "expense").forEach(t => {
    byCat[t.category] = (byCat[t.category] || 0) + t.amount;
  });
  return byCat;
}

function renderYearReview(yearlyTxs) {
  const year = yearKey(currentMonth);
  const incomeEntries = yearlyTxs
    .filter(t => t.type === "income")
    .reduce((sum, t) => sum + t.amount, 0);
  const spending = spendByCategory(yearlyTxs);
  const yearlyRent = fixedAmounts.rent * 12;
  const income = fixedAmounts.income * 12 + incomeEntries;
  const variableSpent = Object.values(spending).reduce((sum, amount) => sum + amount, 0);
  const totalSpent = yearlyRent + variableSpent;

  $("#reviewYearLabel").textContent = year;
  $("#reviewIncome").textContent = fmt(income);
  $("#reviewSpent").textContent = fmt(totalSpent);
  $("#reviewNet").textContent = (income - totalSpent < 0 ? "−" : "") + fmt(income - totalSpent);
  $("#reviewTransactionCount").textContent = `${yearlyTxs.length} ${yearlyTxs.length === 1 ? "entry" : "entries"}`;

  const breakdown = [...Object.entries(spending)];
  if (yearlyRent > 0) breakdown.push(["Rent", yearlyRent]);
  breakdown.sort(([, a], [, b]) => b - a);

  const el = $("#reviewBreakdown");
  if (!breakdown.length) {
    el.innerHTML = `<div class="empty"><span class="glyph">◌</span>No spending logged for ${year} yet.</div>`;
    return;
  }

  let startAngle = -90;
  const slices = breakdown.map(([category, amount]) => {
    const share = amount / totalSpent;
    const endAngle = startAngle + share * 360;
    const color = category === "Rent" ? "#E0748A" : CAT_COLORS[category] || "#8B7FA3";
    const slice = pieSlice(110, 110, 92, startAngle, endAngle, color);
    startAngle = endAngle;
    return { category, amount, share, color, slice };
  });

  el.innerHTML = `
    <div class="review-chart">
      <div class="review-pie-wrap">
        <svg class="review-pie" viewBox="0 0 220 220" role="img" aria-label="Spending by category">
          ${slices.map(item => item.slice).join("")}
        </svg>
        <div class="review-pie-center">
          <strong class="mono">${fmtShort(totalSpent)}</strong>
          <span>spent</span>
        </div>
      </div>
      <div class="review-legend">
        ${slices.map(item => `
          <div class="review-row">
            <span class="review-category"><i style="background:${item.color}"></i>${item.category}</span>
            <strong class="mono">${fmt(item.amount)}</strong>
            <span class="review-share">${(item.share * 100).toFixed(1)}%</span>
          </div>
        `).join("")}
      </div>
    </div>
  `;
}

function pieSlice(cx, cy, radius, startAngle, endAngle, color) {
  if (endAngle - startAngle >= 359.999) {
    return `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${color}"/>`;
  }
  const point = angle => {
    const radians = angle * Math.PI / 180;
    return [cx + radius * Math.cos(radians), cy + radius * Math.sin(radians)];
  };
  const [startX, startY] = point(startAngle);
  const [endX, endY] = point(endAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `<path d="M ${cx} ${cy} L ${startX} ${startY} A ${radius} ${radius} 0 ${largeArc} 1 ${endX} ${endY} Z" fill="${color}"/>`;
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

function renderCategoryBudgets(txs, yearlyTxs) {
  const byCat = spendByCategory(txs);
  const yearlyByCat = spendByCategory(yearlyTxs);
  const el = $("#categoryList");

  el.innerHTML = CATEGORIES.map(cat => {
    const limit = budgets[cat] || 0;
    const spent = byCat[cat] || 0;

    // if no budget exists, don't show progress
    const pct = limit > 0
      ? Math.min(100, (spent / limit) * 100)
      : 0;

    const remaining = limit - spent;
    const over = limit > 0 && remaining < 0;

    const color = CAT_COLORS[cat] || "#8B7FA3";
    const fundName = cat === "Transport" ? "transportation" : cat === "Health" ? "wellness" : null;
    const fundAmount = fundName ? annualFunds[fundName] || 0 : 0;
    const fundSpent = fundName ? yearlyByCat[cat] || 0 : 0;
    const fundRemaining = fundAmount - fundSpent;

    return `
      <div class="cat-card">

        <div class="cat-head">
          <div class="cat-title">
            <span
              class="cat-dot"
              style="background:${color}">
            </span>
            ${cat}
          </div>

          <div class="cat-total mono">
            <label class="sr-only" for="budget-${cat}">${cat} monthly budget</label>
            <input
              id="budget-${cat}"
              type="number"
              min="0"
              step="1"
              class="budget-input mono"
              data-cat="${cat}"
              value="${limit || ""}"
              placeholder="Set budget"
              aria-label="${cat} monthly budget">
          </div>
        </div>

        ${fundName ? `
          <div class="annual-fund ${fundRemaining < 0 ? "over" : ""}">
            <span>${fundName === "transportation" ? "Transportation" : "Wellness"} fund · ${fmt(fundAmount)} / year</span>
            <span>${fmt(Math.abs(fundRemaining))} ${fundRemaining < 0 ? "over" : "remaining"}</span>
          </div>
        ` : ""}


        <div class="cat-spending">
          <span>
            ${fmt(spent)} spent
          </span>

          ${
            limit > 0
            ? `
              <span class="${over ? "over-text" : "left-text"}">
                ${
                  over
                  ? fmt(Math.abs(remaining)) + " over"
                  : fmt(remaining) + " left"
                }
              </span>
            `
            : ""
          }
        </div>


        ${
          limit > 0
          ?
          `
          <div class="budget-track">
            <div
              class="budget-progress ${over ? "over" : ""}"
              style="
                width:${pct}%;
                background:${over ? "#E77C8E" : color};
              ">
            </div>
          </div>
          `
          :
          ""
        }


        ${
          limit === 0
          ? `<div class="set-budget">Enter a monthly budget above.</div>`
          : ""
        }


      </div>
    `;
  }).join("");


  // keep your existing budget input functionality
  el.querySelectorAll(".budget-input").forEach(inp => {
    inp.addEventListener("change", async () => {

      const val = parseFloat(inp.value);

      await fetchJSON("/api/budgets", {
        method:"POST",
        headers:{
          "Content-Type":"application/json"
        },
        body:JSON.stringify({
          category:inp.dataset.cat,
          limit:isNaN(val) ? null : val,
          month:monthKey(currentMonth)
        })
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
document.querySelectorAll(".top-tabs button").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".top-tabs button").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    activeTab = btn.dataset.tab;
    $("#tab-dashboard").style.display = activeTab === "dashboard" ? "block" : "none";
    $("#tab-entries").style.display = activeTab === "entries" ? "block" : "none";
    $("#tab-review").style.display = activeTab === "review" ? "block" : "none";
    $("#tab-budgets").style.display = activeTab === "budgets" ? "block" : "none";
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

$("#fixedIncome").addEventListener("change", saveFixedAmounts);
$("#fixedRent").addEventListener("change", saveFixedAmounts);
$("#transportationFund").addEventListener("change", saveAnnualFunds);
$("#wellnessFund").addEventListener("change", saveAnnualFunds);

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
