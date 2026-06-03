
/**
 * REMITO INTERNO - CORE LOGIC
 * Standalone App for managing Factory -> Revestimientos Transfers
 */

const DEFAULT_CONFIG = {
    entityId: 794,      // Stock View
    smartieId: 2749,    // Stock Factory Smartie (Actualizado)
    smartieRevestimientos: 2750, // Stock Jaulas Cerradas Smartie (Actualizado)
    smartieRemitosActivos: 2737, // Active Remitos Smartie (Entity 781) (Actualizado)
    entityRemito: 781,  // Remito Interno Entity
    childRemitoId: 227, // Remito Interno Items Child ID
    depoFabricaId: 156,
    depoMustangId: 191,        // Mustang (Intermediate)
    depoRevestimientosId: 189,
    depoPlayaLozametalId: 190,  // Lozametal PL
    depoLozametalId: 157,      // Lozametal Final
    depoRevestimientosRealizadosId: 192, // Revestimientos Lozametal (192)
    smartieLogistica: 2753,    // Processed Cages Smartie (Incluye ENVIADO para validación Paso 1) (Actualizado)
    smartieDespachos: 2755,    // Dispatched Mustang -> PL (Jaulas Enviadas + Pendientes) (Actualizado)
    smartiePendientesLozametal: 2755, // Dispatched Fabrica -> Mustang (Pendientes Lozametal) (Actualizado)
    smartieRecepcionPlaya: 2716, // 190 -> 157 (In PL / Revision) - Jaulas a Revisar
    smartieTrazabilidad: 2758,   // [NUEVO] Historial Universal de Remitos (Para Board)
    smartieStockLozametal: 2738, // Stock final en depósito Lozametal (Actualizado)
    smartieMovimientosStock: 2748, // [NUEVO] Entidad 796 - Movimientos de Stock Playa
    smartieCalidadJaulas: 2764,    // [NUEVO] Smartie para Ingreso de Jaulas
    fieldCalidadFoto: 8296,       // [NUEVO] ID del campo de foto en YiQi
    schemaId: 1491,
    user: "mercadolibre@tmcrespo.com.ar",
    pass: "AdministracionMessi",
    tokenUrls: [
        "https://api.yiqi.com.ar/token",
        "https://api.yiqi.com.ar/connect/token",
        "https://me.yiqi.com.ar/connect/token"
    ],
    saveUrls: [
        "https://api.yiqi.com.ar/api/instancesApi/Save"
    ],
    getListUrl: "https://api.yiqi.com.ar/api/instancesApi/GetList",
    getChildListUrl: "https://me.yiqi.com.ar/api/childrenApi/GetChildList",
    searchChildUrl: "https://me.yiqi.com.ar/api/childrenApi/GetSearchResult",
    saveChildUrl: "https://api.yiqi.com.ar/api/childrenApi/SaveChildInstances",
    entityArticulos: 782,
    smartieArticulos: 2744,
    entityAlta: 1389,
    smartieAltas: 2705,
    smartieAltasPendientes: 2745,
    entityGrupos: 763,
    smartieGrupos: 2594,
    executeTransitionUrl: "https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition",
    deleteUrl: "https://api.yiqi.com.ar/api/instancesApi/Delete",
    entityRemitoItem: 783,
    smartieNroRemitoExterno: 2767, // [NUEVO] SMARTIE DE NUMERACIONES EXTERNAS (ENTITY 781)
    valorDeclarado: 1000,
    slaThresholdDays: 15,
    smartieRecetas: 0 // Reservado para futuro uso online
};
const DEFAULT_RECETAS = [
    // LATAS ENLOZADAS DD 20
    { term: "LE40302", lf: "L40302", elz: "ELZ-L40302", costo: 100 },
    { term: "LE44322", lf: "L44322", elz: "ELZ-L44322", costo: 100 },
    { term: "LE45352", lf: "L45352", elz: "ELZ-L45352", costo: 100 },
    { term: "LE60402", lf: "L60402", elz: "ELZ-L60402", costo: 100 },
    { term: "LE70452", lf: "L70452", elz: "ELZ-L70452", costo: 100 },
    { term: "LE60402P", lf: "L60402P", elz: "ELZ-L60402P", costo: 100 },
    { term: "LE70452P", lf: "L70452P", elz: "ELZ-L70452P", costo: 100 },
    { term: "LE70303", lf: "L70303", elz: "ELZ-L70303", costo: 100 },
    { term: "LE70353", lf: "L70353", elz: "ELZ-L70353", costo: 100 },
    { term: "LE60405", lf: "L60405", elz: "ELZ-L60405", costo: 100 },
    { term: "LE70455", lf: "L70455", elz: "ELZ-L70455", costo: 100 },
    { term: "LE80505", lf: "L80505", elz: "ELZ-L80505", costo: 100 },
    // LIVIANAS
    { term: "LLE60402P", lf: "LL60402P", elz: "ELZ-LL60402P", costo: 100 },
    { term: "LLE70452P", lf: "LL70452P", elz: "ELZ-LL70452P", costo: 100 },
    // APILABLES / PESADAS
    { term: "LEA6040", lf: "LA6040", elz: "ELZ-LA6040", costo: 100 },
    { term: "LEA7045", lf: "LA7045", elz: "ELZ-LA7045", costo: 100 },
    { term: "LEP60402", lf: "LP60402", elz: "ELZ-LP60402", costo: 100 },
    { term: "LEP70452", lf: "LP70452", elz: "ELZ-LP70452", costo: 100 },
    { term: "LEP60405", lf: "LP60405", elz: "ELZ-LP60405", costo: 100 },
    { term: "LEP70455", lf: "LP70455", elz: "ELZ-LP70455", costo: 100 },
    { term: "LEP80505", lf: "LP80505", elz: "ELZ-LP80505", costo: 100 },
    // HORNOS CINTA
    { term: "LE40147", lf: "L40147", elz: "ELZ-L40147", costo: 100 },
    { term: "LE45147", lf: "L45147", elz: "ELZ-L45147", costo: 100 },
    { term: "LE60147", lf: "L60147", elz: "ELZ-L60147", costo: 100 },
    { term: "LE70147", lf: "L70147", elz: "ELZ-L70147", costo: 100 },
    { term: "LE80147", lf: "L80147", elz: "ELZ-L80147", costo: 100 },
    { term: "LE90147", lf: "L90147", elz: "ELZ-L90147", costo: 100 },
    // ASADERAS SALPICADAS
    { term: "ASA3020", lf: "L-ASA3020", elz: "ELZ-L-ASA3020", costo: 100 },
    { term: "ASA3525", lf: "L-ASA3525", elz: "ELZ-L-ASA3525", costo: 100 },
    { term: "ASA3535", lf: "L-ASA3535", elz: "ELZ-L-ASA3535", costo: 100 },
    { term: "ASA4030", lf: "L-ASA4030", elz: "ELZ-L-ASA4030", costo: 100 },
    { term: "ASA4535", lf: "L-ASA4535", elz: "ELZ-L-ASA4535", costo: 100 },
    { term: "ASA5040", lf: "L-ASA5040", elz: "ELZ-L-ASA5040", costo: 100 },
    { term: "ASA6040", lf: "L-ASA6040", elz: "ELZ-L-ASA6040", costo: 100 },
    { term: "ASA8040", lf: "L-ASA8040", elz: "ELZ-L-ASA8040", costo: 100 },
    { term: "ASA7045", lf: "L-ASA7045", elz: "ELZ-L-ASA7045", costo: 100 },
    // PIZZERAS PESADAS
    { term: "PEP10", lf: "L-PEP10", elz: "ELZ-L-PEP10", costo: 100 },
    { term: "PEP12", lf: "L-PEP12", elz: "ELZ-L-PEP12", costo: 100 },
    { term: "PEP14", lf: "L-PEP14", elz: "ELZ-L-PEP14", costo: 100 },
    { term: "PEP16", lf: "L-PEP16", elz: "ELZ-L-PEP16", costo: 100 },
    { term: "PEP18", lf: "L-PEP18", elz: "ELZ-L-PEP18", costo: 100 },
    { term: "PEP20", lf: "L-PEP20", elz: "ELZ-L-PEP20", costo: 100 },
    { term: "PEP22", lf: "L-PEP22", elz: "ELZ-L-PEP22", costo: 100 },
    { term: "PEP24", lf: "L-PEP24", elz: "ELZ-L-PEP24", costo: 100 },
    { term: "PEP26", lf: "L-PEP26", elz: "ELZ-L-PEP26", costo: 100 },
    { term: "PEP28", lf: "L-PEP28", elz: "ELZ-L-PEP28", costo: 100 },
    { term: "PEP30", lf: "L-PEP30", elz: "ELZ-L-PEP30", costo: 100 },
    { term: "PEP32", lf: "L-PEP32", elz: "ELZ-L-PEP32", costo: 100 },
    { term: "PEP34", lf: "L-PEP34", elz: "ELZ-L-PEP34", costo: 100 },
    { term: "PEP36", lf: "L-PEP36", elz: "ELZ-L-PEP36", costo: 100 },
    { term: "PEP36A", lf: "L-PEP36A", elz: "ELZ-L-PEP36A", costo: 100 },
    { term: "PEP45", lf: "L-PEP45", elz: "ELZ-L-PEP45", costo: 100 },
    { term: "PEP53", lf: "L-PEP53", elz: "ELZ-L-PEP53", costo: 100 },
    // PANCHERAS / GRISINERAS
    { term: "PE80243", lf: "L-PE80243", elz: "ELZ-L-PE80243", costo: 100 },
    { term: "PE60244", lf: "L-PE60244", elz: "ELZ-L-PE60244", costo: 100 },
    { term: "GE602412", lf: "L-GE602412", elz: "ELZ-L-GE602412", costo: 100 },
    { term: "GE60245", lf: "L-GE60245", elz: "ELZ-L-GE60245", costo: 100 },
    // HAMBURGUESERAS
    { term: "HE40308", lf: "L-HE40308", elz: "ELZ-L-HE40308", costo: 100 },
    { term: "HE443211", lf: "L-HE443211", elz: "ELZ-L-HE443211", costo: 100 },
    { term: "HE704524", lf: "L-HE704524", elz: "ELZ-L-HE704524", costo: 100 },
    // MUFFINS
    { term: "ME403212", lf: "L-ME403212", elz: "ELZ-L-ME403212", costo: 100 },
    { term: "ME604024", lf: "L-ME604024", elz: "ELZ-L-ME604024", costo: 100 },
    { term: "ME704535", lf: "L-ME704535", elz: "ELZ-L-ME704535", costo: 100 }
];

let YIQI_CONFIG = { ...DEFAULT_CONFIG };

// --- GLOBAL STATE ---
let remitos = [];
let activeRemito = null;
let activeRemitoItems = [];
let yiqiToken = null;

// LOGISTICS STATE
let processedCages = [];
let selectedCages = [];
let despachos = [];
let activeDespacho = null;
let articlesMap = {}; // SKU -> ID Lookup
let articlesIdMap = {}; // ID -> SKU Lookup
let articlesDataMap = {}; // SKU -> Full Object Lookup (para nombres y extras)

// LOZAMETAL STATE
let pendientesLozametal = [];
let selectedPendientes = [];
let jaulasEnPlaya = [];
let activeControlJaula = null;
let activeRecepcion = null;
let enlozadasGroupId = null;
let enlozadasArticles = [];
let recentAltas = [];
let pendientesAltas = [];
let lastStockData = [];
let lastStockLozametal = [];
let recetasEnlozado = []; // [NUEVO] Maestro de recetas
let calidadBasket = [];   // [NUEVO] Canasta de ingreso
let calidadPhoto = null;  // [NUEVO] Foto adjunta (base64)
let trackingCache = []; // [NUEVO] Cache universal para impresiones desde el Board

// --- SETTINGS MANAGEMENT ---
const Settings = {
    save(config) {
        localStorage.setItem('REMITO_CONFIG', JSON.stringify(config));
        YIQI_CONFIG = { ...DEFAULT_CONFIG, ...config };
        showModal("Configuración Guardada", "Los IDs de Smartie han sido actualizados. La aplicación se recargará para aplicar los cambios.", "success").then(() => {
            window.location.reload();
        });
    },
    load() {
        const saved = localStorage.getItem('REMITO_CONFIG');
        if (saved) {
            try {
                let config = JSON.parse(saved);
                
                // MIGRACIÓN AUTOMÁTICA: Si el usuario tiene los IDs viejos guardados, los forzamos a los nuevos solicitados
                let changed = false;
                if (config.smartieLogistica === 2722 || config.smartieLogistica === 2735) { config.smartieLogistica = 2753; changed = true; }
                if (config.smartieRevestimientos === 2693 || config.smartieRevestimientos === 2736) { config.smartieRevestimientos = 2750; changed = true; }
                if (config.smartieRemitosActivos === 2690) { config.smartieRemitosActivos = 2737; changed = true; }
                if (config.smartieStockLozametal === 2717) { config.smartieStockLozametal = 2738; changed = true; }
                if (config.smartieDespachos === 2724 || config.smartieDespachos === 2734) { config.smartieDespachos = 2755; changed = true; }
                if (config.smartiePendientesLozametal === 2726) { config.smartiePendientesLozametal = 2755; changed = true; }
                if (config.smartieArticulos === 2670) { config.smartieArticulos = 2744; changed = true; }
                if (config.smartieId === 2694) { config.smartieId = 2749; changed = true; }

                if (changed) {
                    console.log("🛠️ Migración de Smarties detectada. Actualizando localStorage...");
                    localStorage.setItem('REMITO_CONFIG', JSON.stringify(config));
                }

                YIQI_CONFIG = { 
                    ...DEFAULT_CONFIG, 
                    ...config,
                    smartieCalidadJaulas: config.smartieCalidadJaulas || DEFAULT_CONFIG.smartieCalidadJaulas,
                    fieldCalidadFoto: config.fieldCalidadFoto || DEFAULT_CONFIG.fieldCalidadFoto
                };
            } catch (e) {
                console.error("Failed to load settings", e);
            }
        }

        // Cargar Recetas con Migración Incremental
        const savedRecetas = localStorage.getItem('REMITO_RECETAS');
        let userRecetasMap = {};
        if (savedRecetas) {
            try { 
                const userRecetas = JSON.parse(savedRecetas);
                userRecetas.forEach(r => userRecetasMap[r.term] = r);
            } catch(e) { console.error("Error loading user recipes", e); }
        }

        // Generar recetas automáticas basadas en el Maestro
        Settings.syncRecetasWithMaster = () => {
            const excludedGroups = [
                "BAGUETERAS", "BANDEJAS EXHIBIDORAS", "CARROS", 
                "MOBILIARIO DE ELABORACIÓN", "PACK Y COMBOS", 
                "REPOSTERÍA", "SIN GRUPO", "UTENSILIOS"
            ];

            const terminados = Object.values(articlesDataMap).filter(a => {
                const col = String(a.COLE_DESCRIPCION || a.COLE_NOMBRE || a.Coleccion || "").toUpperCase().trim();
                const gName = String(a.MATE_GRUPO_DESC || a.GRMA_DESCRIPCION || a.Grupo || "SIN GRUPO").toUpperCase().trim();
                
                if (col !== "PRODUCTO TERMINADO" && col !== "PRODUCTO TERMINADO2") return false;
                if (excludedGroups.includes(gName)) return false;
                
                return true;
            });

            const saved = JSON.parse(localStorage.getItem('REMITO_RECETAS') || '[]');
            const savedMap = {};
            saved.forEach(s => savedMap[s.term.trim().toUpperCase()] = s);

            const newRecetas = terminados.map(a => {
                const term = (a.MATE_CODIGO || a.CODIGO || "").trim().toUpperCase();
                const existing = savedMap[term];
                
                // Mapeo EXACTO según campos técnicos de YiQi
                const meta = {
                    termName: (a.MATE_NOMBRE || a.NOMBRE || "").trim(), // [NUEVO] Persistir nombre para UI
                    _group: (a.GRMA_DESCRIPCION || "SIN GRUPO").toUpperCase().trim(),
                    _groupId: a.MATE_GRUPO_IDEN || 0,
                    
                    _s1: (a.SUMA_DESCRIPCION || "---").toUpperCase().trim(),
                    _s1Id: a.MATE_PRIMER_GRUPO_IDEN || 0,
                    
                    _s2: (a.SSDA_DESCRIPCION || "---").toUpperCase().trim(),
                    _s2Id: a.MATE_SEGUNDO_GRUPO_IDEN || 0
                };

                if (existing) return { ...existing, ...meta };

                // Lógica de Sugerencia Inteligente de SKUs (Prefijos)
                const rules = [
                    { pre: "PAESC", lf: "PAE", elz: "ELZ-PAE" },
                    { pre: "PSCL",  lf: "PCL", elz: "PELZL" },
                    { pre: "BPEC",  lf: "BP",  elz: "ELZ-BP" },
                    { pre: "PSC",   lf: "PCP", elz: "PELZP" },
                    { pre: "LLE",   lf: "LL",  elz: "ELZ-LL" },
                    { pre: "LEP",   lf: "LP",  elz: "ELZ-LP" },
                    { pre: "PEL",   lf: "PCL", elz: "PELZL" },
                    { pre: "PEP",   lf: "PCP", elz: "PELZP" },
                    { pre: "ASA",   lf: "A",   elz: "ALZ-A" },
                    { pre: "HE",    lf: "H",   elz: "ELZ-H" },
                    { pre: "LE",    lf: "L",   elz: "ELZ-L" }
                ];

                // Determinar sugerencia nueva
                let finalLf = "L" + term;
                let finalElz = "ELZ-L" + term;

                for (const r of rules) {
                    if (term.startsWith(r.pre)) {
                        const rest = term.substring(r.pre.length);
                        finalLf = r.lf + rest;
                        finalElz = r.elz + rest;
                        break;
                    }
                }

                // Si ya existe, preservamos costo pero actualizamos SKU si sigue el patrón viejo
                if (existing) {
                    const isOldDefault = existing.lf.startsWith('L-') || existing.elz.startsWith('ELZ-L-');
                    return {
                        ...existing,
                        ...meta,
                        lf: isOldDefault ? finalLf : existing.lf,
                        elz: isOldDefault ? finalElz : existing.elz
                    };
                }

                return {
                    term: term,
                    lf: finalLf,
                    elz: finalElz,
                    costo: 0,
                    ...meta
                };
            });

            recetasEnlozado = newRecetas.sort((a, b) => a.term.localeCompare(b.term));
        };

        // Primera sincronización (Solo si ya tenemos artículos, sino se hará en initApp)
        if (Object.keys(articlesDataMap).length > 0) {
            Settings.syncRecetasWithMaster();
        }
    },
    reset() {
        localStorage.removeItem('REMITO_CONFIG');
        window.location.reload();
    },
    openPanel() {
        const html = `
            <div class="settings-tabs">
                <button class="settings-tab-btn active" onclick="Settings.switchTab('fab')">🏭 Fábrica</button>
                <button class="settings-tab-btn" onclick="Settings.switchTab('log')">🚚 Logística</button>
                <button class="settings-tab-btn" onclick="Settings.switchTab('loza')">🌋 Lozametal</button>
                <button class="settings-tab-btn" onclick="Settings.switchTab('cal')">🔬 Calidad</button>
                <button class="settings-tab-btn" onclick="Settings.switchTab('rec')">🧪 Recetas</button>
                <button class="settings-tab-btn" onclick="Settings.switchTab('other')">📦 Otros</button>
            </div>

            <div id="settings-content" style="min-height: 320px;">
                <!-- Content will be injected by switchTab -->
            </div>
        `;
        
        const btns = `
            <button class="btn-modal btn-cancel" id="btn-config-close">Cerrar</button>
            <button class="btn-modal btn-cancel" id="btn-config-reset" style="background:#fee2e2; color:#b91c1c;">Restaurar</button>
            <button class="btn-modal btn-confirm" id="btn-config-save">Guardar Cambios</button>
        `;

        Modal.open('⚙️', 'Configuración Avanzada de Origen de Datos', html, btns, true, true, "550px");

        // Definimos la función de cambio de pestaña dentro del scope de la ventana
        Settings.switchTab = function(tabId, event) {
            // Manejar estados visuales de los botones
            const navBtns = document.querySelectorAll('.settings-tab-btn');
            navBtns.forEach(b => b.classList.remove('active'));
            
            if (event && event.target) {
                event.target.classList.add('active');
            } else {
                // Fallback si se llama programáticamente
                const initialBtn = Array.from(navBtns).find(b => b.getAttribute('onclick').includes(`'${tabId}'`));
                if (initialBtn) initialBtn.classList.add('active');
            }

            // Generar el contenido dinámico
            let content = '';
            if (tabId === 'fab') {
                content = `
                    <table class="settings-table">
                        <thead>
                            <tr>
                                <th>COLUMNA APP</th>
                                <th>ENTIDAD YIQI</th>
                                <th>DESCRIPCIÓN</th>
                                <th>SMARTIE ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><b>JAULAS</b></td>
                                <td><span class="settings-badge-ent">Remito Interno (781)</span></td>
                                <td>Visualiza las jaulas activas en proceso de carga.</td>
                                <td><input type="number" id="set-remitos" class="form-control" value="${YIQI_CONFIG.smartieRemitosActivos}"></td>
                            </tr>
                            <tr>
                                <td><b>NUM. EXTERNA</b></td>
                                <td><span class="settings-badge-ent">Remito Interno (781)</span></td>
                                <td>Obtiene el último número de remito externo creado.</td>
                                <td><input type="number" id="set-nro-ext" class="form-control" value="${YIQI_CONFIG.smartieNroRemitoExterno}"></td>
                            </tr>
                            <tr>
                                <td><b>STOCK</b></td>
                                <td><span class="settings-badge-ent">Stock (794)</span></td>
                                <td>Muestra el stock disponible actualmente en Fábrica.</td>
                                <td><input type="number" id="set-stock-fab" class="form-control" value="${YIQI_CONFIG.smartieId}"></td>
                            </tr>
                            <tr>
                                <td><b>JAULAS CERRADAS</b></td>
                                <td><span class="settings-badge-ent">Stock (794)</span></td>
                                <td>Vista de stock filtrada por bultos cerrados.</td>
                                <td><input type="number" id="set-stock-rev" class="form-control" value="${YIQI_CONFIG.smartieRevestimientos}"></td>
                            </tr>
                            <tr>
                                <td><b>REG. RECIENTES</b></td>
                                <td><span class="settings-badge-ent">Alta Producción (1389)</span></td>
                                <td>Historial de las últimas producciones registradas.</td>
                                <td><input type="number" id="set-altas" class="form-control" value="${YIQI_CONFIG.smartieAltas}"></td>
                            </tr>
                        </tbody>
                    </table>
                `;
            } else if (tabId === 'log') {
                content = `
                    <table class="settings-table">
                        <thead>
                            <tr>
                                <th>COLUMNA APP</th>
                                <th>ENTIDAD YIQI</th>
                                <th>DESCRIPCIÓN</th>
                                <th>SMARTIE ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><b>JAULAS ARMADAS</b></td>
                                <td><span class="settings-badge-ent">Remito Interno (781)</span></td>
                                <td>Jaulas listas para ser despachadas a Lozametal.</td>
                                <td><input type="number" id="set-logistica" class="form-control" value="${YIQI_CONFIG.smartieLogistica}"></td>
                            </tr>
                            <tr>
                                <td><b>JAULAS ENVIADAS</b></td>
                                <td><span class="settings-badge-ent">Remito Interno (781)</span></td>
                                <td>Historial de jaulas ya despachadas (tránsito).</td>
                                <td><input type="number" id="set-despachos" class="form-control" value="${YIQI_CONFIG.smartieDespachos}"></td>
                            </tr>
                            <tr>
                                <td><b>TRAZABILIDAD IDA</b></td>
                                <td><span class="settings-badge-ent">Historial (2758)</span></td>
                                <td>Smartie de trazabilidad de ida en Logística.</td>
                                <td><input type="number" id="set-trazabilidad" class="form-control" value="${YIQI_CONFIG.smartieTrazabilidad}"></td>
                            </tr>
                            <tr>
                                <td><b>DÍAS ALERTA SLA</b></td>
                                <td><span class="settings-badge-ent">Alertas Trazabilidad</span></td>
                                <td>Días para que un bulto se considere en emergencia (Rojo).</td>
                                <td><input type="number" id="set-sla-threshold" class="form-control" value="${YIQI_CONFIG.slaThresholdDays}"></td>
                            </tr>
                        </tbody>
                    </table>
                `;
            } else if (tabId === 'loza') {
                content = `
                    <table class="settings-table">
                        <thead>
                            <tr>
                                <th>COLUMNA APP</th>
                                <th>ENTIDAD YIQI</th>
                                <th>DESCRIPCIÓN</th>
                                <th>SMARTIE ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><b>HISTORIAL GUÍAS</b></td>
                                <td><span class="settings-badge-ent">Remito Interno (781)</span></td>
                                <td>Guías recibidas en Lozametal para procesar.</td>
                                <td><input type="number" id="set-recepcion-playa" class="form-control" value="${YIQI_CONFIG.smartieRecepcionPlaya}"></td>
                            </tr>
                            <tr>
                                <td><b>STOCK LOZAMETAL</b></td>
                                <td><span class="settings-badge-ent">Stock (794)</span></td>
                                <td>Muestra el stock físico actual en Lozametal.</td>
                                <td><input type="number" id="set-stock-loza" class="form-control" value="${YIQI_CONFIG.smartieStockLozametal}"></td>
                            </tr>
                            <tr>
                                <td><b>DISCREPANCIAS</b></td>
                                <td><span class="settings-badge-ent">Movimientos (796)</span></td>
                                <td>Control de diferencias entre lo enviado y recibido.</td>
                                <td><input type="number" id="set-movimientos" class="form-control" value="${YIQI_CONFIG.smartieMovimientosStock}"></td>
                            </tr>
                        </tbody>
                    </table>
                `;
            } else if (tabId === 'cal') {
                content = `
                    <table class="settings-table">
                        <thead>
                            <tr>
                                <th>COLUMNA APP</th>
                                <th>ENTIDAD YIQI</th>
                                <th>DESCRIPCIÓN</th>
                                <th>SMARTIE ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><b>JAULAS</b></td>
                                <td><span class="settings-badge-ent">Remito Compra (787)</span></td>
                                <td>Lista de jaulas para ingreso (Columna 2).</td>
                                <td><input type="number" id="set-calidad-jaulas" class="form-control" value="${YIQI_CONFIG.smartieCalidadJaulas || 2764}"></td>
                            </tr>
                            <tr>
                                <td><b>ID CAMPO FOTO</b></td>
                                <td><span class="settings-badge-ent">Archivo (8296)</span></td>
                                <td>ID del campo técnico donde se guarda el remito.</td>
                                <td><input type="number" id="set-calidad-foto" class="form-control" value="${YIQI_CONFIG.fieldCalidadFoto || 8296}"></td>
                            </tr>
                        </tbody>
                    </table>
                `;
            } else if (tabId === 'rec') {
                if (typeof Settings.syncRecetasWithMaster === 'function') {
                    Settings.syncRecetasWithMaster();
                }

                const renderRows = (filterData = {}) => {
                    const search = (filterData.search || "").toUpperCase().trim();
                    const g = filterData.group || "";
                    const s1 = filterData.s1 || "";
                    const s2 = filterData.s2 || "";

                    const filtered = recetasEnlozado.filter(r => {
                        const art = articlesDataMap[r.term] || {};
                        const artName = (art.NOMBRE || art.MATE_NOMBRE || "").toUpperCase();
                        const matchSearch = !search || r.term.includes(search) || artName.includes(search);
                        const matchG = !g || r._group === g;
                        const matchS1 = !s1 || r._s1 === s1;
                        const matchS2 = !s2 || r._s2 === s2;
                        return matchSearch && matchG && matchS1 && matchS2;
                    });

                    return filtered.map((r, idx) => {
                        const art = articlesDataMap[r.term] || {};
                        const artName = art.NOMBRE || art.MATE_NOMBRE || art.MATE_CODIGO || "---";
                        const origIdx = recetasEnlozado.findIndex(x => x.term === r.term);
                        
                        return `
                        <tr style="border-bottom: 1px solid #f1f5f9; background: ${idx % 2 === 0 ? '#fff' : '#fcfcfc'};">
                            <td style="padding: 12px 8px; vertical-align: top; width: 45%;">
                                <div style="font-weight: 800; font-size: 0.9rem; color: #0f172a; margin-bottom: 4px;">${r.term}</div>
                                <div style="font-size: 0.75rem; color: #475569; line-height: 1.3; font-weight: 400;">${artName}</div>
                            </td>
                            <td style="padding: 12px 4px; text-align: center; vertical-align: middle;">
                                <input type="text" class="form-control" style="font-size:0.8rem; padding:4px; text-align:center; width:90px; border-color: #cbd5e1;" value="${r.lf}" onchange="recetasEnlozado[${origIdx}].lf = this.value">
                            </td>
                            <td style="padding: 12px 4px; text-align: center; vertical-align: middle;">
                                <input type="text" class="form-control" style="font-size:0.8rem; padding:4px; text-align:center; width:110px; border-color: #cbd5e1;" value="${r.elz}" onchange="recetasEnlozado[${origIdx}].elz = this.value">
                            </td>
                            <td style="padding: 12px 4px; text-align: center; vertical-align: middle;">
                                <div style="display:flex; align-items:center; background: white; border: 1px solid #cbd5e1; border-radius: 4px; padding: 0 5px; width: 85px; margin: 0 auto;">
                                    <span style="font-size:0.75rem; font-weight:bold; color:#64748b;">$</span>
                                    <input type="number" class="form-control" style="border:none; font-size:0.85rem; padding:4px; text-align:right; font-weight:bold; width:100%;" value="${r.costo}" onchange="recetasEnlozado[${origIdx}].costo = parseFloat(this.value) || 0">
                                </div>
                            </td>
                        </tr>
                    `; }).join('');
                };

                window._updateRecipeDropdowns = (changedLevel) => {
                    const gEl = document.getElementById('rec-filter-g');
                    const s1El = document.getElementById('rec-filter-s1');
                    const s2El = document.getElementById('rec-filter-s2');
                    if (!gEl || !s1El || !s2El) return;

                    const group = gEl.value;
                    
                    // Lógica de habilitación/deshabilitación
                    s1El.disabled = !group;
                    s2El.disabled = !group || !s1El.value;

                    if (changedLevel === 'group') {
                        s1El.value = "";
                        s2El.value = "";
                        s2El.disabled = true;
                    } else if (changedLevel === 's1') {
                        s2El.value = "";
                        s2El.disabled = !s1El.value;
                    }

                    const s1Val = s1El.value;
                    const availableS1 = [...new Set(recetasEnlozado.filter(r => !group || r._group === group).map(r => r._s1))].sort();
                    const availableS2 = [...new Set(recetasEnlozado.filter(r => (!group || r._group === group) && (!s1Val || r._s1 === s1Val)).map(r => r._s2))].sort();

                    const currentS1 = s1El.value;
                    s1El.innerHTML = '<option value="">Subgrupo 1</option>' + availableS1.map(s => `<option value="${s}" ${s === currentS1 ? 'selected' : ''}>${s}</option>`).join('');
                    const currentS2 = s2El.value;
                    s2El.innerHTML = '<option value="">Subgrupo 2</option>' + availableS2.map(s => `<option value="${s}" ${s === currentS2 ? 'selected' : ''}>${s}</option>`).join('');
                    
                    window._applyRecipeFilters();
                };

                window._applyRecipeFilters = () => {
                    const searchInput = document.getElementById('rec-search');
                    const gEl = document.getElementById('rec-filter-g');
                    const s1El = document.getElementById('rec-filter-s1');
                    const s2El = document.getElementById('rec-filter-s2');
                    const body = document.getElementById('recetas-body');

                    if (!searchInput || !gEl || !s1El || !s2El || !body) return;

                    const search = searchInput.value;
                    const group = gEl.value;
                    const s1 = s1El.value;
                    const s2 = s2El.value;
                    
                    body.innerHTML = renderRows({ search, group, s1, s2 });
                };

                window._exportRecetasCSV = () => {
                    let csv = "SKU_TERMINADO;SKU_LF;SKU_ELZ;COSTO\n";
                    recetasEnlozado.forEach(r => {
                        csv += `${r.term};${r.lf};${r.elz};${r.costo}\n`;
                    });
                    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                    const link = document.createElement("a");
                    const url = URL.createObjectURL(blob);
                    link.setAttribute("href", url);
                    link.setAttribute("download", "recetas_enlozado.csv");
                    link.style.visibility = 'hidden';
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                };

                window._importRecetasCSV = () => {
                    const input = document.createElement('input');
                    input.type = 'file';
                    input.accept = '.csv';
                    input.onchange = e => {
                        const file = e.target.files[0];
                        const reader = new FileReader();
                        reader.onload = event => {
                            const text = event.target.result;
                            const lines = text.split('\n');
                            let updated = 0;
                            lines.forEach((line, idx) => {
                                if (idx === 0 || !line.trim()) return;
                                const cols = line.split(';');
                                if (cols.length >= 4) {
                                    const term = cols[0].trim().toUpperCase();
                                    const lf = cols[1].trim();
                                    const elz = cols[2].trim();
                                    const costo = parseFloat(cols[3]) || 0;
                                    
                                    const rIdx = recetasEnlozado.findIndex(x => x.term === term);
                                    if (rIdx !== -1) {
                                        recetasEnlozado[rIdx].lf = lf;
                                        recetasEnlozado[rIdx].elz = elz;
                                        recetasEnlozado[rIdx].costo = costo;
                                        updated++;
                                    }
                                }
                            });
                            alert(`Importación completada: ${updated} registros actualizados.`);
                            window._applyRecipeFilters();
                        };
                        reader.readAsText(file);
                    };
                    input.click();
                };

                const initialGroups = [...new Set(recetasEnlozado.map(r => r._group))].sort();

                content = `
                    <div style="margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-size: 0.75rem; color: #64748b; font-weight: bold;">GESTIÓN MASIVA:</span>
                        <div style="display: flex; gap: 6px;">
                            <button onclick="window._exportRecetasCSV()" style="padding: 4px 8px; font-size: 0.7rem; border-radius: 4px; border: 1px solid #10b981; background: #ecfdf5; color: #047857; cursor: pointer;">📥 Exportar CSV</button>
                            <button onclick="window._importRecetasCSV()" style="padding: 4px 8px; font-size: 0.7rem; border-radius: 4px; border: 1px solid #3b82f6; background: #eff6ff; color: #1d4ed8; cursor: pointer;">📤 Importar CSV</button>
                        </div>
                    </div>
                    <div style="margin-bottom: 12px; background: #f1f5f9; padding: 8px; border-radius: 10px; border: 1px solid #e2e8f0; display: flex; gap: 6px; align-items: center; overflow: hidden;">
                        <div style="position: relative; flex: 1.2; min-width: 140px;">
                            <span style="position: absolute; left: 8px; top: 50%; transform: translateY(-50%); color: #94a3b8; font-size: 0.85rem;">🔍</span>
                            <input type="text" id="rec-search" placeholder="SKU o Nombre..." 
                                style="width: 100%; padding: 6px 8px 6px 28px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.75rem; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05);"
                                oninput="window._applyRecipeFilters()">
                        </div>
                        <select id="rec-filter-g" style="flex: 1; min-width: 100px; max-width: 160px; padding: 5px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.7rem; background: #fff;" onchange="window._updateRecipeDropdowns('group')">
                            <option value="">Grupo</option>
                            ${initialGroups.map(g => `<option value="${g}">${g}</option>`).join('')}
                        </select>
                        <select id="rec-filter-s1" style="flex: 1; min-width: 100px; max-width: 160px; padding: 5px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.7rem; background: #fff;" onchange="window._updateRecipeDropdowns('s1')" disabled>
                            <option value="">Subgrupo 1</option>
                        </select>
                        <select id="rec-filter-s2" style="flex: 1; min-width: 100px; max-width: 160px; padding: 5px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 0.7rem; background: #fff;" onchange="window._applyRecipeFilters()" disabled>
                            <option value="">Subgrupo 2</option>
                        </select>
                    </div>
                    <div style="max-height: 240px; overflow-y: auto; border: 1px solid #e2e8f0; border-radius: 8px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                        <table class="settings-table" style="margin:0; width:100%; border-collapse: collapse; table-layout: fixed;">
                            <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 10; box-shadow: 0 1px 2px rgba(0,0,0,0.1);">
                                <tr style="font-size: 0.65rem; color: #64748b; text-transform: uppercase; font-weight: 700;">
                                    <th style="padding:10px; text-align:left; border-bottom: 2px solid #cbd5e1; width: 45%;">SKU TERMINADO / PRODUCTO</th>
                                    <th style="padding:10px 5px; text-align:center; border-bottom: 2px solid #cbd5e1; width: 18%;">SKU LF</th>
                                    <th style="padding:10px 5px; text-align:center; border-bottom: 2px solid #cbd5e1; width: 20%;">SKU ELZ</th>
                                    <th style="padding:10px 5px; text-align:center; border-bottom: 2px solid #cbd5e1; width: 17%;">COSTO</th>
                                </tr>
                            </thead>
                            <tbody id="recetas-body">
                                ${renderRows()}
                            </tbody>
                        </table>
                    </div>
                `;
            } else if (tabId === 'other') {
                content = `
                    <table class="settings-table">
                        <thead>
                            <tr>
                                <th>SECCIÓN</th>
                                <th>ENTIDAD YIQI</th>
                                <th>DESCRIPCIÓN</th>
                                <th>SMARTIE ID</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><b>ARTÍCULOS (Maestro)</b></td>
                                <td><span class="settings-badge-ent">Artículos (782)</span></td>
                                <td>Smartie utilizada para cargar el catálogo de artículos.</td>
                                <td><input type="number" id="set-articulos" class="form-control" value="${YIQI_CONFIG.smartieArticulos}"></td>
                            </tr>
                            <tr>
                                <td><b>VALOR DECLARADO</b></td>
                                <td><span class="settings-badge-ent">Logística / Costos</span></td>
                                <td>Valor declarado por bandeja/unidad ($).</td>
                                <td><input type="number" id="set-valor-declarado" class="form-control" value="${YIQI_CONFIG.valorDeclarado}"></td>
                            </tr>
                            <tr>
                                <td><b>UMBRAL SLA (DÍAS)</b></td>
                                <td><span class="settings-badge-ent">Alertas</span></td>
                                <td>Días para alerta de demora en jaulas.</td>
                                <td><input type="number" id="set-sla-threshold" class="form-control" value="${YIQI_CONFIG.slaThresholdDays}"></td>
                            </tr>
                        </tbody>
                    </table>
                `;
            }
            document.getElementById('settings-content').innerHTML = content;
        };

        // Initialize first tab
        setTimeout(() => Settings.switchTab('fab'), 50);

        document.getElementById('btn-config-close').onclick = () => Modal.close();

        document.getElementById('btn-config-save').onclick = () => {
            const getVal = (id, currentVal) => {
                const el = document.getElementById(id);
                return el ? parseInt(el.value) : currentVal;
            };

            const newConfig = {
                smartieLogistica: getVal('set-logistica', YIQI_CONFIG.smartieLogistica),
                smartieRemitosActivos: getVal('set-remitos', YIQI_CONFIG.smartieRemitosActivos),
                smartieId: getVal('set-stock-fab', YIQI_CONFIG.smartieId),
                smartieRevestimientos: getVal('set-stock-rev', YIQI_CONFIG.smartieRevestimientos),
                smartieArticulos: getVal('set-articulos', YIQI_CONFIG.smartieArticulos),
                smartieRecepcionPlaya: getVal('set-recepcion', YIQI_CONFIG.smartieRecepcionPlaya),
                smartieAltas: getVal('set-altas', YIQI_CONFIG.smartieAltas),
                smartieDespachos: getVal('set-despachos', getVal('set-pendientes', YIQI_CONFIG.smartieDespachos)),
                smartieTrazabilidad: getVal('set-trazabilidad', YIQI_CONFIG.smartieTrazabilidad),
                smartieStockLozametal: getVal('set-stock-loza', YIQI_CONFIG.smartieStockLozametal),
                smartieMovimientosStock: getVal('set-movimientos', YIQI_CONFIG.smartieMovimientosStock),
                smartieCalidadJaulas: getVal('set-calidad-jaulas', YIQI_CONFIG.smartieCalidadJaulas),
                fieldCalidadFoto: getVal('set-calidad-foto', YIQI_CONFIG.fieldCalidadFoto),
                depoRevestimientosRealizadosId: getVal('set-depo-term', YIQI_CONFIG.depoRevestimientosRealizadosId),
                valorDeclarado: getVal('set-valor-declarado', YIQI_CONFIG.valorDeclarado),
                slaThresholdDays: getVal('set-sla-threshold', YIQI_CONFIG.slaThresholdDays),
                smartieNroRemitoExterno: getVal('set-nro-ext', YIQI_CONFIG.smartieNroRemitoExterno)
            };

            // Guardar Recetas (ya sincronizadas en memoria vía onchange)
            if (recetasEnlozado && recetasEnlozado.length > 0) {
                localStorage.setItem('REMITO_RECETAS', JSON.stringify(recetasEnlozado));
            }

            this.save(newConfig);
        };

        // Helpers para Recetas
        Settings.addReceta = () => {
            const tbody = document.getElementById('recetas-body');
            const tr = document.createElement('tr');
            tr.style.fontSize = "0.8rem";
            tr.innerHTML = `
                <td style="padding: 4px;"><input type="text" class="form-control" style="font-weight:bold; font-size:0.8rem; padding:2px 5px;" data-key="term" value=""></td>
                <td style="padding: 4px;"><input type="text" class="form-control" style="font-size:0.75rem; padding:2px 5px; text-align:center;" data-key="lf" value=""></td>
                <td style="padding: 4px;"><input type="text" class="form-control" style="font-size:0.75rem; padding:2px 5px; text-align:center;" data-key="elz" value=""></td>
                <td style="padding: 4px;">
                    <div style="display:flex; align-items:center; background: white; border: 1px solid #ddd; border-radius: 4px; padding-left: 5px;">
                        <span style="font-size:0.7rem; font-weight:bold; color:#64748b;">$</span>
                        <input type="number" class="form-control" style="border:none; font-size:0.8rem; padding:2px 5px; text-align:right; font-weight:bold;" data-key="costo" value="0">
                    </div>
                </td>
                <td style="padding: 4px;"><button class="btn-icon" onclick="this.closest('tr').remove()" style="color:#f87171;">✕</button></td>
            `;
            tbody.appendChild(tr);
        };

        Settings.removeReceta = (idx) => {
            const row = document.querySelector(`input[data-idx="${idx}"]`).closest('tr');
            row.remove();
        };

        Settings.syncCostoELZ = (input) => {
            // Futuro uso si queremos mostrar el costo ELZ en tiempo real en la UI
            // Por ahora el calculo es interno al guardar o podria mostrarse en un label
            console.log("Costo base actualizado:", input.value);
        };

        document.getElementById('btn-config-reset').onclick = async () => {
            const ok = await showConfirm("Restaurar", "¿Deseas volver a los IDs originales?");
            if (ok) this.reset();
        };
    }
};

