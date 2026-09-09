# Simple Budget Tracker

A minimal Streamlit app to track monthly income vs. expenses, see a spending
breakdown by category, and save/reload your budget via CSV.

## Run it locally

```bash
pip install -r requirements.txt
streamlit run app.py
```

## Deploy for free (Streamlit Community Cloud)

1. Create a free GitHub account if you don't have one, and a new repository
   (e.g. `budget-app`).
2. Upload `app.py` and `requirements.txt` to that repo (drag-and-drop works
   fine on github.com, or use `git push`).
3. Go to https://share.streamlit.io and sign in with GitHub.
4. Click **"New app"**, pick your repo/branch, and set the main file to
   `app.py`.
5. Click **Deploy**. You'll get a free public URL like
   `https://your-app-name.streamlit.app`.

That's it — no server or credit card needed.

## Notes on data persistence

Streamlit Community Cloud apps don't have permanent storage between sessions
by default — if the app restarts, in-progress data is lost. This app handles
that by letting you **download your budget as a CSV** at the end of a session
and **re-upload it** next time to continue where you left off.

If you want real persistence (no upload/download step), a natural next step
is connecting the app to a free database like Supabase or Google Sheets —
happy to help wire that up if you want it.
