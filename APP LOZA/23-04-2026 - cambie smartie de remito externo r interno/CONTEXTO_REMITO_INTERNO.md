# 📘 Remito Interno - Documentación de Contexto

> **Versión:** V46+  
> **Última Actualización:** Abril 2026  
> **Equipo:** TMC - Administración / Desarrollo  

---

## 1. ¿Qué es este aplicativo?

El **Remito Interno** es una aplicación web standalone (HTML + CSS + JavaScript puro, sin frameworks) que gestiona el **flujo completo de producción y logística de bandejas enlozadas** entre la Fábrica TMC y la planta de Lozametal.

Se integra en tiempo real con el **ERP YiQi** mediante su API REST para leer y escribir datos (stock, remitos, transiciones de estado, artículos, etc.).

---

## 2. Arquitectura General

### Stack Tecnológico
| Componente | Tecnología |
|---|---|
| **Frontend** | HTML5, CSS3 (vanilla), JavaScript ES6+ |
| **Backend/API** | YiQi ERP (REST API) |
| **Autenticación** | Bearer Token (OAuth2 Password Grant) |
| **Hosting** | Archivo local / Google Drive |
| **Diseño** | Inter Font, paleta TMC estándar (#2563eb, #f1f5f9) |

### Archivos del Proyecto
| Archivo | Líneas | Función |
|---|---|---|
| `index.html` | ~340 | Estructura UI: 4 tabs, paneles, modales |
| `logica.js` | ~3600 | Toda la lógica: API YiQi, estados, renderizado |
| `estilos.css` | ~600 | Design system TMC completo |
| `logo_tmc.png` | - | Logo de la empresa |

---

## 3. Módulos del Aplicativo (4 Tabs)

### 🏭 Tab 1: Fábrica
Gestiona la producción y el armado de jaulas en la planta de TMC Crespo.

**Columnas:**
1. **Alta de Producción** — Registro de fabricación (Entity 1389). Busca artículos del grupo "Bandejas Enlozadas" (Grupo 93), registra cantidad, y auto-procesa remitos de compra proyectados (Smartie 2698, transición 119014).
2. **Stock** — Vista conmutable entre "Fábrica" (Smartie 2694, depósito 156) y "Jaulas Cerradas" (Smartie 2736, depósito 189). Permite agregar ítems a la jaula activa.
3. **Jaulas** — Lista de remitos internos abiertos (Smartie 2737, Entity 781). Se pueden crear nuevas jaulas (con número obligatorio) y cancelar existentes.
4. **Detalle de Jaula** — Muestra ítems guardados en YiQi y pendientes locales. Permite cerrar la jaula (transiciones 118455 → 118456 + clonación automática al tramo Revestimientos → Mustang).

---

### 🚚 Tab 2: Logística
Gestiona el despacho de jaulas cerradas desde TMC hacia Lozametal.

**Columnas:**
1. **Jaulas Armadas** — Remitos listos para despacho (Smartie 2735). Selección individual o masiva con checkbox.
2. **Despacho a Lozametal** — Resumen consolidado de ítems de las jaulas seleccionadas. Botón "Generar Remito a Lozametal" ejecuta transiciones bulk + clonación por cada jaula (tramo Mustang 191 → Playa Lozametal 190).
3. **Jaulas Enviadas** — Historial de despachos (Smartie 2734). Botón de ver contenido y de imprimir rótulo.
4. **Trazabilidad de Envío** — Muestra fechas de despacho y recepción (vía comentarios), cálculo de tiempo en tránsito.

---

### 🌋 Tab 3: Lozametal
Gestiona la recepción, control y stock final en la planta de Lozametal.

**Columnas:**
1. **Pendientes de Recepción** — Jaulas en tránsito (Smartie 2726 reutiliza 2734 para pendientes). Selección masiva + botón "Recibir N Bultos" (transiciones + comentario de recepción + clonación tramo Playa 190 → Final 157).
2. **Jaulas a Revisar** — Bultos recibidos esperando control (Smartie 2716). Se selecciona una para iniciar verificación.
3. **Control de Jaula** — Verificación ítem por ítem: OK ✅ o Reportar Diferencia ⚠️. Si hay sobrantes, se crea un Remito de Compra directo (Plan B, Entity 787, Child 209). Al finalizar, procesa el remito final e ingresa al stock de Lozametal (157).
4. **Stock Lozametal** — Stock real en depósito 157 (Smartie 2738). Incluye botón "Negro Estandar" para mover stock terminado a depósito 192 (Revestimientos Realizados).

---

### 💰 Tab 4: Control de Costos
**Próximamente** — Placeholder sin funcionalidad implementada.

---

## 4. Flujo de Depósitos (Cadena de Custodia)

```
┌──────────────┐    ┌────────────────┐    ┌───────────────┐    ┌────────────────┐    ┌───────────────┐    ┌──────────────────┐
│   FÁBRICA    │───▶│ REVESTIMIENTOS │───▶│    MUSTANG     │───▶│ PLAYA LOZAMETAL│───▶│LOZAMETAL FINAL│───▶│  REVESTIMIENTOS   │
│  Depósito    │    │   Depósito     │    │   Depósito     │    │   Depósito     │    │   Depósito    │    │   REALIZADOS     │
│    156       │    │     189        │    │     191        │    │     190        │    │     157       │    │      192          │
└──────────────┘    └────────────────┘    └───────────────┘    └────────────────┘    └───────────────┘    └──────────────────┘
     │                    │                     │                     │                     │                     │
     │ Cerrar Jaula       │ Despacho            │  Recepción          │  Control OK          │ Terminar            │
     │ (118455→118456)     │ (118455→118456)     │ (118455→118456)     │ (118455→118456)      │ (118455→118456)     │
     │ + Clone             │ + Clone             │ + Comment           │ + Comment             │ (Negro Estandar)    │
     └─────────────────────┴─────────────────────┴─────────────────────┴──────────────────────┴─────────────────────┘
```

Cada tramo entre depósitos es un **Remito Interno (Entity 781)** independiente que pasa por el workflow:
- **Creado → Enviado** (Transición 118455)
- **Enviado → Procesado** (Transición 118456)

> ⚠️ **IMPORTANTE:** Las transiciones son secuenciales. YiQi procesa el movimiento de stock de forma asincrónica. Nunca ejecutar la segunda sin esperar que la primera termine (patrón de reintentos documentado en `.yiqi_master_brain.md`, sección 13).

---

## 5. Entidades y Smarties de YiQi

### Entidades Core
| Concepto | Entity ID | Child ID | Descripción |
|---|---|---|---|
| Stock | 794 | - | Vistas de stock por depósito |
| Remito Interno | 781 | 227 | Cabeceras + ítems de remitos |
| Artículos | 782 | - | Maestro de artículos |
| Grupos | 763 | - | Grupos/Familias de artículos |
| Alta Producción | 1389 | - | Registro de fabricación |
| Remito Compra | 787 | 209 | Comprobantes de compra (Plan B sobrantes) |

### Smarties Configurados
| Smartie ID | Donde se usa | Qué trae |
|---|---|---|
| 2694 | Stock Fábrica | Depósito 156, sin stock = 0 |
| 2736 | Jaulas Cerradas | Depósito 189 (Revestimientos) |
| 2737 | Jaulas Activas | Remitos en estado Creado |
| 2735 | Logística | Jaulas armadas para despacho |
| 2734 | Despachos | Jaulas enviadas y pendientes |
| 2726 | Pendientes Lozametal | Remitos en tránsito |
| 2716 | Jaulas a Revisar | En playa, esperando control |
| 2738 | Stock Lozametal | Depósito 157 |
| 2670 | Artículos | Maestro completo |
| 2594 | Grupos | Familias de artículos |
| 2705 | Altas Recientes | Últimas producciones |
| 2698 | Compra Pendientes | Remitos proyectados por procesar |

---

## 6. Patrones Técnicos Clave

### Autenticación
- Endpoints: `api.yiqi.com.ar/token`, `/connect/token`, `me.yiqi.com.ar/connect/token`
- Grant Type: `password`
- Token almacenado en memoria (variable `yiqiToken`)
- Si falla, se reintenta con el siguiente endpoint

### Transiciones Secuenciales (Patrón Retry)
```
1. Ejecutar transición 118455 (Creado → Enviado)
2. Esperar 3 segundos
3. Llamar GetInstance (fuerza propagación backend)
4. Ejecutar transición 118456 (Enviado → Procesado) con hasta 6 reintentos × 5s
5. Si YiQi dice "Debe esperar", reintentar
```

### Clonación de Remitos
Cuando se completa un tramo, se clona el remito con nuevos depósitos origen/destino para crear automáticamente el siguiente tramo de la cadena.

### Plan B - Sobrantes
Si en Lozametal se recibe más cantidad que la declarada, se crea un **Remito de Compra** (Entity 787) directamente en el depósito 190 para ingresar el excedente al stock.

### Modales (Anti-Bleed)
Todos los prompts/confirms usan modales customizados con:
- Flag `isResolved` para evitar resoluciones múltiples
- `e.preventDefault()` + `e.stopPropagation()` en Enter
- Deshabilitación inmediata de inputs al confirmar

---

## 7. QR en Rótulos de Jaulas

Los rótulos impresos incluyen un **código QR** que codifica la información de la jaula en un formato estandarizado:

```
TMC|JAULA|{yiqiId}|{jaulaNum}|{nroComprobante}
```

**Ejemplo:** `TMC|JAULA|45123|1377|0001-00004521`

Este QR permite que los futuros aplicativos por sector (operarios en Fábrica, Logística, Lozametal) puedan:
- Escanear una jaula para ver su contenido
- Confirmar recepción
- Iniciar control de calidad
- Registrar acciones de forma rápida sin buscar manualmente

---

## 8. Documentos de Referencia

| Documento | Ubicación | Contenido |
|---|---|---|
| `.yiqi_master_brain.md` | `/PROYECTOS TMC/` | Protocolo maestro de integración con YiQi |
| `TMC_RULES.md` | `/PROYECTOS TMC/` | Estándares de diseño, UX y conexión |
| `.env.txt` | `/PROYECTOS TMC/` | Credenciales de acceso |

---

> *Este documento debe ser consultado por cualquier integrante del equipo antes de modificar, extender o crear nuevos módulos relacionados al sistema de Remitos Internos de TMC.*
