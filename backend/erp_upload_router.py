"""
ERP Weekly Sales List Sync Router (Render PostgreSQL + SQLAlchemy + FastAPI)
============================================================================
현재 운영 중인 `backend/models.py` (Order, Shipment, Master 6종) 및 `database.py`
구조에 맞춰 설계된 `/preview` (DB 직접 대조) + `/apply` (원자적 트랜잭션 Upsert) 모듈입니다.

[기존 FastAPI 앱(backend/main.py) 연동 예시]
    from erp_upload_router import create_erp_sync_router
    app.include_router(create_erp_sync_router(auth_dependency=_require_non_dealer))

    # 또는 기본 router 객체 사용 시 (순환 임포트 완전 방지):
    from erp_upload_router import router as erp_sync_router
    app.include_router(erp_sync_router, dependencies=[Depends(_require_non_dealer)])
"""

from __future__ import annotations

import datetime
import io
import json
import os
import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Sequence, Set, Tuple
from urllib.parse import quote

import openpyxl
import pandas as pd
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse, StreamingResponse
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

import models
from database import get_db

# =============================================================================
# 1. 상수, 별칭 사전 및 도메인 매핑 규칙
# =============================================================================

EMPTY_TOKENS: Set[str] = {"", "-", "--", "//", "/", "nan", "none", "nat", "null", "n/a", "tbd"}

ALLOWED_SECTIONS: Set[str] = {
    "SHIPPED",
    "SHIPMENT PLAN",
    "BACK LOG",
    "HWME STOCK ORDER",
}

# 본사 엑셀 헤더 표기 변동 방어용 별칭 사전 (정규화: 소문자 + 공백/점/줄바꿈 제거)
COLUMN_ALIASES: Dict[str, List[str]] = {
    "reference_no": ["ponumber", "p/o", "pono", "po#", "po", "referenceno"],
    "so_no": ["s/o", "so", "sono", "s/ono", "hqso", "salesorder"],
    "model": ["model", "modelname", "modelcode", "기종"],
    "serial_number": ["s/n", "sn", "serial", "serialno", "serialnumber", "호기"],
    "dealer": ["dealer", "orderdealer", "dealername", "딜러"],
    "destination_port": ["port", "pod", "destport", "destinationport", "도착항"],
    "packing": ["packing", "expectedpacking", "packdate", "포장", "포장일"],
    "etd": ["etd", "hqetd", "etdpol", "b/ldate", "bldate", "출항예정일"],
    "atd": ["atd", "actualdeparture", "실출항일"],
    "eta": ["eta", "etapod", "도착예정일"],
    "dual_item": ["dualitem", "dualuse", "전략물자"],
    "price": ["final", "buying", "buyingprice", "finalprice", "구매가"],
    "sales_price": ["salesprice", "판매가"],
    "nc": ["nc", "nccode", "cnc", "controller"],
    "incoterms": ["incoterms", "incoterm", "인코텀즈"],
    "detail_spec": ["detailspec", "option", "spec", "옵션", "상세사양"],
    "invoice_ec": ["invoice(e/c)", "invoice(e/c)면장", "invoiceec", "ecinvoice"],
    "vessel": ["vessel", "vesselname", "선박명", "선명"],
    "mbl_no": ["b/lno", "b/l", "blno", "bl#", "bl", "mblno", "mbl", "houseb/l", "선하증권번호"],
    "dealer_order_no": ["dealerorderno", "dealerpo", "hwmepo", "법인po"],
    "dealer_order_date": ["orderdate", "podate", "발주일"],
    "delivery_request_date": ["d/l", "dl", "deliveryrequestdate", "납기요청일"],
    "remark": ["remark", "remarks", "비고"],
}

# MBL 앞 4자리 SCAC 코드 -> 선사명 자동 판별
SCAC_TO_CARRIER: Dict[str, str] = {
    "HDMU": "HMM",
    "HMMU": "HMM",
    "MAEU": "Maersk",
    "MSKU": "Maersk",
    "MRKU": "Maersk",
    "MEDU": "MSC",
    "MSCU": "MSC",
    "ONEY": "ONE",
    "CMAU": "CMA CGM",
    "EGLV": "Evergreen",
    "EGLC": "Evergreen",
    "HLCU": "Hapag-Lloyd",
    "COSU": "COSCO",
    "OOLU": "OOCL",
    "YMLU": "Yang Ming",
    "ZIMU": "ZIM",
    "PLIH": "LX Pantos",
}

# 주요 유럽/터키 도착항 명칭 -> UN/LOCODE 보조 매핑 (PortCode 테이블에 없는 도시명 보정)
PORT_NAME_TO_CODE: Dict[str, str] = {
    "HAMBURG": "DEHAM",
    "ROTTERDAM": "NLRTM",
    "ANTWERP": "BEANR",
    "BREMERHAVEN": "DEBRV",
    "KOPER": "SIKOP",
    "RIJEKA": "HRRJK",
    "TRIESTE": "ITTRS",
    "GENOA": "ITGOA",
    "LE HAVRE": "FRLEH",
    "FOS": "FRFOS",
    "ISTANBUL": "TRIST",
    "AMBARLI": "TRAMB",
    "MERSIN": "TRMER",
    "MERCIN": "TRMER",
    "IZMIR": "TRIZM",
    "LEIXOES": "PTLEI",
    "LEXOES": "PTLEI",
    "BILBAO": "ESBIO",
    "VALENCIA": "ESVLC",
    "BARCELONA": "ESBCN",
    "FELIXSTOWE": "GBFXT",
    "SOUTHAMPTON": "GBSOU",
    "GDANSK": "PLGDN",
    "GDYNIA": "PLGDY",
    "OSLO": "NOOSL",
    "STAVANGER": "NOSVG",
    "GOTHENBURG": "SEGOT",
    "AARHUS": "DKAAR",
    "HELSINKI": "FIHEL",
}

# 본사 시트 법인 표기 -> DB DealerCompany.name 매핑
CORPORATE_DEALER_ALIASES: Set[str] = {"WME", "HWME", "HYUNDAI WIA EUROPE", "WIA EUROPE"}

# 보존 대상 유럽 법인 자체 관리 stock_type (F 발주 업데이트 시 덮어쓰기 금지)
PRESERVED_CORPORATE_STOCK_TYPES: Set[str] = {"RENTAL", "SHOWROOM", "RESERVED", "PROMOTION"}

# 주문 상태 진행 순서 (본사 동기화 시 이미 진척된 유럽 현지 상태를 역행시키지 않음)
STATUS_RANK: Dict[models.OrderStatus, int] = {
    models.OrderStatus.CONFIRMED: 10,
    models.OrderStatus.IN_PRODUCTION: 20,
    models.OrderStatus.SHIPPING: 30,
    models.OrderStatus.ARRIVED: 40,
    models.OrderStatus.IN_STOCK: 50,
    models.OrderStatus.DISPATCHED: 60,
    models.OrderStatus.SOLD: 70,
}

# DB 대조 대상 Order 필드 목록
TRACKED_ORDER_DIFF_FIELDS: List[str] = [
    "so_no",
    "serial_number",
    "product_model_id",
    "dealer_company_id",
    "current_status",
    "is_corporate_stock",
    "stock_type",
    "nc",
    "detail_spec",
    "incoterms",
    "destination_port",
    "vessel",
    "price",
    "sales_price",
    "etd",
    "eta",
    "mbl_no",
]


# =============================================================================
# 2. Pydantic 입출력 스키마 (/preview 응답 및 /apply 요청)
# =============================================================================

class OrderApplyItem(BaseModel):
    reference_no: str = Field(..., description="발주번호 P/O (orders.reference_no UNIQUE)")
    action: str = Field(..., description="CREATE 또는 UPDATE")
    product_model_id: int
    dealer_company_id: int
    serial_number: Optional[str] = None
    so_no: Optional[str] = None
    current_status: models.OrderStatus = models.OrderStatus.CONFIRMED
    is_corporate_stock: bool = False
    stock_type: Optional[str] = None
    nc: Optional[str] = None
    detail_spec: Optional[str] = None
    incoterms: Optional[str] = None
    destination_port: Optional[str] = None
    vessel: Optional[str] = None
    price: Optional[str] = None
    sales_price: Optional[str] = None
    etd: Optional[datetime.datetime] = None
    eta: Optional[datetime.datetime] = None
    dealer_order_date: Optional[datetime.datetime] = None
    dealer_order_no: Optional[str] = None
    delivery_request_date: Optional[str] = None
    remark: Optional[str] = None
    mbl_no: Optional[str] = Field(None, description="연결할 Master B/L 번호 (shipments.mbl_no)")


class ShipmentApplyItem(BaseModel):
    mbl_no: str = Field(..., description="Master B/L 번호 (shipments.mbl_no UNIQUE)")
    carrier: Optional[str] = None
    pol: Optional[str] = "KRPUS"
    pod: Optional[str] = None
    vessel: Optional[str] = None
    voyage: Optional[str] = None
    etd: Optional[datetime.datetime] = None
    atd: Optional[datetime.datetime] = None
    eta: Optional[datetime.datetime] = None


