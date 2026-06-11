/* ==========================================================================
   BUSINESS LOGIC & INTERFACE CONTROLLER: Cotizaciones y Pedidos
   ========================================================================== */

// --- CONFIGURATIONS ---
const CONFIG = {
    SCHEMA_ID: 1491,
    ENTITY_CLIENTE: "345",
    SMARTIE_CLIENTE: 2603,
    ENTITY_ARTICULOS: "782",
    SMARTIE_ARTICULOS: 2744,
    ENTITY_PEDIDOS: "1231",
    SMARTIE_PEDIDOS: 2672,
    CHILD_PEDIDO_ITEMS: 231,
    TRANSITION_RESERVAR: 118971,
    ENTITY_COTIZACION: "865",
    CHILD_COTIZACION_ITEMS: 249,
    TRANSITION_COTI_VALIDAR: 117982,
    TRANSITION_COTI_ENVIAR: 117983,
    TRANSITION_COTI_APROBAR: 117977,
    TRANSITION_COTI_RECHAZAR: 117978,
    TRANSITION_COTI_VERSIONAR: 117976,
    
    TOKEN_URLS: [
        "https://api.yiqi.com.ar/token",
        "https://api.yiqi.com.ar/connect/token",
        "https://me.yiqi.com.ar/connect/token"
    ],
    GETLIST_BASE: "https://api.yiqi.com.ar/api/instancesApi/GetList",
    GETINSTANCE_BASE: "https://api.yiqi.com.ar/api/instancesApi/GetInstance",
    SAVE_BASE: "https://api.yiqi.com.ar/api/instancesApi/Save",
    SAVE_CHILD_BASE: "https://api.yiqi.com.ar/api/childrenApi/SaveChildInstances",
    TRANSITION_BASE: "https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition",
    
    CLOUD_FUNCTIONS_BASE: "https://us-central1-tmc-backend-2f5c4.cloudfunctions.net"
};

const AUTH_USER = "mercadolibre@tmcrespo.com.ar";
const AUTH_PASS = "AdministracionMessi";


// --- STATE VARIABLES ---
const PAYMENT_CONDITIONS_MAP = {
  "1": "30 días fecha de factura",
  "2": "7 días fecha de factura",
  "3": "Contado",
  "4": "Cuenta Corriente - 5 días",
  "5": "Mercado Pago",
  "7": "Tarjeta de Crédito",
  "8": "Efectivo Contra Entrega",
  "9": "Cuenta Corriente - 15 días",
  "10": "Efectivo al día siguiente",
  "11": "Pago Anticipado",
  "12": "15 dias fecha de factura",
  "13": "Anticipo 50% - Saldo contra entrega",
  "14": "45 días fecha de factura",
  "15": "60 días fecha de factura",
  "16": "Echeq a 30 días"
};

const TRANSPORTISTAS_MAP = {
  "9": "Manual - self_service TMC B2B",
  "8": "Manual - self_service TMC",
  "6": "Manual - self_service",
  "5": "Manual - Transporte Expreso",
  "4": "Manual - Retira"
};

let clientSearchCache = {};
let token = localStorage.getItem("yiqi_token") || null;
let articlesCache = [];
let skuStockMap = {};
let clientSearchTimeout = null;
let selectedClient = null;
let cart = [];
let globalDiscount = 0.0;
let newPlanSteps = [];
let editingVersionOfDocId = null;
let editingVersionOfPlanId = null;
let sucursalesCache = [];
let articlesLimit = 100;
let lastUserInteractionTime = Date.now();

let catalogConfig = {
    visibleColumns: {
        sku: true,
        desc: true,
        stock: true,
        grupo: false,
        subgrupo1: false,
        subgrupo2: false,
        pbase: true,
        pneto: true,
        pfinal: true
    },
    filterCollections: ["PRODUCTO TERMINADO", "PRODUCTO TERMINADO2"],
    excludeGroups: [0, 97, 98, 101], // 0 is empty group "(Vacío)"
    columnOrder: ["sku", "desc", "stock", "grupo", "subgrupo1", "subgrupo2", "pbase", "pneto", "pfinal"]
};

// CRM Dashboard control board sorting state
let tableroSort = {
    column: 'date',
    direction: 'desc'
};

// Load saved config
const savedConfig = localStorage.getItem("tmc_catalog_config");
if (savedConfig) {
    try {
        const loaded = JSON.parse(savedConfig);
        if (loaded && typeof loaded === "object") {
            if (loaded.visibleColumns) {
                catalogConfig.visibleColumns = { ...catalogConfig.visibleColumns, ...loaded.visibleColumns };
            }
            if (Array.isArray(loaded.filterCollections)) {
                catalogConfig.filterCollections = loaded.filterCollections;
            }
            if (Array.isArray(loaded.excludeGroups)) {
                catalogConfig.excludeGroups = loaded.excludeGroups.map(x => isNaN(parseInt(x)) ? x : parseInt(x));
            }
            if (Array.isArray(loaded.columnOrder)) {
                const validCols = ["sku", "desc", "stock", "grupo", "subgrupo1", "subgrupo2", "pbase", "pneto", "pfinal"];
                const newOrder = loaded.columnOrder.filter(c => validCols.includes(c));
                validCols.forEach(c => {
                    if (!newOrder.includes(c)) newOrder.push(c);
                });
                catalogConfig.columnOrder = newOrder;
            }
        }
    } catch (e) {
        console.warn("Could not parse saved catalog config:", e);
    }
}

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    showLoader("Autenticando con YiQi ERP...");
    try {
        await checkAuth();
        updateSyncIndicator(true, "Conectado");
        
        // Setup Event Listeners
        setupEventListeners();
        
        // Apply theme preferences on initialization
        initTheme();
        
        // Load initial CRM alerts
        renderCrmAlerts();
        
        // Initialize follow-up plan templates
        getPlanTemplates();
        
        // Pre-load sucursales in background
        loadSucursalesCache();
        
        // Sincronizar datos con Firestore de Firebase (de forma asíncrona)
        syncCrmWithFirestore();
        // Sincronización automática periódica en segundo plano cada 2 minutos para tiempo real colaborativo
        setInterval(syncCrmWithFirestore, 120000);
        
        // Asynchronously migrate any old quote numbers
        migrateOldQuoteNumbers();
        
        // Pre-load articles if cached, otherwise fetch them
        const cached = localStorage.getItem("tmc_articles_data");
        const cacheTime = localStorage.getItem("tmc_articles_time");
        const twentyFourHours = 24 * 60 * 60 * 1000;
        
        if (cached && cacheTime && (Date.now() - cacheTime < twentyFourHours)) {
            articlesCache = JSON.parse(cached);
            updateArticlesCountLabel();
        } else {
            // Fetch in background to not block UI
            fetchArticlesMasterInBackground();
        }
        
        // Pre-load stock map if cached, otherwise fetch it
        const cachedStock = localStorage.getItem("tmc_stock_map");
        const cachedStockTime = localStorage.getItem("tmc_stock_time");
        if (cachedStock && cachedStockTime && (Date.now() - cachedStockTime < twentyFourHours)) {
            skuStockMap = JSON.parse(cachedStock);
            // ALWAYS refresh in the background to ensure real-time stock
            fetchStockCompletoInBackground();
        } else {
            fetchStockCompletoInBackground();
        }
    } catch (e) {
        console.error("Auth initialization error:", e);
        updateSyncIndicator(false, "Error de Conexión");
        showAppNotification("Error de Autenticación", "No se pudo iniciar sesión en YiQi ERP. Revise las credenciales en el archivo logica.js.", "danger");
    } finally {
        hideLoader();
    }
});

// --- AUTHENTICATION ---
async function checkAuth() {
    if (!token) {
        await loginYiQi();
    }
}

async function loginYiQi() {
    const params = new URLSearchParams({
        grant_type: "password",
        username: AUTH_USER,
        password: AUTH_PASS
    });
    
    for (const url of CONFIG.TOKEN_URLS) {
        try {
            const r = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: params
            });
            if (r.ok) {
                const data = await r.json();
                token = data.access_token;
                localStorage.setItem("yiqi_token", token);
                return;
            }
        } catch (e) {
            console.warn(`Login failed for endpoint ${url}:`, e);
        }
    }
    throw new Error("Could not authenticate with any YiQi token endpoint");
}

// Generic fetch wrapper with auto-reauth on 401
async function apiCall(url, method = "GET", bodyObj = null) {
    await checkAuth();
    
    const headers = {
        "Authorization": `Bearer ${token}`
    };
    
    const options = {
        method: method,
        headers: headers
    };
    
    if (bodyObj) {
        headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(bodyObj);
    }
    
    let r = await fetch(url, options);
    
    // Auto re-auth once on 401 Unauthorized
    if (r.status === 401) {
        console.log("Token expired (401), re-authenticating...");
        await loginYiQi();
        headers["Authorization"] = `Bearer ${token}`;
        r = await fetch(url, options);
    }
    
    if (!r.ok) {
        throw new Error(`YiQi API returned status ${r.status}`);
    }
    
    return r.json();
}

// --- CORE EVENT LISTENERS ---
function setupEventListeners() {
    // Client Lookup keyup listener (debounced)
    const clientInput = document.getElementById("client-search");
    clientInput.addEventListener("input", (e) => {
        const val = e.target.value.trim();
        document.getElementById("client-search-clear").style.display = val ? "block" : "none";
        
        clearTimeout(clientSearchTimeout);
        if (val.length < 2) {
            hideClientSearchResults();
            return;
        }
        
        clientSearchTimeout = setTimeout(() => {
            performClientSearch(val);
        }, 150);
    });
    
    // Clear client search button
    document.getElementById("client-search-clear").addEventListener("click", () => {
        clientInput.value = "";
        document.getElementById("client-search-clear").style.display = "none";
        hideClientSearchResults();
    });
    
    // Article Lookup keyup listener (instant filter)
    const artInput = document.getElementById("article-search");
    artInput.addEventListener("input", () => {
        articlesLimit = 100;
        const val = artInput.value.trim();
        document.getElementById("article-search-clear").style.display = val ? "block" : "none";
        renderArticlesList();
    });
    
    // Clear article search button
    document.getElementById("article-search-clear").addEventListener("click", () => {
        articlesLimit = 100;
        artInput.value = "";
        document.getElementById("article-search-clear").style.display = "none";
        renderArticlesList();
    });
    
    // Filter checkbox listener
    document.getElementById("filter-stock-only").addEventListener("change", () => {
        articlesLimit = 100;
        renderArticlesList();
    });
    
    // Auto-adjusting layout focus listeners
    const grid = document.querySelector(".columns-grid");
    if (grid) {
        if (clientInput) {
            clientInput.addEventListener("focus", () => {
                grid.classList.add("client-focused");
            });
            clientInput.addEventListener("blur", () => {
                grid.classList.remove("client-focused");
            });
        }
        
        if (artInput) {
            artInput.addEventListener("focus", () => {
                grid.classList.add("articles-focused");
            });
            artInput.addEventListener("blur", () => {
                grid.classList.remove("articles-focused");
            });
        }
        
        const cartTbody = document.getElementById("cart-tbody");
        if (cartTbody) {
            cartTbody.addEventListener("focusin", () => {
                grid.classList.add("cart-focused");
            });
            cartTbody.addEventListener("focusout", () => {
                grid.classList.remove("cart-focused");
            });
        }
        
        const docObs = document.getElementById("doc-observations");
        if (docObs) {
            docObs.addEventListener("focus", () => {
                grid.classList.add("cart-focused");
            });
            docObs.addEventListener("blur", () => {
                grid.classList.remove("cart-focused");
            });
        }
    }
}

// --- CLIENT SEARCH LOGIC ---
async function performClientSearch(query) {
    const resultsContainer = document.getElementById("client-search-results");
    
    // Check cache first for instant display
    if (clientSearchCache[query]) {
        renderClientSearchResults(clientSearchCache[query], resultsContainer);
        return;
    }
    
    // URL uses search query string as parameter AND in the post body filters
    const url = `${CONFIG.GETLIST_BASE}?entityId=${CONFIG.ENTITY_CLIENTE}&schemaId=${CONFIG.SCHEMA_ID}&smartieId=${CONFIG.SMARTIE_CLIENTE}&search=${encodeURIComponent(query)}`;
    const body = {
        page: 1,
        pageSize: 15,
        search: query
    };
    
    try {
        const response = await apiCall(url, "POST", body);
        const rows = response.data || response.rows || response.instances || [];
        
        clientSearchCache[query] = rows;
        renderClientSearchResults(rows, resultsContainer);
    } catch (e) {
        console.error("Client search request error:", e);
        updateSyncIndicator(false, "Error de red");
    }
}

function renderClientSearchResults(rows, resultsContainer) {
    if (rows.length === 0) {
        resultsContainer.innerHTML = '<div class="autocomplete-item text-secondary">No se encontraron clientes</div>';
        resultsContainer.style.display = "block";
        return;
    }
    
    let html = "";
    rows.forEach(client => {
        const listName = client.LIDP_NOMBRE || "Sin Lista Asignada";
        const rawSocial = client.CLIE_RAZON_SOCIAL || client.CLIE_NOMBRE;
        const cuit = client.CLIE_CUIT || "Sin CUIT";
        
        html += `
            <div class="autocomplete-item" onclick="selectClient('${client.ID}', '${rawSocial.replace(/'/g, "\\'")}')">
                <div class="item-title">${rawSocial}</div>
                <div class="item-meta">
                    <span>CUIT: ${cuit}</span>
                    <span>Lista: ${listName}</span>
                </div>
            </div>
        `;
    });
    
    resultsContainer.innerHTML = html;
    resultsContainer.style.display = "block";
}

function hideClientSearchResults() {
    document.getElementById("client-search-results").style.display = "none";
}

async function selectClient(clientId, clientName) {
    hideClientSearchResults();
    showLoader("Obteniendo detalles del cliente...");
    
    try {
        // Step 1: Get complete instance details of the client (Entity 345)
        const instUrl = `${CONFIG.GETINSTANCE_BASE}?entityId=${CONFIG.ENTITY_CLIENTE}&schemaId=${CONFIG.SCHEMA_ID}&id=${clientId}`;
        const instRes = await apiCall(instUrl, "GET");
        const clientObj = instRes.data || instRes.instances || instRes;
        
        if (!clientObj) throw new Error("Could not parse client instance details");
        
        const atts = clientObj.atts || {};
        const attsFkTexts = clientObj.attsFkTexts || {};
        
        // Extract parameters
        const listName = attsFkTexts["6055"] || "Minorista"; // LIDP_ID_LIDP is field 6055
        const listId = atts["6055"]?.value || 1; // Default to Minorista
        const condVenta = attsFkTexts["6239"] || "Pago Anticipado"; // COVE_ID_COVE is field 6239
        const condVentaId = atts["6239"]?.value || 11;
        const condIva = attsFkTexts["3821"] || "Consumidor Final"; // COIV_ID_COIV is field 3821
        const condIvaId = atts["3821"]?.value || 7;
        const sellerName = attsFkTexts["6672"] || "Augusto"; // VEHA_ID_VEHA is field 6672
        const sellerId = atts["6672"]?.value || 1;
        const mail = atts["5774"]?.value || "Sin Email";
        const cuit = atts["1686"]?.value || "Sin CUIT";
        const domicile = atts["1085"]?.value || "Sin Dirección";
        const phone = atts["1089"]?.value || "";

        const clientTypeName = attsFkTexts["7167"] || "Ninguno";
        const clientTypeId = atts["7167"]?.value || null;
        let typeDiscount = 0.0;
        if (clientTypeName === "Plata") {
            typeDiscount = 5.0;
        } else if (clientTypeName === "Premium") {
            typeDiscount = 10.0;
        }
        
        // Set initial selected client state
        selectedClient = {
            id: clientId,
            name: clientName,
            cuit: cuit,
            mail: mail,
            phone: phone,
            domicile: domicile,
            listName: listName,
            listId: listId,
            condVenta: condVenta,
            condVentaId: condVentaId,
            condIva: condIva,
            condIvaId: condIvaId,
            seller: sellerName,
            sellerId: sellerId,
            typeName: clientTypeName,
            typeId: clientTypeId,
            typeDiscount: typeDiscount,
            balance: 0.0,
            suggestedDiscount: 0.0,
            branches: []
        };
        
        // Fetch sucursales for this client using children API (childId 262)
        try {
            const childUrl = `https://api.yiqi.com.ar/api/childrenApi/GetChildList?entityId=${CONFIG.ENTITY_CLIENTE}&schemaId=${CONFIG.SCHEMA_ID}&childId=262&instanceId=${clientId}`;
            const childRes = await apiCall(childUrl, "GET");
            console.log("GetChildList for sucursales returned:", childRes);
            let branchesList = [];
            if (childRes) {
                if (Array.isArray(childRes)) {
                    branchesList = childRes;
                } else if (Array.isArray(childRes.data)) {
                    branchesList = childRes.data;
                } else if (Array.isArray(childRes.rows)) {
                    branchesList = childRes.rows;
                } else if (Array.isArray(childRes.instances)) {
                    branchesList = childRes.instances;
                }
            }
            selectedClient.branches = branchesList;
        } catch (branchErr) {
            console.error("Error fetching client branches:", branchErr);
            selectedClient.branches = [];
        }
        
        // Populate sucursal dropdown and contact info in checkout / creator
        updateCreatorClientWidget();
        
        // Step 2: Fetch current CC Balance from Backend Proxy Cloud Function
        try {
            const ccRes = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/obtenerEstadoCuenta?clientCode=${clientId}`);
            if (ccRes.ok) {
                const ccData = await ccRes.json();
                selectedClient.balance = ccData.saldoNoImputadoYiqi || 0.0;
            }
        } catch (ccErr) {
            console.error("Could not fetch CC account balance via proxy:", ccErr);
        }
        
        // Step 3: Fetch past orders to calculate default global discount suggestion
        try {
            // GetList on Pedidos (1231) filtering by this client ID
            const orderListUrl = `${CONFIG.GETLIST_BASE}?entityId=${CONFIG.ENTITY_PEDIDOS}&schemaId=${CONFIG.SCHEMA_ID}&smartieId=${CONFIG.SMARTIE_PEDIDOS}`;
            const queryBody = {
                page: 1,
                pageSize: 15,
                filters: [
                    {
                        columnName: "CLIE_ID_CLIE",
                        operator: "=",
                        value: String(clientId)
                    }
                ]
            };
            const ordersRes = await apiCall(orderListUrl, "POST", queryBody);
            const orders = ordersRes.data || ordersRes.rows || ordersRes.instances || [];
            
            if (orders.length > 0) {
                // Read historical discount global (from field 9294 or similar)
                // Let's sample discounts and compute the most common non-zero one
                const discountCounts = {};
                let nonZeroDiscounts = 0;
                
                // Let's do a loop to inspect past order details to find their discounts
                for (const ord of orders.slice(0, 5)) {
                    // Fetch complete order instance
                    const orderId = ord.ID || ord.id;
                    if (orderId) {
                        const orderDtlUrl = `${CONFIG.GETINSTANCE_BASE}?entityId=${CONFIG.ENTITY_PEDIDOS}&schemaId=${CONFIG.SCHEMA_ID}&id=${orderId}`;
                        const orderDtl = await apiCall(orderDtlUrl, "GET");
                        const oObj = orderDtl.data || orderDtl.instances || orderDtl;
                        const dtoGlobal = oObj?.atts?.["9294"]?.value; // Field 9294 is PEDI_DTO_GLOBAL
                        
                        if (dtoGlobal && parseFloat(dtoGlobal) > 0) {
                            const val = parseFloat(dtoGlobal);
                            discountCounts[val] = (discountCounts[val] || 0) + 1;
                            nonZeroDiscounts++;
                        }
                    }
                }
                
                // Suggest the most common non-zero discount, or default to 0.0
                if (nonZeroDiscounts > 0) {
                    let bestDiscount = 0.0;
                    let maxCount = 0;
                    for (const [disc, count] of Object.entries(discountCounts)) {
                        if (count > maxCount) {
                            maxCount = count;
                            bestDiscount = parseFloat(disc);
                        }
                    }
                    selectedClient.suggestedDiscount = bestDiscount;
                }
            }
        } catch (ordErr) {
            console.error("Could not fetch past orders for discount suggestion:", ordErr);
        }
        
        // Apply historical suggestion to global state
        globalDiscount = selectedClient.suggestedDiscount;
        
        // Render Client Details UI
        renderClientCard();
        
        // Clear search input for next time
        const clientInput = document.getElementById("client-search");
        if (clientInput) {
            clientInput.value = "";
        }
        const clearBtn = document.getElementById("client-search-clear");
        if (clearBtn) {
            clearBtn.style.display = "none";
        }
        
        // Switch to Client CRM View
        switchView("client-crm");
        
        // Reset history logs collapsible section to collapsed by default on client switch
        const historyContainer = document.getElementById("crm-history-logs-container");
        const historyArrow = document.getElementById("history-section-arrow");
        if (historyContainer && historyArrow) {
            historyContainer.style.display = "none";
            historyArrow.style.transform = "rotate(0deg)";
        }
        const prepContainer = document.getElementById("crm-preparacion-logs-container");
        const prepArrow = document.getElementById("preparacion-section-arrow");
        if (prepContainer && prepArrow) {
            prepContainer.style.display = "none";
            prepArrow.style.transform = "rotate(0deg)";
        }
        const revContainer = document.getElementById("crm-reversiones-logs-container");
        const revArrow = document.getElementById("reversiones-section-arrow");
        if (revContainer && revArrow) {
            revContainer.style.display = "none";
            revArrow.style.transform = "rotate(0deg)";
        }
        
        renderAllCrmSections();
        syncClientFollowupsWithYiQi(clientId);
        
        // Enable search and rendering of Articles
        document.getElementById("article-search").disabled = false;
        document.getElementById("filter-stock-only").disabled = false;
        
        const btnRefresh = document.getElementById("btn-refresh-stock");
        if (btnRefresh) btnRefresh.disabled = false;
        
        // Check if catalog has articles, if not, load them now
        if (articlesCache.length === 0) {
            await syncArticlesMaster();
        } else {
            // Force refresh stock in the background for real-time accuracy on client selection
            syncStockCompletoCache(true).then(() => renderArticlesList());
            renderArticlesList();
        }
        
        // Reset and show Cart details
        cart = [];
        renderCart();
        
        // Re-sync CRM data from Firestore now that a client is selected,
        // so active plans and history render with fresh data even on first load.
        syncCrmWithFirestore();
    } catch (e) {
        console.error("Client select error:", e);
        showAppNotification("Error al cargar cliente", `No se pudieron obtener los datos completos del cliente en YiQi. Detalle: ${e.message || e}`, "danger");
    } finally {
        hideLoader();
    }
}

function getClientBranches() {
    if (!selectedClient) return [];
    return selectedClient.branches || [];
}

function toggleClientBranches() {
    const detail = document.getElementById("client-branches-detail");
    const arrow = document.querySelector(".collapsible-trigger .toggle-arrow");
    if (detail) {
        if (detail.style.display === "none" || !detail.style.display) {
            detail.style.display = "flex";
            if (arrow) arrow.style.transform = "rotate(90deg)";
        } else {
            detail.style.display = "none";
            if (arrow) arrow.style.transform = "rotate(0deg)";
        }
    }
}
window.toggleClientBranches = toggleClientBranches;

function renderClientCard() {
    const container = document.getElementById("client-details-container");
    if (!selectedClient) return;
    
    const balanceClass = selectedClient.balance > 0 ? "balance-due" : "balance-ok";
    const formattedBalance = formatCurrency(selectedClient.balance);
    
    const branches = getClientBranches();
    const branchCount = branches.length;
    let branchesHtml = "";
    if (branchCount > 0) {
        branchesHtml = `
            <div class="attr-row collapsible-trigger" onclick="toggleClientBranches()" style="cursor: pointer; user-select: none; margin-top: 4px;">
                <span class="attr-label" style="display: flex; align-items: center; gap: 4px; font-weight: 500;">
                    🏢 Sucursales
                    <span class="toggle-arrow" style="font-size: 0.7rem; transition: transform 0.2s; display: inline-block;">▶</span>
                </span>
                <span class="attr-value badge-value" style="background: rgba(59, 130, 246, 0.2); color: #60a5fa;">${branchCount}</span>
            </div>
            <div id="client-branches-detail" class="collapsible-content" style="display: none; padding: 6px 12px; background: rgba(255, 255, 255, 0.02); border-left: 2px solid var(--primary); margin: 4px 0 10px 0; border-radius: var(--radius-sm); font-size: 0.78rem; display: flex; flex-direction: column; gap: 6px;">
        `;
        branches.forEach((b, idx) => {
            branchesHtml += `
                <div style="padding: 4px 0; border-bottom: ${idx < branchCount - 1 ? '1px dashed rgba(255, 255, 255, 0.05)' : 'none'}; text-align: left;">
                    <div style="font-weight: 600; color: var(--text-primary);">${b.SUCU_NOMBRE ? b.SUCU_NOMBRE + ' - ' : ''}${b.SUCU_DIRECCION || 'Sin dirección'}</div>
                    <div style="color: var(--text-secondary); font-size: 0.72rem;">${b.CLIE_LOCALIDAD || ''} ${b.PROV_NOMBRE ? '('+b.PROV_NOMBRE+')' : ''}</div>
                </div>
            `;
        });
        branchesHtml += `
            </div>
        `;
    } else {
        branchesHtml = `
            <div class="attr-row">
                <span class="attr-label">🏢 Sucursales</span>
                <span class="attr-value" style="opacity: 0.5;">0</span>
            </div>
        `;
    }
    
    // Get plan templates and current assignment
    const templates = getPlanTemplates();
    const clientPlans = JSON.parse(localStorage.getItem("tmc_client_plans") || "{}");
    const assignedTemplateId = clientPlans[selectedClient.id] || "standard";
    
    let planOptionsHtml = "";
    templates.forEach(t => {
        const isSelected = t.id === assignedTemplateId ? "selected" : "";
        planOptionsHtml += `<option value="${t.id}" ${isSelected}>${t.name}</option>`;
    });
    
    container.innerHTML = `
        <div class="client-info-card">
            <div class="client-name-header">
                <h3 class="client-title">${selectedClient.name}</h3>
                <div class="client-meta-label">Cliente Seleccionado</div>
            </div>
            
            <div class="client-attributes-list">
                <div class="attr-row">
                    <span class="attr-label">CUIT</span>
                    <span class="attr-value">${selectedClient.cuit}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Dirección</span>
                    <span class="attr-value">${selectedClient.domicile}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Mail</span>
                    <span class="attr-value" style="font-size: 0.75rem;">${selectedClient.mail}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Teléfono</span>
                    <span class="attr-value">${selectedClient.phone || "Sin Teléfono"}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Lista de Precios</span>
                    <span class="attr-value badge-value">${selectedClient.listName}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Tipo de Cliente</span>
                    <span class="attr-value badge-value" style="background: ${selectedClient.typeName !== 'Ninguno' ? 'rgba(74, 222, 128, 0.2)' : 'rgba(255, 255, 255, 0.05)'}; color: ${selectedClient.typeName !== 'Ninguno' ? '#4ade80' : 'var(--text-secondary)'};">${selectedClient.typeName} (${selectedClient.typeDiscount}%)</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Cond. IVA</span>
                    <span class="attr-value badge-value">${selectedClient.condIva}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Cond. Venta</span>
                    <span class="attr-value badge-value">${selectedClient.condVenta}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Vendedor</span>
                    <span class="attr-value">${selectedClient.seller}</span>
                </div>
                <div class="attr-row">
                    <span class="attr-label">Deuda CC</span>
                    <span class="attr-value ${balanceClass}">${formattedBalance}</span>
                </div>
                
                ${branchesHtml}
                
                <div class="attr-row" style="margin-top: 15px; border-top: 1px solid var(--border-color); padding-top: 12px; flex-direction: column; align-items: stretch; gap: 6px;">
                    <label class="attr-label" style="margin-bottom: 2px; text-transform: none; font-weight: 600;">Plan de Seguimiento Asignado</label>
                    <select id="client-followup-plan-select" class="form-input" style="background: var(--bg-input); color: var(--text-primary); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 6px; font-size: 0.8rem; width: 100%; cursor: pointer;" onchange="assignPlanToClient('${selectedClient.id}', this.value)">
                        ${planOptionsHtml}
                    </select>
                </div>
            </div>
        </div>
    `;
}

function updateGlobalDiscount(val) {
    let disc = parseFloat(val);
    if (isNaN(disc)) disc = 0.0;
    if (disc < -99.0) disc = -99.0;
    if (disc > 99) disc = 99.0;
    
    globalDiscount = disc;
    
    const field = document.getElementById("global-discount-field");
    if (field) field.value = globalDiscount;
    
    const badge = document.getElementById("global-discount-val-badge");
    if (badge) badge.textContent = `${globalDiscount}%`;
    
    renderCart();
}

// --- ARTICLES MASTER CACHING & FETCHING ---
async function fetchArticlesMasterInBackground() {
    try {
        await syncArticlesMaster(true);
    } catch (e) {
        console.warn("Background articles sync failed, will retry on demand:", e);
    }
}

async function fetchStockCompletoInBackground() {
    try {
        await syncStockCompletoCache(true);
    } catch (e) {
        console.warn("Background stock sync failed, will retry on demand:", e);
    }
}

async function syncStockCompletoCache(silent = false) {
    if (!silent) {
        showLoader("Sincronizando stock completo de YiQi ERP (esto puede demorar unos segundos)...");
    }
    
    try {
        const url = `${CONFIG.GETLIST_BASE}?entityId=794&schemaId=${CONFIG.SCHEMA_ID}&smartieId=2796`;
        const body1 = { page: 1, pageSize: 50 };
        const res1 = await apiCall(url, "POST", body1);
        const rows1 = res1.data || res1.rows || res1.instances || [];
        const total = res1.total || rows1.length;
        
        let allRows = [...rows1];
        const totalPages = Math.ceil(total / 50);
        
        if (totalPages > 1) {
            const promises = [];
            for (let p = 2; p <= totalPages; p++) {
                promises.push(
                    apiCall(url, "POST", { page: p, pageSize: 50 })
                        .then(res => res.data || res.rows || res.instances || [])
                        .catch(err => {
                            console.error(`Error fetching stock page ${p}:`, err);
                            return [];
                        })
                );
            }
            const results = await Promise.all(promises);
            results.forEach(rows => {
                allRows = allRows.concat(rows);
            });
        }
        
        const map = {};
        allRows.forEach(row => {
            const sku = (row.STOC_SKU || "").trim().toUpperCase();
            if (!sku) return;
            
            const qty = parseFloat(row.STOC_CANTIDAD) || 0.0;
            const factQty = parseFloat(row.STOC_FACTIBILIDAD_PRODUCC) || 0.0;
            const cedi = (row.CEDI_CODIGO || "").trim().toUpperCase();
            
            if (!map[sku]) {
                map[sku] = { depo: 0.0, total: 0.0, depoFact: 0.0, totalFact: 0.0 };
            }
            
            map[sku].total += qty;
            map[sku].totalFact += factQty;
            if (cedi === "DEPO") {
                map[sku].depo += qty;
                map[sku].depoFact += factQty;
            }
        });
        
        skuStockMap = map;
        localStorage.setItem("tmc_stock_map", JSON.stringify(map));
        localStorage.setItem("tmc_stock_time", Date.now().toString());
        
        if (!silent) {
            showAppNotification("Stock Sincronizado", `Se cargaron datos de stock para ${Object.keys(map).length} artículos.`, "success");
        }
    } catch (e) {
        console.error("Sync stock completo error:", e);
        if (!silent) {
            showAppNotification("Error de Sincronización", "No se pudo descargar la tabla de stock completo de YiQi.", "danger");
        }
        throw e;
    } finally {
        if (!silent) hideLoader();
    }
}

async function syncArticlesMaster(silent = false) {
    if (!silent) {
        showLoader("Sincronizando catálogo completo de artículos de YiQi ERP (esto puede demorar unos segundos)...");
    }
    
    try {
        let page = 1;
        let hasMore = true;
        let allArticles = [];
        const url = `${CONFIG.GETLIST_BASE}?entityId=${CONFIG.ENTITY_ARTICULOS}&schemaId=${CONFIG.SCHEMA_ID}&smartieId=${CONFIG.SMARTIE_ARTICULOS}`;
        
        while (hasMore && page <= 200) { // Safety ceiling to prevent infinite loops (10,000 items)
            const body = {
                page: page,
                pageSize: 50 // Strict page size as recommended in yiqi_master_brain.md
            };
            
            const response = await apiCall(url, "POST", body);
            const rows = response.data || response.rows || response.instances || [];
            
            if (rows.length === 0) break;
            
            // Filter out non-Ingresado items or items without SKU code
            const activeRows = rows.filter(item => 
                (item.DESC_ESTADO === "Ingresado" || item.ESTA_CODIGO === 77) &&
                item.MATE_CODIGO
            );
            
            allArticles = allArticles.concat(activeRows);
            
            if (rows.length < 50) {
                hasMore = false;
            } else {
                page++;
                // Courteous rate limit delay
                await new Promise(r => setTimeout(r, 100));
            }
        }
        
        if (allArticles.length > 0) {
            articlesCache = allArticles;
            localStorage.setItem("tmc_articles_data", JSON.stringify(articlesCache));
            localStorage.setItem("tmc_articles_time", Date.now().toString());
            
            updateArticlesCountLabel();
            await syncStockCompletoCache(silent);
            renderArticlesList();
            
            if (!silent) {
                showAppNotification("Catálogo Sincronizado", `Se cargaron ${articlesCache.length} artículos del ERP con éxito.`, "success");
                setTimeout(() => {
                    showCatalogConfigModal();
                }, 1000);
            }
        }
    } catch (e) {
        console.error("Sync articles master error:", e);
        if (!silent) {
            showAppNotification("Error de Sincronización", "No se pudo descargar el maestro de artículos de YiQi. Revise la conexión.", "danger");
        }
        throw e;
    } finally {
        if (!silent) hideLoader();
    }
}

function updateArticlesCountLabel() {
    const label = document.getElementById("articles-count");
    if (label) {
        label.textContent = `${articlesCache.length} items`;
    }
}

// --- ARTICLE LIST RENDERER & CALCULATION ---
function renderArticlesList() {
    const tbody = document.getElementById("articles-tbody");
    const table = document.getElementById("articles-table");
    const emptyState = document.getElementById("articles-empty");
    
    if (articlesCache.length === 0) {
        table.style.display = "none";
        emptyState.style.display = "flex";
        return;
    }
    
    const query = document.getElementById("article-search").value.trim().toLowerCase();
    const stockOnly = document.getElementById("filter-stock-only").checked;
    
    // Filter articles based on inputs and catalog configuration
    const filtered = articlesCache.filter(item => {
        const sku = (item.MATE_CODIGO || "").trim().toUpperCase();
        const desc = (item.MATE_NOMBRE || "").toLowerCase();
        
        const stockInfo = skuStockMap[sku] || { depo: 0, total: 0, depoFact: 0, totalFact: 0 };
        const depoStock = stockInfo.depo || 0;
        const depoFact = stockInfo.depoFact || 0;
        
        const matchSearch = sku.toLowerCase().includes(query) || desc.includes(query);
        const matchStock = !stockOnly || ((depoStock + depoFact) > 0);
        
        if (!matchSearch || !matchStock) return false;
        
        // Match collection filters
        const collection = item.COLE_DESCRIPCION || "(Vacío)";
        const matchCollection = catalogConfig.filterCollections.includes(collection);
        
        // Match group filters
        const groupId = parseInt(item.MATE_GRUPO_IDEN) || 0;
        const matchGroup = !catalogConfig.excludeGroups.includes(groupId);
        
        return matchCollection && matchGroup;
    });
    
    // Calculate total active columns including the action column (+1)
    const colCount = Object.values(catalogConfig.visibleColumns).filter(v => v).length + 1;
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${colCount}" class="text-center text-secondary" style="padding: 30px;">No se encontraron artículos con los filtros aplicados.</td></tr>`;
        table.style.display = "table";
        emptyState.style.display = "none";
        renderArticlesHeaders();
        return;
    }
    
    // Sort filtered: items with stock first, then alphabetically by SKU
    filtered.sort((a, b) => {
        const skuA = (a.MATE_CODIGO || "").trim().toUpperCase();
        const skuB = (b.MATE_CODIGO || "").trim().toUpperCase();
        const stockInfoA = skuStockMap[skuA] || { depo: 0, total: 0, depoFact: 0, totalFact: 0 };
        const stockInfoB = skuStockMap[skuB] || { depo: 0, total: 0, depoFact: 0, totalFact: 0 };
        const stockA = (stockInfoA.depo || 0) + (stockInfoA.depoFact || 0);
        const stockB = (stockInfoB.depo || 0) + (stockInfoB.depoFact || 0);
        
        if (stockA > 0 && stockB === 0) return -1;
        if (stockA === 0 && stockB > 0) return 1;
        
        return skuA.localeCompare(skuB);
    });
    
    // Render the dynamic headers
    renderArticlesHeaders();
    
    let html = "";
    filtered.slice(0, articlesLimit).forEach(item => { // Limit rendering for max DOM performance
        const sku = (item.MATE_CODIGO || "").trim().toUpperCase();
        const stockInfo = skuStockMap[sku] || { depo: 0, total: 0, depoFact: 0, totalFact: 0 };
        const depoStock = stockInfo.depo || 0;
        const depoFact = stockInfo.depoFact || 0;
        const totalStock = stockInfo.total || 0;
        const totalFact = stockInfo.totalFact || 0;
        
        const finalDepoStock = depoStock + depoFact;
        const finalTotalStock = totalStock + totalFact;
        
        let stockClass = "stock-out";
        let formattedStock = "Sin Stock";
        
        if (finalDepoStock > 0) {
            stockClass = "stock-in";
            if (finalTotalStock !== finalDepoStock) {
                formattedStock = `${finalDepoStock} u. <span style="color: var(--text-muted); font-size: 0.75rem; font-weight: normal; margin-left: 4px;">(${finalTotalStock})</span>`;
            } else {
                formattedStock = `${finalDepoStock} u.`;
            }
        } else if (finalTotalStock > 0) {
            stockClass = "stock-warning";
            formattedStock = `0 u. <span style="color: var(--text-muted); font-size: 0.75rem; font-weight: normal; margin-left: 4px;">(${finalTotalStock})</span>`;
        }
        
        // Price calculations
        // LIDP_ID_LIDP determines Minorista (1) vs Mayorista (2) pricing
        const isMinorista = !selectedClient || selectedClient.listId === 1 || selectedClient.listId === "1";
        const clientTypeDiscount = selectedClient ? selectedClient.typeDiscount : 0.0;
        
        const listPriceNet = isMinorista 
            ? (parseFloat(item.MATE_PRECIO_LISTA_1___NET) || 0.0)
            : (parseFloat(item.MATE_PRECIO_LISTA_2___NET) || 0.0);
            
        const vatPercent = parseFloat(item.ALIV_PORCENTAJE) || 21.0;
        
        // Calculate Net Price (after client type discount)
        const netPrice = listPriceNet * (1 - clientTypeDiscount / 100);
        
        // Calculate Final Price (adding IVA)
        const finalPrice = netPrice * (1 + vatPercent / 100);
        
        let cellsHtml = "";
        catalogConfig.columnOrder.forEach(colId => {
            if (!catalogConfig.visibleColumns[colId]) return;
            
            if (colId === "sku") {
                cellsHtml += `<td><span class="sku-code">${item.MATE_CODIGO}</span></td>`;
            } else if (colId === "desc") {
                cellsHtml += `<td><div class="article-name" title="${item.MATE_NOMBRE}">${item.MATE_NOMBRE}</div></td>`;
            } else if (colId === "stock") {
                cellsHtml += `<td class="text-center"><span class="stock-indicator ${stockClass}" style="cursor: pointer; text-decoration: underline dashed; text-underline-offset: 3px;" onclick="showStockBreakdown('${item.MATE_CODIGO}', '${item.MATE_NOMBRE.replace(/'/g, "\\'")}')" title="Ver stock por depósito">${formattedStock}</span></td>`;
            } else if (colId === "grupo") {
                cellsHtml += `<td><div style="font-size: 0.75rem; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.GRMA_DESCRIPCION || ''}">${item.GRMA_DESCRIPCION || '-'}</div></td>`;
            } else if (colId === "subgrupo1") {
                cellsHtml += `<td><div style="font-size: 0.75rem; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.SUMA_DESCRIPCION || ''}">${item.SUMA_DESCRIPCION || '-'}</div></td>`;
            } else if (colId === "subgrupo2") {
                cellsHtml += `<td><div style="font-size: 0.75rem; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.SSDA_DESCRIPCION || ''}">${item.SSDA_DESCRIPCION || '-'}</div></td>`;
            } else if (colId === "pbase") {
                const listName = selectedClient ? selectedClient.listName : "Minorista (Sin Cliente)";
                cellsHtml += `<td class="text-right price-cell" title="Lista de Precios: ${listName}">${formatCurrency(listPriceNet)}</td>`;
            } else if (colId === "pneto") {
                cellsHtml += `<td class="text-right price-cell color-net">${formatCurrency(netPrice)}</td>`;
            } else if (colId === "pfinal") {
                cellsHtml += `<td class="text-right price-cell color-final">${formatCurrency(finalPrice)}</td>`;
            }
        });
        
        cellsHtml += `
            <td class="text-center">
                <button class="btn-add-item" onclick="addItemToCart(${item.ID}, '${item.MATE_CODIGO}', '${item.MATE_NOMBRE.replace(/'/g, "\\'")}', ${listPriceNet}, ${vatPercent}, ${clientTypeDiscount})">+</button>
            </td>
        `;
        
        html += `<tr class="fade-in">${cellsHtml}</tr>`;
    });
    
    if (filtered.length > articlesLimit) {
        html += `
            <tr id="catalog-load-more-row">
                <td colspan="${colCount}" class="text-center" style="padding: 18px 10px; border-bottom: none;">
                    <button class="btn btn-secondary" onclick="showAllArticles()" style="font-size: 0.82rem; padding: 8px 24px; font-weight: 700; border-radius: var(--radius-md); box-shadow: var(--shadow-sm);">
                        Ver todos los artículos (${filtered.length})
                    </button>
                </td>
            </tr>
        `;
    }
    
    tbody.innerHTML = html;
    table.style.display = "table";
    emptyState.style.display = "none";
}

function showAllArticles() {
    articlesLimit = Infinity;
    renderArticlesList();
}

function renderArticlesHeaders() {
    const thead = document.getElementById("articles-thead");
    if (!thead) return;
    
    let headersHtml = "";
    catalogConfig.columnOrder.forEach(colId => {
        if (!catalogConfig.visibleColumns[colId]) return;
        
        if (colId === "sku") headersHtml += "<th>SKU</th>";
        else if (colId === "desc") headersHtml += "<th>Descripción</th>";
        else if (colId === "stock") headersHtml += '<th class="text-center">Stock</th>';
        else if (colId === "grupo") headersHtml += "<th>Grupo</th>";
        else if (colId === "subgrupo1") headersHtml += "<th>1° Subgrupo</th>";
        else if (colId === "subgrupo2") headersHtml += "<th>2° Subgrupo</th>";
        else if (colId === "pbase") {
            const listHeaderTitle = selectedClient ? `Lista de Precios: ${selectedClient.listName}` : "Lista de Precios";
            headersHtml += `<th class="text-right" title="${listHeaderTitle}">P. Base</th>`;
        }
        else if (colId === "pneto") headersHtml += '<th class="text-right color-net">P. Neto</th>';
        else if (colId === "pfinal") headersHtml += '<th class="text-right color-final">P. Final</th>';
    });
    
    headersHtml += '<th class="text-center">Acción</th>';
    
    thead.innerHTML = `<tr>${headersHtml}</tr>`;
}

// --- CART / CANASTA LOGIC ---
function addItemToCart(id, sku, name, priceListNet, vatPercent, clientTypeDiscount) {
    if (!selectedClient) {
        showAppNotification("Atención", "Seleccione un cliente primero antes de armar la canasta.", "warning");
        return;
    }
    
    // Check if item is already in cart
    const existing = cart.find(item => item.id === id);
    if (existing) {
        existing.qty += 1;
        showAppNotification("Canasta", `Se incrementó cantidad de ${sku}.`, "success");
    } else {
        const artObj = articlesCache.find(a => a.ID === id);
        const alicuotaId = artObj ? (artObj.ALIV_ID_ALIV || artObj.aliv_id_aliv || 1) : 1;
        
        cart.push({
            id: id,
            sku: sku,
            name: name,
            qty: 1,
            priceListNet: priceListNet,
            clientTypeDiscount: clientTypeDiscount || 0.0,
            manualBasePrice: null, // Override base price manually if set
            discount: 0.0, // Defaults to 0% line discount
            hasCustomDiscount: false,
            vatPercent: vatPercent,
            alicuotaId: alicuotaId,
            additionalText: ""
        });
        showAppNotification("Canasta", `Agregado ${sku} a la canasta.`, "success");
    }
    
    renderCart();
}

function removeItemFromCart(id) {
    cart = cart.filter(item => item.id !== id);
    renderCart();
}

function updateCartItemQty(id, val) {
    const item = cart.find(item => item.id === id);
    if (!item) return;
    
    let qty = parseInt(val);
    if (isNaN(qty) || qty < 1) qty = 1;
    item.qty = qty;
    
    renderCart();
}

function updateCartItemBasePrice(id, val) {
    const item = cart.find(item => item.id === id);
    if (!item) return;
    
    let price = parseArgentinianNumber(val);
    if (price <= 0) {
        item.manualBasePrice = null; // Revert to auto calculation if empty/invalid
    } else {
        item.manualBasePrice = price;
    }
    
    renderCart();
}

function updateCartItemAdditionalText(id, val) {
    const item = cart.find(item => item.id === id);
    if (item) {
        item.additionalText = val;
    }
}

function updateCartItemDiscount(id, val) {
    const item = cart.find(item => item.id === id);
    if (!item) return;
    
    let disc = parseFloat(val);
    if (isNaN(disc) || disc < 0) disc = 0.0;
    if (disc > 99) disc = 99.0;
    
    item.discount = disc;
    item.hasCustomDiscount = true; // Mark as override so changing global discount doesn't reset it
    
    renderCart();
}

function renderCart() {
    const tbody = document.getElementById("cart-tbody");
    const table = document.getElementById("cart-table");
    const emptyState = document.getElementById("cart-empty");
    const formContainer = document.getElementById("cart-form-container");
    
    if (cart.length === 0) {
        table.style.display = "none";
        formContainer.style.display = "none";
        emptyState.style.display = "flex";
        
        // Reset global discount when cart is empty
        globalDiscount = 0.0;
        const field = document.getElementById("global-discount-field");
        if (field) field.value = 0;
        const badge = document.getElementById("global-discount-val-badge");
        if (badge) badge.textContent = "0%";
        return;
    }
    
    let html = "";
    let subtotalNet = 0.0;
    let totalDiscountedNet = 0.0;
    let totalIva = 0.0;
    
    cart.forEach(item => {
        // Price after client type discount (Client Net) or manual override of Base Price
        const basePrice = (item.manualBasePrice !== null && item.manualBasePrice !== undefined)
            ? item.manualBasePrice
            : item.priceListNet;
        const clientNetPrice = basePrice * (1 - item.clientTypeDiscount / 100);
        // Line total (no individual discount anymore)
        const lineTotalNet = clientNetPrice * item.qty;
        
        // Apply global discount portion to this line item for correct IVA computation
        const lineNetAfterGlobal = lineTotalNet * (1 - globalDiscount / 100);
        const lineIva = lineNetAfterGlobal * (item.vatPercent / 100);
        
        // Sums
        subtotalNet += clientNetPrice * item.qty;
        totalDiscountedNet += lineTotalNet;
        totalIva += lineIva;
        
        html += `
            <tr class="fade-in">
                <td><span class="sku-code">${item.sku}</span></td>
                <td>
                    <div class="article-name" title="${item.name}">${item.name}</div>
                    <input type="text" class="form-input additional-text-input" placeholder="Texto adicional (ej. ruedas)..." value="${item.additionalText || ''}" onchange="updateCartItemAdditionalText(${item.id}, this.value)">
                </td>
                <td class="text-center">
                    <input type="number" class="quantity-field" min="1" value="${item.qty}" onchange="updateCartItemQty(${item.id}, this.value)">
                </td>
                <td class="text-right price-cell">
                    <input type="text" class="manual-price-field" style="width: 95px;" value="${formatArgentinianNumber(basePrice)}" onchange="updateCartItemBasePrice(${item.id}, this.value)">
                </td>
                <td class="text-right price-cell" style="color: var(--warning); font-size: 0.8rem; padding: 6px 8px;">
                    ${item.clientTypeDiscount.toFixed(1)}%
                </td>
                <td class="text-right price-cell" style="color: var(--text-secondary); font-size: 0.8rem; padding: 6px 8px;">
                    ${formatCurrency(clientNetPrice)}
                </td>
                <td class="text-right price-cell color-net">${formatCurrency(lineTotalNet)}</td>
                <td class="text-center">
                    <button class="btn-remove-item" onclick="removeItemFromCart(${item.id})" title="Quitar ítem">✕</button>
                </td>
            </tr>
        `;
    });
    
    // Global discount is calculated on the total line-net amount
    const globalDiscountAmount = totalDiscountedNet * (globalDiscount / 100);
    const finalAmount = (totalDiscountedNet - globalDiscountAmount) + totalIva;
    
    // Update Totals label dynamically for discount vs surcharge
    const discountLabelEl = document.querySelector(".totals-card .totals-row:nth-child(2) .totals-label");
    if (discountLabelEl) {
        discountLabelEl.textContent = globalDiscountAmount >= 0 ? "Descuento Global" : "Recargo Global";
    }
    
    // Write sums to UI
    const formattedDiscountAmount = globalDiscountAmount >= 0
        ? `-${formatCurrency(globalDiscountAmount)}`
        : `+${formatCurrency(Math.abs(globalDiscountAmount))}`;
        
    document.getElementById("total-subtotal-net").textContent = formatCurrency(subtotalNet);
    document.getElementById("total-global-discount").textContent = formattedDiscountAmount;
    document.getElementById("total-iva-amount").textContent = formatCurrency(totalIva);
    document.getElementById("total-final-amount").textContent = formatCurrency(finalAmount);
    
    tbody.innerHTML = html;
    table.style.display = "table";
    formContainer.style.display = "block";
    emptyState.style.display = "none";
    updateCartHeader();
}

// --- DOCUMENT SUBMISSION (QUOTES AND ORDERS) ---
// Helper to execute a workflow transition with retry pattern to avoid lock/race conditions
async function executeTransitionWithRetry(docId, transitionId, description = "transición") {
    console.log(`Executing transition ${transitionId} (${description}) for docId ${docId}...`);
    let lastError = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const transBody = {
                schemaId: CONFIG.SCHEMA_ID,
                ids: [String(docId)],
                transitionId: transitionId,
                form: ""
            };
            const transRes = await apiCall(CONFIG.TRANSITION_BASE, "POST", transBody);
            if (transRes && transRes.ok !== false) {
                console.log(`Transition ${transitionId} (${description}) successful on attempt ${attempt}.`);
                return { ok: true };
            }
            lastError = transRes ? transRes.error : "Unknown error";
            console.warn(`Attempt ${attempt} for transition ${transitionId} failed:`, lastError);
            
            // Abort immediately if it is a salesperson discount validation error
            if (lastError && (lastError.includes("descuento máximo") || lastError.includes("detalle que supera"))) {
                return { ok: false, error: lastError };
            }
        } catch (transErr) {
            lastError = transErr.message || String(transErr);
            console.warn(`Attempt ${attempt} for transition ${transitionId} threw error:`, transErr);
        }
        if (attempt < 3) {
            await new Promise(r => setTimeout(r, 2000));
        }
    }
    return { ok: false, error: lastError };
}

