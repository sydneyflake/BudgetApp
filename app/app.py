import streamlit as st
import pandas as pd
import io
from datetime import date

st.set_page_config(page_title="Simple Budget", page_icon="💰", layout="centered")

# ---------- Session state setup ----------
if "expenses" not in st.session_state:
    st.session_state.expenses = pd.DataFrame(
        columns=["Category", "Description", "Amount"]
    )

if "income" not in st.session_state:
    st.session_state.income = 0.0

st.title("💰 Simple Budget Tracker")
st.caption("Track income vs. expenses. Upload a saved CSV to pick up where you left off, "
           "or download one at the end to save your progress (this app doesn't store data between sessions).")

# ---------- Load previous data ----------
with st.expander("📂 Load a previously saved budget (optional)"):
    uploaded = st.file_uploader("Upload your budget CSV", type=["csv"])
    if uploaded is not None:
        try:
            loaded_df = pd.read_csv(uploaded)
            if set(["Category", "Description", "Amount"]).issubset(loaded_df.columns):
                st.session_state.expenses = loaded_df[["Category", "Description", "Amount"]]
                st.success("Budget loaded!")
            else:
                st.error("CSV doesn't have the expected columns (Category, Description, Amount).")
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

# ---------- Add expense ----------
st.subheader("2. Add an Expense")

DEFAULT_CATEGORIES = [
    "Housing", "Utilities", "Groceries", "Transportation", "Insurance",
    "Debt Payments", "Subscriptions", "Entertainment", "Dining Out",
    "Health", "Savings", "Other",
]

with st.form("add_expense_form", clear_on_submit=True):
    col1, col2, col3 = st.columns([1.2, 1.5, 1])
    with col1:
        category = st.selectbox("Category", DEFAULT_CATEGORIES)
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
st.subheader("3. Your Expenses")

if st.session_state.expenses.empty:
    st.info("No expenses added yet. Add some above.")
else:
    edited_df = st.data_editor(
        st.session_state.expenses,
        num_rows="dynamic",
        use_container_width=True,
        key="expense_editor",
    )
    st.session_state.expenses = edited_df

st.divider()

# ---------- Summary ----------
st.subheader("4. Summary")

total_expenses = st.session_state.expenses["Amount"].sum() if not st.session_state.expenses.empty else 0.0
remaining = st.session_state.income - total_expenses

col1, col2, col3 = st.columns(3)
col1.metric("Income", f"${st.session_state.income:,.2f}")
col2.metric("Expenses", f"${total_expenses:,.2f}")
col3.metric(
    "Remaining",
    f"${remaining:,.2f}",
    delta=f"{'Surplus' if remaining >= 0 else 'Over budget'}",
    delta_color="normal" if remaining >= 0 else "inverse",
)

if st.session_state.income > 0:
    pct_used = min(total_expenses / st.session_state.income, 1.0)
    st.progress(pct_used, text=f"{pct_used*100:.0f}% of income spent")

# ---------- Breakdown chart ----------
if not st.session_state.expenses.empty:
    st.subheader("5. Spending by Category")
    by_cat = st.session_state.expenses.groupby("Category")["Amount"].sum().sort_values(ascending=False)
    st.bar_chart(by_cat)

st.divider()

# ---------- Export ----------
st.subheader("6. Save Your Budget")
st.caption("Download a CSV now so you can re-upload it next time and continue where you left off.")

if not st.session_state.expenses.empty:
    csv_buffer = io.StringIO()
    st.session_state.expenses.to_csv(csv_buffer, index=False)
    st.download_button(
        label="⬇️ Download budget as CSV",
        data=csv_buffer.getvalue(),
        file_name=f"budget_{date.today().isoformat()}.csv",
        mime="text/csv",
        use_container_width=True,
    )
else:
    st.caption("Add expenses first to enable download.")