class ApplySyncRequest(BaseModel):
    orders: List[OrderApplyItem] = Field(default_factory=list)
    shipments: List[ShipmentApplyItem] = Field(default_factory=list)
    skip_on_conflict: bool = Field(
        False,
        description="True이면 실시간 충돌 건을 제외하고 정상 건만 커밋, False이면 충돌 발견 시 전체 롤백(409)",
    )


# =============================================================================
# 3. 정규화 및 파싱 유틸리티
# =============================================================================

def _norm_key(val: Any) -> str:
    """마스터 코드 대조용 UPPER(TRIM(...)) 정규화."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    return re.sub(r"\s+", " ", str(val).strip()).upper()


def _norm_header(val: Any) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    return re.sub(r"[\s_\.\n\r]+", "", str(val).strip().lower())


def clean_nullable_str(val: Any) -> Optional[str]:
    """빈 문자열 및 자리표시자('', '-', '//', 'nan', 'None')를 반드시 Python None(SQL NULL)으로 변환."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    s = str(val).strip()
    if s.lower() in EMPTY_TOKENS:
        return None
    return s


def canonical_packing(val: Any) -> Optional[str]:
    """
    PACKING 표기 통일 노이즈 제거용 정규화 함수.
    예: '포장완료' -> 'PACKED', '27년 1월' / '2027-01' / '2027.1' -> '2027.01',
        Timestamp / '2026-10-25' -> '2026-10-25'
    """
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (pd.Timestamp, datetime.datetime, datetime.date)):
        dt = parse_excel_datetime(val)
        return dt.strftime("%Y-%m-%d") if dt else None

    s = clean_nullable_str(val)
    if not s:
        return None

    compact = re.sub(r"\s+", "", s).upper()
    if compact in ("포장완료", "PACKED", "COMPLETE", "COMPLETED", "완료"):
        return "PACKED"

    # '27년 1월', '2027년 01월' -> '2027.01'
    m_kr = re.match(r"^(20)?(\d{2})년\s*(\d{1,2})월$", s.strip())
    if m_kr:
        yy = int(m_kr.group(2))
        mm = int(m_kr.group(3))
        if 1 <= mm <= 12:
            return f"{2000 + yy:04d}.{mm:02d}"

    # '2027.1', '2027-01', '2027/01', '27.01' -> '2027.01'
    m_ym = re.match(r"^(20)?(\d{2})[-./](\d{1,2})$", s.strip())
    if m_ym:
        yy = int(m_ym.group(2))
        mm = int(m_ym.group(3))
        if 1 <= mm <= 12:
            return f"{2000 + yy:04d}.{mm:02d}"

    dt = parse_excel_datetime(s)
    if dt:
        return dt.strftime("%Y-%m-%d")

    return s.strip()


def clean_po_number(val: Any) -> Optional[str]:
    s = clean_nullable_str(val)
    if not s:
        return None
    if re.match(r"^[A-Za-z0-9][A-Za-z0-9\-/_]{3,}$", s) and not s.isdigit():
        return s.upper()
    return None


def clean_so_number(val: Any) -> Optional[str]:
    s = clean_nullable_str(val)
    if not s:
        return None
    try:
        fv = float(s.replace(",", ""))
        if fv.is_integer() and fv >= 100000:
            return str(int(fv))
    except ValueError:
        pass
    return s if re.match(r"^\d{6,}$", s) else None


def clean_serial_number(val: Any) -> Optional[str]:
    """호기(S/N) 정규화: 공란/구분자/엑셀 수식 0('0', '0.0') -> None(SQL NULL), 정상 값은 대문자 TRIM."""
    s = clean_nullable_str(val)
    if not s:
        return None
    if s.lower() in EMPTY_TOKENS or s in ("0", "0.0") or len(s) < 3:
        return None
    return s.upper()


def clean_price_str(val: Any) -> Optional[str]:
    s = clean_nullable_str(val)
    if not s:
        return None
    try:
        fv = float(s.replace(",", ""))
        if fv == 0:
            return None
        return str(int(fv)) if fv.is_integer() else f"{fv:.2f}"
    except ValueError:
        return s


def parse_excel_datetime(val: Any) -> Optional[datetime.datetime]:
    """엑셀의 다양한 날짜 표기(Timestamp, '2026-10-25', '26.01.03', '26/01/03')를 DateTime으로 변환."""
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None
    if isinstance(val, (pd.Timestamp, datetime.datetime)):
        dt = pd.to_datetime(val).to_pydatetime()
        # 엑셀 숫자 오입력으로 생기는 1900년 이상치 차단 (예: '1900-01-26 00:43:12')
        if dt.year < 2000 or dt.year > 2100:
            return None
        return dt.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    if isinstance(val, datetime.date):
        if val.year < 2000 or val.year > 2100:
            return None
        return datetime.datetime(val.year, val.month, val.day)

    s = clean_nullable_str(val)
    if not s:
        return None

    # '2026-10-25' 또는 '2026-10-25 00:00:00'
    m = re.match(r"^(20\d{2})[-./](\d{1,2})[-./](\d{1,2})", s)
    if m:
        try:
            return datetime.datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)))
        except ValueError:
            return None

    # '26.01.03' 또는 '26/01/03' (YY.MM.DD)
    m2 = re.match(r"^(\d{2})[-./](\d{1,2})[-./](\d{1,2})$", s)
    if m2:
        try:
            return datetime.datetime(2000 + int(m2.group(1)), int(m2.group(2)), int(m2.group(3)))
        except ValueError:
            return None

    return None


def split_vessel_voyage(raw_vessel: Optional[str]) -> Tuple[Optional[str], Optional[str]]:
    """
    'ONE TRIUMPH 0032W', 'ONE INSPIRATION / 007W', 'MSC JOSEFINA - FW603W' 등에서
    (선박명, 항차)를 분리합니다.
    """
    if not raw_vessel:
        return None, None
    s = re.sub(r"\s+", " ", raw_vessel.strip())
    # 구분자('/', '-')가 명시된 경우 우선 분리
    m_sep = re.match(r"^(.+?)\s*[/\-]\s*([A-Za-z0-9]{3,12})$", s)
    if m_sep:
        return m_sep.group(1).strip(), m_sep.group(2).strip().upper()

    # 공백으로 끝 토큰이 항차 패턴(숫자 포함 3~12자리 영숫자, 예: 0032W, 0BEMVW1MA, 603E)인 경우
    parts = s.rsplit(" ", 1)
    if len(parts) == 2 and re.match(r"^(?=.*\d)[A-Za-z0-9]{3,12}$", parts[1]):
        return parts[0].strip(), parts[1].strip().upper()
    return s, None


def infer_carrier_from_mbl(mbl_no: Optional[str]) -> Optional[str]:
    if not mbl_no:
        return None
    prefix = mbl_no.strip().upper()[:4]
    return SCAC_TO_CARRIER.get(prefix)


def _fmt_diff_val(val: Any) -> Any:
    if isinstance(val, datetime.datetime):
        return val.strftime("%Y-%m-%d")
    if isinstance(val, models.OrderStatus):
        return val.value
    return val


# =============================================================================
# 4. 마스터 테이블 1회 프리패치 (N+1 쿼리 완전 제거)
# =============================================================================

@dataclass
class MasterCache:
    # UPPER(TRIM(key)) -> ORM object / id
    models_by_code: Dict[str, models.ProductModel] = field(default_factory=dict)
    models_by_name: Dict[str, models.ProductModel] = field(default_factory=dict)
    models_by_compact: Dict[str, models.ProductModel] = field(default_factory=dict)
    dealers_by_name: Dict[str, models.DealerCompany] = field(default_factory=dict)
    dealers_by_sap: Dict[str, models.DealerCompany] = field(default_factory=dict)
    wme_dealer: Optional[models.DealerCompany] = None
    nc_codes: Set[str] = field(default_factory=set)
    incoterm_codes: Set[str] = field(default_factory=set)
    port_codes: Set[str] = field(default_factory=set)

    # 기존 운영 데이터 스냅샷
    orders_by_ref: Dict[str, models.Order] = field(default_factory=dict)
    orders_by_sn: Dict[str, models.Order] = field(default_factory=dict)
    shipments_by_mbl: Dict[str, models.Shipment] = field(default_factory=dict)
    shipments_by_id: Dict[int, models.Shipment] = field(default_factory=dict)


