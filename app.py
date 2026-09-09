import streamlit as st
import pandas as pd
import io
from datetime import date

st.set_page_config(page_title="Simple Budget", page_icon="💰", layout="centered")

DEFAULT_CATEGORIES = [
    "Housing", "Utilities", "Groceries", "Transportation", "Insurance",
    "Debt Payments", "Subscriptions", "Entertainment", "Dining Out",
    "Health", "Savings", "Other",
]

# ---------- Session state setup ----------
if "budgets" not in st.session_state:
    # Category -> budgeted amount
    st.session_state.budgets = pd.DataFrame(
        {"Category": DEFAULT_CATEGORIES, "Budget": [0.0] * len(DEFAULT_CATEGORIES)}
    )

if "expenses" not in st.session_state:
    st.session_state.expenses = pd.DataFrame(
        columns=["Category", "Description", "Amount"]
    )

if "income" not in st.session_state:
    st.session_state.income = 0.0

st.title("💰 Simple Budget Tracker")
st.caption(
    "Set a budget for each category, then log expenses against it to see what's left. "
    "Download your data at the end to save it — this app doesn't persist data between sessions."
)

# ---------- Load previous data ----------
with st.expander("📂 Load a previously saved budget (optional)"):
    col_a, col_b = st.columns(2)
    with col_a:
        budget_upload = st.file_uploader("Upload category budgets CSV", type=["csv"], key="budget_upload")
        if budget_upload is not None:
            try:
                loaded = pd.read_csv(budget_upload)
                if set(["Category", "Budget"]).issubset(loaded.columns):
                    st.session_state.budgets = loaded[["Category", "Budget"]]
                    st.success("Budgets loaded!")
                else:
                    st.error("CSV needs 'Category' and 'Budget' columns.")
            except Exception as e:
                st.error(f"Couldn't read that file: {e}")
    with col_b:
        expense_upload = st.file_uploader("Upload expenses CSV", type=["csv"], key="expense_upload")
        if expense_upload is not None:
            try:
                loaded = pd.read_csv(expense_upload)
                if set(["Category", "Description", "Amount"]).issubset(loaded.columns):
                    st.session_state.expenses = loaded[["Category", "Description", "Amount"]]
                    st.success("Expenses loaded!")
                else:
                    st.error("CSV needs 'Category', 'Description', and 'Amount' columns.")
            except Exception as e:
                st.error(f"Couldn't read that file: {e}")

st.divider()

# ---------- Income ----------
st.subheader("1. Monthly Income")
st.session_state.income = st.number_input(
    "Total monthly income ($)",
    min_value=0.0,
    value=float(st.session_state.income),
    step=50.0,
    format="%.2f",
)

st.divider()

# ---------- Set category budgets ----------
st.subheader("2. Set a Budget per Category")
st.caption("Edit amounts below, or add/remove rows. This is your spending limit for each category.")

budget_editor = st.data_editor(
    st.session_state.budgets,
    num_rows="dynamic",
    use_container_width=True,
    key="budget_editor",
    column_config={
        "Budget": st.column_config.NumberColumn("Budget ($)", min_value=0.0, step=10.0, format="%.2f"),
    },
)
st.session_state.budgets = budget_editor

total_budgeted = st.session_state.budgets["Budget"].sum() if not st.session_state.budgets.empty else 0.0
budget_categories = st.session_state.budgets["Category"].dropna().tolist() if not st.session_state.budgets.empty else DEFAULT_CATEGORIES

st.caption(f"Total budgeted: **${total_budgeted:,.2f}** of ${st.session_state.income:,.2f} income")

st.divider()

# ---------- Add expense ----------
st.subheader("3. Log an Expense")

with st.form("add_expense_form", clear_on_submit=True):
    col1, col2, col3 = st.columns([1.2, 1.5, 1])
    with col1:
        category = st.selectbox("Category", budget_categories if budget_categories else DEFAULT_CATEGORIES)
    with col2:
        description = st.text_input("Description (optional)")
    with col3:
        amount = st.number_input("Amount ($)", min_value=0.0, step=10.0, format="%.2f")

    submitted = st.form_submit_button("Add expense", use_container_width=True)
    if submitted:
        if amount > 0:
            new_row = pd.DataFrame(
                [{"Category": category, "Description": description, "Amount": amount}]
            )
            st.session_state.expenses = pd.concat(
                [st.session_state.expenses, new_row], ignore_index=True
            )
            st.success(f"Added {category}: ${amount:,.2f}")
        else:
            st.warning("Enter an amount greater than 0.")

