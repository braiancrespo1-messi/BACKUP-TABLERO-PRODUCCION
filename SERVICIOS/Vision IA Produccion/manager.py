import sys
import os
import subprocess
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
import urllib.parse

# Guardamos los procesos de los puestos activos: workstation_id -> Popen object
processes = {}

# Mapeo de carpetas de puestos
def find_video_for_station(station_id):
    base_dir = "videos_prueba"
    if not os.path.exists(base_dir):
        return None
    for item in os.listdir(base_dir):
        path = os.path.join(base_dir, item)
        if os.path.isdir(path) and item.startswith(f"puesto_{station_id + 1}"):
            for f in os.listdir(path):
                if f.lower().endswith(('.mp4', '.avi', '.mkv')):
                    return os.path.join(path, f)
    return None

class ManagerHandler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        
    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        path = parsed_url.path
        query = urllib.parse.parse_qs(parsed_url.query)
        
        # Servir el dashboard web en la ruta raíz
        if path == '/' or path == '/index.html':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                with open('dashboard.html', 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            except Exception as e:
                self.wfile.write(f"Error al leer dashboard.html: {e}".encode('utf-8'))
            return
            
        # Permitir CORS para API
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        
        response_data = {"status": "error", "message": "Endpoint no encontrado"}
        
        if path == '/api/status-all':
            status_list = []
            for i in range(5):
                is_running = i in processes and processes[i].poll() is None
                video_file = find_video_for_station(i)
                status_list.append({
                    "id": i,
                    "running": is_running,
                    "has_video": video_file is not None,
                    "video_path": video_file or ""
                })
            response_data = {"status": "success", "stations": status_list}
            
        elif path == '/api/start-station':
            station_id = int(query.get('id', [-1])[0])
            mode = query.get('mode', ['video'])[0]  # 'video' o 'live'
            
            if station_id < 0 or station_id > 4:
                response_data = {"status": "error", "message": "ID de puesto inválido"}
            else:
                # Si ya está corriendo, detenerlo
                if station_id in processes and processes[station_id].poll() is None:
                    try:
                        processes[station_id].terminate()
                        processes[station_id].wait(timeout=2)
                    except Exception:
                        processes[station_id].kill()
                
                # Determinar la fuente de video
                source = "mock"
                if mode == "video":
                    video_file = find_video_for_station(station_id)
                    if video_file:
                        source = video_file
                    else:
                        source = "mock"
                elif mode == "live":
                    source = "0" # Cámara por defecto (ej. webcam 0)
                
                port = 8000 + station_id
                cmd = [
                    sys.executable, "pose_tracker.py",
                    "--source", source,
                    "--workstation", str(station_id),
                    "--port", str(port),
                    "--no-view"
                ]
                print(f"[MANAGER] Ejecutando: {' '.join(cmd)}")
                p = subprocess.Popen(cmd)
                processes[station_id] = p
                response_data = {"status": "success", "message": f"Puesto {station_id} iniciado en modo {mode}"}
                
        elif path == '/api/stop-station':
            station_id = int(query.get('id', [-1])[0])
            if station_id in processes:
                p = processes[station_id]
                if p.poll() is None:
                    try:
                        p.terminate()
                        p.wait(timeout=2)
                    except Exception:
                        p.kill()
                del processes[station_id]
                response_data = {"status": "success", "message": f"Puesto {station_id} detenido"}
            else:
                response_data = {"status": "success", "message": f"Puesto {station_id} ya estaba detenido"}
                
        self.wfile.write(json.dumps(response_data).encode('utf-8'))

def run_manager():
    server_address = ('', 8080)
    httpd = HTTPServer(server_address, ManagerHandler)
    print("==========================================================")
    print("   INICIANDO SYSTEM MANAGER - VISION IA TMC 2.0")
    print("==========================================================")
    print("Servidor corriendo en: http://localhost:8080/")
    print("==========================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("[MANAGER] Deteniendo todas las estaciones...")
        for pid, p in processes.items():
            if p.poll() is None:
                p.terminate()
                p.wait()
        print("[MANAGER] Saliendo de forma segura.")

if __name__ == '__main__':
    run_manager()
