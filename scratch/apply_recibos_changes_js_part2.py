filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\TMC RECIBOS\index.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Replace populateInvoicesTable function completely
# Let's search for "function populateInvoicesTable()" up to the next section "// =========================================="
# We can find its indices
start_sig = "function populateInvoicesTable() {"
start_idx = content.find(start_sig)
end_sig = "    // =========================================="
# Find end_sig after start_idx
end_idx = content.find(end_sig, start_idx)

if start_idx == -1 or end_idx == -1:
    print("Could not locate populateInvoicesTable function bounds!")
    exit(1)

new_populate_invoices_table = """function populateInvoicesTable() {
      const tbody = document.getElementById("tmc-invoices-list");
      if (!tbody) return;
      
      let debits = cachedMovements.filter(m => {
        const debe = m.debe ? parseFloat(m.debe) : 0;
        const pp = m.pendientePago !== undefined ? parseFloat(m.pendientePago) : debe;
        return debe > 0 && pp > 1.0;
      }).map(m => ({
        comprobante: m.comprobante,
        fecha: m.fecha,
        debe: parseFloat(m.debe),
        pendientePago: m.pendientePago !== undefined ? parseFloat(m.pendientePago) : parseFloat(m.debe)
      }));

      // Search Filter
      const filterVal = (document.getElementById("tmc-invoice-filter")?.value || "").toLowerCase().trim();
      if (filterVal) {
        debits = debits.filter(d => 
          d.comprobante.toLowerCase().includes(filterVal) || 
          formatDate(d.fecha).toLowerCase().includes(filterVal)
        );
      }

      // Sort according to user clickable headers
      if (invoiceSortField === "fecha") {
        debits.sort((a, b) => invoiceSortAsc ? new Date(a.fecha) - new Date(b.fecha) : new Date(b.fecha) - new Date(a.fecha));
      } else if (invoiceSortField === "pendientePago") {
        debits.sort((a, b) => invoiceSortAsc ? a.pendientePago - b.pendientePago : b.pendientePago - a.pendientePago);
      } else if (invoiceSortField === "debe") {
        debits.sort((a, b) => invoiceSortAsc ? a.debe - b.debe : b.debe - a.debe);
      }

      // Update header arrow text
      const thVence = document.getElementById("th-vence-comp");
      const thSaldo = document.getElementById("th-saldo-pend");
      const thOriginal = document.getElementById("th-total-original");
      
      if (thVence) {
        thVence.querySelector(".sort-arrow").textContent = invoiceSortField === "fecha" ? (invoiceSortAsc ? " ▲" : " ▼") : "";
      }
      if (thSaldo) {
        thSaldo.querySelector(".sort-arrow").textContent = invoiceSortField === "pendientePago" ? (invoiceSortAsc ? " ▲" : " ▼") : "";
      }
      if (thOriginal) {
        thOriginal.querySelector(".sort-arrow").textContent = invoiceSortField === "debe" ? (invoiceSortAsc ? " ▲" : " ▼") : "";
      }

      // Toggle Original Total column visibility
      const showTotal = document.getElementById("tmc-show-total-factura")?.checked;
      if (thOriginal) {
        thOriginal.style.display = showTotal ? "table-cell" : "none";
      }

      if (debits.length === 0) {
        tbody.innerHTML = `<tr><td colspan="${showTotal ? 5 : 4}" class="text-center py-5 text-muted">No hay facturas que coincidan con el filtro.</td></tr>`;
        return;
      }

      let invoicesHtml = "";
      debits.forEach(d => {
        const savedVal = currentImputations[d.comprobante] || 0;
        const isChecked = savedVal > 0.01;
        const displayVal = savedVal > 0 ? savedVal.toFixed(2) : "0.00";
        const isDisabled = !isChecked;
        
        invoicesHtml += `
          <tr style="hover: background-color: rgba(255, 255, 255, 0.02);">
            <td style="text-align: center; vertical-align: middle;">
              <input type="checkbox" class="tmc-cobro-invoice-checkbox" data-comprobante="${d.comprobante}" ${isChecked ? 'checked' : ''} style="cursor: pointer; width: 15px; height: 15px; accent-color: var(--primary);" />
            </td>
            <td>
              <div style="font-weight: 600; color: #ffffff;">
                <span onclick="toggleInvoiceDetail('${escapeHTML(d.comprobante)}', this)" style="cursor: pointer; color: var(--primary); text-decoration: underline; font-weight: 600;" title="Ver productos de la factura">${cleanFXComprobante(d.comprobante)}</span>
              </div>
              <div style="font-size: 10px; color: var(--text-muted);">${formatDate(d.fecha)}</div>
            </td>
            ${showTotal ? `<td style="text-align: right; color: #cbd5e1; font-weight: 500; font-family: monospace;">${formatCurrency(d.debe)}</td>` : ""}
            <td style="text-align: right; color: #f87171; font-weight: 600; font-family: monospace;">${formatCurrency(d.pendientePago)}</td>
            <td style="text-align: right;">
              <input type="number" step="0.01" min="0" max="${d.pendientePago}" class="tmc-cobro-invoice-input" data-comprobante="${d.comprobante}" data-pending="${d.pendientePago}" value="${displayVal}" ${isDisabled ? 'disabled' : ''} style="width: 100px; text-align: right; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 6px; color: #ffffff; padding: 4px 8px; font-family: monospace; font-size: 12px; font-weight: 600; outline: none; transition: border-color 0.2s;" />
            </td>
          </tr>
          <tr id="detail-row-${escapeHTML(d.comprobante)}" style="display: none;">
            <td colspan="${showTotal ? 5 : 4}" style="padding: 0 10px 10px 10px; background: rgba(0,0,0,0.15);">
              <div id="detail-content-${escapeHTML(d.comprobante)}" style="padding: 10px; border: 1px dashed rgba(255,255,255,0.08); border-radius: 8px; margin-top: 4px; font-size: 11.5px; animation: tmcFadeIn 0.2s;"></div>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = invoicesHtml;

      // Bind checkbox handlers
      tbody.querySelectorAll(".tmc-cobro-invoice-checkbox").forEach(chk => {
        chk.addEventListener("change", (e) => {
          const comp = e.target.getAttribute("data-comprobante");
          const input = tbody.querySelector(`.tmc-cobro-invoice-input[data-comprobante="${comp}"]`);
          if (input) {
            if (e.target.checked) {
              input.disabled = false;
              const totalPagos = getPaymentsTotal();
              const totalCanc = getCancelationsTotal(comp);
              const useUnapplied = document.getElementById("tmc-cobro-use-unapplied").checked;
              const unappliedAmount = useUnapplied ? currentClientSaldoNoImputadoYiqi : 0;
              const totalDisp = totalPagos + unappliedAmount;
              const diff = Math.max(0, totalDisp - totalCanc);
              const maxPending = parseFloat(input.getAttribute("data-pending")) || 0;
              const val = Math.min(diff, maxPending);
              input.value = val.toFixed(2);
              currentImputations[comp] = val;
            } else {
              input.value = "0.00";
              input.disabled = true;
              delete currentImputations[comp];
            }
          }
          updateTotals();
        });
      });

      // Bind input handlers
      tbody.querySelectorAll(".tmc-cobro-invoice-input").forEach(input => {
        input.addEventListener("input", (e) => {
          let val = parseFloat(e.target.value) || 0;
          const maxPending = parseFloat(e.target.getAttribute("data-pending")) || 0;
          const comp = e.target.getAttribute("data-comprobante");
          const chk = tbody.querySelector(`.tmc-cobro-invoice-checkbox[data-comprobante="${comp}"]`);
          
          if (val > maxPending) {
            val = maxPending;
            e.target.value = maxPending.toFixed(2);
          }
          if (val < 0) {
            val = 0;
            e.target.value = "0.00";
          }
          if (val > 0.01) {
            currentImputations[comp] = val;
            if (chk) chk.checked = true;
          } else {
            delete currentImputations[comp];
            if (chk) chk.checked = false;
          }
          updateTotals();
        });
        
        input.addEventListener("blur", (e) => {
          const comp = e.target.getAttribute("data-comprobante");
          const chk = tbody.querySelector(`.tmc-cobro-invoice-checkbox[data-comprobante="${comp}"]`);
          const val = parseFloat(e.target.value) || 0;
          if (val <= 0.01) {
            if (chk) chk.checked = false;
            e.target.disabled = true;
            delete currentImputations[comp];
          }
          updateTotals();
        });
      });
    }
"""