st.divider()

# ---------- Expense table ----------
st.subheader("4. Your Expenses")

if st.session_state.expenses.empty:
    st.info("No expenses logged yet. Add some above.")
else:
    edited_df = st.data_editor(
        st.session_state.expenses,
        num_rows="dynamic",
        use_container_width=True,
        key="expense_editor",
    )
    st.session_state.expenses = edited_df

st.divider()

# ---------- Budget vs Actual per category ----------
st.subheader("5. Remaining Budget by Category")

spent_by_cat = (
    st.session_state.expenses.groupby("Category")["Amount"].sum()
    if not st.session_state.expenses.empty
    else pd.Series(dtype=float)
)

summary_rows = []
for _, row in st.session_state.budgets.iterrows():
    cat = row["Category"]
    if pd.isna(cat) or cat == "":
        continue
    budget_amt = float(row["Budget"]) if not pd.isna(row["Budget"]) else 0.0
    spent_amt = float(spent_by_cat.get(cat, 0.0))
    remaining_amt = budget_amt - spent_amt
    summary_rows.append(
        {"Category": cat, "Budget": budget_amt, "Spent": spent_amt, "Remaining": remaining_amt}
    )

summary_df = pd.DataFrame(summary_rows)

if summary_df.empty:
    st.info("Add categories with budgets above to see your breakdown here.")
else:
    for _, r in summary_df.iterrows():
        over = r["Remaining"] < 0
        pct = min(r["Spent"] / r["Budget"], 1.0) if r["Budget"] > 0 else (1.0 if r["Spent"] > 0 else 0.0)
        label = (
            f"**{r['Category']}** — ${r['Spent']:,.2f} of ${r['Budget']:,.2f} "
            f"({'over by $' + format(-r['Remaining'], ',.2f') if over else '$' + format(r['Remaining'], ',.2f') + ' left'})"
        )
        st.progress(pct, text=label)

    st.dataframe(
        summary_df.style.format({"Budget": "${:,.2f}", "Spent": "${:,.2f}", "Remaining": "${:,.2f}"}),
        use_container_width=True,
        hide_index=True,
    )

st.divider()

# ---------- Overall Summary ----------
st.subheader("6. Overall Summary")

total_expenses = st.session_state.expenses["Amount"].sum() if not st.session_state.expenses.empty else 0.0
remaining_income = st.session_state.income - total_expenses

col1, col2, col3 = st.columns(3)
col1.metric("Income", f"${st.session_state.income:,.2f}")
col2.metric("Total Spent", f"${total_expenses:,.2f}")
col3.metric(
    "Left Over",
    f"${remaining_income:,.2f}",
    delta="Surplus" if remaining_income >= 0 else "Over budget",
    delta_color="normal" if remaining_income >= 0 else "inverse",
)

if st.session_state.income > 0:
    pct_used = min(total_expenses / st.session_state.income, 1.0)
    st.progress(pct_used, text=f"{pct_used*100:.0f}% of income spent")

# ---------- Breakdown chart ----------
if not st.session_state.expenses.empty:
    st.subheader("7. Spending by Category")
    by_cat = st.session_state.expenses.groupby("Category")["Amount"].sum().sort_values(ascending=False)
    st.bar_chart(by_cat)

st.divider()

# ---------- Export ----------
st.subheader("8. Save Your Budget")
st.caption("Download both files now so you can re-upload them next time and continue where you left off.")

col1, col2 = st.columns(2)
with col1:
    budget_buffer = io.StringIO()
    st.session_state.budgets.to_csv(budget_buffer, index=False)
    st.download_button(
        label="⬇️ Download category budgets",
        data=budget_buffer.getvalue(),
        file_name=f"budgets_{date.today().isoformat()}.csv",
        mime="text/csv",
        use_container_width=True,
    )
with col2:
    if not st.session_state.expenses.empty:
        expense_buffer = io.StringIO()
        st.session_state.expenses.to_csv(expense_buffer, index=False)
        st.download_button(
            label="⬇️ Download expenses",
            data=expense_buffer.getvalue(),
            file_name=f"expenses_{date.today().isoformat()}.csv",
            mime="text/csv",
            use_container_width=True,
        )
    else:
        st.caption("Add expenses first to enable this download.")
