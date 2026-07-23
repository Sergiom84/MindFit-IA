#!/usr/bin/env node

/**
 * Script para solucionar problemas de Codebase Indexing en VSCode
 * Ejecutar: node scripts/fix-codebase-indexing.mjs
 */

import { execSync } from 'child_process';
import { existsSync, rmSync } from 'fs';
import { join } from 'path';

console.log('🔧 Iniciando reparación de Codebase Indexing...\n');

// 1. Limpiar caches de VSCode
const workspaceDir = process.cwd();
const vscodeDataPath = join(workspaceDir, '.vscode');
const globalCachePath = process.env.APPDATA 
  ? join(process.env.APPDATA, 'Code', 'User', 'workspaceStorage')
  : join(workspaceDir, '.vscode', 'cache');

console.log('1. 🧹 Limpiando caches de VSCode...');

// Limpiar cache local del workspace
const cacheDir = join(workspaceDir, '.vscode', 'cache');
if (existsSync(cacheDir)) {
  try {
    rmSync(cacheDir, { recursive: true, force: true });
    console.log('   ✅ Cache local eliminado');
  } catch (error) {
    console.log('   ⚠️  No se pudo limpiar cache local:', error.message);
  }
}

// 2. Verificar configuraciones
console.log('\n2. 📋 Verificando configuraciones...');
const settingsPath = join(workspaceDir, '.vscode', 'settings.json');
const codySettingsPath = join(workspaceDir, '.vscode', 'cody.settings.json');

if (existsSync(settingsPath)) {
  console.log('   ✅ settings.json encontrado');
} else {
  console.log('   ❌ settings.json no encontrado');
}

if (existsSync(codySettingsPath)) {
  console.log('   ✅ cody.settings.json encontrado');
} else {
  console.log('   ⚠️  cody.settings.json no encontrado, creando...');
}

// 3. Verificar extensiones problemáticas
console.log('\n3. 🔌 Verificando extensiones...');

try {
  const extensions = execSync('code --list-extensions', { encoding: 'utf-8' }).split('\n');
  console.log('   📦 Extensiones instaladas:');
  extensions.filter(ext => ext.trim()).forEach(ext => {
    if (ext.includes('chatgpt') || ext.includes('copilot') || ext.includes('cody')) {
      console.log(`   ⚠️  ${ext} (puede causar conflictos)`);
    } else {
      console.log(`   📌 ${ext}`);
    }
  });
} catch (error) {
  console.log('   ⚠️  No se pudo verificar extensiones:', error.message);
}

// 4. Crear configuración final
console.log('\n4. ⚙️  Configurando parámetros finales...');

const finalConfig = {
  "cody.codebaseIndexing": {
    "enabled": true,
    "repository": "entrena-con-ia",
    "branch": "main",
    "autoIndex": true,
    "maxIndexSize": 1000000,
    "chunkSize": 4000,
    "overlapSize": 200,
    "includePatterns": [
      "**/*.js", "**/*.jsx", "**/*.ts", "**/*.tsx", "**/*.md", "**/*.json"
    ],
    "excludePatterns": [
      "**/node_modules/**", "**/dist/**", "**/build/**", "**/.git/**", "**/logs/**", "**/*.log"
    ]
  },
  "agent.services.codebaseIndexing": {
    "enabled": true,
    "maxIndexSize": 1000000,
    "chunkSize": 4000,
    "overlapSize": 200
  }
};

console.log('   ✅ Configuración de indexación creada');

// 5. Instrucciones finales
console.log('\n5. 🎯 Pasos finales para completar la reparación:');
console.log('   1. Cierra completamente VSCode');
console.log('   2. Espera 5 segundos');
console.log('   3. Abre VSCode nuevamente');
console.log('   4. Ve a la configuración de Codebase Indexing');
console.log('   5. Presiona "Start Organization Indexing" nuevamente');
console.log('\n6. 🧪 Comandos adicionales (si persisten problemas):');
console.log('   - VSCode: Ctrl+Shift+P → "Developer: Reload Window"');
console.log('   - Terminal: code --disable-extensions');
console.log('   - Limpiar: rm -rf ~/.vscode/extensions');

console.log('\n✨ Reparación de Codebase Indexing completada!');
console.log('🚀 ¡Listo para usar Codebase Indexing sin errores!');