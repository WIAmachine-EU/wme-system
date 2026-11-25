"""
ERP Weekly Sales List Diff & Standard 14-Column Excel Generator (Stage 1 CLI Utility)
=====================================================================================
이전 주차와 최신 주차 본사 Sales List 엑셀 파일 2개를 대조(Diff)하여:
1. ERP 업로드용 14개 표준 컬럼 엑셀 파일 생성:
   NO, S/O, MODEL, S/N, PO NUMBER, Port, PACKING, ETD, DUAL ITEM, FINAL, NC, INVOICE(E/C), VESSEL, B/L NO
2. 5개 탭으로 구성된 검수 리포트 생성:
   - Summary (요약)
   - ERP_Upload_14Cols (신규/변동 반영 대상)
   - Changes_Detail (필드별 변경 상세: Old -> New)
   - Noise_Filtered (포장 표기 통일 노이즈 제외 목록)
   - Exceptions_Audit (P/O·S/N 중복, S/O 미기입, P/O 공란 행 감사)

사용 예시:
    python erp_sales_sync.py --old week42.xlsx --new week44.xlsx --out-dir ./output
    python erp_sales_sync.py --old week42.xlsx --new week44.xlsx --prefixes A26-,F26- --use-ai
"""

from __future__ import annotations

import argparse
import datetime
import os
from collections import Counter
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

import openpyxl
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter

from erp_upload_router import (
    _norm_key,
    canonical_packing,
    load_po_filter_bytes,
    parse_hq_excel_bytes,
)

STANDARD_14_HEADERS: List[str] = [
    "NO",
    "S/O",
    "MODEL",
    "S/N",
    "PO NUMBER",
    "Port",
    "PACKING",
    "ETD",
    "DUAL ITEM",
    "FINAL",
    "NC",
    "INVOICE(E/C)",
    "VESSEL",
    "B/L NO",
]

COMPARE_FIELDS: List[Tuple[str, str]] = [
    ("section", "SECTION"),
    ("so_no", "S/O"),
    ("model", "MODEL"),
    ("serial_number", "S/N"),
    ("destination_port", "Port"),
    ("packing", "PACKING"),
    ("etd", "ETD"),
    ("dual_item", "DUAL ITEM"),
    ("price", "FINAL"),
    ("nc", "NC"),
    ("invoice_ec", "INVOICE(E/C)"),
    ("vessel", "VESSEL"),
    ("mbl_no", "B/L NO"),
]


def _fmt_val(v: Any) -> str:
    if v is None:
        return ""
    if isinstance(v, datetime.datetime):
        return v.strftime("%Y-%m-%d")
    return str(v).strip()


