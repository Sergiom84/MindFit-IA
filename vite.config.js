import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'
import { createRequire } from 'module'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)
const pkg = require('./package.json')

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // CONFIG-001: el build móvil se resuelve con los ficheros de PRODUCCIÓN. Vite da
  // prioridad a `.env.[mode]` sobre `.env.local`, así que cargando el entorno como
  // 'production' el `.env.local` de desarrollo (localhost:3010) deja de colarse en
  // el bundle de Capacitor. Sin esto, en una máquina de desarrollo el build móvil
  // se caía siempre contra el guard de más abajo.
  const envMode = mode === 'mobile' ? 'production' : mode
  const env = loadEnv(envMode, process.cwd(), '')
  // CONFIG-001: el backend usa el puerto fijo 3010; el proxy dev debe apuntar ahí
  // (antes 3002, que no era el puerto real y rompía el dev por defecto).
  const API_TARGET = env.VITE_API_URL || `http://localhost:${env.VITE_API_PORT || 3010}`
  const FRONT_PORT = Number(env.VITE_PORT || 5173)

  // CONFIG-001: validación de build para móvil. La app en Capacitor corre en un
  // WebView cuyo origen NO es el del backend, así que un build móvil DEBE llevar
  // VITE_API_URL absoluta (p. ej. https://entrenaconia.onrender.com). Sin ella,
  // los clientes caían a rutas relativas (que en el WebView no resuelven) o a
  // `undefined/api/...`. Los scripts android:sync/ios:sync usan `--mode mobile`.
  if (mode === 'mobile') {
    const apiUrl = env.VITE_API_URL || ''
    const isLocalhost = /localhost|127\.0\.0\.1|0\.0\.0\.0|:\d+$/.test(apiUrl) && !/^https?:\/\/[^/]+\.[^/]+/.test(apiUrl)
    if (!apiUrl || isLocalhost) {
      throw new Error(
        `[CONFIG-001] Build móvil con VITE_API_URL inválida ("${apiUrl || 'sin definir'}"). ` +
        'Define VITE_API_URL con la URL ABSOLUTA y pública del backend ' +
        '(ej. https://entrenaconia.onrender.com) antes de compilar para Android/iOS. ' +
        'localhost no funciona dentro del WebView del dispositivo.'
      )
    }
  }

  // 🔍 DEBUG - Ver qué está pasando
  console.log('🔍 DEBUG - Mode:', mode)
  console.log('🔍 DEBUG - VITE_PORT from env:', env.VITE_PORT)
  console.log('🔍 DEBUG - FRONT_PORT calculated:', FRONT_PORT)
  console.log('🔍 DEBUG - Type of FRONT_PORT:', typeof FRONT_PORT)
  console.log('🔍 DEBUG - All VITE_ env vars:', Object.keys(env).filter(key => key.startsWith('VITE_')))

  return {
    plugins: [react()],
    define: {
      __APP_VERSION__: JSON.stringify(pkg.version),
    },
    // En modo 'mobile' (Capacitor) forzamos la config de PRODUCCIÓN de la app,
    // ya que import.meta.env.MODE sería 'mobile' y las configs por entorno solo
    // conocen development/production.
    //
    // Las dos URLs van también aquí a propósito: Vite resuelve `import.meta.env`
    // con el modo REAL ('mobile'), así que sin este define seguiría inyectando el
    // `.env.local` de desarrollo en el bundle aunque el guard de arriba —que mira
    // el entorno cargado como producción— diera el visto bueno. Ese desajuste
    // producía un bundle apuntando a localhost SIN fallar el build.
    ...(mode === 'mobile'
      ? {
          define: {
            __APP_VERSION__: JSON.stringify(pkg.version),
            'import.meta.env.VITE_ENVIRONMENT': JSON.stringify('production'),
            'import.meta.env.VITE_API_URL': JSON.stringify(env.VITE_API_URL),
            'import.meta.env.VITE_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || env.VITE_API_URL),
          },
        }
      : {}),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: FRONT_PORT,
      strictPort: true,
      proxy: {
        '/api': {
          target: API_TARGET,
          changeOrigin: true,
          secure: false,
        }
      }
    },
    // 🚀 CONFIGURACIÓN DE BUNDLE SPLITTING OPTIMIZADA
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            // ⚡ Vendor libraries en chunks separados
            if (id.includes('node_modules')) {
              // React ecosystem
              if (id.includes('react') || id.includes('react-dom') || id.includes('react-router')) {
                return 'react-vendor';
              }

              // UI/Animation libraries
              if (id.includes('framer-motion') || id.includes('@radix-ui') || id.includes('lucide-react')) {
                return 'ui-vendor';
              }

              // Charts and visualization
              if (id.includes('recharts') || id.includes('victory')) {
                return 'charts-vendor';
              }

              // Form handling
              if (id.includes('react-hook-form') || id.includes('zod')) {
                return 'forms-vendor';
              }

              // General vendor chunk para el resto
              return 'vendor';
            }

            // 🏋️ Training modules (chunks por funcionalidad)
            if (id.includes('components/HomeTraining/')) {
              return 'home-training';
            }

            if (id.includes('components/routines/')) {
              return 'routines';
            }

            if (id.includes('components/Methodologie/')) {
              return 'methodologies';
            }

            if (id.includes('components/nutrition/')) {
              return 'nutrition';
            }

            if (id.includes('components/profile/')) {
              return 'profile';
            }

            if (id.includes('VideoCorrection')) {
              return 'video-correction';
            }

            // 🎯 Core application chunks
            if (id.includes('components/auth/')) {
              return 'auth';
            }

            if (id.includes('hooks/') || id.includes('contexts/')) {
              return 'core-logic';
            }

            if (id.includes('components/ui/')) {
              return 'ui-components';
            }
          }
        }
      },
      // Optimizaciones adicionales
      target: 'esnext',
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true, // Eliminar console.logs en producción
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug']
        }
      },
      // Configuración de chunks
      chunkSizeWarningLimit: 1000, // 1MB límite antes de advertencia
      assetsInlineLimit: 4096 // Inline assets < 4KB
    }
  }
})