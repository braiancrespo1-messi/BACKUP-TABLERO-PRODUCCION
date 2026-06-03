import re

filepath = r"c:\Users\Usuario\.gemini\antigravity\scratch\Aplicativos TMC 2.0\TMC RECIBOS\index.html"

with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 1. Add CSS styles
css_replacement = """    @keyframes tmcFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* Custom Sorting and Drawer Styles */
    .sort-arrow {
      font-size: 10px;
      color: var(--primary);
      margin-left: 4px;
    }

    .tmc-drawer {
      position: fixed;
      top: 0;
      right: -400px;
      width: 380px;
      height: 100vh;
      background: rgba(15, 23, 42, 0.95);
      backdrop-filter: blur(16px);
      border-left: 1px solid var(--border);
      box-shadow: -10px 0 30px rgba(0, 0, 0, 0.5);
      z-index: 9999;
      transition: right 0.3s ease;
      display: flex;
      flex-direction: column;
    }

    .tmc-drawer.open {
      right: 0;
    }

    .tmc-drawer-header {
      padding: 16px 20px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      justify-content: space-between;
      align-items: center;
      background: rgba(15, 23, 42, 0.8);
    }

    .tmc-drawer-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 700;
      color: #ffffff;
    }

    .tmc-drawer-close-btn {
      background: none;
      border: none;
      font-size: 24px;
      cursor: pointer;
      color: #94a3b8;
      padding: 0;
      line-height: 1;
    }

    .tmc-drawer-close-btn:hover {
      color: #ffffff;
    }

    .tmc-drawer-body {
      padding: 16px;
      flex: 1;
      overflow-y: auto;
    }

    .tmc-floating-trigger {
      position: fixed;
      bottom: 24px;
      right: 24px;
      background: linear-gradient(135deg, var(--purple), var(--primary));
      color: #ffffff;
      border: none;
      border-radius: 50px;
      padding: 12px 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 10px 20px rgba(139, 92, 246, 0.3);
      z-index: 9998;
      display: none;
      align-items: center;
      gap: 8px;
      transition: all 0.2s ease;
    }

    .tmc-floating-trigger:hover {
      transform: translateY(-2px);
      box-shadow: 0 15px 25px rgba(139, 92, 246, 0.4);
    }

    .tmc-floating-badge {
      background: var(--danger);
      color: white;
      border-radius: 50%;
      min-width: 18px;
      height: 18px;
      font-size: 10px;
      font-weight: 700;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 0 4px;
      box-sizing: border-box;
    }
  </style>"""

content = content.replace("""    @keyframes tmcFadeIn {
      from { opacity: 0; transform: translateY(8px); }
      to { opacity: 1; transform: translateY(0); }
    }
  </style>""", css_replacement)

# 2. Remove session history card from main layout
history_card_target = """    <!-- SESSION HISTORY CARD -->
    <div id="tmc-session-history-card" class="tmc-card" style="display: none;">
      <h3 style="margin-top: 0; font-size: 16px; color: #ffffff; font-weight: 700; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: center;">
        <span>⏱️ Recibos Emitidos en la Sesión</span>
        <button id="tmc-btn-clear-history" class="tmc-btn tmc-btn-secondary" style="padding: 4px 8px; font-size: 11.5px; border-radius: 6px;">Borrar Historial</button>
      </h3>
      <div class="tmc-table-wrapper" style="max-height: 250px; margin-bottom: 0;">
        <table class="tmc-table">
          <thead>
            <tr>
              <th style="padding: 8px 10px;">Fecha Emisión</th>
              <th style="padding: 8px 10px;">Cliente</th>
              <th style="padding: 8px 10px;">Nro Recibo</th>
              <th style="padding: 8px 10px; text-align: right;">Total</th>
              <th style="padding: 8px 10px; text-align: center; width: 80px;">Acción</th>
            </tr>
          </thead>
          <tbody id="tmc-session-history-list">
            <!-- Emitted receipts listed here -->
          </tbody>
        </table>
      </div>
    </div>"""

content = content.replace(history_card_target, "<!-- History Drawer is placed at the end of the body -->")

# 3. Change observations default
obs_target = """          <div class="tmc-form-group">
            <label for="tmc-cobro-observaciones">Observaciones (Opcional)</label>
            <input type="text" id="tmc-cobro-observaciones" class="tmc-input-text" placeholder="Ej: Pago total recibo manual">
          </div>"""

obs_replacement = """          <div class="tmc-form-group">
            <label for="tmc-cobro-observaciones">Observaciones (Opcional)</label>
            <input type="text" id="tmc-cobro-observaciones" class="tmc-input-text" placeholder="Ej: R.M.A" value="R.M.A">
          </div>"""

content = content.replace(obs_target, obs_replacement)