content = content[:start_idx] + new_populate_invoices_table + content[end_idx:]

# 2. Replace Session History Handlers: downloadPdfHistory, saveReceiptToHistory, renderSessionHistory
# Let's search for "window.downloadPdfHistory = " up to the next comment or function
h_start_sig = "    // ==========================================\n    // Session History Helpers\n    // =========================================="
h_start_idx = content.find(h_start_sig)
h_end_sig = "    // ==========================================\n    // Custom Dialog Alert/Confirm Helper"
h_end_idx = content.find(h_end_sig, h_start_idx)

if h_start_idx == -1 or h_end_idx == -1:
    print("Could not locate history functions bounds!")
    exit(1)

new_history_section = """    // ==========================================
    // Session History Helpers
    // ==========================================
    window.downloadPdfHistory = (cobroId, isFX) => {
      if (isFX) {
        let history = [];
        try {
          history = JSON.parse(localStorage.getItem("tmc_emitted_receipts")) || [];
        } catch (e) { history = []; }
        const record = history.find(r => r.cobroId == cobroId);
        if (record) {
          printCustomReceipt(record);
        } else {
          showCustomAlert("Error", "No se encontraron los datos locales de este recibo FX para imprimir.");
        }
      } else {
        window.open(`https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportName=RECIBO_v1.2&instanceId=${cobroId}&schemaId=1491&entityName=COBRO`, '_blank');
      }
    };

    window.toggleHistoryDrawer = () => {
      const drawer = document.getElementById("tmc-history-drawer");
      if (drawer) {
        drawer.classList.toggle("open");
      }
    };

    function saveReceiptToHistory(clientName, clientCode, cobroId, receiptNumber, amount, isFX) {
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem("tmc_emitted_receipts")) || [];
      } catch (e) { history = []; }
      
      const newRecord = {
        timestamp: new Date().toISOString(),
        clientName,
        clientCode,
        cobroId,
        receiptNumber,
        amount,
        isFX,
        // Full fields for custom print
        fecha: document.getElementById("tmc-cobro-fecha").value,
        cuit: currentClientCuit,
        domicilio: currentClientDomicilio,
        localidad: currentClientLocalidad,
        efectivos: getPaymentsEfectivos(),
        cheques: getPaymentsCheques(),
        transferencias: getPaymentsTransferencias(),
        electronicos: getPaymentsElectronicos(),
        retenciones: getPaymentsRetenciones(),
        cancelaciones: getPaymentsCancelaciones()
      };
      history.unshift(newRecord);
      localStorage.setItem("tmc_emitted_receipts", JSON.stringify(history));
      renderSessionHistory();
    }

    function getPaymentsEfectivos() {
      const list = [];
      document.querySelectorAll(".tmc-payment-row[data-type='efectivo']").forEach(row => {
        list.push({
          cajaId: parseInt(row.querySelector(".tmc-efectivo-caja").value, 10),
          importe: parseFloat(row.querySelector(".tmc-efectivo-importe").value) || 0
        });
      });
      return list;
    }
    function getPaymentsCheques() {
      const list = [];
      document.querySelectorAll(".tmc-payment-row[data-type='cheque']").forEach(row => {
        const isElectronico = row.querySelector(".tmc-cheque-electronico").checked;
        list.push({
          bancoId: bancosList.find(b => b.nombre.toLowerCase() === row.querySelector(".tmc-cheque-banco-input").value.trim().toLowerCase())?.id || null,
          numero: row.querySelector(".tmc-cheque-numero").value.trim(),
          fechaPago: row.querySelector(".tmc-cheque-fecha").value,
          importe: parseFloat(row.querySelector(".tmc-cheque-importe").value) || 0,
          electronico: isElectronico,
          cajaId: isElectronico ? null : parseInt(row.querySelector(".tmc-cheque-caja").value, 10),
          cuitLibrador: row.querySelector(".tmc-cheque-cuit").value.trim() || null,
          referencia: row.querySelector(".tmc-cheque-ref").value.trim() || null
        });
      });
      return list;
    }
    function getPaymentsTransferencias() {
      const list = [];
      document.querySelectorAll(".tmc-payment-row[data-type='transferencia']").forEach(row => {
        list.push({
          cuentaDestinoId: parseInt(row.querySelector(".tmc-transfer-cuenta").value, 10),
          referencia: row.querySelector(".tmc-transfer-ref").value.trim() || null,
          importe: parseFloat(row.querySelector(".tmc-transfer-importe").value) || 0
        });
      });
      return list;
    }
    function getPaymentsElectronicos() {
      const list = [];
      document.querySelectorAll(".tmc-payment-row[data-type='electronico']").forEach(row => {
        list.push({
          conceptoId: parseInt(row.querySelector(".tmc-electronico-concepto").value, 10),
          nroOperacion: row.querySelector(".tmc-electronico-ref").value.trim() || null,
          importe: parseFloat(row.querySelector(".tmc-electronico-importe").value) || 0
        });
      });
      return list;
    }
    function getPaymentsRetenciones() {
      const list = [];
      document.querySelectorAll(".tmc-payment-row[data-type='retencion']").forEach(row => {
        list.push({
          numero: row.querySelector(".tmc-retencion-numero").value.trim(),
          conceptoId: parseInt(row.querySelector(".tmc-retencion-concepto").value, 10),
          fechaEmision: row.querySelector(".tmc-retencion-fecha").value || null,
          importe: parseFloat(row.querySelector(".tmc-retencion-importe").value) || 0
        });
      });
      return list;
    }
    function getPaymentsCancelaciones() {
      const list = [];
      for (const comp in currentImputations) {
        if (currentImputations[comp] > 0.01) {
          list.push({
            invoiceNumber: comp,
            amount: currentImputations[comp]
          });
        }
      }
      return list;
    }

    function renderSessionHistory() {
      const tbody = document.getElementById("tmc-session-history-list");
      const triggerBtn = document.getElementById("tmc-history-trigger-btn");
      const badge = document.getElementById("tmc-history-badge");
      
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem("tmc_emitted_receipts")) || [];
      } catch (e) { history = []; }
      
      if (triggerBtn && badge) {
        if (history.length > 0) {
          triggerBtn.style.display = "flex";
          badge.textContent = history.length;
        } else {
          triggerBtn.style.display = "none";
          const drawer = document.getElementById("tmc-history-drawer");
          if (drawer) drawer.classList.remove("open");
        }
      }
      
      if (!tbody) return;
      
      let html = "";
      if (history.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-4 text-muted" style="font-size: 12px;">No hay recibos en esta sesión.</td></tr>`;
        return;
      }
      
      history.forEach(r => {
        const dateLocal = new Date(r.timestamp).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) + " - " + new Date(r.timestamp).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });
        html += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
            <td style="padding: 6px 8px; font-size:11px;">
              <div style="font-weight: 600; color: #ffffff;">${r.clientName}</div>
              <div style="font-size: 9.5px; color: var(--text-muted);">${dateLocal}</div>
            </td>
            <td style="padding: 6px 8px; font-family: monospace; font-weight: bold; color: var(--primary); font-size:11px;">
              ${r.receiptNumber || r.cobroId}
              <div style="font-size: 8px; color: var(--text-muted); font-family: inherit;">ID: ${r.cobroId}</div>
            </td>
            <td style="padding: 6px 8px; text-align: right; font-weight: 700; color: var(--success); font-family: monospace; font-size:11px;">${formatCurrency(r.amount)}</td>
            <td style="padding: 6px 8px; text-align: center;">
              <button onclick="downloadPdfHistory('${r.cobroId}', ${!!r.isFX})" class="tmc-btn" style="padding: 4px 6px; font-size: 10px; background-color: var(--purple); color: #ffffff; border-radius: 4px; box-shadow: none;">📥 PDF</button>
            </td>
          </tr>
        `;
      });
      tbody.innerHTML = html;
    }"""

