import cv2
import numpy as np
import time
import argparse
import sys
import os

# Intentar importar ultralytics. Si no está disponible aún, lo informará amablemente.
try:
    from ultralytics import YOLO
    ULTRALYTICS_AVAILABLE = True
except ImportError:
    ULTRALYTICS_AVAILABLE = False


class WorkerTracker:
    """
    Clase para rastrear el movimiento y estado de un operario individual.
    Mantiene el historial de movimiento y aplica suavizado para ACTIVE vs IDLE.
    """
    def __init__(self, history_len=30, motion_threshold=5.0):
        self.history_len = history_len
        self.motion_threshold = motion_threshold
        
        # Historial de posiciones anteriores de articulaciones clave
        # Mapea joint_idx -> (x, y)
        self.prev_joints = {}
        
        # Historial de magnitudes de movimiento (desplazamiento en píxeles)
        self.motion_history = []
        
        # Estado actual del puesto
        self.state = "CALIBRANDO"
        self.avg_motion = 0.0

    def update(self, keypoints, keypoint_confs):
        """
        Actualiza el rastreador con los keypoints del frame actual.
        Retorna (estado, movimiento_actual, movimiento_promedio).
        """
        # Articulaciones de interés: hombros (5, 6), codos (7, 8), muñecas (9, 10)
        # Nos enfocamos en el tren superior ya que es donde se realiza el armado manual.
        joints_of_interest = [5, 6, 7, 8, 9, 10]
        current_motion = 0.0
        valid_joints_count = 0

        for joint_idx in joints_of_interest:
            # Filtrar por confianza para evitar ruido de parpadeo de detección
            conf = keypoint_confs[joint_idx]
            if conf < 0.5:
                continue
            
            x, y = keypoints[joint_idx]
            
            # Si ya teníamos la posición en el frame anterior, calculamos el desplazamiento
            if joint_idx in self.prev_joints:
                prev_x, prev_y = self.prev_joints[joint_idx]
                distance = np.sqrt((x - prev_x)**2 + (y - prev_y)**2)
                
                # Filtrar saltos abruptos por fallas de tracking temporales (> 150px por frame)
                if distance < 150.0:
                    current_motion += distance
                    valid_joints_count += 1
            
            # Actualizar la última posición conocida
            self.prev_joints[joint_idx] = (x, y)

        # Normalizar el movimiento por la cantidad de articulaciones medidas
        normalized_motion = current_motion / valid_joints_count if valid_joints_count > 0 else 0.0

        # Agregar al historial de suavizado
        self.motion_history.append(normalized_motion)
        if len(self.motion_history) > self.history_len:
            self.motion_history.pop(0)

        # Calcular el promedio móvil
        if len(self.motion_history) > 0:
            self.avg_motion = np.mean(self.motion_history)
        else:
            self.avg_motion = 0.0

        # Determinar estado
        if len(self.motion_history) < self.history_len // 2:
            self.state = "CALIBRANDO"
        elif self.avg_motion >= self.motion_threshold:
            self.state = "ACTIVE"
        else:
            self.state = "IDLE"

        return self.state, normalized_motion, self.avg_motion


class MultiWorkerTracker:
    """
    Manejador para escenarios donde hay múltiples personas en la escena.
    Asigna IDs a los operarios mediante proximidad espacial de sus centroides.
    """
    def __init__(self, history_len=30, motion_threshold=5.0):
        self.history_len = history_len
        self.motion_threshold = motion_threshold
        self.trackers = {}     # ID -> WorkerTracker
        self.prev_centers = {} # ID -> (cx, cy)
        self.next_id = 0

    def update(self, detections):
        """
        detections: Lista de diccionarios {'bbox': [x1, y1, x2, y2], 'keypoints': array, 'confs': array}
        """
        current_centers = {}
        matched_ids = {}
        dist_threshold = 180.0 # Píxeles máximos que un operario se movería entre frames
        
        # Paso 1: Emparejar detecciones con rastreadores existentes
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
                # Si no empareja, crear nuevo ID
                new_id = self.next_id
                self.next_id += 1
                self.trackers[new_id] = WorkerTracker(self.history_len, self.motion_threshold)
                current_centers[new_id] = (cx, cy)
                matched_ids[i] = new_id
                
        # Paso 2: Limpieza de rastreadores inactivos
        active_ids = set(matched_ids.values())
        for track_id in list(self.trackers.keys()):
            if track_id not in active_ids:
                del self.trackers[track_id]
                if track_id in self.prev_centers:
                    del self.prev_centers[track_id]
                    
        self.prev_centers = current_centers
        
        # Paso 3: Actualizar y compilar resultados
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
            
        # Ordenar por track_id para consistencia
        results.sort(key=lambda x: x['track_id'])
        return results