def prefetch_master_and_state(db: Session) -> MasterCache:
    """
    6종 마스터 테이블 + 기존 orders/shipments를 단일 쿼리씩 1회 프리패치합니다.
    수백 행의 엑셀 검증 시 N+1 DB 쿼리가 전혀 발생하지 않습니다.
    """
    cache = MasterCache()

    for pm in db.execute(select(models.ProductModel)).scalars().all():
        c_key = _norm_key(pm.model_code)
        n_key = _norm_key(pm.model_name)
        if c_key:
            cache.models_by_code[c_key] = pm
            cache.models_by_compact[re.sub(r"[\s\-_/]+", "", c_key)] = pm
        if n_key:
            cache.models_by_name[n_key] = pm
            cache.models_by_compact[re.sub(r"[\s\-_/]+", "", n_key)] = pm

    for dc in db.execute(select(models.DealerCompany)).scalars().all():
        n_key = _norm_key(dc.name)
        if n_key:
            cache.dealers_by_name[n_key] = dc
            if n_key == "WME":
                cache.wme_dealer = dc
        s_key = _norm_key(dc.sap_code)
        if s_key:
            cache.dealers_by_sap[s_key] = dc

    cache.nc_codes = {
        _norm_key(nc.nc_code)
        for nc in db.execute(select(models.NCCode)).scalars().all()
        if nc.nc_code
    }
    cache.incoterm_codes = {
        _norm_key(ic.incoterm_code)
        for ic in db.execute(select(models.IncotermCode)).scalars().all()
        if ic.incoterm_code
    }
    cache.port_codes = {
        _norm_key(pc.port_code)
        for pc in db.execute(select(models.PortCode)).scalars().all()
        if pc.port_code
    }

    for sh in db.execute(select(models.Shipment)).scalars().all():
        cache.shipments_by_id[sh.id] = sh
        if sh.mbl_no:
            cache.shipments_by_mbl[_norm_key(sh.mbl_no)] = sh

    for od in db.execute(select(models.Order)).scalars().all():
        if od.reference_no:
            cache.orders_by_ref[_norm_key(od.reference_no)] = od
        if od.serial_number:
            cache.orders_by_sn[_norm_key(od.serial_number)] = od

    return cache


def resolve_product_model(raw_model: Optional[str], cache: MasterCache) -> Optional[models.ProductModel]:
    if not raw_model:
        return None
    k = _norm_key(raw_model)
    if k in cache.models_by_code:
        return cache.models_by_code[k]
    if k in cache.models_by_name:
        return cache.models_by_name[k]
    compact = re.sub(r"[\s\-_/]+", "", k)
    return cache.models_by_compact.get(compact)


def resolve_dealer(
    raw_dealer: Optional[str],
    is_corporate_stock: bool,
    cache: MasterCache,
) -> Optional[models.DealerCompany]:
    """F 시작 법인재고 또는 HWME 표기는 'WME' 딜러사로 우선 매핑."""
    k = _norm_key(raw_dealer)
    if is_corporate_stock and (not k or k in CORPORATE_DEALER_ALIASES):
        return cache.wme_dealer
    if k in CORPORATE_DEALER_ALIASES and cache.wme_dealer is not None:
        return cache.wme_dealer
    if k in cache.dealers_by_name:
        return cache.dealers_by_name[k]
    if k in cache.dealers_by_sap:
        return cache.dealers_by_sap[k]
    # F 발주인데 딜러란에 다른 값이 비어있거나 미매칭이면 WME 폴백
    if is_corporate_stock and cache.wme_dealer is not None:
        return cache.wme_dealer
    return None


def resolve_port_code(raw_port: Optional[str], cache: MasterCache) -> Tuple[Optional[str], Optional[str]]:
    """
    도착항 원본 문자열로부터 (orders.destination_port 저장값, shipments.pod UN/LOCODE) 반환.
    """
    clean = clean_nullable_str(raw_port)
    if not clean:
        return None, None
    k = _norm_key(clean)
    if k in cache.port_codes:
        return k, k
    mapped_code = PORT_NAME_TO_CODE.get(k)
    if mapped_code and mapped_code in cache.port_codes:
        return clean, mapped_code
    return clean, mapped_code or k


# =============================================================================
# 5. 본사 엑셀 자동 탐색 및 AI 보조 스키마 추론
# =============================================================================

def _extract_json_dict(raw_text: str) -> Dict[str, Any]:
    text = (raw_text or "").strip()
    if text.startswith("```json"):
        text = text[7:]
    elif text.startswith("```"):
        text = text[3:]
    if text.endswith("```"):
        text = text[:-3]
    return json.loads(text.strip())


def _infer_missing_columns_gemini(
    missing_fields: List[str],
    unmapped_headers: Dict[int, str],
    sample_rows: List[Dict[str, Any]],
) -> Dict[str, int]:
    """
    별칭 사전에 없는 신규 헤더가 등장했을 때 헤더 목록과 샘플 3행만 Gemini API로 전달해
    컬럼 인덱스를 추론합니다. 신규 `google-genai` SDK와 기존 `google-generativeai` SDK를
    모두 호환 지원합니다.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key or not missing_fields or not unmapped_headers:
        return {}

    prompt = (
        "Map each missing ERP field name to the matching Excel source column index.\n"
        f"Missing fields: {missing_fields}\n"
        f"Unmapped headers (index -> title): {json.dumps(unmapped_headers, ensure_ascii=False)}\n"
        f"Sample rows: {json.dumps(sample_rows[:3], ensure_ascii=False, default=str)}\n"
        "Return ONLY valid JSON mapping field_name -> integer column index. Omit uncertain fields."
    )
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    valid_idx = set(unmapped_headers.keys())

    # 1) google-genai (신규 공식 SDK) 우선 시도
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        resp = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )
        parsed = _extract_json_dict(resp.text)
        return {k: int(v) for k, v in parsed.items() if k in missing_fields and str(v).isdigit() and int(v) in valid_idx}
    except ImportError:
        pass
    except Exception:
        pass

    # 2) google-generativeai (기존 requirements.txt 설치 SDK) 폴백
    try:
        import google.generativeai as legacy_genai

        legacy_genai.configure(api_key=api_key)
        model = legacy_genai.GenerativeModel(
            model_name,
            generation_config={"temperature": 0.0, "response_mime_type": "application/json"},
        )
        resp = model.generate_content(prompt)
        parsed = _extract_json_dict(resp.text)
        return {k: int(v) for k, v in parsed.items() if k in missing_fields and str(v).isdigit() and int(v) in valid_idx}
    except Exception:
        return {}


def parse_hq_excel_bytes(
    excel_bytes: bytes,
    target_po_set: Optional[Set[str]] = None,
    po_prefixes: Optional[Sequence[str]] = None,
    use_ai: bool = False,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    시트명·열 위치 변경에 강건한 본사 Sales List 파서.
    4개 섹션(SHIPPED, SHIPMENT PLAN, BACK LOG, HWME STOCK ORDER) 전체에서
    유효한 PO NUMBER 행을 추출합니다.
    """
    xls = pd.ExcelFile(io.BytesIO(excel_bytes))
    all_alias_tokens = {tok for aliases in COLUMN_ALIASES.values() for tok in aliases}

    best_score = -1
    best_sheet = None
    best_header_row = 0
    best_raw = None

    for sheet in xls.sheet_names:
        raw = pd.read_excel(xls, sheet_name=sheet, header=None)
        for r in range(min(15, len(raw))):
            norms = [_norm_header(v) for v in raw.iloc[r].tolist()]
            score = sum(1 for v in norms if v in all_alias_tokens)
            if any(v in COLUMN_ALIASES["reference_no"] for v in norms):
                score += 6
            if any(v in COLUMN_ALIASES["model"] for v in norms):
                score += 3
            if score > best_score:
                best_score = score
                best_sheet = sheet
                best_header_row = r
                best_raw = raw

    if best_raw is None or best_score < 6:
        raise ValueError("엑셀에서 유효한 주문/선적 헤더(PO NUMBER, MODEL 등)를 찾을 수 없습니다.")

    raw_headers = [str(v).strip() if pd.notna(v) else "" for v in best_raw.iloc[best_header_row].tolist()]
    norm_headers = [_norm_header(v) for v in raw_headers]

    col_map: Dict[str, Tuple[int, str, str]] = {}
    used_idx: Set[int] = set()

    for field_name, aliases in COLUMN_ALIASES.items():
        found_idx = None
        method = ""
        for idx, nh in enumerate(norm_headers):
            if idx in used_idx or not nh:
                continue
            if nh == aliases[0]:
                found_idx, method = idx, "exact"
                break
        if found_idx is None:
            for idx, nh in enumerate(norm_headers):
                if idx in used_idx or not nh:
                    continue
                if nh in aliases:
                    found_idx, method = idx, "alias"
                    break
        if found_idx is not None:
            col_map[field_name] = (found_idx, raw_headers[found_idx], method)
            used_idx.add(found_idx)

    # AI 보조 추론 (핵심 필드 누락 + use_ai=True)
    core_fields = [
        "reference_no", "so_no", "model", "serial_number", "dealer",
        "destination_port", "etd", "price", "nc", "vessel", "mbl_no",
    ]
    missing = [f for f in core_fields if f not in col_map]
    ai_inferred_fields: List[str] = []
    if missing and use_ai:
        unmapped = {i: h for i, h in enumerate(raw_headers) if i not in used_idx and h}
        sample_df = best_raw.iloc[best_header_row + 1 : best_header_row + 6]
        sample_rows = [
            {unmapped[i]: row.iloc[i] for i in unmapped if i < len(row)}
            for _, row in sample_df.iterrows()
        ]
        inferred = _infer_missing_columns_gemini(missing, unmapped, sample_rows)
        for f_name, idx in inferred.items():
            col_map[f_name] = (idx, raw_headers[idx], "ai_inferred")
            ai_inferred_fields.append(f_name)

    if "reference_no" not in col_map:
        raise ValueError("필수 기준 컬럼 'PO NUMBER' (또는 'P/O')를 찾을 수 없습니다.")

    po_idx = col_map["reference_no"][0]
    so_idx = col_map["so_no"][0] if "so_no" in col_map else None
    model_idx = col_map["model"][0] if "model" in col_map else None

    norm_prefixes = tuple(p.strip().upper() for p in (po_prefixes or []) if p.strip())
    current_section = "SHIPPED"
    parsed_rows: List[Dict[str, Any]] = []
    skipped_missing_po: List[Dict[str, Any]] = []

    def _get(r_idx: int, key: str) -> Any:
        if key not in col_map:
            return None
        c_idx = col_map[key][0]
        return best_raw.iloc[r_idx, c_idx] if c_idx < best_raw.shape[1] else None

    for r in range(len(best_raw)):
        c0 = clean_nullable_str(best_raw.iloc[r, 0]) or ""
        c1 = clean_nullable_str(best_raw.iloc[r, 1]) if best_raw.shape[1] > 1 else ""

        if c0.startswith("▣"):
            sec_upper = c0.replace("▣", "").strip().upper()
            for allowed in ALLOWED_SECTIONS:
                if allowed in sec_upper:
                    current_section = allowed
                    break
            continue

        if r == best_header_row or c0.upper() == "S/O" or (c0 == "" and (c1 or "").upper() == "MODEL"):
            continue

        po_val = clean_po_number(best_raw.iloc[r, po_idx])
        so_val = clean_so_number(best_raw.iloc[r, so_idx]) if so_idx is not None else None
        model_val = clean_nullable_str(best_raw.iloc[r, model_idx]) if model_idx is not None else None

        if not po_val:
            if so_val:
                skipped_missing_po.append({
                    "excel_row": r + 1,
                    "section": current_section,
                    "so_no": so_val,
                    "model": model_val,
                })
            continue

        if target_po_set is not None and po_val not in target_po_set:
            continue
        if norm_prefixes and not po_val.startswith(norm_prefixes):
            continue

        parsed_rows.append({
            "excel_row": r + 1,
            "section": current_section,
            "reference_no": po_val,
            "so_no": so_val,
            "model": model_val,
            "serial_number": clean_serial_number(_get(r, "serial_number")),
            "dealer": clean_nullable_str(_get(r, "dealer")),
            "destination_port": clean_nullable_str(_get(r, "destination_port")),
            "packing": canonical_packing(_get(r, "packing")),
            "packing_raw": clean_nullable_str(_get(r, "packing")),
            "etd": parse_excel_datetime(_get(r, "etd")),
            "atd": parse_excel_datetime(_get(r, "atd")),
            "eta": parse_excel_datetime(_get(r, "eta")),
            "dual_item": clean_nullable_str(_get(r, "dual_item")),
            "price": clean_price_str(_get(r, "price")),
            "sales_price": clean_price_str(_get(r, "sales_price")),
            "nc": clean_nullable_str(_get(r, "nc")),
            "incoterms": clean_nullable_str(_get(r, "incoterms")),
            "detail_spec": clean_nullable_str(_get(r, "detail_spec")),
            "invoice_ec": clean_nullable_str(_get(r, "invoice_ec")),
            "vessel": clean_nullable_str(_get(r, "vessel")),
            "mbl_no": clean_nullable_str(_get(r, "mbl_no")),
            "dealer_order_no": clean_nullable_str(_get(r, "dealer_order_no")),
            "dealer_order_date": parse_excel_datetime(_get(r, "dealer_order_date")),
            "delivery_request_date": clean_nullable_str(_get(r, "delivery_request_date")),
            "remark": clean_nullable_str(_get(r, "remark")),
        })

    parse_meta = {
        "sheet_name": best_sheet,
        "header_row": best_header_row + 1,
        "total_cols": int(best_raw.shape[1]),
        "total_po_rows": len(parsed_rows),
        "section_counts": dict(Counter(x["section"] for x in parsed_rows)),
        "column_mapping": {
            k: {"col_idx": v[0], "raw_header": v[1], "method": v[2]}
            for k, v in col_map.items()
        },
        "ai_enabled": bool(use_ai),
        "ai_key_configured": bool(os.getenv("GEMINI_API_KEY")),
        "ai_inferred_fields": ai_inferred_fields,
        "skipped_missing_po_rows": skipped_missing_po,
    }
    return parsed_rows, parse_meta


