/**
 * YiqiClient - Cliente de integración para YiQi ERP API
 * 
 * Este cliente encapsula la lógica de autenticación, obtención de schemaId,
 * renovación automática de tokens y peticiones HTTP a los endpoints públicos de YiQi.
 */
export class YiqiClient {
  /**
   * @param {Object} config
   * @param {string} config.username - Usuario del ERP (email)
   * @param {string} config.password - Contraseña del ERP
   * @param {string} [config.baseUrl] - Base URL (por defecto https://api.yiqi.com.ar)
   */
  constructor({ username, password, baseUrl = 'https://api.yiqi.com.ar' }) {
    if (!username || !password) {
      throw new Error('YiqiClient requiere username y password.');
    }
    this.username = username;
    this.password = password;
    this.baseUrl = baseUrl.replace(/\/$/, ''); // Quitar barra final si existe
    
    // Estado de sesión
    this.token = null;
    this.tokenExpiry = 0; // timestamp en ms
    this.schemaId = null;
  }

  /**
   * Obtiene o renueva el token Bearer usando POST /token en orden de prioridad de URLs.
   */
  async login() {
    const tokenUrls = [
      `${this.baseUrl}/token`,
      `${this.baseUrl}/connect/token`,
      'https://me.yiqi.com.ar/connect/token'
    ];

    const body = new URLSearchParams({
      grant_type: 'password',
      username: this.username,
      password: this.password
    });

    console.log(`[YiqiClient] Intentando autenticación para ${this.username}...`);

    let lastError = null;
    for (const url of tokenUrls) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: body.toString()
        });

        if (response.ok) {
          const data = await response.json();
          if (data.access_token) {
            this.token = data.access_token;
            // Guardar expiración con margen de 5 minutos (300 segundos)
            const expiresIn = data.expires_in || 3600;
            this.tokenExpiry = Date.now() + (expiresIn - 300) * 1000;
            console.log(`[YiqiClient] Token obtenido con éxito desde: ${url}`);
            
            // Paso Crítico: Obtener schemaId
            await this.fetchSchemaId();
            return { token: this.token, schemaId: this.schemaId };
          }
        } else {
          const text = await response.text();
          lastError = new Error(`HTTP ${response.status}: ${text}`);
          console.warn(`[YiqiClient] Falló endpoint ${url} - ${lastError.message}`);
        }
      } catch (e) {
        lastError = e;
        console.warn(`[YiqiClient] Error de red en ${url}: ${e.message}`);
      }
    }

    throw new Error(`Error de autenticación con YiQi ERP. Detalle: ${lastError ? lastError.message : 'Desconocido'}`);
  }

  /**
   * Llama al endpoint GetLoginInformation para extraer y guardar el schemaId
   */
  async fetchSchemaId() {
    if (!this.token) {
      throw new Error('[YiqiClient] No hay un token disponible para consultar el schemaId.');
    }

    const url = `${this.baseUrl}/api/accountapi/GetLoginInformation`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} en GetLoginInformation`);
      }

      const data = await response.json();
      
      // Intentar extraer el schemaId de forma flexible
      // Comúnmente viene como data.schemaId, data.SchemaId o dentro de data.user
      this.schemaId = data.schemaId || data.SchemaId || 
                      (data.user && (data.user.schemaId || data.user.SchemaId)) || 
                      (data.data && (data.data.schemaId || data.data.SchemaId)) || 
                      null;

      if (!this.schemaId) {
        console.warn('[YiqiClient] No se pudo extraer schemaId del JSON de respuesta:', JSON.stringify(data));
        // Fallback al schema por defecto de TMC
        this.schemaId = '1491';
        console.warn('[YiqiClient] Usando schemaId de contingencia: 1491');
      } else {
        console.log(`[YiqiClient] SchemaId obtenido: ${this.schemaId}`);
      }
    } catch (e) {
      console.error('[YiqiClient] Error obteniendo schemaId:', e);
      // Fallback
      this.schemaId = '1491';
      console.warn('[YiqiClient] Usando schemaId de contingencia por excepción: 1491');
    }
  }

  /**
   * Retorna un token válido. Si está por expirar o no existe, realiza el login automático.
   */
  async getValidToken() {
    if (!this.token || Date.now() >= this.tokenExpiry) {
      console.log('[YiqiClient] Token inexistente o expirado. Renovando...');
      await this.login();
    }
    return this.token;
  }

  /**
   * Realiza una petición HTTP autenticada con renovación automática ante 401.
   * @param {string} path - Ruta relativa (ej: '/api/public/MATERIAL/query')
   * @param {Object} options - Opciones de fetch (method, headers, body, etc.)
   */
  async request(path, options = {}) {
    let token = await this.getValidToken();
    const url = `${this.baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
    
    const headers = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    let fetchOpts = {
      ...options,
      headers
    };

    try {
      let response = await fetch(url, fetchOpts);

      // Si da 401, el token podría estar invalidado del lado del servidor. Re-autenticamos una vez.
      if (response.status === 401) {
        console.warn(`[YiqiClient] Petición a ${path} retornó 401. Forzando re-login...`);
        this.token = null; // invalidar localmente
        token = await this.getValidToken();
        fetchOpts.headers['Authorization'] = `Bearer ${token}`;
        response = await fetch(url, fetchOpts);
      }

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Error en API YiQi [${response.status}] al consultar ${path}: ${text}`);
      }

      return await response.json();
    } catch (e) {
      console.error(`[YiqiClient] Error en petición a ${url}:`, e.message);
      throw e;
    }
  }

  /**
   * Petición GET autenticada.
   */
  async get(path, options = {}) {
    return this.request(path, { ...options, method: 'GET' });
  }

  /**
   * Petición POST autenticada.
   */
  async post(path, body, options = {}) {
    return this.request(path, {
      ...options,
      method: 'POST',
      body: typeof body === 'string' ? body : JSON.stringify(body)
    });
  }

  /**
   * Petición de consulta unificada usando el endpoint /query público
   * @param {string} entity - Nombre de la entidad (ej: 'MATERIAL', 'STOCK', 'CLIENTE')
   * @param {Object} queryBody - Cuerpo de consulta con columns, filters, page, pageSize, etc.
   */
  async query(entity, queryBody = {}) {
    const sId = this.schemaId || '1491';
    const path = `/api/public/${entity}/query?schemaId=${sId}`;
    return this.post(path, queryBody);
  }
}