def compare_weekly_excels(
    old_bytes: bytes,
    new_bytes: bytes,
    target_po_set: Optional[Set[str]] = None,
    po_prefixes: Optional[Sequence[str]] = None,
    use_ai: bool = False,
) -> Dict[str, Any]:
    old_rows, old_meta = parse_hq_excel_bytes(
        old_bytes, target_po_set=target_po_set, po_prefixes=po_prefixes, use_ai=use_ai
    )
    new_rows, new_meta = parse_hq_excel_bytes(
        new_bytes, target_po_set=target_po_set, po_prefixes=po_prefixes, use_ai=use_ai
    )

    old_by_po: Dict[str, Dict[str, Any]] = {}
    for r in old_rows:
        old_by_po.setdefault(r["reference_no"], r)

    po_counts = Counter(r["reference_no"] for r in new_rows)
    sn_counts = Counter(r["serial_number"] for r in new_rows if r["serial_number"])

    actionable_rows: List[Dict[str, Any]] = []
    change_details: List[Dict[str, Any]] = []
    noise_rows: List[Dict[str, Any]] = []
    exceptions: List[Dict[str, Any]] = []
    category_counts: Counter = Counter()

    for r in new_rows:
        po = r["reference_no"]
        sn = r["serial_number"]

        if po_counts[po] > 1:
            exceptions.append({
                "type": "DUPLICATE_PO_IN_FILE",
                "excel_row": r["excel_row"],
                "po": po,
                "so": r["so_no"] or "",
                "sn": sn or "",
                "detail": f"동일 P/O {po}가 파일 내 {po_counts[po]}건 중복",
            })
        if sn and sn_counts[sn] > 1:
            exceptions.append({
                "type": "DUPLICATE_SN_IN_FILE",
                "excel_row": r["excel_row"],
                "po": po,
                "so": r["so_no"] or "",
                "sn": sn,
                "detail": f"동일 S/N {sn}이 파일 내 {sn_counts[sn]}건 중복",
            })
        if not r["so_no"]:
            exceptions.append({
                "type": "MISSING_SO_NO",
                "excel_row": r["excel_row"],
                "po": po,
                "so": "",
                "sn": sn or "",
                "detail": "S/O 미기입 (P/O 기준 정상 파싱됨)",
            })

        old_r = old_by_po.get(po)
        if old_r is None:
            cat = f"NEW_{r['section']}"
            category_counts[cat] += 1
            actionable_rows.append({"change_type": cat, "row": r})
            change_details.append({
                "change_type": cat,
                "excel_row": r["excel_row"],
                "po": po,
                "so": r["so_no"] or "",
                "model": r["model"] or "",
                "diff_summary": f"신규 추가 ({r['section']})",
            })
            continue

        diffs: List[str] = []
        raw_packing_changed = (old_r.get("packing_raw") or "") != (r.get("packing_raw") or "")
        for key, label in COMPARE_FIELDS:
            old_v = _fmt_val(old_r.get(key))
            new_v = _fmt_val(r.get(key))
            if key == "packing":
                old_cmp = canonical_packing(old_r.get("packing_raw") or old_v) or ""
                new_cmp = canonical_packing(r.get("packing_raw") or new_v) or ""
                same = old_cmp == new_cmp
            elif key in ("serial_number", "nc", "mbl_no", "destination_port"):
                same = _norm_key(old_v) == _norm_key(new_v)
            else:
                same = old_v == new_v
            if not same:
                diffs.append(f"{label}: {old_v or '∅'} -> {new_v or '∅'}")

        if not diffs:
            if raw_packing_changed:
                noise_rows.append({
                    "excel_row": r["excel_row"],
                    "po": po,
                    "so": r["so_no"] or "",
                    "old_packing": old_r.get("packing_raw") or "",
                    "new_packing": r.get("packing_raw") or "",
                    "canonical": r.get("packing") or "",
                })
                category_counts["NOISE_FILTERED"] += 1
            else:
                category_counts["UNCHANGED"] += 1
        else:
            cat = f"UPDATED_{r['section']}"
            category_counts[cat] += 1
            actionable_rows.append({"change_type": cat, "row": r})
            change_details.append({
                "change_type": cat,
                "excel_row": r["excel_row"],
                "po": po,
                "so": r["so_no"] or "",
                "model": r["model"] or "",
                "diff_summary": " | ".join(diffs),
            })

    for skipped in new_meta.get("skipped_missing_po_rows", []):
        exceptions.append({
            "type": "SKIPPED_MISSING_PO",
            "excel_row": skipped["excel_row"],
            "po": "",
            "so": skipped["so_no"],
            "sn": "",
            "detail": f"P/O 공란 행 제외 ({skipped['section']} / {skipped['model'] or '-'})",
        })

    new_po_set = {r["reference_no"] for r in new_rows}
    for old_po, old_r in old_by_po.items():
        if old_po not in new_po_set:
            exceptions.append({
                "type": "REMOVED_PO",
                "excel_row": old_r["excel_row"],
                "po": old_po,
                "so": old_r["so_no"] or "",
                "sn": old_r["serial_number"] or "",
                "detail": f"이전 주차에 존재했던 P/O가 최신 시트에서 삭제/누락됨 ({old_r['section']})",
            })

    return {
        "old_meta": old_meta,
        "new_meta": new_meta,
        "category_counts": dict(category_counts),
        "actionable_rows": actionable_rows,
        "change_details": change_details,
        "noise_rows": noise_rows,
        "exceptions": exceptions,
    }


