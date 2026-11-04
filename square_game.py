"""
Square Game - a tiny two-computer game over the local network.

One computer runs this script:   python square_game.py
Both computers open the address it prints (http://<this-computer's-ip>:8000)
in a browser. When one player types a number, its square appears on the
other player's screen.

Uses only the Python standard library - nothing to install.
"""

import json
import os
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

PORT = 8000
HTML_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "square_game.html")

messages = []          # list of {"id", "sender", "number", "square"}
lock = threading.Lock()


def get_lan_ip():
    """Find this computer's IP address on the local network."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no data is sent; just picks the right network card
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/":
            with open(HTML_FILE, "rb") as f:
                body = f.read()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        elif url.path == "/messages":
            # Return every message newer than ?since=N
            since = int(parse_qs(url.query).get("since", ["0"])[0])
            with lock:
                new = [m for m in messages if m["id"] > since]
            self.send_json(new)
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != "/send":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length", 0))
        try:
            data = json.loads(self.rfile.read(length))
            number = float(data["number"])
            sender = str(data["sender"])
        except (ValueError, KeyError, TypeError):
            self.send_json({"error": "please send a valid number"}, 400)
            return

        if number.is_integer():
            number = int(number)
        with lock:
            msg = {"id": len(messages) + 1, "sender": sender,
                   "number": number, "square": number * number}
            messages.append(msg)
        print(f"{sender} sent {number} -> square is {msg['square']}")
        self.send_json(msg)

    def log_message(self, *args):
        pass  # keep the console quiet; we print our own messages


if __name__ == "__main__":
    ip = get_lan_ip()
    server = ThreadingHTTPServer(("0.0.0.0", PORT), Handler)
    print("Square Game server is running!")
    print(f"  On this computer open:   http://localhost:{PORT}")
    print(f"  On the other computer:   http://{ip}:{PORT}")
    print("Press Ctrl+C to stop.")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
# //python "C:\Users\yifar\OneDrive\Desktop\Chess\square_game.py"