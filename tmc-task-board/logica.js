/* ====================================================================
   TMC TASK BOARD - FRONTEND CLIENT LOGIC
   ==================================================================== */

// MOCK DATA: YiQi ERP Document Instances for Autocomplete Links
const YIQI_MOCK_INSTANCES = [
    { id: "10245", type: "Remito de Compra", provider: "LozaMetal S.A.", items: "Chapa de Acero 1.2mm x 100", details: "Remito de Compra #10245 - LozaMetal S.A." },
    { id: "20412", type: "Orden de Compra", provider: "Trefilar Cocciolo", items: "Bandejas Enlozadas Rejilla x 50", details: "Orden de Compra #20412 - Trefilar Cocciolo" },
    { id: "85915", type: "Remito de Venta", client: "Vant Ecommerce", items: "Pintura Epoxi Gris x 20 Baldes", details: "Remito de Venta #85915 - Vant Ecommerce" },
    { id: "78103", type: "Jaula de Retorno", origin: "Sucursal Mustang", items: "Jaulas de Envasado Vacías x 3", details: "Jaula de Retorno #78103 - Sucursal Mustang" },
    { id: "55201", type: "Cobranza de Factura", client: "Distribuidora Lomas", amount: "$250.000", details: "Cobranza de Factura #55201 - Distribuidora Lomas" }
];

// Initial pre-populated Tasks
const DEFAULT_TASKS = [
    {
        id: "task-001",
        tipo: "Insumo",
        descripcion: "Retirar 100 planchas de chapa laminada en frío 1.2mm para producción.",
        origen: "Fábrica - Depósito LozaMetal",
        direccion: "Av. General Paz 12450, Lomas del Mirador",
        latitud: -34.661245,
        longitud: -58.532155,
        yiqi_instance_id: "20412",
        estado: "Solicitado",
        chofer_id: null,
        comentarios_chofer: null,
        firma_url: null,
        remito_foto_url: null,
        creado_en: new Date(Date.now() - 3600000 * 5).toISOString(), // 5 hours ago
        actualizado_en: new Date(Date.now() - 3600000 * 5).toISOString()
    },
    {
        id: "task-002",
        tipo: "Cobranza",
        descripcion: "Cobrar cheque de pago diferido y retirar recibo oficial duplicado.",
        origen: "Administración - Finanzas",
        direccion: "Av. Corrientes 1420, CABA",
        latitud: -34.604123,
        longitud: -58.384210,
        yiqi_instance_id: "55201",
        estado: "En Proceso",
        chofer_id: null,
        comentarios_chofer: null,
        firma_url: null,
        remito_foto_url: null,
        creado_en: new Date(Date.now() - 3600000 * 3).toISOString(), // 3 hours ago
        actualizado_en: new Date(Date.now() - 3600000 * 2).toISOString()
    },
    {
        id: "task-003",
        tipo: "Insumo",
        descripcion: "Retirar 50kg de tornillos autoperforantes y arandelas de goma del proveedor.",
        origen: "Fábrica - Abastecimiento",
        direccion: "Ruta 8 Km 22.5, San Martín",
        latitud: -34.572110,
        longitud: -58.541300,
        yiqi_instance_id: "10245",
        estado: "Listo para Retirar",
        chofer_id: null,
        comentarios_chofer: null,
        firma_url: null,
        remito_foto_url: null,
        creado_en: new Date(Date.now() - 3600000 * 8).toISOString(),
        actualizado_en: new Date(Date.now() - 3600000 * 4).toISOString()
    },
    {
        id: "task-004",
        tipo: "Trámite",
        descripcion: "Entrega de documentación firmada y retiro de Jaula de Retorno vacía de sucursal.",
        origen: "Administración - Logística",
        direccion: "Av. Hipólito Yrigoyen 3400, Lanús",
        latitud: -34.701235,
        longitud: -58.398110,
        yiqi_instance_id: "78103",
        estado: "En Reparto",
        chofer_id: "carlos_calle",
        comentarios_chofer: null,
        firma_url: null,
        remito_foto_url: null,
        creado_en: new Date(Date.now() - 3600000 * 12).toISOString(),
        actualizado_en: new Date(Date.now() - 3600000 * 1).toISOString()
    },
    {
        id: "task-005",
        tipo: "Insumo",
        descripcion: "Comprar insumos de limpieza y desinfectantes para planta y oficinas.",
        origen: "Administración - Compras",
        direccion: "San Martín 150, Morón",
        latitud: -34.651299,
        longitud: -58.621487,
        yiqi_instance_id: null,
        estado: "Completado",
        chofer_id: "marcelo_calle",
        comentarios_chofer: "Todo comprado en Distribuidora Central. Adjunto foto de comprobante.",
        firma_url: "https://www.w3.org/TR/ODF12/Signature.png", // Mock Signature
        remito_foto_url: "https://upload.wikimedia.org/wikipedia/commons/0/0b/ReceiptKeyero.jpg", // Mock Receipt Photo
        creado_en: new Date(Date.now() - 3600000 * 24).toISOString(),
        actualizado_en: new Date(Date.now() - 3600000 * 18).toISOString()
    }
];

