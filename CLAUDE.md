# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ IMPORTANT: MANDATORY RULES

**ALWAYS read and follow the rules in `CLAUDE_RULES.md` before any action. These are OBLIGATORY guidelines that must be respected in every interaction.**

## Development Commands

### Frontend Development

```bash
# 🚀 RECOMENDADO: Inicio automático con sincronización de puertos
npm run dev:auto

# Start frontend con verificación de puertos
npm run dev:sync

# Start frontend dev server (default port 5173)
npm run dev

# Start both frontend and backend concurrently
npm run dev:all

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint

# Install all dependencies (frontend + backend)
npm install:all
```

### Backend Development

```bash
# Start backend dev server (port 3003 by default)
cd backend && npm run dev

# Or from root directory
npm run dev:backend

# Start production backend
cd backend && npm start
```

### 📊 Production Monitoring (Render CLI)

```bash
# Login to Render (first time only)
npm run render:login

# List all services
npm run render:services

# View logs in real-time
npm run render:tail

# View recent logs (Linux/WSL)
npm run render:logs view backend

# Filter errors only
npm run render:logs errors backend

# Windows
npm run render:logs:win view backend
```

**📚 Documentación completa**:

- 🚀 **Inicio rápido**: [`docs/QUICK_START_RENDER_LOGS.md`](docs/QUICK_START_RENDER_LOGS.md)
- 📖 **Guía completa**: [`docs/RENDER_CLI_GUIDE.md`](docs/RENDER_CLI_GUIDE.md)
- 🔐 **Troubleshooting**: [`docs/RENDER_AUTH_TROUBLESHOOTING.md`](docs/RENDER_AUTH_TROUBLESHOOTING.md)
- ✅ **Estado**: [`docs/RENDER_SETUP_COMPLETE.md`](docs/RENDER_SETUP_COMPLETE.md)

### 🔍 Chrome DevTools MCP (Browser Debugging)

Claude Code tiene acceso directo a Chrome DevTools para debugging en tiempo real:

```bash
# Ver errores de consola
"¿Qué errores hay en la consola del navegador?"

# Analizar peticiones de red
"¿Por qué falla la petición a /api/routines?"

# Performance
"¿Hay problemas de rendimiento en la app?"

# Screenshots y DOM
"Toma un screenshot del modal" / "Inspecciona este elemento"
```

**📚 Documentación completa**: [`docs/CHROME_DEVTOOLS_MCP.md`](docs/CHROME_DEVTOOLS_MCP.md)

**✅ Estado**: Configurado globalmente (disponible en todos los proyectos)

**⚡ Capacidades**:

- Ver errores de consola en tiempo real
- Analizar peticiones HTTP y respuestas
- Inspeccionar elementos y estilos
- Grabar traces de performance
- Tomar screenshots y automatizar acciones

### 🔧 Scripts de Sincronización de Puertos

```bash
# 🎯 SOLUCIÓN AUTOMÁTICA: Detecta y corrige problemas de puertos
npm run check-ports      # Verificar y actualizar configuración
npm run monitor          # Monitor continuo de conectividad
npm run dev:auto         # Inicio completo con verificación automática
npm run dev:sync         # Solo frontend con verificación
scripts\sync-dev.bat     # Script interactivo (Windows)
```

**🚨 PROBLEMA COMÚN:** Cuando el backend cambia de puerto y el frontend sigue apuntando al anterior, las peticiones API devuelven 404.

**✅ SOLUCIÓN:** Los scripts detectan automáticamente el puerto del backend y actualizan `.env.local`

### Port Configuration

- Frontend: Port 5173 (configurable via VITE_PORT)
- Backend: Port 3010 (configurable via PORT)
- Alternative ports supported: Solo usar 3010 para backend
- **Sincronización automática**: Los scripts mantienen frontend/backend sincronizados
- Use environment variables: `VITE_API_PORT=3004 VITE_PORT=5177 npm run dev`

## Project Architecture

### Technology Stack

- **Frontend**: React 19 + Vite + TailwindCSS
- **Backend**: Node.js + Express + PostgreSQL
- **Database**: Supabase PostgreSQL (schema: `app,public`)
- **AI Integration**: OpenAI API for routine generation
- **Authentication**: JWT tokens

### High-Level Architecture

This is a fitness AI application with a consolidated architecture:

1. **Unified Route System**: All training-related functionality has been consolidated into three main route groups:
   - `/api/routine-generation` - AI and manual routine generation (methodologies, calisthenics, gym)
   - `/api/training-session` - Active training session management
   - `/api/exercise-catalog` - Exercise database and catalog management

2. **Legacy Compatibility**: Older routes are maintained through aliases that redirect to the new consolidated system

