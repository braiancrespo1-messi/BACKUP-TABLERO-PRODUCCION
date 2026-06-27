// --- CONFIGURACIÓN ---
let sidebarMode = 'today'; // Default to 'today'
const CONFIG = {
    API_BASE: "https://api.yiqi.com.ar",
    TOKEN_URLS: ["https://me.yiqi.com.ar/connect/token", "https://api.yiqi.com.ar/connect/token", "https://api.yiqi.com.ar/token"],
    GETLIST_BASE: "https://api.yiqi.com.ar/api/instancesApi/GetList",
    CLOUD_FUNCTIONS_BASE: "https://us-central1-tmc-backend-2f5c4.cloudfunctions.net",

    // Dynamic Group Smarties (All Entity 794)
    GROUP_SMARTIES: {
        "Cuadros": 2668,
        "Bagueteras": 2675,
        "Bandejas Enlozadas": 2676,
        "Bandejas Exhibidoras": 2678,
        "Bandejas Para Hornos": 2679,
        "Hamburgueseras": 2680,
        "Mobiliario de Elaboración": 2681,
        "Pan de Molde": 2682,
        "Pizzeras": 2683,
        "Recipientes Gastronómicos": 2684,
        "Repostería": 2685,
        "Utensilios": 2686,
        "Trabajos a Medida": 2687
    },
    // Enamel Stock Locations (All Entity 794)
    ENLOZADOS_SMARTIES: {
        "Lozametal": 2677,
        "Cocciolo": 2688
    },
    SMARTIE_PEDIDOS: 2672,
    SMARTIE_BOM: 2669,
    SCHEMA_ID: 1491,

    // New Smarties for Production Logic
    SMARTIE_ARTICULOS: 2671, // Matches user request for Articles data
    SMARTIE_GRUPOS: 2594,    // Restored for name-based lookup fallback

    ENTITY_ARTICULOS: 782,
    ENTITY_GRUPOS: 763,
    ENTITY_PEDIDOS: 1231,    // Ensuring this matches Smartie 2672
    ENTITY_STOCK: 794,
    ENTITY_BOM: 771,         // CONFIRMED per user screenshot

    // Production Save Config
    ALTA_PROD: {
        entityId: 1389,
        SAVE_URLS: ["https://me.yiqi.com.ar/api/instancesApi/Save", "https://api.yiqi.com.ar/api/instancesApi/Save"]
    }
};

// --- CUSTOM MODAL SYSTEM ---
function showModal({ title, content, actions, size }) {
    const overlay = document.getElementById('app-modal');
    const mTitle = document.getElementById('modal-title');
    const mContent = document.getElementById('modal-content');
    const mActions = document.getElementById('modal-actions');
    const card = overlay.querySelector('.modal-card');

    mTitle.innerHTML = title || 'Aviso';
    mContent.innerHTML = content || '';
    mActions.innerHTML = '';

    if (card) {
        card.classList.remove('modal-wide');
        if (size === 'wide') {
            card.classList.add('modal-wide');
        }
    }

    actions.forEach(btn => {
        const b = document.createElement('button');
        if (btn.id) b.id = btn.id; // Support for targeting buttons
        b.className = `btn-modal ${btn.class || 'btn-secondary'}`;
        b.textContent = btn.text;
        b.onclick = () => {
            if (btn.onClick) btn.onClick();
            if (btn.close !== false) closeModal();
        };
        mActions.appendChild(b);
    });

    overlay.classList.add('open');
}

function closeModal() {
    const overlay = document.getElementById('app-modal');
    overlay.classList.remove('open');
    const card = overlay.querySelector('.modal-card');
    if (card) card.classList.remove('modal-wide');
}

function appAlert(msg) {
    return new Promise(resolve => {
        showModal({
            title: '⚠️ Atención',
            content: msg,
            actions: [{ text: 'Aceptar', class: 'btn-produce', onClick: resolve }]
        });
    });
}

function appConfirm(msg) {
    return new Promise(resolve => {
        showModal({
            title: '❓ Confirmar',
            content: msg,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(false) },
                { text: 'Eliminar', class: 'btn-danger', onClick: () => resolve(true) }
            ]
        });
    });
}

function appPrompt(msg, defaultValue = '') {
    return new Promise(resolve => {
        const inputHtml = `<div style="margin-bottom:5px">${msg}</div><input type="number" id="prompt-input" class="modal-input" value="${defaultValue}">`;
        showModal({
            title: '🔢 Ingresar Valor',
            content: inputHtml,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(null) },
                {
                    text: 'Aceptar', class: 'btn-produce', onClick: () => {
                        const val = document.getElementById('prompt-input').value;
                        resolve(val);
                    }
                }
            ]
        });
        setTimeout(() => {
            const inp = document.getElementById('prompt-input');
            if (inp) inp.focus();
        }, 100);
    });
}

/* ==================== GLOBAL STATE ==================== */
let token = localStorage.getItem("yiqi_token");
let dataPedidos = [];
let dataStock = [];
let dataBOM = [];
let dataArticulos = []; // New
let dataGrupos = [];    // Restored for name matching fallback
let currentPendingOrders = []; // Global pending orders for Drag & Drop
let currentGroupedPedidos = []; // Global grouped pedidos for Table Action binding
let calendarEvents = []; // Loaded from local storage or mockup

function saveCalendar() {
    localStorage.setItem('tmc_calendar_events', JSON.stringify(calendarEvents));
}


// NEW: Calendar Notes
// NEW: Calendar Notes
let calendarNotes = {}; // { 'YYYY-MM-DD': [{id: 1, text: 'Note 1'}, {id: 2, text: 'Note 2'}] }
try {
    const savedNotes = localStorage.getItem('tmc_calendar_notes');
    if (savedNotes) calendarNotes = JSON.parse(savedNotes);
} catch (e) { console.error("Error loading calendar notes", e); }

let currentTab = 'pedidos';
let currentMonth = new Date(); // Tracks calendar view month

// Columns Definition for Pedidos
// Keys match internal keys or special logic keys
const COLUMNS_PEDIDOS = [
    { id: 'numero', label: 'Pedido No', visible: true, sortCol: 1, key: 'NUMERO' },
    { id: 'fecha', label: 'Fecha', visible: true, sortCol: 0, key: 'FECHA_PEDI' },
    { id: 'cliente', label: 'Cliente', visible: true, sortCol: 2, key: 'CLIENTE' },
    { id: 'sku_art', label: 'SKU Articulo', visible: true, sortCol: 3, key: 'SKU' },
    { id: 'nombre_art', label: 'Nombre Articulo', visible: true, sortCol: 5, key: 'PRODUCTO' }, // Changed to 5
    { id: 'cantidad', label: 'Cantidad', visible: true, sortCol: 4, key: 'CANT_A_ENTREGAR' },
    { id: 'grupo', label: 'Grupo', visible: true, sortCol: 6, key: 'GRUPO_ART' }, // Changed to 6
    { id: 'bom', label: 'BOM (Requiere fabricar)', visible: true, sortCol: null }, // No sort for comp yet
    { id: 'status', label: '', visible: true, sortCol: null } // Status Emoji Only
];

let sortState = {
    pedidos: { col: 1, asc: false }, // Default Number Desc
    stock: { col: 4, asc: false }
};

let currentGroup = null; // NEW: Track active stock group

// --- AUTH ---
async function checkAuth() { if (!token) await loginYiQi(); }
async function loginYiQi() {
    const user = "mercadolibre@tmcrespo.com.ar";
    const pass = "AdministracionMessi";
    for (const url of CONFIG.TOKEN_URLS) {
        try {
            const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "password", username: user, password: pass }) });
            if (r.ok) { token = (await r.json()).access_token; localStorage.setItem("yiqi_token", token); return; }
        } catch (e) { }
    }
    showError("Error de Login - Revise credenciales");
}

// --- API GENERIC ---
async function apiFetchErrors(url, body) {
    await checkAuth();
    let r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify(body || {}) });
    if (r.status === 401) { await loginYiQi(); r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify(body || {}) }); }
    if (!r.ok) throw new Error(`API Error ${r.status}`);
    return r.json();
}

async function fetchAll(entityId, smartieId) {
    const url = `${CONFIG.GETLIST_BASE}?entityId=${entityId}&schemaId=${CONFIG.SCHEMA_ID}&smartieId=${smartieId}`;
    // Use size 50 as hinted by user, server might page by 50 even if we ask 200.
    let page = 1, all = [], keep = true, size = 50;
    while (keep) {
        try {
            const res = await apiFetchErrors(url, { page, pageSize: size });
            // Handle various response structures
            let rows = [];
            if (res.data && Array.isArray(res.data)) rows = res.data;
            else if (res.rows && Array.isArray(res.rows)) rows = res.rows;
            else if (res.instances && Array.isArray(res.instances)) rows = res.instances;
            else if (res.items && Array.isArray(res.items)) rows = res.items;

            if (rows.length > 0) {
                all.push(...rows);
                page++;
                // If we got fewer rows than requested, verify if it's truly the end.
                // But if server enforces max page size (e.g. 50), then < 200 is always true. 
                // Safer to only stop if 0 rows returned in next call, OR if rows < size (iff size is small like 50).
                if (rows.length < size) keep = false;
            } else {
                keep = false;
            }
        } catch (e) {
            console.error("Error fetching page " + page + " for entity " + entityId + " smartie " + smartieId, e);
            keep = false;
        }
    }
    return all;
}

// --- CLOUD FIREBASE SYNC HELPERS ---
// --- CLOUD FIREBASE SYNC HELPERS WITH STATUS & OFFLINE QUEUE ---
function updateSyncStatus(state) {
    const indicator = document.getElementById('cloud-sync-status');
    if (!indicator) return;

    indicator.classList.remove('syncing', 'local');

    if (state === 'syncing') {
        indicator.innerText = '🔄';
        indicator.title = 'Sincronizando con la nube...';
        indicator.classList.add('syncing');
    } else if (state === 'offline') {
        indicator.innerText = '⚠️';
        indicator.title = 'Modo Local - Conexión offline';
        indicator.classList.add('local');
    } else {
        indicator.innerText = '☁️';
        indicator.title = 'Sincronizado con la nube';
    }
}

function getSyncQueue() {
    return JSON.parse(localStorage.getItem('pending_sync_queue') || '[]');
}

function saveSyncQueue(queue) {
    localStorage.setItem('pending_sync_queue', JSON.stringify(queue));
}

function enqueueSyncTask(type, data) {
    const queue = getSyncQueue();
    queue.push({ type, data, timestamp: Date.now() });
    saveSyncQueue(queue);
    updateSyncStatus('offline');
    triggerOfflineSyncProcessor();
}