content = content.replace(content[h_start_idx:h_end_idx], new_history_section)

# 3. Replace default observations default in submitCobro observations assignment
content = content.replace('observaciones || "Recibo Manual (Aplicativo TMC Recibos)"', 'observaciones || "R.M.A"')

# 4. Modify submitCobro to call saveReceiptToHistory with isFX Receipt check
history_save_call_target = "saveReceiptToHistory(currentClientRazonSocial || currentClientName, currentClientCode, res.cobroId, totalPaid);"
history_save_call_replacement = "saveReceiptToHistory(currentClientRazonSocial || currentClientName, currentClientCode, res.cobroId, res.receiptNumber || res.cobroId, totalPaid, isFXReceipt());"
content = content.replace(history_save_call_target, history_save_call_replacement)

# Also update success screen innerHTML binding to show receipt number
success_msg_target = 'document.getElementById("tmc-success-msg").innerHTML = `El recibo manual fue emitido y guardado exitosamente en YiQi ERP.<br><strong>Número de Recibo Oficial: ${res.cobroId}</strong>`;'
success_msg_replacement = 'document.getElementById("tmc-success-msg").innerHTML = `El recibo manual fue emitido y guardado exitosamente en YiQi ERP.<br><strong>Número de Recibo Oficial: ${res.receiptNumber || res.cobroId}</strong>`;'
content = content.replace(success_msg_target, success_msg_replacement)