def load_po_filter_bytes(file_bytes: bytes, filename: str) -> Set[str]:
    ext = os.path.splitext(filename)[1].lower()
    pos: Set[str] = set()
    if ext in (".xlsx", ".xls"):
        df = pd.read_excel(io.BytesIO(file_bytes))
        po_col = next((c for c in df.columns if _norm_header(c) in COLUMN_ALIASES["reference_no"]), df.columns[0])
        for v in df[po_col].dropna():
            p = clean_po_number(v)
            if p:
                pos.add(p)
    elif ext == ".csv":
        df = pd.read_csv(io.BytesIO(file_bytes))
        po_col = next((c for c in df.columns if _norm_header(c) in COLUMN_ALIASES["reference_no"]), df.columns[0])
        for v in df[po_col].dropna():
            p = clean_po_number(v)
            if p:
                pos.add(p)
    else:
        for line in file_bytes.decode("utf-8", errors="ignore").splitlines():
            p = clean_po_number(line)
            if p:
                pos.add(p)
    return pos


# =============================================================================
# 6. 핵심 비즈니스 로직: DB 직접 대조(/preview) & 트랜잭션 Upsert(/apply)
# =============================================================================

def _derive_target_status(
    section: str,
    mbl_no: Optional[str],
    etd: Optional[datetime.datetime],
    packing: Optional[str],
    existing_status: Optional[models.OrderStatus],
) -> models.OrderStatus:
    """
    HQ 엑셀 섹션/선적 정보로부터 목표 OrderStatus를 산출하되,
    이미 DB에서 ARRIVED/IN_STOCK/DISPATCHED/SOLD로 진척된 주문은 절대 역행시키지 않습니다.
    """
    if section == "SHIPPED" or mbl_no:
        candidate = models.OrderStatus.SHIPPING
    elif section == "SHIPMENT PLAN" or (packing and packing.upper() in ("PACKED", "포장완료")):
        candidate = models.OrderStatus.IN_PRODUCTION
    else:
        candidate = models.OrderStatus.CONFIRMED

    if existing_status is not None:
        if STATUS_RANK.get(existing_status, 0) >= STATUS_RANK.get(candidate, 0):
            return existing_status
    return candidate