// Database Storage Key (Simulates Firestore collection name)
const DB_STORAGE_KEY = "tmc_task_board_tasks";

// State management
let state = {
    tasks: [],
    draggedTaskId: null
};

// ====================================================================
// SERVICE LAYER (SWAPPABLE DATABASE CONTROLLERS)
// ====================================================================

// Initialization database connection
function initDatabase() {
    const localData = localStorage.getItem(DB_STORAGE_KEY);
    if (!localData) {
        // First load: prepopulate database with defaults
        localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(DEFAULT_TASKS));
        state.tasks = [...DEFAULT_TASKS];
    } else {
        try {
            state.tasks = JSON.parse(localData);
        } catch (e) {
            console.error("Error reading database storage, resetting:", e);
            state.tasks = [...DEFAULT_TASKS];
            saveTasksToDB(state.tasks);
        }
    }
}

// Write back to database store
function saveTasksToDB(taskList) {
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(taskList));
    // Dispatch storage event manually for same-tab triggers (realtime emulation)
    window.dispatchEvent(new Event('storage'));
}

// Get all tasks (equivalent to real-time subscription)
function getTasks() {
    return state.tasks;
}

// Create new task
function dbCreateTask(newTask) {
    state.tasks.push(newTask);
    saveTasksToDB(state.tasks);
}

// Update task
function dbUpdateTask(taskId, updatedFields) {
    state.tasks = state.tasks.map(t => {
        if (t.id === taskId) {
            return {
                ...t,
                ...updatedFields,
                actualizado_en: new Date().toISOString()
            };
        }
        return t;
    });
    saveTasksToDB(state.tasks);
}

// Get single task by ID
function dbGetTaskById(taskId) {
    return state.tasks.find(t => t.id === taskId);
}

// ====================================================================
// APPLICATION INTERFACE ACTIONS & RENDER
// ====================================================================

document.addEventListener("DOMContentLoaded", () => {
    initDatabase();
    renderBoard();

    // Listen to storage events to simulate real-time updates from other processes
    window.addEventListener("storage", () => {
        const localData = localStorage.getItem(DB_STORAGE_KEY);
        if (localData) {
            state.tasks = JSON.parse(localData);
            renderBoard();
        }
    });

    // Close autocomplete suggestion box if clicked outside
    document.addEventListener("click", (e) => {
        const suggBox = document.getElementById("yiqi-suggestions");
        const autocompleteInput = document.getElementById("task-yiqi-id");
        if (e.target !== suggBox && e.target !== autocompleteInput) {
            suggBox.style.display = "none";
        }
    });
});

// Render cards and columns on screen
function renderBoard() {
    const columns = ["Solicitado", "En Proceso", "Listo para Retirar", "En Reparto", "Completado"];
    
    // Clear and reset status columns
    columns.forEach(colName => {
        const containerId = `tasks-${colName.toLowerCase().replace(/\s+/g, "-")}`;
        const container = document.getElementById(containerId);
        if (container) {
            container.innerHTML = "";
        }
    });

    // Keep counters
    const counters = {
        "Solicitado": 0,
        "En Proceso": 0,
        "Listo para Retirar": 0,
        "En Reparto": 0,
        "Completado": 0
    };

    // Render each task card
    const tasks = getTasks();
    tasks.forEach(task => {
        if (counters[task.estado] !== undefined) {
            counters[task.estado]++;
        }

        const containerId = `tasks-${task.estado.toLowerCase().replace(/\s+/g, "-")}`;
        const container = document.getElementById(containerId);
        if (container) {
            const cardEl = createTaskCard(task);
            container.appendChild(cardEl);
        }
    });

    // Update column badge counters
    columns.forEach(colName => {
        const badgeId = `badge-${colName.toLowerCase().replace(/\s+/g, "-")}`;
        const badge = document.getElementById(badgeId);
        if (badge) {
            badge.innerText = counters[colName];
        }
    });

    // Update global dashboard statistics
    const totalActive = tasks.filter(t => t.estado !== "Completado").length;
    document.getElementById("count-total").innerText = totalActive;
    document.getElementById("count-ready").innerText = counters["Listo para Retirar"];
    document.getElementById("count-completed").innerText = counters["Completado"];
}

