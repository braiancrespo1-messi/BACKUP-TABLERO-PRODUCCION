filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\ADMINSITRATIVAS INTERNAS\cuentas_corrientes_clientes.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Populate banks datalist inside cargarAuxiliares
aux_target = """          cuentasList = res.cuentas || [];
          retencionesList = res.retenciones || [];
          console.log("Auxiliares de cobro cargados exitosamente.");"""

aux_replacement = """          cuentasList = res.cuentas || [];
          retencionesList = res.retenciones || [];
          
          // Populate banks datalist
          const dl = document.getElementById("bancos-datalist");
          if (dl) {
            dl.innerHTML = bancosList.map(b => `<option value="${escapeHTML(b.nombre)}">`).join("");
          }
          console.log("Auxiliares de cobro cargados exitosamente.");"""

content = content.replace(aux_target, aux_replacement)

# 2. Searchable banks input in addChequeRow
cheque_row_target = """      const bancoOptions = `<option value="">-- Seleccionar Banco --</option>` + bancosList.map(b => `<option value="${b.id}" ${b.id == bancoId ? 'selected' : ''}>${b.nombre}</option>`).join("");
      const cajaOptions = `<option value="">-- Seleccionar Caja --</option>` + cajasList.map(c => `<option value="${c.id}" ${c.id == cajaId ? 'selected' : ''}>${c.nombre}</option>`).join("");
      const todayStr = new Date().toISOString().split("T")[0];
      const rowId = "cheque-" + Date.now() + Math.random().toString(36).substr(2, 5);
      const rowHtml = `
        <div class="tmc-payment-row cheque-row" id="${rowId}" data-type="cheque" style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 8px; padding: 12px; position: relative; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: #3b82f6; text-transform: uppercase;">✍️ Cheque</span>
            <button class="tmc-remove-payment-btn" onclick="removePaymentRow('${rowId}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 15px; padding: 0;">🗑️</button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div class="tmc-form-group">
              <label style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">Nro Cheque *</label>
              <input type="text" class="tmc-payment-input tmc-cheque-numero" value="${numero}" placeholder="Número de cheque" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); color: white; padding: 6px; border-radius: 6px; font-size: 12px; outline: none; box-sizing: border-box; width: 100%;" />
            </div>
            <div class="tmc-form-group">
              <label style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">Banco *</label>
              <select class="tmc-payment-input tmc-cheque-banco" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); color: white; padding: 6px; border-radius: 6px; font-size: 12px; font-family: inherit; outline: none; box-sizing: border-box; width: 100%;">
                ${bancoOptions}
              </select>
            </div>
          </div>"""

cheque_row_replacement = """      const matchedB = bancosList.find(b => b.id == bancoId);
      const bancoName = matchedB ? matchedB.nombre : "";
      const cajaOptions = `<option value="">-- Seleccionar Caja --</option>` + cajasList.map(c => `<option value="${c.id}" ${c.id == cajaId ? 'selected' : ''}>${c.nombre}</option>`).join("");
      const todayStr = new Date().toISOString().split("T")[0];
      const rowId = "cheque-" + Date.now() + Math.random().toString(36).substr(2, 5);
      const rowHtml = `
        <div class="tmc-payment-row cheque-row" id="${rowId}" data-type="cheque" style="background: rgba(59, 130, 246, 0.05); border: 1px solid rgba(59, 130, 246, 0.15); border-radius: 8px; padding: 12px; position: relative; display: flex; flex-direction: column; gap: 8px; margin-bottom: 8px; box-sizing: border-box;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-size: 11px; font-weight: 700; color: #3b82f6; text-transform: uppercase;">✍️ Cheque</span>
            <button class="tmc-remove-payment-btn" onclick="removePaymentRow('${rowId}')" style="background: none; border: none; color: #ef4444; cursor: pointer; font-size: 15px; padding: 0;">🗑️</button>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <div class="tmc-form-group">
              <label style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">Nro Cheque *</label>
              <input type="text" class="tmc-payment-input tmc-cheque-numero" value="${numero}" placeholder="Número de cheque" style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); color: white; padding: 6px; border-radius: 6px; font-size: 12px; outline: none; box-sizing: border-box; width: 100%;" />
            </div>
            <div class="tmc-form-group">
              <label style="font-size: 10px; color: var(--text-muted); margin-bottom: 2px;">Banco *</label>
              <input type="text" list="bancos-datalist" class="tmc-payment-input tmc-cheque-banco-input" value="${escapeHTML(bancoName)}" placeholder="Buscar banco..." style="background: rgba(0,0,0,0.3); border: 1px solid var(--border); color: white; padding: 6px; border-radius: 6px; font-size: 12px; outline: none; box-sizing: border-box; width: 100%;" />
            </div>
          </div>"""

