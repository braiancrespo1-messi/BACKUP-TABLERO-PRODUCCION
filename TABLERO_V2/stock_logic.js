/* ==================== STOCK LOGIC & RENDERING ==================== */

let currentGroupedStock = [];

async function fabricarStockItem(idx) {
    const item = currentGroupedStock[idx];
    if (!item) return;
    const sku = item["STOC_SKU"] || item["MATE_CODIGO"] || item["SKU"] || "";
    const nombre = item["MATE_NOMBRE"] || item["MATE_DESCRIPCION"] || item["Descripcion"] || "";
    const inputId = `stock-qty-${sku}`;
    await fabricar(sku, nombre, inputId, 'STOCK');
}

async function scheduleStockItem(idx) {
    const item = currentGroupedStock[idx];
    if (!item) return;
    const sku = item["STOC_SKU"] || item["MATE_CODIGO"] || item["SKU"] || "";
    const nombre = item["MATE_NOMBRE"] || item["MATE_DESCRIPCION"] || item["Descripcion"] || "";
    const grp = item["GRUPO_ART"] || item["MATE_GRUPO_IDEN"] || "";
    const inputId = `stock-qty-${sku}`;
    await scheduleItem(sku, nombre, inputId, 'STOCK', grp);
}

function sortStock(n) {
    if (sortState.stock.col === n) {
        sortState.stock.asc = !sortState.stock.asc;
    } else {
        sortState.stock.col = n;
        sortState.stock.asc = true;
    }
    applyFilters();
}

/**
 * Extracted Stock Filter Logic
 * Handles filtering and calls renderStock
 */
function applyStockFilters(search, groupName = null) {
    const chk = document.getElementById('chkHideZero');
    const hideMinZero = chk ? chk.checked : false;

    let filtered = dataStock.filter(r => {

        // 1. Group Filter (if specified)
        if (groupName) {
            // Priority: Filter by Smartie ID mapping
            const groupKey = Object.keys(CONFIG.GROUP_SMARTIES).find(k => k.trim().toUpperCase() === groupName.trim().toUpperCase());
            const targetSmartieId = groupKey ? CONFIG.GROUP_SMARTIES[groupKey] : null;

            if (targetSmartieId) {
                if (r._smartieId !== targetSmartieId) return false;
            } else {
                // Fallback: String matching on GRUPO_ART
                let itemGrp = (r["GRUPO_ART"] || r["MATE_GRUPO_IDEN"] || "").trim().toUpperCase();
                if (!itemGrp) {
                    const sku = r["STOC_SKU"] || r["MATE_CODIGO"] || r["SKU"] || r["Codigo"] || "";
                    const art = dataArticulos.find(a => strip(a["MATE_CODIGO"] || "") === strip(sku));
                    if (art) itemGrp = (art["GRMA_DESCRIPCION"] || art["GRUPO_FAMILIA"] || "").trim().toUpperCase();
                }
                if (itemGrp !== groupName.trim().toUpperCase()) return false;
            }
        }


        // 2. Search Filter
        const sku = r["STOC_SKU"] || r["MATE_CODIGO"] || r["SKU"] || r["Codigo"] || "";
        const nombre = r["MATE_NOMBRE"] || r["MATE_DESCRIPCION"] || r["Descripcion"] || r["Nombre"] || "";
        const txt = (sku + " " + nombre).toLowerCase();
        const min = Number(r["MATE_STOCK_SEGURIDAD"] || r["STOC_MINIMO"] || r["MINIMO"] || 0);

        if (search && !txt.includes(search)) return false;
        if (hideMinZero && min === 0) return false; // Filter by Min 0
        return true;
    });

    renderStock(filtered, groupName); // Pass groupName to update tab counts if needed

    // Update Sort Indicators for Stock
    updateSortIndicators('table-stock');
}

