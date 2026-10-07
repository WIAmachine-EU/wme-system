import sys
import os

# add backend path to sys.path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal, engine, Base
from models import ProductCategory, ProductModel

raw_data = """
E160A CNC T/C E160 Series Horizontal 2-Axis Turning Center 6/8-inch Compact Type
E160C CNC T/C E160 Series Horizontal 2-Axis Turning Center 8/10-inch Box Way Type
HD2200 CNC T/C HD2200 Series Horizontal 2-Axis Turning Center 8/10-inch Box Way Type
HD2200C CNC T/C HD2200 Series Horizontal 2-Axis Turning Center 8/10-inch Box Way Type
HD2200M CNC T/C HD2200 Series Horizontal 2-Axis Turning Center 8/10-inch Box Way Type
HD2200MC CNC T/C HD2200 Series Horizontal 2-Axis Turning Center 8/10-inch Box Way Type
HD2600 CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD2600L CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD2600LM CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD2600M CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD3100 CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD3100A CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD3100L CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD3100LM CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD3100M CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
HD3100MA CNC T/C HD2600/3100 Series Horizontal 2-Axis Turning Center 10/12-inch Box Way Type
KIT250 CNC T/C KIT Series Horizontal 2-Axis Turning Center Gang-type
KIT4500 CNC T/C KIT Series Horizontal 2-Axis Turning Center Gang-type
KIT60G CNC T/C KIT Series Horizontal 2-Axis Turning Center Gang-type
L300A CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300C CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300LA CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300LC CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300LMA CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300LMC CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300LMSA CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300MA CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300MC CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300MSA CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L300MSC CNC T/C L300 Series Horizontal 2-Axis Turning Center 10/12/15-inch Box Way Type
L4000 CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L4000C CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L4000L CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L4000LC CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L4000LM CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L4000LMC CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L4000M CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L4000MC CNC T/C L4000 Series Horizontal 2-Axis Turning Center 15/18/21-inch Box Way Type
L5100L CNC T/C L5100L Series Horizontal 2-Axis Turning Center 21/24/32-inch Box Way Type
L5100LC CNC T/C L5100L Series Horizontal 2-Axis Turning Center 21/24/32-inch Box Way Type
L5100LM CNC T/C L5100L Series Horizontal 2-Axis Turning Center 21/24/32-inch Box Way Type
L5100LMC CNC T/C L5100L Series Horizontal 2-Axis Turning Center 21/24/32-inch Box Way Type
L600A CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L600LA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L600LMA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L600MA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L700A CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L700LA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L700LMA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L700MA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800A CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800D CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800LA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800LD CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800LMA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800LMD CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800MA CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
L800MD CNC T/C L600/700/800 Series Horizontal 2-Axis Turning Center 18/21/24/27/32/34-inch Box Way Type
SE2200 CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200A CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200L CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LA CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LC CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LM CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LMA CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LMC CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LMS CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LMSA CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200LMSC CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200M CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2200MA CNC T/C SE2200 Series Horizontal 2-Axis Turning Center 6/8/10-inch Linear Guide Type
SE2600 CNC T/C SE2600 Series Horizontal 2-Axis Turning Center 10-inch Linear Guide Type
SE2600L CNC T/C SE2600 Series Horizontal 2-Axis Turning Center 10-inch Linear Guide Type
SE2600LM CNC T/C SE2600 Series Horizontal 2-Axis Turning Center 10-inch Linear Guide Type
SE2600M CNC T/C SE2600 Series Horizontal 2-Axis Turning Center 10-inch Linear Guide Type
HD2200SY CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD2200Y CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD2600LSY CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD2600LY CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD2600SY CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD2600Y CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD3100LY CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD3100LYA CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD3100SY CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD3100SYA CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD3100Y CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
HD3100YA CNC T/C HD-SY Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
KL7000LY CNC T/C KL-Y Series Horizontal Y-Axis Turning Center 24/32-inch Box Way Type
KL8000LY CNC T/C KL-Y Series Horizontal Y-Axis Turning Center 24/32-inch Box Way Type
L5100LY CNC T/C L5100LY Horizontal Y-Axis Turning Center 21/24-inch Box Way Type
L2000LSY CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L2000LY CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L2000SY CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L2000Y CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L2600LY CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L2600SY CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L2600Y CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L3000LY CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L3000SY CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
L3000Y CNC T/C L-Y Series Horizontal Y-Axis Turning Center 8/10/12-inch Box Way Type
SE2200LSY CNC T/C SE2200Y Series Horizontal Y-Axis Turning Center 6/8-inch Linear Guide Type
SE2200LSYA CNC T/C SE2200Y Series Horizontal Y-Axis Turning Center 6/8-inch Linear Guide Type
SE2200LY CNC T/C SE2200Y Series Horizontal Y-Axis Turning Center 6/8-inch Linear Guide Type
SE2200LYA CNC T/C SE2200Y Series Horizontal Y-Axis Turning Center 6/8-inch Linear Guide Type
SE2200Y CNC T/C SE2200Y Series Horizontal Y-Axis Turning Center 6/8-inch Linear Guide Type
SE2200YA CNC T/C SE2200Y Series Horizontal Y-Axis Turning Center 6/8-inch Linear Guide Type
SE2600LSY CNC T/C SE2600Y Series Horizontal Y-Axis Turning Center 10-inch Linear Guide Type
SE2600LY CNC T/C SE2600Y Series Horizontal Y-Axis Turning Center 10-inch Linear Guide Type
SE2600SY CNC T/C SE2600Y Series Horizontal Y-Axis Turning Center 10-inch Linear Guide Type
SE2600Y CNC T/C SE2600Y Series Horizontal Y-Axis Turning Center 10-inch Linear Guide Type
LV1100R CNC T/C LV1100 Series Vertical 2-Axis Turning Center 32/40-inch Box Way Type
LV1100RM CNC T/C LV1100 Series Vertical 2-Axis Turning Center 32/40-inch Box Way Type
LV4500L CNC T/C LV4500 Series Vertical 2-Axis Turning Center 12/15-inch Linear Guide Type
LV4500LM CNC T/C LV4500 Series Vertical 2-Axis Turning Center 12/15-inch Linear Guide Type
LV4500R CNC T/C LV4500 Series Vertical 2-Axis Turning Center 12/15-inch Linear Guide Type
LV4500RM CNC T/C LV4500 Series Vertical 2-Axis Turning Center 12/15-inch Linear Guide Type
LV500L CNC T/C LV500 Series Vertical 2-Axis Turning Center 15/18-inch Linear Guide Type
LV500LM CNC T/C LV500 Series Vertical 2-Axis Turning Center 15/18-inch Linear Guide Type
LV500R CNC T/C LV500 Series Vertical 2-Axis Turning Center 15/18-inch Linear Guide Type
LV500RM CNC T/C LV500 Series Vertical 2-Axis Turning Center 15/18-inch Linear Guide Type
LV8500L CNC T/C LV8500 Series Vertical 2-Axis Turning Center 18/21/24-inch Box Way Type
LV8500LM CNC T/C LV8500 Series Vertical 2-Axis Turning Center 18/21/24-inch Box Way Type
LV8500R CNC T/C LV8500 Series Vertical 2-Axis Turning Center 18/21/24-inch Box Way Type
LV8500RM CNC T/C LV8500 Series Vertical 2-Axis Turning Center 18/21/24-inch Box Way Type
LV1400 CNC T/C LV1400/2000 Vertical Ram Type Turning Center Ø1000/Ø1600 Table Ram Type
LV2000MM CNC T/C LV1400/2000 Vertical Ram Type Turning Center Ø1000/Ø1600 Table Ram Type
LF2200 Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LF2200M Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LF2200MQUICK Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LF2200QUICK Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LF2600 Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LF2600M Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LF2600MQUICK Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LF2600QUICK Ⅱ CNC T/C LF-Ⅱ Series 2-Spindle Facing Turning Center 8/10-inch Front Loading Type
LM1600TTMS CNC T/C LM1600TT Series Multi-Axis Turning Center 6-inch 2-Spindle 2-Turret Type
LM1600TTS CNC T/C LM1600TT Series Multi-Axis Turning Center 6-inch 2-Spindle 2-Turret Type
LM1600TTSY CNC T/C LM1600TT Series Multi-Axis Turning Center 6-inch 2-Spindle 2-Turret Type
LM1800TTMS CNC T/C LM1800TT Series Multi-Axis Turning Center 8-inch 2-Spindle 2-Turret Type
LM1800TTS CNC T/C LM1800TT Series Multi-Axis Turning Center 8-inch 2-Spindle 2-Turret Type
LM1800TTSY CNC T/C LM1800TT Series Multi-Axis Turning Center 8-inch 2-Spindle 2-Turret Type
LM2200TTSYY CNC T/C LM2200TT Series Multi-Axis Turning Center 8/10-inch 2-Spindle 2-Turret Type
LM2200TTSYYC CNC T/C LM2200TT Series Multi-Axis Turning Center 8/10-inch 2-Spindle 2-Turret Type
LM2500TT Ⅱ CNC T/C LM2500TT II Series Multi-Axis Turning Center 10-inch 2-Spindle 2-Turret Type
LM2500TTM Ⅱ CNC T/C LM2500TT II Series Multi-Axis Turning Center 10-inch 2-Spindle 2-Turret Type
LM2500TTMS Ⅱ CNC T/C LM2500TT II Series Multi-Axis Turning Center 10-inch 2-Spindle 2-Turret Type
LM2500TTS Ⅱ CNC T/C LM2500TT II Series Multi-Axis Turning Center 10-inch 2-Spindle 2-Turret Type
LM2500TTSY II CNC T/C LM2500TT II Series Multi-Axis Turning Center 10-inch 2-Spindle 2-Turret Type
KL6500AW CNC T/C AL WHEEL Series Aluminum Wheel Turning Center Aluminum Wheel Machining
LV800AW-TT CNC T/C AL WHEEL Series Aluminum Wheel Turning Center Aluminum Wheel Machining
LV8500RAW CNC T/C AL WHEEL Series Aluminum Wheel Turning Center Aluminum Wheel Machining
KIT600G CNC T/C KIT600G/800G Semiconductor Parts Grinding Turning Center Horizontal 12-inch Grinding Machine
KIT800G CNC T/C KIT600G/800G Semiconductor Parts Grinding Turning Center Horizontal 12-inch Grinding Machine
LV600G CNC T/C LV600G Semiconductor Parts Grinding Turning Center Vertical 12-inch Grinding Machine
i-CUT4000 Vertical M/C i-CUT Series Tapping Center Tapping Machine
i-CUT400TD Vertical M/C i-CUT Series Tapping Center Tapping Machine
i-CUT4500 Vertical M/C i-CUT Series Tapping Center Tapping Machine
F960B Vertical M/C F960B Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF4 Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF4L Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF5 Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF5/50 Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF5L Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF6 Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF6/50 Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF6L Vertical M/C KF4/5/6 Series Vertical Machining Center High Speed LM Guide Type
KF7600L Vertical M/C KF7600L Vertical Machining Center High Speed LM Guide Type
KF5700B/50 II Vertical M/C KF-B II Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF5700B II Vertical M/C KF-B II Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF6700B/50 II Vertical M/C KF-B II Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF6700B II Vertical M/C KF-B II Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF7700B/50 II Vertical M/C KF-B II Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF7700B II Vertical M/C KF-B II Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF1000B Vertical M/C KF-B Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF1100B Vertical M/C KF-B Series Vertical Machining Center Heavy Duty Cutting Box Guide Type
KF4300D Vertical M/C KF-D Series Dual Table Dual Table Type
KF5200D Vertical M/C KF-D Series Dual Table Dual Table Type
KF6000D Vertical M/C KF-D Series Dual Table Dual Table Type
KF4000/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF4000I/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF4300/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF4300G/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF4300P/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF5200/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF5200G/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF5200P/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF5700/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF5700G/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF6700/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF6700G/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF6750/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF8200/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
KF8250/2SP Vertical M/C KF-2SP Series 2-Spindle Machining Center 2 Spindle Type
HS10000 Horizontal M/C HS10000 Horizontal Machining Center LM Guide Way Type, □1,000 Table
HS4000 II Horizontal M/C HS4000/5000 II Series Horizontal Machining Center LM Guide Way Type, □400/□500 Table
HS5000/50 II Horizontal M/C HS4000/5000 II Series Horizontal Machining Center LM Guide Way Type, □400/□500 Table
HS5000 II Horizontal M/C HS4000/5000 II Series Horizontal Machining Center LM Guide Way Type, □400/□500 Table
HS6300 II Horizontal M/C HS6300/8000 II Horizontal Machining Center LM Guide Way Type, □630/□800 Table
HS8000 II Horizontal M/C HS6300/8000 II Horizontal Machining Center LM Guide Way Type, □630/□800 Table
KH1000 Horizontal M/C KH1000 Horizontal Machining Center Box Guide Way Type, □1,000 Table
KH50G Horizontal M/C KH50G Horizontal Machining Center Box Guide Way Type, □500 Table
KH6300 Horizontal M/C KH6300/8000 Horizontal Machining Center Box Guide Way Type, □630/□800 Table
KH8000 Horizontal M/C KH6300/8000 Horizontal Machining Center Box Guide Way Type, □630/□800 Table
KBN1300C Horizontal M/C KBN Series Quill Type Quill-Type Boring Machine
KBN1600C Horizontal M/C KBN Series Quill Type Quill-Type Boring Machine
KBR1300C Horizontal M/C KBR Series Ram Type Ram-Type Boring Machine
KBR1600C Horizontal M/C KBR Series Ram Type Ram-Type Boring Machine
XM2600 Multi-Tasking XM Series Multi-tasking Machine 10/12-inch Multi-tasking Machine
XM2600S Multi-Tasking XM Series Multi-tasking Machine 10/12-inch Multi-tasking Machine
XM2600ST Multi-Tasking XM Series Multi-tasking Machine 10/12-inch Multi-tasking Machine
XM3100 Multi-Tasking XM Series Multi-tasking Machine 10/12-inch Multi-tasking Machine
XM3100S Multi-Tasking XM Series Multi-tasking Machine 10/12-inch Multi-tasking Machine
XM3100ST Multi-Tasking XM Series Multi-tasking Machine 10/12-inch Multi-tasking Machine
KF3500/5A 5-Axis M/C KF-5A Series Vertical 5-Axis Vertical 5-Axis Machining Center
KF6500/5A 5-Axis M/C KF-5A Series Vertical 5-Axis Vertical 5-Axis Machining Center
KF7300/5A 5-Axis M/C KF-5A Series Vertical 5-Axis Vertical 5-Axis Machining Center
XF6300 5-Axis M/C XF Series Vertical 5-Axis High-Speed Vertical 5-Axis Machining Center
XF8500 5-Axis M/C XF Series Vertical 5-Axis High-Speed Vertical 5-Axis Machining Center
XF2000i 5-Axis M/C XF2000i Horizontal 5-Axis Horizontal 5-Axis Machining Center
"""