# 5. Success PDF download action to check isFXReceipt
success_pdf_target = """    document.getElementById("tmc-btn-success-pdf").addEventListener("click", () => {
      if (lastCobroId) {
        window.open(`https://descargarreportepdf-vb5plcbgra-uc.a.run.app?reportName=RECIBO_v1.2&instanceId=${lastCobroId}&schemaId=1491&entityName=COBRO`, '_blank');
      }
    });"""

success_pdf_replacement = """    document.getElementById("tmc-btn-success-pdf").addEventListener("click", () => {
      if (lastCobroId) {
        downloadPdfHistory(lastCobroId, isFXReceipt());
      }
    });"""

content = content.replace(success_pdf_target, success_pdf_replacement)

# 6. Append helper functions at the end of the script tag (just before DOMContentLoaded list)
helpers_block = """  // Helper functions
  const escapeHTML = (str) => {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  };

  function isFXReceipt() {
    const checkName = (currentClientRazonSocial || currentClientName || "").toLowerCase();
    const isClientFX = checkName.includes("fx") || /\\bx\\b/.test(checkName);
    
    let isInvoiceFX = false;
    for (const comp in currentImputations) {
      if (currentImputations[comp] > 0.01) {
        const nameLower = comp.toLowerCase();
        if (nameLower.includes("fx") || nameLower.includes("factura x") || nameLower.includes("fac. x") || nameLower.includes("fact x")) {
          isInvoiceFX = true;
          break;
        }
      }
    }
    return isClientFX || isInvoiceFX;
  }

  window.toggleSort = (field) => {
    if (invoiceSortField === field) {
      invoiceSortAsc = !invoiceSortAsc;
    } else {
      invoiceSortField = field;
      invoiceSortAsc = true;
    }
    saveImputationsState();
    populateInvoicesTable();
  };

  window.toggleInvoiceDetail = async (comprobante, el) => {
    const detailRow = document.getElementById(`detail-row-${comprobante}`);
    const detailContent = document.getElementById(`detail-content-${comprobante}`);
    if (!detailRow || !detailContent) return;

    if (detailRow.style.display !== "none") {
      detailRow.style.display = "none";
      return;
    }

    detailRow.style.display = "table-row";
    
    if (invoiceDetailsCache[comprobante]) {
      renderInvoiceDetail(comprobante, invoiceDetailsCache[comprobante]);
      return;
    }

    detailContent.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px; padding: 4px;">
        <div class="tmc-spinner" style="width: 14px; height: 14px; border-width: 2px; margin: 0;"></div>
        <span style="color: var(--text-muted);">Cargando detalle del comprobante...</span>
      </div>
    `;

    try {
      const response = await fetch(`${OBTENER_DETALLE_URL}?comprobante=${encodeURIComponent(comprobante)}&clientCode=${currentClientCode}`);
      if (!response.ok) throw new Error("HTTP " + response.status);
      const res = await response.json();
      if (res.success) {
        invoiceDetailsCache[comprobante] = res;
        renderInvoiceDetail(comprobante, res);
      } else {
        throw new Error(res.error || "No se pudo obtener el detalle");
      }
    } catch (err) {
      console.error("Error al obtener detalle:", err);
      detailContent.innerHTML = `
        <div style="color: var(--danger); padding: 4px;">
          ❌ Error al cargar detalles: ${err.message}
        </div>
      `;
    }
  };

  function renderInvoiceDetail(comprobante, detail) {
    const detailContent = document.getElementById(`detail-content-${comprobante}`);
    if (!detailContent) return;

    let html = "";
    if (detail.pedidoId) {
      const nroLabel = detail.pedidoNro ? `N° ${detail.pedidoNro}` : `ID: ${detail.pedidoId}`;
      const estadoLabel = detail.pedidoEstado ? ` (${detail.pedidoEstado})` : '';
      html += `
        <div style="margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1px dashed rgba(255,255,255,0.08); color: var(--warning); font-weight: 600; font-size:11px;">
          📦 Pedido Asociado: ${nroLabel}${estadoLabel}
        </div>
      `;
    }

    if (detail.observaciones) {
      html += `<div style="font-style: italic; color: var(--text-muted); margin-bottom: 6px; font-size:11px;">Obs: ${detail.observaciones}</div>`;
    }

    if (detail.detalles && detail.detalles.length > 0) {
      html += `
        <table style="width: 100%; border-collapse: collapse; font-size: 11px; margin-top: 4px;">
          <thead>
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.12); text-align: left; color: var(--text-muted);">
              <th style="padding: 4px 6px;">Cód.</th>
              <th style="padding: 4px 6px;">Concepto</th>
              <th style="padding: 4px 6px; text-align: right;">Cant.</th>
              <th style="padding: 4px 6px; text-align: right;">Precio</th>
              <th style="padding: 4px 6px; text-align: right;">Subtotal</th>
            </tr>
          </thead>
          <tbody>
      `;

      detail.detalles.forEach(item => {
        html += `
          <tr style="border-bottom: 1px solid rgba(255,255,255,0.04);">
            <td style="padding: 4px 6px; color: var(--text-muted); font-family: monospace;">${item.codigo || '-'}</td>
            <td style="padding: 4px 6px; color: #ffffff;">${item.concepto || ''}</td>
            <td style="padding: 4px 6px; text-align: right; font-family: monospace;">${item.cantidad}</td>
            <td style="padding: 4px 6px; text-align: right; font-family: monospace;">${formatCurrency(item.precio)}</td>
            <td style="padding: 4px 6px; text-align: right; font-family: monospace; font-weight: 600; color: #f8fafc;">${formatCurrency(item.subtotal)}</td>
          </tr>
        `;
      });

      html += `
          </tbody>
        </table>
      `;
    } else {
      html += `<div style="color: var(--text-muted); font-size:11px;">Sin detalles de productos disponibles.</div>`;
    }

    detailContent.innerHTML = html;
  }

  function numeroALetras(num) {
    const unidades = ["", "un", "dos", "tres", "cuatro", "cinco", "seis", "siete", "ocho", "nueve"];
    const decenas = ["diez", "once", "doce", "trece", "catorce", "quince", "dieciséis", "diecisiete", "dieciocho", "diecinueve"];
    const decenasDiez = ["", "diez", "veinte", "treinta", "cuarenta", "cincuenta", "sesenta", "setenta", "ochenta", "noventa"];
    const centenas = ["", "ciento", "doscientos", "trescientos", "cuatrocientos", "quinientos", "seiscientos", "setecientos", "ochocientos", "novecientos"];

    function seccion(n, divisor, strSingular, strPlural) {
      let ciento = Math.floor(n / divisor);
      let resto = n % divisor;
      let str = "";
      if (ciento > 0) {
        if (ciento === 1 && resto === 0) {
          str = "cien";
        } else {
          str = centenas[ciento];
        }
      }
      if (resto > 0) {
        if (str !== "") str += " ";
        if (resto < 10) {
          str += unidades[resto];
        } else if (resto < 20) {
          str += decenas[resto - 10];
        } else {
          let dec = Math.floor(resto / 10);
          let uni = resto % 10;
          if (uni > 0) {
            if (dec === 2) {
              str = "veinti" + unidades[uni];
            } else {
              str = decenasDiez[dec] + " y " + unidades[uni];
            }
          } else {
            str += decenasDiez[dec];
          }
        }
      }
      if (divisor === 1) return str;
      if (ciento > 0 || resto > 0) {
        return str + " " + (n === 1 ? strSingular : strPlural);
      }
      return "";
    }

    let entero = Math.floor(num);
    let centavos = Math.round((num - entero) * 100);
    
    if (entero === 0) return "cero con " + centavos + "/00";
    
    let strEntero = "";
    let millones = Math.floor(entero / 1000000);
    let restoMillones = entero % 1000000;
    let miles = Math.floor(restoMillones / 1000);
    let restoMiles = restoMillones % 1000;

    if (millones > 0) {
      strEntero += seccion(millones, 1, "millón", "millones");
    }
    if (miles > 0) {
      if (strEntero !== "") strEntero += " ";
      if (miles === 1) {
        strEntero += "mil";
      } else {
        strEntero += seccion(miles, 1, "", "") + " mil";
      }
    }
    if (restoMiles > 0) {
      if (strEntero !== "") strEntero += " ";
      strEntero += seccion(restoMiles, 1, "", "");
    }

    let centavosStr = centavos < 10 ? "0" + centavos : centavos;
    return strEntero.toUpperCase() + " CON " + centavosStr + "/00";
  }

  function printCustomReceipt(r) {
    const w = window.open("", "_blank");
    if (!w) {
      showCustomAlert("Bloqueador de ventanas", "Por favor, habilita las ventanas emergentes para poder imprimir el recibo.");
      return;
    }

    let liqRows = "";
    let totalLiq = 0;
    r.cancelaciones.forEach(c => {
      let cleanName = cleanFXComprobante(c.invoiceNumber);
      if (/fx\\b|factura\\s+x|fac\\.?\\s+x/i.test(c.invoiceNumber)) {
        cleanName = "Fact X Nº " + cleanName;
      }
      liqRows += `
        <tr>
          <td>${formatDate(r.fecha)}</td>
          <td>${cleanName}</td>
          <td class="text-right">$ ${parseFloat(c.amount).toFixed(2)}</td>
        </tr>
      `;
      totalLiq += parseFloat(c.amount);
    });

    let payRows = "";
    if (r.efectivos && r.efectivos.length > 0) {
      r.efectivos.forEach(e => {
        const caja = cajasList.find(c => c.id == e.cajaId);
        payRows += `
          <tr>
            <td>Efectivo (${caja ? caja.nombre : 'Caja'})</td>
            <td class="text-right">$ ${parseFloat(e.importe).toFixed(2)}</td>
          </tr>
        `;
      });
    }
    if (r.cheques && r.cheques.length > 0) {
      r.cheques.forEach(ch => {
        const banco = bancosList.find(b => b.id == ch.bancoId);
        payRows += `
          <tr>
            <td>Cheque N°${ch.numero} (${banco ? banco.nombre : 'Banco'}) - Vto: ${formatDate(ch.fechaPago)}</td>
            <td class="text-right">$ ${parseFloat(ch.importe).toFixed(2)}</td>
          </tr>
        `;
      });
    }
    if (r.transferencias && r.transferencias.length > 0) {
      r.transferencias.forEach(t => {
        const cuenta = cuentasList.find(c => c.id == t.cuentaDestinoId);
        payRows += `
          <tr>
            <td>Transferencia (${cuenta ? cuenta.nombre : 'Cuenta'}) - Ref: ${t.referencia || '-'}</td>
            <td class="text-right">$ ${parseFloat(t.importe).toFixed(2)}</td>
          </tr>
        `;
      });
    }
    if (r.electronicos && r.electronicos.length > 0) {
      r.electronicos.forEach(el => {
        payRows += `
          <tr>
            <td>Electrónico - Ref: ${el.nroOperacion || '-'}</td>
            <td class="text-right">$ ${parseFloat(el.importe).toFixed(2)}</td>
          </tr>
        `;
      });
    }
    if (r.retenciones && r.retenciones.length > 0) {
      r.retenciones.forEach(ret => {
        const concepto = retencionesList.find(c => c.id == ret.conceptoId);
        payRows += `
          <tr>
            <td>Retención N°${ret.numero} (${concepto ? concepto.nombre : 'Retención'})</td>
            <td class="text-right">$ ${parseFloat(ret.importe).toFixed(2)}</td>
          </tr>
        `;
      });
    }

    const letters = numeroALetras(r.amount);

    w.document.write(`
      <!DOCTYPE html>
      <html lang="es">
      <head>
        <meta charset="UTF-8">
        <title>Recibo No Oficial - ${r.receiptNumber}</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            color: #000000;
            margin: 40px;
            line-height: 1.4;
            font-size: 13px;
          }
          .container {
            border: 1px solid #000000;
            padding: 0;
            max-width: 800px;
            margin: 0 auto;
          }
          .header-table {
            width: 100%;
            border-collapse: collapse;
            border-bottom: 2px solid #000000;
          }
          .header-table td {
            border: 1px solid #000000;
            padding: 12px;
            vertical-align: top;
          }
          .logo-area {
            width: 55%;
          }
          .logo-title {
            font-size: 22px;
            font-weight: bold;
            margin-bottom: 4px;
          }
          .logo-subtitle {
            font-size: 13px;
            font-weight: bold;
            margin-bottom: 6px;
          }
          .x-box {
            width: 80px;
            text-align: center;
            vertical-align: middle !important;
            padding: 0 !important;
          }
          .x-letter {
            font-size: 48px;
            font-weight: bold;
            line-height: 1;
          }
          .x-desc {
            font-size: 8px;
            font-weight: bold;
            margin-top: 4px;
          }
          .receipt-info {
            width: 35%;
          }
          .receipt-info h2 {
            margin: 0 0 6px 0;
            font-size: 15px;
          }
          .client-table {
            width: 100%;
            border-collapse: collapse;
            border-bottom: 2px solid #000000;
          }
          .client-table td {
            padding: 8px 12px;
            border-bottom: 1px dashed #cccccc;
          }
          .client-table tr:last-child td {
            border-bottom: none;
          }
          .details-container {
            display: flex;
            border-bottom: 2px solid #000000;
          }
          .liq-column {
            width: 55%;
            border-right: 2px solid #000000;
            display: flex;
            flex-direction: column;
          }
          .imp-column {
            width: 45%;
            display: flex;
            flex-direction: column;
          }
          .section-title {
            background-color: #e0e0e0;
            text-align: center;
            font-weight: bold;
            padding: 6px;
            border-bottom: 1px solid #000000;
            font-size: 11px;
            text-transform: uppercase;
          }
          .liq-table, .imp-table {
            width: 100%;
            border-collapse: collapse;
          }
          .liq-table th, .imp-table th {
            background-color: #f2f2f2;
            font-weight: bold;
            padding: 6px;
            font-size: 11px;
            border-bottom: 1px solid #000000;
          }
          .liq-table td, .imp-table td {
            padding: 6px 8px;
            border-bottom: 1px solid #e0e0e0;
            font-size: 11.5px;
          }
          .text-right {
            text-align: right;
          }
          .amount-section {
            padding: 12px;
            border-bottom: 2px solid #000000;
            font-weight: bold;
          }
          .footer-section {
            padding: 12px;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
          }
          @media print {
            body {
              margin: 20px;
            }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <table class="header-table">
            <tr>
              <td class="logo-area">
                <div class="logo-title">TMC</div>
                <div class="logo-subtitle">TALLERES METALURGICOS CRESPO S.R.L.</div>
                <div style="font-size: 11px; color: #444444;">
                  Cosquín 994 - 1127128158<br>
                  https://distribuidores.tmconline.com.ar/<br>
                  Responsable inscripto
                </div>
              </td>
              <td class="x-box">
                <div class="x-letter">X</div>
                <div class="x-desc">DOCUMENTO NO VALIDO COMO FACTURA</div>
              </td>
              <td class="receipt-info">
                <h2>RECIBO Nº 0000 - ${String(r.receiptNumber).padStart(8, '0')}</h2>
                <div style="margin-top: 10px; font-size: 11.5px;">
                  <strong>Fecha:</strong> ${formatDate(r.fecha)}<br><br>
                  <strong>CUIT:</strong> 30717981312<br>
                  <strong>ING. BRUTOS:</strong> 30717981312<br>
                  <strong>INICIO ACT.:</strong> 07/03/2023
                </div>
              </td>
            </tr>
          </table>

          <table class="client-table">
            <tr>
              <td style="width: 50%;"><strong>Señores:</strong> ${r.clientName}</td>
              <td style="width: 50%;"><strong>Localidad:</strong> ${r.localidad || '-'}</td>
            </tr>
            <tr>
              <td><strong>Domicilio:</strong> ${r.domicilio || '-'}</td>
              <td><strong>C.U.I.T.:</strong> ${r.cuit || 'No oficial'}</td>
            </tr>
          </table>

          <div class="details-container">
            <div class="liq-column">
              <div class="section-title">Liquidación</div>
              <table class="liq-table">
                <thead>
                  <tr>
                    <th style="width: 70px;">Fecha</th>
                    <th>Comprobante N°</th>
                    <th style="width: 90px; text-align: right;">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${liqRows}
                  <tr style="font-weight: bold; background-color: #f9f9f9;">
                    <td colspan="2" class="text-right">TOTAL $</td>
                    <td class="text-right">$ ${totalLiq.toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div class="imp-column">
              <div class="section-title">Imputación</div>
              <table class="imp-table">
                <thead>
                  <tr>
                    <th>Medio de Pago</th>
                    <th style="width: 90px; text-align: right;">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  ${payRows}
                  <tr style="font-weight: bold; background-color: #f9f9f9;">
                    <td class="text-right">TOTAL $</td>
                    <td class="text-right">$ ${parseFloat(r.amount).toFixed(2)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <div class="amount-section">
            Recibimos la cantidad de: $ ${parseFloat(r.amount).toFixed(2)} (${letters})
          </div>

          <div class="footer-section">
            <div><strong>Moneda:</strong> ARS</div>
            <div style="font-style: italic; color: #555555;">Documento de uso interno y cobranza</div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          }
        <\/script>
      </body>
      </html>
    `);
    w.document.close();
  }

"""

