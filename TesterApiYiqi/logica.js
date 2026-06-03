// ============================================
// TesterApiYiqi — Lógica Principal v1.0
// Panel de Testeo de Comandos API YiQi
// ============================================

// --- Estado Global ---
let currentToken = null;
let currentMethod = 'GET';
let currentBaseUrl = 'https://api.yiqi.com.ar';
let requestHistory = JSON.parse(localStorage.getItem('TESTER_HISTORY') || '[]');
let savedTemplates = JSON.parse(localStorage.getItem('TESTER_TEMPLATES') || '[]');
let lastResponse = null;
let wordWrap = true;

// --- Proxy: todas las requests pasan por /proxy/ para evitar CORS ---
const PROXY_PREFIX = '/proxy/';

// --- Presets de Comandos Rápidos ---
const PRESETS = [
    { name: 'Stock', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=794&schemaId=1491&smartieId=2668', body:'{"page":1,"pageSize":50}' },
    { name: 'Artículos', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=782&schemaId=1491&smartieId=2671', body:'{"page":1,"pageSize":50}' },
    { name: 'Pedidos', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=1231&schemaId=1491&smartieId=2672', body:'{"page":1,"pageSize":50}' },
    { name: 'Grupos', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=763&schemaId=1491&smartieId=2594', body:'{"page":1,"pageSize":50}' },
    { name: 'BOM', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=771&schemaId=1491&smartieId=2669', body:'{"page":1,"pageSize":50}' },
    { name: 'Rem.Internos', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=781&schemaId=1491&smartieId=2690', body:'{"page":1,"pageSize":50}' },
    { name: 'Rem.Compra', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=787&schemaId=1491&smartieId=2698', body:'{"page":1,"pageSize":50}' },
    { name: 'Rem.Venta', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=859&schemaId=1491&smartieId=2635', body:'{"page":1,"pageSize":50}' },
    { name: 'Clientes', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=345&schemaId=1491&smartieId=2603', body:'{"page":1,"pageSize":50}' },
    { name: 'Alta Prod', method:'POST', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetList?entityId=1389&schemaId=1491&smartieId=2705', body:'{"page":1,"pageSize":50}' },
    { name: 'GetInstance', method:'GET', base:'https://api.yiqi.com.ar', path:'/api/instancesApi/GetInstance?entityId=781&schemaId=1491&id=XXXXX', body:'' },
    { name: 'ChildList', method:'GET', base:'https://me.yiqi.com.ar', path:'/api/childrenApi/GetChildList?entityId=781&schemaId=1491&childId=227&instanceId=XXXXX&take=100&page=1&pageSize=100', body:'' },
    { name: 'SearchArt', method:'GET', base:'https://me.yiqi.com.ar', path:'/api/childrenApi/GetSearchResult?entityId=787&schemaId=1491&childId=209&query=LE70452', body:'' },
    { name: 'Token', method:'POST', base:'https://api.yiqi.com.ar', path:'/connect/token', body:'grant_type=password&username=&password=' },
];

// ============================================
// AUTENTICACIÓN
// ============================================
async function connectToken() {
    const user = document.getElementById('auth-user').value;
    const pass = document.getElementById('auth-pass').value;
    const infoEl = document.getElementById('token-info');

    if (!user || !pass) { infoEl.innerHTML = '<span style="color:var(--danger)">Falta usuario o password</span>'; return; }

    // Lista de URLs a intentar (igual que las apps de produccion)
    const tokenUrls = [
        'https://api.yiqi.com.ar/token',
        'https://api.yiqi.com.ar/connect/token',
        'https://me.yiqi.com.ar/connect/token'
    ];

    infoEl.innerHTML = '<span class="pulse" style="color:var(--warning)">Conectando...</span>';
    updateStatus('connecting');
    setFooter('Solicitando token...');

    const body = `grant_type=password&username=${encodeURIComponent(user)}&password=${encodeURIComponent(pass)}`;

    for (const endpoint of tokenUrls) {
        try {
            const proxyUrl = PROXY_PREFIX + endpoint;
            const r = await fetch(proxyUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: body
            });
            if (!r.ok) { console.warn(`Token ${endpoint}: HTTP ${r.status}`); continue; }
            const data = await r.json();
            if (data.access_token) {
                currentToken = data.access_token;
                const shortToken = currentToken.substring(0, 40) + '...';
                infoEl.innerHTML = `<span style="color:var(--success)">Token OK (${endpoint.split('//')[1].split('/')[0]})</span><br><code style="font-size:10px;color:var(--text-muted);word-break:break-all;">${shortToken}</code><br><span style="font-size:10px;">Expira en: ${data.expires_in}s</span>`;
                updateStatus('connected');
                setFooter('Token obtenido correctamente');
                return;
            }
        } catch (e) { console.warn(`Token ${endpoint}: ${e.message}`); }
    }

    infoEl.innerHTML = '<span style="color:var(--danger)">Fallo en todos los endpoints de token</span>';
    updateStatus('error');
    setFooter('Error al obtener token');
}

// ============================================
// ENVÍO DE REQUEST
// ============================================
async function sendRequest() {
    const btn = document.getElementById('btn-send');
    const path = document.getElementById('url-path').value;
    const bodyText = document.getElementById('request-body').value;
    const fullUrl = PROXY_PREFIX + currentBaseUrl + path;

    if (!currentToken && !path.includes('/connect/token')) {
        setFooter('⚠️ No hay token. Conectate primero.');
        return;
    }

    btn.classList.add('loading');
    btn.innerHTML = '<span class="spin">⏳</span> Enviando...';
    setFooter(`Enviando ${currentMethod} ${path}...`);
    document.getElementById('response-meta').style.display = 'flex';

    const headers = getHeadersFromUI();
    if (currentToken && !path.includes('/connect/token')) {
        headers['Authorization'] = `Bearer ${currentToken}`;
    }

    const startTime = performance.now();
    try {
        const fetchOpts = { method: currentMethod, headers: headers };
        if (['POST','PUT','PATCH'].includes(currentMethod) && bodyText.trim()) {
            fetchOpts.body = bodyText;
        }
        const r = await fetch(fullUrl, fetchOpts);
        const elapsed = Math.round(performance.now() - startTime);
        const text = await r.text();
        const size = new Blob([text]).size;

        // Parse response
        let parsed = null;
        try { parsed = JSON.parse(text); } catch(e) { /* not JSON */ }

        lastResponse = { status: r.status, statusText: r.statusText, time: elapsed, size, text, parsed, url: fullUrl, method: currentMethod };

        // Update meta bar
        const statusEl = document.getElementById('resp-status');
        statusEl.textContent = `${r.status} ${r.statusText}`;
        statusEl.className = 'response-badge ' + (r.status < 300 ? 'ok' : r.status < 400 ? 'redirect' : 'error');
        document.getElementById('resp-time').textContent = elapsed + 'ms';
        document.getElementById('resp-size').textContent = formatBytes(size);

        // Count rows if array data
        const rowsStat = document.getElementById('resp-rows-stat');
        if (parsed) {
            const rows = parsed.data || parsed.rows || parsed.instances || parsed.items;
            if (Array.isArray(rows)) {
                document.getElementById('resp-rows').textContent = rows.length;
                rowsStat.style.display = 'inline-flex';
            } else { rowsStat.style.display = 'none'; }
        } else { rowsStat.style.display = 'none'; }

        // Render pretty JSON
        const prettyEl = document.getElementById('resp-tab-pretty');
        if (parsed) {
            prettyEl.innerHTML = `<pre class="response-json fade-in">${syntaxHighlight(JSON.stringify(parsed, null, 2))}</pre>`;
        } else {
            prettyEl.innerHTML = `<pre class="response-json fade-in">${escapeHtml(text)}</pre>`;
        }

        // Render raw
        document.getElementById('raw-output').textContent = text;

        // Render table
        renderTable(parsed);

        // Add to history
        addToHistory({ method: currentMethod, url: path, base: currentBaseUrl, status: r.status, time: elapsed, body: bodyText, timestamp: Date.now() });

        setFooter(`✅ ${currentMethod} ${r.status} — ${elapsed}ms — ${formatBytes(size)}`);
    } catch (e) {
        const elapsed = Math.round(performance.now() - startTime);
        const prettyEl = document.getElementById('resp-tab-pretty');
        prettyEl.innerHTML = `<div class="empty-state"><div class="icon">❌</div><div class="title">Error de Red</div><div class="desc">${escapeHtml(e.message)}</div></div>`;
        document.getElementById('resp-status').textContent = 'ERROR';
        document.getElementById('resp-status').className = 'response-badge error';
        document.getElementById('resp-time').textContent = elapsed + 'ms';
        setFooter(`❌ Error: ${e.message}`);
    }

    btn.classList.remove('loading');
    btn.innerHTML = '🚀 Enviar Request';
}

// ============================================
// UI HELPERS
// ============================================
function setMethod(m) {
    currentMethod = m;
    document.querySelectorAll('.method-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.method === m);
    });
}

function changeBaseUrl() {
    currentBaseUrl = document.getElementById('base-url-select').value;
    document.getElementById('url-prefix').textContent = currentBaseUrl;
}

function switchRequestTab(tab) {
    const tabNames = ['builder','params','headers','body','notes'];
    document.querySelectorAll('.panel-request .tab-btn').forEach((b, i) => {
        b.classList.toggle('active', tabNames[i] === tab);
    });
    tabNames.forEach(t => {
        const el = document.getElementById('tab-' + t);
        if (el) el.classList.toggle('active', t === tab);
    });
}

function switchResponseTab(tab) {
    document.querySelectorAll('#response-tabs .tab-btn').forEach((b, i) => {
        b.classList.toggle('active', ['pretty','raw','table'][i] === tab);
    });
    ['pretty','raw','table'].forEach(t => {
        const el = document.getElementById('resp-tab-' + t);
        if (el) el.classList.toggle('active', t === tab);
    });
}

function getHeadersFromUI() {
    const headers = {};
    document.querySelectorAll('#headers-list .kv-row').forEach(row => {
        const inputs = row.querySelectorAll('.form-control');
        const k = inputs[0]?.value?.trim();
        const v = inputs[1]?.value?.trim();
        if (k && v) headers[k] = v;
    });
    return headers;
}

function addParam() {
    const list = document.getElementById('params-list');
    const row = createKVRow('', '', 'param');
    list.appendChild(row);
}

function addHeader() {
    const list = document.getElementById('headers-list');
    const row = createKVRow('', '', 'header');
    list.appendChild(row);
}

function createKVRow(key, value, type) {
    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
        <input type="text" class="form-control form-control-mono" placeholder="Key" value="${escapeHtml(key)}">
        <input type="text" class="form-control form-control-mono" placeholder="Value" value="${escapeHtml(value)}">
        <button class="btn-icon" onclick="this.parentElement.remove()" title="Eliminar">✕</button>
    `;
    return row;
}

function updateStatus(state) {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    dot.className = 'status-dot';
    if (state === 'connected') { dot.classList.add('connected'); text.textContent = 'Conectado'; }
    else if (state === 'error') { dot.classList.add('error'); text.textContent = 'Error'; }
    else if (state === 'connecting') { text.textContent = 'Conectando...'; }
    else { text.textContent = 'Desconectado'; }
}

function setFooter(msg) { document.getElementById('footer-status').textContent = msg; }

function formatBytes(b) {
    if (b < 1024) return b + ' B';
    if (b < 1048576) return (b / 1024).toFixed(1) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
}

function escapeHtml(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ============================================
// JSON SYNTAX HIGHLIGHTING
// ============================================
function syntaxHighlight(json) {
    return json.replace(/("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+\-]?\d+)?)/g, function(match) {
        let cls = 'json-number';
        if (/^"/.test(match)) {
            cls = /:$/.test(match) ? 'json-key' : 'json-string';
        } else if (/true|false/.test(match)) {
            cls = 'json-bool';
        } else if (/null/.test(match)) {
            cls = 'json-null';
        }
        return '<span class="' + cls + '">' + escapeHtml(match) + '</span>';
    });
}

// ============================================
// TABLE RENDERER
// ============================================
function renderTable(parsed) {
    const container = document.getElementById('table-output');
    if (!parsed) { container.innerHTML = '<div class="empty-state" style="padding:20px;"><div style="font-size:20px;">📭</div><div style="font-size:12px;">Sin datos tabulables</div></div>'; return; }

    let rows = parsed.data || parsed.rows || parsed.instances || parsed.items;
    if (!Array.isArray(rows)) {
        if (Array.isArray(parsed)) rows = parsed;
        else { container.innerHTML = '<div class="empty-state" style="padding:20px;"><div style="font-size:20px;">📊</div><div style="font-size:12px;">Respuesta no es un array</div></div>'; return; }
    }
    if (rows.length === 0) { container.innerHTML = '<div class="empty-state" style="padding:20px;"><div style="font-size:20px;">📭</div><div style="font-size:12px;">Array vacío</div></div>'; return; }

    const keys = Object.keys(rows[0]).filter(k => typeof rows[0][k] !== 'object');
    let html = '<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--font-mono);">';
    html += '<thead><tr style="border-bottom:2px solid var(--border);background:var(--bg-panel);">';
    keys.forEach(k => { html += `<th style="padding:8px 6px;text-align:left;color:var(--text-muted);font-size:10px;text-transform:uppercase;white-space:nowrap;">${escapeHtml(k)}</th>`; });
    html += '</tr></thead><tbody>';
    rows.slice(0, 100).forEach((row, i) => {
        html += `<tr style="border-bottom:1px solid var(--border);${i % 2 ? 'background:var(--bg-input);' : ''}">`;
        keys.forEach(k => {
            const val = row[k] != null ? String(row[k]) : '';
            html += `<td style="padding:6px;color:var(--text-secondary);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${escapeHtml(val)}">${escapeHtml(val.substring(0, 80))}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table>';
    if (rows.length > 100) html += `<div style="padding:8px;font-size:11px;color:var(--text-muted);text-align:center;">Mostrando 100 de ${rows.length} filas</div>`;
    container.innerHTML = html;
}

// ============================================
// HISTORY
// ============================================
function addToHistory(entry) {
    requestHistory.unshift(entry);
    if (requestHistory.length > 50) requestHistory.pop();
    localStorage.setItem('TESTER_HISTORY', JSON.stringify(requestHistory));
    renderHistory();
}

function renderHistory() {
    const list = document.getElementById('history-list');
    if (requestHistory.length === 0) {
        list.innerHTML = '<div class="empty-state" style="padding:20px;"><div style="font-size:24px;">📭</div><div style="font-size:11px;">Sin historial aún</div></div>';
        return;
    }
    list.innerHTML = requestHistory.slice(0, 30).map((h, i) => {
        const time = new Date(h.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
        const statusCls = h.status < 300 ? 'ok' : 'err';
        return `<div class="history-item" onclick="loadFromHistory(${i})">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="history-method ${h.method}">${h.method}</span>
                <span class="history-status ${statusCls}">${h.status}</span>
            </div>
            <div class="history-url">${escapeHtml(h.url)}</div>
            <div class="history-time">${time} — ${h.time}ms</div>
        </div>`;
    }).join('');
}

function loadFromHistory(idx) {
    const h = requestHistory[idx];
    if (!h) return;
    setMethod(h.method);
    document.getElementById('url-path').value = h.url;
    if (h.body) document.getElementById('request-body').value = h.body;
    if (h.base) {
        currentBaseUrl = h.base;
        document.getElementById('base-url-select').value = h.base;
        document.getElementById('url-prefix').textContent = h.base;
    }
    setFooter('Cargado desde historial');
}

// ============================================
// TEMPLATES
// ============================================
function saveCurrentAsTemplate() {
    const name = prompt('Nombre del template:');
    if (!name) return;
    savedTemplates.push({
        name,
        method: currentMethod,
        base: currentBaseUrl,
        url: document.getElementById('url-path').value,
        body: document.getElementById('request-body').value,
        notes: document.getElementById('request-notes').value,
        timestamp: Date.now()
    });
    localStorage.setItem('TESTER_TEMPLATES', JSON.stringify(savedTemplates));
    renderTemplates();
}

function renderTemplates() {
    const list = document.getElementById('templates-list');
    if (savedTemplates.length === 0) {
        list.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px;">Sin templates guardados</div>';
        return;
    }
    list.innerHTML = savedTemplates.map((t, i) => `
        <div class="template-card" onclick="loadTemplate(${i})">
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span class="template-name">${escapeHtml(t.name)}</span>
                <button class="btn-icon" style="width:20px;height:20px;font-size:10px;" onclick="event.stopPropagation();deleteTemplate(${i})" title="Eliminar">✕</button>
            </div>
            <div class="template-desc"><span class="history-method ${t.method}" style="font-size:9px;">${t.method}</span> ${escapeHtml(t.url.substring(0,50))}</div>
        </div>
    `).join('');
}

function loadTemplate(idx) {
    const t = savedTemplates[idx];
    if (!t) return;
    setMethod(t.method);
    document.getElementById('url-path').value = t.url;
    document.getElementById('request-body').value = t.body || '';
    document.getElementById('request-notes').value = t.notes || '';
    if (t.base) {
        currentBaseUrl = t.base;
        document.getElementById('base-url-select').value = t.base;
        document.getElementById('url-prefix').textContent = t.base;
    }
    setFooter(`Template "${t.name}" cargado`);
}

function deleteTemplate(idx) {
    savedTemplates.splice(idx, 1);
    localStorage.setItem('TESTER_TEMPLATES', JSON.stringify(savedTemplates));
    renderTemplates();
}

// ============================================
// PRESETS
// ============================================
function renderPresets() {
    const container = document.getElementById('preset-chips');
    container.innerHTML = PRESETS.map((p, i) => `<div class="preset-chip" onclick="loadPreset(${i})">${p.name}</div>`).join('');
}

function loadPreset(idx) {
    const p = PRESETS[idx];
    if (!p) return;
    setMethod(p.method);
    currentBaseUrl = p.base;
    document.getElementById('base-url-select').value = p.base;
    document.getElementById('url-prefix').textContent = p.base;
    document.getElementById('url-path').value = p.path;
    document.getElementById('request-body').value = p.body || '';
    setFooter(`Preset "${p.name}" cargado`);
}

// ============================================
// UTILS
// ============================================
function formatBody() {
    const el = document.getElementById('request-body');
    try {
        const parsed = JSON.parse(el.value);
        el.value = JSON.stringify(parsed, null, 2);
        setFooter('JSON formateado');
    } catch(e) { setFooter('⚠️ No es un JSON válido'); }
}

function copyResponse() {
    if (!lastResponse) return;
    navigator.clipboard.writeText(lastResponse.text).then(() => setFooter('📋 Response copiado'));
}

function copyRequest() {
    const path = document.getElementById('url-path').value;
    const body = document.getElementById('request-body').value;
    const text = `${currentMethod} ${currentBaseUrl}${path}\n\nBody:\n${body}`;
    navigator.clipboard.writeText(text).then(() => setFooter('📋 Request copiado'));
}

function downloadResponse() {
    if (!lastResponse) return;
    const blob = new Blob([lastResponse.text], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `response_${Date.now()}.json`;
    a.click();
    setFooter('💾 Response descargado');
}

function toggleWrap() {
    wordWrap = !wordWrap;
    document.querySelectorAll('.response-json').forEach(el => {
        el.style.whiteSpace = wordWrap ? 'pre-wrap' : 'pre';
    });
}

function clearAll() {
    document.getElementById('url-path').value = '';
    document.getElementById('request-body').value = '';
    document.getElementById('request-notes').value = '';
    document.getElementById('resp-tab-pretty').innerHTML = '<div class="empty-state"><div class="icon">🔬</div><div class="title">Esperando Request</div><div class="desc">Configurá tu petición y presioná Enviar.</div></div>';
    document.getElementById('raw-output').textContent = '';
    document.getElementById('table-output').innerHTML = '';
    document.getElementById('response-meta').style.display = 'none';
    lastResponse = null;
    setFooter('Limpiado');
}

// ============================================
// DEFAULT HEADERS
// ============================================
function initDefaultHeaders() {
    const list = document.getElementById('headers-list');
    list.innerHTML = '';
    [['Content-Type', 'application/json']].forEach(([k, v]) => {
        list.appendChild(createKVRow(k, v, 'header'));
    });
}

// ============================================
// TOGGLE SECTION (sidebar)
// ============================================
function toggleSection(id) {
    const el = document.getElementById('section-' + id);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
}

// ============================================
// CONSTRUCTOR GUIADO (Request Builder)
// ============================================

// Catálogo de entidades de la API doc de YiQi (apidoc.yiqi.com.ar)
// Formato: { nombre_api, label, modulo, entityId (si conocido), smartieId (si conocido), childId (si conocido) }
const ENTITY_CATALOG = [
    // === TMC CONOCIDOS (con entity IDs numéricos confirmados) ===
    { api: 'STOCK', label: 'Stock', mod: 'Stock', eid: '794', sid: '2668' },
    { api: 'MATERIAL', label: 'Artículos / Materiales', mod: 'Stock', eid: '782', sid: '2671' },
    { api: 'REMITO_INTERNO', label: 'Remito Interno', mod: 'Stock', eid: '781', sid: '2690', cid: '227' },
    { api: 'REMITO_COMPRA', label: 'Remito de Compra', mod: 'Stock', eid: '787', sid: '2698', cid: '209' },
    { api: 'PEDIDO', label: 'Pedido de Venta', mod: 'Ventas', eid: '1231', sid: '2672' },
    { api: 'ALTA_DE_PRODUCCION', label: 'Alta de Producción', mod: 'Stock', eid: '1389', sid: '2705' },
    { api: 'ARTICULO_BASE', label: 'BOM / Receta', mod: 'Stock', eid: '771', sid: '2669' },
    { api: 'RELACION', label: 'Grupos / Relaciones', mod: 'Stock', eid: '763', sid: '2594' },
    // === VENTAS (API Doc) ===
    { api: 'REMITO_DE_VENTA', label: 'Remito de Venta', mod: 'Stock', eid: '859', sid: '2635', cid: '245' },
    { api: 'FACTURA', label: 'Factura', mod: 'Ventas' },
    { api: 'NOTA_CREDITO', label: 'Nota de Crédito', mod: 'Ventas' },
    { api: 'NOTA_DEBITO', label: 'Nota de Débito', mod: 'Ventas' },
    { api: 'COBRO', label: 'Cobro', mod: 'Ventas', eid: '1161', sid: '1930' },
    { api: 'LISTA_DE_PRECIO', label: 'Lista de Precio', mod: 'Ventas' },
    { api: 'OFERTA', label: 'Oferta', mod: 'Ventas' },
    { api: 'CONTROL_DE_PEDIDOS', label: 'Control de Pedidos', mod: 'Ventas' },
    { api: 'CANCELACION', label: 'Cancelación', mod: 'Ventas' },
    // === STOCK (API Doc) ===
    { api: 'MOVIMIENTO_STOCK', label: 'Movimiento de Stock', mod: 'Stock' },
    { api: 'CONSULTA_DE_STOCK', label: 'Consulta de Stock', mod: 'Stock' },
    { api: 'REMITO_DE_DEVOLUCION', label: 'Remito de Devolución', mod: 'Stock' },
    { api: 'REMITO_DE_PRODUCCION', label: 'Remito de Producción', mod: 'Stock' },
    { api: 'REM_INT_EN_TRANSITO', label: 'Rem. Interno en Tránsito', mod: 'Stock' },
    { api: 'PICKING', label: 'Picking', mod: 'Stock' },
    { api: 'HOJA_DE_RUTA', label: 'Hoja de Ruta', mod: 'Stock' },
    { api: 'LOTE', label: 'Lote', mod: 'Stock' },
    { api: 'PUBLICACION', label: 'Publicación', mod: 'Stock' },
    { api: 'EMPAQUE', label: 'Empaque', mod: 'Stock' },
    // === COMPRAS (API Doc) ===
    { api: 'ORDEN_DE_COMPRA', label: 'Orden de Compra', mod: 'Compras' },
    { api: 'FACTURA_COMPRA', label: 'Factura de Compra', mod: 'Compras' },
    { api: 'NOTA_CREDITO_COMPRA', label: 'NC de Compra', mod: 'Compras' },
    { api: 'ORDEN_PAGO', label: 'Orden de Pago', mod: 'Compras' },
    { api: 'SOLICITUD_DE_COMPRA', label: 'Solicitud de Compra', mod: 'Compras' },
    { api: 'DESPACHO', label: 'Despacho', mod: 'Compras' },
    // === CLIENTES / PROVEEDORES ===
    { api: 'CLIENTE', label: 'Cliente', mod: 'Clientes', eid: '345', sid: '2603' },
    { api: 'CONTACTO', label: 'Contacto', mod: 'Clientes' },
    { api: 'SUCURSAL', label: 'Sucursal', mod: 'Clientes' },
    // === PRODUCCION ===
    { api: 'ORDEN_DE_PRODUCCION', label: 'Orden de Producción', mod: 'Producción' },
    { api: 'TAREA_DE_PRODUCCION', label: 'Tarea de Producción', mod: 'Producción' },
    // === CALIDAD ===
    { api: 'NO_CONFORMIDAD', label: 'No Conformidad', mod: 'Calidad' },
    { api: 'ACCION_CORRECTIVA', label: 'Acción Correctiva', mod: 'Calidad' },
];

// Genera el HTML de opciones del selector de entidad
function getEntityOptionsHtml() {
    let html = '<option value="">-- Elegí una entidad --</option>';
    let currentMod = '';
    ENTITY_CATALOG.forEach(e => {
        if (e.mod !== currentMod) {
            if (currentMod) html += '</optgroup>';
            html += `<optgroup label="${e.mod}">`;
            currentMod = e.mod;
        }
        const extra = e.eid ? ` [${e.eid}]` : ' [?]';
        html += `<option value="${e.api}" data-eid="${e.eid||''}" data-sid="${e.sid||''}" data-cid="${e.cid||''}">${e.label}${extra}</option>`;
    });
    if (currentMod) html += '</optgroup>';
    return html;
}

const BUILDER_ACTIONS = {
    GetList: {
        label: 'Listar Registros',
        method: 'POST',
        getMethod: (f) => f.smartieId ? 'POST' : 'GET',
        base: 'https://api.yiqi.com.ar',
        help: '<b>GetList</b> devuelve una lista paginada de registros de una entidad.<br><br>' +
              '<b>entityId</b> = Tipo de registro (seleccioná del catálogo o poné el número)<br>' +
              '<b>smartieId</b> = Vista/filtro predefinido en YiQi (opcional, filtra los registros)<br>' +
              '<b>schemaId</b> = Siempre 1491 (esquema TMC)<br><br>' +
              '<b>API Nueva:</b> También podés usar <code>/NOMBRE_ENTIDAD/query</code> o <code>/NOMBRE_ENTIDAD/smartie</code>',
        fields: [
            { id: 'entitySelect', label: '2. Entidad (catálogo)', type: 'entity-select', required: false },
            { id: 'entityId', label: '   ...o Entity ID directo', placeholder: 'Ej: 781, 787, 1231, 794...', required: false },
            { id: 'smartieId', label: '3. Smartie ID (vista/filtro)', placeholder: 'Ej: 2690, 2698, 2672 (opcional)', required: false },
            { id: 'page', label: '4. Página', placeholder: '1', value: '1', required: false },
            { id: 'pageSize', label: '5. Registros por página', placeholder: '50', value: '50', required: false },
        ],
        buildUrl: (f) => {
            const eid = f.entityId || f._resolvedEid;
            if (!eid) return '';
            let url = `/api/instancesApi/GetList?entityId=${eid}&schemaId=1491`;
            if (f.smartieId) {
                url += `&smartieId=${f.smartieId}`;
            } else {
                url += `&page=${f.page || 1}&pageSize=${f.pageSize || 50}&take=${f.pageSize || 50}`;
            }
            return url;
        },
        buildBody: (f) => {
            if (!f.smartieId) return '';
            return JSON.stringify({ page: parseInt(f.page)||1, pageSize: parseInt(f.pageSize)||50 });
        },
    },
    GetInstance: {
        label: 'Ver Registro Específico',
        method: 'GET',
        base: 'https://api.yiqi.com.ar',
        help: '<b>GetInstance</b> trae TODOS los datos de UN solo registro.<br><br>' +
              '<b>entityId</b> = Tipo de registro<br>' +
              '<b>id</b> = El ID específico del registro que querés ver (lo sacás de un GetList previo)',
        fields: [
            { id: 'entityId', label: '2. Entity ID', placeholder: 'Ej: 781', required: true },
            { id: 'id', label: '3. ID del registro', placeholder: 'El número ID que sacaste de un GetList', required: true },
        ],
        buildUrl: (f) => `/api/instancesApi/GetInstance?entityId=${f.entityId}&schemaId=1491&id=${f.id}`,
        buildBody: () => '',
    },
    GetChildList: {
        label: 'Ver Items de un Documento',
        method: 'GET',
        base: 'https://me.yiqi.com.ar',
        help: '<b>GetChildList</b> muestra los ITEMS/DETALLES dentro de un documento padre.<br><br>' +
              'Ejemplo: los productos dentro de un remito, los artículos dentro de un pedido.<br><br>' +
              '<b>entityId</b> = Entidad del documento padre (781=Rem.Interno, 787=Rem.Compra)<br>' +
              '<b>childId</b> = Tipo de hijo (227=items de rem.interno, 209=items de rem.compra, 245=items de rem.venta)<br>' +
              '<b>instanceId</b> = ID del documento padre (sacalo de un GetList)',
        fields: [
            { id: 'entitySelect', label: '2. Entidad del padre (catálogo)', type: 'entity-select', required: false },
            { id: 'entityId', label: '   ...o Entity ID del padre directo', placeholder: 'Ej: 781, 787', required: false },
            { id: 'childId', label: '3. Child ID (tipo de items)', placeholder: 'Ej: 227 (rem.interno), 209 (rem.compra), 245 (rem.venta)', required: true },
            { id: 'instanceId', label: '4. ID del documento padre', placeholder: 'El ID del remito/pedido a inspeccionar', required: true },
            { id: 'pageSize', label: '5. Cantidad de items', placeholder: '100', value: '100', required: false },
        ],
        buildUrl: (f) => `/api/childrenApi/GetChildList?entityId=${f.entityId}&schemaId=1491&childId=${f.childId}&instanceId=${f.instanceId}&take=${f.pageSize||100}&page=1&pageSize=${f.pageSize||100}`,
        buildBody: () => '',
    },
    Search: {
        label: 'Buscar Artículo',
        method: 'GET',
        base: 'https://me.yiqi.com.ar',
        help: '<b>Search (GetSearchResult)</b> busca artículos por nombre o código para vincularlos a un documento.<br><br>' +
              '<b>entityId</b> = Entidad del documento padre donde querés vincular<br>' +
              '<b>childId</b> = Tipo de hijo (209=items compra, 227=items interno)<br>' +
              '<b>query</b> = Texto a buscar (nombre, código, SKU)',
        fields: [
            { id: 'entityId', label: '2. Entity ID del documento', placeholder: 'Ej: 787, 781', required: true },
            { id: 'childId', label: '3. Child ID', placeholder: 'Ej: 209, 227', required: true },
            { id: 'query', label: '4. Texto a buscar', placeholder: 'Ej: LE70452, Pizzera, etc.', required: true },
        ],
        buildUrl: (f) => `/api/childrenApi/GetSearchResult?entityId=${f.entityId}&schemaId=1491&childId=${f.childId}&query=${encodeURIComponent(f.query)}`,
        buildBody: () => '',
    },
    Save: {
        label: 'Crear Registro Nuevo',
        method: 'POST',
        base: 'https://api.yiqi.com.ar',
        help: '<b>Save</b> crea un registro nuevo en YiQi.<br><br>' +
              'El <b>form</b> es un string con los campos separados por & (formato URL encoded).<br>' +
              'Ejemplo: <code>4181=156&4182=191&4180=Observacion</code><br><br>' +
              'Los números (4181, 4182) son IDs de campos internos de YiQi.',
        fields: [
            { id: 'entityId', label: '2. Entity ID', placeholder: 'Ej: 781', required: true },
            { id: 'form', label: '3. Campos (form string)', placeholder: '4181=156&4182=191&4180=Texto', required: true, type: 'textarea' },
        ],
        buildUrl: () => `/api/instancesApi/Save`,
        buildBody: (f) => JSON.stringify({ schemaId: 1491, entityId: String(f.entityId), form: f.form, uploads: '', parentId: null, childId: null }),
    },
    ExecuteTransition: {
        label: 'Cambiar Estado (Transición)',
        method: 'POST',
        base: 'https://api.yiqi.com.ar',
        help: '<b>ExecuteTransition</b> cambia el estado de un documento (Ej: Pendiente → Enviado → Procesado).<br><br>' +
              '<b>ids</b> = IDs de los documentos a transicionar (puede ser uno o varios)<br>' +
              '<b>transitionId</b> = ID de la transición a ejecutar<br><br>' +
              'Transiciones conocidas:<br>' +
              '• 118455 = Enviar (rem.interno)<br>• 118456 = Procesar (rem.interno)<br>' +
              '• 118453 = Anular pendiente<br>• 119014 = Procesar (rem.compra)',
        fields: [
            { id: 'ids', label: '2. IDs de documentos (separados por coma)', placeholder: 'Ej: 18573 o 18573,18574', required: true },
            { id: 'transitionId', label: '3. Transition ID', placeholder: 'Ej: 118455, 118456', required: true },
        ],
        buildUrl: () => `/api/workflowApi/ExecuteTransition`,
        buildBody: (f) => JSON.stringify({ schemaId: 1491, ids: f.ids.split(',').map(s=>s.trim()), transitionId: parseInt(f.transitionId), form: '' }),
    },
    Delete: {
        label: 'Eliminar Registro',
        method: 'GET',
        base: 'https://api.yiqi.com.ar',
        help: '<b>Delete</b> elimina un registro de YiQi.<br><br>' +
              '<b>CUIDADO</b>: Para eliminar items de un remito, usá el entityId del ITEM (783 para internos, 789 para compra), NO el del padre.',
        fields: [
            { id: 'entityId', label: '2. Entity ID', placeholder: 'Ej: 783 (item interno), 789 (item compra)', required: true },
            { id: 'ids', label: '3. IDs a eliminar (separados por coma)', placeholder: 'Ej: 12345', required: true },
        ],
        buildUrl: (f) => `/api/instancesApi/Delete?schemaId=1491&entityId=${f.entityId}&ids=${f.ids}`,
        buildBody: () => '',
    },
    SaveChild: {
        label: 'Agregar Items a Documento',
        method: 'POST',
        base: 'https://api.yiqi.com.ar',
        help: '<b>SaveChildInstances</b> agrega items (productos) a un documento existente.<br><br>' +
              '<b>Importante</b>: El array childInstances espera strings JSON, no objetos.<br>' +
              'Usar: <code>items.map(i => JSON.stringify(i))</code>',
        fields: [
            { id: 'entityId', label: '2. Entity ID del padre', placeholder: 'Ej: 781, 787', required: true },
            { id: 'childId', label: '3. Child ID', placeholder: 'Ej: 227, 209', required: true },
            { id: 'instanceId', label: '4. ID del documento padre', placeholder: 'El ID del remito al que agregar items', required: true },
            { id: 'childBody', label: '5. Items (JSON array)', placeholder: '[{"CANTIDAD": 1, "CODIGO": "LE70452"}]', required: true, type: 'textarea' },
        ],
        buildUrl: (f) => `/api/childrenApi/SaveChildInstances?instanceId=${f.instanceId}&schemaId=1491`,
        buildBody: (f) => {
            let items = [];
            try { items = JSON.parse(f.childBody); } catch(e) { return ''; }
            return JSON.stringify({ entityId: String(f.entityId), schemaId: 1491, childId: parseInt(f.childId), instanceId: String(f.instanceId), childInstances: items.map(i => JSON.stringify(i)), append: true });
        },
    },
};

function builderUpdate() {
    const action = document.getElementById('builder-action').value;
    const fieldsContainer = document.getElementById('builder-fields');
    const helpContainer = document.getElementById('builder-help');
    const applyBtn = document.getElementById('builder-apply-btn');

    if (!action || !BUILDER_ACTIONS[action]) {
        fieldsContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px; text-align:center;">Elegi una accion arriba para ver los campos</div>';
        helpContainer.style.display = 'none';
        applyBtn.disabled = true;
        return;
    }

    const config = BUILDER_ACTIONS[action];
    applyBtn.disabled = false;

    // Render fields
    let html = '';
    config.fields.forEach(f => {
        const req = f.required ? ' *' : '';
        if (f.type === 'entity-select') {
            html += `<div class="form-group">
                <label class="form-label">${f.label}${req}</label>
                <select class="form-control" id="bf-${f.id}" onchange="onEntitySelect()">
                    ${getEntityOptionsHtml()}
                </select>
            </div>`;
        } else if (f.type === 'textarea') {
            html += `<div class="form-group">
                <label class="form-label">${f.label}${req}</label>
                <textarea class="form-control form-control-mono" id="bf-${f.id}" placeholder="${f.placeholder || ''}" style="min-height:80px;">${f.value || ''}</textarea>
            </div>`;
        } else {
            html += `<div class="form-group">
                <label class="form-label">${f.label}${req}</label>
                <input type="text" class="form-control form-control-mono" id="bf-${f.id}" placeholder="${f.placeholder || ''}" value="${f.value || ''}">
            </div>`;
        }
    });
    fieldsContainer.innerHTML = html;

    // Render help
    helpContainer.innerHTML = config.help;
    helpContainer.style.display = 'block';
}

// Cuando el usuario selecciona una entidad del catálogo, auto-rellena entityId, smartieId, childId
function onEntitySelect() {
    const sel = document.getElementById('bf-entitySelect');
    if (!sel) return;
    const opt = sel.options[sel.selectedIndex];
    const eid = opt.dataset.eid || '';
    const sid = opt.dataset.sid || '';
    const cid = opt.dataset.cid || '';

    // Auto-rellenar campos si existen
    const eidField = document.getElementById('bf-entityId');
    const sidField = document.getElementById('bf-smartieId');
    const cidField = document.getElementById('bf-childId');
    
    if (eidField && eid) eidField.value = eid;
    if (sidField && sid) sidField.value = sid;
    if (cidField && cid) cidField.value = cid;
}

function builderApply() {
    const action = document.getElementById('builder-action').value;
    if (!action || !BUILDER_ACTIONS[action]) return;

    const config = BUILDER_ACTIONS[action];

    // Collect field values
    const fields = {};
    config.fields.forEach(f => {
        const el = document.getElementById('bf-' + f.id);
        fields[f.id] = el ? el.value.trim() : '';
    });

    // Resolve entity from catalog if entitySelect was used
    if (fields.entitySelect && !fields.entityId) {
        const ent = ENTITY_CATALOG.find(e => e.api === fields.entitySelect);
        if (ent && ent.eid) {
            fields._resolvedEid = ent.eid;
            fields.entityId = ent.eid;
        }
    }

    // Check we have entityId somewhere
    const needsEntity = config.fields.some(f => f.id === 'entityId' || f.id === 'entitySelect');
    if (needsEntity && !fields.entityId && !fields._resolvedEid) {
        setFooter('Falta: seleccioná una entidad del catálogo o poné un Entity ID');
        return;
    }

    // Apply
    const method = (typeof config.getMethod === 'function') ? config.getMethod(fields) : config.method;
    setMethod(method);
    currentBaseUrl = config.base;
    document.getElementById('base-url-select').value = config.base;
    document.getElementById('url-prefix').textContent = config.base;
    document.getElementById('url-path').value = config.buildUrl(fields);
    
    const body = config.buildBody(fields);
    document.getElementById('request-body').value = body;

    setFooter(`Constructor: ${config.label} aplicado. Dale a Enviar Request!`);
}

// ============================================
// INIT
// ============================================
async function init() {
    initDefaultHeaders();
    renderPresets();
    renderHistory();
    renderTemplates();
    setFooter('Listo — Conectá con 🔑 para empezar');
    // Auto-connect si hay credenciales
    const user = document.getElementById('auth-user').value;
    const pass = document.getElementById('auth-pass').value;
    if (user && pass) {
        await connectToken();
    }
}

document.addEventListener('DOMContentLoaded', init);

// Keyboard shortcut: Ctrl+Enter to send
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendRequest();
    }
});

function toggleAdvancedActions() {
    const enabled = document.getElementById('enable-advanced-actions').checked;
    const group = document.getElementById('builder-action-advanced-group');
    if (group) {
        group.disabled = !enabled;
    }
}
