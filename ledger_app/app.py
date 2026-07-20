"""
Bloom — a small daily budgeting app.

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

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ledger.db")

CATEGORIES = [
    "Food", "Transport", "Housing", "Utilities",
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
    conn.commit()
    conn.close()


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
    db = get_db()
    if month:
        rows = db.execute(
            "SELECT * FROM transactions WHERE date LIKE ? ORDER BY date DESC, id DESC",
            (f"{month}%",),
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

@app.route("/api/budgets")
def list_budgets():
    db = get_db()
    rows = db.execute("SELECT * FROM budgets").fetchall()
    return jsonify({r["category"]: r["monthly_limit"] for r in rows})


@app.route("/api/budgets", methods=["POST"])
def set_budget():
    data = request.get_json(force=True)
    category = data.get("category")
    limit = data.get("limit")

    db = get_db()
    if limit is None or float(limit) <= 0:
        db.execute("DELETE FROM budgets WHERE category = ?", (category,))
    else:
        db.execute(
            """INSERT INTO budgets (category, monthly_limit) VALUES (?, ?)
               ON CONFLICT(category) DO UPDATE SET monthly_limit = excluded.monthly_limit""",
            (category, float(limit)),
        )
    db.commit()
    return jsonify({"ok": True})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
