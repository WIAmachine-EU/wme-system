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

# ERP 표준 추출 17개 컬럼 정의 (순서 및 표준 헤더명)
STANDARD_17_COLUMNS: List[Dict[str, Optional[str]]] = [
    {"header": "NO", "field": None},
    {"header": "S/O", "field": "so_no"},
    {"header": "MODEL", "field": "model"},
    {"header": "DUAL ITEM", "field": "dual_item"},
    {"header": "DEALER", "field": "dealer"},
    {"header": "S/N", "field": "serial_number"},
    {"header": "P/O", "field": "reference_no"},
    {"header": "Port", "field": "destination_port"},
    {"header": "PACKING", "field": "packing"},
    {"header": "ETD", "field": "etd"},
    {"header": "ETA", "field": "eta"},
    {"header": "BUYING", "field": "price"},
    {"header": "NC", "field": "nc"},
    {"header": "DETAIL SPEC", "field": "detail_spec"},
    {"header": "INVOICE(E/C)", "field": "invoice_ec"},
    {"header": "VESSEL", "field": "vessel"},
    {"header": "B/L", "field": "mbl_no"},
]

STANDARD_17_HEADERS: List[str] = [col["header"] for col in STANDARD_17_COLUMNS]

# 본사 엑셀 헤더 표기 변동 방어용 별칭 사전 (정규화: 소문자 + 공백/점/줄바꿈 제거)
COLUMN_ALIASES: Dict[str, List[str]] = {
    "reference_no": ["p/o", "ponumber", "pono", "p/ono", "p/onumber", "po#", "po", "referenceno"],
    "so_no": ["s/o", "so", "sono", "s/ono", "hqso", "salesorder"],
    "model": ["model", "modelname", "modelcode", "기종"],
    "dual_item": ["dualitem", "dualuse", "dual", "전략물자"],
    "dealer": ["dealer", "orderdealer", "dealername", "customer", "buyer", "딜러", "딜러사", "거래처"],
    "serial_number": ["s/n", "sn", "serial", "serialno", "serialnumber", "호기"],
    "destination_port": ["port", "pod", "destport", "destinationport", "도착항"],
    "packing": ["packing", "expectedpacking", "packdate", "포장", "포장일"],
    "etd": ["etd", "hqetd", "etdpol", "b/ldate", "bldate", "출항예정일"],
    "atd": ["atd", "actualdeparture", "실출항일"],
    "eta": ["eta", "etapod", "etadate", "arrivaldate", "도착예정일", "도착일"],
    "price": ["buying", "final", "buyingprice", "finalprice", "구매가", "매입가"],
    "sales_price": ["salesprice", "판매가"],
    "nc": ["nc", "nccode", "cnc", "controller"],
    "incoterms": ["incoterms", "incoterm", "인코텀즈"],
    "detail_spec": ["detailspec", "detail", "details", "spec", "specification", "specifications", "option", "options", "optionspec", "상세스펙", "상세사양", "옵션", "사양"],
    "invoice_ec": ["invoice(e/c)", "invoice(e/c)면장", "invoiceec", "ecinvoice", "e/c"],
    "vessel": ["vessel", "vesselname", "선박명", "선명"],
    "mbl_no": ["b/l", "b/lno", "blno", "bl#", "bl", "mblno", "mbl", "masterb/l", "houseb/l", "선하증권", "선하증권번호"],
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

    field_hints = {
        "so_no": "S/O (Sales Order number)",
        "model": "MODEL (machine model code/name)",
        "dual_item": "DUAL ITEM (strategic/dual-use item code or flag)",
        "dealer": "DEALER (dealer or customer company name)",
        "serial_number": "S/N (machine serial number)",
        "reference_no": "P/O (PO NUMBER / purchase order reference)",
        "destination_port": "Port (destination port / POD)",
        "packing": "PACKING (packing date or status)",
        "etd": "ETD (estimated time of departure)",
        "eta": "ETA (estimated time of arrival)",
        "price": "BUYING (final buying price / FINAL)",
        "nc": "NC (CNC controller code)",
        "detail_spec": "DETAIL SPEC (machine option / detailed specifications)",
        "invoice_ec": "INVOICE(E/C) (export clearance / invoice number)",
        "vessel": "VESSEL (vessel name / voyage)",
        "mbl_no": "B/L (Bill of Lading / Master B/L number)",
    }
    missing_desc = {f: field_hints.get(f, f) for f in missing_fields}

    prompt = (
        "Map each missing ERP field name to the matching Excel source column index.\n"
        f"Missing fields: {json.dumps(missing_desc, ensure_ascii=False)}\n"
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

    # AI 보조 추론 (표준 추출 17개 컬럼 중 데이터 16개 필드 누락 + use_ai=True)
    core_fields = [
        "so_no", "model", "dual_item", "dealer", "serial_number", "reference_no",
        "destination_port", "packing", "etd", "eta", "price", "nc",
        "detail_spec", "invoice_ec", "vessel", "mbl_no",
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
        raise ValueError("필수 기준 컬럼 'P/O' (또는 'PO NUMBER')를 찾을 수 없습니다.")

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
        "standard_columns": STANDARD_17_COLUMNS,
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
                "model_resolved": pm_obj.model_code if pm_obj is not None else row["model"],
                "dealer_raw": row["dealer"],
                "dealer_resolved": dealer_obj.name if dealer_obj is not None else row["dealer"],
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

def _fmt_iso_date(val: Any) -> str:
    if not val:
        return ""
    if isinstance(val, datetime.datetime):
        return val.strftime("%Y-%m-%d")
    return str(val)[:10]


def _build_preview_excel(preview_data: Dict[str, Any]) -> bytes:
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "1_DB_대조_검수리포트"

    navy_fill = PatternFill("solid", fgColor="1F3864")
    red_fill = PatternFill("solid", fgColor="FCE4D6")
    green_fill = PatternFill("solid", fgColor="E2EFDA")
    yellow_fill = PatternFill("solid", fgColor="FFF2CC")
    hdr_font = Font(name="Malgun Gothic", size=10, bold=True, color="FFFFFF")
    data_font = Font(name="Malgun Gothic", size=9.5, color="222222")
    thin = Side(border_style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    headers = [
        "엑셀행", "액션", "섹션", "S/O", "MODEL", "DUAL ITEM", "DEALER", "S/N",
        "P/O", "Port", "PACKING", "ETD", "ETA", "BUYING", "NC", "DETAIL SPEC",
        "INVOICE(E/C)", "VESSEL", "B/L",
        "변경항목 (DB → Excel)", "경고", "차단오류",
    ]
    ws.row_dimensions[1].height = 24
    for idx, h in enumerate(headers, 1):
        c = ws.cell(1, idx, h)
        c.font, c.fill, c.border = hdr_font, navy_fill, border
        c.alignment = Alignment(horizontal="center", vertical="center")

    for r_i, row in enumerate(preview_data["preview_rows"], 2):
        ap = row.get("apply_payload") or {}
        extra = row.get("hq_extra") or {}
        diff_txt = " | ".join(f"{k}: {v['db']} → {v['excel']}" for k, v in row["diffs"].items())
        warn_txt = " / ".join(w["message"] for w in row["warnings"])
        err_txt = " / ".join(e["message"] for e in row["errors"])
        vals = [
            row["excel_row"],
            row["action"],
            row["section"],
            ap.get("so_no") or row.get("so_no") or "",
            row.get("model_resolved") or row.get("model_raw") or "",
            extra.get("dual_item") or "",
            row.get("dealer_resolved") or row.get("dealer_raw") or "",
            ap.get("serial_number") or "",
            row["reference_no"],
            ap.get("destination_port") or "",
            extra.get("packing") or "",
            _fmt_iso_date(ap.get("etd")),
            _fmt_iso_date(ap.get("eta")),
            ap.get("price") or "",
            ap.get("nc") or "",
            ap.get("detail_spec") or "",
            extra.get("invoice_ec") or "",
            ap.get("vessel") or "",
            ap.get("mbl_no") or "",
            diff_txt,
            warn_txt,
            err_txt,
        ]
        fill = red_fill if row["action"] == "BLOCKED" else (green_fill if row["action"] == "CREATE" else yellow_fill)
        for c_i, v in enumerate(vals, 1):
            cell = ws.cell(r_i, c_i, v)
            cell.font, cell.border = data_font, border
            if c_i == 2:
                cell.fill = fill
            cell.alignment = Alignment(horizontal="center" if c_i in (1, 2, 3, 4, 8, 9, 12, 13, 15) else "left", vertical="center", wrap_text=True)

    for idx, w in enumerate(
        [8, 11, 16, 12, 16, 12, 18, 15, 15, 13, 13, 12, 12, 12, 10, 28, 17, 22, 20, 42, 32, 36],
        1,
    ):
        ws.column_dimensions[get_column_letter(idx)].width = w
    ws.freeze_panes = "A2"

    # Sheet 2: ERP 표준 추출 17개 컬럼 시트 (NO ~ B/L)
    ws_std = wb.create_sheet("2_ERP_표준추출_17Cols")
    ws_std.row_dimensions[1].height = 24
    for idx, h in enumerate(STANDARD_17_HEADERS, 1):
        c = ws_std.cell(1, idx, h)
        c.font, c.fill, c.border = hdr_font, navy_fill, border
        c.alignment = Alignment(horizontal="center", vertical="center")

    for seq, row in enumerate(preview_data["preview_rows"], 1):
        ap = row.get("apply_payload") or {}
        extra = row.get("hq_extra") or {}
        std_vals = [
            seq,
            ap.get("so_no") or row.get("so_no") or "",
            row.get("model_resolved") or row.get("model_raw") or "",
            extra.get("dual_item") or "",
            row.get("dealer_resolved") or row.get("dealer_raw") or "",
            ap.get("serial_number") or "",
            row["reference_no"],
            ap.get("destination_port") or "",
            extra.get("packing") or "",
            _fmt_iso_date(ap.get("etd")),
            _fmt_iso_date(ap.get("eta")),
            ap.get("price") or "",
            ap.get("nc") or "",
            ap.get("detail_spec") or "",
            extra.get("invoice_ec") or "",
            ap.get("vessel") or "",
            ap.get("mbl_no") or "",
        ]
        for c_i, v in enumerate(std_vals, 1):
            cell = ws_std.cell(seq + 1, c_i, v)
            cell.font, cell.border = data_font, border
            cell.alignment = Alignment(horizontal="center" if c_i in (1, 2, 6, 7, 10, 11, 13) else "left", vertical="center", wrap_text=True)

    for idx, w in enumerate([7, 12, 16, 12, 18, 16, 15, 14, 14, 13, 13, 12, 10, 30, 18, 22, 20], 1):
        ws_std.column_dimensions[get_column_letter(idx)].width = w
    ws_std.freeze_panes = "A2"

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


# =============================================================================
# 7-B. 딜러 주문 정보 일괄 보충 (P/O 기준 DB 빈 칸 '-' Fill-Blanks-Only)
# =============================================================================

ENRICH_TARGET_FIELDS: List[Dict[str, str]] = [
    {"field": "dealer_order_date", "label": "ORDER DATE", "type": "datetime"},
    {"field": "dealer_order_no", "label": "ORDER NO", "type": "str"},
    {"field": "serial_number", "label": "S/N", "type": "str"},
    {"field": "nc", "label": "NC", "type": "str"},
    {"field": "incoterms", "label": "INCOTERMS", "type": "str"},
    {"field": "destination_port", "label": "PORT", "type": "str"},
    {"field": "etd", "label": "ETD", "type": "datetime"},
    {"field": "eta", "label": "ETA", "type": "datetime"},
    {"field": "sales_price", "label": "SELLING", "type": "str"},
    {"field": "sales_month", "label": "MONTH", "type": "str"},
    {"field": "so_no", "label": "S/O", "type": "str"},
]

ENRICH_FIELD_MAP: Dict[str, Dict[str, str]] = {f["field"]: f for f in ENRICH_TARGET_FIELDS}

ENRICH_HEADER_DISPLAY_COLUMNS: List[Dict[str, Optional[str]]] = [
    {"header": "P/O", "field": "reference_no"},
    {"header": "DEALER Order Date", "field": "dealer_order_date"},
    {"header": "DEALER Order no", "field": "dealer_order_no"},
    {"header": "SerialNo", "field": "serial_number"},
    {"header": "NC", "field": "nc"},
    {"header": "Shipment Type", "field": "incoterms"},
    {"header": "ArrivalPort", "field": "destination_port"},
    {"header": "ETD", "field": "etd"},
    {"header": "ETA", "field": "eta"},
    {"header": "selling", "field": "sales_price"},
    {"header": "Sales month", "field": "sales_month"},
    {"header": "S/O", "field": "so_no"},
]

ENRICH_COLUMN_ALIASES: Dict[str, List[str]] = {
    "reference_no": ["p/o", "pono", "ponumber", "p/ono", "p/onumber", "po#", "po", "referenceno"],
    "order_month": ["ordermonth", "주문월"],
    "dealer": ["dealer", "dealername", "orderdealer", "customer", "buyer", "딜러", "딜러사"],
    "dealer_order_date": ["dealerorderdate", "orderdate", "podate", "주문일자", "딜러주문일", "발주일"],
    "dealer_order_no": ["dealerorderno", "orderno", "dealerpo", "딜러주문번호", "주문번호"],
    "model": ["model", "modelname", "modelcode", "기종"],
    "serial_number": ["serialno", "s/n", "sn", "serialnumber", "serial", "호기"],
    "nc": ["nc", "nccode", "cnc", "controller"],
    "incoterms": ["shipmenttype", "incoterms", "incoterm", "선적조건", "인코텀즈"],
    "destination_port": ["arrivalport", "port", "pod", "destport", "destinationport", "도착항"],
    "etd": ["etd", "etdpol", "b/ldate", "bldate", "출항예정일"],
    "eta": ["eta", "etapod", "etadate", "arrivaldate", "도착예정일"],
    "sales_price": ["selling", "salesprice", "sellingprice", "판매가"],
    "sales_month": ["salesmonth", "invoicemonth", "month", "매출월"],
    "so_no": ["s/o", "so", "sono", "s/ono", "salesorder"],
}

ENRICH_EMPTY_TOKENS: Set[str] = EMPTY_TOKENS | {"none", "nat", "nil"}


class OrderEnrichApplyItem(BaseModel):
    reference_no: str = Field(..., description="매칭 대상 기존 발주번호 P/O (orders.reference_no)")
    fill_fields: Dict[str, Any] = Field(
        default_factory=dict,
        description="DB에서 비어 있는('-'/NULL) 컬럼에만 채울 값 맵",
    )


class ApplyEnrichRequest(BaseModel):
    items: List[OrderEnrichApplyItem] = Field(default_factory=list)
    sales_month_year: int = Field(2026, ge=2000, le=2100)


def _strip_control_chars(val: Any) -> str:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return ""
    # 탭(\t), 개행, 비표준 공백(\u00a0), 대체문자(\ufffd) 제거
    cleaned = re.sub(r"[\x00-\x1f\x7f\u00a0\ufffd]+", "", str(val))
    return re.sub(r"\s+", " ", cleaned).strip()


def _is_db_value_empty(val: Any) -> bool:
    """DB 컬럼이 실제로 비어 있어 UI에 '-'로 표기되는 상태인지 판별."""
    if val is None:
        return True
    if isinstance(val, str):
        return _strip_control_chars(val).lower() in ENRICH_EMPTY_TOKENS
    return False


def clean_enrich_serial_number(val: Any) -> Tuple[Optional[str], Optional[str]]:
    """보충용 S/N 정제: 제어문자 제거, '0'/'x'/'?'/3자미만/순수숫자 등 비정상 값은 None 제외."""
    raw = _strip_control_chars(val)
    if not raw or raw.lower() in ENRICH_EMPTY_TOKENS:
        return None, None
    if raw in ("0", "0.0") or raw.lower() == "x" or "?" in raw or len(raw) < 3 or raw.isdigit():
        return None, f"비정상 S/N 값 '{raw}' 제외"
    if not re.search(r"[A-Za-z]", raw) or not re.search(r"\d", raw):
        return None, f"유효하지 않은 S/N 형식 '{raw}' 제외"
    return raw.upper(), None


def clean_enrich_sales_price(val: Any) -> Tuple[Optional[str], Optional[str]]:
    """보충용 판매가(selling) 정제: 괄호 음수 '(121,470)', 음수, 0, 비숫자는 None 제외."""
    raw = _strip_control_chars(val)
    if not raw or raw.lower() in ENRICH_EMPTY_TOKENS:
        return None, None
    if "?" in raw or raw.lower() == "x":
        return None, f"비정상 판매가 '{raw}' 제외"
    # 회계 음수 표기 '(121,470)' 또는 음수 '-121470' 차단
    if (raw.startswith("(") and raw.endswith(")")) or raw.startswith("-"):
        return None, f"음수/반품 판매가 '{raw}' 제외"
    num_str = re.sub(r"[€$£₩,\s]", "", raw)
    num_str = re.sub(r"(?i)eur$", "", num_str).strip()
    try:
        fv = float(num_str)
    except ValueError:
        return None, f"숫자 형식 오류 판매가 '{raw}' 제외"
    if fv <= 0:
        return None, f"0 이하 판매가 '{raw}' 제외"
    return (str(int(fv)) if fv.is_integer() else f"{fv:.2f}"), None


def clean_enrich_sales_month(val: Any, default_year: int = 2026) -> Tuple[Optional[str], Optional[str]]:
    """
    보충용 Sales month 정규화 (표준 출력: 'YYYY.MM'):
    - '?' 포함 ('12 ???', '11 ?') -> 월 미확정 -> None 제외
    - 연도만 단독 표기 ('2026', '2027') -> 월 미정 -> None 제외
    - 단일 월 (1~12) -> '{default_year}.{MM:02d}'
    - '27.01', '27.3', '2026.11', '2026-11' -> 'YYYY.MM'
    """
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None, None

    if isinstance(val, (pd.Timestamp, datetime.datetime, datetime.date)):
        dt = parse_excel_datetime(val)
        if dt and 2000 <= dt.year <= 2100:
            return f"{dt.year:04d}.{dt.month:02d}", None
        return None, f"비정상 매출월 날짜 '{val}' 제외"

    raw = _strip_control_chars(val)
    if not raw or raw.lower() in ENRICH_EMPTY_TOKENS:
        return None, None

    if "?" in raw:
        return None, f"월 미확정 '{raw}' 제외"
    if raw.lower() == "x":
        return None, f"비정상 매출월 '{raw}' 제외"

    # 연도 단독 표기 ('2026', '2027', '2026.0', '2027.0') -> 월 미정 제외
    if re.match(r"^(20\d{2})(?:\.0+)?$", raw):
        return None, f"월 미정 연도 표기 '{raw}' 제외"

    # YYYY.MM / YYYY-MM / YYYY/MM
    m_full = re.match(r"^(20\d{2})[-./](\d{1,2})$", raw)
    if m_full:
        yy, mm = int(m_full.group(1)), int(m_full.group(2))
        if 1 <= mm <= 12:
            return f"{yy:04d}.{mm:02d}", None
        return None, f"범위 초과 매출월 '{raw}' 제외"

    # YY.MM / YY.M / YY-MM (예: '27.01', '27.03', '27.3', '26.11')
    m_short = re.match(r"^(\d{2})[-./](\d{1,2})$", raw)
    if m_short:
        yy_short, mm = int(m_short.group(1)), int(m_short.group(2))
        if 20 <= yy_short <= 49 and 1 <= mm <= 12:
            return f"{2000 + yy_short:04d}.{mm:02d}", None
        return None, f"비정상 매출월 '{raw}' 제외"

    # 단일 월 숫자 (1~12, '1.0'~'12.0', '11월')
    m_mon = re.match(r"^(\d{1,2})(?:\.0+)?월?$", raw)
    if m_mon:
        mm = int(m_mon.group(1))
        if 1 <= mm <= 12:
            return f"{default_year:04d}.{mm:02d}", None
        return None, f"범위 초과 월 숫자 '{raw}' 제외"

    return None, f"해석 불가 매출월 '{raw}' 제외"


def clean_enrich_so_no(val: Any) -> Tuple[Optional[str], Optional[str]]:
    raw = _strip_control_chars(val)
    if not raw or raw.lower() in ENRICH_EMPTY_TOKENS:
        return None, None
    if "?" in raw or raw.lower() == "x" or raw in ("0", "0.0"):
        return None, f"비정상 S/O 값 '{raw}' 제외"
    cleaned = clean_so_number(raw)
    if not cleaned:
        return None, f"유효하지 않은 S/O 형식 '{raw}' 제외"
    return cleaned, None


def clean_enrich_dealer_order_no(val: Any) -> Tuple[Optional[str], Optional[str]]:
    raw = _strip_control_chars(val)
    if not raw or raw.lower() in ENRICH_EMPTY_TOKENS:
        return None, None
    if raw in ("0", "0.0") or raw.lower() == "x" or raw.replace("?", "").strip() == "":
        return None, f"비정상 ORDER NO '{raw}' 제외"
    return raw, None


def clean_enrich_date(val: Any, label: str) -> Tuple[Optional[datetime.datetime], Optional[str]]:
    if val is None or (isinstance(val, float) and pd.isna(val)):
        return None, None
    if isinstance(val, str):
        raw = _strip_control_chars(val)
        if not raw or raw.lower() in ENRICH_EMPTY_TOKENS:
            return None, None
        if "?" in raw or raw.lower() == "x":
            return None, f"비정상 {label} '{raw}' 제외"
    dt = parse_excel_datetime(val)
    if dt is None:
        raw_s = _strip_control_chars(val)
        if raw_s and raw_s.lower() not in ENRICH_EMPTY_TOKENS:
            return None, f"날짜 형식 오류 {label} '{raw_s}' 제외"
        return None, None
    return dt, None


def clean_enrich_code_str(
    val: Any,
    label: str,
    uppercase: bool = False,
) -> Tuple[Optional[str], Optional[str]]:
    raw = _strip_control_chars(val)
    if not raw or raw.lower() in ENRICH_EMPTY_TOKENS:
        return None, None
    if raw in ("0", "0.0") or raw.lower() == "x" or "?" in raw:
        return None, f"비정상 {label} '{raw}' 제외"
    return (raw.upper() if uppercase else raw), None


def parse_order_enrichment_excel_bytes(
    excel_bytes: bytes,
    sales_month_year: int = 2026,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """
    딜러 주문 내역 엑셀(.xlsx/.xls, 예: Order 20261126.xlsx)을 메모리에서 파싱합니다.
    - 상단 15행을 스캔하여 P/O 및 주문 보충 헤더 행을 자동 탐지
    - 모든 비정상 값(0, x, ?, 음수 괄호, 월 미정 Sales month 등)은 빈 값(None)으로 제외하고 사유를 기록
    """
    xls = pd.ExcelFile(io.BytesIO(excel_bytes))
    all_alias_tokens = {tok for aliases in ENRICH_COLUMN_ALIASES.values() for tok in aliases}

    best_score = -1
    best_sheet = None
    best_header_row = 0
    best_raw = None

    for sheet in xls.sheet_names:
        raw = pd.read_excel(xls, sheet_name=sheet, header=None)
        for r in range(min(15, len(raw))):
            norms = [_norm_header(v) for v in raw.iloc[r].tolist()]
            score = sum(1 for v in norms if v in all_alias_tokens)
            if any(v in ENRICH_COLUMN_ALIASES["reference_no"] for v in norms):
                score += 6
            if any(v in ENRICH_COLUMN_ALIASES["dealer_order_no"] for v in norms):
                score += 4
            if any(v in ENRICH_COLUMN_ALIASES["sales_price"] for v in norms):
                score += 3
            if score > best_score:
                best_score = score
                best_sheet = sheet
                best_header_row = r
                best_raw = raw

    if best_raw is None or best_score < 6:
        raise ValueError("엑셀에서 유효한 주문 보충 헤더(P/O, DEALER Order no, selling 등)를 찾을 수 없습니다.")

    raw_headers = [_strip_control_chars(v) for v in best_raw.iloc[best_header_row].tolist()]
    norm_headers = [_norm_header(v) for v in raw_headers]

    col_map: Dict[str, Tuple[int, str, str]] = {}
    used_idx: Set[int] = set()

    for field_name, aliases in ENRICH_COLUMN_ALIASES.items():
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

    if "reference_no" not in col_map:
        raise ValueError("필수 기준 컬럼 'P/O'를 찾을 수 없습니다.")

    po_idx = col_map["reference_no"][0]

    def _get(r_idx: int, key: str) -> Any:
        if key not in col_map:
            return None
        c_idx = col_map[key][0]
        return best_raw.iloc[r_idx, c_idx] if c_idx < best_raw.shape[1] else None

    parsed_rows: List[Dict[str, Any]] = []
    skipped_invalid_po_rows: List[Dict[str, Any]] = []

    for r in range(best_header_row + 1, len(best_raw)):
        raw_po_val = _get(r, "reference_no")
        raw_po_str = _strip_control_chars(raw_po_val)
        po_val = clean_po_number(raw_po_str)

        if not po_val:
            # 완전히 비어 있는 행은 무시, 다른 데이터(딜러/모델 등)가 있는데 P/O만 이상한 행은 기록
            dealer_hint = _strip_control_chars(_get(r, "dealer"))
            model_hint = _strip_control_chars(_get(r, "model"))
            if raw_po_str or dealer_hint or model_hint:
                if raw_po_str.upper() not in ("P/O", "PO", "PO NUMBER"):
                    skipped_invalid_po_rows.append({
                        "excel_row": r + 1,
                        "raw_po": raw_po_str,
                        "dealer": dealer_hint,
                        "model": model_hint,
                    })
            continue

        anomalies: List[Dict[str, str]] = []

        def _track(field_name: str, cleaned_tuple: Tuple[Any, Optional[str]]) -> Any:
            val_out, reason = cleaned_tuple
            if reason:
                anomalies.append({
                    "field": field_name,
                    "label": ENRICH_FIELD_MAP[field_name]["label"],
                    "reason": reason,
                })
            return val_out

        values = {
            "dealer_order_date": _track("dealer_order_date", clean_enrich_date(_get(r, "dealer_order_date"), "ORDER DATE")),
            "dealer_order_no": _track("dealer_order_no", clean_enrich_dealer_order_no(_get(r, "dealer_order_no"))),
            "serial_number": _track("serial_number", clean_enrich_serial_number(_get(r, "serial_number"))),
            "nc": _track("nc", clean_enrich_code_str(_get(r, "nc"), "NC", uppercase=False)),
            "incoterms": _track("incoterms", clean_enrich_code_str(_get(r, "incoterms"), "INCOTERMS", uppercase=True)),
            "destination_port": _track("destination_port", clean_enrich_code_str(_get(r, "destination_port"), "PORT", uppercase=False)),
            "etd": _track("etd", clean_enrich_date(_get(r, "etd"), "ETD")),
            "eta": _track("eta", clean_enrich_date(_get(r, "eta"), "ETA")),
            "sales_price": _track("sales_price", clean_enrich_sales_price(_get(r, "sales_price"))),
            "sales_month": _track("sales_month", clean_enrich_sales_month(_get(r, "sales_month"), default_year=sales_month_year)),
            "so_no": _track("so_no", clean_enrich_so_no(_get(r, "so_no"))),
        }

        parsed_rows.append({
            "excel_row": r + 1,
            "reference_no": po_val,
            "dealer_raw": _strip_control_chars(_get(r, "dealer")) or None,
            "model_raw": _strip_control_chars(_get(r, "model")) or None,
            "values": values,
            "anomalies": anomalies,
        })

    parse_meta = {
        "sheet_name": best_sheet,
        "header_row": best_header_row + 1,
        "total_cols": int(best_raw.shape[1]),
        "total_po_rows": len(parsed_rows),
        "sales_month_year": sales_month_year,
        "column_mapping": {
            k: {"col_idx": v[0], "raw_header": v[1], "method": v[2]}
            for k, v in col_map.items()
        },
        "target_columns": ENRICH_HEADER_DISPLAY_COLUMNS,
        "skipped_invalid_po_rows": skipped_invalid_po_rows,
    }
    return parsed_rows, parse_meta


def _compute_enrichment_preview(
    parsed_rows: List[Dict[str, Any]],
    parse_meta: Dict[str, Any],
    db: Session,
) -> Dict[str, Any]:
    """
    P/O 기준 DB 빈 칸('-') 보충 Dry-Run 미리보기 계산:
    - 규칙 2: 파일 내 중복 P/O 행은 전체 보충 제외, 중복/타 P/O 점유 S/N 및 비정상 값은 빈 값(None) 제외
    - 규칙 3: 월 미정 Sales month는 빈 값(None) 제외
    - 규칙 4: 시스템에 기등록된 A 발주 및 F 발주 모두 빈 칸(selling, DEALER Order no, Sales month 포함) 보충
    - 기존 DB에 이미 값이 있는 컬럼은 절대 덮어쓰지 않고 보존
    """
    cache = prefetch_master_and_state(db)
    # NC 마스터 원본 대소문자 보존 맵
    nc_canonical_map: Dict[str, str] = {
        _norm_key(nc.nc_code): nc.nc_code
        for nc in db.execute(select(models.NCCode)).scalars().all()
        if nc.nc_code
    }
    models_by_id: Dict[int, models.ProductModel] = {
        pm.id: pm for pm in list(cache.models_by_code.values()) + list(cache.models_by_name.values())
    }
    dealers_by_id: Dict[int, models.DealerCompany] = {
        dc.id: dc for dc in cache.dealers_by_name.values()
    }

    # 1) 파일 내 중복 P/O 검출 -> 전부 제외 대상
    po_counter = Counter(r["reference_no"] for r in parsed_rows)
    dup_po_set = {po for po, cnt in po_counter.items() if cnt > 1}

    # 2) 비중복 P/O 행 기준 파일 내 중복 S/N 검출 -> 해당 S/N 값만 빈 값으로 제외
    non_dup_rows = [r for r in parsed_rows if r["reference_no"] not in dup_po_set]
    sn_counter = Counter(
        r["values"]["serial_number"]
        for r in non_dup_rows
        if r["values"].get("serial_number")
    )
    dup_sn_set = {sn for sn, cnt in sn_counter.items() if cnt > 1}

    enrich_rows: List[Dict[str, Any]] = []
    excluded_duplicate_rows: List[Dict[str, Any]] = []
    unmatched_rows: List[Dict[str, Any]] = []
    apply_items: List[Dict[str, Any]] = []

    no_change_count = 0
    total_fields_to_fill = 0
    total_anomalies_excluded = 0
    field_fill_counts: Counter = Counter()
    po_type_counts: Counter = Counter()

    for row in parsed_rows:
        ref_no = row["reference_no"]
        ref_key = _norm_key(ref_no)
        anomalies = list(row["anomalies"])

        # [규칙 2] 파일 내 중복 P/O는 보충 대상에서 완전 제외
        if ref_no in dup_po_set:
            excluded_duplicate_rows.append({
                "excel_row": row["excel_row"],
                "reference_no": ref_no,
                "dealer_raw": row["dealer_raw"],
                "model_raw": row["model_raw"],
                "duplicate_count": po_counter[ref_no],
                "reason": f"파일 내 동일 P/O({ref_no})가 {po_counter[ref_no]}건 중복되어 보충 제외 처리됨",
            })
            continue

        # DB 매칭 확인 (미등록 P/O는 신규 생성하지 않고 건너뜀)
        existing_order = cache.orders_by_ref.get(ref_key)
        if existing_order is None:
            unmatched_rows.append({
                "excel_row": row["excel_row"],
                "reference_no": ref_no,
                "po_type": "F" if ref_no.startswith("F") else ("A" if ref_no.startswith("A") else "OTHER"),
                "dealer_raw": row["dealer_raw"],
                "model_raw": row["model_raw"],
                "dealer_order_no": row["values"].get("dealer_order_no"),
                "sales_price": row["values"].get("sales_price"),
                "sales_month": row["values"].get("sales_month"),
            })
            continue

        # [규칙 2] S/N 중복 및 타 P/O DB 점유 검사 -> 해당 S/N만 빈 값(None)으로 제외
        cand_values = dict(row["values"])
        sn_val = cand_values.get("serial_number")
        if sn_val:
            sn_key = _norm_key(sn_val)
            if sn_val in dup_sn_set:
                cand_values["serial_number"] = None
                anomalies.append({
                    "field": "serial_number",
                    "label": "S/N",
                    "reason": f"파일 내 중복 S/N '{sn_val}'({sn_counter[sn_val]}건) 제외",
                })
            elif sn_key in cache.orders_by_sn and _norm_key(cache.orders_by_sn[sn_key].reference_no) != ref_key:
                owner = cache.orders_by_sn[sn_key]
                cand_values["serial_number"] = None
                anomalies.append({
                    "field": "serial_number",
                    "label": "S/N",
                    "reason": f"DB 타 P/O('{owner.reference_no}') 점유 S/N '{sn_val}' 제외",
                })

        # NC 표기가 마스터에 존재하면 마스터 표기 사용
        if cand_values.get("nc"):
            nc_k = _norm_key(cand_values["nc"])
            if nc_k in nc_canonical_map:
                cand_values["nc"] = nc_canonical_map[nc_k]

        total_anomalies_excluded += len(anomalies)

        # 빈 칸('-')인 DB 컬럼만 추출 (기존 DB 값이 있으면 절대 덮어쓰지 않음)
        fill_fields: Dict[str, Any] = {}
        fill_display: Dict[str, Dict[str, Any]] = {}
        preserved_fields: List[str] = []

        for meta in ENRICH_TARGET_FIELDS:
            f_name = meta["field"]
            new_val = cand_values.get(f_name)
            db_val = getattr(existing_order, f_name, None)

            if not _is_db_value_empty(db_val):
                if new_val is not None:
                    preserved_fields.append(meta["label"])
                continue

            if new_val is None:
                continue

            serialized_val = new_val.isoformat() if isinstance(new_val, datetime.datetime) else new_val
            display_val = _fmt_diff_val(new_val)
            fill_fields[f_name] = serialized_val
            fill_display[f_name] = {
                "label": meta["label"],
                "db": "-",
                "new": display_val,
            }
            field_fill_counts[f_name] += 1
            total_fields_to_fill += 1

        if not fill_fields:
            no_change_count += 1
            continue

        po_type = "F" if ref_no.startswith("F") else ("A" if ref_no.startswith("A") else "OTHER")
        po_type_counts[po_type] += 1

        db_dealer = dealers_by_id.get(existing_order.dealer_company_id)
        db_model = models_by_id.get(existing_order.product_model_id)

        enrich_rows.append({
            "row_uid": f"e{row['excel_row']}_{ref_no}",
            "excel_row": row["excel_row"],
            "reference_no": ref_no,
            "po_type": po_type,
            "order_id": existing_order.id,
            "current_status": existing_order.current_status.value if existing_order.current_status else None,
            "db_dealer": db_dealer.name if db_dealer else "-",
            "excel_dealer": row["dealer_raw"],
            "db_model": db_model.model_name if db_model else (db_model.model_code if db_model else "-"),
            "fill_count": len(fill_fields),
            "fill_fields": fill_fields,
            "fill_display": fill_display,
            "preserved_fields": preserved_fields,
            "anomalies": anomalies,
        })
        apply_items.append({
            "reference_no": ref_no,
            "fill_fields": fill_fields,
        })

    enrich_rows.sort(key=lambda x: (-x["fill_count"], x["reference_no"]))

    return {
        "mode": "FILL_BLANKS_ONLY",
        "parse_meta": parse_meta,
        "summary": {
            "total_excel_po_rows": len(parsed_rows),
            "matched_db_orders": len(enrich_rows) + no_change_count,
            "enrich_order_count": len(enrich_rows),
            "enrich_a_order_count": po_type_counts["A"],
            "enrich_f_order_count": po_type_counts["F"],
            "total_fields_to_fill": total_fields_to_fill,
            "no_change_count": no_change_count,
            "unmatched_po_count": len(unmatched_rows),
            "excluded_duplicate_po_count": len(excluded_duplicate_rows),
            "excluded_anomaly_values_count": total_anomalies_excluded,
            "field_fill_counts": dict(field_fill_counts),
        },
        "enrich_rows": enrich_rows,
        "excluded_duplicate_rows": excluded_duplicate_rows,
        "unmatched_rows": unmatched_rows,
        "apply_request_template": {
            "items": apply_items,
            "sales_month_year": parse_meta.get("sales_month_year", 2026),
        },
    }


def _execute_atomic_enrichment(req: ApplyEnrichRequest, db: Session) -> Dict[str, Any]:
    """
    [트랜잭션 빈 칸 보충 커밋]
    - 커밋 직전 DB를 재조회하여 실제로 비어 있는(NULL/'-') 컬럼에만 안전하게 기록
    - 기등록 A/F 발주 모두 selling(sales_price), DEALER Order no, Sales month 포함 보충
    - 기존에 값이 존재하는 컬럼은 100% 보존 (절대 덮어쓰지 않음)
    - DB에 없는 P/O는 신규 생성(INSERT)하지 않음
    """
    cache = prefetch_master_and_state(db)
    now = datetime.datetime.utcnow()

    nc_canonical_map: Dict[str, str] = {
        _norm_key(nc.nc_code): nc.nc_code
        for nc in db.execute(select(models.NCCode)).scalars().all()
        if nc.nc_code
    }

    # 요청 내 중복 P/O가 있다면 규칙 2에 따라 전부 제외
    norm_refs = [clean_po_number(it.reference_no) for it in req.items]
    ref_counter = Counter(r for r in norm_refs if r)
    dup_req_refs = {r for r, c in ref_counter.items() if c > 1}

    # 요청 내 중복 S/N 사전 감지 -> 해당 S/N 값만 제외
    req_sn_counter: Counter = Counter()
    for it in req.items:
        raw_sn = (it.fill_fields or {}).get("serial_number")
        sn_clean, _ = clean_enrich_serial_number(raw_sn)
        if sn_clean:
            req_sn_counter[sn_clean] += 1
    dup_req_sns = {sn for sn, c in req_sn_counter.items() if c > 1}

    orders_enriched = 0
    fields_filled_total = 0
    field_fill_counts: Counter = Counter()
    skipped_details: List[Dict[str, str]] = []
    claimed_sns: Set[str] = set()

    try:
        for item in req.items:
            ref_no = clean_po_number(item.reference_no)
            if not ref_no:
                skipped_details.append({"reference_no": str(item.reference_no), "reason": "유효하지 않은 P/O"})
                continue
            if ref_no in dup_req_refs:
                skipped_details.append({"reference_no": ref_no, "reason": "요청 내 중복 P/O 제외"})
                continue

            ref_key = _norm_key(ref_no)
            existing_order = cache.orders_by_ref.get(ref_key)
            if existing_order is None:
                skipped_details.append({"reference_no": ref_no, "reason": "DB 미등록 P/O (신규 생성 안 함)"})
                continue

            filled_this_order = 0
            for f_name, raw_val in (item.fill_fields or {}).items():
                if f_name not in ENRICH_FIELD_MAP:
                    continue

                # 실시간 빈 칸 재검증: DB에 이미 값이 있으면 절대 덮어쓰지 않음
                current_db_val = getattr(existing_order, f_name, None)
                if not _is_db_value_empty(current_db_val):
                    continue

                # 서버단 2차 정제 방어
                cleaned_val: Any = None
                anomaly_msg: Optional[str] = None
                if f_name in ("dealer_order_date", "etd", "eta"):
                    cleaned_val, anomaly_msg = clean_enrich_date(raw_val, ENRICH_FIELD_MAP[f_name]["label"])
                elif f_name == "dealer_order_no":
                    cleaned_val, anomaly_msg = clean_enrich_dealer_order_no(raw_val)
                elif f_name == "serial_number":
                    cleaned_val, anomaly_msg = clean_enrich_serial_number(raw_val)
                    if cleaned_val:
                        sn_key = _norm_key(cleaned_val)
                        if cleaned_val in dup_req_sns or sn_key in claimed_sns:
                            skipped_details.append({"reference_no": ref_no, "reason": f"중복 S/N '{cleaned_val}' 제외"})
                            cleaned_val = None
                        elif sn_key in cache.orders_by_sn and _norm_key(cache.orders_by_sn[sn_key].reference_no) != ref_key:
                            owner = cache.orders_by_sn[sn_key]
                            skipped_details.append({
                                "reference_no": ref_no,
                                "reason": f"타 P/O('{owner.reference_no}') 점유 S/N '{cleaned_val}' 제외",
                            })
                            cleaned_val = None
                        else:
                            claimed_sns.add(sn_key)
                elif f_name == "sales_price":
                    cleaned_val, anomaly_msg = clean_enrich_sales_price(raw_val)
                elif f_name == "sales_month":
                    cleaned_val, anomaly_msg = clean_enrich_sales_month(raw_val, default_year=req.sales_month_year)
                elif f_name == "so_no":
                    cleaned_val, anomaly_msg = clean_enrich_so_no(raw_val)
                elif f_name == "incoterms":
                    cleaned_val, anomaly_msg = clean_enrich_code_str(raw_val, "INCOTERMS", uppercase=True)
                elif f_name == "nc":
                    cleaned_val, anomaly_msg = clean_enrich_code_str(raw_val, "NC", uppercase=False)
                    if cleaned_val and _norm_key(cleaned_val) in nc_canonical_map:
                        cleaned_val = nc_canonical_map[_norm_key(cleaned_val)]
                elif f_name == "destination_port":
                    cleaned_val, anomaly_msg = clean_enrich_code_str(raw_val, "PORT", uppercase=False)

                if anomaly_msg:
                    skipped_details.append({"reference_no": ref_no, "reason": anomaly_msg})
                    continue
                if cleaned_val is None:
                    continue

                setattr(existing_order, f_name, cleaned_val)
                filled_this_order += 1
                fields_filled_total += 1
                field_fill_counts[f_name] += 1

            if filled_this_order > 0:
                orders_enriched += 1

        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"빈 칸 보충 트랜잭션 커밋 실패(전체 롤백 완료): {exc}",
        )

    return {
        "status": "committed",
        "orders_enriched": orders_enriched,
        "fields_filled_total": fields_filled_total,
        "field_fill_counts": dict(field_fill_counts),
        "skipped_details": skipped_details,
        "committed_at": now.isoformat(),
    }


def _build_enrich_preview_excel(preview_data: Dict[str, Any]) -> bytes:
    """빈 칸 보충 미리보기 결과를 2개 시트(.xlsx) 검수 리포트로 생성합니다."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "1_빈칸보충_미리보기"

    navy_fill = PatternFill("solid", fgColor="0A1C8F")
    green_fill = PatternFill("solid", fgColor="E2EFDA")
    yellow_fill = PatternFill("solid", fgColor="FFF2CC")
    red_fill = PatternFill("solid", fgColor="FCE4D6")
    hdr_font = Font(name="Malgun Gothic", size=10, bold=True, color="FFFFFF")
    data_font = Font(name="Malgun Gothic", size=9.5, color="222222")
    thin = Side(border_style="thin", color="D9D9D9")
    border = Border(left=thin, right=thin, top=thin, bottom=thin)

    headers = [
        "엑셀행", "P/O", "구분", "DB 딜러", "DB 모델", "보충 셀 수",
        "ORDER DATE", "ORDER NO", "S/N", "NC", "INCOTERMS", "PORT",
        "ETD", "ETA", "SELLING", "MONTH", "S/O", "제외된 비정상/미정 값",
    ]
    ws.row_dimensions[1].height = 24
    for idx, h in enumerate(headers, 1):
        c = ws.cell(1, idx, h)
        c.font, c.fill, c.border = hdr_font, navy_fill, border
        c.alignment = Alignment(horizontal="center", vertical="center")

    field_keys = [
        "dealer_order_date", "dealer_order_no", "serial_number", "nc",
        "incoterms", "destination_port", "etd", "eta",
        "sales_price", "sales_month", "so_no",
    ]
    for r_i, row in enumerate(preview_data.get("enrich_rows", []), 2):
        fd = row.get("fill_display") or {}
        anom_txt = " / ".join(a["reason"] for a in (row.get("anomalies") or []))
        vals = [
            row["excel_row"],
            row["reference_no"],
            row["po_type"],
            row["db_dealer"],
            row["db_model"],
            row["fill_count"],
            *[fd[k]["new"] if k in fd else "" for k in field_keys],
            anom_txt,
        ]
        for c_i, v in enumerate(vals, 1):
            cell = ws.cell(r_i, c_i, v)
            cell.font, cell.border = data_font, border
            if 7 <= c_i <= 17 and v != "":
                cell.fill = green_fill
            elif c_i == 18 and v != "":
                cell.fill = yellow_fill
            cell.alignment = Alignment(
                horizontal="center" if c_i in (1, 2, 3, 6, 7, 10, 11, 13, 14, 16, 17) else "left",
                vertical="center",
                wrap_text=True,
            )

    for idx, w in enumerate([8, 14, 6, 16, 16, 10, 13, 20, 15, 10, 11, 14, 13, 13, 13, 11, 12, 34], 1):
        ws.column_dimensions[get_column_letter(idx)].width = w
    ws.freeze_panes = "A2"

    # Sheet 2: 중복 P/O 제외 및 DB 미등록(추후 업로드 예정) 목록
    ws2 = wb.create_sheet("2_제외_및_DB미등록")
    headers2 = ["구분", "엑셀행", "P/O", "발주유형", "엑셀 딜러", "엑셀 모델", "상세 사유"]
    ws2.row_dimensions[1].height = 24
    for idx, h in enumerate(headers2, 1):
        c = ws2.cell(1, idx, h)
        c.font, c.fill, c.border = hdr_font, navy_fill, border
        c.alignment = Alignment(horizontal="center", vertical="center")

    r_idx = 2
    for d in preview_data.get("excluded_duplicate_rows", []):
        vals2 = ["중복 P/O 제외", d["excel_row"], d["reference_no"], "-", d.get("dealer_raw") or "", d.get("model_raw") or "", d["reason"]]
        for c_i, v in enumerate(vals2, 1):
            cell = ws2.cell(r_idx, c_i, v)
            cell.font, cell.border = data_font, border
            if c_i == 1:
                cell.fill = red_fill
            cell.alignment = Alignment(horizontal="center" if c_i in (1, 2, 3, 4) else "left", vertical="center")
        r_idx += 1

    for u in preview_data.get("unmatched_rows", []):
        vals2 = [
            "DB 미등록 (건너뜀)",
            u["excel_row"],
            u["reference_no"],
            u.get("po_type") or "",
            u.get("dealer_raw") or "",
            u.get("model_raw") or "",
            "시스템 미등록 P/O — 신규 생성하지 않음 (추후 발주 업로드 후 재실행 시 자동 보충)",
        ]
        for c_i, v in enumerate(vals2, 1):
            cell = ws2.cell(r_idx, c_i, v)
            cell.font, cell.border = data_font, border
            if c_i == 1:
                cell.fill = yellow_fill
            cell.alignment = Alignment(horizontal="center" if c_i in (1, 2, 3, 4) else "left", vertical="center")
        r_idx += 1

    for idx, w in enumerate([18, 8, 15, 10, 18, 18, 48], 1):
        ws2.column_dimensions[get_column_letter(idx)].width = w
    ws2.freeze_panes = "A2"

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

    @api_router.post("/enrich/preview")
    async def preview_order_enrichment(
        file: UploadFile = File(..., description="딜러 주문 내역 원본 엑셀 (.xlsx/.xls)"),
        sales_month_year: int = Form(2026, description="단일 월 숫자(1~12)에 적용할 기준 연도 (기본 2026)"),
        download_excel: bool = Form(False, description="True 시 빈 칸 보충 검수 리포트를 .xlsx로 다운로드"),
        db: Session = Depends(get_db),
    ):
        """
        [보충 1단계: Dry-Run] 딜러 주문 내역 엑셀을 P/O 기준으로 기존 DB와 대조하여
        DB에 비어 있는('-'/NULL) 항목에만 채워질 보충 미리보기를 생성합니다.
        - 기존 DB 값은 절대 덮어쓰지 않음
        - 중복 P/O 및 비정상 값, 월 미정 Sales month는 자동 제외
        - 시스템에 기등록된 A/F 발주 모두 selling, DEALER Order no, Sales month 포함 보충
        """
        fname_lower = (file.filename or "").lower()
        if fname_lower and not fname_lower.endswith((".xlsx", ".xls")):
            raise HTTPException(status_code=400, detail="원본 엑셀 파일(.xlsx, .xls)만 업로드할 수 있습니다.")

        try:
            excel_bytes = await file.read()
            parsed_rows, parse_meta = parse_order_enrichment_excel_bytes(
                excel_bytes=excel_bytes,
                sales_month_year=sales_month_year,
            )
            preview_data = _compute_enrichment_preview(parsed_rows, parse_meta, db)
        except ValueError as ve:
            raise HTTPException(status_code=400, detail=str(ve))
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"엑셀 파싱 또는 보충 대조 중 오류: {exc}")

        if download_excel:
            xls_bytes = _build_enrich_preview_excel(preview_data)
            ts = datetime.datetime.now().strftime("%Y%m%d_%H%M")
            fname = quote(f"ERP_Order_Enrich_Preview_{ts}.xlsx")
            return StreamingResponse(
                io.BytesIO(xls_bytes),
                media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                headers={"Content-Disposition": f"attachment; filename*=UTF-8''{fname}"},
            )

        return JSONResponse(preview_data)

    @api_router.post("/enrich/apply")
    async def apply_order_enrichment(
        payload: ApplyEnrichRequest,
        db: Session = Depends(get_db),
    ):
        """
        [보충 2단계: Atomic Fill-Blanks Commit] /enrich/preview에서 승인된 항목들을
        단일 트랜잭션으로 기존 DB 레코드의 빈 칸('-'/NULL)에만 안전하게 보충합니다.
        """
        if not payload.items:
            raise HTTPException(status_code=400, detail="보충 반영할 항목이 없습니다.")
        result = _execute_atomic_enrichment(payload, db)
        return JSONResponse(result)

    return api_router


# 기본 라우터 인스턴스 (main.py에서 dependencies=[Depends(_require_non_dealer)]로 마운트 가능)
router = create_erp_sync_router()
