"""
Importador de Biblioteca de Platos/Plantillas a Supabase.

Carga:
- app.meal_templates
- app.meal_template_slots
- app.food_roles
"""

import argparse
import os
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

VALID_MEAL_TYPES = {"DESAYUNO", "COMIDA", "CENA", "SNACK"}
VALID_DIET_ALLOWED = {"AMBOS", "VEG"}


def as_text(value):
  if value is None:
    return None
  text = str(value).strip()
  return text if text else None


def normalize_meal_type(value):
  raw = as_text(value)
  if not raw:
    return None
  normalized = raw.upper()
  return normalized if normalized in VALID_MEAL_TYPES else None


def normalize_diet_allowed(value):
  raw = as_text(value)
  if not raw:
    return None
  normalized = raw.upper()
  if normalized == "VEGETARIANO":
    normalized = "VEG"
  return normalized if normalized in VALID_DIET_ALLOWED else None


def normalize_day_context(value):
  raw = as_text(value)
  if not raw:
    return "AMBOS"
  return raw.upper()


def normalize_role(value):
  raw = as_text(value)
  return raw.upper() if raw else None


def validate_db_config():
  required = ["host", "port", "database", "user", "password"]
  missing = [key for key in required if not DB_CONFIG.get(key)]
  if missing:
    raise RuntimeError(
      f"Faltan variables de entorno para conexion DB: {', '.join(missing)}. Revisa backend/.env"
    )


def load_excel_data(excel_path):
  plantillas_df = pd.read_excel(excel_path, sheet_name="Plantillas")
  slots_df = pd.read_excel(excel_path, sheet_name="Slots")
  banco_roles_df = pd.read_excel(excel_path, sheet_name="Banco_Roles")

  templates = []
  for _, row in plantillas_df.iterrows():
    template_code = as_text(row.get("template_id"))
    template_name = as_text(row.get("template_name"))
    meal_type = normalize_meal_type(row.get("meal_type"))
    diet_allowed = normalize_diet_allowed(row.get("diet_allowed"))

    if not template_code or not template_name or not meal_type or not diet_allowed:
      continue

    templates.append({
      "template_code": template_code,
      "template_name": template_name,
      "meal_type": meal_type,
      "diet_allowed": diet_allowed,
      "day_context": normalize_day_context(row.get("day_context")),
      "phase_bias": as_text(row.get("phase_bias")),
      "satiety_bias": as_text(row.get("satiety_bias"))
    })

  slots = []
  for _, row in slots_df.iterrows():
    template_code = as_text(row.get("template_id"))
    role = normalize_role(row.get("slot_role"))
    slot_order_raw = row.get("slot_order")

    if not template_code or not role:
      continue
    try:
      slot_order = int(slot_order_raw)
    except (TypeError, ValueError):
      continue

    slots.append({
      "template_code": template_code,
      "slot_order": slot_order,
      "slot_role": role,
      "slot_note": as_text(row.get("slot_note")),
      "quantity_hint": as_text(row.get("quantity_hint"))
    })

  role_rows = []
  for _, row in banco_roles_df.iterrows():
    food_slug = as_text(row.get("food_id"))
    role = normalize_role(row.get("role"))
    if not food_slug or not role:
      continue

    role_rows.append({
      "food_slug": food_slug,
      "role": role,
      "diet_type": as_text(row.get("diet_type")),
      "category": as_text(row.get("category")),
      "notes": as_text(row.get("notes"))
    })

  return templates, slots, role_rows