// Generate Card Element
function createTaskCard(task) {
    const card = document.createElement("article");
    card.className = `task-card card-${task.estado.toLowerCase().replace(/\s+/g, "-")}`;
    card.id = `task-card-${task.id}`;
    card.draggable = task.estado !== "Completado"; // Completed tasks cannot be dragged
    
    // Set Drag and Drop handlers
    card.addEventListener("dragstart", (e) => {
        state.draggedTaskId = task.id;
        card.classList.add("dragging");
        // Required for Firefox
        e.dataTransfer.setData("text/plain", task.id);
    });

    card.addEventListener("dragend", () => {
        state.draggedTaskId = null;
        card.classList.remove("dragging");
        // Remove drag-over highlights
        document.querySelectorAll(".board-column").forEach(col => col.classList.remove("drag-over"));
    });

    // Click handler to open detail modal
    card.addEventListener("click", () => {
        openDetailModal(task.id);
    });

    // Icon representations
    const typeIcons = { Insumo: "🏭", Cobranza: "💵", Trámite: "📄" };
    const icon = typeIcons[task.tipo] || "📋";

    // Card Content HTML structure
    card.innerHTML = `
        <span class="card-tag tag-${task.tipo.toLowerCase()}">${icon} ${task.tipo}</span>
        <h3 class="card-title">${escapeHTML(task.descripcion)}</h3>
        <div class="card-meta">
            <div class="card-meta-item" title="Dirección de la tarea">
                <span class="card-meta-icon">📍</span>
                <span class="card-meta-text">${escapeHTML(task.direccion)}</span>
            </div>
            <div class="card-meta-item" title="Sector origen">
                <span class="card-meta-icon">👤</span>
                <span class="card-meta-text">${escapeHTML(task.origen)}</span>
            </div>
            ${task.chofer_id ? `
                <div class="card-meta-item" title="Chofer asignado">
                    <span class="card-meta-icon">🚚</span>
                    <span class="card-meta-text">${escapeHTML(getDriverName(task.chofer_id))}</span>
                </div>
            ` : ""}
            ${task.yiqi_instance_id ? `
                <div class="card-erp-link" title="Enlace ERP YiQi">
                    <span>⚙️ YiQi: #${escapeHTML(task.yiqi_instance_id)}</span>
                </div>
            ` : ""}
        </div>
    `;

    return card;
}

// Drag and drop mechanics
function allowDrop(e) {
    e.preventDefault();
    const col = e.currentTarget;
    col.classList.add("drag-over");
}

function handleDrop(e, targetState) {
    e.preventDefault();
    const col = e.currentTarget;
    col.classList.remove("drag-over");

    const taskId = state.draggedTaskId || e.dataTransfer.getData("text/plain");
    if (!taskId) return;

    const task = dbGetTaskById(taskId);
    if (!task) return;

    if (task.estado === targetState) return;

    // Check business logic constraints
    const oldState = task.estado;

    // Trigger state change
    dbUpdateTask(taskId, { estado: targetState });
    renderBoard();

    // Trigger Side effect: If moved to Completed by admin, mock stock entry or trigger simulation
    if (targetState === "Completado" && task.yiqi_instance_id) {
        console.log(`Task ${taskId} completed by office staff. Simulating stock entry transition in YiQi ERP...`);
        alert(`Tarea #${taskId} completada. El ERP YiQi ha procesado el ingreso de stock correspondiente a la instancia #${task.yiqi_instance_id}.`);
    }

    // Trigger Side effect: If moved to "Listo para Retirar", log for driver availability
    if (targetState === "Listo para Retirar") {
        console.log(`Task ${taskId} is now flagged as "Listo para Retirar". Available for CALLE App.`);
    }
}

// Trigger refreshing of board
function refreshBoard() {
    initDatabase();
    renderBoard();
    console.log("Dashboard refreshed and synchronized with localStorage DB.");
}

// ====================================================================
// MODAL CONTROLS: CREATING & VIEWING TASKS
// ====================================================================

function openCreateModal() {
    const modal = document.getElementById("task-modal");
    modal.style.display = "flex";
    document.getElementById("create-task-form").reset();
    document.getElementById("driver-group").style.display = "none";
    document.getElementById("yiqi-suggestions").style.display = "none";
}

