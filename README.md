# ♟ Chess

A chess game written in plain HTML + JavaScript, with a small Python server for
online play and accounts. No frameworks, no installs — just Python's standard
library.

## Features

- **Play vs Computer** — a bot that searches 5 moves ahead (minimax + alpha‑beta).
- **Play vs Person** — two players sharing one screen (hot‑seat).
- **Play Online** — two players on different computers (same network, or hosted),
  with moves synced through the server.
- **Accounts** — log in / register. Usernames **and** passwords must be unique.
- **Game history** — finished games are saved and shown in a list.

## Files

| File | What it is |
|------|------------|
| `chessHTML.html` | The page: board, login screen, styling, and the UI script. |
| `jschess.js` | The chess engine (rules + bot) **and** the browser-side game logic. |
| `server.py` | The Python server: serves the files, relays online moves, and stores the two databases. |

## The two databases (SQLite, in `chess.db`)

- **`users`** — one row per account: `name` (unique), `password_hash` (unique), `created_at`.
- **`games`** — one row per finished game: `white`, `black`, `result`, `moves`, `played_at`.

`chess.db` is created automatically on first run and is **git-ignored** (it holds
private account data).

> Note on passwords: they're stored as SHA‑256 hashes (never plain text). Real
> apps also add a per‑user random "salt", but that would break the "unique
> password" rule this project requires, so a plain hash is used on purpose.

## Run it locally

```bash
python server.py
```

Then open the URL it prints:

- **You**: `http://localhost:8000/`
- **Another player on the same Wi‑Fi**: `http://<your-ip>:8000/` (the server prints this)

Register an account, then pick a mode. For online play, both people log in and
click **Play Online** — first to join is White, second is Black.

## Put it online (so it works beyond your own network)

GitHub stores the code but **can't run Python** (GitHub Pages is static only).
To host the live server for free, use **Render**:

1. Push this folder to a GitHub repo (see below).
2. On [render.com](https://render.com), create a **New → Web Service** and connect the repo.
3. Settings:
   - **Build command:** *(leave blank — no dependencies)*
   - **Start command:** `python server.py`
4. Deploy. Render gives you a public `https://...onrender.com` URL that anyone can open.

The server already reads the hosting port from the `PORT` environment variable,
so no code changes are needed.

**Heads-up about saved data when hosted:** Render's free tier has an *ephemeral*
filesystem — `chess.db` resets whenever the service restarts or redeploys. For
permanent storage, add a Render **Disk**, mount it (e.g. at `/data`), and set the
env var `CHESS_DB=/data/chess.db`.

## Push to GitHub

```bash
git add .
git commit -m "Chess: online play + accounts + history"
git branch -M main
git remote add origin https://github.com/<your-username>/<your-repo>.git
git push -u origin main
```

(Create the empty repo first at github.com → New repository, without a README.)