# 4. Modify Step 2 header filter and sort block and table headers
step2_header_target = """          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; width: 100%;">
            <input type="text" id="tmc-invoice-filter" class="tmc-input-search" placeholder="🔍 Buscar por número o fecha..." style="padding: 6px 10px; font-size: 12px; flex: 1; min-width: 150px; background: rgba(0,0,0,0.4); margin: 0;" />
            <select id="tmc-invoice-sort" class="tmc-input-search" style="padding: 6px 10px; font-size: 12px; width: 200px; background: rgba(0,0,0,0.4); border-radius: 10px; cursor: pointer; color: white; margin: 0;">
              <option value="date-asc">Fecha (Más viejo primero) ★</option>
              <option value="date-desc">Fecha (Más nuevo primero)</option>
              <option value="num-asc">Nro Comprobante (A-Z)</option>
              <option value="amount-desc">Saldo Pendiente (Mayor primero)</option>
            </select>
          </div>
        </div>

        <div class="tmc-table-wrapper">
          <table class="tmc-table">
            <thead>
              <tr style="background-color: rgba(15, 23, 42, 0.6); border-bottom: 2px solid rgba(255, 255, 255, 0.1); color: var(--text-muted); font-weight: 600;">
                <th style="padding: 8px 10px; width: 40px; text-align: center;">Sel.</th>
                <th style="padding: 8px 10px;">Vence/Comp.</th>
                <th style="padding: 8px 10px; text-align: right;">Saldo Pend.</th>
                <th style="padding: 8px 10px; text-align: right; width: 110px;">Imputar</th>
              </tr>
            </thead>"""

step2_header_replacement = """          <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap; width: 100%;">
            <input type="text" id="tmc-invoice-filter" class="tmc-input-search" placeholder="🔍 Buscar por número o fecha..." style="padding: 6px 10px; font-size: 12px; flex: 1; min-width: 150px; background: rgba(0,0,0,0.4); margin: 0;" />
            <div style="display: flex; align-items: center; gap: 6px; user-select: none; cursor: pointer; background: rgba(0,0,0,0.3); border: 1px solid var(--border); padding: 6px 12px; border-radius: 10px; font-size: 12px; height: 34px; box-sizing: border-box;">
              <input type="checkbox" id="tmc-show-total-factura" style="cursor: pointer; width: 15px; height: 15px; accent-color: var(--primary);" />
              <label for="tmc-show-total-factura" style="cursor: pointer; font-weight: 500; color: #cbd5e1; margin: 0;">Mostrar total factura</label>
            </div>
          </div>
        </div>

        <div class="tmc-table-wrapper">
          <table class="tmc-table">
            <thead>
              <tr style="background-color: rgba(15, 23, 42, 0.6); border-bottom: 2px solid rgba(255, 255, 255, 0.1); color: var(--text-muted); font-weight: 600;">
                <th style="padding: 8px 10px; width: 40px; text-align: center;">Sel.</th>
                <th style="padding: 8px 10px; cursor: pointer; user-select: none;" onclick="toggleSort('fecha')" id="th-vence-comp">Vence/Comp. <span class="sort-arrow"></span></th>
                <th id="th-total-original" style="padding: 8px 10px; text-align: right; cursor: pointer; user-select: none; display: none;" onclick="toggleSort('debe')">Total Factura <span class="sort-arrow"></span></th>
                <th style="padding: 8px 10px; text-align: right; cursor: pointer; user-select: none;" onclick="toggleSort('pendientePago')" id="th-saldo-pend">Saldo Pend. <span class="sort-arrow"></span></th>
                <th style="padding: 8px 10px; text-align: right; width: 110px;">Imputar</th>
              </tr>
            </thead>"""

content = content.replace(step2_header_target, step2_header_replacement)

# 5. Insert new global variables
globals_target = """    // Global variables
    let cajasList = [];
    let bancosList = [];
    let cuentasList = [];
    let retencionesList = [];

    let currentClientCode = "";
    let currentClientName = "";
    let currentClientRazonSocial = "";
    let currentClientSaldoActual = 0;
    let currentClientSaldoNoImputadoYiqi = 0;
    let currentClientCuit = "";
    let lastCobroId = "";
    let currentImputations = {}; // Map of comprobante -> amount
    let cachedMovements = [];
    let currentStep = 0; // 0: Client, 1: Payments, 2: Imputations"""

globals_replacement = """    // Global variables
    let cajasList = [];
    let bancosList = [];
    let cuentasList = [];
    let retencionesList = [];

    let currentClientCode = "";
    let currentClientName = "";
    let currentClientRazonSocial = "";
    let currentClientSaldoActual = 0;
    let currentClientSaldoNoImputadoYiqi = 0;
    let currentClientCuit = "";
    let currentClientDomicilio = "";
    let currentClientLocalidad = "";
    let lastCobroId = "";
    let currentImputations = {}; // Map of comprobante -> amount
    let cachedMovements = [];
    let currentStep = 0; // 0: Client, 1: Payments, 2: Imputations

    // Sorting & breakdown state
    let invoiceSortField = "fecha";
    let invoiceSortAsc = true;
    let invoiceDetailsCache = {};
    let searchedClientsMap = {};"""

content = content.replace(globals_target, globals_replacement)

print("Programmatic replacements step 1-5 done.")

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