def _compute_preview(
    parsed_rows: List[Dict[str, Any]],
    parse_meta: Dict[str, Any],
    db: Session,
) -> Dict[str, Any]:
    cache = prefetch_master_and_state(db)

    # 엑셀 파일 내부 중복 reference_no / serial_number 사전 스캔
    po_counter = Counter(r["reference_no"] for r in parsed_rows)
    dup_po_in_file = {po for po, cnt in po_counter.items() if cnt > 1}

    sn_counter = Counter(r["serial_number"] for r in parsed_rows if r["serial_number"])
    dup_sn_in_file = {sn for sn, cnt in sn_counter.items() if cnt > 1}

    preview_rows: List[Dict[str, Any]] = []
    apply_orders: List[Dict[str, Any]] = []
    shipment_candidates: Dict[str, Dict[str, Any]] = {}
    counts = Counter()

    for row in parsed_rows:
        ref_no = row["reference_no"]
        ref_key = _norm_key(ref_no)
        sn_val = row["serial_number"]  # 이미 빈값 -> None 정규화 완료
        sn_key = _norm_key(sn_val) if sn_val else ""

        existing_order = cache.orders_by_ref.get(ref_key)
        errors: List[Dict[str, str]] = []
        warnings: List[Dict[str, str]] = []

        # ------------------------------------------------------------------
        # (1) Unique 키 이중 충돌 검증 (orders.reference_no + orders.serial_number)
        # ------------------------------------------------------------------
        if ref_no in dup_po_in_file:
            errors.append({
                "code": "CONFLICT_DUPLICATE_PO_IN_FILE",
                "message": f"업로드 파일 내 동일한 PO NUMBER({ref_no})가 {po_counter[ref_no]}건 중복 존재합니다. orders.reference_no는 UNIQUE 제약이므로 1건만 선택하거나 PO를 구분해야 합니다.",
            })

        if sn_val and sn_val in dup_sn_in_file:
            errors.append({
                "code": "CONFLICT_DUPLICATE_SN_IN_FILE",
                "message": f"업로드 파일 내 동일한 호기(S/N: {sn_val})가 {sn_counter[sn_val]}건 중복 존재합니다.",
            })

        if sn_key and sn_key in cache.orders_by_sn:
            owner_order = cache.orders_by_sn[sn_key]
            if _norm_key(owner_order.reference_no) != ref_key:
                errors.append({
                    "code": "CONFLICT_SN_OWNED_BY_OTHER_PO",
                    "message": f"호기 S/N '{sn_val}'은(는) DB의 다른 발주번호 '{owner_order.reference_no}'(id={owner_order.id})에 이미 등록되어 있습니다.",
                })

        # ------------------------------------------------------------------
        # (2) P/O 첫 글자 (A vs F) 도메인 규칙 적용
        # ------------------------------------------------------------------
        if ref_no.startswith("F"):
            is_corp_stock = True
            # 기존 주문이 RENTAL/SHOWROOM/RESERVED/PROMOTION이면 보존, 아니면 AVAILABLE
            if existing_order and existing_order.stock_type in PRESERVED_CORPORATE_STOCK_TYPES:
                stock_type = existing_order.stock_type
            else:
                stock_type = "AVAILABLE"
            sales_price = None  # F 발주는 판매가 강제 NULL
        elif ref_no.startswith("A"):
            is_corp_stock = False
            stock_type = "DEALER_ORDER"
            sales_price = row["sales_price"] if row["sales_price"] is not None else (
                existing_order.sales_price if existing_order else None
            )
        else:
            # 예외 접두어 방어: 기존 값 유지 또는 딜러 주문 기본값
            is_corp_stock = existing_order.is_corporate_stock if existing_order else False
            stock_type = existing_order.stock_type if existing_order else "DEALER_ORDER"
            sales_price = row["sales_price"] if row["sales_price"] is not None else (
                existing_order.sales_price if existing_order else None
            )
            warnings.append({
                "code": "UNUSUAL_PO_PREFIX",
                "message": f"P/O '{ref_no}'가 'A' 또는 'F'로 시작하지 않습니다. is_corporate_stock={is_corp_stock}로 처리됩니다.",
            })

        # ------------------------------------------------------------------
        # (3) 6종 마스터 테이블 FK / 코드 검증 (프리패치 딕셔너리 조회)
        # ------------------------------------------------------------------
        pm_obj = resolve_product_model(row["model"], cache)
        if pm_obj is not None:
            product_model_id = pm_obj.id
        elif existing_order is not None:
            product_model_id = existing_order.product_model_id
            if row["model"]:
                warnings.append({
                    "code": "UNREGISTERED_MODEL_KEPT_EXISTING",
                    "message": f"기종 '{row['model']}'이 product_models에 미등록되어 기존 DB 기종(id={product_model_id})을 유지합니다.",
                })
        else:
            product_model_id = None
            errors.append({
                "code": "MISSING_FK_PRODUCT_MODEL",
                "message": f"신규 주문 등록 불가: 기종 '{row['model'] or '(공란)'}'이 product_models 테이블에 등록되어 있지 않습니다.",
            })

        dealer_obj = resolve_dealer(row["dealer"], is_corp_stock, cache)
        if dealer_obj is not None:
            dealer_company_id = dealer_obj.id
        elif existing_order is not None:
            dealer_company_id = existing_order.dealer_company_id
            if row["dealer"]:
                warnings.append({
                    "code": "UNREGISTERED_DEALER_KEPT_EXISTING",
                    "message": f"딜러 '{row['dealer']}'가 dealer_companies에 미등록되어 기존 DB 딜러(id={dealer_company_id})를 유지합니다.",
                })
        else:
            dealer_company_id = None
            errors.append({
                "code": "MISSING_FK_DEALER_COMPANY",
                "message": f"신규 주문 등록 불가: 딜러 '{row['dealer'] or '(공란)'}'가 dealer_companies 테이블에 등록되어 있지 않습니다.",
            })

        # NC / Incoterms / Port 검증 (소프트 경고: 업로드는 허용하되 검수 배지 표시)
        nc_val = row["nc"]
        if nc_val and cache.nc_codes and _norm_key(nc_val) not in cache.nc_codes:
            warnings.append({
                "code": "UNREGISTERED_NC_CODE",
                "message": f"NC 코드 '{nc_val}'가 nc_codes 마스터에 없습니다.",
            })

        incoterm_val = row["incoterms"]
        if incoterm_val and cache.incoterm_codes and _norm_key(incoterm_val) not in cache.incoterm_codes:
            warnings.append({
                "code": "UNREGISTERED_INCOTERM",
                "message": f"인코텀즈 '{incoterm_val}'가 incoterm_codes 마스터에 없습니다.",
            })

        dest_port, pod_code = resolve_port_code(row["destination_port"], cache)
        if pod_code and cache.port_codes and pod_code not in cache.port_codes:
            warnings.append({
                "code": "UNREGISTERED_PORT_CODE",
                "message": f"도착항 '{row['destination_port']}'(추정코드: {pod_code})가 port_codes 마스터에 없습니다.",
            })

        if not row["so_no"]:
            warnings.append({
                "code": "MISSING_SO_NO",
                "message": f"S/O 번호가 공란입니다 (PO {ref_no} 기준으로 매칭됨).",
            })

        # ------------------------------------------------------------------
        # (4) Shipment(MBL) 매핑 및 후보 집계
        # ------------------------------------------------------------------
        mbl_no = row["mbl_no"].upper() if row["mbl_no"] else None
        vessel_clean, voyage_clean = split_vessel_voyage(row["vessel"])
        if mbl_no and not errors:
            existing_sh = cache.shipments_by_mbl.get(_norm_key(mbl_no))
            sh_entry = shipment_candidates.setdefault(
                mbl_no,
                {
                    "mbl_no": mbl_no,
                    "action": "UPDATE" if existing_sh else "CREATE",
                    "carrier": (existing_sh.carrier if existing_sh and existing_sh.carrier else None)
                    or infer_carrier_from_mbl(mbl_no),
                    "pol": (existing_sh.pol if existing_sh and existing_sh.pol else "KRPUS"),
                    "pod": pod_code or (existing_sh.pod if existing_sh else "DEHAM"),
                    "vessel": vessel_clean or (existing_sh.vessel if existing_sh else None),
                    "voyage": voyage_clean or (existing_sh.voyage if existing_sh else None),
                    "etd": row["etd"] or (existing_sh.etd if existing_sh else None),
                    "atd": row["atd"] or (existing_sh.atd if existing_sh else None),
                    "eta": row["eta"] or (existing_sh.eta if existing_sh else None),
                    "linked_pos": [],
                },
            )
            if ref_no not in sh_entry["linked_pos"]:
                sh_entry["linked_pos"].append(ref_no)
            if not sh_entry["vessel"] and vessel_clean:
                sh_entry["vessel"] = vessel_clean
            if not sh_entry["voyage"] and voyage_clean:
                sh_entry["voyage"] = voyage_clean
            if not sh_entry["etd"] and row["etd"]:
                sh_entry["etd"] = row["etd"]
            if not sh_entry["atd"] and row["atd"]:
                sh_entry["atd"] = row["atd"]
            if not sh_entry["eta"] and row["eta"]:
                sh_entry["eta"] = row["eta"]

        # ------------------------------------------------------------------
        # (5) 최종 목표 Order 페이로드 구성 (기존 값 보존 원칙: 엑셀 공란은 기존 DB 값 유지)
        # ------------------------------------------------------------------
        target_status = _derive_target_status(
            section=row["section"],
            mbl_no=mbl_no,
            etd=row["etd"],
            packing=row["packing"],
            existing_status=existing_order.current_status if existing_order else None,
        )

        existing_mbl = None
        if existing_order and existing_order.shipment_id:
            sh_obj = cache.shipments_by_id.get(existing_order.shipment_id)
            existing_mbl = sh_obj.mbl_no.upper() if sh_obj and sh_obj.mbl_no else None

        merged_payload = {
            "reference_no": ref_no,
            "product_model_id": product_model_id,
            "dealer_company_id": dealer_company_id,
            "serial_number": sn_val if sn_val is not None else (existing_order.serial_number if existing_order else None),
            "so_no": row["so_no"] or (existing_order.so_no if existing_order else None),
            "current_status": target_status.value,
            "is_corporate_stock": is_corp_stock,
            "stock_type": stock_type,
            "nc": nc_val or (existing_order.nc if existing_order else None),
            "detail_spec": row["detail_spec"] or (existing_order.detail_spec if existing_order else None),
            "incoterms": incoterm_val or (existing_order.incoterms if existing_order else None),
            "destination_port": dest_port or (existing_order.destination_port if existing_order else None),
            "vessel": row["vessel"] or (existing_order.vessel if existing_order else None),
            "price": row["price"] or (existing_order.price if existing_order else None),
            "sales_price": sales_price,
            "etd": (row["etd"] or (existing_order.etd if existing_order else None)),
            "eta": (row["eta"] or (existing_order.eta if existing_order else None)),
            "dealer_order_date": row["dealer_order_date"] or (existing_order.dealer_order_date if existing_order else None),
            "dealer_order_no": row["dealer_order_no"] or (existing_order.dealer_order_no if existing_order else None),
            "delivery_request_date": row["delivery_request_date"] or (existing_order.delivery_request_date if existing_order else None),
            # remark는 유럽 법인 수동 메모 보호를 위해 신규 생성 시에만 입력
            "remark": existing_order.remark if existing_order else row["remark"],
            "mbl_no": mbl_no or existing_mbl,
        }

        # ------------------------------------------------------------------
        # (6) DB 현재 상태 대비 Diff 산출
        # ------------------------------------------------------------------
        diffs: Dict[str, Dict[str, Any]] = {}
        if errors:
            action = "BLOCKED"
        elif existing_order is None:
            action = "CREATE"
            diffs["reference_no"] = {"db": None, "excel": ref_no}
        else:
            db_snapshot = {
                "so_no": existing_order.so_no,
                "serial_number": existing_order.serial_number,
                "product_model_id": existing_order.product_model_id,
                "dealer_company_id": existing_order.dealer_company_id,
                "current_status": existing_order.current_status.value if existing_order.current_status else None,
                "is_corporate_stock": existing_order.is_corporate_stock,
                "stock_type": existing_order.stock_type,
                "nc": existing_order.nc,
                "detail_spec": existing_order.detail_spec,
                "incoterms": existing_order.incoterms,
                "destination_port": existing_order.destination_port,
                "vessel": existing_order.vessel,
                "price": existing_order.price,
                "sales_price": existing_order.sales_price,
                "etd": _fmt_diff_val(existing_order.etd),
                "eta": _fmt_diff_val(existing_order.eta),
                "mbl_no": existing_mbl,
            }
            for f_name in TRACKED_ORDER_DIFF_FIELDS:
                old_v = db_snapshot.get(f_name)
                new_v = _fmt_diff_val(merged_payload.get(f_name))
                if f_name in ("serial_number", "nc", "incoterms", "mbl_no", "destination_port"):
                    is_same = _norm_key(old_v) == _norm_key(new_v)
                else:
                    is_same = old_v == new_v
                if not is_same:
                    diffs[f_name] = {"db": old_v, "excel": new_v}

            action = "UPDATE" if diffs else "NO_CHANGE"

        counts[action] += 1

        # JSON 직렬화용 날짜 문자열 변환
        serialized_payload = dict(merged_payload)
        for dt_col in ("etd", "eta", "dealer_order_date"):
            if isinstance(serialized_payload[dt_col], datetime.datetime):
                serialized_payload[dt_col] = serialized_payload[dt_col].isoformat()

        if action in ("CREATE", "UPDATE"):
            apply_item = {"action": action, **serialized_payload}
            apply_orders.append(apply_item)

        intended_action = "CREATE" if existing_order is None else "UPDATE"

        if action != "NO_CHANGE":
            preview_rows.append({
                "row_uid": f"r{row['excel_row']}_{ref_no}",
                "excel_row": row["excel_row"],
                "section": row["section"],
                "action": action,
                "intended_action": intended_action,
                "reference_no": ref_no,
                "so_no": row["so_no"],
                "model_raw": row["model"],
                "dealer_raw": row["dealer"],
                "diffs": diffs,
                "warnings": warnings,
                "errors": errors,
                "hq_extra": {
                    "packing": row["packing"],
                    "dual_item": row["dual_item"],
                    "invoice_ec": row["invoice_ec"],
                },
                "apply_payload": {"action": intended_action, **serialized_payload},
            })

    # Shipment 변경분만 추리기
    apply_shipments: List[Dict[str, Any]] = []
    shipment_preview: List[Dict[str, Any]] = []
    for mbl_no, sh in sorted(shipment_candidates.items()):
        existing_sh = cache.shipments_by_mbl.get(_norm_key(mbl_no))
        sh_diffs: Dict[str, Dict[str, Any]] = {}
        if existing_sh is None:
            sh_action = "CREATE"
        else:
            for col in ("carrier", "pol", "pod", "vessel", "voyage", "etd", "atd", "eta"):
                old_v = _fmt_diff_val(getattr(existing_sh, col))
                new_v = _fmt_diff_val(sh.get(col))
                if old_v != new_v and new_v is not None:
                    sh_diffs[col] = {"db": old_v, "excel": new_v}
            sh_action = "UPDATE" if sh_diffs else "NO_CHANGE"

        sh_serialized = {
            "mbl_no": sh["mbl_no"],
            "carrier": sh["carrier"],
            "pol": sh["pol"],
            "pod": sh["pod"],
            "vessel": sh["vessel"],
            "voyage": sh["voyage"],
            "etd": sh["etd"].isoformat() if isinstance(sh["etd"], datetime.datetime) else sh["etd"],
            "atd": sh["atd"].isoformat() if isinstance(sh["atd"], datetime.datetime) else sh["atd"],
            "eta": sh["eta"].isoformat() if isinstance(sh["eta"], datetime.datetime) else sh["eta"],
        }
        if sh_action in ("CREATE", "UPDATE"):
            apply_shipments.append(sh_serialized)
            shipment_preview.append({
                "action": sh_action,
                "linked_pos": sh["linked_pos"],
                "diffs": sh_diffs,
                "payload": sh_serialized,
            })

    # 우선순위 정렬: BLOCKED -> CREATE -> UPDATE
    priority_map = {"BLOCKED": 0, "CREATE": 1, "UPDATE": 2}
    preview_rows.sort(key=lambda x: (priority_map.get(x["action"], 9), x["reference_no"]))

    # UI 수정/보완 드롭다운 및 실시간 클라이언트 재검증용 마스터 목록
    unique_models = {pm.id: pm for pm in list(cache.models_by_code.values()) + list(cache.models_by_name.values())}
    unique_dealers = {dc.id: dc for dc in cache.dealers_by_name.values()}

    master_options = {
        "product_models": sorted(
            [{"id": pm.id, "model_code": pm.model_code, "model_name": pm.model_name} for pm in unique_models.values()],
            key=lambda x: (x["model_code"] or "").upper(),
        ),
        "dealer_companies": sorted(
            [{"id": dc.id, "name": dc.name, "sap_code": dc.sap_code} for dc in unique_dealers.values()],
            key=lambda x: (x["name"] or "").upper(),
        ),
        "nc_codes": sorted(cache.nc_codes),
        "port_codes": sorted(cache.port_codes),
        "order_statuses": [s.value for s in models.OrderStatus],
        "existing_sn_owners": {
            sn_k: od.reference_no for sn_k, od in cache.orders_by_sn.items()
        },
        "existing_order_refs": sorted(cache.orders_by_ref.keys()),
    }

    return {
        "parse_meta": parse_meta,
        "summary": {
            "total_excel_po_rows": len(parsed_rows),
            "create_count": counts["CREATE"],
            "update_count": counts["UPDATE"],
            "no_change_count": counts["NO_CHANGE"],
            "blocked_count": counts["BLOCKED"],
            "shipment_upsert_count": len(apply_shipments),
            "skipped_missing_po_count": len(parse_meta["skipped_missing_po_rows"]),
        },
        "preview_rows": preview_rows,
        "shipment_preview": shipment_preview,
        "master_options": master_options,
        "apply_request_template": {
            "orders": apply_orders,
            "shipments": apply_shipments,
            "skip_on_conflict": False,
        },
    }


