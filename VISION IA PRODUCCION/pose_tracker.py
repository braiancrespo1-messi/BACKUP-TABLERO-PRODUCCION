import cv2
import numpy as np
import time
import argparse
import sys
import os
import datetime
import threading
import collections
from http.server import BaseHTTPRequestHandler, HTTPServer
import socketserver
import sqlite3


# Intentar importar ultralytics
try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False

# Intentar importar firebase-admin
try:
    import firebase_admin
    from firebase_admin import credentials, firestore
    FIREBASE_AVAILABLE = True
except ImportError:
    FIREBASE_AVAILABLE = False


# Variables globales de Firebase
db = None

def init_firebase(cred_path):
    global db
    if not FIREBASE_AVAILABLE:
        print("[WARNING] La librería 'firebase-admin' no está instalada. No se pueden subir datos a la nube.")
        return False
    if not cred_path or not os.path.exists(cred_path):
        return False
    try:
        cred = credentials.Certificate(cred_path)
        firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("[OK] Conexión establecida con Firebase Firestore con éxito.")
        return True
    except Exception as e:
        print(f"[ERROR] Error al conectar con Firebase: {e}")
        return False


def update_live_status(workstation_id, state):
    global db
    if db is None:
        return
    try:
        doc_ref = db.collection('workstation_status').document(str(workstation_id))
        doc_ref.set({
            'workstation_id': workstation_id,
            'state': state,
            'last_update': firestore.SERVER_TIMESTAMP
        })
    except Exception as e:
        print(f"[WARNING] Error al actualizar estado en vivo en Firestore: {e}")


def save_interval_to_db(workstation_id, state, start_epoch, end_epoch, duration, clip_filename=None):
    global db
    if db is None:
        return
    try:
        start_dt = datetime.datetime.fromtimestamp(start_epoch)
        end_dt = datetime.datetime.fromtimestamp(end_epoch)
        
        doc_data = {
            'workstation_id': workstation_id,
            'state': state,
            'start_time': start_dt,
            'end_time': end_dt,
            'duration_seconds': round(duration, 1),
            'timestamp': firestore.SERVER_TIMESTAMP
        }
        if clip_filename:
            doc_data['clip_filename'] = clip_filename
            
        db.collection('workstation_logs').add(doc_data)
        print(f"[DB] Guardado bloque en Firestore: PUESTO #{workstation_id} estuvo {state} por {duration:.1f}s")
        if clip_filename:
            print(f"[DB] Clip asociado: {clip_filename}")
    except Exception as e:
        print(f"[WARNING] Error al guardar intervalo en base de datos: {e}")


# ==========================================
# Variables y funciones de SQLite (Local)
# ==========================================
DB_FILENAME = "workstation_telemetry.db"

def init_sqlite():
    try:
        conn = sqlite3.connect(DB_FILENAME)
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS workstation_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                workstation_id INTEGER,
                state TEXT,
                start_time TEXT,
                end_time TEXT,
                duration_seconds REAL,
                clip_filename TEXT
            )
        """)
        conn.commit()
        conn.close()
        print("[SQLITE] Base de datos inicializada correctamente.")
    except Exception as e:
        print(f"[SQLITE ERROR] Error al inicializar SQLite: {e}")

def save_interval_to_sqlite(workstation_id, state, start_epoch, end_epoch, duration, clip_filename=None):
    try:
        conn = sqlite3.connect(DB_FILENAME)
        cursor = conn.cursor()
        start_dt = datetime.datetime.fromtimestamp(start_epoch).isoformat()
        end_dt = datetime.datetime.fromtimestamp(end_epoch).isoformat()
        cursor.execute("""
            INSERT INTO workstation_logs (workstation_id, state, start_time, end_time, duration_seconds, clip_filename)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (workstation_id, state, start_dt, end_dt, duration, clip_filename))
        conn.commit()
        conn.close()
        print(f"[SQLITE] Guardado bloque: PUESTO #{workstation_id} estuvo {state} por {duration:.1f}s")
    except Exception as e:
        print(f"[SQLITE ERROR] Error al guardar intervalo en SQLite: {e}")



# Variables globales para el Servidor de Video en Vivo
latest_processed_frame = None
frame_lock = threading.Lock()

# Variables globales para el intervalo en progreso (compartidas con la API de historial)
current_interval_state = "CALIBRANDO"
current_interval_start = time.time()
current_clip_name = None

# Variables globales para el estado local y telemetría sin conexión a internet (CORS habilitado)
global_status = {
    "workstation_id": 0,
    "state": "CALIBRANDO",
    "efficiency": 100.0,
    "active_time": 0.0,
    "idle_time": 0.0,
    "no_person_time": 0.0,
    "active_seconds": 0.0,
    "idle_seconds": 0.0,
    "no_person_seconds": 0.0,
    "total_seconds": 0.0,
    "avg_motion": 0.0,
    "fps": 0.0,
    "people_count": 0
}

