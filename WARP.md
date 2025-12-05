# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

## ⚠️ MANDATORY RULES (READ FIRST)

**Before ANY action, consult `CLAUDE_RULES.md` for obligatory guidelines:**

- Only execute what is explicitly requested
- Do NOT add extra code or features beyond the specific task
- Do NOT invent new functions unless explicitly asked
- Make improvement proposals but do NOT implement them until requested
- Do NOT modify unrelated code
- NEVER restart frontend/backend without asking first

## Development Commands

### Quick Start

```bash
# 🚀 RECOMMENDED: Auto-start with port synchronization
npm run dev:auto

# Start both frontend and backend concurrently
npm run dev:all

# Install all dependencies (frontend + backend)
npm run install:all
```

### Frontend Development

```bash
# Start frontend dev server (default port 5173)
npm run dev

# Start with port verification
npm run dev:sync

# Build for production
npm run build

# Preview production build
npm run preview

# Run linter
npm run lint
```

### Backend Development

```bash
# Start backend dev server (port 3010)
npm run dev:backend

# Start backend with debug logging
npm run dev:backend:debug

# From backend directory
cd backend && npm run dev

# Production mode
cd backend && npm start
```

### Port Management

```bash
# Verify and update port configuration
npm run check-ports

# Monitor connectivity continuously
npm run monitor

# Interactive port sync script (Windows)
scripts\sync-dev.bat
```

**Port Configuration:**

- Frontend: Port 5173 (configurable via VITE_PORT)
- Backend: Port 3010 (DO NOT change - hardcoded in multiple places)
- Auto-sync scripts keep frontend/backend synchronized

### Production Monitoring (Render CLI)

```bash
# Login to Render (first time only)
npm run render:login

# List all services
npm run render:services

# View logs in real-time
npm run render:tail

# View recent logs (Linux/WSL)
npm run render:logs view backend

# Windows
npm run render:logs:win view backend
```

See `docs/QUICK_START_RENDER_LOGS.md` for complete monitoring documentation.

### Linting & Code Quality

```bash
# Run ESLint on codebase
npm run lint

# Lint with auto-fix (runs on pre-commit)
npx eslint --config .eslint.config.mjs --fix .

# Pre-commit hook (runs automatically)
npm run pre-commit
```

### Testing

```bash
# Tests not configured yet (placeholder)
npm test

# Playwright E2E tests (manual run)
npx playwright test

# Show Playwright report
npx playwright show-report
```

**Note:** Unit tests are not configured. Only Playwright E2E tests exist in `tests/` directory.

## High-Level Architecture

### Technology Stack

- **Frontend:** React 19 + Vite 6 + TailwindCSS 3
- **Backend:** Node.js 18+ + Express 4 + PostgreSQL
- **Database:** Supabase PostgreSQL (schema: `app,public`)
- **AI Integration:** OpenAI GPT-4 for routine generation, corrections, and nutrition
- **Authentication:** JWT tokens (managed via `backend/middleware/auth.js`)
- **File Uploads:** Multer for videos, PDFs, Excel files

### Unified Route System (Core Architecture)

The application uses a **consolidated routing architecture** where all training-related functionality flows through three main API groups:

#### 1. `/api/routine-generation` - Routine Generation (AI + Manual)

Handles all methodology-based routine creation:

- **AI Routes:** `/api/routine-generation/ai/*` - Automatic AI-driven generation
- **Manual Routes:** `/api/routine-generation/manual/*` - User-selected methodologies
- **Specialist Routes:** `/api/routine-generation/specialist/{methodology}/*`
  - Calistenia, Hipertrofia, Oposiciones, CrossFit, Powerlifting

#### 2. `/api/training-session` - Active Training Sessions

Manages workout execution and real-time tracking:

- Session creation, updates, and completion
- Exercise logging and progress tracking
- Real-time session status monitoring

#### 3. `/api/exercise-catalog` - Exercise Database

Centralized exercise management:

- Calisthenics, Hypertrophy, Home Training catalogs
- Exercise metadata, progressions, and variations

### Intelligent Methodology Routing

**Location:** `backend/server.js` (lines 167-201)

The application uses a **smart redirection system** that routes methodology requests to appropriate specialists:

```javascript
// Frontend always calls: /api/methodology/generate
// Backend intelligently routes based on:
// - mode: "manual" | "automatic"
// - metodologia_solicitada: "calistenia" | "hipertrofia" | "oposicion" | etc.

// Example: Manual Calistenia → /api/routine-generation/specialist/calistenia
//          Automatic → /api/routine-generation/ai/methodology
```

**Key Benefits:**

- Frontend is methodology-agnostic (calls one endpoint)
- Backend routes to specialized handlers
- New methodologies require only ONE line of code
- Zero breaking changes when adding features

### Frontend Architecture

#### Component Organization

```
src/components/
  ├── auth/              - Login, Register, authentication flows
  ├── routines/          - Main routine management (RoutineScreen.jsx)
  ├── Methodologie/      - Methodology selection and AI generation
  ├── HomeTraining/      - Home workout sessions
  ├── Oposiciones/       - Competition prep methodologies
  ├── HipertrofiaV2/     - Hypertrophy-specific training
  ├── nutrition/         - Nutrition planning and AI advice
  ├── profile/           - User profile and settings
  ├── progress/          - Progress tracking and analytics
  ├── VideoCorrection/   - AI video/photo analysis
  ├── ui/                - Reusable UI components (buttons, modals, etc.)
  └── dev/               - Development tools (TraceConsole)
```

#### Performance Optimization

- **Lazy Loading:** All major routes use `React.lazy()` for code splitting
- **Manual Chunk Splitting:** Vendor libraries separated (React, UI, charts, forms)
- **Feature-based Chunks:** Training modules bundled independently
- **Suspense Boundaries:** Loading states prevent render blocking
- **Bundle Size:** Initial bundle reduced by ~40% via optimization

#### State Management

- **Contexts:** Auth, User, Workout, Trace
- **Custom Hooks:** `useMusicSync`, `useWorkoutTimer`, etc.
- **Protected Routes:** Authentication-based route guards

### Backend Architecture

#### Key Files

- `backend/server.js` - Entry point, routing, middleware, AI prompt preloading
- `backend/db.js` - PostgreSQL connection pool with `search_path` configuration
- `backend/lib/promptRegistry.js` - Centralized AI prompt management
- `backend/lib/openaiClient.js` - OpenAI API wrapper and key validation
- `backend/middleware/auth.js` - JWT authentication middleware

#### Route Organization

**Consolidated Routes (New Architecture):**

- `backend/routes/routineGeneration.js` - All routine generation logic
- `backend/routes/trainingSession.js` - Session management
- `backend/routes/exerciseCatalog.js` - Exercise database operations

**Supporting Routes:**

- `backend/routes/auth.js` - User authentication
- `backend/routes/users.js` - User profile management
- `backend/routes/nutrition.js` / `nutritionV2.js` - Nutrition features
- `backend/routes/aiVideoCorrection.js` - Video analysis
- `backend/routes/aiPhotoCorrection.js` - Photo analysis
- `backend/routes/bodyComposition.js` - Body metrics tracking
- `backend/routes/analytics.js` - Progress analytics
- `backend/routes/music.js` - Workout music integration

**Legacy Routes (Compatibility):**

- `backend/routes/routines.js` - Older routine system (redirects to new system)
- `backend/routes/homeTraining.js` - Older home training (redirects to new system)

### Database Schema

#### Core Tables

- `users` / `user_profiles` - Authentication and profile data
- `methodology_plans` - Consolidated methodology and routine plans
- `historico_ejercicios` - Exercise history tracking
- `progreso_usuario` - User progress and achievements

#### Exercise Catalogs

- `Ejercicios_Calistenia` - Calisthenics exercise database
- `Ejercicios_Hipertrofia` - Hypertrophy exercise database
- `hometraining_ejercicios` - Home training exercise database

#### Session Management

- Automatic cleanup of expired sessions (via `backend/jobs/sessionCleanupJob.js`)
- Missed session detection (via `backend/jobs/missedSessionsJob.js`)
- Real-time session status tracking

### AI Integration

#### OpenAI Features

- **Routine Generation:** AI-powered workout routine creation
- **Exercise Analysis:** Video and photo correction with feedback
- **Nutrition Planning:** Personalized diet recommendations
- **Methodology Creation:** Specialized training methodologies (Calistenia, Hipertrofia, etc.)