def _execute_atomic_upsert(req: ApplySyncRequest, db: Session) -> Dict[str, Any]:
    """
    승인된 Shipment + Order 레코드를 단일 원자적 트랜잭션으로 PostgreSQL에 Bulk Upsert합니다.
    - 커밋 직전 실시간 Unique(reference_no, serial_number) 및 FK 재검증 수행
    - PostgreSQL 네이티브 INSERT ... ON CONFLICT DO UPDATE 사용
    - 예외 발생 시 전체 Rollback
    """
    cache = prefetch_master_and_state(db)
    now = datetime.datetime.utcnow()

    # 1) 요청 내 중복 및 실시간 DB 충돌 재검증 (TOCTOU 방어)
    conflicts: List[Dict[str, str]] = []
    valid_orders: List[OrderApplyItem] = []

    seen_refs: Set[str] = set()
    seen_sns: Dict[str, str] = {}
    valid_pm_ids = {pm.id for pm in cache.models_by_code.values()} | {pm.id for pm in cache.models_by_name.values()}
    valid_dealer_ids = {dc.id for dc in cache.dealers_by_name.values()}

    for item in req.orders:
        ref_no = clean_po_number(item.reference_no)
        if not ref_no:
            conflicts.append({"reference_no": item.reference_no, "code": "INVALID_PO", "message": "유효하지 않은 P/O 번호입니다."})
            continue

        ref_key = _norm_key(ref_no)
        if ref_key in seen_refs:
            conflicts.append({"reference_no": ref_no, "code": "DUPLICATE_PO_IN_REQUEST", "message": "요청 내 중복된 reference_no입니다."})
            continue
        seen_refs.add(ref_key)

        sn_val = clean_serial_number(item.serial_number)
        sn_key = _norm_key(sn_val) if sn_val else ""

        row_err = None
        if sn_key:
            if sn_key in seen_sns:
                row_err = f"요청 내 S/N '{sn_val}'이 P/O '{seen_sns[sn_key]}'와 중복됩니다."
            elif sn_key in cache.orders_by_sn and _norm_key(cache.orders_by_sn[sn_key].reference_no) != ref_key:
                owner = cache.orders_by_sn[sn_key]
                row_err = f"S/N '{sn_val}'이 DB의 다른 P/O '{owner.reference_no}'에 이미 점유되어 있습니다."

        if not row_err and item.product_model_id not in valid_pm_ids:
            row_err = f"product_model_id={item.product_model_id}가 product_models에 존재하지 않습니다."
        if not row_err and item.dealer_company_id not in valid_dealer_ids:
            row_err = f"dealer_company_id={item.dealer_company_id}가 dealer_companies에 존재하지 않습니다."

        if row_err:
            conflicts.append({"reference_no": ref_no, "code": "APPLY_VALIDATION_FAILED", "message": row_err})
            continue

        if sn_key:
            seen_sns[sn_key] = ref_no

        normalized = item.model_copy(update={"reference_no": ref_no, "serial_number": sn_val})
        valid_orders.append(normalized)

    if conflicts and not req.skip_on_conflict:
        raise HTTPException(
            status_code=409,
            detail={
                "message": f"{len(conflicts)}건의 제약조건 충돌이 감지되어 트랜잭션을 중단했습니다.",
                "conflicts": conflicts,
            },
        )

    is_postgres = db.bind is not None and db.bind.dialect.name == "postgresql"

    # 2) Shipment + Order 단일 트랜잭션 Upsert
    try:
        # Step A: Shipments Upsert (orders.shipment_id 연결을 위해 선행 실행)
        shipment_rows_by_mbl: Dict[str, Dict[str, Any]] = {}
        for sh in req.shipments:
            mbl = clean_nullable_str(sh.mbl_no)
            if not mbl:
                continue
            mbl_u = mbl.upper()
            shipment_rows_by_mbl[mbl_u] = {
                "mbl_no": mbl_u,
                "carrier": clean_nullable_str(sh.carrier) or infer_carrier_from_mbl(mbl_u),
                "pol": clean_nullable_str(sh.pol) or "KRPUS",
                "pod": clean_nullable_str(sh.pod) or "DEHAM",
                "vessel": clean_nullable_str(sh.vessel),
                "voyage": clean_nullable_str(sh.voyage),
                "etd": sh.etd,
                "atd": sh.atd,
                "eta": sh.eta,
                "created_at": now,
            }

        # 주문에는 mbl_no가 있는데 req.shipments에 누락된 MBL도 자동 보강
        for od in valid_orders:
            mbl = clean_nullable_str(od.mbl_no)
            if mbl:
                mbl_u = mbl.upper()
                if mbl_u not in shipment_rows_by_mbl and mbl_u not in cache.shipments_by_mbl:
                    v_clean, voy_clean = split_vessel_voyage(od.vessel)
                    _, pod_c = resolve_port_code(od.destination_port, cache)
                    shipment_rows_by_mbl[mbl_u] = {
                        "mbl_no": mbl_u,
                        "carrier": infer_carrier_from_mbl(mbl_u),
                        "pol": "KRPUS",
                        "pod": pod_c or "DEHAM",
                        "vessel": v_clean,
                        "voyage": voy_clean,
                        "etd": od.etd,
                        "atd": None,
                        "eta": od.eta,
                        "created_at": now,
                    }

        upserted_shipments = 0
        if shipment_rows_by_mbl:
            sh_values = list(shipment_rows_by_mbl.values())
            if is_postgres:
                sh_stmt = pg_insert(models.Shipment).values(sh_values)
                # TrackCargo AIS 제원 및 route_coordinates는 절대 덮어쓰지 않고 운항 메타만 COALESCE 갱신
                sh_upsert = sh_stmt.on_conflict_do_update(
                    index_elements=["mbl_no"],
                    set_={
                        "carrier": func.coalesce(sh_stmt.excluded.carrier, models.Shipment.carrier),
                        "pol": func.coalesce(sh_stmt.excluded.pol, models.Shipment.pol),
                        "pod": func.coalesce(sh_stmt.excluded.pod, models.Shipment.pod),
                        "vessel": func.coalesce(sh_stmt.excluded.vessel, models.Shipment.vessel),
                        "voyage": func.coalesce(sh_stmt.excluded.voyage, models.Shipment.voyage),
                        "etd": func.coalesce(sh_stmt.excluded.etd, models.Shipment.etd),
                        "atd": func.coalesce(sh_stmt.excluded.atd, models.Shipment.atd),
                        "eta": func.coalesce(sh_stmt.excluded.eta, models.Shipment.eta),
                    },
                )
                db.execute(sh_upsert)
            else:
                for row_dict in sh_values:
                    ex = cache.shipments_by_mbl.get(row_dict["mbl_no"])
                    if ex:
                        for col in ("carrier", "pol", "pod", "vessel", "voyage", "etd", "atd", "eta"):
                            if row_dict[col] is not None:
                                setattr(ex, col, row_dict[col])
                    else:
                        db.add(models.Shipment(**row_dict))
            db.flush()
            upserted_shipments = len(sh_values)

        # 최신 mbl_no -> shipment.id 맵 조회 (1회 쿼리)
        needed_mbls = {clean_nullable_str(od.mbl_no).upper() for od in valid_orders if clean_nullable_str(od.mbl_no)}
        mbl_to_id: Dict[str, int] = {}
        if needed_mbls:
            rows = db.execute(
                select(models.Shipment.mbl_no, models.Shipment.id).where(func.upper(models.Shipment.mbl_no).in_(needed_mbls))
            ).all()
            mbl_to_id = {_norm_key(mbl): sid for mbl, sid in rows}

        # Step B: Orders Bulk Upsert (도메인 규칙 A/F 및 상태 비역행 최종 강제)
        order_values: List[Dict[str, Any]] = []
        created_count = 0
        updated_count = 0

        for od in valid_orders:
            existing = cache.orders_by_ref.get(_norm_key(od.reference_no))
            is_corp = od.reference_no.startswith("F") or (od.is_corporate_stock and not od.reference_no.startswith("A"))

            if is_corp:
                final_stock_type = (
                    existing.stock_type
                    if existing and existing.stock_type in PRESERVED_CORPORATE_STOCK_TYPES
                    else (od.stock_type or "AVAILABLE")
                )
                final_sales_price = None
            else:
                final_stock_type = "DEALER_ORDER"
                final_sales_price = clean_price_str(od.sales_price) or (existing.sales_price if existing else None)

            # 상태 비역행 보호
            final_status = od.current_status
            if existing and STATUS_RANK.get(existing.current_status, 0) > STATUS_RANK.get(final_status, 0):
                final_status = existing.current_status
            status_changed_at = (
                now
                if (existing is None or existing.current_status != final_status)
                else existing.current_status_changed_at
            )

            mbl_key = _norm_key(od.mbl_no) if od.mbl_no else ""
            shipment_id = mbl_to_id.get(mbl_key) if mbl_key else (existing.shipment_id if existing else None)

            if existing is None:
                created_count += 1
            else:
                updated_count += 1

            order_values.append({
                "reference_no": od.reference_no,
                "serial_number": od.serial_number,  # None(NULL) 정규화 보장
                "product_model_id": od.product_model_id,
                "dealer_company_id": od.dealer_company_id,
                "shipment_id": shipment_id,
                "current_status": final_status,
                "current_status_changed_at": status_changed_at,
                "is_corporate_stock": is_corp,
                "is_timeline_completed": existing.is_timeline_completed if existing else False,
                "stock_type": final_stock_type,
                "nc": clean_nullable_str(od.nc),
                "detail_spec": clean_nullable_str(od.detail_spec),
                "so_no": clean_nullable_str(od.so_no),
                "incoterms": clean_nullable_str(od.incoterms),
                "destination_port": clean_nullable_str(od.destination_port),
                "vessel": clean_nullable_str(od.vessel),
                "price": clean_price_str(od.price),
                "sales_price": final_sales_price,
                "etd": od.etd,
                "eta": od.eta,
                "dealer_order_date": od.dealer_order_date,
                "dealer_order_no": clean_nullable_str(od.dealer_order_no),
                "delivery_request_date": clean_nullable_str(od.delivery_request_date),
                "remark": existing.remark if existing else clean_nullable_str(od.remark),
                "created_at": existing.created_at if existing else now,
            })

        if order_values:
            if is_postgres:
                od_stmt = pg_insert(models.Order).values(order_values)
                # 유럽 법인 전용 컬럼(warehouse, pickup_date, rental_*, reservation_*, rsm_user_id, remark 등)은
                # set_ 목록에서 제외하여 DB 기존 값을 100% 보존합니다.
                od_upsert = od_stmt.on_conflict_do_update(
                    index_elements=["reference_no"],
                    set_={
                        "serial_number": func.coalesce(od_stmt.excluded.serial_number, models.Order.serial_number),
                        "product_model_id": od_stmt.excluded.product_model_id,
                        "dealer_company_id": od_stmt.excluded.dealer_company_id,
                        "shipment_id": func.coalesce(od_stmt.excluded.shipment_id, models.Order.shipment_id),
                        "current_status": od_stmt.excluded.current_status,
                        "current_status_changed_at": od_stmt.excluded.current_status_changed_at,
                        "is_corporate_stock": od_stmt.excluded.is_corporate_stock,
                        "stock_type": od_stmt.excluded.stock_type,
                        "nc": func.coalesce(od_stmt.excluded.nc, models.Order.nc),
                        "detail_spec": func.coalesce(od_stmt.excluded.detail_spec, models.Order.detail_spec),
                        "so_no": func.coalesce(od_stmt.excluded.so_no, models.Order.so_no),
                        "incoterms": func.coalesce(od_stmt.excluded.incoterms, models.Order.incoterms),
                        "destination_port": func.coalesce(od_stmt.excluded.destination_port, models.Order.destination_port),
                        "vessel": func.coalesce(od_stmt.excluded.vessel, models.Order.vessel),
                        "price": func.coalesce(od_stmt.excluded.price, models.Order.price),
                        "sales_price": od_stmt.excluded.sales_price,
                        "etd": func.coalesce(od_stmt.excluded.etd, models.Order.etd),
                        "eta": func.coalesce(od_stmt.excluded.eta, models.Order.eta),
                        "dealer_order_date": func.coalesce(od_stmt.excluded.dealer_order_date, models.Order.dealer_order_date),
                        "dealer_order_no": func.coalesce(od_stmt.excluded.dealer_order_no, models.Order.dealer_order_no),
                        "delivery_request_date": func.coalesce(od_stmt.excluded.delivery_request_date, models.Order.delivery_request_date),
                    },
                )
                db.execute(od_upsert)
            else:
                for row_dict in order_values:
                    ex = cache.orders_by_ref.get(_norm_key(row_dict["reference_no"]))
                    if ex:
                        for col in (
                            "product_model_id", "dealer_company_id", "current_status",
                            "current_status_changed_at", "is_corporate_stock", "stock_type", "sales_price",
                        ):
                            setattr(ex, col, row_dict[col])
                        for col in (
                            "serial_number", "shipment_id", "nc", "detail_spec", "so_no", "incoterms",
                            "destination_port", "vessel", "price", "etd", "eta",
                            "dealer_order_date", "dealer_order_no", "delivery_request_date",
                        ):
                            if row_dict[col] is not None:
                                setattr(ex, col, row_dict[col])
                    else:
                        db.add(models.Order(**row_dict))

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"PostgreSQL 트랜잭션 커밋 실패(전체 롤백 완료): {exc}",
        )

    return {
        "status": "committed",
        "orders_created": created_count,
        "orders_updated": updated_count,
        "orders_total_applied": len(order_values),
        "shipments_upserted": upserted_shipments,
        "skipped_conflicts": conflicts,
        "committed_at": now.isoformat(),
    }


