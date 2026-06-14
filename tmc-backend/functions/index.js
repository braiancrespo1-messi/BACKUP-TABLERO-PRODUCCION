const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

admin.initializeApp();

let cachedToken = null;
let tokenExpiry = 0;

// Configuración de credenciales de YiQi
// Se leerán desde las variables de entorno configuradas en Firebase
const USERNAME = process.env.YIQI_USERNAME || "mercadolibre@tmcrespo.com.ar";
const PASSWORD = process.env.YIQI_PASSWORD || "AdministracionMessi";

/**
 * Obtiene y cachea el token Bearer para evitar solicitudes reiteradas en cada invocación.
 */
async function getYiQiToken() {
  if (cachedToken && Date.now() < tokenExpiry) {
    return cachedToken;
  }
  
  const tokenUrls = [
    "https://api.yiqi.com.ar/token",
    "https://api.yiqi.com.ar/connect/token",
    "https://me.yiqi.com.ar/connect/token"
  ];
  
  const body = new URLSearchParams({
    grant_type: "password",
    username: USERNAME,
    password: PASSWORD
  });
  
  console.log("Renovando token de YiQi...");
  console.log("Using YIQI_USERNAME:", USERNAME);
  for (const url of tokenUrls) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body
      });
      if (response.ok) {
        const data = await response.json();
        if (data.access_token) {
          cachedToken = data.access_token;
          const expires_in = data.expires_in || 3600;
          // Guardar expiración con un margen de 5 minutos
          tokenExpiry = Date.now() + (expires_in - 300) * 1000;
          console.log("Token obtenido correctamente.");
          return cachedToken;
        }
      }
    } catch (e) {
      console.error(`Error obteniendo token desde ${url}:`, e);
    }
  }
  throw new Error("No se pudo autenticar con YiQi ERP");
}

let cachedCookies = null;
let cookiesExpiry = 0;

/**
 * Obtiene y cachea las cookies de sesion de ASP.NET de YiQi realizando un login POST.
 */
async function getYiQiCookies() {
  if (cachedCookies && Date.now() < cookiesExpiry) {
    return cachedCookies;
  }

  const loginUrl = "https://me.yiqi.com.ar/Account/Login?ReturnUrl=%2F";
  const body = new URLSearchParams({
    UserName: USERNAME,
    Password: PASSWORD,
    RememberMe: "true",
    sid: ""
  });

  console.log("Iniciando sesion en me.yiqi.com.ar para obtener cookies...");
  const response = await fetch(loginUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body,
    redirect: "manual"
  });

  let cookies = [];
  if (typeof response.headers.getSetCookie === 'function') {
    cookies = response.headers.getSetCookie();
  } else {
    const rawCookies = response.headers.get('set-cookie');
    if (rawCookies) {
      cookies = rawCookies.split(',').map(c => c.trim());
    }
  }

  if (cookies.length === 0) {
    throw new Error("No se recibieron cookies del servidor de logueo. Verifique credenciales.");
  }

  cachedCookies = cookies.map(c => c.split(';')[0]).join('; ');
  // Guardamos cookies por 5 minutos para evitar expiracion de sesion
  cookiesExpiry = Date.now() + 5 * 60 * 1000;
  console.log("Cookies de sesion obtenidas correctamente.");
  return cachedCookies;
}

/**
 * Normaliza nombres de comprobante para comparaciones robustas.
 */
