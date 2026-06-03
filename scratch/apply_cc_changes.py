import re

filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\ADMINSITRATIVAS INTERNAS\cuentas_corrientes_clientes.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add CSS styles before first </style>
css_style = """    /* Add sorting arrow style */
    .sort-arrow {
      font-size: 10px;
      color: var(--primary);
      margin-left: 4px;
    }
    
    /* Steps indicator in accounts portal modal */
    .tmc-steps {
      display: flex;
      justify-content: space-between;
      background: rgba(15, 23, 42, 0.5);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      padding: 12px 24px;
      margin-bottom: 20px;
      backdrop-filter: blur(8px);
    }

    .tmc-step-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      font-weight: 500;
      color: #94a3b8;
      position: relative;
    }

    .tmc-step-item.active {
      color: #3b82f6;
      font-weight: 600;
    }

    .tmc-step-item.completed {
      color: #10b981;
    }

    .tmc-step-num {
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
    }

    .tmc-step-item.active .tmc-step-num {
      background: #3b82f6;
      color: #ffffff;
      border-color: #3b82f6;
    }

    .tmc-step-item.completed .tmc-step-num {
      background: #10b981;
      color: #ffffff;
      border-color: #10b981;
    }
  </style>"""

content = content.replace("  </style>", css_style, 1)

# 2. Add Wizard Steps Bar to Modal body
modal_body_target = """          <div class="tmc-modal-body" style="padding: 20px; max-height: 75vh; overflow-y: auto;">
            
            <!-- STEP 1: LOAD PAYMENTS -->"""

modal_body_replacement = """          <div class="tmc-modal-body" style="padding: 20px; max-height: 75vh; overflow-y: auto;">
            
            <!-- WIZARD STEPS BAR -->
            <div class="tmc-steps" id="tmc-modal-steps-bar" style="margin-bottom: 20px;">
              <div class="tmc-step-item completed">
                <span class="tmc-step-num">0</span>
                <span>Cliente</span>
              </div>
              <div class="tmc-step-item active" id="modal-step-dot-1">
                <span class="tmc-step-num">1</span>
                <span>Pagos Recibidos</span>
              </div>
              <div class="tmc-step-item" id="modal-step-dot-2">
                <span class="tmc-step-num">2</span>
                <span>Imputación FIFO</span>
              </div>
            </div>

            <!-- STEP 1: LOAD PAYMENTS -->"""

content = content.replace(modal_body_target, modal_body_replacement)

# 3. Observations Default value and placeholder
obs_target = """                <div class="tmc-form-group">
                  <label for="tmc-cobro-observaciones">Observaciones (Opcional)</label>
                  <input type="text" id="tmc-cobro-observaciones" class="tmc-search-input" placeholder="Ej: Pago en efectivo y cheque" style="padding: 6px 10px 6px 12px; font-size: 13px; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: white;">
                </div>"""

obs_replacement = """                <div class="tmc-form-group">
                  <label for="tmc-cobro-observaciones">Observaciones (Opcional)</label>
                  <input type="text" id="tmc-cobro-observaciones" class="tmc-search-input" placeholder="Ej: R.M.A" value="R.M.A" style="padding: 6px 10px 6px 12px; font-size: 13px; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; color: white;">
                </div>"""

content = content.replace(obs_target, obs_replacement)

# 4. Replicate headers and show total in Step 2 of Modal
step2_target = """                <!-- Invoices list container -->
                <div id="tmc-cobro-invoices-wrapper" style="border: 1px solid var(--border); border-radius: 8px; overflow-x: auto; background: rgba(0, 0, 0, 0.2); max-height: 280px; overflow-y: auto;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                    <thead>
                      <tr style="background-color: rgba(15, 23, 42, 0.6); border-bottom: 2px solid rgba(255, 255, 255, 0.1); color: var(--text-muted); font-weight: 600;">
                        <th style="padding: 8px 10px; width: 40px; text-align: center;">Sel.</th>
                        <th style="padding: 8px 10px;">Vence/Comp.</th>
                        <th style="padding: 8px 10px; text-align: right;">Saldo</th>
                        <th style="padding: 8px 10px; text-align: right; width: 110px;">Cancelar</th>
                      </tr>
                    </thead>
                    <tbody id="tmc-cobro-invoices-body">"""

step2_replacement = """                <!-- Invoices list filter and options -->
                <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; width: 100%; margin-bottom: 12px;">
                  <input type="text" id="tmc-cobro-invoice-filter" class="tmc-search-input" placeholder="🔍 Buscar por número o fecha..." style="padding: 6px 10px; font-size: 12px; flex: 1; min-width: 150px; background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.15); border-radius: 8px; color: white; margin: 0;" />
                  <div style="display: flex; align-items: center; gap: 6px; user-select: none; cursor: pointer; background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 6px 12px; border-radius: 10px; font-size: 12px; height: 34px; box-sizing: border-box;">
                    <input type="checkbox" id="tmc-cobro-show-total-factura" style="cursor: pointer; width: 15px; height: 15px; accent-color: var(--primary);" />
                    <label for="tmc-cobro-show-total-factura" style="cursor: pointer; font-weight: 500; color: #cbd5e1; margin: 0;">Mostrar total factura</label>
                  </div>
                </div>

                <!-- Invoices list container -->
                <div id="tmc-cobro-invoices-wrapper" style="border: 1px solid var(--border); border-radius: 8px; overflow-x: auto; background: rgba(0, 0, 0, 0.2); max-height: 280px; overflow-y: auto;">
                  <table style="width: 100%; border-collapse: collapse; font-size: 12px; text-align: left;">
                    <thead>
                      <tr style="background-color: rgba(15, 23, 42, 0.6); border-bottom: 2px solid rgba(255, 255, 255, 0.1); color: var(--text-muted); font-weight: 600;">
                        <th style="padding: 8px 10px; width: 40px; text-align: center;">Sel.</th>
                        <th style="padding: 8px 10px; cursor: pointer; user-select: none;" onclick="toggleCobroSort('fecha')" id="th-cobro-vence-comp">Vence/Comp. <span class="sort-arrow"></span></th>
                        <th id="th-cobro-total-original" style="padding: 8px 10px; text-align: right; cursor: pointer; user-select: none; display: none;" onclick="toggleCobroSort('debe')">Total Factura <span class="sort-arrow"></span></th>
                        <th style="padding: 8px 10px; text-align: right; cursor: pointer; user-select: none;" onclick="toggleCobroSort('pendientePago')" id="th-cobro-saldo-pend">Saldo <span class="sort-arrow"></span></th>
                        <th style="padding: 8px 10px; text-align: right; width: 110px;">Cancelar</th>
                      </tr>
                    </thead>
                    <tbody id="tmc-cobro-invoices-body">"""

content = content.replace(step2_target, step2_replacement)

# 5. Global variables at the beginning of script tag
vars_target = """    // URL de la Cloud Function
    const OBTENER_ESTADO_URL = "https://obtenerestadocuenta-vb5plcbgra-uc.a.run.app";"""

vars_replacement = """    // URL de la Cloud Function
    const OBTENER_ESTADO_URL = "https://obtenerestadocuenta-vb5plcbgra-uc.a.run.app";
    
    // Receipt Modal Sorting & breakdown state
    let cobroInvoiceSortField = "fecha";
    let cobroInvoiceSortAsc = true;
    let cobroInvoiceDetailsCache = {};"""

content = content.replace(vars_target, vars_replacement)

# 6. datalist at the bottom
content = content.replace("</body>", "  <datalist id=\"bancos-datalist\"></datalist>\n</body>")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("CC Step 1-6 replacements done.")
