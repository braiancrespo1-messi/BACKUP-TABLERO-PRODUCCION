filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\TMC los_recibos_no_sirven_para_nada = true; TMC RECIBOS\index.html"
# Wait, let's correct filepath
filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\TMC RECIBOS\index.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Search Results Cache in renderSearchResults
results_target = """    function renderSearchResults(clients) {
      const resultsContainer = document.getElementById("tmc-client-results-list");
      if (clients.length === 0) {
        resultsContainer.innerHTML = `<div class="text-muted" style="text-align: center; padding: 30px;">No se encontraron clientes coincidentes.</div>`;
        return;
      }

      let html = "";"""

results_replacement = """    function renderSearchResults(clients) {
      const resultsContainer = document.getElementById("tmc-client-results-list");
      if (clients.length === 0) {
        resultsContainer.innerHTML = `<div class="text-muted" style="text-align: center; padding: 30px;">No se encontraron clientes coincidentes.</div>`;
        return;
      }

      searchedClientsMap = {};
      let html = "";"""

content = content.replace(results_target, results_replacement)

# Inside renderSearchResults loop, save each client
content = content.replace("""      clients.forEach(c => {
        const isDebt = c.saldo > 0.01;""", """      clients.forEach(c => {
        searchedClientsMap[c.id] = c;
        const isDebt = c.saldo > 0.01;""")

# 2. Store client details in seleccionarCliente
sel_target = """    async function seleccionarCliente(clientCode) {
      document.getElementById("tmc-view-step0").style.display = "none";
      document.getElementById("tmc-view-loader").style.display = "block";
      document.getElementById("tmc-loader-text").textContent = "Cargando comprobantes pendientes del cliente...";

      try {"""

sel_replacement = """    async function seleccionarCliente(clientCode) {
      document.getElementById("tmc-view-step0").style.display = "none";
      document.getElementById("tmc-view-loader").style.display = "block";
      document.getElementById("tmc-loader-text").textContent = "Cargando comprobantes pendientes del cliente...";

      const cachedC = searchedClientsMap[clientCode];
      if (cachedC) {
        currentClientCuit = cachedC.cuit || "";
        currentClientDomicilio = cachedC.domicilio || "";
        currentClientLocalidad = cachedC.localidad || "";
      }

      try {"""

content = content.replace(sel_target, sel_replacement)

# 3. Populate banks datalist inside cargarAuxiliares
aux_target = """            cuentasList = res.cuentas || [];
            retencionesList = res.retenciones || [];
            console.log("Auxiliares de cobro cargados exitosamente.");"""

aux_replacement = """            cuentasList = res.cuentas || [];
            retencionesList = res.retenciones || [];
            
            // Populate banks datalist
            const dl = document.getElementById("bancos-datalist");
            if (dl) {
              dl.innerHTML = bancosList.map(b => `<option value="${escapeHTML(b.nombre)}">`).join("");
            }
            console.log("Auxiliares de cobro cargados exitosamente.");"""

content = content.replace(aux_target, aux_replacement)

# 4. Searchable banks input in addChequeRow
cheque_row_target = """      const bancoOptions = `<option value="">-- Seleccionar Banco --</option>` + bancosList.map(b => `<option value="${b.id}" ${b.id == bancoId ? 'selected' : ''}>${b.nombre}</option>`).join("");
      const cajaOptions = `<option value="">-- Seleccionar Caja --</option>` + cajasList.map(c => `<option value="${c.id}" ${c.id == cajaId ? 'selected' : ''}>${c.nombre}</option>`).join("");
      const todayStr = new Date().toISOString().split("T")[0];
      const rowId = "cheque-" + Date.now() + Math.random().toString(36).substr(2, 5);
      const rowHtml = `
        <div class="tmc-payment-row" id="${rowId}" data-type="cheque" style="background: rgba(59, 130, 246, 0.04); border-color: rgba(59, 130, 246, 0.15); display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: #3b82f6; text-transform: uppercase;">✍️ Cheque</span>
            <button class="tmc-remove-btn" onclick="removePaymentRow('${rowId}')">🗑️ Eliminar</button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="tmc-form-group">
              <label>Nro Cheque *</label>
              <input type="text" class="tmc-row-input tmc-cheque-numero" value="${numero}" placeholder="Número">
            </div>
            <div class="tmc-form-group">
              <label>Banco *</label>
              <select class="tmc-row-input tmc-cheque-banco">${bancoOptions}</select>
            </div>
          </div>"""