let isProcessingSyncQueue = false;
async function triggerOfflineSyncProcessor() {
    if (isProcessingSyncQueue) return;
    const queue = getSyncQueue();
    if (queue.length === 0) {
        updateSyncStatus('online');
        return;
    }

    isProcessingSyncQueue = true;
    updateSyncStatus('syncing');

    console.log(`⏳ Procesando cola de sincronización offline (${queue.length} tareas)...`);

    let tasks = [...queue];
    while (tasks.length > 0) {
        const task = tasks[0];
        try {
            const url = `${CONFIG.CLOUD_FUNCTIONS_BASE}/${task.type === 'saveEvent' ? 'saveCalendarEvent' : 
                          task.type === 'deleteEvent' ? 'deleteCalendarEvent' : 
                          task.type === 'saveNote' ? 'saveCalendarNote' : 
                          task.type === 'deleteNote' ? 'deleteCalendarNote' : 'saveActivityLog'}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(task.type === 'deleteEvent' || task.type === 'deleteNote' ? { id: task.data.id } : task.data)
            });
            if (!response.ok) throw new Error(`Server status ${response.status}`);
            
            const currentQueue = getSyncQueue();
            currentQueue.shift();
            saveSyncQueue(currentQueue);
            tasks.shift();
        } catch (err) {
            console.warn("⚠️ Falló envío de tarea en la cola. Reintentando más tarde...", err);
            updateSyncStatus('offline');
            isProcessingSyncQueue = false;
            return;
        }
    }

    console.log("✅ Cola de sincronización procesada por completo. Sistema ONLINE.");
    updateSyncStatus('online');
    isProcessingSyncQueue = false;
}

window.addEventListener('online', () => {
    console.log("🌐 Red detectada online. Sincronizando pendientes...");
    triggerOfflineSyncProcessor();
});

setInterval(() => {
    if (getSyncQueue().length > 0) {
        triggerOfflineSyncProcessor();
    }
}, 15000);

async function cloudFetch(endpoint, method = 'POST', body = null) {
    const url = `${CONFIG.CLOUD_FUNCTIONS_BASE}/${endpoint}`;
    const options = {
        method: method,
        headers: { 'Content-Type': 'application/json' }
    };
    if (body) {
        options.body = JSON.stringify(body);
    }
    try {
        updateSyncStatus('syncing');
        const response = await fetch(url, options);
        if (!response.ok) throw new Error(`HTTP Error ${response.status}`);
        const data = await response.json();
        updateSyncStatus('online');
        return data;
    } catch (e) {
        console.error(`Error en cloudFetch para ${endpoint}:`, e);
        updateSyncStatus('offline');
        throw e;
    }
}

async function cloudGetCalendarData() {
    try {
        const res = await cloudFetch('getCalendarData', 'POST');
        if (res && res.success && res.data) {
            return res.data;
        }
        throw new Error(res?.error || "Respuesta inválida del servidor");
    } catch (e) {
        console.error("Error al obtener datos del calendario de la nube:", e);
        throw e;
    }
}

async function cloudSaveEvent(event) {
    try {
        await cloudFetch('saveCalendarEvent', 'POST', event);
    } catch (e) {
        console.error("Error al guardar evento en la nube, encolando...", e);
        enqueueSyncTask('saveEvent', event);
    }
}

async function cloudDeleteEvent(eventId) {
    try {
        await cloudFetch('deleteCalendarEvent', 'POST', { id: eventId });
    } catch (e) {
        console.error("Error al eliminar evento en la nube, encolando...", e);
        enqueueSyncTask('deleteEvent', { id: eventId });
    }
}

async function cloudSaveNote(noteId, date, text) {
    try {
        await cloudFetch('saveCalendarNote', 'POST', { id: noteId, date, text });
    } catch (e) {
        console.error("Error al guardar nota en la nube, encolando...", e);
        enqueueSyncTask('saveNote', { id: noteId, date, text });
    }
}

async function cloudDeleteNote(noteId) {
    try {
        await cloudFetch('deleteCalendarNote', 'POST', { id: noteId });
    } catch (e) {
        console.error("Error al eliminar nota en la nube, encolando...", e);
        enqueueSyncTask('deleteNote', { id: noteId });
    }
}

async function cloudSaveActivityLog(log) {
    try {
        await cloudFetch('saveActivityLog', 'POST', log);
    } catch (e) {
        console.error("Error al guardar log de actividad en la nube, encolando...", e);
        enqueueSyncTask('saveLog', log);
    }
}

// Global polling status
let isPollingInitialized = false;
function initAutoRefreshPolling() {
    if (isPollingInitialized) return;
    isPollingInitialized = true;
    
    setInterval(async () => {
        const queue = getSyncQueue();
        if (queue.length > 0) return; // Wait for sync queue first
        if (typeof estaArrastrando !== 'undefined' && estaArrastrando) return;
        
        const modal = document.getElementById('app-modal');
        const mTitle = document.getElementById('modal-title');
        const isHistoryOpen = modal && modal.classList.contains('open') && mTitle && mTitle.innerText.includes('Historial');
        if (modal && modal.classList.contains('open') && !isHistoryOpen) return;
        
        const manualModal = document.getElementById('manualAddModal');
        if (manualModal && manualModal.style.display === 'flex') return;
        
        try {
            const prevEventsStr = JSON.stringify(calendarEvents);
            const prevNotesStr = JSON.stringify(calendarNotes);
            const prevLogsStr = localStorage.getItem('tmc_activity_logs') || '[]';
            
            const cloudData = await cloudGetCalendarData();
            if (cloudData) {
                const newEventsStr = JSON.stringify(cloudData.events || []);
                const newNotesStr = JSON.stringify(cloudData.notes || {});
                const newLogsStr = JSON.stringify(cloudData.logs || []);
                
                if (prevEventsStr !== newEventsStr || prevNotesStr !== newNotesStr) {
                    calendarEvents = cloudData.events || [];
                    calendarNotes = cloudData.notes || {};
                    localStorage.setItem('tmc_calendar_events', JSON.stringify(calendarEvents));
                    localStorage.setItem('tmc_calendar_notes', JSON.stringify(calendarNotes));
                    renderCalendar();
                    updateSidebarActions();
                    console.log("🔄 Tablero auto-refrescado por cambios de calendario/notas en la nube.");
                }
                
                if (prevLogsStr !== newLogsStr) {
                    localStorage.setItem('tmc_activity_logs', newLogsStr);
                    console.log("🔄 Logs de actividad actualizados desde la nube.");
                    if (isHistoryOpen) {
                        refreshActivityHistoryModalContent();
                    }
                }
            }
        } catch (e) {
            console.warn("⚠️ Falló auto-refresh de fondo:", e);
        }
    }, 15000); // 15s polling for near real-time updates
}

// --- MAIN DATA LOADING ---
async function refreshData() {
    // Migrar/limpiar logs locales viejos con información mezclada
    if (!localStorage.getItem('tmc_logs_separated_v2')) {
        localStorage.removeItem('tmc_activity_logs');
        localStorage.setItem('tmc_logs_separated_v2', 'true');
        console.log("🧹 Caché local de logs limpiado para la separación de bitácoras por app.");
    }

    // Process sync queue first
    triggerOfflineSyncProcessor();
    initAutoRefreshPolling();

    const loading = document.getElementById('global-loader');
    const loadText = document.querySelector('.loader-text');
    const progressFill = document.getElementById('loader-progress-fill');

    if (loading) {
        loading.style.display = 'flex';
        loading.classList.remove('fade-out');
    }
    if (loadText) loadText.innerText = "SINCRONIZANDO...";
    if (progressFill) progressFill.style.width = '0%';

    document.getElementById('error').style.display = 'none';

    try {
        // Initialize state
        dataPedidos = []; dataStock = []; dataBOM = []; dataArticulos = []; dataGrupos = [];
        
        // --- MIGRADO A LA NUBE: Cargar Calendario, Notas e Historial ---
        if (loadText) loadText.innerText = "CARGANDO CALENDARIO...";
        try {
            const cloudData = await cloudGetCalendarData();
            if (cloudData) {
                calendarEvents = cloudData.events || [];
                calendarNotes = cloudData.notes || {};
                
                // Guardar en localStorage como respaldo local
                localStorage.setItem('tmc_calendar_events', JSON.stringify(calendarEvents));
                localStorage.setItem('tmc_calendar_notes', JSON.stringify(calendarNotes));
                if (cloudData.logs) {
                    localStorage.setItem('tmc_activity_logs', JSON.stringify(cloudData.logs));
                }
                console.log("📅 Datos del calendario sincronizados desde la nube");
            }
        } catch (cloudErr) {
            console.warn("⚠️ Falló carga desde la nube. Usando respaldo de localStorage:", cloudErr);
        }
        
        updateDebugFooter();

        // 1. Prepare Smartie Fetch List
        const fetchTasks = [
            { name: "Pedidos", entity: CONFIG.ENTITY_PEDIDOS, smartie: CONFIG.SMARTIE_PEDIDOS },
            { name: "BOM", entity: CONFIG.ENTITY_BOM, smartie: CONFIG.SMARTIE_BOM },
            { name: "Articulos", entity: CONFIG.ENTITY_ARTICULOS, smartie: CONFIG.SMARTIE_ARTICULOS },
            { name: "Grupos", entity: CONFIG.ENTITY_GRUPOS, smartie: CONFIG.SMARTIE_GRUPOS }
        ];

        // Add Group-Specific Stock Smarties
        Object.entries(CONFIG.GROUP_SMARTIES).forEach(([name, id]) => {
            fetchTasks.push({ name: `Stock ${name}`, entity: CONFIG.ENTITY_STOCK, smartie: id, isStock: true });
        });

        // Add Enamel Specific Smarties
        Object.entries(CONFIG.ENLOZADOS_SMARTIES).forEach(([name, id]) => {
            fetchTasks.push({ name: `Enlozado ${name}`, entity: CONFIG.ENTITY_STOCK, smartie: id, isStock: true, isEnamel: true });
        });

        // 2. Fetch with Progress Handling
        let loadedCount = 0;
        const totalToFetch = fetchTasks.length;

        const fetchWithProgress = async (task) => {
            const res = await fetchAll(task.entity, task.smartie);
            loadedCount++;
            if (progressFill) progressFill.style.width = `${(loadedCount / totalToFetch) * 100}%`;

            if (task.name === "Pedidos") dataPedidos = res;
            if (task.name === "BOM") dataBOM = res;
            if (task.name === "Articulos") dataArticulos = res;
            if (task.name === "Grupos") dataGrupos = res;

            if (task.isStock) {
                // Tag with Smartie ID for group-specific filtering if needed later
                res.forEach(r => {
                    r._smartieId = task.smartie;
                    if (task.isEnamel) r._isEnamel = true;
                    if (task.name.includes("Lozametal")) r._enamelLocation = "Lozametal";
                    if (task.name.includes("Cocciolo")) r._enamelLocation = "Cocciolo";
                });
                dataStock.push(...res);
            }

            updateDebugFooter();
            return res;
        };

        // Execute all parallel
        await Promise.all(fetchTasks.map(fetchWithProgress));

        loadText.innerText = "PROCESANDO...";

        // --- CALCULATE GLOBAL GROUP DEFICITS ---
        stockCounts = {};
        dataStock.forEach(s => {
            const sku = s["STOC_SKU"] || s["MATE_CODIGO"] || s["SKU"] || s["Codigo"] || "";
            let group = (s["GRMA_DESCRIPCION"] || s["GRUPO_FAMILIA"] || s["GRUPO"] || "").trim();

            if (!group) {
                const art = dataArticulos.find(a => strip(a["MATE_CODIGO"] || "") === strip(sku));
                if (art) group = (art["GRMA_DESCRIPCION"] || art["GRUPO_FAMILIA"] || "").trim();
            }

            if (group) {
                if (!stockCounts[group]) stockCounts[group] = { total: 0, deficitItems: 0, deficitQty: 0 };
                stockCounts[group].total++;

                const real = Number(s["STOC_CANTIDAD"] || s["CANTIDAD"] || s["Stock"] || 0);
                const min = Number(s["MATE_STOCK_SEGURIDAD"] || s["STOC_MINIMO"] || s["MINIMO"] || 0);
                const faltante = Math.max(0, min - real);

                if (faltante > 0) {
                    stockCounts[group].deficitItems++;
                    stockCounts[group].deficitQty += faltante;
                }
            }
        });

        applyFilters();
        renderStockTabs();
        updateDebugFooter();

    } catch (e) {
        showError("Error cargando datos: " + e.message);
        const loading = document.getElementById('global-loader');
        if (loading) loading.style.display = 'none';
    }

    // Smooth Hide Splash
    const splash = document.getElementById('global-loader');
    if (splash) {
        setTimeout(() => {
            const video = document.getElementById('splash-video');
            if (video) video.pause();
            splash.classList.add('fade-out');
            setTimeout(() => { splash.style.display = 'none'; }, 1000);
        }, 1500);
    }
}

/**
 * Granular Refresh: Updates only the Smarties for a specific group.
 * @param {string} groupName 
 */
async function refreshStockGroup(groupName) {
    if (!groupName) return;

    const btn = document.getElementById('btn-refresh-group');
    if (btn) btn.classList.add('spinning');

    try {
        const smartiesToUpdate = [];

        // 1. Find the main Smartie for the group (Case Insensitive Lookup)
        const groupKey = Object.keys(CONFIG.GROUP_SMARTIES).find(k => k.trim().toUpperCase() === groupName.trim().toUpperCase());
        const mainSmartieId = groupKey ? CONFIG.GROUP_SMARTIES[groupKey] : null;

        if (mainSmartieId) {
            smartiesToUpdate.push({ id: mainSmartieId, name: groupName });
        }

        // 2. If Enlozadas, add those extra Smarties
        if (strip(groupName).includes("bandejas enlozadas")) {
            Object.entries(CONFIG.ENLOZADOS_SMARTIES).forEach(([name, id]) => {
                smartiesToUpdate.push({ id: id, name: name, isEnamel: true });
            });
        }

        if (smartiesToUpdate.length === 0) return;

        // 3. Parallel Fetch
        const results = await Promise.all(smartiesToUpdate.map(async (task) => {
            const res = await fetchAll(CONFIG.ENTITY_STOCK, task.id);
            res.forEach(r => {
                r._smartieId = task.id;
                if (task.isEnamel) {
                    r._isEnamel = true;
                    if (task.name.includes("Lozametal")) r._enamelLocation = "Lozametal";
                    if (task.name.includes("Cocciolo")) r._enamelLocation = "Cocciolo";
                }
            });
            return { id: task.id, data: res };
        }));

        // 4. Update global dataStock: Remove old records for these Smarties and Add new ones
        const updatedIds = results.map(r => r.id);
        dataStock = dataStock.filter(s => !updatedIds.includes(s._smartieId));
        results.forEach(r => dataStock.push(...r.data));

        // 5. Refresh UI
        applyFilters();
        updateDebugFooter();

    } catch (e) {
        console.error("Error in granular refresh:", e);
        showError("Error refrescando grupo: " + e.message);
    } finally {
        if (btn) btn.classList.remove('spinning');
    }
}

function updateDebugFooter() {
    const footer = document.getElementById('debug-footer');

    // Core Counts
    const coreItems = [
        { name: "Pedidos", count: dataPedidos.length },
        { name: "Stock Total", count: dataStock.length },
        { name: "Articulos", count: dataArticulos.length },
        { name: "BOM", count: dataBOM.length }
    ];

    let html = `
        <div style="margin-right:auto; display:flex; gap:15px; align-items:center; padding-right:20px; border-right:1px solid #ddd;">
            <span style="font-weight:bold; color:var(--primary-color);">⚡ Acciones:</span>
            <span title="Fabricar Item">🔨 Fabricar</span>
            <span title="Eliminar Evento">🗑️ Eliminar</span>
            <span title="Marcar como Terminado">✅ Terminado</span>
        </div>
    `;

    html += coreItems.map(i => `
        <div class="debug-item">
            <span class="debug-label">${i.name}</span>
            <strong>${i.count}</strong>
        </div>
    `).join('<span style="color:#ccc">|</span>');

    footer.innerHTML = html;
    footer.style.display = 'flex';
}


/* ==================== UI LOGIC ==================== */
function switchTab(tab) {
    currentTab = tab;

    // UI Updates
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));

    // Close dropdown if open
    const menu = document.getElementById('stock-dropdown-menu');
    if (menu) menu.classList.remove('open');

    if (tab === 'planificador') {
        const btn = document.getElementById('tab-planificador');
        if (btn) btn.classList.add('active');
        document.body.classList.add('planner-active');
        if (!currentMonth) currentMonth = new Date();
        setTimeout(() => renderCalendar(), 50);
    } else if (tab === 'pedidos') {
        const btn = document.getElementById('tab-pedidos');
        if (btn) btn.classList.add('active');
        document.body.classList.remove('planner-active');
        applyFilters();
    }

    document.querySelectorAll('.table-view').forEach(v => v.classList.remove('active'));
    document.getElementById(`view-${tab}`).classList.add('active');

    // Reset active group label if not in stock
    if (tab !== 'stock') {
        const label = document.getElementById('active-group-label');
        if (label) label.innerText = "";
        currentGroup = null;
    }

    // Auto-focus search input
    const searchInput = document.getElementById((tab === 'stock') ? 'searchInput-stock' : 'searchInput-pedidos');
    if (searchInput) searchInput.focus();
}

function toggleSidebar() {
    const sidebar = document.getElementById('planner-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}

// --- ACTIVITY LOG (Novedades) ---
function logActivity(action, details, type = 'info', pedidoId = null, eventId = null, clientNameOverride = null) {
    let logs = JSON.parse(localStorage.getItem('tmc_activity_logs') || '[]');
    const now = new Date();

    let clientName = clientNameOverride || "";
    if (pedidoId && pedidoId !== 'STOCK' && typeof dataPedidos !== 'undefined') {
        const p = dataPedidos.find(x => String(x.NUMERO) === String(pedidoId));
        if (p) clientName = p.CLIENTE || "";
    }
    if (!clientName && eventId && typeof calendarEvents !== 'undefined') {
        const ev = calendarEvents.find(e => e.id == eventId);
        if (ev) clientName = ev.cliente || "";
    }

    const entry = {
        app: 'tablero',
        time: now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: now.toLocaleDateString(),
        action: action,
        details: details,
        type: type,
        pedidoId: pedidoId,
        eventId: eventId,
        cliente: clientName,
        timestamp: now.getTime()
    };
    logs.unshift(entry);
    if (logs.length > 100) logs.pop();
    localStorage.setItem('tmc_activity_logs', JSON.stringify(logs));

    // Guardar en la nube
    cloudSaveActivityLog(entry);

    // Refresh sidebar if it's open/active
    if (typeof updateSidebarActions === 'function') updateSidebarActions();
}

/**
 * Toggles a sidebar accordion section
 */
function toggleSidebarSection(element) {
    const section = element.closest('.sidebar-section');
    if (!section) return;

    const isActive = section.classList.contains('active');

    // Close others? (No, let's keep it flexible)
    if (isActive) {
        section.classList.remove('active');
    } else {
        section.classList.add('active');
    }
}

// HEADER CONTROLS (Placeholder - See Bottom for consolidated logic)
// (Removing redundant mid-file copies to keep logica.js clean)
// --- DRAG & SCROLL STATE ---
// (Already defined at bottom)


function resetAllFilters() {
    // 1. Clear Search
    clearSearch(); // Reuse logic

    // 2. Select All Groups
    calendarGroupFilters = {};
    isFilterInit = false;

    // 3. Render
    renderCalendar();
}

function toggleGroupsDropdown() {
    const menu = document.getElementById('groups-dropdown-menu');
    if (menu.style.display === 'none') {
        menu.style.display = 'block';
    } else {
        menu.style.display = 'none';
    }
}

// --- (Duplicate navigation logic removed - consolidated at bottom) ---



// --- DROPDOWN LOGIC ---
function toggleStockDropdown(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('stock-dropdown-menu');
    if (menu) menu.classList.toggle('open');
}

// Close Dropdowns on click outside
document.addEventListener('click', function (event) {
    const stockMenu = document.getElementById('stock-dropdown-menu');
    const trigger = document.getElementById('stock-dropdown-btn');

    if (stockMenu && stockMenu.classList.contains('open') &&
        !stockMenu.contains(event.target) && !trigger.contains(event.target)) {
        stockMenu.classList.remove('open');
    }

    const groupsMenu = document.getElementById('groups-dropdown-menu');
    const groupsBtn = document.querySelector('.btn-header-action');
    if (groupsMenu && groupsMenu.style.display === 'block' &&
        !groupsMenu.contains(event.target) && groupsBtn && !groupsBtn.contains(event.target)) {
        groupsMenu.style.display = 'none';
    }
});



// --- LOGIC: MATCH ORDER TO BOM ---
// --- LOGIC: MATCH ORDER TO BOM ---
// Returns ARRAY of components now, enabling multi-item BOMs
function getBOMComponents(productSKU) {
    if (!productSKU) return [];
    // Find ALL components for this MBOM_CODIGO (Case Insensitive)
    const target = productSKU.trim().toUpperCase();
    const components = dataBOM.filter(b => (b["MBOM_CODIGO"] || "").trim().toUpperCase() === target);

    return components.map(c => ({
        sku: c["MATE_CODIGO"],
        nombre: c["MATE_NOMBRE"],
        cantidad: c["DEBO_CANTIDAD"] || 1
    }));
}

/** Helper to get enriched data (Client name, Article name, etc.) for tooltips */
function getEventEnrichedData(ev) {
    let artName = ev.name || ev.text || "Artículo Desconocido";
    let clientName = ev.cliente || "Manual/Stock";
    let orderDate = "N/A";
    let deliveryDate = null;
    let diasDespacho = null;

    // 1. Enrich from Pedidos
    if (ev.pedidoId && ev.pedidoId !== 'STOCK' && typeof dataPedidos !== 'undefined') {
        const p = dataPedidos.find(x => String(x.NUMERO) === String(ev.pedidoId));
        if (p) {
            clientName = p.CLIENTE || clientName;
            artName = p.PRODUCTO || artName;
            deliveryDate = p.PEDI_FECHA_DE_ENTREGA || null;
            diasDespacho = p.PEDI_DIAS_PARA_EL_DESPACH !== undefined && p.PEDI_DIAS_PARA_EL_DESPACH !== null ? Number(p.PEDI_DIAS_PARA_EL_DESPACH) : null;
            if (p.FECHA_PEDI) {
                try {
                    let d = new Date(p.FECHA_PEDI);
                    if (!isNaN(d.getTime())) orderDate = d.toLocaleDateString();
                    else orderDate = p.FECHA_PEDI;
                } catch (e) { orderDate = p.FECHA_PEDI; }
            }
        }
    } else {
        // 2. Enrich from Articulos/Stock
        if (typeof dataArticulos !== 'undefined') {
            const a = dataArticulos.find(x => String(x.MATE_CODIGO).trim() === String(ev.sku).trim());
            if (a) {
                artName = a.MATE_DESCRIPCION || artName;
                clientName = "Stock / Manual";
            }
        }
    }

    return { artName, clientName, orderDate, deliveryDate, diasDespacho };
}

// --- UI LOGIC ---
function formatDate(dateString) {
    if (!dateString) return "-";
    try {
        // Ensure dateString is in YYYY-MM-DD format for consistent parsing
        const date = new Date(dateString + 'T00:00:00'); // Add T00:00:00 to avoid timezone issues
        return date.toLocaleDateString();
    } catch (e) {
        return dateString; // Return original if invalid
    }
}

function parseProductName(fullName) {
    if (!fullName) return { badge: "", name: "" };
    const trimmed = fullName.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) {
        return { badge: "", name: trimmed };
    }
    const firstWord = trimmed.substring(0, spaceIndex);
    const rest = trimmed.substring(spaceIndex + 1).trim();
    
    // If the first word is a number or dimension code, don't split it
    if (/^\d/.test(firstWord)) {
        return { badge: "", name: trimmed };
    }
    
    return {
        badge: firstWord.toUpperCase(),
        name: rest
    };
}

// --- CONFIG COLUMNS ---
function openConfig() {
    const list = document.getElementById('colList');
    list.innerHTML = '';
    COLUMNS_PEDIDOS.forEach((col, idx) => {
        const div = document.createElement('div');
        div.innerHTML = `
                <label>
                    <input type="checkbox" ${col.visible ? 'checked' : ''} onchange="toggleColumn(${idx})">
                    ${col.label}
                </label>
            `;
        list.appendChild(div);
    });
    document.getElementById('configModal').style.display = 'flex';
}

function closeConfig() { document.getElementById('configModal').style.display = 'none'; }

function toggleColumn(index) {
    COLUMNS_PEDIDOS[index].visible = !COLUMNS_PEDIDOS[index].visible;
    applyFilters(); // Re-render
}

/* ==================== FILTER & RENDER ==================== */
function applyFilters() {
    // Determine input based on current tab
    const inputId = (currentTab === 'stock') ? 'searchInput-stock' : 'searchInput-pedidos';
    const inputEl = document.getElementById(inputId);
    const search = inputEl ? inputEl.value.toLowerCase() : "";

    if (currentTab === 'pedidos') {
        // Render Headers Dynamic
        const thead = document.getElementById('head-pedidos');
        let headerRow = '<tr>';
        COLUMNS_PEDIDOS.forEach((col) => {
            if (col.visible) {
                let clickAttr = '';
                // Special handling for Status (index 8 in array, but separate in logic)
                if (col.id === 'status') clickAttr = `onclick="sortPedidos(8)"`;
                else if (col.sortCol !== null) clickAttr = `onclick="sortPedidos(${col.sortCol})"`;

                headerRow += `<th ${clickAttr} style="cursor:pointer;" data-base-label="${col.label}">${col.label}</th>`;
            }
        });
        headerRow += '</tr>';
        thead.innerHTML = headerRow;

        let filtered = dataPedidos.filter(r => {
            const txt = (r["CLIENTE"] + " " + r["PRODUCTO"] + " " + r["SKU"] + " " + r["NUMERO"] + " " + (r["GRUPO_ART"] || "")).toLowerCase();
            return !search || txt.includes(search);
        });

        renderPedidos(filtered);
        document.getElementById('count-pedidos').innerText = `(${filtered.length})`;

    } else if (currentTab === 'stock') {
        applyStockFilters(search, currentGroup);
    } else if (currentTab === 'planificador') {
        renderCalendar();
    }

    // Update Sort Indicators for Pedidos (if active)
    if (currentTab === 'pedidos') {
        const pedSummary = document.getElementById('summary-pedidos');
        if (pedSummary) {
            pedSummary.style.display = 'block';
            // Smartie info for Pedidos comes from CONFIG.SMARTIE_PEDIDOS
            pedSummary.innerHTML = `🔴 Solicitudes Visibles: <strong>(S:${CONFIG.SMARTIE_PEDIDOS} / E:${CONFIG.ENTITY_PEDIDOS})</strong>`;
        }
        updateSortIndicators('table-pedidos');
    }
}

// --- STOCK NAVIGATION & DROPDOWN ---
function filterStockDropdown(term) {
    const searchTerm = strip(term);
    const items = document.querySelectorAll('#dynamic-stock-tabs .dropdown-item');
    items.forEach(item => {
        const text = strip(item.querySelector('span:first-child').innerText); // Target the span with the group name
        item.style.display = text.includes(searchTerm) ? 'flex' : 'none';
    });
}

let stockCounts = {}; // Global map for group counts

function switchTabToStock(groupName, targetSku = null) {
    currentTab = 'stock';

    // Auto-detect group if only SKU is provided
    if (!groupName && targetSku) {
        const sku = strip(targetSku);
        const item = dataStock.find(s => strip(s["STOC_SKU"] || s["MATE_CODIGO"] || s["SKU"] || "") === sku);
        if (item) {
            // Find group name from Smartie ID mapping in CONFIG
            const smartieId = item._smartieId;
            const foundGroup = Object.keys(CONFIG.GROUP_SMARTIES).find(name => CONFIG.GROUP_SMARTIES[name] === smartieId);
            if (foundGroup) groupName = foundGroup;
        }
    }

    currentGroup = groupName;

    // UI Updates
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.table-view').forEach(v => v.classList.remove('active'));

    const dropdownBtn = document.getElementById('stock-dropdown-btn');
    if (dropdownBtn) dropdownBtn.classList.add('active');

    document.getElementById('view-stock').classList.add('active');

    // Update label
    const label = document.getElementById('active-group-label');
    if (label) label.innerText = groupName ? `(${groupName})` : "(Seleccione Grupo)";

    // Re-render dropdown items to show active state
    renderStockTabs();

    // Close dropdown
    const menu = document.getElementById('stock-dropdown-menu');
    if (menu) menu.classList.remove('open');

    applyFilters();

    // HIGHLIGHT SKU IF PROVIDED
    if (targetSku) {
        setTimeout(() => {
            const rowId = `row-stock-${strip(targetSku)}`;
            const row = document.getElementById(rowId);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('highlight-pulse');
                setTimeout(() => row.classList.remove('highlight-pulse'), 3000);
            }
        }, 300);
    }
}

function renderStockTabs() {
    const container = document.getElementById('dynamic-stock-tabs');
    if (!container) return;
    container.innerHTML = '';

    // 1. RENDER GROUPS (STOCK GENERAL removed per user request)
    const groups = dataGrupos.map(g => (g["GRMA_DESCRIPCION"] || g["GRUPO"] || "").trim()).filter(Boolean);
    groups.sort();

    groups.forEach(group => {
        const btn = document.createElement('button');
        const isActive = (currentTab === 'stock' && currentGroup === group);
        btn.className = `dropdown-item ${isActive ? 'active' : ''}`;
        btn.onclick = (e) => {
            e.stopPropagation();
            switchTabToStock(group);
        };

        const safeName = strip(group).replace(/\s+/g, '-');
        const info = stockCounts[group] || { total: 0, deficitItems: 0, deficitQty: 0 };

        let indicatorHtml = '';
        if (info.deficitQty > 0) {
            indicatorHtml = `<span id="count-stock-${safeName}" class="dropdown-counter deficit">(${Math.round(info.deficitQty)})</span>`;
        } else {
            indicatorHtml = `<span id="count-status-${safeName}" class="dropdown-status-dot"></span>`;
        }

        btn.innerHTML = `
            <span>${group}</span>
            ${indicatorHtml}
        `;
        container.appendChild(btn);
    });
}



// --- GLOBAL LOADER LOGIC ---
function showLoader(msg = "Procesando...") {
    const l = document.getElementById('global-loader');
    if (l) {
        l.querySelector('.loader-text').innerText = msg;
        l.classList.add('api-loading');
        l.classList.remove('fade-out');
        l.style.display = 'flex';
    }
}

function hideLoader() {
    const l = document.getElementById('global-loader');
    if (l) {
        l.classList.remove('api-loading');
        l.style.display = 'none';
    }
}

/* CALENDAR LOGIC */
// Load events
try {
    const saved = localStorage.getItem('tmc_calendar_events');
    if (saved) calendarEvents = JSON.parse(saved);
} catch (e) { console.error("Error loading calendar", e); }


// Global State for Filters
let calendarGroupFilters = {}; // { 'NAME': true/false }
let isFilterInit = false;

function toggleGroupFilter(name) {
    if (name === 'ALL') {
        // Toggle All
        const allSelected = Object.values(calendarGroupFilters).every(v => v);
        for (let k in calendarGroupFilters) calendarGroupFilters[k] = !allSelected;
    } else {
        if (calendarGroupFilters[name] === undefined) return;
        calendarGroupFilters[name] = !calendarGroupFilters[name];
    }
    renderCalendar();
}

let currentCalendarView = 'semanal'; // Default view

function switchCalendarView(view) {
    currentCalendarView = view;
    
    // Update active class on buttons
    const btnSemanal = document.getElementById('btn-view-semanal');
    const btnMensual = document.getElementById('btn-view-mensual');
    
    if (btnSemanal) {
        if (view === 'semanal') btnSemanal.classList.add('active');
        else btnSemanal.classList.remove('active');
    }
    if (btnMensual) {
        if (view === 'mensual') btnMensual.classList.add('active');
        else btnMensual.classList.remove('active');
    }
    
    renderCalendar();
}

function changeMonth(delta) {
    if (currentCalendarView === 'semanal') {
        currentMonth.setDate(currentMonth.getDate() + (delta * 7));
    } else {
        currentMonth.setMonth(currentMonth.getMonth() + delta);
    }
    renderCalendar();
}

function jumpToDate() {
    const m = document.getElementById('cal-select-month').value;
    const y = document.getElementById('cal-select-year').value;
    currentMonth.setMonth(parseInt(m));
    currentMonth.setFullYear(parseInt(y));
    renderCalendar();
}

// Bind explicitly to avoid HTMLEventHandler madness if needed, or stick to onchange property if cleaner.
// Actually, we removed onchange from HTML, so we must add listeners or check if attached.
// Better: Attach once. But renderCalendar might destroy/recreated selects? 
// No, selects are static in HTML row 1113. They are just populated.
// So we attach listener ONCE or check if attached.
// --- INITIALIZATION MOVED TO END OF FILE ---

function goToToday() {
    currentMonth = new Date();
    renderCalendar();
    updateSidebarActions();
}

function setSidebarMode(mode) {
    sidebarMode = mode;
    document.querySelectorAll('.sb-tab').forEach(b => b.classList.remove('active'));

    const target = document.getElementById(`sb-tab-${mode}`);
    if (target) target.classList.add('active');

    updateSidebarActions();
}

function updateSidebarActions() {
    const container = document.querySelector('.sidebar-content');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const overdue = calendarEvents.filter(ev => ev.date < today && ev.status !== 'done' && ev.status !== 'approved' && ev.status !== 'rejected');
    const todayPlan = calendarEvents.filter(ev => ev.date === today && ev.status !== 'done' && ev.status !== 'approved' && ev.status !== 'rejected');

    // 1. Alert Notification (Pulse for bell)
    const bellBtn = document.getElementById('sb-tab-alerts');
    if (bellBtn) {
        if (overdue.length > 0) bellBtn.classList.add('has-alerts');
        else bellBtn.classList.remove('has-alerts');
    }

    // 2. Render based on Mode
    if (sidebarMode === 'agenda') {
        return renderSidebarAgenda();
    }

    if (sidebarMode === 'today') {
        container.innerHTML = `
            <div style="padding:10px; font-weight:700; color:var(--primary-color); border-bottom:1px solid #eee; margin-bottom:10px;">📅 PLAN DE HOY</div>
            ${todayPlan.length === 0 ? '<div style="padding:10px; color:#666; font-style:italic; font-size:0.8em;">Nada agendado para hoy</div>' : ''}
            ${todayPlan.map(ev => renderSidebarCard(ev, 'primary')).join('')}
        `;
        return;
    }

    if (sidebarMode === 'alerts') {
        container.innerHTML = `
            <div style="padding:10px; font-weight:700; color:var(--danger-color); border-bottom:1px solid #eee; margin-bottom:10px;">🔔 NOTIFICACIONES</div>
            ${overdue.length === 0 ? '<div style="padding:10px; color:#666; font-style:italic; font-size:0.8em;">Sin temas pendientes</div>' : ''}
            ${overdue.map(ev => renderSidebarCard(ev, 'danger')).join('')}
        `;
        return;
    }

    if (sidebarMode === 'pedidos-sin-agendar') {
        const unscheduled = dataPedidos.filter(ped => {
            return !calendarEvents.some(e => String(e.pedidoId) === String(ped["NUMERO"] || ""));
        });

        // Group by Pedido + SKU
        const grouped = [];
        const map = new Map();
        unscheduled.forEach(r => {
            const pedidoId = r["NUMERO"] || "";
            const sku = r["SKU"] || "";
            const key = `${pedidoId}|${sku}`;
            const qty = Number(r["CANT_A_ENTREGAR"] || 0);
            const text = (r["TEXTO_ADICIONAL"] || "").trim();

            if (map.has(key)) {
                const existing = map.get(key);
                existing.qty += qty;
                if (text && !existing.text.includes(text)) {
                    existing.text = existing.text ? `${existing.text} | ${text}` : text;
                }
            } else {
                const item = {
                    pedidoId,
                    sku,
                    name: r["PRODUCTO"] || "",
                    qty,
                    grupo: r["GRUPO_ART"] || "",
                    cliente: r["CLIENTE"] || "Stock",
                    text
                };
                map.set(key, item);
                grouped.push(item);
            }
        });

        let sidebarHtml = `
            <div style="padding:10px; font-weight:700; color:#8e44ad; border-bottom:1px solid #eee; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
                <span>📦 PEDIDOS PENDIENTES</span>
                <span style="font-size:0.75em; background:#8e44ad; color:white; padding:2px 6px; border-radius:10px;">${grouped.length}</span>
            </div>
            <div style="font-size:0.8rem; color:#666; margin-bottom:10px; padding:0 5px; font-style:italic;">
                Arrastra un pedido al calendario para agendarlo.
            </div>
            ${grouped.length === 0 ? '<div style="padding:10px; color:#666; font-style:italic; font-size:0.8em;">No hay pedidos pendientes de agendar</div>' : ''}
        `;

        currentPendingOrders = grouped;

        grouped.forEach((item, idx) => {
            const palette = ['#3498db', '#e67e22', '#27ae60', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c', '#34495e'];
            let colorMap = {};
            const defaultColor = '#95a5a6';
            let availableGroups = dataGrupos && dataGrupos.length > 0 ? dataGrupos.map(g => (g["GRMA_DESCRIPCION"] || g["Name"] || "").toUpperCase()).filter(n => n) : ['CARRO', 'BAGUETERO', 'BANDEJA', 'MOLDE'];
            availableGroups.forEach((gName, idx) => {
                colorMap[gName] = palette[idx % palette.length];
            });
            const color = colorMap[item.grupo.toUpperCase()] || defaultColor;

            sidebarHtml += `
                <div class="sidebar-pending-card" draggable="true" data-index="${idx}"
                     style="background:white; border:1px solid #ddd; border-left: 4px solid ${color}; border-radius: 6px; padding: 10px; margin-bottom: 8px; cursor: grab; box-shadow: 0 1px 3px rgba(0,0,0,0.05); transition: all 0.2s;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 4px;">
                        <strong style="font-size:0.85rem; color:#1a73e8;">Pedido #${item.pedidoId}</strong>
                        <span style="font-size:0.8rem; background:#e8f0fe; color:#1967d2; font-weight:bold; padding:2px 6px; border-radius:4px;">${item.qty} u.</span>
                    </div>
                    <div style="font-weight:bold; font-size:0.9rem; color:#333; margin-bottom:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${item.name}">${item.name}</div>
                    <div style="font-size:0.75rem; color:#666;">
                        <strong>SKU:</strong> ${item.sku}<br>
                        <strong>Cliente:</strong> ${item.cliente}
                    </div>
                    ${item.text ? `<div style="font-size:0.72rem; color:#e67e22; background:#fff3e0; padding:2px 6px; border-radius:4px; margin-top:5px; font-style:italic;">📝 ${item.text}</div>` : ''}
                </div>
            `;
        });
        
        container.innerHTML = sidebarHtml;
        return;
    }
}

/** Function to render the chronological agenda in the sidebar */
function renderSidebarAgenda() {
    const container = document.querySelector('.sidebar-content');
    if (!container) return;

    const today = new Date().toISOString().split('T')[0];
    const agendaEvents = [...calendarEvents].sort((a, b) => a.date.localeCompare(b.date));

    // Group events by date
    const groups = {};
    agendaEvents.forEach(ev => {
        if (!groups[ev.date]) groups[ev.date] = [];
        groups[ev.date].push(ev);
    });

    if (agendaEvents.length === 0) {
        container.innerHTML = '<div style="padding:20px; color:#666; font-style:italic; text-align:center;">No hay lotes agendados</div>';
        return;
    }

    let html = '<div class="agenda-list">';

    Object.keys(groups).sort().forEach(date => {
        const isToday = (date === today);
        const dateObj = new Date(date + 'T12:00:00');
        const dayLabel = dateObj.toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();

        html += `
            <div class="agenda-day-group ${isToday ? 'is-today' : ''}">
                <div class="agenda-day-header">
                    <span>${dayLabel} ${isToday ? '(HOY)' : ''}</span>
                    <span>${groups[date].length} ${groups[date].length === 1 ? 'Lote' : 'Lotes'}</span>
                </div>
                ${groups[date].map(ev => {
            const isDone = ev.status === 'done' || ev.status === 'approved';
            const { artName, clientName } = getEventEnrichedData(ev);
            const specText = ev.text ? `\n📝 ${ev.text}` : "";
            const tooltip = `📄 ${artName}${specText}\n👤 ${clientName}\n📦 Pedido #${ev.pedidoId || 'N/A'}\nEstado: ${ev.status || 'Agendado'}`;

            return `
                        <div class="agenda-card" 
                             style="${isDone ? 'opacity:0.5; background:#f9fafc;' : ''}" 
                             title="${tooltip}"
                             onclick="switchTabToCalendar('${ev.sku}', '${ev.date}')">
                            <div class="agenda-card-header">
                                <span class="agenda-card-sku">${ev.sku}</span>
                                <span class="agenda-card-qty">${ev.qty} u.</span>
                            </div>
                        </div>
                    `;
        }).join('')}
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

/** Navigates to the calendar, sets the month, and highlights the SKU */
function switchTabToCalendar(targetSku, targetDate) {
    if (!targetDate) return;

    // 1. Force state update for the calendar MONTH (currentMonth is what renderCalendar uses)
    currentMonth = new Date(targetDate + 'T12:00:00');

    // 2. Switch to 'planificador' view
    switchTab('planificador');

    // 3. Highlight specific event with a retry/delay to ensure DOM is ready
    setTimeout(() => {
        const selector = `.cal-day[data-date="${targetDate}"] .cal-event`; // Corrected selector
        let found = false;
        document.querySelectorAll(selector).forEach(el => {
            if (el.innerText.toUpperCase().includes(targetSku.toUpperCase())) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('highlight-pulse');
                setTimeout(() => el.classList.remove('highlight-pulse'), 3000);
                found = true;
            }
        });
        if (!found) console.log("Event not found in DOM for highlighting:", targetSku, targetDate);
    }, 600);
}


/** Helper for delete confirmation inside agenda items */
async function confirmDeleteEvent(sku, date, id) {
    const ok = await appConfirm(`¿Seguro que desea eliminar el lote de ${sku} del día ${date}?`);
    if (ok) {
        deleteEvent(sku, date, id);
        updateSidebarActions(); // Refresh after action
    }
}

/** Helper to render a calendar card in sidebar */
function renderSidebarCard(ev, type) {
    let client = ev.cliente || "Stock";
    let artName = ev.name || ev.text || "Artículo";

    return `
        <div class="sidebar-action-card">
            <div class="card-header">
                <strong>${ev.sku}</strong>
                <span style="font-size:0.8em;">${formatDate(ev.date)}</span>
            </div>
            <div class="card-body">
                <div style="font-weight:600; font-size:0.9em;">#${ev.pedidoId || 'Stock'} - ${client}</div>
                <div style="font-size:0.85em;">${artName}</div>
                <div style="margin-top:2px; font-weight:bold; color:var(--primary-color);">Cant: ${ev.qty} u.</div>
            </div>
            <div class="card-footer">
                <button class="btn-action-done" onclick="fabricarFromCalendar(${ev.id})">✅ Terminar</button>
                <button class="btn-action-resched" onclick="reprogramEvent('${ev.id}')">🗓️</button>
            </div>
        </div>
    `;
}


function getWeekRangeLabel(start, end) {
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    const startDay = start.getDate();
    const startMonth = months[start.getMonth()];
    const startYear = start.getFullYear();
    const endDay = end.getDate();
    const endMonth = months[end.getMonth()];
    const endYear = end.getFullYear();
    
    if (startYear !== endYear) {
        return `${startDay} ${startMonth} ${startYear} - ${endDay} ${endMonth} ${endYear}`;
    }
    if (start.getMonth() !== end.getMonth()) {
        return `${startDay} ${startMonth} - ${endDay} ${endMonth} (${startYear})`;
    }
    return `${startDay} - ${endDay} ${startMonth} (${startYear})`;
}

function renderCalendar() {
    const container = document.getElementById('calendarContent');
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth(); // 0-indexed
    const today = new Date();
    const isCurrentMonth = today.getMonth() === month && today.getFullYear() === year;

    // --- 2. PREPARE COLORS & FILTERS ---
    let colorMap = {};
    const defaultColor = '#95a5a6';
    const palette = ['#3498db', '#e67e22', '#27ae60', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c', '#34495e'];

    let availableGroups = [];

    if (dataGrupos && dataGrupos.length > 0) {
        availableGroups = dataGrupos.map(g => (g["GRMA_DESCRIPCION"] || g["Name"] || "").toUpperCase()).filter(n => n);
    } else {
        availableGroups = ['CARRO', 'BAGUETERO', 'BANDEJA', 'MOLDE'];
    }

    availableGroups.forEach((gName, idx) => {
        const color = palette[idx % palette.length];
        colorMap[gName] = color;
        const shortKey = gName.split(' ')[0];
        if (shortKey) colorMap[shortKey] = color;
    });

    if (!isFilterInit || Object.keys(calendarGroupFilters).length === 0) {
        availableGroups.forEach(g => {
            if (calendarGroupFilters[g] === undefined) calendarGroupFilters[g] = true;
        });
        isFilterInit = true;
    }

    // --- 3. RENDER DROPDOWN FILTERS ---
    const allActive = Object.values(calendarGroupFilters).every(v => v);

    // Generate List for Dropdown
    let filterHtml = ``;

    availableGroups.forEach(gName => {
        const isActive = calendarGroupFilters[gName] !== false;
        const color = colorMap[gName] || defaultColor;

        filterHtml += `
            <div class="dropdown-item-chip" onclick="toggleGroupFilter('${gName}')" style="padding: 6px 12px;"> <!-- Compact Padding -->
                 <span class="chip-dot" style="background:${isActive ? color : '#ddd'}; width:8px; height:8px;"></span>
                 <span style="color:${isActive ? '#333' : '#999'}; text-decoration:${isActive ? 'none' : 'line-through'}; font-size:0.85rem;">
                    ${gName}
                 </span>
            </div>
        `;
    });

    // INJECT INTO DROPDOWN CONTAINER
    const dropdownContainer = document.getElementById('groups-list-container');
    if (dropdownContainer) {
        dropdownContainer.innerHTML = filterHtml;
    }

    // --- 4. CALCULATE RANGE ---
    let startDate;
    let totalDays;
    
    if (currentCalendarView === 'semanal') {
        const dayOfWeek = currentMonth.getDay(); // 0 (Sun) to 6 (Sat)
        const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
        startDate = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), currentMonth.getDate() - daysToSubtract);
        totalDays = 7;
        
        // Update header label with week range
        const endDate = new Date(startDate.getTime());
        endDate.setDate(startDate.getDate() + 6);
        const txt = document.getElementById('cal-month-year');
        if (txt) txt.innerText = getWeekRangeLabel(startDate, endDate);
    } else {
        const firstDayOfMonth = new Date(year, month, 1);
        const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 (Sun) to 6 (Sat)
        let daysToSubtract = (startingDayOfWeek === 0) ? 6 : startingDayOfWeek - 1;
        startDate = new Date(year, month, 1 - daysToSubtract);
        totalDays = 42;
        
        const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
        const monthName = monthNames[month];
        const txt = document.getElementById('cal-month-year');
        if (txt) txt.innerText = `${monthName} ${year}`;
    }

    // Start HTML
    let html = `<div class="calendar-grid ${currentCalendarView === 'semanal' ? 'weekly-view' : ''}">`;
    const days = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    
    if (currentCalendarView === 'semanal') {
        days.forEach((d, idx) => {
            const dateOfHeader = new Date(startDate.getTime());
            dateOfHeader.setDate(startDate.getDate() + idx);
            const dateNum = dateOfHeader.getDate();
            const headerDateStr = `${dateOfHeader.getFullYear()}-${String(dateOfHeader.getMonth() + 1).padStart(2, '0')}-${String(dateOfHeader.getDate()).padStart(2, '0')}`;
            
            // Calculate progress for this day header
            const dayEvs = calendarEvents.filter(ev => ev.date === headerDateStr);
            let progressWidget = "";
            if (dayEvs.length > 0) {
                const totalQty = dayEvs.reduce((acc, ev) => acc + Number(ev.qty || 1), 0);
                const completedQty = dayEvs.filter(ev => ev.status === 'done' || ev.status === 'approved').reduce((acc, ev) => acc + Number(ev.qty || 1), 0);
                const pct = totalQty > 0 ? Math.round((completedQty / totalQty) * 100) : 0;
                
                let barColor = "#ef4444";
                if (pct >= 100) barColor = "#10b981";
                else if (pct >= 50) barColor = "#f59e0b";
                
                progressWidget = `
                    <div style="width: 85%; margin-top: 4px; display: flex; flex-direction: column; align-items: center; gap: 2px;" title="Progreso: ${pct}% (${completedQty}/${totalQty} u.)">
                        <div style="width: 100%; background: #e2e8f0; height: 5px; border-radius: 3px; overflow: hidden;">
                            <div style="width: ${pct}%; background: ${barColor}; height: 100%; border-radius: 3px; transition: width 0.3s ease-in-out;"></div>
                        </div>
                        <span style="font-size: 0.65rem; font-weight: 600; color: #475569; font-family:'Inter', sans-serif !important;">${completedQty}/${totalQty} u. (${pct}%)</span>
                    </div>
                `;
            } else {
                progressWidget = `
                    <div style="width: 85%; margin-top: 4px; display: flex; flex-direction: column; align-items: center; gap: 2px;">
                        <div style="width: 100%; background: #e2e8f0; height: 5px; border-radius: 3px;"></div>
                        <span style="font-size: 0.65rem; font-weight: 500; color: #94a3b8; font-family:'Inter', sans-serif !important; font-style: italic;">Sin lotes</span>
                    </div>
                `;
            }

            html += `
                <div class="cal-day-header" style="display:flex; flex-direction:column; align-items:center; padding: 6px 4px; min-height: 52px; justify-content: center; box-sizing: border-box; background-color: #f1f3f4; border-bottom: 1px solid #ddd; border-right: 1px solid #ddd;">
                    <div style="font-weight: 700; font-size: 0.85rem; font-family:'Inter', sans-serif !important;">${d} ${dateNum}</div>
                    ${progressWidget}
                </div>
            `;
        });
    } else {
        days.forEach(d => html += `<div class="cal-day-header">${d}</div>`);
    }

    // Month Names Short for Date Labels
    const monthShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

    const searchEl = document.getElementById('planner-search');
    const searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : "";
    const hideFinished = document.getElementById('hide-finished')?.checked;

    for (let i = 0; i < totalDays; i++) {
        const currentDate = new Date(startDate);
        currentDate.setDate(startDate.getDate() + i);

        const dYear = currentDate.getFullYear();
        const dMonth = currentDate.getMonth();
        const dDate = currentDate.getDate();
        const dateStr = `${dYear}-${String(dMonth + 1).padStart(2, '0')}-${String(dDate).padStart(2, '0')}`;

        const isToday = today.toDateString() === currentDate.toDateString();
        const isOtherMonth = dMonth !== month;

        // Custom Date Label (e.g. "1 abr")
        let dateLabel = dDate;
        if (dDate === 1) {
            dateLabel = `${dDate} ${monthShort[dMonth]}`;
        }

        // Style Grid Cell
        let cellStyle = isOtherMonth ? 'background:#f9fafb; color:#555;' : 'background:#fff; color:#333;';
        if (isToday) cellStyle += 'border:2px solid var(--primary-color);';

        let todayDot = isToday ? `<div class="today-dot" title="Hoy"></div>` : "";

        let noteHtml = "";
        if (calendarNotes && calendarNotes[dateStr]) {
            const notes = Array.isArray(calendarNotes[dateStr]) ? calendarNotes[dateStr] : [{ id: 0, text: calendarNotes[dateStr] }];
            if (notes.length > 0) {
                noteHtml = `<div style="display:flex; gap:2px; margin-left:5px;">`;
                notes.forEach(n => {
                    noteHtml += `<span onclick="addNotePrompt('${dateStr}', ${n.id}); event.stopPropagation();" title="${n.text.replace(/"/g, '&quot;')}" style="cursor:pointer; font-size:1.2em;">📝</span>`;
                });
                noteHtml += `</div>`;
            }
        }

        html += `<div class="cal-day" data-date="${dateStr}" style="${cellStyle}; min-height:80px; position:relative;">
                    ${todayDot}
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                        <div style="display:flex; align-items:center;">
                             <div style="text-align:right; font-weight:bold; font-size:0.9em;">${dateLabel}</div>
                             ${noteHtml}
                        </div>
                        <button class="btn-icon cal-add-btn" onclick="openDayDetailModal('${dateStr}'); event.stopPropagation();" title="Detalle del Día" style="font-size:0.8em; padding:0 4px; background:none; border:none; cursor:pointer; opacity:0.7;">➕</button>
                    </div>`;

        // FILTER EVENTS
        const dayEvents = calendarEvents.filter(ev => {
            if (ev.date !== dateStr) return false;
            if (hideFinished && (ev.status === 'done' || ev.status === 'approved')) return false;

            // ENRICHED SEARCH (Lupita upgrade)
            let enrichedClient = ev.cliente || "";
            let enrichedArt = ev.name || ev.text || "";

            // Try to find more info if available
            if (ev.pedidoId && ev.pedidoId !== 'STOCK' && typeof dataPedidos !== 'undefined') {
                const p = dataPedidos.find(x => String(x.NUMERO) === String(ev.pedidoId));
                if (p) {
                    enrichedClient = p.CLIENTE || enrichedClient;
                    enrichedArt = p.PRODUCTO || enrichedArt;
                }
            }
            if (typeof dataArticulos !== 'undefined') {
                const a = dataArticulos.find(x => String(x.MATE_CODIGO).trim() === String(ev.sku).trim());
                if (a && a.MATE_DESCRIPCION) {
                    enrichedArt = a.MATE_DESCRIPCION;
                }
            }

            const searchTxt = `${ev.sku} ${enrichedArt} ${ev.pedidoId || ""} ${ev.grupo || ""} ${enrichedClient}`.toLowerCase();
            if (searchTerm && !searchTxt.includes(searchTerm)) return false;

            let gName = (ev.grupo || "").toUpperCase();
            if (calendarGroupFilters[gName] === false) return false;
            let foundKey = availableGroups.find(k => gName.includes(k));
            if (foundKey && calendarGroupFilters[foundKey] === false) return false;
            return true;
        });

        // SORT EVENTS BY TIME CHRONOLOGICALLY
        dayEvents.sort((a, b) => {
            if (!a.time && !b.time) return 0;
            if (!a.time) return 1;
            if (!b.time) return -1;
            return a.time.localeCompare(b.time);
        });

        // RENDER EVENTS (Max 3 visible per cell for monthly view, all visible for weekly view)
        const showAllEvents = (currentCalendarView === 'semanal');
        const maxVisible = showAllEvents ? 999 : 3;
        const visibleEvents = dayEvents.slice(0, maxVisible);
        const hiddenCount = showAllEvents ? 0 : (dayEvents.length - maxVisible);

        let evHtml = `<div class="cal-events">`;
        visibleEvents.forEach(ev => {
            const color = colorMap[ev.grupo] || colorMap[(ev.grupo || "").split(' ')[0]] || defaultColor;
            let doneStyle = "";
            let doneIcon = "";
            if (ev.status === 'done') {
                doneStyle = "opacity: 0.6; text-decoration: line-through; border: 2.5px solid #e67e22 !important; background: #fffaf0;";
                doneIcon = "⏳ ";
            } else if (ev.status === 'approved') {
                doneStyle = "opacity: 1.0; text-decoration: line-through; border: 2.5px solid #10b981 !important; background: #f0fdf4; color: #000000 !important; font-weight: 600 !important;";
                doneIcon = "✅ ";
            } else if (ev.status === 'rejected') {
                doneStyle = "opacity: 1.0; border: 2.5px solid #ef4444 !important; background: #fef2f2; color: #b91c1c !important; font-weight: 600 !important;";
                doneIcon = "❌ ";
            }

            // --- FINAL TOOLTIP LOGIC V5 (Consolidated) ---
            const { artName, clientName, orderDate, deliveryDate, diasDespacho } = getEventEnrichedData(ev);

            // Format: Emojis, No Qty, Real Order Date
            let specText = ev.text ? `\n📝 ${ev.text}` : "";
            let timeText = ev.time ? `⏰ ${ev.time} Hs\n` : "";
            let tooltip = `${timeText}📄 ${artName}${specText}\n👤 ${clientName}\n📦 Pedido #${ev.pedidoId || 'N/A'}\n🗓️ ${orderDate}`;
            if (deliveryDate) {
                tooltip += `\n📅 Pactado: ${formatDate(deliveryDate)}`;
                if (diasDespacho !== null) {
                    tooltip += ` (${diasDespacho} días)`;
                }
            }
            if (ev.rescheduleHistory && ev.rescheduleHistory.length > 0) {
                tooltip += `\n\n🔄 Historial de Cambios:`;
                ev.rescheduleHistory.forEach(h => {
                    tooltip += `\n• De ${formatDate(h.fromDate)} a ${formatDate(h.toDate)} (${h.reason})`;
                });
            }

            if (showAllEvents) {
                const isDone = ev.status === 'done';
                const isApproved = ev.status === 'approved';
                const isRejected = ev.status === 'rejected';
                const cardBg = isDone ? '#fffaf0' : (isApproved ? '#f0fdf4' : (isRejected ? '#fef2f2' : '#ffffff'));
                const cardBorder = isDone ? '1.5px solid #e67e22' : (isApproved ? '1.5px solid #10b981' : (isRejected ? '1.5px solid #ef4444' : '1px solid #e2e8f0'));
                const cardLeftBorder = `4px solid ${isDone ? '#e67e22' : (isApproved ? '#10b981' : (isRejected ? '#ef4444' : color))}`;
                const cardOpacity = isDone ? '0.65' : '1.0';
                const titleColor = isDone ? '#64748b' : (isApproved ? '#000000' : (isRejected ? '#b91c1c' : '#0f172a'));
                const titleDecoration = (isDone || isApproved) ? 'line-through' : 'none';
                const titleWeight = (isApproved || isRejected) ? '700' : '600';

                let statusBadge = "";
                if (isDone) {
                    statusBadge = `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:#d97706 !important; background:#fef3c7 !important; border: 1px solid #fde68a !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap !important; display:inline-block; line-height: 1 !important;">⏳ Pendiente Calidad</span>`;
                } else if (isApproved) {
                    statusBadge = `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:#15803d !important; background:#dcfce7 !important; border: 1px solid #bbf7d0 !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap !important; display:inline-block; line-height: 1 !important;">✅ Aprobado Calidad</span>`;
                } else if (isRejected) {
                    statusBadge = `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:#b91c1c !important; background:#fee2e2 !important; border: 1px solid #fca5a5 !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap !important; display:inline-block; line-height: 1 !important;">❌ Rechazado Calidad</span>`;
                }

                const parsed = parseProductName(artName);
                evHtml += `
                    <div class="cal-event weekly-card" id="${ev.id}" draggable="true" ondragstart="drag(event)" 
                         onclick="openEventActions(event, '${ev.id}')"
                         title="${tooltip}"
                         style="border-left: ${cardLeftBorder} !important; border-top: ${cardBorder} !important; border-right: ${cardBorder} !important; border-bottom: ${cardBorder} !important; opacity: ${cardOpacity} !important; display:flex; flex-direction:column; gap:6px; padding:8px 10px; background:${cardBg} !important; border-radius:8px; white-space:normal; box-shadow:0 1px 3px rgba(0,0,0,0.05); margin-bottom:6px; font-family:'Inter', sans-serif !important; font-size: 1rem !important; line-height: 1.4 !important; transition: all 0.2s ease;">
                        <div style="display:flex; justify-content:space-between; align-items:center; width:100%; flex-wrap:wrap; gap:6px 4px;">
                            <div style="display:flex; align-items:center; gap:4px 6px; flex-wrap:wrap; min-width: 0;">
                                <span class="card-qty-badge" style="font-family:'Inter', sans-serif !important; font-size:0.8rem !important; font-weight:700 !important; background:#f1f5f9 !important; color:#334155 !important; border: 1px solid #cbd5e1 !important; padding:2px 6px !important; border-radius:12px !important; line-height: 1 !important; display:inline-block; white-space:nowrap !important;">${ev.qty || 1} u.</span>
                                ${parsed.badge ? `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:${color} !important; background:${color}12 !important; border: 1px solid ${color}25 !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap !important; display:inline-block; line-height: 1 !important;">${parsed.badge}</span>` : ''}
                                ${statusBadge}
                            </div>
                            <div style="display:flex; align-items:center; gap:4px; flex-wrap:wrap; min-width: 0;">
                                <strong style="font-family:'Inter', sans-serif !important; font-size:0.75rem !important; color:#2563eb !important; background:#eff6ff !important; border: 1px solid #bfdbfe !important; padding:2px 6px !important; border-radius:4px !important; font-weight:600 !important; letter-spacing: 0.2px; display:inline-block; white-space:nowrap !important;">${ev.sku}</strong>
                                ${ev.time ? `<span style="font-family:'Inter', sans-serif !important; font-size:0.7rem !important; font-weight:600 !important; color:#d97706 !important; background:#fef3c7 !important; border: 1px solid #fde68a !important; padding:2px 6px !important; border-radius:4px !important; display:inline-flex; align-items:center; gap:2px; line-height: 1 !important; white-space:nowrap !important;">⏰ ${ev.time}</span>` : ''}
                            </div>
                        </div>
                        <div style="font-family:'Inter', sans-serif !important; font-size:0.92rem !important; font-weight:${titleWeight} !important; color:${titleColor} !important; text-decoration:${titleDecoration} !important; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; line-height:1.35 !important; margin: 2px 0;">
                            ${parsed.name}
                        </div>
                        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:2px 6px; font-size:0.75rem !important; color:#64748b !important; border-top:1px solid #f1f5f9 !important; padding-top:6px; margin-top:2px; width: 100%;">
                            <span style="font-weight:400 !important; display:inline-flex; align-items:center; gap:3px; min-width: 0; flex-grow: 1; flex-shrink: 1;">
                                <span style="font-size:0.85rem !important; line-height: 1 !important; flex-shrink: 0; white-space:nowrap !important;">👤</span>
                                <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap !important; max-width: 100%; display:inline-block; line-height:1.2;">${clientName}</span>
                            </span>
                            <span style="font-weight:600 !important; color:#475569 !important; white-space:nowrap !important; flex-shrink: 0; margin-left: auto;">#${ev.pedidoId || 'Stock'}</span>
                        </div>
                        ${deliveryDate ? `
                        <div style="display:flex; align-items:center; gap:4px; font-size:0.75rem !important; margin-top:3px; color:${ev.date >= deliveryDate.split('T')[0] ? '#dc2626' : '#16a34a'} !important; font-weight:600 !important; background:${ev.date >= deliveryDate.split('T')[0] ? '#fef2f2' : '#f0fdf4'} !important; border: 1px solid ${ev.date >= deliveryDate.split('T')[0] ? '#fecaca' : '#bbf7d0'} !important; padding:2px 6px !important; border-radius:4px !important; width: fit-content; font-family:'Inter', sans-serif !important;">
                            <span>🤝 Pactado: ${formatDate(deliveryDate)}</span>
                            ${diasDespacho !== null ? `<span style="opacity:0.85;">(${diasDespacho} días)</span>` : ''}
                        </div>
                        ` : ''}
                        ${ev.text ? `<div style="font-family:'Inter', sans-serif !important; font-size:0.75rem !important; color:#dc2626 !important; background:#fef2f2 !important; border-left: 3px solid #ef4444 !important; padding:4px 8px !important; border-radius:0 4px 4px 0 !important; font-style:normal !important; margin-top:2px;">⚠️ ${ev.text}</div>` : ''}
                    </div>
                `;
            } else {
                evHtml += `
                    <div class="cal-event" id="${ev.id}" draggable="true" ondragstart="drag(event)" 
                         onclick="openEventActions(event, '${ev.id}')"
                         title="${tooltip}"
                         style="border-left: 3px solid ${color}; ${doneStyle}">
                        <div class="event-dot" style="background:${color}"></div>
                        ${doneIcon}
                        <span class="qty-badge">${ev.qty || 1}</span>
                        <strong class="sku-tag">${ev.sku}</strong>
                        ${ev.time ? `<span style="font-size:0.72em; opacity:0.8; margin-left:3px; font-weight:normal;">⏰${ev.time}</span>` : ''}
                    </div>
                 `;
            }
        });

        if (hiddenCount > 0) {
            evHtml += `
                <div class="cal-more-badge" onclick="openDayDetailModal('${dateStr}'); event.stopPropagation();" 
                     style="background: #f1f3f4; border: 1px dashed #ccc; border-radius: 4px; padding: 2px 4px; font-size: 0.72rem; text-align: center; color: #555; font-weight: bold; cursor: pointer; margin-top: 3px;">
                     ➕ ${hiddenCount} más
                </div>
            `;
        }

        evHtml += '</div>';
        html += evHtml;
        html += `</div>`;
    }

    html += `</div>`;
    container.innerHTML = html;

    // Fixed integration:
    if (typeof updateSidebarActions === 'function') updateSidebarActions();

    // Pulse highlight search results
    if (searchTerm && searchTerm.length >= 3) {
        setTimeout(() => {
            const matches = container.querySelectorAll('.weekly-card');
            matches.forEach(card => {
                card.classList.add('highlight-pulse');
                setTimeout(() => card.classList.remove('highlight-pulse'), 2500);
            });
        }, 50);
    }
}


// --- NEW: PARTIAL PRODUCTION LOGIC ---
async function fabricarFromCalendar(id) {
    const ev = calendarEvents.find(e => e.id == id);
    if (!ev) return;

    if (ev.status === 'done' || ev.status === 'approved') {
        if (!await appConfirm("Este item ya figura como TERMINADO.\n¿Deseas fabricarlo nuevamente?")) return;
    }

    // Create temp input for fabricar() to read
    const tmpId = 'tmp-qty-' + ev.id;
    const tmpInput = document.createElement('input');
    tmpInput.id = tmpId;
    tmpInput.value = ev.qty;
    tmpInput.type = 'hidden';
    document.body.appendChild(tmpInput);

    try {
        let source = ev.pedidoId && ev.pedidoId !== 'STOCK' ? ev.pedidoId : 'CALENDARIO';
        const resultQty = await fabricar(ev.sku, ev.name, tmpId, source, ev.id);

        if (resultQty !== false && resultQty !== null) {
            const produced = Number(resultQty);
            const originalQty = Number(ev.qty);

            if (produced < originalQty && ev.status !== 'done') {
                // PARTIAL: Split event
                // The original logic created a new 'done' event and modified the existing one.
                // The new logic just modifies the existing event's quantity and logs it as partial.
                // The user's instruction implies removing the `doneEvent` creation.
                ev.qty = originalQty - produced;
                saveCalendar();
                cloudSaveEvent(ev);
                const cleanPedidoId = (ev.pedidoId && ev.pedidoId !== 'STOCK' && ev.pedidoId !== 'CALENDARIO') ? ev.pedidoId : null;
                logActivity('Terminado Parcial', `${ev.sku} (${produced} u.) terminado. Quedan ${ev.qty} u. pendientes.`, 'success', cleanPedidoId, ev.id);
            } else {
                // FULL or EXTRA
                if (produced > originalQty) ev.qty = produced;
                ev.status = 'done';

                // VALIDACIÓN 2: Mover automáticamente la tarjeta a la fecha de finalización real (hoy local)
                const localToday = new Date();
                const todayStr = `${localToday.getFullYear()}-${String(localToday.getMonth() + 1).padStart(2, '0')}-${String(localToday.getDate()).padStart(2, '0')}`;
                if (ev.date !== todayStr) {
                    ev.rescheduleHistory = ev.rescheduleHistory || [];
                    ev.rescheduleHistory.push({
                        date: new Date().toLocaleDateString(),
                        fromDate: ev.date,
                        toDate: todayStr,
                        reason: "Finalizado en fábrica (Fecha real)",
                        comment: `Terminado hoy`
                    });
                    ev.date = todayStr;
                }

                saveCalendar();
                cloudSaveEvent(ev);
            }

            renderCalendar();
        }
    } finally {
        if (document.body.contains(tmpInput)) document.body.removeChild(tmpInput);
    }
}

// --- DRAG & SCROLL NAVIGATION (ULTIMATE ROCK SOLID V9 - GLOBAL BLINDAGE) ---
let estaArrastrando = false;
let dragSourceMonth = null;
let draggedItemId = null;
let draggedPendingOrder = null;
let ultimoCambioMes = 0;
let isBlinkingMode = false;

function dragPendingOrder(ev, sku, name, qty, pedidoId, grupo, text) {
    estaArrastrando = true;
    draggedPendingOrder = { sku, name, qty, pedidoId, grupo, text };
    draggedItemId = "PENDING_ORDER";
    
    // Create a simple custom drag preview
    const preview = document.createElement('div');
    preview.className = 'cal-event drag-preview';
    preview.id = 'drag-preview-id';
    preview.style.background = '#e8f0fe';
    preview.style.borderLeft = '3px solid #1a73e8';
    preview.innerHTML = `<strong class="sku-tag">${sku}</strong> <span class="qty-badge">${qty} u.</span>`;
    
    // Remove any leftover preview
    document.querySelectorAll('.drag-preview').forEach(el => el.remove());
    dragPreviewEl = preview;
    
    ev.dataTransfer.setData("text", "PENDING_ORDER");
    ev.dataTransfer.effectAllowed = 'copyMove';
}

let dragPreviewEl = null;
let lastDateHovered = null;

// Pre-load a transparent pixel for setDragImage
const transparentImg = new Image();
transparentImg.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

function allowDrop(ev) {
    ev.preventDefault();
    if (!estaArrastrando) return;

    const targetDay = ev.target.closest('.cal-day');
    if (targetDay && targetDay.dataset.date) {
        const date = targetDay.dataset.date;
        if (date !== lastDateHovered) {
            lastDateHovered = date;
            snapPreviewTo(targetDay);
        }
    }
}

function snapPreviewTo(dayEl) {
    if (!dragPreviewEl) return;
    const container = dayEl.querySelector('.cal-events');
    if (container) {
        container.appendChild(dragPreviewEl);
    }
}

function drag(ev) {
    const target = ev.target.closest('.cal-event');
    if (!target) return;

    // VALIDACIÓN 1: No permitir mover tarjetas finalizadas o aprobadas
    const evObj = calendarEvents.find(e => String(e.id) === String(target.id));
    if (evObj && (evObj.status === 'done' || evObj.status === 'approved')) {
        ev.preventDefault();
        appAlert("⚠️ No se puede mover un lote que ya ha sido terminado o controlado.");
        return;
    }

    estaArrastrando = true;
    draggedItemId = target.id;
    dragSourceMonth = new Date(currentMonth.getTime());

    target.classList.add('is-dragging-original');

    // Remove any leftover previews before creating new one
    document.querySelectorAll('.drag-preview').forEach(el => el.remove());

    dragPreviewEl = target.cloneNode(true);
    dragPreviewEl.classList.remove('is-dragging-original');
    dragPreviewEl.classList.add('drag-preview');
    dragPreviewEl.id = 'drag-preview-id';

    ev.dataTransfer.setData("text", target.id);
    ev.dataTransfer.effectAllowed = 'move';

    if (ev.dataTransfer.setDragImage) {
        ev.dataTransfer.setDragImage(transparentImg, 0, 0);
    }

    document.body.classList.add('dragging-active');
    clearBlinkingMode();
}

// GLOBAL EVENT HANDLERS (BLINDAGE)
document.addEventListener('dragstart', function(e) {
    const card = e.target.closest('.sidebar-pending-card');
    if (card) {
        const idx = parseInt(card.dataset.index);
        const item = currentPendingOrders[idx];
        if (item) {
            dragPendingOrder(e, item.sku, item.name, item.qty, item.pedidoId, item.grupo, item.text);
        }
    }
});

document.addEventListener('dragover', allowDrop);
document.addEventListener('drop', drop);
document.addEventListener('dragend', (e) => {
    // Fail-safe for escaped drops
    if (estaArrastrando) {
        cleanupDragEffects();
        boomerangReturn("Reprogramación Cancelada o Fallida");
    }
});

function cleanupDragEffects() {
    // 1. Remove ANY preview element in the DOM
    document.querySelectorAll('.drag-preview').forEach(el => el.remove());
    if (dragPreviewEl && dragPreviewEl.parentNode) dragPreviewEl.parentNode.removeChild(dragPreviewEl);

    // 2. Clear original ghosting
    const original = document.getElementById(draggedItemId);
    if (original) original.classList.remove('is-dragging-original');

    dragPreviewEl = null;
    lastDateHovered = null;
    document.body.classList.remove('dragging-active');
}

async function drop(ev) {
    if (!estaArrastrando) return;
    ev.preventDefault();

    const data = ev.dataTransfer.getData("text") || draggedItemId;
    const target = ev.target.closest('.cal-day');
    const date = (target && target.dataset.date) ? target.dataset.date : lastDateHovered;

    if (date) {
        const todayStr = new Date().toISOString().split('T')[0];

        if (date < todayStr) {
            estaArrastrando = false; // Turn off fail-safe before alert
            cleanupDragEffects();
            boomerangReturn("Fecha Pasada: No se puede reprogramar al pasado.");
            return;
        }

        // --- SUCCESSFUL MOVE ---
        estaArrastrando = false;
        cleanupDragEffects();

        if (data === "PENDING_ORDER" && draggedPendingOrder) {
            // Check delivery date warning
            const warning = checkDeliveryDateWarning(draggedPendingOrder.pedidoId, date);
            if (warning) {
                const proceed = await confirmCommercialAlert(draggedPendingOrder.pedidoId, date, warning.deliveryDate);
                if (!proceed) {
                    renderCalendar();
                    return;
                }
            }

            // Create new calendar event
            const newEvent = {
                id: Date.now(),
                sku: draggedPendingOrder.sku,
                name: draggedPendingOrder.name,
                qty: draggedPendingOrder.qty,
                date: date,
                time: "",
                pedidoId: draggedPendingOrder.pedidoId,
                grupo: draggedPendingOrder.grupo,
                text: draggedPendingOrder.text
            };
            calendarEvents.push(newEvent);
            saveCalendar();
            cloudSaveEvent(newEvent);

            const cleanPedidoId = (newEvent.pedidoId && newEvent.pedidoId !== 'STOCK' && newEvent.pedidoId !== 'CALENDARIO') ? newEvent.pedidoId : null;
            logActivity('Agendado', `${draggedPendingOrder.sku} (${draggedPendingOrder.qty} u.) agendado para el ${formatDate(date)} vía Drag & Drop`, 'info', cleanPedidoId, newEvent.id);

            if (warning) {
                logActivity('Alerta Comercial', `El lote de ${newEvent.sku} (${newEvent.qty} u.) se agendó para el ${formatDate(date)}, superando o igualando la fecha pactada (${formatDate(warning.deliveryDate)}).`, 'warning', cleanPedidoId, newEvent.id);
            }

            draggedPendingOrder = null;
            renderCalendar();
        } else {
            const evIndex = calendarEvents.findIndex(e => e.id == data);
            if (evIndex >= 0) {
                const item = calendarEvents[evIndex];
                if (item.date !== date) {
                    // Check delivery date warning
                    const warning = checkDeliveryDateWarning(item.pedidoId, date);
                    if (warning) {
                        const proceed = await confirmCommercialAlert(item.pedidoId, date, warning.deliveryDate);
                        if (!proceed) {
                            renderCalendar();
                            return;
                        }
                    }

                    // Date changed! Ask for reason
                    const reasonData = await askRescheduleReason(item.date, date);
                    if (reasonData) {
                        const oldDate = item.date;
                        item.date = date;

                        // Add to history list on the event
                        item.rescheduleHistory = item.rescheduleHistory || [];
                        item.rescheduleHistory.push({
                            date: new Date().toLocaleDateString(),
                            fromDate: oldDate,
                            toDate: date,
                            reason: reasonData.reason,
                            comment: reasonData.comment
                        });

                        saveCalendar();
                        cloudSaveEvent(item);

                        let commentStr = reasonData.comment ? ` - Obs: "${reasonData.comment}"` : "";
                        const cleanPedidoId = (item.pedidoId && item.pedidoId !== 'STOCK' && item.pedidoId !== 'CALENDARIO') ? item.pedidoId : null;
                        logActivity('Reprogramación', `${item.sku} movido de ${formatDate(oldDate)} a ${formatDate(date)}. Motivo: ${reasonData.reason}${commentStr}`, 'info', cleanPedidoId, item.id);

                        if (warning) {
                            logActivity('Alerta Comercial', `El lote de ${item.sku} (${item.qty} u.) se reprogramó para el ${formatDate(date)}, superando o igualando la fecha pactada (${formatDate(warning.deliveryDate)}). Motivo: ${reasonData.reason}${commentStr}`, 'warning', cleanPedidoId, item.id);
                        }
                    } else {
                        // User cancelled or closed the prompt
                        renderCalendar(); // Refresh to revert card position
                        return;
                    }
                }
                renderCalendar();
            }
        }
    } else {
        // DROPPED OUTSIDE (Missed grid)
        estaArrastrando = false;
        cleanupDragEffects();
        boomerangReturn("Acción fuera de rango");
    }
}

async function boomerangReturn(message = null) {
    if (!estaArrastrando && !message) return;

    const previousId = draggedItemId || "";
    const sourceMonth = dragSourceMonth ? new Date(dragSourceMonth.getTime()) : null;

    estaArrastrando = false;
    document.body.classList.remove('dragging-active');

    // 1. HARD TELEPORT (Force View to Source) - BEFORE ALERT
    if (sourceMonth) {
        currentMonth = sourceMonth;
        renderCalendar();
    }

    // 2. ALERT (UI Sync)
    if (message) {
        await appAlert(`⚠️ <b>${message}</b><br>El lote ha vuelto a su posición original.`);

        // Re-sync after alert blocking
        if (sourceMonth) {
            currentMonth = sourceMonth;
            renderCalendar();
        }
    }

    // 3. INFINITE PULSE START
    setTimeout(() => {
        const el = document.getElementById(previousId);
        if (el) {
            el.classList.add('event-boomerang-blink');
            isBlinkingMode = true;
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 150);
}

// Global Click listener for infinite pulse cleanup
document.addEventListener('mousedown', () => {
    if (isBlinkingMode) clearBlinkingMode();
}, true);

function clearBlinkingMode() {
    isBlinkingMode = false;
    document.querySelectorAll('.event-boomerang-blink').forEach(el => {
        el.classList.remove('event-boomerang-blink');
    });
}

// HARDENED WHEEL FORCER (Strict 1-to-1 Navigation)
window.addEventListener('wheel', function (e) {
    if (currentTab !== 'planificador') return;

    // Strict 500ms Brake to prevent skipping
    const ahora = Date.now();
    if (ahora - ultimoCambioMes < 500) {
        if (estaArrastrando) e.preventDefault(); // Don't allow secondary scrolls during drag
        return;
    }

    const calGrid = document.getElementById('calendarContent');
    const isHoveringCalendar = calGrid && calGrid.contains(e.target);

    // PRIORITY 1: While Dragging
    if (estaArrastrando) {
        e.preventDefault();
        e.stopImmediatePropagation(); // Kill any competing listeners

        if (e.deltaY > 0) changeMonth(1);
        else if (e.deltaY < 0) changeMonth(-1);

        ultimoCambioMes = ahora;
        return;
    }

    // PRIORITY 2: Normal Navigation (Hover)
    if (isHoveringCalendar) {
        e.preventDefault();
        if (e.deltaY > 0) changeMonth(1);
        else if (e.deltaY < 0) changeMonth(-1);
        ultimoCambioMes = ahora;
    }
}, { passive: false, capture: true });




// HEADER CONTROLS (Updated Logic)
function toggleSearchFocus() {
    const box = document.getElementById('header-search-box');
    const input = document.getElementById('planner-search');

    if (box.classList.contains('active')) {
        if (input.value.trim() === '') {
            box.classList.remove('active');
            hideSearchPalette();
        }
    } else {
        box.classList.add('active');
        input.focus();
    }
}

function toggleSearchClear() {
    const input = document.getElementById('planner-search');
    const btn = document.getElementById('search-clear-btn');
    btn.style.display = (input.value.trim() !== '') ? 'block' : 'none';
}

function clearSearch() {
    const input = document.getElementById('planner-search');
    const box = document.getElementById('header-search-box');
    input.value = '';
    toggleSearchClear();
    hideSearchPalette();
    renderCalendar();
    box.classList.remove('active');
}

// --- GLOBAL SEARCH NAVIGATOR (GPS) ---
let globalSearchResults = [];
let globalSearchIndex = -1;

function handleSearchInput(e) {
    const input = e.target;
    const term = input.value.toLowerCase().trim();

    toggleSearchClear();
    renderCalendar(); // Current view filter

    if (term.length < 2) {
        hideSearchPalette();
        return;
    }

    // Keyboard Navigation
    if (e.key === 'Enter') {
        navigateSearchResults(1);
        return;
    }
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        navigateSearchResults(1);
        return;
    }
    if (e.key === 'ArrowUp') {
        e.preventDefault();
        navigateSearchResults(-1);
        return;
    }
    if (e.key === 'Escape') {
        hideSearchPalette();
        return;
    }

    searchGlobalEvents(term);
}

function searchGlobalEvents(term) {
    const hideFinished = document.getElementById('hide-finished')?.checked;

    globalSearchResults = calendarEvents.filter(ev => {
        // Apply Visibility Filters (Critical per user request)
        if (hideFinished && (ev.status === 'done' || ev.status === 'approved')) return false;

        let gName = (ev.grupo || "").toUpperCase();
        if (calendarGroupFilters[gName] === false) return false;

        // ENRICHED SEARCH (GPS Upgrade)
        let enrichedClient = ev.cliente || "";
        let enrichedArt = ev.name || ev.text || "";

        // Try to find more info if available (Same as renderCalendar)
        if (ev.pedidoId && ev.pedidoId !== 'STOCK' && typeof dataPedidos !== 'undefined') {
            const p = dataPedidos.find(x => String(x.NUMERO) === String(ev.pedidoId));
            if (p) {
                enrichedClient = p.CLIENTE || enrichedClient;
                enrichedArt = p.PRODUCTO || enrichedArt;
            }
        }
        if (typeof dataArticulos !== 'undefined') {
            const a = dataArticulos.find(x => String(x.MATE_CODIGO).trim() === String(ev.sku).trim());
            if (a && a.MATE_DESCRIPCION) {
                enrichedArt = a.MATE_DESCRIPCION;
            }
        }

        // Store enriched data for palette rendering
        ev._enrichedClient = enrichedClient;
        ev._enrichedArt = enrichedArt;

        const searchTxt = `${ev.sku} ${enrichedArt} ${ev.pedidoId || ""} ${ev.grupo || ""} ${enrichedClient}`.toLowerCase();
        return searchTxt.includes(term);
    });

    globalSearchResults.sort((a, b) => a.date.localeCompare(b.date));
    globalSearchIndex = -1;
    renderSearchPalette();
}

function renderSearchPalette() {
    const palette = document.getElementById('search-results-palette');
    if (!palette) return;

    if (globalSearchResults.length === 0) {
        palette.style.display = 'none';
        return;
    }

    let html = '';
    globalSearchResults.forEach((res, idx) => {
        const parts = res.date.split('-');
        // Safety check to ensure we have year, month, day
        const dateFmt = parts.length === 3
            ? `${parts[2]}/${parts[1]}/${parts[0].substring(2)}`
            : res.date;
        const isSel = idx === globalSearchIndex ? 'selected' : '';

        // Use enriched data if available
        const dispClient = res._enrichedClient || res.cliente || '';
        const dispArt = res._enrichedArt || res.name || res.text || '';

        const orderTag = res.pedidoId && res.pedidoId !== 'STOCK'
            ? `<span class="result-tag">#${res.pedidoId}</span>`
            : `<span class="result-tag stock">STOCK</span>`;

        html += `
            <div class="search-result-item ${isSel}" onclick="jumpToEvent('${res.id}', '${res.date}')">
                <div class="search-result-header">
                    <span class="result-sku">${res.sku}</span>
                    ${orderTag}
                    <span class="result-date">${dateFmt}</span>
                </div>
                <div class="result-info">${dispArt} ${dispClient ? ' • ' + dispClient : ''}</div>
            </div>`;
    });

    html += `
        <div class="search-palette-footer">
            ${globalSearchResults.length} resultados • <kbd>Enter</kbd> para navegar
        </div>`;

    palette.innerHTML = html;
    palette.style.display = 'block';
}

function navigateSearchResults(delta) {
    if (globalSearchResults.length === 0) return;

    globalSearchIndex += delta;
    if (globalSearchIndex >= globalSearchResults.length) globalSearchIndex = 0;
    if (globalSearchIndex < 0) globalSearchIndex = globalSearchResults.length - 1;

    const res = globalSearchResults[globalSearchIndex];
    jumpToEvent(res.id, res.date, true);
    renderSearchPalette();

    const selected = document.querySelector('.search-result-item.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
}

async function jumpToEvent(id, dateStr, highlight = true) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const targetDate = new Date(y, m - 1, d);

    let needsRender = false;
    if (currentCalendarView === 'semanal') {
        const dayOfWeek = currentMonth.getDay();
        const daysToSubtract = (dayOfWeek === 0) ? 6 : dayOfWeek - 1;
        const currentWeekStart = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), currentMonth.getDate() - daysToSubtract);
        currentWeekStart.setHours(0, 0, 0, 0);
        const currentWeekEnd = new Date(currentWeekStart.getTime());
        currentWeekEnd.setDate(currentWeekEnd.getDate() + 6);
        currentWeekEnd.setHours(23, 59, 59, 999);

        if (targetDate < currentWeekStart || targetDate > currentWeekEnd) {
            currentMonth = targetDate;
            needsRender = true;
        }
    } else {
        if (currentMonth.getMonth() !== targetDate.getMonth() || currentMonth.getFullYear() !== targetDate.getFullYear()) {
            currentMonth = new Date(y, m - 1, 1);
            needsRender = true;
        }
    }

    if (needsRender) {
        renderCalendar();
    }

    if (highlight) {
        setTimeout(() => {
            const el = document.getElementById(id);
            if (el) {
                el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                el.classList.add('highlight-pulse');
                setTimeout(() => el.classList.remove('highlight-pulse'), 3000);
            }
        }, 150);
    }
}

function hideSearchPalette() {
    const p = document.getElementById('search-results-palette');
    if (p) p.style.display = 'none';
    globalSearchResults = [];
    globalSearchIndex = -1;
}

// Global click to close palette
document.addEventListener('mousedown', (e) => {
    if (!e.target.closest('#header-search-box')) {
        hideSearchPalette();
    }
}, true);

// (Simplified DOMContentLoaded - Listeners managed globally)
// --- DUPLICATE LISTENER REMOVED ---



async function confirmScheduleModal(sku, nombre, qty, today, extraText = "") {
    const todayStr = new Date().toISOString().split('T')[0];
    return new Promise(resolve => {
        let extraHtml = "";
        if (extraText) {
            extraHtml = `<div style="color:#e67e22; font-size:0.85rem; margin-bottom:10px; font-weight:bold; background:#fff3e0; padding:4px 8px; border-radius:4px; display:inline-block;">⚠️ ${extraText}</div>`;
        }

        const content = `
                <div style="margin-bottom:10px;">
                    <div style="font-weight:bold; color:var(--primary-color); font-size:1.1em;">${nombre}</div>
                    <div style="color:#666; font-size:0.9em; margin-bottom:5px;">SKU: ${sku}</div>
                    ${extraHtml}
                </div>
                <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:10px;">
                    <div>
                        <label style="font-weight:500; font-size:0.85rem;">Fecha:</label>
                        <input type="date" id="modal-sched-date" class="modal-input" value="${today}" min="${todayStr}">
                    </div>
                    <div>
                        <label style="font-weight:500; font-size:0.85rem;">Hora (Opc):</label>
                        <input type="time" id="modal-sched-time" class="modal-input" value="">
                    </div>
                    <div>
                        <label style="font-weight:500; font-size:0.85rem;">Cant:</label>
                        <input type="number" id="modal-sched-qty" class="modal-input" value="${qty}" min="1">
                    </div>
                </div>
                `;

        showModal({
            title: '📅 Agendar Producción',
            content: content,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(null) },
                {
                    text: 'Agendar', class: 'btn-produce', style: 'background-color:#8e44ad', onClick: () => {
                        const dateVal = document.getElementById('modal-sched-date').value;
                        const timeVal = document.getElementById('modal-sched-time').value;
                        const qtyVal = document.getElementById('modal-sched-qty').value;
                        if (!dateVal || !qtyVal) return;

                        // Validation
                        if (new Date(dateVal) < new Date(todayStr)) {
                            alert("⚠️ No puedes programar para el pasado.");
                            return;
                        }

                        resolve({ date: dateVal, time: timeVal || "", qty: Number(qtyVal) });
                    }, close: true
                }
            ]
        });
    });
}