3. **Frontend Module Organization**:
   - `components/routines/` - Main routine management interface
   - `components/HomeTraining/` - Home workout sessions
   - `components/Methodologie/` - AI methodology generation
   - `components/auth/` - Authentication
   - `components/ui/` - Reusable UI components

### Key Backend Components

#### Database Configuration (`backend/db.js`)

- Uses PostgreSQL with search_path set to `app,public`
- Connection pooling with SSL support for Supabase
- Automatic search_path configuration per connection

#### Server Entry Point (`backend/server.js`)

- Unified routing system with backward compatibility
- AI prompt preloading and API key validation
- Session maintenance system
- CORS configured for multiple frontend ports

#### Route Consolidation

- **NEW**: `/api/routine-generation/*` handles all routine generation (AI + manual)
- **NEW**: `/api/training-session/*` handles active workout sessions
- **NEW**: `/api/exercise-catalog/*` handles exercise database operations
- **LEGACY**: Older routes maintained for compatibility via aliases

### Frontend Architecture

#### Component Structure

- **Lazy Loading**: All major routes use React.lazy() for code splitting
- **Error Boundaries**: Each route wrapped with error handling
- **Context Providers**: Auth, User, Workout, and Trace contexts
- **Protected Routes**: Authentication-based route protection

#### Key Frontend Files

- `src/App.jsx` - Main application with lazy loading and route configuration
- `src/components/routines/RoutineScreen.jsx` - Primary routine management interface
- `src/contexts/` - Application state management
- `src/hooks/` - Custom React hooks

### Database Schema

The application uses a consolidated database structure:

#### Core Tables

- `users` / `user_profiles` - User authentication and profile data
- `methodology_plans` - Consolidated methodology and routine plans
- `historico_ejercicios` - Exercise history tracking
- `progreso_usuario` - User progress tracking

#### Exercise Catalogs

- `Ejercicios_Calistenia` - Calisthenics exercise database
- `Ejercicios_Hipertrofia` - Hypertrophy exercise database
- `hometraining_ejercicios` - Home training exercise database

#### Session Management

- Automatic cleanup of expired sessions
- Real-time session status tracking
- Manual maintenance endpoints available

## Environment Configuration

### Required Environment Variables

#### Backend (.env in backend/)

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:port/db
DB_SEARCH_PATH=app,public

# Authentication
JWT_SECRET=your_jwt_secret

# OpenAI Integration
OPENAI_API_KEY=sk-proj-your-key

# Server
PORT=3010
NODE_ENV=development
```

#### Frontend (.env in root)

```bash
# API Configuration
VITE_API_URL=http://localhost:3010
VITE_API_PORT=3010
VITE_PORT=5173
```

## AI Integration

### OpenAI Features

- **Routine Generation**: AI-powered workout routine creation
- **Exercise Analysis**: Video and photo correction
- **Nutrition Planning**: AI-generated nutrition advice
- **Methodology Creation**: Specialized training methodologies

### Prompt System

- Centralized prompt registry (`backend/lib/promptRegistry.js`)
- Feature-specific prompts for different AI modules
- Automatic prompt preloading on server startup

## Development Guidelines

### Code Style

- ESLint configuration with React hooks and refresh plugins
- Prettier for code formatting (runs on lint-staged)
- TailwindCSS for styling with dark theme customization

### File Organization

- Backend routes in `backend/routes/`
- Frontend components organized by feature in `src/components/`
- Shared utilities in `src/utils/` and `backend/utils/`
- Database queries and business logic separated

### Bundle Optimization

- Manual chunk splitting for vendor libraries (React, UI, charts, forms)
- Feature-based chunks (home-training, routines, methodologies, etc.)
- Lazy loading with Suspense boundaries
- Terser optimization with console removal in production

## Common Development Tasks

### Adding a New Exercise Type

1. Add to appropriate exercise catalog table
2. Update `backend/routes/exerciseCatalog.js`
3. Add frontend components in relevant module
4. Update AI prompts if needed

### Creating New Training Methodology

1. Use consolidated `routineGeneration.js` route
2. Add prompt to prompt registry
3. Update frontend methodology selection
4. Test with AI generation endpoint

## 🎯 METHODOLOGY FLOW SYSTEM (CORE ARCHITECTURE)

### Overview

The application uses a **unified flow system** where both AUTOMATIC and MANUAL methodology selection converge to the same generation endpoint, ensuring consistency and scalability.

### Flow Architecture

```
AUTOMATIC MODE:
  User clicks "Activar IA"
  → AI analyzes profile and proposes routine
  → Modal with proposal (includes "Generate another" + exercise feedback)
  → User accepts
  → WarmupModal.jsx → RoutineSessionModal.jsx → Navigate to TodayTrainingTab.jsx

