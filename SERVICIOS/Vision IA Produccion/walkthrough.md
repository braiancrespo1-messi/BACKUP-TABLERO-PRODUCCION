# Walkthrough: Ajustes de Telemetría, Grabación de Clips y Sistema de Zonas de Trabajo (TMC 2.0)

Este documento resume los entregables y validaciones del sistema de telemetría de productividad en su fase actual, detallando tanto el control de Zonas de Trabajo y Conteo de Piezas como las optimizaciones de grabación de video locales.

---

## 1. Ajustes y Funcionalidades Realizadas

### A. Sistema de Zonas de Trabajo y Conteo de Piezas (Plegadora)
Implementamos un sistema interactivo de zonas virtuales para contar de forma precisa las piezas producidas por el operario según el trayecto de sus muñecas:
1.  **Backend (IA en Python):**
    -   Modificamos [pose_tracker.py](file:///c:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/pose_tracker.py) para que reciba las dimensiones del frame (`frame_width`, `frame_height`).
    -   Rastreamos las coordenadas normalizadas de los puntos de YOLO pose 9 y 10 (muñeca izquierda y derecha) con confianza $\ge 0.5$.
    -   Diseñamos una máquina de estados secuencial en `WorkerTracker.update()`:
        -   **`START`** &rarr; Operario va al carro de entrada (muñeca entra en Zona A) &rarr; Transición a **`HAS_A`**.
        -   **`HAS_A`** &rarr; Operario coloca la chapa en la plegadora (muñeca entra en Zona B) &rarr; Transición a **`HAS_B`**.
        -   **`HAS_B`** &rarr; Operario retira la pieza doblada y la apila en el carro de salida (muñeca entra en Zona C) &rarr; Incrementa `pieces_count` y regresa a **`START`**.
    -   *Prevención de Doble Conteo:* Una vez alcanzada la Zona C, el ciclo se reinicia y no incrementará de nuevo hasta que la mano vuelva a pasar por la Zona A. Si el operario se distrae o inactiva a mitad del proceso por más de 30 segundos, el ciclo se resetea por seguridad.
    -   *Persistencia:* La configuración de zonas de cada puesto se parsea en el endpoint POST `/update-params` y se guarda en `config_puesto_[ID].json` para que persista al reiniciar el programa.
    -   *Dibujo en Video:* Dibujamos rectángulos semitransparentes de color verde (Zona A), amarillo (Zona B) y azul (Zona C) con sus respectivas etiquetas en el streaming del video.

2.  **Frontend (Dashboard Web):**
    -   Añadimos un canvas overlay (`#zoneDrawingCanvas`) en [dashboard.html](file:///c:/Users/Usuario/.gemini/antigravity/scratch/Aplicativos%20TMC%202.0/VISION%20IA%20PRODUCCION/dashboard.html) posicionado exactamente encima del video que se alinea automáticamente con `liveStreamImg` o `demoVideoCanvas` al redimensionar la ventana o cargar imágenes.
    -   Añadimos soporte completo para **arrastrar y soltar con mouse o pantalla táctil** para dibujar rectángulos normalizados del `0.0` al `1.0`.
    -   Creamos una sección en el panel lateral de calibración para configurar o limpiar las zonas A, B, y C con un overlay de ayuda contextual.
    -   Añadimos tarjetas dedicadas para mostrar la cantidad de piezas tanto en el modal de transmisión (`#modalPiecesCount`) como un badge dinámico en las tarjetas de la pantalla principal del Dashboard.
    -   Sincronizamos la simulación de datos en modo Demo para que las piezas del Puesto 4 se incrementen periódicamente y se reflejen en la interfaz.

### B. Desplazamiento de la Telemetría (Fecha/Hora de Cámara Visible)
-   **Ajuste:** Movimos la caja de telemetría de la IA (`draw_telemetry_chart`) verticalmente de la coordenada `y = 10` a `y = 45`.
-   **Resultado:** Ahora el timestamp nativo de la cámara de seguridad (fecha y hora en la esquina superior izquierda del video de origen) queda 100% visible para su análisis sin obstrucciones.

### C. Exclusión de Clips de Video Ficticios en Puestos Simulados (Mock)
-   **Ajuste:** Añadimos una verificación para que los puestos que corren en modo simulación (sin video real o cámara física cargada) registren estadísticas en base de datos pero **no** inicien la grabadora circular ni generen archivos de video en la carpeta `videos_ocio/`.
-   **Resultado:** Evitamos el desperdicio de espacio en disco en los servidores locales.

---

## 2. Validación de Funcionamiento

*   **Verificación de Sintaxis y Ejecución:**
    -   Ejecutamos `python -m py_compile pose_tracker.py` confirmando que compila limpiamente sin errores de sintaxis en las firmas actualizadas.
    -   Lanzamos `pose_tracker.py` en modo de simulación (`--source mock`) en el puerto de prueba `8099`. El servidor MJPEG levantó perfectamente, SQLite inicializó con éxito y el procesador de pose operó en vivo reportando frames de manera fluida y detectando las variables de zonas.
*   **Simulación de UI:**
    -   Validamos que en el Dashboard en modo Demo, al activar el Puesto 4, el esqueleto simulado y el loop de eventos actualizan correctamente la cantidad de piezas producidas de manera orgánica, mostrando el badge de piezas en tiempo real en la vista general y en el modal.

---

## 3. Guía de Uso del Calibrador de Zonas

Para configurar y probar las zonas virtuales en tu plegadora real (Puesto 4):
1.  Abre el Dashboard en tu navegador e ingresa al **Puesto 4: Plegado**.
2.  Presiona **"🔧 Calibrar Puesto"** para abrir el panel lateral de ajustes.
3.  Bajo la sección **"Zonas de Trabajo (Conteo de Piezas)"**:
    -   Presiona **"🟢 Configurar Zona A (Entrada)"**. Verás un mensaje de ayuda en la parte inferior del video.
    -   Haz clic y arrastra sobre el video (a la derecha) para encerrar el carro de entrada donde el operario toma las chapas.
    -   Repite el proceso haciendo clic en **"🟡 Configurar Zona B (Plegadora)"** y arrastra sobre la boca de la máquina plegadora.
    -   Haz lo mismo con **"🔵 Configurar Zona C (Salida)"** sobre la pila o carro de salida a la izquierda del operario.
4.  Una vez dibujada la última zona, la configuración se guardará automáticamente en el servidor.
5.  Puedes reiniciar el contador de piezas en cualquier momento retrocediendo o reiniciando el video desde el principio utilizando los controles del Dashboard.

---

## 4. Indicador de Estado de Ciclo (Encuadre de Zonas)
Añadimos un indicador visual discreto en tiempo real en la tarjeta de piezas contadas para optimizar la calibración de las cámaras:
- **Estados Visibles:**
  - `Estado: Esperando Entrada (A)` (Esperando que la muñeca entre a la Zona A verde).
  - `Estado: Mano en Entrada (A) ok. Esperando Plegadora (B)...` (Ya detectó Zona A, esperando que vaya a la Zona B naranja).
  - `Estado: Mano en Plegadora (B) ok. Esperando Salida (C)...` (Ya detectó Zona A y B, esperando que deposite en la Zona C azul).
- **Simulación e Integración:**
  - En **Modo Demo**, el Puesto 4 simula orgánicamente la progresión del ciclo y el incremento de piezas según el ritmo simulado de trabajo.
  - En **Modo Local/Real**, lee directamente el valor de la máquina de estados del backend en cada consulta de estado.
  - En **Firebase/Cloud**, sincroniza las claves `pieces_count` y `cycle_state` en el documento del puesto de trabajo para visualización remota.