async function scheduleItem(sku, nombre, inputId, pedidoId = null, grupo = "", textoAdicional = "") {
    const qtyInput = document.getElementById(inputId);
    let qty = 1;
    if (qtyInput) qty = Number(qtyInput.value) || 1;

    const today = new Date().toISOString().split('T')[0];

    // NEW: Block Double Scheduling (Enriched with SKU and Text for duality fix)
    if (pedidoId && pedidoId !== 'STOCK') {
        const existing = calendarEvents.find(e =>
            String(e.pedidoId) === String(pedidoId) &&
            String(e.sku).trim().toLowerCase() === String(sku).trim().toLowerCase() &&
            String(e.text || "").trim().toLowerCase() === String(textoAdicional || "").trim().toLowerCase()
        );
        if (existing) {
            appAlert(`⚠️ Este ítem (especificación: "${textoAdicional || 'N/A'}") ya está agendado en el pedido <b>#${pedidoId}</b> para el ${formatDate(existing.date)}.`);
            return;
        }
    }

    // New Custom Modal
    const result = await confirmScheduleModal(sku, nombre, qty, today, textoAdicional);

    if (!result) return; // Cancelled

    // Check delivery date warning
    const warning = checkDeliveryDateWarning(pedidoId, result.date);
    if (warning) {
        const proceed = await confirmCommercialAlert(pedidoId, result.date, warning.deliveryDate);
        if (!proceed) {
            return;
        }
    }

    // Add Event
    const newEvent = {
        id: Date.now(),
        sku: sku,
        name: nombre,
        qty: result.qty,
        date: result.date,
        time: result.time || "",
        pedidoId: pedidoId,
        grupo: grupo,
        text: textoAdicional // Save the spec text
    };
    calendarEvents.push(newEvent);
    saveCalendar();
    cloudSaveEvent(newEvent);

    const cleanPedidoId = (pedidoId && pedidoId !== 'STOCK' && pedidoId !== 'CALENDARIO') ? pedidoId : null;
    logActivity('Agendado', `${sku} (${result.qty} u.) agendado para el ${formatDate(result.date)}`, 'info', cleanPedidoId, newEvent.id);

    if (warning) {
        logActivity('Alerta Comercial', `El lote de ${sku} (${result.qty} u.) se agendó para el ${formatDate(result.date)}, superando o igualando la fecha pactada (${formatDate(warning.deliveryDate)}).`, 'warning', cleanPedidoId, newEvent.id);
    }

    // Notify and Switch Tab
    // Friendly Date Format & Custom Alert Title
    const [y, m, d] = result.date.split('-');
    const friendlyDate = `${d}-${m}-${y}`;

    await new Promise(resolve => {
        showModal({
            title: "✅ Producción Agendada",
            content: `<div style='text-align:center; font-size:1.1em;'>El item <strong>${nombre}</strong> se agendó para el <strong>${friendlyDate}</strong>.<br><br><span style="font-size:1.2em; color:#27ae60;">Cantidad: <strong>${result.qty} u.</strong></span></div>`,
            actions: [{ text: "Aceptar", class: "btn-primary", style: "background:#27ae60; color:white;", onClick: resolve, close: true }]
        });
    });

    // Go there!
    goToCalendarDate(result.date, newEvent.id);
}

