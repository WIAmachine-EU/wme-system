import sqlite3

catalog_data = {
    "E160A": "catalog-001",
    "E160C": "catalog-001",
    "HD2200": "catalog-002",
    "HD2200C": "catalog-002",
    "HD2200M": "catalog-002",
    "HD2200MC": "catalog-002",
    "HD2600": "catalog-003",
    "HD2600L": "catalog-003",
    "HD2600LM": "catalog-003",
    "HD2600M": "catalog-003",
    "HD3100": "catalog-003",
    "HD3100A": "catalog-003",
    "HD3100L": "catalog-003",
    "HD3100LM": "catalog-003",
    "HD3100M": "catalog-003",
    "HD3100MA": "catalog-003",
    "KIT250": "catalog-004",
    "KIT4500": "catalog-004",
    "KIT60G": "catalog-004",
    "L300A": "catalog-005",
    "L300C": "catalog-005",
    "L300LA": "catalog-005",
    "L300LC": "catalog-005",
    "L300LMA": "catalog-005",
    "L300LMC": "catalog-005",
    "L300LMSA": "catalog-005",
    "L300MA": "catalog-005",
    "L300MC": "catalog-005",
    "L300MSA": "catalog-005",
    "L300MSC": "catalog-005",
    "L4000": "catalog-006",
    "L4000C": "catalog-006",
    "L4000L": "catalog-006",
    "L4000LC": "catalog-006",
    "L4000LM": "catalog-006",
    "L4000LMC": "catalog-006",
    "L4000M": "catalog-006",
    "L4000MC": "catalog-006",
    "L5100L": "catalog-007",
    "L5100LC": "catalog-007",
    "L5100LM": "catalog-007",
    "L5100LMC": "catalog-007",
    "L600A": "catalog-008",
    "L600LA": "catalog-008",
    "L600LMA": "catalog-008",
    "L600MA": "catalog-008",
    "L700A": "catalog-008",
    "L700LA": "catalog-008",
    "L700LMA": "catalog-008",
    "L700MA": "catalog-008",
    "L800A": "catalog-008",
    "L800D": "catalog-008",
    "L800LA": "catalog-008",
    "L800LD": "catalog-008",
    "L800LMA": "catalog-008",
    "L800LMD": "catalog-008",
    "L800MA": "catalog-008",
    "L800MD": "catalog-008",
    "SE2200": "catalog-009",
    "SE2200A": "catalog-009",
    "SE2200L": "catalog-009",
    "SE2200LA": "catalog-009",
    "SE2200LC": "catalog-009",
    "SE2200LM": "catalog-009",
    "SE2200LMA": "catalog-009",
    "SE2200LMC": "catalog-009",
    "SE2200LMS": "catalog-009",
    "SE2200LMSA": "catalog-009",
    "SE2200LMSC": "catalog-009",
    "SE2200M": "catalog-009",
    "SE2200MA": "catalog-009",
    "SE2600": "catalog-010",
    "SE2600L": "catalog-010",
    "SE2600LM": "catalog-010",
    "SE2600M": "catalog-010"
}

thumbnail_data = {
    "E160A": "E160 Series",
    "E160C": "E160 Series",
    "HD2200": "catalog-002",
    "HD2200C": "catalog-002",
    "HD2200M": "catalog-002",
    "HD2200MC": "catalog-002",
    "HD2600": "catalog-003",
    "HD2600L": "catalog-003",
    "HD2600LM": "catalog-003",
    "HD2600M": "catalog-003",
    "HD3100": "catalog-004",
    "HD3100A": "catalog-004",
    "HD3100L": "catalog-004",
    "HD3100LM": "catalog-004",
    "HD3100M": "catalog-004",
    "HD3100MA": "catalog-004"
}

conn = sqlite3.connect('scm_erp.db')
cursor = conn.cursor()

try:
    cursor.execute("ALTER TABLE product_models ADD COLUMN catalog_file VARCHAR;")
except sqlite3.OperationalError:
    pass

try:
    cursor.execute("ALTER TABLE product_models ADD COLUMN thumbnail_file VARCHAR;")
except sqlite3.OperationalError:
    pass

for model, catalog in catalog_data.items():
    thumb = thumbnail_data.get(model)
    cursor.execute("UPDATE product_models SET catalog_file = ? WHERE model_code = ?", (catalog + ".pdf", model))
    
    if thumb:
        cursor.execute("UPDATE product_models SET thumbnail_file = ? WHERE model_code = ?", (thumb + ".webp", model))
    else:
        # Check if the model is one of the KIT series where the thumbnail file was missing in OCR
        if model.startswith("KIT") or model.startswith("L") or model.startswith("SE"):
             cursor.execute("UPDATE product_models SET thumbnail_file = ? WHERE model_code = ?", (catalog + ".webp", model))

conn.commit()
print("Database updated.")
conn.close()