MANUAL MODE:
  User clicks methodology card (Calistenia, Hipertrofia, etc.)
  → MethodologyCard.jsx (evaluation)
  → Training generation
  → Modal with proposal
  → User accepts
  → WarmupModal.jsx → RoutineSessionModal.jsx → Navigate to TodayTrainingTab.jsx

CONVERGENCE POINT: Both modes end up calling generatePlan() from WorkoutContext
```

### Intelligent Redirection System

**Location**: `backend/server.js` (lines 167-201)

```javascript
// 🎯 SMART METHODOLOGY ROUTING
app.use("/api/methodology", (req, res, next) => {
  if (req.path.includes("generate")) {
    const { mode, metodologia_solicitada } = req.body;

    // MANUAL: User chose specific methodology
    if (mode === "manual" || metodologia_solicitada) {
      const metodologia = (metodologia_solicitada || mode || "").toLowerCase();

      if (metodologia === "calistenia") {
        req.url = "/api/routine-generation/manual/calistenia";
      } else if (metodologia === "oposicion") {
        req.url = "/api/routine-generation/specialist/oposicion";
      } else if (metodologia === "hipertrofia") {
        req.url = "/api/routine-generation/specialist/hipertrofia";
      } else {
        req.url = "/api/routine-generation/manual/methodology";
      }
    } else {
      // AUTOMATIC: AI decides methodology
      req.url = "/api/routine-generation/ai/methodology";
    }
  }
  next();
});
```

### Scalability Pattern

**To add a new methodology**, only add **ONE LINE**:

```javascript
} else if (metodologia === 'crossfit') {
  req.url = req.url.replace('/api/methodology', '/api/routine-generation/specialist/crossfit');
} else if (metodologia === 'powerlifting') {
  req.url = req.url.replace('/api/methodology', '/api/routine-generation/specialist/powerlifting');
```

### Key Benefits

1. **Unified Endpoint**: Frontend always calls `/api/methodology/generate`
2. **Smart Routing**: Backend redirects based on methodology type
3. **Zero Breaking Changes**: Existing code continues working
4. **Infinite Scalability**: New methodologies = 1 line of code
5. **Consistent Flow**: Both modes converge to same user experience

### Methodology Types

#### Specialist Routes (Advanced AI)

- **Calistenia**: `/api/routine-generation/specialist/calistenia/*`
- **Oposiciones**: `/api/routine-generation/specialist/oposicion/*`
- **Hipertrofia**: `/api/routine-generation/specialist/hipertrofia/*`
- **CrossFit**: `/api/routine-generation/specialist/crossfit/*`
- **Powerlifting**: `/api/routine-generation/specialist/powerlifting/*`

#### Manual Routes (User-driven)

- **Generic Manual**: `/api/routine-generation/manual/methodology`
- **Calistenia Manual**: `/api/routine-generation/manual/calistenia`

#### AI Routes (Automatic)

- **AI Decision**: `/api/routine-generation/ai/methodology`
- **Gym Routines**: `/api/routine-generation/ai/gym-routine`

### Frontend Integration

**Component Flow**:

1. `MethodologiesScreen.jsx` - Main selection interface
2. `handleManualCardClick()` - Detects methodology and calls modal
3. `handleActivateIA()` - For automatic mode
4. `WorkoutContext.generatePlan()` - Unified generation endpoint
5. Modal chain: Proposal → Warmup → Session → Training

### Request Format

```javascript
// Frontend sends this to /api/methodology/generate
{
  "mode": "manual" | "automatic",
  "metodologia_solicitada": "calistenia" | "hipertrofia" | "oposicion" | ...,
  // ... other parameters
}

// Backend intelligently routes to appropriate specialist
```

### Debug & Monitoring

The system includes comprehensive logging:

```javascript
console.log(
  `🔀 Redirección metodología: mode=${mode}, metodologia=${metodologia_solicitada}`,
);
console.log(`🎯 Redirigiendo a: ${req.url}`);
```

### IMPORTANT NOTES

- **NEVER modify the frontend flow** - it's designed to be methodology-agnostic
- **Always use the redirection system** for new methodologies
- **Each methodology can have unique logic** in its specialist route
- **The convergence point ensures consistent UX** across all methodologies
- **This system is the CORE of the entire application** - handle with care

### Database Schema Changes

1. Update schema SQL files
2. Run migrations through database client
3. Update relevant model interfaces
4. Test with existing data

### Debugging Common Issues

- **Port conflicts**: Check environment variables and running processes
- **Database connection**: Verify search_path and credentials
- **AI features**: Check API keys and prompt loading
- **CORS issues**: Verify frontend URL in backend CORS config