// Wrapper functions to schedule and manufacture items using global array index to avoid HTML quotes breaking
async function scheduleItemDirect(orderIdx) {
    const item = currentGroupedPedidos[orderIdx];
    if (!item) return;
    const pedidoId = item["NUMERO"] || "";
    const skuCarro = item["SKU"] || "";
    const name = item["PRODUCTO"] || "";
    const inputId = `qty-prod-${pedidoId}-${skuCarro}`;
    let grupoName = item["GRUPO_ART"] || "";
    if (!grupoName) {
        const art = dataArticulos.find(a => strip(a["MATE_CODIGO"] || "") === strip(skuCarro));
        if (art) grupoName = art["GRMA_DESCRIPCION"] || "";
    }
    await scheduleItem(skuCarro, name, inputId, pedidoId, grupoName, item["TEXTO_ADICIONAL"] || "");
}

async function fabricarDirect(orderIdx) {
    const item = currentGroupedPedidos[orderIdx];
    if (!item) return;
    const pedidoId = item["NUMERO"] || "";
    const skuCarro = item["SKU"] || "";
    const name = item["PRODUCTO"] || "";
    const inputId = `qty-prod-${pedidoId}-${skuCarro}`;
    await fabricar(skuCarro, name, inputId, pedidoId);
}

