from http.server import HTTPServer, BaseHTTPRequestHandler
import json
import time

class Handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()
        
    def do_POST(self):
        if self.path == '/v1/chat/completions':
            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Cache-Control', 'no-cache')
            self.end_headers()
            
            content_length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(content_length).decode('utf-8')
            
            if "scope" in body.lower() or "dag" in body.lower() or "automate" in body.lower():
                # Emulate DAG proposal
                text = "```json\n" + json.dumps({
                    "nodes": [
                        {"id": "node_1", "dependencies": [], "prompt": "Test node 1"}
                    ]
                }) + "\n```"
            else:
                text = "I am a mock response from the local endpoint."
                
            for word in text.split(" "):
                chunk = json.dumps({"choices": [{"delta": {"content": word + " "}}]})
                self.wfile.write(f"data: {chunk}\n\n".encode('utf-8'))
                self.wfile.flush()
                time.sleep(0.1)
                
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()

httpd = HTTPServer(('localhost', 3001), Handler)
print("Serving on port 3001")
httpd.serve_forever()