// Helper to fetch the official display number for a quote from YiQi (attribute 7076)
async function getQuoteDisplayNumber(quoteId) {
    try {
        const res = await apiCall(`https://api.yiqi.com.ar/api/instancesApi/GetInstance?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&id=${quoteId}`, "GET");
        if (res && res.atts && res.atts["7076"]) {
            return res.atts["7076"].value || String(quoteId);
        }
    } catch (e) {
        console.warn(`Could not fetch display number for quote ${quoteId}:`, e);
    }
    return String(quoteId);
}

// --- DOCUMENT SUBMISSION (QUOTES AND ORDERS) ---
async function submitDocument(type) {
    if (!selectedClient || cart.length === 0) {
        showAppNotification("Error", "Debe seleccionar un cliente y agregar ítems a la canasta.", "danger");
        return;
    }
    
    const isOrder = type === "RESERVAR";
    const actionText = isOrder ? "Cargar Pedido de Venta" : "Guardar Cotización";
    
    showLoader(`Iniciando carga de documento (${actionText})...`);
    
    try {
        const obsValue = document.getElementById("doc-observations").value.trim();
        const cleanObs = obsValue;

        // Calculate document total net and final for the CRM plan
        let totalDiscountedNet = 0.0;
        let totalIva = 0.0;
        cart.forEach(item => {
            const basePrice = (item.manualBasePrice !== null && item.manualBasePrice !== undefined)
                ? item.manualBasePrice
                : item.priceListNet;
            const clientNetPrice = basePrice * (1 - item.clientTypeDiscount / 100);
            const lineTotalNet = clientNetPrice * item.qty;
            const lineNetAfterGlobal = lineTotalNet * (1 - globalDiscount / 100);
            const lineIva = lineNetAfterGlobal * (item.vatPercent / 100);
            
            totalDiscountedNet += lineTotalNet;
            totalIva += lineIva;
        });
        const globalDiscountAmount = totalDiscountedNet * (globalDiscount / 100);
        const finalDocTotal = (totalDiscountedNet - globalDiscountAmount) + totalIva;

        let docId = null;
        let docDisplayNum = "";
        
        const branchSelect = document.getElementById("doc-sucursal");
        const selectedBranchId = branchSelect ? branchSelect.value : "";

        // Check if we are editing an existing quote in preparation
        let isEditingPreparation = false;
        let plan = null;
        if (!isOrder && editingVersionOfPlanId) {
            const followups = getCrmFollowups();
            plan = followups.find(f => String(f.id) === String(editingVersionOfPlanId));
            if (plan && plan.status === "PREPARACION") {
                isEditingPreparation = true;
            }
        }

        if (!isOrder) {
            // Flow A: Create true Commercial Quotation in YiQi ERP via Public API JSON REST
            const quoteProducts = cart.map(item => {
                const basePrice = (item.manualBasePrice !== null && item.manualBasePrice !== undefined)
                    ? item.manualBasePrice
                    : item.priceListNet;
                const discountPct = item.clientTypeDiscount;
                
                return {
                    MATE_ID_MATE: item.id,
                    DECO_CANTIDAD: item.qty,
                    DECO_PRECIO_UNITARIO: basePrice,
                    DECO_DTO_ADICIONAL: discountPct,
                    DECO_TEXTO_ADICIONAL: item.additionalText || "",
                    ALIV_ID_ALIV: item.alicuotaId || 1
                };
            });
            
            const mailAdicionalInput = document.getElementById("doc-mail-adicional");
            const mailAdicionalVal = mailAdicionalInput ? mailAdicionalInput.value.trim() : "";

            const condPagoSelect = document.getElementById("doc-cond-pago");
            const selectedCove = condPagoSelect && condPagoSelect.value ? parseInt(condPagoSelect.value) : selectedClient.condVentaId;
            
            const metodoEnvioSelect = document.getElementById("doc-metodo-envio");
            const selectedTrlo = metodoEnvioSelect && metodoEnvioSelect.value ? parseInt(metodoEnvioSelect.value) : null;

            const quoteBody = {
                schemaId: CONFIG.SCHEMA_ID,
                data: {
                    CLIE_ID_CLIE: selectedClient.id,
                    VEHA_ID_VEHA: selectedClient.sellerId || 1,
                    MONE_ID_MONE: 171, // ARS
                    LIDP_ID_LIDP: selectedClient.listId,
                    COCO_ASUNTO: `Cotización ${selectedClient.name}`,
                    COCO_OBSERVACIONES: cleanObs,
                    COVE_ID_COVE: selectedCove,
                    COCO_DTO_GLOBAL: globalDiscount,
                    Productos: quoteProducts
                }
            };
            if (selectedBranchId) {
                quoteBody.data.SUCU_ID_SUCU = parseInt(selectedBranchId);
            }
            if (selectedTrlo) {
                quoteBody.data.TRLO_ID_TRLO = selectedTrlo;
            } else if (isEditingPreparation) {
                quoteBody.data.TRLO_ID_TRLO = null;
            }
            if (mailAdicionalVal) {
                quoteBody.data.COCO_DESTINATARIO_ADICION = mailAdicionalVal;
            }
            
            let url = `https://api.yiqi.com.ar/api/public/COTIZACION_COMERCIAL?schemaId=${CONFIG.SCHEMA_ID}`;
            let method = "POST";
            if (isEditingPreparation && editingVersionOfDocId) {
                url = `https://api.yiqi.com.ar/api/public/COTIZACION_COMERCIAL/${editingVersionOfDocId}?schemaId=${CONFIG.SCHEMA_ID}`;
                method = "PUT";
                showLoader("Actualizando cotización existente...");
                
                // Fetch and delete existing child items to avoid duplicates/omissions
                try {
                    const childUrl = `https://api.yiqi.com.ar/api/childrenApi/GetChildList?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&childId=249&instanceId=${editingVersionOfDocId}`;
                    const childRes = await apiCall(childUrl, "GET");
                    const existingLines = childRes.data || childRes.rows || childRes.instances || [];
                    const idsToDelete = existingLines.map(l => l.id || l.ID).filter(id => id).join(",");
                    if (idsToDelete) {
                        console.log(`Deleting existing child lines before update: ${idsToDelete}`);
                        await apiCall(`https://api.yiqi.com.ar/api/instancesApi/Delete?schemaId=${CONFIG.SCHEMA_ID}&entityId=867&ids=${idsToDelete}`, "GET");
                    }
                } catch (delErr) {
                    console.error("Error deleting old items before update:", delErr);
                    throw new Error("No se pudieron limpiar los artículos anteriores de la cotización: " + delErr.message);
                }
            }
            
            const res = await apiCall(url, method, quoteBody);
            
            if (res.ok === false) {
                throw new Error(res.error || `YiQi rejected quotation ${method === "PUT" ? "update" : "creation"}`);
            }
            
            docId = res.id || res.newId || editingVersionOfDocId;
            docDisplayNum = String(docId);
            
            // Try to fetch the official display number right now from YiQi before showing success modal
            try {
                const officialNum = await getQuoteDisplayNumber(docId);
                if (officialNum) {
                    docDisplayNum = officialNum;
                }
            } catch (e) {
                console.warn("Could not fetch official display number in submitDocument:", e);
            }
            
            console.log(`Quotation saved successfully via public API. ID: ${docId}, Nro: ${docDisplayNum}`);
            
            // Step 2: Transition state to Validar and then Enviar
            try {
                let valRes = { ok: true };
                if (method === "POST" || isEditingPreparation) {
                    showLoader("Validando cotización en YiQi...");
                    try {
                        valRes = await executeTransitionWithRetry(docId, CONFIG.TRANSITION_COTI_VALIDAR, "Validar Cotización");
                    } catch (valErr) {
                        if (method === "PUT") {
                            console.log("Validation transition threw an error, continuing to send...", valErr);
                            valRes = { ok: false, error: valErr.message };
                        } else {
                            throw valErr;
                        }
                    }
                }
                
                if (valRes.ok || method === "PUT") {
                    showLoader("Enviando cotización en YiQi...");
                    const envRes = await executeTransitionWithRetry(docId, CONFIG.TRANSITION_COTI_ENVIAR, "Enviar Cotización");
                    if (!envRes.ok) {
                        const errMsg = envRes.error ? ` Detalle: ${envRes.error}` : "";
                        showAppNotification("Cotización parcial", `Se guardó la cotización pero no se pudo pasar a 'Enviada' en el ERP.${errMsg}`, "warning");
                    }
                } else {
                    const errMsg = valRes.error ? ` Detalle: ${valRes.error}` : "";
                    showAppNotification("Cotización parcial", `Se guardó la cotización pero no se pudo validar en el ERP.${errMsg}`, "warning");
                }
            } catch (transErr) {
                console.error("Quotation transitions error:", transErr);
                showAppNotification("Error de transición", `La cotización se guardó pero fallaron las transiciones en el ERP: ${transErr.message || transErr}`, "warning");
            }
            
        } else {
            // Flow B: Create standard Sales Order in YiQi (Entity 1231)
            // Assemble URL encoded form string with properties
            const condPagoSelect = document.getElementById("doc-cond-pago");
            const selectedCove = condPagoSelect && condPagoSelect.value ? parseInt(condPagoSelect.value) : selectedClient.condVentaId;
            
            const metodoEnvioSelect = document.getElementById("doc-metodo-envio");
            const selectedTrlo = metodoEnvioSelect && metodoEnvioSelect.value ? parseInt(metodoEnvioSelect.value) : null;

            let formStr = `EXTE_ID_EXTE=1&CLIE_ID_CLIE=${selectedClient.id}&LIDP_ID_LIDP=${selectedClient.listId}&COVE_ID_COVE=${selectedCove}&PEDI_DTO_GLOBAL=${globalDiscount}&PEDI_OBSERVACIONES=${encodeURIComponent(cleanObs)}`;
            if (selectedBranchId) {
                formStr += `&SUCU_ID_SUCU=${selectedBranchId}`;
            }
            if (selectedTrlo) {
                formStr += `&TRLO_ID_TRLO=${selectedTrlo}`;
            }
            
            const saveHeaderBody = {
                schemaId: CONFIG.SCHEMA_ID,
                entityId: CONFIG.ENTITY_PEDIDOS,
                form: formStr,
                uploads: "",
                parentId: null,
                childId: null
            };
            
            const headerRes = await apiCall(CONFIG.SAVE_BASE, "POST", saveHeaderBody);
            
            if (!headerRes.ok || !headerRes.newId) {
                throw new Error(headerRes.error || "YiQi rejected header creation");
            }
            
            docId = headerRes.newId;
            docDisplayNum = String(docId);
            console.log(`Order header saved. New ID: ${docId}`);
            
            // Step 2: Save Child Line Instances (childId 231)
            showLoader("Guardando líneas de artículos...");
            
            const childInstances = cart.map(item => {
                const basePrice = (item.manualBasePrice !== null && item.manualBasePrice !== undefined)
                    ? item.manualBasePrice
                    : item.priceListNet;
                const discountPct = item.clientTypeDiscount;
                
                return JSON.stringify({
                    "MATE_ID_MATE": item.id,
                    "CODIGO": item.sku,
                    "MATE_CODIGO": item.sku,
                    "NOMBRE": item.name,
                    "DEDP_CONCEPTO": item.name,
                    "CANTIDAD": item.qty,
                    "DEDP_CANTIDAD": item.qty,
                    "DEDP_CANT_A_ENTREGAR": item.qty,
                    "BONIFICACION": discountPct,
                    "DEDP_BONIFICACION": discountPct,
                    "PRECIO_UNITARIO": basePrice,
                    "DEDP_PRECIO_UNITARIO": basePrice,
                    "DEDP_TEXTO_ADICIONAL": item.additionalText || "",
                    "TEXTO_ADICIONAL": item.additionalText || ""
                });
            });
            
            const saveChildBody = {
                entityId: CONFIG.ENTITY_PEDIDOS,
                schemaId: CONFIG.SCHEMA_ID,
                childId: CONFIG.CHILD_PEDIDO_ITEMS,
                instanceId: String(docId),
                childInstances: childInstances,
                append: true
            };
            
            const childSaveUrl = `${CONFIG.SAVE_CHILD_BASE}?instanceId=${docId}&schemaId=${CONFIG.SCHEMA_ID}`;
            const childRes = await apiCall(childSaveUrl, "POST", saveChildBody);
            
            if (childRes.ok === false) {
                throw new Error(childRes.error || "YiQi rejected line items creation");
            }
            
            console.log("Lines saved successfully.");
            
            // Step 3: Transition state if confirmed Order (Reservar)
            showLoader("Confirmando reservas de stock...");
            const transRes = await executeTransitionWithRetry(docId, CONFIG.TRANSITION_RESERVAR, "Reservar Stock");
            
            if (!transRes.ok) {
                const errMsg = transRes.error ? ` Detalle: ${transRes.error}` : "";
                showAppNotification("Pedido creado como borrador", `El pedido N° ${docId} se guardó pero falló la reserva de stock.${errMsg} Modifíquelo en YiQi.`, "warning");
                resetCart();
                return;
            }
        }
        
        // Success
        hideLoader();
        const successMsg = isOrder 
            ? `Se generó el Pedido N° ${docDisplayNum} correctamente en estado "A Reservar" y se impactó el stock.`
            : `Se registró la Cotización N° ${docDisplayNum} en YiQi con éxito.`;
            
        const docType = isOrder ? "PEDIDO" : "COTIZACION";
        if (isEditingPreparation && plan) {
            // Update the existing followup
            const followups = getCrmFollowups();
            const currentPlan = followups.find(f => String(f.id) === String(plan.id));
            if (currentPlan) {
                currentPlan.docTotal = finalDocTotal;
                currentPlan.docDisplayNum = docDisplayNum;
                currentPlan.status = "ABIERTO";
                currentPlan.erpState = "Enviada";
                currentPlan.closeDate = null;
                saveCrmFollowups(followups, currentPlan);
            }
        } else {
            createCrmFollowup(selectedClient.id, selectedClient.name, docId, docType, finalDocTotal, docDisplayNum);
        }
        
        // Clean up previous draft version if we were editing one (but not if we edited and reused the preparation one)
        if (!isOrder && editingVersionOfDocId && !isEditingPreparation) {
            cleanupDraftQuoteAfterSubmit(editingVersionOfDocId, editingVersionOfPlanId);
        }
        
        // Trigger background sync immediately to align everything
        syncClientFollowupsWithYiQi(selectedClient.id);
            
        const modalActions = [];
        if (!isOrder) {
            modalActions.push({
                text: "Enviar por WhatsApp 🟢",
                class: "btn-success",
                onClick: () => {
                    shareNewQuoteWhatsApp(selectedClient, docId, docDisplayNum, finalDocTotal);
                    resetCart();
                    switchView("client-crm");
                    renderAllCrmSections();
                    renderCrmAlerts();
                },
                close: true
            });
        }
        modalActions.push({ 
            text: "Aceptar", 
            class: "btn-primary", 
            onClick: () => {
                resetCart();
                switchView("client-crm");
                renderAllCrmSections();
                renderCrmAlerts();
            }, 
            close: true 
        });

        showModal({
            title: isOrder ? "🚀 Pedido Cargado con Éxito" : "📝 Cotización Registrada",
            content: `
                <div style="text-align: center; padding: 10px;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">✅</div>
                    <p style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Documento N° ${docDisplayNum}</p>
                    <p class="text-secondary">${successMsg}</p>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 14px;">Puede visualizar este documento ingresando a YiQi ERP.</p>
                </div>
            `,
            actions: modalActions
        });
        
    } catch (e) {
        console.error("Submit document error:", e);
        hideLoader();
        showAppNotification("Error al registrar documento", `No se pudo guardar la cotización/pedido: ${e.message}. Reintente.`, "danger");
    }
}

function updateCartHeader() {
    const editBadge = document.getElementById("cart-edit-badge");
    const quoteNumSpan = document.getElementById("cart-edit-quote-num");
    
    if (editingVersionOfDocId) {
        const followups = getCrmFollowups();
        const plan = followups.find(f => String(f.docId) === String(editingVersionOfDocId));
        const displayNum = plan ? plan.docDisplayNum : String(editingVersionOfDocId);
        
        if (quoteNumSpan) {
            quoteNumSpan.textContent = displayNum;
        }
        if (editBadge) {
            editBadge.style.display = "inline-flex";
        }
    } else {
        if (editBadge) {
            editBadge.style.display = "none";
        }
    }
}

function resetCart() {
    cart = [];
    document.getElementById("doc-observations").value = "";
    editingVersionOfDocId = null;
    editingVersionOfPlanId = null;
    
    updateCartHeader();
    
    const mailAdicionalInput = document.getElementById("doc-mail-adicional");
    if (mailAdicionalInput) {
        mailAdicionalInput.value = "";
    }
    
    // Repopulate sucursal dropdown and client contact info if client is selected
    updateCreatorClientWidget();
    
    renderCart();
}

function updateCreatorClientWidget() {
    const branchContainer = document.getElementById("doc-sucursal-container");
    if (!branchContainer) return;
    
    if (!selectedClient) {
        branchContainer.style.display = "none";
        return;
    }
    
    branchContainer.style.display = "flex";
    
    const branchSelect = document.getElementById("doc-sucursal");
    const noSucursalText = document.getElementById("doc-no-sucursal-text");
    const leftLabel = document.getElementById("creator-left-label");
    
    if (branchSelect) {
        branchSelect.innerHTML = `<option value="">Seleccione una sucursal...</option>`;
        const clientBranches = selectedClient.branches || [];
        
        if (clientBranches.length > 0) {
            clientBranches.forEach(b => {
                const namePart = b.SUCU_NOMBRE ? b.SUCU_NOMBRE + " - " : "";
                const provPart = b.PROV_NOMBRE ? ` (${b.PROV_NOMBRE})` : "";
                branchSelect.innerHTML += `<option value="${b.id}">${namePart}${b.SUCU_DIRECCION || 'Sucursal ' + b.id}${provPart}</option>`;
            });
            
            branchSelect.style.display = "block";
            if (noSucursalText) noSucursalText.style.display = "none";
            if (leftLabel) leftLabel.textContent = "Sucursal a Cotizar";
        } else {
            branchSelect.style.display = "none";
            if (noSucursalText) {
                noSucursalText.style.display = "block";
                noSucursalText.textContent = selectedClient.name || "Cliente Seleccionado";
            }
            if (leftLabel) leftLabel.textContent = "Cliente Seleccionado";
        }
    }
    
    const quickEmail = document.getElementById("quick-contact-email");
    const quickPhone = document.getElementById("quick-contact-phone");
    
    if (quickEmail) {
        const emailVal = selectedClient.mail && selectedClient.mail !== "Sin Email" ? selectedClient.mail : "Sin email registrado";
        quickEmail.title = `${emailVal} (Hacé click para copiar)`;
    }
    if (quickPhone) {
        const phoneVal = selectedClient.phone ? selectedClient.phone : "Sin teléfono registrado";
        quickPhone.title = `${phoneVal} (Hacé click para copiar)`;
    }
    
    // Populate Payment Conditions select
    const condPagoSelect = document.getElementById("doc-cond-pago");
    if (condPagoSelect) {
        condPagoSelect.innerHTML = "";
        Object.entries(PAYMENT_CONDITIONS_MAP).forEach(([id, name]) => {
            const selected = Number(selectedClient.condVentaId) === Number(id) ? "selected" : "";
            condPagoSelect.innerHTML += `<option value="${id}" ${selected}>${name}</option>`;
        });
    }
    
    // Populate Transportistas select
    const metodoEnvioSelect = document.getElementById("doc-metodo-envio");
    if (metodoEnvioSelect) {
        metodoEnvioSelect.innerHTML = `<option value="">Seleccione un método de envío...</option>`;
        Object.entries(TRANSPORTISTAS_MAP).forEach(([id, name]) => {
            metodoEnvioSelect.innerHTML += `<option value="${id}">${name}</option>`;
        });
    }
}

function copyClientEmailToClipboard() {
    if (!selectedClient || !selectedClient.mail) return;
    const emailVal = selectedClient.mail && selectedClient.mail !== "Sin Email" ? selectedClient.mail : "";
    if (!emailVal) {
        showAppNotification("Sin Email", "El cliente no posee un email registrado en YiQi.", "warning");
        return;
    }
    navigator.clipboard.writeText(emailVal);
    showAppNotification("Copiado", `Email del cliente (${emailVal}) copiado al portapapeles.`, "success");
}
window.copyClientEmailToClipboard = copyClientEmailToClipboard;

function copyClientPhoneToClipboard() {
    if (!selectedClient || !selectedClient.phone) return;
    const phoneVal = selectedClient.phone || "";
    if (!phoneVal) {
        showAppNotification("Sin Teléfono", "El cliente no posee un teléfono registrado en YiQi.", "warning");
        return;
    }
    navigator.clipboard.writeText(phoneVal);
    showAppNotification("Copiado", `Teléfono del cliente (${phoneVal}) copiado al portapapeles.`, "success");
}
window.copyClientPhoneToClipboard = copyClientPhoneToClipboard;

// --- APP HELPERS / UTILITIES ---
function formatCurrency(val) {
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS"
    }).format(val);
}

function formatArgentinianNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return "0,00";
    return new Intl.NumberFormat("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(num);
}

function parseArgentinianNumber(str) {
    if (!str) return 0;
    let clean = String(str).trim();
    if (!clean) return 0;
    
    if (clean.includes(",") && clean.includes(".")) {
        const firstComma = clean.indexOf(",");
        const firstDot = clean.indexOf(".");
        if (firstDot < firstComma) {
            clean = clean.replace(/\./g, "").replace(/,/g, ".");
        } else {
            clean = clean.replace(/,/g, "");
        }
    } else if (clean.includes(",")) {
        clean = clean.replace(/,/g, ".");
    }
    
    const parsed = parseFloat(clean);
    return isNaN(parsed) ? 0 : parsed;
}

// Cache all branch records (Entity 889) paginated in background
async function loadSucursalesCache() {
    try {
        console.log("Starting branch caching...");
        const firstRes = await apiCall(`${CONFIG.GETLIST_BASE}?entityId=889&schemaId=${CONFIG.SCHEMA_ID}&smartieId=2707`, "POST", { page: 1, pageSize: 50 });
        if (!firstRes || !firstRes.data) return;
        const total = firstRes.total || 0;
        let allRows = firstRes.data || [];
        const totalPages = Math.ceil(total / 50);
        
        const promises = [];
        for (let p = 2; p <= totalPages; p++) {
            promises.push(apiCall(`${CONFIG.GETLIST_BASE}?entityId=889&schemaId=${CONFIG.SCHEMA_ID}&smartieId=2707`, "POST", { page: p, pageSize: 50 }));
        }
        const results = await Promise.all(promises);
        results.forEach(res => {
            if (res && res.data) {
                allRows = allRows.concat(res.data);
            }
        });
        sucursalesCache = allRows;
        console.log(`Cached ${sucursalesCache.length} sucursales successfully.`);
    } catch (err) {
        console.error("Error loading sucursales cache:", err);
    }
}

// Sanitiza y limpia el número de teléfono para la API de WhatsApp
function cleanPhoneNumber(phone) {
    if (!phone) return "";
    let cleaned = String(phone).replace(/[^\d]/g, "");
    
    if (cleaned.startsWith("0")) {
        cleaned = cleaned.substring(1);
    }
    
    if (cleaned.length === 10 && !cleaned.startsWith("54")) {
        cleaned = "549" + cleaned;
    }
    
    if (cleaned.startsWith("54") && !cleaned.startsWith("549") && cleaned.length === 12) {
        cleaned = "549" + cleaned.substring(2);
    }
    
    return cleaned;
}

function updateSyncIndicator(online, text) {
    const dot = document.getElementById("sync-indicator");
    const label = document.getElementById("sync-text");
    if (dot && label) {
        dot.className = `sync-indicator ${online ? 'online' : 'offline'}`;
        label.textContent = text;
    }
}

// Global loaders
function showLoader(text = "Cargando...") {
    document.getElementById("loader-text").textContent = text;
    document.getElementById("app-loader").style.display = "flex";
}

function hideLoader() {
    document.getElementById("app-loader").style.display = "none";
}