async function scheduleBOMItem(orderIdx, compIdx) {
    const item = currentGroupedPedidos[orderIdx];
    if (!item) return;
    const components = getBOMComponents(item.SKU);
    const comp = components[compIdx];
    if (!comp) return;
    
    const pedidoId = item["NUMERO"] || "";
    const inputId = `qty-${pedidoId}-${comp.sku}`;
    let grupoName = item["GRUPO_ART"] || "";
    if (!grupoName) {
        const art = dataArticulos.find(a => strip(a["MATE_CODIGO"] || "") === strip(item.SKU));
        if (art) grupoName = art["GRMA_DESCRIPCION"] || "";
    }
    await scheduleItem(comp.sku, comp.nombre, inputId, pedidoId, grupoName, item["TEXTO_ADICIONAL"] || "");
}

async function fabricarBOMItem(orderIdx, compIdx) {
    const item = currentGroupedPedidos[orderIdx];
    if (!item) return;
    const components = getBOMComponents(item.SKU);
    const comp = components[compIdx];
    if (!comp) return;
    
    const pedidoId = item["NUMERO"] || "";
    const inputId = `qty-${pedidoId}-${comp.sku}`;
    await fabricar(comp.sku, comp.nombre, inputId, pedidoId);
}

function goToTableForEvent(eventId) {
    const ev = calendarEvents.find(e => String(e.id) === String(eventId));
    if (ev && ev.pedidoId) goToTable('pedido', ev.pedidoId);
}

function goToStockForEvent(eventId) {
    const ev = calendarEvents.find(e => String(e.id) === String(eventId));
    if (ev) switchTabToStock(ev.grupo, ev.sku);
}

function approveQualityControl(eventId) {
    const ev = calendarEvents.find(e => String(e.id) === String(eventId));
    if (!ev) return;
    ev.status = 'approved';
    saveCalendar();
    cloudSaveEvent(ev);
    const cleanPedidoId = (ev.pedidoId && ev.pedidoId !== 'STOCK' && ev.pedidoId !== 'CALENDARIO') ? ev.pedidoId : null;
    logActivity('Aprobado Calidad', `${ev.sku} (${ev.qty} u.) aprobado por Control de Calidad.`, 'success', cleanPedidoId, ev.id);
    renderCalendar();
    if (typeof applyFilters === 'function') applyFilters();
}

function rejectQualityControl(eventId) {
    const ev = calendarEvents.find(e => String(e.id) === String(eventId));
    if (!ev) return;
    ev.status = 'rejected';
    saveCalendar();
    cloudSaveEvent(ev);
    const cleanPedidoId = (ev.pedidoId && ev.pedidoId !== 'STOCK' && ev.pedidoId !== 'CALENDARIO') ? ev.pedidoId : null;
    logActivity('Rechazado Calidad', `${ev.sku} (${ev.qty} u.) rechazado por Control de Calidad.`, 'danger', cleanPedidoId, ev.id);
    renderCalendar();
    if (typeof applyFilters === 'function') applyFilters();
}

function revertQualityControl(eventId) {
    const ev = calendarEvents.find(e => String(e.id) === String(eventId));
    if (!ev) return;
    ev.status = 'done';
    saveCalendar();
    cloudSaveEvent(ev);
    const cleanPedidoId = (ev.pedidoId && ev.pedidoId !== 'STOCK' && ev.pedidoId !== 'CALENDARIO') ? ev.pedidoId : null;
    logActivity('Reversión Calidad', `${ev.sku} (${ev.qty} u.) revertido a Pendiente de Calidad.`, 'warning', cleanPedidoId, ev.id);
    renderCalendar();
    if (typeof applyFilters === 'function') applyFilters();
}

// --- Event Action Menu Upgrade ---
function openEventActions(e, eventId) {
    e.stopPropagation(); // Prevent propagation
    const menu = document.getElementById('context-menu');
    const ev = calendarEvents.find(ev => ev.id == eventId);

    if (!ev) return;

    menu.innerHTML = `
                <div class="ctx-item" onclick="fabricarFromCalendar(${eventId})">🔨 Fabricar (Alta Prod)</div>
                <div class="ctx-item" onclick="reprogramEvent('${eventId}'); closeDayMenu();">🗓️ Reprogramar</div>
                <div class="ctx-item" onclick="asociarPedidoALote(${eventId}); closeDayMenu();">🔗 Asociar Pedido</div>
                ${ev.pedidoId && ev.pedidoId !== 'STOCK' ? `<div class="ctx-item" onclick="goToTableForEvent(${eventId}); closeDayMenu();">🔍 Ir a Tabla Pedidos</div>` : ''}
                <div class="ctx-item" onclick="goToStockForEvent(${eventId}); closeDayMenu();">🔍 Ir a Tabla de Grupo</div>
                ${ev.status === 'done' ? `
                    <div class="ctx-item" style="color:#10b981; font-weight:600;" onclick="approveQualityControl(${eventId}); closeDayMenu();">✅ Aprobar Calidad</div>
                    <div class="ctx-item" style="color:#ef4444; font-weight:600;" onclick="rejectQualityControl(${eventId}); closeDayMenu();">❌ Rechazar Calidad</div>
                ` : ''}
                ${(ev.status === 'approved' || ev.status === 'rejected') ? `<div class="ctx-item" style="color:#d97706; font-weight:600;" onclick="revertQualityControl(${eventId}); closeDayMenu();">⏳ Revertir a Pendiente</div>` : ''}
                <div class="ctx-item ctx-danger" onclick="deleteEvent(${eventId})">🗑️ Eliminar</div>
            `;

    menu.style.display = 'block';

    // Viewport Collision Detection
    const menuWidth = menu.offsetWidth || 180;
    const menuHeight = menu.offsetHeight || 160;
    const margin = 10;

    let x = e.pageX;
    let y = e.pageY;

    // Check right edge
    if (e.clientX + menuWidth > window.innerWidth - margin) {
        x = e.pageX - menuWidth;
    }

    // Check bottom edge
    if (e.clientY + menuHeight > window.innerHeight - margin) {
        y = e.pageY - menuHeight;
    }

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
}

document.addEventListener('click', () => {
    const m = document.getElementById('context-menu');
    if (m) m.style.display = 'none';
});

async function deleteEvent(id) {
    // CUSTOM DELETE MODAL
    return new Promise(resolve => {
        showModal({
            title: '🗑️ Confirmar Eliminación',
            content: `
                        <div style="text-align:center; padding:10px;">
                            <div style="font-size:3em; margin-bottom:10px;">🗑️</div>
                            <div style="font-size:1.1em; color:#e74c3c; font-weight:bold;">¿Desea eliminar del calendario este evento?</div>
                            <div style="color:#666; margin-top:5px; font-size:0.9em;">Esta acción no se puede deshacer.</div>
                        </div>
                    `,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(false) },
                {
                    text: 'Eliminar', class: 'btn-produce', style: 'background:#e74c3c;', onClick: async () => {
                        const ev = calendarEvents.find(e => e.id == id);
                        if (!ev) {
                            resolve(false);
                            return;
                        }

                        // Log activity BEFORE deleting so logActivity finds the event in calendarEvents
                        logActivity('Eliminación', `${ev.sku} (${ev.qty} u.) eliminado del calendario`, 'warning', ev.pedidoId, ev.id);

                        calendarEvents = calendarEvents.filter(e => e.id != id);
                        saveCalendar();
                        cloudDeleteEvent(id);

                        renderCalendar();
                        updateSidebarActions(); // Assuming this function exists and updates the UI
                        resolve(true);
                    }, close: true
                }
            ]
        });
    });
}



// --- PEDIDOS RENDERING & LOGIC ---

// AUTO-REFRESH PEDIDOS (5 Minutes)
setInterval(() => {
    loadPedidos(true);
}, 300000); // 300,000 ms = 5 mins

