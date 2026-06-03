# Memoria Técnica - APP LOZA (Remitos Internos Lozametal)

Este documento centraliza el conocimiento sobre el funcionamiento, arquitectura e integración de la aplicación de Remitos Internos para el movimiento de mercadería entre Fábrica y Lozametal.

## 1. Visión General (Coloquial)
La aplicación permite gestionar el ciclo de vida de las "Jaulas" de mercadería. Desde que se cargan los artículos en Fábrica hasta que se reciben y auditan en la Playa de Lozametal. Su objetivo principal es garantizar la **trazabilidad total** y que el stock en el ERP YiQi siempre coincida con lo que físicamente se mueve en los camiones.

## 2. El Ciclo de Vida de la Jaula
El proceso se divide en 4 etapas (solapas en la UI):

1.  **Fábrica (Carga)**: El operario selecciona artículos y crea una "Nueva Jaula".
    -   **Nro de Jaula**: Es un número manual (ej. 1, 2, 3) que se usa para identificar físicamente la jaula.
    -   **Nro de Remito Externo**: Es un número secuencial único generado por el sistema (vía Smartie 2752) que actúa como el "DNI" oficial del documento en YiQi.
2.  **Jaulas Cerradas (Cierre)**: Una vez cargada, la jaula se "Cierra". 
    -   Esto dispara un flujo de YiQi (Transiciones 118455 y 118456) que mueve el stock de Fábrica a Revestimientos.
    -   Automáticamente se genera una **Clonación** (Duplicado) de la jaula con destino a "Mustang" (depósito intermedio de tránsito).
3.  **Logística (Despacho)**: Se listan las jaulas que están en Mustang. Al "Despachar", se mueven virtualmente a la "Playa Lozametal".
4.  **Recepción Playa (Auditoría)**: Al llegar el camión, se reciben las jaulas. Esto impacta el stock final en el depósito de Lozametal.

## 3. Arquitectura Técnica (Para IA y Devs)
-   **Tecnología**: Standalone HTML5 / Vanilla JavaScript / CSS3.
-   **Integración**: Consumo directo de REST API de YiQi (Bearer Token).
-   **Entidades Críticas**:
    -   **Entidad 781**: Cabecera de Remito Interno.
    -   **Entidad 783**: Items del Remito Interno.
    -   **Esquema ID**: 1491.
-   **Campos de Mapeo Clave**:
    -   `REIN_OBSERVACION` (ID 4180): Contiene el texto "Jaula N° X".
    -   `REIN_NRO_EXTERNO` (ID 13096): Contiene el número secuencial correlativo.
    -   `4181`: Depósito Origen.
    -   `4182`: Depósito Destino.

## 4. Patrones de Robustez Implementados
-   **Polling de Re-validación**: Tras crear una jaula, la app consulta repetidamente el servidor hasta confirmar que el `REIN_NRO_EXTERNO` ha impactado correctamente. Esto evita errores de sincronización asincrónica.
-   **Transiciones Atómicas**: Las transiciones de estado se ejecutan una por una con reintentos inteligentes si el servidor devuelve "Debe esperar a que se procese el envío".
-   **Sincronización de Numeración**: Al iniciar, la app sincroniza su contador local (`fabrica_remito_seq`) con el máximo valor encontrado en la Smartie 2752 (ordenada por Nro Externo DESC).

## 5. Mantenimiento a Futuro
> [!IMPORTANT]
> **Consejos para conservar la salud del aplicativo:**

1.  **Limpieza de Smarties**: Si la app se vuelve lenta al cargar, es posible que las Smarties (2737, 2735, etc.) tengan demasiados registros históricos. Se recomienda que los estados "Procesado" desaparezcan de las visiones activas tras 30 días.
2.  **Reset de Secuencia**: Si por algún error manual en YiQi se salta un número externo (ej. se borra el remito 1800), el `localStorage` del navegador podría quedar desfasado. En ese caso, usar la consola del navegador (`localStorage.clear()`) o el botón de configuración para volver a sincronizar con el último registro real de YiQi.
3.  **Cambio de Tokens**: El sistema usa la cuenta `mercadolibre@tmcrespo.com.ar`. Si se cambia la contraseña en YiQi, se debe actualizar en el objeto `YIQI_CONFIG` del archivo `logica.js`.
4.  **Monitoreo de Mustang (191)**: El depósito 191 actúa como "Jaulas en el Aire". Si quedan jaulas estancadas ahí por mucho tiempo, significa que el operario de Logística se olvidó de marcarlas como enviadas.

---
**Documento autogenerado por Antigravity AI - Abril 2026**