// Custom alert component
function showAppNotification(title, message, type = "success") {
    const colorMap = {
        success: "--success",
        warning: "--warning",
        danger: "--danger"
    };
    
    const banner = document.createElement("div");
    banner.style.position = "fixed";
    banner.style.bottom = "20px";
    banner.style.right = "20px";
    banner.style.zIndex = "2000";
    banner.style.background = "var(--bg-card)";
    banner.style.border = `1px solid var(${colorMap[type]})`;
    banner.style.borderLeft = `5px solid var(${colorMap[type]})`;
    banner.style.padding = "12px 18px";
    banner.style.borderRadius = "8px";
    banner.style.boxShadow = "var(--shadow-lg)";
    banner.style.width = "300px";
    banner.style.animation = "slideUp 0.3s ease-out";
    
    banner.innerHTML = `
        <div style="font-weight: 700; font-size: 0.9rem; margin-bottom: 4px; display: flex; justify-content: space-between; align-items: center;">
            <span>${title}</span>
            <span style="cursor: pointer; opacity: 0.6; font-size: 0.8rem;" onclick="this.parentElement.parentElement.remove()">✕</span>
        </div>
        <div style="font-size: 0.8rem; color: var(--text-secondary); line-height: 1.3;">${message}</div>
    `;
    
    document.body.appendChild(banner);
    
    // Auto-remove after 4 seconds
    setTimeout(() => {
        if (document.body.contains(banner)) {
            banner.style.animation = "fadeIn 0.3s reverse";
            setTimeout(() => banner.remove(), 300);
        }
    }, 4000);
}

// Dialog Modal popup helper
function showModal({ title, content, actions, wide }) {
    const overlay = document.getElementById("app-modal");
    const mTitle = document.getElementById("modal-title");
    const mContent = document.getElementById("modal-content");
    const mActions = document.getElementById("modal-actions");
    
    const mCard = overlay.querySelector(".modal-card");
    if (mCard) {
        if (wide) {
            mCard.classList.add("modal-card-wide");
        } else {
            mCard.classList.remove("modal-card-wide");
        }
    }
    
    mTitle.innerHTML = title || "Aviso";
    mContent.innerHTML = content || "";
    mActions.innerHTML = "";
    
    actions.forEach(btn => {
        const b = document.createElement("button");
        b.className = `btn ${btn.class || 'btn-secondary'}`;
        b.textContent = btn.text;
        b.onclick = () => {
            if (btn.onClick) btn.onClick();
            if (btn.close !== false) closeModal();
        };
        mActions.appendChild(b);
    });
    
    overlay.style.display = "flex";
}

function closeModal() {
    document.getElementById("app-modal").style.display = "none";
}


// --- THEME MANAGEMENT (DAY / NIGHT) ---
function initTheme() {
    const savedTheme = localStorage.getItem("tmc_theme") || "light";
    const body = document.body;
    const toggleBtn = document.getElementById("btn-theme-toggle");
    
    if (savedTheme === "dark") {
        body.classList.add("dark-mode");
        if (toggleBtn) toggleBtn.textContent = "🌙";
    } else {
        body.classList.remove("dark-mode");
        if (toggleBtn) toggleBtn.textContent = "☀️";
    }
}

function toggleTheme() {
    const body = document.body;
    const toggleBtn = document.getElementById("btn-theme-toggle");
    
    if (body.classList.contains("dark-mode")) {
        body.classList.remove("dark-mode");
        if (toggleBtn) toggleBtn.textContent = "☀️";
        localStorage.setItem("tmc_theme", "light");
        showAppNotification("Tema", "Modo Día (Claro) activado.", "success");
    } else {
        body.classList.add("dark-mode");
        if (toggleBtn) toggleBtn.textContent = "🌙";
        localStorage.setItem("tmc_theme", "dark");
        showAppNotification("Tema", "Modo Noche (Oscuro) activado.", "success");
    }
}

// --- CATALOG CONFIGURATION MODAL (COLUMNS & FILTERS) ---
function showCatalogConfigModal() {
    if (articlesCache.length === 0) {
        showAppNotification("Catálogo vacío", "Sincronice el catálogo de artículos primero antes de configurar filtros.", "warning");
        return;
    }
    
    // Obtenemos colecciones únicas incluyendo "(Vacío)" si corresponde
    let uniqueCollections = [...new Set(articlesCache.map(item => item.COLE_DESCRIPCION || "(Vacío)"))].sort();
    if (uniqueCollections.includes("(Vacío)")) {
        uniqueCollections = ["(Vacío)", ...uniqueCollections.filter(c => c !== "(Vacío)")];
    }
    
    const groupMap = {};
    let hasEmptyGroup = false;
    articlesCache.forEach(item => {
        const groupId = parseInt(item.MATE_GRUPO_IDEN);
        if (groupId && item.GRMA_DESCRIPCION) {
            groupMap[groupId] = item.GRMA_DESCRIPCION;
        } else {
            hasEmptyGroup = true;
        }
    });
    
    let uniqueGroups = Object.entries(groupMap).map(([id, desc]) => ({ id: parseInt(id), desc })).sort((a, b) => a.desc.localeCompare(b.desc));
    if (hasEmptyGroup) {
        uniqueGroups = [{ id: 0, desc: "(Vacío)" }, ...uniqueGroups];
    }
    
    let columnsHtml = "";
    const columnLabels = {
        sku: "SKU",
        desc: "Descripción",
        stock: "Stock Disponible",
        grupo: "Grupo",
        subgrupo1: "1° Subgrupo",
        subgrupo2: "2° Subgrupo",
        pbase: "Precio Base",
        pneto: "Precio Neto",
        pfinal: "Precio Final"
    };
    
    catalogConfig.columnOrder.forEach((colId, index) => {
        const checked = catalogConfig.visibleColumns[colId] ? "checked" : "";
        const label = columnLabels[colId] || colId;
        
        columnsHtml += `
            <div class="drag-column-box" draggable="true" data-id="${colId}">
                <div class="drag-handle">☰</div>
                <label class="config-checkbox-item">
                    <input type="checkbox" id="col-toggle-${colId}" ${checked}>
                    <span>${label}</span>
                </label>
            </div>
        `;
    });
    
    let collectionsHtml = "";
    uniqueCollections.forEach(col => {
        const checked = catalogConfig.filterCollections.includes(col) ? "checked" : "";
        collectionsHtml += `
            <label class="config-checkbox-item">
                <input type="checkbox" name="filter-collection" value="${col}" ${checked}>
                <span>${col}</span>
            </label>
        `;
    });
    
    let groupsHtml = "";
    uniqueGroups.forEach(grp => {
        const checked = !catalogConfig.excludeGroups.includes(grp.id) ? "checked" : "";
        groupsHtml += `
            <label class="config-checkbox-item" title="ID: ${grp.id}">
                <input type="checkbox" name="filter-group" value="${grp.id}" ${checked}>
                <span>${grp.desc}</span>
            </label>
        `;
    });
    
    const contentHtml = `
        <div class="config-container">
            <p style="font-size: 0.8rem; color: var(--text-secondary); margin-bottom: 8px; line-height: 1.4;">
                Arrastre las cajas de las columnas hacia los lados para reordenarlas. Use los checkboxes para mostrarlas u ocultarlas y configurar los filtros correspondientes.
            </p>
            
            <div class="config-section">
                <div class="config-section-title">📺 Columnas Visibles (Arrastrar para Reordenar)</div>
                <div class="columns-drag-container">
                    ${columnsHtml}
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">📂 Colecciones a Mostrar</div>
                <div class="config-grid-layout cols-4">
                    ${collectionsHtml}
                </div>
            </div>
            
            <div class="config-section">
                <div class="config-section-title">🏷️ Grupos Habilitados</div>
                <div class="config-grid-layout cols-4">
                    ${groupsHtml}
                </div>
            </div>
        </div>
    `;
    
    showModal({
        title: "⚙️ Configuración del Catálogo",
        content: contentHtml,
        wide: true,
        actions: [
            { text: "Guardar Filtros", class: "btn-primary", onClick: () => saveCatalogConfig() },
            { text: "Cancelar", class: "btn-secondary", close: true }
        ]
    });
    
    // Bind Drag & Drop event listeners
    setupDragAndDrop();
}

let dragSrcEl = null;

function handleDragStart(e) {
    this.style.opacity = '0.4';
    dragSrcEl = this;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/html', this.innerHTML);
}

function handleDragOver(e) {
    if (e.preventDefault) {
        e.preventDefault();
    }
    e.dataTransfer.dropEffect = 'move';
    return false;
}

function handleDragEnter(e) {
    this.classList.add('drag-over');
}

function handleDragLeave(e) {
    this.classList.remove('drag-over');
}

function handleDrop(e) {
    if (e.stopPropagation) {
        e.stopPropagation();
    }
    
    if (dragSrcEl !== this) {
        // Scrape currently checked checkboxes in the DOM before we swap and rebuild HTML
        scrapeCatalogConfigFromDOM();
        
        const srcId = dragSrcEl.getAttribute('data-id');
        const targetId = this.getAttribute('data-id');
        
        const srcIdx = catalogConfig.columnOrder.indexOf(srcId);
        const targetIdx = catalogConfig.columnOrder.indexOf(targetId);
        
        if (srcIdx !== -1 && targetIdx !== -1) {
            // Swap in columnOrder array
            catalogConfig.columnOrder.splice(srcIdx, 1);
            catalogConfig.columnOrder.splice(targetIdx, 0, srcId);
            
            // Rebuild modal view
            showCatalogConfigModal();
        }
    }
    return false;
}

function handleDragEnd(e) {
    this.style.opacity = '1';
    const items = document.querySelectorAll('.drag-column-box');
    items.forEach(function (item) {
        item.classList.remove('drag-over');
    });
}

function setupDragAndDrop() {
    const items = document.querySelectorAll('.drag-column-box');
    items.forEach(item => {
        item.addEventListener('dragstart', handleDragStart, false);
        item.addEventListener('dragenter', handleDragEnter, false);
        item.addEventListener('dragover', handleDragOver, false);
        item.addEventListener('dragleave', handleDragLeave, false);
        item.addEventListener('drop', handleDrop, false);
        item.addEventListener('dragend', handleDragEnd, false);
    });
}

function scrapeCatalogConfigFromDOM() {
    const columnIds = ["sku", "desc", "stock", "grupo", "subgrupo1", "subgrupo2", "pbase", "pneto", "pfinal"];
    columnIds.forEach(id => {
        const chk = document.getElementById(`col-toggle-${id}`);
        if (chk) {
            catalogConfig.visibleColumns[id] = chk.checked;
        }
    });
    
    const collChecks = document.querySelectorAll('input[name="filter-collection"]:checked');
    catalogConfig.filterCollections = Array.from(collChecks).map(el => el.value);
    
    const allGroupChecks = document.querySelectorAll('input[name="filter-group"]');
    const excluded = [];
    allGroupChecks.forEach(el => {
        if (!el.checked) {
            excluded.push(parseInt(el.value));
        }
    });
    catalogConfig.excludeGroups = excluded;
}

function saveCatalogConfig() {
    scrapeCatalogConfigFromDOM();
    
    localStorage.setItem("tmc_catalog_config", JSON.stringify(catalogConfig));
    
    renderArticlesList();
    showAppNotification("Filtros Aplicados", "Se guardó tu configuración personalizada del catálogo.", "success");
}

// --- DYNAMIC EXPAND/COLLAPSE PANELS ---
function toggleExpandPanel(panelName) {
    const grid = document.querySelector(".columns-grid");
    if (!grid) return;
    
    const articlesBtn = document.getElementById("btn-expand-articles");
    const cartBtn = document.getElementById("btn-expand-cart");
    
    if (panelName === 'articles') {
        if (grid.classList.contains("articles-expanded")) {
            grid.classList.remove("articles-expanded");
            if (articlesBtn) {
                articlesBtn.textContent = "⤢";
                articlesBtn.title = "Expandir Panel";
            }
        } else {
            grid.classList.remove("cart-expanded");
            grid.classList.add("articles-expanded");
            if (articlesBtn) {
                articlesBtn.textContent = "⤡";
                articlesBtn.title = "Comprimir Panel";
            }
            if (cartBtn) {
                cartBtn.textContent = "⤢";
                cartBtn.title = "Expandir Panel";
            }
        }
    } else if (panelName === 'cart') {
        if (grid.classList.contains("cart-expanded")) {
            grid.classList.remove("cart-expanded");
            if (cartBtn) {
                cartBtn.textContent = "⤢";
                cartBtn.title = "Expandir Panel";
            }
        } else {
            grid.classList.remove("articles-expanded");
            grid.classList.add("cart-expanded");
            if (cartBtn) {
                cartBtn.textContent = "⤡";
                cartBtn.title = "Comprimir Panel";
            }
            if (articlesBtn) {
                articlesBtn.textContent = "⤢";
                articlesBtn.title = "Expandir Panel";
            }
        }
    }
}

// ==========================================================================
// --- CRM ROUTING & PLAN MANAGEMENT SYSTEM ---
// ==========================================================================

function switchView(viewId) {
    // Hide all views
    document.getElementById("view-crm-general").style.display = "none";
    document.getElementById("view-client-crm").style.display = "none";
    document.getElementById("view-commercial-creator").style.display = "none";
    
    // Show the target view
    const target = document.getElementById(`view-${viewId}`);
    if (target) {
        target.style.display = "flex";
    }
    
    // Manage header home button visibility
    const homeBtn = document.getElementById("btn-nav-home");
    if (homeBtn) {
        if (viewId === "crm-general") {
            homeBtn.style.display = "none";
        } else {
            homeBtn.style.display = "inline-block";
        }
    }
}

function goToHomeCrm() {
    switchView("crm-general");
    renderCrmAlerts();
    
    // Re-render the active dashboard tab to ensure up-to-date data and handle search visibility
    const activeTabBtn = document.querySelector(".crm-dashboard-tab-btn.btn-primary");
    const heroSearch = document.querySelector(".crm-hero-search");
    if (heroSearch) {
        if (activeTabBtn && activeTabBtn.id === "tab-btn-alertas") {
            heroSearch.style.display = "block";
        } else {
            heroSearch.style.display = "none";
        }
    }
    
    if (activeTabBtn) {
        if (activeTabBtn.id === "tab-btn-tablero") {
            const activeSubtabBtn = document.querySelector(".tablero-subtab-btn.btn-primary");
            const activeSubtab = activeSubtabBtn 
                ? activeSubtabBtn.id.replace("tablero-subtab-btn-", "") 
                : "seguimientos";
            if (window.switchTableroSubtab) {
                window.switchTableroSubtab(activeSubtab);
            } else {
                renderCrmControlBoard();
            }
        } else if (activeTabBtn.id === "tab-btn-estadisticas") {
            renderCrmStatsChart();
        } else if (activeTabBtn.id === "tab-btn-configuracion") {
            renderCrmPlanConfig();
        }
    }
}

function cancelCommercialCreator() {
    switchView("client-crm");
    renderAllCrmSections();
}

function startNewQuote() {
    if (!selectedClient) {
        showAppNotification("Error", "Debe seleccionar un cliente primero.", "danger");
        return;
    }
    resetCart();
    switchView("commercial-creator");
    renderArticlesList();
}

// Helpers for CUIT normalization and client matching
function normalizeCuit(cuit) {
    if (!cuit) return "";
    return String(cuit).replace(/\D/g, "");
}

function isClientMatch(erpRow, clientObj) {
    if (!clientObj) return false;
    const clientCuit = normalizeCuit(clientObj.cuit);
    const erpCuit = normalizeCuit(erpRow.CLIE_CUIT);
    
    if (clientCuit && erpCuit) {
        return clientCuit === erpCuit;
    }
    
    const clientName = String(clientObj.name || "").trim().toLowerCase();
    const erpName = String(erpRow.CLIE_RAZON_SOCIAL || erpRow.CLIE_NOMBRE || "").trim().toLowerCase();
    return clientName === erpName && clientName.length > 0;
}

// LocalStorage helpers
function getCrmFollowups() {
    const data = localStorage.getItem("tmc_crm_followups");
    if (!data) return [];
    try {
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Error parsing CRM followups:", e);
        return [];
    }
}



function saveCrmFollowups(followups, changedFollowup = null) {
    localStorage.setItem("tmc_crm_followups", JSON.stringify(followups));
    if (changedFollowup) {
        saveCrmDataOnBackend("saveFollowup", changedFollowup);
    }
}

// Migration: fetch official quote display numbers for old CRM followups missing it
async function migrateOldQuoteNumbers() {
    const followups = getCrmFollowups();
    let updated = false;
    for (let f of followups) {
        if (f.docType === "COTIZACION" && (!f.docDisplayNum || f.docDisplayNum === String(f.docId))) {
            console.log(`Migrating display number for old quote followup: ${f.docId}`);
            const officialNum = await getQuoteDisplayNumber(f.docId);
            if (officialNum && officialNum !== String(f.docId)) {
                f.docDisplayNum = officialNum;
                updated = true;
                console.log(`Successfully migrated quote ${f.docId} to display number ${officialNum}`);
            }
        }
    }
    if (updated) {
        saveCrmFollowups(followups);
        followups.forEach(f => {
            if (f.docType === "COTIZACION" && f.docDisplayNum && f.docDisplayNum !== String(f.docId)) {
                saveCrmDataOnBackend("saveFollowup", f);
            }
        });
        if (selectedClient) {
            renderAllCrmSections();
        }
        renderCrmAlerts();
    }
}

// Real-time synchronization of client followups status with YiQi ERP
async function syncClientFollowupsWithYiQi(clientId) {
    if (!selectedClient || String(selectedClient.id) !== String(clientId)) {
        console.log(`syncClientFollowupsWithYiQi: client ID mismatch (current: ${selectedClient?.id}, requested: ${clientId}). Skipping.`);
        return;
    }

    try {
        // Fetch active quote list from YiQi ERP in one single request
        const listUrl = `${CONFIG.GETLIST_BASE}?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&smartieId=2769`;
        const queryBody = {
            page: 1,
            pageSize: 200 // Plenty of room for the system's quotes
        };
        const listRes = await apiCall(listUrl, "POST", queryBody);
        const rows = listRes.data || listRes.rows || listRes.instances || [];
        
        // Build map of ERP quotes by ID (string key)
        const erpQuotesMap = new Map();
        rows.forEach(r => {
            if (r.ID || r.id) {
                erpQuotesMap.set(String(r.ID || r.id), r);
            }
        });
        
        const followups = getCrmFollowups();
        let updated = false;
        let followupsToKeep = [];
        let followupsToSync = [];
        
        // Step 1: Validate/update existing followups
        for (let f of followups) {
            if (f.clientId === clientId && f.docType === "COTIZACION" && f.docId) {
                if (f.status === "VERSIONADO") {
                    followupsToKeep.push(f);
                    continue;
                }
                const docIdStr = String(f.docId);
                
                // If it doesn't exist in YiQi ERP at all
                if (!erpQuotesMap.has(docIdStr)) {
                    const ageMs = Date.now() - new Date(f.dateCreated || Date.now()).getTime();
                    if (ageMs > 30 * 1000) {
                        console.log(`Removing ghost quote followup ${f.docId} because it does not exist in YiQi ERP`);
                        updated = true;
                        // Delete from Firestore
                        saveCrmDataOnBackend("deleteFollowup", { id: f.id });
                        continue; // Exclude from followupsToKeep
                    }
                } else {
                    // It exists in YiQi ERP. Check if CUIT or name matches!
                    const erpQuote = erpQuotesMap.get(docIdStr);
                    
                    if (!isClientMatch(erpQuote, selectedClient)) {
                        console.log(`Removing mismatched quote followup ${f.docId} because it does not match current client`);
                        updated = true;
                        // Delete from Firestore
                        saveCrmDataOnBackend("deleteFollowup", { id: f.id });
                        continue; // Exclude from followupsToKeep
                    }
                    
                    // It exists and matches! Update state/display number
                    const stateName = erpQuote.DESC_ESTADO;
                    const officialNum = erpQuote.COCO_NRO_COTIZACION;
                    const orderNum = erpQuote.PEDI_NUMERO;
                    
                    if (f.erpState !== stateName) {
                        f.erpState = stateName;
                        updated = true;
                        if (!followupsToSync.includes(f)) followupsToSync.push(f);
                    }
                    
                    if (officialNum && f.docDisplayNum !== officialNum) {
                        f.docDisplayNum = officialNum;
                        updated = true;
                        if (!followupsToSync.includes(f)) followupsToSync.push(f);
                    }
                    
                    if (orderNum && f.pedidoNum !== orderNum) {
                        f.pedidoNum = orderNum;
                        updated = true;
                        if (!followupsToSync.includes(f)) followupsToSync.push(f);
                        console.log(`Synced order number ${orderNum} for quote ${f.docId}`);
                    }
                    
                    if (stateName === "Aprobada" && f.status !== "GANADO") {
                        f.status = "GANADO";
                        f.closeDate = new Date().toISOString();
                        updated = true;
                        if (!followupsToSync.includes(f)) followupsToSync.push(f);
                        console.log(`Synced quote ${f.docId}: state is Aprobada -> GANADO`);
                    } else if (stateName === "Rechazada" && f.status !== "PERDIDO") {
                        f.status = "PERDIDO";
                        f.closeDate = new Date().toISOString();
                        updated = true;
                        if (!followupsToSync.includes(f)) followupsToSync.push(f);
                        console.log(`Synced quote ${f.docId}: state is Rechazada -> PERDIDO`);
                    } else if (stateName === "Enviada" && f.status !== "ABIERTO") {
                        f.status = "ABIERTO";
                        f.closeDate = null;
                        updated = true;
                        if (!followupsToSync.includes(f)) followupsToSync.push(f);
                        console.log(`Synced quote ${f.docId}: state is Enviada -> ABIERTO`);
                    } else if ((stateName === "En preparación" || stateName === "En validación") && f.status !== "PREPARACION") {
                        f.status = "PREPARACION";
                        f.closeDate = null;
                        updated = true;
                        if (!followupsToSync.includes(f)) followupsToSync.push(f);
                        console.log(`Synced quote ${f.docId}: state is ${stateName} -> PREPARACION`);
                    }
                }
            }
            followupsToKeep.push(f);
        }
        
        // Step 2: Auto-import missing quotes from ERP
        const clientErpQuotes = rows.filter(r => isClientMatch(r, selectedClient));
        let importCount = 0;
        
        for (let eq of clientErpQuotes) {
            const eqIdStr = String(eq.ID || eq.id);
            const exists = followupsToKeep.some(f => f.clientId === clientId && f.docType === "COTIZACION" && String(f.docId) === eqIdStr);
            
            if (!exists && importCount < 5) { // Limit to 5 imports per sync loop for safety
                console.log(`Auto-importing quote ${eqIdStr} from YiQi ERP...`);
                try {
                    const instUrl = `${CONFIG.GETINSTANCE_BASE}?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&id=${eqIdStr}`;
                    const instRes = await apiCall(instUrl, "GET");
                    const instData = instRes.data || instRes;
                    
                    if (instData && instData.atts) {
                        const total = parseFloat(instData.atts["5178"]?.value || instData.atts["5180"]?.value || 0);
                        const dateCreated = instData.atts["AUDI_FECHA_ALTA"]?.value || eq.AUDI_FECHA_ALTA || new Date().toISOString();
                        
                        const newF = createCrmFollowupObject(clientId, selectedClient.name, eqIdStr, "COTIZACION", total, eq.COCO_NRO_COTIZACION, dateCreated);
                        
                        // Sychronize its initial status from the ERP row
                        const stateName = eq.DESC_ESTADO;
                        newF.erpState = stateName;
                        if (stateName === "Aprobada") {
                            newF.status = "GANADO";
                            newF.closeDate = new Date().toISOString();
                        } else if (stateName === "Rechazada") {
                            newF.status = "PERDIDO";
                            newF.closeDate = new Date().toISOString();
                        } else if (stateName === "Enviada") {
                            newF.status = "ABIERTO";
                        } else if (stateName === "En preparación" || stateName === "En validación") {
                            newF.status = "PREPARACION";
                        }
                        
                        if (eq.PEDI_NUMERO) {
                            newF.pedidoNum = eq.PEDI_NUMERO;
                        }
                        
                        followupsToKeep.unshift(newF);
                        updated = true;
                        importCount++;
                        
                        // Save this specific imported followup to Firestore
                        saveCrmDataOnBackend("saveFollowup", newF);
                    }
                } catch (importErr) {
                    console.error(`Failed to auto-import quote ${eqIdStr}:`, importErr);
                }
            }
        }
        
        if (updated) {
            localStorage.setItem("tmc_crm_followups", JSON.stringify(followupsToKeep));
            
            // Sync updated existing followups to Firestore
            followupsToSync.forEach(f => {
                saveCrmDataOnBackend("saveFollowup", f);
            });
            
            if (selectedClient && selectedClient.id === clientId) {
                renderAllCrmSections();
            }
            renderCrmAlerts();
        }
    } catch (e) {
        console.error("Could not sync client followups with YiQi:", e);
    }
}

// Calculate due dates helper supporting minutes, hours, and days
function calculateDueDate(startDate, offsetVal, offsetUnit) {
    const result = new Date(startDate);
    if (offsetUnit === "minutos") {
        result.setMinutes(result.getMinutes() + offsetVal);
        return result.toISOString();
    } else if (offsetUnit === "horas") {
        result.setHours(result.getHours() + offsetVal);
        return result.toISOString();
    } else {
        result.setDate(result.getDate() + offsetVal);
        return result.toISOString().split('T')[0];
    }
}

// Format due date label to show date and time when necessary
function formatStepDueDate(dueDateStr) {
    if (!dueDateStr) return "N/A";
    const d = dueDateStr.includes("T") ? new Date(dueDateStr) : new Date(dueDateStr + "T00:00:00");
    if (dueDateStr.includes("T")) {
        return d.toLocaleString("es-AR", { dateStyle: 'short', timeStyle: 'short' });
    }
    return d.toLocaleDateString("es-AR");
}