function cleanFXComprobante(comprobante) {
  if (!comprobante) return "";
  const regexFX = /^(?:factura\s+x|fac\.?\s+x|fx|rec\.?|recibo\s+x|recibo|nc|nota\s+cred\.?|nota\s+de\s+credito)\s*(?:n[°o]|nro\.?|#)?\s*/i;
  return comprobante.replace(regexFX, "").replace(/\s+/g, "").trim().toLowerCase();
}

/**
 * Cloud Function que consulta de forma segura los movimientos de la cuenta corriente de un cliente.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerEstadoCuenta?clientCode=7550
 */
exports.obtenerEstadoCuenta = onRequest({ cors: true }, async (req, res) => {
  const clientCode = req.query.clientCode;
  if (!clientCode) {
    return res.status(400).json({ error: "Falta el parametro clientCode" });
  }

  try {
    const cookies = await getYiQiCookies();
    const queryUrl = "https://me.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/query?schemaId=1491";
    
    // Consulta hasta 1000 movimientos en orden cronológico (más antiguo primero)
    // para poder calcular el saldo acumulado real de forma exacta.
    const queryBody = {
      page: 1,
      pageSize: 1000,
      columns: [
        { field: "FECHA", sortDirection: "ASC", sortOrder: 1 },
        { field: "COMPROBANTE" },
        { field: "DEBE" },
        { field: "HABER" },
        { field: "PENDIENTE_PAGO" }
      ],
      filters: [
        {
          columnName: "CLIE_ID_CLIE",
          operator: "=",
          value: String(clientCode)
        }
      ]
    };

    // Consultar movimientos, detalles del cliente e imputaciones locales en paralelo
    const clientQueryUrl = `https://me.yiqi.com.ar/api/public/CLIENTE/${clientCode}?schemaId=1491`;
    const db = admin.firestore();

    const [response, clientResponse, imputationsSnap] = await Promise.all([
      fetch(queryUrl, {
        method: "POST",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(queryBody)
      }),
      fetch(clientQueryUrl, {
        method: "GET",
        headers: {
          "Cookie": cookies
        }
      }).catch(err => {
        console.error("Error consultando cliente:", err);
        return null;
      }),
      db.collection("local_imputations")
        .where("clientCode", "==", String(clientCode))
        .get()
        .catch(err => {
          console.error("Error fetching local imputations from firestore:", err);
          return null;
        })
    ]);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Error en consulta YiQi via cookies:", errText);
      return res.status(response.status).json({ error: "Error al consultar el sistema", details: errText });
    }

    // Procesar detalles del cliente
    let razonSocial = null;
    let nombreCliente = null;
    let saldoNoImputadoYiqi = 0;
    if (clientResponse && clientResponse.ok) {
      try {
        const clientData = await clientResponse.json();
        const clientObj = clientData.data || clientData.rows || clientData;
        if (clientObj) {
          razonSocial = clientObj.CLIE_RAZON_SOCIAL || null;
          nombreCliente = clientObj.CLIE_NOMBRE || null;
          saldoNoImputadoYiqi = clientObj.CLIE_SALDO_CLIENTE ? parseFloat(clientObj.CLIE_SALDO_CLIENTE) : 0;
        }
      } catch (e) {
        console.error("Error parseando datos de cliente:", e);
      }
    }

    // Procesar imputaciones locales
    const localImputations = [];
    if (imputationsSnap) {
      imputationsSnap.forEach(doc => {
        localImputations.push(doc.data());
      });
    }

    const data = await response.json();
    let rows = data.data || data.rows || data;
    if (rows && rows.rows) {
      rows = rows.rows;
    }
    
    // Calcular el saldo acumulado cronológicamente desde el primer movimiento
    let runningBalance = 0;
    let totalDeudaPendiente = 0;
    const calculatedRows = Array.isArray(rows) ? rows.map(r => {
      const debe = r.DEBE ? parseFloat(r.DEBE) : 0;
      const haber = r.HABER ? parseFloat(r.HABER) : 0;
      runningBalance = runningBalance + debe - haber;
      
      let pendientePago = r.PENDIENTE_PAGO ? parseFloat(r.PENDIENTE_PAGO) : 0;
      
      // Aplicar política de TMC: Ocultar prefijo "Fac X" o "FX"
      let comprobante = r.COMPROBANTE || "";
      const regexFX = /^(?:factura\s+x|fac\.?\s+x|fx)\s*(?:n[°o]|nro\.?|#)?\s*/i;
      if (regexFX.test(comprobante)) {
        comprobante = comprobante.replace(regexFX, "").trim();
      }
      
      // Apply local imputations for this invoice
      localImputations.forEach(imp => {
        if (debe > 0 && imp.invoiceNumber && cleanFXComprobante(imp.invoiceNumber) === cleanFXComprobante(comprobante)) {
          pendientePago = Math.max(0, pendientePago - imp.amount);
        }
        
        // Apply local imputations for this receipt/credit (move pending closer to 0)
        if (haber > 0 && imp.receiptNumber && cleanFXComprobante(imp.receiptNumber) === cleanFXComprobante(comprobante)) {
          if (pendientePago < -0.01) {
            pendientePago = Math.min(0, pendientePago + imp.amount);
          } else if (pendientePago > 0.01) {
            pendientePago = Math.max(0, pendientePago - imp.amount);
          }
        }
      });

      if (debe > 0) {
        totalDeudaPendiente += pendientePago;
      }
      
      return {
        id: r.id,
        fecha: r.FECHA,
        comprobante: comprobante,
        debe: r.DEBE ? parseFloat(r.DEBE) : null,
        haber: r.HABER ? parseFloat(r.HABER) : null,
        pendientePago: pendientePago,
        estado: r.ESTADO || null,
        saldo: runningBalance
      };
    }) : [];

    // Reversar la lista para mostrar el más reciente arriba en la tabla de la web
    calculatedRows.reverse();

    // El saldo actual del cliente es el saldo final luego del último movimiento
    const saldoActual = calculatedRows.length > 0 ? calculatedRows[0].saldo : 0;
    const saldoNoImputado = Math.max(0, totalDeudaPendiente - saldoActual);

    return res.json({ 
      success: true, 
      clientCode, 
      clientName: nombreCliente,
      clientRazonSocial: razonSocial,
      saldoActual, 
      totalDeudaPendiente,
      saldoNoImputado,
      saldoNoImputadoYiqi,
      data: calculatedRows 
    });
  } catch (error) {
    console.error("Error en obtenerEstadoCuenta:", error);
    cachedCookies = null;
    cookiesExpiry = 0;
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que descarga de forma segura un reporte PDF y lo sirve directamente al navegador.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/descargarReportePDF?reportName=PEDIDO_v1.3&instanceId=27962&schemaId=1491
 */
exports.descargarReportePDF = onRequest({ cors: true }, async (req, res) => {
  const { reportId, reportName, instanceId, schemaId, entityName } = req.query;
  
  if (!instanceId || !schemaId) {
    return res.status(400).json({ error: "Faltan parametros requeridos (instanceId, schemaId)" });
  }

  try {
    if (reportId) {
      // Método Cookie: Descarga desde me.yiqi.com.ar/report/view
      const cookies = await getYiQiCookies();
      const reportUrl = `https://me.yiqi.com.ar/report/view?schemaId=${encodeURIComponent(schemaId)}&reportId=${encodeURIComponent(reportId)}&instanceId=${encodeURIComponent(instanceId)}`;
      
      console.log(`Descargando reporte PDF via cookie (reportId: ${reportId}) desde: ${reportUrl}...`);
      
      const response = await fetch(reportUrl, {
        method: "GET",
        headers: { "Cookie": cookies }
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Error en descarga de reporte PDF via cookie:", errText);
        return res.status(response.status).json({ error: "Error al descargar reporte de YiQi via cookie", details: errText });
      }

      const contentType = response.headers.get("content-type") || "application/pdf";
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Disposition", `inline; filename="report_${reportId}_${instanceId}.pdf"`);

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.send(buffer);
    } else if (reportName) {
      // Método Token: Descarga publica por reportName
      const entity = entityName || "PEDIDO";
      const token = await getYiQiToken();
      const reportUrl = `https://api.yiqi.com.ar/api/public/${entity}/report?reportName=${encodeURIComponent(reportName)}&instanceId=${encodeURIComponent(instanceId)}&schemaId=${encodeURIComponent(schemaId)}`;
      
      console.log(`Descargando reporte PDF via token (reportName: ${reportName}) desde: ${reportUrl}...`);
      
      const response = await fetch(reportUrl, {
        method: "GET",
        headers: { "Authorization": `Bearer ${token}` }
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Error en descarga de reporte PDF via token:", errText);
        return res.status(response.status).json({ error: "Error al descargar reporte de YiQi via token", details: errText });
      }

      const contentType = response.headers.get("content-type") || "application/pdf";
      res.setHeader("Content-Type", contentType);
      
      const contentDisp = response.headers.get("content-disposition");
      if (contentDisp) {
        res.setHeader("Content-Disposition", contentDisp);
      } else {
        res.setHeader("Content-Disposition", `inline; filename="${entity}_report_${instanceId}.pdf"`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      return res.send(buffer);
    } else {
      return res.status(400).json({ error: "Debe proveer reportId o reportName en los parametros" });
    }
  } catch (error) {
    console.error("Error en descargarReportePDF:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Parsea el nombre de comprobante y extrae el tipo y número entero para la consulta en YiQi.
 */
function parseComprobante(comprobanteRaw) {
  const text = comprobanteRaw.trim();
  
  if (/^(?:remito|rem\.?)\b/i.test(text)) {
    const match = text.match(/^(?:remito|rem\.?)\s*(?:[a-z]\s*)?(?:n[°o]|nro\.?|#)?\s*(.*)/i);
    const numPart = match ? match[1].trim() : text;
    const numMatch = numPart.match(/(\d+)$/);
    return {
      entity: 'REMITO_DE_VENTA',
      filterField: 'REDV_NRO',
      number: numMatch ? parseInt(numMatch[1], 10) : null,
      rawNumber: numPart
    };
  }
  
  if (/^rec\.?/i.test(text)) {
    const match = text.match(/^rec\.?\s*(?:n[°o]|nro\.?|#)?\s*(.*)/i);
    const numPart = match ? match[1].trim() : text;
    const numMatch = numPart.match(/(\d+)$/);
    return {
      entity: 'COBRO',
      filterField: 'COBR_NRODERECIBO',
      number: numMatch ? parseInt(numMatch[1], 10) : null,
      rawNumber: numPart
    };
  }
  
  if (/^(?:nota\s+cred\.?|nc)\b/i.test(text)) {
    const match = text.match(/^(?:nota\s+cred\.?|nc)\s*(?:[a-z]\s*)?(?:n[°o]|nro\.?|#)?\s*(.*)/i);
    const numPart = match ? match[1].trim() : text;
    const numMatch = numPart.match(/(\d+)$/);
    return {
      entity: 'NOTA_CREDITO',
      filterField: 'NOCR_NUMERO',
      number: numMatch ? parseInt(numMatch[1], 10) : null,
      rawNumber: numPart
    };
  }
  
  if (/^(?:nota\s+deb\.?|nd)\b/i.test(text)) {
    const match = text.match(/^(?:nota\s+deb\.?|nd)\s*(?:[a-z]\s*)?(?:n[°o]|nro\.?|#)?\s*(.*)/i);
    const numPart = match ? match[1].trim() : text;
    const numMatch = numPart.match(/(\d+)$/);
    return {
      entity: 'NOTA_DEBITO',
      filterField: 'NODE_NUMERO',
      number: numMatch ? parseInt(numMatch[1], 10) : null,
      rawNumber: numPart
    };
  }
  
  // Por defecto es FACTURA
  const numMatch = text.match(/(\d+)$/);
  return {
    entity: 'FACTURA',
    filterField: 'FACT_NUMERO',
    number: numMatch ? parseInt(numMatch[1], 10) : null,
    rawNumber: text
  };
}

/**
 * Cloud Function que consulta de forma segura el detalle de un comprobante.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerDetalleComprobante?comprobante=0001 - 00115501&clientCode=8123
 */
exports.obtenerDetalleComprobante = onRequest({ cors: true }, async (req, res) => {
  const { comprobante, clientCode } = req.query;
  
  if (!comprobante || !clientCode) {
    return res.status(400).json({ error: "Faltan los parametros obligatorios clientCode y comprobante" });
  }

  const parsed = parseComprobante(comprobante);
  if (parsed.number === null) {
    return res.status(400).json({ error: "No se pudo extraer el numero del comprobante" });
  }

  try {
    const cookies = await getYiQiCookies();
    
    // 1. Consultar candidatos de comprobante buscando por numero exacto
    let clientFilterCol = null;
    if (parsed.entity === 'FACTURA') {
      clientFilterCol = 'FACT_ID_CLIENTE';
    } else if (parsed.entity === 'NOTA_DEBITO') {
      clientFilterCol = 'CLIE_CODIGO';
    }

    const filters = [
      { columnName: parsed.filterField, operator: '=', value: parsed.number }
    ];
    if (clientFilterCol) {
      filters.push({ columnName: clientFilterCol, operator: '=', value: String(clientCode) });
    }

    const queryUrl = `https://me.yiqi.com.ar/api/public/${parsed.entity}/query?schemaId=1491`;
    const queryBody = {
      page: 1,
      pageSize: 10,
      columns: [{ field: 'id' }],
      filters: filters
    };
    if (parsed.entity === 'REMITO_DE_VENTA') {
      queryBody.columns.push(
        { field: 'TRLO_NOMBRE' },
        { field: 'REDV_BULTOS' },
        { field: 'REDV_VALOR_DE_LA_MERCADER' },
        { field: 'REDV_TRANS_LOCALI' }
      );
    }

    const queryResp = await fetch(queryUrl, {
      method: 'POST',
      headers: {
        'Cookie': cookies,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(queryBody)
    });

    if (!queryResp.ok) {
      const errText = await queryResp.text();
      console.error(`Error consultando comprobante: ${queryResp.status}`, errText);
      return res.status(queryResp.status).json({ error: "Error al buscar el comprobante", details: errText });
    }

    const qData = await queryResp.json();
    const rows = qData.rows || qData.data || qData;
    const items = rows.rows || rows;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(404).json({ error: "No se encontro el comprobante solicitado" });
    }

    let matchedDetail = null;
    let docId = null;

    // 2. Traer el detalle completo del comprobante candidato y comprobar que pertenece al cliente consultado
    for (const item of items) {
      const detailUrl = `https://me.yiqi.com.ar/api/public/${parsed.entity}/${item.id}?schemaId=1491`;
      const detailResp = await fetch(detailUrl, {
        method: 'GET',
        headers: { 'Cookie': cookies }
      });

      if (detailResp.ok) {
        const detailData = await detailResp.json();
        // Comprobar cliente en el documento (COBRO utiliza CLIE_ID_CLIE, FACTURA utiliza FACT_ID_CLIENTE o CLIE_ID_CLIE)
        const docClient = detailData.CLIE_ID_CLIE || detailData.FACT_ID_CLIENTE || null;
        if (docClient && String(docClient) === String(clientCode)) {
          matchedDetail = detailData;
          docId = item.id;
          if (parsed.entity === 'REMITO_DE_VENTA') {
            matchedDetail.TRLO_NOMBRE = item.TRLO_NOMBRE || null;
            matchedDetail.REDV_BULTOS = item.REDV_BULTOS !== undefined ? item.REDV_BULTOS : detailData.REDV_BULTOS;
            matchedDetail.REDV_VALOR_DE_LA_MERCADER = item.REDV_VALOR_DE_LA_MERCADER !== undefined ? item.REDV_VALOR_DE_LA_MERCADER : detailData.REDV_VALOR_DE_LA_MERCADER;
            matchedDetail.REDV_TRANS_LOCALI = item.REDV_TRANS_LOCALI || detailData.REDV_TRANS_LOCALI || null;
          }
          break;
        }
      }
    }

    if (!matchedDetail) {
      return res.status(403).json({ error: "El comprobante no pertenece a la cuenta de este cliente" });
    }

    // 3. Estructurar y formatear la salida segun el tipo de comprobante
    if (parsed.entity === 'REMITO_DE_VENTA') {
      const result = {
        success: true,
        tipo: 'REMITO',
        numero: matchedDetail.REDV_NRO,
        fecha: matchedDetail.REDV_FECHA_DE_DESPACHO || matchedDetail.REDV_FECHA,
        total: matchedDetail.REDV_VALOR_DE_LA_MERCADER || 0,
        bultos: matchedDetail.REDV_BULTOS || 0,
        transportista: matchedDetail.TRLO_NOMBRE || matchedDetail.REDV_TRANS_LOCALI || "",
        estadoEntrega: matchedDetail.ESTA_NOMBRE || "",
        observaciones: matchedDetail.REDV_OBSERVACIONES || "",
        cae: null,
        docId: docId,
        adjuntoId: matchedDetail.REDV_ADJUNTO || null,
        detalles: []
      };

      if (Array.isArray(matchedDetail.DETALLE)) {
        matchedDetail.DETALLE.forEach(d => {
          result.detalles.push({
            tipo: 'LINEA',
            codigo: d.DERV_LEYENDA || '-',
            concepto: d.DERV_NOMBRE_ARTICULO || '',
            cantidad: d.DERV_CANTIDAD || 1,
            precio: d.DERV_PRECIO_UNITARIO || 0,
            bonif: 0,
            subtotal: (d.DERV_PRECIO_UNITARIO || 0) * (d.DERV_CANTIDAD || 1)
          });
        });
      }
      return res.json(result);
    }

    if (parsed.entity === 'COBRO') {
      const cancelaciones = [];
      const rawCancelaciones = matchedDetail.FACTURASCANCELADAS || matchedDetail.FacturasCanceladas || [];
      if (Array.isArray(rawCancelaciones)) {
        rawCancelaciones.forEach(c => {
          cancelaciones.push({
            id: c.id,
            factura: c.CANC_FORMULA_FACTURA || null,
            notaDebito: c.CANC_FORMULA_NOTA || null,
            importe: c.CANC_IMPORTE_A_CANCELAR || c.CANC_IMPORTE_CANCELADO || 0
          });
        });
      }

      // Fetch local adjustments for this receipt to inject them virtually
      try {
        const db = admin.firestore();
        const localImpsSnap = await db.collection("local_imputations")
          .where("clientCode", "==", String(clientCode))
          .get();
          
        localImpsSnap.forEach(doc => {
          const imp = doc.data();
          if (imp.receiptNumber && cleanFXComprobante(imp.receiptNumber) === cleanFXComprobante(comprobante)) {
            cancelaciones.push({
              id: "local_" + doc.id,
              factura: imp.invoiceNumber,
              notaDebito: null,
              importe: imp.amount,
              isLocal: true
            });
          }
        });
      } catch (err) {
        console.error("Error loading local cancelations:", err);
      }

      const result = {
        success: true,
        tipo: 'COBRO',
        docId: docId,
        numero: matchedDetail.COBR_NRODERECIBO,
        fecha: matchedDetail.COBR_FECHA,
        total: matchedDetail.COBR_TOTAL_COBRADO,
        observaciones: matchedDetail.COBR_OBSERVACIONES,
        cancelaciones: cancelaciones,
        detalles: []
      };

      // Cobros en efectivo
      if (Array.isArray(matchedDetail.COBROSENEFECTIVO)) {
        matchedDetail.COBROSENEFECTIVO.forEach(c => {
          result.detalles.push({
            tipo: 'PAGO_EFECTIVO',
            concepto: `Efectivo: ${c.DECO_INFO_DESCRIPCION || 'Caja'}`,
            precio: c.DECO_IMPORTE,
            subtotal: c.DECO_IMPORTE
          });
        });
      }

      // Cobros con Cheques
      if (Array.isArray(matchedDetail.CHEQUES)) {
        matchedDetail.CHEQUES.forEach(c => {
          result.detalles.push({
            tipo: 'PAGO_CHEQUE',
            concepto: `Cheque N°${c.CHEQ_NUMERO || ''} (${c.CHEQ_BANCO_DESCRIPCION || 'Banco'}) - Vto: ${c.CHEQ_FECHA_PAGO ? c.CHEQ_FECHA_PAGO.substring(0, 10) : '-'}`,
            precio: c.CHEQ_IMPORTE,
            subtotal: c.CHEQ_IMPORTE
          });
        });
      }

      // Cobros por Transferencia
      if (Array.isArray(matchedDetail.TRANSFERENCIAS)) {
        matchedDetail.TRANSFERENCIAS.forEach(t => {
          result.detalles.push({
            tipo: 'PAGO_TRANSFERENCIA',
            concepto: `Transferencia Ref: ${t.TRRE_REFERENCIA || '-'}`,
            precio: t.TRRE_IMPORTE,
            subtotal: t.TRRE_IMPORTE
          });
        });
      }

      // Cobros Electronicos (MercadoPago, etc.)
      if (Array.isArray(matchedDetail.COBROSELECTRÓNICOS)) {
        matchedDetail.COBROSELECTRÓNICOS.forEach(e => {
          result.detalles.push({
            tipo: 'PAGO_ELECTRONICO',
            concepto: `Cobro Electronico Nro Op: ${e.COEL_NRO_DE_OPERACION || '-'}`,
            bold: true,
            precio: e.COEL_IMPORTE,
            subtotal: e.COEL_IMPORTE
          });
        });
      }

      return res.json(result);
    } else {
      // FACTURA, NOTA_CREDITO, NOTA_DEBITO
      const totalNetoSinDescuento = matchedDetail.FACT_NETO_SIN_DESCUENTO || matchedDetail.NOCR_NETO_SIN_DESCUENTO || matchedDetail.NODE_NETO_SIN_DESCUENTO || null;
      const descuento = matchedDetail.FACT_DESCUENTO || matchedDetail.NOCR_DESCUENTO || matchedDetail.NODE_DESCUENTO || 0;
      const porcDescuento = matchedDetail.FACT_PORCENTAJE_DESCUENTO || matchedDetail.NOCR_PORCENTAJE_DESCUENTO || matchedDetail.NODE_PORCENTAJE_DESCUENTO || 0;
      const neto = matchedDetail.FACT_NETO || matchedDetail.NOCR_NETO || matchedDetail.NODE_NETO || null;
      const iva = matchedDetail.FACT_IVA || matchedDetail.NOCR_IVA || matchedDetail.NODE_IVA || 0;
      const percepciones = matchedDetail.FACT_TOTAL_PERCEPCIONES || matchedDetail.NOCR_TOTAL_PERCEPCIONES || matchedDetail.NODE_TOTAL_PERCEPCIONES || 0;
      const impuestosInternos = matchedDetail.FACT_IMPUESTOS_INTERNO || matchedDetail.NOCR_IMPUESTOS_INTERNO || matchedDetail.NODE_IMPUESTOS_INTERNO || 0;

      let cuitReceptor = null;
      const jsonQrStr = matchedDetail.FACT_JSON_QR || matchedDetail.NOCR_JSON_QR || matchedDetail.NODE_JSON_QR || null;
      if (jsonQrStr) {
        try {
          const qrObj = JSON.parse(jsonQrStr);
          if (qrObj && qrObj.nroDocRec) {
            cuitReceptor = qrObj.nroDocRec;
          }
        } catch (e) {
          console.error("Error parsing JSON QR:", e);
        }
      }

      let pedidoNro = null;
      let pedidoEstado = matchedDetail.FACT_ESTADO_DEL_PEDIDO || null;
      const pedidoId = matchedDetail.PEDI_ID_PEDI || matchedDetail.FACT_PEDIDO_ID || null;

      if (pedidoId) {
        try {
          const pedUrl = `https://me.yiqi.com.ar/api/public/PEDIDO/${pedidoId}?schemaId=1491`;
          const pedResp = await fetch(pedUrl, {
            method: 'GET',
            headers: { 'Cookie': cookies }
          });
          if (pedResp.ok) {
            const pedData = await pedResp.json();
            const pedObj = pedData.data || pedData.rows || pedData;
            if (pedObj) {
              pedidoNro = pedObj.PEDI_NRO_PEDIDO || null;
              if (pedObj.ESTADO) {
                pedidoEstado = pedObj.ESTADO;
              }
            }
          }
        } catch (e) {
          console.error("Error fetching associated order:", e);
        }
      }

      const result = {
        success: true,
        tipo: parsed.entity,
        docId: docId,
        pedidoId: pedidoId,
        pedidoNro: pedidoNro,
        pedidoEstado: pedidoEstado,
        numero: matchedDetail.FACT_NUMERO || matchedDetail.NOCR_NUMERO || matchedDetail.NODE_NUMERO,
        fecha: matchedDetail.FACT_FECHA_EMISION || matchedDetail.NOCR_FECHA_EMISION || matchedDetail.NODE_FECHA_EMISION,
        total: matchedDetail.FACT_TOTAL || matchedDetail.NOCR_TOTAL || matchedDetail.NODE_TOTAL,
        observaciones: matchedDetail.FACT_OBSERVACION || matchedDetail.NOCR_OBSERVACIONES || matchedDetail.NODE_OBSERVACIONES,
        urlQr: matchedDetail.FACT_URL_QR || matchedDetail.NOCR_URL_QR || matchedDetail.NODE_URL_QR || null,
        cae: matchedDetail.FACT_CAE || matchedDetail.NOCR_CAE || matchedDetail.NODE_CAE || null,
        cuitReceptor: cuitReceptor,
        fechaUltimoCobro: matchedDetail.FACT_FECHA_DE_ULTIMO_COBR || matchedDetail.NOCR_FECHA_DE_ULTIMO_COBR || matchedDetail.NODE_FECHA_DE_ULTIMO_COBR || null,
        tiempoDeCobro: matchedDetail.FACT_TIEMPO_DE_COBRO !== undefined ? matchedDetail.FACT_TIEMPO_DE_COBRO : (matchedDetail.NOCR_TIEMPO_DE_COBRO !== undefined ? matchedDetail.NOCR_TIEMPO_DE_COBRO : matchedDetail.NODE_TIEMPO_DE_COBRO),
        pendientePago: matchedDetail.FACT_PENDIENTE_CANCELACIO !== undefined ? matchedDetail.FACT_PENDIENTE_CANCELACIO : (matchedDetail.NOCR_PENDIENTE_CANCELACIO !== undefined ? matchedDetail.NOCR_PENDIENTE_CANCELACIO : matchedDetail.NODE_PENDIENTE_CANCELACIO),
        detalles: [],
        totales: {
          subtotalNeto: totalNetoSinDescuento,
          descuento: descuento,
          porcDescuento: porcDescuento,
          neto: neto,
          iva: iva,
          percepciones: percepciones,
          impuestosInternos: impuestosInternos,
          total: matchedDetail.FACT_TOTAL || matchedDetail.NOCR_TOTAL || matchedDetail.NODE_TOTAL
        }
      };

      if (Array.isArray(matchedDetail.DETALLE)) {
        matchedDetail.DETALLE.forEach(d => {
          const cantidad = d.FADE_CANTIDAD || d.DENV_CANTIDAD || 1;
          const precio = d.FADE_PRECIO_UNITARIO || d.DENV_PRECIO_UNITARIO || 0;
          const bonif = (d.FADE_PORC_BONIFICACION !== undefined && d.FADE_PORC_BONIFICACION !== null) ? d.FADE_PORC_BONIFICACION : 
                        ((d.DENV_PORC_BONIFICACION !== undefined && d.DENV_PORC_BONIFICACION !== null) ? d.DENV_PORC_BONIFICACION : 0);
          // Use FADE_NETO as the net subtotal, fallback to precio * cantidad
          const netoSubtotal = (d.FADE_NETO !== undefined && d.FADE_NETO !== null) ? d.FADE_NETO : 
                               ((d.DENV_NETO !== undefined && d.DENV_NETO !== null) ? d.DENV_NETO : (precio * cantidad));

          result.detalles.push({
            tipo: 'LINEA',
            codigo: d.FADE_CODIGO || d.DENV_CODIGO || '-',
            concepto: d.FADE_CONCEPTO_COMPLETO || d.DENV_CONCEPTO_COMPLETO || '',
            cantidad: cantidad,
            precio: precio,
            bonif: parseFloat(bonif || 0),
            subtotal: netoSubtotal
          });
        });
      }
      return res.json(result);
    }
  } catch (error) {
    console.error("Error en obtenerDetalleComprobante:", error);
    cachedCookies = null;
    cookiesExpiry = 0;
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para consultar las tareas disponibles para choferes (Listo para Retirar)
 * o asignadas al chofer que esten En Reparto.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/tasksForCalle?choferId=carlos_calle
 */
exports.tasksForCalle = onRequest({ cors: true }, async (req, res) => {
  const choferId = req.query.choferId;
  
  try {
    const db = admin.firestore();
    const tasksSnapshot = await db.collection("tasks")
      .where("estado", "in", ["Listo para Retirar", "En Reparto"])
      .get();

    const tasks = [];
    tasksSnapshot.forEach(doc => {
      const data = doc.data();
      const taskItem = { id: doc.id, ...data };
      
      // Regla de Filtro:
      // - Si está 'Listo para Retirar', cualquiera lo puede ver.
      // - Si está 'En Reparto', solo el chofer asignado lo puede ver.
      if (data.estado === "Listo para Retirar" || (data.estado === "En Reparto" && data.chofer_id === choferId)) {
        tasks.push(taskItem);
      }
    });

    return res.json({ success: true, data: tasks });
  } catch (error) {
    console.error("Error en tasksForCalle:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para actualizar el estado de una tarea por el chofer en el reparto,
 * adjuntando comentarios, firma y foto.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/updateTaskStatus
 */
exports.updateTaskStatus = onRequest({ cors: true }, async (req, res) => {
  const { taskId, nuevoEstado, choferId, comentarios, firmaBase64, remitoFotoBase64 } = req.body;

  if (!taskId || !nuevoEstado) {
    return res.status(400).json({ error: "Faltan parametros obligatorios (taskId, nuevoEstado)" });
  }

  try {
    const db = admin.firestore();
    const taskRef = db.collection("tasks").doc(taskId);
    const taskDoc = await taskRef.get();

    if (!taskDoc.exists) {
      return res.status(404).json({ error: "No se encontro la tarea especificada" });
    }

    const taskData = taskDoc.data();
    const updateData = {
      estado: nuevoEstado,
      actualizado_en: new Date().toISOString()
    };

    if (choferId) {
      updateData.chofer_id = choferId;
    }

    if (comentarios !== undefined) {
      updateData.comentarios_chofer = comentarios;
    }

    // Subida de Firma / Foto a Firebase Storage en caso de proveerse
    if (nuevoEstado === "Completado") {
      let firmaUrl = null;
      let remitoFotoUrl = null;

      // 1. Procesar Firma
      if (firmaBase64) {
        try {
          const bucket = admin.storage().bucket();
          const file = bucket.file(`tasks/${taskId}_signature.png`);
          const buffer = Buffer.from(firmaBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
          
          await file.save(buffer, {
            contentType: 'image/png',
            metadata: { cacheControl: 'public, max-age=31536000' }
          });
          
          // Obtener URL de descarga publica
          firmaUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`;
          updateData.firma_url = firmaUrl;
          console.log("Firma subida exitosamente:", firmaUrl);
        } catch (e) {
          console.error("Error al subir firma a storage (usando fallback mock):", e);
          updateData.firma_url = `https://firebasestorage.googleapis.com/v0/b/mock/o/tasks%2F${taskId}_signature.png?alt=media`;
        }
      }

      // 2. Procesar Foto del Remito
      if (remitoFotoBase64) {
        try {
          const bucket = admin.storage().bucket();
          const file = bucket.file(`tasks/${taskId}_remito.jpg`);
          const buffer = Buffer.from(remitoFotoBase64.replace(/^data:image\/\w+;base64,/, ""), 'base64');
          
          await file.save(buffer, {
            contentType: 'image/jpeg',
            metadata: { cacheControl: 'public, max-age=31536000' }
          });
          
          remitoFotoUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(file.name)}?alt=media`;
          updateData.remito_foto_url = remitoFotoUrl;
          console.log("Foto remito subida exitosamente:", remitoFotoUrl);
        } catch (e) {
          console.error("Error al subir foto remito a storage (usando fallback mock):", e);
          updateData.remito_foto_url = `https://firebasestorage.googleapis.com/v0/b/mock/o/tasks%2F${taskId}_remito.jpg?alt=media`;
        }
      }

      // 3. Disparar transición de stock en YiQi ERP para tareas de Insumo / Compras
      if (taskData.yiqi_instance_id && (taskData.tipo === "Insumo" || taskData.tipo === "Cobranza")) {
        console.log(`Iniciando integracion YiQi para instancia ERP: #${taskData.yiqi_instance_id}`);
        try {
          const token = await getYiQiToken();
          const transitionUrl = "https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition";
          
          // ID de transicion predeterminado para confirmar recepcion/cobro en YiQi
          const yiqiBody = {
            schemaId: 1491,
            ids: [String(taskData.yiqi_instance_id)],
            transitionId: 119679, // ID de transición de stock / recepción
            form: ""
          };

          const yiqiResp = await fetch(transitionUrl, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(yiqiBody)
          });

          if (yiqiResp.ok) {
            console.log(`Transición en YiQi ERP exitosa para la instancia ${taskData.yiqi_instance_id}`);
            updateData.yiqi_stock_entry_status = "Exitoso";
          } else {
            const errText = await yiqiResp.text();
            console.error(`Error en transición de YiQi: ${yiqiResp.status}`, errText);
            updateData.yiqi_stock_entry_status = "Fallido";
            updateData.yiqi_stock_entry_error = errText;
          }
        } catch (yiqiErr) {
          console.error("Error contactando a la API de YiQi:", yiqiErr);
          updateData.yiqi_stock_entry_status = "Error de Conexión";
          updateData.yiqi_stock_entry_error = yiqiErr.message;
        }
      }
    }

    // Guardar cambios finales en Firestore
    await taskRef.update(updateData);

    return res.json({ success: true, message: `Tarea #${taskId} actualizada correctamente`, updatedData: updateData });
  } catch (error) {
    console.error("Error en updateTaskStatus:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que obtiene el listado consolidado de saldos de clientes.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerConsolidadoSaldos
 */
exports.obtenerConsolidadoSaldos = onRequest({ cors: true }, async (req, res) => {
  const searchVal = req.query.search || null;
  const page = req.query.page ? parseInt(req.query.page, 10) : 1;
  const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : 15000;

  try {
    const cookies = await getYiQiCookies();
    const queryUrl = "https://me.yiqi.com.ar/api/public/REPORTE_DE_CLIENTES/query?schemaId=1491";

    const queryBody = {
      page: page,
      pageSize: pageSize,
      columns: [
        { field: "id" },
        { field: "CLIE_CODIGO" },
        { field: "CLIE_NOMBRE" },
        { field: "CLIE_RAZON_SOCIAL" },
        { field: "CLIENTE_IMPORTE" },
        { field: "CUIT" },
        { field: "TEL" },
        { field: "DOMICILIO" }
      ]
    };

    if (searchVal) {
      queryBody.search = String(searchVal);
    }

    // Query pending movements to calculate unapplied balances in bulk
    const pendingUrl = "https://me.yiqi.com.ar/api/public/MOVIMIENTOS_CLIENTES/query?schemaId=1491";
    const pendingMovsQueryBody = {
      page: 1,
      pageSize: 5000,
      columns: [
        { field: "CLIE_ID_CLIE" },
        { field: "COMPROBANTE" },
        { field: "DEBE" },
        { field: "PENDIENTE_PAGO" }
      ],
      filters: [
        {
          columnName: "PENDIENTE_PAGO",
          operator: ">",
          value: "1.0"
        }
      ]
    };

    const pendingCreditsQueryBody = {
      page: 1,
      pageSize: 5000,
      columns: [
        { field: "CLIE_ID_CLIE" },
        { field: "COMPROBANTE" },
        { field: "HABER" },
        { field: "PENDIENTE_PAGO" }
      ],
      filters: [
        {
          columnName: "PENDIENTE_PAGO",
          operator: "<",
          value: "-1.0"
        }
      ]
    };

    const db = admin.firestore();

    const [response, pendingResponse, pendingCreditsResponse, localImpsSnapshot] = await Promise.all([
      fetch(queryUrl, {
        method: "POST",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(queryBody)
      }),
      fetch(pendingUrl, {
        method: "POST",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(pendingMovsQueryBody)
      }).catch(err => {
        console.error("Error fetching pending movements in consolidado:", err);
        return null;
      }),
      fetch(pendingUrl, {
        method: "POST",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(pendingCreditsQueryBody)
      }).catch(err => {
        console.error("Error fetching pending credits in consolidado:", err);
        return null;
      }),
      db.collection("local_imputations")
        .get()
        .catch(err => {
          console.error("Error fetching local imputations in consolidado:", err);
          return null;
        })
    ]);

    if (!response.ok) {
      const errText = await response.text();
      console.error("Error consultando reporte de saldos en YiQi:", errText);
      return res.status(response.status).json({ error: "Error al consultar reporte de saldos", details: errText });
    }

    const allLocalImputations = [];
    if (localImpsSnapshot) {
      localImpsSnapshot.forEach(doc => {
        allLocalImputations.push(doc.data());
      });
    }

    // Parse pending movements and sum them by client ID (debit movements only)
    const pendingDebits = {};
    if (pendingResponse && pendingResponse.ok) {
      try {
        const pendingData = await pendingResponse.json();
        const pendingRows = pendingData.data || pendingData.rows || [];
        const rowsList = Array.isArray(pendingRows) ? pendingRows : (pendingRows.rows || []);
        if (Array.isArray(rowsList)) {
          rowsList.forEach(m => {
            const cid = m.CLIE_ID_CLIE;
            const debe = m.DEBE ? parseFloat(m.DEBE) : 0;
            let pp = m.PENDIENTE_PAGO ? parseFloat(m.PENDIENTE_PAGO) : 0;
            if (cid && debe > 0) {
              const comp = m.COMPROBANTE || "";
              allLocalImputations.forEach(imp => {
                if (String(imp.clientCode) === String(cid) && imp.invoiceNumber && cleanFXComprobante(imp.invoiceNumber) === cleanFXComprobante(comp)) {
                  pp = Math.max(0, pp - imp.amount);
                }
              });
              pendingDebits[cid] = (pendingDebits[cid] || 0) + pp;
            }
          });
        }
      } catch (e) {
        console.error("Error parsing pending movements in consolidado:", e);
      }
    }

    // Parse pending credits and sum them by client ID (credit movements only)
    const pendingCredits = {};
    if (pendingCreditsResponse && pendingCreditsResponse.ok) {
      try {
        const pendingData = await pendingCreditsResponse.json();
        const pendingRows = pendingData.data || pendingData.rows || [];
        const rowsList = Array.isArray(pendingRows) ? pendingRows : (pendingRows.rows || []);
        if (Array.isArray(rowsList)) {
          rowsList.forEach(m => {
            const cid = m.CLIE_ID_CLIE;
            const haber = m.HABER ? parseFloat(m.HABER) : 0;
            let pp = m.PENDIENTE_PAGO ? parseFloat(m.PENDIENTE_PAGO) : 0;
            if (cid && haber > 0) {
              const comp = m.COMPROBANTE || "";
              allLocalImputations.forEach(imp => {
                if (String(imp.clientCode) === String(cid) && imp.receiptNumber && cleanFXComprobante(imp.receiptNumber) === cleanFXComprobante(comp)) {
                  pp = Math.min(0, pp + imp.amount);
                }
              });
              pendingCredits[cid] = (pendingCredits[cid] || 0) + Math.abs(pp);
            }
          });
        }
      } catch (e) {
        console.error("Error parsing pending credits in consolidado:", e);
      }
    }

    const data = await response.json();
    let rows = data.data || data.rows || data;
    if (rows && rows.rows) {
      rows = rows.rows;
    }

    let totalDeudores = 0;
    let totalAcreedores = 0;

    const formattedRows = Array.isArray(rows) ? rows.map(r => {
      const saldo = r.CLIENTE_IMPORTE !== undefined && r.CLIENTE_IMPORTE !== null ? parseFloat(r.CLIENTE_IMPORTE) : 0;
      if (saldo > 0.01) {
        totalDeudores += saldo;
      } else if (saldo < -0.01) {
        totalAcreedores += saldo;
      }

      const totalPendingDebit = pendingDebits[r.id] || 0;
      const totalPendingCredit = pendingCredits[r.id] || 0;
      const saldoNoImputado = Math.max(0, totalPendingDebit - saldo);

      return {
        id: r.id,
        codigo: r.CLIE_CODIGO || String(r.id),
        nombre: r.CLIE_NOMBRE || r.CLIE_RAZON_SOCIAL || "Cliente Sin Nombre",
        razonSocial: r.CLIE_RAZON_SOCIAL || null,
        saldo: saldo,
        saldoNoImputado: saldoNoImputado,
        saldoNoImputadoYiqi: totalPendingCredit,
        cuit: r.CUIT || null,
        tel: r.TEL || null,
        domicilio: r.DOMICILIO || null
      };
    }) : [];

    // Si no hay búsqueda, filtramos para retornar solo aquellos con saldo activo (deudor o acreedor != 0)
    let resultRows = formattedRows;
    if (!searchVal) {
      resultRows = formattedRows.filter(r => Math.abs(r.saldo) > 0.01);
    }

    // Ordenar por saldo deudor descendente (los que más deben arriba)
    resultRows.sort((a, b) => b.saldo - a.saldo);

    return res.json({
      success: true,
      total: resultRows.length,
      stats: {
        totalDeudores,
        totalAcreedores,
        saldoNeto: totalDeudores + totalAcreedores
      },
      data: resultRows
    });
  } catch (error) {
    console.error("Error en obtenerConsolidadoSaldos:", error);
    cachedCookies = null;
    cookiesExpiry = 0;
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para obtener todos los eventos de calendario, notas y novedades (logs).
 */
exports.getCalendarData = onRequest({ cors: true }, async (req, res) => {
  try {
    const db = admin.firestore();
    
    // 1. Obtener eventos de calendario
    const eventsSnap = await db.collection("calendar_events").get();
    const events = [];
    eventsSnap.forEach(doc => {
      const data = doc.data();
      events.push({
        id: isNaN(doc.id) ? doc.id : Number(doc.id),
        ...data
      });
    });
    
    // 2. Obtener notas de calendario
    const notesSnap = await db.collection("calendar_notes").get();
    const notes = {};
    notesSnap.forEach(doc => {
      const data = doc.data();
      const date = data.date;
      if (date) {
        if (!notes[date]) notes[date] = [];
        notes[date].push({
          id: isNaN(doc.id) ? doc.id : Number(doc.id),
          text: data.text || ""
        });
      }
    });
    
    // 3. Obtener novedades (últimas 100 ordenadas por timestamp desc)
    const logsSnap = await db.collection("tablero_activity_logs")
      .orderBy("timestamp", "desc")
      .limit(100)
      .get();
    const logs = [];
    logsSnap.forEach(doc => {
      logs.push(doc.data());
    });
    
    return res.json({ success: true, data: { events, notes, logs } });
  } catch (error) {
    console.error("Error en getCalendarData:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para guardar (crear o actualizar) un evento en el calendario.
 */
exports.saveCalendarEvent = onRequest({ cors: true }, async (req, res) => {
  const event = req.body;
  if (!event || !event.id) {
    return res.status(400).json({ error: "Faltan datos del evento o ID" });
  }
  try {
    const db = admin.firestore();
    const eventId = String(event.id);
    
    const docData = {
      sku: event.sku || "",
      name: event.name || "",
      qty: event.qty !== undefined ? Number(event.qty) : 1,
      date: event.date || "",
      pedidoId: event.pedidoId !== undefined ? String(event.pedidoId) : "STOCK",
      grupo: event.grupo || "",
      text: event.text || "",
      status: event.status || "",
      time: event.time || ""
    };
    
    await db.collection("calendar_events").doc(eventId).set(docData, { merge: true });
    return res.json({ success: true, message: `Evento #${eventId} guardado correctamente` });
  } catch (error) {
    console.error("Error en saveCalendarEvent:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para eliminar un evento del calendario.
 */
exports.deleteCalendarEvent = onRequest({ cors: true }, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Falta el ID del evento" });
  }
  try {
    const db = admin.firestore();
    await db.collection("calendar_events").doc(String(id)).delete();
    return res.json({ success: true, message: `Evento #${id} eliminado correctamente` });
  } catch (error) {
    console.error("Error en deleteCalendarEvent:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para guardar (crear o actualizar) una nota.
 */
exports.saveCalendarNote = onRequest({ cors: true }, async (req, res) => {
  const note = req.body;
  if (!note || !note.id || !note.date) {
    return res.status(400).json({ error: "Faltan datos de la nota (id, date)" });
  }
  try {
    const db = admin.firestore();
    const noteId = String(note.id);
    const docData = {
      date: note.date,
      text: note.text || ""
    };
    await db.collection("calendar_notes").doc(noteId).set(docData, { merge: true });
    return res.json({ success: true, message: `Nota #${noteId} guardada correctamente` });
  } catch (error) {
    console.error("Error en saveCalendarNote:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para eliminar una nota.
 */
exports.deleteCalendarNote = onRequest({ cors: true }, async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "Falta el ID de la nota" });
  }
  try {
    const db = admin.firestore();
    await db.collection("calendar_notes").doc(String(id)).delete();
    return res.json({ success: true, message: `Nota #${id} eliminada correctamente` });
  } catch (error) {
    console.error("Error en deleteCalendarNote:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para registrar un log de actividad / novedades.
 */
exports.saveActivityLog = onRequest({ cors: true }, async (req, res) => {
  const log = req.body;
  if (!log || !log.timestamp) {
    return res.status(400).json({ error: "Faltan datos del log o timestamp" });
  }
  try {
    const db = admin.firestore();
    const logId = String(log.timestamp);
    const docData = {
      time: log.time || "",
      date: log.date || "",
      action: log.action || "",
      details: log.details || "",
      type: log.type || "info",
      timestamp: Number(log.timestamp),
      pedidoId: log.pedidoId !== undefined ? log.pedidoId : null,
      eventId: log.eventId !== undefined ? log.eventId : null,
      app: log.app || "tablero",
      cliente: log.cliente !== undefined ? log.cliente : null
    };
    await db.collection("tablero_activity_logs").doc(logId).set(docData);
    return res.json({ success: true, message: `Log #${logId} guardado correctamente` });
  } catch (error) {
    console.error("Error en saveActivityLog:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que procesa la imputación inteligente FIFO de saldos para un cliente.
 */
exports.imputarSaldoCliente = onRequest({ cors: true }, async (req, res) => {
  const { clientCode, imputations } = req.body;
  if (!clientCode || !Array.isArray(imputations)) {
    return res.status(400).json({ error: "Faltan parametros obligatorios (clientCode, imputations)" });
  }

  const db = admin.firestore();

  try {
    const cookies = await getYiQiCookies();
    const resolvedMap = {};
    const failedResolutions = [];

    // 1. Resolver todas las facturas y notas de débito a sus IDs internos en YiQi
    for (const imp of imputations) {
      let { invoiceNumber, invoiceId, amount } = imp;

      if (!invoiceId && invoiceNumber) {
        try {
          const parsedInv = parseComprobante(invoiceNumber);
          if (parsedInv.number !== null) {
            let clientFilterCol = null;
            if (parsedInv.entity === 'FACTURA') {
              clientFilterCol = 'FACT_ID_CLIENTE';
            } else if (parsedInv.entity === 'NOTA_DEBITO') {
              clientFilterCol = 'CLIE_CODIGO';
            }

            const filters = [
              { columnName: parsedInv.filterField, operator: '=', value: parsedInv.number }
            ];
            if (clientFilterCol) {
              filters.push({ columnName: clientFilterCol, operator: '=', value: String(clientCode) });
            }

            const queryUrl = `https://me.yiqi.com.ar/api/public/${parsedInv.entity}/query?schemaId=1491`;
            const queryBody = {
              page: 1,
              pageSize: 5,
              columns: [{ field: 'id' }],
              filters: filters
            };
            const resp = await fetch(queryUrl, {
              method: 'POST',
              headers: { 'Cookie': cookies, 'Content-Type': 'application/json' },
              body: JSON.stringify(queryBody)
            });
            if (resp.ok) {
              const qData = await resp.json();
              const rows = qData.rows || qData.data || [];
              const list = rows.rows || rows;
              if (list && list.length > 0) {
                invoiceId = list[0].id;
                imp.invoiceId = invoiceId;
                imp.entityType = parsedInv.entity;
              } else {
                failedResolutions.push(`No se encontró el comprobante ${invoiceNumber} en YiQi`);
              }
            } else {
              const text = await resp.text();
              failedResolutions.push(`Error al buscar comprobante ${invoiceNumber}: ${text}`);
            }
          } else {
            failedResolutions.push(`Formato inválido de comprobante: ${invoiceNumber}`);
          }
        } catch (resolveErr) {
          console.error(`Error resolviendo ${invoiceNumber}:`, resolveErr);
          failedResolutions.push(`Error al resolver ${invoiceNumber}: ${resolveErr.message}`);
        }
      } else if (invoiceId) {
        const parsedInv = parseComprobante(invoiceNumber || "");
        imp.entityType = parsedInv.entity;
      }

      if (invoiceId && imp.entityType) {
        const key = `${imp.entityType}_${invoiceId}`;
        if (!resolvedMap[key]) {
          resolvedMap[key] = {
            CLIE_ID_CLIE: parseInt(clientCode, 10),
            FACT_ID_FACT: imp.entityType === 'FACTURA' ? parseInt(invoiceId, 10) : null,
            NODE_ID_NODE: imp.entityType === 'NOTA_DEBITO' ? parseInt(invoiceId, 10) : null,
            CANC_IMPORTE_A_CANCELAR: 0
          };
        }
        resolvedMap[key].CANC_IMPORTE_A_CANCELAR += parseFloat(amount);
      }
    }

    if (failedResolutions.length > 0) {
      throw new Error(`Fallo al resolver comprobantes: ${failedResolutions.join(", ")}`);
    }

    const cancelations = Object.values(resolvedMap);

    if (cancelations.length === 0) {
      throw new Error("No hay cancelaciones válidas para procesar.");
    }

    // 2. Crear el recibo COBRO
    const cobroUrl = "https://me.yiqi.com.ar/api/public/COBRO?schemaId=1491";
    const cobroBody = {
      schemaId: 1491,
      data: {
        CLIE_ID_CLIE: parseInt(clientCode, 10),
        COBR_FECHA: new Date().toISOString().substring(0, 10),
        COBR_OBSERVACIONES: "Imputación Automática FIFO (Saldos sin imputar)",
        FacturasCanceladas: cancelations
      }
    };

    const cobroResp = await fetch(cobroUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cobroBody)
    });

    if (!cobroResp.ok) {
      const errText = await cobroResp.text();
      throw new Error(`Error al crear el recibo COBRO: ${errText}`);
    }

    const cobroRes = await cobroResp.json();
    const cobroId = cobroRes.newId || cobroRes.id || (cobroRes.data && (cobroRes.data.id || (Array.isArray(cobroRes.data) && cobroRes.data[0] && cobroRes.data[0].id)));

    if (!cobroId) {
      throw new Error(`No se pudo obtener el ID del recibo creado: ${JSON.stringify(cobroRes)}`);
    }

    console.log(`Recibo COBRO creado con ID: ${cobroId}`);

    // 3. Transicionar recibo a 'Procesando ajustes'
    const stateUrl1 = `https://me.yiqi.com.ar/api/public/COBRO/changestate?id=${cobroId}&schemaId=1491&state=${encodeURIComponent("Procesando ajustes")}`;
    const stateResp1 = await fetch(stateUrl1, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!stateResp1.ok) {
      const errText = await stateResp1.text();
      throw new Error(`Error al cambiar estado a Procesando ajustes: ${errText}`);
    }

    console.log(`Recibo ${cobroId} cambiado a Procesando ajustes.`);

    // 4. Ejecutar la transición de workflow 118657 para procesar los ajustes
    const workflowUrl = "https://me.yiqi.com.ar/api/workflowApi/ExecuteTransition";
    const workflowBody = {
      schemaId: 1491,
      ids: [String(cobroId)],
      transitionId: 118657,
      form: ""
    };

    const workflowResp = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(workflowBody)
    });

    if (!workflowResp.ok) {
      const errText = await workflowResp.text();
      throw new Error(`Error al ejecutar transición de ajustes (118657): ${errText}`);
    }

    const workflowRes = await workflowResp.json();
    if (workflowRes.ok === false || workflowRes.error) {
      throw new Error(`Fallo la transición de workflow de ajustes: ${workflowRes.error || JSON.stringify(workflowRes)}`);
    }

    console.log(`Transición de ajustes de recibo ${cobroId} completada exitosamente.`);

    // Esperar 2.5 segundos para evitar race condition en la base de datos de YiQi
    console.log("Esperando 2500ms para asegurar que YiQi registre la asignación de ajustes...");
    await new Promise(resolve => setTimeout(resolve, 2500));

    // 5. Transicionar el recibo a 'Emitido'
    const stateUrl2 = `https://me.yiqi.com.ar/api/public/COBRO/changestate?id=${cobroId}&schemaId=1491&state=Emitido`;
    const stateResp2 = await fetch(stateUrl2, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!stateResp2.ok) {
      const errText = await stateResp2.text();
      throw new Error(`Error al emitir el recibo: ${errText}`);
    }

    console.log(`Recibo ${cobroId} emitido exitosamente.`);

    const results = imputations.map(imp => ({
      receiptNumber: imp.receiptNumber,
      invoiceNumber: imp.invoiceNumber,
      amount: imp.amount,
      yiqiSuccess: true,
      yiqiError: null,
      savedLocal: false
    }));

    // Registrar log de actividad en Firestore
    try {
      await db.collection("cc_activity_logs").add({
        timestamp: Date.now(),
        date: new Date().toISOString().substring(0, 10),
        time: new Date().toTimeString().substring(0, 8),
        action: "Imputación de Saldos",
        details: `Imputación exitosa ejecutada para cliente ${clientCode} creando el recibo COBRO #${cobroId}. cancelaciones: ${JSON.stringify(results)}`,
        type: "success"
      });
    } catch (logErr) {
      console.error("Error registrando log de actividad:", logErr);
    }

    return res.json({ success: true, results });

  } catch (error) {
    console.error("Error en imputarSaldoCliente:", error);
    const results = imputations.map(imp => ({
      receiptNumber: imp.receiptNumber,
      invoiceNumber: imp.invoiceNumber,
      amount: imp.amount,
      yiqiSuccess: false,
      yiqiError: error.message,
      savedLocal: false
    }));

    // Registrar log de error en Firestore
    try {
      await db.collection("cc_activity_logs").add({
        timestamp: Date.now(),
        date: new Date().toISOString().substring(0, 10),
        time: new Date().toTimeString().substring(0, 8),
        action: "Imputación de Saldos (Error)",
        details: `Error al imputar saldo para el cliente ${clientCode}: ${error.message}`,
        type: "error"
      });
    } catch (logErr) {
      console.error("Error registrando log de error:", logErr);
    }

    return res.json({ success: true, results });
  }
});

/**
 * Cloud Function que obtiene los auxiliares para la creación de recibos (Cajas, Bancos, Cuentas Bancarias).
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerAuxiliaresCobro
 */
exports.obtenerAuxiliaresCobro = onRequest({ cors: true }, async (req, res) => {
  try {
    const cookies = await getYiQiCookies();
    
    // Consulta Cajas, Bancos, Cuentas Bancarias y Conceptos de Retención en paralelo
    const queryUrl = (entity) => `https://me.yiqi.com.ar/api/public/${entity}/query?schemaId=1491`;
    
    const [cajasResp, bancosResp, cuentasResp, retencionesResp] = await Promise.all([
      fetch(queryUrl("CAJA"), {
        method: "POST",
        headers: { "Cookie": cookies, "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, pageSize: 100, columns: [{ field: "id" }, { field: "CAJA_DESCRIPCION" }] })
      }),
      fetch(queryUrl("BANCO"), {
        method: "POST",
        headers: { "Cookie": cookies, "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, pageSize: 100, columns: [{ field: "id" }, { field: "BANC_DESCRIPCION" }] })
      }),
      fetch(queryUrl("CUENTA_BANCARIA"), {
        method: "POST",
        headers: { "Cookie": cookies, "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, pageSize: 100, columns: [{ field: "id" }, { field: "CUDE_DESCRIPCION" }, { field: "CUDE_ES_CUENTA_BANCARIA_P" }] })
      }),
      fetch(queryUrl("CONCEPTO_RETENCION"), {
        method: "POST",
        headers: { "Cookie": cookies, "Content-Type": "application/json" },
        body: JSON.stringify({ page: 1, pageSize: 100, columns: [{ field: "id" }, { field: "CORE_NOMBRE" }] })
      })
    ]);
    
    const [cajasData, bancosData, cuentasData, retencionesData] = await Promise.all([
      cajasResp.ok ? cajasResp.json() : { data: [] },
      bancosResp.ok ? bancosResp.json() : { data: [] },
      cuentasResp.ok ? cuentasResp.json() : { data: [] },
      retencionesResp.ok ? retencionesResp.json() : { data: [] }
    ]);
    
    const extractRows = (obj) => {
      let r = obj.data || obj.rows || obj;
      if (r && r.rows) r = r.rows;
      return Array.isArray(r) ? r : [];
    };
    
    const cajas = extractRows(cajasData).map(c => ({ id: c.id, nombre: c.CAJA_DESCRIPCION }));
    const bancos = extractRows(bancosData).map(b => ({ id: b.id, nombre: b.BANC_DESCRIPCION }));
    
    // Filter to only own accounts where CUDE_ES_CUENTA_BANCARIA_P is 'S'
    const cuentas = extractRows(cuentasData)
      .filter(c => c.CUDE_ES_CUENTA_BANCARIA_P === "S")
      .map(c => ({ id: c.id, nombre: c.CUDE_DESCRIPCION }));
      
    const retenciones = extractRows(retencionesData).map(r => ({ id: r.id, nombre: r.CORE_NOMBRE }));
    
    return res.json({ success: true, cajas, bancos, cuentas, retenciones });
  } catch (error) {
    console.error("Error en obtenerAuxiliaresCobro:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que crea un recibo de cobro manual con múltiples medios de pago y cancelaciones en YiQi.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/crearReciboManual
 */
exports.crearReciboManual = onRequest({ cors: true }, async (req, res) => {
  const { clientCode, fecha, observaciones, efectivos, cheques, transferencias, electronicos, retenciones, cancelaciones } = req.body;
  if (!clientCode || !fecha) {
    return res.status(400).json({ error: "Faltan parametros obligatorios (clientCode, fecha)" });
  }

  const db = admin.firestore();

  try {
    const cookies = await getYiQiCookies();
    const resolvedCancelations = [];
    const failedResolutions = [];

    // 1. Resolver todas las facturas y notas de débito a sus IDs internos en YiQi
    if (Array.isArray(cancelaciones)) {
      for (const c of cancelaciones) {
        let { invoiceNumber, invoiceId, amount } = c;

        if (!invoiceId && invoiceNumber) {
          try {
            const parsedInv = parseComprobante(invoiceNumber);
            if (parsedInv.number !== null) {
              let clientFilterCol = null;
              if (parsedInv.entity === 'FACTURA') {
                clientFilterCol = 'FACT_ID_CLIENTE';
              } else if (parsedInv.entity === 'NOTA_DEBITO') {
                clientFilterCol = 'CLIE_CODIGO';
              }

              const filters = [
                { columnName: parsedInv.filterField, operator: '=', value: parsedInv.number }
              ];
              if (clientFilterCol) {
                filters.push({ columnName: clientFilterCol, operator: '=', value: String(clientCode) });
              }

              const queryUrl = `https://me.yiqi.com.ar/api/public/${parsedInv.entity}/query?schemaId=1491`;
              const queryBody = {
                page: 1,
                pageSize: 5,
                columns: [{ field: 'id' }],
                filters: filters
              };
              const resp = await fetch(queryUrl, {
                method: 'POST',
                headers: { 'Cookie': cookies, 'Content-Type': 'application/json' },
                body: JSON.stringify(queryBody)
              });
              if (resp.ok) {
                const qData = await resp.json();
                const rows = qData.rows || qData.data || [];
                const list = rows.rows || rows;
                if (list && list.length > 0) {
                  invoiceId = list[0].id;
                  c.invoiceId = invoiceId;
                  c.entityType = parsedInv.entity;
                } else {
                  failedResolutions.push(`No se encontró el comprobante ${invoiceNumber} en YiQi`);
                }
              } else {
                const text = await resp.text();
                failedResolutions.push(`Error al buscar comprobante ${invoiceNumber}: ${text}`);
              }
            } else {
              failedResolutions.push(`Formato inválido de comprobante: ${invoiceNumber}`);
            }
          } catch (resolveErr) {
            console.error(`Error resolviendo ${invoiceNumber}:`, resolveErr);
            failedResolutions.push(`Error al resolver ${invoiceNumber}: ${resolveErr.message}`);
          }
        } else if (invoiceId) {
          const parsedInv = parseComprobante(invoiceNumber || "");
          c.entityType = parsedInv.entity;
        }

        if (invoiceId && c.entityType) {
          resolvedCancelations.push({
            CLIE_ID_CLIE: parseInt(clientCode, 10),
            FACT_ID_FACT: c.entityType === 'FACTURA' ? parseInt(invoiceId, 10) : null,
            NODE_ID_NODE: c.entityType === 'NOTA_DEBITO' ? parseInt(invoiceId, 10) : null,
            CANC_IMPORTE_A_CANCELAR: parseFloat(amount)
          });
        }
      }
    }

    if (failedResolutions.length > 0) {
      throw new Error(`Fallo al resolver comprobantes: ${failedResolutions.join(", ")}`);
    }

    // 2. Armar la estructura del recibo COBRO
    const cobroUrl = "https://me.yiqi.com.ar/api/public/COBRO?schemaId=1491";
    const cobroBody = {
      schemaId: 1491,
      data: {
        CLIE_ID_CLIE: parseInt(clientCode, 10),
        COBR_FECHA: fecha,
        COBR_OBSERVACIONES: observaciones || "R.M.A",
        FacturasCanceladas: resolvedCancelations,
        CobrosEnEfectivo: Array.isArray(efectivos) ? efectivos.map(e => ({
          CAJA_ID_CAJA: parseInt(e.cajaId, 10),
          DECO_IMPORTE: parseFloat(e.importe)
        })) : [],
        Cheques: Array.isArray(cheques) ? cheques.map(ch => ({
          BANC_ID_BANC: parseInt(ch.bancoId, 10),
          CHEQ_NUMERO: String(ch.numero),
          CHEQ_FECHA_PAGO: ch.fechaPago,
          CHEQ_IMPORTE: parseFloat(ch.importe),
          CHEQ_ELECTRONICO: !!ch.electronico,
          CAJA_ID_CAJA: ch.electronico ? null : (ch.cajaId ? parseInt(ch.cajaId, 10) : null),
          CHEQ_CUIT_LIBRADOR: ch.cuitLibrador ? String(ch.cuitLibrador) : null,
          CHEQ_REFERENCIA: ch.referencia ? String(ch.referencia) : null
        })) : [],
        Transferencias: Array.isArray(transferencias) ? transferencias.map(t => ({
          CLIE_ID_CLIE: parseInt(clientCode, 10),
          TRRE_FECHA: fecha,
          TRRE_IMPORTE: parseFloat(t.importe),
          CUDE_ID_CUDE: parseInt(t.cuentaDestinoId, 10),
          TRRE_REFERENCIA: t.referencia ? String(t.referencia) : null
        })) : [],
        CobrosElectrónicos: Array.isArray(electronicos) ? electronicos.map(el => ({
          COEL_IMPORTE: parseFloat(el.importe),
          CDCE_ID_CDCE: parseInt(el.conceptoId, 10),
          COEL_NRO_DE_OPERACION: el.nroOperacion ? String(el.nroOperacion) : null,
          COEL_FECHA_DE_COBRO: fecha
        })) : [],
        Retenciones: Array.isArray(retenciones) ? retenciones.map(r => ({
          RERE_NUMERO_COMPROBANTE: String(r.numero),
          RERE_FECHA_EMISION: r.fechaEmision || null,
          CORE_ID_CORE: parseInt(r.conceptoId, 10),
          RERE_IMPORTE: parseFloat(r.importe)
        })) : []
      }
    };

    const cobroResp = await fetch(cobroUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(cobroBody)
    });

    if (!cobroResp.ok) {
      const errText = await cobroResp.text();
      throw new Error(`Error al crear el recibo COBRO: ${errText}`);
    }

    const cobroRes = await cobroResp.json();
    const cobroId = cobroRes.newId || cobroRes.id || (cobroRes.data && (cobroRes.data.id || (Array.isArray(cobroRes.data) && cobroRes.data[0] && cobroRes.data[0].id)));

    if (!cobroId) {
      throw new Error(`No se pudo obtener el ID del recibo creado: ${JSON.stringify(cobroRes)}`);
    }

    console.log(`Recibo COBRO manual creado con ID: ${cobroId}`);

    // 3. Transicionar a 'Procesando ajustes'
    const stateUrl1 = `https://me.yiqi.com.ar/api/public/COBRO/changestate?id=${cobroId}&schemaId=1491&state=${encodeURIComponent("Procesando ajustes")}`;
    const stateResp1 = await fetch(stateUrl1, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!stateResp1.ok) {
      const errText = await stateResp1.text();
      throw new Error(`Error al cambiar estado a Procesando ajustes: ${errText}`);
    }

    // 4. Ejecutar la transición de workflow 118657 para procesar los ajustes e imputaciones
    const workflowUrl = "https://me.yiqi.com.ar/api/workflowApi/ExecuteTransition";
    const workflowBody = {
      schemaId: 1491,
      ids: [String(cobroId)],
      transitionId: 118657,
      form: ""
    };

    const workflowResp = await fetch(workflowUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(workflowBody)
    });

    if (!workflowResp.ok) {
      const errText = await workflowResp.text();
      throw new Error(`Error al ejecutar transición (118657): ${errText}`);
    }

    // Esperar 2.5 segundos para evitar condiciones de carrera
    console.log("Esperando 2500ms para asegurar el procesamiento en YiQi...");
    await new Promise(resolve => setTimeout(resolve, 2500));

    // 5. Transicionar a 'Emitido'
    const stateUrl2 = `https://me.yiqi.com.ar/api/public/COBRO/changestate?id=${cobroId}&schemaId=1491&state=Emitido`;
    const stateResp2 = await fetch(stateUrl2, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})
    });

    if (!stateResp2.ok) {
      const errText = await stateResp2.text();
      throw new Error(`Error al emitir el recibo: ${errText}`);
    }

    console.log(`Recibo manual ${cobroId} emitido exitosamente.`);

    let receiptNumber = String(cobroId); // Fallback
    try {
      const fetchUrl = `https://me.yiqi.com.ar/api/public/COBRO/${cobroId}?schemaId=1491`;
      const fetchResp = await fetch(fetchUrl, {
        headers: { "Cookie": cookies }
      });
      if (fetchResp.ok) {
        const fetchRes = await fetchResp.json();
        const cobroData = fetchRes.data || fetchRes;
        if (cobroData && cobroData.COBR_NRODERECIBO) {
          receiptNumber = String(cobroData.COBR_NRODERECIBO);
        }
      }
    } catch (fetchErr) {
      console.error("Error fetching receipt number details:", fetchErr);
    }

    // Registrar log de actividad
    try {
      await db.collection("cc_activity_logs").add({
        timestamp: Date.now(),
        date: new Date().toISOString().substring(0, 10),
        time: new Date().toTimeString().substring(0, 8),
        action: "Creación de Recibo Manual",
        details: `Recibo manual creado exitosamente para cliente ${clientCode} con ID ${cobroId} (Nro: ${receiptNumber}). cancelaciones: ${JSON.stringify(cancelaciones)}`,
        type: "success"
      });
    } catch (logErr) {
      console.error("Error registrando log de actividad:", logErr);
    }

    return res.json({ success: true, cobroId, receiptNumber });

  } catch (error) {
    console.error("Error en crearReciboManual:", error);
    try {
      await db.collection("cc_activity_logs").add({
        timestamp: Date.now(),
        date: new Date().toISOString().substring(0, 10),
        time: new Date().toTimeString().substring(0, 8),
        action: "Creación de Recibo Manual (Error)",
        details: `Error al crear recibo manual para cliente ${clientCode}: ${error.message}`,
        type: "error"
      });
    } catch (logErr) {
      console.error("Error registrando log de error:", logErr);
    }
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que consulta de forma segura los pedidos pendientes de un cliente.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerPedidosPendientes?clientCode=7550
 */
exports.obtenerPedidosPendientes = onRequest({ cors: true }, async (req, res) => {
  const clientCode = req.query.clientCode;
  const noStock = req.query.noStock === "true";
  if (!clientCode) {
    return res.status(400).json({ error: "Falta el parametro clientCode" });
  }

  try {
    const cookies = await getYiQiCookies();
    const token = await getYiQiToken();
    
    // 1. Obtener detalles del cliente para conseguir su CUIT y Razón Social
    const clientQueryUrl = `https://me.yiqi.com.ar/api/public/CLIENTE/${clientCode}?schemaId=1491`;
    const clientResponse = await fetch(clientQueryUrl, {
      method: "GET",
      headers: { "Cookie": cookies }
    });

    if (!clientResponse.ok) {
      const errText = await clientResponse.text();
      console.error("Error consultando cliente:", errText);
      return res.status(clientResponse.status).json({ error: "Error al consultar detalles del cliente", details: errText });
    }

    const clientData = await clientResponse.json();
    const clientObj = clientData.data || clientData.rows || clientData;
    if (!clientObj) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const cuit = clientObj.CLIE_CUIT;
    const razonSocial = clientObj.CLIE_RAZON_SOCIAL;
    const nombre = clientObj.CLIE_NOMBRE;

    if (!cuit && !razonSocial && !nombre) {
      return res.json({ success: true, clientCode, data: [] });
    }

    // 2. Query de pedidos
    const queryUrl = "https://me.yiqi.com.ar/api/public/PEDIDO/query?schemaId=1491";
    
    const filters = [];
    if (razonSocial) {
      filters.push({
        columnName: "CLIE_RAZON_SOCIAL",
        operator: "=",
        value: String(razonSocial)
      });
    } else if (cuit) {
      filters.push({
        columnName: "PEDI_CUIT",
        operator: "=",
        value: String(cuit)
      });
    } else if (nombre) {
      filters.push({
        columnName: "CLIE_NOMBRE",
        operator: "=",
        value: String(nombre)
      });
    }

    const queryBody = {
      page: 1,
      pageSize: 50,
      columns: [
        { field: "PEDI_NUMERO" },
        { field: "PEDI_FECHA", sortDirection: "DESC", sortOrder: 1 },
        { field: "PEDI_TOTAL" },
        { field: "PEDI_PORCENTAJE_DE_ENTREG" },
        { field: "PEDI_CUIT" },
        { field: "CLIE_RAZON_SOCIAL" },
        { field: "CLIE_NOMBRE" },
        { field: "PEDI_NRO_PEDIDO" },
        { field: "id" }
      ],
      filters: filters
    };

    const qResp = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(queryBody)
    });

    if (!qResp.ok) {
      const errText = await qResp.text();
      console.error("Error consultando pedidos:", errText);
      return res.status(qResp.status).json({ error: "Error al consultar pedidos", details: errText });
    }

    const qData = await qResp.json();
    const rows = qData.data || qData.rows || [];
    
    // Calcular métricas comerciales sobre los 50 pedidos históricos
    const totalPedidos = rows.length;
    const anuladosPedidos = rows.filter(r => {
      const cod = Number(r.ESTA_CODIGO || 0);
      return cod === 442 || cod === 443 || cod === 444; // 442 is Anulado
    }).length;
    const ratioAnulados = totalPedidos > 0 ? (anuladosPedidos / totalPedidos) * 100 : 0;

    // Filtrar pedidos no entregados al 100% (incluye anulados y pendientes)
    const pendingRows = rows.filter(r => {
      const pct = r.PEDI_PORCENTAJE_DE_ENTREG !== undefined && r.PEDI_PORCENTAJE_DE_ENTREG !== null ? parseFloat(r.PEDI_PORCENTAJE_DE_ENTREG) : 0;
      return pct < 100;
    });

    // Filtrar pedidos entregados al 100% (excluyendo anulados para la solapa de entregados)
    const deliveredRows = rows.filter(r => {
      const pct = r.PEDI_PORCENTAJE_DE_ENTREG !== undefined && r.PEDI_PORCENTAJE_DE_ENTREG !== null ? parseFloat(r.PEDI_PORCENTAJE_DE_ENTREG) : 0;
      const cod = Number(r.ESTA_CODIGO || 0);
      const isAnnulled = cod === 442 || cod === 443 || cod === 444;
      return pct >= 100 && !isAnnulled;
    });

    // Limitar detalles paralelos para evitar rate limiting (máximo 12 pendientes, 8 entregados)
    const limitedPendingRows = pendingRows.slice(0, 12);
    const limitedDeliveredRows = deliveredRows.slice(0, 8);

    const fetchDetailedOrder = async (order) => {
      try {
        const detailUrl = `https://me.yiqi.com.ar/api/public/PEDIDO/${order.id}?schemaId=1491`;
        const dResp = await fetch(detailUrl, {
          headers: { "Cookie": cookies }
        });
        if (dResp.ok) {
          const dData = await dResp.json();
          const orderDetailObj = dData.data || dData;
          
          // Excluir si el ID de cliente no coincide (evita colisión por CUIT repetido)
          const orderClientCode = orderDetailObj.CLIE_ID_CLIE || orderDetailObj.CLIE_CODIGO || "";
          if (String(orderClientCode) !== String(clientCode)) {
            return null;
          }

          const estado = orderDetailObj.ESTA_NOMBRE || order.ESTA_NOMBRE || "";

          // Mapear ítems (MÁRGENES)
          const margins = orderDetailObj.MÁRGENES || [];
          const productos = orderDetailObj.PRODUCTOS || [];
          const assignedIds = new Set();
          const items = margins.map(item => {
            const matchingProd = productos.find(p => p.MATE_ID_MATE === item.MATE_ID && !assignedIds.has(p.id));
            if (matchingProd) {
              assignedIds.add(matchingProd.id);
            }
            const actualItemId = matchingProd ? matchingProd.id : (item.id || null);
            return {
              id: actualItemId,
              producto: item.PRODUCTO || "",
              sku: item.SKU || "",
              mateId: item.MATE_ID || null,
              cantidadPedida: item.CANTIDAD ? parseFloat(item.CANTIDAD) : 0,
              cantidadAEntregar: item.CANT_A_ENTREGAR !== undefined && item.CANT_A_ENTREGAR !== null ? parseFloat(item.CANT_A_ENTREGAR) : 0,
              estadoItem: item.ESTADO_DETALLE || "",
              stockDepo: item.STOCK_DEPO !== undefined && item.STOCK_DEPO !== null ? parseFloat(item.STOCK_DEPO) : 0,
              stockDepor: item.STOCK_DEPOR !== undefined && item.STOCK_DEPOR !== null ? parseFloat(item.STOCK_DEPOR) : 0,
              disponible: item.DISPONIBLE || "",
              reservadoCant: item.RESERVADO_CANT !== undefined && item.RESERVADO_CANT !== null ? parseFloat(item.RESERVADO_CANT) : 0,
              stockFaltante: item.STOCK_FALTANTE !== undefined && item.STOCK_FALTANTE !== null ? parseFloat(item.STOCK_FALTANTE) : 0,
              textoAdicional: item.TEXTO_ADICIONAL || ""
            };
          });

          // Obtener lista de facturas (excluyendo solo proyectadas/borradores)
          const facturas = (orderDetailObj.FACTURAS || [])
            .filter(f => {
              const est = (f.ESTA_NOMBRE || "").toLowerCase();
              const nro = f.FACT_NUMERO;
              const isProjected = est === "proyectada" || est === "borrador" || !nro || nro === 0 || String(nro) === "0";
              return !isProjected;
            })
            .map(f => {
              let tipo = "X";
              if (f.TIFA_ID_TIFA === 1) tipo = "Factura A";
              else if (f.TIFA_ID_TIFA === 2) tipo = "Factura B";
              else if (f.TIFA_ID_TIFA === 3) tipo = "Factura C";
              
              const ptoVta = f.FACT_PUVE_NOMBRE || "0";
              const nro = f.FACT_NUMERO || "0";
              
              return {
                id: f.id,
                numero: `${tipo} ${ptoVta}-${nro}`,
                tifaId: f.TIFA_ID_TIFA || 1,
                puveId: f.PUVE_ID_PUVE || 1,
                total: f.FACT_TOTAL || 0,
                estado: f.ESTA_NOMBRE || ""
              };
            });

          // Obtener lista de remitos (REMITOSDEVENTA)
          const remitos = (orderDetailObj.REMITOSDEVENTA || [])
            .map(r => ({
              id: r.id,
              numero: r.REDV_NRO || r.REDV_DESCRIPCION || "",
              estado: r.ESTA_NOMBRE || "",
              fechaDespacho: r.REDV_FECHA_DE_DESPACHO || null,
              bultos: r.REDV_BULTOS || 0,
              adjuntoId: r.REDV_ADJUNTO || null
            }));

          return {
            id: order.id,
            numero: order.PEDI_NUMERO || "",
            nroPedido: order.PEDI_NRO_PEDIDO || "",
            fecha: order.PEDI_FECHA || null,
            porcentajeEntrega: order.PEDI_PORCENTAJE_DE_ENTREG !== undefined && order.PEDI_PORCENTAJE_DE_ENTREG !== null ? parseFloat(order.PEDI_PORCENTAJE_DE_ENTREG) : 0,
            total: order.PEDI_TOTAL !== undefined && order.PEDI_TOTAL !== null ? parseFloat(order.PEDI_TOTAL) : 0,
            estado: estado,
            facturas: facturas,
            remitos: remitos,
            items: items
          };
        }
      } catch (detailErr) {
        console.error(`Error consultando detalle para pedido ${order.id}:`, detailErr);
      }
      return null;
    };

    // Obtener detalles completos de cada pedido en paralelo
    const detailedPendingPromise = Promise.all(limitedPendingRows.map(fetchDetailedOrder));
    const detailedDeliveredPromise = Promise.all(limitedDeliveredRows.map(fetchDetailedOrder));

    const [detailedPending, detailedDelivered] = await Promise.all([detailedPendingPromise, detailedDeliveredPromise]);

    const activePending = detailedPending.filter(o => o !== null);
    const activeDelivered = detailedDelivered.filter(o => o !== null);

    // Recopilar todos los SKUs únicos de los ítems de pedidos
    const uniqueSkus = [];
    const collectSkus = (orders) => {
      orders.forEach(o => {
        if (o && o.items) {
          o.items.forEach(item => {
            if (item.sku && !uniqueSkus.includes(item.sku)) {
              uniqueSkus.push(item.sku);
            }
          });
        }
      });
    };
    collectSkus(activePending);
    collectSkus(activeDelivered);

    // Consultar el stock real y la factibilidad de producción en paralelo para cada SKU
    const stockMap = {};
    if (!noStock && uniqueSkus.length > 0) {
      await Promise.all(uniqueSkus.map(async (sku) => {
        let stockDepo = 0;
        let stockDepor = 0;
        let factibilidad = 0;
        let hasBOM = false;

        const stockPromise = (async () => {
          try {
            const queryUrl = "https://me.yiqi.com.ar/api/public/STOCK/query?schemaId=1491";
            const body = {
              page: 1,
              pageSize: 30,
              columns: [
                { field: "STOC_SKU" },
                { field: "STOC_CANTIDAD" },
                { field: "STOC_FACTIBILIDAD_PRODUCC" },
                { field: "STOC_UBICACION_NOMBRE" }
              ],
              filters: [
                { columnName: "STOC_SKU", operator: "=", value: sku }
              ]
            };

            const sResp = await fetch(queryUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Cookie": cookies
              },
              body: JSON.stringify(body)
            });

            if (sResp.ok) {
              const sData = await sResp.json();
              const rows = sData.data || sData.rows || [];

              rows.forEach(r => {
                const qty = r.STOC_CANTIDAD ? parseFloat(r.STOC_CANTIDAD) : 0;
                const fact = r.STOC_FACTIBILIDAD_PRODUCC ? parseFloat(r.STOC_FACTIBILIDAD_PRODUCC) : 0;
                const loc = (r.STOC_UBICACION_NOMBRE || "").trim().toUpperCase();

                if (loc === "DEPO") {
                  stockDepo += qty;
                  if (fact > factibilidad) factibilidad = fact;
                } else if (loc === "DEPOR") {
                  stockDepor += qty;
                }
              });
            }
          } catch (err) {
            console.error(`Error al consultar stock para SKU ${sku}:`, err);
          }
        })();

        const bomPromise = (async () => {
          try {
            const bomUrl = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=771&schemaId=1491&smartieId=2785";
            const bomResp = await fetch(bomUrl, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": "Bearer " + token
              },
              body: JSON.stringify({ page: 1, pageSize: 5, search: String(sku) })
            });

            if (bomResp.ok) {
              const bomData = await bomResp.json();
              const bomRows = bomData.rows || bomData.data || bomData.instances || bomData.items || [];
              hasBOM = bomRows.some(b => (b.MBOM_CODIGO || "").trim().toUpperCase() === String(sku).trim().toUpperCase());
            }
          } catch (bomErr) {
            console.error(`Error al consultar BOM para SKU ${sku}:`, bomErr);
          }
        })();

        await Promise.all([stockPromise, bomPromise]);
        stockMap[sku] = { stockDepo, stockDepor, factibilidad, hasBOM };
      }));
    }

    // Enriquecer los ítems con los niveles de stock correctos
    const enrichOrders = (orders) => {
      orders.forEach(o => {
        if (o && o.items) {
          o.items.forEach(item => {
            const stockInfo = stockMap[item.sku];
            if (stockInfo) {
              item.stockDepo = stockInfo.stockDepo + stockInfo.factibilidad;
              item.stockDepor = stockInfo.stockDepor;
              item.rawStockDepo = stockInfo.stockDepo;
              item.factibilidad = stockInfo.factibilidad;
              item.hasBOM = stockInfo.hasBOM || false;
            } else {
              item.stockDepo = 0;
              item.stockDepor = 0;
              item.rawStockDepo = 0;
              item.factibilidad = 0;
              item.hasBOM = false;
            }
          });
        }
      });
    };
    enrichOrders(activePending);
    enrichOrders(activeDelivered);

    return res.json({
      success: true,
      clientCode,
      metrics: {
        total: totalPedidos,
        annulled: anuladosPedidos,
        ratio: ratioAnulados
      },
      pending: activePending,
      delivered: activeDelivered
    });

  } catch (error) {
    console.error("Error en obtenerPedidosPendientes:", error);
    cachedCookies = null;
    cookiesExpiry = 0;
    return res.status(500).json({ error: error.message });
  }
});

async function refreshPedidoInYiQi(parentOrderId, token) {
  if (!parentOrderId) return;
  try {
    console.log(`[Refresh] Refrescando pedido ID ${parentOrderId} en YiQi...`);
    // 1. Refresh ChildList
    const childListUrl = `https://api.yiqi.com.ar/api/childrenApi/GetChildList?entityId=828&schemaId=1491&childId=231&instanceId=${parentOrderId}&take=100&skip=0&page=1&pageSize=100`;
    await fetch(childListUrl, {
      method: "GET",
      headers: { "Authorization": "Bearer " + token }
    });
    
    // 2. Refresh Instance
    const instanceUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=1491&entityId=828&id=${parentOrderId}&password=`;
    await fetch(instanceUrl, {
      method: "GET",
      headers: { "Authorization": "Bearer " + token }
    });
    console.log(`[Refresh] Refresh de pedido ID ${parentOrderId} completado.`);
  } catch (err) {
    console.error(`[Refresh] Error refrescando pedido ID ${parentOrderId}:`, err);
  }
}

async function getBOMRecursive(sku, token, visited = new Set(), depth = 0) {
  if (depth > 3 || visited.has(sku)) return null;
  visited.add(sku);

  try {
    const url = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=771&schemaId=1491&smartieId=2785";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ page: 1, pageSize: 150, search: String(sku) })
    });

    if (!response.ok) return null;
    const data = await response.json();
    const rows = data.data || data.rows || data.instances || data.items || [];
    
    const matchedRows = rows.filter(b => (b.MBOM_CODIGO || "").trim().toUpperCase() === String(sku).trim().toUpperCase());
    if (matchedRows.length === 0) return null;

    const components = await Promise.all(matchedRows.map(async (b) => {
      const compSku = b.MATE_CODIGO || "";
      const compName = b.MATE_NOMBRE || "Insumo";
      const reqQty = b.DEBO_CANTIDAD || 0;
      const stockQty = b.DEBO_CANTIDAD_EN_STOCK || 0;
      const unit = b.TIUN_DESCRIPCION || "Ud";

      // Intentar cargar la sub-receta recursivamente
      const subBOM = await getBOMRecursive(compSku, token, new Set(visited), depth + 1);

      return {
        sku: compSku,
        name: compName,
        reqQty,
        stockQty,
        unit,
        hasBOM: subBOM !== null,
        components: subBOM ? subBOM.components : null
      };
    }));

    return { sku, components };
  } catch (err) {
    console.error(`Error in getBOMRecursive for ${sku}:`, err);
    return null;
  }
}

/**
 * Cloud Function que sirve como proxy seguro para el módulo de Control de Calidad y Expedición (TMC 2.0).
 */
exports.controlCalidadApi = onRequest({ cors: true }, async (req, res) => {
  const { action } = req.body;
  if (!action) {
    return res.status(400).json({ error: "Falta el parametro action" });
  }

  try {
    const token = await getYiQiToken();

    if (action === "getTableroPedidos") {
      // 1. Query all pending orders
      const queryUrl = "https://api.yiqi.com.ar/api/public/PEDIDO/query?schemaId=1491";
      const queryBody = {
        page: 1,
        pageSize: 150, // Get last 150 pending orders
        columns: [
          { field: "PEDI_NUMERO" },
          { field: "PEDI_FECHA" },
          { field: "PEDI_TOTAL" },
          { field: "PEDI_PORCENTAJE_DE_ENTREG" },
          { field: "CLIE_RAZON_SOCIAL" },
          { field: "PEDI_NRO_PEDIDO" },
          { field: "id" }
        ],
        filters: [
          {
            columnName: "PEDI_PORCENTAJE_DE_ENTREG",
            operator: "<",
            value: "100"
          }
        ],
        sorts: [
          { field: "PEDI_FECHA", desc: true }
        ]
      };

      const qResp = await fetch(queryUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(queryBody)
      });

      if (!qResp.ok) {
        throw new Error(`YiQi PEDIDO query retornó HTTP ${qResp.status}`);
      }

      const qData = await qResp.json();
      let rows = qData.data || qData.rows || [];

      // OPTIMIZATION: Filter out cancelled/anulado orders (ESTA_CODIGO 442, 443, 444)
      rows = rows.filter(r => {
        const cod = Number(r.ESTA_CODIGO || 0);
        return cod !== 442 && cod !== 443 && cod !== 444;
      });

      // 2. Fetch full details for each order in parallel
      const detailedOrders = [];
      const fetchDetails = async (order) => {
        try {
          const detailUrl = `https://api.yiqi.com.ar/api/public/PEDIDO/${order.id}?schemaId=1491`;
          const dResp = await fetch(detailUrl, {
            headers: {
              "Authorization": "Bearer " + token,
              "Content-Type": "application/json"
            }
          });
          if (dResp.ok) {
            const dData = await dResp.json();
            const orderDetailObj = dData.data || dData;
            
            const estado = orderDetailObj.ESTA_NOMBRE || "";
            const estadoLower = estado.toLowerCase();

            // Filter out unwanted states
            const isUnwanted = estadoLower.includes("anulado") || estadoLower.includes("entregado") || estadoLower.includes("despachado") || estadoLower.includes("cancelado");
            if (isUnwanted) return;

            // Map items
            const margins = orderDetailObj.MÁRGENES || [];
            const productos = orderDetailObj.PRODUCTOS || [];
            const assignedIds = new Set();
            const items = margins.map(item => {
              const matchingProd = productos.find(p => p.MATE_ID_MATE === item.MATE_ID && !assignedIds.has(p.id));
              if (matchingProd) {
                assignedIds.add(matchingProd.id);
              }
              const actualItemId = matchingProd ? matchingProd.id : (item.id || null);
              return {
                id: actualItemId,
                producto: item.PRODUCTO || "",
                sku: item.SKU || "",
                mateId: item.MATE_ID || null,
                cantidadPedida: item.CANTIDAD ? parseFloat(item.CANTIDAD) : 0,
                cantidadAEntregar: item.CANT_A_ENTREGAR !== undefined && item.CANT_A_ENTREGAR !== null ? parseFloat(item.CANT_A_ENTREGAR) : 0,
                estadoItem: item.ESTADO_DETALLE || "",
                stockDepo: item.STOCK_DEPO !== undefined && item.STOCK_DEPO !== null ? parseFloat(item.STOCK_DEPO) : 0,
                stockDepor: item.STOCK_DEPOR !== undefined && item.STOCK_DEPOR !== null ? parseFloat(item.STOCK_DEPOR) : 0,
                disponible: item.DISPONIBLE || "",
                reservadoCant: item.RESERVADO_CANT !== undefined && item.RESERVADO_CANT !== null ? parseFloat(item.RESERVADO_CANT) : 0,
                stockFaltante: item.STOCK_FALTANTE !== undefined && item.STOCK_FALTANTE !== null ? parseFloat(item.STOCK_FALTANTE) : 0,
                textoAdicional: item.TEXTO_ADICIONAL || ""
              };
            });

            // OPs
            const ops = (orderDetailObj.ORDENDEPRODUCCIÓN || []).map(o => ({
              id: o.id,
              nro: o.ORDP_NRO || "",
              estado: o.ESTA_NOMBRE || ""
            }));

            detailedOrders.push({
              id: order.id,
              numero: order.PEDI_NUMERO || "",
              nroPedido: order.PEDI_NRO_PEDIDO || "",
              fecha: order.PEDI_FECHA || null,
              porcentajeEntrega: order.PEDI_PORCENTAJE_DE_ENTREG !== undefined ? parseFloat(order.PEDI_PORCENTAJE_DE_ENTREG) : 0,
              total: order.PEDI_TOTAL !== undefined ? parseFloat(order.PEDI_TOTAL) : 0,
              estado: estado,
              cliente: order.CLIE_RAZON_SOCIAL || orderDetailObj.PEDI_RAZON_SOCIAL || "",
              items: items,
              ops: ops
            });
          }
        } catch (detailErr) {
          console.error(`Error in getTableroPedidos detail fetch for ${order.id}:`, detailErr);
        }
      };

      // Limit concurrency to chunks of 15
      const chunkSize = 15;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await Promise.all(chunk.map(fetchDetails));
      }

      // Check BOM presence for unique SKUs in the returned orders
      const uniqueSkus = [...new Set(detailedOrders.flatMap(o => o.items.map(item => item.sku)))];
      
      const bomMap = {};
      if (uniqueSkus.length > 0) {
        try {
          const bomListUrl = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=771&schemaId=1491&smartieId=2785";
          const bomResp = await fetch(bomListUrl, {
            method: "POST",
            headers: {
              "Authorization": "Bearer " + token,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ page: 1, pageSize: 1000 })
          });
          if (bomResp.ok) {
            const bomData = await bomResp.json();
            const bomRows = bomData.data || bomData.rows || [];
            bomRows.forEach(r => {
              if (r.MBOM_CODIGO) bomMap[r.MBOM_CODIGO.trim().toUpperCase()] = true;
            });
          }
        } catch (bomErr) {
          console.error("Error fetching formulas list for dashboard:", bomErr);
        }
      }

      detailedOrders.forEach(o => {
        o.items.forEach(item => {
          item.hasBOM = !!bomMap[(item.sku || "").trim().toUpperCase()];
        });
      });

      return res.json({ success: true, orders: detailedOrders });

    } else if (action === "getRecursiveBOM") {
      const { sku } = req.body;
      if (!sku) {
        return res.status(400).json({ error: "Falta el parametro sku" });
      }

      console.log(`[RecursiveBOM] Generando receta recursiva para ${sku}...`);
      const bomTree = await getBOMRecursive(sku, token);
      if (!bomTree) {
        return res.json({ success: true, sku, components: [] });
      }

      return res.json({ success: true, ...bomTree });

    } else if (action === "getPedidos") {
      // Pedidos a preparar
      const url = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=1231&schemaId=1491&smartieId=2584";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ page: 1, pageSize: 1000 })
      });
      if (!resp.ok) throw new Error(`YiQi GetList Pedidos retornó HTTP ${resp.status}`);
      const data = await resp.json();
      return res.json(data);

    } else if (action === "prepararPedido") {
      const { pedidoId, pedidoNro, cantBultos } = req.body;
      if (!pedidoId || !pedidoNro) {
        return res.status(400).json({ error: "Faltan parametros (pedidoId, pedidoNro)" });
      }

      // Normalization helpers for backend
      const strip = (s) => String(s??"").normalize("NFD").replace(/\p{Diacritic}/gu,"").toLowerCase();
      const normKey = (s) => strip(s).replace(/[-–—−_/.:(),;[\]{}|]/g," ").replace(/\s+/g," ").trim();
      const pickExact = (row, candidates) => {
        const keys = Object.keys(row || {});
        const table = keys.map(k => ({ k, n: normKey(k) }));
        for (const name of candidates) {
          const nn = normKey(name);
          const exact = table.find(o => o.n === nn);
          if (exact) return row[exact.k];
        }
        for (const name of candidates) {
          const nn = normKey(name);
          const end = table.find(o => o.n.endsWith(" " + nn));
          if (end) return row[end.k];
        }
        return undefined;
      };
      const objectifyColumnsData = (resp) => {
        if (Array.isArray(resp?.columns) && Array.isArray(resp?.data)) {
          const cols = resp.columns.map(c => c?.name ?? c);
          return resp.data.map(arr => {
            const o = {};
            cols.forEach((cn, i) => o[cn] = arr[i]);
            return o;
          });
        }
        return null;
      };
      const getRows = (resp) => {
        if (!resp) return [];
        if (Array.isArray(resp.rows)) return resp.rows;
        if (Array.isArray(resp.data?.rows)) return resp.data.rows;
        if (Array.isArray(resp.data)) return resp.data;
        if (Array.isArray(resp.instances)) return resp.instances;
        if (Array.isArray(resp.items)) return resp.items;
        const o = objectifyColumnsData(resp);
        return Array.isArray(o) ? o : [];
      };
      const getRemitoId = (row) => {
        return (row["ID"] ?? row["id"] ?? row["Identificador"] ?? row["REMITO_ID_REMITO"] ?? pickExact(row, ["ID", "Identificador", "REMITO_ID_REMITO"]) ?? "").toString().trim();
      };
      const getRemitoPedidoNro = (row) => {
        return (row["PEDI_NUMERO"] ?? pickExact(row, ["Pedido - Nro", "Nro Pedido", "PEDI_NUMERO"]) ?? "").toString().trim();
      };
      const getRemitoNro = (row) => {
        return (row["NUMERO"] ?? row["REMI_NRO_REMITO"] ?? row["NUMERO_COMPROBANTE"] ?? pickExact(row, ["Número", "Nro Comprobante", "Número Comprobante", "REMI_NRO_REMITO"]) ?? "").toString().trim();
      };

      // 1. Ejecutar transición de preparado (118991 - Staging Out)
      const transitionUrl = "https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition";
      const transPayload = {
        schemaId: 1491,
        ids: [String(pedidoId)],
        transitionId: 118991,
        form: ""
      };
      console.log(`[CC] Ejecutando transicion 118991 para pedido ${pedidoNro} (ID: ${pedidoId})...`);
      const transResp = await fetch(transitionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(transPayload)
      });
      if (!transResp.ok) {
        const errText = await transResp.text();
        throw new Error(`Error en transición preparado: ${errText}`);
      }

      // 2. Buscar remito proyectado (esperar y reintentar hasta 12 veces)
      const getListRemitosUrl = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=859&schemaId=1491&smartieId=2583";
      let remitoId = null;
      let remitoNro = null;
      
      const sleep = (ms) => new Promise(r => setTimeout(r, ms));
      await sleep(2000); // Esperar 2s antes del primer intento

      for (let i = 1; i <= 12; i++) {
        console.log(`[CC] Buscando remito proyectado para pedido ${pedidoNro} (intento ${i}/12)...`);
        const remListResp = await fetch(getListRemitosUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify({ page: 1, pageSize: 300 })
        });

        if (remListResp.ok) {
          const remData = await remListResp.json();
          const rows = getRows(remData);

          const match = rows.find(r => {
            const pedNro = getRemitoPedidoNro(r);
            return String(pedNro) === String(pedidoNro);
          });

          if (match) {
            remitoId = getRemitoId(match);
            remitoNro = getRemitoNro(match);
            if (remitoId) {
              console.log(`[CC] Remito cazado con ID: ${remitoId}, Nro: ${remitoNro}`);
              break;
            }
          }
        }
        await sleep(2000);
      }

      if (!remitoId) {
        throw new Error(`No se encontró el remito proyectado en YiQi para el pedido ${pedidoNro} tras varios reintentos.`);
      }

      // 3. Guardar bultos y tracking code en el remito
      console.log(`[CC] Guardando bultos (${cantBultos}) y tracking code (${remitoId}) en remito ID: ${remitoId}...`);
      const saveUrl = "https://api.yiqi.com.ar/api/instancesApi/Save";
      let bultosSaved = false;

      try {
        const saveBody = {
          entityId: 859,
          schemaId: 1491,
          instanceId: String(remitoId),
          form: `6678=${encodeURIComponent(cantBultos)}&6679=${encodeURIComponent(remitoId)}`,
          uploads: "",
          password: null,
          removedFiles: []
        };
        const saveResp = await fetch(saveUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + token
          },
          body: JSON.stringify(saveBody)
        });
        if (saveResp.ok) {
          console.log(`[CC] Bultos y tracking code guardados correctamente para remito ${remitoId}`);
          bultosSaved = true;
        } else {
          console.error(`[CC] Error al guardar en remito: ${await saveResp.text()}`);
        }
      } catch (saveErr) {
        console.error(`[CC] Excepción al guardar en remito:`, saveErr.message);
      }

      return res.json({ success: true, remitoId, remitoNro, bultosSaved });

    } else if (action === "quiebrePedido") {
      const { pedidoId, comment, pedidoNro, clienteNombre, clienteCode: bodyClienteCode } = req.body;
      if (!pedidoId || !comment) {
        return res.status(400).json({ error: "Faltan parametros (pedidoId, comment)" });
      }

      // 1. Agregar comentario en el Pedido (Entidad 828)
      const commentUrl = "https://api.yiqi.com.ar/api/instancesApi/AddComment";
      const commentBody = {
        entityId: "828",
        schemaId: "1491",
        instanceId: String(pedidoId),
        comment: String(comment)
      };
      console.log(`[CC] Agregando comentario de quiebre en pedido ID: ${pedidoId}...`);
      const commentResp = await fetch(commentUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(commentBody)
      });
      if (!commentResp.ok) {
        console.warn(`[CC] Error agregando comentario al pedido: ${await commentResp.text()}`);
      }

      // 2. Ejecutar transición Quiebre 2 (118973)
      const transitionUrl = "https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition";
      const transPayload = {
        schemaId: 1491,
        ids: [String(pedidoId)],
        transitionId: 118973,
        form: ""
      };
      console.log(`[CC] Transicionando pedido ID: ${pedidoId} a Quiebre 2...`);
      const transResp = await fetch(transitionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(transPayload)
      });
      if (!transResp.ok) {
        const errText = await transResp.text();
        throw new Error(`Error en transición quiebre: ${errText}`);
      }

      // 3. Obtener detalles del pedido para registrar alerta en Firestore
      let clienteCode = bodyClienteCode || "";
      let resolvedClienteNombre = clienteNombre || "";
      let resolvedPedidoNro = pedidoNro || "";

      if (!clienteCode || !resolvedClienteNombre || !resolvedPedidoNro) {
        try {
          const cookies = await getYiQiCookies();
          const detailUrl = `https://me.yiqi.com.ar/api/public/PEDIDO/${pedidoId}?schemaId=1491`;
          const dResp = await fetch(detailUrl, {
            headers: { "Cookie": cookies }
          });
          if (dResp.ok) {
            const orderObj = await dResp.json();
            const order = orderObj.data || orderObj;
            if (order) {
              if (!clienteCode) {
                clienteCode = order.CLIE_ID_CLIE || "";
                if (clienteCode) clienteCode = String(clienteCode).trim();
              }
              if (!resolvedClienteNombre) {
                resolvedClienteNombre = order.CLIE_RAZON_SOCIAL || order.PEDI_RAZON_SOCIAL || "";
                if (resolvedClienteNombre) resolvedClienteNombre = String(resolvedClienteNombre).trim();
              }
              if (!resolvedPedidoNro) {
                resolvedPedidoNro = order.PEDI_NRO_PEDIDO || order.PEDI_NUMERO || "";
                if (resolvedPedidoNro) resolvedPedidoNro = String(resolvedPedidoNro).trim();
              }
            }
          }
        } catch (getErr) {
          console.error(`[CC] Error al obtener detalles públicos del pedido: ${getErr.message}`);
        }
      }

      if (!clienteCode || !resolvedClienteNombre || !resolvedPedidoNro) {
        try {
          const getUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=1491&entityId=1231&id=${pedidoId}`;
          const getResp = await fetch(getUrl, {
            headers: {
              "Authorization": "Bearer " + token
            }
          });
          if (getResp.ok) {
            const instObj = await getResp.json();
            if (instObj.atts) {
              if (!clienteCode) {
                clienteCode = instObj.atts["13134"]?.val || instObj.atts["13135"]?.val || "";
                if (clienteCode) clienteCode = String(clienteCode).trim();
              }
              if (!resolvedClienteNombre) {
                resolvedClienteNombre = instObj.atts["9286"]?.val || instObj.atts["9795"]?.val || "";
                if (resolvedClienteNombre) resolvedClienteNombre = String(resolvedClienteNombre).trim();
              }
              if (!resolvedPedidoNro) {
                resolvedPedidoNro = instObj.atts["10583"]?.val || instObj.atts["11102"]?.val || instObj.atts["12337"]?.val || instObj.atts["12338"]?.val || "";
                if (resolvedPedidoNro) resolvedPedidoNro = String(resolvedPedidoNro).trim();
              }
            }
          }
        } catch (fallbackErr) {
          console.error(`[CC] Error en fallback de GetInstance: ${fallbackErr.message}`);
        }
      }

      // 4. Guardar alerta en Firestore
      try {
        const db = admin.firestore();
        const alertDoc = {
          alertaTipo: "QUIEBRE_2",
          pedidoId: String(pedidoId),
          pedidoNro: String(resolvedPedidoNro),
          clienteCode: String(clienteCode),
          clienteNombre: String(resolvedClienteNombre),
          motivo: String(comment || "Falta de stock detectada en expedición / No pasó control de calidad"),
          leida: false,
          creadoEn: admin.firestore.FieldValue.serverTimestamp()
        };
        console.log(`[CC] Escribiendo alerta QUIEBRE_2 en Firestore para pedido ID: ${pedidoId}...`);
        await db.collection("alertas_compartidas").add(alertDoc);
      } catch (dbErr) {
        console.error(`[CC] Error al registrar alerta en Firestore: ${dbErr.message}`);
      }

      return res.json({ success: true });

    } else if (action === "registrarAlertaQuiebreSoloFirestore") {
      const { pedidoId, comment, pedidoNro, clienteNombre, clienteCode: bodyClienteCode } = req.body;
      if (!pedidoId) {
        return res.status(400).json({ error: "Falta pedidoId" });
      }

      let clienteCode = bodyClienteCode || "";
      let resolvedClienteNombre = clienteNombre || "";
      let resolvedPedidoNro = pedidoNro || "";

      if (!clienteCode || !resolvedClienteNombre || !resolvedPedidoNro) {
        try {
          const cookies = await getYiQiCookies();
          const detailUrl = `https://me.yiqi.com.ar/api/public/PEDIDO/${pedidoId}?schemaId=1491`;
          const dResp = await fetch(detailUrl, {
            headers: { "Cookie": cookies }
          });
          if (dResp.ok) {
            const orderObj = await dResp.json();
            const order = orderObj.data || orderObj;
            if (order) {
              if (!clienteCode) {
                clienteCode = order.CLIE_ID_CLIE || "";
                if (clienteCode) clienteCode = String(clienteCode).trim();
              }
              if (!resolvedClienteNombre) {
                resolvedClienteNombre = order.CLIE_RAZON_SOCIAL || order.PEDI_RAZON_SOCIAL || "";
                if (resolvedClienteNombre) resolvedClienteNombre = String(resolvedClienteNombre).trim();
              }
              if (!resolvedPedidoNro) {
                resolvedPedidoNro = order.PEDI_NRO_PEDIDO || order.PEDI_NUMERO || "";
                if (resolvedPedidoNro) resolvedPedidoNro = String(resolvedPedidoNro).trim();
              }
            }
          }
        } catch (getErr) {
          console.error(`[CC] Error al obtener detalles públicos en registrarAlertaQuiebreSoloFirestore: ${getErr.message}`);
        }
      }

      if (!clienteCode || !resolvedClienteNombre || !resolvedPedidoNro) {
        try {
          const getUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=1491&entityId=1231&id=${pedidoId}`;
          const getResp = await fetch(getUrl, {
            headers: {
              "Authorization": "Bearer " + token
            }
          });
          if (getResp.ok) {
            const instObj = await getResp.json();
            if (instObj.atts) {
              if (!clienteCode) {
                clienteCode = instObj.atts["13134"]?.val || instObj.atts["13135"]?.val || "";
                if (clienteCode) clienteCode = String(clienteCode).trim();
              }
              if (!resolvedClienteNombre) {
                resolvedClienteNombre = instObj.atts["9286"]?.val || instObj.atts["9795"]?.val || "";
                if (resolvedClienteNombre) resolvedClienteNombre = String(resolvedClienteNombre).trim();
              }
              if (!resolvedPedidoNro) {
                resolvedPedidoNro = instObj.atts["10583"]?.val || instObj.atts["11102"]?.val || instObj.atts["12337"]?.val || instObj.atts["12338"]?.val || "";
                if (resolvedPedidoNro) resolvedPedidoNro = String(resolvedPedidoNro).trim();
              }
            }
          }
        } catch (fallbackErr) {
          console.error(`[CC] Error en fallback GetInstance en registrarAlertaQuiebreSoloFirestore: ${fallbackErr.message}`);
        }
      }

      try {
        const db = admin.firestore();
        const alertDoc = {
          alertaTipo: "QUIEBRE_2",
          pedidoId: String(pedidoId),
          pedidoNro: String(resolvedPedidoNro),
          clienteCode: String(clienteCode),
          clienteNombre: String(resolvedClienteNombre),
          motivo: String(comment || "Falta de stock detectada en expedición / No pasó control de calidad"),
          leida: false,
          creadoEn: admin.firestore.FieldValue.serverTimestamp()
        };
        console.log(`[CC] Escribiendo alerta QUIEBRE_2 en Firestore (alerta sola) para pedido ID: ${pedidoId}...`);
        await db.collection("alertas_compartidas").add(alertDoc);
      } catch (dbErr) {
        console.error(`[CC] Error registrando alerta sola en Firestore: ${dbErr.message}`);
      }

      return res.json({ success: true });

    } else if (action === "getAltasPendientes") {
      // Remitos de compra pendientes de procesar
      const url = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=787&schemaId=1491&smartieId=2698";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ page: 1, pageSize: 200 })
      });
      if (!resp.ok) throw new Error(`YiQi GetList Altas Pendientes retornó HTTP ${resp.status}`);
      const data = await resp.json();
      return res.json(data);

    } else if (action === "procesarAltas") {
      const { ids, transitionId, form } = req.body;
      if (!ids || !Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: "Falta el parametro ids (array no vacío)" });
      }

      const transitionUrl = "https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition";
      const payload = {
        schemaId: 1491,
        ids: ids.map(String),
        transitionId: transitionId ? Number(transitionId) : 119014,
        form: form !== undefined ? String(form) : ""
      };
      console.log(`[CC] Procesando remitos de compra en lote: ${ids.join(", ")} con transition ${payload.transitionId} y form: ${payload.form}...`);
      const resp = await fetch(transitionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(payload)
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`Error al procesar remitos de compra: ${errText}`);
      }
      return res.json({ success: true });

    } else if (action === "getJaulasPendientes") {
      // Jaulas pendientes de control
      const url = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=787&schemaId=1491&smartieId=2764";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({ page: 1, pageSize: 200 })
      });
      if (!resp.ok) throw new Error(`YiQi GetList Jaulas Pendientes retornó HTTP ${resp.status}`);
      const data = await resp.json();
      return res.json(data);

    } else if (action === "getJaulaItems") {
      const { instanceId } = req.body;
      if (!instanceId) {
        return res.status(400).json({ error: "Falta el parametro instanceId" });
      }

      const url = `https://me.yiqi.com.ar/api/childrenApi/GetChildList?entityId=787&schemaId=1491&childId=209&instanceId=${instanceId}&take=100&skip=0&page=1&pageSize=100&search=`;
      const resp = await fetch(url, {
        method: "GET",
        headers: {
          "Authorization": "Bearer " + token
        }
      });
      if (!resp.ok) throw new Error(`YiQi GetChildList retornó HTTP ${resp.status}`);
      const data = await resp.json();
      return res.json(data);

    } else if (action === "executeBulkTransition") {
      const { ids, transitionId, form, parentOrderId } = req.body;
      if (!ids || !Array.isArray(ids) || !transitionId) {
        return res.status(400).json({ error: "Faltan parametros (ids, transitionId)" });
      }

      // Obtener cookies si es una anulación para comprobar la contingencia de facturas cobradas
      const isAnnulment = [118945, 119140, 118947].includes(Number(transitionId));
      if (isAnnulment) {
        try {
          const cookies = await getYiQiCookies();
          for (const orderId of ids) {
            const orderUrl = `https://me.yiqi.com.ar/api/public/PEDIDO/${orderId}?schemaId=1491`;
            const orderResp = await fetch(orderUrl, { headers: { "Cookie": cookies } });
            if (orderResp.ok) {
              const orderData = await orderResp.json();
              const orderDetail = orderData.data || orderData;
              if (orderDetail && orderDetail.FACTURAS) {
                // Filtrar facturas vigentes cobradas
                const paidInvoices = orderDetail.FACTURAS.filter(f => {
                  const est = (f.ESTA_NOMBRE || "").toLowerCase();
                  return est === "cobrada";
                });
                
                for (const f of paidInvoices) {
                  console.log(`[Contingencia Anulación] Factura ${f.id} está COBRADA. Creando Nota de Crédito de compensación...`);
                  // Crear Nota de Crédito imputada a la factura
                  const ncBody = {
                    schemaId: 1491,
                    data: {
                      CLIE_ID_CLIE: orderDetail.CLIE_ID_CLIE || orderDetail.CLIE_CODIGO,
                      CLIE_CODIGO: orderDetail.CLIE_ID_CLIE || orderDetail.CLIE_CODIGO,
                      TIFA_ID_TIFA: f.TIFA_ID_TIFA || 1,
                      PUVE_ID_PUVE: f.PUVE_ID_PUVE || 1,
                      NOCR_FECHA_EMISION: new Date().toISOString().split("T")[0],
                      NOCR_TOTAL: f.FACT_TOTAL || 0,
                      NOCR_OBSERVACION: `N.C. automática por anulación de Pedido N° ${orderDetail.PEDI_NRO_PEDIDO || orderDetail.PEDI_NUMERO || orderId}`,
                      FacturasCanceladas: [
                        {
                          CLIE_ID_CLIE: orderDetail.CLIE_ID_CLIE || orderDetail.CLIE_CODIGO,
                          FACT_ID_FACT: f.id,
                          CANC_IMPORTE_A_CANCELAR: f.FACT_TOTAL || 0
                        }
                      ]
                    }
                  };
                  const ncUrl = "https://me.yiqi.com.ar/api/public/NOTA_CREDITO?schemaId=1491";
                  const ncCreateResp = await fetch(ncUrl, {
                    method: "POST",
                    headers: { "Cookie": cookies, "Content-Type": "application/json" },
                    body: JSON.stringify(ncBody)
                  });
                  if (!ncCreateResp.ok) {
                    console.error(`[Contingencia Anulación] Error al crear NC para factura ${f.id}:`, await ncCreateResp.text());
                  } else {
                    console.log(`[Contingencia Anulación] Nota de Crédito creada y compensada para factura ${f.id}.`);
                  }
                }
              }
            }
          }
        } catch (err) {
          console.error("Error al ejecutar la verificación de contingencia de facturas cobradas:", err);
        }
      }

      const transitionUrl = "https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition";
      const payload = {
        schemaId: 1491,
        ids: ids.map(String),
        transitionId: Number(transitionId),
        form: form || ""
      };
      
      console.log(`[Bulk] Ejecutando transicion ${transitionId} para IDs: ${ids.join(", ")}`);
      const tResp = await fetch(transitionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify(payload)
      });

      if (!tResp.ok) {
        const errText = await tResp.text();
        throw new Error(`Error en transición bulk ${transitionId}: ${errText}`);
      }

      const tData = await tResp.json();
      console.log(`[Bulk] Respuesta de ExecuteTransition:`, JSON.stringify(tData));

      // Verificar si la respuesta de YiQi indica un error a pesar de que el estado HTTP sea 200
      if (tData && (tData.success === false || tData.error || tData.errors || tData.message)) {
        const errMsg = tData.error || tData.message || (tData.errors && Array.isArray(tData.errors) ? tData.errors.join(", ") : String(tData.errors)) || "Error al realizar la transición en YiQi ERP";
        return res.status(400).json({ error: errMsg });
      }

      if (parentOrderId) {
        await refreshPedidoInYiQi(parentOrderId, token);
      }

      return res.json({ success: true });

    } else if (action === "deletePedidoItem") {
      const { itemId, parentOrderId } = req.body;
      if (!itemId) {
        return res.status(400).json({ error: "Falta el parametro itemId" });
      }

      console.log(`[Item] Eliminando item ID ${itemId} de PEDIDO_DETALLE...`);
      const deleteUrl = `https://api.yiqi.com.ar/api/instancesApi/Delete?schemaId=1491&entityId=829&ids=${itemId}`;
      const dResp = await fetch(deleteUrl, {
        method: "GET",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        }
      });

      if (!dResp.ok) {
        const errText = await dResp.text();
        throw new Error(`Error al eliminar artículo: HTTP ${dResp.status} - ${errText}`);
      }

      if (parentOrderId) {
        await refreshPedidoInYiQi(parentOrderId, token);
      }

      return res.json({ success: true });

    } else if (action === "gestionarProduccionOP") {
      const { subAction, pedidoId, mateId, qty } = req.body;
      if (subAction === "createOP") {
        if (!pedidoId || !mateId || !qty) {
          return res.status(400).json({ error: "Faltan parametros (pedidoId, mateId, qty)" });
        }

        console.log(`[OP] Creando OP para pedidoId ${pedidoId}, mateId ${mateId}, cant ${qty}...`);
        const schemaId = 1491;
        const createUrl = `https://api.yiqi.com.ar/api/public/ORDEN_DE_PRODUCCION?schemaId=${schemaId}`;
        const startIso = new Date().toISOString();
        const endIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

        const createPayload = {
          schemaId,
          data: {
            ORDP_RESPONSABLE: 20,
            ORDP_FACTOR_DE_MULTIPLICA: Number(qty),
            ORDP_FECHA_DE_INICIO: startIso,
            ORDP_FECHA_DE_EMISION: startIso,
            ORDP_FECHA_DE_ENTREGA_EST: endIso,
            CEDI_ID_UBIO: 155,
            CEDI_ID_UBID: 155,
            ORDP_CALCULAR_ARTICULOS: "S",
            PEDI_ID_PEDI: Number(pedidoId),
            ORDP_PEDIDO: "S",
            Detalle: [
              {
                MATE_ID_MATE: Number(mateId),
                DEOP_CANTIDAD: Number(qty)
              }
            ]
          }
        };

        const createResp = await fetch(createUrl, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(createPayload)
        });

        if (!createResp.ok) {
          const errText = await createResp.text();
          throw new Error(`Error creando OP: HTTP ${createResp.status} - ${errText}`);
        }

        const createData = await createResp.json();
        const newOpId = createData.newId || createData.id;

        if (!newOpId) {
          throw new Error("No se devolvió ID para la nueva OP.");
        }

        console.log(`[OP] OP creada con ID: ${newOpId}. Ejecutando transicion calcular (118324)...`);
        const transUrl = `https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition`;
        await fetch(transUrl, {
          method: "POST",
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            schemaId,
            ids: [String(newOpId)],
            transitionId: 118324,
            form: ""
          })
        });

        console.log(`[OP] Calculo BOM enviado. Forzando propagacion...`);
        const getInstUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=${schemaId}&entityId=767&id=${newOpId}`;
        await fetch(getInstUrl, { headers: { "Authorization": "Bearer " + token } });

        if (pedidoId) {
          await refreshPedidoInYiQi(pedidoId, token);
        }

        return res.json({ success: true, opId: newOpId });
      } else {
        return res.status(400).json({ error: "Subaccion no soportada" });
      }

    } else if (action === "createNotaCreditoDebito") {
      const { clientCode, type, amount, reason, invoiceId, invoiceNumber } = req.body;
      if (!clientCode || !type || !amount) {
        return res.status(400).json({ error: "Faltan parametros (clientCode, type, amount)" });
      }

      const cookies = await getYiQiCookies();
      let tifaId = 1; // Factura A
      let puveId = 1; // Pto venta 1
      let cofaId = 1; // Default fallback
      let cofaCodigo = "AJUSTE";
      let cofaConcepto = "Ajuste General";

      // 1. Obtener detalles de la factura original para copiar TIFA_ID_TIFA, PUVE_ID_PUVE y conceptos
      if (invoiceId) {
        try {
          const detailUrl = `https://me.yiqi.com.ar/api/public/FACTURA/${invoiceId}?schemaId=1491`;
          const dResp = await fetch(detailUrl, { headers: { "Cookie": cookies } });
          if (dResp.ok) {
            const dData = await dResp.json();
            const invObj = dData.data || dData;
            if (invObj) {
              tifaId = invObj.TIFA_ID_TIFA || 1;
              puveId = invObj.PUVE_ID_PUVE || 1;
              const details = invObj.DETALLE || [];
              if (details.length > 0) {
                cofaId = details[0].COFA_ID_COFA || cofaId;
                cofaCodigo = details[0].FADE_CODIGO || cofaCodigo;
                cofaConcepto = details[0].FADE_CONCEPTO_COMPLETO || cofaConcepto;
              }
            }
          }
        } catch (invErr) {
          console.error("Error consultando factura origen para NC/ND:", invErr);
        }
      }

      const entityName = type === "NC" ? "NOTA_CREDITO" : "NOTA_DEBITO";
      const createUrl = `https://me.yiqi.com.ar/api/public/${entityName}?schemaId=1491`;
      
      const payloadData = {
        CLIE_ID_CLIE: Number(clientCode),
        CLIE_CODIGO: Number(clientCode),
        TIFA_ID_TIFA: Number(tifaId),
        PUVE_ID_PUVE: Number(puveId),
        AUDI_FECHA_ALTA: new Date().toISOString()
      };

      const detailRow = {
        COFA_ID_COFA: Number(cofaId),
        DENV_CODIGO: cofaCodigo,
        DENV_CONCEPTO_COMPLETO: reason || `Ajuste por ${invoiceNumber || "factura"}`,
        DENV_CANTIDAD: 1,
        DENV_PRECIO_UNITARIO: Number(amount),
        DENV_NETO: Number(amount),
        DENV_SUBTOTAL: Number(amount)
      };

      payloadData.DETALLE = [detailRow];

      if (type === "NC") {
        payloadData.NOCR_FECHA_EMISION = new Date().toISOString().split("T")[0];
        payloadData.NOCR_NETO = Number(amount);
        payloadData.NOCR_TOTAL = Number(amount);
        payloadData.NOCR_TOTAL_GRAVADO = Number(amount);
        payloadData.NOCR_OBSERVACION = reason || `Ajuste de Crédito por ${invoiceNumber || "factura"}`;
        
        // Si hay una factura relacionada, la imputamos de forma inmediata
        if (invoiceId) {
          payloadData.FacturasCanceladas = [
            {
              CLIE_ID_CLIE: Number(clientCode),
              FACT_ID_FACT: Number(invoiceId),
              CANC_IMPORTE_A_CANCELAR: Number(amount)
            }
          ];
        }
      } else {
        payloadData.NODE_FECHA_EMISION = new Date().toISOString().split("T")[0];
        payloadData.NODE_NETO = Number(amount);
        payloadData.NODE_TOTAL = Number(amount);
        payloadData.NODE_TOTAL_GRAVADO = Number(amount);
        payloadData.NODE_OBSERVACION = reason || `Ajuste de Débito por ${invoiceNumber || "factura"}`;
      }

      console.log(`[NCND] Creando ${entityName} para cliente ${clientCode} por total ${amount}...`);
      const createResp = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          schemaId: 1491,
          data: payloadData
        })
      });

      if (!createResp.ok) {
        const errText = await createResp.text();
        throw new Error(`Error de YiQi al registrar ${entityName}: ${errText}`);
      }

      const createRes = await createResp.json();
      const newId = createRes.newId || createRes.id || (createRes.data && createRes.data.id);
      return res.json({ success: true, newId });

    } else if (action === "saveChildInstances") {
      const { instanceId, childId, items, append } = req.body;
      if (!instanceId || !childId || !items) {
        return res.status(400).json({ error: "Faltan parametros (instanceId, childId, items)" });
      }
      const url = `https://api.yiqi.com.ar/api/childrenApi/SaveChildInstances?instanceId=${instanceId}&schemaId=1491`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
          entityId: "787",
          schemaId: 1491,
          childId: Number(childId),
          instanceId: String(instanceId),
          childInstances: items.map(i => JSON.stringify(i)),
          append: append !== undefined ? append : true
        })
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`YiQi SaveChildInstances retornó HTTP ${resp.status}: ${errText}`);
      }
      const data = await resp.json();
      return res.json(data);

    } else if (action === "addComment") {
      const { entityId, instanceId, comment } = req.body;
      if (!entityId || !instanceId || !comment) {
        return res.status(400).json({ error: "Faltan parametros (entityId, instanceId, comment)" });
      }
      const url = "https://api.yiqi.com.ar/api/instancesApi/AddComment";
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
          entityId: String(entityId),
          schemaId: "1491",
          instanceId: String(instanceId),
          comment: String(comment)
        })
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`YiQi AddComment retornó HTTP ${resp.status}: ${errText}`);
      }
      return res.json({ success: true });

    } else if (action === "crearRemitoCompra") {
      const { obs, proveedorId, depoId } = req.body;
      const url = "https://api.yiqi.com.ar/api/instancesApi/Save";
      const formStr = `4239=1883&4240=${proveedorId || 20027}&4243=${depoId || 198}&4241=${encodeURIComponent(obs)}&11086=off&8019=&6383=`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + token
        },
        body: JSON.stringify({
          schemaId: 1491,
          entityId: "787",
          form: formStr,
          uploads: "",
          parentId: null,
          childId: null
        })
      });
      if (!resp.ok) {
        const errText = await resp.text();
        throw new Error(`YiQi Save Remito de Compra retornó HTTP ${resp.status}: ${errText}`);
      }
      const data = await resp.json();
      const newId = data.newId || data.id || (data.ok && data.data ? data.data.id : null);
      return res.json({ success: true, newId });

    } else {
      return res.status(400).json({ error: "Acción no reconocida" });
    }

  } catch (error) {
    console.error(`Error en controlCalidadApi (action: ${action}):`, error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para obtener todos los datos de CRM: seguimientos,
 * plantillas de planes, asignaciones de clientes y configuraciones de WhatsApp.
 */
exports.obtenerDatosCrm = onRequest({ cors: true }, async (req, res) => {
  try {
    const db = admin.firestore();
    
    // 1. Obtener todos los seguimientos
    const followupsSnap = await db.collection("crm_followups").get();
    const followups = [];
    followupsSnap.forEach(doc => {
      const data = doc.data();
      followups.push({
        id: doc.id,
        ...data
      });
    });
    
    // 2. Obtener plantillas de planes
    const templatesSnap = await db.collection("crm_plan_templates").get();
    const templates = [];
    templatesSnap.forEach(doc => {
      const data = doc.data();
      templates.push({
        id: doc.id,
        ...data
      });
    });
    
    // 3. Obtener asignaciones de clientes
    const clientPlansSnap = await db.collection("crm_client_plans").get();
    const clientPlans = {};
    clientPlansSnap.forEach(doc => {
      clientPlans[doc.id] = doc.data().planTemplateId || "";
    });

    // 4. Obtener configuraciones de WhatsApp
    const waConfigsSnap = await db.collection("crm_whatsapp_configs").get();
    const whatsappConfigs = {};
    waConfigsSnap.forEach(doc => {
      whatsappConfigs[doc.id.toUpperCase()] = doc.data();
    });
    
    return res.json({
      success: true,
      data: {
        followups,
        templates,
        clientPlans,
        whatsappConfigs
      }
    });
  } catch (error) {
    console.error("Error en obtenerDatosCrm:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para guardar o modificar de forma prolija e individual
 * seguimientos, asignaciones de clientes, plantillas o configuración de WhatsApp en Firestore.
 */
exports.guardarDatosCrm = onRequest({ cors: true }, async (req, res) => {
  const { action, data } = req.body;
  if (!action || !data) {
    return res.status(400).json({ error: "Faltan parámetros action o data" });
  }
  
  try {
    const db = admin.firestore();
    
    if (action === "saveFollowup") {
      const { id } = data;
      if (!id) return res.status(400).json({ error: "Falta id de followup" });
      await db.collection("crm_followups").doc(String(id)).set(data, { merge: true });
      return res.json({ success: true, message: `Followup #${id} guardado correctamente` });
      
    } else if (action === "deleteFollowup") {
      const { id } = data;
      if (!id) return res.status(400).json({ error: "Falta id de followup" });
      await db.collection("crm_followups").doc(String(id)).delete();
      return res.json({ success: true, message: `Followup #${id} eliminado correctamente` });
      
    } else if (action === "saveClientPlan") {
      const { clientId, planTemplateId } = data;
      if (!clientId || !planTemplateId) {
        return res.status(400).json({ error: "Falta clientId o planTemplateId" });
      }
      await db.collection("crm_client_plans").doc(String(clientId)).set({ planTemplateId }, { merge: true });
      return res.json({ success: true, message: `Plan del cliente #${clientId} guardado` });
      
    } else if (action === "saveTemplate") {
      const { id } = data;
      if (!id) return res.status(400).json({ error: "Falta id de template" });
      await db.collection("crm_plan_templates").doc(String(id)).set(data, { merge: true });
      return res.json({ success: true, message: `Template #${id} guardado` });
      
    } else if (action === "deleteTemplate") {
      const { id } = data;
      if (!id) return res.status(400).json({ error: "Falta id de template" });
      await db.collection("crm_plan_templates").doc(String(id)).delete();
      return res.json({ success: true, message: `Template #${id} eliminado` });
      
    } else if (action === "saveWhatsappConfig") {
      const { seller, name, apiUrl, apiToken } = data;
      if (!seller) return res.status(400).json({ error: "Falta seller de config" });
      await db.collection("crm_whatsapp_configs").doc(String(seller).toUpperCase()).set({
        seller,
        name,
        apiUrl,
        apiToken
      }, { merge: true });
      return res.json({ success: true, message: `Configuración de WhatsApp para ${seller} guardada` });
      
    } else if (action === "saveClientLink") {
      const { phone, clientId, clientName, assignedSeller } = data;
      if (!phone) return res.status(400).json({ error: "Falta phone" });
      await db.collection("crm_chats").doc(String(phone)).set({
        clientId,
        clientName,
        assignedSeller: assignedSeller || "No asignado"
      }, { merge: true });
      return res.json({ success: true, message: `Chat ${phone} vinculado con cliente ${clientName}` });
      
    } else {
      return res.status(400).json({ error: `Acción '${action}' no reconocida` });
    }
  } catch (error) {
    console.error(`Error en guardarDatosCrm (action: ${action}):`, error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que obtiene los productos más comprados de un cliente desde la Smartie de Ventas (Smartie 2795).
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerProductosFavoritos?clientCode=7739
 */
exports.obtenerProductosFavoritos = onRequest({ cors: true }, async (req, res) => {
  const clientCode = req.query.clientCode;
  if (!clientCode) {
    return res.status(400).json({ error: "Falta el parametro clientCode" });
  }

  try {
    const cookies = await getYiQiCookies();
    
    // 1. Aplicar filtro por CLIE_IDENTIFICADOR en la Smartie 2795
    const filterUrl = "https://me.yiqi.com.ar/api/smartiesApi/UpdateFilters";
    const filterBody = {
      smartieId: "2795",
      schemaId: 1491,
      selectedColumns: [
        {
          field: "CLIE_IDENTIFICADOR",
          operationType: 0,
          sortType: null,
          filterOperator: 1, // Equals
          comparation: String(clientCode),
          pivotMode: 0
        }
      ]
    };

    const filterResp = await fetch(filterUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(filterBody)
    });

    if (!filterResp.ok) {
      const errText = await filterResp.text();
      console.error("Error aplicando filtro en Smartie 2795:", errText);
      return res.status(filterResp.status).json({ error: "Error al aplicar filtro de Smartie", details: errText });
    }

    // 2. Traer registros de la Smartie 2795 filtrados con paginación
    const queryUrl = "https://me.yiqi.com.ar/api/instancesApi/GetList?entityId=959&schemaId=1491&smartieId=2795";
    
    let allRows = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore && page <= 25) {
      console.log(`[Favoritos] Buscando pagina ${page} para cliente ${clientCode}...`);
      const queryResp = await fetch(queryUrl, {
        method: "POST",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ page: page, pageSize: 100 })
      });

      if (!queryResp.ok) {
        const errText = await queryResp.text();
        console.error(`Error consultando Smartie 2795 en página ${page}:`, errText);
        break;
      }

      const qData = await queryResp.json();
      let rows = qData.data || qData.rows || [];
      if (rows && rows.rows) {
        rows = rows.rows;
      }

      if (!Array.isArray(rows) || rows.length === 0) {
        hasMore = false;
      } else {
        allRows = allRows.concat(rows);
        // Si nos trae menos de 50 registros (límite real de YiQi), ya es la última página
        if (rows.length < 50) {
          hasMore = false;
        } else {
          page++;
        }
      }
    }
    
    console.log(`[Favoritos] Total registros consolidados: ${allRows.length}`);
    return res.json({ success: true, data: allRows });
  } catch (error) {
    console.error("Error en obtenerProductosFavoritos:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que obtiene las métricas comerciales de pedidos (totales y cancelados) de forma muy rápida.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerMetricasPedidos?clientCode=7550
 */
exports.obtenerMetricasPedidos = onRequest({ cors: true }, async (req, res) => {
  const clientCode = req.query.clientCode;
  if (!clientCode) {
    return res.status(400).json({ error: "Falta el parametro clientCode" });
  }

  try {
    const cookies = await getYiQiCookies();
    
    // 1. Obtener detalles del cliente para conseguir su CUIT y Razón Social
    const clientQueryUrl = `https://me.yiqi.com.ar/api/public/CLIENTE/${clientCode}?schemaId=1491`;
    const clientResponse = await fetch(clientQueryUrl, {
      method: "GET",
      headers: { "Cookie": cookies }
    });

    if (!clientResponse.ok) {
      const errText = await clientResponse.text();
      return res.status(clientResponse.status).json({ error: "Error al consultar detalles del cliente", details: errText });
    }

    const clientData = await clientResponse.json();
    const clientObj = clientData.data || clientData.rows || clientData;
    if (!clientObj) {
      return res.status(404).json({ error: "Cliente no encontrado" });
    }

    const cuit = clientObj.CLIE_CUIT;
    const razonSocial = clientObj.CLIE_RAZON_SOCIAL;
    const nombre = clientObj.CLIE_NOMBRE;

    if (!cuit && !razonSocial && !nombre) {
      return res.json({ success: true, metricas: { total: 0, anulados: 0, ratio: 0 } });
    }

    // 2. Query de pedidos
    const queryUrl = "https://me.yiqi.com.ar/api/public/PEDIDO/query?schemaId=1491";
    
    const filters = [];
    if (razonSocial) {
      filters.push({
        columnName: "CLIE_RAZON_SOCIAL",
        operator: "=",
        value: String(razonSocial)
      });
    } else if (cuit) {
      filters.push({
        columnName: "PEDI_CUIT",
        operator: "=",
        value: String(cuit)
      });
    } else if (nombre) {
      filters.push({
        columnName: "CLIE_NOMBRE",
        operator: "=",
        value: String(nombre)
      });
    }

    const queryBody = {
      page: 1,
      pageSize: 100, // Traer hasta 100 pedidos históricos para una métrica robusta
      columns: [
        { field: "id" }
      ],
      filters: filters
    };

    const qResp = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Cookie": cookies,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(queryBody)
    });

    if (!qResp.ok) {
      const errText = await qResp.text();
      return res.status(qResp.status).json({ error: "Error al consultar pedidos", details: errText });
    }

    const qData = await qResp.json();
    const rows = qData.data || qData.rows || [];
    
    const total = rows.length;
    const anulados = rows.filter(r => {
      const cod = Number(r.ESTA_CODIGO || 0);
      return cod === 442 || cod === 443 || cod === 444; // 442 is Anulado
    }).length;
    const ratio = total > 0 ? Math.round((anulados / total) * 100) : 0;

    return res.json({
      success: true,
      clientCode,
      metricas: {
        total,
        anulados: anulados,
        ratio: ratio
      }
    });

  } catch (error) {
    console.error("Error en obtenerMetricasPedidos:", error);
    return res.status(500).json({ error: error.message });
  }

});

/**
 * Cloud Function que consulta de forma ultra-ligera el estado de uno o varios pedidos.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerEstadoPedido?orderIds=1234,5678
 */
exports.obtenerEstadoPedido = onRequest({ cors: true }, async (req, res) => {
  const { orderIds } = req.query;
  if (!orderIds) {
    return res.status(400).json({ error: "Falta el parametro orderIds" });
  }

  const ids = orderIds.split(",");

  try {
    const cookies = await getYiQiCookies();
    
    // 1. Obtener detalles de cada pedido
    const results = await Promise.all(ids.map(async (id) => {
      try {
        const detailUrl = `https://me.yiqi.com.ar/api/public/PEDIDO/${id}?schemaId=1491`;
        const dResp = await fetch(detailUrl, {
          headers: { "Cookie": cookies }
        });
        if (dResp.ok) {
          const dData = await dResp.json();
          const orderDetailObj = dData.data || dData;
          const estado = orderDetailObj.ESTA_NOMBRE || "";
          
          const margins = orderDetailObj.MÁRGENES || [];
          const items = margins.map(item => ({
            producto: item.PRODUCTO || "",
            sku: item.SKU || "",
            cantidadPedida: item.CANTIDAD ? parseFloat(item.CANTIDAD) : 0,
            cantidadAEntregar: item.CANT_A_ENTREGAR !== undefined && item.CANT_A_ENTREGAR !== null ? parseFloat(item.CANT_A_ENTREGAR) : 0,
            estadoItem: item.ESTADO_DETALLE || "",
            stockDepo: item.STOCK_DEPO !== undefined && item.STOCK_DEPO !== null ? parseFloat(item.STOCK_DEPO) : 0,
            stockDepor: item.STOCK_DEPOR !== undefined && item.STOCK_DEPOR !== null ? parseFloat(item.STOCK_DEPOR) : 0,
            disponible: item.DISPONIBLE || "",
            reservadoCant: item.RESERVADO_CANT !== undefined && item.RESERVADO_CANT !== null ? parseFloat(item.RESERVADO_CANT) : 0,
            stockFaltante: item.STOCK_FALTANTE !== undefined && item.STOCK_FALTANTE !== null ? parseFloat(item.STOCK_FALTANTE) : 0
          }));

          const facturas = (orderDetailObj.FACTURAS || [])
            .filter(f => {
              const est = (f.ESTA_NOMBRE || "").toLowerCase();
              const nro = f.FACT_NUMERO;
              const isProjected = est === "proyectada" || est === "borrador" || !nro || nro === 0 || String(nro) === "0";
              return !isProjected;
            })
            .map(f => {
              let tipo = "X";
              if (f.TIFA_ID_TIFA === 1) tipo = "Factura A";
              else if (f.TIFA_ID_TIFA === 2) tipo = "Factura B";
              else if (f.TIFA_ID_TIFA === 3) tipo = "Factura C";
              const ptoVta = f.FACT_PUVE_NOMBRE || "0";
              const nro = f.FACT_NUMERO || "0";
              return {
                id: f.id,
                numero: `${tipo} ${ptoVta}-${nro}`,
                tifaId: f.TIFA_ID_TIFA || 1,
                puveId: f.PUVE_ID_PUVE || 1,
                total: f.FACT_TOTAL || 0,
                estado: f.ESTA_NOMBRE || ""
              };
            });

          return {
            id,
            numero: orderDetailObj.PEDI_NUMERO || "",
            nroPedido: orderDetailObj.PEDI_NRO_PEDIDO || "",
            fecha: orderDetailObj.PEDI_FECHA || null,
            porcentajeEntrega: orderDetailObj.PEDI_PORCENTAJE_DE_ENTREG !== undefined && orderDetailObj.PEDI_PORCENTAJE_DE_ENTREG !== null ? parseFloat(orderDetailObj.PEDI_PORCENTAJE_DE_ENTREG) : 0,
            total: orderDetailObj.PEDI_TOTAL !== undefined && orderDetailObj.PEDI_TOTAL !== null ? parseFloat(orderDetailObj.PEDI_TOTAL) : 0,
            estado: estado,
            facturas: facturas,
            items: items,
            success: true
          };
        }
      } catch (err) {
        console.error(`Error al consultar pedido ${id}:`, err);
      }
      return { id, success: false };
    }));

    const activeOrders = results.filter(r => r.success);

    // 2. Query de stock para los SKUs de estos pedidos
    const uniqueSkus = [];
    activeOrders.forEach(o => {
      if (o && o.items) {
        o.items.forEach(item => {
          if (item.sku && !uniqueSkus.includes(item.sku)) {
            uniqueSkus.push(item.sku);
          }
        });
      }
    });

    const stockMap = {};
    if (uniqueSkus.length > 0) {
      await Promise.all(uniqueSkus.map(async (sku) => {
        try {
          const queryUrl = "https://me.yiqi.com.ar/api/public/STOCK/query?schemaId=1491";
          const body = {
            page: 1,
            pageSize: 30,
            columns: [
              { field: "STOC_SKU" },
              { field: "STOC_CANTIDAD" },
              { field: "STOC_FACTIBILIDAD_PRODUCC" },
              { field: "STOC_UBICACION_NOMBRE" }
            ],
            filters: [
              { columnName: "STOC_SKU", operator: "=", value: sku }
            ]
          };

          const sResp = await fetch(queryUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Cookie": cookies
            },
            body: JSON.stringify(body)
          });

          if (sResp.ok) {
            const sData = await sResp.json();
            const rows = sData.data || sData.rows || [];

            let stockDepo = 0;
            let stockDepor = 0;
            let factibilidad = 0;

            rows.forEach(r => {
              const qty = r.STOC_CANTIDAD ? parseFloat(r.STOC_CANTIDAD) : 0;
              const fact = r.STOC_FACTIBILIDAD_PRODUCC ? parseFloat(r.STOC_FACTIBILIDAD_PRODUCC) : 0;
              const loc = (r.STOC_UBICACION_NOMBRE || "").trim().toUpperCase();

              if (loc === "DEPO") {
                stockDepo += qty;
                if (fact > factibilidad) factibilidad = fact;
              } else if (loc === "DEPOR") {
                stockDepor += qty;
              }
            });

            stockMap[sku] = { stockDepo, stockDepor, factibilidad };
          }
        } catch (err) {
          console.error(`Error al consultar stock para SKU ${sku}:`, err);
        }
      }));
    }

    // 3. Enriquecer
    activeOrders.forEach(o => {
      if (o && o.items) {
        o.items.forEach(item => {
          const stockInfo = stockMap[item.sku];
          if (stockInfo) {
            item.stockDepo = stockInfo.stockDepo + stockInfo.factibilidad;
            item.stockDepor = stockInfo.stockDepor;
            item.rawStockDepo = stockInfo.stockDepo;
            item.factibilidad = stockInfo.factibilidad;
          } else {
            item.stockDepo = 0;
            item.stockDepor = 0;
            item.rawStockDepo = 0;
            item.factibilidad = 0;
          }
        });
      }
    });

    return res.json({
      success: true,
      orders: results
    });
  } catch (error) {
    console.error("Error en obtenerEstadoPedido:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que obtiene las alertas activas (no leídas) de la colección alertas_compartidas.
 * Las ordena en memoria por fecha de creación descendente para evitar requerir índices compuestos.
 */
exports.obtenerAlertasCompartidas = onRequest({ cors: true }, async (req, res) => {
  try {
    const db = admin.firestore();
    const alertsSnap = await db.collection("alertas_compartidas")
      .where("leida", "==", false)
      .get();

    const alerts = [];
    alertsSnap.forEach(doc => {
      alerts.push({ id: doc.id, ...doc.data() });
    });

    // Ordenar en memoria (el más nuevo primero)
    alerts.sort((a, b) => {
      const aTime = a.creadoEn ? (a.creadoEn._seconds || a.creadoEn.seconds || 0) : 0;
      const bTime = b.creadoEn ? (b.creadoEn._seconds || b.creadoEn.seconds || 0) : 0;
      return bTime - aTime;
    });

    return res.json({ success: true, alerts });
  } catch (error) {
    console.error("Error en obtenerAlertasCompartidas:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que marca una alerta compartida como leída.
 */
exports.resolverAlertaCompartida = onRequest({ cors: true }, async (req, res) => {
  const { alertId } = req.body;
  if (!alertId) {
    return res.status(400).json({ error: "Falta el parámetro alertId" });
  }

  try {
    const db = admin.firestore();
    await db.collection("alertas_compartidas").doc(alertId).update({
      leida: true,
      resueltaEn: admin.firestore.FieldValue.serverTimestamp()
    });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error en resolverAlertaCompartida:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function Webhook para recibir mensajes entrantes de Z-API.
 */
exports.receiveWhatsAppWebhook = onRequest({ cors: true }, async (req, res) => {
  try {
    const body = req.body;
    console.log("Recibido webhook Z-API:", JSON.stringify(body));

    if (!body || !body.phone) {
      return res.json({ success: true, message: "No phone found, skipped" });
    }

    const phone = String(body.phone).replace("@c.us", "").trim();
    const fromMe = body.fromMe === true;
    
    let text = "";
    if (body.text && typeof body.text === "object" && body.text.message) {
      text = body.text.message;
    } else if (body.text && typeof body.text === "string") {
      text = body.text;
    } else if (body.waitingMessage && typeof body.waitingMessage === "string") {
      text = body.waitingMessage;
    } else if (body.image || body.audio || body.video || body.document) {
      text = `[Archivo/Multimedia]`;
    } else {
      return res.json({ success: true, message: "Unsupported message content, skipped" });
    }

    const senderName = body.senderName || body.chatName || (fromMe ? "Nosotros" : "Cliente");
    const timestamp = body.momment ? new Date(body.momment).toISOString() : new Date().toISOString();

    const db = admin.firestore();

    // 1. Guardar mensaje en subcolección messages
    const chatRef = db.collection("crm_chats").doc(phone);
    const messageRef = chatRef.collection("messages").doc();
    
    const messageData = {
      text: text,
      timestamp: timestamp,
      fromMe: fromMe,
      senderName: senderName
    };
    await messageRef.set(messageData);

    // 2. Resolver vendedor asignado y vincular cliente automáticamente
    let assignedSeller = null;
    let clientId = null;
    let clientName = null;

    const chatDoc = await chatRef.get();
    if (chatDoc.exists) {
      const chatData = chatDoc.data();
      assignedSeller = chatData.assignedSeller;
      clientId = chatData.clientId;
      clientName = chatData.clientName;
    }

    if (!assignedSeller || !clientId) {
      const followupsSnap = await db.collection("crm_followups")
        .where("status", "==", "ABIERTO")
        .get();
      
      const matchPhones = (phoneA, phoneB) => {
        const cleanA = String(phoneA || "").replace(/\D/g, "");
        const cleanB = String(phoneB || "").replace(/\D/g, "");
        if (!cleanA || !cleanB) return false;
        if (cleanA === cleanB) return true;
        const standardize = (p) => {
          let res = p;
          if (res.startsWith("549")) res = res.substring(3);
          else if (res.startsWith("54")) res = res.substring(2);
          if (res.startsWith("0")) res = res.substring(1);
          if (res.length === 12 && res.substring(2, 4) === "15") {
            res = res.substring(0, 2) + res.substring(4);
          } else if (res.length === 10 && res.startsWith("15")) {
            res = res.substring(2);
          }
          return res;
        };
        const stdA = standardize(cleanA);
        const stdB = standardize(cleanB);
        if (stdA === stdB) return true;
        if (stdA.includes(stdB) || stdB.includes(stdA)) return true;
        const lastA = stdA.slice(-8);
        const lastB = stdB.slice(-8);
        if (lastA.length >= 7 && lastA === lastB) return true;
        return false;
      };

      let matchedFollowup = null;
      followupsSnap.forEach(doc => {
        const fData = doc.data();
        if (matchPhones(fData.clientPhone, phone)) {
          matchedFollowup = fData;
        }
      });

      if (matchedFollowup) {
        if (!assignedSeller) assignedSeller = matchedFollowup.vendedor;
        if (!clientId) {
          clientId = matchedFollowup.clientId;
          clientName = matchedFollowup.clientName;
        }
      }
    }

    // 3. Actualizar chat principal
    const chatUpdate = {
      phone: phone,
      lastMessage: text,
      lastUpdated: timestamp,
      assignedSeller: assignedSeller || "No asignado"
    };

    if (clientId) {
      chatUpdate.clientId = clientId;
      chatUpdate.clientName = clientName;
    }

    if (!fromMe) {
      chatUpdate.unreadCount = admin.firestore.FieldValue.increment(1);
    }

    await chatRef.set(chatUpdate, { merge: true });

    return res.json({ success: true, message: "Mensaje procesado correctamente" });
  } catch (error) {
    console.error("Error en receiveWhatsAppWebhook:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para obtener conversaciones activas.
 */
exports.obtenerConversaciones = onRequest({ cors: true }, async (req, res) => {
  try {
    const db = admin.firestore();
    const chatsSnap = await db.collection("crm_chats")
      .orderBy("lastUpdated", "desc")
      .limit(100)
      .get();

    const chats = [];
    chatsSnap.forEach(doc => {
      chats.push({ id: doc.id, ...doc.data() });
    });

    return res.json({ success: true, chats });
  } catch (error) {
    console.error("Error en obtenerConversaciones:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para obtener mensajes de un chat específico.
 */
exports.obtenerMensajesChat = onRequest({ cors: true }, async (req, res) => {
  const { phone } = req.query;
  if (!phone) {
    return res.status(400).json({ error: "Falta el parámetro phone" });
  }

  try {
    const db = admin.firestore();
    const messagesSnap = await db.collection("crm_chats")
      .doc(phone)
      .collection("messages")
      .orderBy("timestamp", "asc")
      .limit(100)
      .get();

    const messages = [];
    messagesSnap.forEach(doc => {
      messages.push({ id: doc.id, ...doc.data() });
    });

    return res.json({ success: true, messages });
  } catch (error) {
    console.error("Error en obtenerMensajesChat:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para marcar un chat como leído.
 */
exports.marcarChatLeido = onRequest({ cors: true }, async (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Falta el parámetro phone" });
  }

  try {
    const db = admin.firestore();
    await db.collection("crm_chats").doc(phone).set({
      unreadCount: 0
    }, { merge: true });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error en marcarChatLeido:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para registrar un mensaje enviado desde el CRM.
 */
exports.guardarMensajeEnviado = onRequest({ cors: true }, async (req, res) => {
  const { phone, text, senderName, assignedSeller } = req.body;
  if (!phone || !text) {
    return res.status(400).json({ error: "Faltan parámetros obligatorios phone o text" });
  }

  try {
    const db = admin.firestore();
    const timestamp = new Date().toISOString();

    const chatRef = db.collection("crm_chats").doc(phone);
    await chatRef.collection("messages").add({
      text: text,
      timestamp: timestamp,
      fromMe: true,
      senderName: senderName || "Nosotros"
    });

    const chatData = {
      phone: phone,
      lastMessage: text,
      lastUpdated: timestamp
    };
    if (assignedSeller) {
      chatData.assignedSeller = assignedSeller;
    }
    await chatRef.set(chatData, { merge: true });

    return res.json({ success: true });
  } catch (error) {
    console.error("Error en guardarMensajeEnviado:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function que calcula las métricas de tiempo de respuesta de WhatsApp.
 * Analiza conversaciones con clientes registrados (que poseen clientId).
 */
exports.obtenerMetricasRespuesta = onRequest({ cors: true }, async (req, res) => {
  try {
    const db = admin.firestore();
    
    // Obtener todos los chats
    const chatsSnap = await db.collection("crm_chats").get();
    
    const responseEvents = [];
    const chatPromises = [];
    
    chatsSnap.forEach(doc => {
      const chatData = doc.data();
      // Filtrar chats vinculados a clientes
      if (chatData.clientId && chatData.phone) {
        chatPromises.push((async () => {
          const msgsSnap = await doc.ref.collection("messages")
            .orderBy("timestamp", "asc")
            .get();
          
          const msgs = [];
          msgsSnap.forEach(mDoc => msgs.push(mDoc.data()));
          
          let firstIncomingTime = null;
          let firstIncomingText = "";
          
          for (const msg of msgs) {
            const fromMe = msg.fromMe === true;
            const time = msg.timestamp ? new Date(msg.timestamp).getTime() : null;
            
            if (!time) continue;
            
            if (!fromMe) {
              // Es un mensaje del cliente
              if (firstIncomingTime === null) {
                firstIncomingTime = time;
                firstIncomingText = msg.text || "";
              }
            } else {
              // Es una respuesta nuestra
              if (firstIncomingTime !== null) {
                const diffMinutes = Math.round((time - firstIncomingTime) / 60000);
                responseEvents.push({
                  phone: chatData.phone,
                  clientName: chatData.clientName || chatData.phone,
                  clientId: chatData.clientId,
                  incomingTime: new Date(firstIncomingTime).toISOString(),
                  responseTime: new Date(time).toISOString(),
                  delayMinutes: diffMinutes,
                  incomingText: firstIncomingText,
                  replyText: msg.text || ""
                });
                // Resetear estado para el siguiente bloque
                firstIncomingTime = null;
                firstIncomingText = "";
              }
            }
          }
        })());
      }
    });
    
    await Promise.all(chatPromises);
    
    // Calcular agregados
    let totalDelay = 0;
    let maxDelay = 0;
    responseEvents.forEach(e => {
      totalDelay += e.delayMinutes;
      if (e.delayMinutes > maxDelay) {
        maxDelay = e.delayMinutes;
      }
    });
    
    const averageDelay = responseEvents.length > 0 ? Math.round(totalDelay / responseEvents.length) : 0;
    
    // Ordenar los eventos de respuesta por fecha más reciente primero
    responseEvents.sort((a, b) => b.responseTime.localeCompare(a.responseTime));
    
    return res.json({
      success: true,
      metrics: {
        totalInteractions: responseEvents.length,
        averageDelayMinutes: averageDelay,
        maxDelayMinutes: maxDelay
      },
      events: responseEvents
    });
  } catch (error) {
    console.error("Error en obtenerMetricasRespuesta:", error);
    return res.status(500).json({ error: error.message });
  }
});

function mapProvinceToId(provName) {
  if (!provName) return 2; // Buenos Aires default
  const p = String(provName).toLowerCase();
  if (p.includes("caba") || p.includes("capital federal") || p.includes("capital") || p.includes("ciudad autonoma") || p.includes("ciudad autónoma") || p.includes("ciudad de buenos aires") || p.includes("autonoma de buenos aires")) {
    return 1;
  }
  if (p.includes("buenos aires") || p.includes("b.a.") || p.includes("bs.as.") || p.includes("bs as")) {
    return 2;
  }
  if (p.includes("catamarca")) return 3;
  if (p.includes("cordoba") || p.includes("crdoba") || p.includes("córdoba")) return 4;
  if (p.includes("corrientes")) return 5;
  if (p.includes("chaco")) return 6;
  if (p.includes("chubut")) return 7;
  if (p.includes("entre rios") || p.includes("entre ríos")) return 8;
  if (p.includes("formosa")) return 9;
  if (p.includes("jujuy")) return 10;
  if (p.includes("pampa")) return 11;
  if (p.includes("rioja") || p.includes("la rioja")) return 12;
  if (p.includes("mendoza")) return 13;
  if (p.includes("misiones")) return 14;
  if (p.includes("neuquen") || p.includes("neuquén")) return 15;
  if (p.includes("rio negro") || p.includes("río negro")) return 16;
  if (p.includes("salta")) return 17;
  if (p.includes("san juan")) return 18;
  if (p.includes("san luis")) return 19;
  if (p.includes("santa cruz")) return 20;
  if (p.includes("santa fe") || p.includes("santa fé")) return 21;
  if (p.includes("santiago del estero")) return 22;
  if (p.includes("tierra del fuego")) return 23;
  if (p.includes("tucuman") || p.includes("tucumán")) return 24;
  return 2; // Default fallback to Buenos Aires
}

function parseAddressString(fullAddress) {
  if (!fullAddress) {
    return { address: "", localidad: "", provincia: "", zip: "" };
  }
  fullAddress = fullAddress.replace(/\s+/g, " ");
  
  const parts = fullAddress.split(",").map(p => p.trim());
  let address = "";
  let localidad = "";
  let provincia = "";
  let zip = "";
  
  if (parts.length >= 3) {
    address = parts[0];
    localidad = parts[1];
    provincia = parts[2];
  } else if (parts.length === 2) {
    address = parts[0];
    provincia = parts[1];
    localidad = parts[1];
  } else {
    address = fullAddress;
  }
  
  // Extraer Código Postal si viene como 4 números consecutivos en alguna parte
  const zipRegex = /\b(\d{4})\b/;
  for (let i = 0; i < parts.length; i++) {
    const m = parts[i].match(zipRegex);
    if (m) {
      zip = m[1];
      parts[i] = parts[i].replace(zipRegex, "").trim();
      if (i === 1) localidad = parts[i];
      if (i === 2) provincia = parts[i];
    }
  }
  
  return {
    address: address.trim(),
    localidad: localidad.trim(),
    provincia: provincia.trim(),
    zip: zip.trim()
  };
}

function formatDateToYiQi(dateStr) {
  if (!dateStr) return null;
  const clean = String(dateStr).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
    return clean + "T00:00:00";
  }
  if (/^\d{8}$/.test(clean)) {
    return `${clean.substring(0, 4)}-${clean.substring(4, 6)}-${clean.substring(6, 8)}T00:00:00`;
  }
  try {
    const d = new Date(clean);
    if (!isNaN(d.getTime())) {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}T00:00:00`;
    }
  } catch (e) {}
  return clean;
}

/**
 * Cloud Function que consulta el padrón de AFIP para recuperar los datos de un CUIT.
 * Soporta un set de datos mock locales, un generador inteligente y conexión real con Cuitalizer si se provee API key.
 */
exports.consultarCuitAfip = onRequest({ cors: true }, async (req, res) => {
  let cuit = req.query.cuit || req.body.cuit || null;
  if (!cuit) {
    return res.status(400).json({ success: false, error: "Falta el parametro cuit" });
  }
  
  // Limpiar CUIT
  cuit = String(cuit).replace(/\D/g, "");
  if (cuit.length !== 11) {
    return res.status(400).json({ success: false, error: "El CUIT debe tener exactamente 11 digitos numericos" });
  }

  console.log(`[AFIP] Consultando CUIT: ${cuit}`);

  // 1. Set de Datos Mock Predefinidos
  const keyFormated = cuit.substring(0, 2) + "-" + cuit.substring(2, 10) + "-" + cuit.substring(10);
  const AFIP_MOCK_DATA = {
    "30-76543210-9": {
      socialName: "Distribuidora Sol S.A.",
      fantasyName: "Sol Mayorista",
      ivaCondition: 1, // Exento
      address: "Av. Rivadavia 4500",
      localidad: "CABA",
      provincia: "CABA",
      provinciaId: 1,
      zip: "1406",
      email: "facturacion@distribuidorasol.com.ar",
      phone: "11-9876-5432",
      inicioActividades: "2015-06-01T00:00:00",
      iibb: "30765432109",
      subconceptoGanancias: 86
    },
    "30-12345678-9": {
      socialName: "LOZAMETAL S.R.L.",
      fantasyName: "Lozametal Inyección",
      ivaCondition: 2, // Responsable Inscripto
      address: "Formosa 3762",
      localidad: "La Tablada",
      provincia: "Buenos Aires",
      provinciaId: 2,
      zip: "1752",
      email: "administracion@lozametal.com.ar",
      phone: "11-4652-9011",
      inicioActividades: "2010-03-15T00:00:00",
      iibb: "30123456789",
      subconceptoGanancias: 86
    },
    "20-99999999-1": {
      socialName: "Juan Perez",
      fantasyName: "JP Revestimientos",
      ivaCondition: 3, // Monotributista
      address: "Calle de las Flores 123",
      localidad: "Rosario",
      provincia: "Santa Fe",
      provinciaId: 21,
      zip: "2000",
      email: "juanperez@gmail.com",
      phone: "341-432-1090",
      inicioActividades: "2018-11-01T00:00:00",
      iibb: "20999999991",
      subconceptoGanancias: 86
    },
    "30-50679817-9": {
      socialName: "YPF S.A.",
      fantasyName: "YPF S.A.",
      ivaCondition: 2, // Responsable Inscripto
      address: "Macacha Guemes 515",
      localidad: "CABA",
      provincia: "CABA",
      provinciaId: 1,
      zip: "1106",
      email: "facturas-ypf@ypf.com.ar",
      phone: "11-5441-2000",
      inicioActividades: "1993-06-02T00:00:00",
      iibb: "30506798179",
      subconceptoGanancias: 86
    }
  };

  if (AFIP_MOCK_DATA[keyFormated]) {
    console.log(`[AFIP] Match encontrado en Mock local para CUIT: ${cuit}`);
    return res.json({ success: true, simulated: true, data: AFIP_MOCK_DATA[keyFormated] });
  }

  // 1.5. Consulta Real a AFIP SDK (si existe token en variables de entorno o Firestore)
  let sdkToken = process.env.AFIP_SDK_ACCESS_TOKEN || process.env.AFIP_SDK_TOKEN || null;
  let cert = null;
  let key = null;
  let representedCuit = parseInt(process.env.AFIP_SDK_CUIT || "30717981312", 10);
  
  try {
    const configDoc = await admin.firestore().collection("configs").doc("afip_sdk").get();
    if (configDoc.exists) {
      const configData = configDoc.data();
      if (!sdkToken) {
        sdkToken = configData.access_token || configData.accessToken || null;
      }
      cert = configData.cert || null;
      key = configData.key || null;
      if (configData.cuit_representada || configData.cuit) {
        representedCuit = parseInt(configData.cuit_representada || configData.cuit, 10);
      }
    }
  } catch (e) {
    console.error("[AFIP] Error leyendo configuraciones de Firestore:", e);
  }

  if (sdkToken) {
    console.log(`[AFIP] Realizando consulta real a AFIP SDK para CUIT: ${cuit}...`);
    try {
      const Afip = require('@afipsdk/afip.js');
      const afipOptions = {
        CUIT: representedCuit,
        access_token: sdkToken,
        production: (cert && key) ? true : false
      };
      
      if (cert && key) {
        afipOptions.cert = cert;
        afipOptions.key = key;
      }
      
      const afip = new Afip(afipOptions);
      
      const details = await afip.RegisterInscriptionProof.getTaxpayerDetails(parseInt(cuit, 10));
      if (details) {
        console.log(`[AFIP] Match encontrado en AFIP SDK para CUIT: ${cuit}`);
        const persona = details.persona || details;
        const dg = persona.datosGenerales || persona;
        
        let socialName = "";
        if (dg.razonSocial) {
          socialName = dg.razonSocial;
        } else if (dg.nombre && dg.apellido) {
          socialName = `${dg.apellido} ${dg.nombre}`.trim();
        } else if (dg.apellido) {
          socialName = dg.apellido;
        } else if (dg.nombre) {
          socialName = dg.nombre;
        } else if (persona.razonSocial) {
          socialName = persona.razonSocial;
        }
        
        let address = "";
        let localidad = "";
        let provincia = "";
        let zip = "";
        
        const dom = dg.domicilioFiscal || (dg.domicilios && dg.domicilios.length > 0 ? dg.domicilios[0] : null) || persona.domicilioFiscal || (persona.domicilios && persona.domicilios.length > 0 ? persona.domicilios[0] : null);
        if (dom) {
          if (typeof dom === "string") {
            const parsed = parseAddressString(dom);
            address = parsed.address;
            localidad = parsed.localidad;
            provincia = parsed.provincia;
            zip = parsed.zip;
          } else {
            address = dom.direccion || "";
            localidad = dom.localidad || "";
            provincia = dom.descripcionProvincia || dom.provincia || "";
            zip = dom.codPostal || dom.codigoPostal || "";
          }
        }

        let ivaCond = 7; // Consumidor Final default
        if (persona.datosMonotributo || dg.datosMonotributo) {
          ivaCond = 3; // Monotributista
        } else {
          const rg = persona.datosRegimenGeneral || dg.datosRegimenGeneral || {};
          let taxes = [];
          if (Array.isArray(rg.impuesto)) {
            taxes = rg.impuesto;
          } else if (rg.impuesto) {
            taxes = [rg.impuesto];
          } else if (Array.isArray(persona.impuesto)) {
            taxes = persona.impuesto;
          } else if (persona.impuesto) {
            taxes = [persona.impuesto];
          }

          const taxIds = taxes.map(t => parseInt(t.idImpuesto || t.id || 0)).filter(Boolean);
          if (taxIds.includes(30)) {
            ivaCond = 2; // Responsable Inscripto
          } else if (taxIds.includes(20) || taxIds.includes(21) || taxIds.includes(22)) {
            ivaCond = 3; // Responsable Monotributo
          } else if (taxIds.includes(32) || taxIds.includes(33)) {
            ivaCond = 1; // Exento
          } else {
            const taxDescriptions = taxes.map(t => String(t.descripcionImpuesto || t.descripcion || "").toLowerCase());
            if (taxDescriptions.some(d => d.includes("inscripto") || d.includes("responsable inscripto"))) {
              ivaCond = 2;
            } else if (taxDescriptions.some(d => d.includes("monotributo") || d.includes("simplificado"))) {
              ivaCond = 3;
            } else if (taxDescriptions.some(d => d.includes("exento"))) {
              ivaCond = 1;
            }
          }
        }

        let inicioActividades = null;
        const startActivitiesRaw = dg.fechaInicioActividades || persona.fechaInicioActividades || null;
        if (startActivitiesRaw) {
          inicioActividades = formatDateToYiQi(startActivitiesRaw);
        }

        return res.json({
          success: true,
          simulated: false,
          data: {
            socialName: socialName,
            fantasyName: "", // El padrón de AFIP no provee Nombre de Fantasía, queda vacío para ingreso manual
            ivaCondition: ivaCond,
            address: address,
            localidad: localidad,
            provincia: provincia,
            provinciaId: mapProvinceToId(provincia || localidad),
            zip: String(zip),
            email: "",
            phone: "",
            inicioActividades: inicioActividades,
            iibb: cuit,
            subconceptoGanancias: 86
          }
        });
      }
    } catch (err) {
      console.error(`[AFIP] Error consultando AFIP SDK:`, err);
    }
  }

  // 2. Consulta Real a Cuitalizer (si existe API Key configurada)
  const API_KEY = process.env.CUITALIZER_API_KEY;
  if (API_KEY) {
    console.log(`[AFIP] Realizando consulta real a Cuitalizer para CUIT: ${cuit}...`);
    try {
      const resp = await fetch("https://api.cuitalizer.com.ar/api/v1/contribuyente/consultar", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": API_KEY
        },
        body: JSON.stringify({ cuit: cuit })
      });
      
      if (resp.ok) {
        const resData = await resp.json();
        const contribuyente = resData.data || resData;
        if (contribuyente && contribuyente.razonSocial) {
          // Traducir condición de IVA a valor numérico compatible con YiQi
          let ivaCond = 7; // Consumidor Final default
          const descIva = String(contribuyente.condicionIva || "").toUpperCase();
          if (descIva.includes("INSCRIPTO") || descIva.includes("RI")) {
            ivaCond = 2;
          } else if (descIva.includes("MONOTRIBUTO") || descIva.includes("RS") || descIva.includes("SIMPLIFICADO")) {
            ivaCond = 3;
          } else if (descIva.includes("EXENTO")) {
            ivaCond = 1;
          }
          
          let address = "";
          let localidad = "";
          let provincia = "";
          let zip = "";

          if (contribuyente.domicilios && contribuyente.domicilios.length > 0) {
            const dom = contribuyente.domicilios[0];
            address = dom.direccion || "";
            localidad = dom.localidad || "";
            provincia = dom.provincia || "";
            zip = dom.codPostal || dom.codigoPostal || "";
          } else {
            const fullAddress = contribuyente.domicilioFiscal || contribuyente.direccion || "";
            const parsed = parseAddressString(fullAddress);
            address = parsed.address;
            localidad = parsed.localidad;
            provincia = parsed.provincia;
            zip = parsed.zip;
          }

          let inicioActividades = null;
          const startActivitiesRaw = contribuyente.fechaInicioActividades || contribuyente.inicioActividades || null;
          if (startActivitiesRaw) {
            inicioActividades = formatDateToYiQi(startActivitiesRaw);
          }

          return res.json({
            success: true,
            simulated: false,
            data: {
              socialName: contribuyente.razonSocial,
              fantasyName: contribuyente.nombreFantasia || contribuyente.razonSocial,
              ivaCondition: ivaCond,
              address: address,
              localidad: localidad,
              provincia: provincia,
              provinciaId: mapProvinceToId(provincia || localidad),
              zip: String(zip),
              email: contribuyente.email || "",
              phone: contribuyente.telefono || "",
              inicioActividades: inicioActividades,
              iibb: cuit,
              subconceptoGanancias: 86
            }
          });
        }
      } else {
        console.warn(`[AFIP] Cuitalizer API retorno error status: ${resp.status}`);
      }
    } catch (err) {
      console.error(`[AFIP] Error consultando Cuitalizer API:`, err);
    }
  }

  // 3. Fallback: Generador Inteligente de Datos Ficticios para cualquier otro CUIT
  console.log(`[AFIP] Generando datos simulados realistas para CUIT: ${cuit}`);
  const nro = cuit.substring(2, 10);
  const isCompany = cuit.startsWith("30") || cuit.startsWith("33") || cuit.startsWith("34");
  const nameGen = isCompany ? `NUEVA EMPRESA CUIT ${nro} S.A.` : `CONTRIBUYENTE PERSONA FISICA ${nro}`;
  const ivaGen = isCompany ? 2 : 3; // 2=RI, 3=RS
  
  return res.json({
    success: true,
    simulated: true,
    data: {
      socialName: nameGen,
      fantasyName: isCompany ? `Sucursal ${nro}` : `Local ${nro}`,
      ivaCondition: ivaGen,
      address: `Calle Principal ${nro}`,
      localidad: "Localidad Comercial",
      provincia: "Buenos Aires",
      provinciaId: 2,
      zip: "1000",
      email: `contacto_${nro}@empresa_ficticia.com.ar`,
      phone: `11-4500-${cuit.substring(7, 11)}`,
      inicioActividades: "2020-01-01T00:00:00",
      iibb: cuit,
      subconceptoGanancias: 86
    }
  });
});

const LOCALIDADES_MAP = {
  "belgrano": 56,
  "berazategui": 192,
  "caleta olivia": 196,
  "ciudad de cordoba": 31,
  "cordoba": 31,
  "ciudad de san luis": 107,
  "san luis": 107,
  "ciudadela": 200,
  "colegiales": 1,
  "concordia": 131,
  "daireaux": 109,
  "esperanza": 152,
  "flores": 61,
  "guernica": 127,
  "ituzaingo": 101,
  "lavallol": 72,
  "llavallol": 72,
  "lomas de zamora": 91,
  "longchamps": 181,
  "mataderos": 43,
  "monte maiz": 159,
  "moron": 163,
  "nunez": 47,
  "nuñez": 47,
  "olavarria": 75,
  "palermo": 30,
  "parana": 114,
  "presidente roque saenz pena": 166,
  "presidente roque saenz peña": 166,
  "quemu quemu": 138,
  "quilmes": 111,
  "reconquista": 137,
  "rodeo del medio": 99,
  "rosario": 9,
  "saavedra": 46,
  "san justo": 6,
  "san martin": 134,
  "san miguel": 26,
  "santo pipo": 82,
  "tortuguitas": 162,
  "villa crespo": 70,
  "villa ortuzar": 168,
  "villa del parque": 71,
  "wilde": 125,
  "caba": 1,
  "capital federal": 1
};

function normalizeString(str) {
  if (!str) return "";
  return str.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function resolveLocalidadId(cityName) {
  const norm = normalizeString(cityName);
  return LOCALIDADES_MAP[norm] || null;
}

/**
 * Cloud Function que actua como Proxy Seguro para el Alta de Clientes y Sucursales en YiQi ERP.
 * Valida duplicados, guarda la cabecera del cliente y, de forma secuencial, crea las sucursales.
 */
exports.altaClienteProxy = onRequest({ cors: true }, async (req, res) => {
  try {
    const {
      socialName,
      fantasyName,
      cuit,
      address,
      city,
      provinceId,
      countryId,
      zip,
      email,
      phone,
      ivaCondition,
      branches,
      iibb,
      inicioActividades,
      subconceptoGanancias
    } = req.body;

    if (!socialName || !cuit || !address || !email || !city || !provinceId || !zip) {
      return res.status(400).json({ success: false, error: "Faltan parametros requeridos para el alta (socialName, cuit, address, city, provinceId, zip, email)" });
    }

    const cuitClean = String(cuit).replace(/\D/g, "");
    if (cuitClean.length !== 11 && cuitClean.length !== 7 && cuitClean.length !== 8) {
      return res.status(400).json({ success: false, error: "El documento debe tener 7, 8 u 11 digitos numericos" });
    }

    const docType = req.body.documentType || (cuitClean.length === 11 ? 1 : 3);
    const docTypeLabel = docType === 3 ? "DNI" : "CUIT";

    console.log(`[Proxy] Iniciando alta de cliente para ${docTypeLabel}: ${cuitClean} - Razon Social: ${socialName}`);

    // 1. Obtener Token de YiQi ERP
    const token = await getYiQiToken();

    // 2. Control de duplicados en YiQi ERP (Smartie 2603, entityId: 345)
    console.log(`[Proxy] Comprobando ${docTypeLabel} duplicado en YiQi...`);
    const queryUrl = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=345&schemaId=1491&smartieId=2603";
    const queryBody = {
      page: 1,
      pageSize: 5,
      search: cuitClean
    };

    const queryResp = await fetch(queryUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(queryBody)
    });

    if (!queryResp.ok) {
      const errText = await queryResp.text();
      throw new Error(`Error al verificar duplicado en YiQi: HTTP ${queryResp.status} - ${errText}`);
    }

    const queryData = await queryResp.json();
    const existingList = queryData.data || queryData.rows || queryData.instances || [];
    const matched = existingList.filter(row => String(row.CLIE_CUIT || "").replace(/\D/g, "") === cuitClean);
    if (matched.length > 0) {
      return res.json({ success: false, error: `El ${docTypeLabel} ${cuitClean} ya se encuentra registrado como cliente en el ERP.` });
    }

    // 3. Crear cabecera de Empresa (Entity 345) en YiQi ERP
    console.log(`[Proxy] Guardando cabecera de cliente en YiQi...`);
    const formStr = [
      `2468=${encodeURIComponent(socialName)}`,
      `948=${encodeURIComponent(fantasyName || socialName)}`,
      `5681=${docType}`, // Tipo de documento (CUIT = 1, DNI = 3)
      `1686=${encodeURIComponent(cuitClean)}`,
      `1085=${encodeURIComponent(address)}`,
      `1086=${encodeURIComponent(city)}`,
      `1087=${parseInt(provinceId, 10) || 1}`,
      `1088=${parseInt(countryId, 10) || 1}`, // País dinámico
      `3936=${encodeURIComponent(zip)}`,
      `1089=${encodeURIComponent(phone || "")}`,
      `5774=${encodeURIComponent(email)}`,
      `6055=1`, // Lista de precios default
      `6239=11`, // Condición de pago default (Pago Anticipado)
      `3821=${ivaCondition || 7}`,
      `1268=on`, // Activo
      `5772=off`,
      `9971=off`,
      `5782=${encodeURIComponent(iibb || cuitClean)}`,
      `6671=${encodeURIComponent(inicioActividades || "")}`,
      `3148=${parseInt(subconceptoGanancias, 10) || 86}`
    ].join('&');

    const saveUrl = "https://api.yiqi.com.ar/api/instancesApi/Save";
    const savePayload = {
      schemaId: 1491,
      entityId: "345",
      form: formStr,
      uploads: "",
      parentId: null,
      childId: null
    };

    const saveResp = await fetch(saveUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
      },
      body: JSON.stringify(savePayload)
    });

    if (!saveResp.ok) {
      const errText = await saveResp.text();
      throw new Error(`Error al registrar el cliente en YiQi: HTTP ${saveResp.status} - ${errText}`);
    }

    const saveData = await saveResp.json();
    const clientId = saveData.newId || saveData.id || (saveData.ok && saveData.data ? saveData.data.id : null);
    if (!clientId) {
      throw new Error("No se pudo obtener el ID del cliente generado por YiQi ERP.");
    }

    console.log(`[Proxy] Cliente creado con exito. ID ERP: ${clientId}`);

    // 4. Guardar Sucursales Child (Child 262) si existen
    let successBranches = 0;
    if (Array.isArray(branches) && branches.length > 0) {
      console.log(`[Proxy] Registrando ${branches.length} sucursales asociadas en YiQi...`);
      const branchUrl = `https://api.yiqi.com.ar/api/childrenApi/SaveChildInstances?instanceId=${clientId}&schemaId=1491`;
      
      const branchResp = await fetch(branchUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          entityId: "345",
          schemaId: 1491,
          childId: 262,
          instanceId: String(clientId),
          childInstances: branches.map(b => {
            const locName = b.CLIE_LOCALIDAD || b.LOCALIDAD || "";
            const resolvedLobaId = b.LOBA_ID_LOBA || resolveLocalidadId(locName);
            return JSON.stringify({
              NOMBRE: b.SUCU_NOMBRE || b.NOMBRE,
              SUCU_NOMBRE: b.SUCU_NOMBRE || b.NOMBRE,
              DIRECCION: b.SUCU_DIRECCION || b.DIRECCION,
              SUCU_DIRECCION: b.SUCU_DIRECCION || b.DIRECCION,
              CLIE_LOCALIDAD: locName,
              LOCALIDAD: locName,
              LOBA_ID_LOBA: resolvedLobaId ? parseInt(resolvedLobaId, 10) : null,
              PROV_ID_PROV: b.PROV_ID_PROV || b.PROVINCIA ? parseInt(b.PROV_ID_PROV || b.PROVINCIA, 10) : null,
              PROVINCIA: b.PROV_ID_PROV || b.PROVINCIA ? parseInt(b.PROV_ID_PROV || b.PROVINCIA, 10) : null,
              PAIS_ID_PAIS: b.PAIS_ID_PAIS || b.PAIS ? parseInt(b.PAIS_ID_PAIS || b.PAIS, 10) : 1,
              PAIS: b.PAIS_ID_PAIS || b.PAIS ? parseInt(b.PAIS_ID_PAIS || b.PAIS, 10) : 1
            });
          }),
          append: true
        })
      });

      if (branchResp.ok) {
        const branchData = await branchResp.json();
        if (branchData.ok !== false) {
          successBranches = branches.length;
          console.log(`[Proxy] Sucursales guardadas correctamente.`);
        } else {
          console.warn(`[Proxy] Fallo el guardado interno de las sucursales: ${JSON.stringify(branchData)}`);
        }
      } else {
        const errText = await branchResp.text();
        console.error(`[Proxy] Fallo la peticion de sucursales: HTTP ${branchResp.status} - ${errText}`);
      }
    }

    return res.json({
      success: true,
      clientId: clientId,
      branchesRegistered: successBranches
    });

  } catch (error) {
    console.error("Error en altaClienteProxy:", error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Cloud Function que consulta la receta/BOM y stock de insumos de un artículo.
 * URL pública: https://<region>-<project-id>.cloudfunctions.net/obtenerBOMDetalle?sku=LT805015
 */
exports.obtenerBOMDetalle = onRequest({ cors: true }, async (req, res) => {
  const { sku } = req.query;
  if (!sku) {
    return res.status(400).json({ error: "Falta el parametro sku" });
  }

  try {
    const token = await getYiQiToken();
    const url = "https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=771&schemaId=1491&smartieId=2785";
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + token
      },
      body: JSON.stringify({ page: 1, pageSize: 200, search: String(sku) })
    });

    if (!response.ok) {
      throw new Error(`YiQi GetList BOM retornó HTTP ${response.status}`);
    }

    const data = await response.json();
    const rows = data.data || data.rows || data.instances || data.items || [];
    
    // Filter rows exactly by MBOM_CODIGO
    const components = rows.filter(b => (b.MBOM_CODIGO || "").trim().toUpperCase() === String(sku).trim().toUpperCase())
      .map(b => ({
        sku: b.MATE_CODIGO || "",
        name: b.MATE_NOMBRE || "Insumo sin nombre",
        reqQty: b.DEBO_CANTIDAD || 0,
        stockQty: b.DEBO_CANTIDAD_EN_STOCK || 0,
        unit: b.TIUN_DESCRIPCION || "Ud"
      }));

    return res.json({ success: true, sku, components });
  } catch (error) {
    console.error("Error en obtenerBOMDetalle:", error);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Cloud Function para gestionar el ciclo de vida de una Orden de Producción (OP).
 */
exports.gestionarProduccionOP = onRequest({ cors: true }, async (req, res) => {
  const { action } = req.body;
  if (!action) {
    return res.status(400).json({ error: "Falta el parametro action" });
  }

  try {
    const token = await getYiQiToken();
    const schemaId = 1491;

    if (action === "getOP") {
      const { pedidoId, mateId, sku } = req.body;
      if (!pedidoId || !mateId) {
        return res.status(400).json({ error: "Faltan parametros (pedidoId, mateId)" });
      }

      console.log(`[OP] Consultando Pedido ${pedidoId} para extraer OPs...`);
      const pedidoUrl = `https://api.yiqi.com.ar/api/public/PEDIDO/${pedidoId}?schemaId=${schemaId}`;
      const pedidoResp = await fetch(pedidoUrl, {
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        }
      });

      if (!pedidoResp.ok) {
        throw new Error(`Error consultando Pedido: HTTP ${pedidoResp.status}`);
      }

      const pedidoData = await pedidoResp.json();
      const pedidoObj = pedidoData.data || pedidoData;
      const ops = pedidoObj.ORDENDEPRODUCCIÓN || pedidoObj.ORDENDEPRODUCCION || [];
      console.log(`[OP] Encontradas ${ops.length} OPs asociadas al pedido ${pedidoId}. Filtrando por mateId ${mateId}...`);
      
      let foundOp = null;
      for (const op of ops) {
        const detailUrl = `https://api.yiqi.com.ar/api/public/ORDEN_DE_PRODUCCION/${op.id}?schemaId=${schemaId}&includeChildren=true`;
        const detailResp = await fetch(detailUrl, {
          headers: {
            "Authorization": "Bearer " + token,
            "Content-Type": "application/json"
          }
        });

        if (detailResp.ok) {
          const detail = await detailResp.json();
          const detailLines = detail.DETALLE || detail.detalle || [];
          const matches = detailLines.some(line => String(line.MATE_ID_MATE) === String(mateId));
          if (matches) {
            foundOp = detail;
            break;
          }
        }
      }

      if (foundOp) {
        // Resolve parent product SKU to query its recipe components
        let parentSku = sku || "";
        if (!parentSku) {
          try {
            const mateUrl = `https://api.yiqi.com.ar/api/public/MATERIAL/${mateId}?schemaId=${schemaId}`;
            const mateResp = await fetch(mateUrl, { headers: { "Authorization": "Bearer " + token } });
            if (mateResp.ok) {
              const mateData = await mateResp.json();
              parentSku = (mateData.data || mateData).MATE_CODIGO || "";
            }
          } catch (mateErr) {
            console.error(`[OP] Error buscando SKU para mateId ${mateId}:`, mateErr);
          }
        }

        let bomMap = {};
        if (parentSku) {
          try {
            console.log(`[OP] Buscando receta BOM para producto SKU: ${parentSku}...`);
            const bomUrl = `https://api.yiqi.com.ar/api/instancesApi/GetList?entityId=771&schemaId=${schemaId}&smartieId=2785`;
            const bomResp = await fetch(bomUrl, {
              method: "POST",
              headers: {
                "Authorization": "Bearer " + token,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ page: 1, pageSize: 200, search: String(parentSku) })
            });

            if (bomResp.ok) {
              const bomData = await bomResp.json();
              const bomRows = bomData.rows || bomData.data || bomData.instances || bomData.items || [];
              bomRows.forEach(b => {
                if ((b.MBOM_CODIGO || "").trim().toUpperCase() === String(parentSku).trim().toUpperCase()) {
                  const name = (b.MATE_NOMBRE || "").trim().toLowerCase();
                  if (name) {
                    bomMap[name] = {
                      sku: b.MATE_CODIGO || "",
                      unit: b.TIUN_DESCRIPCION || "Ud"
                    };
                  }
                }
              });
            }
          } catch (bomErr) {
            console.error(`[OP] Error buscando componentes BOM para SKU ${parentSku}:`, bomErr);
          }
        }

        return res.json({
          success: true,
          found: true,
          op: {
            id: foundOp.id,
            nro: foundOp.ORDP_NRO,
            estado: foundOp.ESTA_NOMBRE,
            estadoCodigo: foundOp.ESTA_CODIGO,
            requiredItems: (foundOp.ARTÍCULOSREQUERIDOS || foundOp.ARTCULOSREQUERIDOS || []).map(item => {
              const name = item.ARRE_ARTICULO_NOMBRE || "Insumo";
              const mapped = bomMap[name.trim().toLowerCase()] || {};
              return {
                sku: mapped.sku || "",
                name: name,
                reqQty: item.ARRE_CANTIDAD || 0,
                stockQty: item.ARRE_CANT_DISP_ORIGEN !== undefined ? item.ARRE_CANT_DISP_ORIGEN : 0,
                unit: mapped.unit || "Ud"
              };
            })
          }
        });
      } else {
        return res.json({ success: true, found: false });
      }

    } else if (action === "createOP") {
      const { pedidoId, mateId, qty } = req.body;
      if (!pedidoId || !mateId || !qty) {
        return res.status(400).json({ error: "Faltan parametros (pedidoId, mateId, qty)" });
      }

      console.log(`[OP] Creando OP para pedidoId ${pedidoId}, mateId ${mateId}, cant ${qty}...`);
      const createUrl = `https://api.yiqi.com.ar/api/public/ORDEN_DE_PRODUCCION?schemaId=${schemaId}`;
      const startIso = new Date().toISOString();
      const endIso = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const createPayload = {
        schemaId,
        data: {
          ORDP_RESPONSABLE: 20,
          ORDP_FACTOR_DE_MULTIPLICA: Number(qty),
          ORDP_FECHA_DE_INICIO: startIso,
          ORDP_FECHA_DE_EMISION: startIso,
          ORDP_FECHA_DE_ENTREGA_EST: endIso,
          CEDI_ID_UBIO: 155,
          CEDI_ID_UBID: 155,
          ORDP_CALCULAR_ARTICULOS: "S",
          PEDI_ID_PEDI: Number(pedidoId),
          ORDP_PEDIDO: "S",
          Detalle: [
            {
              MATE_ID_MATE: Number(mateId),
              DEOP_CANTIDAD: Number(qty)
            }
          ]
        }
      };

      const createResp = await fetch(createUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(createPayload)
      });

      if (!createResp.ok) {
        const errText = await createResp.text();
        throw new Error(`Error creando OP: HTTP ${createResp.status} - ${errText}`);
      }

      const createData = await createResp.json();
      const newOpId = createData.newId || createData.id;

      if (!newOpId) {
        throw new Error("No se devolvió ID para la nueva OP.");
      }

      console.log(`[OP] OP creada con ID: ${newOpId}. Ejecutando transicion calcular (118324)...`);
      const transUrl = `https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition`;
      await fetch(transUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          schemaId,
          ids: [String(newOpId)],
          transitionId: 118324,
          form: ""
        })
      });

      console.log(`[OP] Calculo BOM enviado. Forzando propagacion...`);
      const getInstUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=${schemaId}&entityId=767&id=${newOpId}`;
      await fetch(getInstUrl, { headers: { "Authorization": "Bearer " + token } });

      return res.json({ success: true, opId: newOpId });

    } else if (action === "calcularBOM") {
      const { opId } = req.body;
      if (!opId) {
        return res.status(400).json({ error: "Falta opId" });
      }

      console.log(`[OP] Ejecutando transicion calcular BOM (118324) para OP ID: ${opId}...`);
      const transUrl = `https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition`;
      const transResp = await fetch(transUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          schemaId,
          ids: [String(opId)],
          transitionId: 118324,
          form: ""
        })
      });

      if (!transResp.ok) {
        const errText = await transResp.text();
        throw new Error(`Error al calcular BOM: HTTP ${transResp.status} - ${errText}`);
      }

      const getInstUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=${schemaId}&entityId=767&id=${opId}`;
      await fetch(getInstUrl, { headers: { "Authorization": "Bearer " + token } });

      return res.json({ success: true });

    } else if (action === "reservarStock") {
      const { opId } = req.body;
      if (!opId) {
        return res.status(400).json({ error: "Falta opId" });
      }

      console.log(`[OP] Pasando OP ID ${opId} a En proceso...`);
      const stateUrl = `https://api.yiqi.com.ar/api/public/ORDEN_DE_PRODUCCION/changestate?schemaId=${schemaId}&id=${opId}&state=En%20proceso`;
      const stateResp = await fetch(stateUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        }
      });

      if (!stateResp.ok) {
        const errText = await stateResp.text();
        throw new Error(`Error al reservar stock (cambiar estado): HTTP ${stateResp.status} - ${errText}`);
      }

      const getInstUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=${schemaId}&entityId=767&id=${opId}`;
      await fetch(getInstUrl, { headers: { "Authorization": "Bearer " + token } });

      return res.json({ success: true });

    } else if (action === "terminarOP") {
      const { opId } = req.body;
      if (!opId) {
        return res.status(400).json({ error: "Falta opId" });
      }

      console.log(`[OP] Ejecutando transicion terminar OP (118335) para OP ID: ${opId}...`);
      const transUrl = `https://api.yiqi.com.ar/api/workflowApi/ExecuteTransition`;
      const transResp = await fetch(transUrl, {
        method: "POST",
        headers: {
          "Authorization": "Bearer " + token,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          schemaId,
          ids: [String(opId)],
          transitionId: 118335,
          form: ""
        })
      });

      if (!transResp.ok) {
        const errText = await transResp.text();
        throw new Error(`Error al terminar OP: HTTP ${transResp.status} - ${errText}`);
      }

      const getInstUrl = `https://api.yiqi.com.ar/api/instancesApi/GetInstance?schemaId=${schemaId}&entityId=767&id=${opId}`;
      await fetch(getInstUrl, { headers: { "Authorization": "Bearer " + token } });

      return res.json({ success: true });
    }

    return res.status(400).json({ error: "Accion no soportada" });

  } catch (error) {
    console.error("Error en gestionarProduccionOP:", error);
    return res.status(500).json({ error: error.message });
  }
});