cheque_row_replacement = """      const matchedB = bancosList.find(b => b.id == bancoId);
      const bancoName = matchedB ? matchedB.nombre : "";
      const cajaOptions = `<option value="">-- Seleccionar Caja --</option>` + cajasList.map(c => `<option value="${c.id}" ${c.id == cajaId ? 'selected' : ''}>${c.nombre}</option>`).join("");
      const todayStr = new Date().toISOString().split("T")[0];
      const rowId = "cheque-" + Date.now() + Math.random().toString(36).substr(2, 5);
      const rowHtml = `
        <div class="tmc-payment-row" id="${rowId}" data-type="cheque" style="background: rgba(59, 130, 246, 0.04); border-color: rgba(59, 130, 246, 0.15); display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: #3b82f6; text-transform: uppercase;">✍️ Cheque</span>
            <button class="tmc-remove-btn" onclick="removePaymentRow('${rowId}')">🗑️ Eliminar</button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
            <div class="tmc-form-group">
              <label>Nro Cheque *</label>
              <input type="text" class="tmc-row-input tmc-cheque-numero" value="${numero}" placeholder="Número">
            </div>
            <div class="tmc-form-group">
              <label>Banco *</label>
              <input type="text" list="bancos-datalist" class="tmc-row-input tmc-cheque-banco-input" value="${escapeHTML(bancoName)}" placeholder="Buscar banco...">
            </div>
          </div>"""

content = content.replace(cheque_row_target, cheque_row_replacement)

# 5. Validation in updateTotals for bank
validation_target = """            const num = row.querySelector(".tmc-cheque-numero").value.trim();
            const bancoId = row.querySelector(".tmc-cheque-banco").value;
            const fecha = row.querySelector(".tmc-cheque-fecha").value;
            const amt = parseFloat(row.querySelector(".tmc-cheque-importe").value) || 0;
            const electronico = row.querySelector(".tmc-cheque-electronico").checked;
            const cajaId = row.querySelector(".tmc-cheque-caja").value;
            
            if (!num) errors.push(`${idxLabel} Ingresá el número de cheque.`);
            if (!bancoId) errors.push(`${idxLabel} Seleccioná el banco.`);"""

validation_replacement = """            const num = row.querySelector(".tmc-cheque-numero").value.trim();
            const bancoInputVal = row.querySelector(".tmc-cheque-banco-input").value.trim();
            const matchedBanco = bancosList.find(b => b.nombre.toLowerCase() === bancoInputVal.toLowerCase());
            const fecha = row.querySelector(".tmc-cheque-fecha").value;
            const amt = parseFloat(row.querySelector(".tmc-cheque-importe").value) || 0;
            const electronico = row.querySelector(".tmc-cheque-electronico").checked;
            const cajaId = row.querySelector(".tmc-cheque-caja").value;
            
            if (!num) errors.push(`${idxLabel} Ingresá el número de cheque.`);
            if (!bancoInputVal) {
              errors.push(`${idxLabel} Escribí y seleccioná un Banco.`);
            } else if (!matchedBanco) {
              errors.push(`${idxLabel} El banco "${bancoInputVal}" no es válido. Seleccioná uno de la lista.`);
            }"""

content = content.replace(validation_target, validation_replacement)

# 6. Cheque bancoId resolution in submitCobro
submit_cheque_target = """          cheques.push({
            bancoId: parseInt(row.querySelector(".tmc-cheque-banco").value, 10),
            numero: row.querySelector(".tmc-cheque-numero").value.trim(),
            fechaPago: row.querySelector(".tmc-cheque-fecha").value,
            importe: parseFloat(row.querySelector(".tmc-cheque-importe").value),
            electronico: isElectronico,
            cajaId: isElectronico ? null : (cajaIdVal ? parseInt(cajaIdVal, 10) : null),
            cuitLibrador: row.querySelector(".tmc-cheque-cuit").value.trim() || null,
            referencia: row.querySelector(".tmc-cheque-ref").value.trim() || null
          });"""

submit_cheque_replacement = """          const typedBanco = row.querySelector(".tmc-cheque-banco-input").value.trim();
          const matchedBanco = bancosList.find(b => b.nombre.toLowerCase() === typedBanco.toLowerCase());
          cheques.push({
            bancoId: matchedBanco ? matchedBanco.id : null,
            numero: row.querySelector(".tmc-cheque-numero").value.trim(),
            fechaPago: row.querySelector(".tmc-cheque-fecha").value,
            importe: parseFloat(row.querySelector(".tmc-cheque-importe").value),
            electronico: isElectronico,
            cajaId: isElectronico ? null : (cajaIdVal ? parseInt(cajaIdVal, 10) : null),
            cuitLibrador: row.querySelector(".tmc-cheque-cuit").value.trim() || null,
            referencia: row.querySelector(".tmc-cheque-ref").value.trim() || null
          });"""

content = content.replace(submit_cheque_target, submit_cheque_replacement)

print("Programmatic replacements step 6 done.")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