class MockVideoSource:
    """
    Genera un flujo de video simulado con un esqueleto en movimiento.
    Permite probar todo el script sin tener cámaras ni GPU conectadas.
    """
    def __init__(self, width=640, height=480, fps=30):
        self.width = width
        self.height = height
        self.fps = fps
        self.frame_idx = 0
        
    def read(self):
        # Crear frame oscuro
        frame = np.ones((self.height, self.width, 3), dtype=np.uint8) * 22
        
        # Dibujar rejilla de fondo (diseño premium industrial)
        for x in range(0, self.width, 80):
            cv2.line(frame, (x, 0), (x, self.height), (32, 32, 32), 1)
        for y in range(0, self.height, 80):
            cv2.line(frame, (0, y), (self.width, y), (32, 32, 32), 1)
            
        cv2.putText(frame, "MODO SIMULACION (MOCK STREAM)", (20, 35),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 170, 255), 1, lineType=cv2.LINE_AA)
        cv2.putText(frame, "Presione 'ESC' o 'Q' para salir", (20, 60),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120, 120, 120), 1, lineType=cv2.LINE_AA)
        
        # Simular ciclos de trabajo (10 seg activo, 10 seg ocioso)
        t = self.frame_idx / self.fps
        cycle_time = 20.0
        is_active_phase = (t % cycle_time) < 10.0
        
        # Centro del operario simulado
        cx, cy = self.width // 2, self.height // 2 + 30
        
        # Banco de trabajo simulado
        cv2.rectangle(frame, (cx - 150, cy + 90), (cx + 150, cy + 120), (60, 60, 60), -1)
        cv2.putText(frame, "BANCO DE TRABAJO TMC", (cx - 90, cy + 110),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.45, (200, 200, 200), 1, lineType=cv2.LINE_AA)
        
        # Mock de Keypoints de pose (17 puntos COCO)
        keypoints = np.zeros((17, 2), dtype=np.float32)
        confs = np.ones(17, dtype=np.float32)
        
        # Cabeza (0) y hombros (5, 6)
        keypoints[0] = [cx, cy - 90]
        keypoints[5] = [cx - 45, cy - 60]  # Hombro Izquierdo
        keypoints[6] = [cx + 45, cy - 60]  # Hombro Derecho
        
        # Caderas (11, 12)
        keypoints[11] = [cx - 25, cy + 30]
        keypoints[12] = [cx + 25, cy + 30]
        
        # Brazos
        if is_active_phase:
            # Movimiento rápido de brazos simulado por senos/cosenos
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
            # Reposo absoluto con leve ruido de cámara
            noise = np.sin(t * 0.5) * 1.5
            le_x, le_y = cx - 70 + noise, cy - 20
            lw_x, lw_y = cx - 80 + noise, cy + 50
            re_x, re_y = cx + 70 + noise, cy - 20
            rw_x, rw_y = cx + 80 + noise, cy + 50
            
            cv2.putText(frame, "OPERARIO OCIOSO (IDLE)", (cx - 95, cy - 140),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 120, 255), 2, lineType=cv2.LINE_AA)
            
        keypoints[7] = [le_x, le_y]  # Codo Izquierdo
        keypoints[8] = [re_x, re_y]  # Codo Derecho
        keypoints[9] = [lw_x, lw_y]  # Muñeca Izquierda
        keypoints[10] = [rw_x, rw_y] # Muñeca Derecha
        
        # Piernas estáticas
        keypoints[13] = [cx - 25, cy + 100]
        keypoints[14] = [cx + 25, cy + 100]
        keypoints[15] = [cx - 30, cy + 170]
        keypoints[16] = [cx + 30, cy + 170]
        
        # Dibujar dibujo del cuerpo
        # Cabeza
        cv2.circle(frame, (int(keypoints[0][0]), int(keypoints[0][1])), 22, (220, 220, 220), -1)
        # Hombros
        cv2.line(frame, (int(keypoints[5][0]), int(keypoints[5][1])), (int(keypoints[6][0]), int(keypoints[6][1])), (220, 220, 220), 4)
        # Hombro Izq a Codo Izq a Muñeca Izq
        cv2.line(frame, (int(keypoints[5][0]), int(keypoints[5][1])), (int(keypoints[7][0]), int(keypoints[7][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[7][0]), int(keypoints[7][1])), (int(keypoints[9][0]), int(keypoints[9][1])), (200, 200, 200), 3)
        # Hombro Der a Codo Der a Muñeca Der
        cv2.line(frame, (int(keypoints[6][0]), int(keypoints[6][1])), (int(keypoints[8][0]), int(keypoints[8][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[8][0]), int(keypoints[8][1])), (int(keypoints[10][0]), int(keypoints[10][1])), (200, 200, 200), 3)
        # Torso
        cv2.line(frame, (cx, cy - 60), (cx, cy + 30), (220, 220, 220), 4)
        # Pelvis
        cv2.line(frame, (int(keypoints[11][0]), int(keypoints[11][1])), (int(keypoints[12][0]), int(keypoints[12][1])), (220, 220, 220), 4)
        # Piernas
        cv2.line(frame, (int(keypoints[11][0]), int(keypoints[11][1])), (int(keypoints[13][0]), int(keypoints[13][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[13][0]), int(keypoints[13][1])), (int(keypoints[15][0]), int(keypoints[15][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[12][0]), int(keypoints[12][1])), (int(keypoints[14][0]), int(keypoints[14][1])), (200, 200, 200), 3)
        cv2.line(frame, (int(keypoints[14][0]), int(keypoints[14][1])), (int(keypoints[16][0]), int(keypoints[16][1])), (200, 200, 200), 3)
        
        self.frame_idx += 1
        
        # Armar la estructura del mock de YOLO
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
    """
    Dibuja un esqueleto estilizado con colores premium dependiendo del estado.
    Color ACTIVE: Verde Neón / Cyan.
    Color IDLE: Naranja / Ámbar.
    Color CALIBRATING: Azul Eléctrico.
    """
    # Definir paleta HSL/RGB para la interfaz
    if state == "ACTIVE":
        color_linea = (170, 255, 0)  # Verde Neón (BGR)
        color_nodo = (220, 255, 100)
    elif state == "IDLE":
        color_linea = (0, 120, 255)  # Ámbar/Naranja (BGR)
        color_nodo = (80, 180, 255)
    else:
        color_linea = (255, 170, 0)  # Azul (BGR)
        color_nodo = (255, 200, 100)

    # Conexiones del esqueleto (COCO standard)
    conexiones = [
        (5, 6),           # Hombro a Hombro
        (5, 7), (7, 9),   # Brazo Izquierdo
        (6, 8), (8, 10),  # Brazo Derecho
        (5, 11), (6, 12), # Hombros a Caderas
        (11, 12),         # Pelvis
        (11, 13), (13, 15), # Pierna Izquierda
        (12, 14), (14, 16)  # Pierna Derecha
    ]

    # Dibujar líneas del esqueleto
    for p1_idx, p2_idx in conexiones:
        if confs[p1_idx] > 0.5 and confs[p2_idx] > 0.5:
            pt1 = (int(keypoints[p1_idx][0]), int(keypoints[p1_idx][1]))
            pt2 = (int(keypoints[p2_idx][0]), int(keypoints[p2_idx][1]))
            cv2.line(frame, pt1, pt2, color_linea, 2, lineType=cv2.LINE_AA)

    # Dibujar nodos en las articulaciones clave
    for i in range(17):
        if confs[i] > 0.5:
            pt = (int(keypoints[i][0]), int(keypoints[i][1]))
            cv2.circle(frame, pt, 4, color_nodo, -1, lineType=cv2.LINE_AA)
            cv2.circle(frame, pt, 6, color_linea, 1, lineType=cv2.LINE_AA)


def draw_telemetry_chart(frame, x, y, width, height, history, threshold, state, raw_motion, avg_motion):
    """
    Dibuja un panel gráfico de telemetría semi-transparente en el frame de video.
    """
    # 1. Crear superposición para fondo semitransparente oscuro
    overlay = frame.copy()
    cv2.rectangle(overlay, (x, y), (x + width, y + height), (15, 15, 15), -1)
    cv2.addWeighted(overlay, 0.75, frame, 0.25, 0, frame)
    
    # Borde exterior del panel
    cv2.rectangle(frame, (x, y), (x + width, y + height), (60, 60, 60), 1, lineType=cv2.LINE_AA)
    
    # 2. Encabezados de texto del Panel
    cv2.putText(frame, "TELEMETRIA DE MOVIMIENTO LOCAL", (x + 15, y + 25),
                cv2.FONT_HERSHEY_SIMPLEX, 0.45, (180, 180, 180), 1, lineType=cv2.LINE_AA)
    
    # Mostrar estado actual con color destacado
    if state == "ACTIVE":
        state_color = (170, 255, 0)
    elif state == "IDLE":
        state_color = (0, 120, 255)
    else:
        state_color = (255, 170, 0)
        
    cv2.putText(frame, f"ESTADO: {state}", (x + 15, y + 48),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, state_color, 2, lineType=cv2.LINE_AA)
    
    # Métricas numéricas
    cv2.putText(frame, f"Movimiento Promedio: {avg_motion:.2f} px/f", (x + 15, y + 70),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (200, 200, 200), 1, lineType=cv2.LINE_AA)
    cv2.putText(frame, f"Movimiento Instantaneo: {raw_motion:.2f} px/f", (x + 15, y + 85),
                cv2.FONT_HERSHEY_SIMPLEX, 0.4, (150, 150, 150), 1, lineType=cv2.LINE_AA)
    
    # 3. Dibujar Gráfico Temporal
    chart_y_start = y + 100
    chart_height = height - 115
    chart_y_end = chart_y_start + chart_height
    
    # Caja del gráfico
    cv2.rectangle(frame, (x + 15, chart_y_start), (x + width - 15, chart_y_end), (40, 40, 40), 1)
    
    # Valor máximo para escalado vertical (mínimo 15 píxeles de escala)
    max_val = max(15.0, max(history) if len(history) > 0 else 0)
    
    def val_to_chart_y(val):
        # Mapea un valor de movimiento a la coordenada Y del frame
        ratio = val / max_val
        return int(chart_y_end - ratio * (chart_height - 10) - 5)
    
    # Línea del Umbral (Threshold)
    thresh_y = val_to_chart_y(threshold)
    if chart_y_start < thresh_y < chart_y_end:
        cv2.line(frame, (x + 16, thresh_y), (x + width - 16, thresh_y), (0, 0, 255), 1, lineType=cv2.LINE_AA)
        cv2.putText(frame, f"UMBRAL ({threshold:.1f})", (x + width - 95, thresh_y - 4),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.32, (0, 0, 255), 1, lineType=cv2.LINE_AA)

    # Dibujar líneas horizontales de cuadrícula (Grid)
    for i in range(1, 3):
        grid_y = int(chart_y_start + i * chart_height / 3)
        cv2.line(frame, (x + 16, grid_y), (x + width - 16, grid_y), (35, 35, 35), 1)

    # Graficar historial de puntos como polilínea continua
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
    parser.add_argument("--source", type=str, default="mock", 
                        help="Ruta de video, URL RTSP local (rtsp://...) o 'mock' para demostración simulada. Por defecto: mock.")
    parser.add_argument("--threshold", type=float, default=6.0, 
                        help="Umbral de movimiento en píxeles para considerar al operario activo. Por defecto: 6.0.")
    parser.add_argument("--history", type=int, default=30, 
                        help="Largo de la ventana de frames para promediar la actividad. Por defecto: 30.")
    parser.add_argument("--no-view", action="store_true", 
                        help="Ejecutar en modo consola sin levantar interfaz gráfica (ideal para servidores).")
    args = parser.parse_args()

    print("======================================================================")
    print(" INICIALIZANDO DETECTOR DE POSE Y TIEMPOS OCIOSOS - TMC 2.0")
    print("======================================================================")
    print(f"Fuente de video: {args.source}")
    print(f"Umbral de Actividad: {args.threshold} píxeles/frame")
    print(f"Filtro Promedio: {args.history} frames")
    print(f"Interfaz Gráfica: {'Desactivada' if args.no_view else 'Activada'}")
    print("======================================================================")

    # 1. Configurar entrada de video
    is_mock = args.source.lower() == "mock"
    cap = None
    mock_source = None
    
    if is_mock:
        print("[INFO] Iniciando en Modo Simulación local (sin requerir hardware físico).")
        mock_source = MockVideoSource(fps=30)
    else:
        # Resolver fuente de video (cámara USB o RTSP)
        source = args.source
        if source.isdigit():
            source = int(source)
        
        cap = cv2.VideoCapture(source)
        # Reducir buffer de red en RTSP para evitar acumulamientos de frames demorados
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        
        if not cap.isOpened():
            print(f"[ERROR] No se pudo abrir la fuente de video: {args.source}")
            print("[INFO] Fallando hacia modo simulación local...")
            is_mock = True
            mock_source = MockVideoSource(fps=30)

    # 2. Cargar modelo YOLOv8-Pose (sólo si no estamos en simulación)
    model = None
    if not is_mock:
        if not ULTRALYTICS_AVAILABLE:
            print("[ERROR] La librería 'ultralytics' no está instalada o falló su importación.")
            print("[HINT] Ejecute: pip install ultralytics")
            print("[INFO] Cerrando aplicación...")
            sys.exit(1)
        
        print("[INFO] Cargando modelo YOLOv8-Pose a la memoria...")
        try:
            # yolov8n-pose.pt es el modelo nano, ultraliviano, ideal para uso local
            model = YOLO("yolov8n-pose.pt")
            print("[OK] Modelo cargado con éxito.")
        except Exception as e:
            print(f"[ERROR] Fallo al cargar o descargar yolov8n-pose: {e}")
            sys.exit(1)

    # 3. Inicializar el rastreador de operarios
    manager = MultiWorkerTracker(history_len=args.history, motion_threshold=args.threshold)

    # Variables de control de FPS
    last_time = time.time()
    frame_count = 0
    fps = 0.0

    print("[INFO] Iniciando procesamiento de transmisión. Presione ESC o 'q' para salir.")

    try:
        while True:
            detections = []
            
            # Obtener frame
            if is_mock:
                ret, frame, detections = mock_source.read()
            else:
                ret, frame = cap.read()
                if not ret:
                    print("[WARNING] Frame vacío o fin de stream de video.")
                    break
                
                # Ejecutar inferencia YOLOv8-pose
                # verbose=False para no inundar la consola y mejorar el rendimiento
                results = model(frame, verbose=False)
                
                # Extraer cajas delimitadoras y keypoints
                for r in results:
                    if r.keypoints is not None:
                        boxes = r.boxes.xyxy.cpu().numpy()
                        kpts = r.keypoints.xy.cpu().numpy()
                        confs = r.keypoints.conf.cpu().numpy() if r.keypoints.conf is not None else np.ones((len(kpts), 17))
                        
                        # Guardar detecciones de personas (YOLO detecta otras clases, pero YOLO-pose filtra personas)
                        for i in range(len(kpts)):
                            detections.append({
                                'bbox': boxes[i],
                                'keypoints': kpts[i],
                                'confs': confs[i]
                            })

            # Actualizar lógica de movimiento de operarios
            tracked_workers = manager.update(detections)
            
            # Dibujar resultados sobre el frame de video
            for worker in tracked_workers:
                track_id = worker['track_id']
                bbox = worker['bbox']
                state = worker['state']
                raw_m = worker['raw_motion']
                avg_m = worker['avg_motion']
                hist = worker['motion_history']
                
                # Imprimir en consola de forma continua
                print(f"[PUESTO #{track_id}] Mov. Instantáneo: {raw_m:5.2f} px/f | Promedio (30f): {avg_m:5.2f} px/f | Estado: {state}")
                
                if not args.no_view:
                    # Dibujar caja delimitadora del operario
                    color_caja = (170, 255, 0) if state == "ACTIVE" else ((0, 120, 255) if state == "IDLE" else (255, 170, 0))
                    x1, y1, x2, y2 = map(int, bbox)
                    cv2.rectangle(frame, (x1, y1), (x2, y2), color_caja, 2)
                    
                    # Dibujar esqueleto estilizado
                    draw_skeleton(frame, worker['keypoints'], worker['confs'], state)
                    
                    # Dibujar panel de telemetría individual para este operario
                    # Colocado de manera dinámica o fija en la esquina del frame
                    # Si es el primer operario, lo dibujamos en la esquina superior izquierda
                    if track_id == 0:
                        draw_telemetry_chart(frame, 15, 15, 230, 240, hist, args.threshold, state, raw_m, avg_m)
                    elif track_id == 1:
                        # Segundo operario en la esquina superior derecha
                        h, w, _ = frame.shape
                        draw_telemetry_chart(frame, w - 245, 15, 230, 240, hist, args.threshold, state, raw_m, avg_m)

            # Calcular FPS reales
            frame_count += 1
            now = time.time()
            if now - last_time >= 1.0:
                fps = frame_count / (now - last_time)
                frame_count = 0
                last_time = now

            # Dibujar contador de FPS
            if not args.no_view:
                cv2.putText(frame, f"FPS: {fps:.1f}", (frame.shape[1] - 80, frame.shape[0] - 15),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.4, (255, 255, 255), 1, lineType=cv2.LINE_AA)
                
                # Mostrar en ventana
                cv2.imshow("Sistema Control de Productividad - TMC 2.0", frame)
                
                # Capturar tecla de salida
                key = cv2.waitKey(1) & 0xFF
                if key == 27 or key == ord('q'): # ESC o q
                    break

    except KeyboardInterrupt:
        print("[INFO] Proceso detenido por el usuario.")
    finally:
        # Liberar recursos
        if cap is not None:
            cap.release()
        if not args.no_view:
            cv2.destroyAllWindows()
        print("[INFO] Recursos liberados. Aplicación finalizada.")


if __name__ == "__main__":
    main()
