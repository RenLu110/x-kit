from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from functools import partial
from pathlib import Path

root = Path(__file__).resolve().parents[1]
server = ThreadingHTTPServer(('127.0.0.1', 8789), partial(SimpleHTTPRequestHandler, directory=str(root)))
print('Preview: http://127.0.0.1:8789/preview/', flush=True)
server.serve_forever()