# Let's insert helpers before initialize application listener
init_sig = "    // Initialize application on load"
init_idx = content.find(init_sig)

if init_idx == -1:
    print("Could not find initialization block!")
    exit(1)

content = content[:init_idx] + helpers_block + content[init_idx:]

# 7. Add change listener for show total checkbox in DOMContentLoaded
dom_loaded_target = """    document.addEventListener("DOMContentLoaded", () => {
      const filterInput = document.getElementById("tmc-invoice-filter");
      if (filterInput) {
        filterInput.addEventListener("input", () => {
          saveImputationsState();
          populateInvoicesTable();
        });
      }
      const sortSelect = document.getElementById("tmc-invoice-sort");
      if (sortSelect) {
        sortSelect.addEventListener("change", () => {
          saveImputationsState();
          populateInvoicesTable();
        });
      }
    });"""

dom_loaded_replacement = """    document.addEventListener("DOMContentLoaded", () => {
      const filterInput = document.getElementById("tmc-invoice-filter");
      if (filterInput) {
        filterInput.addEventListener("input", () => {
          saveImputationsState();
          populateInvoicesTable();
        });
      }
      const showTotalChk = document.getElementById("tmc-show-total-factura");
      if (showTotalChk) {
        showTotalChk.addEventListener("change", () => {
          saveImputationsState();
          populateInvoicesTable();
        });
      }
    });"""