function closeCreateModal() {
    const modal = document.getElementById("task-modal");
    modal.style.display = "none";
}

function handleTypeChange(val) {
    // Optional helper fields or validations based on task types
    const driverGroup = document.getElementById("driver-group");
    // Only display driver assignment in creation if task is ready to dispatch
    driverGroup.style.display = "block";
}

// Estimation of Coordinates
function fillGeocodingMock() {
    const address = document.getElementById("task-address").value.trim();
    if (!address) {
        alert("Por favor, ingrese una dirección primero.");
        return;
    }
    
    // Generate pseudo-coordinates around Buenos Aires center
    const baseLat = -34.6037;
    const baseLng = -58.3816;
    const offsetLat = (Math.random() - 0.5) * 0.15;
    const offsetLng = (Math.random() - 0.5) * 0.15;
    
    document.getElementById("task-lat").value = (baseLat + offsetLat).toFixed(6);
    document.getElementById("task-lng").value = (baseLng + offsetLng).toFixed(6);
    
    console.log(`Geolocating: Estimated position for "${address}"`);
}

// Autocomplete logic for YiQi instances
function searchYiqiInstances(query) {
    const suggBox = document.getElementById("yiqi-suggestions");
    if (!query.trim()) {
        suggBox.style.display = "none";
        return;
    }

    const filtered = YIQI_MOCK_INSTANCES.filter(inst => 
        inst.details.toLowerCase().includes(query.toLowerCase())
    );

    if (filtered.length === 0) {
        suggBox.innerHTML = `<div class="suggestion-item" style="color:var(--text-muted); cursor:default;">No se encontraron documentos en YiQi ERP</div>`;
    } else {
        suggBox.innerHTML = filtered.map(inst => `
            <div class="suggestion-item" onclick="selectYiqiInstance('${inst.id}', '${inst.details}')">
                <div class="suggestion-title">📑 ${inst.type} #${inst.id}</div>
                <div class="suggestion-meta">Referencia: ${inst.provider || inst.client || inst.origin} - Items: ${inst.items}</div>
            </div>
        `).join("");
    }
    suggBox.style.display = "block";
}

function selectYiqiInstance(id, details) {
    document.getElementById("task-yiqi-id").value = id;
    document.getElementById("yiqi-suggestions").style.display = "none";
}

// Save form data into DB
function saveTask(e) {
    e.preventDefault();

    const tipo = document.getElementById("task-type").value;
    const descripcion = document.getElementById("task-description").value;
    const origen = document.getElementById("task-origin").value;
    const direccion = document.getElementById("task-address").value;
    const latInput = document.getElementById("task-lat").value;
    const lngInput = document.getElementById("task-lng").value;
    const yiqiId = document.getElementById("task-yiqi-id").value;
    const driverId = document.getElementById("task-driver").value;

    const newTask = {
        id: "task-" + Date.now(),
        tipo,
        descripcion,
        origen,
        direccion,
        latitud: latInput ? parseFloat(latInput) : null,
        longitud: lngInput ? parseFloat(lngInput) : null,
        yiqi_instance_id: yiqiId || null,
        estado: driverId ? "En Reparto" : "Solicitado", // If driver assigned immediately, place in reparto. Otherwise requested.
        chofer_id: driverId || null,
        comentarios_chofer: null,
        firma_url: null,
        remito_foto_url: null,
        creado_en: new Date().toISOString(),
        actualizado_en: new Date().toISOString()
    };

    dbCreateTask(newTask);
    closeCreateModal();
    renderBoard();
}

