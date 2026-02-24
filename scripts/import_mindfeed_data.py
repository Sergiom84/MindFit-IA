"""
Importador de alimentos MindFeed a Supabase.

Hace UPSERT en app.foods usando slug como clave estable.
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

import pandas as pd
import psycopg2
from dotenv import load_dotenv


env_path = Path(__file__).parent.parent / "backend" / ".env"
load_dotenv(env_path)

DB_CONFIG = {
  "host": os.getenv("DB_HOST"),
  "port": os.getenv("DB_PORT"),
  "database": os.getenv("DB_NAME"),
  "user": os.getenv("DB_USER"),
  "password": os.getenv("DB_PASSWORD"),
  "options": f"-c search_path={os.getenv('DB_SEARCH_PATH', 'app,public')}"
}

ALLOWED_ESTADOS = {"crudo", "cocido", "escurrido", "seco", "tal_cual"}
VEGAN_BLOCKER_TAGS = {
  "lacteos",
  "lacteo",
  "lacteos",
  "huevo",
  "huevos",
  "pescado",
  "marisco",
  "carne",
  "pollo",
  "ternera",
  "cerdo"
}

VALID_CATEGORIAS = {
  "Proteína animal", "Huevo", "Proteína vegetal", "Legumbre",
  "Carbohidrato", "Verdura", "Fruta", "Lácteo", "Grasa",
  "Suplemento", "Bebida", "Otros"
}


def strip_accents(value):
  if value is None:
    return ""
  text = str(value)
  normalized = unicodedata.normalize("NFKD", text)
  return "".join(c for c in normalized if not unicodedata.combining(c))


def normalizar_slug(texto):
  if pd.isna(texto) or str(texto).strip() == "":
    return None

  slug = strip_accents(texto).lower()
  slug = re.sub(r"[^a-z0-9]+", "_", slug)
  slug = re.sub(r"_+", "_", slug).strip("_")
  return slug or None


def normalizar_tags(tags_str):
  if pd.isna(tags_str) or str(tags_str).strip() == "":
    return []

  seen = set()
  tags = []
  for raw in str(tags_str).split(","):
    tag = strip_accents(raw).strip().lower()
    if not tag or tag in seen:
      continue
    seen.add(tag)
    tags.append(tag)
  return tags


def normalizar_sustituibles(sust_str):
  if pd.isna(sust_str) or str(sust_str).strip() == "":
    return []

  seen = set()
  items = []
  for raw in str(sust_str).split(";"):
    slug = normalizar_slug(raw)
    if not slug or slug in seen:
      continue
    seen.add(slug)
    items.append(slug)
  return items


def normalizar_estado(estado):
  if pd.isna(estado) or str(estado).strip() == "":
    return None

  raw = strip_accents(estado).strip().lower()
  normalized = raw.replace("-", "_").replace(" ", "_")

  aliases = {
    "talcual": "tal_cual",
    "tal_cual": "tal_cual",
    "tal_cuall": "tal_cual",
    "estandar": "tal_cual",
    "estandard": "tal_cual",
    "seca": "seco"
  }
  normalized = aliases.get(normalized, normalized)
  return normalized if normalized in ALLOWED_ESTADOS else None


def normalizar_tipo_dieta(tipo_dieta):
  if pd.isna(tipo_dieta) or str(tipo_dieta).strip() == "":
    return None

  normalized = strip_accents(tipo_dieta).strip().lower()
  mapping = {
    "omnivoro": "Omnívoro",
    "ambos": "Ambos",
    "vegetariano": "Vegetariano",
    "vegano": "Vegano"
  }
  return mapping.get(normalized)


def determinar_flags_dieta(tags, tipo_dieta):
  tags_set = {strip_accents(t).lower() for t in tags}
  has_vegan_tag = "vegano" in tags_set or "vegan" in tags_set
  has_vegetarian_tag = "vegetariano" in tags_set
  has_vegan_blocker = any(tag in VEGAN_BLOCKER_TAGS for tag in tags_set)

  if tipo_dieta == "Omnívoro":
    return False, False

  if tipo_dieta == "Vegano":
    return True, True

  if tipo_dieta == "Vegetariano":
    return True, has_vegan_tag and not has_vegan_blocker

  if tipo_dieta == "Ambos":
    return True, has_vegan_tag and not has_vegan_blocker

  # Fallback si tipo_dieta viene vacio
  is_vegan = has_vegan_tag and not has_vegan_blocker
  is_vegetarian = is_vegan or has_vegetarian_tag
  return is_vegetarian, is_vegan


def limpiar_valor_numerico(valor):
  if pd.isna(valor):
    return None
  try:
    return float(valor)
  except (ValueError, TypeError):
    return None


def limpiar_valor_entero(valor):
  if pd.isna(valor):
    return None
  try:
    return int(float(valor))
  except (ValueError, TypeError):
    return None


def validar_db_config():
  required_keys = ["host", "port", "database", "user", "password"]
  missing = [k for k in required_keys if not DB_CONFIG.get(k)]
  if missing:
    raise RuntimeError(
      f"Faltan variables de entorno para conexion DB: {', '.join(missing)}. "
      "Revisa backend/.env"
    )


def procesar_alimentos(excel_path):
  print(f"Leyendo Excel: {excel_path}")

  df = pd.read_excel(excel_path, sheet_name="Base", header=None)
  df = df.iloc[3:].reset_index(drop=True)

  columnas = {
    0: "nombre",
    1: "peso_ref",
    2: "kcal",
    3: "proteinas",
    4: "grasas",
    5: "carbohidratos",
    6: "estado",
    7: "categoria_excel",
    8: "tipo_dieta",
    9: "porcion_tipica",
    10: "tags_alergenos",
    11: "notas",
    12: "id_alimento",
    13: "fibra",
    14: "medida_casera",
    15: "sustituible_por",
    16: "estado_pesado_base",
    17: "metodo_preparacion",
    18: "estado_mostrado_default",
    19: "grupo_factor",
    20: "sustituible_por_id"
  }
  df = df.rename(columns=columnas)

  print(f"Filas leidas: {len(df)}")

  alimentos = []
  stats = {
    "unknown_categoria": 0,
    "invalid_estado_base": 0,
    "invalid_estado_default": 0,
    "invalid_tipo_dieta": 0,
    "omnivoro_with_veg_tags": 0
  }

  for idx, row in df.iterrows():
    if pd.isna(row["nombre"]) or str(row["nombre"]).strip() == "":
      continue

    slug = (
      normalizar_slug(row["id_alimento"])
      if not pd.isna(row["id_alimento"])
      else normalizar_slug(row["nombre"])
    )
    if not slug:
      print(f"Fila {idx}: slug vacio, se omite")
      continue

    macros_100g = {
      "kcal": limpiar_valor_numerico(row["kcal"]),
      "protein_g": limpiar_valor_numerico(row["proteinas"]),
      "fat_g": limpiar_valor_numerico(row["grasas"]),
      "carbs_g": limpiar_valor_numerico(row["carbohidratos"])
    }

    tags = normalizar_tags(row["tags_alergenos"])
    tipo_dieta = normalizar_tipo_dieta(row["tipo_dieta"])

    categoria_raw = (
      str(row["categoria_excel"]).strip()
      if not pd.isna(row["categoria_excel"])
      else None
    )
    categoria = categoria_raw if categoria_raw in VALID_CATEGORIAS else None
    if categoria_raw and categoria is None:
      stats["unknown_categoria"] += 1

    estado_base = normalizar_estado(row["estado_pesado_base"])
    if not pd.isna(row["estado_pesado_base"]) and estado_base is None:
      stats["invalid_estado_base"] += 1

    estado_default = normalizar_estado(row["estado_mostrado_default"])
    if not pd.isna(row["estado_mostrado_default"]) and estado_default is None:
      stats["invalid_estado_default"] += 1

    if not pd.isna(row["tipo_dieta"]) and tipo_dieta is None:
      stats["invalid_tipo_dieta"] += 1

    if tipo_dieta == "Omnívoro" and ("vegetariano" in tags or "vegano" in tags):
      stats["omnivoro_with_veg_tags"] += 1

    is_vegetarian, is_vegan = determinar_flags_dieta(tags, tipo_dieta)
    equivalencias = normalizar_sustituibles(row["sustituible_por_id"])

    alimento = {
      "slug": slug,
      "nombre": str(row["nombre"]).strip(),
      "categoria": categoria,
      "categoria_detalle": categoria,
      "macros_100g": macros_100g,
      "fibra_100g": limpiar_valor_numerico(row["fibra"]),
      "porcion_tipica_g": limpiar_valor_entero(row["porcion_tipica"]),
      "estado_pesado_base": estado_base,
      "estado_pesado_mostrado_default": estado_default,
      "metodo_preparacion": str(row["metodo_preparacion"]).strip() if not pd.isna(row["metodo_preparacion"]) else None,
      "grupo_factor": strip_accents(row["grupo_factor"]).strip().lower() if not pd.isna(row["grupo_factor"]) else None,
      "medida_casera": str(row["medida_casera"]).strip() if not pd.isna(row["medida_casera"]) else None,
      "tipo_dieta": tipo_dieta,
      "is_vegetarian": is_vegetarian,
      "is_vegan": is_vegan,
      "tags": tags,
      "equivalencias": equivalencias,
      "is_verified": True,
      "source": "mindfeed_excel"
    }
    alimentos.append(alimento)

  print(f"Alimentos procesados correctamente: {len(alimentos)}")
  print("Avisos de calidad de datos:")
  for key, value in stats.items():
    print(f"  - {key}: {value}")
  return alimentos


def insertar_alimentos(alimentos):
  print("\nConectando a Supabase...")
  validar_db_config()

  conn = psycopg2.connect(**DB_CONFIG)
  cursor = conn.cursor()
  conn.autocommit = False

  print(f"Conexion establecida. Upsert de {len(alimentos)} alimentos.\n")

  upsert_query = """
    INSERT INTO app.foods (
      slug, nombre, categoria, categoria_detalle, macros_100g, fibra_100g,
      porcion_tipica_g, estado_pesado_base, estado_pesado_mostrado_default,
      metodo_preparacion, grupo_factor, medida_casera, tipo_dieta,
      is_vegetarian, is_vegan, tags, equivalencias, is_verified, source
    ) VALUES (
      %(slug)s, %(nombre)s, %(categoria)s, %(categoria_detalle)s, %(macros_100g)s, %(fibra_100g)s,
      %(porcion_tipica_g)s, %(estado_pesado_base)s, %(estado_pesado_mostrado_default)s,
      %(metodo_preparacion)s, %(grupo_factor)s, %(medida_casera)s, %(tipo_dieta)s,
      %(is_vegetarian)s, %(is_vegan)s, %(tags)s, %(equivalencias)s, %(is_verified)s, %(source)s
    )
    ON CONFLICT (slug)
    DO UPDATE SET
      nombre = EXCLUDED.nombre,
      categoria = EXCLUDED.categoria,
      categoria_detalle = EXCLUDED.categoria_detalle,
      macros_100g = EXCLUDED.macros_100g,
      fibra_100g = EXCLUDED.fibra_100g,
      porcion_tipica_g = EXCLUDED.porcion_tipica_g,
      estado_pesado_base = EXCLUDED.estado_pesado_base,
      estado_pesado_mostrado_default = EXCLUDED.estado_pesado_mostrado_default,
      metodo_preparacion = EXCLUDED.metodo_preparacion,
      grupo_factor = EXCLUDED.grupo_factor,
      medida_casera = EXCLUDED.medida_casera,
      tipo_dieta = EXCLUDED.tipo_dieta,
      is_vegetarian = EXCLUDED.is_vegetarian,
      is_vegan = EXCLUDED.is_vegan,
      tags = EXCLUDED.tags,
      equivalencias = EXCLUDED.equivalencias,
      is_verified = EXCLUDED.is_verified,
      source = EXCLUDED.source,
      updated_at = NOW()
    RETURNING (xmax = 0) AS inserted;
  """

  update_by_name_query = """
    UPDATE app.foods
    SET
      slug = COALESCE(app.foods.slug, %(slug)s),
      nombre = %(nombre)s,
      categoria = %(categoria)s,
      categoria_detalle = %(categoria_detalle)s,
      macros_100g = %(macros_100g)s,
      fibra_100g = %(fibra_100g)s,
      porcion_tipica_g = %(porcion_tipica_g)s,
      estado_pesado_base = %(estado_pesado_base)s,
      estado_pesado_mostrado_default = %(estado_pesado_mostrado_default)s,
      metodo_preparacion = %(metodo_preparacion)s,
      grupo_factor = %(grupo_factor)s,
      medida_casera = %(medida_casera)s,
      tipo_dieta = %(tipo_dieta)s,
      is_vegetarian = %(is_vegetarian)s,
      is_vegan = %(is_vegan)s,
      tags = %(tags)s,
      equivalencias = %(equivalencias)s,
      is_verified = %(is_verified)s,
      source = %(source)s,
      updated_at = NOW()
    WHERE lower(nombre) = lower(%(nombre)s)
    RETURNING id;
  """

  inserted = 0
  updated = 0
  errores = 0

  try:
    for idx, alimento in enumerate(alimentos, start=1):
      cursor.execute("SAVEPOINT sp_food_upsert;")
      try:
        params = alimento.copy()
        params["macros_100g"] = json.dumps(params["macros_100g"])
        params["tags"] = json.dumps(params["tags"])
        params["equivalencias"] = json.dumps(params["equivalencias"])

        cursor.execute(upsert_query, params)
        result = cursor.fetchone()

        if result and result[0] is True:
          inserted += 1
        else:
          updated += 1

        if idx % 50 == 0:
          print(f"  Procesados: {idx}")
      except Exception as exc:
        cursor.execute("ROLLBACK TO SAVEPOINT sp_food_upsert;")

        # Si falla por unique nombre (ux_foods_nombre), actualiza por nombre
        # para absorber los registros legacy sin slug.
        if "ux_foods_nombre" in str(exc):
          try:
            cursor.execute(update_by_name_query, params)
            updated_row = cursor.fetchone()
            if updated_row:
              updated += 1
              continue
          except Exception as fallback_exc:
            cursor.execute("ROLLBACK TO SAVEPOINT sp_food_upsert;")
            errores += 1
            print(f"  Error fallback nombre slug={alimento['slug']}: {fallback_exc}")
            continue

        errores += 1
        print(f"  Error con slug={alimento['slug']}: {exc}")

    conn.commit()
  finally:
    cursor.close()
    conn.close()

  print("\nResumen importacion:")
  print(f"  - Total intentados: {len(alimentos)}")
  print(f"  - Insertados: {inserted}")
  print(f"  - Actualizados: {updated}")
  print(f"  - Errores: {errores}")

  return {"inserted": inserted, "updated": updated, "errores": errores}


def validar_importacion():
  print("\nValidando datos en Supabase...")
  validar_db_config()

  conn = psycopg2.connect(**DB_CONFIG)
  cursor = conn.cursor()

  cursor.execute("SELECT COUNT(*) FROM app.foods WHERE source = 'mindfeed_excel';")
  total = cursor.fetchone()[0]

  cursor.execute(
    """
      SELECT
        COUNT(*) FILTER (WHERE slug IS NOT NULL) as con_slug,
        COUNT(*) FILTER (WHERE estado_pesado_base IS NOT NULL) as con_estado_base,
        COUNT(*) FILTER (WHERE grupo_factor IS NOT NULL) as con_grupo_factor,
        COUNT(*) FILTER (WHERE is_vegetarian = true) as vegetarianos,
        COUNT(*) FILTER (WHERE is_vegan = true) as veganos,
        COUNT(*) FILTER (WHERE fibra_100g IS NOT NULL) as con_fibra
      FROM app.foods
      WHERE source = 'mindfeed_excel';
    """
  )
  stats = cursor.fetchone()

  print(f"  - Mindfeed foods: {total}")
  print(f"  - Con slug: {stats[0]}")
  print(f"  - Con estado base: {stats[1]}")
  print(f"  - Con grupo factor: {stats[2]}")
  print(f"  - Vegetarianos: {stats[3]}")
  print(f"  - Veganos: {stats[4]}")
  print(f"  - Con fibra: {stats[5]}")

  cursor.execute(
    """
      SELECT nombre, categoria_detalle, tipo_dieta, is_vegetarian, is_vegan
      FROM app.foods
      WHERE source = 'mindfeed_excel'
      ORDER BY nombre
      LIMIT 10;
    """
  )
  rows = cursor.fetchall()
  if rows:
    print("\nMuestra:")
    for row in rows:
      print(f"  - {row[0]} | {row[1]} | {row[2]} | veg={row[4]} | vegetarian={row[3]}")

  cursor.close()
  conn.close()


def parse_args():
  parser = argparse.ArgumentParser(description="Importador de alimentos MindFeed")
  parser.add_argument(
    "--excel",
    dest="excel_path",
    default=str(Path(__file__).parent.parent / "Módulo Nutrición" / "Base alimentos.xlsx"),
    help="Ruta del Excel Base alimentos.xlsx"
  )
  parser.add_argument(
    "--dry-run",
    action="store_true",
    help="Procesa y valida el Excel sin escribir en la base de datos"
  )
  return parser.parse_args()


def main():
  args = parse_args()
  excel_path = Path(args.excel_path)

  if not excel_path.exists():
    print(f"No se encontro el archivo Excel: {excel_path}")
    sys.exit(1)

  try:
    alimentos = procesar_alimentos(excel_path)

    if args.dry_run:
      print("\nDry-run activo: no se escribio nada en la base de datos.")
      return

    insertar_alimentos(alimentos)
    validar_importacion()
    print("\nImportacion completada.")
  except Exception as exc:
    print(f"\nError durante la importacion: {exc}")
    raise


if __name__ == "__main__":
  main()