async function loadPedidos(silent = false) {
    const btn = document.querySelector('button[onclick="loadPedidos()"]');
    let originalText = "";
    if (btn) {
        originalText = btn.innerHTML;
        btn.disabled = true;
        if (!silent) btn.innerHTML = "🔄 Cargando...";
    }

    try {
        const res = await fetchAll(CONFIG.ENTITY_PEDIDOS, CONFIG.SMARTIE_PEDIDOS);
        dataPedidos = res;

        // Update Timestamp
        const now = new Date();
        const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const timeLabel = document.getElementById('pedidos-last-update');
        if (timeLabel) timeLabel.innerText = `Act: ${timeStr}`;

        applyFilters();
        updateDebugFooter();
        if (!silent && btn) appAlert("✅ Pedidos actualizados");
    } catch (e) {
        console.error("Refrescar Pedidos Error", e);
    } finally {
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

function renderPedidos(data) {
    const tbody = document.getElementById('body-pedidos');
    tbody.innerHTML = '';

    // FILTERS: Check Radio Status
    const radio = document.querySelector('input[name="filter-ped-status"]:checked');
    const statusFilter = radio ? radio.value : 'all';

    // Sort logic (Keep existing or simplified)
    data.sort((a, b) => {
        let valA, valB;
        switch (sortState.pedidos.col) {
            case 0: valA = new Date(a["FECHA_PEDI"] || 0); valB = new Date(b["FECHA_PEDI"] || 0); break;
            case 1: valA = Number(a["NUMERO"] || 0); valB = Number(b["NUMERO"] || 0); break;
            case 2: valA = a["CLIENTE"]; valB = b["CLIENTE"]; break;
            case 3: valA = a["SKU"]; valB = b["SKU"]; break;
            case 4: valA = Number(a["CANT_A_ENTREGAR"] || 0); valB = Number(b["CANT_A_ENTREGAR"] || 0); break;
            case 5: valA = a["PRODUCTO"]; valB = b["PRODUCTO"]; break; // New Case for Name
            case 6: valA = a["GRUPO_ART"]; valB = b["GRUPO_ART"]; break; // New Case for Group
            case 8: // Status (Scheduled/Not)
                valA = calendarEvents.some(e => String(e.pedidoId) === String(b["NUMERO"] || "")) ? 1 : 0;
                valB = calendarEvents.some(e => String(e.pedidoId) === String(a["NUMERO"] || "")) ? 1 : 0;
                break;
        }
        if (valA < valB) return sortState.pedidos.asc ? -1 : 1;
        if (valA > valB) return sortState.pedidos.asc ? 1 : -1;
        return 0;
    });

    // 1. Group Duplicates (Same ID + SKU + Text)
    const groupedData = [];
    const map = new Map();

    data.forEach(r => {
        const pedidoId = r["NUMERO"] || "";
        const sku = r["SKU"] || "";
        const key = `${pedidoId}|${sku}`; // Group by Pedido + SKU only (Unification)

        const qty = Number(r["CANT_A_ENTREGAR"] || 0);
        const text = (r["TEXTO_ADICIONAL"] || "").trim();

        if (map.has(key)) {
            const existing = map.get(key);
            existing["CANT_A_ENTREGAR"] += qty;

            if (text && !existing["TEXTO_ADICIONAL"].includes(text)) {
                existing["TEXTO_ADICIONAL"] = existing["TEXTO_ADICIONAL"]
                    ? `${existing["TEXTO_ADICIONAL"]} | ${text}`
                    : text;
            }
            existing._breakdown.push({ qty, text: text || "Sin Especificar" });
        } else {
            const clone = { ...r };
            clone["CANT_A_ENTREGAR"] = qty;
            clone["TEXTO_ADICIONAL"] = text;
            clone._breakdown = [{ qty, text: text || "Sin Especificar" }];
            map.set(key, clone);
            groupedData.push(clone);
        }
    });

    currentGroupedPedidos = groupedData;

    // Count valid items after status filter
    let visibleCount = 0;

    groupedData.forEach((r, idx) => {
        const pedidoId = r["NUMERO"] || "";
        const skuCarro = r["SKU"] || "";

        // CHECK SCHEDULED STATUS (Precision Match by Pedido + SKU OR its BOM components)
        const components = getBOMComponents(skuCarro);
        const scheduledEvent = calendarEvents.find(e => {
            if (String(e.pedidoId) !== String(pedidoId)) return false;
            if (e.status === 'rejected') return false; // Ignore rejected attempts
            const eventSku = String(e.sku).trim().toLowerCase();
            const mainSku = String(skuCarro).trim().toLowerCase();
            if (eventSku === mainSku) return true;
            // Check if any BOM component of this item is scheduled
            return components.some(c => String(c.sku).trim().toLowerCase() === eventSku);
        });
        const isScheduled = !!scheduledEvent;

        // Apply Filter
        if (statusFilter === 'pending' && isScheduled) return;
        if (statusFilter === 'scheduled' && !isScheduled) return;

        visibleCount++;

        const tr = document.createElement('tr');
        tr.id = `row-pedido-${pedidoId}`; // Add ID for goToTable
        if (isScheduled) tr.style.background = "#e8f5e9"; // Light Green for scheduled

        let fecha = r["FECHA_PEDI"] ? new Date(r["FECHA_PEDI"]).toLocaleDateString() : "-";

        // Group Name Lookup
        let grupoName = r["GRUPO_ART"] || "";
        if (!grupoName) {
            const art = dataArticulos.find(a => strip(a["MATE_CODIGO"] || "") === strip(skuCarro));
            if (art) grupoName = art["GRMA_DESCRIPCION"] || "";
        }

        // BOM Logic (Simplified rendering for clarity)
        let bomIndicator = "";
        let bomHtml = '';

        if (components.length > 0) {
            // BOM INDICATOR
            bomIndicator = `<span title="Tiene Componentes (BOM)" style="cursor:help; font-size:1.2em;">🧩</span>`; // Puzzle piece or similar

            bomHtml = '<ul class="bom-list">';
            components.forEach((comp, compIdx) => {
                let reqQty = Number(r["CANT_A_ENTREGAR"] || 0) * (comp.cantidad || 1);
                let inputId = `qty-${pedidoId}-${comp.sku}`;
                bomHtml += `
                        <li class="bom-item">
                            <div class="bom-details">
                                <span class="bom-sku-tag">${comp.sku}</span>
                                <span style="font-size:0.8em">x${reqQty}</span>
                            </div>
                            <div class="action-btns-col">
                                <button class="btn-icon" onclick="fabricarBOMItem(${idx}, ${compIdx})" title="Fabricar">🔨</button>
                                <button class="btn-icon" onclick="scheduleBOMItem(${idx}, ${compIdx})" title="Agendar">📅</button>
                            </div>
                            <input type="hidden" id="${inputId}" value="${reqQty}"> 
                        </li>`;
            });
            bomHtml += '</ul>';
        } else {
            // Item itself
            let inputId = `qty-prod-${pedidoId}-${skuCarro}`;
            bomHtml = `
                    <div style="display:flex; align-items:center; gap:5px;">
                        <input type="hidden" id="${inputId}" value="${r["CANT_A_ENTREGAR"] || 1}">
                        <button class="btn-icon" onclick="fabricarDirect(${idx})" title="Fabricar">🔨</button>
                        <button class="btn-icon" onclick="scheduleItemDirect(${idx})" title="Agendar">📅</button>
                    </div>`;
        }

        // Scheduled Icon (Click to Navigate)
        // Scheduled Icon
        let statusIcon = '<span title="No Agendado">⚠️</span>';
        if (isScheduled && scheduledEvent) {
            if (isScheduled) {
                statusIcon = `<span style="cursor:pointer;" onclick="openStatusMenu(event, '${scheduledEvent.date}', '${scheduledEvent.id}')">📅</span>`;
                // ADDED: Date display next to icon
                statusIcon += `<span style="font-size:0.8em; color:#666; margin-left:4px; font-weight:bold;">${formatDate(scheduledEvent.date)}</span>`;
            }
        }

        let numDisplay = `<b>#${pedidoId}</b>`;
        // REMOVED REDUNDANT EMOJI HERE

        const map = {
            'numero': numDisplay,
            'fecha': fecha,
            'cliente': r["CLIENTE"] || "",
            'sku_art': `<span style="color:var(--primary-color); font-weight:600;">${skuCarro}</span>`,
            'nombre_art': (() => {
                let alertIcon = "";
                if (r._breakdown && r._breakdown.length > 1) {
                    const detail = r._breakdown.map(b => `• ${b.qty} u. : ${b.text}`).join('\n');
                    alertIcon = `<span title="${detail}" style="cursor:help; margin-left:5px; font-size:0.8em;">🔴</span>`;
                }
                return `<div>${r["PRODUCTO"] || ""}${alertIcon}</div><div style="font-size:0.85em; color:#999;">${r["TEXTO_ADICIONAL"] || ""}</div>`;
            })(),
            'grupo': grupoName,
            'cantidad': `<b style="font-size:1.1em;">${r["CANT_A_ENTREGAR"] || 0}</b>`,
            'bom': `<div>${bomIndicator}</div>${bomHtml}`,
            'status': statusIcon
        };

        let rowHtml = '';
        COLUMNS_PEDIDOS.forEach(col => {
            if (col.visible) rowHtml += `<td>${map[col.id]}</td>`;
        });
        tr.innerHTML = rowHtml;
        tbody.appendChild(tr);
    });

    document.getElementById('count-pedidos').innerText = `(${visibleCount})`;
    document.getElementById('summary-pedidos').innerHTML = `🔴 Solicitudes Visibles: <strong>${visibleCount}</strong> <span style="font-size:0.8em; color:#666; margin-left:10px;">(S:${CONFIG.SMARTIE_PEDIDOS} / E:${CONFIG.ENTITY_PEDIDOS})</span>`;
    document.getElementById('summary-pedidos').style.display = 'block';
}

// New Action Function
// --- PRODUCTION LOGIC ---

function strip(s) { return String(s ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim(); }

async function apiPost(url, body) {
    await checkAuth();
    let r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify(body || {}) });
    if (r.status === 401) { await loginYiQi(); r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token }, body: JSON.stringify(body || {}) }); }
    if (!r.ok) throw new Error(`API Error ${r.status} `);
    return r.json();
}

async function postAltaProduccion({ grupoId, mateId, qty, obsText }) {
    if (!Number.isInteger(qty) || qty <= 0) throw new Error("Cantidad inválida");
    if (!mateId) throw new Error("ID de Articulo no encontrado (MATE_ID)");
    if (!grupoId) throw new Error("ID de Grupo no encontrado");

    // Form IDs based on C- ALTAS... definition (12369=Group, 12370=Mate, 12371=Qty, 12372=Obs)
    const formString = `12369 = ${grupoId}& 12370=${mateId}& 12371=${qty}& 12377=& 12372=${encodeURIComponent(obsText || "")} `;

    const body = {
        schemaId: CONFIG.SCHEMA_ID,
        form: formString,
        uploads: "",
        parentId: null,
        childId: null,
        entityId: String(CONFIG.ALTA_PROD.entityId)
    };

    let lastErr = null;
    let attempt = 0;
    for (const url of CONFIG.ALTA_PROD.SAVE_URLS) {
        attempt++;
        try {
            showLoader(`Guardando en YiQi (Intento ${attempt})...`);
            const res = await apiPost(url, body);
            if (res?.ok || res?.newId) return res; // Accept if valid
            lastErr = new Error(res?.error || "Error al guardar");
        } catch (e) { lastErr = e; }
    }
    throw lastErr || new Error("Fallo al contactar API de Producción");
}

async function confirmProductionModal(sku, name, qty, group, pedidoId) {
    return new Promise(resolve => {
        const content = `
                <div style="text-align:left; margin-bottom:15px;">
                    <div style="font-weight:bold; color:var(--primary-color); font-size:1.1em; margin-bottom:5px;">${name}</div>
                    <div style="font-size:0.9em; color:#666; margin-bottom:10px;">SKU: ${sku}</div>
                    <div style="background:#f1f5f9; padding:10px; border-radius:6px; font-size:0.95em; border:1px solid #e2e8f0;">
                        <div style="margin-bottom:4px;">📂 Grupo: <strong>${group}</strong></div>
                        <div>📄 Pedido: <strong>#${pedidoId || 'N/A'}</strong></div>
                    </div>
                    <div style="margin-top:20px;">
                        <label style="display:block; font-size:0.9em; margin-bottom:5px; font-weight:600;">Cantidad a Fabricar:</label>
                        <input type="number" id="modal-prod-qty" class="modal-input" value="${qty}" min="1" style="font-size:1.4em; text-align:center; font-weight:bold; padding:12px;">
                    </div>
                </div>
                        `;

        showModal({
            title: '🏭 Confirmar Alta Producción',
            content: content,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(null) },
                {
                    text: '✅ Confirmar Alta', class: 'btn-produce', onClick: () => {
                        const val = document.getElementById('modal-prod-qty').value;
                        resolve(Number(val));
                    }, close: true
                }
            ]
        });

        // Focus and Select all text in input
        setTimeout(() => {
            const inp = document.getElementById('modal-prod-qty');
            if (inp) {
                inp.focus();
                inp.select();
            }
        }, 100);
    });
}