# =============================================================================
# 7. 선택적 검수용 엑셀 Export (DB 대조 결과 다운로드)
# =============================================================================

def _build_preview_excel(preview_data: Dict[str, Any]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "DB_대조_검수리포트"

    navy_fill = PatternFill("solid", fgColor="1F3864")
    red_fill = PatternFill("solid", fgColor="FCE4D6")
    green_fill = PatternFill("solid", fgColor="E2EFDA")
    yellow_fill = PatternFill("solid", fgColor="FFF2CC")
    hdr_font = Font(name="Malgun Gothic", size=10, bold=True, color="FFFFFF")
    data_font = Font(name="Malgun Gothic", size=9.5, color="222222")
    thin = Side(border_style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    headers = [
        "엑셀행", "액션", "섹션", "P/O (reference_no)", "S/O", "MODEL", "DEALER",
        "변경항목 (DB → Excel)", "경고", "차단오류", "PACKING(참고)", "DUAL ITEM(참고)", "INVOICE(E/C)(참고)",
    ]
    ws.row_dimensions[1].height = 24
    for idx, h in enumerate(headers, 1):
        c = ws.cell(1, idx, h)
        c.font, c.fill, c.border = hdr_font, navy_fill, border
        c.alignment = Alignment(horizontal="center", vertical="center")

    for r_i, row in enumerate(preview_data["preview_rows"], 2):
        diff_txt = " | ".join(f"{k}: {v['db']} → {v['excel']}" for k, v in row["diffs"].items())
        warn_txt = " / ".join(w["message"] for w in row["warnings"])
        err_txt = " / ".join(e["message"] for e in row["errors"])
        vals = [
            row["excel_row"], row["action"], row["section"], row["reference_no"],
            row["so_no"], row["model_raw"], row["dealer_raw"],
            diff_txt, warn_txt, err_txt,
            row["hq_extra"]["packing"], row["hq_extra"]["dual_item"], row["hq_extra"]["invoice_ec"],
        ]
        fill = red_fill if row["action"] == "BLOCKED" else (green_fill if row["action"] == "CREATE" else yellow_fill)
        for c_i, v in enumerate(vals, 1):
            cell = ws.cell(r_i, c_i, v)
            cell.font, cell.border = data_font, border
            if c_i == 2:
                cell.fill = fill
            cell.alignment = Alignment(horizontal="center" if c_i <= 5 else "left", vertical="center", wrap_text=True)

    for idx, w in enumerate([8, 11, 16, 15, 11, 16, 15, 44, 34, 38, 14, 14, 18], 1):
        ws.column_dimensions[get_column_letter(idx)].width = w
    ws.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# =============================================================================
# 8. FastAPI Router 팩토리 및 기본 Router (순환 임포트 방지)
# =============================================================================

def create_erp_sync_router(auth_dependency: Optional[Callable[..., Any]] = None) -> APIRouter:
    """
    현재 시스템의 AAL2 패스키 인증 가드(`_require_non_dealer` 또는 `_require_admin_user`)를
    주입할 수 있는 라우터 팩토리입니다.
    """
    router_deps = [Depends(auth_dependency)] if auth_dependency is not None else []
    api_router = APIRouter(
        prefix="/api/erp-sync",
        tags=["ERP PostgreSQL Sync"],
        dependencies=router_deps,
    )

    @api_router.post("/preview")
    async def preview_hq_excel_against_db(
        file: UploadFile = File(..., description="최신 본사 Sales List 엑셀 (.xlsx)"),
        po_filter_file: Optional[UploadFile] = File(None, description="(선택) 대상 P/O 목록 파일 (.xlsx/.csv/.txt)"),
        po_prefixes: Optional[str] = Form(None, description="(선택) P/O 접두어 필터 (예: A26-,F26-)"),
        use_ai: bool = Form(False, description="미매칭 헤더 발생 시 Gemini API 보조 추론"),
        download_excel: bool = Form(False, description="True 시 DB 대조 검수 리포트를 .xlsx로 다운로드"),
        db: Session = Depends(get_db),
    ):
        """
        [1단계: Dry-Run] 본사 엑셀 1개를 메모리에서 파싱해 Render PostgreSQL과 직접 대조합니다.
        DB에는 쓰기 작업을 수행하지 않으며, 신규/변경/차단(Unique 충돌·FK 누락) 목록과
        /apply에 바로 넘길 수 있는 표준 페이로드를 반환합니다.
        """
        try:
            excel_bytes = await file.read()
            target_po_set = None
            if po_filter_file and po_filter_file.filename:
                po_bytes = await po_filter_file.read()
                if po_bytes:
                    target_po_set = load_po_filter_bytes(po_bytes, po_filter_file.filename)

            prefix_list = [p.strip() for p in po_prefixes.split(",") if p.strip()] if po_prefixes else None
            parsed_rows, parse_meta = parse_hq_excel_bytes(
                excel_bytes=excel_bytes,
                target_po_set=target_po_set,
                po_prefixes=prefix_list,
                use_ai=use_ai,
            )
            preview_data = _compute_preview(parsed_rows, parse_meta, db)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"엑셀 파싱 또는 DB 대조 중 오류: {exc}")

        if download_excel:
            xls_bytes = _build_preview_excel(preview_data)
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fname = quote(f"ERP_DB_Preview_{ts}.xlsx")
            return StreamingResponse(
                io.BytesIO(xls_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
            )

        return JSONResponse(preview_data)

    @api_router.post("/apply")
    async def apply_hq_sync_to_db(
        payload: ApplySyncRequest,
        db: Session = Depends(get_db),
    ):
        """
        [2단계: Atomic Upsert] /preview에서 사용자가 검수·승인한 shipments 및 orders를
        단일 PostgreSQL 트랜잭션(INSERT ... ON CONFLICT DO UPDATE)으로 일괄 반영합니다.
        """
        if not payload.orders and not payload.shipments:
            raise HTTPException(status_code=400, detail="반영할 주문 또는 선적 항목이 없습니다.")
        result = _execute_atomic_upsert(payload, db)
        return JSONResponse(result)

    return api_router


# 기본 라우터 인스턴스 (main.py에서 dependencies=[Depends(_require_non_dealer)]로 마운트 가능)
router = create_erp_sync_router()
