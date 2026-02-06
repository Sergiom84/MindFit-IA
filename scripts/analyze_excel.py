"""
Script para analizar los archivos Excel del Módulo Nutrición
"""
import pandas as pd
import os
import sys
from pathlib import Path

# Configurar encoding para Windows
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

# Ruta base
base_path = Path(r"C:\Users\sergi\Desktop\Aplicaciones\Entrenaconia\Módulo Nutrición")

# Archivos a analizar
excel_files = [
    "actualizado.Base_Alimentos.xlsx",
    "Base alimentos.xlsx",
    "Biblioteca_Platos_Plantillas_.xlsx",
    "Omnivoros.xlsx",
    "Vegetariano.xlsx"
]

print("=" * 80)
print("ANALISIS DE ARCHIVOS EXCEL - MODULO NUTRICION")
print("=" * 80)

for excel_file in excel_files:
    file_path = base_path / excel_file

    if not file_path.exists():
        print(f"\n[X] Archivo no encontrado: {excel_file}")
        continue

    print(f"\n{'=' * 80}")
    print(f"ARCHIVO: {excel_file}")
    print(f"{'=' * 80}")

    try:
        # Leer todas las hojas del Excel
        excel_data = pd.ExcelFile(file_path)
        sheet_names = excel_data.sheet_names

        print(f"\nHojas encontradas: {len(sheet_names)}")
        print(f"   {', '.join(sheet_names)}")

        # Analizar cada hoja
        for sheet_name in sheet_names:
            print(f"\n{'-' * 80}")
            print(f"HOJA: {sheet_name}")
            print(f"{'-' * 80}")

            df = pd.read_excel(file_path, sheet_name=sheet_name)

            print(f"\nDimensiones: {df.shape[0]} filas x {df.shape[1]} columnas")

            print(f"\nColumnas ({len(df.columns)}):")
            for i, col in enumerate(df.columns, 1):
                print(f"   {i:2d}. {col}")

            print(f"\nPrimeras 5 filas:")
            print(df.head().to_string())

            # Información adicional sobre columnas
            print(f"\nTipos de datos:")
            print(df.dtypes.to_string())

            # Verificar valores nulos
            null_counts = df.isnull().sum()
            if null_counts.sum() > 0:
                print(f"\n[!] Valores nulos por columna:")
                print(null_counts[null_counts > 0].to_string())

            # Algunas estadísticas para columnas numéricas
            numeric_cols = df.select_dtypes(include=['number']).columns
            if len(numeric_cols) > 0:
                print(f"\nEstadisticas de columnas numericas:")
                print(df[numeric_cols].describe().to_string())

    except Exception as e:
        print(f"\n[X] Error al procesar {excel_file}: {str(e)}")
        import traceback
        traceback.print_exc()

print(f"\n{'=' * 80}")
print("[OK] Analisis completado")
print(f"{'=' * 80}")
