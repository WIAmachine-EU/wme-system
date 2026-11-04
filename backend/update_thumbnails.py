from sqlalchemy import text
from models import ProductModel

CATALOG_DATA = {
    # catalog-001
    "E160A": "catalog-001", "E160C": "catalog-001",
    # catalog-002
    "HD2200": "catalog-002", "HD2200C": "catalog-002", "HD2200M": "catalog-002", "HD2200MC": "catalog-002",
    # catalog-003
    "HD2600": "catalog-003", "HD2600L": "catalog-003", "HD2600LM": "catalog-003", "HD2600M": "catalog-003",
    "HD3100": "catalog-003", "HD3100A": "catalog-003", "HD3100L": "catalog-003", "HD3100LM": "catalog-003", "HD3100M": "catalog-003", "HD3100MA": "catalog-003",
    # catalog-004
    "KIT250": "catalog-004", "KIT4500": "catalog-004", "KIT60G": "catalog-004",
    # catalog-005
    "L300A": "catalog-005", "L300C": "catalog-005", "L300LA": "catalog-005", "L300LC": "catalog-005", "L300LMA": "catalog-005", "L300LMC": "catalog-005",
    "L300LMSA": "catalog-005", "L300MA": "catalog-005", "L300MC": "catalog-005", "L300MSA": "catalog-005", "L300MSC": "catalog-005",
    # catalog-006
    "L4000": "catalog-006", "L4000C": "catalog-006", "L4000L": "catalog-006", "L4000LC": "catalog-006",
    "L4000LM": "catalog-006", "L4000LMC": "catalog-006", "L4000M": "catalog-006", "L4000MC": "catalog-006",
    # catalog-007
    "L5100L": "catalog-007", "L5100LC": "catalog-007", "L5100LM": "catalog-007", "L5100LMC": "catalog-007", "L5100LY": "catalog-007",
    # catalog-008
    "L600A": "catalog-008", "L600LA": "catalog-008", "L600LMA": "catalog-008", "L600MA": "catalog-008",
    "L700A": "catalog-008", "L700LA": "catalog-008", "L700LMA": "catalog-008", "L700MA": "catalog-008",
    "L800A": "catalog-008", "L800D": "catalog-008", "L800LA": "catalog-008", "L800LD": "catalog-008",
    "L800LMA": "catalog-008", "L800LMD": "catalog-008", "L800MA": "catalog-008", "L800MD": "catalog-008",
    # catalog-009
    "SE2200": "catalog-009", "SE2200A": "catalog-009", "SE2200L": "catalog-009", "SE2200LA": "catalog-009", "SE2200LC": "catalog-009",
    "SE2200LM": "catalog-009", "SE2200LMA": "catalog-009", "SE2200LMC": "catalog-009", "SE2200LMS": "catalog-009",
    "SE2200LMSA": "catalog-009", "SE2200LMSC": "catalog-009", "SE2200M": "catalog-009", "SE2200MA": "catalog-009",
    # catalog-010
    "SE2600": "catalog-010", "SE2600L": "catalog-010", "SE2600LM": "catalog-010", "SE2600M": "catalog-010",
    "SE2600LSY": "catalog-010", "SE2600LY": "catalog-010", "SE2600SY": "catalog-010", "SE2600Y": "catalog-010",
    # catalog-011
    "HD2200SY": "catalog-011", "HD2200Y": "catalog-011", "HD2600LSY": "catalog-011", "HD2600LY": "catalog-011", "HD2600SY": "catalog-011", "HD2600Y": "catalog-011",
    "HD3100LY": "catalog-011", "HD3100LYA": "catalog-011", "HD3100SY": "catalog-011", "HD3100SYA": "catalog-011", "HD3100Y": "catalog-011", "HD3100YA": "catalog-011",
    # catalog-012
    "KL7000LY": "catalog-012", "KL8000LY": "catalog-012",
    # catalog-013
    "L2000LSY": "catalog-013", "L2000LY": "catalog-013", "L2000SY": "catalog-013", "L2000Y": "catalog-013",
    "L2600LY": "catalog-013", "L2600SY": "catalog-013", "L2600Y": "catalog-013",
    "L3000LY": "catalog-013", "L3000SY": "catalog-013", "L3000Y": "catalog-013",
    # catalog-014
    "SE2200LSY": "catalog-014", "SE2200LSYA": "catalog-014", "SE2200LY": "catalog-014", "SE2200LYA": "catalog-014", "SE2200Y": "catalog-014", "SE2200YA": "catalog-014",
    # catalog-015
    "LV1100R": "catalog-015", "LV1100RM": "catalog-015", "LV500L": "catalog-015", "LV500LM": "catalog-015", "LV500R": "catalog-015", "LV500RM": "catalog-015",
    # catalog-016
    "LV4500L": "catalog-016", "LV4500LM": "catalog-016", "LV4500R": "catalog-016", "LV4500RM": "catalog-016",
    "LV8500L": "catalog-016", "LV8500LM": "catalog-016", "LV8500R": "catalog-016", "LV8500RM": "catalog-016",
    # catalog-017
    "LV1400": "catalog-017", "LV2000MM": "catalog-017",
    # catalog-018
    "LF2200 Ⅱ": "catalog-018", "LF2200M Ⅱ": "catalog-018", "LF2200MQUICK Ⅱ": "catalog-018", "LF2200QUICK Ⅱ": "catalog-018",
    "LF2600 Ⅱ": "catalog-018", "LF2600M Ⅱ": "catalog-018", "LF2600MQUICK Ⅱ": "catalog-018", "LF2600QUICK Ⅱ": "catalog-018",
    # catalog-019
    "LM1600TTMS": "catalog-019", "LM1600TTS": "catalog-019", "LM1600TTSY": "catalog-019",
    "LM1800TTMS": "catalog-019", "LM1800TTS": "catalog-019", "LM1800TTSY": "catalog-019",
    # catalog-020
    "LM2200TTSYY": "catalog-020", "LM2200TTSYYC": "catalog-020",
    # catalog-021
    "LM2500TT Ⅱ": "catalog-021", "LM2500TTM Ⅱ": "catalog-021", "LM2500TTMS Ⅱ": "catalog-021", "LM2500TTS Ⅱ": "catalog-021", "LM2500TTSY II": "catalog-021",
    # catalog-022
    "KL6500AW": "catalog-022", "LV800AW-TT": "catalog-022", "LV8500RAW": "catalog-022",
    # catalog-023
    "KIT600G": "catalog-023", "KIT800G": "catalog-023",
    # No catalog ('-')
    "LV600G": None,
    # catalog-024
    "i-CUT4000": "catalog-024", "i-CUT400TD": "catalog-024", "i-CUT4500": "catalog-024",
    # catalog-025
    "F960B": "catalog-025",
    # catalog-026
    "KF4": "catalog-026", "KF4L": "catalog-026", "KF5": "catalog-026", "KF5/50": "catalog-026",
    "KF5L": "catalog-026", "KF6": "catalog-026", "KF6/50": "catalog-026", "KF6L": "catalog-026",
    # catalog-027
    "KF7600L": "catalog-027",
    # catalog-028
    "KF5700B/50 II": "catalog-028", "KF5700B II": "catalog-028", "KF6700B/50 II": "catalog-028",
    "KF6700B II": "catalog-028", "KF7700B/50 II": "catalog-028", "KF7700B II": "catalog-028",
    # catalog-029
    "KF1000B": "catalog-029", "KF1100B": "catalog-029",
    # catalog-030
    "KF4300D": "catalog-030", "KF5200D": "catalog-030", "KF6000D": "catalog-030",
    # catalog-031
    "KF4000/2SP": "catalog-031", "KF4000I/2SP": "catalog-031", "KF4300/2SP": "catalog-031", "KF4300G/2SP": "catalog-031", "KF4300P/2SP": "catalog-031",
    "KF5200/2SP": "catalog-031", "KF5200G/2SP": "catalog-031", "KF5200P/2SP": "catalog-031", "KF5700/2SP": "catalog-031", "KF5700G/2SP": "catalog-031",
    "KF6700/2SP": "catalog-031", "KF6700G/2SP": "catalog-031", "KF6750/2SP": "catalog-031", "KF8200/2SP": "catalog-031", "KF8250/2SP": "catalog-031",
    # catalog-032
    "HS10000": "catalog-032",
    # catalog-033
    "HS4000 II": "catalog-033", "HS5000/50 II": "catalog-033", "HS5000 II": "catalog-033",
    # catalog-034
    "HS6300 II": "catalog-034", "HS8000 II": "catalog-034",
    # catalog-035
    "KH1000": "catalog-035",
    # catalog-036
    "KH50G": "catalog-036",
    # catalog-037
    "KH6300": "catalog-037", "KH8000": "catalog-037",
    # catalog-038
    "KBN1300C": "catalog-038", "KBN1600C": "catalog-038", "KBR1300C": "catalog-038", "KBR1600C": "catalog-038",
    # catalog-039
    "XM2600": "catalog-039", "XM2600S": "catalog-039", "XM2600ST": "catalog-039",
    "XM3100": "catalog-039", "XM3100S": "catalog-039", "XM3100ST": "catalog-039",
    # catalog-040
    "KF3500/5A": "catalog-040", "KF6500/5A": "catalog-040", "KF7300/5A": "catalog-040",
    # catalog-041
    "XF6300": "catalog-041", "XF8500": "catalog-041",
    # catalog-042
    "XF2000i": "catalog-042",
}

