"""
Careful — a small daily budgeting app.

Run with:
    pip install flask
    python app.py

Then open http://localhost:5000 on your computer.
To use it from your phone too, find your computer's local IP address
(e.g. 192.168.1.42) and visit http://<that-ip>:5000 from your phone,
as long as both devices are on the same wifi network.
"""

from flask import Flask, jsonify, request, render_template, g
import sqlite3
import os
from datetime import datetime, date

DB_PATH = os.environ.get(
    "DATABASE_PATH",
    os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger.db"),
)

CATEGORIES = [
    "Groceries", "Dining", "Transport", "Utilities",
    "Entertainment", "Health", "Shopping", "Other",
]

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Database helpers
# ---------------------------------------------------------------------------

def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS transactions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
            amount REAL NOT NULL,
            category TEXT NOT NULL,
            date TEXT NOT NULL,
            note TEXT DEFAULT ''
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS budgets (
            category TEXT PRIMARY KEY,
            monthly_limit REAL NOT NULL
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS monthly_budgets (
            month TEXT NOT NULL,
            category TEXT NOT NULL,
            monthly_limit REAL NOT NULL,
            PRIMARY KEY (month, category)
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS fixed_amounts (
            name TEXT PRIMARY KEY CHECK(name IN ('income', 'rent')),
            amount REAL NOT NULL DEFAULT 0
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS annual_funds (
            name TEXT PRIMARY KEY CHECK(name IN ('transportation', 'wellness')),
            amount REAL NOT NULL DEFAULT 0
        )
    """)
    conn.commit()
    conn.close()


# Initialize the schema when the production WSGI server imports this module.
init_db()


# ---------------------------------------------------------------------------
# Pages
# ---------------------------------------------------------------------------

@app.route("/")
def index():
    return render_template("index.html", categories=CATEGORIES)


# ---------------------------------------------------------------------------
# API — transactions
# ---------------------------------------------------------------------------

@app.route("/api/transactions")
def list_transactions():
    month = request.args.get("month")  # "YYYY-MM"
    year = request.args.get("year")  # "YYYY"
    db = get_db()
    if month:
        rows = db.execute(
            "SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC, id DESC",
            (f"{month}%",),
        ).fetchall()
    elif year:
        rows = db.execute(
            "SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC, id DESC",
            (f"{year}%",),
        ).fetchall()
    else:
        rows = db.execute(
            "SELECT * FROM transactions ORDER BY date DESC, id DESC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.route("/api/transactions", methods=["POST"])
def add_transaction():
    data = request.get_json(force=True)

    try:
        amount = float(data.get("amount"))
    except (TypeError, ValueError):
        return jsonify({"error": "Amount must be a number"}), 400
    if amount <= 0:
        return jsonify({"error": "Amount must be greater than zero"}), 400

    entry_type = data.get("type")
    if entry_type not in ("income", "expense"):
        return jsonify({"error": "Type must be 'income' or 'expense'"}), 400

    category = data.get("category") or "Other"
    entry_date = data.get("date") or date.today().isoformat()
    note = (data.get("note") or "").strip()

    db = get_db()
    cur = db.execute(
        "INSERT INTO transactions (type, amount, category, date, note) VALUES (?, ?, ?, ?, ?)",
        (entry_type, amount, category, entry_date, note),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid}), 201


@app.route("/api/transactions/<int:tx_id>", methods=["DELETE"])
def delete_transaction(tx_id):
    db = get_db()
    db.execute("DELETE FROM transactions WHERE id = ?", (tx_id,))
    db.commit()
    return jsonify({"deleted": tx_id})


# ---------------------------------------------------------------------------
# API — budgets
# ---------------------------------------------------------------------------

@app.route("/api/fixed-amounts")
def get_fixed_amounts():
    db = get_db()
    rows = db.execute("SELECT name, amount FROM fixed_amounts").fetchall()
    amounts = {"income": 0, "rent": 0}
    amounts.update({row["name"]: row["amount"] for row in rows})
    return jsonify(amounts)


@app.route("/api/fixed-amounts", methods=["POST"])
def set_fixed_amounts():
    data = request.get_json(force=True)
    values = {}
    for name in ("income", "rent"):
        try:
            amount = float(data.get(name, 0))
        except (TypeError, ValueError):
            return jsonify({"error": f"{name.title()} must be a number"}), 400
        if amount < 0:
            return jsonify({"error": f"{name.title()} cannot be negative"}), 400
        values[name] = amount

    db = get_db()
    for name, amount in values.items():
        db.execute(
            """INSERT INTO fixed_amounts (name, amount) VALUES (?, ?)
               ON CONFLICT(name) DO UPDATE SET amount = excluded.amount""",
            (name, amount),
        )
    db.commit()
    return jsonify(values)


@app.route("/api/annual-funds")
def get_annual_funds():
    init_db()
    db = get_db()
    rows = db.execute("SELECT name, amount FROM annual_funds").fetchall()
    funds = {"transportation": 0, "wellness": 0}
    funds.update({row["name"]: row["amount"] for row in rows})
    return jsonify(funds)


@app.route("/api/annual-funds", methods=["POST"])
def set_annual_funds():
    init_db()
    data = request.get_json(force=True)
    values = {}
    for name in ("transportation", "wellness"):
        try:
            amount = float(data.get(name, 0))
        except (TypeError, ValueError):
            return jsonify({"error": f"{name.title()} must be a number"}), 400
        if amount < 0:
            return jsonify({"error": f"{name.title()} cannot be negative"}), 400
        values[name] = amount

    db = get_db()
    for name, amount in values.items():
        db.execute(
            """INSERT INTO annual_funds (name, amount) VALUES (?, ?)
               ON CONFLICT(name) DO UPDATE SET amount = excluded.amount""",
            (name, amount),
        )
    db.commit()
    return jsonify(values)


@app.route("/api/budgets")
def list_budgets():
    month = request.args.get("month")
    if not valid_month(month):
        return jsonify({"error": "Month must be in YYYY-MM format"}), 400

    init_db()
    db = get_db()
    rows = db.execute(
        "SELECT category, monthly_limit FROM monthly_budgets WHERE month = ?",
        (month,),
    ).fetchall()
    return jsonify({r["category"]: r["monthly_limit"] for r in rows})


@app.route("/api/budgets", methods=["POST"])
def set_budget():
    data = request.get_json(force=True)
    category = data.get("category")
    limit = data.get("limit")
    month = data.get("month")

    if category not in CATEGORIES:
        return jsonify({"error": "Choose a valid category"}), 400
    if not valid_month(month):
        return jsonify({"error": "Month must be in YYYY-MM format"}), 400

    try:
        limit = None if limit is None else float(limit)
    except (TypeError, ValueError):
        return jsonify({"error": "Budget must be a number"}), 400

    init_db()
    db = get_db()
    if limit is None or limit <= 0:
        db.execute(
            "DELETE FROM monthly_budgets WHERE month = ? AND category = ?",
            (month, category),
        )
    else:
        db.execute(
            """INSERT INTO monthly_budgets (month, category, monthly_limit) VALUES (?, ?, ?)
               ON CONFLICT(month, category) DO UPDATE SET monthly_limit = excluded.monthly_limit""",
            (month, category, limit),
        )
    db.commit()
    return jsonify({"ok": True})


def valid_month(value):
    try:
        datetime.strptime(value, "%Y-%m")
        return True
    except (TypeError, ValueError):
        return False


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
