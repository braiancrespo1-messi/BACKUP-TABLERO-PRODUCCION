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
  // Guardamos cookies por 30 minutos
  cookiesExpiry = Date.now() + 30 * 60 * 1000;
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
    const queryUrl = `https://me.yiqi.com.ar/api/public/${parsed.entity}/query?schemaId=1491`;
    const queryBody = {
      page: 1,
      pageSize: 10,
      columns: [{ field: 'id' }],
      filters: [
        { columnName: parsed.filterField, operator: '=', value: parsed.number }
      ]
    };

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
          break;
        }
      }
    }

    if (!matchedDetail) {
      return res.status(403).json({ error: "El comprobante no pertenece a la cuenta de este cliente" });
    }

    // 3. Estructurar y formatear la salida segun el tipo de comprobante
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
            const queryUrl = `https://me.yiqi.com.ar/api/public/${parsedInv.entity}/query?schemaId=1491`;
            const queryBody = {
              page: 1,
              pageSize: 5,
              columns: [{ field: 'id' }],
              filters: [{ columnName: parsedInv.filterField, operator: '=', value: parsedInv.number }]
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
              const queryUrl = `https://me.yiqi.com.ar/api/public/${parsedInv.entity}/query?schemaId=1491`;
              const queryBody = {
                page: 1,
                pageSize: 5,
                columns: [{ field: 'id' }],
                filters: [{ columnName: parsedInv.filterField, operator: '=', value: parsedInv.number }]
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