// --- SEQUENTIAL REMITO NUMBER ---
let currentRemitoSeq = 0;

function getNextRemitoSeq() {
    currentRemitoSeq++;
    return currentRemitoSeq;
}

function getCurrentRemitoSeq() {
    return currentRemitoSeq;
}

/**
 * Sincroniza el contador con el último Nro Remito Externo de YiQi.
 * La smartie está ordenada DESC, así que el primer registro es el más alto.
 */
async function initRemitoSeq() {
    let yiqiMax = 0;
    try {
        console.log(`📋 Consultando último Nro Remito Externo en YiQi (Smartie ${YIQI_CONFIG.smartieNroRemitoExterno})...`);
        const data = await YiQi.fetch(YIQI_CONFIG.smartieNroRemitoExterno, YIQI_CONFIG.entityRemito);
        if (data && data.length > 0) {
            // El primero es el más alto
            const firstVal = data[0].REIN_NRO_EXTERNO || data[0]['13096'] || "";
            yiqiMax = parseInt(firstVal) || 0;
            console.log(`📋 Último Nro Remito Externo en YiQi: ${yiqiMax}`);
        }
    } catch (e) {
        console.warn('⚠️ No se pudo consultar smartie de Nro Externo:', e);
    }

    if (yiqiMax > 0) {
        currentRemitoSeq = yiqiMax;
        console.log(`📋 Secuencia inicializada estrictamente desde YiQi: ${currentRemitoSeq}`);
    } else {
        // Fallback manual si no hay datos en la Smartie (YiQi devuelve 0 o vacío)
        const startStr = await showPrompt(
            "Configurar Numeración",
            "La Smartie de YiQi no devolvió remitos previos.<br>Ingrese el <b>último número de remito externo</b> utilizado.<br><small>Ej: si el último fue 1705, ingrese 1705.</small>",
            "0", "number"
        );
        currentRemitoSeq = parseInt(startStr) || 0;
    }
}

// Initial load
Settings.load();


// --- STATE ---
let stock = [];

// --- YIQI CLASS ---

// --- Sincronización Inteligente ---

/**
 * Dispara el refresco de los 3 paneles principales (Stock, Recientes, Pendientes)
 * @param {boolean} showSpinners Si los botones deben mostrar animación de carga
 */
async function triggerGlobalRefresh(showSpinners = true) {
    if (showSpinners) {
        const buttons = [
            document.querySelector('button[title="Actualizar Stock"]'),
            document.querySelector('.section-header button[onclick="fetchAltasRecientes()"]'),
            document.querySelector('.section-header button[onclick="fetchAltasPendientes()"]')
        ];
        buttons.forEach(b => b?.classList.add('spin'));
    }

    try {
        await Promise.all([
            fetchStock(),
            fetchAltasRecientes(),
            fetchAltasPendientes()
        ]);
    } catch (e) {
        console.error("Sync Error:", e);
    }
}

/**
 * Inicia un ciclo de refrescos seguidos para "insistir" tras una operación
 */
function startIntelligentSyncPulse() {
    console.log("🚀 Iniciando ráfaga de sincronización (5s pulse)...");
    let count = 0;
    const maxPulses = 6; // 30 segundos total
    
    // El primero es inmediato
    triggerGlobalRefresh(true);

    const interval = setInterval(async () => {
        count++;
        if (count >= maxPulses) {
            clearInterval(interval);
            console.log("🏁 Finalizada ráfaga de sincronización.");
        } else {
            await triggerGlobalRefresh(true);
        }
    }, 5000);
}

/**
 * Mantenimiento perpetuo de la pantalla
 */
function startAutoRefreshEngine() {
    // Cada 120 segundos refresca "silenciosamente"
    setInterval(() => {
        console.log("⌚ Auto-refresco global (120s heartbeat)...");
        triggerGlobalRefresh(false); 
    }, 120000);
}

const YiQi = {
    async getToken() {
        if (yiqiToken) return yiqiToken;
        console.log("🔑 Authenticating...");
        updateStatus("Autenticando...");
        for (const url of YIQI_CONFIG.tokenUrls) {
            try {
                const r = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/x-www-form-urlencoded" },
                    body: new URLSearchParams({
                        grant_type: "password",
                        username: YIQI_CONFIG.user,
                        password: YIQI_CONFIG.pass
                    })
                });
                if (r.ok) {
                    const data = await r.json();
                    yiqiToken = data.access_token;
                    return yiqiToken;
                }
            } catch (e) { console.error("Login failed:", e); }
        }
        return null;
    },

    async fetch(smartieId, entityId) {
        updateStatus("Cargando datos...");
        const token = await this.getToken();
        if (!token) return null;

        let url = `${YIQI_CONFIG.getListUrl}?entityId=${entityId}&schemaId=${YIQI_CONFIG.schemaId}`;
        if (smartieId) url += `&smartieId=${smartieId}`;

        let allRows = [];
        let page = 1;
        const pageSize = 50;
        let hasMore = true;

        try {
            while (hasMore) {
                // Determine if this is a search query or bulk fetch

                console.log(`📡 Fetching Page ${page}...`);
                const r = await fetch(url, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify({ page: page, pageSize: pageSize })
                });

                if (r.ok) {
                    const res = await r.json();
                    let rows = res.data || res.rows || res.instances || [];

                    if (rows.length > 0) {
                        if (page === 1) console.log("DEBUG SAMPLE ROW:", rows[0]); // Inspect status fields
                    }

                    if (rows.length < pageSize) hasMore = false;
                    allRows = allRows.concat(rows);
                    page++;
                    // Safety break
                    if (page > 50) hasMore = false;
                } else {
                    console.error("Fetch Page Error:", r.status);
                    hasMore = false;
                }
            }
            return allRows;
        } catch (e) { console.error("Fetch failed:", e); }
        return null;
    },

    async fetchArticles() {
        updateStatus("Cargando Maestro de Artículos...");
        // Fetch Smartie 2670 (Articles)
        const rows = await this.fetch(YIQI_CONFIG.smartieArticulos, YIQI_CONFIG.entityArticulos);
        if (rows) {
            rows.forEach(r => {
                const code = (r.CODIGO || r.MATE_CODIGO || r.STOC_SKU || "").trim().toUpperCase();
                const id = r.ID || r.MATE_ID_MATE;
                if (code) {
                    articlesMap[code] = id;
                    articlesDataMap[code] = r; // Guardar objeto completo
                }
                if (id) {
                    articlesIdMap[id] = code;
                }
            });
            console.log(`📚 Articles Master Loaded: ${Object.keys(articlesMap).length} items`);
        }
    },

    async cloneRemito(originalId, newOrigin, newDest, customObs = null, nroRemitoExterno = null) {
        updateStatus("🔍 Iniciando Clonación de Jaula...");
        console.log(`Clonando Remito ${originalId} (${newOrigin} -> ${newDest})`);

        // 1. Get Original Items with RETRY logic
        let items = [];
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            updateStatus(`Leyendo ítems del remito original... (Intento ${attempts + 1})`);
            items = await this.getChildItems(originalId);
            
            if (items && items.length > 0) break;
            
            attempts++;
            if (attempts < maxAttempts) {
                console.warn(`⚠️ No se encontraron ítems para ${originalId}. Reintentando en 2s...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        if (!items || items.length === 0) {
            console.error("❌ Abortando clonación: El remito original no devolvió ítems tras 3 intentos.");
            throw new Error("No se pudo leer el contenido de la jaula original. Por favor, verifica que tenga ítems cargados en YiQi.");
        }

        // 2. Map & Validate Items BEFORE saving header
        const newItems = items.map(i => {
            const codigo = i.MATE_CODIGO || i.CODIGO || i.codigo || i.mate_codigo || "";
            const nombre = i.DERI_NOMBRE_ARTICULO || i.NOMBRE || i.nombre || i.MATE_NOMBRE || i.MATE_DESCRIPCION || "";
            
            // Robust Article ID extraction
            let articleId = articlesMap[codigo] || i.MATE_ID_MATE || i.mate_id_mate || i.ID_MATE || i.ID_ARTICULO || i.mate_id;

            // Fallback Stock search
            if (!articleId && codigo) {
                const s = stock.find(x => (x.MATE_CODIGO === codigo) || (x.STOC_SKU === codigo));
                if (s) articleId = s.MATE_ID_MATE || s.ID;
            }

            // Quantity extraction
            const qty = Number(i.DERI_CANTIDAD || i.CANTIDAD || i.cantidad || i.DERI_CANTIDAD_ORIGEN || 0);

            return {
                "CANTIDAD": qty,
                "DERI_CANTIDAD": String(qty),
                "DERI_NRO_SERIE": "",
                "CODIGO": codigo,
                "NOMBRE": nombre,
                "MATE_ID_MATE": articleId || null,
                "CODIGO_EN_EL_PROVEED": null,
                "COD_PROV_2": null,
                "ID_UNIVERSAL": null
            };
        });

        const validItems = newItems.filter(i => i.CANTIDAD > 0 && (i.MATE_ID_MATE || i.CODIGO));
        
        if (validItems.length === 0) {
            console.error("❌ Abortando clonación: Ningún ítem es válido para ser copiado.");
            throw new Error("La jaula original parece estar vacía o sus ítems no son compatibles para copiar.");
        }

        console.log(`✅ ${validItems.length} ítems validados. Creando cabecera...`);

        // 3. Create Header (Only after we are sure we have items)
        const originalRemito = remitos.find(r => String(r.id) === String(originalId)) || { obs: "Jaula" };
        let newObs = customObs || originalRemito.obs || "Jaula Clonada";
        newObs = newObs.replace(/procesada/gi, "").trim();

        // Propagate Nro Remito Externo from original
        if (!nroRemitoExterno && originalRemito.nroRemitoExterno) {
            nroRemitoExterno = originalRemito.nroRemitoExterno;
        }
        if (!nroRemitoExterno && originalRemito.yiqiData) {
            nroRemitoExterno = originalRemito.yiqiData.REIN_NRO_EXTERNO || null;
        }
        // If still nothing, try reading from YiQi directly
        if (!nroRemitoExterno) {
            try {
                const inst = await this.getInstance(YIQI_CONFIG.entityRemito, originalId);
                if (inst) nroRemitoExterno = inst.REIN_NRO_EXTERNO || null;
            } catch (e) { console.warn('Could not read nroExt from instance:', e); }
        }
        console.log(`📋 Clonando con Remito Externo N° ${nroRemitoExterno || '(sin dato)'}`);

        const newId = await this.saveHeader({ observacion: newObs }, newOrigin, newDest, nroRemitoExterno);
        if (!newId) throw new Error("No se pudo crear la cabecera del nuevo remito en YiQi.");

        // 4. Save Child Items
        updateStatus(`Copiando contenido a remito #${newId}...`);
        const success = await this.saveChildInstances(newId, validItems);

        if (success) {
            console.log(`✨ Clonación exitosa: ${originalId} -> ${newId}`);
            updateStatus("✅ Jaula clonada correctamente.");
            return newId;
        } else {
            console.error(`❌ Fallo parcial: Se creó el remito #${newId} pero no se pudieron insertar los ítems.`);
            throw new Error(`Se creó el remito #${newId} vacío. Por favor, bórralo en YiQi y prueba de nuevo.`);
        }
    },

    async saveHeader(data, originId, destId, nroRemitoExterno = null) {
        updateStatus("Creando cabecera de Remito...");

        // DEFAULTS & DEBUG
        const org = originId || YIQI_CONFIG.depoFabricaId;
        const dst = destId || YIQI_CONFIG.depoMustangId; // Por defecto a Mustang (191)

        console.log(`DEBUG saveHeader: Origin=${org} (Input=${originId}), Dest=${dst} (Input=${destId}), NroExt=${nroRemitoExterno}`);

        const token = await this.getToken();
        if (!token) return false;

        let formStr = `4181=${org}&4182=${dst}&4180=${encodeURIComponent(data.observacion || "-")}`;
        if (nroRemitoExterno) {
            formStr += `&13096=${nroRemitoExterno}`;
        }

        const payload = {
            schemaId: YIQI_CONFIG.schemaId,
            entityId: String(YIQI_CONFIG.entityRemito),
            form: formStr,
            uploads: "",
            parentId: null,
            childId: null
        };

        // Retry con detección inteligente de errores
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            for (const url of YIQI_CONFIG.saveUrls) {
                try {
                    const r = await fetch(url, {
                        method: "POST",
                        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                        body: JSON.stringify(payload)
                    });
                    const res = await r.json();
                    if (res.ok || res.success || res.newId) return res.newId;
                    
                    // Log detallado
                    const errMsg = res.error || '';
                    console.warn(`⚠️ saveHeader intento ${attempt}/${maxRetries} rechazado:`, JSON.stringify(res));
                    
                    // Si es error de validación (clave duplicada), NO reintentar - no va a cambiar
                    if (res.validation === true && errMsg.includes('existe')) {
                        console.error(`❌ saveHeader: Clave duplicada detectada. Abortando.`);
                        return false;
                    }
                } catch (e) { console.error(`saveHeader intento ${attempt} excepción:`, e); }
            }
            if (attempt < maxRetries) {
                console.log(`🔄 saveHeader: Reintentando en 2s... (${attempt}/${maxRetries})`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        console.error(`❌ saveHeader: Falló tras ${maxRetries} intentos.`);
        return false;
    },

    async saveChildInstances(instanceId, items, customChildId = null) {
        updateStatus(`Guardando ${items.length} items...`);
        const token = await this.getToken();
        if (!token) return false;

        const childId = customChildId || YIQI_CONFIG.childRemitoId;
        // DETERMINAR ENTIDAD SEGÚN CHILD_ID: 209 -> 787 (Compra), 227 -> 781 (Interno)
        const entityId = (childId === 209 || childId === "209") ? "787" : "781";

        const payload = {
            entityId: entityId,
            schemaId: YIQI_CONFIG.schemaId,
            childId: childId,
            instanceId: String(instanceId),
            // The API expects an array of JSON strings, not objects.
            childInstances: items.map(i => JSON.stringify(i)),
            append: true // Siempre append para permitir carga incremental de ítems
        };

        const url = YIQI_CONFIG.saveChildUrl;

        try {
            console.log(`📤 Sending Items to ${url}`, payload);

            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });

            if (r.ok) {
                const res = await r.json();
                console.log("✅ Save Child Success:", res);
                return true;
            } else {
                const errText = await r.text();
                console.error("❌ Save Child Error Response:", errText);
                alert(`Error al guardar en YiQi: ${errText}`);
            }
        } catch (e) { console.error("Save Child Exception:", e); }

        return false;
    },

    async getChildItems(instanceId) {
        updateStatus("Actualizando items del remito...");
        const token = await this.getToken();
        if (!token) return null;

        const url = `${YIQI_CONFIG.getChildListUrl}?entityId=${YIQI_CONFIG.entityRemito}&schemaId=${YIQI_CONFIG.schemaId}&childId=${YIQI_CONFIG.childRemitoId}&instanceId=${instanceId}&take=100&skip=0&page=1&pageSize=100&search=`;

        try {
            console.log(`Fetching child items: ${url}`);
            const r = await fetch(url, {
                method: "GET",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }
            });
            if (r.ok) {
                const res = await r.json();
                return res.data || res.rows || res.instances || [];
            }
        } catch (e) { console.error("Get Child Items Failed:", e); }
        return null;
    },

    async searchArticle(sku) {
        updateStatus(`Buscando ${sku}...`);
        const token = await this.getToken();
        if (!token) return null;

        const url = `${YIQI_CONFIG.searchChildUrl}?entityId=${YIQI_CONFIG.entityRemito}&schemaId=${YIQI_CONFIG.schemaId}&childId=${YIQI_CONFIG.childRemitoId}&query=${encodeURIComponent(sku)}&pageSize=20`;

        try {
            const r = await fetch(url, {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` }
            });

            if (r.ok) {
                const res = await r.json();
                const list = res.data || res.rows || res.instances || res || [];
                if (list.length > 0) {
                    const exactMatch = list.find(i => i.CODIGO === sku);
                    return exactMatch || list[0];
                }
            }
        } catch (e) { console.error("Search Article Failed:", e); }
        return null;
    },

    /**
     * Busca un artículo en todo el catálogo usando el buscador de relaciones (Global)
     * Basado en la captura de red del usuario (Entity 787, Child 209)
     */
    async findArticleGlobal(sku) {
        if (!sku) return null;
        console.log(`🔍 [Universal Search] Buscando ID para SKU: ${sku}...`);
        const token = await this.getToken();
        if (!token) return null;

        // Buscamos directamente en la entidad de Artículos (782) usando la Smartie 2744
        const url = `${YIQI_CONFIG.getListUrl}?entityId=782&schemaId=${YIQI_CONFIG.schemaId}&smartieId=2744&search=${encodeURIComponent(sku)}`;

        try {
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ 
                    page: 1, 
                    pageSize: 20,
                    search: sku // El parámetro 'search' debe ir en el body para GetList
                })
            });
            if (r.ok) {
                const res = await r.json();
                const list = res.data || res.rows || res.instances || res || [];
                if (list.length > 0) {
                    // Buscar coincidencia exacta de código en los resultados
                    const found = list.find(a => 
                        String(a.MATE_CODIGO || a.CODIGO || "").trim().toLowerCase() === String(sku).trim().toLowerCase()
                    );
                    const finalMatch = found || list[0];
                    console.log(`✅ Resultado de búsqueda global para ${sku}:`, finalMatch);
                    return finalMatch;
                }
            }
        } catch (e) {
            console.error("Error in findArticleGlobal:", e);
        }
        return null;
    },

    async savePurchaseHeader(obs) {
        updateStatus("Creando cabecera de Compra...");
        const token = await this.getToken();
        if (!token) return false;

        // IDs proporcionados: Concepto=4239(1883), Proveedor=4240(13189), Depósito=4243(190), Obs=4241
        const formStr = `4239=1883&4240=13189&4243=190&4241=${encodeURIComponent(obs)}&11086=off&8019=&6383=`;

        const payload = {
            schemaId: YIQI_CONFIG.schemaId,
            entityId: "787", // Remito de Compra
            form: formStr,
            uploads: "",
            parentId: null,
            childId: null
        };

        try {
            const r = await fetch(YIQI_CONFIG.saveUrls[0], {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const res = await r.json();
            return res.ok || res.success || res.newId ? res.newId : false;
        } catch (e) { console.error("Save Purchase Items Failed:", e); return false; }
    },

    /**
     * Sube un archivo a YiQi usando el endpoint SaveFile
     * @param {File} file Objeto File a subir
     * @param {string} fieldId ID del campo que recibirá el archivo (ej: 8296)
     */
    async uploadFile(file, fieldId = "8296") {
        const token = await this.getToken();
        if (!token) return null;

        const formData = new FormData();
        formData.append("schemaId", "1491");
        formData.append(fieldId, file);

        try {
            if (file && file.name) {
                console.log(`📸 Subiendo archivo ${file.name} a campo ${fieldId}...`);
            } else {
                console.log(`ℹ️ No hay archivo para subir a campo ${fieldId}.`);
                return null;
            }
            // Volvemos a api.yiqi para evitar el 401 de me.yiqi
            const r = await fetch("https://api.yiqi.com.ar/api/instancesApi/SaveFile", {
                method: "POST",
                headers: { "Authorization": `Bearer ${token}` },
                body: formData
            });

            if (r.ok) {
                const res = await r.text();
                try {
                    const json = JSON.parse(res);
                    return json.fileName || json.name || file.name;
                } catch(e) {
                    return res.trim();
                }
            }
        } catch (e) {
            console.error("❌ Error en uploadFile:", e);
        }
        return null;
    },

    /**
     * Ejecuta una transición de estado sobre una instancia
     * @param {string} entityId ID de la entidad
     * @param {string} instanceId ID de la instancia
     * @param {number} transitionId ID de la transición (ej: 119014 para Procesar Compra)
     */
    async executeTransition(entityId, instanceId, transitionId) {
        const token = await this.getToken();
        if (!token) return false;

        const payload = {
            schemaId: "1491",
            ids: [String(instanceId)],
            transitionId: Number(transitionId),
            form: ""
        };

        try {
            console.log(`⚙️ Ejecutando transición ${transitionId} sobre #${instanceId}...`);
            const r = await fetch(YIQI_CONFIG.executeTransitionUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const res = await r.json();
            return res.ok || res.success;
        } catch (e) {
            console.error("❌ Fallo executeTransition:", e);
            return false;
        }
    },

    /**
     * Actualiza solo los campos de cabecera (form) de una instancia existente
     */
    async updateInstanceForm(entityId, instanceId, formStr, uploads = "") {
        const token = await this.getToken();
        if (!token) return false;

        const payload = {
            schemaId: "1491",
            entityId: String(entityId),
            instanceId: String(instanceId),
            form: formStr,
            uploads: uploads
        };

        try {
            const r = await fetch(YIQI_CONFIG.saveUrls[0], {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const res = await r.json();
            return res.ok || res.success;
        } catch (e) {
            console.error("❌ Fallo updateInstanceForm:", e);
            return false;
        }
    },

    async savePurchaseItems(instanceId, items) {
        updateStatus(`Guardando ${items.length} ítems de compra...`);
        const token = await this.getToken();
        if (!token) return false;

        const payload = {
            entityId: "787",
            schemaId: YIQI_CONFIG.schemaId,
            childId: "209", // Items de Compra
            instanceId: String(instanceId),
            childInstances: items.map(i => JSON.stringify(i)),
            append: true
        };

        try {
            const r = await fetch(YIQI_CONFIG.saveChildUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            return r.ok;
        } catch (e) { console.error("Save Purchase Items Failed:", e); return false; }
    },

    async addComment(entityId, instanceId, comment) {
        const token = await this.getToken();
        if (!token) return false;

        const url = "https://api.yiqi.com.ar/api/instancesApi/AddComment";
        
        const payload = {
            entityId: String(entityId),
            schemaId: YIQI_CONFIG.schemaId,
            instanceId: String(instanceId),
            comment: comment
        };

        try {
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            return r.ok;
        } catch (e) {
            console.error("Add Comment Failed:", e);
            return false;
        }
    },

    async getInstance(entityId, instanceId) {
        const token = await this.getToken();
        if (!token) return null;

        const url = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=${YIQI_CONFIG.schemaId}&entityId=${entityId}&id=${instanceId}`;
        
        try {
            const r = await fetch(url, {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (!r.ok) return null;
            return await r.json();
        } catch (e) {
            console.error("Get Instance Failed:", e);
            return null;
        }
    },
    async updateHeader(instanceId, fieldData) {
        const token = await this.getToken();
        if (!token) return false;

        // fieldData: { "4182": 190, "4180": "Nueva Obs" }
        const formParts = [];
        for (const [key, value] of Object.entries(fieldData)) {
            formParts.push(`${key}=${encodeURIComponent(value || "")}`);
        }

        const payload = {
            schemaId: YIQI_CONFIG.schemaId,
            entityId: String(YIQI_CONFIG.entityRemito),
            instanceId: String(instanceId),
            form: formParts.join("&"),
            uploads: "",
            removedFiles: []
        };

        try {
            console.log(`🆙 Updating Header ${instanceId}:`, payload);
            const r = await fetch(YIQI_CONFIG.saveUrls[0], {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify(payload)
            });
            const res = await r.json();
            return res.ok || res.success || res.newId;
        } catch (e) {
            console.error("Update Header Failed:", e);
            return false;
        }
    },

    async deleteItem(itemId) {
        updateStatus("Eliminando item...");
        const token = await this.getToken();
        if (!token) return false;

        const url = `${YIQI_CONFIG.deleteUrl}?schemaId=${YIQI_CONFIG.schemaId}&entityId=${YIQI_CONFIG.entityRemitoItem}&ids=${itemId}`;

        try {
            console.log("🗑️ Deleting Item:", url);
            const r = await fetch(url, {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (r.ok) return true;
        } catch (e) { console.error("Delete Failed:", e); }
        return false;
    },


    async closeCage(remitoId) {
        const token = await this.getToken();
        if (!token) return false;

        const updateLoading = (msg) => {
            const p = document.querySelector('#loading-overlay p');
            if (p) p.innerText = msg;
            console.log(`[CERRAR JAULA] ${msg}`);
        };

        try {
            // TRANSICIONES: Creado → Enviado → Procesado (usa helper universal)
            await processRemitoTransitions([String(remitoId)], updateLoading, true);

            // AUTO-CLONING (Do NOT touch as per user request)
            updateLoading("🚀 Paso 3: Generando copia para Logística...");
            try {
                await this.cloneRemito(remitoId, YIQI_CONFIG.depoRevestimientosId, YIQI_CONFIG.depoMustangId);
                updateLoading("✅ Proceso completo: Jaula cerrada y clonada.");
            } catch (cloneErr) {
                console.error("Auto-Clone Failed:", cloneErr);
                showModal("Advertencia", "La jaula se cerró pero falló la creación del duplicado a Mustang.", "warning");
            }

            return true;

        } catch (e) {
            console.error("Error en closeCage:", e);
            throw e; // Caught by caller to show error modal
        }
    },

    async deleteChildInstance(instanceId, childInstanceId, childId = 209) {
        console.log(`🗑️ Eliminando hijo ${childInstanceId} de la instancia ${instanceId}...`);
        const token = await this.getToken();
        if (!token) return false;

        // DETERMINAR ENTIDAD DEL ÍTEM SEGÚN CHILD_ID: 209 (Compra) -> 789, 227 (Interno) -> 783
        const entityIdItem = (childId === 209 || childId === "209") ? "789" : "783";
        const url = `https://api.yiqi.com.ar/api/instancesApi/Delete?schemaId=${YIQI_CONFIG.schemaId}&entityId=${entityIdItem}&ids=${childInstanceId}`;

        try {
            const r = await fetch(url, {
                method: "GET",
                headers: { "Authorization": `Bearer ${token}` }
            });
            return r.ok;
        } catch (e) {
            console.error("deleteChildInstance Failed:", e);
            return false;
        }
    },

    async findLinkedConsumo(cageObs, nroRemito) {
        const token = await this.getToken();
        if (!token) return null;

        // Intentamos buscar por el Número Externo (Remito Proveedor) en la Smartie 2765
        const searchUrl = `${YIQI_CONFIG.getListUrl}?entityId=781&schemaId=${YIQI_CONFIG.schemaId}&smartieId=2765&search=${encodeURIComponent(nroRemito || cageObs)}`;
        
        try {
            const r = await fetch(searchUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                body: JSON.stringify({ page: 1, pageSize: 20 })
            });
            if (r.ok) {
                const res = await r.json();
                const list = res.data || res.rows || [];
                // Priorizamos el que coincida con la observación de la jaula (por si hay varios remitos del mismo proveedor)
                const found = list.find(rm => rm.REIN_OBSERVACION && rm.REIN_OBSERVACION.includes(cageObs)) || list[0];
                if (found) return found.ID || found.id;
            }
            return null;
        } catch (e) {
            console.error("findLinkedConsumo Failed:", e);
            return null;
        }
    }
};


function handleError(errText) {
    try {
        const json = JSON.parse(errText);
        return json.message || json.error || errText;
    } catch { return errText; }
}

/**
 * FUNCIÓN UNIVERSAL DE TRANSICIONES - Imita el patrón de la UI de YiQi:
 * 1. Ejecuta transición
 * 2. Parsea response JSON y confirma ok:true
 * 3. Llama GetInstance para forzar propagación del estado en el backend
 * 4. Espera breve
 * 5. Repite para la siguiente transición
 *
 * @param {string[]} ids - Array de IDs de remitos (como strings)
 * @param {Function} statusFn - Función para mostrar estado al usuario
 * @param {boolean} throwOnFirstFail - Si true, aborta si la primera transición falla
 */
async function processRemitoTransitions(ids, statusFn, throwOnFirstFail = true) {
    const token = await YiQi.getToken();
    if (!token) throw new Error("Sin token de autenticación");

    const log = (msg) => {
        if (statusFn) statusFn(msg);
        console.log(`[TRANSITION] ${msg}`);
    };

    // === PASO 1: Pendiente/Creado → Enviado (118455) ===
    log("Paso 1: Enviando...");
    const r1 = await fetch(YIQI_CONFIG.executeTransitionUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ schemaId: YIQI_CONFIG.schemaId, ids: ids, transitionId: 118455, form: "" })
    });

    let r1Data = null;
    try { r1Data = await r1.json(); } catch { r1Data = { ok: r1.ok }; }
    console.log("T1 Response:", r1Data);

    if (!r1.ok || r1Data.ok === false) {
        const errMsg = `Transición 118455 falló: ${r1Data.error || r1Data.okMessage || 'Error desconocido'}`;
        if (throwOnFirstFail) throw new Error(errMsg);
        console.warn(`⚠️ ${errMsg} (continuando al paso 2 por si ya está en Enviado)`);
    }

    // === ESPERA INICIAL BREVE: solo 3s para dar tiempo al backend ===
    log("⏳ Sincronizando...");
    await new Promise(r => setTimeout(r, 3000));
    // GetInstance para notificar al backend
    for (const id of ids) {
        try { await YiQi.getInstance(YIQI_CONFIG.entityRemito, id); } catch {}
    }

    // === PASO 2: Enviado → Procesado (118456) ===
    // Si YiQi dice "Debe esperar a que terminen de procesarse los envíos",
    // reintentamos con paciencia. Si sale OK de una, salimos rápido.
    const maxAttempts = 6;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        log(`Paso 2: Procesando... (Intento ${attempt}/${maxAttempts})`);

        const r2 = await fetch(YIQI_CONFIG.executeTransitionUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({ schemaId: YIQI_CONFIG.schemaId, ids: ids, transitionId: 118456, form: "" })
        });

        let r2Data = null;
        try { r2Data = await r2.json(); } catch { r2Data = { ok: r2.ok }; }
        console.log(`T2 Attempt ${attempt} Response:`, r2Data);

        // ¿Éxito? Salimos de inmediato, sin esperar nada más
        if (r2.ok && r2Data.ok !== false) {
            log("✅ Transición Procesado confirmada!");
            return true;
        }

        // Detectar si YiQi sigue procesando (mensaje "Debe esperar")
        const errorMsg = r2Data.error || r2Data.okMessage || '';
        const isWaiting = errorMsg.includes('esperar') || r2Data.validation === true;
        const noItems = errorMsg.includes('items recibidos');

        if (attempt < maxAttempts) {
            // Si el error es "No hay items recibidos", esperamos un poco más 
            // porque suele ser un estado transitorio tras un ajuste a 0.
            const wait = (isWaiting || noItems) ? 5000 : 3000;
            log(`⚠️ ${noItems ? 'Esperando confirmación de ítems (0 qty)' : (isWaiting ? 'YiQi sigue procesando' : 'Error')}. Reintentando en ${wait/1000}s...`);
            await new Promise(r => setTimeout(r, wait));
            // GetInstance entre reintentos
            for (const id of ids) {
                try { await YiQi.getInstance(YIQI_CONFIG.entityRemito, id); } catch {}
            }
        }
    }

    throw new Error(`No se pudo procesar tras ${maxAttempts} intentos. YiQi puede estar saturado.`);
}