// Calculate due dates helper
function addDays(date, days) {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function formatDateISO(date) {
    return date.toISOString().split('T')[0];
}

// Helper to generate a followup object in memory (without saving immediately)
function createCrmFollowupObject(clientId, clientName, docId, docType, docTotal, docDisplayNum, dateCreated = null) {
    // Find assigned plan template
    const clientPlans = JSON.parse(localStorage.getItem("tmc_client_plans") || "{}");
    const assignedTemplateId = clientPlans[clientId] || "standard";
    const templates = getPlanTemplates();
    let selectedTemplate = templates.find(t => t.id === assignedTemplateId);
    if (!selectedTemplate) {
        selectedTemplate = templates.find(t => t.id === "standard") || templates[0];
    }
    
    const now = dateCreated ? new Date(dateCreated) : new Date();
    let currentDue = new Date(now);
    
    const steps = selectedTemplate.steps.map(step => {
        const offsetVal = step.offsetVal !== undefined ? step.offsetVal : (step.days || 3);
        const offsetUnit = step.offsetUnit || "días";
        
        // Calculate cumulative due dates at creation
        if (offsetUnit === "minutos") {
            currentDue.setMinutes(currentDue.getMinutes() + offsetVal);
        } else if (offsetUnit === "horas") {
            currentDue.setHours(currentDue.getHours() + offsetVal);
        } else {
            currentDue.setDate(currentDue.getDate() + offsetVal);
        }
        
        const dueDate = offsetUnit === "días" ? currentDue.toISOString().split('T')[0] : currentDue.toISOString();
        
        return {
            title: step.title,
            days: step.days || offsetVal,
            offsetVal: offsetVal,
            offsetUnit: offsetUnit,
            dueDate: dueDate,
            completed: false,
            completedDate: null,
            notes: "",
            delayDays: undefined,
            message: step.message || ""
        };
    });
    
    return {
        id: docId || `f_${Date.now()}`,
        clientId: clientId,
        clientName: clientName,
        docId: docId,
        docDisplayNum: docDisplayNum || String(docId),
        docType: docType,
        docTotal: docTotal,
        dateCreated: now.toISOString(),
        status: "ABIERTO",
        currentStep: 0,
        steps: steps
    };
}

// Generate new follow-up plan
function createCrmFollowup(clientId, clientName, docId, docType, docTotal, docDisplayNum, initialStatus = "ABIERTO") {
    const followups = getCrmFollowups();
    const newFollowup = createCrmFollowupObject(clientId, clientName, docId, docType, docTotal, docDisplayNum);
    newFollowup.status = initialStatus;
    if (initialStatus === "PREPARACION") {
        newFollowup.erpState = "En preparación";
    }
    followups.unshift(newFollowup);
    saveCrmFollowups(followups, newFollowup);
    console.log("Created CRM followup:", newFollowup);
    return newFollowup;
}

// Collapsible active plans helpers
function togglePlanDetails(planId, docId, docType) {
    const el = document.getElementById(`plan-details-${planId}`);
    const arrow = document.getElementById(`plan-arrow-${planId}`);
    if (!el) return;
    
    const isCollapsed = el.style.display === "none";
    el.style.display = isCollapsed ? "flex" : "none";
    if (arrow) {
        arrow.style.transform = isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
    }
    
    if (isCollapsed) {
        loadCrmPlanItems(planId, docId, docType);
    }
}

async function loadCrmPlanItems(planId, docId, docType, isHistory = false) {
    const containerId = isHistory ? `history-items-${planId}` : `plan-items-${planId}`;
    const container = document.getElementById(containerId);
    if (!container) return;
    
    if (container.dataset.loaded === "true") return;
    
    container.innerHTML = `
        <div style="text-align: center; padding: 12px;">
            <div class="loader-spinner" style="margin: 0 auto 8px auto; width: 20px; height: 20px; border-width: 2px;"></div>
            <p class="text-secondary" style="font-size: 0.75rem;">Cargando artículos y cabecera de YiQi ERP...</p>
        </div>
    `;
    
    try {
        const isQuote = docType === "COTIZACION";
        const entityId = isQuote ? CONFIG.ENTITY_COTIZACION : CONFIG.ENTITY_PEDIDOS;
        const childId = isQuote ? CONFIG.CHILD_COTIZACION_ITEMS : CONFIG.CHILD_PEDIDO_ITEMS;
        
        // Fetch child lines
        const url = `https://api.yiqi.com.ar/api/childrenApi/GetChildList?entityId=${entityId}&schemaId=${CONFIG.SCHEMA_ID}&childId=${childId}&instanceId=${docId}`;
        const res = await apiCall(url, "GET");
        const rows = res.data || res.rows || res.instances || [];
        
        // Fetch instance header details
        const instanceUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?entityId=${entityId}&schemaId=${CONFIG.SCHEMA_ID}&id=${docId}`;
        const instanceRes = await apiCall(instanceUrl, "GET");
        
        let headerHtml = "";
        let totalsHtml = "";
        
        if (instanceRes && instanceRes.atts) {
            let vendedor = "No especificado";
            let sucursal = "No especificada";
            let condVenta = "No especificada";
            let neto = "$0,00";
            let descuento = "$0,00";
            let iva = "$0,00";
            let totalDoc = "$0,00";
            
            const atts = instanceRes.atts;
            const fkTexts = instanceRes.attsFkTexts || {};
            
            let calculatedNeto = 0.0;
            let calculatedIva = 0.0;
            
            rows.forEach(item => {
                if (isQuote) {
                    const qty = parseFloat(item.DECO_CANTIDAD || item.CANTIDAD || 0);
                    const price = parseFloat(item.DECO_PRECIO_UNITARIO || item.PRECIO_UNITARIO || 0);
                    const lineNet = parseFloat(item.DECO_NETO || item.DECO_SUBTOTAL || (qty * price));
                    calculatedNeto += lineNet;
                    
                    let vatPct = 0.0;
                    const alicName = item.ALIV_NOMBRE || "";
                    if (alicName.includes("21")) {
                        vatPct = 21.0;
                    } else if (alicName.includes("10.5") || alicName.includes("10,5")) {
                        vatPct = 10.5;
                    } else if (alicName.includes("27")) {
                        vatPct = 27.0;
                    }
                    
                    const discPct = parseFloat(atts["11909"]?.value || 0);
                    const lineNetAfterGlobal = lineNet * (1 - (discPct / 100));
                    calculatedIva += lineNetAfterGlobal * (vatPct / 100);
                } else {
                    const lineNet = parseFloat(item.DEDP_NETO || 0);
                    calculatedNeto += lineNet;
                    calculatedIva += parseFloat(item.DEDP_IVA || 0);
                }
            });
            
            const discPct = isQuote ? parseFloat(atts["11909"]?.value || 0) : parseFloat(atts["12188"]?.value || 0);
            
            let transportista = "No especificado";
            if (isQuote) {
                vendedor = fkTexts["7077"] || "No especificado";
                sucursal = fkTexts["7628"] || fkTexts["11908"] || atts["11908"]?.value || "No especificada";
                condVenta = fkTexts["10349"] || "No especificada";
                
                const trloValue = atts["11372"]?.value;
                transportista = fkTexts["11372"] || TRANSPORTISTAS_MAP[String(trloValue)] || trloValue || "No especificado";
                
                const discountAmount = calculatedNeto * (discPct / 100);
                const calculatedTotal = (calculatedNeto - discountAmount) + calculatedIva;
                
                neto = formatCurrency(calculatedNeto);
                descuento = `${discPct}%`;
                iva = formatCurrency(calculatedIva);
                totalDoc = formatCurrency(calculatedTotal);
            } else {
                vendedor = fkTexts["12204"] || atts["9300"]?.value || "No especificado";
                sucursal = fkTexts["12354"] || atts["12354"]?.value || "No especificada";
                condVenta = fkTexts["12355"] || atts["12355"]?.value || "No especificada";
                
                const discountAmount = parseFloat(atts["12188"]?.value || 0);
                const calculatedTotal = (calculatedNeto - discountAmount) + calculatedIva;
                
                neto = formatCurrency(calculatedNeto);
                descuento = formatCurrency(Math.abs(discountAmount));
                iva = formatCurrency(calculatedIva);
                totalDoc = formatCurrency(calculatedTotal);
            }
            
            headerHtml = `
                <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; margin-bottom: 12px; padding: 12px; background: var(--bg-card); border-radius: var(--radius-sm); border: 1px solid var(--border-color); font-size: 0.76rem; text-align: left; line-height: 1.4;">
                    <div><strong>Vendedor:</strong> <span style="color: var(--text-primary);">${vendedor}</span></div>
                    <div><strong>Sucursal / Entrega:</strong> <span style="color: var(--text-primary);">${sucursal}</span></div>
                    <div><strong>Condición de Venta:</strong> <span style="color: var(--text-primary);">${condVenta}</span></div>
                    ${isQuote ? `<div><strong>Método de Envío:</strong> <span style="color: var(--text-primary);">${transportista}</span></div>` : ""}
                </div>
            `;
            
            totalsHtml = `
                <div class="totals-card" style="margin-top: 12px; text-align: left;">
                    <div class="totals-row">
                        <span class="totals-label">Subtotal Neto</span>
                        <span class="totals-val">${neto}</span>
                    </div>
                    <div class="totals-row">
                        <span class="totals-label">Descuento Global</span>
                        <span class="totals-val text-discount">${descuento}</span>
                    </div>
                    <div class="totals-row">
                        <span class="totals-label">IVA Facturado</span>
                        <span class="totals-val">${iva}</span>
                    </div>
                    <div class="totals-row total-highlight">
                        <span class="totals-label">TOTAL GENERAL</span>
                        <span class="totals-val" style="color: var(--primary); font-size: 1.25rem;">${totalDoc}</span>
                    </div>
                </div>
            `;
        }
        
        // PDF download button for quote detail panel
        let pdfBtnHtml = "";
        if (isQuote) {
            const followups = getCrmFollowups();
            const plan = followups.find(f => String(f.id) === String(planId) || String(f.docId) === String(docId));
            const docDisplayNum = plan ? plan.docDisplayNum : String(docId);
            const pdfUrl = `https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportId=137&instanceId=${docId}&schemaId=${CONFIG.SCHEMA_ID}`;
            pdfBtnHtml = `
                <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                    <button class="btn btn-secondary" style="font-size: 0.76rem; padding: 6px 12px; border: 1px solid var(--border-color); background: var(--bg-card); display: inline-flex; align-items: center; gap: 6px;" onclick="window.open('${pdfUrl}', '_blank')">
                        📥 Descargar Cotización (PDF)
                    </button>
                    <span style="font-size: 0.82rem; font-weight: 700; color: var(--text-secondary); background: var(--bg-input); padding: 4px 10px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                        COTIZACIÓN N° ${docDisplayNum}
                    </span>
                </div>
            `;
        }
        
        if (rows.length === 0) {
            container.innerHTML = `
                ${pdfBtnHtml}
                ${headerHtml}
                <p class="text-secondary" style="font-size: 0.78rem; font-style: italic; margin-top: 6px; text-align: left;">Sin ítems registrados en el documento.</p>
                ${totalsHtml}
            `;
            container.dataset.loaded = "true";
            return;
        }
        
        let rowsHtml = "";
        rows.forEach(item => {
            const sku = item.MATE_CODIGO || item.CODIGO || "Sin Código";
            const name = item.DECO_NOMBRE_MATE || item.NOMBRE || item.DEDP_CONCEPTO || "Artículo";
            const qty = parseFloat(item.DECO_CANTIDAD || item.CANTIDAD || item.DEDP_CANTIDAD) || 0;
            const price = parseFloat(item.DECO_PRECIO_UNITARIO || item.PRECIO_UNITARIO || item.DEDP_PRECIO_UNITARIO) || 0;
            const net = parseFloat(item.DECO_NETO || item.DECO_SUBTOTAL || item.NETO || item.DEDP_NETO || (qty * price)) || 0;
            
            // Calculate individual discount percentage dynamically
            let dtoPct = 0;
            if (isQuote) {
                if (item.DECO_DTO_ADICIONAL !== undefined && item.DECO_DTO_ADICIONAL !== null) {
                    dtoPct = parseFloat(item.DECO_DTO_ADICIONAL);
                } else if (price > 0 && qty > 0) {
                    dtoPct = ((price * qty - net) / (price * qty)) * 100;
                }
            } else {
                if (item.DEDP_DTO_ADICIONAL !== undefined && item.DEDP_DTO_ADICIONAL !== null) {
                    dtoPct = parseFloat(item.DEDP_DTO_ADICIONAL);
                } else if (price > 0 && qty > 0) {
                    dtoPct = ((price * qty - net) / (price * qty)) * 100;
                }
            }
            if (isNaN(dtoPct) || dtoPct < 0) dtoPct = 0;
            if (dtoPct > 100) dtoPct = 100;
            
            const unitNetPrice = qty > 0 ? (net / qty) : (price * (1 - dtoPct / 100));
            const additionalText = item.DECO_TEXTO_ADICIONAL || item.DECO_TEXTO || "";
            
            rowsHtml += `
                <tr>
                    <td style="padding: 6px 8px; font-weight: 500; font-size: 0.75rem;"><span class="sku-code">${sku}</span></td>
                    <td style="padding: 6px 8px; font-size: 0.75rem; max-width: 220px; line-height: 1.25;">
                        <div style="font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${name}">${name}</div>
                        ${additionalText ? `<div style="font-size: 0.68rem; color: var(--text-muted); font-style: italic; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${additionalText}">${additionalText}</div>` : ''}
                    </td>
                    <td style="padding: 6px 8px; font-size: 0.75rem; text-align: center;">${qty}</td>
                    <td style="padding: 6px 8px; font-size: 0.75rem; text-align: right; font-family: var(--font-mono);">${formatCurrency(price)}</td>
                    <td style="padding: 6px 8px; font-size: 0.75rem; text-align: center; color: var(--warning); font-weight: 600;">${dtoPct.toFixed(1)}%</td>
                    <td style="padding: 6px 8px; font-size: 0.75rem; text-align: right; color: var(--text-secondary); font-family: var(--font-mono);">${formatCurrency(unitNetPrice)}</td>
                    <td style="padding: 6px 8px; font-size: 0.75rem; text-align: right; font-weight: 600; color: var(--primary); font-family: var(--font-mono);">${formatCurrency(net)}</td>
                </tr>
            `;
        });
        
        container.innerHTML = `
            <div style="margin-top: 0;">
                ${pdfBtnHtml}
                ${headerHtml}
                <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-input);">
                    <div style="font-weight: 700; font-size: 0.78rem; padding: 6px 10px; background: var(--bg-card); border-bottom: 1px solid var(--border-color); color: var(--text-secondary); text-align: left;">
                        📄 Artículos Detallados (YiQi ERP)
                    </div>
                    <div style="height: 260px; overflow-y: auto;">
                        <table style="width: 100%; border-collapse: collapse; font-size: 0.78rem;">
                            <thead style="position: sticky; top: 0; background: var(--bg-card); z-index: 1;">
                                <tr style="border-bottom: 1px solid var(--border-color); color: var(--text-muted);">
                                    <th style="padding: 6px 8px; text-align: left; width: 90px;">SKU</th>
                                    <th style="padding: 6px 8px; text-align: left;">Detalle</th>
                                    <th style="padding: 6px 8px; text-align: center; width: 40px;">Cant</th>
                                    <th style="padding: 6px 8px; text-align: right; width: 80px;">P. Base</th>
                                    <th style="padding: 6px 8px; text-align: center; width: 50px;">Dto %</th>
                                    <th style="padding: 6px 8px; text-align: right; width: 85px;">Unit Neto</th>
                                    <th style="padding: 6px 8px; text-align: right; width: 90px;">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${rowsHtml}
                            </tbody>
                        </table>
                    </div>
                </div>
                ${totalsHtml}
            </div>
        `;
        container.dataset.loaded = "true";
    } catch (e) {
        console.error("Error loading plan items:", e);
        container.innerHTML = `<p style="color: var(--danger); font-size: 0.78rem; margin-top: 6px;">Error al cargar artículos de YiQi ERP.</p>`;
    }
}

// Render active CRM plan for current client
function renderClientCrmPlan() {
    const container = document.getElementById("crm-active-plan-container");
    if (!container) return;
    if (!selectedClient) {
        container.innerHTML = '<p class="text-secondary">Seleccione un cliente para ver su plan de seguimiento.</p>';
        return;
    }
    
    const followups = getCrmFollowups();
    const activePlans = followups.filter(f => String(f.clientId) === String(selectedClient.id) && f.status === "ABIERTO");
    
    if (activePlans.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px; border: 1px dashed var(--border-color); border-radius: var(--radius-md); background: var(--bg-card);">
                <div class="empty-icon">📅</div>
                <p class="empty-title">Sin seguimiento activo</p>
                <p class="empty-desc" style="max-width: 100%;">Para iniciar un plan de seguimiento, cree una nueva cotización o pedido para este cliente.</p>
            </div>
        `;
        return;
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 14px;">`;
    
    activePlans.forEach((activePlan, planIdx) => {
        let actionsHtml = "";
        let erpStateHtml = "";
        
        if (activePlan.docType === "COTIZACION") {
            const state = activePlan.erpState || "Enviada";
            let stateBg = "rgba(99, 102, 241, 0.15)";
            let stateColor = "#818cf8";
            let stateBorder = "rgba(99, 102, 241, 0.3)";
            
            if (state === "Enviada") {
                stateBg = "rgba(59, 130, 246, 0.15)";
                stateColor = "#60a5fa";
                stateBorder = "rgba(59, 130, 246, 0.3)";
            } else if (state === "En preparación") {
                stateBg = "rgba(156, 163, 175, 0.15)";
                stateColor = "#9ca3af";
                stateBorder = "rgba(156, 163, 175, 0.3)";
            } else if (state === "En validación") {
                stateBg = "rgba(245, 158, 11, 0.15)";
                stateColor = "#fbbf24";
                stateBorder = "rgba(245, 158, 11, 0.3)";
            } else if (state === "Aprobada") {
                stateBg = "rgba(16, 185, 129, 0.15)";
                stateColor = "#34d399";
                stateBorder = "rgba(16, 185, 129, 0.3)";
            } else if (state === "Rechazada") {
                stateBg = "rgba(239, 68, 68, 0.15)";
                stateColor = "#f87171";
                stateBorder = "rgba(239, 68, 68, 0.3)";
            }
            
            erpStateHtml = `
                <span class="badge" style="background: ${stateBg}; color: ${stateColor}; border: 1px solid ${stateBorder}; font-size: 0.7rem; padding: 2px 6px; border-radius: var(--radius-sm); margin-left: 8px; font-weight: 600; display: inline-block;">
                    ${state}
                </span>
            `;
            
            const pdfUrl = `https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportId=137&instanceId=${activePlan.docId}&schemaId=${CONFIG.SCHEMA_ID}`;
            actionsHtml = `
                <button class="btn btn-success" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); acceptCrmQuote('${activePlan.id}', '${activePlan.docId}')" title="Aprobar Cotización y Crear Pedido">
                    ✔️ Aceptar
                </button>
                <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); versionCrmQuote('${activePlan.id}', '${activePlan.docId}')" title="Crear nueva versión de esta cotización">
                    🔄 Versionar
                </button>
                <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); copyCrmQuote('${activePlan.id}', '${activePlan.docId}')" title="Copiar esta cotización">
                    📋 Copiar
                </button>
                <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); window.open('${pdfUrl}', '_blank')" title="Descargar Cotización (PDF)">
                    📥 PDF
                </button>
                <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); shareQuoteOrOrderWhatsApp('${activePlan.id}')" title="Compartir por WhatsApp">
                    🟢
                </button>
                <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); shareQuoteOrOrderGmail('${activePlan.id}')" title="Compartir por Gmail">
                    📧
                </button>
                <button class="btn btn-danger" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); rejectCrmQuote('${activePlan.id}', '${activePlan.docId}')" title="Rechazar Cotización">
                    ✕ Rechazar
                </button>
            `;
        } else {
            actionsHtml = `
                <button class="btn btn-success" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); closeCrmFollowup('${activePlan.id}', 'GANADO')" title="Marcar venta como Ganada">
                    🏆 Ganado
                </button>
                <button class="btn btn-danger" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); closeCrmFollowup('${activePlan.id}', 'PERDIDO')" title="Marcar venta como Perdida">
                    ✕ Perdido
                </button>
                <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); shareQuoteOrOrderWhatsApp('${activePlan.id}')" title="Compartir por WhatsApp">
                    🟢
                </button>
                <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); shareQuoteOrOrderGmail('${activePlan.id}')" title="Compartir por Gmail">
                    📧
                </button>
            `;
        }
        
        // Expand the first one if there is only 1, or collapse them by default to avoid clutter
        const isDefaultExpanded = planIdx === 0 && activePlans.length === 1;
        const displayStyle = isDefaultExpanded ? "flex" : "none";
        const arrowRotate = isDefaultExpanded ? "90deg" : "0deg";
        
        html += `
            <div style="border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow: hidden; background: var(--bg-card); box-shadow: var(--shadow-sm); transition: all 0.2s ease;">
                <!-- Collapsible Header -->
                <div style="background: var(--bg-input); padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; cursor: pointer; user-select: none;" onclick="togglePlanDetails('${activePlan.id}', '${activePlan.docId}', '${activePlan.docType}')">
                    <div style="display: flex; align-items: center; gap: 10px; text-align: left;">
                        <span id="plan-arrow-${activePlan.id}" style="transition: transform 0.2s ease; transform: rotate(${arrowRotate}); display: inline-block; font-size: 0.8rem; color: var(--text-secondary);">▶</span>
                        <div>
                            <span style="font-weight: 700; font-size: 0.85rem; color: var(--primary);">${activePlan.docType} N° ${activePlan.docDisplayNum || activePlan.docId} <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal; margin-left: 6px;">(${activePlan.clientName || 'Sin Cliente'})</span>${erpStateHtml}</span>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); margin-left: 8px;">Total: ${formatCurrency(activePlan.docTotal)} | Iniciado: ${new Date(activePlan.dateCreated).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px;">
                        ${actionsHtml}
                    </div>
                </div>
                
                <!-- Collapsible Content (Split screen) -->
                <div id="plan-details-${activePlan.id}" class="crm-plan-expanded-layout" style="display: ${displayStyle}; border-top: 1px solid var(--border-color);">
                    <!-- Left Column: Steps -->
                    <div class="crm-plan-left-col">
                        <div class="crm-plan-steps-list-vertical">
        `;
        
        activePlan.steps.forEach((step, idx) => {
            const isActive = idx === activePlan.currentStep;
            const isCompleted = step.completed;
            let cardClass = "crm-step-card";
            let badgeClass = "crm-step-badge pending";
            let badgeText = "Pendiente";
            
            if (isActive) {
                cardClass += " active";
                badgeClass = "crm-step-badge current";
                badgeText = "Pendiente";
            } else if (isCompleted) {
                cardClass += " completed";
                badgeClass = "crm-step-badge done";
                badgeText = "Completado";
            }
            
            const dueFormatted = formatStepDueDate(step.dueDate);
            
            html += `
                <div class="${cardClass}">
                    <div class="crm-step-header">
                        <span class="crm-step-title">${step.title}</span>
                        <div>
                            <span style="font-size: 0.75rem; color: var(--text-secondary); margin-right: 8px;">Vence: ${dueFormatted}</span>
                            <span class="${badgeClass}">${badgeText}</span>
                        </div>
                    </div>
            `;
            
            if (isCompleted) {
                html += `
                    <div style="font-size: 0.8rem; color: var(--text-secondary); background: var(--bg-card); padding: 8px; border-radius: var(--radius-sm); border: 1px solid var(--border-color); text-align: left;">
                        <strong>Gestión (${new Date(step.completedDate).toLocaleDateString()}):</strong>
                        <p style="margin-top: 4px; font-style: italic;">"${step.notes || 'Sin observaciones'}"</p>
                    </div>
                `;
            } else if (isActive) {
                const clientPhoneRaw = selectedClient.phone || "";
                const clientPhoneCleaned = cleanPhoneNumber(clientPhoneRaw);
                
                // Get pre-compiled message based on cache (if available) or defaults
                let initialMsg = "";
                const cachedItems = window.crmPlanItemsCache ? window.crmPlanItemsCache[activePlan.docId] : null;
                initialMsg = compileFollowupMessageText(activePlan, idx, cachedItems);
                
                // If items are not cached yet, and the message template contains {detalle_items}, trigger background load
                const stepMessageTemplate = step.message || getDefaultMessageTemplate(activePlan.docType);
                if (stepMessageTemplate.includes("{detalle_items}") && !cachedItems) {
                    preloadCrmPlanItems(activePlan, idx);
                }
                
                const callUrl = clientPhoneCleaned ? `tel:${clientPhoneCleaned}` : "#";
                const callTitle = clientPhoneCleaned ? `Llamar al ${clientPhoneRaw}` : "Sin teléfono registrado";
                const callStyle = clientPhoneCleaned ? "" : "opacity: 0.4; cursor: not-allowed;";
                const callOnClick = clientPhoneCleaned ? "" : "event.preventDefault(); showAppNotification('Teléfono no registrado', 'El cliente no tiene un teléfono válido en YiQi ERP.', 'warning');";

                html += `
                    <div style="display: flex; flex-direction: column; gap: 8px;">
                        <!-- Custom message textarea and share buttons -->
                        <div style="margin-top: 6px; margin-bottom: 6px; background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); padding: 10px; border-radius: var(--radius-sm);">
                            <label style="display: block; font-size: 0.72rem; font-weight: 600; margin-bottom: 4px; color: var(--text-secondary); text-align: left;">Mensaje a enviar (Editable):</label>
                            <textarea id="crm-share-message-text-${activePlan.id}-${idx}" class="form-input crm-step-notes-area" style="width: 100%; height: 80px; font-size: 0.78rem; resize: vertical; margin-bottom: 8px; line-height: 1.4; background: var(--bg-input); border: 1px solid var(--border-color); color: var(--text-primary);" placeholder="Escriba el mensaje para el cliente...">${initialMsg}</textarea>
                            
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <button class="btn btn-success" style="font-size: 0.72rem; padding: 4px 8px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; background: #25d366; color: white;" onclick="shareViaWhatsApp('${activePlan.id}', ${idx}, '${selectedClient.phone || ''}')">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="display: inline-block; vertical-align: middle;"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.717-1.456L0 24zm6.59-4.846c1.6.95 3.488 1.451 5.416 1.452 5.518 0 10.007-4.486 10.01-10.004.002-2.673-1.04-5.187-2.936-7.085-1.897-1.897-4.411-2.937-7.088-2.938-5.523 0-10.016 4.49-10.02 10.012-.002 1.834.48 3.627 1.396 5.201l-.914 3.341 3.42-.897zm10.511-6.633c-.279-.14-1.651-.815-1.907-.908-.256-.093-.443-.14-.63.14-.187.279-.724.908-.887 1.093-.163.186-.326.21-.605.07-.279-.14-1.18-.435-2.247-1.387-.83-.741-1.39-1.655-1.553-1.934-.163-.28-.018-.43.122-.569.126-.125.279-.326.419-.489.14-.163.187-.279.279-.465.093-.186.047-.35-.024-.49-.07-.14-.63-1.517-.862-2.078-.227-.547-.456-.473-.63-.48l-.538-.012c-.187 0-.49.07-.747.35-.256.28-.979.957-.979 2.335 0 1.378 1.002 2.709 1.142 2.896.14.186 1.972 3.01 4.777 4.218.667.288 1.189.46 1.597.59.67.213 1.278.183 1.76.111.537-.08 1.651-.675 1.884-1.328.232-.653.232-1.213.163-1.328-.069-.115-.256-.186-.535-.327z"/></svg>
                                    WhatsApp
                                </button>
                                <button class="btn" style="font-size: 0.72rem; padding: 4px 8px; display: inline-flex; align-items: center; justify-content: center; gap: 4px; background: #ea4335; color: white;" onclick="shareViaGmail('${activePlan.id}', ${idx}, '${selectedClient.mail || ''}', '${activePlan.docType}', '${activePlan.docDisplayNum || activePlan.docId}')">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="display: inline-block; vertical-align: middle;"><path d="M24 4.5v15c0 .85-.65 1.5-1.5 1.5H21V7.39l-9 5.73-9-5.73V21H1.5C.65 21 0 20.35 0 19.5v-15c0-.85.65-1.5 1.5-1.5H3l9 5.73L21 3h1.5c.85 0 1.5.65 1.5 1.5z"/></svg>
                                    Gmail
                                </button>
                                <a href="${callUrl}" onclick="${callOnClick}" class="crm-comm-btn call-btn" title="${callTitle}" style="display: inline-flex; align-items: center; justify-content: center; gap: 4px; padding: 4px 8px; font-size: 0.72rem; font-weight: 600; border-radius: 4px; text-decoration: none; background: #34a853; color: white; transition: opacity 0.2s; height: 26px; box-sizing: border-box; ${callStyle}">
                                    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" style="display: inline-block; vertical-align: middle;"><path d="M6.62 10.79c1.44 2.83 3.76 5.14 6.59 6.59l2.2-2.2c.27-.27.67-.36 1.02-.24 1.12.37 2.33.57 3.57.57.55 0 1 .45 1 1V20c0 .55-.45 1-1 1-9.39 0-17-7.61-17-17 0-.55.45-1 1-1h3.5c.55 0 1 .45 1 1 0 1.25.2 2.45.57 3.57.11.35.03.74-.25 1.02l-2.2 2.2z"/></svg>
                                    Llamar
                                </a>
                            </div>
                        </div>
                        
                        <textarea id="step-notes-${activePlan.id}-${idx}" class="crm-step-notes-area" placeholder="Escriba las observaciones del llamado..."></textarea>
                        <button class="btn btn-primary" style="font-size: 0.78rem; padding: 6px 12px; align-self: flex-end;" onclick="completeCrmStep('${activePlan.id}', ${idx})">
                            ✓ Registrar Gestión y Avanzar
                        </button>
                    </div>
                `;
            } else {
                html += `
                    <div style="font-size: 0.78rem; color: var(--text-muted); font-style: italic; text-align: left;">
                        Este paso se activará al completar el anterior.
                    </div>
                `;
            }
            
            html += `</div>`;
        });
        
        html += `
                        </div>
                    </div>
                    
                    <!-- Right Column: Quote Details -->
                    <div class="crm-plan-right-col">
                        <div id="plan-items-${activePlan.id}"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
    
    // Auto-trigger loading items for expanded plans
    activePlans.forEach((activePlan, planIdx) => {
        const isDefaultExpanded = planIdx === 0 && activePlans.length === 1;
        if (isDefaultExpanded) {
            loadCrmPlanItems(activePlan.id, activePlan.docId, activePlan.docType);
        }
    });
}

// Complete active step
function completeCrmStep(followupId, stepIndex) {
    const notesInput = document.getElementById(`step-notes-${followupId}-${stepIndex}`);
    const notes = notesInput ? notesInput.value.trim() : "";
    
    if (!notes) {
        showAppNotification("Observación requerida", "Debe ingresar una nota o resumen de la gestión antes de avanzar.", "warning");
        return;
    }
    
    const followups = getCrmFollowups();
    const plan = followups.find(f => String(f.id) === String(followupId));
    if (!plan) return;
    
    const step = plan.steps[stepIndex];
    if (step) {
        step.completed = true;
        step.completedDate = new Date().toISOString();
        step.notes = notes;
        
        // Calculate delay in days
        const due = step.dueDate.includes("T") ? new Date(step.dueDate) : new Date(step.dueDate + "T00:00:00");
        const comp = new Date(step.completedDate);
        due.setHours(0,0,0,0);
        comp.setHours(0,0,0,0);
        const diffTime = comp.getTime() - due.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        step.delayDays = diffDays > 0 ? diffDays : 0;
    }
    
    plan.currentStep = stepIndex + 1;
    
    // Recalculate next step's due date relative to this completion time
    const nextStep = plan.steps[plan.currentStep];
    if (nextStep) {
        const offsetVal = nextStep.offsetVal !== undefined ? nextStep.offsetVal : (nextStep.days || 3);
        const offsetUnit = nextStep.offsetUnit || "días";
        nextStep.dueDate = calculateDueDate(new Date(), offsetVal, offsetUnit);
    }
    
    if (plan.currentStep >= plan.steps.length) {
        showAppNotification("Plan Completado", "Ha realizado todos los pasos de seguimiento. Por favor defina si la venta fue GANADA o PERDIDA.", "info");
    } else {
        showAppNotification("Gestión Registrada", "Paso completado. Se programó el siguiente contacto.", "success");
    }
    
    saveCrmFollowups(followups, plan);
    renderAllCrmSections();
}

// Close a plan manually as Won / Lost / Versioned
function closeCrmFollowup(followupId, status) {
    const followups = getCrmFollowups();
    const plan = followups.find(f => String(f.id) === String(followupId));
    if (!plan) return;
    
    plan.status = status;
    plan.closeDate = new Date().toISOString();
    
    saveCrmFollowups(followups, plan);
    
    let statusText = "";
    if (status === "GANADO") {
        statusText = "GANADO (Venta concretada) 🏆";
    } else if (status === "VERSIONADO") {
        statusText = "VERSIONADO (Nueva versión creada) 🔄";
    } else {
        statusText = "PERDIDO (Venta rechazada) ✕";
    }
    showAppNotification("Seguimiento Cerrado", `El plan se guardó como ${statusText}`, "success");
    
    renderAllCrmSections();
}

// Accept/Approve a Quote converting it to an Order in YiQi ERP
async function acceptCrmQuote(planId, docId) {
    showLoader("Aceptando cotización en YiQi ERP (Aprobando)...");
    try {
        const transSuccess = await executeTransitionWithRetry(docId, CONFIG.TRANSITION_COTI_APROBAR, "Aprobar Cotización");
        if (!transSuccess) {
            throw new Error("La transición de aprobación falló en YiQi ERP.");
        }
        
        // Find display number from local followup plans
        const followups = getCrmFollowups();
        const plan = followups.find(f => String(f.id) === String(planId));
        const displayNum = plan ? plan.docDisplayNum : String(docId);
        
        // Update local plan state and close it as GANADO
        closeCrmFollowup(planId, "GANADO");
        
        // Trigger background sync immediately to retrieve order number (PEDI_NUMERO)
        if (selectedClient) {
            syncClientFollowupsWithYiQi(selectedClient.id).catch(e => console.error("Post-acceptance sync failed:", e));
            setTimeout(() => {
                if (selectedClient) {
                    syncClientFollowupsWithYiQi(selectedClient.id).catch(e => console.error("Delayed post-acceptance sync failed:", e));
                }
            }, 3000);
        }
        
        hideLoader();
        showAppNotification("Cotización Aceptada", `Se aprobó la cotización N° ${displayNum} en YiQi con éxito y se generó el pedido correspondiente.`, "success");
        renderAllCrmSections();
        renderCrmAlerts();
    } catch (e) {
        console.error("Error accepting quote:", e);
        hideLoader();
        showAppNotification("Error al aceptar cotización", `No se pudo confirmar la cotización en YiQi: ${e.message}`, "danger");
        // Fallback local closure so salesperson isn't blocked by transient errors
        closeCrmFollowup(planId, "GANADO");
        if (selectedClient) {
            syncClientFollowupsWithYiQi(selectedClient.id).catch(e => console.error("Fallback sync failed:", e));
        }
    }
}

// Reject a Quote in YiQi ERP (shows modal first)
function rejectCrmQuote(planId, docId) {
    const reasons = getRejectionReasons();
    let optionsHtml = reasons.map(r => `<option value="${r}">${r}</option>`).join("");
    
    const content = `
        <div style="text-align: left; padding: 10px 0;">
            <p style="margin-bottom: 14px; font-size: 0.88rem; color: var(--text-secondary);">
                Por favor, indique el motivo por el cual el cliente rechaza la cotización. Este dato es obligatorio para las métricas del CRM.
            </p>
            <div class="form-group" style="margin-bottom: 14px;">
                <label class="form-label" style="font-weight: 600;">Motivo de Rechazo *</label>
                <select id="reject-reason-select" class="form-input" style="width: 100%; margin-top: 6px;">
                    <option value="" disabled selected>-- Seleccione un motivo --</option>
                    ${optionsHtml}
                </select>
            </div>
            <div class="form-group">
                <label class="form-label" style="font-weight: 600;">Comentarios Adicionales</label>
                <textarea id="reject-comments-textarea" class="crm-step-notes-area" style="width: 100%; min-height: 80px; margin-top: 6px;" placeholder="Ingrese detalles adicionales del rechazo..."></textarea>
            </div>
        </div>
    `;
    
    showModal({
        title: "❌ Confirmar Rechazo de Cotización",
        content: content,
        actions: [
            { text: "Cancelar", class: "btn-secondary", close: true },
            { text: "Confirmar Rechazo", class: "btn-danger", onClick: () => confirmRejectCrmQuote(planId, docId), close: false }
        ]
    });
}

// Confirm rejection and complete ERP + CRM update
async function confirmRejectCrmQuote(planId, docId) {
    const reasonSelect = document.getElementById("reject-reason-select");
    const commentsTextarea = document.getElementById("reject-comments-textarea");
    
    const reason = reasonSelect ? reasonSelect.value : "";
    const comments = commentsTextarea ? commentsTextarea.value.trim() : "";
    
    if (!reason) {
        showAppNotification("Motivo requerido", "Debe seleccionar un motivo de rechazo.", "warning");
        return;
    }
    
    closeModal();
    showLoader("Rechazando cotización en YiQi ERP...");
    try {
        const transSuccess = await executeTransitionWithRetry(docId, CONFIG.TRANSITION_COTI_RECHAZAR, "Rechazar Cotización");
        if (!transSuccess) {
            throw new Error("La transición de rechazo falló en YiQi ERP.");
        }
        
        // Find display number from local followup plans
        const followups = getCrmFollowups();
        const plan = followups.find(f => String(f.id) === String(planId));
        const displayNum = plan ? plan.docDisplayNum : String(docId);
        
        if (plan) {
            // Save the rejection reason and comments in the plan object itself
            plan.rejectionReason = reason;
            plan.rejectionComments = comments;
            
            // Add a log note to the current step
            const currentStep = plan.steps[plan.currentStep];
            if (currentStep) {
                currentStep.completed = true;
                currentStep.completedDate = new Date().toISOString();
                currentStep.notes = `Rechazado - Motivo: ${reason}${comments ? '. Comentarios: ' + comments : ''}`;
            }
        }
        
        closeCrmFollowup(planId, "PERDIDO");
        
        hideLoader();
        showAppNotification("Cotización Rechazada", `Se rechazó la cotización N° ${displayNum} en YiQi con éxito.`, "info");
        renderAllCrmSections();
        renderCrmAlerts();
    } catch (e) {
        console.error("Error rejecting quote:", e);
        hideLoader();
        showAppNotification("Error al rechazar cotización", `No se pudo registrar el rechazo en YiQi: ${e.message}`, "danger");
        
        // Fallback local closure
        const followups = getCrmFollowups();
        const plan = followups.find(f => String(f.id) === String(planId));
        if (plan) {
            plan.rejectionReason = reason;
            plan.rejectionComments = comments;
            const currentStep = plan.steps[plan.currentStep];
            if (currentStep) {
                currentStep.completed = true;
                currentStep.completedDate = new Date().toISOString();
                currentStep.notes = `Rechazado (Local) - Motivo: ${reason}${comments ? '. Comentarios: ' + comments : ''}`;
            }
        }
        closeCrmFollowup(planId, "PERDIDO");
    }
}

// Helper to execute quote workflow transition and robustly identify the newly created quote ID
async function executeQuoteTransitionAndFindNewId(docId, transitionId, clientId) {
    const listUrl = `${CONFIG.GETLIST_BASE}?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&smartieId=2769`;
    const queryBody = {
        page: 1,
        pageSize: 50,
        filters: [
            {
                columnName: "CLIE_ID_CLIE",
                operator: "=",
                value: String(clientId)
            }
        ]
    };
    
    // Resolve client CUIT to filter GetList in JavaScript
    let clientCuit = "";
    if (selectedClient && String(selectedClient.id) === String(clientId)) {
        clientCuit = String(selectedClient.cuit || "").trim();
    }
    
    if (!clientCuit) {
        try {
            const quoteUrl = `${CONFIG.GETINSTANCE_BASE}?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&id=${docId}`;
            const qRes = await apiCall(quoteUrl, "GET");
            if (qRes && qRes.atts) {
                const clientFkId = qRes.atts["7079"]?.value; // 7079 is CLIE_ID_CLIE in Entity 865
                if (clientFkId) {
                    const instUrl = `${CONFIG.GETINSTANCE_BASE}?entityId=345&schemaId=${CONFIG.SCHEMA_ID}&id=${clientFkId}`;
                    const instRes = await apiCall(instUrl, "GET");
                    if (instRes && instRes.atts && instRes.atts["1686"]) {
                        clientCuit = String(instRes.atts["1686"].value || "").trim();
                    }
                }
            }
        } catch (e) {
            console.warn("Could not retrieve client CUIT from original quote:", e);
        }
    }
    console.log(`Filtering transition polling for client CUIT: "${clientCuit}"`);
    
    // 1. Get existing quotes before copying/versioning
    let existingIds = [];
    try {
        const listResBefore = await apiCall(listUrl, "POST", queryBody);
        const rowsBefore = listResBefore.data || listResBefore.rows || listResBefore.instances || [];
        existingIds = rowsBefore
            .filter(r => !clientCuit || String(r.CLIE_CUIT || "").trim() === clientCuit)
            .map(r => r.ID || r.id)
            .filter(id => id);
    } catch (e) {
        console.warn("Could not fetch quote list before transition:", e);
    }
    
    // 2. Execute transition with retries
    let transRes = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            const transBody = {
                schemaId: CONFIG.SCHEMA_ID,
                ids: [String(docId)],
                transitionId: transitionId,
                form: ""
            };
            transRes = await apiCall(CONFIG.TRANSITION_BASE, "POST", transBody);
            if (transRes && transRes.ok !== false) {
                break;
            }
        } catch (err) {
            console.warn(`Attempt ${attempt} to run transition ${transitionId} failed:`, err);
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, 2000));
    }
    
    if (!transRes || transRes.ok === false) {
        throw new Error((transRes && transRes.error) || `La transición ${transitionId} falló.`);
    }
    
    // Check if ID was returned directly
    let newDocId = transRes.newId || transRes.id || (transRes.data && transRes.data.id);
    if (newDocId) {
        return newDocId;
    }
    
    // 3. Wait and poll for new quote ID
    console.log("Polling list for newly generated quote ID...");
    for (let queryAttempt = 1; queryAttempt <= 5; queryAttempt++) {
        await new Promise(r => setTimeout(r, 1500));
        try {
            const listResAfter = await apiCall(listUrl, "POST", queryBody);
            const rowsAfter = listResAfter.data || listResAfter.rows || listResAfter.instances || [];
            
            const newIds = rowsAfter
                .filter(r => !clientCuit || String(r.CLIE_CUIT || "").trim() === clientCuit)
                .map(r => r.ID || r.id)
                .filter(id => id && !existingIds.includes(id));
                
            if (newIds.length > 0) {
                newDocId = Math.max(...newIds.map(id => parseInt(id)));
                console.log(`Found new quote ID: ${newDocId} in poll attempt ${queryAttempt}`);
                break;
            }
        } catch (e) {
            console.warn(`Query attempt ${queryAttempt} failed:`, e);
        }
    }
    
    // Fallback: pick the highest ID overall for this client
    if (!newDocId) {
        try {
            const listResAfter = await apiCall(listUrl, "POST", queryBody);
            const rowsAfter = listResAfter.data || listResAfter.rows || listResAfter.instances || [];
            const afterIdsFiltered = rowsAfter
                .filter(r => !clientCuit || String(r.CLIE_CUIT || "").trim() === clientCuit)
                .map(r => r.ID || r.id)
                .filter(id => id);
            if (afterIdsFiltered.length > 0) {
                newDocId = Math.max(...afterIdsFiltered.map(id => parseInt(id)));
                console.log(`Fallback picked highest quote ID for client: ${newDocId}`);
            }
        } catch (e) {
            console.warn("Fallback query failed:", e);
        }
    }
    
    return newDocId;
}

// Create a new version of a Quote in YiQi ERP
async function versionCrmQuote(planId, docId) {
    showLoader("Versionando cotización en YiQi ERP...");
    try {
        const followups = getCrmFollowups();
        const plan = followups.find(f => String(f.id) === String(planId));
        if (!plan) return;
        
        const newDocId = await executeQuoteTransitionAndFindNewId(docId, CONFIG.TRANSITION_COTI_VERSIONAR, plan.clientId);
        if (!newDocId) {
            throw new Error("No se pudo identificar el ID de la cotización versionada.");
        }
        
        showLoader("Obteniendo número oficial de cotización...");
        const newDisplayNum = await getQuoteDisplayNumber(newDocId);
        
        hideLoader();
        
        const successMsg = `Se generó la nueva versión Cotización N° ${newDisplayNum} en YiQi (estado "En preparación").`;
        showAppNotification("Cotización Versionada", successMsg, "success");
        
        // Close old plan as VERSIONADO
        plan.status = "VERSIONADO";
        plan.closeDate = new Date().toISOString();
        
        // Create new plan for the new quote version in PREPARACION status
        const newFollowup = createCrmFollowup(plan.clientId, plan.clientName, newDocId, "COTIZACION", plan.docTotal, newDisplayNum, "PREPARACION");
        
        // Retrieve fresh array of followups to save both changes (explicitly saving the VERSIONADO state to Firestore)
        const currentFollowups = getCrmFollowups();
        const oldPlanIdx = currentFollowups.findIndex(f => String(f.id) === String(plan.id));
        if (oldPlanIdx !== -1) {
            currentFollowups[oldPlanIdx] = plan;
        }
        const newPlanIdx = currentFollowups.findIndex(f => String(f.id) === String(newFollowup.id));
        if (newPlanIdx !== -1) {
            currentFollowups[newPlanIdx] = newFollowup;
        }
        saveCrmFollowups(currentFollowups, plan);
        
        renderAllCrmSections();
        renderCrmAlerts();
    } catch (e) {
        console.error("Error versioning quote:", e);
        hideLoader();
        showAppNotification("Error al versionar cotización", `No se pudo versionar la cotización en YiQi: ${e.message}`, "danger");
    }
}

// Copy a Quote in YiQi ERP and create a new CRM plan
async function copyCrmQuote(planId, docId) {
    const followups = getCrmFollowups();
    const plan = followups.find(f => String(f.id) === String(planId));
    if (!plan) return;
    
    showLoader("Copiando cotización en YiQi ERP...");
    try {
        const newDocId = await executeQuoteTransitionAndFindNewId(docId, 117987, plan.clientId);
        if (!newDocId) {
            throw new Error("No se pudo identificar el ID de la cotización copiada.");
        }
        
        showLoader("Obteniendo número oficial de cotización copiada...");
        const newDisplayNum = await getQuoteDisplayNumber(newDocId);
        
        hideLoader();
        
        // Create new CRM plan for the copied quote
        createCrmFollowup(plan.clientId, plan.clientName, newDocId, "COTIZACION", plan.docTotal, newDisplayNum);
        
        showAppNotification("Cotización Copiada", `Se copió la cotización con éxito. Nueva Cotización N° ${newDisplayNum} creada y plan de seguimiento iniciado.`, "success");
        
        renderAllCrmSections();
        renderCrmAlerts();
    } catch (e) {
        console.error("Error copying quote:", e);
        hideLoader();
        showAppNotification("Error al copiar cotización", `No se pudo copiar la cotización en YiQi: ${e.message}`, "danger");
    }
}

// Toggle between standard and widened catalog widths in creator layout
function toggleCatalogExpanded() {
    const layout = document.querySelector(".commercial-creator-layout");
    const btn = document.getElementById("btn-toggle-catalog-expand");
    if (!layout) return;
    
    const isExpanded = layout.classList.toggle("catalog-expanded");
    if (btn) {
        btn.title = isExpanded ? "Restaurar Tamaño Catálogo" : "Maximizar Tamaño Catálogo";
        btn.style.transform = isExpanded ? "rotate(180deg)" : "rotate(0deg)";
    }
}

// Toggle closed history log details collapsible view
function toggleHistoryDetails(planId, docId, docType) {
    const el = document.getElementById(`history-details-${planId}`);
    const arrow = document.getElementById(`history-arrow-${planId}`);
    if (!el) return;
    
    const isCollapsed = el.style.display === "none";
    el.style.display = isCollapsed ? "flex" : "none";
    if (arrow) {
        arrow.style.transform = isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
    }
    
    if (isCollapsed) {
        loadCrmPlanItems(planId, docId, docType, true);
    }
}

// Toggle entire history section collapsible view
function toggleHistorySection() {
    const container = document.getElementById("crm-history-logs-container");
    const arrow = document.getElementById("history-section-arrow");
    if (!container || !arrow) return;
    
    const isCollapsed = container.style.display === "none";
    container.style.display = isCollapsed ? "block" : "none";
    arrow.style.transform = isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
}

// Render closed history logs
function renderClientCrmHistory() {
    const container = document.getElementById("crm-history-logs-container");
    if (!container) return;
    
    const headerTitleSpan = document.querySelector("#history-section-header span");
    
    if (!selectedClient) {
        if (headerTitleSpan) headerTitleSpan.textContent = "Historial de Gestiones Cerradas";
        container.innerHTML = "";
        return;
    }
    
    const followups = getCrmFollowups();
    const history = followups.filter(f => String(f.clientId) === String(selectedClient.id) && f.status !== "ABIERTO" && f.status !== "PREPARACION");
    
    if (headerTitleSpan) {
        headerTitleSpan.textContent = `Historial de Gestiones Cerradas (${history.length})`;
    }
    
    if (history.length === 0) {
        container.innerHTML = '<p class="text-secondary" style="font-size: 0.8rem; font-style: italic; text-align: left;">No hay gestiones cerradas anteriores para este cliente.</p>';
        return;
    }
    
    let html = "";
    history.forEach(plan => {
        const statusClass = plan.status.toLowerCase();
        const statusText = plan.status;
        const closeDateFormatted = new Date(plan.closeDate || plan.dateCreated).toLocaleDateString();
        
        let stepsHtml = "";
        plan.steps.forEach(step => {
            if (step.completed) {
                stepsHtml += `
                    <div class="crm-history-log-step">
                        <strong>${step.title}:</strong> ${step.notes || 'Sin observaciones'}
                    </div>
                `;
            }
        });
        
        let actionsHtml = "";
        if (plan.docType === "COTIZACION") {
                        const pdfUrl = `https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportId=137&instanceId=${plan.docId}&schemaId=${CONFIG.SCHEMA_ID}`;
            actionsHtml = `
                <button class="btn btn-secondary" style="font-size: 0.72rem; padding: 2px 6px; border: 1px solid var(--border-color); background: var(--bg-card); display: inline-flex; align-items: center; gap: 3px;" onclick="event.stopPropagation(); window.open('${pdfUrl}', '_blank')" title="Descargar Cotización (PDF)">
                    📥 PDF
                </button>
            `;
            if (plan.status !== "PERDIDO") {
                actionsHtml += `
                    <button class="btn btn-secondary" style="font-size: 0.72rem; padding: 2px 6px; border: 1px solid var(--border-color); background: var(--bg-card); display: inline-flex; align-items: center; gap: 3px;" onclick="event.stopPropagation(); copyCrmQuote('${plan.id}', '${plan.docId}')" title="Copiar esta cotización">
                        📋 Copiar
                    </button>
                `;
            }
        }
        
        let pedidoBadgeHtml = "";
        if (plan.status === "GANADO" && plan.pedidoNum) {
            pedidoBadgeHtml = `<span class="badge" style="background-color: #22c55e; color: white; margin-left: 6px; font-size: 0.72rem; font-weight: 600; padding: 2px 6px; border-radius: var(--radius-sm);">Pedido N° ${plan.pedidoNum}</span>`;
        }
        
        let reversionBadgeHtml = "";
        if (plan.status === "VERSIONADO") {
            reversionBadgeHtml = `<span class="badge" style="background-color: #3b82f6; color: white; margin-left: 6px; font-size: 0.72rem; font-weight: 600; padding: 2px 6px; border-radius: var(--radius-sm);">🔄 Reversionada</span>`;
        }
        
        html += `
            <div class="crm-history-log-item" style="padding: 0; overflow: hidden; margin-bottom: 8px;">
                <!-- Header (Clickable) -->
                <div class="crm-history-log-header" style="margin-bottom: 0; border-bottom: none; padding: 10px 14px; cursor: pointer; user-select: none; background: var(--bg-input); display: flex; justify-content: space-between; align-items: center;" onclick="toggleHistoryDetails('${plan.id}', '${plan.docId}', '${plan.docType}')">
                    <div style="display: flex; align-items: center; gap: 8px; text-align: left;">
                        <span id="history-arrow-${plan.id}" style="transition: transform 0.2s ease; transform: rotate(0deg); display: inline-block; font-size: 0.75rem; color: var(--text-secondary);">▶</span>
                        <span class="crm-history-log-title">${plan.docType} N° ${plan.docDisplayNum || plan.docId} <span style="font-size: 0.72rem; color: var(--text-muted); font-weight: normal;">(${plan.clientName || 'Sin Cliente'})</span> (${formatCurrency(plan.docTotal)})${pedidoBadgeHtml}${reversionBadgeHtml}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                        ${actionsHtml}
                        <span class="crm-history-log-status ${statusClass}" style="margin: 0;">${statusText}</span>
                    </div>
                </div>
                
                <!-- Collapsible Body (Hidden by default, split layout) -->
                <div id="history-details-${plan.id}" class="crm-plan-expanded-layout" style="display: none; border-top: 1px solid var(--border-color);">
                    <!-- Left Column: Steps -->
                    <div class="crm-plan-left-col">
                        <div style="font-size: 0.72rem; color: var(--text-muted); margin-bottom: 8px; text-align: left;">Cerrado el: ${closeDateFormatted}</div>
                        <div class="crm-history-steps-vertical">
                            ${stepsHtml || '<div class="crm-history-log-step" style="font-style: italic; border-left-color: var(--border-color);">Sin gestiones registradas.</div>'}
                        </div>
                    </div>
                    
                    <!-- Right Column: Quote Details -->
                    <div class="crm-plan-right-col">
                        <div id="history-items-${plan.id}"></div>
                    </div>
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Toggle entire preparation section collapsible view
function togglePreparacionSection() {
    const container = document.getElementById("crm-preparacion-logs-container");
    const arrow = document.getElementById("preparacion-section-arrow");
    if (!container || !arrow) return;
    
    const isCollapsed = container.style.display === "none";
    container.style.display = isCollapsed ? "block" : "none";
    arrow.style.transform = isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
    
    if (isCollapsed) {
        renderClientCrmPreparacion();
    }
}

// Toggle entire reversiones section collapsible view
function toggleReversionesSection() {
    const container = document.getElementById("crm-reversiones-logs-container");
    const arrow = document.getElementById("reversiones-section-arrow");
    if (!container || !arrow) return;
    
    const isCollapsed = container.style.display === "none";
    container.style.display = isCollapsed ? "block" : "none";
    arrow.style.transform = isCollapsed ? "rotate(90deg)" : "rotate(0deg)";
    
    if (isCollapsed) {
        renderClientCrmReversiones();
    }
}

function isDocDisplayNumReversion(displayNum) {
    if (!displayNum) return false;
    const parts = displayNum.split('.');
    if (parts.length > 1) {
        const versionNum = parseInt(parts[parts.length - 1]);
        if (!isNaN(versionNum) && versionNum > 1) {
            return true;
        }
    }
    return false;
}

// Render preparation/validation quotes (v1)
function renderClientCrmPreparacion() {
    const container = document.getElementById("crm-preparacion-logs-container");
    if (!container) return;
    
    const headerTitleSpan = document.querySelector("#preparacion-section-header span");
    
    if (!selectedClient) {
        if (headerTitleSpan) headerTitleSpan.textContent = "Cotizaciones en Preparación";
        container.innerHTML = "";
        return;
    }
    
    const followups = getCrmFollowups();
    const prepList = followups.filter(f => 
        String(f.clientId) === String(selectedClient.id) && 
        f.status === "PREPARACION" &&
        !isDocDisplayNumReversion(f.docDisplayNum)
    );
    
    if (headerTitleSpan) {
        headerTitleSpan.textContent = `Cotizaciones en Preparación (${prepList.length})`;
    }
    
    if (prepList.length === 0) {
        container.innerHTML = '<p class="text-secondary" style="font-size: 0.8rem; font-style: italic; text-align: left; margin: 0;">No hay cotizaciones en preparación o validación.</p>';
        return;
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 14px;">`;
    
    prepList.forEach(plan => {
        const stateName = plan.erpState || "En preparación";
        const dateFormatted = new Date(plan.dateCreated).toLocaleDateString();
        const yiqiUrl = `https://me.yiqi.com.ar/view/COTIZACION_COMERCIAL?schemaId=${CONFIG.SCHEMA_ID}#/${plan.docId}`;
        
        let transitionButtonsHtml = "";
        if (stateName === "En preparación") {
            transitionButtonsHtml = `
                <button class="btn btn-primary" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); executePreparacionTransition('${plan.id}', '${plan.docId}', 117982, 'En validación')" title="Pasar a En Validación">
                    ⚙️ Validar
                </button>
            `;
        } else if (stateName === "En validación") {
            transitionButtonsHtml = `
                <button class="btn btn-success" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); executePreparacionTransition('${plan.id}', '${plan.docId}', 117983, 'Enviada')" title="Pasar a Enviada">
                    🚀 Enviar (Pasar a Activa)
                </button>
            `;
        }
        
        html += `
            <div class="crm-plan-card" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-card); padding: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                <div style="flex-grow: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">COTIZACION N° ${plan.docDisplayNum}</span>
                        <span class="badge" style="background: ${stateName === 'En validación' ? '#e67e22' : '#7f8c8d'}; color: #fff; font-size: 0.7rem; padding: 2px 6px;">
                            ${stateName}
                        </span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 12px; flex-wrap: wrap;">
                        <span><strong>Total:</strong> ${formatCurrency(plan.docTotal)}</span>
                        <span><strong>Iniciado:</strong> ${dateFormatted}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); loadQuoteIntoCartForEditing('${plan.docId}')" title="Editar cotización en Canasta de Venta">
                        ✏️ Editar
                    </button>
                    ${transitionButtonsHtml}
                    <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); window.open('${yiqiUrl}', '_blank')" title="Ver en YiQi ERP">
                        🔗 Ver en YiQi
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

// Render reversiones in preparation/validation (v2+)
function renderClientCrmReversiones() {
    const container = document.getElementById("crm-reversiones-logs-container");
    if (!container) return;
    
    const headerTitleSpan = document.querySelector("#reversiones-section-header span");
    
    if (!selectedClient) {
        if (headerTitleSpan) headerTitleSpan.textContent = "Reversiones en Curso";
        container.innerHTML = "";
        return;
    }
    
    const followups = getCrmFollowups();
    const prepList = followups.filter(f => 
        String(f.clientId) === String(selectedClient.id) && 
        f.status === "PREPARACION" &&
        isDocDisplayNumReversion(f.docDisplayNum)
    );
    
    if (headerTitleSpan) {
        headerTitleSpan.textContent = `Reversiones en Curso (${prepList.length})`;
    }
    
    if (prepList.length === 0) {
        container.innerHTML = '<p class="text-secondary" style="font-size: 0.8rem; font-style: italic; text-align: left; margin: 0;">No hay reversiones en curso.</p>';
        return;
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 14px;">`;
    
    prepList.forEach(plan => {
        const stateName = plan.erpState || "En preparación";
        const dateFormatted = new Date(plan.dateCreated).toLocaleDateString();
        const yiqiUrl = `https://me.yiqi.com.ar/view/COTIZACION_COMERCIAL?schemaId=${CONFIG.SCHEMA_ID}#/${plan.docId}`;
        
        let transitionButtonsHtml = "";
        if (stateName === "En preparación") {
            transitionButtonsHtml = `
                <button class="btn btn-primary" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); executePreparacionTransition('${plan.id}', '${plan.docId}', 117982, 'En validación')" title="Pasar a En Validación">
                    ⚙️ Validar
                </button>
            `;
        } else if (stateName === "En validación") {
            transitionButtonsHtml = `
                <button class="btn btn-success" style="font-size: 0.75rem; padding: 5px 10px;" onclick="event.stopPropagation(); executePreparacionTransition('${plan.id}', '${plan.docId}', 117983, 'Enviada')" title="Pasar a Enviada">
                    🚀 Enviar (Pasar a Activa)
                </button>
            `;
        }
        
        html += `
            <div class="crm-plan-card" style="border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-card); padding: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                <div style="flex-grow: 1;">
                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                        <span style="font-size: 1rem; font-weight: 700; color: var(--text-primary);">COTIZACION N° ${plan.docDisplayNum}</span>
                        <span class="badge" style="background: ${stateName === 'En validación' ? '#e67e22' : '#7f8c8d'}; color: #fff; font-size: 0.7rem; padding: 2px 6px;">
                            ${stateName}
                        </span>
                    </div>
                    <div style="font-size: 0.8rem; color: var(--text-secondary); display: flex; gap: 12px; flex-wrap: wrap;">
                        <span><strong>Total:</strong> ${formatCurrency(plan.docTotal)}</span>
                        <span><strong>Iniciado:</strong> ${dateFormatted}</span>
                    </div>
                </div>
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                    <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); loadQuoteIntoCartForEditing('${plan.docId}')" title="Editar cotización en Canasta de Venta">
                        ✏️ Editar
                    </button>
                    ${transitionButtonsHtml}
                    <button class="btn btn-secondary" style="font-size: 0.75rem; padding: 5px 10px; border: 1px solid var(--border-color); background: var(--bg-card);" onclick="event.stopPropagation(); window.open('${yiqiUrl}', '_blank')" title="Ver en YiQi ERP">
                        🔗 Ver en YiQi
                    </button>
                </div>
            </div>
        `;
    });
    
    html += `</div>`;
    container.innerHTML = html;
}

// Execute transition for a preparation/validation quote
async function executePreparacionTransition(planId, docId, transitionId, targetStateName) {
    showLoader(`Actualizando estado de cotización a "${targetStateName}"...`);
    try {
        const res = await executeTransitionWithRetry(docId, transitionId, `Transición a ${targetStateName}`);
        if (!res.ok) {
            throw new Error(res.error || "La transición falló en YiQi");
        }
        
        // Update followup state in CRM
        const followups = getCrmFollowups();
        const plan = followups.find(f => String(f.id) === String(planId));
        if (plan) {
            plan.erpState = targetStateName;
            if (targetStateName === "Enviada") {
                plan.status = "ABIERTO";
                plan.closeDate = null;
                showAppNotification("Cotización Enviada", `La cotización N° ${plan.docDisplayNum} ahora está activa y en seguimiento.`, "success");
            } else if (targetStateName === "En validación") {
                plan.status = "PREPARACION";
                showAppNotification("Cotización en Validación", `La cotización N° ${plan.docDisplayNum} pasó a estado "En validación".`, "success");
            }
            saveCrmFollowups(followups, plan);
        }
        
        hideLoader();
        renderAllCrmSections();
        renderCrmAlerts();
    } catch (e) {
        console.error("Error executing preparation transition:", e);
        hideLoader();
        showAppNotification("Error al cambiar estado", `No se pudo cambiar el estado en YiQi: ${e.message}`, "danger");
    }
}

// Clean up the draft/versioned quote that was being edited after successful submission
async function cleanupDraftQuoteAfterSubmit(oldDocId, oldPlanId) {
    if (!oldDocId) return;
    console.log(`Cleaning up old draft quote ${oldDocId} (plan ${oldPlanId})...`);
    
    // 1. Run reject transition in YiQi ERP in the background
    try {
        executeTransitionWithRetry(oldDocId, CONFIG.TRANSITION_COTI_RECHAZAR, "Rechazar Cotización Borrador/Preparación")
            .then(res => {
                if (res.ok) {
                    console.log(`Successfully rejected/closed draft quote ${oldDocId} in YiQi ERP.`);
                } else {
                    console.warn(`Could not reject draft quote ${oldDocId} in YiQi ERP: ${res.error}`);
                }
            });
    } catch (e) {
        console.warn(`Failed to execute reject transition on draft quote ${oldDocId}:`, e);
    }
    
    // 2. Remove the old plan from local storage and Firestore
    try {
        const followups = getCrmFollowups();
        const updatedFollowups = followups.filter(f => String(f.id) !== String(oldPlanId) && String(f.docId) !== String(oldDocId));
        if (updatedFollowups.length !== followups.length) {
            localStorage.setItem("tmc_crm_followups", JSON.stringify(updatedFollowups));
            saveCrmDataOnBackend("deleteFollowup", { id: oldPlanId });
            console.log(`Removed draft plan ${oldPlanId} from CRM.`);
        }
    } catch (e) {
        console.error(`Error deleting old plan ${oldPlanId} from CRM:`, e);
    }
}

// Load quotes into cart for editing/finalizing
async function loadQuoteIntoCartForEditing(quoteId) {
    showLoader("Obteniendo detalles de cotización...");
    try {
        // 1. Get quote header details to find client, global discount, observations, sucursal
        const headerUrl = `${CONFIG.GETINSTANCE_BASE}?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&id=${quoteId}`;
        const headerRes = await apiCall(headerUrl, "GET");
        const quoteObj = headerRes.data || headerRes.instances || headerRes;
        
        if (!quoteObj || !quoteObj.atts) {
            throw new Error("No se encontraron atributos en el ERP para esta cotización.");
        }
        
        const yiqiClientId = quoteObj.atts["7079"]?.value; // Client ID
        const obs = quoteObj.atts["5176"]?.value || ""; // Observations
        const discountVal = parseFloat(quoteObj.atts["7083"]?.value || 0); // Global discount
        const branchId = quoteObj.atts["7628"]?.value || ""; // Sucursal
        const condVentaId = quoteObj.atts["10349"]?.value || ""; // Payment Condition
        const trloId = quoteObj.atts["11372"]?.value || ""; // Transportista
        
        // Find corresponding client in local client list or set it
        if (!selectedClient || String(selectedClient.id) !== String(yiqiClientId)) {
            showLoader("Cargando cliente...");
            await loadCrmClientData(yiqiClientId);
        }
        
        // 2. Fetch lines
        showLoader("Cargando artículos de la cotización...");
        const childUrl = `https://api.yiqi.com.ar/api/childrenApi/GetChildList?entityId=865&schemaId=${CONFIG.SCHEMA_ID}&childId=249&instanceId=${quoteId}`;
        const childRes = await apiCall(childUrl, "GET");
        const lines = childRes.data || childRes.rows || childRes.instances || [];
        
        // 3. Clear/Reset cart
        resetCart();
        
        // Ensure articles are loaded
        if (articlesCache.length === 0) {
            await syncArticlesMaster();
        }
        
        // 4. Match lines to articlesCache and populate cart
        let matchedCount = 0;
        lines.forEach(item => {
            const sku = (item.MATE_CODIGO || "").trim().toUpperCase();
            const artObj = articlesCache.find(a => (a.MATE_CODIGO || "").trim().toUpperCase() === sku);
            
            const basePrice = (item.DECO_PRECIO_UNITARIO !== undefined && item.DECO_PRECIO_UNITARIO !== null) ? parseFloat(item.DECO_PRECIO_UNITARIO) : 0;
            let discountPct = (item.DECO_DTO_ADICIONAL !== undefined && item.DECO_DTO_ADICIONAL !== null) ? parseFloat(item.DECO_DTO_ADICIONAL) : NaN;
            if (isNaN(discountPct)) {
                discountPct = selectedClient ? parseFloat(selectedClient.typeDiscount || 0) : 0.0;
            }
            
            if (artObj) {
                cart.push({
                    id: artObj.ID,
                    sku: sku,
                    name: artObj.MATE_NOMBRE || item.DECO_NOMBRE_MATE,
                    qty: parseFloat(item.DECO_CANTIDAD) || 1,
                    priceListNet: artObj.pneto || basePrice,
                    clientTypeDiscount: discountPct,
                    manualBasePrice: basePrice,
                    discount: discountPct,
                    hasCustomDiscount: discountPct > 0,
                    vatPercent: artObj.vatPercent || parseFloat(item.ALIV_NOMBRE) || 0.0,
                    alicuotaId: artObj.ALIV_ID_ALIV || artObj.aliv_id_aliv || 1,
                    additionalText: item.DECO_TEXTO_ADICIONAL || ""
                });
                matchedCount++;
            } else {
                cart.push({
                    id: item.MATE_ID_MATE || 999999,
                    sku: sku,
                    name: item.DECO_NOMBRE_MATE || "Artículo Desconocido",
                    qty: parseFloat(item.DECO_CANTIDAD) || 1,
                    priceListNet: basePrice,
                    clientTypeDiscount: discountPct,
                    manualBasePrice: basePrice,
                    discount: discountPct,
                    hasCustomDiscount: discountPct > 0,
                    vatPercent: parseFloat(item.ALIV_NOMBRE) || 0.0,
                    alicuotaId: 1,
                    additionalText: item.DECO_TEXTO_ADICIONAL || ""
                });
                matchedCount++;
            }
        });
        
        // Set global discount
        globalDiscount = discountVal;
        const discField = document.getElementById("global-discount-field");
        if (discField) discField.value = discountVal;
        const discBadge = document.getElementById("global-discount-val-badge");
        if (discBadge) discBadge.textContent = `${discountVal}%`;
        
        // Set observations
        const obsField = document.getElementById("doc-observations");
        if (obsField) obsField.value = obs;
        
        // Set sucursal/branch in UI
        const branchSelect = document.getElementById("doc-sucursal");
        if (branchSelect && branchId) {
            branchSelect.value = String(branchId);
        }
        
        // Set payment condition in UI
        const condPagoSelect = document.getElementById("doc-cond-pago");
        if (condPagoSelect && condVentaId) {
            condPagoSelect.value = String(condVentaId);
        }
        
        // Set transportista in UI
        const metodoEnvioSelect = document.getElementById("doc-metodo-envio");
        if (metodoEnvioSelect && trloId) {
            metodoEnvioSelect.value = String(trloId);
        }
        
        // Store that we are editing this quote
        editingVersionOfDocId = String(quoteId);
        const followups = getCrmFollowups();
        const plan = followups.find(f => String(f.docId) === String(quoteId));
        if (plan) {
            editingVersionOfPlanId = plan.id;
        } else {
            editingVersionOfPlanId = null;
        }
        
        updateCartHeader();
        
        hideLoader();
        showAppNotification("Cotización cargada", `Se cargaron ${matchedCount} artículos en la canasta de venta.`, "success");
        
        // Switch to the creator view and render
        switchView("commercial-creator");
        renderCart();
        renderArticlesList();
        
    } catch (e) {
        console.error("Error loading quote into cart:", e);
        hideLoader();
        showAppNotification("Error al cargar artículos", e.message, "danger");
    }
}

// Render helper to render all client sections
function renderAllCrmSections() {
    renderClientCrmPlan();
    renderClientCrmPreparacion();
    renderClientCrmReversiones();
    renderClientCrmHistory();
}

// Scan and render alerts on general dashboard
function renderCrmAlerts() {
    const alertsContainer = document.getElementById("crm-alerts-container");
    const activeListContainer = document.getElementById("crm-active-list-container");
    
    if (!alertsContainer || !activeListContainer) return;
    
    const followups = getCrmFollowups();
    const activePlans = followups.filter(f => f.status === "ABIERTO");
    
    const alerts = [];
    const regularActive = [];
    const now = new Date();
    
    activePlans.forEach(plan => {
        const currentStepIdx = plan.currentStep;
        const step = plan.steps[currentStepIdx] || plan.steps[plan.steps.length - 1];
        
        if (step) {
            const stepDueDate = step.dueDate.includes("T") ? new Date(step.dueDate) : new Date(step.dueDate + "T00:00:00");
            let isOverdue = false;
            let isToday = false;
            
            if (step.dueDate.includes("T")) {
                if (stepDueDate.getTime() < now.getTime()) {
                    isOverdue = true;
                } else {
                    const todayStr = formatDateISO(now);
                    const dueDayStr = step.dueDate.split('T')[0];
                    if (dueDayStr === todayStr) {
                        isToday = true;
                    }
                }
            } else {
                const todayStr = formatDateISO(now);
                const todayTime = new Date(todayStr + "T00:00:00").getTime();
                const stepDueTime = stepDueDate.getTime();
                if (stepDueTime < todayTime) {
                    isOverdue = true;
                } else if (stepDueTime === todayTime) {
                    isToday = true;
                }
            }
            
            if (isOverdue || isToday) {
                alerts.push({
                    plan: plan,
                    step: step,
                    isOverdue: isOverdue,
                    isToday: isToday
                });
            } else {
                regularActive.push({
                    plan: plan,
                    step: step
                });
            }
        }
    });
    
    // Render Alerts
    if (alerts.length === 0) {
        alertsContainer.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <div class="empty-icon">🎉</div>
                <p class="empty-title">¡Todo al día!</p>
                <p class="empty-desc">No tenés llamados o seguimientos programados pendientes para hoy.</p>
            </div>
        `;
    } else {
        alerts.sort((a, b) => {
            if (a.isOverdue && !b.isOverdue) return -1;
            if (!a.isOverdue && b.isOverdue) return 1;
            return a.step.dueDate.localeCompare(b.step.dueDate);
        });
        
        let alertsHtml = "";
        alerts.forEach(item => {
            const plan = item.plan;
            const step = item.step;
            const overdueClass = item.isOverdue ? "overdue" : "";
            const badgeText = item.isOverdue ? "ATRASADO" : "HOY";
            const badgeStyle = item.isOverdue 
                ? "background: var(--danger-light); color: var(--danger); border: 1px solid hsla(360, 85%, 55%, 0.2);" 
                : "background: var(--warning-light); color: var(--warning); border: 1px solid hsla(35, 90%, 46%, 0.2);";
                
            const dueFormatted = formatStepDueDate(step.dueDate);
            
            alertsHtml += `
                <div class="crm-followup-alert-item ${overdueClass}">
                    <div class="crm-alert-info">
                        <span class="crm-alert-name">${plan.clientName}</span>
                        <span class="crm-alert-meta">
                            <strong>${step.title}</strong> (Vence: ${dueFormatted})
                            <br>
                            Asociado a: ${plan.docType} N° ${plan.docDisplayNum || plan.docId} (${formatCurrency(plan.docTotal)})
                        </span>
                    </div>
                    <div style="display: flex; align-items: center;">
                        <span class="crm-step-badge" style="${badgeStyle} margin-right: 12px; font-size: 0.65rem;">${badgeText}</span>
                        <button class="btn btn-primary crm-alert-action-btn" onclick="goToClientCrmFromAlert('${plan.clientId}', '${plan.clientName.replace(/'/g, "\\'")}')">Gestionar</button>
                    </div>
                </div>
            `;
        });
        alertsContainer.innerHTML = alertsHtml;
    }
    
    // Render Recent Active List
    const allActive = [...alerts, ...regularActive.map(x => ({ ...x, isOverdue: false, isToday: false }))];
    
    if (allActive.length === 0) {
        activeListContainer.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <div class="empty-icon">📁</div>
                <p class="empty-title">Sin seguimientos</p>
                <p class="empty-desc">Las cotizaciones guardadas aparecerán acá con su correspondiente plan de seguimiento.</p>
            </div>
        `;
    } else {
        allActive.sort((a, b) => b.plan.dateCreated.localeCompare(a.plan.dateCreated));
        
        let activeHtml = "";
        allActive.forEach(item => {
            const plan = item.plan;
            const step = item.step;
            const dueFormatted = formatStepDueDate(step.dueDate);
            
            activeHtml += `
                <div class="crm-followup-alert-item" style="border-left-color: var(--primary);">
                    <div class="crm-alert-info">
                        <span class="crm-alert-name">${plan.clientName}</span>
                        <span class="crm-alert-meta">
                            Plan: <strong>${step.title}</strong> (Próx. Vence: ${dueFormatted})
                            <br>
                            Doc: ${plan.docType} N° ${plan.docDisplayNum || plan.docId} (${formatCurrency(plan.docTotal)})
                        </span>
                    </div>
                    <div>
                        <button class="btn btn-secondary crm-alert-action-btn" style="border-color: var(--primary); color: var(--primary);" onclick="goToClientCrmFromAlert('${plan.clientId}', '${plan.clientName.replace(/'/g, "\\'")}')">Ver Ficha</button>
                    </div>
                </div>
            `;
        });
        activeListContainer.innerHTML = activeHtml;
    }
}

function goToClientCrmFromAlert(clientId, clientName) {
    selectClient(clientId, clientName);
}

// Show stock by deposit breakdown in a small modal
async function showStockBreakdown(sku, articleName) {
    // 1. Open the modal in loading state
    showModal({
        title: `<div>Ubicaciones de Stock — ${sku}</div><div style="font-size: 0.82rem; font-weight: normal; color: var(--text-muted); margin-top: 4px; text-transform: none; line-height: 1.3;">${articleName || ''}</div>`,
        content: `
            <div style="text-align: center; padding: 24px;" id="stock-breakdown-loading">
                <div class="loader-spinner" style="margin: 0 auto 12px auto; width: 30px; height: 30px; border-width: 3px;"></div>
                <p class="text-secondary" style="font-size: 0.85rem;">Consultando depósitos en YiQi ERP...</p>
            </div>
            <div id="stock-breakdown-content" style="display: none;"></div>
        `,
        actions: [
            { text: "Cerrar", class: "btn-secondary", close: true }
        ]
    });
    
    try {
        // 2. Query Smartie 2796 (Stock Completo) with SKU search
        const url = `${CONFIG.GETLIST_BASE}?entityId=794&schemaId=${CONFIG.SCHEMA_ID}&smartieId=2796`;
        const body = {
            page: 1,
            pageSize: 100, // plenty of room for all deposits of a single SKU
            search: sku
        };
        const response = await apiCall(url, "POST", body);
        const rows = response.data || response.rows || response.instances || [];
        
        // 3. Filter for exact SKU matches (ignoring whitespaces/case)
        const cleanSku = sku.trim().toUpperCase();
        const exactMatches = rows.filter(r => (r.STOC_SKU || "").trim().toUpperCase() === cleanSku);
        
        const loadingEl = document.getElementById("stock-breakdown-loading");
        const contentEl = document.getElementById("stock-breakdown-content");
        
        if (loadingEl && contentEl) {
            loadingEl.style.display = "none";
            
            if (exactMatches.length === 0) {
                contentEl.innerHTML = `
                    <div style="text-align: center; padding: 16px;">
                        <div style="font-size: 2rem; margin-bottom: 8px;">📦</div>
                        <p style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Sin stock registrado</p>
                        <p class="text-secondary" style="font-size: 0.8rem; margin-top: 4px;">No se encontraron registros de stock físico para el artículo en YiQi ERP.</p>
                    </div>
                `;
            } else {
                contentEl.innerHTML = `
                    <div style="padding: 6px;">
                        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 12px; padding: 2px 4px;">
                            <input type="checkbox" id="chk-show-zero-stock" style="width: 15px; height: 15px; cursor: pointer;">
                            <label for="chk-show-zero-stock" style="font-size: 0.82rem; color: var(--text-secondary); cursor: pointer; user-select: none; font-weight: 600;">
                                Mostrar depósitos con stock 0
                            </label>
                        </div>
                        <table style="width: 100%; border-collapse: collapse; margin-bottom: 14px; font-size: 0.85rem;">
                            <thead>
                                <tr>
                                    <th style="text-align: left; padding: 8px 12px; border-bottom: 2px solid var(--border-color); color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem;">Depósito / Ubicación</th>
                                    <th style="text-align: right; padding: 8px 12px; border-bottom: 2px solid var(--border-color); color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem;">Stock Físico</th>
                                    <th style="text-align: right; padding: 8px 12px; border-bottom: 2px solid var(--border-color); color: var(--text-secondary); text-transform: uppercase; font-size: 0.75rem;">Fact. Producción</th>
                                </tr>
                            </thead>
                            <tbody id="stock-breakdown-tbody"></tbody>
                            <tfoot>
                                <tr style="background: var(--bg-input); font-weight: 700;">
                                    <td style="padding: 10px 12px; text-align: left; border-radius: var(--radius-sm) 0 0 var(--radius-sm); color: var(--text-primary);">TOTAL GENERAL</td>
                                    <td id="stock-breakdown-total-fisico" style="padding: 10px 12px; text-align: right; color: var(--primary); font-family: var(--font-mono);">
                                        0 u.
                                    </td>
                                    <td id="stock-breakdown-total-fact" style="padding: 10px 12px; text-align: right; color: var(--success); font-family: var(--font-mono); border-radius: 0 var(--radius-sm) var(--radius-sm) 0;">
                                        0 u.
                                    </td>
                                </tr>
                              </tfoot>
                        </table>
                    </div>
                `;
                
                const renderModalRows = () => {
                    const showZero = document.getElementById("chk-show-zero-stock")?.checked || false;
                    let rowsHtml = "";
                    let totalFisico = 0;
                    let totalFact = 0;
                    
                    exactMatches.forEach(item => {
                        const qty = parseFloat(item.STOC_CANTIDAD) || 0.0;
                        const factQty = parseFloat(item.STOC_FACTIBILIDAD_PRODUCC) || 0.0;
                        totalFisico += qty;
                        totalFact += factQty;
                        
                        if (qty === 0 && factQty === 0 && !showZero) {
                            return;
                        }
                        
                        const qtyClass = qty > 0 ? "text-success" : (qty < 0 ? "text-danger" : "text-muted");
                        const factQtyClass = factQty > 0 ? "text-success" : "text-muted";
                        
                        rowsHtml += `
                            <tr>
                                <td style="padding: 10px 12px; font-weight: 600; text-align: left; border-bottom: 1px solid var(--border-color); color: var(--text-primary);">
                                    🏢 ${item.CEDI_NOMBRE || item.CEDI_CODIGO || "Depósito Desconocido"}
                                </td>
                                <td class="${qtyClass}" style="padding: 10px 12px; text-align: right; font-weight: 700; font-family: var(--font-mono); border-bottom: 1px solid var(--border-color);">
                                    ${qty} u.
                                </td>
                                <td class="${factQtyClass}" style="padding: 10px 12px; text-align: right; font-weight: 700; font-family: var(--font-mono); border-bottom: 1px solid var(--border-color);">
                                    ${factQty} u.
                                </td>
                            </tr>
                        `;
                    });
                    
                    const tbodyEl = document.getElementById("stock-breakdown-tbody");
                    if (tbodyEl) {
                        tbodyEl.innerHTML = rowsHtml || `<tr><td colspan="3" style="text-align: center; padding: 20px; color: var(--text-muted); font-style: italic;">No hay depósitos con stock para mostrar.</td></tr>`;
                    }
                    
                    const totalFisicoEl = document.getElementById("stock-breakdown-total-fisico");
                    if (totalFisicoEl) {
                        totalFisicoEl.textContent = `${totalFisico} u.`;
                    }
                    
                    const totalFactEl = document.getElementById("stock-breakdown-total-fact");
                    if (totalFactEl) {
                        totalFactEl.textContent = `${totalFact} u.`;
                    }
                };
                
                // Initial render
                renderModalRows();
                
                // Setup change event
                const chk = document.getElementById("chk-show-zero-stock");
                if (chk) {
                    chk.onchange = renderModalRows;
                }
            }
            contentEl.style.display = "block";
        }
    } catch (err) {
        console.error("Error loading stock breakdown:", err);
        const loadingEl = document.getElementById("stock-breakdown-loading");
        if (loadingEl) {
            loadingEl.innerHTML = `
                <div style="color: var(--danger); font-size: 1.5rem; margin-bottom: 8px;">✕</div>
                <p style="font-weight: 600; font-size: 0.9rem; color: var(--text-primary);">Error de Conexión</p>
                <p class="text-secondary" style="font-size: 0.8rem; margin-top: 4px;">No se pudo conectar con YiQi ERP para traer el detalle de depósitos.</p>
            `;
        }
    }
}

// --- NEW CRM DELAY METRICS, TABS AND CONFIGURATION ---

// Helper to calculate delay in days
function getStepDelayDays(step) {
    if (step.delayDays !== undefined) return step.delayDays;
    if (!step.completed || !step.completedDate) return 0;
    const due = step.dueDate.includes("T") ? new Date(step.dueDate) : new Date(step.dueDate + "T00:00:00");
    const comp = new Date(step.completedDate);
    due.setHours(0,0,0,0);
    comp.setHours(0,0,0,0);
    const diffTime = comp.getTime() - due.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays : 0;
}

// Assign plan to client preference
function assignPlanToClient(clientId, planTemplateId) {
    const clientPlans = JSON.parse(localStorage.getItem("tmc_client_plans") || "{}");
    clientPlans[clientId] = planTemplateId;
    localStorage.setItem("tmc_client_plans", JSON.stringify(clientPlans));
    showAppNotification("Plan Asignado", "Se actualizó el plan de seguimiento asignado a este cliente.", "success");
    
    saveCrmDataOnBackend("saveClientPlan", { clientId, planTemplateId });
}

// Plan templates getters and setters
function getPlanTemplates() {
    const saved = localStorage.getItem("tmc_crm_plan_templates");
    if (!saved) {
        const defaults = [
            {
                id: "standard",
                name: "Plan Estándar (3-7-15 días)",
                steps: [
                    { title: "Llamada a los 3 días", days: 3, message: "Hola {cliente}, ¿cómo estás? Te escribo por la cotización n° {cotizacion} que te envié hace unos días. ¿Pudiste verla? ¿Tenés alguna duda o te puedo ayudar en algo?\n\nPodes ver el detalle ingresando al siguiente link: {url_pdf}" },
                    { title: "Recontacto a los 7 días", days: 7, message: "Hola {cliente}, ¿cómo estás? Te contacto para ver si pudiste revisar el presupuesto n° {cotizacion} que te enviamos. A continuación te detallo los productos:\n\n{detalle_items}\n\nQuedo a tu disposición." },
                    { title: "Cierre comercial a los 15 días", days: 15, message: "Hola {cliente}, ¿cómo estás? Te escribo por la cotización n° {cotizacion} para saber si definieron la compra o si precisan que realicemos alguna modificación. Quedo atento a tus comentarios. Saludos!" }
                ]
            },
            {
                id: "express",
                name: "Plan Express (1-3-5 días)",
                steps: [
                    { title: "Contacto Express 24hs", days: 1, message: "Hola {cliente}, ¿cómo estás? Te escribo para enviarte el detalle informal de los productos presupuestados en la cotización n° {cotizacion}:\n\n{detalle_items}\n\nTambién podés ver el PDF en este link: {url_pdf}" },
                    { title: "Llamada a los 3 días", days: 3, message: "Hola {cliente}, te escribo para consultar si pudiste revisar la cotización n° {cotizacion} enviada el {fecha_doc}. Quedamos a disposición por cualquier consulta." },
                    { title: "Cierre comercial a los 5 días", days: 5, message: "Hola {cliente}, te contacto por la cotización n° {cotizacion}. Quería saber si resolvemos el pedido hoy para poder coordinar la entrega esta misma semana. Saludos!" }
                ]
            },
            {
                id: "longterm",
                name: "Plan Largo Plazo (5-15-30 días)",
                steps: [
                    { title: "Llamada a los 5 días", days: 5, message: "Hola {cliente}, ¿cómo estás? Te escribo para consultar si pudiste ver la cotización n° {cotizacion} que te enviamos. Podes ver el PDF aquí: {url_pdf}\n\nCualquier consulta avisame!" },
                    { title: "Seguimiento a los 15 días", days: 15, message: "Hola {cliente}, ¿cómo estás? Te escribo para ver si quedó pendiente la cotización n° {cotizacion} por {detalle_items}." },
                    { title: "Cierre a los 30 días", days: 30, message: "Hola {cliente}, te contacto por la cotización n° {cotizacion}. Visto que pasó un tiempo desde el presupuesto, queríamos saber si la compra sigue en pie o si preferís darla de baja. Saludos!" }
                ]
            }
        ];
        localStorage.setItem("tmc_crm_plan_templates", JSON.stringify(defaults));
        return defaults;
    }
    try {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
        console.error("Error parsing templates:", e);
        return [];
    }
}

function savePlanTemplates(templates) {
    localStorage.setItem("tmc_crm_plan_templates", JSON.stringify(templates));
}

// Tab navigation controller
function switchDashboardTab(tabId) {
    // Hide all subviews
    document.querySelectorAll(".subview-crm-general").forEach(el => {
        el.style.display = "none";
    });
    
    // Clear inbox poll interval if we are switching away from inbox
    if (tabId !== "inbox" && window.inboxPollInterval) {
        clearInterval(window.inboxPollInterval);
        window.inboxPollInterval = null;
    }
    
    // Hide or show the top search hero section depending on tab to maximize visual space
    const heroSearch = document.querySelector(".crm-hero-search");
    if (heroSearch) {
        if (tabId === "alertas") {
            heroSearch.style.display = "block";
        } else {
            heroSearch.style.display = "none";
        }
    }
    
    // Show target subview
    const target = document.getElementById(`subview-${tabId}`);
    if (target) {
        target.style.display = "flex";
    }
    
    // Update tab buttons style
    document.querySelectorAll(".crm-dashboard-tab-btn").forEach(btn => {
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-secondary");
    });
    
    const activeBtn = document.getElementById(`tab-btn-${tabId}`);
    if (activeBtn) {
        activeBtn.classList.remove("btn-secondary");
        activeBtn.classList.add("btn-primary");
    }
    
    // Render subview details
    if (tabId === "tablero") {
        const activeSubtabBtn = document.querySelector(".tablero-subtab-btn.btn-primary");
        const activeSubtab = activeSubtabBtn 
            ? activeSubtabBtn.id.replace("tablero-subtab-btn-", "") 
            : "seguimientos";
        switchTableroSubtab(activeSubtab);
    } else if (tabId === "estadisticas") {
        renderCrmStatsChart();
    } else if (tabId === "configuracion") {
        renderCrmPlanConfig();
    } else if (tabId === "inbox") {
        if (window.initCrmInbox) {
            window.initCrmInbox();
        }
    }
}

// Render delays dashboard control board
function renderCrmControlBoard() {
    const container = document.getElementById("crm-control-board-container");
    if (!container) return;
    
    // Get filter dates
    const dateFromInput = document.getElementById("tablero-date-from");
    const dateToInput = document.getElementById("tablero-date-to");
    const fromVal = dateFromInput ? dateFromInput.value : "";
    const toVal = dateToInput ? dateToInput.value : "";
    
    const followups = getCrmFollowups();
    let completedSteps = [];
    let onTimeCount = 0;
    let delayedCount = 0;
    let totalDelayDays = 0;
    const now = new Date();
    
    followups.forEach(plan => {
        // Find the active step if the plan is open
        const activeStep = plan.status === "ABIERTO" ? plan.steps.find(s => !s.completed) : null;
        
        plan.steps.forEach(step => {
            if (step.completed) {
                // Completed step
                if (step.completedDate) {
                    const compStr = step.completedDate.split('T')[0];
                    if (fromVal && compStr < fromVal) return;
                    if (toVal && compStr > toVal) return;
                }
                const delay = getStepDelayDays(step);
                completedSteps.push({
                    clientName: plan.clientName,
                    clientId: plan.clientId,
                    docType: plan.docType,
                    docDisplayNum: plan.docDisplayNum || plan.docId,
                    title: step.title,
                    dueDate: step.dueDate,
                    completedDate: step.completedDate,
                    delayDays: delay,
                    notes: step.notes
                });
                
                if (delay > 0) {
                    delayedCount++;
                    totalDelayDays += delay;
                } else {
                    onTimeCount++;
                }
            } else if (activeStep && step.id === activeStep.id) {
                // Active step of an open plan (overdue check)
                const dueTime = step.dueDate.includes("T") ? new Date(step.dueDate).getTime() : new Date(step.dueDate + "T00:00:00").getTime();
                const nowTime = now.getTime();
                
                // Date filter for active step (using due date)
                const dueStr = step.dueDate.split('T')[0];
                if (fromVal && dueStr < fromVal) return;
                if (toVal && dueStr > toVal) return;
                
                let delay = 0;
                if (dueTime < nowTime) {
                    const delayMs = nowTime - dueTime;
                    delay = Math.ceil(delayMs / (1000 * 60 * 60 * 24));
                }
                
                completedSteps.push({
                    clientName: plan.clientName,
                    clientId: plan.clientId,
                    docType: plan.docType,
                    docDisplayNum: plan.docDisplayNum || plan.docId,
                    title: step.title,
                    dueDate: step.dueDate,
                    completedDate: null,
                    delayDays: delay,
                    notes: "Seguimiento pendiente"
                });
                
                if (delay > 0) {
                    delayedCount++;
                    totalDelayDays += delay;
                } else {
                    onTimeCount++;
                }
            }
        });
    });
    
    completedSteps.sort((a, b) => {
        let valA, valB;
        
        switch (tableroSort.column) {
            case 'clientName':
                valA = a.clientName || "";
                valB = b.clientName || "";
                break;
            case 'docType':
                valA = `${a.docType || ""} N° ${a.docDisplayNum || ""}`;
                valB = `${b.docType || ""} N° ${b.docDisplayNum || ""}`;
                break;
            case 'title':
                valA = a.title || "";
                valB = b.title || "";
                break;
            case 'dueDate':
                valA = a.dueDate || "";
                valB = b.dueDate || "";
                break;
            case 'completedDate':
                valA = a.completedDate || "";
                valB = b.completedDate || "";
                break;
            case 'delayDays':
                valA = a.delayDays || 0;
                valB = b.delayDays || 0;
                break;
            default: // 'date'
                valA = a.completedDate || a.dueDate || "";
                valB = b.completedDate || b.dueDate || "";
                break;
        }

        if (typeof valA === 'string' && typeof valB === 'string') {
            return tableroSort.direction === 'asc' 
                ? valA.localeCompare(valB) 
                : valB.localeCompare(valA);
        } else {
            if (valA < valB) return tableroSort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return tableroSort.direction === 'asc' ? 1 : -1;
            return 0;
        }
    });
    
    const totalCompleted = completedSteps.length;
    const efficiency = totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : 100;
    const avgDelay = delayedCount > 0 ? (totalDelayDays / delayedCount).toFixed(1) : "0.0";
    
    let statsHtml = `
        <div class="control-board-metrics">
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; cursor: help;" title="Gestiones Totales: Cantidad total de tareas realizadas e históricas, más las tareas pendientes activas en el rango de fechas.">
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">Gestiones Totales</div>
                <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary);">${totalCompleted}</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; border-left: 4px solid var(--success); cursor: help;" title="A Tiempo: Gestiones completadas antes o en su fecha límite, más gestiones pendientes que aún no han vencido.">
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">A Tiempo</div>
                <div style="font-size: 1.8rem; font-weight: 700; color: var(--success);">${onTimeCount}</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; border-left: 4px solid ${delayedCount > 0 ? 'var(--danger)' : 'var(--border-color)'}; cursor: help;" title="Con Demora: Gestiones completadas tarde, más gestiones pendientes que ya superaron su fecha límite sin completarse.">
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">Con Demora</div>
                <div style="font-size: 1.8rem; font-weight: 700; color: ${delayedCount > 0 ? 'var(--danger)' : 'var(--text-primary)'};">${delayedCount}</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; cursor: help;" title="Eficiencia del Plan: Porcentaje de tareas de seguimiento completadas (o activas) a tiempo. Se calcula como: (Gestiones a Tiempo / Gestiones Totales) * 100.">
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">Eficiencia Plan</div>
                <div style="font-size: 1.8rem; font-weight: 700; color: var(--primary);">${efficiency}%</div>
            </div>
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; cursor: help;" title="Demora Promedio: Promedio de días de retraso registrado en las gestiones completadas tarde o atrasadas. Se calcula como: (Suma de Días de Atraso / Gestiones con Demora).">
                <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">Demora Promedio</div>
                <div style="font-size: 1.8rem; font-weight: 700; color: var(--warning);">${avgDelay} días</div>
            </div>
        </div>
    `;
    
    let tableRows = "";
    if (completedSteps.length === 0) {
        tableRows = `<tr><td colspan="6" style="text-align: center; padding: 20px; color: var(--text-muted); font-style: italic;">No hay registros de gestiones de seguimiento.</td></tr>`;
    } else {
        completedSteps.forEach(row => {
            const completedDateFormatted = row.completedDate 
                ? new Date(row.completedDate).toLocaleDateString() 
                : `<span style="color: var(--text-muted); font-style: italic; font-size: 0.75rem;">Pendiente</span>`;
                
            const dueDateFormatted = row.dueDate.includes("T") 
                ? new Date(row.dueDate).toLocaleDateString() 
                : new Date(row.dueDate + "T00:00:00").toLocaleDateString();
                
            let delayBadge = "";
            if (row.delayDays === 0) {
                delayBadge = `<span class="crm-step-badge done" style="background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3); font-size: 0.7rem; padding: 2px 6px;">✔ A tiempo</span>`;
            } else {
                if (row.completedDate) {
                    delayBadge = `<span class="crm-step-badge pending" style="background: rgba(248, 113, 113, 0.15); color: #f87171; border: 1px solid rgba(248, 113, 113, 0.3); font-size: 0.7rem; padding: 2px 6px;">⚠️ ${row.delayDays} ${row.delayDays === 1 ? 'día' : 'días'} de demora</span>`;
                } else {
                    delayBadge = `<span class="crm-step-badge pending" style="background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-size: 0.7rem; padding: 2px 6px; font-weight: bold;">🔴 ${row.delayDays} ${row.delayDays === 1 ? 'día' : 'días'} de atraso activo</span>`;
                }
            }
                
            tableRows += `
                <tr style="border-bottom: 1px solid var(--border-color);">
                    <td style="padding: 10px 12px; font-weight: 600; color: var(--text-primary); text-align: left;">
                        <a href="javascript:void(0)" onclick="goToClientCrmFromAlert('${row.clientId}', '${row.clientName.replace(/'/g, "\\'")}')" style="color: var(--primary); text-decoration: none;">${row.clientName}</a>
                    </td>
                    <td style="padding: 10px 12px; text-align: left;">${row.docType} N° ${row.docDisplayNum}</td>
                    <td style="padding: 10px 12px; text-align: left; font-weight: 500;">${row.title}</td>
                    <td style="padding: 10px 12px; text-align: center;">${dueDateFormatted}</td>
                    <td style="padding: 10px 12px; text-align: center;">${completedDateFormatted}</td>
                    <td style="padding: 10px 12px; text-align: center;">${delayBadge}</td>
                </tr>
            `;
        });
    }
    
    let tableHtml = `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow-x: auto; margin-top: 15px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                <thead>
                    <tr style="background: var(--bg-input); border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 700;">
                        <th style="padding: 12px; text-align: left; cursor: pointer; user-select: none;" onclick="sortTablero('clientName')">Cliente${getSortIcon('clientName')}</th>
                        <th style="padding: 12px; text-align: left; cursor: pointer; user-select: none;" onclick="sortTablero('docType')">Documento${getSortIcon('docType')}</th>
                        <th style="padding: 12px; text-align: left; cursor: pointer; user-select: none;" onclick="sortTablero('title')">Paso Realizado / Pendiente${getSortIcon('title')}</th>
                        <th style="padding: 12px; text-align: center; width: 100px; cursor: pointer; user-select: none;" onclick="sortTablero('dueDate')">Fecha Límite${getSortIcon('dueDate')}</th>
                        <th style="padding: 12px; text-align: center; width: 100px; cursor: pointer; user-select: none;" onclick="sortTablero('completedDate')">Fecha Gestión${getSortIcon('completedDate')}</th>
                        <th style="padding: 12px; text-align: center; width: 150px; cursor: pointer; user-select: none;" onclick="sortTablero('delayDays')">Estado Demora${getSortIcon('delayDays')}</th>
                    </tr>
                </thead>
                <tbody>
                    ${tableRows}
                </tbody>
            </table>
        </div>
    `;
    
    container.innerHTML = statsHtml + tableHtml;
}

// Generate sort indicator icons for the dashboard headers
function getSortIcon(column) {
    if (tableroSort.column === column) {
        return `<span style="font-size: 0.65rem; color: var(--primary); margin-left: 4px;">${tableroSort.direction === 'asc' ? '▲' : '▼'}</span>`;
    }
    return `<span style="font-size: 0.65rem; color: var(--text-muted); opacity: 0.4; margin-left: 4px;">⇅</span>`;
}

// Handle column header clicks and toggle sort states
function sortTablero(column) {
    if (tableroSort.column === column) {
        tableroSort.direction = tableroSort.direction === 'asc' ? 'desc' : 'asc';
    } else {
        tableroSort.column = column;
        // Dates and numerical delays default to desc, names default to asc
        tableroSort.direction = (column === 'dueDate' || column === 'completedDate' || column === 'delayDays') ? 'desc' : 'asc';
    }
    renderCrmControlBoard();
}

// Calculate quote conversion stats grouped by root families
function getQuoteStats(hidePending = false) {
    const dateFromInput = document.getElementById("stats-date-from");
    const dateToInput = document.getElementById("stats-date-to");
    const fromVal = dateFromInput ? dateFromInput.value : "";
    const toVal = dateToInput ? dateToInput.value : "";

    const followups = getCrmFollowups();
    const quoteFamilies = {};
    
    followups.forEach(f => {
        if (f.docType !== "COTIZACION") return;
        
        // Filter by dateCreated range
        if (f.dateCreated) {
            const createdStr = f.dateCreated.split('T')[0];
            if (fromVal && createdStr < fromVal) return;
            if (toVal && createdStr > toVal) return;
        }
        
        const displayNum = f.docDisplayNum || f.docId;
        const root = String(displayNum).split('.')[0];
        
        if (!quoteFamilies[root]) {
            quoteFamilies[root] = [];
        }
        quoteFamilies[root].push(f);
    });
    
    let totalFamilies = 0;
    let approved = 0;
    let rejected = 0;
    let pending = 0;
    
    for (const root in quoteFamilies) {
        const versions = quoteFamilies[root];
        const isApproved = versions.some(v => v.status === "GANADO");
        
        if (isApproved) {
            approved++;
            totalFamilies++;
        } else {
            versions.sort((a, b) => b.dateCreated.localeCompare(a.dateCreated));
            const latest = versions[0];
            
            if (latest.status === "PERDIDO") {
                rejected++;
                totalFamilies++;
            } else if (latest.status === "ABIERTO") {
                if (!hidePending) {
                    pending++;
                    totalFamilies++;
                }
            }
        }
    }
    
    return {
        total: totalFamilies,
        approved: approved,
        rejected: rejected,
        pending: pending,
        quoteFamilies: quoteFamilies
    };
}

let myStatsChart = null;

// Render stats view and chart using Chart.js or CSS fallback
function renderCrmStatsChart() {
    const hidePending = document.getElementById("chk-hide-pending")?.checked || false;
    const stats = getQuoteStats(hidePending);
    
    const totalEl = document.getElementById("stat-total-quotes");
    const approvedEl = document.getElementById("stat-approved-quotes");
    const rejectedEl = document.getElementById("stat-rejected-quotes");
    const pendingRow = document.getElementById("stat-pending-row");
    const pendingEl = document.getElementById("stat-pending-quotes");
    const conversionEl = document.getElementById("stat-conversion-rate");
    
    if (totalEl) totalEl.textContent = stats.total;
    if (approvedEl) approvedEl.textContent = stats.approved;
    if (rejectedEl) rejectedEl.textContent = stats.rejected;
    
    if (pendingRow) {
        pendingRow.style.display = hidePending ? "none" : "flex";
    }
    if (pendingEl) pendingEl.textContent = stats.pending;
    
    const respondedCount = stats.approved + stats.rejected;
    const conversionRate = respondedCount > 0 ? Math.round((stats.approved / respondedCount) * 100) : 0;
    if (conversionEl) {
        conversionEl.textContent = `${conversionRate}%`;
    }
    
    // Render rejection breakdown
    const breakdownContainer = document.getElementById("crm-stats-rejection-breakdown");
    const barsContainer = document.getElementById("crm-rejection-bars-container");
    if (breakdownContainer && barsContainer) {
        if (stats.rejected > 0 && stats.quoteFamilies) {
            const reasonCounts = {};
            for (const root in stats.quoteFamilies) {
                const versions = stats.quoteFamilies[root];
                const isApproved = versions.some(v => v.status === "GANADO");
                if (!isApproved) {
                    versions.sort((a, b) => b.dateCreated.localeCompare(a.dateCreated));
                    const latest = versions[0];
                    if (latest.status === "PERDIDO") {
                        const reason = latest.rejectionReason || "SIN ESPECIFICAR";
                        reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
                    }
                }
            }
            
            const maxReasonCount = Math.max(...Object.values(reasonCounts), 1);
            let barsHtml = "";
            const sortedReasons = Object.keys(reasonCounts).sort((a, b) => reasonCounts[b] - reasonCounts[a]);
            sortedReasons.forEach(reason => {
                const count = reasonCounts[reason];
                const pct = Math.round((count / stats.rejected) * 100);
                const barPct = Math.round((count / maxReasonCount) * 100);
                barsHtml += `
                    <div class="crm-rejection-card" style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm); display: flex; flex-direction: column; gap: 6px;">
                        <div style="display: flex; justify-content: space-between; font-size: 0.8rem; font-weight: 500;">
                            <span style="color: var(--text-secondary);">${reason}</span>
                            <strong style="color: var(--text-primary);">${count} (${pct}%)</strong>
                        </div>
                        <div style="background: var(--bg-input); border-radius: 4px; height: 8px; width: 100%; overflow: hidden;">
                            <div style="background: var(--danger); width: ${barPct}%; height: 100%; border-radius: 4px;"></div>
                        </div>
                    </div>
                `;
            });
            barsContainer.innerHTML = barsHtml;
            breakdownContainer.style.display = "block";
        } else {
            breakdownContainer.style.display = "none";
            barsContainer.innerHTML = "";
        }
    }
    
    const canvas = document.getElementById("crm-stats-chart");
    if (!canvas) return;
    
    const ctx = canvas.getContext("2d");
    if (myStatsChart) {
        myStatsChart.destroy();
    }
    
    if (typeof Chart === "undefined") {
        renderFallbackChart(canvas, stats, hidePending);
        return;
    }
    
    canvas.style.display = "block";
    const fallbackContainer = document.getElementById("crm-stats-fallback-container");
    if (fallbackContainer) {
        fallbackContainer.style.display = "none";
    }
    
    const labels = hidePending ? ["Aprobadas (Ganadas)", "Rechazadas (Perdidas)"] : ["Aprobadas (Ganadas)", "Rechazadas (Perdidas)", "Pendientes"];
    const data = hidePending ? [stats.approved, stats.rejected] : [stats.approved, stats.rejected, stats.pending];
    const colors = hidePending ? ["#4ade80", "#f87171"] : ["#4ade80", "#f87171", "#60a5fa"];
    
    myStatsChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: labels,
            datasets: [{
                data: data,
                backgroundColor: colors,
                borderWidth: 1,
                borderColor: "var(--border-color)"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        color: "var(--text-primary)",
                        font: { size: 11 }
                    }
                }
            }
        }
    });
}

// Fallback HTML progress bar renderer for offline use
function renderFallbackChart(canvas, stats, hidePending) {
    canvas.style.display = "none";
    let fallbackContainer = document.getElementById("crm-stats-fallback-container");
    if (!fallbackContainer) {
        fallbackContainer = document.createElement("div");
        fallbackContainer.id = "crm-stats-fallback-container";
        canvas.parentNode.appendChild(fallbackContainer);
    }
    fallbackContainer.style.display = "block";
    fallbackContainer.innerHTML = "";
    
    const maxVal = Math.max(stats.approved, stats.rejected, hidePending ? 0 : stats.pending, 1);
    
    const items = [
        { label: "Aprobadas (Ganadas)", value: stats.approved, color: "#4ade80" },
        { label: "Rechazadas (Perdidas)", value: stats.rejected, color: "#f87171" }
    ];
    if (!hidePending) {
        items.push({ label: "Pendientes", value: stats.pending, color: "#60a5fa" });
    }
    
    let html = `<div style="display: flex; flex-direction: column; gap: 14px; padding: 10px; width: 100%; box-sizing: border-box;">`;
    items.forEach(item => {
        const pct = Math.round((item.value / maxVal) * 100);
        html += `
            <div style="text-align: left;">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 4px; font-weight: 500;">
                    <span style="color: var(--text-secondary);">${item.label}</span>
                    <strong style="color: var(--text-primary);">${item.value}</strong>
                </div>
                <div style="background: var(--bg-input); border-radius: 4px; height: 10px; width: 100%; overflow: hidden;">
                    <div style="background: ${item.color}; width: ${pct}%; height: 100%; border-radius: 4px;"></div>
                </div>
            </div>
        `;
    });
    html += `</div>`;
    fallbackContainer.innerHTML = html;
}

let currentConfigSubTab = "planes"; // "planes" or "motivos"

function getRejectionReasons() {
    const data = localStorage.getItem("tmc_crm_rejection_reasons");
    if (!data) {
        return ["COSTO", "PLAZO DE ENTREGA", "FORMAS DE PAGO", "CONSEGUÍ OTRO MEJOR"];
    }
    try {
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        return ["COSTO", "PLAZO DE ENTREGA", "FORMAS DE PAGO", "CONSEGUÍ OTRO MEJOR"];
    } catch (e) {
        return ["COSTO", "PLAZO DE ENTREGA", "FORMAS DE PAGO", "CONSEGUÍ OTRO MEJOR"];
    }
}

function addRejectionReason() {
    const input = document.getElementById("new-rejection-reason");
    const val = input ? input.value.trim().toUpperCase() : "";
    
    if (!val) {
        showAppNotification("Error", "Debe ingresar un nombre para el motivo.", "warning");
        return;
    }
    
    const reasons = getRejectionReasons();
    if (reasons.includes(val)) {
        showAppNotification("Error", "Este motivo ya existe.", "warning");
        return;
    }
    
    reasons.push(val);
    localStorage.setItem("tmc_crm_rejection_reasons", JSON.stringify(reasons));
    
    // Sync to Firestore using template ID "rejection_reasons"
    saveCrmDataOnBackend("saveTemplate", { id: "rejection_reasons", reasons: reasons });
    
    renderCrmConfig();
    showAppNotification("Motivo Agregado", `Se agregó "${val}" con éxito.`, "success");
}

function deleteRejectionReason(idx) {
    const reasons = getRejectionReasons();
    const removed = reasons[idx];
    
    reasons.splice(idx, 1);
    localStorage.setItem("tmc_crm_rejection_reasons", JSON.stringify(reasons));
    
    // Sync to Firestore using template ID "rejection_reasons"
    saveCrmDataOnBackend("saveTemplate", { id: "rejection_reasons", reasons: reasons });
    
    renderCrmConfig();
    showAppNotification("Motivo Eliminado", `Se eliminó "${removed}" con éxito.`, "success");
}

function getSharedMessages() {
    const defaultMessages = {
        initial_quote_whatsapp: "Hola {cliente}, ¿cómo estás? Te comparto la cotización n° {cotizacion} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}",
        initial_pedido_whatsapp: "Hola {cliente}, ¿cómo estás? Te comparto el pedido n° {pedido} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}",
        initial_quote_mail: "Hola {cliente}, ¿cómo estás? Te comparto la cotización n° {cotizacion} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}",
        initial_pedido_mail: "Hola {cliente}, ¿cómo estás? Te comparto el pedido n° {pedido} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}",
        default_followup_quote: "Hola {cliente}, ¿cómo estás? Te escribo por la cotización n° {cotizacion} por {total_doc}. ¿Pudiste revisarla?\n\nPodes ver el detalle ingresando al siguiente link: {url_pdf}",
        default_followup_pedido: "Hola {cliente}, ¿cómo estás? Te contacto para realizar el seguimiento del pedido n° {pedido} por {total_doc}.\n\nQuedo a tu disposición."
    };
    
    try {
        const custom = localStorage.getItem("tmc_crm_shared_messages");
        if (custom) {
            return { ...defaultMessages, ...JSON.parse(custom) };
        }
    } catch (e) {
        console.error("Error parsing tmc_crm_shared_messages:", e);
    }
    return defaultMessages;
}

function saveSharedMessages() {
    const initialQuoteWa = document.getElementById("shared-msg-initial-quote-wa").value;
    const initialPedidoWa = document.getElementById("shared-msg-initial-pedido-wa").value;
    const initialQuoteMail = document.getElementById("shared-msg-initial-quote-mail").value;
    const initialPedidoMail = document.getElementById("shared-msg-initial-pedido-mail").value;
    
    const messagesObj = {
        initial_quote_whatsapp: initialQuoteWa,
        initial_pedido_whatsapp: initialPedidoWa,
        initial_quote_mail: initialQuoteMail,
        initial_pedido_mail: initialPedidoMail
    };
    
    localStorage.setItem("tmc_crm_shared_messages", JSON.stringify(messagesObj));
    
    // Sync to Firestore using template ID "shared_messages"
    saveCrmDataOnBackend("saveTemplate", { id: "shared_messages", messages: messagesObj });
    
    showAppNotification("Mensajes Guardados", "Se guardaron las plantillas de mensajes compartidos en Firestore.", "success");
}
window.saveSharedMessages = saveSharedMessages;

function renderCrmSharedMessagesHtml() {
    const msgs = getSharedMessages();
    
    return `
        <div style="margin-top: 12px; text-align: left;">
            <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 0.95rem;">💬 Configuración de Mensajes Compartidos</h4>
            <p class="text-secondary" style="font-size: 0.8rem; margin-bottom: 20px;">
                Configure los mensajes predeterminados que se envían al cliente al compartir cotizaciones o pedidos por WhatsApp y Mail.
            </p>
            
            <div style="display: flex; flex-direction: column; gap: 20px; max-width: 700px;">
                <div>
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
                        WhatsApp: Compartir Cotización
                    </label>
                    <textarea id="shared-msg-initial-quote-wa" class="form-input" style="width: 100%; min-height: 80px; font-family: monospace; font-size: 0.8rem; padding: 10px; line-height: 1.4; resize: vertical;" placeholder="Ingrese plantilla...">${msgs.initial_quote_whatsapp}</textarea>
                </div>

                <div>
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
                        WhatsApp: Compartir Pedido
                    </label>
                    <textarea id="shared-msg-initial-pedido-wa" class="form-input" style="width: 100%; min-height: 80px; font-family: monospace; font-size: 0.8rem; padding: 10px; line-height: 1.4; resize: vertical;" placeholder="Ingrese plantilla...">${msgs.initial_pedido_whatsapp}</textarea>
                </div>
                
                <div>
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
                        Mail: Compartir Cotización
                    </label>
                    <textarea id="shared-msg-initial-quote-mail" class="form-input" style="width: 100%; min-height: 80px; font-family: monospace; font-size: 0.8rem; padding: 10px; line-height: 1.4; resize: vertical;" placeholder="Ingrese plantilla...">${msgs.initial_quote_mail}</textarea>
                </div>
                
                <div>
                    <label style="display: block; font-size: 0.82rem; font-weight: 600; color: var(--text-primary); margin-bottom: 6px;">
                        Mail: Compartir Pedido
                    </label>
                    <textarea id="shared-msg-initial-pedido-mail" class="form-input" style="width: 100%; min-height: 80px; font-family: monospace; font-size: 0.8rem; padding: 10px; line-height: 1.4; resize: vertical;" placeholder="Ingrese plantilla...">${msgs.initial_pedido_mail}</textarea>
                </div>
                
                <div style="background: rgba(255, 255, 255, 0.02); border: 1px solid var(--border-color); padding: 12px; border-radius: var(--radius-sm);">
                    <h5 style="margin: 0 0 6px 0; font-size: 0.8rem; color: var(--primary);">Variables disponibles:</h5>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 4px; font-size: 0.72rem; color: var(--text-secondary);">
                        <div><code>{cliente}</code> : Nombre del cliente</div>
                        <div><code>{cotizacion}</code> / <code>{pedido}</code> : Nro documento</div>
                        <div><code>{total_doc}</code> : Importe total</div>
                        <div><code>{fecha_doc}</code> : Fecha de documento</div>
                        <div><code>{url_pdf}</code> : Enlace de descarga de PDF</div>
                        <div><code>{vendedor}</code> : Nombre del vendedor</div>
                        <div><code>{detalle_items}</code> : Lista de productos cotizados</div>
                    </div>
                </div>
                
                <div>
                    <button class="btn btn-primary" style="font-size: 0.82rem; padding: 8px 20px;" onclick="saveSharedMessages()">
                        💾 Guardar Plantillas
                    </button>
                </div>
            </div>
        </div>
    `;
}

function renderCrmWhatsappConfigHtml() {
    const apiUrl = localStorage.getItem("tmc_whatsapp_api_url") || "";
    const apiToken = localStorage.getItem("tmc_whatsapp_api_token") || "";
    
    let configs = {};
    try {
        configs = JSON.parse(localStorage.getItem("tmc_whatsapp_configs") || "{}");
    } catch (e) {
        configs = {};
    }
    
    const configFabrica = configs["FÁBRICA"] || configs["FABRICA"] || { apiUrl: "", apiToken: "", name: "Mayoristas" };
    const configAugusto = configs["AUGUSTO"] || { apiUrl: "", apiToken: "", name: "Minoristas" };
    
    return `
        <div style="max-width: 600px; text-align: left;">
            <h4 style="margin-top: 0; margin-bottom: 8px; font-size: 0.95rem; color: var(--text-primary);">🔌 Configuración de API de WhatsApp (Default)</h4>
            <p class="text-secondary" style="font-size: 0.8rem; margin-bottom: 20px; line-height: 1.5;">
                Configura los parámetros para realizar envíos de mensajes de seguimiento de manera automática en segundo plano. Si dejas los campos vacíos, se continuará usando el envío manual a través de WhatsApp Web.
            </p>
            
            <div style="margin-bottom: 16px;">
                <label for="wa-api-url" class="form-label" style="font-weight: 600; margin-bottom: 6px; font-size: 0.8rem; display: block; color: var(--text-primary);">URL del Endpoint / API de WhatsApp</label>
                <input type="text" id="wa-api-url" class="form-input" placeholder="https://api.ejemplo.com/whatsapp/send" style="width: 100%; font-size: 0.85rem; padding: 10px;" value="${apiUrl}">
            </div>
            
            <div style="margin-bottom: 20px;">
                <label for="wa-api-token" class="form-label" style="font-weight: 600; margin-bottom: 6px; font-size: 0.8rem; display: block; color: var(--text-primary);">Token de Autenticación / API Key (Opcional)</label>
                <input type="text" id="wa-api-token" class="form-input" placeholder="Bearer ..." style="width: 100%; font-size: 0.85rem; padding: 10px;" value="${apiToken}">
            </div>

            <!-- Multi-Line Sections -->
            <h4 style="margin-top: 24px; margin-bottom: 8px; font-size: 0.95rem; color: var(--text-primary);">📱 Configuración por Vendedor (Multi-Línea Z-API)</h4>
            <p class="text-secondary" style="font-size: 0.8rem; margin-bottom: 20px; line-height: 1.5;">
                Asigna las APIs específicas de WhatsApp Web (Z-API) para enrutar los mensajes según el vendedor de la cotización.
            </p>

            <!-- Fábrica config -->
            <div style="border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-sm); margin-bottom: 16px; background: rgba(0,0,0,0.01);">
                <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 10px;">🏭 Vendedor: Fábrica (Mayoristas)</div>
                <div style="margin-bottom: 10px;">
                    <label for="wa-fabrica-url" class="form-label" style="font-size: 0.72rem; margin-bottom: 4px;">Z-API Endpoint URL</label>
                    <input type="text" id="wa-fabrica-url" class="form-input" placeholder="https://api.z-api.io/instances/..." style="width: 100%; font-size: 0.82rem; padding: 8px;" value="${configFabrica.apiUrl || ""}">
                </div>
                <div>
                    <label for="wa-fabrica-token" class="form-label" style="font-size: 0.72rem; margin-bottom: 4px;">Z-API Client Token</label>
                    <input type="text" id="wa-fabrica-token" class="form-input" placeholder="Client-Token ..." style="width: 100%; font-size: 0.82rem; padding: 8px;" value="${configFabrica.apiToken || ""}">
                </div>
            </div>

            <!-- Augusto config -->
            <div style="border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-sm); margin-bottom: 24px; background: rgba(0,0,0,0.01);">
                <div style="font-weight: 700; font-size: 0.85rem; color: var(--text-primary); margin-bottom: 10px;">👤 Vendedor: Augusto (Minoristas)</div>
                <div style="margin-bottom: 10px;">
                    <label for="wa-augusto-url" class="form-label" style="font-size: 0.72rem; margin-bottom: 4px;">Z-API Endpoint URL</label>
                    <input type="text" id="wa-augusto-url" class="form-input" placeholder="https://api.z-api.io/instances/..." style="width: 100%; font-size: 0.82rem; padding: 8px;" value="${configAugusto.apiUrl || ""}">
                </div>
                <div>
                    <label for="wa-augusto-token" class="form-label" style="font-size: 0.72rem; margin-bottom: 4px;">Z-API Client Token</label>
                    <input type="text" id="wa-augusto-token" class="form-input" placeholder="Client-Token ..." style="width: 100%; font-size: 0.82rem; padding: 8px;" value="${configAugusto.apiToken || ""}">
                </div>
            </div>
            
            <div style="display: flex; gap: 10px;">
                <button class="btn btn-primary" onclick="saveCrmWhatsappConfig()" style="font-size: 0.82rem; padding: 8px 16px;">💾 Guardar Configuración</button>
                <button class="btn btn-secondary" onclick="testCrmWhatsappConfig()" style="font-size: 0.82rem; padding: 8px 16px; border: 1px solid var(--border-color); background: var(--bg-card);">⚡ Probar Conexión (Test)</button>
            </div>
        </div>
    `;
}

async function saveCrmWhatsappConfig() {
    const url = document.getElementById("wa-api-url").value.trim();
    const token = document.getElementById("wa-api-token").value.trim();
    
    localStorage.setItem("tmc_whatsapp_api_url", url);
    localStorage.setItem("tmc_whatsapp_api_token", token);
    
    // Save Fábrica config
    const fabricaUrl = document.getElementById("wa-fabrica-url").value.trim();
    const fabricaToken = document.getElementById("wa-fabrica-token").value.trim();
    
    // Save Augusto config
    const augustoUrl = document.getElementById("wa-augusto-url").value.trim();
    const augustoToken = document.getElementById("wa-augusto-token").value.trim();

    // Local storage update
    let configs = {};
    try {
        configs = JSON.parse(localStorage.getItem("tmc_whatsapp_configs") || "{}");
    } catch(e) {}
    
    configs["FABRICA"] = { seller: "Fábrica", name: "Mayoristas", apiUrl: fabricaUrl, apiToken: fabricaToken };
    configs["FÁBRICA"] = configs["FABRICA"];
    configs["AUGUSTO"] = { seller: "Augusto", name: "Minoristas", apiUrl: augustoUrl, apiToken: augustoToken };
    
    localStorage.setItem("tmc_whatsapp_configs", JSON.stringify(configs));
    
    // Report to Firestore on backend
    try {
        showLoader("Sincronizando configuraciones con Firestore...");
        await Promise.all([
            saveCrmDataOnBackend("saveWhatsappConfig", configs["FABRICA"]),
            saveCrmDataOnBackend("saveWhatsappConfig", configs["AUGUSTO"])
        ]);
        hideLoader();
        showAppNotification("Configuración Guardada", "Las APIs de WhatsApp se guardaron en local y se sincronizaron con Firestore.", "success");
    } catch(err) {
        hideLoader();
        console.error("Error syncing configs to Firestore:", err);
        showAppNotification("Configuración Guardada Parcial", "Se guardó localmente pero falló la sincronización remota.", "warning");
    }
}
window.saveCrmWhatsappConfig = saveCrmWhatsappConfig;

async function testCrmWhatsappConfig() {
    const url = document.getElementById("wa-api-url").value.trim();
    const token = document.getElementById("wa-api-token").value.trim();
    
    if (!url) {
        showAppNotification("Error", "Debe ingresar una URL para realizar el test.", "warning");
        return;
    }
    
    showLoader("Enviando mensaje de prueba...");
    try {
        const payload = {
            phone: "5491100000000",
            message: "Mensaje de prueba desde el CRM de TMC."
        };
        
        const headers = {
            "Content-Type": "application/json"
        };
        if (token) {
            headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
        }
        
        const response = await fetch(url, {
            method: "POST",
            headers: headers,
            body: JSON.stringify(payload)
        });
        
        hideLoader();
        if (response.ok) {
            showAppNotification("Éxito", "El test se envió correctamente. HTTP " + response.status, "success");
        } else {
            showAppNotification("Error", "La API respondió con código " + response.status, "danger");
        }
    } catch (err) {
        hideLoader();
        showAppNotification("Error de Conexión", "No se pudo conectar a la API: " + err.message, "danger");
    }
}
window.testCrmWhatsappConfig = testCrmWhatsappConfig;

function switchConfigSubTab(tab) {
    currentConfigSubTab = tab;
    renderCrmConfig();
}

// Render the unified Config tab content
function renderCrmConfig() {
    const container = document.getElementById("crm-plan-config-container");
    if (!container) return;
    
    let activePlanesClass = currentConfigSubTab === "planes" ? "btn-primary" : "btn-secondary";
    let activeMotivosClass = currentConfigSubTab === "motivos" ? "btn-primary" : "btn-secondary";
    let activeMensajesClass = currentConfigSubTab === "mensajes" ? "btn-primary" : "btn-secondary";
    let activeWhatsappClass = currentConfigSubTab === "whatsapp" ? "btn-primary" : "btn-secondary";
    
    let html = `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: var(--radius-md); text-align: left;">
            <div style="display: flex; gap: 10px; margin-bottom: 20px; border-bottom: 1px solid var(--border-color); padding-bottom: 12px; flex-wrap: wrap;">
                <button class="btn ${activePlanesClass}" style="font-size: 0.82rem; padding: 6px 14px;" onclick="switchConfigSubTab('planes')">📋 Planes de Seguimiento</button>
                <button class="btn ${activeMotivosClass}" style="font-size: 0.82rem; padding: 6px 14px;" onclick="switchConfigSubTab('motivos')">❌ Motivos de Rechazo</button>
                <button class="btn ${activeMensajesClass}" style="font-size: 0.82rem; padding: 6px 14px;" onclick="switchConfigSubTab('mensajes')">💬 Mensajes Compartidos</button>
                <button class="btn ${activeWhatsappClass}" style="font-size: 0.82rem; padding: 6px 14px;" onclick="switchConfigSubTab('whatsapp')">🔌 API de WhatsApp</button>
            </div>
            
            <div id="crm-config-subtab-content">
    `;
    
    if (currentConfigSubTab === "planes") {
        html += renderCrmPlanConfigHtml();
    } else if (currentConfigSubTab === "motivos") {
        html += renderCrmRejectionReasonsHtml();
    } else if (currentConfigSubTab === "mensajes") {
        html += renderCrmSharedMessagesHtml();
    } else if (currentConfigSubTab === "whatsapp") {
        html += renderCrmWhatsappConfigHtml();
    }
    
    html += `
            </div>
        </div>
    `;
    container.innerHTML = html;
}

// Render configuration templates view content
function renderCrmPlanConfigHtml() {
    const templates = getPlanTemplates();
    
    let templatesHtml = `<div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">`;
    templates.forEach(t => {
        const isBuiltIn = ["standard", "express", "longterm"].includes(t.id);
        const deleteBtn = isBuiltIn 
            ? `<span style="font-size: 0.72rem; color: var(--text-muted); font-style: italic;">Sistema</span>` 
            : `<button class="btn btn-danger" style="font-size: 0.75rem; padding: 4px 8px;" onclick="deletePlanTemplate('${t.id}')">Eliminar</button>`;
            
        let stepsListHtml = "";
        t.steps.forEach((step, idx) => {
            const unitLabel = step.offsetUnit || "días";
            const valLabel = step.offsetVal !== undefined ? step.offsetVal : step.days;
            const hasMsg = step.message ? ' 💬' : '';
            stepsListHtml += `<li style="font-size: 0.78rem; margin-bottom: 4px; color: var(--text-secondary);">Paso ${idx+1}: <strong>${step.title}</strong> (+${valLabel} ${unitLabel})${hasMsg}</li>`;
        });
        
        templatesHtml += `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 16px; border-radius: var(--radius-md); text-align: left; display: flex; justify-content: space-between; align-items: flex-start;">
                <div>
                    <h4 style="margin: 0 0 8px 0; color: var(--primary); font-size: 0.9rem;">${t.name}</h4>
                    <ul style="margin: 0; padding-left: 16px;">
                        ${stepsListHtml}
                    </ul>
                </div>
                <div>
                    ${deleteBtn}
                </div>
            </div>
        `;
    });
    templatesHtml += `</div>`;
    
    let stepsFormHtml = "";
    newPlanSteps.forEach((s, idx) => {
        const unitLabel = s.offsetUnit || "días";
        const valLabel = s.offsetVal !== undefined ? s.offsetVal : s.days;
        const hasMsg = s.message ? ' 💬' : '';
        stepsFormHtml += `
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px; background: var(--bg-input); padding: 6px 12px; border-radius: var(--radius-sm); border: 1px solid var(--border-color);">
                <span style="font-size: 0.75rem; font-weight: bold; color: var(--text-secondary);">Paso ${idx+1}:</span>
                <span style="font-size: 0.78rem; flex-grow: 1; text-align: left; color: var(--text-primary);">${s.title} (+${valLabel} ${unitLabel})${hasMsg}</span>
                <button class="btn btn-icon" style="color: var(--danger); padding: 2px; border: none; background: transparent; cursor: pointer;" onclick="removeStepFromNewPlan(${idx})" title="Quitar Paso">✕</button>
            </div>
        `;
    });
    
    if (newPlanSteps.length === 0) {
        stepsFormHtml = `<p class="text-secondary" style="font-size: 0.78rem; font-style: italic; margin-bottom: 12px; text-align: left;">Aún no has agregado pasos a este plan.</p>`;
    }
    
    let formHtml = `
        <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 20px; border-radius: var(--radius-sm); text-align: left;">
            <h3 style="margin: 0 0 16px 0; font-size: 1rem; border-bottom: 1px solid var(--border-color); padding-bottom: 8px; color: var(--text-primary);">🆕 Crear Nuevo Plan de Seguimiento</h3>
            
            <div style="margin-bottom: 14px;">
                <label style="display: block; font-size: 0.8rem; margin-bottom: 6px; font-weight: 600; color: var(--text-secondary);">Nombre del Plan</label>
                <input type="text" id="new-plan-name" class="form-input" placeholder="Ej: Plan Mayoristas VIP" style="width: 100%;">
            </div>
            
            <div style="border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-sm); background: var(--bg-input); margin-bottom: 14px;">
                <h4 style="margin: 0 0 10px 0; font-size: 0.85rem; color: var(--text-secondary);">Pasos del Plan</h4>
                
                ${stepsFormHtml}
                
                <div style="display: grid; grid-template-columns: 2fr 1fr 1fr; gap: 8px; margin-top: 12px; align-items: end;">
                    <div>
                        <label style="display: block; font-size: 0.7rem; margin-bottom: 4px; color: var(--text-muted);">Título del Paso (Ej: Recontacto de Stock)</label>
                        <input type="text" id="new-step-title" class="form-input" style="padding: 6px; font-size: 0.78rem; width: 100%;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.7rem; margin-bottom: 4px; color: var(--text-muted);">Tiempo</label>
                        <input type="number" id="new-step-offset-val" class="form-input" value="3" min="1" style="padding: 6px; font-size: 0.78rem; width: 100%;">
                    </div>
                    <div>
                        <label style="display: block; font-size: 0.7rem; margin-bottom: 4px; color: var(--text-muted);">Unidad</label>
                        <select id="new-step-offset-unit" class="form-input" style="padding: 6px; font-size: 0.78rem; width: 100%;">
                            <option value="días" selected>Días</option>
                            <option value="horas">Horas</option>
                            <option value="minutos">Minutos</option>
                        </select>
                    </div>
                </div>
                
                <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 4px;">
                    <label style="display: block; font-size: 0.7rem; color: var(--text-muted);">Mensaje de WhatsApp/Gmail predeterminado para este paso (Opcional)</label>
                    <textarea id="new-step-message" class="form-input" style="padding: 6px; font-size: 0.78rem; width: 100%; height: 55px; resize: vertical; line-height: 1.4;" placeholder="Comodines: {cliente}, {vendedor}, {cotizacion}, {url_pdf}, {detalle_items}"></textarea>
                </div>
                
                <div style="margin-top: 10px; display: flex; justify-content: flex-end;">
                    <button class="btn btn-secondary" style="padding: 6px 12px; font-size: 0.78rem;" onclick="addStepToNewPlan()">➕ Agregar Paso al Plan</button>
                </div>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 10px;">
                <button class="btn btn-secondary" onclick="clearNewPlanForm()">Cancelar</button>
                <button class="btn btn-primary" onclick="saveNewPlanTemplate()">Guardar Plan Template</button>
            </div>
        </div>
    `;
    
    return `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 24px; align-items: start; margin-top: 12px;">
            <div>
                <h3 style="text-align: left; margin: 0 0 14px 0; font-size: 1rem; color: var(--text-primary);">📋 Planes de Seguimiento Disponibles</h3>
                ${templatesHtml}
            </div>
            <div>
                ${formHtml}
            </div>
        </div>
    `;
}

// Render rejection reasons config HTML
function renderCrmRejectionReasonsHtml() {
    const reasons = getRejectionReasons();
    
    let rowsHtml = reasons.map((r, idx) => `
        <tr style="border-bottom: 1px solid var(--border-color);">
            <td style="padding: 10px; font-weight: 500; font-size: 0.85rem; color: var(--text-primary); text-align: left;">${r}</td>
            <td style="padding: 10px; text-align: right; width: 60px;">
                <button class="btn btn-danger" style="padding: 4px 8px; font-size: 0.75rem;" onclick="deleteRejectionReason(${idx})">
                    ✕ Eliminar
                </button>
            </td>
        </tr>
    `).join("");
    
    return `
        <div style="margin-top: 12px; text-align: left;">
            <h4 style="margin: 0 0 8px 0; color: var(--text-primary); font-size: 0.95rem;">❌ Configuración de Motivos de Rechazo</h4>
            <p class="text-secondary" style="font-size: 0.8rem; margin-bottom: 15px;">Establezca los motivos que los vendedores podrán seleccionar al rechazar una cotización.</p>
            
            <div style="display: flex; gap: 10px; margin-bottom: 15px; max-width: 500px;">
                <input type="text" id="new-rejection-reason" class="form-input" placeholder="Ej: FALTA DE STOCK, FUERA DE ZONA" style="flex: 1; font-size: 0.82rem; padding: 6px 12px;">
                <button class="btn btn-primary" style="font-size: 0.82rem; padding: 6px 14px;" onclick="addRejectionReason()">
                    ➕ Agregar Motivo
                </button>
            </div>
            
            <div style="border: 1px solid var(--border-color); border-radius: var(--radius-sm); overflow: hidden; background: var(--bg-input); max-width: 500px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <thead>
                        <tr style="background: var(--bg-card); border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-size: 0.78rem;">
                            <th style="padding: 8px 10px; text-align: left;">Motivo</th>
                            <th style="padding: 8px 10px; text-align: right; width: 60px;"></th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || '<tr><td colspan="2" style="padding: 12px; text-align: center; color: var(--text-muted); font-style: italic;">No hay motivos configurados.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

// Entrypoint for configuration rendering
function renderCrmPlanConfig() {
    renderCrmConfig();
}

function addStepToNewPlan() {
    const titleInput = document.getElementById("new-step-title");
    const valInput = document.getElementById("new-step-offset-val");
    const unitInput = document.getElementById("new-step-offset-unit");
    const msgInput = document.getElementById("new-step-message");
    
    const title = titleInput ? titleInput.value.trim() : "";
    const offsetVal = valInput ? parseInt(valInput.value, 10) : 3;
    const offsetUnit = unitInput ? unitInput.value : "días";
    const message = msgInput ? msgInput.value.trim() : "";
    
    if (!title) {
        showAppNotification("Título requerido", "Por favor ingresa un título para el paso.", "warning");
        return;
    }
    if (isNaN(offsetVal) || offsetVal < 1) {
        showAppNotification("Valor inválido", "El tiempo de vencimiento debe ser mayor o igual a 1.", "warning");
        return;
    }
    
    // Convert to days fraction for backward compatibility
    let days = offsetVal;
    if (offsetUnit === "minutos") {
        days = parseFloat((offsetVal / 1440).toFixed(4));
    } else if (offsetUnit === "horas") {
        days = parseFloat((offsetVal / 24).toFixed(4));
    }
    
    newPlanSteps.push({
        title: title,
        days: days,
        offsetVal: offsetVal,
        offsetUnit: offsetUnit,
        message: message
    });
    
    if (titleInput) titleInput.value = "";
    if (valInput) valInput.value = "3";
    if (unitInput) unitInput.value = "días";
    if (msgInput) msgInput.value = "";
    
    renderCrmConfig();
}

function removeStepFromNewPlan(idx) {
    newPlanSteps.splice(idx, 1);
    renderCrmConfig();
}

function clearNewPlanForm() {
    newPlanSteps = [];
    const nameInput = document.getElementById("new-plan-name");
    if (nameInput) nameInput.value = "";
    renderCrmConfig();
}

function saveNewPlanTemplate() {
    const nameInput = document.getElementById("new-plan-name");
    const name = nameInput ? nameInput.value.trim() : "";
    
    if (!name) {
        showAppNotification("Nombre requerido", "Por favor ingresa un nombre para el plan.", "warning");
        return;
    }
    if (newPlanSteps.length === 0) {
        showAppNotification("Pasos vacíos", "El plan de seguimiento debe contener al menos un paso.", "warning");
        return;
    }
    
    const templates = getPlanTemplates();
    const id = "plan_" + Date.now();
    
    templates.push({
        id: id,
        name: name,
        steps: [...newPlanSteps]
    });
    
    savePlanTemplates(templates);
    saveCrmDataOnBackend("saveTemplate", { id, name, steps: [...newPlanSteps] });
    clearNewPlanForm();
    showAppNotification("Plan Creado", `Se guardó el plan "${name}" correctamente.`, "success");
    renderCrmPlanConfig();
}

function deletePlanTemplate(id) {
    if (confirm("¿Estás seguro de que deseas eliminar este plan? Se desasignará de cualquier cliente que lo tenga seleccionado.")) {
        let templates = getPlanTemplates();
        templates = templates.filter(t => t.id !== id);
        savePlanTemplates(templates);
        saveCrmDataOnBackend("deleteTemplate", { id });
        
        const clientPlans = JSON.parse(localStorage.getItem("tmc_client_plans") || "{}");
        let cleaned = false;
        for (const cid in clientPlans) {
            if (clientPlans[cid] === id) {
                delete clientPlans[cid];
                cleaned = true;
            }
        }
        if (cleaned) {
            localStorage.setItem("tmc_client_plans", JSON.stringify(clientPlans));
        }
        
        showAppNotification("Plan Eliminado", "Se eliminó el plan de seguimiento.", "success");
        renderCrmPlanConfig();
    }
}

// --- FIRESTORE DATABASE CRM SYNCHRONIZATION ---

let isSyncingCrm = false;

// Load all CRM data from Firestore and merge with localStorage
async function syncCrmWithFirestore() {
    if (isSyncingCrm) return;
    isSyncingCrm = true;
    
    try {
        console.log("Syncing CRM data with Firestore...");
        const res = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/obtenerDatosCrm`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const json = await res.json();
        if (json.success && json.data) {
            const { followups, templates, clientPlans, whatsappConfigs } = json.data;
            
            if (whatsappConfigs) {
                localStorage.setItem("tmc_whatsapp_configs", JSON.stringify(whatsappConfigs));
            }
            
            // 1. Merge followups
            if (followups && Array.isArray(followups)) {
                const localFollowups = getCrmFollowups();
                const mergedMap = {};
                
                // Load local first
                localFollowups.forEach(f => {
                    mergedMap[String(f.id)] = f;
                });
                // Overwrite or append remote
                followups.forEach(f => {
                    mergedMap[String(f.id)] = f;
                });
                
                const mergedList = Object.values(mergedMap);
                mergedList.sort((a, b) => b.dateCreated.localeCompare(a.dateCreated));
                localStorage.setItem("tmc_crm_followups", JSON.stringify(mergedList));
            }
            
            // 2. Merge templates (only custom templates)
            if (templates && Array.isArray(templates)) {
                const defaultTemplates = [
                    {
                        id: "standard",
                        name: "Plan Estándar (3-7-15 días)",
                        steps: [
                            { title: "Llamada a los 3 días", days: 3, message: "Hola {cliente}, ¿cómo estás? Te escribo por la cotización n° {cotizacion} que te envié hace unos días. ¿Pudiste verla? ¿Tenés alguna duda o te puedo ayudar en algo?\n\nPodes ver el detalle ingresando al siguiente link: {url_pdf}" },
                            { title: "Recontacto a los 7 días", days: 7, message: "Hola {cliente}, ¿cómo estás? Te contacto para ver si pudiste revisar el presupuesto n° {cotizacion} que te enviamos. A continuación te detallo los productos:\n\n{detalle_items}\n\nQuedo a tu disposición." },
                            { title: "Cierre comercial a los 15 días", days: 15, message: "Hola {cliente}, ¿cómo estás? Te escribo por la cotización n° {cotizacion} para saber si definieron la compra o si precisan que realicemos alguna modificación. Quedo atento a tus comentarios. Saludos!" }
                        ]
                    },
                    {
                        id: "express",
                        name: "Plan Express (1-3-5 días)",
                        steps: [
                            { title: "Contacto Express 24hs", days: 1, message: "Hola {cliente}, ¿cómo estás? Te escribo para enviarte el detalle informal de los productos presupuestados en la cotización n° {cotizacion}:\n\n{detalle_items}\n\nTambién podés ver el PDF en este link: {url_pdf}" },
                            { title: "Llamada a los 3 días", days: 3, message: "Hola {cliente}, te escribo para consultar si pudiste revisar la cotización n° {cotizacion} enviada el {fecha_doc}. Quedamos a disposición por cualquier consulta." },
                            { title: "Cierre comercial a los 5 días", days: 5, message: "Hola {cliente}, te contacto por la cotización n° {cotizacion}. Quería saber si resolvemos el pedido hoy para poder coordinar la entrega esta misma semana. Saludos!" }
                        ]
                    },
                    {
                        id: "longterm",
                        name: "Plan Largo Plazo (5-15-30 días)",
                        steps: [
                            { title: "Llamada a los 5 días", days: 5, message: "Hola {cliente}, ¿cómo estás? Te escribo para consultar si pudiste ver la cotización n° {cotizacion} que te enviamos. Podes ver el PDF aquí: {url_pdf}\n\nCualquier consulta avisame!" },
                            { title: "Seguimiento a los 15 días", days: 15, message: "Hola {cliente}, ¿cómo estás? Te escribo para ver si quedó pendiente la cotización n° {cotizacion} por {detalle_items}." },
                            { title: "Cierre a los 30 días", days: 30, message: "Hola {cliente}, te contacto por la cotización n° {cotizacion}. Visto que pasó un tiempo desde el presupuesto, queríamos saber si la compra sigue en pie o si preferís darla de baja. Saludos!" }
                        ]
                    }
                ];
                
                const allTemplates = [...defaultTemplates];
                templates.forEach(t => {
                    if (t.id === "rejection_reasons") {
                        if (t.reasons && Array.isArray(t.reasons)) {
                            localStorage.setItem("tmc_crm_rejection_reasons", JSON.stringify(t.reasons));
                        }
                    } else if (t.id === "shared_messages") {
                        if (t.messages) {
                            localStorage.setItem("tmc_crm_shared_messages", JSON.stringify(t.messages));
                        }
                    } else if (!["standard", "express", "longterm"].includes(t.id)) {
                        allTemplates.push(t);
                    }
                });
                localStorage.setItem("tmc_crm_plan_templates", JSON.stringify(allTemplates));
            }
            
            // 3. Merge client plans
            if (clientPlans && typeof clientPlans === "object") {
                const localPlans = JSON.parse(localStorage.getItem("tmc_client_plans") || "{}");
                const mergedPlans = { ...localPlans, ...clientPlans };
                localStorage.setItem("tmc_client_plans", JSON.stringify(mergedPlans));
            }
            
            console.log("CRM data synchronized successfully from Firestore.");
            
            // Re-render UI components (only if user is not actively interacting to prevent closing dropdowns)
            const activeEl = document.activeElement;
            const hasFocus = activeEl && (
                activeEl.tagName === "INPUT" || 
                activeEl.tagName === "SELECT" || 
                activeEl.tagName === "TEXTAREA" || 
                activeEl.closest(".autocomplete-results") ||
                activeEl.closest(".dropdown")
            );
            const isUserRecentlyActive = (Date.now() - lastUserInteractionTime) < 30000; // 30 seconds
            
            if (hasFocus || isUserRecentlyActive) {
                console.log("Skipping UI re-render during background sync to avoid disrupting active user.");
            } else {
                renderCrmAlerts();
                if (selectedClient) {
                    // Prevent losing focus / text content when active typing is happening
                    const activePlanContainer = document.getElementById("crm-active-plan-container");
                    const hasActiveInputFocus = activePlanContainer && activePlanContainer.contains(document.activeElement);
                    
                    if (!hasActiveInputFocus) {
                        renderAllCrmSections();
                    } else {
                        console.log("Skipping plan re-render to avoid losing active user input focus.");
                    }
                    renderClientCard();
                }
                
                // Re-render dashboard active tab
                const activeTabBtn = document.querySelector(".crm-dashboard-tab-btn.btn-primary");
                if (activeTabBtn) {
                    if (activeTabBtn.id === "tab-btn-tablero") {
                        renderCrmControlBoard();
                        if (window.renderWhatsAppResponseMetrics) {
                            window.renderWhatsAppResponseMetrics();
                        }
                    } else if (activeTabBtn.id === "tab-btn-estadisticas") {
                        renderCrmStatsChart();
                    } else if (activeTabBtn.id === "tab-btn-configuracion") {
                        const configContainer = document.getElementById("crm-plan-config-container");
                        const hasConfigFocus = configContainer && configContainer.contains(document.activeElement);
                        if (!hasConfigFocus) {
                            renderCrmPlanConfig();
                        } else {
                            console.log("Skipping config re-render to avoid losing active user input focus.");
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.warn("Could not sync CRM data with Firestore:", e);
    } finally {
        isSyncingCrm = false;
    }
}

// Background sync reporter to save local changes to Firestore
async function saveCrmDataOnBackend(action, data) {
    try {
        console.log(`Reporting CRM change to Firestore: ${action}`, data);
        const res = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/guardarDatosCrm`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ action, data })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        console.log("Firestore sync response:", json);
    } catch (e) {
        console.warn("Failed to report CRM change to Firestore:", e);
    }
}

// Clear filters for Tablero
function clearTableroDates() {
    const dateFromInput = document.getElementById("tablero-date-from");
    const dateToInput = document.getElementById("tablero-date-to");
    if (dateFromInput) dateFromInput.value = "";
    if (dateToInput) dateToInput.value = "";
    renderCrmControlBoard();
}

// Clear filters for Stats
function clearStatsDates() {
    const dateFromInput = document.getElementById("stats-date-from");
    const dateToInput = document.getElementById("stats-date-to");
    if (dateFromInput) dateFromInput.value = "";
    if (dateToInput) dateToInput.value = "";
    renderCrmStatsChart();
}

// --- CRM MESSAGE CUSTOMIZATION & RESOLUTION HELPERS ---

window.crmPlanItemsCache = {};

function getDefaultMessageTemplate(docType) {
    const sharedMsgs = getSharedMessages();
    if (docType === "COTIZACION") {
        return sharedMsgs.default_followup_quote || "Hola {cliente}, ¿cómo estás? Te escribo por la cotización n° {cotizacion} por {total_doc}. ¿Pudiste revisarla?\n\nPodes ver el detalle ingresando al siguiente link: {url_pdf}";
    } else {
        return sharedMsgs.default_followup_pedido || "Hola {cliente}, ¿cómo estás? Te contacto para realizar el seguimiento del pedido n° {pedido} por {total_doc}.\n\nQuedo a tu disposición.";
    }
}

function compileFollowupMessageText(activePlan, stepIndex, items = null) {
    const step = activePlan.steps ? activePlan.steps[stepIndex] : null;
    let template = (step ? step.message : "") || getDefaultMessageTemplate(activePlan.docType);
    if (typeof template !== "string") {
        template = "Hola {cliente}, ¿cómo estás? Te escribo por la cotización/pedido n° {cotizacion}.";
    }
    
    // Replace client
    template = template.replaceAll("{cliente}", selectedClient ? selectedClient.name : "Cliente");
    
    // Replace doc / quote / order
    const docNum = activePlan.docDisplayNum || activePlan.docId;
    template = template.replaceAll("{cotizacion}", docNum);
    template = template.replaceAll("{pedido}", docNum);
    
    // Replace date
    const docDateStr = new Date(activePlan.dateCreated).toLocaleDateString("es-AR");
    template = template.replaceAll("{fecha_doc}", docDateStr);
    
    // Replace pdf url
    const pdfUrl = `https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportId=137&instanceId=${activePlan.docId}&schemaId=${CONFIG.SCHEMA_ID}`;
    template = template.replaceAll("{url_pdf}", pdfUrl);
    
    // Replace seller name if available
    let sellerName = "";
    if (activePlan.vendedor) {
        sellerName = activePlan.vendedor;
    } else {
        const sellerObj = JSON.parse(localStorage.getItem("tmc_seller") || "null");
        sellerName = sellerObj ? (sellerObj.name || sellerObj.NOMBRE) : "vendedor";
    }
    template = template.replaceAll("{vendedor}", sellerName);
    
    // Replace items detail
    if (template.includes("{detalle_items}")) {
        if (items && items.length > 0) {
            let itemsText = "";
            items.forEach(item => {
                const sku = item.MATE_CODIGO || item.CODIGO || "Sin Código";
                const name = item.DECO_NOMBRE_MATE || item.NOMBRE || item.DEDP_CONCEPTO || "Artículo";
                const qty = parseFloat(item.DECO_CANTIDAD || item.CANTIDAD || item.DEDP_CANTIDAD) || 0;
                const price = parseFloat(item.DECO_PRECIO_UNITARIO || item.PRECIO_UNITARIO || item.DEDP_PRECIO_UNITARIO) || 0;
                itemsText += `*${qty}x* ${sku} - ${name} (${formatCurrency(price)})\n`;
            });
            template = template.replaceAll("{detalle_items}", itemsText.trim());
        } else if (items && items.length === 0) {
            template = template.replaceAll("{detalle_items}", "(Sin ítems)");
        } else {
            template = template.replaceAll("{detalle_items}", "(Cargando detalle de ítems...)");
        }
    }
    
    return template;
}

async function preloadCrmPlanItems(activePlan, stepIndex) {
    const docId = activePlan.docId;
    const docType = activePlan.docType;
    
    if (window.crmPlanItemsCache && window.crmPlanItemsCache[docId]) {
        return;
    }
    
    try {
        const isQuote = docType === "COTIZACION";
        const entityId = isQuote ? CONFIG.ENTITY_COTIZACION : CONFIG.ENTITY_PEDIDOS;
        const childId = isQuote ? CONFIG.CHILD_COTIZACION_ITEMS : CONFIG.CHILD_PEDIDO_ITEMS;
        
        const url = `https://api.yiqi.com.ar/api/childrenApi/GetChildList?entityId=${entityId}&schemaId=${CONFIG.SCHEMA_ID}&childId=${childId}&instanceId=${docId}`;
        const res = await apiCall(url, "GET");
        const rows = res.data || res.rows || res.instances || [];
        
        if (!window.crmPlanItemsCache) {
            window.crmPlanItemsCache = {};
        }
        window.crmPlanItemsCache[docId] = rows;
        
        // Update the message textarea if it exists on screen
        const textarea = document.getElementById(`crm-share-message-text-${activePlan.id}-${stepIndex}`);
        if (textarea) {
            const compiledText = compileFollowupMessageText(activePlan, stepIndex, rows);
            textarea.value = compiledText;
        }
    } catch (e) {
        console.error("Failed to preload plan items:", e);
    }
}

async function sendWhatsAppMessage(phone, message, sellerName = null) {
    let apiUrl = localStorage.getItem("tmc_whatsapp_api_url");
    let apiToken = localStorage.getItem("tmc_whatsapp_api_token");
    
    // Si tenemos un vendedor específico, buscamos su configuración en la base de datos de configuraciones (en localStorage)
    if (sellerName) {
        try {
            const configs = JSON.parse(localStorage.getItem("tmc_whatsapp_configs") || "{}");
            const sellerKey = String(sellerName).trim().toUpperCase();
            if (configs[sellerKey] && configs[sellerKey].apiUrl) {
                apiUrl = configs[sellerKey].apiUrl;
                apiToken = configs[sellerKey].apiToken || "";
                console.log(`Usando configuración dinámica de WhatsApp para vendedor ${sellerName}: ${apiUrl}`);
            }
        } catch (e) {
            console.error("Error al leer tmc_whatsapp_configs:", e);
        }
    }
    
    const phoneCleaned = cleanPhoneNumber(phone || "");
    
    if (apiUrl) {
        showLoader("Enviando por API de WhatsApp...");
        try {
            const payload = {
                phone: phoneCleaned,
                message: message
            };
            
            const headers = {
                "Content-Type": "application/json"
            };
            if (apiToken) {
                headers["Authorization"] = apiToken.startsWith("Bearer ") ? apiToken : `Bearer ${apiToken}`;
            }
            
            const response = await fetch(apiUrl, {
                method: "POST",
                headers: headers,
                body: JSON.stringify(payload)
            });
            
            hideLoader();
            if (response.ok) {
                showAppNotification("Mensaje Enviado", "El mensaje de seguimiento se envió automáticamente vía API.", "success");
                return true;
            } else {
                const text = await response.text().catch(() => "");
                console.error("WhatsApp API error response:", text);
                showAppNotification("Error API WhatsApp", "La API respondió con error. Reintentando por WhatsApp Web...", "warning");
                // Fallback to standard WhatsApp Web
                const phoneParam = phoneCleaned ? `phone=${phoneCleaned}&` : "";
                const waUrl = `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(message)}`;
                window.open(waUrl, "_blank");
                return false;
            }
        } catch (err) {
            hideLoader();
            console.error("WhatsApp API connection error:", err);
            showAppNotification("Error de Conexión API", "No se pudo conectar a la API. Reintentando por WhatsApp Web...", "warning");
            // Fallback to standard WhatsApp Web
            const phoneParam = phoneCleaned ? `phone=${phoneCleaned}&` : "";
            const waUrl = `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(message)}`;
            window.open(waUrl, "_blank");
            return false;
        }
    } else {
        // Fallback to standard WhatsApp Web
        const phoneParam = phoneCleaned ? `phone=${phoneCleaned}&` : "";
        const waUrl = `https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(message)}`;
        window.open(waUrl, "_blank");
        return true;
    }
}
window.sendWhatsAppMessage = sendWhatsAppMessage;

function shareViaWhatsApp(planId, stepIndex, phone) {
    const textarea = document.getElementById(`crm-share-message-text-${planId}-${stepIndex}`);
    const message = textarea ? textarea.value : "";
    const followups = getCrmFollowups();
    const plan = followups.find(f => String(f.id) === String(planId));
    const sellerName = plan ? plan.vendedor : null;
    sendWhatsAppMessage(phone, message, sellerName);
}

function shareViaGmail(planId, stepIndex, email, docType, docNum) {
    const textarea = document.getElementById(`crm-share-message-text-${planId}-${stepIndex}`);
    const message = textarea ? textarea.value : "";
    const emailSubject = `${docType} N° ${docNum} - ${selectedClient ? selectedClient.name : ""}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email || "")}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message)}`;
    window.open(gmailUrl, "_blank");
}

async function shareActivePlanWhatsApp(planId) {
    const followups = getCrmFollowups();
    const activePlan = followups.find(f => String(f.id) === String(planId));
    if (!activePlan) return;
    
    const idx = activePlan.currentStep;
    const phone = selectedClient ? selectedClient.phone : "";
    
    // Ensure items are preloaded if template requires them
    const step = activePlan.steps[idx];
    const template = step.message || getDefaultMessageTemplate(activePlan.docType);
    if (template.includes("{detalle_items}")) {
        if (!window.crmPlanItemsCache || !window.crmPlanItemsCache[activePlan.docId]) {
            showLoader("Cargando detalle de ítems para WhatsApp...");
            try {
                await preloadCrmPlanItems(activePlan, idx);
            } catch (err) {
                console.error("Error preloading items for WhatsApp:", err);
            } finally {
                hideLoader();
            }
        }
    }
    
    const textarea = document.getElementById(`crm-share-message-text-${planId}-${idx}`);
    let message = "";
    if (textarea) {
        message = textarea.value;
    } else {
        const cachedItems = window.crmPlanItemsCache ? window.crmPlanItemsCache[activePlan.docId] : null;
        message = compileFollowupMessageText(activePlan, idx, cachedItems);
    }
    
    const sellerName = activePlan ? activePlan.vendedor : null;
    sendWhatsAppMessage(phone, message, sellerName);
}
window.shareActivePlanWhatsApp = shareActivePlanWhatsApp;

function shareNewQuoteWhatsApp(client, docId, docDisplayNum, finalDocTotal) {
    if (!client) return;
    const clientName = client.name || "Cliente";
    const phone = client.phone || "";
    
    const sharedMsgs = getSharedMessages();
    let message = sharedMsgs.initial_quote_whatsapp || "Hola {cliente}, ¿cómo estás? Te comparto la cotización n° {cotizacion} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}";
    
    // Replace placeholders
    message = message.replaceAll("{cliente}", clientName);
    message = message.replaceAll("{cotizacion}", String(docDisplayNum || docId));
    message = message.replaceAll("{pedido}", String(docDisplayNum || docId));
    message = message.replaceAll("{total_doc}", formatCurrency(finalDocTotal));
    
    const pdfUrl = `https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportId=137&instanceId=${docId}&schemaId=${CONFIG.SCHEMA_ID}`;
    message = message.replaceAll("{url_pdf}", pdfUrl);
    
    const sellerObj = JSON.parse(localStorage.getItem("tmc_seller") || "null");
    const sellerName = sellerObj ? (sellerObj.name || sellerObj.NOMBRE) : "vendedor";
    message = message.replaceAll("{vendedor}", sellerName);
    
    // Support {detalle_items} in the initial template if they want to use it
    if (message.includes("{detalle_items}")) {
        let itemsText = "";
        cart.forEach(item => {
            itemsText += `*${item.qty}x* ${item.sku} - ${item.name} (${formatCurrency(item.manualBasePrice || item.priceListNet)})\n`;
        });
        message = message.replaceAll("{detalle_items}", itemsText.trim());
    }
    
    sendWhatsAppMessage(phone, message, sellerName);
}
window.shareNewQuoteWhatsApp = shareNewQuoteWhatsApp;

function compileSharedMessageText(activePlan, template, items = null) {
    let result = template;
    
    // Replace placeholders
    result = result.replaceAll("{cliente}", selectedClient ? selectedClient.name : "Cliente");
    
    const docNum = activePlan.docDisplayNum || activePlan.docId;
    result = result.replaceAll("{cotizacion}", docNum);
    result = result.replaceAll("{pedido}", docNum);
    result = result.replaceAll("{total_doc}", formatCurrency(activePlan.docTotal || activePlan.totalAmount || 0));
    
    const docDateStr = new Date(activePlan.dateCreated).toLocaleDateString("es-AR");
    result = result.replaceAll("{fecha_doc}", docDateStr);
    
    const pdfUrl = `https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportId=137&instanceId=${activePlan.docId}&schemaId=${CONFIG.SCHEMA_ID}`;
    result = result.replaceAll("{url_pdf}", pdfUrl);
    
    let sellerName = activePlan.vendedor || "";
    if (!sellerName) {
        const sellerObj = JSON.parse(localStorage.getItem("tmc_seller") || "null");
        sellerName = sellerObj ? (sellerObj.name || sellerObj.NOMBRE) : "vendedor";
    }
    result = result.replaceAll("{vendedor}", sellerName);
    
    if (result.includes("{detalle_items}")) {
        if (items && items.length > 0) {
            let itemsText = "";
            items.forEach(item => {
                const sku = item.MATE_CODIGO || item.CODIGO || "Sin Código";
                const name = item.DECO_NOMBRE_MATE || item.NOMBRE || item.DEDP_CONCEPTO || "Artículo";
                const qty = parseFloat(item.DECO_CANTIDAD || item.CANTIDAD || item.DEDP_CANTIDAD) || 0;
                const price = parseFloat(item.DECO_PRECIO_UNITARIO || item.PRECIO_UNITARIO || item.DEDP_PRECIO_UNITARIO) || 0;
                itemsText += `*${qty}x* ${sku} - ${name} (${formatCurrency(price)})\n`;
            });
            result = result.replaceAll("{detalle_items}", itemsText.trim());
        } else {
            result = result.replaceAll("{detalle_items}", "(Sin ítems)");
        }
    }
    
    return result;
}

async function shareQuoteOrOrderWhatsApp(planId) {
    const followups = getCrmFollowups();
    const activePlan = followups.find(f => String(f.id) === String(planId));
    if (!activePlan) return;
    
    const isQuote = activePlan.docType === "COTIZACION";
    const sharedMsgs = getSharedMessages();
    let message = isQuote 
        ? (sharedMsgs.initial_quote_whatsapp || "Hola {cliente}, ¿cómo estás? Te comparto la cotización n° {cotizacion} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}")
        : (sharedMsgs.initial_pedido_whatsapp || "Hola {cliente}, ¿cómo estás? Te comparto el pedido n° {pedido} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}");
    
    // Ensure items are preloaded if template requires {detalle_items}
    if (message.includes("{detalle_items}")) {
        if (!window.crmPlanItemsCache || !window.crmPlanItemsCache[activePlan.docId]) {
            showLoader("Cargando detalle de ítems para WhatsApp...");
            try {
                await preloadCrmPlanItems(activePlan, activePlan.currentStep || 0);
            } catch (err) {
                console.error("Error preloading items for WhatsApp:", err);
            } finally {
                hideLoader();
            }
        }
    }
    
    const cachedItems = window.crmPlanItemsCache ? window.crmPlanItemsCache[activePlan.docId] : null;
    message = compileSharedMessageText(activePlan, message, cachedItems);
    
    const phone = selectedClient ? selectedClient.phone : "";
    const sellerName = activePlan ? activePlan.vendedor : null;
    sendWhatsAppMessage(phone, message, sellerName);
}
window.shareQuoteOrOrderWhatsApp = shareQuoteOrOrderWhatsApp;

async function shareQuoteOrOrderGmail(planId) {
    const followups = getCrmFollowups();
    const activePlan = followups.find(f => String(f.id) === String(planId));
    if (!activePlan) return;
    
    const isQuote = activePlan.docType === "COTIZACION";
    const sharedMsgs = getSharedMessages();
    let message = isQuote 
        ? (sharedMsgs.initial_quote_mail || "Hola {cliente}, ¿cómo estás? Te comparto la cotización n° {cotizacion} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}")
        : (sharedMsgs.initial_pedido_mail || "Hola {cliente}, ¿cómo estás? Te comparto el pedido n° {pedido} por un total de {total_doc}.\n\nPodes ver el detalle ingresando al siguiente link:\n{url_pdf}");
    
    // Ensure items are preloaded if template requires {detalle_items}
    if (message.includes("{detalle_items}")) {
        if (!window.crmPlanItemsCache || !window.crmPlanItemsCache[activePlan.docId]) {
            showLoader("Cargando detalle de ítems para Gmail...");
            try {
                await preloadCrmPlanItems(activePlan, activePlan.currentStep || 0);
            } catch (err) {
                console.error("Error preloading items for Gmail:", err);
            } finally {
                hideLoader();
            }
        }
    }
    
    const cachedItems = window.crmPlanItemsCache ? window.crmPlanItemsCache[activePlan.docId] : null;
    message = compileSharedMessageText(activePlan, message, cachedItems);
    
    const email = selectedClient ? selectedClient.mail : "";
    const docNum = activePlan.docDisplayNum || activePlan.docId;
    const emailSubject = `${activePlan.docType} N° ${docNum} - ${selectedClient ? selectedClient.name : ""}`;
    const gmailUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(email || "")}&su=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(message)}`;
    window.open(gmailUrl, "_blank");
}
window.shareQuoteOrOrderGmail = shareQuoteOrOrderGmail;

// --- REAL-TIME STOCK BACKGROUND AUTOMATIONS & MANUAL REFRESH ---
async function manualStockRefresh() {
    const btn = document.getElementById("btn-refresh-stock");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = "🔄 Refrescando...";
    }
    try {
        await syncStockCompletoCache(false); // show loader and notify success
        renderArticlesList();
    } catch (e) {
        console.error("Manual stock refresh failed:", e);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = "🔄 Refrescar Stock";
        }
    }
}
window.manualStockRefresh = manualStockRefresh;

// Auto-refresh interval: updates stock map every 2 minutes in background when a client is active
setInterval(() => {
    if (selectedClient) {
        syncStockCompletoCache(true).then(() => {
            const activeEl = document.activeElement;
            const hasFocus = activeEl && (
                activeEl.tagName === "INPUT" || 
                activeEl.tagName === "SELECT" || 
                activeEl.tagName === "TEXTAREA"
            );
            const isUserRecentlyActive = (Date.now() - lastUserInteractionTime) < 30000; // 30 seconds
            
            if (!hasFocus && !isUserRecentlyActive) {
                renderArticlesList();
            } else {
                console.log("Skipping stock list re-render to avoid disrupting active user.");
            }
        });
    }
}, 120000);

async function manualCrmRefresh() {
    const btnHeader = document.getElementById("btn-sync-crm");
    const btnTracker = document.getElementById("btn-crm-refresh-tracker");
    
    if (btnHeader) {
        btnHeader.disabled = true;
        btnHeader.innerHTML = "🔄 Refrescando CRM...";
    }
    if (btnTracker) {
        btnTracker.disabled = true;
        btnTracker.innerHTML = "🔄 Refrescando...";
    }
    
    try {
        await syncCrmWithFirestore();
        showAppNotification("CRM Sincronizado", "Los datos de seguimiento y cotizaciones se actualizaron correctamente.", "success");
    } catch (e) {
        console.error("Manual CRM refresh failed:", e);
        showAppNotification("Error de Sincronización", "No se pudo actualizar el CRM: " + e.message, "danger");
    } finally {
        if (btnHeader) {
            btnHeader.disabled = false;
            btnHeader.innerHTML = "🔄 Refrescar CRM";
        }
        if (btnTracker) {
            btnTracker.disabled = false;
            btnTracker.innerHTML = "🔄 Refrescar CRM";
        }
    }
}
window.manualCrmRefresh = manualCrmRefresh;

// Background CRM Sync: every 2 minutes, only if view-crm-general is visible
setInterval(() => {
    const viewCrmGeneral = document.getElementById("view-crm-general");
    const isVisible = viewCrmGeneral && viewCrmGeneral.style.display !== "none";
    if (isVisible) {
        syncCrmWithFirestore().catch(e => console.error("Background CRM sync failed:", e));
    }
}, 120000);

// Inactivity Reload Timer (2 minutes of inactivity)
(function() {
    let inactivityTimeout;
    
    function resetInactivityTimer() {
        lastUserInteractionTime = Date.now();
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            console.log("Inactivity detected for 2 minutes. Reloading application...");
            location.reload();
        }, 120000); // 2 minutes
    }
    
    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
    events.forEach(name => {
        document.addEventListener(name, resetInactivityTimer, { passive: true });
    });
    
    resetInactivityTimer();
})();

// --- GUIDED TOUR FOR CRM REFRESH & MASTER CATALOG ---
(function() {
    const style = document.createElement("style");
    style.innerHTML = `
        .crm-tour-highlighted {
            position: relative !important;
            z-index: 10000 !important;
            box-shadow: 0 0 0 8px rgba(99, 102, 241, 0.5), 0 0 30px rgba(99, 102, 241, 0.8) !important;
            transform: scale(1.03) !important;
            pointer-events: none !important;
        }
        #crm-tour-tooltip::after {
            content: "";
            position: absolute;
            top: -8px;
            left: calc(50% - 8px);
            border-width: 0 8px 8px 8px;
            border-style: solid;
            border-color: transparent transparent var(--bg-card, #1e293b) transparent;
            display: block;
            width: 0;
        }
    `;
    document.head.appendChild(style);
})();

let currentTourStep = 0;
const tourSteps = [
    {
        targetId: "client-search",
        title: "🔍 Buscar un Cliente",
        text: "¡El punto de partida! Ingresá el nombre, CUIT o código de cliente acá para buscarlo y abrir su ficha. Desde su ficha podés ver su historial, gestionar tareas de seguimiento o crear cotizaciones nuevas.",
        position: "bottom"
    },
    {
        targetId: "crm-alerts-container",
        title: "🔔 Gestión Diaria y Alertas",
        text: "¡Tu agenda del día! Acá te aparecerán todos los llamados, correos o alertas de seguimiento programadas para hoy. Mantener esta lista limpia garantiza que ningún cliente quede sin atender. 😉",
        position: "bottom"
    },
    {
        targetId: "crm-active-list-container",
        title: "📈 Seguimientos Activos",
        text: "Muestra de forma rápida todas tus cotizaciones abiertas y en qué paso del proceso de venta se encuentran. Podés hacer clic en cualquiera para gestionarla rápidamente.",
        position: "bottom"
    },
    {
        targetId: "btn-sync-crm",
        title: "🔄 Refrescar CRM en Vivo",
        text: "Sincroniza los seguimientos y estados de cotizaciones al instante con Firestore. Usalo para asegurarte de que estás viendo lo mismo que tus compañeros en fábrica o administración.",
        position: "bottom-right"
    },
    {
        targetId: "btn-sync-articles",
        title: "🔄 Sincronizar Catálogo Máster",
        text: "Actualiza los precios, códigos y stock de todos los artículos desde YiQi ERP. Te sugerimos presionarlo al comenzar tu jornada laboral para cotizar siempre con datos en tiempo real.",
        position: "bottom-right"
    }
];

function startCrmTour() {
    currentTourStep = 0;
    showTourStep(0);
}

function showTourStep(index) {
    removeTourElements();
    
    if (index < 0 || index >= tourSteps.length) {
        localStorage.setItem("tmc_crm_tour_done", "true");
        return;
    }
    
    currentTourStep = index;
    const step = tourSteps[index];
    const target = document.getElementById(step.targetId);
    if (!target) {
        nextTour();
        return;
    }
    
    const overlay = document.createElement("div");
    overlay.id = "crm-tour-overlay";
    overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: rgba(15, 23, 42, 0.65);
        backdrop-filter: blur(2px);
        z-index: 9999;
        pointer-events: auto;
        transition: opacity 0.3s ease;
    `;
    overlay.onclick = cancelTour;
    document.body.appendChild(overlay);
    
    target.classList.add("crm-tour-highlighted");
    target.style.position = "relative";
    target.style.zIndex = "10000";
    target.style.boxShadow = "0 0 0 8px rgba(79, 70, 229, 0.4), 0 0 25px rgba(79, 70, 229, 0.8)";
    target.style.transition = "box-shadow 0.3s ease, transform 0.3s ease";
    target.style.transform = "scale(1.03)";
    
    const rect = target.getBoundingClientRect();
    const tooltip = document.createElement("div");
    tooltip.id = "crm-tour-tooltip";
    tooltip.style.cssText = `
        position: fixed;
        background: var(--bg-card, #1e293b);
        color: var(--text-primary, #f8fafc);
        border: 1px solid var(--primary, #4f46e5);
        border-radius: var(--radius-md, 8px);
        padding: 16px;
        width: 320px;
        box-shadow: var(--shadow-lg, 0 10px 25px -5px rgba(0, 0, 0, 0.3));
        z-index: 10001;
        opacity: 0;
        transform: translateY(10px);
        transition: opacity 0.3s ease, transform 0.3s ease;
        text-align: left;
    `;
    
    tooltip.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--primary, #6366f1); font-family: 'Space Grotesk', sans-serif;">${step.title}</h4>
            <span style="font-size: 0.72rem; color: var(--text-secondary); font-weight: 500;">Paso ${index + 1} de ${tourSteps.length}</span>
        </div>
        <p style="margin: 0 0 16px 0; font-size: 0.82rem; line-height: 1.4; color: var(--text-secondary);">${step.text}</p>
        <div style="display: flex; justify-content: space-between; align-items: center;">
            <button class="btn btn-secondary" onclick="cancelTour()" style="font-size: 0.75rem; padding: 4px 10px; border-color: var(--border-color); cursor: pointer;">Omitir</button>
            <div style="display: flex; gap: 6px;">
                ${index > 0 ? `<button class="btn btn-secondary" onclick="prevTour()" style="font-size: 0.75rem; padding: 4px 10px; border-color: var(--border-color); cursor: pointer;">Atrás</button>` : ''}
                <button class="btn btn-primary" onclick="nextTour()" style="font-size: 0.75rem; padding: 4px 12px; cursor: pointer;">${index === tourSteps.length - 1 ? 'Listo 👍' : 'Siguiente ➔'}</button>
            </div>
        </div>
    `;
    
    document.body.appendChild(tooltip);
    
    let top = rect.bottom + 12;
    let left = rect.left + (rect.width / 2) - 160;
    
    if (left < 16) left = 16;
    if (left + 320 > window.innerWidth) left = window.innerWidth - 336;
    if (top + 180 > window.innerHeight) {
        top = rect.top - tooltip.offsetHeight - 12;
    }
    
    tooltip.style.top = `${top}px`;
    tooltip.style.left = `${left}px`;
    
    setTimeout(() => {
        tooltip.style.opacity = "1";
        tooltip.style.transform = "translateY(0)";
    }, 50);
}

function nextTour() {
    showTourStep(currentTourStep + 1);
}

function prevTour() {
    showTourStep(currentTourStep - 1);
}

function cancelTour() {
    localStorage.setItem("tmc_crm_tour_done", "true");
    removeTourElements();
}

function resetTour() {
    localStorage.removeItem("tmc_crm_tour_done");
    startCrmTour();
}

function removeTourElements() {
    const overlay = document.getElementById("crm-tour-overlay");
    if (overlay) overlay.remove();
    
    const tooltip = document.getElementById("crm-tour-tooltip");
    if (tooltip) tooltip.remove();
    
    tourSteps.forEach(step => {
        const target = document.getElementById(step.targetId);
        if (target) {
            target.classList.remove("crm-tour-highlighted");
            target.style.position = "";
            target.style.zIndex = "";
            target.style.boxShadow = "";
            target.style.transform = "";
        }
    });
}

// Expose tour functions globally
window.startCrmTour = startCrmTour;
window.nextTour = nextTour;
window.prevTour = prevTour;
window.cancelTour = cancelTour;
window.resetTour = resetTour;

// Trigger tour on load if not completed yet
setTimeout(() => {
    if (localStorage.getItem("tmc_crm_tour_done") !== "true") {
        startCrmTour();
    }
}, 1500);


// ==========================================================================
// CRM INBOX & MULTI-LINE WHATSAPP INTEGRATION
// ==========================================================================

let activeChatPhone = null;
let chatsList = [];
let messagesList = [];
let inboxPollInterval = null;
let searchClientLinkTimeout = null;

// Initialize CRM Inbox
function initCrmInbox() {
    console.log("Initializing CRM Inbox...");
    if (inboxPollInterval) {
        clearInterval(inboxPollInterval);
    }
    
    // Load conversations initially
    loadCrmConversations(true);
    
    // Setup interval for polling every 5 seconds
    inboxPollInterval = setInterval(() => {
        loadCrmConversations(false);
        if (activeChatPhone) {
            loadChatMessages(activeChatPhone, false);
        }
    }, 5000);
}
window.initCrmInbox = initCrmInbox;

// Load conversations list
async function loadCrmConversations(showSpinner = false) {
    try {
        const chatsListContainer = document.getElementById("inbox-chats-list");
        if (showSpinner && chatsListContainer) {
            chatsListContainer.innerHTML = `
                <div class="empty-state" style="padding: 20px;">
                    <div class="loader-spinner" style="margin: 0 auto; width: 24px; height: 24px; border-width: 3px;"></div>
                    <p class="text-secondary" style="font-size: 0.8rem; margin-top: 8px;">Cargando chats...</p>
                </div>
            `;
        }
        
        const res = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/obtenerConversaciones`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const json = await res.json();
        if (json.success && json.chats) {
            chatsList = json.chats;
            renderConversationsList();
        }
    } catch (e) {
        console.error("Error loading conversations:", e);
    }
}
window.loadCrmConversations = loadCrmConversations;

// Filter conversations based on selected seller
function filterConversations() {
    renderConversationsList();
}
window.filterConversations = filterConversations;

// Render conversations sidebar list
function renderConversationsList() {
    const container = document.getElementById("inbox-chats-list");
    if (!container) return;
    
    const filterSeller = document.getElementById("inbox-filter-seller")?.value || "";
    
    // Filter chats based on filterSeller
    const filteredChats = chatsList.filter(chat => {
        if (!filterSeller) return true;
        
        // Match assigned seller case-insensitively
        const assignedSeller = (chat.assignedSeller || "").trim().toLowerCase();
        const targetSeller = filterSeller.trim().toLowerCase();
        return assignedSeller === targetSeller;
    });
    
    if (filteredChats.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="padding: 20px;">
                <div class="empty-icon">💬</div>
                <p class="empty-title">Sin conversaciones</p>
                <p class="empty-desc">No se encontraron chats que coincidan con el filtro.</p>
            </div>
        `;
        return;
    }
    
    let html = "";
    filteredChats.forEach(chat => {
        const isActive = activeChatPhone === chat.phone ? "active" : "";
        const displayName = chat.clientName || `+${chat.phone}`;
        const lastMsgText = chat.lastMessage || "(Sin mensajes)";
        const unreadBadge = chat.unreadCount && chat.unreadCount > 0 
            ? `<span class="inbox-chat-item-unread">${chat.unreadCount}</span>` 
            : "";
            
        let timeStr = "";
        if (chat.lastUpdated) {
            try {
                const date = new Date(chat.lastUpdated);
                timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                // If not today, show date
                const today = new Date().toDateString();
                if (date.toDateString() !== today) {
                    timeStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " " + timeStr;
                }
            } catch (e) {
                timeStr = "";
            }
        }
        
        html += `
            <div class="inbox-chat-item ${isActive}" onclick="openCrmChat('${chat.phone}')">
                <div class="inbox-chat-item-header">
                    <span class="inbox-chat-item-name">${displayName}</span>
                    <span class="inbox-chat-item-time">${timeStr}</span>
                </div>
                <div class="inbox-chat-item-body">
                    <span class="inbox-chat-item-snippet" title="${lastMsgText.replace(/"/g, '&quot;')}">${lastMsgText}</span>
                    ${unreadBadge}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Open active chat and fetch message history
async function openCrmChat(phone) {
    activeChatPhone = phone;
    
    // Set active class on sidebar
    document.querySelectorAll(".inbox-chat-item").forEach(item => {
        item.classList.remove("active");
    });
    // Add active class to selected item
    renderConversationsList();
    
    // Show active header and input area
    document.getElementById("inbox-active-chat-header").style.display = "flex";
    document.getElementById("inbox-input-area").style.display = "flex";
    document.getElementById("inbox-message-text").value = "";
    document.getElementById("inbox-message-text").focus();
    
    // Clear unread count on backend
    try {
        await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/marcarChatLeido`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ phone })
        });
        
        // Locally set unreadCount to 0 for responsive feel
        const chat = chatsList.find(c => c.phone === phone);
        if (chat) chat.unreadCount = 0;
        renderConversationsList();
    } catch (e) {
        console.error("Error marking chat as read:", e);
    }
    
    // Load messages with spinner
    await loadChatMessages(phone, true);
    
    // Render quick profile sidebar
    renderCrmInboxClientProfile(phone);
}
window.openCrmChat = openCrmChat;

// Load messages for a chat
async function loadChatMessages(phone, showSpinner = false) {
    if (activeChatPhone !== phone) return;
    
    try {
        const container = document.getElementById("inbox-messages-container");
        if (showSpinner && container) {
            container.innerHTML = `
                <div class="empty-state" style="padding: 40px 20px;">
                    <div class="loader-spinner" style="margin: 0 auto; width: 28px; height: 28px; border-width: 3px;"></div>
                    <p class="text-secondary" style="font-size: 0.85rem; margin-top: 8px;">Cargando historial de mensajes...</p>
                </div>
            `;
        }
        
        const res = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/obtenerMensajesChat?phone=${phone}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const json = await res.json();
        if (json.success && json.messages) {
            // Check if we got new messages to update view (or if we need to scroll)
            const wasAtBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
            const prevMsgCount = messagesList.length;
            
            messagesList = json.messages;
            
            // Render messages
            let html = "";
            if (messagesList.length === 0) {
                html = `
                    <div class="empty-state" style="padding: 40px 20px;">
                        <p class="empty-desc">No hay mensajes previos en este chat. ¡Envía un mensaje para comenzar!</p>
                    </div>
                `;
            } else {
                messagesList.forEach(msg => {
                    const bubbleClass = msg.fromMe ? "sent" : "received";
                    let timeStr = "";
                    if (msg.timestamp) {
                        try {
                            const date = new Date(msg.timestamp);
                            timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                        } catch (e) {
                            timeStr = "";
                        }
                    }
                    html += `
                        <div class="inbox-message-bubble ${bubbleClass}">
                            <div class="message-text">${escapeHtml(msg.text)}</div>
                            <span class="message-time">${timeStr}</span>
                        </div>
                    `;
                });
            }
            container.innerHTML = html;
            
            // Scroll to bottom if new messages arrived or if it was first load
            if (showSpinner || wasAtBottom || messagesList.length > prevMsgCount) {
                container.scrollTop = container.scrollHeight;
            }
        }
    } catch (e) {
        console.error("Error loading chat messages:", e);
    }
}

// Render quick profile column on the right
function renderCrmInboxClientProfile(phone) {
    const sidebar = document.getElementById("inbox-profile-sidebar");
    if (!sidebar) return;
    
    // Find active chat data
    const chat = chatsList.find(c => c.phone === phone);
    if (!chat) return;
    
    // Try to find if this client is linked or exists in crm_followups
    let clientId = chat.clientId;
    let clientName = chat.clientName;
    let assignedSeller = chat.assignedSeller || "No asignado";
    
    if (!clientId) {
        // Look up by phone in CRM followups
        const followups = getCrmFollowups();
        const phoneClean = phone.replace(/\D/g, "");
        const matched = followups.find(f => {
            const fPhoneClean = String(f.clientPhone || "").replace(/\D/g, "");
            return fPhoneClean && phoneClean && (fPhoneClean.includes(phoneClean) || phoneClean.includes(fPhoneClean));
        });
        if (matched) {
            clientId = matched.clientId;
            clientName = matched.clientName;
            assignedSeller = matched.vendedor || assignedSeller;
        }
    }
    
    // Set active chat header info
    document.getElementById("inbox-chat-client-name").textContent = clientName || `+${phone}`;
    document.getElementById("inbox-chat-client-phone").textContent = `+${phone}`;
    
    const badge = document.getElementById("inbox-chat-seller-badge");
    if (badge) {
        badge.textContent = assignedSeller;
        // Styles based on seller
        if (assignedSeller.toLowerCase().includes("augusto")) {
            badge.style.background = "rgba(52, 152, 219, 0.15)";
            badge.style.color = "#3498db";
            badge.style.borderColor = "rgba(52, 152, 219, 0.3)";
        } else if (assignedSeller.toLowerCase().includes("fábrica") || assignedSeller.toLowerCase().includes("fabrica")) {
            badge.style.background = "rgba(230, 126, 34, 0.15)";
            badge.style.color = "#e67e22";
            badge.style.borderColor = "rgba(230, 126, 34, 0.3)";
        } else {
            badge.style.background = "var(--bg-input)";
            badge.style.color = "var(--text-secondary)";
            badge.style.borderColor = "var(--border-color)";
        }
    }

    if (clientId) {
        // Fetch quick historic stats from local storage followups
        const followups = getCrmFollowups().filter(f => String(f.clientId) === String(clientId));
        const activeCount = followups.filter(f => f.status === "ABIERTO").length;
        const totalCount = followups.length;
        
        sidebar.innerHTML = `
            <div>
                <h3 class="inbox-profile-title">Ficha del Cliente</h3>
                <div style="font-weight: 700; color: var(--text-primary); font-size: 1rem; margin-bottom: 4px; line-height: 1.3;">${clientName}</div>
                <div style="font-size: 0.78rem; color: var(--text-secondary); margin-bottom: 12px;">ID Cliente YiQi: <strong>${clientId}</strong></div>
                
                <div class="inbox-profile-info-row">
                    <span class="inbox-profile-label">Celular / Teléfono</span>
                    <span class="inbox-profile-value">+${phone}</span>
                </div>
                <div class="inbox-profile-info-row">
                    <span class="inbox-profile-label">Vendedor CRM</span>
                    <span class="inbox-profile-value">${assignedSeller}</span>
                </div>
                <div class="inbox-profile-info-row">
                    <span class="inbox-profile-label">Seguimientos Activos</span>
                    <span class="inbox-profile-value text-success">${activeCount} activos</span>
                </div>
                <div class="inbox-profile-info-row">
                    <span class="inbox-profile-label">Historial de Cotizaciones</span>
                    <span class="inbox-profile-value">${totalCount} registradas</span>
                </div>
            </div>
            
            <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 8px;">
                <button class="btn btn-primary" onclick="goToClientCrmFromAlert('${clientId}', '${clientName.replace(/'/g, "\\'")}')" style="font-size: 0.8rem; padding: 10px; font-weight: 600;">💼 Ir a Ficha y Cotizar</button>
                <button class="btn btn-secondary" onclick="unlinkChatFromClient('${phone}')" style="font-size: 0.75rem; padding: 6px; border-color: var(--border-color); background: var(--bg-card); color: var(--text-secondary);">✕ Desvincular Cliente</button>
            </div>
        `;
    } else {
        sidebar.innerHTML = `
            <div>
                <h3 class="inbox-profile-title">Número Desconocido</h3>
                <p class="text-secondary" style="font-size: 0.8rem; margin-bottom: 14px; line-height: 1.4;">
                    Este número de celular no se encuentra vinculado a ninguna ficha de cliente en el sistema CRM.
                </p>
                
                <div class="inbox-profile-info-row" style="margin-bottom: 14px;">
                    <span class="inbox-profile-label">Teléfono</span>
                    <span class="inbox-profile-value">+${phone}</span>
                </div>
                
                <div style="border-top: 1px solid var(--border-color); padding-top: 14px;">
                    <label class="form-label" style="font-size: 0.72rem; margin-bottom: 4px;">Buscar Cliente en YiQi para Vincular</label>
                    <input type="text" id="inbox-search-client-input" class="form-input" placeholder="Buscar por CUIT o Nombre..." style="font-size: 0.8rem; padding: 8px 10px;" oninput="debouncedSearchClientForLink(this.value)">
                    <div id="inbox-link-search-results" class="autocomplete-results" style="display: none; position: relative; width: 100%; max-height: 180px; box-shadow: none; border-radius: var(--radius-sm); margin-top: 6px;"></div>
                </div>
            </div>
        `;
    }
}

// Debounce for linkage search
function debouncedSearchClientForLink(query) {
    clearTimeout(searchClientLinkTimeout);
    if (query.trim().length < 2) {
        document.getElementById("inbox-link-search-results").style.display = "none";
        return;
    }
    searchClientLinkTimeout = setTimeout(() => {
        searchClientForLink(query);
    }, 250);
}
window.debouncedSearchClientForLink = debouncedSearchClientForLink;

// Search customer in YiQi for linking to chat
async function searchClientForLink(query) {
    const resultsContainer = document.getElementById("inbox-link-search-results");
    if (!resultsContainer) return;
    
    try {
        resultsContainer.innerHTML = `<div style="padding: 10px; font-size: 0.78rem; color: var(--text-muted); text-align: center;">Buscando...</div>`;
        resultsContainer.style.display = "block";
        
        // Search YiQi API
        const url = `${CONFIG.GETLIST_BASE}?entityId=${CONFIG.ENTITY_CLIENTE}&schemaId=${CONFIG.SCHEMA_ID}&smartieId=${CONFIG.SMARTIE_CLIENTE}`;
        const response = await apiCall(url, "POST", {
            page: 1,
            pageSize: 10,
            search: query
        });
        
        const rows = response.data || response.rows || response.instances || [];
        if (rows.length === 0) {
            resultsContainer.innerHTML = `<div style="padding: 10px; font-size: 0.78rem; color: var(--text-muted); text-align: center;">Sin resultados</div>`;
            return;
        }
        
        let html = "";
        rows.forEach(row => {
            const name = row.CLIE_RAZON_SOCIAL || row.CLIE_NOMBRE || "Cliente sin nombre";
            const code = row.CLIE_CODIGO || row.id;
            const cuit = row.CLIE_CUIT || "Sin CUIT";
            const seller = row.VEHA_ID_VEHA_TEXT || "No asignado";
            
            html += `
                <div class="autocomplete-item" onclick="linkChatWithClient('${activeChatPhone}', '${row.id}', '${name.replace(/'/g, "\\'")}', '${seller.replace(/'/g, "\\'")}')" style="padding: 8px 10px;">
                    <div style="font-weight: 700; font-size: 0.8rem; color: var(--text-primary);">${name}</div>
                    <div style="font-size: 0.72rem; color: var(--text-secondary); display: flex; justify-content: space-between; margin-top: 2px;">
                        <span>Code: ${code} | CUIT: ${cuit}</span>
                        <span style="color: var(--primary); font-weight: 600;">${seller}</span>
                    </div>
                </div>
            `;
        });
        resultsContainer.innerHTML = html;
    } catch (e) {
        console.error("Error searching client for link:", e);
        resultsContainer.innerHTML = `<div style="padding: 10px; font-size: 0.78rem; color: var(--danger); text-align: center;">Error al consultar</div>`;
    }
}

// Link chat to a customer
async function linkChatWithClient(phone, clientId, clientName, sellerName) {
    try {
        showLoader("Vinculando cliente...");
        const response = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/guardarDatosCrm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "saveClientLink",
                data: {
                    phone: phone,
                    clientId: clientId,
                    clientName: clientName,
                    assignedSeller: sellerName || "No asignado"
                }
            })
        });
        
        if (!response.ok) throw new Error("HTTP " + response.status);
        
        // Update local chatsList to reflect linkage
        const chat = chatsList.find(c => c.phone === phone);
        if (chat) {
            chat.clientId = clientId;
            chat.clientName = clientName;
            chat.assignedSeller = sellerName || "No asignado";
        }
        
        hideLoader();
        showAppNotification("Cliente Vinculado", "El chat se vinculó correctamente con el cliente de YiQi.", "success");
        
        // Reload list and profile
        renderConversationsList();
        renderCrmInboxClientProfile(phone);
    } catch (e) {
        hideLoader();
        console.error("Error linking chat to client:", e);
        showAppNotification("Error al Vincular", "No se pudo vincular el chat con el cliente. Reintente.", "danger");
    }
}
window.linkChatWithClient = linkChatWithClient;

// Desvincular chat del cliente
async function unlinkChatFromClient(phone) {
    if (!confirm("¿Seguro que deseas desvincular este chat de su ficha de cliente?")) return;
    
    try {
        showLoader("Desvinculando cliente...");
        const response = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/guardarDatosCrm`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                action: "saveClientLink",
                data: {
                    phone: phone,
                    clientId: null,
                    clientName: null,
                    assignedSeller: "No asignado"
                }
            })
        });
        
        if (!response.ok) throw new Error("HTTP " + response.status);
        
        // Update local chatsList
        const chat = chatsList.find(c => c.phone === phone);
        if (chat) {
            delete chat.clientId;
            delete chat.clientName;
            chat.assignedSeller = "No asignado";
        }
        
        hideLoader();
        showAppNotification("Cliente Desvinculado", "El chat ya no está asociado a ningún cliente.", "success");
        
        // Reload list and profile
        renderConversationsList();
        renderCrmInboxClientProfile(phone);
    } catch (e) {
        hideLoader();
        console.error("Error unlinking chat:", e);
        showAppNotification("Error al Desvincular", "No se pudo desvincular el chat. Reintente.", "danger");
    }
}
window.unlinkChatFromClient = unlinkChatFromClient;