THUMBNAIL_DATA = {
    "E160A": "E160 Series", "E160C": "E160 Series",
    "HD2200": "catalog-002", "HD2200C": "catalog-002", "HD2200M": "catalog-002", "HD2200MC": "catalog-002",
    "HD2600": "catalog-003", "HD2600L": "catalog-003", "HD2600LM": "catalog-003", "HD2600M": "catalog-003",
    "HD3100": "catalog-004", "HD3100A": "catalog-004", "HD3100L": "catalog-004", "HD3100LM": "catalog-004", "HD3100M": "catalog-004", "HD3100MA": "catalog-004"
}


def run_migration(db):
    try:
        db.execute(text("ALTER TABLE product_models ADD COLUMN catalog_file VARCHAR"))
        db.commit()
    except Exception:
        db.rollback()

    try:
        db.execute(text("ALTER TABLE product_models ADD COLUMN thumbnail_file VARCHAR"))
        db.commit()
    except Exception:
        db.rollback()

    models_by_code = {m.model_code: m for m in db.query(ProductModel).all()}
    updated_count = 0

    for model_code, catalog in CATALOG_DATA.items():
        m = models_by_code.get(model_code)
        if not m:
            continue

        expected_catalog = f"{catalog}.pdf" if catalog else None
        row_changed = False

        if m.catalog_file != expected_catalog:
            m.catalog_file = expected_catalog
            row_changed = True

        if not m.thumbnail_file:
            thumb = THUMBNAIL_DATA.get(model_code)
            if thumb:
                m.thumbnail_file = f"{thumb}.webp"
                row_changed = True
            elif catalog and (model_code.startswith("KIT") or model_code.startswith("L") or model_code.startswith("SE")):
                m.thumbnail_file = f"{catalog}.webp"
                row_changed = True

        if row_changed:
            updated_count += 1

    if updated_count > 0:
        db.commit()

    return updated_count
