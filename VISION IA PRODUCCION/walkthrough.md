# Walkthrough: Integración de Base de Datos y Dashboard Web (TMC 2.0)

Este documento resume los entregables finales del sistema de visión artificial y telemetría de productividad, detallando la base de datos Firestore y el Dashboard interactivo.

---

## 1. Archivos Desarrollados en `VISION IA PRODUCCION`

1.  **Script de Análisis de Pose:** [pose_tracker.py](file:///C:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/pose_tracker.py) (actualizado con soporte opcional para Firebase SDK y parámetro de puesto `--workstation`).
2.  **Dashboard Web Real-time:** [dashboard.html](file:///C:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/dashboard.html) (interfaz oscura con visualización de los 5 puestos, luces led indicadoras de estado, gráficos históricos de Chart.js y simulador de datos integrado).
3.  **Plan de Implementación:** [implementation_plan.md](file:///C:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/implementation_plan.md) (actualizado con los esquemas de colecciones de Firestore y consejos para descubrir IPs).
4.  **Lista de Control:** [task.md](file:///C:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/task.md) (todas las tareas completadas).

---

## 2. Detalles del Diseño

### A. Estructura de la Base de Datos (Firebase Firestore)
Para mantener la base de datos liviana y optimizada, el script local escribe datos bajo dos enfoques:
*   **Colección `workstation_status` (Instantáneo):** Guarda el estado actual en vivo (`ACTIVE` o `IDLE`) de los puestos (documentos del 0 al 4) y la hora del último latido de red. El dashboard lee esto en tiempo real para prender o apagar los LEDs indicadores.
*   **Colección `workstation_logs` (Histórico):** Cada vez que un operario cambia de estado de forma sostenida (duración $\ge 2$ segundos), se graba un documento en esta colección que registra:
    - `workstation_id`: Puesto del 0 al 4.
    - `state`: El estado del bloque (`ACTIVE` o `IDLE`).
    - `start_time`: Fecha y hora de inicio del bloque.
    - `end_time`: Fecha y hora de fin del bloque.
    - `duration_seconds`: Duración exacta del intervalo.

### B. El Dashboard Web Interactivo
Desarrollamos una interfaz premium [dashboard.html](file:///C:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/dashboard.html) con:
*   **Modo Demo Autoportante:** Si no se han configurado credenciales, el dashboard arranca en modo de demostración. Simula cambios de estado y actualiza los gráficos automáticamente para que puedas interactuar con el diseño de forma inmediata.
*   **Panel de Conexión Rápida:** Cuenta con un modal emergente donde podés pegar el objeto de configuración Web de tu Firebase (`firebaseConfig`). Al guardar, se almacena de forma segura en el almacenamiento local del navegador (`localStorage`) y se conecta en tiempo real a tus colecciones de Firestore sin requerir configuraciones de backend adicionales.

---

## 3. Verificación de Funcionamiento

*   **Instalación:** Se instaló con éxito el SDK de Firebase en Python (`firebase-admin`).
*   **Prueba de Código:** El script fue verificado exitosamente mediante simulación y demostró que realiza el cálculo de intervalos y las llamadas a base de datos de manera limpia, sin interrumpir el procesamiento principal de imágenes y adaptándose de forma transparente al modo sin base de datos (offline) si no se le provee la ruta `--firebase`.