function renderStock(data, groupName = null) {
    const tbody = document.getElementById('body-stock');
    if (!tbody) return;
    tbody.innerHTML = '';

    // If no group is selected and no active search, show placeholder
    if (!groupName) {
        const searchInput = document.getElementById('searchInput-stock');
        const search = searchInput ? searchInput.value.trim() : "";

        if (!search) {
            tbody.innerHTML = `<tr><td colspan="10" style="padding: 40px; text-align: center; color: #999; font-style: italic;">
                <div style="font-size: 1.5rem; margin-bottom: 10px;">📦</div>
                Por favor, seleccione un <strong>Grupo de Stock</strong> para visualizar los datos.
            </td></tr>`;
            const summaryEl = document.getElementById('summary-stock');
            if (summaryEl) summaryEl.style.display = 'none';
            return;
        }
    }

    const isEnlozadasGroup = groupName && strip(groupName).includes("bandejas enlozadas");

    // Dynamic Header Update
    const thead = document.querySelector('#table-stock thead');
    if (thead) {
        thead.innerHTML = `
            <tr>
                <th onclick="sortStock(0)">SKU</th>
                <th onclick="sortStock(1)" style="min-width: 250px;">Descripcion</th>
                <th onclick="sortStock(2)" style="text-align: center;">Terminado</th>
                ${isEnlozadasGroup ? `
                    <th style="text-align: center; background-color: #f1f8ff; color: #0366d6;">Lozametal</th>
                    <th style="text-align: center; background-color: #f1f8ff; color: #0366d6;">Cocciolo</th>
                ` : ''}
                <th onclick="sortStock(3)" style="text-align: center;">Minimo</th>
                <th onclick="sortStock(4)" style="text-align: center;">Faltante Neto</th>
                <th onclick="sortStock(5)" style="text-align: center;">Factibilidad</th>
                <th style="text-align: center; width:140px;">Accion</th>
                <th onclick="sortStock(6)" style="text-align: center; background-color:#f0f0f0; color:#777;">En Prod.</th>
            </tr>
        `;
    }

    // Update specific group tab count
    if (groupName) {
        const safeName = strip(groupName).replace(/\s+/g, '-');
        const countEl = document.getElementById(`count-stock-${safeName}`);
        if (countEl) countEl.innerText = `(${data.length})`;
    }

    // Pre-calculate Enlozados Maps for direct lookup
    const lozametalStock = dataStock.filter(s => s._enamelLocation === "Lozametal");
    const coccioloStock = dataStock.filter(s => s._enamelLocation === "Cocciolo");

    // Calculate En Produccion & Faltante for sorting
    data.forEach(r => {
        const sku = strip(r["STOC_SKU"] || r["MATE_CODIGO"] || r["SKU"] || "");
        r._real = Number(r["STOC_CANTIDAD"] || r["CANTIDAD"] || r["Stock"] || 0);
        r._min = Number(r["MATE_STOCK_SEGURIDAD"] || r["STOC_MINIMO"] || r["MINIMO"] || 0);

        // Enlozados Cross-Reference (Direct PT SKU Match only)
        r._lozametal = 0;
        r._cocciolo = 0;
        if (isEnlozadasGroup) {
            const ptSkuNormal = strip(r["STOC_SKU"] || r["MATE_CODIGO"] || r["SKU"] || "");

            // Match PT SKU directly in Enamel Stocks
            const lzDirect = lozametalStock.find(s => strip(s["STOC_SKU"] || s["MATE_CODIGO"] || "") === ptSkuNormal);
            const ccDirect = coccioloStock.find(s => strip(s["STOC_SKU"] || s["MATE_CODIGO"] || "") === ptSkuNormal);
            if (lzDirect) r._lozametal += Number(lzDirect["STOC_CANTIDAD"] || lzDirect["CANTIDAD"] || 0);
            if (ccDirect) r._cocciolo += Number(ccDirect["STOC_CANTIDAD"] || ccDirect["CANTIDAD"] || 0);
        }

        // Faltante calculation: Min - (Terminado + Enlozado)
        const totalAvailable = r._real + r._lozametal + r._cocciolo;
        r._faltante = Math.max(0, r._min - totalAvailable);
        r._faltanteBruto = Math.max(0, r._min - r._real); // For info/reference

        // Calculate En Produccion
        r._enProdDetails = [];
        r._enProd = calendarEvents.reduce((acc, ev) => {
            if (ev.status !== 'done' && strip(ev.sku) === sku) {
                r._enProdDetails.push({ date: ev.date, qty: ev.qty });
                return acc + Number(ev.qty);
            }
            return acc;
        }, 0);
    });

    // Sort Logic
    data.sort((a, b) => {
        let valA, valB;
        switch (sortState.stock.col) {
            case 0: valA = a["STOC_SKU"] || ""; valB = b["STOC_SKU"] || ""; break;
            case 1: valA = a["MATE_NOMBRE"] || ""; valB = b["MATE_NOMBRE"] || ""; break;
            case 2: valA = a._real; valB = b._real; break;
            case 3: valA = a._min; valB = b._min; break;
            case 4: valA = a._faltante; valB = b._faltante; break;
            case 6: valA = a._enProd; valB = b._enProd; break;
            default: valA = a["STOC_SKU"] || ""; valB = b["STOC_SKU"] || "";
        }
        if (valA < valB) return sortState.stock.asc ? -1 : 1;
        if (valA > valB) return sortState.stock.asc ? 1 : -1;
        return 0;
    });

    currentGroupedStock = data;

    data.forEach((r, idx) => {
        const tr = document.createElement('tr');
        const sku = r["STOC_SKU"] || r["MATE_CODIGO"] || r["SKU"] || "";
        const nombre = r["MATE_NOMBRE"] || r["MATE_DESCRIPCION"] || r["Descripcion"] || "";

        tr.id = `row-stock-${strip(sku)}`;
        if (r._real <= r._min && r._min > 0) tr.classList.add('low-stock');

        let grp = r["GRUPO_ART"] || r["MATE_GRUPO_IDEN"] || "";
        const inputId = `stock-qty-${sku}`;
        let factText = r["FACTIBILIDAD"] || r["Factibilidad"] || "-";
        if (r["FACTIBILIDAD"] === 'OK') factText = "✅";

        tr.innerHTML = `
            <td><strong>${sku}</strong></td>
            <td>${nombre}</td>
            <td style="text-align:center;">${r._real}</td>
            ${isEnlozadasGroup ? `
                <td style="text-align:center; color:#0366d6; font-weight:600;">${r._lozametal || '-'}</td>
                <td style="text-align:center; color:#0366d6; font-weight:600;">${r._cocciolo || '-'}</td>
            ` : ''}
            <td style="text-align:center;">${r._min}</td>
            <td style="text-align:center;" class="${r._faltante > 0 ? 'low-stock-text' : ''}">
                ${r._faltante} 
                ${isEnlozadasGroup && r._faltanteBruto > r._faltante ? `<small style="color:#666; display:block; font-size:0.75em;">(Bruto: ${r._faltanteBruto})</small>` : ''}
            </td>
            <td style="text-align:center;">${factText}</td>
            <td style="text-align:center;">
                <div class="action-group">
                     <input type="number" id="${inputId}" class="qty-input-sm" value="${r._faltante > 0 ? r._faltante : 1}" min="1" style="width:50px; margin-right:5px;">
                     <div class="action-btns-col" style="display:inline-flex; flex-direction:column; vertical-align:middle;">
                         <button class="btn-icon" onclick="fabricarStockItem(${idx})" title="Fabricar">🔨</button>
                         <button class="btn-icon" onclick="scheduleStockItem(${idx})" title="Agendar">📅</button>
                     </div>
                </div>
            </td>
            <td style="text-align:center; background-color:#f9f9f9; color:#666; font-weight:600;">
                ${r._enProd > 0
                ? `<span title="Ver desglose" style="color:#27ae60; font-weight:bold; cursor:pointer;" onclick="event.stopPropagation(); showEnProdMenuForSku(event, '${strip(sku).replace(/'/g, "\\'")}');">${r._enProd} 📅</span>`
                : '-'}
            </td>
        `;
        tbody.appendChild(tr);
    });

    // Summary
    let totalFaltante = data.reduce((acc, r) => acc + r._faltante, 0);
    let totalEnProd = data.reduce((acc, r) => acc + r._enProd, 0);

    const uniqueSmarties = [...new Set(data.map(r => r._smartieId).filter(Boolean))];
    if (isEnlozadasGroup) {
        Object.entries(CONFIG.ENLOZADOS_SMARTIES).forEach(([name, id]) => {
            if (!uniqueSmarties.includes(id)) uniqueSmarties.push(id);
        });
    }
    const displayS = uniqueSmarties.length > 0 ? uniqueSmarties.join(' / ') : CONFIG.SMARTIE_STOCK;

    const summaryEl = document.getElementById('summary-stock');
    if (summaryEl) {
        summaryEl.innerHTML = `
            <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                <div style="display:flex; gap:15px; align-items:center;">
                    <span>🔴 Faltante Neto: <strong>${totalFaltante}</strong> u.</span>
                    <span>🏭 En Producción: <strong>${totalEnProd}</strong> u.</span>
                </div>
                <div style="display:flex; align-items:center; gap:8px;">
                     <span class="stock-smartie-info" style="font-size:0.8em; color:#666;">
                        Stock (S:${displayS} / E:${CONFIG.ENTITY_STOCK}): <strong>${data.length}</strong>
                    </span>
                    <button id="btn-refresh-group" class="btn-icon" 
                            onclick="refreshStockGroup('${groupName}')" 
                            title="Refrescar este grupo" 
                            style="padding:2px; font-size:1.1em; line-height:1;">
                        🔄
                    </button>
                </div>
            </div>`;
        summaryEl.style.display = 'block';
    }
}


async function showEnProdMenuForSku(e, sku) {
    e.stopPropagation();
    const events = calendarEvents.filter(ev => strip(ev.sku) === strip(sku) && ev.status !== 'done');
    events.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (events.length === 0) {
        appAlert("No hay producción pendiente encontrada.");
        return;
    }

    const menu = document.getElementById('context-menu');
    let html = `<div style="padding:4px; font-weight:bold; background:#eee; font-size:0.8em; text-align:center;">Producción: ${sku}</div>`;

    events.forEach(ev => {
        const dateStr = ev.date ? formatDate(ev.date) : "Sin Fecha";
        let extraInfo = "stock";
        if (ev.pedidoId && ev.pedidoId !== 'STOCK') {
            let client = ev.cliente || "";
            if (typeof dataPedidos !== 'undefined') {
                const p = dataPedidos.find(x => String(x.NUMERO) === String(ev.pedidoId));
                if (p && p.CLIENTE) client = p.CLIENTE;
            }
            extraInfo = `#${ev.pedidoId}${client ? ' - ' + client : ''}`;
        }

        html += `
                <div class="ctx-item" onclick="goToCalendarDate('${ev.date}', '${ev.id}'); closeDayMenu();">
                    📅 <strong>${dateStr}</strong> - ${ev.qty} u. <small style="color:#666; margin-left:5px;">(${extraInfo})</small>
                </div>`;
    });

    menu.innerHTML = html;
    menu.style.display = 'block';

    let left = e.pageX - 150;
    if (left < 10) left = 10;
    menu.style.left = left + 'px';
    menu.style.top = e.pageY + 'px';
}
