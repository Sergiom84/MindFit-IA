
/**
 * 🔄 Token Manager - Gestión Inteligente de JWT Tokens
 *
 * FUNCIONALIDADES:
 * - Token refresh automático y silencioso
 * - Validación y decodificación de JWT
 * - Control de expiración con threshold
 * - Prevención de refresh concurrentes
 * - Storage seguro con validaciones
 */

import { AUTH_ENDPOINTS, TIMEOUT_CONFIG, SECURITY_CONFIG, STORAGE_KEYS } from '../config/authConfig';

// =============================================================================
// 🔐 GESTIÓN DE TOKENS
// =============================================================================

class TokenManager {
  constructor() {
    this.refreshPromise = null; // Previene refresh concurrentes
    this.refreshTimer = null;
    this.isRefreshing = false;
  }

  /**
   * Obtiene el token actual desde localStorage con validación
   */
  getToken() {
    try {
      const token = localStorage.getItem(STORAGE_KEYS.TOKEN);

      if (!token) return null;

      // Validación básica de formato JWT
      if (!this.isValidTokenFormat(token)) {
        console.warn('Token format invalid, removing');
        this.removeTokens();
        return null;
      }

      return token;
    } catch (error) {
      console.error('Error getting token:', error);
      return null;
    }
  }

  /**
   * Obtiene el refresh token
   */
  getRefreshToken() {
    try {
      return localStorage.getItem(STORAGE_KEYS.REFRESH_TOKEN);
    } catch (error) {
      console.error('Error getting refresh token:', error);
      return null;
    }
  }

  /**
   * Guarda tokens de forma segura
   */
  setTokens(token, refreshToken = null) {
    try {
      if (!token) {
        throw new Error('Token is required');
      }

      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
      // Espejo de la clave legacy 'token': decenas de componentes la leen
      // directamente. Sin esto, tras un refresh (que solo actualiza 'authToken')
      // la clave 'token' quedaba obsoleta y esas partes fallaban de forma
      // selectiva (AUTH-002). Mantener ambas en sync mientras se migra a
      // tokenManager como fuente única.
      localStorage.setItem('token', token);

      if (refreshToken) {
        localStorage.setItem(STORAGE_KEYS.REFRESH_TOKEN, refreshToken);
      }

      // Programar próximo refresh
      this.scheduleTokenRefresh(token);

      return true;
    } catch (error) {
      console.error('Error setting tokens:', error);
      return false;
    }
  }

