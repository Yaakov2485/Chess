"""
============================================================
 Chess server — online play + two SQLite databases.
============================================================

WHAT THIS IS
  A small web server built only from Python's standard library (no pip
  installs). It does three jobs:

    1. Serves the game files (chessHTML.html, jschess.js).

    2. Relays moves between the two players (it doesn't understand chess —
       each browser runs the engine; the server just shuttles moves).

    3. Stores data in TWO database tables inside one SQLite file (chess.db):
         • users  — every account's username + password (both must be UNIQUE).
         • games  — the history of finished games (who played, who won, when).

  SQLite is a real database that lives in a single file and is built into
  Python (module `sqlite3`) — nothing to install.

HOW TO RUN
      python server.py
  Then open the URL it prints.

THE API (messages the browser sends us)
  Accounts:
    POST /register {name, password} -> {ok:true, name} OR {ok:false, error}
        Rejects a username already taken, OR a password already used by
        someone else (both must be unique — that's the assignment rule).
    POST /login    {name, password} -> {ok:true, name} OR {ok:false, error}
  Online game relay:
    POST /join   {playerId, name}            -> {color, gameId, white, black}
    GET  /moves                              -> {gameId, moves, white, black}
    POST /move   {playerId, from, to, promotion} -> {ok} or error
    POST /reset  {playerId}                  -> {ok, gameId}
  Game history:
    POST /gameover {white, black, result, moves} -> {ok}
    GET  /history                            -> {games:[...]}  (most recent first)
============================================================
"""

import os
import json
import socket
import sqlite3
import hashlib
import functools
import threading
from datetime import datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

# Always work relative to THIS script's folder, so launching from anywhere
# (or double-clicking) still finds the files and the database.
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
# Where the SQLite database file lives. Defaults to next to this script, but a
# host (like Render) can point it at a persistent disk via the CHESS_DB env var.
DB_PATH = os.environ.get('CHESS_DB', os.path.join(SCRIPT_DIR, 'chess.db'))

# The port to listen on. Cloud hosts (like Render) tell us which port to use
# through the PORT environment variable; locally we fall back to 8000.
PORT = int(os.environ.get('PORT', '8000'))

# ---------------------------------------------------------------
#  DATABASES (SQLite) — two tables in one file: users + games
# ---------------------------------------------------------------
# Every request runs on its own thread, and SQLite connections aren't meant
# to be shared across threads, so we open a FRESH connection per operation
# (cheap for a file DB) and guard writes with this lock to avoid clashes.
db_lock = threading.Lock()