category_map_name = {
    "CNC T/C": "CNC Turning Center",
    "Vertical M/C": "Vertical Machining Center",
    "Horizontal M/C": "Horizontal Machining Center",
    "Multi-Tasking": "Multi-tasking Machine",
    "5-Axis M/C": "5-Axis Machining Center"
}

def main():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    lines = raw_data.strip().splitlines()
    models_to_insert = []
    
    for line in lines:
        if not line.strip(): continue
        
        cat_key = None
        for key in category_map_name.keys():
            if f" {key} " in line:
                cat_key = key
                break
        
        if not cat_key:
            print(f"Skipping line (no category found): {line}")
            continue
            
        code = line.split(f" {cat_key} ")[0].strip()
        category_name = category_map_name[cat_key]
        rest = line.split(f" {cat_key} ")[1].strip()
        
        models_to_insert.append({"code": code, "type": category_name, "spec": rest})

    # Ensure categories exist
    category_db_map = {}
    unique_categories = set(item["type"] for item in models_to_insert)
    
    for c_name in unique_categories:
        category = db.query(ProductCategory).filter(ProductCategory.name == c_name).first()
        if not category:
            category = ProductCategory(name=c_name)
            db.add(category)
            db.commit()
            db.refresh(category)
        category_db_map[c_name] = category.id

    added_count = 0
    updated_count = 0
    
    for item in models_to_insert:
        code = item["code"]
        c_id = category_db_map[item["type"]]
        
        existing = db.query(ProductModel).filter(ProductModel.model_code == code).first()
        if not existing:
            new_model = ProductModel(
                model_code=code,
                model_name=code,
                category_id=c_id,
                base_spec=item["spec"],
                is_active=True
            )
            db.add(new_model)
            added_count += 1
        else:
            existing.category_id = c_id
            existing.base_spec = item["spec"]
            existing.is_active = True
            updated_count += 1
            
    db.commit()
    print(f"Update completed. Total processed: {len(models_to_insert)}. Added: {added_count}, Updated: {updated_count}")
    db.close()

if __name__ == "__main__":
    main()
