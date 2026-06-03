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
let token = localStorage.getItem("yiqi_token") || null;
let articlesCache = [];
let clientSearchTimeout = null;
let selectedClient = null;
let cart = [];
let globalDiscount = 0.0;

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", async () => {
    showLoader("Autenticando con YiQi ERP...");
    try {
        await checkAuth();
        updateSyncIndicator(true, "Conectado");
        
        // Setup Event Listeners
        setupEventListeners();
        
        // Pre-load articles if cached, otherwise fetch them
        const cached = localStorage.getItem("tmc_articles_data");
        const cacheTime = localStorage.getItem("tmc_articles_time");
        const fourHours = 4 * 60 * 60 * 1000;
        
        if (cached && cacheTime && (Date.now() - cacheTime < fourHours)) {
            articlesCache = JSON.parse(cached);
            updateArticlesCountLabel();
        } else {
            // Fetch in background to not block UI
            fetchArticlesMasterInBackground();
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
        }, 300);
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
        const val = artInput.value.trim();
        document.getElementById("article-search-clear").style.display = val ? "block" : "none";
        renderArticlesList();
    });
    
    // Clear article search button
    document.getElementById("article-search-clear").addEventListener("click", () => {
        artInput.value = "";
        document.getElementById("article-search-clear").style.display = "none";
        renderArticlesList();
    });
    
    // Filter checkbox listener
    document.getElementById("filter-stock-only").addEventListener("change", () => {
        renderArticlesList();
    });
}

// --- CLIENT SEARCH LOGIC ---
async function performClientSearch(query) {
    const resultsContainer = document.getElementById("client-search-results");
    
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
    } catch (e) {
        console.error("Client search request error:", e);
        updateSyncIndicator(false, "Error de red");
    }
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
            domicile: domicile,
            listName: listName,
            listId: listId,
            condVenta: condVenta,
            condVentaId: condVentaId,
            condIva: condIva,
            condIvaId: condIvaId,
            seller: sellerName,
            typeName: clientTypeName,
            typeId: clientTypeId,
            typeDiscount: typeDiscount,
            balance: 0.0,
            suggestedDiscount: 0.0
        };
        
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
        
        // Enable search and rendering of Articles
        document.getElementById("article-search").disabled = false;
        document.getElementById("filter-stock-only").disabled = false;
        
        // Check if catalog has articles, if not, load them now
        if (articlesCache.length === 0) {
            await syncArticlesMaster();
        } else {
            renderArticlesList();
        }
        
        // Reset and show Cart details
        cart = [];
        renderCart();
    } catch (e) {
        console.error("Client select error:", e);
        showAppNotification("Error al cargar cliente", "No se pudieron obtener los datos completos del cliente en YiQi. Reintente.", "danger");
    } finally {
        hideLoader();
    }
}

function renderClientCard() {
    const container = document.getElementById("client-details-container");
    if (!selectedClient) return;
    
    const balanceClass = selectedClient.balance > 0 ? "balance-due" : "balance-ok";
    const formattedBalance = formatCurrency(selectedClient.balance);
    
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
            </div>
            
            <!-- Global Discount Widget -->
            <div class="discount-box-widget">
                <div class="discount-widget-header">
                    <span class="discount-widget-title">🏷️ Descuento Sugerido</span>
                    <span class="discount-widget-value">${selectedClient.suggestedDiscount}%</span>
                </div>
                <p class="discount-widget-desc">Calculado automáticamente en base al historial de pedidos aprobados de este cliente en YiQi.</p>
                
                <div class="discount-input-group">
                    <label for="global-discount-field" class="form-label">Aplicar Dto:</label>
                    <div class="discount-field-wrapper">
                        <input type="number" id="global-discount-field" class="discount-field" min="0" max="99" step="0.5" value="${globalDiscount}" onchange="updateGlobalDiscount(this.value)">
                        <span class="percent-symbol">%</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}