content = content.replace(cheque_row_target, cheque_row_replacement)

# 3. Validation in updateCobroTotals for bank
validation_target = """          } else if (type === "cheque") {
            const num = row.querySelector(".tmc-cheque-numero").value.trim();
            const bancoId = row.querySelector(".tmc-cheque-banco").value;
            const fecha = row.querySelector(".tmc-cheque-fecha").value;
            const amt = parseFloat(row.querySelector(".tmc-cheque-importe").value) || 0;
            const electronico = row.querySelector(".tmc-cheque-electronico").checked;
            const cajaId = row.querySelector(".tmc-cheque-caja").value;
            if (!num) errors.push(`${idxLabel} Debe ingresar el número de cheque.`);
            if (!bancoId) errors.push(`${idxLabel} Debe seleccionar el banco emisor.`);"""

validation_replacement = """          } else if (type === "cheque") {
            const num = row.querySelector(".tmc-cheque-numero").value.trim();
            const bancoInputVal = row.querySelector(".tmc-cheque-banco-input").value.trim();
            const matchedBanco = bancosList.find(b => b.nombre.toLowerCase() === bancoInputVal.toLowerCase());
            const fecha = row.querySelector(".tmc-cheque-fecha").value;
            const amt = parseFloat(row.querySelector(".tmc-cheque-importe").value) || 0;
            const electronico = row.querySelector(".tmc-cheque-electronico").checked;
            const cajaId = row.querySelector(".tmc-cheque-caja").value;
            if (!num) errors.push(`${idxLabel} Debe ingresar el número de cheque.`);
            if (!bancoInputVal) {
              errors.push(`${idxLabel} Debe escribir el banco emisor.`);
            } else if (!matchedBanco) {
              errors.push(`${idxLabel} El banco "${bancoInputVal}" no es válido. Seleccione uno de la lista.`);
            }"""

content = content.replace(validation_target, validation_replacement)

# 4. Cheque bancoId resolution in submitCobroManual
submit_cheque_target = """        } else if (type === "cheque") {
          const isElectronico = row.querySelector(".tmc-cheque-electronico").checked;
          const cajaIdVal = row.querySelector(".tmc-cheque-caja").value;
          cheques.push({
            bancoId: parseInt(row.querySelector(".tmc-cheque-banco").value, 10),
            numero: row.querySelector(".tmc-cheque-numero").value.trim(),"""

submit_cheque_replacement = """        } else if (type === "cheque") {
          const isElectronico = row.querySelector(".tmc-cheque-electronico").checked;
          const cajaIdVal = row.querySelector(".tmc-cheque-caja").value;
          const typedBanco = row.querySelector(".tmc-cheque-banco-input").value.trim();
          const matchedBanco = bancosList.find(b => b.nombre.toLowerCase() === typedBanco.toLowerCase());
          cheques.push({
            bancoId: matchedBanco ? matchedBanco.id : null,
            numero: row.querySelector(".tmc-cheque-numero").value.trim(),"""

content = content.replace(submit_cheque_target, submit_cheque_replacement)

# 5. Default observations inside submitCobroManual
content = content.replace('observaciones || "Recibo Manual (Aplicativo TMC)",', 'observaciones || "R.M.A",')

# 6. Replicate step dots active classes inside transitionToCobroStep
step_dots_target = """    function transitionToCobroStep(step) {
      currentCobroStep = step;
      const step1Cont = document.getElementById("tmc-cobro-step1-container");"""

step_dots_replacement = """    function transitionToCobroStep(step) {
      currentCobroStep = step;
      
      // Update modal wizard step indicators
      const stepDots = [document.getElementById("modal-step-dot-1"), document.getElementById("modal-step-dot-2")];
      stepDots.forEach((dot, idx) => {
        if (!dot) return;
        dot.className = "tmc-step-item";
        const currentIdx = idx + 1;
        if (currentIdx === step) {
          dot.classList.add("active");
        } else if (currentIdx < step) {
          dot.classList.add("completed");
        }
      });

      const step1Cont = document.getElementById("tmc-cobro-step1-container");"""

content = content.replace(step_dots_target, step_dots_replacement)

print("CC Step 1-6 Javascript modifications done.")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