class StreamingHandler(BaseHTTPRequestHandler):
    """
    Controlador HTTP para servir el video en vivo (MJPEG) y reproducir los clips grabados (.mp4).
    """
    def do_GET(self):
        global latest_processed_frame
        global global_status
        
        # Endpoint para ver video en vivo con esqueletos
        if self.path == '/video':
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
            # Permitir que el dashboard incruste el video sin problemas de CORS
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            try:
                while True:
                    time.sleep(0.04) # Controlar a ~25 FPS para ahorrar ancho de banda local
                    with frame_lock:
                        if latest_processed_frame is None:
                            continue
                        ret, jpeg = cv2.imencode('.jpg', latest_processed_frame)
                        if not ret:
                            continue
                        frame_bytes = jpeg.tobytes()
                        
                    self.wfile.write(b'--frame\r\n')
                    self.send_header('Content-type', 'image/jpeg')
                    self.send_header('Content-length', str(len(frame_bytes)))
                    self.end_headers()
                    self.wfile.write(frame_bytes)
                    self.wfile.write(b'\r\n')
            except Exception:
                # El navegador cerró la conexión
                pass
                
        # Endpoint para obtener el estado instantáneo y telemetría local
        elif self.path == '/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            import json
            self.wfile.write(json.dumps(global_status).encode())
            
        elif self.path == '/history':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            import json
            import sqlite3
            logs = []
            try:
                # 1. Añadir el intervalo actual en progreso si existe y no es "CALIBRANDO"
                global current_interval_state, current_interval_start, current_clip_name
                if current_interval_state is not None and current_interval_state != "CALIBRANDO":
                    duration = time.time() - current_interval_start
                    start_dt = datetime.datetime.fromtimestamp(current_interval_start).isoformat()
                    end_dt = datetime.datetime.now().isoformat()
                    logs.append({
                        "id": 999999,
                        "workstation_id": global_status["workstation_id"],
                        "state": current_interval_state,
                        "start_time": start_dt,
                        "end_time": end_dt,
                        "duration_seconds": round(duration, 1),
                        "clip_filename": current_clip_name if current_interval_state == "IDLE" else None
                    })

                conn = sqlite3.connect(DB_FILENAME)
                conn.row_factory = sqlite3.Row
                cursor = conn.cursor()
                cursor.execute("SELECT * FROM workstation_logs ORDER BY start_time DESC LIMIT 2000")
                rows = cursor.fetchall()
                for row in rows:
                    logs.append({
                        "id": row["id"],
                        "workstation_id": row["workstation_id"],
                        "state": row["state"],
                        "start_time": row["start_time"],
                        "end_time": row["end_time"],
                        "duration_seconds": row["duration_seconds"],
                        "clip_filename": row["clip_filename"]
                    })
                conn.close()
            except Exception as e:
                print(f"[SQLITE ERROR] Al leer historial para API: {e}")
            self.wfile.write(json.dumps(logs).encode())
            
        # Endpoint para listar los clips de ociosidad grabados
        elif self.path == '/clips-list':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            import json
            clips = []
            if os.path.exists('videos_ocio'):
                try:
                    files = os.listdir('videos_ocio')
                    mp4_files = [f for f in files if f.endswith('.mp4')]
                    mp4_files.sort(key=lambda x: os.path.getmtime(os.path.join('videos_ocio', x)), reverse=True)
                    for f in mp4_files:
                        path = os.path.join('videos_ocio', f)
                        mtime = os.path.getmtime(path)
                        dt = datetime.datetime.fromtimestamp(mtime)
                        clips.append({
                            'filename': f,
                            'timestamp': dt.strftime("%Y-%m-%d %H:%M:%S"),
                            'size_bytes': os.path.getsize(path)
                        })
                except Exception as e:
                    print(f"[ERROR] Al listar clips locales: {e}")
            self.wfile.write(json.dumps(clips).encode())
            
        # Endpoint para descargar/reproducir los clips de ociosidad grabados
        elif self.path.startswith('/clips/'):
            filename = self.path[7:]
            clip_path = os.path.join('videos_ocio', filename)
            
            if os.path.exists(clip_path):
                self.send_response(200)
                # Permitir solicitudes CORS para reproducir videos en el dashboard
                self.send_header('Access-Control-Allow-Origin', '*')
                
                if filename.endswith('.mp4'):
                    self.send_header('Content-type', 'video/mp4')
                else:
                    self.send_header('Content-type', 'video/x-msvideo')
                    
                file_size = os.path.getsize(clip_path)
                self.send_header('Content-length', str(file_size))
                self.end_headers()
                
                try:
                    with open(clip_path, 'rb') as f:
                        self.wfile.write(f.read())
                except Exception:
                    pass
            else:
                self.send_error(404, "Clip no encontrado")
        else:
            self.send_error(404, "Ruta no encontrada")