// Open Detail view modal
function openDetailModal(taskId) {
    const task = dbGetTaskById(taskId);
    if (!task) return;

    const modal = document.getElementById("detail-modal");
    const bodyContent = document.getElementById("detail-body-content");
    
    // Set headers
    document.getElementById("detail-title").innerText = `Tarea #${task.id.replace("task-", "")}`;

    const dateCreado = new Date(task.creado_en).toLocaleString("es-AR");
    const dateActualizado = new Date(task.actualizado_en).toLocaleString("es-AR");
    const linkERP = task.yiqi_instance_id ? `<span style="color:var(--color-primary); font-weight:600;">VINCULADO A INSTANCIA ERP #${task.yiqi_instance_id}</span>` : '<span style="color:var(--text-muted);">Ninguna</span>';

    // Format coordinates link
    const mapsLink = (task.latitud && task.longitud) 
        ? `<a href="https://www.google.com/maps/search/?api=1&query=${task.latitud},${task.longitud}" target="_blank" style="color:var(--color-solicitado); text-decoration:none;">📍 Ver en Google Maps (${task.latitud.toFixed(4)}, ${task.longitud.toFixed(4)})</a>`
        : '<span style="color:var(--text-muted);">Sin coordenadas GPS registradas</span>';

    bodyContent.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px;">
            <span class="card-tag tag-${task.tipo.toLowerCase()}">${task.tipo}</span>
            <span style="font-weight:600; color:var(--text-primary); border: 1px solid var(--border-color); padding: 4px 10px; border-radius:10px; background:rgba(255,255,255,0.03);">Estado: ${task.estado}</span>
        </div>
        
        <div class="detail-item">
            <div class="detail-label">Descripción de la Tarea</div>
            <div class="detail-value" style="font-size:1.05rem; line-height:1.5; background:rgba(0,0,0,0.15); padding:10px; border-radius:6px; border:1px solid var(--border-color);">${escapeHTML(task.descripcion)}</div>
        </div>

        <div class="detail-item">
            <div class="detail-label">Origen / Solicitante</div>
            <div class="detail-value">${escapeHTML(task.origen)}</div>
        </div>

        <div class="detail-item">
            <div class="detail-label">Dirección</div>
            <div class="detail-value">${escapeHTML(task.direccion)}</div>
        </div>

        <div class="detail-item">
            <div class="detail-label">Coordenadas GPS</div>
            <div class="detail-value">${mapsLink}</div>
        </div>

        <div class="detail-item">
            <div class="detail-label">ERP YiQi Vincular ID</div>
            <div class="detail-value">${linkERP}</div>
        </div>

        <div class="detail-item">
            <div class="detail-label">Chofer Asignado</div>
            <div class="detail-value">${task.chofer_id ? escapeHTML(getDriverName(task.chofer_id)) : '<span style="color:var(--text-muted);">Sin asignar</span>'}</div>
        </div>

        <div class="detail-row" style="display:flex; justify-content:space-between; gap:20px; font-size:0.8rem; color:var(--text-muted); border-top:1px solid var(--border-color); padding-top:15px; margin-top:20px;">
            <div>Creado: ${dateCreado}</div>
            <div>Actualizado: ${dateActualizado}</div>
        </div>

        <!-- Drivers Attachments & Signatures (Only displayed if task is Completed) -->
        ${task.estado === "Completado" ? `
            <div style="border-top:1px solid var(--border-color); margin-top:20px; padding-top:15px;">
                <h4 style="font-size:0.9rem; text-transform:uppercase; color:var(--text-primary); margin-bottom:10px;">Comprobantes de Recepción (Chofer)</h4>
                
                <div class="detail-item">
                    <div class="detail-label">Comentario del Chofer</div>
                    <div class="detail-value" style="font-style:italic; color:var(--text-primary);">${task.comentarios_chofer ? escapeHTML(task.comentarios_chofer) : 'Sin comentarios'}</div>
                </div>

                <div class="detail-attachment-grid">
                    <div class="attachment-card">
                        <div class="attachment-title">Firma del Cliente</div>
                        ${task.firma_url ? `
                            <img src="${task.firma_url}" alt="Firma Chofer" class="attachment-image">
                        ` : `
                            <div style="height:150px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); background:rgba(0,0,0,0.1); border-radius:6px;">Firma no disponible</div>
                        `}
                    </div>
                    <div class="attachment-card">
                        <div class="attachment-title">Foto del Remito del Proveedor</div>
                        ${task.remito_foto_url ? `
                            <img src="${task.remito_foto_url}" alt="Foto Remito" class="attachment-image">
                        ` : `
                            <div style="height:150px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); background:rgba(0,0,0,0.1); border-radius:6px;">Foto no disponible</div>
                        `}
                    </div>
                </div>
            </div>
        ` : ""}
    `;

    modal.style.display = "flex";
}

function closeDetailModal() {
    const modal = document.getElementById("detail-modal");
    modal.style.display = "none";
}

// ====================================================================
// UTILITY HELPERS
// ====================================================================

function getDriverName(driverId) {
    const drivers = {
        carlos_calle: "Carlos Pérez (CALLE)",
        marcelo_calle: "Marcelo Gómez (CALLE)",
        juan_calle: "Juan Rodríguez (CALLE)"
    };
    return drivers[driverId] || driverId;
}

function escapeHTML(str) {
    if (!str) return "";
    return str.replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}