async function fabricar(sku, nombre, inputId, pedidoId, eventId = null) {
    let qty = 0;
    // Handle both DOM ID and Direct Value (for Calendar)
    if (typeof inputId === 'string' && document.getElementById(inputId)) {
        qty = Number(document.getElementById(inputId).value);
    } else if (typeof inputId === 'number') {
        qty = inputId; // Direct number passed
        inputId = null; // No specific button to toggle
    } else if (inputId && String(inputId).startsWith('tmp-qty-')) {
        // Is temp input
        qty = Number(document.getElementById(inputId).value);
    }

    if (qty <= 0) { await appAlert("La cantidad debe ser mayor a 0"); return; }

    // 1. Find Data (Improved matching)
    const art = dataArticulos.find(a => strip(a["MATE_CODIGO"] || "") === strip(sku));

    if (!art) {
        console.warn("Articulo no encontrado para SKU:", sku);
        await appAlert(`❌ Error: No se encontró el artículo con SKU "${sku}" en la base maestra(Smartie 2670).\nNo se puede fabricar.`);
        return;
    }

    // Direct ID Usage per user request
    // Try multiple possible keys for Group ID based on common YiQi patterns
    const mateId = art["ID"] || art["MATE_ID"] || art["id"];
    let grupoId = art["MATE_GRUPO_IDEN"] || art["GRMA_ID"] || art["GRUPO_ID"] || art["GRUPO_IDENTIFICADOR"] || null;
    const groupName = art["GRMA_DESCRIPCION"] || art["GRUPO_FAMILIA"] || "";

    // Fallback: If no direct ID, try to find by Name in dataGrupos
    if (!grupoId && groupName) {
        const match = dataGrupos.find(g => {
            const gName = g["GRMA_DESCRIPCION"] || g["GRUPO"] || g["Name"] || "";
            return strip(gName) === strip(groupName);
        });
        if (match) grupoId = match["ID"] || match["GRMA_ID"] || match["id"];
    }

    if (!mateId) { await appAlert("❌ Error interno: Articulo sin ID (MATE_ID)."); return; }

    // Validation: Group is mandatory for Production
    if (!grupoId) {
        console.warn("Grupo no encontrado para:", groupName, "Keys disponibles:", Object.keys(art));
        await appAlert(`❌ Error Crítico: El artículo "${sku}" no tiene GRUPO asignado en YiQi.\nKeys encontrados: ${Object.keys(art).join(", ")} \nNombre Grupo: "${groupName}"\n\nEs obligatorio para el Alta de Producción.`);
        return;
    }

    // --- CUSTOM PRODUCTION CONFIRMATION ---
    // Returns the QUANTITY confirmed by user, or null/false
    const confirmedQty = await confirmProductionModal(sku, nombre, qty, groupName, pedidoId);
    if (!confirmedQty || confirmedQty <= 0) return false;

    // 2. Perform Action
    showLoader("Confirmando alta en YiQi..."); // NEW: Show Loader

    let btn = null;
    let originalText = "";
    if (inputId) {
        btn = document.querySelector(`button[onclick *= '${inputId}']`);
        if (btn) {
            originalText = btn.innerHTML;
            btn.innerHTML = "🔄";
            btn.disabled = true;
        }
    }

    try {
        const obs = `PED ${pedidoId} - Desde Tablero Stock`;
        // Use the CONFIRMED quantity
        const res = await postAltaProduccion({ grupoId: grupoId || 0, mateId, qty: confirmedQty, obsText: obs });

        hideLoader(); // HIDE BEFORE SUCCESS ALERT TO PREVENT DEADLOCK
        await appAlert(`✅ Alta Exitosa!(ID: ${res.newId || "OK"}) \nSe descontaron insumos y sumó stock.`);
        const cleanPedidoId = (pedidoId && pedidoId !== 'STOCK' && pedidoId !== 'CALENDARIO') ? pedidoId : null;
        logActivity('Fabricación', `${sku} (${confirmedQty} u.) - ${pedidoId ? 'Pedido #' + pedidoId : 'Stock'}`, 'success', cleanPedidoId, eventId);

        return confirmedQty; // NEW: Return Quantity for Calendar Logic
    } catch (e) {
        hideLoader();
        await appAlert("❌ Falló la carga: " + e.message);
        console.error(e);
        return false; // Failure
    } finally {
        hideLoader(); // Safety
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}

// Duplicate renderStock removed. Using the one defined above.

function sortPedidos(n) { if (sortState.pedidos.col === n) sortState.pedidos.asc = !sortState.pedidos.asc; else { sortState.pedidos.col = n; sortState.pedidos.asc = true; } applyFilters(); }
function showError(msg) { document.getElementById('error').innerText = msg; document.getElementById('error').style.display = 'block'; }
/**
 * BOOTSTRAP: SINGLE ENTRY POINT
 * This ensures splash stays until everything is truly loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. UI Initial State
    switchTab('pedidos');

    // 2. Data Fetch (Splash is flex by default in HTML)
    await refreshData();

    // 3. Initialize Sidebar Mode (Force correct default view)
    if (typeof setSidebarMode === 'function') setSidebarMode(sidebarMode);

    // 4. UI Global Listeners
    const plannerSearch = document.getElementById('planner-search');
    const plannerSearchBox = document.getElementById('header-search-box');
    if (plannerSearch && plannerSearchBox) {
        plannerSearch.addEventListener('blur', () => {
            if (plannerSearch.value.trim() === '') plannerSearchBox.classList.remove('active');
        });
    }

    console.log("🚀 Application Started Successfully");
});

// --- MINIMALIST SORT LOGIC ---
function updateSortIndicators(tableId) {
    const table = document.getElementById(tableId);
    if (!table) return;

    // 1. Reset all headers to their base label
    const headers = table.querySelectorAll('th');
    headers.forEach(th => {
        const baseLabel = th.dataset.baseLabel || th.textContent.replace(/[ ▲▼▼▲.↕️🔼🔽]/g, '').trim();
        if (th.dataset.baseLabel) {
            th.innerHTML = baseLabel;
        } else {
            // Fallback for stock table or headers without data-base-label
            th.innerHTML = th.innerHTML.split(' ')[0].split('<')[0].trim();
        }
    });

    // 2. Add indicator to active column
    let sortObj = null;
    let colIndex = -1;

    if (tableId === 'table-pedidos') {
        sortObj = sortState.pedidos;
        colIndex = sortObj.col;
    } else if (tableId === 'table-stock') {
        sortObj = sortState.stock;
        colIndex = sortObj.col;
    }

    if (sortObj && colIndex >= 0) {
        let targetTh = Array.from(headers).find(th => {
            const onclick = th.getAttribute('onclick');
            return onclick && onclick.includes(`(${colIndex})`);
        });

        if (targetTh) {
            // Use standard visible triangle characters
            targetTh.innerHTML += sortObj.asc ? ' ▲' : ' ▼';
        }
    }
}

// ... (Previous JS) ...



// --- NOTES LOGIC ---
// --- NOTES LOGIC ---
// (Defined in Global State)

// Load Notes
try {
    const savedNotes = localStorage.getItem('tmc_calendar_notes');
    if (savedNotes) {
        const parsed = JSON.parse(savedNotes);
        // Migration: If old format (string), convert to array
        for (let key in parsed) {
            if (typeof parsed[key] === 'string') {
                parsed[key] = [{ id: Date.now(), text: parsed[key] }];
            }
        }
        calendarNotes = parsed;
    }
} catch (e) { console.error("Error loading notes", e); }

function saveNotes() {
    localStorage.setItem('tmc_calendar_notes', JSON.stringify(calendarNotes));
}

async function addNotePrompt(date, noteId = null) {
    // Get existing notes for this date
    const notes = calendarNotes[date] || [];
    let currentText = "";
    let isEdit = false;

    if (noteId) {
        const note = notes.find(n => n.id == noteId);
        if (note) {
            currentText = note.text;
            isEdit = true;
        }
    }

    return new Promise(resolve => {
        showModal({
            title: isEdit ? '📝 Editar Nota' : '📝 Nueva Nota',
            content: `
                        <div style="margin-bottom:10px;">Nota para el <strong>${formatDate(date)}</strong>:</div>
                        <textarea id="note-input" rows="4" style="width:100%; padding:10px; border:1px solid #ddd; border-radius:4px; resize:none;">${currentText}</textarea>
                    `,
            actions: [
                {
                    text: isEdit ? '🗑️ Borrar' : 'Cancelar',
                    class: 'btn-secondary',
                    style: isEdit ? 'color:red;' : '',
                    onClick: () => {
                        if (isEdit) {
                            // Delete specific note
                            calendarNotes[date] = notes.filter(n => n.id != noteId);
                            if (calendarNotes[date].length === 0) delete calendarNotes[date];
                            saveNotes();
                            cloudDeleteNote(noteId); // Sincronizar eliminación en la nube
                            renderCalendar();
                        }
                        resolve();
                    },
                    close: true
                },
                {
                    text: 'Guardar',
                    class: 'btn-produce',
                    onClick: () => {
                        const val = document.getElementById('note-input').value.trim();

                        if (val) {
                            // Save / Update
                            if (!calendarNotes[date]) calendarNotes[date] = [];
                            let targetId = noteId;

                            if (isEdit) {
                                const noteIdx = calendarNotes[date].findIndex(n => n.id == noteId);
                                if (noteIdx >= 0) calendarNotes[date][noteIdx].text = val;
                            } else {
                                targetId = Date.now();
                                calendarNotes[date].push({ id: targetId, text: val });
                            }
                            saveNotes();
                            cloudSaveNote(targetId, date, val); // Sincronizar guardado en la nube
                            renderCalendar();
                        } else if (isEdit) {
                            // Empty + Edit = Delete
                            calendarNotes[date] = notes.filter(n => n.id != noteId);
                            if (calendarNotes[date].length === 0) delete calendarNotes[date];
                            saveNotes();
                            cloudDeleteNote(noteId); // Sincronizar eliminación en la nube
                            renderCalendar();
                        }
                        resolve();
                    },
                    close: true
                }
            ]
        });

        // Focus text area
        setTimeout(() => document.getElementById('note-input').focus(), 100);
    });
}

// --- CONTEXT MENU LOGIC ---
let activeDateKey = null;

function openDayMenu(e, dateKey) {
    e.preventDefault();
    e.stopPropagation();

    activeDateKey = dateKey;

    const menu = document.getElementById('context-menu');

    // Build Menu Content
    menu.innerHTML = `
                <div class="context-menu-item" onclick="initiateAddNoteFromMenu()">
                    <span>📝</span> Nota / Observación
                </div>
            `;

    menu.style.display = 'block';
    menu.style.visibility = 'hidden';

    // Smart Positioning
    const menuWidth = menu.offsetWidth || 200;
    const menuHeight = menu.offsetHeight || 100;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    let left = e.pageX;
    let top = e.pageY;

    if (left + menuWidth > screenW - 10) left = left - menuWidth;
    if (top + menuHeight > screenH - 10) top = top - menuHeight;

    menu.style.left = left + 'px';
    menu.style.top = top + 'px';
    menu.style.visibility = 'visible';
}

function closeDayMenu() {
    document.getElementById('context-menu').style.display = 'none';
}

// --- MANUAL ADD DELETED ---
function initiateManualAddFromMenu() {
    // Function removed per user request
    console.log("Manual trigger disabled");
}

function initiateAddNoteFromMenu() {
    closeDayMenu();
    if (activeDateKey) {
        addNotePrompt(activeDateKey);
    }
}

// Close menu on global click
document.addEventListener('click', function (e) {
    if (!e.target.closest('#context-menu')) {
        closeDayMenu();
    }
});


// --- MANUAL ADD DELETED (Functions Removed) ---

// --- UPDATE CALENDAR CLICK (RESTORED FOR NOTES) ---
// --- UPDATE CALENDAR CLICK REMOVED (No context menu needed, inline click calls openDayDetailModal directly) ---



// --- DRAG NAVIGATION LOGIC ---
let lastNavTime = 0;
document.addEventListener('dragover', function (e) {
    e.preventDefault(); // Necessary for drop
    // Check throttle
    const now = Date.now();
    if (now - lastNavTime < 1500) return; // 1.5s throttle

    const edgeThreshold = 80; // px
    if (e.clientX < edgeThreshold) {
        // Nav Prev
        changeMonth(-1);
        lastNavTime = now;
    } else if (e.clientX > window.innerWidth - edgeThreshold) {
        // Nav Next
        changeMonth(1);
        lastNavTime = now;
    }
});

// --- NAVIGATION LOGIC ---
function goToCalendarDate(dateStr, eventId = null) {
    // Robust Date Parsing
    if (!dateStr) return;

    let y, m, d;
    // Handle "D/M/YYYY" or "YYYY-MM-DD"
    if (dateStr.includes('/')) {
        [d, m, y] = dateStr.split('/').map(Number);
    } else {
        [y, m, d] = dateStr.split('-').map(Number);
    }

    // Validate
    if (!y || !m || !d || y < 2000) {
        appAlert(`⚠️ Fecha inválida: ${dateStr}`);
        return;
    }

    // Switch Tab
    switchTab('planificador');

    // FORCE MONTH/WEEK SWITCH LOGIC (Deep Fix)
    if (currentCalendarView === 'semanal') {
        currentMonth = new Date(y, m - 1, d); // Set to exact target date for weekly view calculation
    } else {
        currentMonth = new Date(y, m - 1, 1); // Set to 1st of the month for monthly view calculation
    }

    // Ensure selectors update (they listen to currentMonth in renderCalendar)
    // But we must call renderCalendar to refresh the grid
    renderCalendar();

    // Scroll to event logic...
    setTimeout(() => {
        if (eventId) {
            const el = document.getElementById(eventId);
            if (el) {
                el.scrollIntoView({ behavior: 'auto', block: 'center' }); // Auto is faster than smooth sometimes
                el.classList.add('highlight-pulse');
                setTimeout(() => el.classList.remove('highlight-pulse'), 1500);
            }
        } else {
            // Fallback to day highlight
            const dayKey = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            const dayEl = document.querySelector(`.cal-day[data-date="${dayKey}"]`);
            if (dayEl) {
                dayEl.scrollIntoView({ behavior: 'auto', block: 'center' });
                dayEl.classList.add('highlight-pulse');
                setTimeout(() => dayEl.classList.remove('highlight-pulse'), 1500);
            }
        }
    }, 300); // Increased timeout significantly to allow render
}

// --- REVERSE NAVIGATION ---
function goToTable(type, id) {
    // type: 'pedido' or 'stock'
    // id: pedidoId or sku

    if (type === 'pedido') {
        switchTab('pedidos');
        // Ensure filtered? Maybe clear filters?
        // For now, assume it's visible.
        setTimeout(() => {
            const row = document.getElementById(`row-pedido-${id}`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('highlight-pulse');
                setTimeout(() => row.classList.remove('highlight-pulse'), 2000);
            } else {
                appAlert("⚠️ El pedido no es visible en la tabla actual (revise filtros).");
            }
        }, 300);
    } else if (type === 'stock') {
        switchTab('stock');
        setTimeout(() => {
            const row = document.getElementById(`row-stock-${id}`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('highlight-pulse');
                setTimeout(() => row.classList.remove('highlight-pulse'), 2000);
            } else {
                appAlert("⚠️ El item no es visible en la tabla de stock.");
            }
        }, 300);
    }
}

// --- INTERACTIVE MENUS ---


function openStatusMenu(e, date, eventId) {
    e.stopPropagation();
    const menu = document.getElementById('context-menu');

    menu.innerHTML = `
                <div class="ctx-item" onclick="goToCalendarDate('${date}', '${eventId}'); closeDayMenu();">🚀 Ir a Fecha</div>
                <div class="ctx-item" onclick="reprogramEvent('${eventId}'); closeDayMenu();">🗓️ Reprogramar</div>
            `;

    menu.style.display = 'block';
    menu.style.left = (e.pageX - 100) + 'px'; // Adjusted to show left of cursor
    menu.style.top = e.pageY + 'px';
}

function askRescheduleReason(oldDate, newDate) {
    return new Promise(resolve => {
        const content = `
            <div style="font-family: sans-serif; display: flex; flex-direction: column; gap: 12px; padding: 10px;">
                <p style="margin: 0; font-size: 0.95rem; color: #555; line-height:1.4;">
                    Estás reprogramando este lote de <strong>${formatDate(oldDate)}</strong> al <strong>${formatDate(newDate)}</strong>.
                </p>
                <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 5px;">
                    <label style="font-weight: 600; font-size: 0.9rem; color: #333;">Motivo del cambio <span style="color:#d32f2f;">*</span>:</label>
                    <select id="reschedule-reason-select" style="width: 100%; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9rem;">
                        <option value="">-- Seleccione un motivo --</option>
                        <option value="Faltan insumos">Faltan insumos</option>
                        <option value="Error planificación">Error planificación</option>
                        <option value="En curso todavía">En curso todavía</option>
                        <option value="Se encaró antes">Se encaró antes</option>
                    </select>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px;">
                    <label style="font-weight: 600; font-size: 0.9rem; color: #333;">Comentario adicional (opcional):</label>
                    <textarea id="reschedule-comment" placeholder="Escribe aquí más detalles..." style="width: 100%; height: 60px; padding: 8px; border: 1px solid #ccc; border-radius: 4px; font-size: 0.9rem; font-family: sans-serif; resize: none; box-sizing: border-box;"></textarea>
                </div>
            </div>
        `;

        showModal({
            title: '📋 Motivo de Reprogramación',
            content: content,
            actions: [
                { 
                    text: 'Confirmar', 
                    class: 'btn-produce', 
                    close: false, // Prevent auto close to validate
                    onClick: () => {
                        const selectEl = document.getElementById('reschedule-reason-select');
                        const reason = selectEl.value;
                        if (!reason) {
                            selectEl.style.borderColor = '#d32f2f';
                            selectEl.style.outline = 'none';
                            appAlert("⚠️ Debe seleccionar un motivo para la reprogramación.");
                            return;
                        }
                        const comment = document.getElementById('reschedule-comment').value.trim();
                        closeModal();
                        resolve({ reason, comment });
                    } 
                },
                {
                    text: 'Cancelar',
                    class: 'btn-secondary',
                    onClick: () => resolve(null)
                }
            ]
        });
    });
}

async function reprogramEvent(eventId) {
    const ev = calendarEvents.find(e => String(e.id) === String(eventId));
    if (!ev) return;

    // VALIDACIÓN 1: No permitir reprogramar tarjetas finalizadas o aprobadas
    if (ev.status === 'done' || ev.status === 'approved') {
        appAlert("⚠️ No se puede reprogramar un lote que ya ha sido terminado o controlado.");
        return;
    }

    // ENRICH DATA for Modal Context
    let enrichedClient = ev.cliente || "";
    let enrichedArt = ev.name || ev.text || "";

    if (ev.pedidoId && ev.pedidoId !== 'STOCK' && typeof dataPedidos !== 'undefined') {
        const p = dataPedidos.find(x => String(x.NUMERO) === String(ev.pedidoId));
        if (p) {
            enrichedClient = p.CLIENTE || enrichedClient;
            enrichedArt = p.PRODUCTO || enrichedArt;
        }
    }
    if (typeof dataArticulos !== 'undefined') {
        const a = dataArticulos.find(x => String(x.MATE_CODIGO).trim() === String(ev.sku).trim());
        if (a && a.MATE_DESCRIPCION) {
            enrichedArt = a.MATE_DESCRIPCION;
        }
    }

    const result = await promptDate(ev.date, ev.time || "", enrichedArt, ev.sku, enrichedClient);
    if (result) {
        const oldDate = ev.date;
        const oldTime = ev.time || "";

        if (oldDate !== result.date) {
            // Check delivery date warning
            const warning = checkDeliveryDateWarning(ev.pedidoId, result.date);
            if (warning) {
                const proceed = await confirmCommercialAlert(ev.pedidoId, result.date, warning.deliveryDate);
                if (!proceed) {
                    return;
                }
            }

            // Date changed! Ask for reason
            const reasonData = await askRescheduleReason(oldDate, result.date);
            if (!reasonData) {
                // User cancelled or closed the prompt
                return; // Abort
            }

            ev.date = result.date;
            ev.time = result.time;

            // Add to history list on the event
            ev.rescheduleHistory = ev.rescheduleHistory || [];
            ev.rescheduleHistory.push({
                date: new Date().toLocaleDateString(),
                fromDate: oldDate,
                toDate: result.date,
                reason: reasonData.reason,
                comment: reasonData.comment
            });

            saveCalendar();
            cloudSaveEvent(ev);

            const cleanPedidoId = (ev.pedidoId && ev.pedidoId !== 'STOCK' && ev.pedidoId !== 'CALENDARIO') ? ev.pedidoId : null;
            let commentStr = reasonData.comment ? ` - Obs: "${reasonData.comment}"` : "";
            let timeMsg = result.time ? ` a las ${result.time}` : "";
            logActivity('Reprogramación', `${ev.sku} movido de ${formatDate(oldDate)} a ${formatDate(result.date)}${timeMsg}. Motivo: ${reasonData.reason}${commentStr}`, 'info', cleanPedidoId, ev.id);

            if (warning) {
                logActivity('Alerta Comercial', `El lote de ${ev.sku} (${ev.qty} u.) se reprogramó para el ${formatDate(result.date)}, superando o igualando la fecha pactada (${formatDate(warning.deliveryDate)}). Motivo: ${reasonData.reason}${commentStr}`, 'warning', cleanPedidoId, ev.id);
            }
        } else {
            // Only time changed, no need to ask for reschedule reason
            ev.time = result.time;
            saveCalendar();
            cloudSaveEvent(ev);
            const cleanPedidoId = (ev.pedidoId && ev.pedidoId !== 'STOCK' && ev.pedidoId !== 'CALENDARIO') ? ev.pedidoId : null;
            let timeMsg = result.time ? ` a las ${result.time}` : " (sin horario)";
            logActivity('Ajuste Hora', `${ev.sku} reprogramado en el mismo día (${formatDate(oldDate)})${timeMsg}`, 'info', cleanPedidoId, ev.id);
        }

        // Redirect to new date WITHOUT ALERT
        goToCalendarDate(result.date, ev.id);
        updateSidebarActions();
    }
}

function promptDate(currentDate, currentTime = "", artName = "", sku = "", client = "") {
    const today = new Date().toISOString().split('T')[0];
    return new Promise(resolve => {
        let contextHtml = "";
        if (artName || sku) {
            contextHtml = `
                <div style="background: #f8f9fa; border-left: 4px solid #1a73e8; padding: 12px; border-radius: 4px; margin-bottom: 20px;">
                    <div style="font-weight: 800; color: #1a73e8; font-size: 1.05rem; line-height: 1.3; margin-bottom: 4px;">${artName}</div>
                    <div style="font-size: 0.85rem; color: #5f6368; font-weight: 600;"> SKU: ${sku} ${client ? ' • ' + client : ''}</div>
                </div>`;
        }

        const content = `
                ${contextHtml}
                <div style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
                    <div>
                        <label style="display:block; margin-bottom:5px; font-weight: 500; font-size: 0.9rem; color: #3c4043;">Nueva Fecha:</label>
                        <input type="date" id="reprogram-date" class="modal-input" value="${currentDate}" min="${today}" style="font-size: 1.1rem; padding: 8px;">
                    </div>
                    <div>
                        <label style="display:block; margin-bottom:5px; font-weight: 500; font-size: 0.9rem; color: #3c4043;">Hora (Opc):</label>
                        <input type="time" id="reprogram-time" class="modal-input" value="${currentTime}" style="font-size: 1.1rem; padding: 8px;">
                    </div>
                </div>
                `;
        showModal({
            title: '🗓️ Reprogramar Lote',
            content: content,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(null), close: true },
                {
                    text: 'Guardar Nueva Fecha', class: 'btn-primary', style: 'background:#1a73e8;', onClick: () => {
                        const dateVal = document.getElementById('reprogram-date').value;
                        const timeVal = document.getElementById('reprogram-time').value;
                        if (!dateVal) return;
                        if (new Date(dateVal) < new Date(today)) {
                            appAlert("⚠️ No puedes programar para el pasado.");
                            return;
                        }
                        resolve({ date: dateVal, time: timeVal || "" });
                    }, close: true
                }
            ]
        });
    });
}

// --- ASOCIAR PEDIDO A LOTE (SPLIT LOGIC) ---
async function asociarPedidoALote(eventId) {
    const ev = calendarEvents.find(e => e.id == eventId);
    if (!ev) return;

    // 1. Filtrar pedidos pendientes por el SKU del lote (Nivel SKU o BOM)
    const pendingOrders = dataPedidos.filter(p => {
        const pSku = strip(p.SKU || "").toLowerCase();
        const evSku = strip(ev.sku || "").toLowerCase();

        // Match directo O Match en componentes BOM
        let isMatch = (pSku === evSku);
        if (!isMatch) {
            const comps = getBOMComponents(p.SKU);
            isMatch = comps.some(c => strip(c.sku).toLowerCase() === evSku);
        }
        if (!isMatch) return false;

        // Verificar si ya está agendado
        const components = getBOMComponents(p.SKU);
        const isScheduled = calendarEvents.some(e => {
            if (String(e.pedidoId) !== String(p.NUMERO)) return false;
            const eventSku = String(e.sku).trim().toLowerCase();
            const mainSku = String(p.SKU).trim().toLowerCase();
            if (eventSku === mainSku) return true;
            return components.some(c => String(c.sku).trim().toLowerCase() === eventSku);
        });

        return !isScheduled;
    });

    if (pendingOrders.length === 0) {
        appAlert(`No hay pedidos pendientes para el SKU: <strong>${ev.sku}</strong> (incluyendo análisis BOM)`);
        return;
    }

    // 2. Mostrar Modal de Asociación
    const result = await showAsociarPedidoModal(ev, pendingOrders);
    if (!result) return;

    // 3. Procesar Asociación (Split)
    // El modal ahora puede devolver una nueva cantidad original (newLotQty)
    const newLotQty = Number(result.newLotQty);
    let totalToAssociate = 0;

    result.selections.forEach(sel => {
        const qty = Number(sel.qty);
        if (qty > 0) {
            totalToAssociate += qty;
            const newEv = {
                ...ev,
                id: Date.now() + Math.random(),
                qty: qty,
                pedidoId: sel.pedidoId,
                cliente: sel.cliente,
                text: sel.text
            };
            calendarEvents.push(newEv);
            cloudSaveEvent(newEv); // Sincronizar nuevo evento
        }
    });

    if (totalToAssociate > 0 || newLotQty !== Number(ev.qty)) {
        if (totalToAssociate >= newLotQty) {
            // Eliminar original si se asignó todo
            calendarEvents = calendarEvents.filter(e => e.id != eventId);
            cloudDeleteEvent(eventId); // Sincronizar eliminación en la nube
        } else {
            // Actualizar original con el remanente de la nueva cantidad
            ev.qty = newLotQty - totalToAssociate;
            cloudSaveEvent(ev); // Sincronizar actualización en la nube
        }

        saveCalendar();
        renderCalendar();
        appAlert(`✅ Operación completada con éxito.`);
    }
}

function showAsociarPedidoModal(ev, orders) {
    return new Promise(resolve => {
        // Buscar Stock Mínimo del SKU
        let minStock = "-";
        if (typeof dataStock !== 'undefined') {
            const s = dataStock.find(x => strip(x["STOC_SKU"] || x["MATE_CODIGO"] || "") === strip(ev.sku));
            if (s) minStock = s["MATE_STOCK_SEGURIDAD"] || s["STOC_MINIMO"] || s["MINIMO"] || 0;
        }

        let rowsHtml = '';
        orders.forEach((p, idx) => {
            const pedidoId = p.NUMERO || "";
            const cliente = p.CLIENTE || "";
            const cantPendiente = Number(p.CANT_A_ENTREGAR || 0);
            const text = (p.TEXTO_ADICIONAL || "").trim();

            rowsHtml += `
                <tr>
                    <td><strong>#${pedidoId}</strong></td>
                    <td style="font-size:0.85em;">${cliente}</td>
                    <td style="text-align:center;">${cantPendiente}</td>
                    <td>
                        <input type="number" class="modal-input sel-qty" data-idx="${idx}" 
                               data-pedido-id="${pedidoId}" data-cliente="${cliente}" data-text="${text}"
                               min="0" max="${cantPendiente}" value="0" 
                               oninput="if(Number(this.value) > ${cantPendiente}) this.value = ${cantPendiente}"
                               style="width:60px; padding:4px;">
                    </td>
                </tr>`;
        });

        const content = `
            <div style="margin-bottom:15px; background:#fff8e1; padding:12px; border-radius:6px; border:1px solid #ffe082; font-size:0.95em;">
                <div style="margin-bottom:8px;"><strong>Lote Original:</strong> ${ev.sku} (${formatDate(ev.date)})</div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                    <div>
                        <strong>Cantidad Total Lote:</strong>
                        <input type="number" id="new-lot-qty" class="modal-input" value="${ev.qty}" min="1" 
                               style="width:70px; padding:4px; font-weight:bold; margin-left:5px;">
                    </div>
                    <div><strong>Stock Mín:</strong> <span style="color:#d32f2f; font-weight:bold;">${minStock}</span> u.</div>
                </div>
            </div>
            <div style="max-height:280px; overflow-y:auto; border:1px solid #eee; border-radius:4px;">
                <table style="width:100%; font-size:0.9em; border-collapse:collapse;">
                    <thead style="background:#f8f9fa; position:sticky; top:0; z-index:10;">
                        <tr>
                            <th style="padding:10px; text-align:left;">Pedido</th>
                            <th style="padding:10px; text-align:left;">Cliente</th>
                            <th style="padding:10px; text-align:center;">Pend.</th>
                            <th style="padding:10px; text-align:center;">Asociar</th>
                        </tr>
                    </thead>
                    <tbody style="background:white;">${rowsHtml}</tbody>
                </table>
            </div>
            <div style="margin-top:15px; display:flex; justify-content:space-between; align-items:center; padding:0 5px;">
                <div style="color:#666; font-size:0.9em;">Remanente Lote: <span id="rem-stock-qty" style="font-weight:bold;">${ev.qty}</span> u.</div>
                <div style="font-weight:bold;">Total a Asociar: <span id="total-associate" style="color:var(--primary-color);">0</span> u.</div>
            </div>
        `;

        showModal({
            title: '🔗 Asociar Pedidos al Lote',
            content: content,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(null), close: true },
                {
                    text: 'Confirmar Asociación', id: 'btn-confirm-association', class: 'btn-produce', onClick: async () => {
                        const newLotQty = Number(document.getElementById('new-lot-qty').value);
                        const selections = [];
                        let total = 0;
                        document.querySelectorAll('.sel-qty').forEach(input => {
                            const qty = Number(input.value);
                            if (qty > 0) {
                                total += qty;
                                selections.push({
                                    pedidoId: input.dataset.pedidoId,
                                    cliente: input.dataset.cliente,
                                    text: input.dataset.text,
                                    qty: qty
                                });
                            }
                        });

                        // Double check safety
                        if (total > newLotQty) return;

                        closeModal(); // Cierre manual
                        resolve({ newLotQty, selections });
                    }, close: false
                }
            ]
        });

        // Eventos para actualización dinámica
        setTimeout(() => {
            const newLotInput = document.getElementById('new-lot-qty');
            const selInputs = document.querySelectorAll('.sel-qty');
            const totalEl = document.getElementById('total-associate');
            const remEl = document.getElementById('rem-stock-qty');

            const refreshTotals = () => {
                const newLotQty = Number(newLotInput.value) || 0;
                let totalAssociate = 0;
                selInputs.forEach(input => totalAssociate += Number(input.value) || 0);

                totalEl.innerText = totalAssociate;
                remEl.innerText = newLotQty - totalAssociate;

                // Estilo visual si excede
                const confirmBtn = document.getElementById('btn-confirm-association');
                if (totalAssociate > newLotQty) {
                    totalEl.style.color = '#d32f2f';
                    totalEl.style.fontWeight = 'bold';
                    remEl.style.color = '#d32f2f';
                    if (confirmBtn) {
                        confirmBtn.disabled = true;
                        confirmBtn.classList.add('btn-disabled-gray');
                    }
                } else {
                    totalEl.style.color = 'var(--primary-color)';
                    totalEl.style.fontWeight = 'bold';
                    remEl.style.color = 'inherit';
                    if (confirmBtn) {
                        confirmBtn.disabled = false;
                        confirmBtn.classList.remove('btn-disabled-gray');
                    }
                }
            };

            newLotInput.addEventListener('input', refreshTotals);
            selInputs.forEach(input => input.addEventListener('input', refreshTotals));

            // Inicializar
            refreshTotals();
        }, 100);
    });
}

// --- NEW DAY DETAIL & MANUAL SCHEDULER LOGIC ---
async function openDayDetailModal(dateStr) {
    const today = new Date().toISOString().split('T')[0];
    
    // Find all events for this day
    const dayEvents = calendarEvents.filter(ev => ev.date === dateStr);
    
    // Sort events: chronologically by time, those without time go last
    dayEvents.sort((a, b) => {
        if (!a.time && !b.time) return 0;
        if (!a.time) return 1;
        if (!b.time) return -1;
        return a.time.localeCompare(b.time);
    });

    // Formatear fecha
    const friendlyDate = formatDate(dateStr);

    let htmlContent = `
        <div class="day-detail-container" style="padding-right: 5px;">
            <div style="margin-bottom: 20px; display:flex; justify-content: space-between; align-items:center; flex-wrap: wrap; gap: 10px;">
                <h4 style="margin: 0; color: #555;">Lista de Lotes Programados</h4>
                <div style="display:flex; gap: 8px;">
                    <button class="btn-primary" onclick="initiateManualAddFromDate('${dateStr}'); closeModal();" style="font-size: 0.85rem; padding: 6px 12px; cursor: pointer; border-radius: 4px; border: none; background: #8e44ad; color: white;">➕ Agendar Lote</button>
                    <button class="btn-secondary" onclick="addNotePrompt('${dateStr}');" style="font-size: 0.85rem; padding: 6px 12px; cursor: pointer; border-radius: 4px; border: 1px solid #ccc; background: white; color: #333;">📝 Agregar Nota</button>
                </div>
            </div>
    `;

    if (dayEvents.length === 0) {
        htmlContent += `
            <div style="text-align:center; padding: 40px 20px; color: #888;">
                <div style="font-size: 3rem; margin-bottom: 10px;">📅</div>
                <p style="margin:0; font-size: 1.1rem; font-weight: 500;">No hay lotes agendados para este día.</p>
                <p style="margin: 5px 0 0 0; font-size: 0.9rem; opacity:0.8;">Usa los botones de arriba para agendar o agregar una nota.</p>
            </div>
        `;
    } else {
        // Group events by sector (normalized to uppercase)
        const groups = {};
        dayEvents.forEach(ev => {
            const groupName = (ev.grupo || 'STOCK').toUpperCase().trim();
            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(ev);
        });

        // Alphabetical sorting of groups
        const sortedGroupNames = Object.keys(groups).sort();

        // Start Grid
        htmlContent += `<div class="day-groups-grid">`;

        // Color palette & mapping for UI styling consistency
        const palette = ['#3498db', '#e67e22', '#27ae60', '#9b59b6', '#f1c40f', '#e74c3c', '#1abc9c', '#34495e'];
        let colorMap = {};
        const defaultColor = '#95a5a6';
        let availableGroups = dataGrupos && dataGrupos.length > 0 ? dataGrupos.map(g => (g["GRMA_DESCRIPCION"] || g["Name"] || "").toUpperCase()).filter(n => n) : ['CARRO', 'BAGUETERO', 'BANDEJA', 'MOLDE'];
        availableGroups.forEach((gName, idx) => {
            colorMap[gName] = palette[idx % palette.length];
        });

        sortedGroupNames.forEach(groupName => {
            const groupEvents = groups[groupName];
            // Get color based on group name
            const groupColor = colorMap[groupName] || colorMap[groupName.split(' ')[0]] || defaultColor;
            const totalQty = groupEvents.reduce((sum, ev) => sum + (Number(ev.qty) || 1), 0);

            htmlContent += `
                <div class="day-group-column">
                    <div class="day-group-header">
                        <h5 class="day-group-title" style="border-left: 4px solid ${groupColor}; padding-left: 8px;">${groupName}</h5>
                        <span class="day-group-count" style="background: ${groupColor}; font-size: 0.72rem; padding: 2px 10px; border-radius: 12px;">${groupEvents.length} ${groupEvents.length === 1 ? 'Lote' : 'Lotes'} (${totalQty} u.)</span>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 12px;">
            `;

            groupEvents.forEach(ev => {
                const { artName, clientName, orderDate } = getEventEnrichedData(ev);
                const parsed = parseProductName(artName);
                let timeLabel = ev.time ? `⏰ ${ev.time} Hs` : `📦 Sin horario`;
                
                let doneStyle = "";
                let doneBadge = "";
                let titleColor = "#0f172a";
                let titleDecoration = "none";
                let titleWeight = "600";
                
                if (ev.status === 'done') {
                    doneStyle = "background: #fffaf0 !important; border: 1.5px solid #e67e22 !important; opacity: 0.65;";
                    doneBadge = `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:#d97706 !important; background:#fef3c7 !important; border: 1px solid #fde68a !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; display:inline-block; line-height: 1 !important; margin-left: auto;">⏳ Pendiente Calidad</span>`;
                    titleColor = "#64748b";
                    titleDecoration = "line-through";
                } else if (ev.status === 'approved') {
                    doneStyle = "background: #f0fdf4 !important; border: 1.5px solid #10b981 !important; opacity: 1.0;";
                    doneBadge = `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:#15803d !important; background:#dcfce7 !important; border: 1px solid #bbf7d0 !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; display:inline-block; line-height: 1 !important; margin-left: auto;">✅ Aprobado Calidad</span>`;
                    titleColor = "#000000";
                    titleDecoration = "line-through";
                    titleWeight = "700";
                } else if (ev.status === 'rejected') {
                    doneStyle = "background: #fef2f2 !important; border: 1.5px solid #ef4444 !important; opacity: 1.0;";
                    doneBadge = `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:#b91c1c !important; background:#fee2e2 !important; border: 1px solid #fca5a5 !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; display:inline-block; line-height: 1 !important; margin-left: auto;">❌ Rechazado Calidad</span>`;
                    titleColor = "#b91c1c";
                    titleDecoration = "none";
                    titleWeight = "700";
                } else {
                    doneStyle = "background: #fff; border: 1px solid #e0e0e0;";
                }

                let historyHtml = "";
                if (ev.rescheduleHistory && ev.rescheduleHistory.length > 0) {
                    historyHtml = `<div style="margin-top: 6px; font-size: 0.8rem; color: #c0392b; background: #fff5f5; border: 1px solid #fadbd8; padding: 6px; border-radius: 4px; line-height: 1.25;">`;
                    historyHtml += `<strong style="display:flex; align-items:center; gap:3px;">🔄 Historial de Reprogramación:</strong>`;
                    ev.rescheduleHistory.forEach(h => {
                        let c = h.comment ? ` ("${h.comment}")` : "";
                        historyHtml += `<div style="margin-top: 3px; font-size: 0.75rem; color:#555;">• <strong>${h.date}</strong>: movido de ${formatDate(h.fromDate)} a ${formatDate(h.toDate)} por <em>${h.reason}</em>${c}</div>`;
                    });
                    historyHtml += `</div>`;
                }

                htmlContent += `
                    <div class="day-detail-card" style="${doneStyle} border-left: 4px solid ${ev.status === 'done' ? '#e67e22' : (ev.status === 'approved' ? '#10b981' : (ev.status === 'rejected' ? '#ef4444' : groupColor))} !important; border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); font-family:'Inter', sans-serif !important;">
                        <div style="display:flex; align-items:center; flex-wrap: wrap; gap: 8px; justify-content: space-between; width: 100%;">
                            <div style="display:flex; align-items:center; gap:4px 6px; flex-wrap: wrap;">
                                <span style="font-weight: 600; color: #475569; font-size: 0.75rem; background: #f1f5f9; border: 1px solid #e2e8f0; padding: 2px 6px; border-radius: 4px; white-space: nowrap;">${timeLabel}</span>
                                ${parsed.badge ? `<span style="font-family:'Inter', sans-serif !important; font-size:0.65rem !important; font-weight:700 !important; color:${groupColor} !important; background:${groupColor}12 !important; border: 1px solid ${groupColor}25 !important; padding:2px 6px !important; border-radius:4px !important; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap; display:inline-block; line-height: 1 !important;">${parsed.badge}</span>` : ''}
                            </div>
                            ${doneBadge}
                        </div>
                        <div style="font-family:'Inter', sans-serif !important; font-weight: ${titleWeight}; font-size: 1rem; color: ${titleColor}; text-decoration: ${titleDecoration}; line-height: 1.35; word-break: break-word;">
                            ${parsed.name}
                        </div>
                        <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 6px; font-size: 0.8rem; color: #475569; background: #f8fafc; border: 1px solid #f1f5f9; padding: 8px; border-radius: 6px;">
                            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>SKU:</strong> <span style="color:#2563eb; font-weight:600;">${ev.sku}</span></div>
                            <div><strong>Cant:</strong> <span style="font-weight:700; color:#0f172a;">${ev.qty || 1} u.</span></div>
                            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><strong>Pedido:</strong> #${ev.pedidoId || 'N/A'}</div>
                            <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size: 0.8rem; color: #64748b;" title="${clientName}">
                                <strong>Cliente:</strong> <span style="font-size:0.85rem !important; line-height: 1 !important; display:inline-block;">👤</span> ${clientName}
                            </div>
                        </div>
                        ${ev.text ? `<div style="font-family:'Inter', sans-serif !important; font-size:0.8rem !important; background: #fffde7; border: 1px dashed #fdd835; padding: 6px 8px; border-radius: 4px; font-style: italic; color: #555;">📝 ${ev.text}</div>` : ''}
                        ${historyHtml}
                        
                        <div style="display: flex; gap: 6px; justify-content: flex-end; margin-top: 4px; border-top: 1px solid #f0f0f0; padding-top: 8px; flex-wrap: wrap;">
                            <button class="btn-action-done" onclick="fabricarFromCalendar(${ev.id});" style="padding: 4px 8px; font-size: 0.8rem; background: #27ae60; color:white; border:none; border-radius:4px; cursor:pointer;">🔨 Fabricar</button>
                            <button class="btn-action-resched" onclick="reprogramEvent('${ev.id}');" style="padding: 4px 8px; font-size: 0.8rem; background: #2980b9; color:white; border:none; border-radius:4px; cursor:pointer;">🗓️</button>
                            <button class="btn-action-resched" onclick="asociarPedidoALote(${ev.id});" style="padding: 4px 8px; font-size: 0.8rem; background: #8e44ad; color:white; border:none; border-radius:4px; cursor:pointer;">🔗</button>
                            <button class="btn-action-delete" onclick="deleteEvent(${ev.id});" style="padding: 4px 8px; font-size: 0.8rem; background: #c0392b; color:white; border:none; border-radius:4px; cursor:pointer;">🗑️</button>
                        </div>
                `;
            });

            htmlContent += `
                    </div>
                </div>
            `;
        });

        htmlContent += `</div>`; // Close grid
    }
    
    htmlContent += `</div>`; // Close day-detail-container

    showModal({
        title: `📅 Detalle del Día - ${friendlyDate}`,
        content: htmlContent,
        actions: [{ text: 'Cerrar', class: 'btn-secondary', onClick: () => {}, close: true }],
        size: 'wide'
    });
}

function initiateManualAddFromDate(dateStr) {
    document.getElementById('manual-date-target').value = dateStr;
    document.getElementById('manual-time-target').value = "";
    document.getElementById('manual-group-input').value = "";
    document.getElementById('manual-obs').value = "";
    document.getElementById('manual-qty').value = 1;

    const selectSku = document.getElementById('manual-sku');
    if (selectSku) {
        selectSku.innerHTML = '<option value="">-- Primero seleccione Grupo --</option>';
        selectSku.disabled = true;
    }

    // Populate group-list datalist
    const dl = document.getElementById('group-list');
    if (dl) {
        let optionsHtml = "";
        const groups = dataGrupos && dataGrupos.length > 0 
            ? dataGrupos.map(g => g.GRMA_DESCRIPCION || g.Name || "") 
            : ['CARRO', 'BAGUETERO', 'BANDEJA', 'MOLDE'];
        
        // Remove duplicates & filter out falsy values
        const uniqueGroups = [...new Set(groups.map(g => (g || "").toUpperCase().trim()))].filter(Boolean);
        uniqueGroups.sort().forEach(g => {
            optionsHtml += `<option value="${g}">`;
        });
        dl.innerHTML = optionsHtml;
    }

    document.getElementById('manualAddModal').classList.add('open');
}

function manualGroupChanged() {
    const groupInputVal = document.getElementById('manual-group-input').value.toUpperCase().trim();
    const selectSku = document.getElementById('manual-sku');
    if (!selectSku) return;

    selectSku.innerHTML = '<option value="">-- Seleccione un artículo --</option>';
    selectSku.disabled = true;

    if (!groupInputVal) return;

    // Filter articles belonging to this group
    const filtered = dataArticulos.filter(art => {
        const artGroup = (art["GRMA_DESCRIPCION"] || art["GRUPO_FAMILIA"] || "").toUpperCase().trim();
        return artGroup === groupInputVal || artGroup.includes(groupInputVal);
    });

    if (filtered.length === 0) {
        selectSku.innerHTML = '<option value="">-- No se encontraron artículos en este grupo --</option>';
        return;
    }

    let optionsHtml = '<option value="">-- Seleccione un artículo --</option>';
    filtered.forEach(art => {
        const sku = (art["MATE_CODIGO"] || "").trim();
        const desc = (art["MATE_DESCRIPCION"] || "").trim();
        optionsHtml += `<option value="${sku}">${sku} - ${desc}</option>`;
    });
    selectSku.innerHTML = optionsHtml;
    selectSku.disabled = false;
}

async function confirmManualAdd() {
    const dateVal = document.getElementById('manual-date-target').value;
    const timeVal = document.getElementById('manual-time-target').value || "";
    const groupVal = document.getElementById('manual-group-input').value.toUpperCase().trim();
    const skuVal = document.getElementById('manual-sku').value;
    const qtyVal = Number(document.getElementById('manual-qty').value) || 1;
    const obsVal = document.getElementById('manual-obs').value || "";

    if (!skuVal || !dateVal) {
        appAlert("⚠️ Debe seleccionar un grupo y un artículo.");
        return;
    }

    // Find article name
    const art = dataArticulos.find(a => String(a.MATE_CODIGO).trim() === String(skuVal).trim());
    const artName = art ? (art.MATE_DESCRIPCION || "Artículo Manual") : "Artículo Manual";

    const newEvent = {
        id: Date.now(),
        sku: skuVal,
        name: artName,
        qty: qtyVal,
        date: dateVal,
        time: timeVal,
        pedidoId: "STOCK",
        grupo: groupVal,
        text: obsVal
    };

    calendarEvents.push(newEvent);
    saveCalendar();
    
    // Sync to cloud
    if (typeof cloudSaveEvent === 'function') {
        await cloudSaveEvent(newEvent);
    }
    
    logActivity('Agendado Manual', `${skuVal} (${qtyVal} u.) agendado manualmente para el ${formatDate(dateVal)}`, 'info', null, newEvent.id);

    renderCalendar();
    closeManualAdd();
}

function closeManualAdd() {
    document.getElementById('manualAddModal').classList.remove('open');
}

function filterHistoryRows() {
    const term = document.getElementById('history-search-input').value.toLowerCase().trim();
    const rows = document.querySelectorAll('.history-row');
    rows.forEach(row => {
        const text = row.innerText.toLowerCase();
        if (text.includes(term)) {
            row.style.display = '';
        } else {
            row.style.display = 'none';
        }
    });
}

function exportHistoryToCSV() {
    let logs = JSON.parse(localStorage.getItem('tmc_activity_logs') || '[]');
    const filteredLogs = logs;

    let csvContent = "\uFEFF"; // UTF-8 BOM for Excel compatibility
    csvContent += "Fecha;Hora;Acción;Pedido;Cliente;Detalles\n";

    filteredLogs.forEach(log => {
        let clientName = log.cliente || "";
        if (!clientName && log.pedidoId && log.pedidoId !== 'STOCK' && typeof dataPedidos !== 'undefined') {
            const p = dataPedidos.find(x => String(x.NUMERO) === String(log.pedidoId));
            if (p) clientName = p.CLIENTE || "";
        }
        
        const date = log.date || "";
        const time = log.time || "";
        const action = log.action || "";
        const pedido = log.pedidoId || "Stock";
        const details = (log.details || "").replace(/;/g, ",").replace(/\r?\n|\r/g, " "); // Clean semicolons and newlines

        csvContent += `"${date}";"${time}";"${action}";"${pedido}";"${clientName}";"${details}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Historial_Actividad_TMC_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function openActivityHistoryModal() {
    let htmlContent = `
        <div id="activity-history-modal-wrapper">
            <div class="activity-history-container activity-history-scroll-container" style="max-height: 480px; overflow-y: auto; font-family: sans-serif;">
                <div style="margin-bottom: 15px; display: flex; gap: 10px; align-items: center; justify-content: space-between; flex-wrap: wrap;">
                    <div style="position: relative; flex-grow: 1; min-width: 250px;">
                        <span style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: #64748b;">🔍</span>
                        <input type="text" id="history-search-input" onkeyup="filterHistoryRows()" placeholder="Buscar por SKU, pedido, cliente, acción o detalle..." style="width: 100%; padding: 8px 8px 8px 32px; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 0.88rem; box-sizing: border-box; outline: none; font-family: sans-serif;">
                    </div>
                    <button onclick="exportHistoryToCSV()" style="background: #217346; color: white; border: none; padding: 8px 16px; border-radius: 6px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 6px; font-size: 0.88rem; white-space: nowrap; font-family: sans-serif; transition: background 0.2s;" onmouseover="this.style.background='#1e663e'" onmouseout="this.style.background='#217346'">
                        📊 Exportar Excel
                    </button>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 0.9rem; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 2px solid #ddd; color: #555; background: #fafafa;">
                            <th style="padding: 10px;">Fecha/Hora</th>
                            <th style="padding: 10px;">Acción</th>
                            <th style="padding: 10px;">Detalles</th>
                        </tr>
                    </thead>
                    <tbody>
                        <!-- Rows injected dynamically -->
                    </tbody>
                </table>
            </div>
        </div>
    `;

    showModal({
        title: '📜 Historial de Actividad Reciente',
        content: htmlContent,
        actions: [{ text: 'Cerrar', class: 'btn-secondary', onClick: () => {}, close: true }],
        size: 'wide'
    });

    // Populate rows initially
    refreshActivityHistoryModalContent();
}

function refreshActivityHistoryModalContent() {
    const wrapper = document.getElementById('activity-history-modal-wrapper');
    if (!wrapper) return;

    // Save search term & scroll position
    const searchInput = document.getElementById('history-search-input');
    const term = searchInput ? searchInput.value : '';
    const scrollContainer = wrapper.querySelector('.activity-history-scroll-container');
    const scrollTop = scrollContainer ? scrollContainer.scrollTop : 0;

    let logs = JSON.parse(localStorage.getItem('tmc_activity_logs') || '[]');
    let rowsHtml = '';

    if (logs.length === 0) {
        rowsHtml = `
            <tr class="history-row">
                <td colspan="3" style="text-align: center; padding: 30px; color: #888; font-style: italic;">
                    No hay registros de actividad aún.
                </td>
            </tr>
        `;
    } else {
        logs.forEach(log => {
            let badgeColor = '#555';
            let badgeBg = '#f1f3f4';
            if (log.type === 'success') {
                badgeColor = '#27ae60';
                badgeBg = '#e8f5e9';
            } else if (log.type === 'danger') {
                badgeColor = '#c0392b';
                badgeBg = '#fce8e6';
            } else if (log.type === 'warning') {
                badgeColor = '#d35400';
                badgeBg = '#fff3e0';
            } else if (log.type === 'info') {
                badgeColor = '#2980b9';
                badgeBg = '#e8f0fe';
            }

            // Find matching event for click-to-navigate feature
            let targetEvent = null;
            if (log.eventId) {
                targetEvent = calendarEvents.find(e => String(e.id) === String(log.eventId));
            }
            if (!targetEvent) {
                // Fallback: match by SKU, target date, and/or pedidoId from log details
                const words = log.details.trim().split(/\s+/);
                if (words.length > 0) {
                    const sku = words[0].replace(/[(),.-]/g, '').trim().toUpperCase();

                    // Try to extract dates (format D/M/YYYY or DD/MM/YYYY) from details
                    const dateMatches = log.details.match(/\b\d{1,2}\/\d{1,2}\/\d{4}\b/g);
                    let targetDateStr = null;
                    if (dateMatches && dateMatches.length > 0) {
                        const dateStr = (log.action.includes('Reprogram') && dateMatches.length > 1) ? dateMatches[1] : dateMatches[0];
                        const [d, m, y] = dateStr.split('/').map(Number);
                        targetDateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                    }

                    if (log.pedidoId) {
                        if (targetDateStr) {
                            targetEvent = calendarEvents.find(e => String(e.pedidoId) === String(log.pedidoId) && e.sku.toUpperCase() === sku && e.date === targetDateStr);
                        }
                        if (!targetEvent) {
                            targetEvent = calendarEvents.find(e => String(e.pedidoId) === String(log.pedidoId) && e.sku.toUpperCase() === sku);
                        }
                        if (!targetEvent) {
                            targetEvent = calendarEvents.find(e => String(e.pedidoId) === String(log.pedidoId));
                        }
                    } else {
                        if (targetDateStr) {
                            targetEvent = calendarEvents.find(e => e.sku.toUpperCase() === sku && e.date === targetDateStr);
                        }
                        if (!targetEvent) {
                            targetEvent = calendarEvents.find(e => e.sku.toUpperCase() === sku);
                        }
                    }
                }
            }

            // Enrich client name
            let enrichedClient = log.cliente || "";
            if (!enrichedClient && log.pedidoId && log.pedidoId !== 'STOCK' && typeof dataPedidos !== 'undefined') {
                const p = dataPedidos.find(x => String(x.NUMERO) === String(log.pedidoId));
                if (p) {
                    enrichedClient = p.CLIENTE || "";
                }
            }

            let trStyle = "border-bottom: 1px solid #eee; transition: background 0.2s;";
            let trProps = "";
            let actionText = log.action;
            let detailsHtml = log.details;

            if (targetEvent) {
                trStyle += " cursor: pointer;";
                trProps = ` onclick="goToCalendarDate('${targetEvent.date}', '${targetEvent.id}'); closeModal();" title="Hacer clic para ir a la tarjeta en el calendario" onmouseover="this.style.background='#eff6ff'" onmouseout="this.style.background='transparent'"`;
                actionText = `📍 ${log.action}`;
            } else {
                // If it is a calendar action but the event is not found, it means it was deleted
                const isCalendarAction = ['Reprogramación', 'Ajuste Hora', 'Agendado', 'Agendado Manual', 'Fabricación', 'Terminado Parcial'].includes(log.action);
                if (isCalendarAction) {
                    trStyle += " opacity: 0.65;";
                    trProps = ` title="Esta tarjeta fue eliminada del calendario, por lo que este registro es histórico e inactivo."`;
                    detailsHtml += ` <span style="font-family:'Inter', sans-serif !important; font-size:0.68rem !important; color:#64748b !important; background:#f1f5f9 !important; border: 1px dashed #cbd5e1 !important; padding:2px 6px !important; border-radius:4px !important; display:inline-block; margin-left:8px; white-space:nowrap; vertical-align:middle; font-weight:600 !important; text-transform:uppercase; letter-spacing:0.3px;">🗑️ Tarjeta Eliminada</span>`;
                }
            }

            // Append enriched client and pedido details block
            let metaHtml = "";
            if (log.pedidoId || enrichedClient) {
                const pedText = log.pedidoId ? `#${log.pedidoId}` : "Stock";
                const cliText = enrichedClient ? ` • 👤 ${enrichedClient}` : "";
                metaHtml = `<div style="font-size: 0.76rem; color: #64748b; margin-top: 5px; font-weight: 500;">📦 Pedido: ${pedText}${cliText}</div>`;
            }

            rowsHtml += `
                <tr class="history-row" style="${trStyle}" ${trProps}>
                    <td style="padding: 10px; color: #666; white-space: nowrap; font-size: 0.82rem;">
                        ${log.date} ${log.time}
                    </td>
                    <td style="padding: 10px; white-space: nowrap;">
                        <span style="background: ${badgeBg}; color: ${badgeColor}; padding: 3px 8px; border-radius: 4px; font-weight: bold; font-size: 0.8rem;">
                            ${actionText}
                        </span>
                    </td>
                    <td style="padding: 10px; color: #333; line-height: 1.4;">
                        <div style="font-weight: 500;">${detailsHtml}</div>
                        ${metaHtml}
                    </td>
                </tr>
            `;
        });
    }

    const tbody = wrapper.querySelector('tbody');
    if (tbody) {
        tbody.innerHTML = rowsHtml;
    }

    // Restore search input and apply filter
    if (searchInput && term) {
        searchInput.value = term;
        filterHistoryRows();
    }

    // Restore scroll position
    const newScrollContainer = wrapper.querySelector('.activity-history-scroll-container');
    if (newScrollContainer && scrollTop > 0) {
        newScrollContainer.scrollTop = scrollTop;
    }
}

// --- VALIDACIÓN DE FECHA DE ENTREGA PACTADA ---
function checkDeliveryDateWarning(pedidoId, targetDate) {
    if (!pedidoId || pedidoId === 'STOCK' || pedidoId === 'CALENDARIO') return null;
    if (typeof dataPedidos === 'undefined' || !dataPedidos) return null;
    const p = dataPedidos.find(x => String(x.NUMERO) === String(pedidoId));
    if (!p || !p.PEDI_FECHA_DE_ENTREGA) return null;
    
    // Extraer solo la porción de fecha YYYY-MM-DD
    const deliveryDateStr = p.PEDI_FECHA_DE_ENTREGA.split('T')[0];
    if (targetDate >= deliveryDateStr) {
        return {
            deliveryDate: deliveryDateStr,
            formattedDeliveryDate: formatDate(deliveryDateStr),
            client: p.CLIENTE || ""
        };
    }
    return null;
}

function confirmCommercialAlert(pedidoId, targetDate, deliveryDate) {
    return new Promise(resolve => {
        showModal({
            title: '⚠️ Alerta de Compromiso de Entrega',
            content: `
                <div style="text-align: center; padding: 10px; font-family: 'Inter', sans-serif;">
                    <div style="font-size: 3em; margin-bottom: 10px;">⚠️</div>
                    <div style="font-size: 1.1em; color: #d35400; font-weight: bold; margin-bottom: 10px;">
                        No se cumplirá con la fecha de entrega pactada
                    </div>
                    <p style="color: #333; font-size: 0.95rem; line-height: 1.5; margin-bottom: 15px;">
                        La fecha de entrega pactada con el cliente es el <strong>${formatDate(deliveryDate)}</strong>.<br>
                        Se está intentando programar para el <strong>${formatDate(targetDate)}</strong>.
                    </p>
                    <p style="color: #666; font-size: 0.85rem; font-style: italic; background: #fff3e0; padding: 8px; border-radius: 4px; border-left: 4px solid #e67e22; text-align: left;">
                        Si decide continuar, se registrará una <strong>Alerta Comercial</strong> en el sistema para que se notifique al área comercial de inmediato.
                    </p>
                </div>
            `,
            actions: [
                { text: 'Cancelar', class: 'btn-secondary', onClick: () => resolve(false) },
                { text: 'Continuar de todos modos', class: 'btn-danger', style: 'background: #d35400;', onClick: () => resolve(true), close: true }
            ]
        });
    });
}