class ThreadedHTTPServer(socketserver.ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def start_streaming_server(port):
    """
    Arranca el servidor de video en segundo plano.
    """
    try:
        server = ThreadedHTTPServer(('0.0.0.0', port), StreamingHandler)
        server_thread = threading.Thread(target=server.serve_forever)
        server_thread.daemon = True
        server_thread.start()
        print(f"[OK] Servidor de Streaming levantado en: http://localhost:{port}/video")
        return server
    except Exception as e:
        print(f"[ERROR] No se pudo levantar el servidor de video en puerto {port}: {e}")
        return None


class WorkerTracker:
    """
    Rastreador de pose y movimiento para un operario.
    """
    def __init__(self, history_len=30, motion_threshold=5.0, workstation_id=0):
        self.history_len = history_len
        self.motion_threshold = motion_threshold
        self.workstation_id = workstation_id
        
        self.prev_joints = {}
        self.motion_history = []
        
        self.state = "CALIBRANDO"
        self.avg_motion = 0.0

        # Control de intervalos
        self.state_start_time = time.time()
        self.last_db_state = None

    def update(self, keypoints, keypoint_confs):
        joints_of_interest = [5, 6, 7, 8, 9, 10]
        current_motion = 0.0
        valid_joints_count = 0

        for joint_idx in joints_of_interest:
            conf = keypoint_confs[joint_idx]
            if conf < 0.5:
                continue
            
            x, y = keypoints[joint_idx]
            
            if joint_idx in self.prev_joints:
                prev_x, prev_y = self.prev_joints[joint_idx]
                distance = np.sqrt((x - prev_x)**2 + (y - prev_y)**2)
                
                if distance < 150.0:
                    current_motion += distance
                    valid_joints_count += 1
            
            self.prev_joints[joint_idx] = (x, y)

        normalized_motion = current_motion / valid_joints_count if valid_joints_count > 0 else 0.0

        self.motion_history.append(normalized_motion)
        if len(self.motion_history) > self.history_len:
            self.motion_history.pop(0)

        if len(self.motion_history) > 0:
            self.avg_motion = np.mean(self.motion_history)
        else:
            self.avg_motion = 0.0

        if len(self.motion_history) < self.history_len // 2:
            self.state = "CALIBRANDO"
        elif self.avg_motion >= self.motion_threshold:
            self.state = "ACTIVE"
        else:
            self.state = "IDLE"

        return self.state, normalized_motion, self.avg_motion


class MultiWorkerTracker:
    """
    Rastrea múltiples personas basándose en centroides.
    """
    def __init__(self, history_len=30, motion_threshold=5.0, workstation_id=0):
        self.history_len = history_len
        self.motion_threshold = motion_threshold
        self.workstation_id = workstation_id
        self.trackers = {}
        self.prev_centers = {}
        self.next_id = 0

    def update(self, detections):
        current_centers = {}
        matched_ids = {}
        dist_threshold = 180.0
        
        for i, det in enumerate(detections):
            bbox = det['bbox']
            cx = (bbox[0] + bbox[2]) / 2.0
            cy = (bbox[1] + bbox[3]) / 2.0
            
            best_id = None
            best_dist = float('inf')
            
            for track_id, prev_center in self.prev_centers.items():
                if track_id in matched_ids.values():
                    continue
                dist = np.sqrt((cx - prev_center[0])**2 + (cy - prev_center[1])**2)
                if dist < dist_threshold and dist < best_dist:
                    best_dist = dist
                    best_id = track_id
            
            if best_id is not None:
                current_centers[best_id] = (cx, cy)
                matched_ids[i] = best_id
            else:
                new_id = self.next_id
                self.next_id += 1
                self.trackers[new_id] = WorkerTracker(self.history_len, self.motion_threshold, self.workstation_id)
                current_centers[new_id] = (cx, cy)
                matched_ids[i] = new_id
                
        # Limpieza
        active_ids = set(matched_ids.values())
        for track_id in list(self.trackers.keys()):
            if track_id not in active_ids:
                del self.trackers[track_id]
                if track_id in self.prev_centers:
                    del self.prev_centers[track_id]
                    
        self.prev_centers = current_centers
        
        results = []
        for i, det in enumerate(detections):
            track_id = matched_ids[i]
            tracker = self.trackers[track_id]
            state, raw, avg = tracker.update(det['keypoints'], det['confs'])
            
            results.append({
                'track_id': track_id,
                'bbox': det['bbox'],
                'keypoints': det['keypoints'],
                'confs': det['confs'],
                'state': state,
                'raw_motion': raw,
                'avg_motion': avg,
                'motion_history': list(tracker.motion_history)
            })
            
        results.sort(key=lambda x: x['track_id'])
        return results


class MockVideoSource:
    def __init__(self, width=640, height=480, fps=30):
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_idx = 0
        
    def read(self):
        # Simular velocidad de fotogramas (30 FPS) para no saturar el procesador
        time.sleep(1.0 / self.fps)
        frame = np.ones((self.height, self.width, 3), dtype=np.uint8) * 22
        
        for x in range(0, self.width, 80):
            cv2.line(frame, (x, 0), (x, self.height), (32, 32, 32), 1)
        for y in range(0, self.height, 80):
            cv2.line(frame, (0, y), (self.width, y), (32, 32, 32), 1)
            
        cv2.putText(frame, "MODO SIMULACION (MOCK STREAM)", (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 170, 255), 1, lineType=cv2.LINE_AA)
        cv2.putText(frame, "Presione 'ESC' o 'Q' para salir", (20, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 120, 120), 1, lineType=cv2.LINE_AA)
        
        # Ciclos de 10s activo, 10s ocioso
        t = self.frame_idx / self.fps
        cycle_time = 20.0
        is_active_phase = (t % cycle_time) < 10.0
        
        cx, cy = self.width // 2, self.height // 2 + 30
        
        cv2.rectangle(frame, (cx - 150, cy + 90), (cx + 150, cy + 120), (60, 60, 60), -1)
        cv2.putText(frame, "BANCO DE TRABAJO TMC", (cx - 90, cy + 110),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, lineType=cv2.LINE_AA)
        
        keypoints = np.zeros((17, 2), dtype=np.float32)
        confs = np.ones(17, dtype=np.float32)
        
        keypoints[0] = [cx, cy - 90]
        keypoints[5] = [cx - 45, cy - 60]
        keypoints[6] = [cx + 45, cy - 60]
        keypoints[11] = [cx - 25, cy + 30]
        keypoints[12] = [cx + 25, cy + 30]
        
        if is_active_phase:
            speed = 8.0
            le_x = cx - 75
            le_y = cy - 30 + np.sin(t * speed) * 12
            lw_x = cx - 95 + np.cos(t * speed) * 10
            lw_y = cy + 10 + np.sin(t * speed) * 22
            
            re_x = cx + 75
            re_y = cy - 30 + np.cos(t * speed) * 10
            rw_x = cx + 95 + np.sin(t * speed) * 12
            rw_y = cy + 10 + np.cos(t * speed) * 18
            
            cv2.putText(frame, "OPERARIO ACTIVO (ARMADO)", (cx - 110, cy - 140),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 170), 2, lineType=cv2.LINE_AA)
        else:
            noise = np.sin(t * 0.5) * 1.5
            le_x, le_y = cx - 70 + noise, cy - 20
            lw_x, lw_y = cx - 80 + noise, cy + 50
            re_x, re_y = cx + 70 + noise, cy - 20
            rw_x, rw_y = cx + 80 + noise, cy + 50
            
            cv2.putText(frame, "OPERARIO OCIOSO (IDLE)", (cx - 95, cy - 140),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 120, 255), 2, lineType=cv2.LINE_AA)
            
        keypoints[7] = [le_x, le_y]
        keypoints[8] = [re_x, re_y]
        keypoints[9] = [lw_x, lw_y]
        keypoints[10] = [rw_x, rw_y]
        
        keypoints[13] = [cx - 25, cy + 100]
        keypoints[14] = [cx + 25, cy + 100]
        keypoints[15] = [cx - 30, cy + 170]
        keypoints[16] = [cx + 30, cy + 170]
        
        cv2.circle(frame, (int(keypoints[0][0]), int(keypoints[0][1])), 22, (220, 220, 220), -1)
        cv2.line(frame, (int(keypoints[5][0]), int(keypoints[5][1])), (int(keypoints[6][0]), int(keypoints[6][1])), (220, 220, 220), 4)
        cv2.line(frame, (int(keypoints[5][0]), int(keypoints[5][1])), (int(keypoints[7][0]), int(keypoints[7][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[7][0]), int(keypoints[7][1])), (int(keypoints[9][0]), int(keypoints[9][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[6][0]), int(keypoints[6][1])), (int(keypoints[8][0]), int(keypoints[8][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[8][0]), int(keypoints[8][1])), (int(keypoints[10][0]), int(keypoints[10][1])), (200, 200, 200), 3)
        cv2.line(frame, (cx, cy - 60), (cx, cy + 30), (220, 220, 220), 4)
        cv2.line(frame, (int(keypoints[11][0]), int(keypoints[11][1])), (int(keypoints[12][0]), int(keypoints[12][1])), (220, 220, 220), 4)
        cv2.line(frame, (int(keypoints[11][0]), int(keypoints[11][1])), (int(keypoints[13][0]), int(keypoints[13][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[13][0]), int(keypoints[13][1])), (int(keypoints[15][0]), int(keypoints[15][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[12][0]), int(keypoints[12][1])), (int(keypoints[14][0]), int(keypoints[14][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[14][0]), int(keypoints[14][1])), (int(keypoints[16][0]), int(keypoints[16][1])), (200, 200, 200), 3)
        
        self.frame_idx += 1
        
        mock_bbox = [cx - 100, cy - 120, cx + 100, cy + 180]
        mock_detection = {
            'bbox': mock_bbox,
            'keypoints': keypoints,
            'confs': confs
        }
        
        return True, frame, [mock_detection]
        
    def isOpened(self):
        return True
        
    def release(self):
        pass


def draw_skeleton(frame, keypoints, confs, state):
    if state == "ACTIVE":
        color_linea = (170, 255, 0)
        color_nodo = (220, 255, 100)
    elif state == "IDLE":
        color_linea = (0, 120, 255)
        color_nodo = (80, 180, 255)
    else:
        color_linea = (255, 170, 0)
        color_nodo = (255, 200, 100)

    conexiones = [
        (5, 6), (5, 7), (7, 9), (6, 8), (8, 10),
        (5, 11), (6, 12), (11, 12),
        (11, 13), (13, 15), (12, 14), (14, 16)
    ]

    for p1_idx, p2_idx in conexiones:
        if confs[p1_idx] > 0.5 and confs[p2_idx] > 0.5:
            pt1 = (int(keypoints[p1_idx][0]), int(keypoints[p1_idx][1]))
            pt2 = (int(keypoints[p2_idx][0]), int(keypoints[p2_idx][1]))
            cv2.line(frame, pt1, pt2, color_linea, 2, lineType=cv2.LINE_AA)

    for i in range(17):
        if confs[i] > 0.5:
            pt = (int(keypoints[i][0]), int(keypoints[i][1]))
            cv2.circle(frame, pt, 4, color_nodo, -1, lineType=cv2.LINE_AA)
            cv2.circle(frame, pt, 6, color_linea, 1, lineType=cv2.LINE_AA)


def draw_telemetry_chart(frame, x, y, width, height, history, threshold, state, raw_motion, avg_motion, workstation_id):
    overlay = frame.copy()
    cv2.rectangle(overlay, (x, y), (x + width, y + height), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    
    cv2.rectangle(frame, (x, y), (x + width, y + height), (60, 60, 60), 1, lineType=cv2.LINE_AA)
    
    cv2.putText(frame, f"TELEMETRIA: PUESTO #{workstation_id}", (x + 15, y + 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1, lineType=cv2.LINE_AA)
    
    if state == "ACTIVE":
        state_color = (170, 255, 0)
    elif state == "IDLE":
        state_color = (0, 120, 255)
    else:
        state_color = (255, 170, 0)
        
    cv2.putText(frame, f"ESTADO: {state}", (x + 15, y + 48),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, state_color, 2, lineType=cv2.LINE_AA)
    
    cv2.putText(frame, f"Mov. Promedio: {avg_motion:.2f} px/f", (x + 15, y + 70),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1, lineType=cv2.LINE_AA)
    cv2.putText(frame, f"Mov. Instantaneo: {raw_motion:.2f} px/f", (x + 15, y + 85),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1, lineType=cv2.LINE_AA)
    
    chart_y_start = y + 100
    chart_height = height - 115
    chart_y_end = chart_y_start + chart_height
    
    cv2.rectangle(frame, (x + 15, chart_y_start), (x + width - 15, chart_y_end), (40, 40, 40), 1)
    
    max_val = max(15.0, max(history) if len(history) > 0 else 0)
    
    def val_to_chart_y(val):
        ratio = val / max_val
        return int(chart_y_end - ratio * (chart_height - 10) - 5)
    
    thresh_y = val_to_chart_y(threshold)
    if chart_y_start < thresh_y < chart_y_end:
        cv2.line(frame, (x + 16, thresh_y), (x + width - 16, thresh_y), (0, 0, 255), 1, lineType=cv2.LINE_AA)
        cv2.putText(frame, f"UMBRAL ({threshold:.1f})", (x + width - 95, thresh_y - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 0, 255), 1, lineType=cv2.LINE_AA)

    for i in range(1, 3):
        grid_y = int(chart_y_start + i * chart_height / 3)
        cv2.line(frame, (x + 16, grid_y), (x + width - 16, grid_y), (35, 35, 35), 1)

    if len(history) > 1:
        points = []
        dx = (width - 30) / (len(history) - 1)
        for i, val in enumerate(history):
            px = int((x + 15) + i * dx)
            py = val_to_chart_y(val)
            points.append((px, py))
            
        for i in range(len(points) - 1):
            cv2.line(frame, points[i], points[i+1], state_color, 2, lineType=cv2.LINE_AA)


def main():
    parser = argparse.ArgumentParser(description="Tracker de Productividad y Pose Humana para Puestos de Trabajo.")
    parser.add_argument("--source", type=str, default="mock", help="Ruta de video, URL RTSP local o 'mock'.")
    parser.add_argument("--threshold", type=float, default=6.0, help="Umbral de movimiento en píxeles.")
    parser.add_argument("--history", type=int, default=30, help="Largo de la ventana de frames.")
    parser.add_argument("--no-view", action="store_true", help="Ejecutar sin interfaz gráfica.")
    parser.add_argument("--workstation", type=int, default=0, help="ID del puesto (0 al 4). Defecto: 0.")
    parser.add_argument("--firebase", type=str, default="", help="Ruta del archivo serviceAccountKey.json.")
    parser.add_argument("--port", type=int, default=8000, help="Puerto para el streaming de video y descarga de clips. Defecto: 8000.")
    parser.add_argument("--idle-trigger", type=float, default=5.0, help="Segundos seguidos inactivo para activar grabación. Defecto: 5.0.")
    args = parser.parse_args()
    
    global global_status, current_interval_state, current_interval_start, current_clip_name
    global_status["workstation_id"] = args.workstation

    print("======================================================================")
    print(f" INICIALIZANDO DETECTOR DE POSE - PUESTO #{args.workstation} - TMC 2.0")
    print("======================================================================")
    print(f"Fuente de video: {args.source}")
    print(f"Umbral de Actividad: {args.threshold} px/f")
    print(f"Puerto de Streaming: {args.port}")
    print(f"Tiempo de espera ocio: {args.idle_trigger} seg")
    print("======================================================================")

    # 1. Inicializar base de datos
    init_sqlite()
    firebase_active = False
    if args.firebase:
        firebase_active = init_firebase(args.firebase)

    # 2. Levantar el micro-servidor de streaming local
    start_streaming_server(args.port)

    # 3. Configurar entrada de video
    is_mock = args.source.lower() == "mock"
    cap = None
    mock_source = None
    
    if is_mock:
        print("[INFO] Iniciando en Modo Simulación local.")
        mock_source = MockVideoSource(fps=30)
    else:
        source = args.source
        if source.isdigit():
            source = int(source)
        cap = cv2.VideoCapture(source)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        if not cap.isOpened():
            print(f"[ERROR] No se pudo abrir la fuente: {args.source}. Fallando a simulación...")
            is_mock = True
            mock_source = MockVideoSource(fps=30)

    # 4. Cargar modelo YOLO
    model = None
    if not is_mock:
        if not ULTRALYTICS_AVAILABLE:
            print("[ERROR] Ultralytics no instalado.")
            sys.exit(1)
        try:
            model = YOLO("yolov8n-pose.pt")
        except Exception as e:
            print(f"[ERROR] Fallo al cargar yolov8n-pose: {e}")
            sys.exit(1)

    # 5. Inicializar el rastreador de pose y estados
    manager = MultiWorkerTracker(history_len=args.history, motion_threshold=args.threshold, workstation_id=args.workstation)

    # 6. Configurar la grabación automática y búfer circular
    # Guardamos los últimos de 120 frames (~5 segundos a 24-30 FPS)
    frame_buffer = collections.deque(maxlen=120)
    is_recording = False
    video_writer = None
    
    idle_streak_frames = 0
    record_frame_count = 0
    record_start_time = 0
    current_clip_name = None
    
    # Control de transiciones de estado para base de datos
    current_interval_state = None
    current_interval_start = time.time()

    # Control de latidos y estado de Firebase para optimizar escrituras
    last_firebase_state = None
    last_firebase_heartbeat = 0.0
    
    # Asegurar que existe la carpeta para los clips de ociosidad
    if not os.path.exists('videos_ocio'):
        os.makedirs('videos_ocio')

    # Variables FPS
    last_time = time.time()
    frame_count = 0
    fps = 0.0
    
    # Tiempo de control del bucle para telemetría local
    last_loop_time = time.time()

    global latest_processed_frame

    try:
        while True:
            detections = []
            
            # Obtener frame
            if is_mock:
                ret, frame, detections = mock_source.read()
            else:
                ret, frame = cap.read()
                if not ret:
                    break
                results = model(frame, verbose=False)
                for r in results:
                    if r.keypoints is not None:
                        boxes = r.boxes.xyxy.cpu().numpy()
                        kpts = r.keypoints.xy.cpu().numpy()
                        confs = r.keypoints.conf.cpu().numpy() if r.keypoints.conf is not None else np.ones((len(kpts), 17))
                        for i in range(len(kpts)):
                            detections.append({
                                'bbox': boxes[i],
                                'keypoints': kpts[i],
                                'confs': confs[i]
                            })

            # Copiar el frame original para procesar
            processed_frame = frame.copy()

            # Lógica de estados
            tracked_workers = manager.update(detections)
            
            # Determinar el estado principal del puesto en esta iteración
            current_state = "CALIBRANDO"
            active_worker = None
            
            if len(tracked_workers) > 0:
                # Tomar el operario principal (worker 0 o el que tenga ID menor)
                active_worker = tracked_workers[0]
                current_state = active_worker['state']
            else:
                current_state = "NO_PERSON"
                
            # Lógica de telemetría local (Cálculo de tiempo y eficiencia offline)
            now_loop = time.time()
            dt = now_loop - last_loop_time
            last_loop_time = now_loop
            
            global_status["state"] = current_state
            global_status["fps"] = float(fps)
            global_status["people_count"] = int(len(tracked_workers))
            
            if len(tracked_workers) > 0:
                global_status["avg_motion"] = float(active_worker['avg_motion'])
                if current_state == "ACTIVE":
                    global_status["active_seconds"] += dt
                elif current_state == "IDLE":
                    global_status["idle_seconds"] += dt
            else:
                global_status["avg_motion"] = 0.0
                global_status["no_person_seconds"] += dt
                
            global_status["total_seconds"] += dt
            if global_status["total_seconds"] > 0:
                global_status["efficiency"] = float((global_status["active_seconds"] / global_status["total_seconds"]) * 100.0)
            global_status["active_time"] = float(global_status["active_seconds"] / 3600.0)
            global_status["idle_time"] = float(global_status["idle_seconds"] / 3600.0)
            global_status["no_person_time"] = float(global_status["no_person_seconds"] / 3600.0)
                
            # Actualizar DB en vivo con Firebase si está activo (optimizando escrituras)
            if firebase_active:
                now_time = time.time()
                if (current_state != last_firebase_state) or (now_time - last_firebase_heartbeat > 15.0):
                    update_live_status(args.workstation, current_state)
                    last_firebase_state = current_state
                    last_firebase_heartbeat = now_time

            # Dibujar elementos
            for worker in tracked_workers:
                track_id = worker['track_id']
                bbox = worker['bbox']
                state = worker['state']
                raw_m = worker['raw_motion']
                avg_m = worker['avg_motion']
                hist = worker['motion_history']
                
                # Logs en consola
                print(f"[PUESTO #{args.workstation}] Mov: {raw_m:5.2f} px/f | Prom: {avg_m:5.2f} px/f | Estado: {state}")
                
                # Dibujar esqueleto y caja
                color_caja = (170, 255, 0) if state == "ACTIVE" else ((0, 120, 255) if state == "IDLE" else (255, 170, 0))
                x1, y1, x2, y2 = map(int, bbox)
                cv2.rectangle(processed_frame, (x1, y1), (x2, y2), color_caja, 2)
                draw_skeleton(processed_frame, worker['keypoints'], worker['confs'], state)
                
            # Dibujar siempre la telemetría en el frame procesado (incluso si no hay operario)
            hist_metrics = active_worker['motion_history'] if active_worker else [0.0]
            raw_val = active_worker['raw_motion'] if active_worker else 0.0
            avg_val = active_worker['avg_motion'] if active_worker else 0.0
            draw_telemetry_chart(processed_frame, 15, 15, 230, 240, hist_metrics, args.threshold, current_state, raw_val, avg_val, args.workstation)

            # Calcular FPS
            frame_count += 1
            now = time.time()
            if now - last_time >= 1.0:
                fps = frame_count / (now - last_time)
                frame_count = 0
                last_time = now

            cv2.putText(processed_frame, f"FPS: {fps:.1f}", (processed_frame.shape[1] - 80, processed_frame.shape[0] - 15),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, lineType=cv2.LINE_AA)

            # 7. Actualizar el Búfer Circular e Imagen del Servidor de Video
            with frame_lock:
                latest_processed_frame = processed_frame.copy()
            
            # Guardamos el frame con overlays en el búfer circular (para que el clip final tenga el esqueleto de la IA)
            frame_buffer.append(processed_frame.copy())

            # Lógica de transiciones de estado para grabación en bases de datos (SQLite/Firebase)
            if current_interval_state is None:
                current_interval_state = current_state
                current_interval_start = time.time()
            elif current_state != current_interval_state:
                duration = time.time() - current_interval_start
                if duration >= 1.0:
                    # Guardar intervalo completado en SQLite
                    save_interval_to_sqlite(
                        workstation_id=args.workstation,
                        state=current_interval_state,
                        start_epoch=current_interval_start,
                        end_epoch=time.time(),
                        duration=duration,
                        clip_filename=current_clip_name if current_interval_state == "IDLE" else None
                    )
                    # Guardar en Firebase si está activo
                    if firebase_active:
                        save_interval_to_db(
                            workstation_id=args.workstation,
                            state=current_interval_state,
                            start_epoch=current_interval_start,
                            end_epoch=time.time(),
                            duration=duration,
                            clip_filename=current_clip_name if current_interval_state == "IDLE" else None
                        )
                
                # Si terminamos un IDLE y estábamos grabando, detener la grabación
                if current_interval_state == "IDLE" and is_recording:
                    is_recording = False
                    if video_writer is not None:
                        video_writer.release()
                        video_writer = None
                    print(f"[GRABADORA] Grabación finalizada por cambio de estado a {current_state}.")
                
                # Iniciar el nuevo intervalo
                current_interval_state = current_state
                current_interval_start = time.time()

            # 8. Máquina de Estados para Grabación de Clip de Ociosidad
            if current_state == "IDLE":
                # Incrementar racha de frames ociosos
                idle_streak_frames += 1
                
                # Si está inactivo y superó el número de frames de disparo
                if not is_recording and (idle_streak_frames >= int(30 * args.idle_trigger)):
                    is_recording = True
                    record_frame_count = 0
                    record_start_time = time.time()
                    timestamp_str = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
                    current_clip_name = f"ocio_puesto_{args.workstation}_{timestamp_str}.mp4"
                    clip_path = os.path.join('videos_ocio', current_clip_name)
                    
                    print(f"\n[GRABADORA] !!! PUESTO INACTIVO !!! Guardando pre-búfer e iniciando grabación: {current_clip_name}")
                    
                    # Inicializar el VideoWriter
                    h, w, _ = processed_frame.shape
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    video_writer = cv2.VideoWriter(clip_path, fourcc, 20.0, (w, h))
                    
                    # Escribir los segundos guardados en el pre-búfer circular
                    for old_frame in frame_buffer:
                        video_writer.write(old_frame)
            else:
                idle_streak_frames = 0

            # Si está grabando, escribir frame e incrementar contador
            if is_recording:
                if video_writer is not None:
                    video_writer.write(processed_frame)
                record_frame_count += 1
                
                # Cortar si alcanza duración máxima de 30 segundos
                if record_frame_count >= 900:
                    is_recording = False
                    if video_writer is not None:
                        video_writer.release()
                        video_writer = None
                    print("[GRABADORA] Se alcanzó la duración máxima del clip (30 segundos). Grabación detenida.")

            # Renderizar en ventana local si no está en modo headless
            if not args.no_view:
                cv2.imshow(f"Visualizador - Puesto {args.workstation} - TMC 2.0", processed_frame)
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord('q'):
                    break

    except KeyboardInterrupt:
        print("[INFO] Proceso detenido por el usuario.")
    finally:
        # Guardar el último intervalo en progreso al salir
        if current_interval_state is not None:
            duration = time.time() - current_interval_start
            if duration >= 1.0:
                save_interval_to_sqlite(
                    workstation_id=args.workstation,
                    state=current_interval_state,
                    start_epoch=current_interval_start,
                    end_epoch=time.time(),
                    duration=duration,
                    clip_filename=current_clip_name if current_interval_state == "IDLE" else None
                )
                if firebase_active:
                    save_interval_to_db(
                        workstation_id=args.workstation,
                        state=current_interval_state,
                        start_epoch=current_interval_start,
                        end_epoch=time.time(),
                        duration=duration,
                        clip_filename=current_clip_name if current_interval_state == "IDLE" else None
                    )

        # Cerrar y liberar grabadoras y conexiones
        if is_recording and video_writer is not None:
            video_writer.release()
            print("[INFO] Grabación finalizada de forma segura por salida del programa.")
            
        if firebase_active:
            update_live_status(args.workstation, "NO_PERSON")
            
        if cap is not None:
            cap.release()
        if not args.no_view:
            cv2.destroyAllWindows()
        print("[INFO] Recursos liberados de forma segura.")


if __name__ == "__main__":
    main()