def import_template_library(excel_path):
  validate_db_config()
  templates, slots, role_rows = load_excel_data(excel_path)

  if not templates:
    raise RuntimeError("No se encontraron plantillas válidas en hoja Plantillas")

  conn = psycopg2.connect(**DB_CONFIG)
  conn.autocommit = False
  cursor = conn.cursor()

  try:
    print("Limpiando datos previos source=mindfeed_excel...")
    cursor.execute("DELETE FROM app.food_roles WHERE source = 'mindfeed_excel';")
    cursor.execute("DELETE FROM app.meal_templates WHERE source = 'mindfeed_excel';")

    template_ids = {}
    print(f"Insertando plantillas: {len(templates)}")
    for template in templates:
      cursor.execute(
        """
          INSERT INTO app.meal_templates (
            template_code, template_name, meal_type, diet_allowed, day_context, phase_bias, satiety_bias, source
          ) VALUES (
            %(template_code)s, %(template_name)s, %(meal_type)s, %(diet_allowed)s, %(day_context)s, %(phase_bias)s, %(satiety_bias)s, 'mindfeed_excel'
          )
          RETURNING id;
        """,
        template
      )
      template_ids[template["template_code"]] = cursor.fetchone()[0]

    print(f"Insertando slots: {len(slots)}")
    inserted_slots = 0
    skipped_slots = 0
    for slot in slots:
      template_id = template_ids.get(slot["template_code"])
      if not template_id:
        skipped_slots += 1
        continue

      cursor.execute(
        """
          INSERT INTO app.meal_template_slots (
            template_id, slot_order, slot_role, slot_note, quantity_hint
          ) VALUES (%s, %s, %s, %s, %s);
        """,
        (
          template_id,
          slot["slot_order"],
          slot["slot_role"],
          slot["slot_note"],
          slot["quantity_hint"]
        )
      )
      inserted_slots += 1

    all_slugs = sorted({row["food_slug"] for row in role_rows})
    cursor.execute(
      "SELECT id, slug FROM app.foods WHERE slug = ANY(%s);",
      (all_slugs,)
    )
    slug_rows = cursor.fetchall()
    food_id_by_slug = {slug: food_id for food_id, slug in slug_rows}

    print(f"Insertando food_roles: {len(role_rows)}")
    inserted_roles = 0
    missing_slugs = []
    for row in role_rows:
      food_id = food_id_by_slug.get(row["food_slug"])
      if not food_id:
        missing_slugs.append(row["food_slug"])
        continue

      cursor.execute(
        """
          INSERT INTO app.food_roles (
            food_id, food_slug, role, diet_type, category, notes, source
          ) VALUES (%s, %s, %s, %s, %s, %s, 'mindfeed_excel');
        """,
        (
          food_id,
          row["food_slug"],
          row["role"],
          row["diet_type"],
          row["category"],
          row["notes"]
        )
      )
      inserted_roles += 1

    conn.commit()
    summary = {
      "templates": len(template_ids),
      "slots_inserted": inserted_slots,
      "slots_skipped": skipped_slots,
      "roles_inserted": inserted_roles,
      "missing_food_slugs": sorted(set(missing_slugs))
    }
    return summary
  except Exception:
    conn.rollback()
    raise
  finally:
    cursor.close()
    conn.close()


def parse_args():
  parser = argparse.ArgumentParser(description="Importador de Biblioteca de Platos MindFeed")
  parser.add_argument(
    "--excel",
    dest="excel_path",
    default=str(Path(__file__).parent.parent / "Módulo Nutrición" / "Biblioteca_Platos_Plantillas_.xlsx"),
    help="Ruta del Excel de Biblioteca de Platos"
  )
  return parser.parse_args()


def main():
  args = parse_args()
  excel_path = Path(args.excel_path)
  if not excel_path.exists():
    raise FileNotFoundError(f"No se encontró archivo Excel: {excel_path}")

  print(f"Leyendo biblioteca: {excel_path}")
  summary = import_template_library(excel_path)
  print("Importación completada:")
  print(f"  - Plantillas: {summary['templates']}")
  print(f"  - Slots insertados: {summary['slots_inserted']}")
  print(f"  - Slots omitidos: {summary['slots_skipped']}")
  print(f"  - Roles insertados: {summary['roles_inserted']}")
  print(f"  - Slugs faltantes: {len(summary['missing_food_slugs'])}")
  if summary["missing_food_slugs"]:
    print("    Ejemplo faltantes:", summary["missing_food_slugs"][:20])


if __name__ == "__main__":
  main()
