#!/usr/bin/env python3
"""HTTPS server with auto-generated self-signed cert for local network camera access."""
import http.server, ssl, os, subprocess, sys

PORT = 5502
CERT = os.path.join(os.path.dirname(__file__), 'cert.pem')
KEY  = os.path.join(os.path.dirname(__file__), 'key.pem')

# Generate self-signed cert if missing
if not os.path.exists(CERT):
    print("Generating self-signed certificate...")
    subprocess.run([
        'openssl', 'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', KEY, '-out', CERT,
        '-days', '365', '-nodes',
        '-subj', '/CN=localhost'
    ], check=True, capture_output=True)
    print("Certificate created.")

os.chdir(os.path.dirname(os.path.abspath(__file__)))

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        print(f"  {self.address_string()} → {args[0]} {args[1]}")

ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CERT, KEY)

with http.server.HTTPServer(('0.0.0.0', PORT), Handler) as httpd:
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    # Get local IP
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
    except:
        ip = "localhost"
    print(f"\n{'='*50}")
    print(f"  HTTPS server running")
    print(f"  Open on your phone: https://{ip}:{PORT}/index.html")
    print(f"  (Accept the security warning on your phone)")
    print(f"{'='*50}\n")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