// --- CUSTOM MODALS ---
const Modal = {
    overlay: () => document.getElementById('custom-modal'),
    icon: () => document.getElementById('modal-icon'),
    title: () => document.getElementById('modal-title'),
    message: () => document.getElementById('modal-message'),
    actions: () => document.getElementById('modal-actions'),

    close() {
        const ov = this.overlay();
        if (!ov) return;
        ov.classList.remove('active');
        // Remove click listener immediately to avoid stacking or bugs
        ov.onclick = null;
        // Usamos un flag interno para saber si ya limpiamos o no
        ov.dataset.closing = "true";
        setTimeout(() => {
            if (ov.dataset.closing === "true") {
                ov.style.visibility = 'hidden';
                if (this.actions()) this.actions().innerHTML = '';
            }
        }, 150); // Reducido para que la limpieza sea más rápida
    },

    open(iconStr, titleStr, msgHtml, buttonsHtml, closeOnClickOutside = false, isWide = false) {
        const ov = this.overlay();
        if (!ov) {
            alert(titleStr + "\n" + msgHtml.replace(/<[^>]*>?/gm, ''));
            return;
        }

        const box = ov.querySelector('.modal-box');
        if (box) {
            if (isWide) box.classList.add('modal-wide');
            else box.classList.remove('modal-wide');
        }

        // Si ya hay un modal abriéndose/abierto, forzamos limpieza rápida
        ov.dataset.closing = "false";

        this.icon().innerText = iconStr;
        this.title().innerText = titleStr;
        this.message().innerHTML = msgHtml;
        this.actions().innerHTML = buttonsHtml;

        // Reset de transiciones si estaba por cerrarse uno viejo
        ov.style.transition = 'none';
        ov.style.visibility = 'visible';

        // Forzamos un reflow para que tome el opacity de visibility, luego restauramos class
        void ov.offsetWidth;
        ov.style.transition = '';

        requestAnimationFrame(() => ov.classList.add('active'));

        // Handle click outside to close
        if (closeOnClickOutside) {
            ov.onclick = (e) => {
                if (e.target === ov) this.close();
            };
        } else {
            ov.onclick = null;
        }
    }
};

function showModal(title, msg, type = 'info') {
    return new Promise(resolve => {
        let isResolved = false;
        const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
        const btnClass = type === 'error' ? 'btn-danger-modal' : 'btn-confirm';
        const btns = `<button class="btn-modal ${btnClass}" id="modal-btn-ok">Aceptar</button>`;

        Modal.open(icon, title, msg, btns);

        const closeMod = (res) => {
            if (isResolved) return;
            isResolved = true;
            Modal.close();
            resolve(res);
        };

        const ov = Modal.overlay();
        if (ov) {
            ov.onclick = (e) => {
                if (e.target === ov) closeMod();
            };
        }

        const btn = document.getElementById('modal-btn-ok');

        if (btn) {
            btn.onclick = closeMod;
            // Auto-focus solo si no es un error, para obligar al usuario a hacer clic manual en los errores
            if (type !== 'error') {
                setTimeout(() => { if (document.getElementById('modal-btn-ok')) btn.focus() }, 100);
            }
        } else { closeMod(); }
    });
}

function showConfirm(title, msg, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    return new Promise(resolve => {
        const btns = `
            <button class="btn-modal btn-cancel" id="modal-btn-cancel">${cancelText}</button>
            <button class="btn-modal btn-confirm" id="modal-btn-confirm">${confirmText}</button>
        `;
        Modal.open('⚠️', title, msg, btns);

        const btnCancel = document.getElementById('modal-btn-cancel');
        const btnConfirm = document.getElementById('modal-btn-confirm');

        if (btnCancel) btnCancel.onclick = () => { Modal.close(); resolve(false); };
        if (btnConfirm) {
            btnConfirm.onclick = () => { Modal.close(); resolve(true); };
            btnConfirm.focus();
        }
    });
}

function showPrompt(title, msg, defaultValue = '', inputType = 'text') {
    return new Promise(resolve => {
        const inputHtml = `<div style="margin-top:10px;"><input type="${inputType}" id="modal-input" class="form-control" value="${defaultValue}" style="width:100%; text-align:center;"></div>`;
        const btns = `
            <button class="btn-modal btn-cancel" id="modal-btn-cancel">Cancelar</button>
            <button class="btn-modal btn-confirm" id="modal-btn-ok">Aceptar</button>
        `;

        Modal.open('📝', title, `<div>${msg}</div>${inputHtml}`, btns);

        const input = document.getElementById('modal-input');
        if (input) {
            input.focus();
            input.select();
        }

        let isResolved = false;
        const confirm = () => {
            if (isResolved) return;
            const val = input ? input.value : null;
            if (!val) { if (input) input.style.border = "2px solid red"; return; }
            isResolved = true;
            if (input) input.removeEventListener('keyup', handleKeyup);
            Modal.close();
            resolve(val);
        };

        const cancel = () => {
            if (isResolved) return;
            isResolved = true;
            if (input) input.removeEventListener('keyup', handleKeyup);
            Modal.close();
            resolve(null);
        };

        const btnOk = document.getElementById('modal-btn-ok');
        const btnCancel = document.getElementById('modal-btn-cancel');

        if (btnOk) btnOk.onclick = confirm;
        if (btnCancel) btnCancel.onclick = cancel;

        const handleKeyup = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                // Bloquea ejecuciones múltiples
                if (btnOk) btnOk.disabled = true;
                if (input) input.disabled = true;
                confirm();
            }
            if (e.key === 'Escape') cancel();
        };

        if (input) {
            input.addEventListener('keyup', handleKeyup);
        }
    });
}

// --- UI LOGIC ---

async function init() {
    showLoading(true);
    updateStatus("Iniciando aplicación...");

    document.getElementById('btn-fabrica').innerHTML = `Fábrica`;
    document.getElementById('btn-revestimientos').innerHTML = `Jaulas Cerradas`;

    try {
        yiqiToken = await YiQi.getToken();

        if (yiqiToken) {
            // Sincronizar numeración externa antes de cargar el resto
            await initRemitoSeq();
            // Safe update of status
            const statusEl = document.getElementById('status-indicator');
            if (statusEl) {
                statusEl.className = "status-dot green";
                statusEl.title = "Conectado";
            }
            
            console.log("🚀 Starting Initial Load (Refined)...");

            // Only load critical data
            try {
                // 1. First load articles (CRITICAL for ID mapping)
                await YiQi.fetchArticles(); 

                // 2. Parallel fetch for the rest
                const p1 = YiQi.fetch(YIQI_CONFIG.smartieId, YIQI_CONFIG.entityId).then(d => stock = d || []);
                const p3 = fetchGroupsAndArticles(); // Alta support
                const p4 = fetchDespachosLozametal(); // Load logistics history
                const p5 = fetchAltasRecientes();
                const p6 = fetchAltasPendientes();
                const p7 = fetchTrackingBoard();     // NUEVO: Board de Trazabilidad global
                await Promise.all([p1, p3, p4, p5, p6, p7]);

                // [NUEVO] Sincronizar Recetas AHORA que ya tenemos el maestro de artículos cargado
                // Esto soluciona el problema de tener que entrar a configuración para que aparezcan las recetas
                if (typeof Settings.syncRecetasWithMaster === 'function') {
                    console.log("🧪 Auto-sincronizando recetas con artículos cargados...");
                    Settings.syncRecetasWithMaster();
                }

                // 4. Iniciar motor de auto-refresco (60s)
                startAutoRefreshEngine();
            } catch (e) {
                console.error("Data Load Failed", e);
            }
            renderStock();

            try {
                await fetchAltasRecientes();
            } catch (e) {
                console.error("Altas Load Failed", e);
                renderRecentAltas();
            }

            try {
                await fetchActiveRemitos();
            } catch (e) { console.error("Remitos Load Failed", e); remitos = []; }
            renderRemitos();

        } else {
            const statusEl = document.getElementById('status-indicator');
            if (statusEl) {
                statusEl.className = "status-dot red";
                statusEl.title = "Desconectado";
            }
        }
    } catch (e) {
        console.error("INIT ERROR:", e);
        alert(`Error al iniciar: ${e.message}`);
    } finally {
        showLoading(false);
    }
}

async function fetchActiveRemitos() {
    const btnRefresh = document.querySelector('button[title="Actualizar Jaulas"]');
    if (btnRefresh) btnRefresh.classList.add('spin');

    try {
        const data = await YiQi.fetch(YIQI_CONFIG.smartieRemitosActivos, YIQI_CONFIG.entityRemito);
        if (data) {
            remitos = data.map(r => {
                // Buscar nroComprobante en múltiples campos (YiQi puede tardar en asignarlo)
                let nro = r.REIN_NRO_REMITO_INTERNO || r.NUMERO_COMPROBANTE || r.REIN_ASIGNAR_NRO_COMPR || "";
                if (!nro && r.REIN_PUNTO_DE_VENTA && r.REIN_NUMERO) {
                    nro = `${r.REIN_PUNTO_DE_VENTA.toString().padStart(4, '0')}-${r.REIN_NUMERO.toString().padStart(8, '0')}`;
                }
                return {
                    id: r.ID || r.id,
                    nroComprobante: nro || "S/N",
                    nroRemitoExterno: r.REIN_NRO_EXTERNO || "",
                    obs: r.REIN_OBSERVACION || "",
                    status: 'OPEN',
                    yiqiData: r
                };
            });

            // Si hay una jaula activa seleccionada, sincronizar sus datos con los recién traídos
            if (activeRemito) {
                const updated = remitos.find(r => r.id == activeRemito.id);
                if (updated) {
                    // Preservar serverItems que ya teníamos cargados
                    const currentServerItems = activeRemito.serverItems;
                    Object.assign(activeRemito, updated);
                    if (currentServerItems) activeRemito.serverItems = currentServerItems;

                    // Actualizar los badges del panel de detalle
                    const displayNum = (activeRemito.nroComprobante && activeRemito.nroComprobante !== "S/N" && activeRemito.nroComprobante !== "undefined")
                        ? activeRemito.nroComprobante : `ID: ${activeRemito.id}`;
                    const idBadge = document.getElementById('active-remito-id');
                    if (idBadge) {
                        idBadge.innerText = displayNum;
                        idBadge.style.display = 'block';
                    }
                }
            }
        }
        renderRemitos(); // Refresca visualmente la lista
        return data;
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('spin');
    }
}

// NEW: Fetch Logistics specific remitos
async function fetchLogisticsRemitos() {
    const btnRefresh = document.querySelector('button[onclick="fetchProcessedCages()"]');
    if (btnRefresh) btnRefresh.classList.add('spin');
    updateStatus("Cargando Jaulas Armadas...");
    try {
        // Fetch Smartie 2695 - Already filtered for Logistics
        const data = await YiQi.fetch(YIQI_CONFIG.smartieLogistica, YIQI_CONFIG.entityRemito);

        if (data) {
            return data.map(r => ({
                id: r.ID || r.id,
                nroComprobante: r.REIN_NRO_REMITO_INTERNO || "S/N",
                nroRemitoExterno: r.REIN_NRO_EXTERNO || "",
                obs: r.REIN_OBSERVACION || "Sin Observaciones",
                status: 'LOGISTICS_READY',
                yiqiData: r
            }));
        }
        return [];
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('spin');
    }
}

async function fetchStock() {
    const btnRefresh = document.querySelector('button[title="Actualizar Stock"]');
    if (btnRefresh) btnRefresh.classList.add('spin');

    const list = document.getElementById('stock-list');
    if (!list) return;

    // Show Loading state if we don't have data yet
    if (!stock || stock.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:1rem;">Actualizando mercadería...</p>`;
    }

    try {
        const isRevestimientos = document.getElementById('btn-revestimientos')?.classList.contains('active');
        const targetSmartie = isRevestimientos ? YIQI_CONFIG.smartieRevestimientos : YIQI_CONFIG.smartieId;

        console.log(`📡 Fetching stock for smartie: ${targetSmartie}`);

        const data = await YiQi.fetch(targetSmartie, YIQI_CONFIG.entityId);
        if (data) {
            stock = data;
            
            // Update UI helpers
            const btnFab = document.getElementById('btn-fabrica');
            const btnRev = document.getElementById('btn-revestimientos');
            if (btnFab) btnFab.innerText = "Fábrica";
            if (btnRev) btnRev.innerText = "Jaulas Cerradas";

            renderStock();
        } else {
            list.innerHTML = `<p style="text-align:center;color:#666;">Error al cargar stock</p>`;
        }
    } catch (e) {
        console.error("Error al cargar stock:", e);
        list.innerHTML = `<p class="text-danger text-center" style="padding:1rem;">Error al cargar stock.</p>`;
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('spin');
    }
}

function renderStock() {
    const list = document.getElementById('stock-list');
    const isRevestimientos = document.getElementById('btn-revestimientos')?.classList.contains('active');

    if (stock.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:1rem;">No hay stock disponible.</p>`;
        return;
    }

    list.innerHTML = stock
        .filter(item => (item.STOC_CANTIDAD || 0) > 0)
        .map(item => {
        const itemSku = item.STOC_SKU || item.MATE_NOMBRE;
        let usedQty = 0;

        if (activeRemitoItems) {
            usedQty += activeRemitoItems
                .filter(i => i.sku === itemSku)
                .reduce((sum, i) => sum + i.qty, 0);
        }

        if (activeRemito && activeRemito.serverItems) {
            usedQty += activeRemito.serverItems
                .filter(i => {
                    const serverSku = i.MATE_CODIGO || i.CODIGO || i.MATE_NOMBRE;
                    return serverSku === itemSku;
                })
                .reduce((sum, i) => sum + (i.DERI_CANTIDAD || 0), 0);
        }

        const remaining = (item.STOC_CANTIDAD || 0) - usedQty;
        const remainingDisplay = `<span style="color: var(--primary); font-weight: bold; margin-left: 5px;" title="Disponible tras remito">(${remaining})</span>`;

        const safeName = (item.MATE_NOMBRE || item.NOMBRE || '').replace(/'/g, "\\'");
        const clickAction = !isRevestimientos
            ? `onclick="selectStockItem('${itemSku}', ${item.STOC_CANTIDAD || 0}, ${item.MATE_ID_MATE || 0}, '${safeName}')"`
            : `style="cursor: default; opacity: 0.8;"`;

        return `
        <div class="list-item" ${clickAction}>
            <div>
                <strong>${itemSku || 'Sin Nombre'}</strong>
                <div style="font-size: 0.75rem; color: #64748b; margin-bottom: 2px;">${item.MATE_NOMBRE || item.NOMBRE || ''}</div>
                <div class="text-sm text-muted">
                    Stock: ${item.STOC_CANTIDAD || 0} ${remainingDisplay}
                </div>
            </div>
            ${!isRevestimientos ? '<button class="btn btn-sm btn-primary">+</button>' : '<span class="badge bg-orange" style="cursor:not-allowed">VER</span>'}
        </div>
        `;
    }).join('');
}

function switchMainTab(tabId) {
    // Esconder todo
    document.querySelectorAll('.tab-pane').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(el => el.classList.remove('active'));

    // Activar lo seleccionado
    const selectedTab = document.getElementById(`tab-${tabId}`);
    if (selectedTab) selectedTab.classList.add('active');

    const selectedBtn = document.querySelector(`.nav-tab[onclick="switchMainTab('${tabId}')"]`);
    if (selectedBtn) selectedBtn.classList.add('active');

    // Fetch contextual data if needed
    if (tabId === 'logistica') {
        fetchProcessedCages();
        fetchDespachosLozametal();
        fetchTrackingBoard();
    } else if (tabId === 'fabrica') {
        fetchStock();
        fetchActiveRemitos();
        fetchAltasRecientes();
    } else if (tabId === 'lozametal') {
        fetchPendientesLozametal();
        fetchStockLozametal();
    } else if (tabId === 'calidad') {
        fetchStockLozametal();
        renderCalidadBasket();
    } else if (tabId === 'admin') {
        renderGuiasCosto();
        renderDiscrepancias();
    }
}

function toggleStockView(view) {
    const btnFab = document.getElementById('btn-fabrica');
    const btnRev = document.getElementById('btn-revestimientos');

    if (view === 'FABRICA') {
        btnFab.classList.add('active', 'btn-primary');
        btnRev.classList.remove('active', 'btn-primary');
    } else {
        btnRev.classList.add('active', 'btn-primary');
        btnFab.classList.remove('active', 'btn-primary');
    }
    fetchStock();
}

async function selectStockItem(sku, maxQty, mateIdFromStock, name = "") {
    if (!activeRemito) {
        await showModal("Atención", "Primero crea o selecciona una Jaula.");
        return;
    }

    const isRevestimientos = document.getElementById('btn-revestimientos')?.classList.contains('active');
    if (isRevestimientos) {
        await showModal("Acción restringida", "⚠️ No puedes agregar items desde la vista 'Jaulas Cerradas'. Solo desde 'Fábrica'.", "warning");
        return;
    }

    const jaulaTitle = activeRemito.obs || `Jaula`;
    const msg = `Agregar <b>${sku}</b> a: <b>${jaulaTitle}</b><br>Disponible: ${maxQty}<br>Ingresa cantidad:`;
    const qtyStr = await showPrompt("Agregar Item", msg, String(maxQty), "number");
    if (!qtyStr) return;

    const qty = parseInt(qtyStr);
    if (isNaN(qty) || qty <= 0) {
        await showModal("Error", "Cantidad inválida.", "error");
        return;
    }

    // Calcula cantidad que ya se agregó a la jaula (en el servidor)
    const currentServerQty = (activeRemito.serverItems || [])
        .filter(i => (i.MATE_CODIGO || i.CODIGO) === sku)
        .reduce((sum, i) => sum + Number(i.DERI_CANTIDAD || 0), 0);

    if (qty + currentServerQty > maxQty) {
        const remaining = maxQty - currentServerQty;
        await showModal("Stock Insuficiente", `⚠️ NO TIENES ESA CANTIDAD EN STOCK.<br><br>Stock Total: ${maxQty}<br>Ya en la jaula: ${currentServerQty}<br>Disponible para agregar: <b>${remaining}</b>`, "error");
        return;
    }

    // Guardado Directo
    await guardarUnItemDirecto({
        sku: sku,
        qty: qty,
        mateId: mateIdFromStock || null,
        name: name
    });
}

async function guardarUnItemDirecto(item) {
    showLoading(true);
    updateStatus(`Guardando ${item.sku}...`);

    try {
        let realId = item.mateId;

        // Si no tiene ID, lo buscamos
        if (!realId) {
            const art = await YiQi.searchArticle(item.sku);
            if (art) {
                realId = art.MATE_ID_MATE || art.id || art.ID || art.MATE_ID;
            }
        }

        if (!realId) {
            throw new Error(`No se pudo encontrar el ID para ${item.sku}`);
        }

        const yiQiItem = {
            "CANTIDAD": Number(item.qty),
            "DERI_CANTIDAD": String(item.qty),
            "DERI_NRO_SERIE": "",
            "CODIGO": item.sku,
            "NOMBRE": item.name || item.sku,
            "MATE_ID_MATE": realId,
            "CODIGO_EN_EL_PROVEED": null,
            "COD_PROV_2": null,
            "ID_UNIVERSAL": null
        };

        const success = await YiQi.saveChildInstances(activeRemito.id, [yiQiItem]);
        
        if (success) {
            updateStatus("✅ Ítem guardado.");
            await fetchRemitoItems(activeRemito.id); // Refresh table
        } else {
            throw new Error("Error en la respuesta de YiQi.");
        }
    } catch (e) {
        console.error(e);
        await showModal("Error al Guardar", `No se pudo guardar el ítem automáticamente:<br>${e.message}`, "error");
    } finally {
        showLoading(false);
    }
}

async function crearNuevoRemito() {
    // Limpiar restos de cualquier jaula previa
    clearActiveRemito();

    // 1. Obtener el siguiente número externo disponible
    const nextExtNum = getCurrentRemitoSeq() + 1;

    // 2. Ask for Numeric Cage ID
    const rawInput = await showPrompt(
        "Nueva Jaula", 
        `Ingrese el <b>NÚMERO DE JAULA</b>:<br><small style="color:var(--text-muted)">Se asignará Remito Externo: <b>${nextExtNum}</b></small>`, 
        "", 
        "number"
    );

    if (rawInput === null) return; // User cancelled

    // 3. Validate it's a number
    if (!rawInput || isNaN(rawInput) || !/^\d+$/.test(rawInput.trim())) {
        await showModal("Error", "⚠️ Debe ingresar solo caracteres numéricos para el número de jaula.", "error");
        return;
    }

    const jaulaNum = rawInput.trim();
    const obs = `Jaula N° ${jaulaNum}`;
    const trueExtNum = getNextRemitoSeq(); // Consumir el número de la secuencia

    showLoading(true, "Creando jaula...");
    // Enviamos trueExtNum como el Nro Remito Externo real
    const newId = await YiQi.saveHeader({ observacion: obs }, YIQI_CONFIG.depoFabricaId, YIQI_CONFIG.depoRevestimientosId, trueExtNum);

    if (newId) {
        // POLL LOOP: Re-validar datos durante unos segundos
        let attempts = 0;
        const maxAttempts = 6;
        let foundValid = false;

        showLoading(true, "Verificando datos de jaula...");

        while (attempts < maxAttempts) {
            await fetchActiveRemitos();
            const newRemito = remitos.find(r => r.id == newId);
            
            // Verificamos que ya tenga capturado el nroRemitoExterno correcto
            if (newRemito && String(newRemito.nroRemitoExterno) === String(trueExtNum)) {
                foundValid = true;
                break;
            }

            attempts++;
            if (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 1000));
            }
        }
        
        showLoading(false);

        const finalRemito = remitos.find(r => r.id == newId) || { 
            id: newId, 
            obs: obs, 
            nroComprobante: "Generando...", 
            nroRemitoExterno: trueExtNum, 
            status: 'OPEN' 
        };

        await showModal("Éxito", `Jaula <b>${jaulaNum}</b> creada con éxito.<br>Nro Interno: ${finalRemito.nroComprobante}<br>Nro Externo: <b>${finalRemito.nroRemitoExterno}</b>`, "success");
        setActiveRemito(finalRemito);
        renderRemitos();
    } else {
        showLoading(false);
        showModal("Error", "Error al crear la Jaula.", "error");
    }
}