function updateGlobalDiscount(val) {
    let disc = parseFloat(val);
    if (isNaN(disc) || disc < 0) disc = 0.0;
    if (disc > 99) disc = 99.0;
    
    globalDiscount = disc;
    
    // Update input field display
    document.getElementById("global-discount-field").value = globalDiscount;
    
    // Re-render only the cart and totals since items only depend on type discount
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
            renderArticlesList();
            
            if (!silent) {
                showAppNotification("Catálogo Sincronizado", `Se cargaron ${articlesCache.length} artículos del ERP con éxito.`, "success");
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
    
    // Filter articles based on inputs
    const filtered = articlesCache.filter(item => {
        const sku = (item.MATE_CODIGO || "").toLowerCase();
        const desc = (item.MATE_NOMBRE || "").toLowerCase();
        const stock = parseFloat(item.MATE_STOCK_DISPONIBLE) || 0.0;
        
        const matchSearch = sku.includes(query) || desc.includes(query);
        const matchStock = !stockOnly || (stock > 0);
        
        return matchSearch && matchStock;
    });
    
    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-secondary" style="padding: 30px;">No se encontraron artículos con los filtros aplicados.</td></tr>`;
        table.style.display = "table";
        emptyState.style.display = "none";
        return;
    }
    
    // Sort filtered: items with stock first, then alphabetically by SKU
    filtered.sort((a, b) => {
        const stockA = parseFloat(a.MATE_STOCK_DISPONIBLE) || 0;
        const stockB = parseFloat(b.MATE_STOCK_DISPONIBLE) || 0;
        
        if (stockA > 0 && stockB === 0) return -1;
        if (stockA === 0 && stockB > 0) return 1;
        
        return a.MATE_CODIGO.localeCompare(b.MATE_CODIGO);
    });
    
    let html = "";
    filtered.slice(0, 50).forEach(item => { // Limit rendering to top 50 for max DOM performance
        const stock = parseFloat(item.MATE_STOCK_DISPONIBLE) || 0.0;
        const stockClass = stock > 0 ? "stock-in" : "stock-out";
        const formattedStock = stock > 0 ? `${stock} u.` : "Sin Stock";
        
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
        
        html += `
            <tr class="fade-in">
                <td><span class="sku-code">${item.MATE_CODIGO}</span></td>
                <td><div class="article-name" title="${item.MATE_NOMBRE}">${item.MATE_NOMBRE}</div></td>
                <td class="text-center"><span class="stock-indicator ${stockClass}">${formattedStock}</span></td>
                <td class="text-right price-cell">${formatCurrency(listPriceNet)}</td>
                <td class="text-right price-cell color-net">${formatCurrency(netPrice)}</td>
                <td class="text-right price-cell color-final">${formatCurrency(finalPrice)}</td>
                <td class="text-center">
                    <button class="btn-add-item" onclick="addItemToCart(${item.ID}, '${item.MATE_CODIGO}', '${item.MATE_NOMBRE.replace(/'/g, "\\'")}', ${listPriceNet}, ${vatPercent}, ${clientTypeDiscount})">+</button>
                </td>
            </tr>
        `;
    });
    
    if (filtered.length > 50) {
        html += `<tr><td colspan="7" class="text-center text-muted" style="font-size: 0.8rem; padding: 10px;">Mostrando los primeros 50 de ${filtered.length} artículos. Refine su búsqueda para ver el resto.</td></tr>`;
    }
    
    tbody.innerHTML = html;
    table.style.display = "table";
    emptyState.style.display = "none";
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
        cart.push({
            id: id,
            sku: sku,
            name: name,
            qty: 1,
            priceListNet: priceListNet,
            clientTypeDiscount: clientTypeDiscount || 0.0,
            discount: 0.0, // Defaults to 0% line discount
            hasCustomDiscount: false,
            vatPercent: vatPercent
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
        return;
    }
    
    let html = "";
    let subtotalNet = 0.0;
    let totalDiscountedNet = 0.0;
    let totalIva = 0.0;
    
    cart.forEach(item => {
        // Price after client type discount (Client Net)
        const clientNetPrice = item.priceListNet * (1 - item.clientTypeDiscount / 100);
        // Line total after optional individual line discount
        const lineTotalNet = clientNetPrice * (1 - item.discount / 100) * item.qty;
        
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
                <td><div class="article-name" title="${item.name}">${item.name}</div></td>
                <td class="text-center">
                    <input type="number" class="quantity-field" min="1" value="${item.qty}" onchange="updateCartItemQty(${item.id}, this.value)">
                </td>
                <td class="text-center">
                    <input type="number" class="cart-discount-field" min="0" max="99" value="${item.discount}" onchange="updateCartItemDiscount(${item.id}, this.value)">
                </td>
                <td class="text-right price-cell">${formatCurrency(clientNetPrice * (1 - item.discount / 100))}</td>
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
    
    // Write sums to UI
    document.getElementById("total-subtotal-net").textContent = formatCurrency(subtotalNet);
    document.getElementById("total-global-discount").textContent = `-${formatCurrency(globalDiscountAmount)}`;
    document.getElementById("total-iva-amount").textContent = formatCurrency(totalIva);
    document.getElementById("total-final-amount").textContent = formatCurrency(finalAmount);
    
    tbody.innerHTML = html;
    table.style.display = "table";
    formContainer.style.display = "block";
    emptyState.style.display = "none";
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
        // Step 1: Create Sales Order Header in YiQi (Entity 1231)
        const obsValue = document.getElementById("doc-observations").value.trim();
        const obsPrefix = isOrder ? "PEDIDO MANUAL" : "COTIZACION COMERCIAL";
        const cleanObs = `${obsPrefix} - ${obsValue ? obsValue + ' - ' : ''}Vendedor: ${selectedClient.seller}`;
        
        // Assemble URL encoded form string with properties
        const formStr = `EXTE_ID_EXTE=1&CLIE_ID_CLIE=${selectedClient.id}&LIDP_ID_LIDP=${selectedClient.listId}&COVE_ID_COVE=${selectedClient.condVentaId}&PEDI_DTO_GLOBAL=${globalDiscount}&PEDI_OBSERVACIONES=${encodeURIComponent(cleanObs)}`;
        
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
        
        const pedidoId = headerRes.newId;
        console.log(`Order header saved. New ID: ${pedidoId}`);
        
        // Step 2: Save Child Line Instances (childId 231)
        showLoader("Guardando líneas de artículos...");
        
        const childInstances = cart.map(item => JSON.stringify({
            "MATE_ID_MATE": item.id,
            "CODIGO": item.sku,
            "MATE_CODIGO": item.sku,
            "NOMBRE": item.name,
            "DEDP_CONCEPTO": item.name,
            "CANTIDAD": item.qty,
            "DEDP_CANTIDAD": item.qty,
            "DEDP_CANT_A_ENTREGAR": item.qty,
            "BONIFICACION": item.discount,
            "DEDP_BONIFICACION": item.discount,
            "PRECIO_UNITARIO": item.priceListNet * (1 - item.clientTypeDiscount / 100),
            "DEDP_PRECIO_UNITARIO": item.priceListNet * (1 - item.clientTypeDiscount / 100)
        }));
        
        const saveChildBody = {
            entityId: CONFIG.ENTITY_PEDIDOS,
            schemaId: CONFIG.SCHEMA_ID,
            childId: CONFIG.CHILD_PEDIDO_ITEMS,
            instanceId: String(pedidoId),
            childInstances: childInstances,
            append: true
        };
        
        const childSaveUrl = `${CONFIG.SAVE_CHILD_BASE}?instanceId=${pedidoId}&schemaId=${CONFIG.SCHEMA_ID}`;
        const childRes = await apiCall(childSaveUrl, "POST", saveChildBody);
        
        if (childRes.ok === false) {
            throw new Error(childRes.error || "YiQi rejected line items creation");
        }
        
        console.log("Lines saved successfully.");
        
        // Step 3: Transition state if confirmed Order (Reservar)
        if (isOrder) {
            showLoader("Confirmando reservas de stock...");
            // Double transition retry pattern (safety) per yiqi_master_brain.md
            let transitionSuccess = false;
            
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const transBody = {
                        schemaId: CONFIG.SCHEMA_ID,
                        ids: [String(pedidoId)],
                        transitionId: CONFIG.TRANSITION_RESERVAR,
                        form: ""
                    };
                    const transRes = await apiCall(CONFIG.TRANSITION_BASE, "POST", transBody);
                    if (transRes.ok !== false) {
                        transitionSuccess = true;
                        break;
                    }
                    console.warn(`Attempt ${attempt} to reserve order failed:`, transRes.error);
                } catch (transErr) {
                    console.warn(`Attempt ${attempt} to reserve order threw error:`, transErr);
                }
                // Wait 2.5 seconds between retries to avoid db lock in YiQi
                await new Promise(r => setTimeout(r, 2500));
            }
            
            if (!transitionSuccess) {
                showAppNotification("Pedido creado como borrador", `El pedido #${pedidoId} se guardó pero falló la reserva de stock. Modifíquelo en YiQi.`, "warning");
                resetCart();
                return;
            }
        }
        
        // Success
        hideLoader();
        const successMsg = isOrder 
            ? `Se generó el Pedido #${pedidoId} correctamente en estado "A Reservar" y se impactó el stock.`
            : `Se registró la Cotización #${pedidoId} en borrador con éxito.`;
            
        showModal({
            title: isOrder ? "🚀 Pedido Cargado con Éxito" : "📝 Cotización Registrada",
            content: `
                <div style="text-align: center; padding: 10px;">
                    <div style="font-size: 3rem; margin-bottom: 12px;">✅</div>
                    <p style="font-size: 1rem; font-weight: 600; color: var(--text-primary); margin-bottom: 8px;">Documento #${pedidoId}</p>
                    <p class="text-secondary">${successMsg}</p>
                    <p style="font-size: 0.8rem; color: var(--text-muted); margin-top: 14px;">Puede visualizar este documento ingresando a YiQi ERP.</p>
                </div>
            `,
            actions: [
                { text: "Aceptar", class: "btn-primary", onClick: () => resetCart(), close: true }
            ]
        });
        
    } catch (e) {
        console.error("Submit document error:", e);
        hideLoader();
        showAppNotification("Error al registrar documento", `No se pudo guardar la cotización/pedido: ${e.message}. Reintente.`, "danger");
    }
}

function resetCart() {
    cart = [];
    document.getElementById("doc-observations").value = "";
    renderCart();
}

// --- APP HELPERS / UTILITIES ---
function formatCurrency(val) {
    return new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS"
    }).format(val);
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
    banner.style.top = "20px";
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
function showModal({ title, content, actions }) {
    const overlay = document.getElementById("app-modal");
    const mTitle = document.getElementById("modal-title");
    const mContent = document.getElementById("modal-content");
    const mActions = document.getElementById("modal-actions");
    
    mTitle.textContent = title || "Aviso";
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
