#!/usr/bin/env python3
"""
Local dashboard server for cloudflared tunnel.
Serves the pipeline dashboard + proxies API calls to consensusmarket.com.
"""

import http.server
import json
import os
import urllib.request

PORT = 8787
DASHBOARD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "consensus-db")
API_BASE = "https://consensusmarket.com"

class DashboardHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DASHBOARD_DIR, **kwargs)

    def do_GET(self):
        # Serve dashboard at root
        if self.path == "/" or self.path == "/index.html":
            self.path = "/dashboard.html"
            return super().do_GET()

        # Proxy API calls to the live worker
        if self.path.startswith("/api/"):
            try:
                url = f"{API_BASE}{self.path}"
                req = urllib.request.Request(url)
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = resp.read()
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                    self.send_header("Access-Control-Allow-Origin", "*")
                    self.end_headers()
                    self.wfile.write(data)
            except Exception as e:
                self.send_response(502)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode())
            return

        return super().do_GET()

if __name__ == "__main__":
    with http.server.HTTPServer(("127.0.0.1", PORT), DashboardHandler) as server:
        print(f"Dashboard server running on http://localhost:{PORT}")
        print(f"Cloudflared will expose this at https://consensus.capital.markets")
        server.serve_forever()