function renderRemitos() {
    const list = document.getElementById('remito-list');
    list.innerHTML = remitos.map(r => `
        <div class="remito-card ${activeRemito && activeRemito.id === r.id ? 'active' : ''}" onclick="selectRemito(${r.id})">
            <div class="flex-between">
                <strong style="font-size:1.1rem;">${r.obs || "Jaula"}</strong>
                <span class="text-muted" style="font-size: 0.85rem; flex-grow: 1; text-align: center;">
                    ${(r.nroComprobante && r.nroComprobante !== "undefined") ? r.nroComprobante : "S/N"}
                </span>
                <div style="display: flex; align-items: center; gap: 5px;">
                    <span class="badge bg-green">ABIERTO</span>
                    <button class="btn btn-sm btn-danger" onclick="cancelarRemito(event, ${r.id}, '781', 118453)" title="Cancelar Remito" style="padding: 2px 6px; font-size: 0.8rem;">✕</button>
                </div>
            </div>
             ${r.nroComprobante === "S/N" ? `<div class="text-sm text-muted text-end" style="font-size:0.75rem;">Ref: #${r.id}</div>` : ''}
        </div>
    `).join('');
}

function selectRemito(id) {
    const r = remitos.find(x => x.id === id);
    if (r) setActiveRemito(r);
}

function clearActiveRemito() {
    activeRemito = null;
    activeRemitoItems = [];
    
    // Ocultar badges de cabecera
    const idBadge = document.getElementById('active-remito-id');
    if (idBadge) {
        idBadge.innerText = "";
        idBadge.style.display = 'none';
    }
    
    const jaulaBadge = document.getElementById('active-jaula-badge');
    if (jaulaBadge) {
        jaulaBadge.innerText = "";
        jaulaBadge.style.display = 'none';
    }

    // Resetear paneles
    const detailPanel = document.getElementById('detail-panel');
    if (detailPanel) detailPanel.style.display = 'none';
    
    const emptyState = document.getElementById('empty-state');
    if (emptyState) emptyState.style.display = 'flex';

    renderRemitos();
    renderStock();
}

function setActiveRemito(remito) {
    activeRemito = remito;
    activeRemitoItems = [];
    activeRemito.serverItems = [];

    const displayNum = (remito.nroComprobante && remito.nroComprobante !== "S/N" && remito.nroComprobante !== "undefined") ? remito.nroComprobante : `ID: ${remito.id}`;

    // Extract "Jaula N° XXX" from observation if present
    let jaulaText = "Jaula N° --";
    if (remito.obs && remito.obs.includes("Jaula N°")) {
        const match = remito.obs.match(/Jaula N°\s*\d+/);
        if (match) jaulaText = match[0];
    } else if (remito.obs) {
        // Fallback if user manually entered something else, though logically restricted now
        // jaulaText = remito.obs; 
        // Keep "Jaula N° --" if pattern doesn't match to enforce UI consistency or display raw obs?
        // User asked to always show "Jaula N°", so let's try to extract number or just show obs if it's short.
        jaulaText = remito.obs;
    }

    // Update Internal ID Badge (Right side)
    document.getElementById('active-remito-id').innerText = displayNum;
    document.getElementById('active-remito-id').style.display = 'block';

    // Update Center Badge (Cage Number)
    const badge = document.getElementById('active-jaula-badge');
    if (badge) {
        badge.innerText = jaulaText;
        badge.style.display = 'block';
    }

    document.getElementById('detail-panel').style.display = 'flex';
    document.getElementById('empty-state').style.display = 'none';

    renderRemitos();
    renderActiveRemitoItems();
    renderStock();

    document.getElementById('remito-items').innerHTML = `
        <div class="text-center p-4">
            <div class="spinner-border text-primary" role="status"></div>
            <div class="text-muted mt-2">Cargando items...</div>
        </div>
    `;
    fetchRemitoItems(remito.id);
}

async function fetchRemitoItems(remitoId) {
    const serverItems = await YiQi.getChildItems(remitoId);
    if (serverItems) {
        activeRemito.serverItems = serverItems;
        renderActiveRemitoItems();
        renderStock();
    }
}

function renderActiveRemitoItems() {
    const list = document.getElementById('remito-items');
    let html = '';

    if (activeRemitoItems.length > 0) {
        html += `<div class="text-sm text-muted" style="padding:0.5rem; border-bottom:1px solid #eee;">Pendientes de guardar:</div>`;
        html += activeRemitoItems.map((item, idx) => {
            const displayName = item.name ? `<b>${item.sku}</b> - ${item.name}` : `<b>${item.sku}</b>`;
            return `
            <div class="list-item" style="background: #fff3cd;">
                <span>${displayName}</span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <strong>${item.qty} (Pend.)</strong>
                    <button class="btn btn-sm btn-danger" onclick="deletePendingItem(${idx})" style="padding:0px 8px;" title="Borrar">✕</button>
                </div>
            </div>
            `;
        }).join('');
    }

    if (activeRemito && activeRemito.serverItems && activeRemito.serverItems.length > 0) {
        html += `<div class="text-sm text-muted" style="padding:0.5rem; border-bottom:1px solid #eee; margin-top:0.5rem;">Guardados en YiQi:</div>`;
        html += activeRemito.serverItems.map(item => {
            const sku = item.MATE_CODIGO || item.CODIGO || "";
            const name = item.MATE_NOMBRE || item.DERI_NOMBRE_ARTICULO || item.NOMBRE || "";
            const fallback = item.MATE_NOMBRE || item.MATE_CODIGO || item.CODIGO || 'Item';
            const displayName = (sku && name && sku !== name) ? `<b>${sku}</b> - ${name}` : `<b>${fallback}</b>`;

            return `
            <div class="list-item">
                <span>${displayName}</span>
                <div style="display:flex; align-items:center; gap:10px;">
                    <strong>${item.DERI_CANTIDAD}</strong>
                    <button class="btn btn-sm btn-danger" onclick="deleteSavedItem(${item.ID || item.id})" style="padding:0px 8px;" title="Borrar de YiQi">✕</button>
                </div>
            </div>
            `;
        }).join('');
    }

    if (html === '') html = `<p class="text-muted text-center p-3">Sin items.</p>`;
    list.innerHTML = html;

    const total = (activeRemitoItems.length) + (activeRemito.serverItems ? activeRemito.serverItems.length : 0);
    document.getElementById('total-items').innerText = total;

    // Inject Footer Logic
    const footer = document.getElementById('remito-actions');
    if (footer) {
        const hasSavedItems = activeRemito.serverItems && activeRemito.serverItems.length > 0;
        const hasPendingItems = activeRemitoItems.length > 0;

        if (hasSavedItems || hasPendingItems) {
            footer.innerHTML = `
                <div style="display:flex; gap:10px; justify-content: flex-end;">
                     ${hasPendingItems ? `<button class="btn btn-primary" onclick="guardarItemsEnYiqi()">💾 Guardar Pendientes</button>` : ''}
                     ${hasSavedItems ? `<button class="btn btn-danger" onclick="cerrarJaula()">🔒 Cerrar Jaula</button>` : ''}
                </div>
            `;
        } else {
            footer.innerHTML = `<p class="text-center text-muted" style="font-size:0.8rem; margin:0;">Agregue ítems del stock para comenzar.</p>`;
        }
    }

    // Actualiza visualmente los paréntesis en el Stock cada vez que los items cambian.
    renderStock();
}

async function cerrarJaula() {
    if (!activeRemito) return;

    // Extract Cage Number for better UX
    let jaulaNum = "?";
    if (activeRemito.obs && activeRemito.obs.includes("Jaula N°")) {
        const match = activeRemito.obs.match(/Jaula N°\s*(\d+)/);
        if (match) jaulaNum = match[1];
    } else {
        jaulaNum = activeRemito.id;
    }

    // Build Item Summary
    let totalUnits = 0;
    let summaryHtml = `
        <div style="text-align:left; margin-top:1rem; border:1px solid #eee; border-radius:4px; overflow:hidden;">
            <table style="width:100%; border-collapse: collapse; font-size:0.85rem;">
                <thead style="background:#f1f5f9; color:#64748b;">
                    <tr>
                        <th style="padding:6px 8px; text-align:left;">Item</th>
                        <th style="padding:6px 8px; text-align:right;">Cant.</th>
                    </tr>
                </thead>
                <tbody>`;

    if (activeRemito.serverItems && activeRemito.serverItems.length > 0) {
        activeRemito.serverItems.forEach(item => {
            // Robust SKU extraction
            const sku = item.MATE_CODIGO || item.CODIGO || "";
            const name = item.MATE_NOMBRE || item.DERI_NOMBRE_ARTICULO || item.NOMBRE || "";
            const fallback = item.CODIGO || item.MATE_NOMBRE || item.MATE_CODIGO || item.NOMBRE || 'Item Desconocido';
            const displayName = (sku && name && sku !== name) ? `<b>${sku}</b> - ${name}` : `${fallback}`;
            
            const qty = Number(item.DERI_CANTIDAD || item.CANTIDAD || 0);

            totalUnits += qty;
            summaryHtml += `
                <tr style="border-bottom:1px solid #eee;">
                    <td style="padding:6px 8px;">${displayName}</td>
                    <td style="padding:6px 8px; text-align:right; font-weight:bold;">${qty}</td>
                </tr>`;
        });
    } else {
        summaryHtml += '<tr><td colspan="2" style="padding:10px; text-align:center; color:#999;">Sin items.</td></tr>';
    }

    summaryHtml += `
                <tr style="background:#f8fafc; font-weight:bold;">
                    <td style="padding:6px 8px; text-align:right;">TOTAL UNIDADES</td>
                    <td style="padding:6px 8px; text-align:right;">${totalUnits}</td>
                </tr>
            </tbody>
        </table>
    </div>`;

    if (!await showConfirm("Cerrar y Rotular", `
        <div style="text-align:center; margin-bottom:10px;">
            ¿Confirmas cerrar la <b>Jaula ${jaulaNum}</b>?
        </div>
        ${summaryHtml}
    `)) return;

    showLoading(true);
    try {
        await YiQi.closeCage(activeRemito.id);
        showLoading(false);
        await showModal("Jaula Cerrada", `✅ Jaula <b>${jaulaNum}</b> cerrada y rotulada correctamente.<br>Lista para Logística.`, "success");

        // Refresh and Clear View
        await fetchActiveRemitos();
        clearActiveRemito(); // Limpia badges de cabecera, items y paneles de forma centralizada
        fetchStock();    // Update stock counts

    } catch (e) {
        showLoading(false);
        console.error(e);
        showModal("Error Critico", `No se pudo cerrar la jaula:<br>${e.message}`, "error");
    }
}

// RESTORED + UPDATED LOGIC: Search on Save
async function guardarItemsEnYiqi() {
    if (!activeRemito || activeRemitoItems.length === 0) {
        await showModal("Atención", "No hay items para guardar.", "warning");
        return;
    }

    showLoading(true);

    const resolvedItems = [];
    const missingIds = [];

    // Process all items sequentially to resolve IDs
    for (const item of activeRemitoItems) {
        let realId = item.mateId;

        // If no ID (was null in Stock), try to find it now
        if (!realId) {
            console.log(`🔎 Buscando ID para ${item.sku}...`);
            // Search API
            const art = await YiQi.searchArticle(item.sku);
            if (art) {
                // User logs show the ID is in 'MATE_ID_MATE'
                realId = art.MATE_ID_MATE || art.id || art.ID || art.MATE_ID;
                console.log(`✅ ID Encontrado: ${realId}`);
            } else {
                console.warn(`❌ ID no encontrado para ${item.sku}`);
                missingIds.push(item.sku);
            }
        }

        if (realId) {
            resolvedItems.push({
                qty: item.qty,
                sku: item.sku,
                mateId: realId
            });
        }
    }

    if (missingIds.length > 0) {
        showLoading(false);
        await showModal("Error de Datos", `No se pudo encontrar el ID para:<br><b>${missingIds.join(', ')}</b><br>Verifica que existan en Artículos.`, "error");
        return;
    }

    // Build Payload
    // Build Payload
    const yiQiItems = resolvedItems.map(i => ({
        "CANTIDAD": Number(i.qty),
        "DERI_CANTIDAD": String(i.qty), // Backup, though likely ignored
        "DERI_NRO_SERIE": "",
        "CODIGO": i.sku,
        "NOMBRE": i.sku,
        "MATE_ID_MATE": i.mateId, // Real ID
        "CODIGO_EN_EL_PROVEED": null,
        "COD_PROV_2": null,
        "ID_UNIVERSAL": null
    }));

    const success = await YiQi.saveChildInstances(activeRemito.id, yiQiItems);
    showLoading(false);

    if (success) {
        await showModal("Éxito", "Items guardados correctamente.", "success");
        activeRemitoItems = [];
        await fetchRemitoItems(activeRemito.id);
    } else {
        showModal("Error", "Error al guardar. Intenta nuevamente.", "error");
    }
}

function updateStatus(msg) {
    const el = document.getElementById('status-indicator');
    if (el) el.title = msg; // Update tooltip
    
    // Si el loading overlay está activo, actualizamos su texto para dar feebdack
    const overlay = document.getElementById('loading-overlay');
    if (overlay && overlay.style.display === 'flex') {
        const p = overlay.querySelector('p');
        if (p) p.innerHTML = `<span style="font-size:1.1rem;">${msg}</span>
                              <div style="width:100%; height:4px; border-radius:2px; background:#e2e8f0; margin-top:10px; overflow:hidden;">
                                  <div style="width:100%; height:100%; background:var(--primary-color); animation: indeterminateProgress 1.5s infinite linear;"></div>
                              </div>`;
    }

    console.log("STATUS:", msg);
}

function deletePendingItem(index) {
    activeRemitoItems.splice(index, 1);
    renderActiveRemitoItems();
}

async function deleteSavedItem(childId) {
    if (!await showConfirm("Confirmar", "¿Eliminar item de YiQi?")) return;

    showLoading(true);
    const success = await YiQi.deleteItem(childId);
    showLoading(false);

    if (success) {
        await fetchRemitoItems(activeRemito.id);
    } else {
        showModal("Error", "No se pudo eliminar el item.", "error");
    }
}

async function cancelarRemito(e, id, entityId = "781", transitionId = 118453) {
    e.stopPropagation();
    if (!await showConfirm("Cancelar", "¿Estás seguro de cancelar este remito completo?")) return;

    showLoading(true);
    await YiQi.executeTransition(entityId, id, transitionId);
    showLoading(false);

    // Refresh
    await fetchActiveRemitos();
    renderRemitos();
    if (activeRemito && activeRemito.id === id) {
        clearActiveRemito(); // Limpia badges de cabecera y paneles
    }
}

function showLoading(show, defaultMessage = "Procesando...") {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = show ? 'flex' : 'none';
        if (show) {
            const p = overlay.querySelector('p');
            if (p) p.innerText = defaultMessage;
        }
    }
}

// Initial Load
document.addEventListener('DOMContentLoaded', init);

// --- LOGISTICS LOGIC ---

async function fetchProcessedCages() {
    const list = document.getElementById('logistica-cages-list');
    list.innerHTML = '<p class="text-muted text-center" style="padding:1rem;">Cargando Jaulas Armadas...</p>';

    // Fetch List
    const logisticsRemitos = await fetchLogisticsRemitos();

    if (logisticsRemitos.length > 0) {
        updateStatus(`Cargando items de ${logisticsRemitos.length} jaulas...`);

        // Fetch Items for ALL cages in parallel (with concurrency limit)
        const chunk = (arr, size) => Array.from({ length: Math.ceil(arr.length / size) }, (v, i) => arr.slice(i * size, i * size + size));
        const batches = chunk(logisticsRemitos, 5); // 5 at a time

        for (const batch of batches) {
            await Promise.all(batch.map(async (r) => {
                try {
                    r.serverItems = await YiQi.getChildItems(r.id) || [];
                } catch (e) {
                    console.error(`Failed to fetch items for Cage ${r.id}`, e);
                    r.serverItems = [];
                }
            }));
        }
    }

    processedCages = logisticsRemitos;

    if (processedCages.length === 0) {
        console.warn("No logistics remitos found.");
    }

    renderLogisticsCages();
}

function renderLogisticsCages() {
    const list = document.getElementById('logistica-cages-list');

    if (processedCages.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:1rem;">No se encontraron jaulas armadas.</p>`;
        return;
    }

    list.innerHTML = processedCages.map(r => {
        const isSelected = selectedCages.some(c => c.id === r.id);

        // Generate Content Summary: "Qty x SKU"
        let summary = `<span class="text-muted" style="font-style:italic;">Sin items</span>`;

        if (r.serverItems && r.serverItems.length > 0) {
            // Aggregate if multiple lines for same SKU? Usually 1 line per SKU.
            // Just map them.
            summary = r.serverItems.map(i => {
                // Prioritize DERI_CANTIDAD as per recent fix
                const qty = Number(i.DERI_CANTIDAD || i.CANTIDAD || 0);
                const sku = i.MATE_CODIGO || i.CODIGO || i.NOMBRE || "Item";
                // Formatting: "5 x ELZ-L60402"
                return `<b style="color:#333;">${qty}</b> <span style="color:#666;">x ${sku}</span>`;
            }).join('<br>'); // New line for each item? Or comma? User said "ID la cantidad y el sku".
            // Since it might be many, let's use <br> for clarity or comma if list is short.
            // "en la misma tipografia y color que ahora tenemos el ID" -> small text.
            // If many items, maybe truncate?
            // Let's assume few items per cage.
        }

        const nroExtLabel = r.nroRemitoExterno || r.yiqiData?.REIN_NRO_EXTERNO || "";
        const printLabel = nroExtLabel ? `R:${nroExtLabel}` : ((r.nroComprobante && r.nroComprobante !== "undefined") ? r.nroComprobante : "S/N");

        const destinationName = r.yiqiData?.CED1_NOMBRE || "Mustang"; // Default fallback
        const isMustang = destinationName.toLowerCase().includes('mustang');
        const destBadge = isMustang 
            ? `<span class="badge" style="background: #eff6ff; color: #3b82f6; border: 1px solid #bfdbfe; cursor: pointer; font-size: 0.85rem;" onclick="event.stopPropagation(); toggleCageDestination(${r.id}, '${destinationName}')">🚚 Mustang</span>`
            : `<span class="badge" style="background: #fff7ed; color: #ea580c; border: 1px solid #ffedd5; cursor: pointer; font-size: 0.85rem;" onclick="event.stopPropagation(); toggleCageDestination(${r.id}, '${destinationName}')">🏢 Lozametal</span>`;

        return `
        <div class="remito-card ${isSelected ? 'selected' : ''}" onclick="toggleCageSelection(${r.id})">
            <div class="flex-between">
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events:none;">
                    <strong style="font-size:1.1rem;">${r.obs || "Jaula ?"}</strong>
                </div>
                <div style="display:flex; gap: 6px; align-items: center;">
                    ${destBadge}
                    <button class="btn btn-sm btn-outline print-btn" 
                            onclick="event.stopPropagation(); printCageLabel(${r.id})" 
                            style="font-size: 0.75rem; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; background: white;"
                            title="Imprimir Rótulo">
                        🖨️ ${printLabel}
                    </button>
                </div>
            </div>
             <div class="text-end" style="font-size:0.75rem; margin-top:6px; line-height:1.2;">
                ${summary}
             </div>
        </div>
        `;
    }).join('');

    updateLogisticsSummary();
}

function toggleCageSelection(id) {
    const cage = processedCages.find(c => c.id === id);
    if (!cage) return;

    const idx = selectedCages.findIndex(c => c.id === id);
    if (idx >= 0) {
        selectedCages.splice(idx, 1);
    } else {
        selectedCages.push(cage);
    }

    renderLogisticsCages();
}

async function toggleCageDestination(id, currentName) {
    const isMustang = currentName.toLowerCase().includes('mustang');
    const newDestId = isMustang ? YIQI_CONFIG.depoPlayaLozametalId : YIQI_CONFIG.depoMustangId;
    
    // Optimistic UI? Or search for card to show loading?
    // Let's just show status update
    updateStatus(`Cambiando destino de jaula ${id}...`);
    
    try {
        const payload = {
            "4182": newDestId
        };
        
        const success = await YiQi.updateHeader(id, payload);
        if (success) {
            console.log(`✅ Destino de Jaula ${id} actualizado a ${newDestId}`);
            // Recargar para ver el cambio
            await fetchProcessedCages();
        } else {
            showModal("Error", "No se pudo actualizar el destino en YiQi.", "error");
        }
    } catch (e) {
        console.error("Error toggling destination:", e);
        showModal("Error", "Ocurrió un error al intentar cambiar el destino.", "error");
    }
}

function toggleSelectAllCages() {
    if (processedCages.length === 0) return;

    // If all are already selected, deselect all. Otherwise, select all.
    const allSelected = processedCages.every(r => selectedCages.some(s => s.id === r.id));

    if (allSelected) {
        // Deselect all from this screen
        selectedCages = selectedCages.filter(s => !processedCages.some(r => r.id === s.id));
    } else {
        // Add all from this screen (unique)
        processedCages.forEach(r => {
            if (!selectedCages.some(s => s.id === r.id)) {
                selectedCages.push(r);
            }
        });
    }

    renderLogisticsCages();
}

// --- RECEPCIÓN LOZAMETAL (COLUMNA 1) ---
async function fetchPendientesLozametal() {
    const btnRefresh = document.querySelector('button[onclick="fetchPendientesLozametal()"]');
    if (btnRefresh) btnRefresh.classList.add('spin');
    try {
        updateStatus("Buscando jaulas en tránsito...");
        // 1. Cargamos lo que está viniendo a PLAYA (189 -> 191 o 191 -> 190)
        const rawPendientes = await YiQi.fetch(YIQI_CONFIG.smartiePendientesLozametal, YIQI_CONFIG.entityRemito);
        pendientesLozametal = (rawPendientes || []).map(r => ({
            id: r.ID || r.id,
            nroComprobante: r.REIN_NRO_REMITO_INTERNO || r.NUMERO_COMPROBANTE || r.REIN_ASIGNAR_NRO_COMPR || "S/N",
            nroRemitoExterno: r.REIN_NRO_EXTERNO || "",
            fecha: r.AUDI_FECHA_MODIF || r.AUDI_FECHA_ALTA || "",
            obs: r.REIN_OBSERVACION || r.rein_observacion || r.OBSERVACION || "Sin Observaciones",
            yiqiData: r,
            serverItems: null
        }));

        // 2. Cargamos lo que YA ESTÁ en PLAYA esperando revisión (190 -> 157)
        updateStatus("Cargando jaulas en Playa...");
        const rawPlaya = await YiQi.fetch(YIQI_CONFIG.smartieRecepcionPlaya, YIQI_CONFIG.entityRemito);
        jaulasEnPlaya = (rawPlaya || []).map(r => ({
            id: r.ID || r.id,
            nroComprobante: r.REIN_NRO_REMITO_INTERNO || r.NUMERO_COMPROBANTE || r.REIN_ASIGNAR_NRO_COMPR || "S/N",
            nroRemitoExterno: r.REIN_NRO_EXTERNO || "",
            fecha: r.AUDI_FECHA_MODIF || r.AUDI_FECHA_ALTA || "",
            obs: r.REIN_OBSERVACION || r.rein_observacion || r.OBSERVACION || "Sin Observaciones",
            yiqiData: r,
            serverItems: null
        }));

        renderPendientesLozametal();
        renderJaulasEnPlaya();
    } catch (e) {
        console.error("Error fetching Lozametal data:", e);
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('spin');
    }
}

function renderPendientesLozametal() {
    const list = document.getElementById('lozametal-pendientes-list');
    const footer = document.getElementById('pendientes-footer');
    const countTag = document.getElementById('pendientes-count');
    if (!list) return;

    if (pendientesLozametal.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:1rem;">No hay remitos pendientes de recepción.</p>`;
        if (footer) footer.style.display = 'none';
        return;
    }

    list.innerHTML = pendientesLozametal.map(d => {
        const isSelected = selectedPendientes.some(s => s.id === d.id);
        
        let fechaFormat = d.fecha;
        if (fechaFormat.includes('T')) {
            const parts = fechaFormat.split('T');
            fechaFormat = parts[0].split('-').reverse().join('/') + ' ' + parts[1].substring(0, 5);
        }

        const nroExt = d.nroRemitoExterno || d.yiqiData?.REIN_NRO_EXTERNO || "";
        const badgeLabel = nroExt ? `R:${nroExt}` : `#${d.nroComprobante}`;

        return `
        <div class="remito-card ${isSelected ? 'selected' : ''}" style="cursor:pointer;" onclick="togglePendienteSelection('${d.id}')">
            <div class="flex-between">
                <div style="display:flex; align-items:center; gap:10px;">
                    <input type="checkbox" ${isSelected ? 'checked' : ''} style="pointer-events:none;">
                    <strong>${d.obs}</strong>
                </div>
                <div style="display:flex; gap: 4px; align-items: center;">
                    <button class="btn btn-sm btn-outline print-btn" onclick="event.stopPropagation(); printCageLabel('${d.id}')" style="font-size: 0.75rem; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; background: white;" title="Imprimir Rótulo">🖨️ ${badgeLabel}</button>
                </div>
            </div>
            <div class="text-sm text-muted" style="margin-top:0.5rem; display:flex; justify-content:space-between; margin-left: 24px;">
                <span>📅 ${fechaFormat}</span>
                <span style="font-size: 0.8rem; font-weight: 600; color: #f59e0b;">En Tránsito</span>
            </div>
        </div>
        `;
    }).join('');

    if (selectedPendientes.length > 0) {
        countTag.innerText = selectedPendientes.length;
        footer.style.display = 'block';
    } else {
        footer.style.display = 'none';
    }
}

function togglePendienteSelection(id) {
    const p = pendientesLozametal.find(x => String(x.id) === String(id));
    if (!p) return;

    const idx = selectedPendientes.findIndex(s => String(s.id) === String(id));
    if (idx >= 0) {
        selectedPendientes.splice(idx, 1);
    } else {
        selectedPendientes.push(p);
    }
    renderPendientesLozametal();
}

function toggleSelectAllPendientes() {
    if (pendientesLozametal.length === 0) return;
    const allSelected = pendientesLozametal.every(r => selectedPendientes.some(s => s.id === r.id));

    if (allSelected) {
        selectedPendientes = [];
    } else {
        pendientesLozametal.forEach(r => {
            if (!selectedPendientes.some(s => s.id === r.id)) {
                selectedPendientes.push(r);
            }
        });
    }
    renderPendientesLozametal();
}

async function procesarRecepcionBultosMasiva() {
    if (selectedPendientes.length === 0) return;

    if (!await showConfirm("Confirmar Recepción", `¿Confirmar la recepción física de ${selectedPendientes.length} bultos? Esto los ingresará a Lozametal PL.`)) return;

    showLoading(true);
    const token = await YiQi.getToken();
    
    try {
        if (!token) throw new Error("No se pudo obtener el token de autenticación.");

        // PASO Juntos: Procesamiento Atómico Individual (Transición, Comentarios y Clonación)
        let successCount = 0;
        let failCount = 0;

        for (const p of selectedPendientes) {
            try {
                updateStatus(`Procesando recepción de jaula ${p.id}...`);

                // PASO 1: Transición Individual (Enviado → Procesado)
                await processRemitoTransitions([String(p.id)], updateStatus, false);
                
                // PASO 2.1: Agregar comentario con fecha y hora de recepción
                try {
                    const now = new Date();
                    const timestamp = now.toLocaleDateString('es-AR') + ' ' + now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                    await YiQi.addComment(YIQI_CONFIG.entityRemito, p.id, `FECHA RECEPCIÓN: ${timestamp}`);
                } catch (errComm) {
                    console.warn("No se pudo agregar el comentario de recepción:", errComm);
                }

                // PASO 2.2: Clonar automáticamente para el tramo Playa (190) -> Final (157)
                updateStatus(`Creando tramo PL -> Lozametal para jaula ${p.id}...`);
                const nroExtPL = p.nroRemitoExterno || p.yiqiData?.REIN_NRO_EXTERNO || null;
                await YiQi.cloneRemito(p.id, YIQI_CONFIG.depoPlayaLozametalId, YIQI_CONFIG.depoLozametalId, p.obs, nroExtPL);
                
                successCount++;
                
                // Pequeño delay entre clones
                await new Promise(r => setTimeout(r, 500));
            } catch (e) {
                console.error(`Error en procesamiento individual de jaula ${p.id}:`, e);
                failCount++;
            }
        }

        // Finalización
        if (successCount > 0) {
            selectedPendientes = [];
            await fetchPendientesLozametal();
            const msg = failCount === 0 
                ? `Se recibieron ${successCount} bultos correctamente.` 
                : `Se recibieron ${successCount} bultos, pero ${failCount} tuvieron inconvenientes.`;
            showModal("Recepción Finalizada", msg, failCount === 0 ? "success" : "warning");
        } else {
            showModal("Atención", "No se pudo completar la recepción de los bultos seleccionados.", "error");
        }

    } catch (err) {
        console.error("Error crítico en recepción masiva:", err);
        showModal("Error Crítico", `Ocurrió un error inesperado: ${err.message}`, "error");
    } finally {
        showLoading(false);
    }
}

// --- JAULAS A REVISAR (COLUMNA 2) ---
function renderJaulasEnPlaya() {
    const list = document.getElementById('lozametal-playa-list');
    const badge = document.getElementById('playa-count-badge');
    if (!list) return;

    badge.innerText = jaulasEnPlaya.length;
    badge.style.display = jaulasEnPlaya.length > 0 ? 'inline-block' : 'none';

    if (jaulasEnPlaya.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:1rem; font-style:italic;">No hay jaulas esperando revisión.</p>`;
        return;
    }

    list.innerHTML = jaulasEnPlaya.map(d => {
        const isActive = activeControlJaula && activeControlJaula.id === d.id;
        
        return `
        <div class="remito-card ${isActive ? 'active' : ''}" style="cursor:pointer;" onclick="viewControlJaula('${d.id}')">
            <div class="flex-between">
                <strong>${d.obs}</strong>
                <div style="display:flex; gap: 4px; align-items: center;">
                    <button class="btn btn-sm btn-outline print-btn" onclick="event.stopPropagation(); printCageLabel('${d.id}')" style="font-size: 0.75rem; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; background: white;" title="Imprimir Rótulo">🖨️</button>
                    <span class="badge bg-blue" style="font-size:0.7rem;">${d.nroRemitoExterno ? 'R:' + d.nroRemitoExterno : '#' + d.nroComprobante}</span>
                </div>
            </div>
            <div class="text-sm text-muted" style="margin-top:0.5rem; display:flex; justify-content:space-between;">
                <span>📦 Bulto Físico Recibido</span>
                <span style="font-size: 0.8rem; font-weight: 600; color: #3b82f6;">Pendiente Control</span>
            </div>
        </div>
        `;
    }).join('');
}

// --- DESCONSOLIDACIÓN Y CONTROL (COLUMNA 3) ---
async function viewControlJaula(id) {
    const jaula = jaulasEnPlaya.find(d => String(d.id) === String(id));
    if (!jaula) return;

    activeControlJaula = jaula;
    renderJaulasEnPlaya(); // Refresh selection focus

    document.getElementById('control-empty-state').style.display = 'none';
    document.getElementById('control-detail-panel').style.display = 'flex';
    
    // Rellenamos número de badge
    const badge = document.getElementById('active-control-badge');
    const nroExtCtrl = jaula.nroRemitoExterno || jaula.yiqiData?.REIN_NRO_EXTERNO || "";
    badge.innerText = nroExtCtrl ? "R:" + nroExtCtrl : "#" + jaula.nroComprobante;
    badge.style.display = 'inline-block';

    const itemsContainer = document.getElementById('control-items');
    itemsContainer.innerHTML = '<p class="text-center text-muted p-4">Cargando ítems reportados por Fábrica...</p>';

    // Load items if not loaded
    if (!jaula.serverItems) {
        let rawItems = await YiQi.getChildItems(id) || [];
        // Setup initial local state for control
        jaula.serverItems = rawItems.map(i => ({
            ...i,
            _controlStatus: null, // null, 'ok', 'diff'
            _diffQty: null,
            _diffNote: null
        }));
    }
    
    if (jaula.serverItems.length === 0) {
        itemsContainer.innerHTML = '<p class="text-center text-muted p-4">El remito no contiene ítems.</p>';
        document.getElementById('btn-finalizar-control').disabled = true;
        return;
    }

    renderControlItems();
}

function renderControlItems() {
    if (!activeControlJaula || !activeControlJaula.serverItems) return;
    
    const itemsContainer = document.getElementById('control-items');
    const items = activeControlJaula.serverItems;

    itemsContainer.innerHTML = items.map((i, index) => {
        const qty = Number(i.DERI_CANTIDAD || i.CANTIDAD || 0);
        const sku = i.MATE_CODIGO || i.CODIGO || i.NOMBRE || "Item";
        const name = i.MATE_NOMBRE || i.DERI_NOMBRE_ARTICULO || "";
        const idItem = i.ID || i.id || index;
        
        const status = i._controlStatus;
        
        let statusHtml = '';
        if (status === 'ok') {
            statusHtml = `<div style="color: #10b981; font-weight: 600; font-size: 0.9rem; align-items:center; display:flex; gap:0.25rem;">✅ Verificado OK</div>
                          <button class="btn btn-sm btn-outline" style="margin-left:auto; padding: 2px 8px; font-size: 0.75rem;" onclick="resetItemControl('${idItem}')">Deshacer</button>`;
        } else if (status === 'diff') {
            statusHtml = `
                <div style="color: #ef4444; font-weight: 600; font-size: 0.9rem; margin-top: 0.5rem; background: #fee2e2; padding: 0.5rem; border-radius: 4px; border: 1px solid #fca5a5; width:100%;">
                    ⚠️ <b>Diferencia Reportada:</b> Recibido <span style="font-size: 1.1em; color: black;">${i._diffQty}</span> unid.<br>
                    <span style="font-size: 0.8rem; font-weight:normal; color:#7f1d1d;">Notas: ${i._diffNote || "Ninguna"}</span>
                    <button class="btn btn-sm btn-outline" style="margin-top:0.25rem; width:100%; padding: 2px 8px; font-size: 0.75rem;" onclick="resetItemControl('${idItem}')">Corregir / Deshacer</button>
                </div>
            `;
        } else {
            // Null / Pendiente
            statusHtml = `
                <div style="display:flex; gap:0.5rem; margin-top: 0.5rem; width:100%;">
                    <button class="btn btn-success" style="flex:1; padding: 0.4rem; font-size: 0.85rem;" onclick="marcarItemOk('${idItem}')">✅ Confirmar Todo OK</button>
                    <button class="btn btn-danger" style="flex:1; padding: 0.4rem; font-size: 0.85rem;" onclick="reportarDiferenciaForm('${idItem}', ${qty})">⚠️ Reportar Diferencia</button>
                </div>
            `;
        }

        let bgStyle = status === 'ok' ? 'background: #f0fdf4; border-left: 4px solid #10b981;' : 
                      status === 'diff' ? 'background: #fffafa; border-left: 4px solid #ef4444;' :
                      'background: white; border-left: 4px solid #cbd5e1;';

        const isAlzElz = (name + sku).toUpperCase().includes('ALZ') || (name + sku).toUpperCase().includes('ELZ');
        const isDd = (name + sku).toUpperCase().includes('DD');
        const materialColor = isAlzElz ? '#0284c7' : (isDd ? '#c2410c' : 'var(--text-main)');

        return `
            <div class="list-item" style="${bgStyle} cursor:default; margin-bottom: 0.75rem; border: 1px solid var(--border-color); display:flex; flex-direction:column;">
                <div style="display:flex; justify-content:space-between; width:100%;">
                    <div>
                        <div style="font-weight: 700; font-size: 0.95rem; color: ${materialColor}; line-height: 1.2;">${name}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">SKU: ${sku}</div>
                    </div>
                    <div style="text-align: right; font-weight: 700; color: var(--text-color); font-size: 1.1rem;">
                        <span style="font-size:0.7rem; color:var(--text-muted); font-weight:normal;">Declarado:</span> ${qty}
                    </div>
                </div>
                <!-- Actions or Status -->
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center; margin-top: 0.25rem;">
                    ${statusHtml}
                </div>
            </div>
        `;
    }).join('');
    
    checkControlCompleto();
}

function marcarItemOk(itemId) {
    if (!activeControlJaula) return;
    const items = activeControlJaula.serverItems;
    const idx = items.findIndex(i => String(i.ID || i.id || items.indexOf(i)) === String(itemId));
    if (idx < 0) return;

    items[idx]._controlStatus = 'ok';
    items[idx]._diffQty = null;
    items[idx]._diffNote = null;
    
    renderControlItems();
}

function resetItemControl(itemId) {
    if (!activeControlJaula) return;
    const items = activeControlJaula.serverItems;
    const idx = items.findIndex(i => String(i.ID || i.id || items.indexOf(i)) === String(itemId));
    if (idx < 0) return;

    items[idx]._controlStatus = null;
    items[idx]._diffQty = null;
    items[idx]._diffNote = null;
    
    renderControlItems();
}

async function reportarDiferenciaForm(itemId, qtyEsperada) {
    const html = `
        <div style="text-align: left; margin-top: 1rem; display: flex; flex-direction: column; gap: 1.25rem;">
            <div style="text-align: center; background: #f8fafc; padding: 1rem; border-radius: 10px; border: 1px solid #e2e8f0; box-shadow: inset 0 2px 4px rgba(0,0,0,0.02);">
                <p style="font-size: 0.9rem; color: #64748b; margin: 0; text-transform: uppercase; letter-spacing: 0.5px; font-weight: 600;">
                    Cantidad Declarada
                </p>
                <p style="font-size: 1.75rem; color: #1e293b; margin: 5px 0 0 0; font-weight: 800;">
                    ${qtyEsperada}
                </p>
            </div>

            <div class="form-group">
                <label class="form-label" style="display: flex; align-items: center; gap: 8px; color: #475569; margin-bottom: 0.6rem;">
                    <span style="background: #eff6ff; padding: 4px; border-radius: 6px;">⚖️</span> 
                    <span style="font-weight: 700;">Cantidad Real Recibida</span>
                </label>
                <input type="number" id="diff-real-qty" class="form-control" value="${qtyEsperada}" min="0" 
                    style="font-size: 1.5rem; font-weight: 800; text-align: center; padding: 1rem; border: 2px solid var(--primary-color); border-radius: 12px; background: #f0f7ff; color: var(--primary-color); box-shadow: 0 4px 6px -1px rgba(37, 99, 235, 0.1);">
                <p style="font-size: 0.75rem; color: #94a3b8; margin-top: 0.5rem; text-align: center; font-style: italic;">
                    Ingrese el total físico contado actualmente
                </p>
            </div>

            <div class="form-group">
                <label class="form-label" style="display: flex; align-items: center; gap: 8px; color: #475569; margin-bottom: 0.6rem;">
                    <span style="background: #fff7ed; padding: 4px; border-radius: 6px;">📝</span> 
                    <span style="font-weight: 700;">Motivo de la diferencia</span>
                </label>
                <textarea id="diff-note" class="form-control" 
                    placeholder="Ej: Llegó material dañado, faltan unidades en el bulto..." 
                    style="width: 100%; height: 110px; font-size: 0.95rem; resize: none; padding: 0.8rem; border: 1px solid #cbd5e1; border-radius: 12px; line-height: 1.5; background: #ffffff; color: #334155; transition: border-color 0.2s; box-sizing: border-box;"></textarea>
            </div>
        </div>
    `;

    const btns = `
        <button class="btn-modal btn-cancel" onclick="Modal.close()">Cancelar</button>
        <button class="btn-modal btn-danger-modal" onclick="guardarDiferencia('${itemId}')">Guardar Diferencia</button>
    `;

    Modal.open('⚠️', 'Reportar Diferencia', html, btns);
    
    setTimeout(() => {
        const input = document.getElementById('diff-real-qty');
        if(input) {
            input.focus();
            input.select();
        }
    }, 100);
}

function guardarDiferencia(itemId) {
    const qtyRaw = document.getElementById('diff-real-qty').value;
    const note = document.getElementById('diff-note').value;
    
    if (qtyRaw.trim() === "") {
        alert("Especifique la cantidad real recibida");
        return;
    }

    if (!activeControlJaula) { Modal.close(); return; }
    
    const items = activeControlJaula.serverItems;
    const idx = items.findIndex(i => String(i.ID || i.id || items.indexOf(i)) === String(itemId));
    if (idx < 0) { Modal.close(); return; }

    items[idx]._controlStatus = 'diff';
    items[idx]._diffQty = Number(qtyRaw);
    items[idx]._diffNote = note;

    Modal.close();
    renderControlItems();
}

function checkControlCompleto() {
    if (!activeControlJaula || !activeControlJaula.serverItems) return;
    const items = activeControlJaula.serverItems;
    const pendientes = items.some(i => i._controlStatus === null);
    
    document.getElementById('btn-finalizar-control').disabled = pendientes;
}