  /**
   * Elimina todos los tokens
   */
  removeTokens() {
    try {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
      localStorage.removeItem('token'); // espejo legacy (ver setTokens / AUTH-002)
      localStorage.removeItem(STORAGE_KEYS.REFRESH_TOKEN);

      // Cancelar timer de refresh
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }

      this.isRefreshing = false;
      this.refreshPromise = null;

      return true;
    } catch (error) {
      console.error('Error removing tokens:', error);
      return false;
    }
  }

  /**
   * Valida formato básico de JWT token
   */
  isValidTokenFormat(token) {
    if (!token || typeof token !== 'string') return false;

    // JWT debe tener al menos 3 partes separadas por puntos
    const parts = token.split('.');
    if (parts.length !== 3) return false;

    // Verificar longitud mínima
    if (token.length < SECURITY_CONFIG.MIN_TOKEN_LENGTH) return false;

    return true;
  }

  /**
   * Decodifica JWT payload sin verificar firma
   */
  decodeToken(token) {
    try {
      if (!token) return null;

      const parts = token.split('.');
      if (parts.length !== 3) return null;

      // Decodificar payload (segunda parte)
      const payload = JSON.parse(atob(parts[1]));
      return payload;
    } catch (error) {
      console.error('Error decoding token:', error);
      return null;
    }
  }

  /**
   * Verifica si el token está próximo a expirar
   */
  isTokenNearExpiry(token = null) {
    try {
      const currentToken = token || this.getToken();
      if (!currentToken) return true;

      const payload = this.decodeToken(currentToken);
      if (!payload || !payload.exp) return true;

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = payload.exp;
      const threshold = Math.floor(TIMEOUT_CONFIG.TOKEN_REFRESH_THRESHOLD / 1000);

      return (expiresAt - now) <= threshold;
    } catch (error) {
      console.error('Error checking token expiry:', error);
      return true;
    }
  }

  /**
   * Verifica si el token ha expirado
   */
  isTokenExpired(token = null) {
    try {
      const currentToken = token || this.getToken();
      if (!currentToken) return true;

      const payload = this.decodeToken(currentToken);
      if (!payload || !payload.exp) return true;

      const now = Math.floor(Date.now() / 1000);
      return payload.exp <= now;
    } catch (error) {
      console.error('Error checking token expiry:', error);
      return true;
    }
  }

  /**
   * Programa el próximo refresh automático
   */
  scheduleTokenRefresh(token = null) {
    try {
      // Cancelar timer anterior
      if (this.refreshTimer) {
        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
      }

      const currentToken = token || this.getToken();
      if (!currentToken) return;

      const payload = this.decodeToken(currentToken);
      if (!payload || !payload.exp) return;

      const now = Math.floor(Date.now() / 1000);
      const expiresAt = payload.exp;
      const refreshIn = ((expiresAt * 1000) - Date.now()) - TIMEOUT_CONFIG.TOKEN_REFRESH_THRESHOLD;

      // Solo programar si el refresh es en el futuro
      if (refreshIn > 0) {
        console.log(`Token refresh scheduled in ${Math.floor(refreshIn / 1000 / 60)} minutes`);

        this.refreshTimer = setTimeout(() => {
          this.refreshTokenSilently();
        }, refreshIn);
      } else {
        // Token ya necesita refresh
        console.log('Token needs immediate refresh');
        this.refreshTokenSilently();
      }
    } catch (error) {
      console.error('Error scheduling token refresh:', error);
    }
  }

  /**
   * Refresh silencioso de token con protección contra concurrencia
   */
  async refreshTokenSilently() {
    // Si ya hay un refresh en progreso, esperar al resultado
    if (this.refreshPromise) {
      console.log('Token refresh already in progress, waiting...');
      return this.refreshPromise;
    }

    // Si ya está refreshing, evitar duplicados
    if (this.isRefreshing) {
      console.log('Token refresh already in progress');
      return null;
    }

    this.isRefreshing = true;

    try {
      // Crear promise para manejar concurrencia
      this.refreshPromise = this.performTokenRefresh();
      const result = await this.refreshPromise;

      this.refreshPromise = null;
      this.isRefreshing = false;

      return result;
    } catch (error) {
      console.error('Silent token refresh failed:', error);
      this.refreshPromise = null;
      this.isRefreshing = false;
      throw error;
    }
  }

  /**
   * Ejecuta el refresh real del token
   */
  async performTokenRefresh() {
    try {
      const currentToken = this.getToken();
      const refreshToken = this.getRefreshToken();

      if (!currentToken) {
        throw new Error('No current token to refresh');
      }

      console.log('Attempting silent token refresh...');

      const response = await this.makeRefreshRequest(currentToken, refreshToken);

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      if (!data.token) {
        throw new Error('No token in refresh response');
      }

      // Guardar nuevo token
      this.setTokens(data.token, data.refreshToken);

      console.log('Token refreshed successfully');

      // Emitir evento para que otros componentes sepan
      window.dispatchEvent(new CustomEvent('tokenRefreshed', {
        detail: { token: data.token }
      }));

      return {
        success: true,
        token: data.token,
        refreshToken: data.refreshToken
      };
    } catch (error) {
      console.error('Token refresh failed:', error);

      // Emitir evento de fallo
      window.dispatchEvent(new CustomEvent('tokenRefreshFailed', {
        detail: { error: error.message }
      }));

      throw error;
    }
  }

  /**
   * Realiza el request de refresh con timeout y retry
   */
  async makeRefreshRequest(token, refreshToken = null) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_CONFIG.REQUEST_TIMEOUT);

    try {
      const body = refreshToken
        ? { refreshToken }
        : { token };

      const response = await fetch(AUTH_ENDPOINTS.REFRESH, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  /**
   * Inicializa el token manager
   */
  initialize() {
    try {
      const token = this.getToken();

      if (token) {
        // Verificar si necesita refresh inmediato
        if (this.isTokenExpired(token)) {
          console.log('Token expired on initialization, removing');
          this.removeTokens();
          return false;
        }

        // Programar refresh si está próximo a expirar
        if (this.isTokenNearExpiry(token)) {
          console.log('Token near expiry, scheduling refresh');
          this.refreshTokenSilently().catch(error => {
            console.error('Failed to refresh expired token on init:', error);
            this.removeTokens();
          });
        } else {
          // Programar refresh normal
          this.scheduleTokenRefresh(token);
        }

        return true;
      }

      return false;
    } catch (error) {
      console.error('Error initializing token manager:', error);
      return false;
    }
  }

  /**
   * Cleanup al destruir
   */
  destroy() {
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer);
      this.refreshTimer = null;
    }

    this.refreshPromise = null;
    this.isRefreshing = false;
  }
}

// =============================================================================
// 📤 SINGLETON INSTANCE
// =============================================================================

const tokenManager = new TokenManager();

export default tokenManager;
export { TokenManager };