content = content.replace(dom_loaded_target, dom_loaded_replacement)

# 8. Append HTML lateral drawer and datalist at the end of the body
body_end_sig = "</body>"
body_end_idx = content.rfind(body_end_sig)

if body_end_idx == -1:
    print("Could not find closing body tag!")
    exit(1)

html_drawer_block = """  <!-- HISTORIAL PANEL LATERAL (DRAWER) -->
  <div id="tmc-history-drawer" class="tmc-drawer">
    <div class="tmc-drawer-header">
      <h3>⏱️ Recibos Emitidos en la Sesión</h3>
      <button onclick="toggleHistoryDrawer()" class="tmc-drawer-close-btn">&times;</button>
    </div>
    <div class="tmc-drawer-body">
      <div style="display: flex; justify-content: flex-end; margin-bottom: 12px;">
        <button id="tmc-btn-clear-history-drawer" class="tmc-btn tmc-btn-secondary" style="padding: 4px 8px; font-size: 11px; border-radius: 6px;">Borrar Historial</button>
      </div>
      <div class="tmc-table-wrapper" style="max-height: calc(100vh - 120px); border: none; background: transparent; margin: 0; overflow-y: auto;">
        <table class="tmc-table">
          <thead>
            <tr style="border-bottom: 2px solid rgba(255, 255, 255, 0.1); color: var(--text-muted); font-weight: 600;">
              <th style="padding: 6px 8px;">Cliente / Fecha</th>
              <th style="padding: 6px 8px;">Comprobante</th>
              <th style="padding: 6px 8px; text-align: right;">Total</th>
              <th style="padding: 6px 8px; text-align: center; width: 60px;">Acción</th>
            </tr>
          </thead>
          <tbody id="tmc-session-history-list">
            <!-- Emitted receipts listed here -->
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <!-- BOTON FLOTANTE DE HISTORIAL -->
  <button id="tmc-history-trigger-btn" class="tmc-floating-trigger" onclick="toggleHistoryDrawer()">
    <span>⏱️ Recibos Emitidos</span>
    <span id="tmc-history-badge" class="tmc-floating-badge">0</span>
  </button>

  <!-- BANCOS DATALIST -->
  <datalist id="bancos-datalist"></datalist>

"""

content = content[:body_end_idx] + html_drawer_block + content[body_end_idx:]

# Update clear history button binding
content = content.replace('document.getElementById("tmc-btn-clear-history").addEventListener("click", () => {', 'document.getElementById("tmc-btn-clear-history-drawer").addEventListener("click", () => {')

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("JS and HTML replacements done successfully!")