async function finalizarControlJaula() {
    if (!activeControlJaula) return;

    const items = activeControlJaula.serverItems;
    const tieneDiferencias = items.some(i => i._controlStatus === 'diff');

    let confirmMsg = `<p>¿Estás seguro de finalizar el control de esta jaula e ingresarla definitivamente al stock?</p>`;
    if (tieneDiferencias) {
        confirmMsg += `<p style="color:#ef4444; font-weight:bold; margin-top:8px;">⚠️ ATENCIÓN: Se detectaron DIFERENCIAS. Se ajustará el remito final automáticamente.</p>`;
    } else {
        confirmMsg += `<p style="color:#10b981; font-weight:bold; margin-top:8px;">✅ Todo el contenido coincide perfectamente.</p>`;
    }

    if (!await showConfirm("Dar de Alta en Lozametal", confirmMsg)) return;

    showLoading(true);
    
    try {
        const token = await YiQi.getToken();
        if (!token) throw new Error("No hay token de sesión.");

        // Extracción robusta del número de jaula (Soporta Jaula N° 3, Jaula 3, Jaula No 3, etc.)
        const obsText = activeControlJaula.obs || "";
        const cageMatch = obsText.match(/Jaula\s*(?:N[°ºo\.]?\s*)?([a-z0-9\-_]+)/i);
        const cageIdLabel = cageMatch ? cageMatch[1] : activeControlJaula.id;

        // PASO 1: Ajustar cantidades en el remito original (Faltantes y Sobrantes)
        // Lo hacemos PRIMERO porque en estado PENDIENTE YiQi permite cambios sin validar stock aún.
        if (tieneDiferencias) {
            updateStatus("Ajustando cantidades en remito original (Estado Pendiente)...");
            const diffItems = items.filter(i => i._controlStatus === 'diff');
            const failedItems = [];
            
            for (const item of diffItems) {
                const sku = item.MATE_CODIGO || item.CODIGO || "Item";
                let adjusted = false;
                let itemAttempts = 0;
                const maxItemAttempts = 3;

                while (!adjusted && itemAttempts < maxItemAttempts) {
                    itemAttempts++;
                    
                    if (item._diffQty === 0) {
                        // ESTRATEGIA: BORRADO DE RENGLÓN (Más robusto para 0 unidades)
                        updateStatus(`Eliminando ${sku} (Recibido 0)... (${itemAttempts}/${maxItemAttempts})`);
                        const okDel = await YiQi.deleteItem(item.ID || item.id);
                        if (okDel) {
                            adjusted = true;
                            // Sincronizamos el Padre para que YiQi note la ausencia del ítem
                            await YiQi.getInstance(YIQI_CONFIG.entityRemito, activeControlJaula.id);
                        } else {
                            console.warn(`⚠️ Falló eliminación de ${sku} en intento ${itemAttempts}`);
                            if (itemAttempts < maxItemAttempts) await new Promise(r => setTimeout(r, 1500));
                            else failedItems.push(`${sku} (Error al eliminar renglón)`);
                        }
                    } else {
                        // ESTRATEGIA: AJUSTE DE CANTIDAD (Para > 0)
                        updateStatus(`Ajustando ${sku} a ${item._diffQty}... (${itemAttempts}/${maxItemAttempts})`);
                        
                        const qtyUpdatePayload = {
                            schemaId: YIQI_CONFIG.schemaId,
                            ids: [String(item.ID || item.id)],
                            transitionId: 118708,
                            form: `7065=${item._diffQty}`
                        };

                        console.log(`📡 Enviando ajuste para ${sku}:`, qtyUpdatePayload);
                        const res = await fetch(YIQI_CONFIG.executeTransitionUrl, {
                            method: "POST",
                            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                            body: JSON.stringify(qtyUpdatePayload)
                        });

                        const resData = await res.json().catch(() => ({}));
                        console.log(`📥 Respuesta ajuste ${sku}:`, resData);
                        
                        if (res.ok && resData.ok !== false) {
                            adjusted = true;
                            // FORZAR SINCRONIZACION DEL ITEM Y DEL PADRE
                            await YiQi.getInstance(YIQI_CONFIG.entityRemitoItem, item.ID || item.id);
                            await YiQi.getInstance(YIQI_CONFIG.entityRemito, activeControlJaula.id);
                        } else {
                            const err = resData.error || resData.okMessage || "Error desconocido";
                            console.warn(`⚠️ Intento ${itemAttempts} para ${sku} falló:`, err);
                            if (itemAttempts < maxItemAttempts) {
                                await new Promise(r => setTimeout(r, 1500));
                            } else {
                                failedItems.push(`${sku} (Error: ${err})`);
                            }
                        }
                    }
                }
                await new Promise(r => setTimeout(r, 600)); // Delay prudencial entre ítems
            }

            if (failedItems.length > 0) {
                showLoading(false);
                await showModal("Error de Ajuste", `No se pudieron actualizar los siguientes artículos:<br><b>${failedItems.join(", ")}</b><br><br>Reintenta finalizar nuevamente.`, "error");
                return;
            }

            // AGREGAR COMENTARIO DE AUDITORIA
            try {
                const diffSummary = diffItems
                    .map(i => {
                        const sku = i.MATE_CODIGO || i.CODIGO || "Item";
                        const esperado = i.DERI_CANTIDAD || i.CANTIDAD || 0;
                        const recibido = i._diffQty;
                        const note = i._diffNote || "Sin motivo especificado";
                        const icono = recibido > esperado ? "[SOBRANTE]" : "[FALTANTE]";
                        return `${icono} | ${sku}: Esperada ${esperado}, Recibida ${recibido}. Motivo: ${note}`;
                    })
                    .join('\n');

                const commentText = `AVISO - DIFERENCIAS DETECTADAS EN CONTROL:\n${diffSummary}`;
                await YiQi.addComment(YIQI_CONFIG.entityRemito, activeControlJaula.id, commentText);
                registrarDiscrepanciaLocal(activeControlJaula.id, activeControlJaula.nroComprobante, diffItems, cageIdLabel);
            } catch (errComm) { console.warn("Error en comentario:", errComm); }
        }

        // PASO 2: Gestionar Sobrantes (Plan B) para dar de alta stock en origen
        // Ahora que el remito ya tiene la cantidad correcta, necesitamos el stock para poder ENVIARLO.
        const itemsConSobrante = items.filter(i => {
            const esperado = i.DERI_CANTIDAD || i.CANTIDAD || 0;
            return i._diffQty > esperado;
        });

        if (itemsConSobrante.length > 0) {
            updateStatus("Procesando excedentes para liberar stock...");
            const surplusNotes = document.getElementById('sobrantes-not-obs')?.value || "";
            try {
                // PLAN B: Retorna el ID del remito de compra y la cantidad de ítems
                const planB = await procesarSobrantes(itemsConSobrante, cageIdLabel, surplusNotes);
                
                if (planB && planB.remitoId) {
                    // CAZADORA DE STOCK (Entidad 796): Espera a que los movimientos impacten
                    await cazarMovimientosStock(planB.remitoId, planB.itemCount);
                } else {
                    // Fallback por si algo falló en la creación
                    console.warn("⚠️ No se obtuvo ID de Plan B, usando espera de seguridad...");
                    await new Promise(r => setTimeout(r, 5000));
                }
            } catch (errSobrante) {
                console.warn("⚠️ Fallo en Plan B de sobrantes:", errSobrante);
            }
        }

        // PASO 3: Procesar Remito Final (Usa Helper Universal de la V47)
        await processRemitoTransitions([String(activeControlJaula.id)], updateStatus, false);

        // REGISTRAR HITO DE CONTROL
        try {
            const nowControl = new Date();
            const controlTs = `${nowControl.getDate().toString().padStart(2,'0')}/${(nowControl.getMonth()+1).toString().padStart(2,'0')}/${nowControl.getFullYear()} ${nowControl.getHours().toString().padStart(2,'0')}:${nowControl.getMinutes().toString().padStart(2,'0')}`;
            await YiQi.addComment(YIQI_CONFIG.entityRemito, activeControlJaula.id, `FECHA CONTROL: ${controlTs}`);
        } catch(eCc){ console.warn("Error recording FECHA CONTROL:", eCc); }

        showLoading(false);
        await showModal("Control Finalizado", "La mercadería ha ingresado correctamente al depósito final de Lozametal.", "success");

        activeControlJaula = null;
        document.getElementById('control-detail-panel').style.display = 'none';
        document.getElementById('control-empty-state').style.display = 'flex';
        
        // Limpiamos el badge del header
        const badge = document.getElementById('active-control-badge');
        if (badge) {
            badge.style.display = 'none';
            badge.innerText = '';
        }

        fetchPendientesLozametal(); // Refresca listas de bultos y jaulas
        fetchStockLozametal();      // Refresca el stock final de Lozametal
    } catch (e) {
        showLoading(false);
        console.error("Error en finalizarControlJaula:", e);
        showModal("Error", `No se pudo finalizar: ${e.message}`, "error");
    }
}


// --- HISTORIAL DESPACHOS LOZAMETAL ---
async function fetchDespachosLozametal() {
    const list = document.getElementById('logistica-despachos-list');
    if (list) list.innerHTML = '<p class="text-muted text-center" style="padding:1rem;">Cargando despachos...</p>';

    // Se consultará el smartie específico para los remitos enviados a Lozametal
    const data = await YiQi.fetch(YIQI_CONFIG.smartieDespachos, YIQI_CONFIG.entityRemito);
    if (data) {
        despachos = data.map(r => ({
            id: r.ID || r.id,
            nroComprobante: r.REIN_NRO_REMITO_INTERNO || r.NUMERO_COMPROBANTE || r.REIN_ASIGNAR_NRO_COMPR || "S/N",
            nroRemitoExterno: r.REIN_NRO_EXTERNO || "",
            fecha: r.AUDI_FECHA_MODIF || r.AUDI_FECHA_ALTA || "",
            obs: r.REIN_OBSERVACION || "Sin Observaciones",
            yiqiData: r
        }));
    } else {
        despachos = [];
    }
    renderDespachos();
}

function renderDespachos() {
    const list = document.getElementById('logistica-despachos-list');
    if (!list) return;

    if (despachos.length === 0) {
        list.innerHTML = `<div class="flex-between" style="padding:1rem;">
            <p class="text-muted text-center" style="flex-grow:1;">No hay despachos registrados.</p>
            <button class="btn-icon" onclick="this.classList.add('refresh-spin'); setTimeout(()=>this.classList.remove('refresh-spin'),800); fetchDespachosLozametal()">${Icons.REFRESH}</button>
        </div>`;
        return;
    }

    list.innerHTML = despachos.map(d => {
        let fechaFormat = d.fecha;
        if (fechaFormat.includes('T')) {
            const parts = fechaFormat.split('T');
            fechaFormat = parts[0].split('-').reverse().join('/') + ' ' + parts[1].substring(0, 5);
        }

        return `
        <div class="remito-card">
            <div class="flex-between">
                <strong>${d.obs}</strong>
                <div style="display:flex; gap: 4px; align-items: center;">
                    <button class="btn-icon" onclick="visualizeCageContents('${d.id}')" title="Ver Contenido" style="font-size: 1.1rem; padding: 0 4px;">👁️</button>
                    <button class="btn btn-sm btn-outline print-btn" onclick="printCageLabel('${d.id}')" style="font-size: 0.75rem; color: #64748b; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 4px; background: white;" title="Imprimir Rótulo">🖨️ ${d.nroRemitoExterno ? 'R:' + d.nroRemitoExterno : '#' + d.nroComprobante}</button>
                </div>
            </div>
            <div class="text-sm text-muted" style="margin-top:0.5rem; display:flex; justify-content:space-between;">
                <span>📅 ${fechaFormat}</span>
            </div>
        </div>
        `;
    }).join('');
}


/**
 * MOTOR DE TRAZABILIDAD UNIVERSAL (BASADO EN DESTINOS)
 * Centraliza la historia de una jaula usando la Smartie 2758 (Historial Procesados)
 */
async function fetchTrackingBoard() {
    const list = document.getElementById('tracking-board-list');
    const refreshBtn = document.querySelector('button[onclick="fetchTrackingBoard()"]');
    if (refreshBtn) refreshBtn.classList.add('spin');
    
    if (list) list.innerHTML = '<p class="text-muted text-center italic" style="padding:2rem; font-size: 0.8rem;">Sincronizando historial universal...</p>';

    try {
        const twoMonthsAgo = new Date();
        twoMonthsAgo.setMonth(twoMonthsAgo.getMonth() - 2);

        // 1. Petición única a la Smartie de Historial (2758)
        // Traemos todos los remitos internos procesados
        const allRemitos = await YiQi.fetch(YIQI_CONFIG.smartieTrazabilidad, YIQI_CONFIG.entityRemito);
        
        if (!allRemitos || !Array.isArray(allRemitos)) {
            if (list) list.innerHTML = '<p class="text-muted text-center italic" style="padding:2rem;">Sin datos en el historial.</p>';
            return;
        }

        const cageMap = new Map();

        // 2. Procesar y agrupar por Nro Externo
        allRemitos.forEach(r => {
            const nroExt = r.REIN_NRO_EXTERNO || r.NUMERO_COMPROBANTE_EXTERNO || "";
            if (!nroExt) return;

            // Tomamos la fecha de procesamiento (MODIF)
            const modifDate = new Date(r.AUDI_FECHA_MODIF || r.AUDI_FECHA_ALTA);
            if (modifDate < twoMonthsAgo) return;

            if (!cageMap.has(nroExt)) {
                cageMap.set(nroExt, {
                    nroExt: nroExt,
                    obs: r.REIN_OBSERVACION || "Jaula",
                    id: r.ID || r.id,
                    dates: [null, null, null, null],
                    lastUpdate: modifDate,
                    yiqiData: r
                });
            }

            const entry = cageMap.get(nroExt);
            if (modifDate > entry.lastUpdate) entry.lastUpdate = modifDate;

            // Mapeo por Destino (CED1_NOMBRE)
            const dest = (r.CED1_NOMBRE || "").toUpperCase();
            
            // Priorizamos el remito más reciente para cada estadío por si hubo correcciones
            if (dest.includes("REVESTIMIENTOS")) {
                if (!entry.dates[0] || modifDate > entry.dates[0]) entry.dates[0] = modifDate;
            } else if (dest.includes("MUSTANG")) {
                if (!entry.dates[1] || modifDate > entry.dates[1]) entry.dates[1] = modifDate;
            } else if (dest.includes("LOZAMETAL PL")) {
                if (!entry.dates[2] || modifDate > entry.dates[2]) entry.dates[2] = modifDate;
            } else if (dest === "LOZAMETAL") {
                if (!entry.dates[3] || modifDate > entry.dates[3]) entry.dates[3] = modifDate;
            }
        });

        // 3. Ordenar por actividad reciente
        const sortedCages = Array.from(cageMap.values())
            .sort((a, b) => b.lastUpdate - a.lastUpdate);

        // Guardar en cache global para que printCageLabel lo encuentre sin consultar al ERP de nuevo
        trackingCache = sortedCages.map(c => ({
            id: c.id,
            obs: c.obs,
            nroRemitoExterno: c.nroExt,
            nroComprobante: c.yiqiData?.NUMERO_COMPROBANTE || "",
            fecha: c.dates[0] ? c.dates[0].toISOString() : "",
            yiqiData: c.yiqiData || {}
        }));

        window.currentTrackingCages = sortedCages;
        applyTrackingFilter();

    } catch (e) {
        console.error("Error en Tracking Board:", e);
        if (list) list.innerHTML = '<p class="text-danger text-center italic" style="padding:1rem;">Error al sincronizar board.</p>';
    } finally {
        if (refreshBtn) refreshBtn.classList.remove('spin');
    }
}

function applyTrackingFilter() {
    if (!window.currentTrackingCages) return;
    
    const filterSelect = document.getElementById('trazabilidad-filter');
    const filterVal = filterSelect ? filterSelect.value : 'active'; // active by default
    
    let filteredCages = window.currentTrackingCages;
    
    if (filterVal !== 'all') {
        filteredCages = window.currentTrackingCages.filter(cage => {
            const d = cage.dates;
            
            // Si el valor es 'active', mostramos las que NO están en estado de control (d[3] == null)
            if (filterVal === 'active') return !d[3];
            
            // Si es especifica de una etapa, el "último estado alcanzado" debe coincidir
            if (filterVal === 'fabrica') return d[0] && !d[1];
            if (filterVal === 'mustang') return d[1] && !d[2];
            if (filterVal === 'recepcion') return d[2] && !d[3];
            if (filterVal === 'lozametal') return d[3];

            
            return true;
        });
    }
    
    renderTrackingBoard(filteredCages);
}

function renderTrackingBoard(cages) {
    const list = document.getElementById('tracking-board-list');
    if (!list) return;

    if (cages.length === 0) {
        list.innerHTML = '<p class="text-muted text-center italic" style="padding:2rem;">No se encontraron movimientos registrados.</p>';
        return;
    }

    const formatDate = (date) => {
        if (!date || isNaN(date.getTime())) return "- - -";
        const d = date.getDate().toString().padStart(2, '0');
        const m = (date.getMonth() + 1).toString().padStart(2, '0');
        const hh = date.getHours().toString().padStart(2, '0');
        const mm = date.getMinutes().toString().padStart(2, '0');
        return `${d}/${m} ${hh}:${mm}`;
    };

    const formatDuration = (ms) => {
        if (!ms || ms < 0) return "";
        const mins = Math.floor(ms / 60000);
        const hrs = Math.floor(mins / 60);
        const days = Math.floor(hrs / 24);
        if (days > 0) return `${days}d ${hrs % 24}h`;
        if (hrs > 0) return `${hrs}h ${mins % 60}m`;
        return `${mins % 60}m`;
    };

    list.innerHTML = cages.map(cage => {
        const d = cage.dates;
        
        // Manejo de saltos directos
        if (d[2] && !d[1]) d[1] = d[0];

        const diff1 = (d[0] && d[1]) ? (d[1] - d[0]) : null;
        const diff2 = (d[1] && d[2]) ? (d[2] - d[1]) : null;
        const diff3 = (d[2] && d[3]) ? (d[3] - d[2]) : null;

        const now = new Date();
        const totalMs = (d[3] || now) - d[0];
        
        const slaDays = d[0] ? (totalMs / (1000 * 60 * 60 * 24)) : 0;
        const isSlaEmergency = !d[3] && slaDays > (YIQI_CONFIG.slaThresholdDays || 15);

        // Determinar clase de estado general
        const statusClass = d[3] ? 'status-control' : (d[2] ? 'status-recepcion' : (d[1] ? 'status-envio' : 'status-cierre'));

        const renderStageIcon = (idx, icon) => {
            const isCompleted = !!d[idx];
            return `
                <div class="stage-node ${isCompleted ? 'completed' : 'pending'}">
                    <span class="stage-icon">${icon}</span>
                    <span class="stage-date">${d[idx] ? formatDate(d[idx]) : '---'}</span>
                </div>
            `;
        };

        const renderArrow = (duration, isCompleted) => `
            <div class="timeline-arrow ${isCompleted ? 'active' : ''}">
                ${duration && duration > 60000 ? `<div class="delay-box">${formatDuration(duration)}</div>` : ""}
            </div>
        `;

        return `
            <div class="tracking-card ${statusClass} ${isSlaEmergency ? 'sla-emergency' : ''}">
                <!-- SIDEBAR: Identidad y Acción -->
                <div class="card-sidebar">
                    <div class="sidebar-row">
                        <button class="btn-print-sidebar" onclick="printCageLabel('${cage.id}')" title="Imprimir Rótulo">
                            🖨️ R:${cage.nroExt}
                        </button>
                        <div class="badge-sidebar">${cage.obs}</div>
                    </div>
                    <div class="sidebar-row" style="justify-content: space-between;">
                        <span class="total-time" 
                              data-start="${d[0] ? d[0].getTime() : ''}" 
                              data-end="${d[3] ? d[3].getTime() : ''}">
                            ${formatDuration(totalMs)} ⏳
                        </span>
                        <button class="btn-eye-sidebar" onclick="visualizeCageContents('${cage.id}')" title="Ver Contenido">👁️</button>
                    </div>
                </div>

                <!-- MAIN: Línea de Tiempo -->
                <div class="card-main">
                    <div class="tracking-timeline">
                        ${renderStageIcon(0, "📦")}
                        ${renderArrow(diff1, !!d[1])}
                        ${renderStageIcon(1, "🚚")}
                        ${renderArrow(diff2, !!d[2])}
                        ${renderStageIcon(2, "📋")}
                        ${renderArrow(diff3, !!d[3])}
                        ${renderStageIcon(3, "🏭")}
                    </div>
                </div>
            </div>
        `;
    }).join('');

    // Iniciar o Reiniciar el loop de actualización en tiempo real
    startLiveTrackingInterval();
}

/**
 * MOTOR DE ACTUALIZACIÓN EN TIEMPO REAL
 * Actualiza los cronómetros de las tarjetas visibles cada segundo para dar sensación de "vida"
 */
let liveTrackingInterval = null;
function startLiveTrackingInterval() {
    if (liveTrackingInterval) clearInterval(liveTrackingInterval);
    
    liveTrackingInterval = setInterval(() => {
        const timers = document.querySelectorAll('.total-time[data-start]');
        const now = Date.now();
        
        timers.forEach(t => {
            const start = parseInt(t.getAttribute('data-start'));
            const end = t.getAttribute('data-end');
            
            if (end && end !== "null" && end !== "") return;
            
            if (start) {
                const diff = now - start;
                const secs = Math.floor(diff / 1000);
                const mins = Math.floor(secs / 60);
                const hrs = Math.floor(mins / 60);
                const days = Math.floor(hrs / 24);
                
                let text = "";
                if (days > 0) {
                    text = `${days}d ${hrs % 24}h`;
                } else if (hrs > 0) {
                    text = `${hrs}h ${mins % 60}m`;
                } else if (mins > 0) {
                    text = `${mins}m ${secs % 60}s`;
                } else {
                    text = `${secs}s`;
                }
                
                t.textContent = text + " ⏳";

                // Actualizar alerta SLA en vivo si cruza los 15 días
                if (days > 15) {
                    const card = t.closest('.tracking-card');
                    if (card && !card.classList.contains('sla-emergency')) {
                        card.classList.add('sla-emergency');
                    }
                }
            }
        });
    }, 60000);
}



