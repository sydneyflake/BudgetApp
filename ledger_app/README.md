# Careful — a daily budgeting app

A small Flask + SQLite budgeting app: track income and expenses, see spending
by category, and set monthly limits. Built as a foundation to extend.

## Setup

```bash
cd ledger_app
pip install -r requirements.txt
python app.py
```

## Deploying to Render

This repository includes a `render.yaml` Blueprint for deployment. In Render,
choose **New → Blueprint**, connect the GitHub repository, and select it. Render
will install the dependencies, start the app with Gunicorn, and attach a
persistent disk for the SQLite database.

The app has no sign-in system. Do not share a public deployment link with
anyone you do not want to be able to view and edit the budget.

The database file `ledger.db` is created automatically on first run, in the
same folder as `app.py`.

## Using it on your computer

Open **http://localhost:5000** in your browser.

## Using it on your phone too

1. Make sure your phone and computer are on the **same wifi network**.
2. Find your computer's local IP address:
   - Mac/Linux: run `ifconfig` (or `ip addr`) and look for something like `192.168.1.42`
   - Windows: run `ipconfig` and look for "IPv4 Address"
3. On your phone's browser, go to `http://<that-ip>:5000` (e.g. `http://192.168.1.42:5000`)
4. Optional: add it to your phone's home screen (Share → "Add to Home Screen")
   so it opens like an app.

Both devices talk to the *same* database file on your computer, so entries
made from your phone show up when you check from your computer, as long as
your computer stays on and running `python app.py`.

## Project structure

```
ledger_app/
├── app.py                 # Flask routes + SQLite access
├── ledger.db               # created automatically — your data lives here
├── templates/
│   └── index.html          # page shell, injects category list
├── static/
│   ├── style.css           # all visual styling / theme tokens
│   └── app.js               # tabs, month nav, add/delete, fetch calls
└── requirements.txt
```

## Where to go next

- **Categories**: currently a fixed list in `app.py` (`CATEGORIES`). Easy to
  make these user-editable — add a `categories` table and a small settings screen.
- **Auth**: right now anyone on your wifi with the URL can see/edit it. Fine
  for personal home use; add a login if that ever matters.
- **Real sync anywhere** (not just same wifi): deploy `app.py` to a small
  host (Render, Fly.io, PythonAnywhere) so both devices reach it over the
  internet instead of local wifi.
- **Recurring transactions**, **CSV export**, **multi-month charts** (e.g.
  with Chart.js or a Python plotting lib) are all natural next additions —
  the `/api/transactions` endpoint is a clean place to build them from.