def init_db():
    """Create the two tables the first time the server runs (safe to call
    every start thanks to IF NOT EXISTS)."""
    with sqlite3.connect(DB_PATH) as conn:
        # TABLE 1 — users. `UNIQUE` on both name and password_hash is what the
        # database itself uses to forbid duplicates, on top of our own checks.
        conn.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                name          TEXT UNIQUE NOT NULL,
                password_hash TEXT UNIQUE NOT NULL,
                created_at    TEXT NOT NULL
            )
        ''')
        # TABLE 2 — games. One row per finished game.
        conn.execute('''
            CREATE TABLE IF NOT EXISTS games (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                white      TEXT,
                black      TEXT,
                result     TEXT,     -- 'white' | 'black' | 'draw'
                moves      INTEGER,  -- number of half-moves played
                played_at  TEXT NOT NULL
            )
        ''')
        conn.commit()


def hash_password(pw):
    """Turn a password into a fixed-length fingerprint so we never store the
    real password text. Same password -> same hash, which is what lets us
    check 'is this password already used?'.
    NOTE: real apps add a random 'salt' per user (so identical passwords get
    different hashes) and DON'T force passwords to be unique — but salting
    would break the 'unique password' rule this assignment asks for, so we
    use a plain SHA-256 here on purpose."""
    return hashlib.sha256(pw.encode('utf-8')).hexdigest()


# ---------------------------------------------------------------
#  IN-MEMORY GAME STATE (the live online game; resets when server restarts)
# ---------------------------------------------------------------
state_lock = threading.Lock()
moves = []            # ordered list of {from, to, promotion} for the current game
players = {}          # playerId -> color ('w' / 'b' / 'spectator')
names = {'w': None, 'b': None}  # the display names of the current White / Black players
game_id = 1           # bumped on every /reset so browsers notice a new game


def assign_color(player_id, name):
    """Give this player a color (White to the first, Black to the second,
    spectator after that), remembering their name for the game-history record."""
    if player_id in players:
        color = players[player_id]
    else:
        taken = [c for c in players.values() if c in ('w', 'b')]
        if 'w' not in taken:
            color = 'w'
        elif 'b' not in taken:
            color = 'b'
        else:
            color = 'spectator'
        players[player_id] = color
    # Record the name against the color (so /gameover can store who played).
    if color in ('w', 'b') and name:
        names[color] = name
    return color


class Handler(SimpleHTTPRequestHandler):
    """Serves files AND handles our JSON API paths."""

    # ---- small helpers -------------------------------------------
    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def read_json(self):
        length = int(self.headers.get('Content-Length', 0))
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode('utf-8'))
        except json.JSONDecodeError:
            return {}

    # ---- GET: API reads, or serve a file -------------------------
    def do_GET(self):
        path = self.path.split('?')[0]
        if path == '/moves':
            with state_lock:
                self.send_json({'gameId': game_id, 'moves': moves,
                                'white': names['w'], 'black': names['b']})
            return
        if path == '/history':
            self.handle_history()
            return
        if self.path == '/':
            self.path = '/chessHTML.html'
        return SimpleHTTPRequestHandler.do_GET(self)

    # ---- POST: all our "write" endpoints -------------------------
    def do_POST(self):
        route = {
            '/register': self.handle_register,
            '/login':    self.handle_login,
            '/join':     self.handle_join,
            '/move':     self.handle_move,
            '/reset':    self.handle_reset,
            '/gameover': self.handle_gameover,
        }.get(self.path)
        if route:
            route()
        else:
            self.send_json({'error': 'unknown endpoint'}, status=404)

    # ---- accounts (the USERS database) ---------------------------
    def handle_register(self):
        data = self.read_json()
        name = (data.get('name') or '').strip()
        password = data.get('password') or ''
        # Basic validation.
        if not name or not password:
            self.send_json({'ok': False, 'error': 'Enter both a username and a password.'})
            return
        if len(name) > 20:
            self.send_json({'ok': False, 'error': 'Username must be 20 characters or fewer.'})
            return
        pwh = hash_password(password)
        with db_lock, sqlite3.connect(DB_PATH) as conn:
            # Rule 1: username must be unused.
            if conn.execute('SELECT 1 FROM users WHERE name = ?', (name,)).fetchone():
                self.send_json({'ok': False, 'error': 'That username is already taken.'})
                return
            # Rule 2: password must be unused (the assignment's "no repetition").
            if conn.execute('SELECT 1 FROM users WHERE password_hash = ?', (pwh,)).fetchone():
                self.send_json({'ok': False, 'error': 'That password is already in use — please pick another.'})
                return
            conn.execute(
                'INSERT INTO users (name, password_hash, created_at) VALUES (?, ?, ?)',
                (name, pwh, datetime.now().strftime('%Y-%m-%d %H:%M'))
            )
            conn.commit()
        self.send_json({'ok': True, 'name': name})

    def handle_login(self):
        data = self.read_json()
        name = (data.get('name') or '').strip()
        password = data.get('password') or ''
        pwh = hash_password(password)
        with db_lock, sqlite3.connect(DB_PATH) as conn:
            row = conn.execute(
                'SELECT name FROM users WHERE name = ? AND password_hash = ?',
                (name, pwh)
            ).fetchone()
        if row:
            self.send_json({'ok': True, 'name': row[0]})
        else:
            self.send_json({'ok': False, 'error': 'Wrong username or password.'})

    # ---- online game relay ---------------------------------------
    def handle_join(self):
        data = self.read_json()
        player_id = data.get('playerId')
        name = (data.get('name') or '').strip()
        if not player_id:
            self.send_json({'error': 'missing playerId'}, status=400)
            return
        with state_lock:
            color = assign_color(player_id, name)
            self.send_json({'color': color, 'gameId': game_id,
                            'white': names['w'], 'black': names['b']})

    def handle_move(self):
        data = self.read_json()
        player_id = data.get('playerId')
        with state_lock:
            color = players.get(player_id)
            if color not in ('w', 'b'):
                self.send_json({'error': 'not a player'}, status=403)
                return
            expected = 'w' if len(moves) % 2 == 0 else 'b'
            if color != expected:
                self.send_json({'error': 'not your turn'}, status=409)
                return
            moves.append({
                'from': data.get('from'),
                'to': data.get('to'),
                'promotion': data.get('promotion', ''),
            })
            self.send_json({'ok': True, 'count': len(moves)})

    def handle_reset(self):
        global moves, game_id
        data = self.read_json()
        player_id = data.get('playerId')
        with state_lock:
            if players.get(player_id) not in ('w', 'b'):
                self.send_json({'error': 'not a player'}, status=403)
                return
            moves = []
            game_id += 1
            self.send_json({'ok': True, 'gameId': game_id})

    # ---- game history (the GAMES database) -----------------------
    def handle_gameover(self):
        data = self.read_json()
        white = (data.get('white') or 'White')
        black = (data.get('black') or 'Black')
        result = data.get('result')
        nmoves = data.get('moves', 0)
        if result not in ('white', 'black', 'draw'):
            self.send_json({'ok': False, 'error': 'bad result'}, status=400)
            return
        with db_lock, sqlite3.connect(DB_PATH) as conn:
            conn.execute(
                'INSERT INTO games (white, black, result, moves, played_at) VALUES (?, ?, ?, ?, ?)',
                (white, black, result, nmoves, datetime.now().strftime('%Y-%m-%d %H:%M'))
            )
            conn.commit()
        self.send_json({'ok': True})

    def handle_history(self):
        with db_lock, sqlite3.connect(DB_PATH) as conn:
            rows = conn.execute(
                'SELECT white, black, result, moves, played_at FROM games ORDER BY id DESC LIMIT 20'
            ).fetchall()
        games = [{'white': r[0], 'black': r[1], 'result': r[2], 'moves': r[3], 'playedAt': r[4]}
                 for r in rows]
        self.send_json({'games': games})

    def log_message(self, fmt, *args):
        pass  # keep the console quiet


def get_lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('8.8.8.8', 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return '127.0.0.1'


if __name__ == '__main__':
    init_db()  # make sure the two tables exist before we accept any requests
    handler = functools.partial(Handler, directory=SCRIPT_DIR)
    server = ThreadingHTTPServer(('', PORT), handler)
    lan_ip = get_lan_ip()
    print('=' * 52)
    print('  Chess server running!')
    print('  This computer:   http://localhost:%d/' % PORT)
    print('  Other players:   http://%s:%d/' % (lan_ip, PORT))
    print('  Database file:   %s' % DB_PATH)
    print('  Press Ctrl+C to stop.')
    print('=' * 52)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print('\nServer stopped.')
        server.shutdown()