def _style_sheet(ws: openpyxl.worksheet.worksheet.Worksheet, col_widths: List[int]) -> None:
    navy = PatternFill("solid", fgColor="1F3864")
    hdr_font = Font(name="Malgun Gothic", size=10, bold=True, color="FFFFFF")
    data_font = Font(name="Malgun Gothic", size=9.5, color="222222")
    thin = Side(border_style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    ws.row_dimensions[1].height = 24
    for col_idx in range(1, ws.max_column + 1):
        cell = ws.cell(1, col_idx)
        cell.fill, cell.font, cell.border = navy, hdr_font, border
        cell.alignment = Alignment(horizontal="center", vertical="center")

    for r_idx in range(2, ws.max_row + 1):
        for col_idx in range(1, ws.max_column + 1):
            c = ws.cell(r_idx, col_idx)
            c.font, c.border = data_font, border
            c.alignment = Alignment(vertical="center", wrap_text=True)

    for idx, width in enumerate(col_widths, 1):
        ws.column_dimensions[get_column_letter(idx)].width = width
    ws.freeze_panes = "A2"


def write_stage1_outputs(diff_result: Dict[str, Any], out_dir: str) -> Tuple[str, str]:
    os.makedirs(out_dir, exist_ok=True)
    ts = datetime.datetime.now().strftime("%Y%m%d_%H%M")
    upload_path = os.path.join(out_dir, f"ERP_Upload_14Cols_{ts}.xlsx")
    report_path = os.path.join(out_dir, f"ERP_Diff_Review_Report_{ts}.xlsx")

    # 1) ERP 업로드용 14개 표준 컬럼 엑셀
    wb_up = openpyxl.Workbook()
    ws_up = wb_up.active
    ws_up.title = "ERP_Upload"
    ws_up.append(STANDARD_14_HEADERS)
    for idx, item in enumerate(diff_result["actionable_rows"], 1):
        r = item["row"]
        ws_up.append([
            idx,
            r["so_no"] or "",
            r["model"] or "",
            r["serial_number"] or "",
            r["reference_no"] or "",
            r["destination_port"] or "",
            r["packing"] or "",
            _fmt_val(r["etd"]),
            r["dual_item"] or "",
            r["price"] or "",
            r["nc"] or "",
            r["invoice_ec"] or "",
            r["vessel"] or "",
            r["mbl_no"] or "",
        ])
    _style_sheet(ws_up, [7, 12, 16, 16, 15, 14, 14, 13, 12, 12, 10, 18, 22, 20])
    wb_up.save(upload_path)

    # 2) 5개 탭 검수 리포트
    wb_rep = openpyxl.Workbook()

    ws1 = wb_rep.active
    ws1.title = "1_Summary"
    ws1.append(["항목", "값"])
    ws1.append(["이전 주차 시트", f"{diff_result['old_meta']['sheet_name']} ({diff_result['old_meta']['total_po_rows']}건)"])
    ws1.append(["최신 주차 시트", f"{diff_result['new_meta']['sheet_name']} ({diff_result['new_meta']['total_po_rows']}건)"])
    ws1.append(["반영 대상 합계", len(diff_result["actionable_rows"])])
    ws1.append(["포장 표기 노이즈 제외", len(diff_result["noise_rows"])])
    ws1.append(["예외/감사 항목", len(diff_result["exceptions"])])
    for k, v in sorted(diff_result["category_counts"].items()):
        ws1.append([f"분류: {k}", v])
    _style_sheet(ws1, [28, 42])

    ws2 = wb_rep.create_sheet("2_ERP_Upload_14Cols")
    ws2.append(["CHANGE_TYPE"] + STANDARD_14_HEADERS)
    for idx, item in enumerate(diff_result["actionable_rows"], 1):
        r = item["row"]
        ws2.append([
            item["change_type"], idx, r["so_no"] or "", r["model"] or "", r["serial_number"] or "",
            r["reference_no"] or "", r["destination_port"] or "", r["packing"] or "", _fmt_val(r["etd"]),
            r["dual_item"] or "", r["price"] or "", r["nc"] or "", r["invoice_ec"] or "", r["vessel"] or "",
            r["mbl_no"] or "",
        ])
    _style_sheet(ws2, [20, 7, 12, 16, 16, 15, 14, 14, 13, 12, 12, 10, 18, 22, 20])

    ws3 = wb_rep.create_sheet("3_Changes_Detail")
    ws3.append(["변동유형", "엑셀행", "P/O", "S/O", "MODEL", "변경 상세 (Old -> New)"])
    for d in diff_result["change_details"]:
        ws3.append([d["change_type"], d["excel_row"], d["po"], d["so"], d["model"], d["diff_summary"]])
    _style_sheet(ws3, [22, 9, 15, 12, 16, 56])

    ws4 = wb_rep.create_sheet("4_Noise_Filtered")
    ws4.append(["엑셀행", "P/O", "S/O", "이전 PACKING", "최신 PACKING", "정규화 결과"])
    for n in diff_result["noise_rows"]:
        ws4.append([n["excel_row"], n["po"], n["so"], n["old_packing"], n["new_packing"], n["canonical"]])
    _style_sheet(ws4, [9, 15, 12, 20, 20, 18])

    ws5 = wb_rep.create_sheet("5_Exceptions_Audit")
    ws5.append(["유형", "엑셀행", "P/O", "S/O", "S/N", "상세 내용"])
    for e in diff_result["exceptions"]:
        ws5.append([e["type"], e["excel_row"], e["po"], e["so"], e["sn"], e["detail"]])
    _style_sheet(ws5, [24, 9, 15, 12, 16, 48])

    wb_rep.save(report_path)
    return upload_path, report_path


def main() -> None:
    parser = argparse.ArgumentParser(description="HQ Weekly Sales List Diff & 14-Column ERP Generator")
    parser.add_argument("--old", required=True, help="이전 주차 본사 Sales List 엑셀 (.xlsx)")
    parser.add_argument("--new", required=True, help="최신 주차 본사 Sales List 엑셀 (.xlsx)")
    parser.add_argument("--po-filter", default=None, help="(선택) 기준 P/O 목록 파일 (.xlsx/.csv/.txt)")
    parser.add_argument("--prefixes", default=None, help="(선택) P/O 접두어 필터 (예: A26-,F26-)")
    parser.add_argument("--use-ai", action="store_true", help="미매칭 헤더 발생 시 Gemini AI 추론 사용")
    parser.add_argument("--out-dir", default="./sync_output", help="결과 엑셀 저장 폴더")
    args = parser.parse_args()

    with open(args.old, "rb") as f:
        old_bytes = f.read()
    with open(args.new, "rb") as f:
        new_bytes = f.read()

    po_set = None
    if args.po_filter:
        with open(args.po_filter, "rb") as f:
            po_set = load_po_filter_bytes(f.read(), args.po_filter)

    prefixes = [p.strip() for p in args.prefixes.split(",") if p.strip()] if args.prefixes else None
    diff_res = compare_weekly_excels(
        old_bytes, new_bytes, target_po_set=po_set, po_prefixes=prefixes, use_ai=args.use_ai
    )
    upload_path, report_path = write_stage1_outputs(diff_res, args.out_dir)

    print(f"[DONE] Actionable rows: {len(diff_res['actionable_rows'])}")
    print(f"[DONE] Noise filtered:  {len(diff_res['noise_rows'])}")
    print(f"[DONE] Exceptions:      {len(diff_res['exceptions'])}")
    print(f" -> Upload Excel: {upload_path}")
    print(f" -> Review Report: {report_path}")


if __name__ == "__main__":
    main()
