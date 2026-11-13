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
    "E160A": "thumbnail_E160",
    "E160C": "thumbnail_E160",
    "HD2200": "thumbnail_HD2200",
    "HD2200C": "thumbnail_HD2200",
    "HD2200M": "thumbnail_HD2200",
    "HD2200MC": "thumbnail_HD2200",
    "HD2600": "thumbnail_HD2600 3100 Series",
    "HD2600L": "thumbnail_HD2600 3100 Series",
    "HD2600LM": "thumbnail_HD2600 3100 Series",
    "HD2600M": "thumbnail_HD2600 3100 Series",
    "HD3100": "thumbnail_HD2600 3100 Series",
    "HD3100A": "thumbnail_HD2600 3100 Series",
    "HD3100L": "thumbnail_HD2600 3100 Series",
    "HD3100LM": "thumbnail_HD2600 3100 Series",
    "HD3100M": "thumbnail_HD2600 3100 Series",
    "HD3100MA": "thumbnail_HD2600 3100 Series",
    "KIT250": "thumbnail_KIT Series",
    "KIT4500": "thumbnail_KIT Series",
    "KIT60G": "thumbnail_KIT Series",
    "L300A": "thumbnail_L300 Series",
    "L300C": "thumbnail_L300 Series",
    "L300LA": "thumbnail_L300 Series",
    "L300LC": "thumbnail_L300 Series",
    "L300LMA": "thumbnail_L300 Series",
    "L300LMC": "thumbnail_L300 Series",
    "L300LMSA": "thumbnail_L300 Series",
    "L300MA": "thumbnail_L300 Series",
    "L300MC": "thumbnail_L300 Series",
    "L300MSA": "thumbnail_L300 Series",
    "L300MSC": "thumbnail_L300 Series",
    "L4000": "thumbnail_L4000 Series",
    "L4000C": "thumbnail_L4000 Series",
    "L4000L": "thumbnail_L4000 Series",
    "L4000LC": "thumbnail_L4000 Series",
    "L4000LM": "thumbnail_L4000 Series",
    "L4000LMC": "thumbnail_L4000 Series",
    "L4000M": "thumbnail_L4000 Series",
    "L4000MC": "thumbnail_L4000 Series",
    "L5100L": "thumbnail_L5100L Series",
    "L5100LC": "thumbnail_L5100L Series",
    "L5100LM": "thumbnail_L5100L Series",
    "L5100LMC": "thumbnail_L5100L Series",
    "L600A": "thumbnail_L600 700 800 Series",
    "L600LA": "thumbnail_L600 700 800 Series",
    "L600LMA": "thumbnail_L600 700 800 Series",
    "L600MA": "thumbnail_L600 700 800 Series",
    "L700A": "thumbnail_L600 700 800 Series",
    "L700LA": "thumbnail_L600 700 800 Series",
    "L700LMA": "thumbnail_L600 700 800 Series",
    "L700MA": "thumbnail_L600 700 800 Series",
    "L800A": "thumbnail_L600 700 800 Series",
    "L800D": "thumbnail_L600 700 800 Series",
    "L800LA": "thumbnail_L600 700 800 Series",
    "L800LD": "thumbnail_L600 700 800 Series",
    "L800LMA": "thumbnail_L600 700 800 Series",
    "L800LMD": "thumbnail_L600 700 800 Series",
    "L800MA": "thumbnail_L600 700 800 Series",
    "L800MD": "thumbnail_L600 700 800 Series",
    "SE2200": "thumbnail_SE2200 Series",
    "SE2200A": "thumbnail_SE2200 Series",
    "SE2200L": "thumbnail_SE2200 Series",
    "SE2200LA": "thumbnail_SE2200 Series",
    "SE2200LC": "thumbnail_SE2200 Series",
    "SE2200LM": "thumbnail_SE2200 Series",
    "SE2200LMA": "thumbnail_SE2200 Series",
    "SE2200LMC": "thumbnail_SE2200 Series",
    "SE2200LMS": "thumbnail_SE2200 Series",
    "SE2200LMSA": "thumbnail_SE2200 Series",
    "SE2200LMSC": "thumbnail_SE2200 Series",
    "SE2200M": "thumbnail_SE2200 Series",
    "SE2200MA": "thumbnail_SE2200 Series",
    "SE2600": "thumbnail_SE2600 Series",
    "SE2600L": "thumbnail_SE2600 Series",
    "SE2600LM": "thumbnail_SE2600 Series",
    "SE2600M": "thumbnail_SE2600 Series",
    "HD2200SY": "thumbnail_HD-SY Series",
    "HD2200Y": "thumbnail_HD-SY Series",
    "HD2600LSY": "thumbnail_HD-SY Series",
    "HD2600LY": "thumbnail_HD-SY Series",
    "HD2600SY": "thumbnail_HD-SY Series",
    "HD2600Y": "thumbnail_HD-SY Series",
    "HD3100LY": "thumbnail_HD-SY Series",
    "HD3100LYA": "thumbnail_HD-SY Series",
    "HD3100SY": "thumbnail_HD-SY Series",
    "HD3100SYA": "thumbnail_HD-SY Series",
    "HD3100Y": "thumbnail_HD-SY Series",
    "HD3100YA": "thumbnail_HD-SY Series",
    "KL7000LY": "thumbnail_KL-Y Series",
    "KL8000LY": "thumbnail_KL-Y Series",
    "L5100LY": "thumbnail_L5100LY",
    "L2000LSY": "thumbnail_L-Y Series",
    "L2000LY": "thumbnail_L-Y Series",
    "L2000SY": "thumbnail_L-Y Series",
    "L2000Y": "thumbnail_L-Y Series",
    "L2600LY": "thumbnail_L-Y Series",
    "L2600SY": "thumbnail_L-Y Series",
    "L2600Y": "thumbnail_L-Y Series",
    "L3000LY": "thumbnail_L-Y Series",
    "L3000SY": "thumbnail_L-Y Series",
    "L3000Y": "thumbnail_L-Y Series",
    "SE2200LSY": "thumbnail_SE2200Y Series",
    "SE2200LSYA": "thumbnail_SE2200Y Series",
    "SE2200LY": "thumbnail_SE2200Y Series",
    "SE2200LYA": "thumbnail_SE2200Y Series",
    "SE2200Y": "thumbnail_SE2200Y Series",
    "SE2200YA": "thumbnail_SE2200Y Series",
    "SE2600LSY": "thumbnail_SE2600Y Series",
    "SE2600LY": "thumbnail_SE2600Y Series",
    "SE2600SY": "thumbnail_SE2600Y Series",
    "SE2600Y": "thumbnail_SE2600Y Series",
    "LV1100R": "thumbnail_LV1100 Series",
    "LV1100RM": "thumbnail_LV1100 Series",
    "LV4500L": "thumbnail_LV4500 Series",
    "LV4500LM": "thumbnail_LV4500 Series",
    "LV4500R": "thumbnail_LV4500 Series",
    "LV4500RM": "thumbnail_LV4500 Series",
    "LV500L": "thumbnail_LV500 Series",
    "LV500LM": "thumbnail_LV500 Series",
    "LV500R": "thumbnail_LV500 Series",
    "LV500RM": "thumbnail_LV500 Series",
    "LV8500L": "thumbnail_LV8500 Series",
    "LV8500LM": "thumbnail_LV8500 Series",
    "LV8500R": "thumbnail_LV8500 Series",
    "LV8500RM": "thumbnail_LV8500 Series",
    "LV1400": "thumbnail_LV1400",
    "LV2000MM": "thumbnail_LV2000",
    "LF2200 Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LF2200M Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LF2200MQUICK Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LF2200QUICK Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LF2600 Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LF2600M Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LF2600MQUICK Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LF2600QUICK Ⅱ": "thumbnail_LF-Ⅱ Series",
    "LM1600TTMS": "thumbnail_LM1600TT Series",
    "LM1600TTS": "thumbnail_LM1600TT Series",
    "LM1600TTSY": "thumbnail_LM1600TT Series",
    "LM1800TTMS": "thumbnail_LM1800TT Series",
    "LM1800TTS": "thumbnail_LM1800TT Series",
    "LM1800TTSY": "thumbnail_LM1800TT Series",
    "LM2200TTSYY": "thumbnail_LM2200TT Series",
    "LM2200TTSYYC": "thumbnail_LM2200TT Series",
    "LM2500TT Ⅱ": "thumbnail_LM2500TT II Series",
    "LM2500TTM Ⅱ": "thumbnail_LM2500TT II Series",
    "LM2500TTMS Ⅱ": "thumbnail_LM2500TT II Series",
    "LM2500TTS Ⅱ": "thumbnail_LM2500TT II Series",
    "LM2500TTSY II": "thumbnail_LM2500TT II Series",
    "KL6500AW": "thumbnail_AL WHEEL Series",
    "LV800AW-TT": "thumbnail_AL WHEEL Series",
    "LV8500RAW": "thumbnail_AL WHEEL Series",
    "KIT600G": "thumbnail_KIT600G-800G",
    "KIT800G": "thumbnail_KIT600G-800G",
    "LV600G": "thumbnail_LV600G",
    "i-CUT4000": "thumbnail_i-CUT Series",
    "i-CUT400TD": "thumbnail_i-CUT Series",
    "i-CUT4500": "thumbnail_i-CUT Series",
    "F960B": "thumbnail_F960B",
    "KF4": "thumbnail_KF4 Series",
    "KF4L": "thumbnail_KF4 Series",
    "KF5": "thumbnail_KF5 Series",
    "KF5/50": "thumbnail_KF5 Series",
    "KF5L": "thumbnail_KF5 Series",
    "KF6": "thumbnail_KF6 Series",
    "KF6/50": "thumbnail_KF6 Series",
    "KF6L": "thumbnail_KF6 Series",
    "KF7600L": "thumbnail_KF7600L",
    "KF5700B/50 II": "thumbnail_KF-B II Series 5700",
    "KF5700B II": "thumbnail_KF-B II Series 5700",
    "KF6700B/50 II": "thumbnail_KF-B II Series 6700",
    "KF6700B II": "thumbnail_KF-B II Series 6700",
    "KF7700B/50 II": "thumbnail_KF-B II Series 7700",
    "KF7700B II": "thumbnail_KF-B II Series 7700",
    "KF1000B": "thumbnail_KF-B Series",
    "KF1100B": "thumbnail_KF-B Series",
    "KF4300D": "thumbnail_KF-D Series 4300",
    "KF5200D": "thumbnail_KF-D Series 5200",
    "KF6000D": "thumbnail_KF-D Series 6000",
    "KF4000/2SP": "thumbnail_KF-2SP Series 4000",
    "KF4000I/2SP": "thumbnail_KF-2SP Series 4000",
    "KF4300/2SP": "thumbnail_KF-2SP Series 4000",
    "KF4300G/2SP": "thumbnail_KF-2SP Series 4000",
    "KF4300P/2SP": "thumbnail_KF-2SP Series 4000",
    "KF5200/2SP": "thumbnail_KF-2SP Series 5200",
    "KF5200G/2SP": "thumbnail_KF-2SP Series 5200",
    "KF5200P/2SP": "thumbnail_KF-2SP Series 5200",
    "KF5700/2SP": "thumbnail_KF-2SP Series 5200",
    "KF5700G/2SP": "thumbnail_KF-2SP Series 5200",
    "KF6700/2SP": "thumbnail_KF-2SP Series 6700",
    "KF6700G/2SP": "thumbnail_KF-2SP Series 6700",
    "KF6750/2SP": "thumbnail_KF-2SP Series 6700",
    "KF8200/2SP": "thumbnail_KF-2SP Series 6700",
    "KF8250/2SP": "thumbnail_KF-2SP Series 6700",
    "HS10000": "thumbnail_HS10000",
    "HS4000 II": "thumbnail_HS4000 II Series",
    "HS5000/50 II": "thumbnail_HS5000 II Series",
    "HS5000 II": "thumbnail_HS5000 II Series",
    "HS6300 II": "thumbnail_HS6300 8000 II",
    "HS8000 II": "thumbnail_HS6300 8000 II",
    "KH1000": "thumbnail_KH1000",
    "KH50G": "thumbnail_KH50G",
    "KH6300": "thumbnail_KH6300",
    "KH8000": "thumbnail_KH8000",
    "KBN1300C": "thumbnail_KBN Series",
    "KBN1600C": "thumbnail_KBN Series",
    "KBR1300C": "thumbnail_KBR Series",
    "KBR1600C": "thumbnail_KBR Series",
    "XM2600": "thumbnail_XM Series",
    "XM2600S": "thumbnail_XM Series",
    "XM2600ST": "thumbnail_XM Series",
    "XM3100": "thumbnail_XM Series",
    "XM3100S": "thumbnail_XM Series",
    "XM3100ST": "thumbnail_XM Series",
    "KF3500/5A": "thumbnail_KF-5A Series",
    "KF6500/5A": "thumbnail_KF-5A Series",
    "KF7300/5A": "thumbnail_KF-5A Series",
    "XF6300": "thumbnail_XF Series",
    "XF8500": "thumbnail_XF Series",
    "XF2000i": "thumbnail_XF2000i",
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

        thumb = THUMBNAIL_DATA.get(model_code)
        if thumb:
            expected_thumb = f"{thumb}.webp"
            if m.thumbnail_file != expected_thumb:
                m.thumbnail_file = expected_thumb
                row_changed = True

        if row_changed:
            updated_count += 1

    if updated_count > 0:
        db.commit()

    return updated_count