// Send inbox WhatsApp message
async function sendInboxMessage() {
    const textEl = document.getElementById("inbox-message-text");
    if (!textEl) return;
    const text = textEl.value.trim();
    if (!text || !activeChatPhone) return;
    
    // Clear input
    textEl.value = "";
    textEl.focus();
    textEl.style.height = "auto"; // reset size
    
    const phone = activeChatPhone;
    
    // Find active chat to know the seller
    const chat = chatsList.find(c => c.phone === phone);
    const sellerName = chat ? chat.assignedSeller : null;
    
    // 1. Send via Z-API immediately
    let success = false;
    try {
        success = await sendWhatsAppMessage(phone, text, sellerName);
    } catch (err) {
        console.error("Error sending WhatsApp message in Inbox:", err);
    }
    
    if (success) {
        // 2. Save directly to Firestore using Cloud Function for instant UI update
        try {
            const sellerObj = JSON.parse(localStorage.getItem("tmc_seller") || "null");
            const activeSellerName = sellerObj ? (sellerObj.name || sellerObj.NOMBRE) : "Vendedor CRM";
            
            await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/guardarMensajeEnviado`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    phone: phone,
                    text: text,
                    senderName: activeSellerName,
                    assignedSeller: sellerName || "No asignado"
                })
            });
            
            // 3. Update active conversation list details locally for responsiveness
            if (chat) {
                chat.lastMessage = text;
                chat.lastUpdated = new Date().toISOString();
            }
            renderConversationsList();
            
            // Reload message history
            await loadChatMessages(phone, false);
        } catch (e) {
            console.error("Error saving sent message:", e);
        }
    }
}
window.sendInboxMessage = sendInboxMessage;

// Textarea enter sends message, shift-enter adds newline
function handleInboxTextareaKey(event) {
    const textEl = document.getElementById("inbox-message-text");
    if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        sendInboxMessage();
    } else {
        // Auto-grow textarea height
        setTimeout(() => {
            textEl.style.height = "auto";
            textEl.style.height = textEl.scrollHeight + "px";
        }, 0);
    }
}
window.handleInboxTextareaKey = handleInboxTextareaKey;

// Helper to escape HTML characters
function escapeHtml(text) {
    if (!text) return "";
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Switch Tablero Subtabs (delays vs whatsapp response)
function switchTableroSubtab(subtabId) {
    const contentSeg = document.getElementById("tablero-content-seguimientos");
    const contentWa = document.getElementById("tablero-content-whatsapp");
    
    if (contentSeg && contentWa) {
        contentSeg.style.display = "none";
        contentWa.style.display = "none";
        
        const target = document.getElementById(`tablero-content-${subtabId}`);
        if (target) {
            target.style.display = "flex";
        }
    }
    
    // Update subtab buttons style
    document.querySelectorAll(".tablero-subtab-btn").forEach(btn => {
        btn.classList.remove("btn-primary");
        btn.classList.add("btn-secondary");
    });
    
    const activeBtn = document.getElementById(`tablero-subtab-btn-${subtabId}`);
    if (activeBtn) {
        activeBtn.classList.remove("btn-secondary");
        activeBtn.classList.add("btn-primary");
    }
    
    // Trigger specific subtab loading
    if (subtabId === "seguimientos") {
        renderCrmControlBoard();
    } else if (subtabId === "whatsapp") {
        if (window.renderWhatsAppResponseMetrics) {
            window.renderWhatsAppResponseMetrics();
        }
    }
}
window.switchTableroSubtab = switchTableroSubtab;

// Render WhatsApp response metrics on Control Board
async function renderWhatsAppResponseMetrics() {
    const container = document.getElementById("crm-wa-response-metrics-container");
    if (!container) return;
    
    container.innerHTML = `
        <div style="text-align: center; padding: 24px;">
            <div class="loader-spinner" style="margin: 0 auto 12px auto; width: 24px; height: 24px; border-width: 3px;"></div>
            <p class="text-secondary" style="font-size: 0.8rem;">Calculando tiempos de respuesta de WhatsApp...</p>
        </div>
    `;
    
    try {
        const res = await fetch(`${CONFIG.CLOUD_FUNCTIONS_BASE}/obtenerMetricasRespuesta`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        
        const json = await res.json();
        if (!json.success || !json.metrics) {
            throw new Error(json.error || "Error al calcular métricas");
        }
        
        const metrics = json.metrics;
        const events = json.events || [];
        
        // Formatter for delay
        const formatDelay = (mins) => {
            if (mins < 1) return "Menos de 1 min";
            if (mins < 60) return `${mins} min`;
            const hs = Math.floor(mins / 60);
            const remainingMins = mins % 60;
            if (hs < 24) {
                return `${hs} hs ${remainingMins > 0 ? remainingMins + ' min' : ''}`;
            }
            const days = Math.floor(hs / 24);
            const remainingHours = hs % 24;
            return `${days} ${days === 1 ? 'día' : 'días'} ${remainingHours > 0 ? remainingHours + ' hs' : ''}`;
        };
        
        const avgDelayStr = formatDelay(metrics.averageDelayMinutes);
        const maxDelayStr = formatDelay(metrics.maxDelayMinutes);
        
        let cardsHtml = `
            <div class="control-board-metrics" style="margin-bottom: 20px;">
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; cursor: help;" title="Total consultas respondidas medidas de WhatsApp.">
                    <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">Total Consultas Respondidas</div>
                    <div style="font-size: 1.8rem; font-weight: 700; color: var(--text-primary);">${metrics.totalInteractions}</div>
                </div>
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; border-left: 4px solid var(--success); cursor: help;" title="Tiempo promedio que demoramos en responder una consulta.">
                    <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">Tiempo Promedio Respuesta</div>
                    <div style="font-size: 1.8rem; font-weight: 700; color: var(--success);">${avgDelayStr}</div>
                </div>
                <div style="background: var(--bg-card); border: 1px solid var(--border-color); padding: 14px; border-radius: var(--radius-md); text-align: center; border-left: 4px solid var(--warning); cursor: help;" title="Demora máxima registrada en responder una consulta.">
                    <div style="font-size: 0.72rem; color: var(--text-muted); text-transform: uppercase; font-weight: 700; margin-bottom: 4px; letter-spacing: 0.02em;">Demora Máxima Registrada</div>
                    <div style="font-size: 1.8rem; font-weight: 700; color: var(--warning);">${maxDelayStr}</div>
                </div>
            </div>
        `;
        
        let tableRows = "";
        if (events.length === 0) {
            tableRows = `<tr><td colspan="5" style="text-align: center; padding: 20px; color: var(--text-muted); font-style: italic;">No hay registros de consultas de WhatsApp para clientes vinculados.</td></tr>`;
        } else {
            events.forEach(ev => {
                const dateStr = ev.incomingTime 
                    ? new Date(ev.incomingTime).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) 
                    : "-";
                
                // Truncate messages to prevent huge rows
                const truncate = (str, len = 60) => {
                    if (!str) return "-";
                    return str.length > len ? str.substring(0, len) + "..." : str;
                };
                
                // Color formatting based on response time: green under 15 min, yellow under 2 hours, red above
                let badgeStyle = "background: rgba(74, 222, 128, 0.15); color: #4ade80; border: 1px solid rgba(74, 222, 128, 0.3);";
                if (ev.delayMinutes > 120) {
                    badgeStyle = "background: rgba(239, 68, 68, 0.15); color: #ef4444; border: 1px solid rgba(239, 68, 68, 0.3); font-weight: bold;";
                } else if (ev.delayMinutes > 15) {
                    badgeStyle = "background: rgba(245, 158, 11, 0.15); color: #f59e0b; border: 1px solid rgba(245, 158, 11, 0.3);";
                }
                
                tableRows += `
                    <tr style="border-bottom: 1px solid var(--border-color);">
                        <td style="padding: 10px 12px; font-weight: 600; color: var(--text-primary); text-align: left;">
                            <a href="javascript:void(0)" onclick="goToClientCrmFromAlert('${ev.clientId}', '${ev.clientName.replace(/'/g, "\\'")}')" style="color: var(--primary); text-decoration: none;">${ev.clientName}</a>
                        </td>
                        <td style="padding: 10px 12px; text-align: left; font-size: 0.78rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(ev.incomingText)}">
                            ${escapeHtml(truncate(ev.incomingText))}
                        </td>
                        <td style="padding: 10px 12px; text-align: left; font-size: 0.78rem; max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(ev.replyText)}">
                            ${escapeHtml(truncate(ev.replyText))}
                        </td>
                        <td style="padding: 10px 12px; text-align: center;">${dateStr}</td>
                        <td style="padding: 10px 12px; text-align: center;">
                            <span class="crm-step-badge" style="${badgeStyle} font-size: 0.7rem; padding: 2px 6px;">${formatDelay(ev.delayMinutes)}</span>
                        </td>
                    </tr>
                `;
            });
        }
        
        let tableHtml = `
            <div style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); overflow-x: auto; margin-top: 15px;">
                <table style="width: 100%; border-collapse: collapse; font-size: 0.8rem;">
                    <thead>
                        <tr style="background: var(--bg-input); border-bottom: 1px solid var(--border-color); color: var(--text-muted); font-weight: 700;">
                            <th style="padding: 12px; text-align: left;">Cliente</th>
                            <th style="padding: 12px; text-align: left;">Consulta Cliente</th>
                            <th style="padding: 12px; text-align: left;">Nuestra Respuesta</th>
                            <th style="padding: 12px; text-align: center; width: 140px;">Fecha Consulta</th>
                            <th style="padding: 12px; text-align: center; width: 130px;">Tiempo de Espera</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${tableRows}
                    </tbody>
                </table>
            </div>
        `;
        
        container.innerHTML = cardsHtml + tableHtml;
        
    } catch (e) {
        console.error("Error rendering WhatsApp response metrics:", e);
        container.innerHTML = `
            <div style="text-align: center; padding: 20px; color: var(--danger); font-size: 0.85rem;">
                ✕ No se pudieron calcular las métricas de respuesta: ${e.message}
            </div>
        `;
    }
}
window.renderWhatsAppResponseMetrics = renderWhatsAppResponseMetrics;