async function fetchStockLozametal() {
    const btnRefresh = document.querySelector('button[onclick*="fetchStockLozametal()"]');
    if (btnRefresh) btnRefresh.classList.add('refresh-spin');

    const listCalidad = document.getElementById('calidad-stock-list');
    const listLozametal = document.getElementById('lozametal-stock-list');
    
    const setLoader = (el) => {
        if (!el) return;
        el.style.opacity = "0.5";
        el.style.pointerEvents = "none";
        // Si la lista está vacía o tiene el placeholder, mostramos el spinner
        el.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:3rem; gap:1rem;">
                <div class="refresh-spin" style="font-size:2rem;">🔄</div>
                <div style="font-weight:600; color:var(--primary-color);">Actualizando Stock y Recetas...</div>
                <div style="font-size:0.8rem; color:var(--text-muted);">Buscando transformaciones terminadas</div>
            </div>
        `;
    };

    setLoader(listCalidad);
    setLoader(listLozametal);
    try {
        const data = await YiQi.fetch(YIQI_CONFIG.smartieStockLozametal, YIQI_CONFIG.entityId);
        lastStockLozametal = data || [];
        
        // Renderizamos ambas vistas
        renderStockLozametal(lastStockLozametal);
        renderCalidadStock(lastStockLozametal);
        
    } catch (e) {
        console.error("Error al cargar stock Lozametal:", e);
        if (listCalidad) listCalidad.innerHTML = '<p class="text-danger text-center">Error al conectar con YiQi.</p>';
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('refresh-spin');
        if (listCalidad) {
            listCalidad.style.opacity = "1";
            listCalidad.style.pointerEvents = "auto";
        }
        if (listLozametal) {
            listLozametal.style.opacity = "1";
            listLozametal.style.pointerEvents = "auto";
        }
    }
}

function toggleStockLozametalSearch() {
    const container = document.getElementById('search-container-lozametal');
    if (!container) return;
    const isHidden = container.style.display === 'none';
    container.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
        const input = document.getElementById('search-stock-lozametal');
        if (input) {
            input.value = '';
            input.focus();
        }
    } else {
        // Al ocultar, limpiamos filtro
        filtrarStockLozametal('');
    }
}

function filtrarStockLozametal(manualValue) {
    const input = document.getElementById('search-stock-lozametal');
    const query = (manualValue !== undefined ? manualValue : (input ? input.value : '')).toLowerCase().trim();
    
    if (!query) {
        renderStockLozametal(lastStockLozametal);
        return;
    }

    const filtered = lastStockLozametal.filter(item => {
        const name = (item.MATE_NOMBRE || item.NOMBRE || item.ARTICULO || '').toLowerCase();
        const sku = (item.MATE_CODIGO || item.CODIGO || item.STOC_SKU || '').toLowerCase();
        return name.includes(query) || sku.includes(query);
    });

    renderStockLozametal(filtered, true); // true para indicar que es resultado de busqueda
}

function renderStockLozametal(data, isFiltered = false) {
    const list = document.getElementById('lozametal-stock-list');
    if (!list) return;

    if (data.length === 0) {
        list.innerHTML = `<div style="height:100px; display:flex; align-items:center; justify-content:center; color:var(--text-muted); font-style:italic;">
            ${isFiltered ? 'No se encontraron artículos con ese criterio.' : 'No hay mercadería en stock.'}
        </div>`;
        return;
    }

    list.innerHTML = `
        <table class="stock-table">
            <tbody style="border-top: 1px solid #e2e8f0;">
                ${data.filter(item => (item.STOCK || item.CANTIDAD || item.STOC_CANTIDAD || 0) > 0).map(item => {
                    const name = item.MATE_NOMBRE || item.NOMBRE || item.ARTICULO || item.PRODUCTO || 'S/N';
                    const sku = item.MATE_CODIGO || item.CODIGO || item.STOC_SKU || item.SKU || '';
                    const stock = item.STOCK || item.CANTIDAD || item.STOC_CANTIDAD || 0;

                    const isAlzElz = (name + sku).toUpperCase().includes('ALZ') || (name + sku).toUpperCase().includes('ELZ');
                    // Emojis según material: ELZ -> 🟦, DD -> 🟧
                    const materialEmoji = isAlzElz ? '🟦' : '🟧';

                    return `
                    <tr>
                        <td style="padding: 12px 10px; border-bottom: 1px solid #f1f5f9;">
                            <div style="font-weight: 600; color: #1e293b; font-size: 0.95rem; line-height: 1.2;">${name}</div>
                            <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                                <span>SKU: ${sku}</span>
                            </div>
                        </td>
                        <td style="text-align: right; border-bottom: 1px solid #f1f5f9; padding-right: 10px;">
                            <div style="display: flex; align-items: center; justify-content: flex-end; gap: 8px;">
                                <span style="font-size: 1.1rem; margin-right: 4px;" title="${isAlzElz ? 'Material ELZ' : 'Material DD'}">${materialEmoji}</span>
                                <span style="font-weight: 700; color: var(--primary-color); font-size: 1.1rem; min-width: 35px; text-align: center;">${stock}</span>
                                <button class="btn btn-sm btn-outline" 
                                        style="padding: 4px 10px; font-size: 0.7rem; font-weight: 600; color: var(--primary-color); border-color: var(--primary-color); white-space: nowrap; border-radius: 6px;" 
                                        onclick="terminarProducto('${sku}', '${name.replace(/'/g, "\\'")}')">
                                    ⚡ Negro Estandar
                                </button>
                            </div>
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

async function terminarProducto(sku, name) {
    // 1. Get current stock
    const itemStock = lastStockLozametal.find(i => (i.MATE_CODIGO || i.CODIGO || i.STOC_SKU || i.SKU) === sku);
    const availableQty = itemStock ? Number(itemStock.STOCK || itemStock.CANTIDAD || itemStock.STOC_CANTIDAD || 0) : 0;
    
    if (availableQty <= 0) {
        await showModal("Atención", "No hay stock disponible para terminar.", "warning");
        return;
    }

    // 2. Open Custom Modal
    const result = await openTerminarModal(sku, name, availableQty);
    if (!result) return; // User cancelled

    const { qty, obs } = result;
    
    showLoading(true);
    updateStatus("Generando movimiento para producto terminado...");

    try {
        const token = await YiQi.getToken();
        if (!token) throw new Error("No hay token de sesión.");

        // A. Crear Cabecera del Remito (Lozametal 157 -> Revestimientos Realizados 165)
        // Incluimos la observación personalizada
        const headerObs = obs ? `Terminado: ${sku} - ${obs}` : `Terminado: ${sku}`;
        const newRemitoId = await YiQi.saveHeader({
            observacion: headerObs
        }, YIQI_CONFIG.depoLozametalId, YIQI_CONFIG.depoRevestimientosRealizadosId);

        if (!newRemitoId) throw new Error("No se pudo crear el remito en YiQi.");

        // B. Buscar ID exacto del artículo en YiQi
        const article = await YiQi.searchArticle(sku);
        const articleId = article ? (article.MATE_ID_MATE || article.ID) : null;

        // C. Agregar Item al Remito
        const itemPayload = [{
            "CANTIDAD": qty,
            "DERI_CANTIDAD": String(qty),
            "CODIGO": sku,
            "NOMBRE": name,
            "MATE_ID_MATE": articleId
        }];

        const itemsSaved = await YiQi.saveChildInstances(newRemitoId, itemPayload);
        if (!itemsSaved) throw new Error("No se pudieron agregar los items al remito.");

        // D. Procesar Remito (Enviado -> Procesado) - usa helper universal
        await processRemitoTransitions([String(newRemitoId)], updateStatus, true);

        showLoading(false);
        await showModal("Producto Terminado", `Se han procesado ${qty} unidades de "${name}" correctamente.`, "success");
        
        // Refrescar stock
        fetchStockLozametal();

    } catch (e) {
        showLoading(false);
        console.error("Error al terminar producto:", e);
        showModal("Error", e.message || "Ocurrió un error al procesar el movimiento.", "error");
    }
}

function openTerminarModal(sku, name, maxQty) {
    return new Promise(resolve => {
        const html = `
            <div style="text-align: left; margin-top: 10px; width: 100%; box-sizing: border-box;">
                <p style="margin-bottom: 20px; font-size: 1.05rem; color: #334155; line-height: 1.4;">
                    ¿Qué cantidad de <b>"${name}"</b> deseas finalizar como <span style="color:var(--primary-color); font-weight:700;">Negro Estandar</span>?<br>
                    <span style="font-size: 0.85rem; color: #64748b;">Disponibilidad actual en Lozametal: <b>${maxQty}</b></span>
                </p>
                <div class="mb-3" style="width: 100%;">
                    <label class="form-label" style="font-size: 0.9rem; color: #475569; font-weight: 600;">Cantidad a terminar</label>
                    <input type="number" id="terminar-qty" class="form-control" value="${maxQty}" min="1" max="${maxQty}" 
                           style="font-size: 1.3rem; font-weight: 700; text-align: center; height: 50px; border-radius: 8px; width: 100%; box-sizing: border-box;">
                </div>
                <div class="mb-3" style="width: 100%;">
                    <label class="form-label" style="font-size: 0.9rem; color: #475569; font-weight: 600;">Observaciones / Notas del Remito</label>
                    <textarea id="terminar-obs" class="form-control" placeholder="Ej: 2 salieron defectuosas, resto OK..." 
                              style="height: 140px; font-size: 0.95rem; resize: vertical; border-radius: 8px; padding: 12px; width: 100%; box-sizing: border-box;"></textarea>
                </div>
            </div>
        `;

        const btns = `
            <button class="btn-modal btn-cancel" id="btn-terminar-cancel" style="padding: 10px 20px;">Cancelar</button>
            <button class="btn-modal btn-confirm" id="btn-terminar-ok" style="padding: 10px 20px; flex-grow: 1;">Finalizar Producto</button>
        `;

        // Usamos un modal un poco más ancho para que respire mejor el contenido
        Modal.open('⚡', 'Terminar Producto', html, btns);

        const inputQty = document.getElementById('terminar-qty');
        const inputObs = document.getElementById('terminar-obs');
        const btnOk = document.getElementById('btn-terminar-ok');
        const btnCancel = document.getElementById('btn-terminar-cancel');

        if (inputQty) {
            inputQty.focus();
            inputQty.select();
        }

        const handleConfirm = () => {
            const qty = parseInt(inputQty.value);
            const obs = inputObs.value.trim();

            if (isNaN(qty) || qty <= 0 || qty > maxQty) {
                inputQty.style.borderColor = 'var(--danger)';
                inputQty.focus();
                return;
            }

            Modal.close();
            resolve({ qty, obs });
        };

        if (btnOk) btnOk.onclick = handleConfirm;
        if (btnCancel) btnCancel.onclick = () => { Modal.close(); resolve(null); };

        // Handle Enter key
        inputQty.onkeypress = (e) => { if (e.key === 'Enter') handleConfirm(); };
    });
}

/**
 * Genera un código QR como Data URL (base64 PNG) para embeber en etiquetas.
 * Formato estándar TMC: TMC|JAULA|{yiqiId}|{jaulaNum}|{nroComprobante}
 * Los futuros aplicativos sectoriales escanearán este QR para:
 *  - Identificar la jaula
 *  - Abrir acciones contextuales (recepción, control, tracking)
 */
function generateCageQR(yiqiId, jaulaNum, nroComprobante) {
    const qrData = `TMC|JAULA|${yiqiId}|${jaulaNum}|${nroComprobante}`;
    try {
        const qr = qrcode(0, 'M'); // Type 0 = auto-detect size, Error correction M (15%)
        qr.addData(qrData);
        qr.make();
        return {
            dataUrl: qr.createDataURL(4, 0), // cellSize=4, margin=0
            rawData: qrData
        };
    } catch (e) {
        console.error('Error generando QR:', e);
        return { dataUrl: null, rawData: qrData };
    }
}

async function printCageLabel(id) {
    let cage = processedCages.find(c => String(c.id) === String(id));
    let isDespacho = false;
    
    if (!cage) {
        cage = despachos.find(d => String(d.id) === String(id));
        isDespacho = !!cage;
    }

    let isPendiente = false;
    if (!cage) {
        cage = pendientesLozametal.find(d => String(d.id) === String(id));
        isPendiente = !!cage;
    }

    if (!cage) {
        cage = jaulasEnPlaya.find(d => String(d.id) === String(id));
        isPendiente = !!cage;
    }

    if (!cage) {
        cage = trackingCache.find(t => String(t.id) === String(id));
        isPendiente = !!cage;
    }

    if (!cage) {
        console.error("No se encontró la jaula para imprimir:", id);
        showModal("Error", "No se encontró la información de la jaula en el sistema local.", "error");
        return;
    }

    let items = cage.serverItems;
    if (!items) {
        showLoading(true);
        items = await YiQi.getChildItems(id) || [];
        cage.serverItems = items; // cache it
        showLoading(false);
    }

    const jaulaNum = (cage.obs || "").match(/Jaula N°\s*(\d+)/i)?.[1] || cage.id;
    
    // Usar Nro Remito Externo como número principal del rótulo
    let remitoNum = cage.nroRemitoExterno || cage.yiqiData?.REIN_NRO_EXTERNO || "";
    if (!remitoNum) {
        // Fallback al nroComprobante interno si no hay externo
        if (cage.nroComprobante && cage.nroComprobante !== "undefined" && cage.nroComprobante !== "S/N") {
            remitoNum = cage.nroComprobante;
        } else if (cage.yiqiData) {
            remitoNum = cage.yiqiData.REIN_NRO_REMITO_INTERNO || 
                        cage.yiqiData.NUMERO_COMPROBANTE || 
                        cage.yiqiData.REIN_ASIGNAR_NRO_COMPR || 
                        cage.yiqiData.Comp || "S/N";
            if (remitoNum === "S/N" && cage.yiqiData.REIN_PUNTO_DE_VENTA && cage.yiqiData.REIN_NUMERO) {
                remitoNum = `${cage.yiqiData.REIN_PUNTO_DE_VENTA.toString().padStart(4, '0')}-${cage.yiqiData.REIN_NUMERO.toString().padStart(8, '0')}`;
            }
        }
    }

    let fecha = new Date().toLocaleDateString('es-AR');
    if (isDespacho && cage.fecha) {
        const dateTimeStr = typeof cage.fecha === 'string' ? cage.fecha : "";
        if (dateTimeStr.includes('T')) {
            fecha = dateTimeStr.split('T')[0].split('-').reverse().join('/');
        }
    }

    // GENERAR QR CODE
    const qrResult = generateCageQR(id, jaulaNum, remitoNum);
    const qrImgHtml = qrResult.dataUrl 
        ? `<img src="${qrResult.dataUrl}" style="width: 22mm; height: 22mm; image-rendering: pixelated;" alt="QR Jaula">`
        : `<div style="width: 22mm; height: 22mm; border: 1px dashed #999; display:flex; align-items:center; justify-content:center; font-size: 6pt; color: #999;">QR N/D</div>`;

    let itemsHtml = items.map(i => `
        <tr>
            <td style="padding: 2px 8px; border-bottom: 1px solid #eee; font-weight: 700;">${i.DERI_CANTIDAD || i.CANTIDAD}</td>
            <td style="padding: 2px 8px; border-bottom: 1px solid #eee;">
                <b>${i.MATE_CODIGO || i.CODIGO || ""}</b> - ${i.MATE_NOMBRE || i.DERI_NOMBRE_ARTICULO || i.NOMBRE || ""}
            </td>
        </tr>
    `).join('');

    const labelHtml = `
        <div class="label-container" style="width: 175mm; height: 115mm; border: 2px solid #000; padding: 5mm; margin: 4mm auto; position: relative; font-family: 'Inter', sans-serif; overflow: hidden; box-sizing: border-box; background: white; display: flex; flex-direction: column;">
            <!-- Main Header -->
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 3mm;">
                <div style="display: flex; align-items: center; gap: 4mm;">
                    <img src="logo_tmc.png" style="height: 12mm;">
                    <div style="border-left: 2px solid #000; padding-left: 3mm;">
                        <div style="font-weight: 800; font-size: 14pt; line-height:1.1; letter-spacing: -0.5px;">TALLERES METALÚRGICOS</div>
                        <div style="font-weight: 800; font-size: 16pt; line-height:1.1; color: #000;">CRESPO S.R.L.</div>
                    </div>
                </div>
                <div style="text-align: left; line-height: 1.5; border: 2px solid #000; padding: 1.5mm 4mm; border-radius: 2mm; min-width: 45mm;">
                    <div style="display: flex; justify-content: space-between; font-size: 10pt;">
                        <span style="font-weight: 800; margin-right: 3mm;">FECHA:</span>
                        <span>${fecha}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; font-size: 10pt;">
                        <span style="font-weight: 800; margin-right: 3mm;">REMITO:</span>
                        <span>${remitoNum}</span>
                    </div>
                </div>
            </div>

            <!-- Info Bar + QR -->
            <div style="display: flex; justify-content: space-between; align-items: center; background: #000; color: #fff; padding: 2mm 5mm; margin-bottom: 3mm; border-radius: 1mm;">
                <div style="font-size: 11pt; font-weight: 700;">DESTINO: LOZAMETAL</div>
                <div style="font-size: 13pt; font-weight: 800; letter-spacing: 1px;">JAULA N° ${jaulaNum}</div>
            </div>

            <!-- Content Table + QR Side-by-Side -->
            <div style="flex-grow: 1; display: flex; gap: 3mm;">
                <!-- Items Table -->
                <div style="flex: 1; border: 2px solid #000; border-radius: 1mm; overflow: hidden; display: flex; flex-direction: column;">
                    <table style="width: 100%; border-collapse: collapse; font-size: 10pt;">
                        <thead>
                            <tr style="background: #e0e0e0; border-bottom: 2px solid #000;">
                                <th style="padding: 3px 8px; text-align: left; font-weight: 800; width: 15%;">Cant.</th>
                                <th style="padding: 3px 8px; text-align: left; font-weight: 800; width: 85%;">Detalle / Artículo</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${itemsHtml || '<tr><td colspan="2" style="text-align:center; padding: 10mm; font-style: italic;">Sin artículos registrados</td></tr>'}
                        </tbody>
                    </table>
                </div>
                <!-- QR Code Panel -->
                <div style="width: 28mm; display: flex; flex-direction: column; align-items: center; justify-content: center; border: 2px solid #000; border-radius: 1mm; padding: 2mm; background: #fff;">
                    ${qrImgHtml}
                </div>
            </div>

            <div style="margin-top: 3mm; display: flex; justify-content: space-between; align-items: center; font-size: 8pt; border-top: 1px dashed #000; padding-top: 2mm;">
                <div><b>TMC</b> - Control de Producción y Despacho</div>
                <div style="font-weight: 600;">INDUSTRIA ARGENTINA</div>
            </div>
        </div>
    `;

    // Create a temporary hidden iframe for printing
    const iframe = document.createElement('iframe');
    iframe.style.display = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(`
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                @page { size: A4 portrait; margin: 0; }
                body { margin: 0; padding: 0; background: #fff; }
                .page { 
                    page-break-after: always; 
                    display: flex; 
                    flex-direction: column; 
                    align-items: center; 
                    justify-content: flex-start; /* Move up slightly */
                    height: 297mm; 
                    padding-top: 10mm;
                    box-sizing: border-box;
                }
            </style>
        </head>
        <body>
            <div class="page">
                ${labelHtml}
                <div style="margin-top: 10mm; border-top: 1px dashed #ccc; width: 80%;"></div>
                ${labelHtml}
            </div>
            ${isPendiente ? '' : `<div class="page">
                ${labelHtml}
                <div style="margin-top: 10mm; border-top: 1px dashed #ccc; width: 80%;"></div>
                ${labelHtml}
            </div>`}
            <script>
                window.onload = function() {
                    window.print();
                    setTimeout(() => { window.frameElement.remove(); }, 1000);
                }
            </script>
        </body>
        </html>
    `);
    doc.close();
}

async function updateLogisticsSummary() {
    const tableContainer = document.getElementById('logistica-items-table');
    const emptyState = document.getElementById('logistica-empty-state');
    const previewState = document.getElementById('logistica-preview');
    const btn = document.getElementById('btn-despachar');
    const countBadge = document.getElementById('selection-count');

    // Update Badge
    countBadge.innerText = `${selectedCages.length} Seleccionadas`;
    countBadge.style.display = selectedCages.length > 0 ? 'block' : 'none';

    // NEW: Update Selected Cages List in Footer
    const selectedFooter = document.getElementById('logistica-selected-list');
    const selectedText = document.getElementById('selected-cages-text');

    if (selectedCages.length > 0) {
        const nums = selectedCages.map(c => {
            const match = (c.obs || "").match(/Jaula N°\s*(\d+)/i);
            return match ? match[1] : (c.obs || "?");
        });
        selectedText.innerText = nums.join(', ');
        if (selectedFooter) selectedFooter.style.display = 'block';
    } else {
        if (selectedFooter) selectedFooter.style.display = 'none';
    }

    if (selectedCages.length === 0) {
        emptyState.style.display = 'flex';
        previewState.style.display = 'none';
        btn.disabled = true;
        return;
    }

    emptyState.style.display = 'none';
    previewState.style.display = 'block';

    // Calculate Consolidated Items
    tableContainer.innerHTML = '<div class="text-center p-4"><div class="spinner-border text-primary"></div><div class="text-muted mt-2">Consolidando ítems...</div></div>';

    const consolidated = {};

    for (const cage of selectedCages) {
        if (!cage.serverItems || cage.serverItems.length === 0) {
            cage.serverItems = await YiQi.getChildItems(cage.id) || [];
        }

        cage.serverItems.forEach(item => {
            const sku = item.MATE_CODIGO || item.CODIGO || "Item";
            const name = item.MATE_NOMBRE || item.NOMBRE || item.DERI_NOMBRE_ARTICULO || "";
            const qty = Number(item.DERI_CANTIDAD || 0);
            const mateId = item.MATE_ID_MATE || item.id || item.ID;
            
            if (!consolidated[sku]) {
                consolidated[sku] = { sku, name, qty: 0, mateId };
            }
            consolidated[sku].qty += qty;
            if (!consolidated[sku].name && name) consolidated[sku].name = name;
            if (!consolidated[sku].mateId && mateId) consolidated[sku].mateId = mateId;
        });
    }

    const items = Object.values(consolidated);

    if (items.length === 0) {
        tableContainer.innerHTML = '<p class="text-muted p-4">Las jaulas seleccionadas no tienen items.</p>';
        btn.disabled = true;
        return;
    }

    let html = `
    <table class="table" style="font-size:1rem; width: 100%; border-collapse: separate; border-spacing: 0 4px;">
        <thead>
            <tr style="color: var(--text-muted); font-size: 0.8rem; text-transform: uppercase;">
                <th style="padding: 10px 8px; border-bottom: 2px solid #edf2f7; text-align: left;">Artículo</th>
                <th style="padding: 10px 8px; border-bottom: 2px solid #edf2f7; text-align: right;">Cant.</th>
            </tr>
        </thead>
        <tbody>
    `;

    let totalUnits = 0;
    items.forEach(i => {
        totalUnits += i.qty;
        html += `
            <tr>
                <td style="padding: 12px 8px; border-bottom: 1px solid #f1f5f9;">
                    <div style="font-weight: 500;">${i.sku}</div>
                    <div style="font-size: 0.75rem; color: #64748b;">${i.name || ''}</div>
                </td>
                <td style="padding: 12px 8px; border-bottom: 1px solid #f1f5f9; text-align:right;"><strong>${i.qty}</strong></td>
            </tr>
        `;
    });

    html += `
        </tbody>
        <tfoot>
            <tr style="background:#f1f5f9; font-weight:bold;">
                <td style="padding: 15px 8px; border-radius: 4px 0 0 4px;">TOTAL</td>
                <td style="padding: 15px 8px; border-radius: 0 4px 4px 0; text-align:right;">${totalUnits}</td>
            </tr>
        </tfoot>
    </table>
    `;

    tableContainer.innerHTML = html;
    btn.disabled = false;
    btn.onclick = () => createLogisticsRemito(items);
}

async function createLogisticsRemito() {
    if (!selectedCages || selectedCages.length === 0) return;

    // VALIDACIÓN DE DESTINO ÚNICO
    const firstDest = (selectedCages[0].yiqiData?.CED1_NOMBRE || "Mustang").toLowerCase();
    const isMustang = firstDest.includes('mustang');
    
    const allSameDest = selectedCages.every(c => {
        const d = (c.yiqiData?.CED1_NOMBRE || "Mustang").toLowerCase();
        return (d.includes('mustang')) === isMustang;
    });

    if (!allSameDest) {
        showModal("Error de Consolidación", "⚠️ No se pueden despachar jaulas con distintos destinos en una misma guía.<br><small>Asegúrese que todas sean 'Mustang' o todas 'Directo'.</small>", "error");
        return;
    }

    const cageNames = selectedCages.map(c => c.obs || c.id).join(', ');
    const destLabel = isMustang ? "Transporte Mustang" : "Directo a Lozametal";
    
    const confirmMsg = `
        <p>Se enviarán a <b>Lozametal</b> (${destLabel}) las siguientes jaulas:</p>
        <p><b>Jaulas:</b> ${cageNames}</p>
        <p style="color:#d97706; font-size:0.9rem; margin-top:8px;">Esto cambiará el estado de los remitos internos correspondientes a "Enviado".</p>
    `;

    if (!await showConfirm("Confirmar Despacho", confirmMsg)) return;

    showLoading(true);
    updateStatus(`Despachando jaulas (${destLabel})...`);

    try {
        const token = await YiQi.getToken();
        if (!token) throw new Error("No hay token de sesión");

        const cageIds = selectedCages.map(c => String(c.id));
        const jaulasDesc = selectedCages.map(c => c.obs || c.id).join(', ');

        let seq = parseInt(localStorage.getItem('REMITO_GUIA_SEQ') || '0');
        seq++;
        localStorage.setItem('REMITO_GUIA_SEQ', seq.toString());
        const guiaNum = 'GUIA-' + String(seq).padStart(5, '0');
        let totalItemsGlobal = 0;
        const itemTracker = {};

        // PASO 3: Loop de Clonación Individual + Agregar Comentario de Guía
        let cloneSuccess = 0;
        let cloneFail = 0;
        const failedCages = [];
        const successfulCagesIds = [];
        const now = new Date();
        const dispatchTs = `${now.getDate().toString().padStart(2,'0')}/${(now.getMonth()+1).toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

        // Determinar ORIGEN y DESTINO del clon según el destino elegido
        const chosenOriginId = isMustang ? YIQI_CONFIG.depoMustangId : YIQI_CONFIG.depoPlayaLozametalId;
        const chosenDestId   = isMustang ? YIQI_CONFIG.depoPlayaLozametalId : YIQI_CONFIG.depoLozametalId;

        for (let i = 0; i < selectedCages.length; i++) {
            const cage = selectedCages[i];
            const jaulaNum = cage.obs || cage.id;
            const uniqueObs = cage.obs || `Jaula N° ${cage.id}`; 
            
            // Trackear items para la guía
            if (cage.serverItems) {
                cage.serverItems.forEach(item => {
                    const sku = item.MATE_CODIGO || item.CODIGO || item.NOMBRE || 'S/N';
                    const name = item.MATE_NOMBRE || item.DERI_NOMBRE_ARTICULO || item.NOMBRE || '';
                    const qty = Number(item.DERI_CANTIDAD || item.CANTIDAD || 0);
                    if (!itemTracker[sku]) {
                        itemTracker[sku] = { sku, name, qty: 0 };
                    }
                    itemTracker[sku].qty += qty;
                    totalItemsGlobal += qty;
                });
            }

            updateStatus(`Procesando jaula ${i + 1}/${selectedCages.length}: ${jaulaNum}...`);
            try {
                // PASO A: Agregar el número de guía
                try {
                    await YiQi.addComment(YIQI_CONFIG.entityRemito, cage.id, `GUIA DE ENVÍO: ${guiaNum} (${destLabel})`);
                } catch(e){}
                
                // PASO B: Transición Secuencial Individual
                updateStatus(`Cerrando remito original ${jaulaNum}...`);
                await processRemitoTransitions([String(cage.id)], updateStatus, false);

                // PASO C: Clonación 
                updateStatus(`Clonando jaula ${jaulaNum} para despacho...`);
                const nroExt = cage.nroRemitoExterno || cage.yiqiData?.REIN_NRO_EXTERNO || null;
                const newCloneId = await YiQi.cloneRemito(String(cage.id), chosenOriginId, chosenDestId, uniqueObs, nroExt);
                
                if (newCloneId) {
                    cloneSuccess++;
                    successfulCagesIds.push(String(cage.id));
                    // REGISTRAR HITO DE ENVÍO EN EL CLON
                    try {
                        await YiQi.addComment(YIQI_CONFIG.entityRemito, newCloneId, `FECHA ENVÍO: ${dispatchTs}`);
                    } catch(eCm){ console.warn("Error recording FECHA ENVIO:", eCm); }
                } else {
                    console.warn(`⚠️ Falló clonación para ${jaulaNum}.`);
                    cloneFail++;
                    failedCages.push(jaulaNum);
                }
            } catch (errLoop) {
                console.error(`Error procesando integralmente ${jaulaNum}:`, errLoop);
                cloneFail++;
                failedCages.push(jaulaNum);
            }

            // Pausa entre ciclos de jaulas para dar respiro a YiQi
            if (i < selectedCages.length - 1) {
                updateStatus(`Pausa de seguridad...`);
                await new Promise(r => setTimeout(r, 2000));
            }
        }

        // GUARDAR GUÍA LOCALMENTE (solo si hubo al menos un clon exitoso)
        if (cloneSuccess > 0) {
            const declaredTotal = totalItemsGlobal * (YIQI_CONFIG.valorDeclarado || 1000);
            const savedGuiasStr = localStorage.getItem('REMITO_GUIAS_LOGISTICA');
            let guiasLogistica = savedGuiasStr ? JSON.parse(savedGuiasStr) : [];
            guiasLogistica.unshift({
                id: guiaNum,
                fecha: dispatchTs,
                jaulasStr: jaulasDesc,
                cantJaulas: selectedCages.length,
                totalItems: totalItemsGlobal,
                montoDeclarado: declaredTotal,
                isMustang: isMustang, // NUEVO: Para saber si poner transportista en impresión
                items: Object.values(itemTracker)
            });
            localStorage.setItem('REMITO_GUIAS_LOGISTICA', JSON.stringify(guiasLogistica));
        }

        showLoading(false);

        if (cloneFail === 0) {
            // Ya no mostramos un simple Modal de Éxito, preguntamos si imprime
            const printNow = await showConfirm(
                "Despacho Exitoso", 
                `✅ Se procesaron ${cloneSuccess} jaulas y se <b>creó</b> la guía <b>${guiaNum}</b>.<br><br>¿Deseas guardar o imprimir la Guía de Envío ahora mismo?`,
                "🖨️ Imprimir Guía",
                "Cerrar"
            );
            if (printNow) {
                printGuia(guiaNum);
            }
        } else {
            await showModal("Despacho Parcial", `Se clonaron ${cloneSuccess} de ${selectedCages.length} jaulas.<br><br>⚠️ Fallaron: <b>${failedCages.join(', ')}</b><br><small>Los remitos originales ya están procesados. Presioná 🔄 y reintentá el despacho de las faltantes.</small>`, "warning");
        }
        
        // Reset Selection & Refresh
        selectedCages = [];
        updateLogisticsSummary();
        fetchProcessedCages(); // Refrescar lista de jaulas en pantalla
        fetchDespachosLozametal(); // Actualizar el histórico de enviados
        
        // Refrescar vista de guías si el tab está cargado
        if (typeof renderGuiasCosto === 'function') {
            renderGuiasCosto();
        }

    } catch (e) {
        showLoading(false);
        console.error("Error despachando jaulas:", e);
        await showModal("Error", `Falló el despacho: ${e.message}`, "error");
    }
}

// --- ALTA PRODUCCION LOGIC ---

async function fetchGroupsAndArticles() {
    try {
        // User confirmed Group ID = 93
        enlozadasGroupId = 93;
        console.log(`🎯 Using Group ID: ${enlozadasGroupId} for "Bandejas Enlozadas"`);

        // 2. Fetch Articles filtered by group (MATE_GRUPO_IDEN === 93) and Collection (SEMI ELABORADO)
        const allArticles = await YiQi.fetch(YIQI_CONFIG.smartieArticulos, YIQI_CONFIG.entityArticulos);
        if (allArticles) {
            // Flexible filter for SEMI ELABORADO
            enlozadasArticles = allArticles.filter(a => {
                const isGroup = String(a.MATE_GRUPO_IDEN || a.GRMA_ID) === String(enlozadasGroupId);
                const cole = String(a.COLE_DESCRIPCION || a.COLE_NOMBRE || a.Coleccion || "").toUpperCase().trim();
                return isGroup && cole === "SEMI ELABORADO";
            });

            // Fallback if strict filter fails
            if (enlozadasArticles.length === 0) {
                console.warn("⚠️ Filtro SEMI ELABORADO no devolvió resultados. Cargando todo el Grupo 93.");
                enlozadasArticles = allArticles.filter(a => String(a.MATE_GRUPO_IDEN || a.GRMA_ID) === String(enlozadasGroupId));
            }
            console.log(`📦 Loaded ${enlozadasArticles.length} Articles for Alta (Group ${enlozadasGroupId})`);
        }
    } catch (e) {
        console.error("Error fetching Alta metadata:", e);
    }
}

function filterAltaArticles() {
    const query = (document.getElementById('alta-sku-search').value || "").toLowerCase().trim();
    const resultsContainer = document.getElementById('alta-sku-results');

    // Show all if empty, otherwise filter
    let filtered = enlozadasArticles;
    if (query.length > 0) {
        filtered = enlozadasArticles.filter(a => {
            const code = (a.CODIGO || a.MATE_CODIGO || a.STOC_SKU || a.Sku || "").toLowerCase();
            const name = (a.NOMBRE || a.MATE_NOMBRE || a.MATE_DESCRIPCION || a.Nombre || "").toLowerCase();
            return code.includes(query) || name.includes(query);
        });
    }

    // Increase limit to 300 for full visibility of the semi-finished list
    filtered = filtered.slice(0, 300);

    if (filtered.length > 0) {
        resultsContainer.innerHTML = filtered.map(a => {
            const id = a.ID || a.MATE_ID_MATE || a.Id;
            const code = a.CODIGO || a.MATE_CODIGO || a.STOC_SKU || a.Sku || "S/C";
            const name = a.NOMBRE || a.MATE_NOMBRE || a.MATE_DESCRIPCION || a.Nombre || "Sin Nombre";
            // Escape name for single quotes if it goes into onclick
            const safeName = name.replace(/'/g, "\\'");
            return `
                <div class="search-result-item" onclick="selectAltaArticle('${id}', '${code}', '${safeName}')">
                    <b>${code}</b> - ${name}
                </div>
            `;
        }).join('');
        resultsContainer.style.display = 'block';
    } else {
        resultsContainer.innerHTML = '<div class="p-2 text-muted text-sm">No se encontraron artículos</div>';
        resultsContainer.style.display = 'block';
    }
}

// Close search dropdown when clicking outside
document.addEventListener('click', function (e) {
    const searchWrapper = document.querySelector('.dropdown-wrapper');
    const results = document.getElementById('alta-sku-results');
    if (searchWrapper && results && !searchWrapper.contains(e.target)) {
        results.style.display = 'none';
    }
});

function selectAltaArticle(id, code, name) {
    document.getElementById('alta-mate-id').value = id;
    document.getElementById('alta-sku-search').value = code;
    document.getElementById('alta-sku-results').style.display = 'none';
}

async function registrarProduccion() {
    const mateId = document.getElementById('alta-mate-id').value;
    const sku = document.getElementById('alta-sku-search').value;
    const qty = document.getElementById('alta-qty').value;
    const obs = document.getElementById('alta-obs').value;

    if (!mateId || !qty || qty <= 0) {
        await showModal("Datos Incompletos", "Por favor selecciona un artículo y especifica una cantidad válida.", "warning");
        return;
    }

    if (!enlozadasGroupId) {
        await showModal("Error de Configuración", "No se encontró el ID del grupo 'Bandejas Enlozadas'. Reinicie la app.", "error");
        return;
    }

    showLoading(true);
    updateStatus("Registrando producción...");

    const token = await YiQi.getToken();
    if (!token) { showLoading(false); return; }

    try {
        // [NUEVO] PRE-CAPTURA de IDs existentes para identificar el nuevo remito
        updateStatus("Sincronizando estado previo...");
        const initialRemitos = await YiQi.fetch(2698, 787);
        const existingIds = (initialRemitos || []).map(r => String(r.ID || r.id));
        console.log("📸 Foto Pre-Registro:", existingIds.length, "remitos existentes.");

        // Form Mapping for Entity 1389:
        // 12369 = Grupo, 12370 = Articulo, 12371 = Cantidad, 12372 = Observaciones
        const formStr = `12369=${enlozadasGroupId}&12370=${mateId}&12371=${qty}&12372=${encodeURIComponent(obs)}`;

        const payload = {
            schemaId: YIQI_CONFIG.schemaId,
            entityId: String(YIQI_CONFIG.entityAlta),
            form: formStr,
            uploads: "",
            parentId: null,
            childId: null
        };

        let newId = null;
        for (const url of YIQI_CONFIG.saveUrls) {
            const r = await fetch(url, {
                method: "POST", headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` }, body: JSON.stringify(payload)
            });
            const res = await r.json();
            if (res.ok || res.success || res.newId) {
                newId = res.newId;
                break;
            }
        }

        if (newId) {
            recentAltas.unshift({ sku, qty, time: new Date().toLocaleTimeString(), id: newId });
            renderRecentAltas();

            // Clear Form
            document.getElementById('alta-mate-id').value = "";
            document.getElementById('alta-sku-search').value = "";
            document.getElementById('alta-qty').value = "";
            document.getElementById('alta-obs').value = "";

            // PROCESAMIENTO AUTOMATICO "QUIRÚRGICO" (Entidad 787, Smartie 2698)
            let matchingRemitoId = null;
            // Reintentar hasta 7 veces (21 segundos total)
            for (let intento = 1; intento <= 7; intento++) {
                const overlayMsg = document.querySelector('#loading-overlay p');
                if (overlayMsg) overlayMsg.innerText = `Cazando remito proyectado (Intento ${intento} de 7)...`;
                
                await new Promise(resolve => setTimeout(resolve, 3000)); // Espera de 3s
                
                const currentRemitos = await YiQi.fetch(2698, 787);
                if (currentRemitos) {
                    // Buscar el RECIÉN NACIDO: No estaba en existentes + mismo mateId (si existe) + misma qty
                    const matching = currentRemitos.find(r => {
                        const rid = String(r.ID || r.id);
                        
                        // Si el ID ya existía antes de empezar, lo ignoramos de cuajo
                        if (existingIds.includes(rid)) return false;

                        // Intentar capturar la cantidad del remito (varios nombres de campos posibles)
                        const rQty = Number(r.REMI_UNIDADES_TOTALES || r.CANTIDAD || r.STOC_CANTIDAD || r.CANTI || 0);
                        
                        // Intentar capturar el ID del material (vatios nombres posibles)
                        const rMateId = String(r.MATE_ID || r.MATE_ID_MATE || r.RECO_MATE_ID || r.ARTICULO_ID || r.PRODUCTO_ID || "");

                        const qtyMatch = rQty === Number(qty);
                        const mateMatch = !rMateId || rMateId === "" || rMateId === String(mateId); // Si no hay campo MateId, confiamos en el ID Nuevo + Qty

                        if (qtyMatch && mateMatch) {
                            return true;
                        } else {
                            console.log(`⏭️ Ignorando Remito ${rid}: QtyMatch=${qtyMatch} (${rQty} vs ${qty}), MateMatch=${mateMatch} (${rMateId} vs ${mateId})`);
                            return false;
                        }
                    });

                    if (matching) {
                        matchingRemitoId = String(matching.ID || matching.id);
                        console.log("🎯 Remito CAZADO exitosamente:", matchingRemitoId);
                        break;
                    }
                }
            }

            if (matchingRemitoId) {
                updateStatus("Procesando remito cazado...");
                const tPayload = {
                    schemaId: YIQI_CONFIG.schemaId,
                    ids: [matchingRemitoId],
                    transitionId: 119014,
                    form: ""
                };

                const tResponse = await fetch(YIQI_CONFIG.executeTransitionUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(tPayload)
                });

                if (tResponse.ok) {
                    console.log("✅ Remito de compra procesado automáticamente!");
                }
            } else {
                console.log("ℹ️ No se pudo cazar el remito. Quedará en Pendientes.");
            }

            showLoading(false);
            await showModal("Éxito", `Producción registrada (Alta #${newId}).${matchingRemitoId ? ' El stock fue ingresado automáticamente.' : ' El servidor demora; quedará en pendientes.'}`, "success");

            // Iniciar sincronización inteligente (Ráfaga de fondo)
            startIntelligentSyncPulse();
        } else {
            throw new Error("No se pudo completar el registro en YiQi.");
        }
    } catch (e) {
        showLoading(false);
        console.error(e);
        await showModal("Error", `Fallo al registrar: ${e.message}`, "error");
    }
}

async function fetchAltasRecientes() {
    const btnRefresh = document.querySelector('button[onclick="fetchAltasRecientes()"]');
    if (btnRefresh) btnRefresh.classList.add('spin');

    try {
        const data = await YiQi.fetch(YIQI_CONFIG.smartieAltas, YIQI_CONFIG.entityAlta);
        if (data) {
            recentAltas = data.slice(0, 20).map(r => ({
                fechaHora: r.AUDI_FECHA_ALTA || r.AUDI_FECHA_INSERCION || "",
                sku: r.MATE_CODIGO || "-",
                name: r.MATE_NOMBRE || "-",
                qty: Number(r.ALDP_CANTIDAD || 0),
                obs: r.ALDP_OBSERVACIONES || ""
            }));
        }
        renderRecentAltas();
    } catch (e) {
        console.error("Error trayendo altas recientes:", e);
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('spin');
    }
}

function renderRecentAltas() {
    const list = document.getElementById('alta-recent-list');
    if (recentAltas.length === 0) {
        list.innerHTML = '<p class="text-muted text-center italic">Sin registros</p>';
        return;
    }

    list.innerHTML = recentAltas.map(a => {
        // Formatear Fecha/Hora si existe
        let timeStr = "";
        if (a.fechaHora) {
            const parts = a.fechaHora.split('T');
            if (parts.length === 2) {
                const f = parts[0].split('-').reverse().join('/'); // DD/MM/YYYY
                const t = parts[1].substring(0, 5); // HH:MM
                timeStr = `${f} ${t}`;
            } else {
                timeStr = a.fechaHora;
            }
        }

        return `
        <div style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <span><b style="color:var(--primary-color);">${a.qty}</b> x ${a.sku}</span>
                <span class="text-muted" style="font-size: 0.7rem; white-space: nowrap; margin-left: 5px;">${timeStr}</span>
            </div>
            <div style="color: #475569; font-size: 0.75rem;">${a.name}</div>
            ${a.obs ? `<div style="color: #94a3b8; font-size: 0.7rem; font-style: italic; margin-top: 2px;">💬 ${a.obs}</div>` : ''}
        </div>`;
    }).join('');
}

async function fetchAltasPendientes() {
    const btnRefresh = document.querySelector('button[onclick="fetchAltasPendientes()"]');
    if (btnRefresh) btnRefresh.classList.add('spin');

    try {
        const data = await YiQi.fetch(YIQI_CONFIG.smartieAltasPendientes, YIQI_CONFIG.entityAlta);
        if (data) {
            pendientesAltas = data.map(r => ({
                id: r.ALDP_ID || r.ID || r.id,
                fechaHora: r.AUDI_FECHA_ALTA || r.AUDI_FECHA_INSERCION || "",
                sku: r.MATE_CODIGO || articlesIdMap[r.MATE_ID || r.ALDP_MATE_ID || r.MATE_ID_MATE] || "-",
                name: r.MATE_NOMBRE || "-",
                qty: Number(r.ALDP_CANTIDAD || 0),
                obs: r.ALDP_OBSERVACIONES || ""
            }));
        }
        renderAltasPendientes();
    } catch (e) {
        console.error("Error trayendo altas pendientes:", e);
    } finally {
        if (btnRefresh) btnRefresh.classList.remove('spin');
    }
}

function renderAltasPendientes() {
    const list = document.getElementById('alta-pendientes-list');
    if (pendientesAltas.length === 0) {
        list.innerHTML = '<p class="text-muted text-center italic">Sin pendientes</p>';
        return;
    }

    list.innerHTML = pendientesAltas.map(a => {
        let timeStr = "";
        if (a.fechaHora) {
            const parts = a.fechaHora.split('T');
            if (parts.length === 2) {
                const f = parts[0].split('-').reverse().join('/');
                const t = parts[1].substring(0, 5);
                timeStr = `${f} ${t}`;
            } else {
                timeStr = a.fechaHora;
            }
        }

        return `
        <div style="padding: 6px 8px; border-bottom: 1px solid #e2e8f0; font-size: 0.85rem; background: #fffbeb;">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <span><b style="color:#d97706;">${a.qty}</b> x ${a.sku}</span>
                <span class="badge bg-orange" style="font-size: 0.65rem; padding: 1px 4px;">Pendiente</span>
            </div>
            <div style="color: #475569; font-size: 0.75rem;">${a.name}</div>
            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 2px;">
                ${a.obs ? `<div style="color: #94a3b8; font-size: 0.7rem; font-style: italic;">💬 ${a.obs}</div>` : '<div></div>'}
                <span class="text-muted" style="font-size: 0.65rem;">${timeStr}</span>
            </div>
        </div>`;
    }).join('');
}

async function procesarAltasPendientes() {
    if (pendientesAltas.length === 0) return;

    if (!await showConfirm("Procesar Pendientes", "¿Deseas intentar procesar manualmente los remitos de compra para ingresar el stock?")) return;

    showLoading(true, "Buscando remitos pendientes en YiQi...");
    updateStatus("Consultando remitos de compra proyectados...");

    try {
        const token = await YiQi.getToken();
        if (!token) { showLoading(false); return; }

        // Fetch de la smartie de remitos de compra pendientes
        const remitosCompraPendientes = await YiQi.fetch(2698, 787);

        if (!remitosCompraPendientes || remitosCompraPendientes.length === 0) {
            showLoading(false);
            showModal("Sin Pendientes", "No se encontraron remitos de compra proyectados pendientes de procesamiento en el ERP.", "info");
            return;
        }

        const idsStr = remitosCompraPendientes.map(r => String(r.ID || r.id));
        updateStatus(`Procesando ${idsStr.length} remito(s)...`);

        const tPayload = {
            schemaId: YIQI_CONFIG.schemaId,
            ids: idsStr,
            transitionId: 119014,
            form: ""
        };

        const res = await fetch(YIQI_CONFIG.executeTransitionUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify(tPayload)
        });

        const data = await res.json();

        if (data.ok !== false) {
            showModal("Éxito", "Los remitos de compra han sido procesados correctamente. El stock debería verse reflejado en breve.", "success");
            // Refrescar vistas
            await Promise.all([
                fetchAltasPendientes(),
                fetchAltasRecientes(),
                fetchStock()
            ]);
        } else {
            showModal("Error", `YiQi retornó un error: ${data.error || 'Error desconocido'}`, "error");
        }
    } catch (e) {
        console.error("Error en procesamiento manual:", e);
        showModal("Error Crítico", "Falló la comunicación con el servidor al intentar procesar.", "error");
    } finally {
        showLoading(false);
    }
}

// --- IMPRESIÓN Y VISTAS ADICIONALES ---



async function visualizeCageContents(id) {
    showLoading(true);
    try {
        let cage = processedCages.find(c => String(c.id) === String(id));
        if (!cage) cage = despachos.find(c => String(c.id) === String(id));
        
        let jaulaTitle = "Jaula";
        if (cage && cage.obs) {
            const match = cage.obs.match(/Jaula N°\s*\d+/i);
            if (match) jaulaTitle = match[0];
            else jaulaTitle = cage.obs;
        }

        let remitoNum = cage ? cage.nroComprobante : id;
        if (!remitoNum || remitoNum === "S/N" || remitoNum === "undefined") {
            const yData = cage.yiqiData || {};
            remitoNum = yData.REIN_NRO_REMITO_INTERNO || yData.NUMERO_COMPROBANTE || yData.REIN_ASIGNAR_NRO_COMPR || yData.Comp || "S/N";
            if (remitoNum === "S/N" && yData.REIN_PUNTO_DE_VENTA && yData.REIN_NUMERO) {
                remitoNum = `${yData.REIN_PUNTO_DE_VENTA.toString().padStart(4, '0')}-${yData.REIN_NUMERO.toString().padStart(8, '0')}`;
            }
        }
        
        const modalTitle = jaulaTitle;

        const items = await YiQi.getChildItems(id) || [];
        if (items.length === 0) {
            await showModal(modalTitle, "<p>No hay artículos registrados en esta jaula.</p>", "info");
            return;
        }

        let html = '<div style="max-height: 50vh; overflow-y: auto;">';
        html += '<table style="width:100%; text-align:left; border-collapse: collapse; font-size: 0.9rem;">';
        html += '<thead><tr style="border-bottom: 2px solid #e2e8f0;"><th style="padding-bottom: 8px;">Artículo</th><th style="padding-bottom: 8px; text-align:right;">Cantidad</th></tr></thead><tbody>';
        
        let total = 0;
        items.forEach(i => {
            const qty = Number(i.DERI_CANTIDAD || i.CANTIDAD || 0);
            const sku = i.MATE_CODIGO || i.CODIGO || i.NOMBRE || "Item";
            const name = i.MATE_NOMBRE || i.DERI_NOMBRE_ARTICULO || "";
            total += qty;
            html += `<tr>
                <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9;">
                    <strong>${sku}</strong><br><span style="color:#64748b; font-size:0.8rem;">${name}</span>
                </td>
                <td style="padding: 10px 0; border-bottom: 1px solid #f1f5f9; text-align:right;"><strong>${qty}</strong></td>
            </tr>`;
        });
        html += '</tbody></table>';
        html += `<div style="text-align:right; font-weight:bold; margin-top: 1rem; font-size: 1.1rem; padding-right: 5px;">Total Piezas: ${total}</div>`;
        html += '</div>';

        await showModal(modalTitle, html, "info");
    } catch (e) {
        console.error("Error visualizando contenido", e);
        await showModal("Error", "No se pudo cargar el contenido de la jaula.", "error");
    } finally {
        showLoading(false);
    }
}

/**
 * PROCESAR SOBRANTES (Contingencia Lozametal)
 * Crea altas de producción por cada item con excedente y avanza los remitos de compra.
 */
/**
 * PROCESAR SOBRANTES - PLAN B (Remito de Compra Directo)
 */
async function procesarSobrantes(items, cageLabel, extraNotes = "") {
    console.log("🚀 Iniciando Plan B: Sobrantes para Jaula:", cageLabel);
    updateStatus("Generando remito de compra por excedente...");

    const token = await YiQi.getToken();
    if (!token) return null;

    // 1. Crear Cabecera del Remito de Compra (787) en el depósito 190
    const obs = `Excedente: Jaula N° ${cageLabel}`; 
    const newRemitoId = await YiQi.savePurchaseHeader(obs);

    if (!newRemitoId) {
        console.error("❌ No se pudo crear la cabecera del remito de compra.");
        return null;
    }

    // 2. Preparar ítems para el remito de compra (Child 209)
    const itemsToSave = [];
    for (const item of items) {
        const esperado = item.DERI_CANTIDAD || item.CANTIDAD || 0;
        const excedente = item._diffQty - esperado;
        const sku = item.MATE_CODIGO || item.CODIGO || item.SKU || item.DERI_CODIGO_ARTICULO || "S/N";
        
        let mateId = item.MATE_ID_MATE || item.MATE_ID || item.ARTICULO_ID || item.DERI_ID_ARTICULO || item.ID_ARTICULO;

        if (!mateId) {
            // 1. Intentar en cache local de bandejas
            if (typeof enlozadasArticles !== 'undefined') {
                const matchedArt = enlozadasArticles.find(a => 
                    String(a.MATE_CODIGO || a.CODIGO || "").trim().toLowerCase() === String(sku).trim().toLowerCase()
                );
                if (matchedArt) mateId = matchedArt.MATE_ID_MATE || matchedArt.ID || matchedArt.id;
            }
            // 2. [NUEVO] Si sigue sin aparecer, buscar en todo el catálogo (Para Pizzeras, Moldes, etc.)
            if (!mateId) {
                updateStatus(`ID no encontrado para ${sku}. Consultando catálogo global...`);
                const globalArt = await YiQi.findArticleGlobal(sku);
                if (globalArt) {
                    mateId = globalArt.MATE_ID_MATE || globalArt.ID || globalArt.id;
                    console.log(`✅ ID Global encontrado para ${sku}: ${mateId}`);
                }
            }
        }

        if (mateId && excedente > 0) {
            itemsToSave.push({
                "MATE_ID_MATE": mateId,
                "CANTIDAD": excedente,
                "CODIGO": sku,
                "NOMBRE": item.MATE_NOMBRE || item.DERI_NOMBRE_ARTICULO || "Item Sobrante"
            });
        }
    }

    if (itemsToSave.length > 0) {
        const itemsSaved = await YiQi.savePurchaseItems(newRemitoId, itemsToSave);
        if (itemsSaved) {
            // 3. Agregar Comentario adicional si existe
            if (extraNotes && extraNotes.trim() !== "") {
                await YiQi.addComment("787", newRemitoId, extraNotes);
            }

            // 4. Procesar el remito de compra (Transición 119014)
            updateStatus("Procesando remito de compra (impactando stock)...");
            await new Promise(r => setTimeout(r, 1000));

            try {
                const tPayload = {
                    schemaId: YIQI_CONFIG.schemaId,
                    ids: [String(newRemitoId)],
                    transitionId: 119014,
                    form: ""
                };

                const tRes = await fetch(YIQI_CONFIG.executeTransitionUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
                    body: JSON.stringify(tPayload)
                });

                if (tRes.ok) {
                    console.log("✅ Remito de compra Plan B procesado exitosamente.");
                    return { remitoId: newRemitoId, itemCount: itemsToSave.length };
                }
            } catch (err) { console.error("⚠️ Error finalizando remito de compra Plan B:", err); }
        }
    }
    return null;
}

/**
 * LÓGICA CAZADORA DE STOCK (Entidad 796)
 * Polling sobre Movimientos de Stock para confirmar impacto.
 */
async function cazarMovimientosStock(remitoId, cantEsperada) {
    console.log(`🔎 Iniciando Caza de Stock para Remito ${remitoId}. Esperando ${cantEsperada} renglones...`);
    
    const maxIntentos = 20; // 20 intentos x 5s = 100 segundos
    const delay = 5000;

    for (let i = 1; i <= maxIntentos; i++) {
        updateStatus(`Cazando impacto de stock (${i}/${maxIntentos})...`);
        
        try {
            // Consultar Smartie 2748 (Movimientos de Stock)
            const movimientos = await YiQi.fetch(YIQI_CONFIG.smartieMovimientosStock, 796);
            
            if (movimientos) {
                // Filtrar por nuestro Remito de Compra (campo MOST_IDENTIFICADOR_DE_ENT)
                const encontrados = movimientos.filter(m => 
                    String(m.MOST_IDENTIFICADOR_DE_ENT || "") === String(remitoId)
                );

                console.log(`📊 Intento ${i}: Encontrados ${encontrados.length} de ${cantEsperada} movimientos.`);

                if (encontrados.length >= cantEsperada) {
                    updateStatus("✅ Stock impactado correctamente!");
                    console.log("🎯 Caza exitosa. Todos los ítems impactaron.");
                    return true;
                }
            }
        } catch (e) {
            console.warn(`⚠️ Error en caza de stock (intento ${i}):`, e);
        }

        await new Promise(r => setTimeout(r, delay));
    }

    console.error("❌ Timeout agotado en caza de stock. El impacto está demorado en YiQi.");
    updateStatus("⚠️ Advertencia: El stock no impactó todavía.");
    return false;
}

// --- TAB: CONTROL DE COSTOS (GUIAS) ---
function renderGuiasCosto() {
    const list = document.getElementById('costos-guias-list');
    if (!list) return;

    const savedStr = localStorage.getItem('REMITO_GUIAS_LOGISTICA');
    const guias = savedStr ? JSON.parse(savedStr) : [];

    if (guias.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:1rem;">No hay guías generadas aún.</p>`;
        return;
    }

    list.innerHTML = guias.map(g => `
        <div class="remito-card" style="margin-bottom: 10px;">
            <div class="flex-between">
                <strong style="font-size:0.95rem; color: var(--primary-color);">📦 ${g.id}</strong>
                <div style="display:flex; gap:0.25rem;">
                    <button class="btn btn-sm btn-outline print-btn" 
                            onclick="verDetalleGuia('${g.id}')" 
                            style="font-size: 0.75rem; color: #3b82f6; border: 1px solid #bfdbfe; padding: 4px 8px; border-radius: 4px; background: #eff6ff;"
                            title="Ver Detalle">
                        👁️ Ver
                    </button>
                    <button class="btn btn-sm btn-outline print-btn" 
                            onclick="printGuia('${g.id}')" 
                            style="font-size: 0.75rem; color: #64748b; border: 1px solid #e2e8f0; padding: 4px 8px; border-radius: 4px; background: white;"
                            title="Imprimir Guía">
                        🖨️ Imprimir
                    </button>
                </div>
            </div>
            <div class="text-sm text-muted" style="margin-top:0.5rem; display:flex; justify-content:space-between;">
                <span>📅 ${g.fecha}</span>
                <span>📦 ${g.cantJaulas} Jaulas</span>
            </div>
            <div class="text-sm" style="margin-top:0.5rem; display:flex; justify-content:space-between; border-top: 1px dashed #e2e8f0; padding-top: 6px;">
                <span class="text-muted">Total Unidades: <b>${g.totalItems}</b></span>
                <span style="font-weight: 700; color: #16a34a;">Valor Decl.: $${g.montoDeclarado.toLocaleString('es-AR')}</span>
            </div>
        </div>
    `).join('');
}

function verDetalleGuia(guiaId) {
    const savedStr = localStorage.getItem('REMITO_GUIAS_LOGISTICA');
    const guias = savedStr ? JSON.parse(savedStr) : [];
    const guia = guias.find(g => g.id === guiaId);
    if (!guia) return;

    let itemsHtml = guia.items.map(i => `
        <div style="display:flex; justify-content:space-between; border-bottom: 1px solid #eee; padding: 4px 0;">
            <span style="font-size:0.85rem;">${i.sku} - ${i.name || ''}</span>
            <strong style="font-size:0.9rem;">${i.qty}</strong>
        </div>
    `).join('');

    const html = `
        <div style="text-align:left; font-size: 0.9rem;">
            <div style="margin-bottom: 1rem; color: #475569;">
                <p><b>Fecha:</b> ${guia.fecha}</p>
                <p><b>Jaulas (${guia.cantJaulas}):</b> ${guia.jaulasStr}</p>
            </div>
            <div style="margin-bottom: 0.5rem; font-weight:bold; color:var(--primary-color);">Contenido Consolidado:</div>
            <div style="max-height: 250px; overflow-y:auto; padding-right:10px; border: 1px solid #e2e8f0; padding: 8px; border-radius: 6px; background: #f8fafc;">
                ${itemsHtml}
            </div>
            <div style="display:flex; justify-content:space-between; margin-top: 10px; padding: 8px; background: #eff6ff; border-radius: 6px; font-weight: bold;">
                <span>Total Items: ${guia.totalItems}</span>
                <span>$ ${guia.montoDeclarado.toLocaleString('es-AR')}</span>
            </div>
        </div>
    `;

    showModal(`Detalle de ${guia.id}`, html, 'info');
}

function printGuia(guiaId) {
    const savedStr = localStorage.getItem('REMITO_GUIAS_LOGISTICA');
    const guias = savedStr ? JSON.parse(savedStr) : [];
    const g = guias.find(x => x.id === guiaId);
    if (!g) return showModal("Error", "Guía no encontrada", "error");

    let itemsHtml = g.items.map(i => `
        <tr>
            <td style="padding: 4px 8px; border-bottom: 1px solid #eee; text-align: right; font-weight: 700;">${i.qty}</td>
            <td style="padding: 4px 8px; border-bottom: 1px solid #eee;"><b>${i.sku}</b> - ${i.name}</td>
        </tr>
    `).join('');

    // Base template for one A4 page
    const guiaTemplate = `
        <div class="page-break" style="width: 190mm; height: 270mm; border: 2px solid #000; padding: 10mm; margin: 0 auto 10mm auto; box-sizing: border-box; font-family: 'Inter', sans-serif; position: relative; background: #fff;">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #000; padding-bottom: 5mm; margin-bottom: 5mm;">
                <div>
                    <h2 style="margin: 0; font-size: 18pt; text-transform: uppercase;">Guía de Envío a Lozametal</h2>
                    <p style="margin: 2mm 0 0 0; font-size: 10pt; color: #555;">TMC Crespo - Remito Interno</p>
                </div>
                <div style="text-align: right;">
                    <h3 style="margin: 0; font-size: 16pt;">${g.id}</h3>
                    <p style="margin: 2mm 0 0 0; font-size: 10pt;">Fecha: ${g.fecha}</p>
                </div>
            </div>
            
            <h4 style="margin: 0 0 4mm 0; font-size: 12pt;">Resumen de Artículos</h4>
            <table style="width: 100%; border-collapse: collapse; font-size: 10pt; margin-bottom: 8mm;">
                <thead style="background: #f1f5f9; text-transform: uppercase;">
                    <tr>
                        <th style="padding: 4px 8px; border: 1px solid #000; width: 15%; text-align: right;">Cant.</th>
                        <th style="padding: 4px 8px; border: 1px solid #000; text-align: left;">Artículo</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsHtml}
                </tbody>
                <tfoot>
                    <tr>
                        <td style="padding: 4px 8px; border: 1px solid #000; text-align: right; font-weight: bold; font-size: 11pt;">${g.totalItems}</td>
                        <td style="padding: 4px 8px; border: 1px solid #000; font-weight: bold; text-align: right;">TOTAL UNIDADES</td>
                    </tr>
                </tfoot>
            </table>

            <h4 style="margin: 0 0 4mm 0; font-size: 12pt;">Detalles del Despacho</h4>
            <div style="border: 1px solid #000; padding: 4mm; font-size: 10pt;">
                <p style="margin: 0 0 2mm 0;"><b>Total Jaulas:</b> ${g.cantJaulas}</p>
                <p style="margin: 0 0 2mm 0;"><b>Jaulas N°:</b> ${g.jaulasStr}</p>
                ${g.isMustang ? '<p style="margin: 0 0 2mm 0;"><b>Transportista:</b> Transporte Mustang</p>' : ''}
                <p style="margin: 1mm 0 0 0; font-size: 11pt;"><b>Valor Declarado (Seguro):</b> $${g.montoDeclarado.toLocaleString('es-AR')}.-</p>
            </div>

            <div style="position: absolute; bottom: 10mm; left: 10mm; right: 10mm; display: flex; justify-content: space-between; font-size: 9pt;">
                <div style="width: 40%; text-align: center; border-top: 1px solid #000; padding-top: 2mm;">
                    Firma TMC Crespo
                </div>
                <div style="width: 40%; text-align: center; border-top: 1px solid #000; padding-top: 2mm;">
                    Recibe Lozametal
                </div>
            </div>
        </div>
    `;

    // Triplicado
    const fullHtml = guiaTemplate + guiaTemplate + guiaTemplate;

    const printWin = window.open('', '', 'width=800,height=800');
    // Generamos el documento para imprimir
    printWin.document.write(`
        <html>
            <head>
                <title>Imprimir ${g.id}</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;700&display=swap" rel="stylesheet">
                <style>
                    @media print {
                        @page { size: A4 portrait; margin: 0; }
                        body { margin: 0; padding: 0; background: #fff; }
                        .page-break { 
                            page-break-after: always; 
                            border: none !important; 
                            margin: 0 !important;
                            padding-top: 10mm !important;
                        }
                    }
                    body { background: #f1f5f9; padding: 20px; text-size-adjust: none; -webkit-text-size-adjust: none; }
                </style>
            </head>
            <body>
                ${fullHtml}
                <script>
                    // Pequeño delay para asegurar que las fuentes carguen antes del diálogo de impresión
                    setTimeout(() => {
                        window.print();
                        window.close();
                    }, 500);
                </script>
            </body>
        </html>
    `);
    printWin.document.close();
}

// Hook into existing nav to render Admin when opened
document.addEventListener('DOMContentLoaded', () => {
    const navBtns = document.querySelectorAll('.nav-tab');
    navBtns.forEach(b => {
         b.addEventListener('click', () => {
             if(b.textContent.includes('Administración')) {
                 renderGuiasCosto();
                 renderDiscrepancias();
             }
         });
    });
});
// --- REGISTRO DE DISCREPANCIAS ---
function registrarDiscrepanciaLocal(jaulaId, nroRemito, itemsDiff, cageLabel) {
    const savedStr = localStorage.getItem('REMITO_DISCREPANCIAS_CONTROL');
    const discrepancias = savedStr ? JSON.parse(savedStr) : [];
    
    const now = new Date();
    const day = now.getDate();
    const month = now.getMonth() + 1;
    const year = String(now.getFullYear()).slice(-2);
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const fechaFormateada = `${day}/${month}/${year} ${hours}:${minutes}`;

    const nueva = {
        id: Date.now(),
        fecha: fechaFormateada,
        jaulaId: jaulaId,
        nroRemito: nroRemito,
        cageLabel: cageLabel, // Guardamos la etiqueta real (Ej: 1377)
        items: itemsDiff.map(i => ({
            sku: i.MATE_CODIGO || i.CODIGO || "Item",
            name: i.MATE_NOMBRE || i.DERI_NOMBRE_ARTICULO || "",
            esperada: i.DERI_CANTIDAD || i.CANTIDAD || 0,
            recibida: i._diffQty,
            motivo: i._diffNote || "Sin motivo especificado"
        }))
    };
    
    discrepancias.unshift(nueva);
    localStorage.setItem('REMITO_DISCREPANCIAS_CONTROL', JSON.stringify(discrepancias.slice(0, 100))); // Top 100
}

async function borrarHistorialDiscrepancias() {
    const confirm = await showConfirm(
        "Borrar Historial", 
        "¿Estás seguro de que deseas eliminar todo el historial de discrepancias y el balance global?<br><br><b>Esta acción no se puede deshacer.</b>",
        "Sí, Borrar Todo",
        "Cancelar"
    );

    if (confirm) {
        localStorage.removeItem('REMITO_DISCREPANCIAS_CONTROL');
        renderDiscrepancias();
        showModal("Historial Borrado", "El registro de discrepancias ha sido limpiado correctamente.", "success");
    }
}

function renderDiscrepancias() {
    const list = document.getElementById('loza-discrepancias-list');
    if (!list) return;

    const savedStr = localStorage.getItem('REMITO_DISCREPANCIAS_CONTROL');
    const logs = savedStr ? JSON.parse(savedStr) : [];

    if (logs.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:2rem;">No hay discrepancias registradas.</p>`;
        return;
    }

    // --- LOGICA DE AGREGACION (BALANCE GLOBAL HORIZONTAL) ---
    const balanceMap = {};
    logs.forEach(log => {
        log.items.forEach(i => {
            if (!balanceMap[i.sku]) {
                balanceMap[i.sku] = { sku: i.sku, name: i.name, totalDiff: 0 };
            }
            balanceMap[i.sku].totalDiff += (i.recibida - i.esperada);
        });
    });

    const summaryHtml = `
        <div style="background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 0.6rem 1rem; margin-bottom: 1rem; display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <div style="font-size: 0.75rem; color: #64748b; font-weight: 800; text-transform: uppercase; border-right: 2px solid #cbd5e1; padding-right: 1rem; margin-right: 0.5rem;">📊 Balance Global</div>
            <div style="display: flex; gap: 10px; flex-wrap: wrap;">
                ${Object.values(balanceMap).filter(b => b.totalDiff !== 0).map(b => {
                    const color = b.totalDiff > 0 ? '#16a34a' : '#ef4444';
                    const sign = b.totalDiff > 0 ? '+' : '';
                    return `
                        <div style="background:white; padding: 4px 10px; border-radius:20px; border:1px solid #e2e8f0; display:flex; align-items:center; gap:8px; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
                            <span style="font-size:0.75rem; color:#1e293b; font-weight:700;">${b.sku}</span>
                            <span style="font-size:0.85rem; font-weight:900; color:${color};">${sign}${b.totalDiff}</span>
                        </div>
                    `;
                }).join('')}
            </div>
        </div>
    `;

    // --- TABLA UNICA CON AGRUPACION (MAESTRO-DETALLE FULL-WIDTH) ---
    const tableBody = logs.map(log => {
        const date24h = log.fecha;
        const totalItems = log.items.length;
        
        return log.items.map((i, index) => {
            const diff = i.recibida - i.esperada;
            const diffClass = diff > 0 ? 'text-success font-bold' : (diff < 0 ? 'text-danger font-bold' : '');
            const sign = diff > 0 ? '+' : '';
            
            // Celda de identificación agrupada (Solo una vez por remito)
            const maestroCell = index === 0 ? `
                <td rowspan="${totalItems}" style="width: 130px; background: #fcfcfc; padding: 0.75rem 0.5rem; border-right: 1px solid #e2e8f0; vertical-align: top; border-bottom: 2px solid #cbd5e1;">
                    <div style="font-size: 0.65rem; color: #94a3b8; font-weight: 500; margin-bottom: 2px;">${log.fecha}</div>
                    <div style="font-size: 0.75rem; font-weight: 700;">
                        <a href="https://me.yiqi.com.ar/view/REMITO_INTERNO?schemaId=${YIQI_CONFIG.schemaId}#/${log.jaulaId || log.nroRemito}" 
                           target="_blank" style="color:#2563eb; text-decoration:none;">Remito #${log.nroRemito}</a>
                    </div>
                </td>
            ` : '';

            const rowStyle = index === totalItems - 1 ? 'border-bottom: 2px solid #cbd5e1;' : 'border-bottom: 1px solid #f1f5f9;';

            return `
                <tr style="${rowStyle}">
                    ${maestroCell}
                    <td style="padding: 10px; font-weight:700; color:#1e293b; font-size: 0.9rem; width: 150px;">${i.sku}</td>
                    <td style="padding: 10px; text-align:center; font-size: 0.95rem; width: 80px;">${i.recibida}</td>
                    <td style="padding: 10px; text-align:center; color:#94a3b8; font-size: 0.9rem; width: 80px;">${i.esperada}</td>
                    <td style="padding: 10px; text-align:center; font-size: 1rem; width: 90px;" class="${diffClass}">${sign}${diff}</td>
                    <td style="padding: 10px; font-size:0.85rem; color:#475569; line-height: 1.4;">
                        <span style="background: #f8fafc; padding: 3px 10px; border-radius: 4px; border: 1px solid #edf2f7; display: inline-block;">
                            ${i.motivo || "Sin observaciones"}
                        </span>
                    </td>
                </tr>
            `;
        }).join('');
    }).join('');

    const tableHtml = `
        <div style="background: white; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <table class="table-minimal" style="width: 100%; border-collapse: collapse; table-layout: fixed;">
                <thead style="background: #f8fafc; position: sticky; top: 0; z-index: 10;">
                    <tr style="text-align: left; border-bottom: 2px solid #e2e8f0;">
                        <th style="padding: 12px 10px; width: 130px; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight:800;">Control / Jaula</th>
                        <th style="padding: 12px 10px; width: 150px; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight:800;">SKU</th>
                        <th style="padding: 12px 10px; width: 80px; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight:800; text-align:center;">Recibida</th>
                        <th style="padding: 12px 10px; width: 80px; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight:800; text-align:center;">Esperada</th>
                        <th style="padding: 12px 10px; width: 90px; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight:800; text-align:center;">Dif.</th>
                        <th style="padding: 12px 10px; font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; font-weight:800;">Motivo</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableBody}
                </tbody>
            </table>
        </div>
    `;

    list.innerHTML = summaryHtml + tableHtml;
}

// Hook into existing nav to render Admin when opened
document.addEventListener('DOMContentLoaded', () => {
    const navBtns = document.querySelectorAll('.nav-tab');
    navBtns.forEach(b => {
         b.addEventListener('click', () => {
             if(b.textContent.includes('Administración')) {
                 renderGuiasCosto();
                 renderDiscrepancias();
             }
            if(b.textContent.includes('Control Calidad')) {
                fetchStockLozametal();
                fetchOpenCages();
            }
        });
    });
});

/**
 * FETCH STOCK LOZAMETAL (Entidad 794 - Smartie 2738)
 */
async function fetchStockLozametal() {
    const list = document.getElementById('calidad-stock-list');
    if (!list) return;

    list.innerHTML = '<p class="text-muted text-center italic" style="padding:2rem;">⏳ Cargando stock de Lozametal...</p>';

    try {
        const smartieId = YIQI_CONFIG.smartieStockLozametal || 2738;
        const data = await YiQi.fetch(smartieId, 794);
        if (data) {
            lastStockLozametal = data;
            renderCalidadStock(data);
        }
    } catch (e) {
        console.error("Error fetchStockLozametal:", e);
        list.innerHTML = '<p class="text-danger text-center">Error al cargar el stock.</p>';
    }
}

let stockEnJaulas = {}; // SKU -> Total en Jaulas Abiertas

/**
 * Calcula cuánto stock de cada semielaborado hay "comprometido" en jaulas abiertas
 */
async function refreshStockDisponibilidad() {
    console.log("📊 Calculando disponibilidad de stock...");
    stockEnJaulas = {};
    
    try {
        const token = await YiQi.getToken();
        
        // Consultar ítems de todas las jaulas abiertas en paralelo
        const promises = calidadCages.map(async (cage) => {
            const url = `${YIQI_CONFIG.getChildListUrl}?entityId=787&schemaId=1491&childId=209&instanceId=${cage.id}&take=100`;
            const r = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
            const res = await r.json();
            const items = res.data || res.rows || res.instances || [];
            
            for (const i of items) {
                const skuTerm = i.MATE_CODIGO || i.CODIGO || "";
                const qty = Number(i.DERE_CANTIDAD || i.CANTIDAD || 0);
                
                // Encontrar el semielaborado (LF o ELZ) para este terminado
                const receta = recetasEnlozado.find(r => r.term === skuTerm);
                if (receta) {
                    const isELZ = (i.DERE_PRECIO_NETO || i.PRECIO_NETO || 0) > (receta.costo * 1.1);
                    const rawSku = isELZ ? receta.elz : receta.lf;
                    if (rawSku) {
                        stockEnJaulas[rawSku] = (stockEnJaulas[rawSku] || 0) + qty;
                    }
                }
            }
        });

        await Promise.all(promises);
        
        // Re-renderizar stock con la nueva info de disponibilidad
        if (lastStockLozametal && lastStockLozametal.length > 0) {
            renderCalidadStock(lastStockLozametal);
        }
    } catch (e) {
        console.error("Error refreshStockDisponibilidad:", e);
    }
}

// --- CONTROL DE CALIDAD LOGIC ---

function filterCalidadStock() {
    const query = document.getElementById('calidad-stock-search').value.toLowerCase().trim();
    if (!query) {
        renderCalidadStock(lastStockLozametal);
        return;
    }

    const filtered = lastStockLozametal.filter(item => {
        const sku = (item.MATE_CODIGO || item.CODIGO || item.STOC_SKU || '').toLowerCase();
        const name = (item.MATE_NOMBRE || item.NOMBRE || '').toLowerCase();
        
        // Buscar coincidencia en Recetas (Transformar A)
        const rawSku = (item.MATE_CODIGO || item.CODIGO || item.STOC_SKU || '').toUpperCase().trim();
        const receta = recetasEnlozado.find(r => r.lf === rawSku || r.elz === rawSku);
        const termMatch = receta ? (
            receta.term.toLowerCase().includes(query) || 
            (receta.termName || '').toLowerCase().includes(query)
        ) : false;

        return sku.includes(query) || name.includes(query) || termMatch;
    });

    renderCalidadStock(filtered);
}

function renderCalidadStock(data) {
    const list = document.getElementById('calidad-stock-list');
    if (!list) return;

    // Filtrar solo items con stock real > 0
    const stockItems = data.filter(item => {
        const qty = parseFloat(item.STOCK || item.CANTIDAD || item.STOC_CANTIDAD || 0);
        return qty > 0;
    });

    if (stockItems.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="padding:2rem;">No hay mercadería con stock disponible.</p>`;
        return;
    }

    list.innerHTML = `
        <table class="stock-table">
            <thead>
                <tr style="font-size: 0.7rem; color: #94a3b8; text-transform: uppercase; border-bottom: 2px solid #e2e8f0; background: #f8fafc;">
                    <th style="padding: 12px 10px; text-align: left; width: 35%;">Producto</th>
                    <th style="padding: 12px 10px; text-align: center; width: 15%;">Stock</th>
                    <th style="padding: 12px 10px; text-align: center; width: 40%;">Transformar A:</th>
                    <th style="padding: 12px 10px; text-align: right; width: 10%;"></th>
                </tr>
            </thead>
            <tbody>
                ${stockItems.map(item => {
                    const name = item.MATE_NOMBRE || item.NOMBRE || item.ARTICULO || item.PRODUCTO || '';
                    const sku = item.MATE_CODIGO || item.CODIGO || item.STOC_SKU || item.SKU || '';
                    const stock = item.STOCK || item.CANTIDAD || item.STOC_CANTIDAD || 0;

                    // Encontrar receta por SKU de LF o ELZ
                    const receta = recetasEnlozado.find(r => 
                        (r.lf && r.lf.trim().toUpperCase() === sku.trim().toUpperCase()) || 
                        (r.elz && r.elz.trim().toUpperCase() === sku.trim().toUpperCase())
                    );
                    
                    const termSku = receta ? receta.term : "SIN RECETA";
                    const termName = receta ? (receta.termName || termSku) : termSku;
                    const isELZ = receta && receta.elz && receta.elz.trim().toUpperCase() === sku.trim().toUpperCase();

                    const rowStyle = receta ? "" : "background: #fffafa; color: #94a3b8;";

                    return `
                        <td style="padding: 8px 10px; border-bottom: 1px solid #f1f5f9;">
                            <div style="font-weight: 700; color: #1e293b; font-size: 0.85rem;">${sku}</div>
                            <div style="font-size: 0.65rem; opacity: 0.7; line-height: 1.2; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${name}">${name}</div>
                        </td>
                        <td style="text-align: center; font-weight: 800; color: var(--primary-color); border-bottom: 1px solid #f1f5f9; font-size: 1rem;">
                            ${stock} <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 400;">(${stock - (stockEnJaulas[sku] || 0)})</span>
                        </td>
                        <td style="text-align: center; border-bottom: 1px solid #f1f5f9;">
                            <div style="display: flex; flex-direction: column; align-items: center; gap: 2px;">
                                <span title="${termName}" style="display: inline-block; padding: 4px 8px; border-radius: 6px; font-size: 0.75rem; font-weight: 800; ${receta ? 'background:#dcfce7; color:#166534; border: 1px solid #bbf7d0;' : 'background:#f1f5f9; color:#64748b; border: 1px dashed #cbd5e1;'}">
                                    ${termSku}
                                </span>
                                ${receta ? `<div style="font-size: 0.65rem; opacity: 0.7; line-height: 1.1; max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: center;" title="${termName}">${termName}</div>` : ''}
                            </div>
                        </td>
                        <td style="text-align: right; padding-right: 10px; border-bottom: 1px solid #f1f5f9;">
                            ${receta ? `
                                <button class="btn btn-sm" 
                                        style="padding: 2px 10px; font-weight: 700; font-size: 1.3rem; line-height: 1; 
                                               background: ${activeCalidadCage ? '#2563eb' : '#64748b'}; 
                                               color: white; border: none; border-radius: 6px; cursor: pointer;
                                               box-shadow: 0 2px 4px rgba(0,0,0,0.1); transition: all 0.2s;" 
                                        onclick="addToCalidadBasket('${sku}', '${name.replace(/'/g, "\\'")}', '${termSku}', '${isELZ ? 'ELZ' : 'LF'}', ${stock})">
                                    +
                                </button>
                            ` : `
                                <button class="btn btn-sm" style="padding: 4px 8px; background:#f1f5f9; color:#94a3b8; cursor:help;" onclick="showModal('Falta Configuración', 'El SKU ${sku} no tiene una receta asignada en Configuración > Recetas.', 'info')">
                                    ?
                                </button>
                            `}
                        </td>
                    </tr>
                    `;
                }).join('')}
            </tbody>
        </table>
    `;
}

async function addToCalidadBasket(rawSku, name, termSku, origin, maxStock) {
    if (!activeCalidadCage) {
        showModal("Atención", "Debes seleccionar primero una Jaula del listado central para poder cargarle artículos.", "warning");
        return;
    }

    const inputQty = await showPrompt("Cantidad a Recibir", `¿Cuántas unidades de ${termSku} vas a declarar?`, "1", "number");
    const qty = parseInt(inputQty);
    if (isNaN(qty) || qty <= 0) return;

    showLoading(true);
    updateStatus(`Agregando ${termSku} a YiQi...`);

    try {
        const receta = recetasEnlozado.find(r => r.term === termSku);
        const costoBase = receta ? receta.costo : 0;
        let precioNeto = origin === 'ELZ' ? costoBase * 1.20 : costoBase;

        // 1. Guardar Producto Terminado (Remito de Compra - 787)
        const artGlobal = await YiQi.findArticleGlobal(termSku);
        const mateId = artGlobal ? (artGlobal.MATE_ID_MATE || artGlobal.ID || artGlobal.id) : null;

        const newItem = {
            "CANTIDAD": qty,
            "PRECIO_NETO": precioNeto,
            "CODIGO": termSku,
            "NOMBRE": name,
            "MATE_ID_MATE": mateId
        };

        updateStatus("Sincronizando Compra...");
        const savedCompra = await YiQi.saveChildInstances(activeCalidadCage.id, [newItem], 209);
        
        // 2. Guardar Semielaborado Insumido (Remito Interno - 781)
        if (activeCalidadCage.consumoId) {
            updateStatus("Sincronizando Consumo...");
            const artRaw = await YiQi.findArticleGlobal(rawSku);
            const mateRawId = artRaw ? (artRaw.MATE_ID_MATE || artRaw.ID || artRaw.id) : null;
            
            const newInsumo = {
                "CANTIDAD": qty,
                "DERI_CANTIDAD": String(qty),
                "CODIGO": rawSku,
                "NOMBRE": artRaw ? (artRaw.MATE_NOMBRE || artRaw.NOMBRE) : `Insumo ${rawSku}`,
                "MATE_ID_MATE": mateRawId
            };
            await YiQi.saveChildInstances(activeCalidadCage.consumoId, [newInsumo], 227);
        }

        if (savedCompra) {
            console.log("✅ Ítem(s) agregados a YiQi.");
            await fetchCageItems(activeCalidadCage.id, true);
            refreshStockDisponibilidad(); // Actualizar el Stock Crudo gris en tiempo real
        }
    } catch (e) {
        console.error("Error addToCalidadBasket:", e);
        showModal("Error", "No se pudo sincronizar el ítem: " + e.message, "error");
    } finally {
        showLoading(false);
    }
}

function renderCalidadBasket() {
    const container = document.getElementById('calidad-basket');
    if (!container) return;

    if (calidadBasket.length === 0) {
        container.innerHTML = `<p class="text-muted text-center italic" style="margin-top: 2rem;">No hay productos seleccionados.</p>`;
        return;
    }

    const rows = calidadBasket.map((item, idx) => {
        const dualSyncIcon = item.hasConsumo ? '✅' : '⏳';
        const dualSyncText = item.hasConsumo ? 'Consumo Vinculado' : 'Pendiente Sincro Consumo';
        const dualSyncColor = item.hasConsumo ? '#10b981' : '#f59e0b';

        return `
        <div class="basket-item" style="background: white; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: 8px;">
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 2px;">
                        <span style="font-weight: 800; color: #1e293b; font-size: 1rem;">${item.termSku}</span>
                        <span style="font-size: 0.65rem; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #64748b; font-weight: 700;">COMPRA</span>
                    </div>
                    <div style="font-size: 0.75rem; color: #1e40af; font-weight: 600; display: flex; align-items: center; gap: 4px;">
                        <i class="fas fa-arrow-right" style="font-size: 0.6rem;"></i> Insumo: ${item.rawSku} (${item.origin})
                    </div>
                </div>
                <button class="btn-icon" style="color: #ef4444; background: #fee2e2; border: 1px solid #fecaca; cursor: pointer; font-size: 1rem; padding: 4px; border-radius: 8px; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" 
                        onclick="removeFromCalidadBasket(${idx})" title="Quitar item del remito">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>

            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 10px; padding-top: 10px; border-top: 1px solid #f1f5f9;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="background: #f8fafc; padding: 4px 12px; border-radius: 8px; border: 1px solid #e2e8f0;">
                        <span style="font-size: 0.7rem; font-weight: 700; color: #64748b; text-transform: uppercase; display: block; line-height: 1;">Cant</span>
                        <span style="font-size: 1.1rem; font-weight: 900; color: #1e293b;">${item.qty}</span>
                    </div>
                    <div title="${dualSyncText}" style="font-size: 0.7rem; color: ${dualSyncColor}; font-weight: 700; background: ${dualSyncColor}11; padding: 4px 8px; border-radius: 6px;">
                        ${dualSyncIcon} Sync Consumo
                    </div>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 0.6rem; color: #94a3b8; text-transform: uppercase; font-weight: 800;">Costo Est.</div>
                    <div style="font-weight: 800; font-size: 0.95rem; color: #059669;">$${(item.costo * item.qty).toLocaleString()}</div>
                </div>
            </div>
        </div>
    `;}).join('');

    container.innerHTML = rows;
}

async function removeFromCalidadBasket(index) {
    const item = calidadBasket[index];
    if (!item || !item.id) {
        calidadBasket.splice(index, 1);
        renderCalidadBasket();
        return;
    }

    const ok = await showConfirm("Confirmar", `¿Eliminar ${item.termSku} (y su insumo ${item.rawSku}) de la jaula?`);
    if (!ok) return;

    showLoading(true);
    updateStatus("Eliminando registros...");

    try {
        // 1. Eliminar de Compra (787)
        await YiQi.deleteChildInstance(activeCalidadCage.id, item.id, 209);

        // 2. Eliminar de Consumo (781)
        // Intentamos localizar el ítem en el remito interno que coincida con SKU y Cantidad
        if (activeCalidadCage.consumoId) {
            const token = await YiQi.getToken();
            const url = `${YIQI_CONFIG.getChildListUrl}?entityId=781&schemaId=${YIQI_CONFIG.schemaId}&childId=227&instanceId=${activeCalidadCage.consumoId}`;
            const r = await fetch(url, { headers: { "Authorization": `Bearer ${token}` } });
            if (r.ok) {
                const res = await r.json();
                const remoteInsumos = res.data || res.rows || [];
                // Buscamos el ítem que coincida
                const toDelete = remoteInsumos.find(ins => 
                    (ins.MATE_CODIGO || ins.CODIGO) === item.rawSku && 
                    Number(ins.DERI_CANTIDAD || ins.CANTIDAD) === item.qty
                );
                if (toDelete) {
                    await YiQi.deleteChildInstance(activeCalidadCage.consumoId, toDelete.ID || toDelete.id, 227);
                }
            }
        }

        console.log("🗑️ Registro dual eliminado.");
        await fetchCageItems(activeCalidadCage.id, true);
        refreshStockDisponibilidad(); // Actualizar el Stock Crudo gris al eliminar
    } catch (e) {
        console.error("Error removeFromCalidadBasket:", e);
        showModal("Error", "Ocurrió un problema al eliminar: " + e.message, "error");
    } finally {
        showLoading(false);
    }
}

function updateCalidadQty(idx, val) {
    // Ya no se usa edición manual en tiempo real para evitar desincronías
    console.warn("updateCalidadQty desactivado. Use eliminar y volver a agregar.");
}

function handleCalidadPhoto(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            calidadPhoto = e.target.result; // Base64
            document.getElementById('calidad-photo-preview').style.display = 'block';
            document.querySelector('#calidad-photo-preview img').src = calidadPhoto;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

function removeCalidadPhoto() {
    calidadPhoto = null;
    document.getElementById('calidad-photo-input').value = '';
    document.getElementById('calidad-photo-preview').style.display = 'none';
}

async function procesarControlCalidad() {
    if (calidadBasket.length === 0) {
        showModal("Error", "La canasta está vacía.", "error");
        return;
    }

    if (!calidadPhoto) {
        showModal("Atención", "Es obligatorio adjuntar la foto del remito del proveedor para continuar.", "warning");
        return;
    }

    // 1. Pedir Número de Jaula (Solo Números)
    const nroJaula = await showPrompt("Identificación", "Ingresa el Número de Jaula (obligatorio):", "", "number");
    if (!nroJaula || nroJaula.trim() === "") {
        showModal("Atención", "El número de jaula es obligatorio para el seguimiento.", "warning");
        return;
    }

    const ok = await showConfirm("Confirmar Ingreso", `¿Deseas procesar el alta de ${calidadBasket.length} artículos transformados de la Jaula ${nroJaula}?`);
    if (!ok) return;

    showLoading(true);
    updateStatus("Iniciando Doble Alta...");

    try {
        // 2. Ejecutar Procesos de Documentación
        updateStatus("Generando documentos en YiQi...");

        const processA = crearRemitoInternoConsumo(calidadBasket, nroJaula);
        const processB = crearRemitoCompraTerminados(calidadBasket, nroJaula);

        const [resA, resB] = await Promise.all([processA, processB]);

        if (resA && resB) {
            // 3. Subir Foto POST-CREACIÓN (Vincular al Remito de Compra resB)
            updateStatus("Subiendo foto y vinculando al remito...");
            try {
                const blob = await (await fetch(calidadPhoto)).blob();
                const file = new File([blob], `FOTO_JAULA_${nroJaula}.jpg`, { type: "image/jpeg" });
                
                const fileName = await YiQi.uploadFile(file, "8296");
                if (fileName) {
                    // Actualizamos el remito de compra con el nombre del archivo
                    const now = new Date();
                    const pad = (n) => n.toString().padStart(2, '0');
                    const shortDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
                    const fullDate = `${shortDate} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
                    
                    const formStr = `4239=1991&4240=13541&4243=155&4244=${encodeURIComponent(fullDate)}&13057=${encodeURIComponent(shortDate)}&4241=${encodeURIComponent("Jaula N° " + nroJaula)}&11086=off`;
                    
                    await YiQi.updateInstanceForm("787", resB, formStr, `8296=${fileName}`);
                    console.log("📸 Foto vinculada correctamente al remito #" + resB);
                }
            } catch (err) {
                console.warn("Fallo subida de foto diferida:", err);
            }

            showLoading(false);
            showModal("✨ Ingreso Exitoso", `
                Se han generado correctamente:
                <br><b>Consumo:</b> Remito #${resA} (Depo 157 ➔ 192)
                <br><b>Ingreso:</b> Compra #${resB} (Estado: PROCESADO)
                <br><b>Jaula:</b> ${nroJaula}
            `, "success");

            // Limpiar todo
            calidadBasket = [];
            removeCalidadPhoto();
            renderCalidadBasket();
            fetchStockLozametal();
        } else {
            throw new Error("Uno de los procesos falló. Ver consola para detalles.");
        }

    } catch (e) {
        showLoading(false);
        console.error("Error en Control de Calidad:", e);
        showModal("Error Crítico", "No se pudo completar la operación: " + e.message, "error");
    }
}

async function saveNewCageHeader(nroRemito, nroJaula, file) {
    showLoading(true);
    updateStatus("Generando Remito de Compra (Paso 1/2)...");

    try {
        const token = await YiQi.getToken();
        const now = new Date();
        const pad = (n) => n.toString().padStart(2, '0');
        const shortDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
        const fullDate = `${shortDate} ${pad(now.getHours())}:${pad(now.getMinutes())}`;

        const obsCompra = "Jaula N° " + nroJaula;
        // 4239: Nro Remito (OFICIAL), 4240: Lozametal (13541), 4243: Depo 1 (155)
        const formStrCompra = `4239=${nroRemito}&4240=13541&4243=155&4244=${encodeURIComponent(fullDate)}&13057=${encodeURIComponent(shortDate)}&4241=${encodeURIComponent(obsCompra)}&11086=off`;
        
        // 1. CREAR REMITO DE COMPRA (787)
        const resCompra = await fetch(YIQI_CONFIG.saveUrls[0], {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({
                schemaId: "1491",
                entityId: "787",
                form: formStrCompra
            })
        }).then(r => r.json());

        const compraId = resCompra.newId || resCompra.id;

        if (!compraId) {
            throw new Error("No se pudo crear el remito de compra: " + (resCompra.error || "Error desconocido"));
        }

        console.log("✅ Remito de Compra creado:", compraId);
        updateStatus("Sincronizando... (Paso 2/2)");
        
        // ESPERA ESTRATÉGICA
        await new Promise(r => setTimeout(r, 3000));

        // 2. CREAR REMITO INTERNO DE CONSUMO (781)
        updateStatus("Generando Remito de Consumo vinculado...");
        const obsConsumo = `CONSUMIDO - Remito Proveedor N° ${nroRemito} - ${obsCompra}`;
        
        // Creamos el payload directo para 781 para mayor seguridad
        const formStrConsumo = `4181=157&4182=192&4180=${encodeURIComponent(obsConsumo)}&13096=${encodeURIComponent(nroRemito)}`;
        
        const resConsumo = await fetch(YIQI_CONFIG.saveUrls[0], {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
            body: JSON.stringify({
                schemaId: "1491",
                entityId: "781",
                form: formStrConsumo
            })
        }).then(r => r.json());

        const consumoId = resConsumo.newId || resConsumo.id;

        if (!consumoId) {
            console.error("❌ Falló creación de Remito Interno:", resConsumo);
        } else {
            console.log("🔗 Remito Interno de Consumo creado:", consumoId);
        }

        // 3. SUBIR FOTO (Si existe)
        if (file) {
            updateStatus("Subiendo foto del remito...");
            const fieldId = YIQI_CONFIG.fieldCalidadFoto || "8296";
            const uploadedName = await YiQi.uploadFile(file, String(fieldId));
            
            if (uploadedName) {
                updateStatus("Vinculando foto a Compra...");
                await YiQi.updateInstanceForm("787", compraId, formStrCompra, `${fieldId}=${uploadedName}`);
            }
        }

        showModal("Éxito Total", `
            Se han registrado los documentos correctamente:
            <br>• <b>Compra:</b> #${compraId}
            <br>• <b>Consumo:</b> #${consumoId || 'Pendiente'}
        `, "success");

        fetchOpenCages(); 

    } catch (e) {
        console.error("Error saveNewCageHeader:", e);
        showModal("Error en Registro", "La operación falló: " + e.message, "error");
    } finally {
        showLoading(false);
    }
}

// --- NUEVO FLUJO TRIPLE CONTROL ---

let activeCalidadCage = null;
let calidadCages = [];

/**
 * Muestra el modal para crear una nueva jaula (Etapa 1)
 */
async function showNewCageModal() {
    const renderModalContent = (errorMsg = "") => {
        return `
        <div style="display: flex; flex-direction: column; gap: 1rem; text-align: left; padding: 0.5rem; width: 100%; max-width: 360px; margin: 0 auto;">
            <div style="text-align: center; margin-bottom: 0.5rem;">
                <div style="background: #eff6ff; width: 55px; height: 55px; border-radius: 15px; display: flex; align-items: center; justify-content: center; margin: 0 auto 10px;">
                    <i class="fas fa-truck-loading" style="font-size: 1.4rem; color: #3b82f6;"></i>
                </div>
                <h4 style="margin:0; color: #1e293b; font-size: 1.2rem;">Nueva Jaula</h4>
                <p style="font-size: 0.75rem; color: #64748b; margin-top: 4px;">Ingreso de Remito Proveedor</p>
            </div>

            ${errorMsg ? `<div style="background: #fef2f2; color: #b91c1c; padding: 10px; border-radius: 8px; font-size: 0.75rem; border: 1px solid #fee2e2;"><i class="fas fa-exclamation-circle"></i> ${errorMsg}</div>` : ''}

            <div class="form-group">
                <label style="display:block; font-size:0.7rem; font-weight:700; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">
                    📄 Nro. Remito Proveedor
                </label>
                <input type="number" id="modal-cage-remito" class="input" 
                       placeholder="Ej: 25002" 
                       onkeydown="if(['e','E','+','-'].includes(event.key)) event.preventDefault();"
                       oninput="window._validateCageForm()"
                       style="width:100%; height: 42px; font-size: 1.1rem; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 15px;">
            </div>

            <div class="form-group">
                <label style="display:block; font-size:0.7rem; font-weight:700; color: #64748b; text-transform: uppercase; margin-bottom: 5px;">
                    🧺 Nro. de Jaula
                </label>
                <input type="number" id="modal-cage-number" class="input" 
                       placeholder="Ej: 123" 
                       onkeydown="if(['e','E','+','-'].includes(event.key)) event.preventDefault();"
                       oninput="window._validateCageForm()"
                       style="width:100%; height: 42px; font-size: 1.1rem; font-weight: 700; border: 1px solid #cbd5e1; border-radius: 10px; padding: 0 15px;">
            </div>

            <div class="form-group" style="background: #f1f5f9; padding: 12px; border-radius: 12px; border: 2px dashed #3b82f644; text-align: center;">
                <label style="display:block; font-size:0.7rem; font-weight:700; color: #3b82f6; text-transform: uppercase; margin-bottom: 8px; cursor: pointer;" for="modal-cage-photo">
                    📸 Subir Foto Remito
                </label>
                <input type="file" id="modal-cage-photo" accept="image/*" 
                       onchange="window._validateCageForm()"
                       style="width:100%; font-size:0.75rem; color: #64748b; border:none; background:transparent;">
            </div>
        </div>
    `;
    };

    window._validateCageForm = () => {
        const r = document.getElementById('modal-cage-remito')?.value;
        const j = document.getElementById('modal-cage-number')?.value;
        const btn = document.getElementById('btn-confirm-cage');
        if (btn) {
            btn.disabled = !(r && j); // Foto opcional
            btn.style.background = btn.disabled ? '#cbd5e1' : '#3b82f6';
            btn.style.cursor = btn.disabled ? 'not-allowed' : 'pointer';
        }
    };

    const btns = `
        <button class="btn-modal btn-cancel" onclick="Modal.close()" style="font-size: 0.85rem; padding: 10px 20px;">Cancelar</button>
        <button class="btn-modal btn-confirm" id="btn-confirm-cage" disabled style="background:#cbd5e1; font-size: 0.85rem; padding: 10px 20px;">Confirmar</button>
    `;

    // Modal.open(emoji, titulo, contenido, botones, isSmall, isClean)
    // isSmall = true para que el contenedor del modal sea angosto como el de Fábrica
    Modal.open('🏗️', 'Registro de Ingreso', renderModalContent(), btns, true, true);

    document.getElementById('btn-confirm-cage').onclick = () => {
        const remito = document.getElementById('modal-cage-remito').value;
        const jaula = document.getElementById('modal-cage-number').value;
        const photo = document.getElementById('modal-cage-photo').files[0];
        Modal.close();
        saveNewCageHeader(remito, jaula, photo);
    };
}


/**
 * Busca remitos de compra abiertos (Etapa 2)
 */
async function fetchOpenCages() {
    const list = document.getElementById('calidad-cages-list');
    if (!list) return;

    try {
        const token = await YiQi.getToken();
        const smartieId = YIQI_CONFIG.smartieCalidadJaulas || 2764;
        console.log(`🔍 Consultando Jaulas con Smartie ${smartieId}...`);
        
        const data = await YiQi.fetch(smartieId, 787);
        if (data) {
            calidadCages = data.map(i => ({
                id: i.ID || i.id,
                nroJaula: (i.REMI_OBSERVACIONES || "").replace("Jaula N°", "").trim() || "S/N",
                remitoNum: i.REMI_NRO_REMITO || "S/N",
                obs: i.REMI_OBSERVACIONES || "",
                raw: i
            }));
            renderCalidadCages();
            refreshStockDisponibilidad(); // Calcular stock comprometido al cargar las jaulas
            
            // NOVEDAD: Una vez cargadas las jaulas, calculamos la disponibilidad
            refreshStockDisponibilidad();
        }
    } catch (e) {
        console.error("Error fetchOpenCages:", e);
    }
}

function renderCalidadCages() {
    const list = document.getElementById('calidad-cages-list');
    if (!list) return;

    if (calidadCages.length === 0) {
        list.innerHTML = `<p class="text-muted text-center" style="font-size:0.85rem; padding: 2rem;">No hay jaulas pendientes.</p>`;
        return;
    }

    list.innerHTML = calidadCages.map(c => {
        const isSelected = activeCalidadCage && activeCalidadCage.id === c.id;
        const nroRemitoProv = c.remitoNum || 'S/D'; 
        const jaulaObs = c.obs || 'Sin Datos';

        return `
            <div class="cage-item ${isSelected ? 'active' : ''}" 
                 onclick="selectCalidadCage('${c.id}')"
                 style="padding: 12px; border: 1px solid #e2e8f0; border-radius: 12px; margin-bottom: 8px; cursor: pointer; transition: all 0.2s; background: ${isSelected ? '#eff6ff' : 'white'}; border-left: 5px solid ${isSelected ? '#3b82f6' : '#e2e8f0'}; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-weight:700; color:#1e293b; font-size: 0.9rem;">${jaulaObs}</span>
                    <div style="display:flex; align-items:center; gap: 8px;">
                         <span style="font-size:0.75rem; background:#dbeafe; padding:4px 8px; border-radius:8px; color: #1e40af; font-weight: 700;">Remito N°: ${nroRemitoProv}</span>
                         <button class="btn-sm" 
                                 onclick="cancelarJaulaCalidad(event, '${c.id}')"
                                 style="width: 24px; height: 24px; border-radius: 6px; background: #fee2e2; border: 1px solid #fecaca; color: #ef4444; font-size: 1rem; line-height: 1; padding: 0; cursor: pointer; display: flex; align-items: center; justify-content: center;"
                                 title="Anular esta Jaula completa">&times;</button>
                    </div>
                </div>
                <div style="font-size:0.85rem; color:#64748b; margin-top:8px;">
                    <i class="fas fa-info-circle" style="color:#3b82f6; opacity: 0.5;"></i> Click para seleccionar y cargar ítems.
                </div>
            </div>
        `;
    }).join('');
}

async function selectCalidadCage(id) {
    activeCalidadCage = calidadCages.find(c => String(c.id) === String(id));
    renderCalidadCages();

    // Actualizar Encabezado de Control
    const headerTitle = document.getElementById('calidad-control-title');
    if (headerTitle && activeCalidadCage) {
        headerTitle.innerHTML = `⚖️ Control de Jaula | <span style="font-size:0.85rem; font-weight:700; color:#1e40af;">Jaula N° ${activeCalidadCage.nroJaula}</span> <span style="font-size:0.7rem; opacity:0.6; margin-left:8px;">Remito: ${activeCalidadCage.remitoNum}</span>`;
    }
    
    // Reset local state
    calidadBasket = [];
    renderCalidadBasket();

    // Habilitar la canasta
    const footer = document.getElementById('calidad-basket-footer');
    if (footer) footer.style.display = 'block';
    
    showLoading(true);
    updateStatus("Vinculando remito de consumo...");

    try {
        // Buscamos o creamos el Remito Interno (781) vinculado
        const cageObs = "Jaula N° " + activeCalidadCage.nroJaula;
        // El número de remito proveedor está en el objeto de la jaula (campo 4239 de la cabecera en YiQi)
        // Nota: En fetchOpenCages debemos asegurar que traiga el nro de remito
        const remitoProv = activeCalidadCage.remitoNum || "S/N"; 

        const consumoId = await YiQi.findLinkedConsumo(cageObs, remitoProv);
        activeCalidadCage.consumoId = consumoId;
        
        if (!consumoId) {
            console.warn("⚠️ No se encontró remito de consumo vinculado para la jaula:", cageObs);
            // Si no se encuentra, podemos optar por crear uno de emergencia o avisar
            // Por ahora, solo avisamos en consola pero dejamos seguir (mostrará advertencia en el basket)
        } else {
            console.log("🔗 Jaula vinculada a Remito Interno:", consumoId);
        }

        // Cargar ítems existentes de YiQi
        await fetchCageItems(id);

        // [NUEVO] Forzar re-renderizado del stock para que los botones cambien de color sin refresh manual
        if (lastStockLozametal) {
            renderCalidadStock(lastStockLozametal);
        }
    } catch (e) {
        console.error("Error al seleccionar jaula:", e);
        showModal("Error", "No se pudo vincular el remito de consumo.", "error");
    } finally {
        showLoading(false);
    }
}

async function fetchCageItems(instanceId, silent = false) {
    if (!activeCalidadCage) return;
    if (!silent) showLoading(true);
    
    try {
        const token = await YiQi.getToken();
        
        // 1. Traer ítems del Remito de Compra (787) - Productos Terminados
        const url787 = `${YIQI_CONFIG.getChildListUrl}?entityId=787&schemaId=${YIQI_CONFIG.schemaId}&childId=209&instanceId=${instanceId}&take=100`;
        const res787 = await fetch(url787, { headers: { "Authorization": `Bearer ${token}` } }).then(r => r.json());
        const items787 = res787.data || res787.rows || res787.instances || [];

        // 2. Traer ítems del Remito Interno (781) - Semielaborados
        let items781 = [];
        if (activeCalidadCage.consumoId) {
            const url781 = `${YIQI_CONFIG.getChildListUrl}?entityId=781&schemaId=${YIQI_CONFIG.schemaId}&childId=227&instanceId=${activeCalidadCage.consumoId}&take=100`;
            const res781 = await fetch(url781, { headers: { "Authorization": `Bearer ${token}` } }).then(r => r.json());
            items781 = res781.data || res781.rows || res781.instances || [];
        }

        // 3. Mapear y Vincular
        calidadBasket = items787.map(i => {
            const sku = i.MATE_CODIGO || i.CODIGO || i.SKU || "S/N";
            const nombre = i.DERE_NOMBRE_MATE || i.NOMBRE || i.MATE_NOMBRE || i.DESCRIPCION || "Sin Nombre";
            const cantidad = Number(i.DERE_CANTIDAD || i.CANTIDAD || i.CANTI || i.CANT || 0);
            const precioYiQi = Number(i.DERE_PRECIO_NETO || i.PRECIO_NETO || 0);

            const receta = recetasEnlozado.find(rec => rec.term === sku);
            const costoBase = receta ? receta.costo : 0;
            const isLikelyELZ = precioYiQi > (costoBase * 1.1);

            const possibleRawSkus = receta ? [receta.lf, receta.elz] : [sku];
            const linkedInsumo = items781.find(ins => 
                possibleRawSkus.includes(ins.MATE_CODIGO || ins.CODIGO) && 
                Number(ins.DERI_CANTIDAD || ins.CANTIDAD) === cantidad
            );

            return {
                id: i.ID || i.id,
                rawSku: linkedInsumo ? (linkedInsumo.MATE_CODIGO || linkedInsumo.CODIGO) : (isLikelyELZ ? receta?.elz : receta?.lf) || sku,
                termSku: sku,
                name: nombre,
                origin: linkedInsumo ? (linkedInsumo.CODIGO?.startsWith('ELZ-') ? 'ELZ' : 'LF') : (isLikelyELZ ? 'ELZ' : 'LF'),
                qty: cantidad,
                costo: precioYiQi > 0 ? (precioYiQi / cantidad) : (isLikelyELZ ? costoBase * 1.2 : costoBase),
                hasConsumo: !!linkedInsumo,
                consumoId: linkedInsumo ? (linkedInsumo.ID || linkedInsumo.id) : null
            };
        });

        if (!silent) renderCalidadBasket();
        renderControlView(calidadBasket);

    } catch (e) {
        console.error("Error fetchCageItems:", e);
    } finally {
        if (!silent) showLoading(false);
    }
}

/**
 * Anula una jaula completa (Doble Anulación: Compra e Interno)
 */
async function cancelarJaulaCalidad(e, id) {
    if (e) e.stopPropagation();
    
    const cage = calidadCages.find(c => String(c.id) === String(id));
    if (!cage) return;

    const ok = await showConfirm("Anular Jaula", `¿Estás seguro de anular COMPLETAMENTE la Jaula ${cage.nroJaula}?\nEsto cancelará tanto el ingreso de compra como el consumo interno.`);
    if (!ok) return;

    showLoading(true, "Anulando documentos...");
    
    try {
        // 1. Anular Remito de Compra (787) -> Transition 119015
        await YiQi.executeTransition("787", id, 119015);

        // 2. Localizar y Anular Remito Interno vinculado (781) -> Transition 118453 (Anular Pendiente)
        const consumoId = await YiQi.findLinkedConsumo(cage.obs, cage.remitoNum);
        if (consumoId) {
            await YiQi.executeTransition("781", consumoId, 118453);
        }

        console.log("🚫 Jaula y Consumo anulados correctamente.");
        
        if (activeCalidadCage && String(activeCalidadCage.id) === String(id)) {
            activeCalidadCage = null;
            calidadBasket = [];
            renderCalidadBasket();
            document.getElementById('calidad-control-view').innerHTML = '<p class="text-muted text-center italic" style="margin-top: 2rem;">Selecciona una jaula para comenzar.</p>';
            document.getElementById('calidad-control-footer').style.display = 'none';
            
            // [NUEVO] Resetear Título del Encabezado al anular
            const headerTitle = document.getElementById('calidad-control-title');
            if (headerTitle) headerTitle.innerHTML = '⚖️ Control de Jaula';
        }

        await fetchOpenCages();
        showModal("Anulación Exitosa", "La jaula ha sido anulada correctamente en ambos registros.", "success");

    } catch (err) {
        console.error("Error cancelarJaulaCalidad:", err);
        showModal("Error", "No se pudo completar la anulación dual: " + err.message, "error");
    } finally {
        showLoading(false);
    }
}

function renderControlView(items) {
    const view = document.getElementById('calidad-control-view');
    const footer = document.getElementById('calidad-control-footer');
    
    if (!items || items.length === 0) {
        view.innerHTML = '<p class="text-muted text-center italic" style="margin-top: 2rem;">La jaula no tiene ítems cargados aún.</p>';
        if (footer) footer.style.display = 'none';
        return;
    }

    if (footer) {
        footer.style.display = 'block';
        const totalBadge = document.getElementById('calidad-total-items-badge');
        if (totalBadge) totalBadge.innerText = items.length;
    }

    view.innerHTML = `
        <table style="width:100%; border-collapse: collapse; font-size: 0.85rem; background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05);">
            <thead>
                <tr style="border-bottom: 2px solid #fbbf24; text-align: left; color: #92400e; background: #fffbeb;">
                    <th style="padding: 12px 10px;">SKU / Producto</th>
                    <th style="padding: 12px 10px; text-align: center;">Cant.</th>
                    <th style="padding: 12px 10px; text-align: center; color: #059669;">Sync</th>
                    <th style="padding: 12px 10px; text-align: right;">Acción</th>
                </tr>
            </thead>
            <tbody>
                ${items.map((item, idx) => `
                <tr style="border-bottom: 1px solid #fef3c7;">
                    <td style="padding: 12px 10px;">
                        <div style="font-weight: 700; color: #1e293b;">${item.termSku}</div>
                        <div style="font-size: 0.7rem; color: #64748b;">Insumo: <b>${item.rawSku}</b> (${item.origin})</div>
                    </td>
                    <td style="padding: 12px 10px; text-align: center; font-weight: 800; font-size: 1rem;">
                        ${item.qty}
                    </td>
                    <td style="padding: 12px 10px; text-align: center; font-size: 1rem;">
                        ${item.hasConsumo 
                            ? '<span title="✅ Sincronizado: El ítem ya existe en el remito interno de consumo.">✅</span>' 
                            : '<span title="⏳ Pendiente: Este ítem aún no se ha reflejado en el remito interno de consumo.">⏳</span>'}
                    </td>
                    <td style="padding: 12px 10px; text-align: right;">
                        <button class="btn btn-sm" 
                                style="width: 32px; height: 32px; border-radius: 8px; background: #f1f5f9; border: 1px solid #e2e8f0; color: #3b82f6; display: flex; align-items: center; justify-content: center; cursor: pointer; font-size: 1.2rem; font-weight: 400; transition: all 0.2s;"
                                onclick="removeFromCalidadBasket(${idx})"
                                title="Eliminar este renglón">
                            &times;
                        </button>
                    </td>
                </tr>
                `).join('')}
            </tbody>
        </table>
    `;
}

/**
 * Persiste los ítems cargados en el remito de compra (Etapa 2)
 */
async function prepararControlCalidad() {
    if (!activeCalidadCage || calidadBasket.length === 0) return;

    const ok = await showConfirm("Finalizar Carga", `¿Deseas guardar estos ${calidadBasket.length} artículos en la Jaula #${activeCalidadCage.id}? Esto los dejará listos para el control físico.`);
    if (!ok) return;

    showLoading(true);
    updateStatus("Guardando contenido de la jaula...");

    try {
        const payloadItems = [];
        for (const i of calidadBasket) {
            let precioNeto = Number(i.costo) || 0;
            if (i.origin === 'ELZ') precioNeto = precioNeto * 1.20;

            const artGlobal = await YiQi.findArticleGlobal(i.termSku);
            const mateId = artGlobal ? (artGlobal.MATE_ID_MATE || artGlobal.ID) : null;

            payloadItems.push({
                "CANTIDAD": i.qty,
                "PRECIO_NETO": precioNeto,
                "CODIGO": i.termSku,
                "NOMBRE": i.name,
                "MATE_ID_MATE": mateId
            });
        }

        // Guardamos en el hijo 209 del remito activo
        const saved = await YiQi.saveChildInstances(activeCalidadCage.id, payloadItems, 209);
        
        if (saved) {
            showModal("Éxito", "Contenido cargado correctamente. La jaula ya puede ser controlada por el personal de depósito.", "success");
            // Resetear
            activeCalidadCage = null;
            calidadBasket = [];
            fetchOpenCages();
            renderCalidadBasket();

            // [NUEVO] Resetear Título del Encabezado
            const headerTitle = document.getElementById('calidad-control-title');
            if (headerTitle) headerTitle.innerHTML = '⚖️ Control de Jaula';
        } else {
            throw new Error("No se pudieron guardar los ítems en YiQi.");
        }
    } catch (e) {
        console.error("Error finalizarCargaItems:", e);
        showModal("Error", e.message, "error");
    } finally {
        showLoading(false);
    }
}

/**
 * PROCESO FINAL (Etapa 3): Cierre de Compra + Creación de Consumo
 */
async function procesarIngresoFinal() {
    if (!activeCalidadCage) return;

    const inputs = document.querySelectorAll('.control-input');
    const itemsControlados = Array.from(inputs).map(input => ({
        id: input.dataset.id,
        consumoId: input.dataset.consumoId,
        sku: input.dataset.sku,
        qtyReal: Number(input.value)
    }));

    const ok = await showConfirm("Procesar Ingreso Final", `¿Confirmas el control físico de la Jaula #${activeCalidadCage.nroJaula}? Esto cerrará el stock en Lozametal e ingresará los productos a Depósito.`);
    if (!ok) return;

    showLoading(true);
    updateStatus("Sincronizando cantidades finales...");

    try {
        const token = await YiQi.getToken();
        
        // 1. Actualizar cantidades en YiQi si hubo cambios en el control manual
        for (const i of itemsControlados) {
            // Actualizar Compra (787)
            await YiQi.saveChildInstances(activeCalidadCage.id, [{
                id: i.id,
                "CANTIDAD": i.qtyReal
            }], 209);

            // Actualizar Consumo (781)
            if (i.consumoId) {
                await YiQi.saveChildInstances(activeCalidadCage.consumoId, [{
                    id: i.consumoId,
                    "CANTIDAD": i.qtyReal,
                    "DERI_CANTIDAD": String(i.qtyReal)
                }], 227);
            }
        }

        updateStatus("Procesando Transiciones...");

        // 2. Transicionar Remito de Compra (787) -> PROCESADO (119014)
        const resCompra = await YiQi.executeTransition("787", activeCalidadCage.id, 119014);
        
        // 3. Transicionar Remito de Consumo (781) -> ENVIADO (118455) y luego PROCESADO (118456)
        if (activeCalidadCage.consumoId) {
            updateStatus("Impactando Consumo Interno...");
            // Usamos la lógica robusta de transiciones secuenciales que ya tenemos en el aplicativo
            await processRemitoTransitions([String(activeCalidadCage.consumoId)], updateStatus, true);
        }
        
        if (resCompra) {
            showModal("✨ Ingreso Exitoso", `
                Control de Jaula finalizado correctamente.
                <br><b>Compra Procesada:</b> #${activeCalidadCage.nroJaula}
                <br><b>Consumo Vinculado:</b> Sincronizado y Procesado
            `, "success");
            
            // Limpieza Total
            activeCalidadCage = null;
            calidadBasket = [];
            fetchOpenCages();
            fetchStockLozametal(); // Actualizar stock crudo tras el consumo
            renderCalidadBasket();
            
            document.getElementById('calidad-control-footer').style.display = 'none';
            document.getElementById('calidad-control-view').innerHTML = '<p class="text-muted text-center italic">Control finalizado. Jaula procesada correctamente.</p>';
            
            // [NUEVO] Resetear Título del Encabezado
            const headerTitle = document.getElementById('calidad-control-title');
            if (headerTitle) headerTitle.innerHTML = '⚖️ Control de Jaula';
        }
    } catch (e) {
        console.error("❌ Error en procesarIngresoFinal:", e);
        showModal("Error", "Ocurrió un problema en el cierre final: " + e.message, "error");
    } finally {
        showLoading(false);
    }
}