#### Prompt System

- Centralized prompt registry (`backend/lib/promptRegistry.js`)
- Feature-specific prompts for different AI modules
- Automatic prompt preloading on server startup
- API key validation on initialization

## Environment Configuration

### Backend (.env in backend/)

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

### Frontend (.env.local in root)

```bash
# API Configuration
VITE_API_URL=http://localhost:3010
VITE_API_PORT=3010
VITE_PORT=5173
```

## Methodology Flow System (Critical Architecture)

### Overview

Both AUTOMATIC (AI-driven) and MANUAL (user-selected) methodologies converge to the same generation endpoint, ensuring consistency.

### Flow Architecture

```
AUTOMATIC MODE:
  User clicks "Activar IA"
  → AI analyzes profile and proposes routine
  → Modal with proposal
  → User accepts
  → WarmupModal → RoutineSessionModal → Navigate to TodayTrainingTab

MANUAL MODE:
  User clicks methodology card (Calistenia, Hipertrofia, etc.)
  → MethodologyCard.jsx evaluation
  → Training generation
  → Modal with proposal
  → User accepts
  → WarmupModal → RoutineSessionModal → Navigate to TodayTrainingTab

CONVERGENCE POINT: Both modes call generatePlan() from WorkoutContext
```

### Adding New Methodologies

To add a new methodology, add **ONE LINE** to `backend/server.js`:

```javascript
} else if (metodologia === 'crossfit') {
  req.url = '/api/routine-generation/specialist/crossfit';
```

Then create the specialist route in `backend/routes/routineGeneration.js`.

## Development Guidelines

### Code Style

- **ESLint:** Configured with React hooks and refresh plugins (`.eslint.config.mjs`)
- **Prettier:** Auto-format on commit via lint-staged
- **TailwindCSS:** Dark theme by default, utility-first styling
- **No unused vars:** Warnings only (doesn't break CI)

### File Naming Conventions

- **Components:** PascalCase (e.g., `RoutineScreen.jsx`)
- **Hooks:** camelCase with `use` prefix (e.g., `useMusicSync.js`)
- **Utilities:** camelCase (e.g., `sessionMaintenance.js`)
- **Routes:** camelCase (e.g., `routineGeneration.js`)

### Bundle Optimization Strategy

- **Vendor Chunks:** React, UI libraries, charts, forms separated
- **Feature Chunks:** Home-training, routines, methodologies, nutrition, profile
- **Core Logic:** Hooks and contexts bundled together
- **Terser:** Console logs removed in production
- **Inline Assets:** Files < 4KB inlined

### Common Patterns

#### Adding a New Exercise Type

1. Add to appropriate exercise catalog table in database
2. Update `backend/routes/exerciseCatalog.js` with new endpoints
3. Add frontend components in relevant module (e.g., `src/components/routines/`)
4. Update AI prompts if AI generation is needed

#### Creating a New Training Methodology

1. Add redirect in `backend/server.js` methodology router
2. Create specialist route in `backend/routes/routineGeneration.js`
3. Add prompt to `backend/lib/promptRegistry.js`
4. Update frontend methodology selection in `MethodologiesScreen.jsx`
5. Test with AI generation endpoint

#### Debugging Common Issues

- **Port Conflicts:** Run `npm run check-ports` to auto-detect and fix
- **Database Connection:** Check `DB_SEARCH_PATH=app,public` and credentials
- **AI Features:** Verify `OPENAI_API_KEY` and check server startup logs for prompt loading
- **CORS Issues:** Ensure frontend port is in `backend/server.js` CORS config (lines 122-131)
- **Session Issues:** Check `backend/jobs/sessionCleanupJob.js` logs

## Important Notes

### DO NOT modify:

- The frontend methodology flow system - it's methodology-agnostic by design
- Backend port 3010 - hardcoded in multiple places
- The convergence point in `WorkoutContext.generatePlan()`

### ALWAYS:

- Use the intelligent redirection system for new methodologies
- Follow the MANDATORY RULES in `CLAUDE_RULES.md`
- Test both automatic and manual flows when modifying methodology logic
- Run `npm run lint` before committing
- Update this WARP.md if you add major architectural changes
