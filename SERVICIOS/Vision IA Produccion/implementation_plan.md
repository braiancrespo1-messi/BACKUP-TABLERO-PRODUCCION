# Plan de Implementación: Streaming de Video y Grabación de Clips de Ocio (TMC 2.0)

Este documento detalla la ampliación técnica para:
1. Permitir ver el video en vivo y directo con el esqueleto de la IA desde el dashboard.
2. Grabar clips de video automáticos cuando un operario entra en estado ocioso (`IDLE`) para justificación en reuniones.

---

## Validación Arquitectónica (Grabación Local + Streaming Local)

Confirmamos que realizar el streaming de video y la grabación de clips a nivel **local** es el enfoque correcto y eficiente:
1. **Streaming de Video Directo (Local):** Para evitar subir flujos de video continuos a la nube (lo cual consumiría un ancho de banda prohibitivo), el script de Python levantará un micro-servidor web local (MJPEG Streamer). Cuando hagas clic en un puesto en el Dashboard, este cargará la imagen directamente desde la IP local de tu servidor de procesamiento (ej: `http://192.168.1.100:8000/video`). Esto garantiza latencia cero y consumo de internet cero.
2. **Grabación con Búfer Circular (Pre-Grabación):** Si grabamos solo cuando la IA determina que el operario está ocioso, nos perderíamos el momento exacto en el que dejó de trabajar (ej. cuando saca el celular). Para solucionar esto, implementaremos un **búfer circular en memoria** que retiene constantemente los últimos 5 segundos de video. Al activarse la grabación de ocio, el clip comenzará con esos 5 segundos previos de contexto.

---

## Propuesta de Componentes y Código a Desarrollar

### 1. Actualización en el Script Local [pose_tracker.py](file:///c:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/pose_tracker.py)
*   **Servidor de Streaming Integrado:** Usaremos un servidor HTTP multihilo nativo en Python (`http.server` y `socketserver`) que correrá en un puerto configurable por cada puesto (ej: Puesto 1 en puerto 8000, Puesto 2 en 8001, etc.). Expondrá el endpoint `/video` que envía los frames procesados en tiempo real.
*   **Grabadora de Clips de Ocio:**
    - Agregaremos un búfer en memoria (`collections.deque`) para almacenar temporalmente los últimos 150 frames.
    - Si el operario permanece en estado `IDLE` por más de 5 segundos seguidos, se disparará una grabación en segundo plano en una carpeta llamada `videos_ocio/`.
    - La grabación incluirá los 5 segundos almacenados en el búfer y continuará grabando en vivo hasta que el operario regrese a estado `ACTIVE` o se alcance un límite de 30 segundos (evitando que el disco se llene si el operario se va del puesto).
    - Los archivos se guardarán como `ocio_puesto_[ID]_[FECHA]_[HORA].mp4` (o `.avi` para máxima compatibilidad de codec en Windows).

### 2. Creación del Panel de Control Web [dashboard.html](file:///c:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/dashboard.html)
*   **Modal de Video en Vivo:** Al hacer clic sobre la tarjeta de cualquier Puesto de Trabajo, se abrirá un modal flotante que cargará el stream de video de la IP local correspondiente, permitiéndote ver cómo trabaja el operario en vivo y directo.
*   **Listado de Clips Grabados:** Expondremos la carpeta de videos grabados para que aparezca un botón de descarga/reproducción al lado de los logs históricos de tiempos muertos, permitiendo reproducir el video de justificación directamente en el dashboard.

---

## Plan de Verificación

### Pruebas Manuales
1. Ejecutaremos el script local con la simulación activa y la base de datos desconectada.
2. Abriremos el `dashboard.html` en el navegador.
3. Haremos clic en el Puesto 1 para verificar que el video del operario virtual se visualiza correctamente dentro del modal del dashboard.
4. Esperaremos a que el simulador entre en fase `IDLE` (ocioso) durante más de 5 segundos.
5. Verificaremos en la carpeta `VISION IA PRODUCCION/videos_ocio/` que se genere el archivo de video de forma correcta y que sea reproducible.
