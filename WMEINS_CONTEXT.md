# WMEINS 아키텍처 및 핵심 코드 컨텍스트 문서 (WMEINS_CONTEXT.md)

> **WMEINS (WIA Machine Europe Integrated Network System)**  
> 현대위아 유럽법인 공작기계 글로벌 SCM & ERP 통합 관리 플랫폼  
> 본 문서는 **Google Antigravity** 페어 프로그래밍 및 지능형 에이전트 인식을 위해 전체 프로젝트 디렉토리 트리, 데이터베이스 ORM 모델, 전체 API 엔드포인트 라우터, TrackCargo 해상 트래킹/스케줄러/희망봉 항로 파싱 로직 및 프론트엔드 핵심 컴포넌트(선적 트래킹 지도, 패스키/ID-PW 로그인)의 코드를 집대성한 공식 기술 문서입니다.

## 📋 목차 (Table of Contents)
1. [시스템 아키텍처 개관 (Architecture Overview)](#1-시스템-아키텍처-개관-architecture-overview)
2. [전체 폴더 및 파일 디렉토리 트리 구조](#2-전체-폴더-및-파일-디렉토리-트리-구조)
3. [FastAPI 데이터베이스 모델 (models.py) 및 API 라우터 엔드포인트 목록](#3-fastapi-데이터베이스-모델-modelspy-및-api-라우터-엔드포인트-목록)
   - 3.1 [API 라우터 엔드포인트 목록 (38개)](#31-api-라우터-엔드포인트-목록-38개)
   - 3.2 [backend/models.py 전문](#32-backendmodelspy-전문)
4. [TrackCargo API 연동, 스케줄러, 항로 좌표 파싱 백엔드 코드](#4-trackcargo-api-연동-스케줄러-항로-좌표-파싱-백엔드-코드)
   - 4.1 [backend/trackcargo_api.py 전문](#41-backendtrackcargo_apipy-전문)
   - 4.2 [backend/route_service.py 전문](#42-backendroute_servicepy-전문)
   - 4.3 [backend/scheduler.py 전문](#43-backendschedulerpy-전문)
   - 4.4 [backend/services/trackcargo_route_scheduler.py 전문](#44-backendservicestrackcargo_route_schedulerpy-전문)
   - 4.5 [backend/services/trackcargo_sync.py 전문](#45-backendservicestrackcargo_syncpy-전문)
5. [프론트엔드(React) 선적 트래킹 지도 및 인증 컴포넌트](#5-프론트엔드react-선적-트래킹-지도-및-인증-컴포넌트)
   - 5.1 [frontend/src/utils/geoUtils.js 전문 (희망봉 -34.50°N, 18.40°E 로직)](#51-frontendsrcutilsgeoutilsjs-전문-희망봉--3450n-1840e-로직)
   - 5.2 [frontend/src/components/TrackingMapboxWidget.jsx 전문](#52-frontendsrccomponentstrackingmapboxwidgetjsx-전문)
   - 5.3 [frontend/src/pages/Login.jsx 전문 (ID/PW 및 패스키 인증)](#53-frontendsrcpagesloginjsx-전문-idpw-및-패스키-인증)
6. [보안 및 민감정보 보호 (Security Notice)](#6-보안-및-민감정보-보호-security-notice)

## 1. 시스템 아키텍처 개관 (Architecture Overview)

```mermaid
graph TD
    subgraph Frontend ["Frontend (Vite + React 18 + Mapbox GL JS)"]
        UI_Login["로그인 화면 (Login.jsx)<br/>ID/PW & WebAuthn 패스키"]
        UI_Tracking["선적 트래킹 대시보드 (ShipmentTracking.jsx)<br/>Mapbox 3D Globe / 2D 평면 토글"]
        UI_Dispatch["창고 & 출고 관리 (AdminDispatch.jsx)<br/>i18n 다국어 & 호기/치수 관리"]
        UI_Widget["TrackingMapboxWidget.jsx<br/>해상 회랑 & AIS 좌표 렌더링"]
        UI_GeoUtils["geoUtils.js<br/>희망봉(-34.5°N, 18.4°E) 웨이포인트 연산"]
        UI_Tracking --> UI_Widget
        UI_Widget --> UI_GeoUtils
    end

    subgraph Backend ["Backend (FastAPI + SQLAlchemy + APScheduler)"]
        API_Main["main.py<br/>38개 RESTful 엔드포인트 & Auth"]
        DB_Models["models.py<br/>Shipment, Order, User, Cargo ORM"]
        Scheduler_Main["scheduler.py<br/>알림 엔진 & ETA 주기적 동기화"]
        Route_Scheduler["services/trackcargo_route_scheduler.py<br/>2시간 주기 Diff-Check & Rate Limiting"]
        Route_Service["route_service.py<br/>희망봉 33개 경유지 704점 보간"]
        TrackCargo_API["trackcargo_api.py<br/>TrackCargo Sea Tracking API 클라이언트"]
        
        API_Main --> DB_Models
        Scheduler_Main --> Route_Scheduler
        Route_Scheduler --> TrackCargo_API
        Route_Scheduler --> Route_Service
        Route_Scheduler --> DB_Models
    end

    subgraph External ["External Services"]
        TrackCargo["TrackCargo PRO API<br/>선사 AIS 실시간 위성 궤적"]
        Supabase["Supabase Auth<br/>FIDO2 / WebAuthn 패스키 인증"]
        Postgres_DB[("PostgreSQL / SQLite<br/>(scm_erp.db)")]
    end

    UI_Login -->|"패스키 검증"| Supabase
    UI_Login -->|"JWT 검증 / 권한 확인"| API_Main
    UI_Widget -->|"항로/위치 데이터 요청"| API_Main
    TrackCargo_API -->|"해상 트래킹 연동"| TrackCargo
    API_Main --> Postgres_DB
    DB_Models --> Postgres_DB
```

## 2. 전체 폴더 및 파일 디렉토리 트리 구조
```text
WMEINS ERP/
├── +++ 유럽법인 운송 및 재고관리 시스템 개발 및 운영계획_rev2 보안완료.pptx
├── +++ 유럽법인 운송 및 재고관리 시스템 개발 및 운영계획_rev3 보안완료.pptx
├── WMEINS_CONTEXT.md
├── [ RENDER ].txt
├── convert_thumbnails.py
├── document/
│   ├── 2026_PO_List.xlsx
│   ├── 26.07.21 HAMBURG KF5200D외 9대 (1) WIAM2607K104 (1).xlsx
│   ├── Catalog
│   ├── Cloudflare R2 기반 웹 애플리케이션 이미지 및 에셋 서빙 최적화 가이드.pdf
│   ├── Dealer code 2.pdf
│   ├── Dealer code.pdf
│   ├── Dealer code.xlsx
│   ├── Incoterms code.pdf
│   ├── Incoterms code.xlsx
│   ├── Model code.pdf
│   ├── Model code.xlsx
│   ├── NC code.pdf
│   ├── NC code.xlsx
│   ├── Option short ver(202601).xlsx
│   ├── Port code.pdf
│   ├── Port code.xlsx
│   ├── Promo update 260706.xlsx
│   ├── Render Connections.png
│   ├── SCM 재고 관리 ERP 시스템 - 메뉴설계.txt
│   ├── SUITE-ttf
│   ├── Shipment_Upload_Template.pdf
│   ├── Shipment_Upload_Template.xlsx
│   ├── Specifications code.pdf
│   ├── Specifications code.xlsx
│   ├── Stock Status (1) (1) - 복사본.xlsx
│   └── ... [59 more document and template files]
├── package-lock.json
├── package.json
├── scm_erp.db
├── wme-system/
│   ├── .gitignore
│   ├── DeploymentGuide.md
│   ├── README.md
│   ├── UpdateLog.md
│   ├── WMEINS_CONTEXT.md
│   ├── backend/
│   │   ├── .dockerignore
│   │   ├── Dockerfile
│   │   ├── add_column.py
│   │   ├── ai_cargo_parser.py
│   │   ├── auth_supabase.py
│   │   ├── check_user.py
│   │   ├── data/
│   │   │   └── documents/
│   │   │       ├── Catalog code.pdf
│   │   │       ├── catalog-001.pdf
│   │   │       ├── catalog-002.pdf
│   │   │       ├── catalog-003.pdf
│   │   │       └── catalog-004.pdf
│   │   ├── database.py
│   │   ├── email_service.py
│   │   ├── import_dealers.py
│   │   ├── import_incoterms.py
│   │   ├── import_models.py
│   │   ├── import_nc_codes.py
│   │   ├── import_ports.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── requirements.txt
│   │   ├── route_service.py
│   │   ├── run_scheduler.py
│   │   ├── scheduler.py
│   │   ├── schemas.py
│   │   ├── scm_erp.db
│   │   ├── seed.py
│   │   ├── services/
│   │   │   ├── __init__.py
│   │   │   ├── trackcargo_route_scheduler.py
│   │   │   └── trackcargo_sync.py
│   │   ├── storage.py
│   │   ├── test_parser.py
│   │   ├── trackcargo_api.py
│   │   ├── update_db.py
│   │   └── update_thumbnails.py
│   ├── docker-compose.yml
│   ├── frontend/
│   │   ├── .dockerignore
│   │   ├── Dockerfile
│   │   ├── generate_mock.py
│   │   ├── index.html
│   │   ├── nginx.conf
│   │   ├── package-lock.json
│   │   ├── package.json
│   │   ├── public/
│   │   │   ├── A-machine.ico
│   │   │   ├── Core Value Wallpaper.jpg
│   │   │   ├── Core Value Wallpaper.png
│   │   │   ├── assets/
│   │   │   │   ├── card1.png
│   │   │   │   ├── card2.png
│   │   │   │   ├── favicon.svg
│   │   │   │   └── logo.png
│   │   │   ├── exit-favicon.svg
│   │   │   ├── favicon.svg
│   │   │   ├── images/
│   │   │   │   └── products/
│   │   │   ├── login-bg.png
│   │   │   └── login-bg111.png
│   │   ├── src/
│   │   │   ├── App.jsx
│   │   │   ├── components/
│   │   │   │   ├── Navbar.jsx
│   │   │   │   ├── ScrollButtons.jsx
│   │   │   │   ├── ShipmentWidgets.jsx
│   │   │   │   ├── Sidebar.jsx
│   │   │   │   ├── StepBar.jsx
│   │   │   │   ├── StockStatusUploadModal.jsx
│   │   │   │   ├── TrackingMapboxWidget.jsx
│   │   │   │   └── WiaLogo.jsx
│   │   │   ├── data/
│   │   │   │   └── productLibraryModels.js
│   │   │   ├── i18n.js
│   │   │   ├── index.css
│   │   │   ├── locales/
│   │   │   │   ├── en/
│   │   │   │   └── ko/
│   │   │   ├── main.jsx
│   │   │   ├── pages/
│   │   │   │   ├── AdminManagement.jsx
│   │   │   │   ├── DealerDashboard.jsx
│   │   │   │   ├── Login.jsx
│   │   │   │   ├── ProductLibrary.jsx
│   │   │   │   ├── SalesAnalytics.jsx
│   │   │   │   ├── UserProfile.jsx
│   │   │   │   ├── admin/
│   │   │   │   ├── dealer/
│   │   │   │   └── rsm/
│   │   │   └── utils/
│   │   │       ├── auditLogger.js
│   │   │       ├── geoUtils.js
│   │   │       └── supabaseClient.js
│   │   ├── update_json.py
│   │   ├── update_models.py
│   │   ├── update_promo_json.py
│   │   ├── vite.config.js
│   │   └── vite.config.js.timestamp-1790581388246-7e75456f48396.mjs
│   ├── r2-webhook-worker/
│   │   ├── src/
│   │   │   └── index.js
│   │   └── wrangler.toml
│   ├── run_all.bat
│   └── run_all.ps1
└── 구성변경, 수정 및 업데이트 TEXT.txt
```

## 3. FastAPI 데이터베이스 모델 (models.py) 및 API 라우터 엔드포인트 목록

### 3.1 API 라우터 엔드포인트 목록 (38개)
| HTTP Method | Endpoint Path | Handler Function | 기능 및 상세 설명 |
|:---|:---|:---|:---|
| `POST` | `/api/seed` | `run_seed_data` | 초기 테스트 데이터 및 마스터 코드 시딩 |
| `GET` | `/api/dealers` | `get_dealers` | 등록된 딜러사 목록 조회 |
| `GET` | `/api/users` | `get_users` | 사용자(관리자, RSM, 딜러) 목록 조회 |
| `POST` | `/api/users` | `create_user` | 신규 사용자 계정 생성 (관리자 권한) |
| `PATCH` | `/api/users/{user_id}` | `update_user_admin` | 사용자 계정 정보/권한 수정 |
| `DELETE` | `/api/users/{user_id}` | `delete_user_admin` | 사용자 계정 삭제 |
| `GET` | `/api/models` | `get_product_models` | 공작기계 기종(제품 모델) 마스터 목록 조회 |
| `GET` | `/api/categories` | `get_product_categories` | 기종 카테고리 목록 조회 |
| `GET` | `/api/master-data/nc-codes` | `get_nc_codes` | NC 제어기 코드 마스터 목록 조회 |
| `GET` | `/api/master-data/incoterm-codes` | `get_incoterm_codes` | 인코텀즈(Incoterms) 조건 코드 목록 조회 |
| `GET` | `/api/master-data/port-codes` | `get_port_codes` | 항구(Port) 코드 마스터 목록 조회 |
| `GET` | `/api/shipments` | `get_shipments` | 선적(MBL) 목록 및 선박 운항 현황 조회 |
| `GET` | `/api/v1/tracking/sync-status` | `get_tracking_sync_status` | TrackCargo 2시간 주기 동기화 통계 및 효율 지수 조회 |
| `GET` | `/api/v1/tracking/{mbl_no}/route-map` | `get_shipment_route_map` | 특정 B/L의 Mapbox 렌더링용 항로 좌표 및 선박 실시간 위치 조회 |
| `POST` | `/api/orders/sync-serial-numbers` | `sync_orders_serial_numbers` | P/O 및 호기(S/N) 자동 매핑 및 동기화 |
| `POST` | `/api/upload/stock-status` | `upload_stock_status_excel` | 재고 현황(Stock Status) 17종 표준 헤더 엑셀 대량 일괄 업로드 및 창고 DB 갱신 |
| `GET` | `/api/orders` | `get_orders` | 발주 및 재고 목록 조회 (역할별 필터링 적용) |
| `POST` | `/api/orders` | `create_order` | 신규 발주/재고 생성 |
| `PATCH` | `/api/orders/{order_id}` | `update_order_info` | 발주/재고 상세 정보 수정 (S/N, 위치, 사양 등) |
| `PATCH` | `/api/orders/{order_id}/status` | `update_order_status` | 발주 상태(CONFIRMED -> SHIPPING -> ARRIVED -> IN_STOCK -> DISPATCHED/SOLD) 변경 |
| `GET` | `/api/orders/{order_id}/history` | `get_order_history` | 발주 상태 변경 이력(타임라인) 조회 |
| `PATCH` | `/api/orders/{order_id}/assign-dealer` | `assign_order_to_dealer` | 특정 발주 건의 담당 딜러사 배정 |
| `DELETE` | `/api/orders/{order_id}` | `delete_order` | 발주 건 삭제 |
| `GET` | `/api/stats` | `get_sales_analytics` | 경영/영업 분석 통계(Sales Analytics) 데이터 조회 |
| `GET` | `/api/promotions` | `get_promotions` | 프로모션 장비 인벤토리 목록 조회 |
| `PATCH` | `/api/promotions/{promotion_id}/reserve` | `reserve_promotion` | 프로모션 장비 예약 등록 (딜러사 및 만료일자 설정) |
| `PATCH` | `/api/promotions/{promotion_id}/cancel` | `cancel_reservation` | 프로모션 장비 예약 취소 (AVAILABLE 복구) |
| `PATCH` | `/api/promotions/{promotion_id}/sold` | `confirm_sold_promotion` | 프로모션 장비 판매 완료 확정 |
| `PATCH` | `/api/promotions/{promotion_id}/price` | `update_promotion_price` | 프로모션 가격 수정 |
| `GET` | `/api/email-configs` | `get_email_configs` | 이메일 자동 알림 엔진 설정 목록 조회 |
| `PATCH` | `/api/email-configs/{config_id}` | `toggle_email_config` | 이메일 알림 엔진 On/Off 토글 및 주기 설정 |
| `GET` | `/api/business-plans` | `get_business_plans` | 연간/월별 사업계획 및 실적 데이터 조회 |
| `PUT` | `/api/business-plans/{year}` | `update_business_plans` | 특정 연도의 사업계획 및 실적 업데이트 |
| `GET` | `/api/v1/users/me` | `get_user_me` | 현재 로그인한 사용자 프로필 조회 |
| `PATCH` | `/api/v1/users/me` | `update_user_me` | 현재 사용자 정보 수정 |
| `POST` | `/api/v1/users/me/change-password` | `change_password` | 현재 사용자 비밀번호 변경 |
| `POST` | `/api/v1/auth/supabase-login` | `supabase_login` | Supabase 패스키(Passkey/WebAuthn) JWT 토큰 기반 ERP 로그인 및 역할 권한 부여 |
| `POST` | `/api/v1/auth/login` | `login` | 아이디/비밀번호 기반 표준 ERP 로그인 |
| `GET` | `/api/documents/{filename}/download` | `download_document` | 카탈로그/첨부 문서 다운로드 |
| `GET` | `/api/cargo-details/{serial_number}` | `get_cargo_detail` | 특정 호기(S/N)의 포장 화물(치수, 중량, CBM, 박스수) 상세 조회 |


### 3.2 backend/models.py 전문
```python
import enum
from datetime import datetime
from sqlalchemy import Column, Integer, String, ForeignKey, DateTime, Boolean, Enum, Text, JSON, Float
from sqlalchemy.orm import relationship
from database import Base

class UserRole(str, enum.Enum):
    SCM_ADMIN = "SCM_ADMIN"
    RSM = "RSM"
    DEALER = "DEALER"

class OrderStatus(str, enum.Enum):
    CONFIRMED = "CONFIRMED"
    IN_PRODUCTION = "IN_PRODUCTION"
    SHIPPING = "SHIPPING"
    ARRIVED = "ARRIVED"
    IN_STOCK = "IN_STOCK"
    DISPATCHED = "DISPATCHED"
    SOLD = "SOLD"

class PromotionStatus(str, enum.Enum):
    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"
    SOLD = "SOLD"

class OrderDirection(str, enum.Enum):
    FORWARD = "FORWARD"
    BACKWARD = "BACKWARD"

class DealerCompany(Base):
    __tablename__ = "dealer_companies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    country = Column(String, nullable=False)
    region = Column(String, nullable=False)
    sap_code = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    users = relationship("CustomUser", back_populates="dealer_company")
    orders = relationship("Order", back_populates="dealer_company")
    reserved_promotions = relationship("PromotionInventory", foreign_keys="[PromotionInventory.reserved_dealer_id]", back_populates="reserved_dealer")
    final_buyer_promotions = relationship("PromotionInventory", foreign_keys="[PromotionInventory.final_buyer_dealer_id]", back_populates="final_buyer_dealer")

class CustomUser(Base):
    __tablename__ = "custom_users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True, nullable=False)
    email = Column(String, unique=True, index=True, nullable=False)
    role = Column(Enum(UserRole), nullable=False)
    
    dealer_company_id = Column(Integer, ForeignKey("dealer_companies.id"), nullable=True)
    region = Column(String, nullable=True) # assigned region for RSM
    department = Column(String, nullable=True)
    password_hash = Column(String, nullable=True)
    supabase_uid = Column(String, unique=True, index=True, nullable=True) # 매핑을 위한 컬럼 추가
    created_at = Column(DateTime, default=datetime.utcnow)

    dealer_company = relationship("DealerCompany", back_populates="users")
    rsm_orders = relationship("Order", back_populates="rsm_user")
    status_changes = relationship("OrderStatusHistory", back_populates="changed_by")

class Shipment(Base):
    __tablename__ = "shipments"

    id = Column(Integer, primary_key=True, index=True)
    mbl_no = Column(String, unique=True, index=True, nullable=False)
    carrier = Column(String, nullable=True)
    pol = Column(String, nullable=True)
    pod = Column(String, nullable=True)
    vessel = Column(String, nullable=True)
    voyage = Column(String, nullable=True)
    
    etd = Column(DateTime, nullable=True)
    atd = Column(DateTime, nullable=True)
    eta = Column(DateTime, nullable=True)
    ata = Column(DateTime, nullable=True)
    
    trackcargo_order_id = Column(String, nullable=True)
    trackcargo_status = Column(String, nullable=True)
    trackcargo_last_sync = Column(DateTime, nullable=True)
    trackcargo_error = Column(Text, nullable=True)

    # [v3.0] TrackCargo PRO 해상 AIS 경로 및 선박 제원 필드
    vessel_name = Column(String(100), nullable=True) # Fallback 선박명 (예: ONE INTELLIGENCE, YM WELLHEAD)
    vessel_imo = Column(String(30), nullable=True) # IMO 번호
    vessel_mmsi = Column(String(30), nullable=True) # MMSI 번호
    vessel_speed_kn = Column(Float, nullable=True) # 현재 속력 (knots)
    vessel_course_deg = Column(Float, nullable=True) # 진행 방위/침로 (도 단위, 0~360)
    reported_distance_km = Column(Float, nullable=True) # 누적 이동 거리 (km, 예: 26,281 km)
    last_lat = Column(Float, nullable=True) # 최후 확인 위도 (예: 51.95)
    last_lng = Column(Float, nullable=True) # 최후 확인 경도 (예: 3.99)
    route_coordinates = Column(JSON, default=list) # Mapbox 렌더링용 [lng, lat] 배열 (704개 등)
    route_updated_at = Column(DateTime, nullable=True) # 경로 최종 동기화 시각

    created_at = Column(DateTime, default=datetime.utcnow)
    
    orders = relationship("Order", back_populates="shipment")

class ProductCategory(Base):
    __tablename__ = "product_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True, nullable=False)
    
    models = relationship("ProductModel", back_populates="category")

class NCCode(Base):
    __tablename__ = "nc_codes"

    id = Column(Integer, primary_key=True, index=True)
    nc_code = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=False)

class IncotermCode(Base):
    __tablename__ = "incoterm_codes"

    id = Column(Integer, primary_key=True, index=True)
    incoterm_code = Column(String, unique=True, index=True, nullable=False)
    description = Column(String, nullable=False)

class PortCode(Base):
    __tablename__ = "port_codes"

    id = Column(Integer, primary_key=True, index=True)
    port_code = Column(String, unique=True, index=True, nullable=False)
    country = Column(String, nullable=False)

class ProductModel(Base):
    __tablename__ = "product_models"

    id = Column(Integer, primary_key=True, index=True)
    model_code = Column(String, unique=True, index=True, nullable=False)
    model_name = Column(String, nullable=False)
    category_id = Column(Integer, ForeignKey("product_categories.id"), nullable=False)
    base_spec = Column(Text, nullable=True)
    safety_stock_qty = Column(Integer, default=5)
    is_active = Column(Boolean, default=True)
    catalog_file = Column(String, nullable=True)
    thumbnail_file = Column(String, nullable=True)

    category = relationship("ProductCategory", back_populates="models")
    options = relationship("ProductOption", back_populates="product_model")
    orders = relationship("Order", back_populates="product_model")

class ProductOption(Base):
    __tablename__ = "product_options"

    id = Column(Integer, primary_key=True, index=True)
    product_model_id = Column(Integer, ForeignKey("product_models.id"), nullable=False)
    option_name = Column(String, nullable=False)
    is_standard = Column(Boolean, default=False)

    product_model = relationship("ProductModel", back_populates="options")

class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    reference_no = Column(String, unique=True, index=True, nullable=False)
    serial_number = Column(String, unique=True, index=True, nullable=True)
    
    product_model_id = Column(Integer, ForeignKey("product_models.id"), nullable=False)
    dealer_company_id = Column(Integer, ForeignKey("dealer_companies.id"), nullable=False)
    rsm_user_id = Column(Integer, ForeignKey("custom_users.id"), nullable=True)
    shipment_id = Column(Integer, ForeignKey("shipments.id"), nullable=True)

    current_status = Column(Enum(OrderStatus), default=OrderStatus.CONFIRMED, nullable=False)
    current_status_changed_at = Column(DateTime, default=datetime.utcnow)
    
    etd = Column(DateTime, nullable=True)
    eta = Column(DateTime, nullable=True)
    actual_date = Column(DateTime, nullable=True)
    
    is_corporate_stock = Column(Boolean, default=False, nullable=False)
    is_timeline_completed = Column(Boolean, default=False, nullable=False)
    stock_type = Column(String, nullable=True) # AVAILABLE, RENTAL, SHOWROOM
    
    # 상세 주문 정보 (UI/UX 확장용)
    nc = Column(String, nullable=True)
    detail_spec = Column(String, nullable=True)
    so_no = Column(String, nullable=True)
    incoterms = Column(String, nullable=True)
    vessel = Column(String, nullable=True)
    warehouse = Column(String, nullable=True)
    destination_port = Column(String, nullable=True)
    price = Column(String, nullable=True)
    remark = Column(Text, nullable=True)
    dealer_order_date = Column(DateTime, nullable=True)
    delivery_request_date = Column(String, nullable=True)
    rental_start_date = Column(DateTime, nullable=True)
    rental_expiry_date = Column(DateTime, nullable=True)
    last_delivery_alert_month = Column(String, nullable=True)
    rental_alert_sent = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    product_model = relationship("ProductModel", back_populates="orders")
    dealer_company = relationship("DealerCompany", back_populates="orders")
    rsm_user = relationship("CustomUser", back_populates="rsm_orders")
    shipment = relationship("Shipment", back_populates="orders")
    
    history = relationship("OrderStatusHistory", back_populates="order", cascade="all, delete-orphan")
    promotion = relationship("PromotionInventory", back_populates="order", uselist=False, cascade="all, delete-orphan")

class OrderStatusHistory(Base):
    __tablename__ = "order_status_history"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False)
    from_status = Column(Enum(OrderStatus), nullable=False)
    to_status = Column(Enum(OrderStatus), nullable=False)
    direction = Column(Enum(OrderDirection), nullable=False) # FORWARD / BACKWARD
    changed_by_id = Column(Integer, ForeignKey("custom_users.id"), nullable=False)
    changed_at = Column(DateTime, default=datetime.utcnow)
    reason = Column(Text, nullable=True)
    snapshot = Column(JSON, nullable=True) # e.g. {"etd": "...", "eta": "..."}

    order = relationship("Order", back_populates="history")
    changed_by = relationship("CustomUser", back_populates="status_changes")

class PromotionInventory(Base):
    __tablename__ = "promotion_inventory"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=False, unique=True)
    status = Column(Enum(PromotionStatus), default=PromotionStatus.AVAILABLE, nullable=False)
    
    reserved_dealer_id = Column(Integer, ForeignKey("dealer_companies.id"), nullable=True)
    reservation_expiry = Column(DateTime, nullable=True)
    final_buyer_dealer_id = Column(Integer, ForeignKey("dealer_companies.id"), nullable=True)
    promotion_price = Column(String, nullable=True)
    expiry_alert_sent = Column(Boolean, default=False, nullable=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)

    order = relationship("Order", back_populates="promotion")
    reserved_dealer = relationship("DealerCompany", foreign_keys=[reserved_dealer_id], back_populates="reserved_promotions")
    final_buyer_dealer = relationship("DealerCompany", foreign_keys=[final_buyer_dealer_id], back_populates="final_buyer_promotions")

class EmailNotificationConfig(Base):
    __tablename__ = "email_notification_configs"

    id = Column(Integer, primary_key=True, index=True)
    stage = Column(String, nullable=False) # ETD_IMMEDIATE, SHIPPING_INTERVAL, HAMBURG_ARRIVAL, HAMBURG_WAREHOUSE_COMPLETE, DELIVERY_DUE_ALERT, PROMOTION_EXPIRY_ALERT, RENTAL_EXPIRY_ALERT
    interval_days = Column(Integer, nullable=True) # e.g. 10 for SHIPPING_INTERVAL, 1 for D-1, 7 for D-7
    is_active = Column(Boolean, default=True, nullable=False)
    email_template = Column(Text, nullable=True)

class BusinessPlan(Base):
    __tablename__ = "business_plans"

    id = Column(Integer, primary_key=True, index=True)
    year = Column(Integer, nullable=False, index=True)
    month = Column(String, nullable=False) # "1월", "2월", ...
    
    plan_eur = Column(Float, nullable=True)
    plan_krw = Column(Float, nullable=True)
    plan_qty = Column(Integer, nullable=True)
    
    act_eur = Column(Float, nullable=True)
    act_krw = Column(Float, nullable=True)
    act_qty = Column(Integer, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

class CargoDetail(Base):
    __tablename__ = "cargo_details"

    id = Column(Integer, primary_key=True, index=True)
    serial_number = Column(String, index=True, nullable=False)
    item = Column(String, nullable=True) # MACHINE or CC
    qty = Column(Integer, default=1)
    box_no = Column(String, nullable=True) # 1/2 or 2/2
    dimensions = Column(String, nullable=True)
    net_weight = Column(String, nullable=True)
    gross_weight = Column(String, nullable=True)
    cbm = Column(String, nullable=True)
    packages_count = Column(Integer, nullable=True)
```

## 4. TrackCargo API 연동, 스케줄러, 항로 좌표 파싱 백엔드 코드

### 4.1 backend/trackcargo_api.py 전문
```python
import os
import logging
import httpx
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Load API key from environment variables (Mocking for now as requested)
TRACKCARGO_API_KEY = os.environ.get("TRACKCARGO_API_KEY", "***MASKED_API_KEY***")
BASE_URL = "https://api.trackcargo.co/api/v1"

SCAC_MAPPING = {
    "MAEU": "Maersk Line", "MSKU": "Maersk Line", "SEAU": "Maersk Line",
    "ZIMU": "ZIM",
    "CMDU": "CMA-CGM", "CMDA": "CMA-CGM", "CACM": "CMA-CGM", "CMAU": "CMA-CGM", "ANNU": "CMA-CGM",
    "MEDU": "MSC", "MSDU": "MSC", "MSMU": "MSC", "MSCU": "MSC",
    "YMLU": "Yang Ming", "YMPR": "Yang Ming", "YMJA": "Yang Ming",
    "22AA": "Wan Hai", "WHLC": "Wan Hai", "WHLU": "Wan Hai",
    "TSTU": "T. S. Lines",
    "SMLM": "SM Line", "SMCU": "SM Line",
    "ONEY": "ONE",
    "12PD": "SITC",
    "PCIU": "PIL", "MEPE": "PIL",
    "OOCU": "OOCL", "OOLU": "OOCL",
    "MATS": "Matson",
    "KMTC": "KMTC", "KMTU": "KMTC",
    "12AT": "Interasia",
    "HDMU": "Hyundai Merchant Marine (HMM)",
    "SUDU": "Hamburg Sud",
    "GSLU": "Gold Star", "GOSU": "Gold Star",
    "EGLV": "Evergreen", "EVRG": "Evergreen",
    "ECUW": "ECU Worldwide", "ECUI": "ECU Worldwide",
    "COSU": "COSCO", "COAU": "COSCO", "COEU": "COSCO",
    "HLCU": "Hapag Lloyd",
    "WWSU": "Emirates Shipping Lines",
    "ESPU": "ESPU",
    "SCIU": "The Shipping Corporation of India",
    "TRKU": "Turkon Line"
}

def get_scac_code(mbl_no: str) -> str:
    import re
    scac_match = re.match(r'^[A-Za-z0-9]{4}', mbl_no)
    return scac_match.group(0).upper() if scac_match else ""

def get_carrier_name(mbl_no: str) -> str:
    scac = get_scac_code(mbl_no)
    return SCAC_MAPPING.get(scac, "")

async def create_sea_tracking(mbl_no: str) -> Optional[str]:
    """
    Creates a new tracking order in TrackCargo for a given MBL.
    Returns the trackcargo_order_id if successful, None otherwise.
    """
    url = f"{BASE_URL}/client-orders/create/tracking/sea"
    headers = {
        "x-api-key": TRACKCARGO_API_KEY,
        "Content-Type": "application/json"
    }
    scac_code = get_scac_code(mbl_no)

    logger.info(f"[TrackCargo API Key Debug] Key length: {len(TRACKCARGO_API_KEY)}, starts with: {TRACKCARGO_API_KEY[:5]}***")

    payload = {
        "trackingId": mbl_no,
        "seaShipmentTrackingType": "bill_of_lading",
        "scacCode": scac_code
    }
    
    logger.info(f"[TrackCargo API] Requesting create tracking for MBL: {mbl_no}")
    
    
        
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload, timeout=10.0)
            if response.status_code == 200 or response.status_code == 201:
                data = response.json()
                logger.info(f"[TrackCargo API] Success Response: {data}")
                
                # Check for ORDER_ALREADY_EXISTS case where orderId is inside error.data
                if not data.get("success") and data.get("error"):
                    error_data = data["error"].get("data", {})
                    if error_data and error_data.get("orderId"):
                        return error_data.get("orderId")

                # check various possible keys for the order ID
                return data.get("orderId") or data.get("trackingId") or data.get("id") or (data.get("data") and data["data"].get("orderId")) or None
            else:
                logger.error(f"[TrackCargo API] Create tracking failed: {response.status_code} - {response.text}")
                return None
    except Exception as e:
        logger.error(f"[TrackCargo API] Exception in create_sea_tracking: {str(e)}")
        return None

async def create_bulk_sea_tracking(mbl_nos: list) -> dict:
    """
    Bulk creates tracking orders for multiple MBLs in TrackCargo.
    Returns a dictionary mapping mbl_no to its trackcargo_order_id.
    """
    if not mbl_nos:
        return {}
        
    # Bulk API limit is 100 per request.
    mbl_nos = mbl_nos[:100]
        
    url = f"{BASE_URL}/client-orders/create/bulk/tracking/sea"
    headers = {
        "x-api-key": TRACKCARGO_API_KEY,
        "Content-Type": "application/json"
    }
    
    payload = []
    for mbl in mbl_nos:
        payload.append({
            "trackingId": mbl,
            "seaShipmentTrackingType": "bill_of_lading",
            "scacCode": get_scac_code(mbl)
        })
        
    logger.info(f"[TrackCargo API] Requesting bulk create tracking for {len(mbl_nos)} MBLs")
    
    result_map = {}
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(url, headers=headers, json=payload, timeout=20.0)
            if response.status_code in [200, 201]:
                data = response.json()
                logger.info(f"[TrackCargo API] Bulk Success Response: {data}")
                
                # Assume response is a list of results or dict with results
                # We will just parse it robustly. If it's a list:
                results = data if isinstance(data, list) else data.get("results", data.get("data", []))
                
                for item in results:
                    tracking_id = item.get("trackingId")
                    
                    if not item.get("success") and item.get("error"):
                        error_data = item["error"].get("data", {})
                        if error_data and error_data.get("orderId"):
                            result_map[tracking_id] = error_data.get("orderId")
                            continue
                    
                    order_id = item.get("orderId") or item.get("id") or (item.get("data") and item["data"].get("orderId"))
                    if order_id and tracking_id:
                        result_map[tracking_id] = order_id
                        
            else:
                logger.error(f"[TrackCargo API] Bulk create tracking failed: {response.status_code} - {response.text}")
                
    except Exception as e:
        logger.error(f"[TrackCargo API] Exception in create_bulk_sea_tracking: {str(e)}")
        
    return result_map

async def fetch_tracking_data(order_id: str) -> Optional[Dict[str, Any]]:
    """
    Fetches the latest tracking data from TrackCargo for a given Order ID.
    Returns a dictionary with parsed ETD, ETA, etc. if successful, None otherwise.
    """
    url = f"{BASE_URL}/client-orders/{order_id}/tracking"
    headers = {
        "x-api-key": TRACKCARGO_API_KEY
    }
    
    logger.info(f"[TrackCargo API] Requesting tracking data for Order ID: {order_id}")
    
    
        
    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, headers=headers, timeout=10.0)
            if response.status_code == 200:
                data = response.json()
                logger.info(f"[TrackCargo API] Fetch Tracking Response: {data}")
                
                # Parse the response data according to the actual TrackCargo response structure
                # The data is inside data["data"]["trackingData"]
                tracking_data = data.get("data", {}).get("trackingData") or {}
                
                etd = None
                eta = None
                etd_raw = None
                eta_raw = None

                # Try to get ETD from pol_etd_iso
                if "pol_etd_iso" in tracking_data and "date" in tracking_data["pol_etd_iso"]:
                    etd_raw = tracking_data["pol_etd_iso"]["date"]
                elif "last_pol_etd_iso" in tracking_data and "date" in tracking_data["last_pol_etd_iso"]:
                    etd_raw = tracking_data["last_pol_etd_iso"]["date"]
                    
                # Try to get ETA from pod_eta_iso
                if "pod_eta_iso" in tracking_data and "date" in tracking_data["pod_eta_iso"]:
                    eta_raw = tracking_data["pod_eta_iso"]["date"]
                elif "last_pod_eta_iso" in tracking_data and "date" in tracking_data["last_pod_eta_iso"]:
                    eta_raw = tracking_data["last_pod_eta_iso"]["date"]
                elif "fnd_eta_iso" in tracking_data and "date" in tracking_data["fnd_eta_iso"]:
                    eta_raw = tracking_data["fnd_eta_iso"]["date"]
                
                if etd_raw:
                    try:
                        etd = datetime.fromisoformat(etd_raw.replace('Z', '+00:00'))
                    except ValueError:
                        pass
                        
                if eta_raw:
                    try:
                        eta = datetime.fromisoformat(eta_raw.replace('Z', '+00:00'))
                    except ValueError:
                        pass
                
                # [v3.0] Extract Route and Active Vessel details
                from route_service import parse_trackcargo_detail_payload
                route_detail = parse_trackcargo_detail_payload(data)
                
                vessel_result = route_detail.get("vessel_name") or data.get("vessel") or ""
                
                return {
                    "trackcargo_status": data.get("status", "Active"),
                    "vessel": vessel_result,
                    "voyage": data.get("voyage", ""),
                    "pol": data.get("pol", ""),
                    "pod": data.get("pod", ""),
                    "etd": etd,
                    "eta": eta,
                    "vessel_name": route_detail.get("vessel_name"),
                    "vessel_imo": route_detail.get("vessel_imo"),
                    "vessel_mmsi": route_detail.get("vessel_mmsi"),
                    "vessel_speed_kn": route_detail.get("vessel_speed_kn"),
                    "vessel_course_deg": route_detail.get("vessel_course_deg"),
                    "reported_distance_km": route_detail.get("reported_distance_km"),
                    "last_lat": route_detail.get("last_lat"),
                    "last_lng": route_detail.get("last_lng"),
                    "route_coordinates": route_detail.get("route_coordinates"),
                    "error": None
                }
            else:
                logger.error(f"[TrackCargo API] Fetch tracking failed: {response.status_code} - {response.text}")
                return {"error": f"API Error: {response.status_code}"}
    except Exception as e:
        logger.error(f"[TrackCargo API] Exception in fetch_tracking_data: {str(e)}")
        return {"error": f"Exception: {str(e)}"}

def fetch_tracking_data_sync(order_id: str) -> Optional[Dict[str, Any]]:
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(fetch_tracking_data(order_id))

def create_sea_tracking_sync(mbl_no: str) -> Optional[str]:
    import asyncio
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(create_sea_tracking(mbl_no))
```

### 4.2 backend/route_service.py 전문
```python
import math
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
import models

# 1. 아프리카 희망봉(Cape of Good Hope) 우회 실제 글로벌 해상 회랑 33개 정밀 경유지
CAPE_OF_GOOD_HOPE_WAYPOINTS = [
    [129.0756, 35.1796],  # 1. 대한민국 부산항 (KRPUS)
    [128.5, 33.5],        # 2. 대한해협 남단 통과
    [124.0, 29.0],        # 3. 동중국해
    [120.2, 24.5],        # 4. 대만해협 통과
    [116.5, 20.0],        # 5. 남중국해 북부
    [112.5, 13.5],        # 6. 베트남 동부 해역
    [108.5, 5.5],         # 7. 나투나 제도 서쪽
    [106.0, -1.0],        # 8. 방카 해협
    [105.8, -5.9],        # 9. 순다 해협 외해
    [98.0, -10.0],        # 10. 동인도양 횡단 시작
    [88.0, -15.0],        # 11. 인도양 중앙부
    [75.0, -21.0],        # 12. 디에고가르시아 남부
    [60.0, -26.0],        # 13. 마다가스카르 남동부
    [45.0, -31.0],        # 14. 아굴라스 해류 진입
    [30.0, -34.5],        # 15. 남아공 남동 해안
    [20.0, -35.5],        # 16. 아굴라스 곶 (아프리카 최남단)
    [17.8, -34.2],        # 17. 남아프리카공화국 희망봉 (Cape of Good Hope / 케이프타운 외해)
    [14.0, -30.0],        # 18. 벵겔라 해류 (남대서양 북상)
    [8.0, -22.0],         # 19. 나미비아 서부 해역
    [1.0, -12.0],         # 20. 앙골라 서부 남대서양
    [-8.0, -2.0],         # 21. 남대서양 적도 통과
    [-16.0, 8.0],         # 22. 시에라리온 서부
    [-20.0, 18.0],        # 23. 모리타니 서부 (카보베르데 인근)
    [-18.0, 28.0],        # 24. 카나리아 제도 외해
    [-13.0, 36.0],        # 25. 포르투갈 세인트빈센트 곶
    [-9.5, 41.0],         # 26. 포르투 서부 대서양
    [-6.0, 47.0],         # 27. 비스케이만 외해
    [-3.0, 49.5],         # 28. 영국해협 서부 진입
    [1.0, 50.8],          # 29. 도버 해협 통과
    [3.99, 51.95],        # 30. TrackCargo 최후 확인 위치 (Rotterdam Maasvlakte approaches)
    [6.0, 53.8],          # 31. 북해 남동부 (German Bight)
    [8.7, 53.9],          # 32. 엘베강 하구
    [9.9937, 53.5511]     # 33. 독일 함부르크항 (DEHAM)
]

# 2. 부산항 -> 순다해협 출구 (인도양 진입, ONE INTELLIGENCE 위치) 구간
SUNDA_EXIT_WAYPOINTS = [
    [129.0756, 35.1796],
    [128.5, 33.5],
    [124.0, 29.0],
    [120.2, 24.5],
    [116.5, 20.0],
    [112.5, 13.5],
    [108.5, 5.5],
    [106.0, -1.0],
    [105.8, -5.9],
    [103.96, -7.13]  # TrackCargo Last known position for ONE INTELLIGENCE
]

def haversine(p1, p2):
    R = 6371.0
    lat1, lon1 = math.radians(p1[1]), math.radians(p1[0])
    lat2, lon2 = math.radians(p2[1]), math.radians(p2[0])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat/2)**2 + math.cos(lat1)*math.cos(lat2)*math.sin(dlon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    return R * c

def generate_interpolated_route(waypoints: List[List[float]], target_points: int = 704) -> List[List[float]]:
    """
    선박 항로 경유지(Waypoints) 배열을 주어진 target_points(예: 704개, 270개) 개수로 균일하게 보간합니다.
    """
    if len(waypoints) < 2:
        return waypoints
    
    segment_dists = []
    total_distance = 0.0
    for i in range(len(waypoints) - 1):
        d = haversine(waypoints[i], waypoints[i+1])
        segment_dists.append(d)
        total_distance += d
        
    if total_distance <= 0:
        return [waypoints[0]] * target_points
        
    result = [waypoints[0]]
    step_dist = total_distance / (target_points - 1)
    
    current_seg = 0
    seg_traveled = 0.0
    
    for i in range(1, target_points - 1):
        target_d = i * step_dist
        
        while current_seg < len(segment_dists) and (seg_traveled + segment_dists[current_seg]) < target_d:
            seg_traveled += segment_dists[current_seg]
            current_seg += 1
            
        if current_seg >= len(segment_dists):
            result.append(waypoints[-1])
            continue
            
        remain_d = target_d - seg_traveled
        ratio = remain_d / segment_dists[current_seg] if segment_dists[current_seg] > 0 else 0
        
        pA = waypoints[current_seg]
        pB = waypoints[current_seg + 1]
        
        lng = pA[0] + (pB[0] - pA[0]) * ratio
        lat = pA[1] + (pB[1] - pA[1]) * ratio
        result.append([round(lng, 5), round(lat, 5)])
        
    result.append(waypoints[-1])
    return result

def parse_trackcargo_detail_payload(payload: dict) -> dict:
    """
    [설계 가이드 v3.0] TrackCargo 상세 데이터를 파싱하여 누락 없는 Vessel 정보와 Route 좌표를 추출합니다.
    """
    data = payload.get("data", payload) or {}
    
    # 1. 선박 정보 추출 (main_vessel 누락 대비 active_vessel 우선 탐색 Fallback)
    active_vessel = data.get("active_vessel") or {}
    vessel_name = (
        active_vessel.get("name")
        or data.get("main_vessel")
        or data.get("vessel")
        or "미배정 (TBN)"
    )
    
    # 2. 경로(Route) 및 마지막 위치(Last known position) 추출
    route_info = data.get("route") or data.get("route_map") or {}
    raw_points = route_info.get("route_points") or route_info.get("coordinates") or []
    
    # Mapbox GL JS는 [longitude, latitude] 순서를 사용하므로 변환
    mapbox_coords = []
    for pt in raw_points:
        if isinstance(pt, dict) and "lat" in pt and "lng" in pt:
            mapbox_coords.append([float(pt["lng"]), float(pt["lat"])])
        elif isinstance(pt, (list, tuple)) and len(pt) >= 2:
            lat, lng = float(pt[0]), float(pt[1])
            mapbox_coords.append([lng, lat])
            
    last_pos = route_info.get("last_known_position") or {}
    last_lat = last_pos.get("lat") if isinstance(last_pos, dict) else (raw_points[-1][0] if raw_points else None)
    last_lng = last_pos.get("lng") if isinstance(last_pos, dict) else (raw_points[-1][1] if raw_points else None)
    
    return {
        "vessel_name": vessel_name,
        "vessel_imo": str(active_vessel.get("imo", "") or ""),
        "vessel_mmsi": str(active_vessel.get("mmsi", "") or ""),
        "vessel_speed_kn": float(active_vessel.get("speed", 0.0) or 0.0),
        "vessel_course_deg": float(active_vessel.get("course", 0.0) or 0.0),
        "reported_distance_km": float(route_info.get("reported_distance_km", 0.0) or 0.0),
        "last_lat": float(last_lat) if last_lat is not None else None,
        "last_lng": float(last_lng) if last_lng is not None else None,
        "route_coordinates": mapbox_coords,
    }

def seed_v3_shipment_data(db: Session):
    """
    [설계 가이드 v3.0] 현재 등록된 B/L에 대해 실제 선사 AIS 경로(희망봉 우회 704개 좌표 등) 및
    누락 없는 Active Vessel 제원을 DB에 초기 세팅/업데이트합니다.
    """
    # 704개 희망봉 우회 실제 항로 좌표 생성 (부산 -> 희망봉 -> 마스플락테/함부르크)
    cape_704_coords = generate_interpolated_route(CAPE_OF_GOOD_HOPE_WAYPOINTS, 704)
    # 270개 순다해협 출구 인도양 진입 좌표 생성 (부산 -> 순다해협)
    sunda_270_coords = generate_interpolated_route(SUNDA_EXIT_WAYPOINTS, 270)
    
    # 1. YMLUN360205129 (Yang Ming - 첨부 4번째 이미지 실제 데이터 완벽 매핑)
    yml_shipment = db.query(models.Shipment).filter(models.Shipment.mbl_no == "YMLUN360205129").first()
    if yml_shipment:
        yml_shipment.vessel_name = "YM WELLHEAD"
        yml_shipment.vessel = "YM WELLHEAD"
        yml_shipment.vessel_imo = "9757527"
        yml_shipment.vessel_mmsi = "477085700"
        yml_shipment.vessel_speed_kn = 17.5
        yml_shipment.vessel_course_deg = 58.0
        yml_shipment.reported_distance_km = 26281.0
        yml_shipment.last_lat = 51.95
        yml_shipment.last_lng = 3.99
        yml_shipment.route_coordinates = cape_704_coords
        yml_shipment.route_updated_at = datetime.now(timezone.utc)
        
        # 연결된 주문들의 선박명도 갱신
        for order in yml_shipment.orders:
            order.vessel = "YM WELLHEAD"

    # 2. HDMUSELE59846400 (HMM - ONE INTELLIGENCE, 첨부 문서 v3.0 예시)
    hmm1 = db.query(models.Shipment).filter(models.Shipment.mbl_no == "HDMUSELE59846400").first()
    if hmm1:
        hmm1.vessel_name = "ONE INTELLIGENCE"
        hmm1.vessel = "ONE INTELLIGENCE"
        hmm1.vessel_imo = "9933121"
        hmm1.vessel_mmsi = "636023310"
        hmm1.vessel_speed_kn = 18.8
        hmm1.vessel_course_deg = 239.0
        hmm1.reported_distance_km = 5610.0
        hmm1.last_lat = -7.13
        hmm1.last_lng = 103.96
        hmm1.route_coordinates = sunda_270_coords
        hmm1.route_updated_at = datetime.now(timezone.utc)
        for order in hmm1.orders:
            order.vessel = "ONE INTELLIGENCE"

    # 3. HDMUSELE22174500 (HMM - ONE INNOVATION)
    hmm2 = db.query(models.Shipment).filter(models.Shipment.mbl_no == "HDMUSELE22174500").first()
    if hmm2:
        hmm2.vessel_name = "ONE INNOVATION"
        hmm2.vessel = "ONE INNOVATION"
        hmm2.vessel_imo = "9933133"
        hmm2.vessel_mmsi = "636023315"
        hmm2.vessel_speed_kn = 19.2
        hmm2.vessel_course_deg = 295.0
        hmm2.reported_distance_km = 14250.0
        hmm2.last_lat = -34.5
        hmm2.last_lng = 18.4  # 희망봉 근처 통과 중
        # 희망봉까지의 400개 포인트
        cape_mid_coords = generate_interpolated_route(CAPE_OF_GOOD_HOPE_WAYPOINTS[:18], 400)
        hmm2.route_coordinates = cape_mid_coords
        hmm2.route_updated_at = datetime.now(timezone.utc)
        for order in hmm2.orders:
            order.vessel = "ONE INNOVATION"

    db.commit()
```

### 4.3 backend/scheduler.py 전문
```python
import calendar
from datetime import datetime, timezone
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from email_service import (
    send_shipping_interval_notification,
    send_eta_update_notification,
    send_delivery_due_alert,
    send_promotion_expiry_alert,
    send_rental_expiry_alert
)

logger = logging.getLogger(__name__)

def process_periodic_eta_notifications():
    """
    Daily job to:
    1. Check HHLA API for vessel arrival schedules and update Order.eta.
    2. Send periodic 10-day interval notifications for orders in SHIPPING.
    """
    logger.info("Starting periodic ETA notification and API sync job...")
    db: Session = SessionLocal()
    try:
        from trackcargo_api import fetch_tracking_data_sync, create_sea_tracking_sync
        
        # Sync TrackCargo Shipments: Find shipments with either trackcargo_order_id or mbl_no
        from sqlalchemy import or_
        active_shipments = db.query(models.Shipment).filter(
            models.Shipment.mbl_no.isnot(None),
            or_(models.Shipment.trackcargo_status == None, models.Shipment.trackcargo_status != "Completed")
        ).all()
        
        for shipment in active_shipments:
            try:
                # Auto-heal old mock tracking IDs
                if shipment.trackcargo_order_id and shipment.trackcargo_order_id.startswith("ord_mock_"):
                    logger.info(f"Auto-healing mock shipment {shipment.mbl_no} (was {shipment.trackcargo_order_id})")
                    shipment.trackcargo_order_id = None
                    shipment.eta = None
                    shipment.etd = None
                    
                # If it doesn't have an order_id yet, try to register it first
                if not shipment.trackcargo_order_id:
                    new_order_id = create_sea_tracking_sync(shipment.mbl_no)
                    if new_order_id:
                        shipment.trackcargo_order_id = new_order_id
                        db.commit()
                        logger.info(f"Registered shipment {shipment.mbl_no} to TrackCargo with ID {new_order_id}")
                    else:
                        logger.error(f"Failed to register shipment {shipment.mbl_no} to TrackCargo")
                        continue
                        
                tracking_data = fetch_tracking_data_sync(shipment.trackcargo_order_id)
                if tracking_data and not tracking_data.get("error"):
                    shipment.trackcargo_status = tracking_data.get("trackcargo_status")
                    shipment.trackcargo_last_sync = datetime.utcnow()
                    
                    if tracking_data.get("vessel"):
                        shipment.vessel = tracking_data.get("vessel")
                    if tracking_data.get("voyage"):
                        shipment.voyage = tracking_data.get("voyage")
                        
                    shipment.etd = tracking_data.get("etd")
                    shipment.eta = tracking_data.get("eta")
                        
                    # Sync to orders
                    new_eta = tracking_data.get("eta")
                    
                    for order in shipment.orders:
                        changed = False
                        # Update actual_date, etd, and eta from CargoTrack API
                        if order.actual_date != new_eta:
                            order.actual_date = new_eta
                            changed = True
                        if tracking_data.get("eta") and order.eta != tracking_data.get("eta"):
                            order.eta = tracking_data.get("eta")
                            changed = True
                        if tracking_data.get("etd") and order.etd != tracking_data.get("etd"):
                            order.etd = tracking_data.get("etd")
                            changed = True
                            
                        if tracking_data.get("vessel") and order.vessel != tracking_data.get("vessel"):
                            order.vessel = tracking_data.get("vessel")
                            changed = True
                            
                        if changed:
                            logger.info(f"Order {order.reference_no} updated from TrackCargo Shipment {shipment.mbl_no}")
                            if new_eta:
                                # HAMBURG_ARRIVAL 알림 엔진 활성화 확인
                                arrival_cfg = db.query(models.EmailNotificationConfig).filter_by(stage="HAMBURG_ARRIVAL").first()
                                if arrival_cfg and not arrival_cfg.is_active:
                                    logger.info(f"[알림 건너뜀] HAMBURG_ARRIVAL 알림 엔진이 비활성화(OFF) 상태입니다. ETA 업데이트 알림 건너뜀 (Order {order.reference_no})")
                                else:
                                    dealer_emails = []
                                    if order.dealer_company_id:
                                        dealers = db.query(models.CustomUser).filter(
                                            models.CustomUser.dealer_company_id == order.dealer_company_id,
                                            models.CustomUser.role == models.UserRole.DEALER
                                        ).all()
                                        dealer_emails = [d.email for d in dealers if d.email and "@example.com" not in d.email]
                                    
                                    recipients = "***MASKED_ADMIN_EMAILS***"
                                    if dealer_emails:
                                        recipients = f"{recipients}; {'; '.join(dealer_emails)}"
                                    send_eta_update_notification(order.reference_no, order.vessel, new_eta.strftime('%Y-%m-%d %H:%M'), to_email=recipients)
                                
            except Exception as e:
                shipment.trackcargo_error = str(e)
                logger.error(f"Error syncing shipment {shipment.mbl_no}: {e}")
                
        db.commit()

        active_orders = db.query(models.Order).filter(
            models.Order.current_status == models.OrderStatus.SHIPPING
        ).all()
        
        now = datetime.utcnow()
        
        # Check for interval since ETD from config
        config = db.query(models.EmailNotificationConfig).filter_by(stage="SHIPPING_INTERVAL").first()
        if config and not config.is_active:
            logger.info("[알림 건너뜀] SHIPPING_INTERVAL 정기 알림 엔진이 비활성화(OFF) 상태입니다.")
        else:
            interval = config.interval_days if config and config.interval_days else 10
            
            shipping_orders = [o for o in active_orders if o.current_status == models.OrderStatus.SHIPPING]
            for order in shipping_orders:
                if order.etd:
                    delta = now - order.etd
                    days = delta.days
                    
                    if days > 0 and days % interval == 0:
                        current_eta = order.eta.strftime('%Y-%m-%d %H:%M') if order.eta else "미정"
                        logger.info(f"Order {order.reference_no}: Sending {days}-day interval notification.")
                        
                        to_email = "***MASKED_ADMIN_EMAILS***"
                        if order.dealer_company_id:
                            dealers = db.query(models.CustomUser).filter(
                                models.CustomUser.dealer_company_id == order.dealer_company_id,
                                models.CustomUser.role == models.UserRole.DEALER
                            ).all()
                            valid_dealer_emails = [d.email for d in dealers if d.email and "@example.com" not in d.email]
                            if valid_dealer_emails:
                                to_email = f"{to_email}; {'; '.join(valid_dealer_emails)}"
                                
                        send_shipping_interval_notification(to_email, order.reference_no, days, current_eta)

    except Exception as e:
        logger.error(f"Error in process_periodic_eta_notifications: {str(e)}")
    finally:
        db.close()

def check_delivery_due_alerts(db: Session, now: datetime):
    """
    5. 배송요청일(D-Day): 배송요청일 해당 월 마지막 주차 진입 시 관리자에게 지연 방지 알림
    """
    config = db.query(models.EmailNotificationConfig).filter_by(stage="DELIVERY_DUE_ALERT").first()
    if not config or not config.is_active:
        return

    # 아직 입고/출고되지 않은 진행 중 주문
    active_orders = db.query(models.Order).filter(
        models.Order.current_status.notin_([
            models.OrderStatus.IN_STOCK,
            models.OrderStatus.SOLD,
            models.OrderStatus.DISPATCHED
        ])
    ).all()

    for order in active_orders:
        if not order.delivery_request_date:
            continue
        try:
            parts = order.delivery_request_date.split('-')
            req_year = int(parts[0])
            req_month = int(parts[1])
            
            if now.year == req_year and now.month == req_month:
                _, last_day = calendar.monthrange(now.year, now.month)
                # 마지막 주차 (월말 7일 이내)
                if (last_day - now.day) < 7:
                    current_month_key = f"{now.year}-{now.month:02d}"
                    if order.last_delivery_alert_month != current_month_key:
                        model_name = order.product_model.model_name if order.product_model else "-"
                        to_email = "***MASKED_ADMIN_EMAILS***"
                        send_delivery_due_alert(
                            to_email,
                            order.reference_no,
                            order.delivery_request_date,
                            order.current_status.value if hasattr(order.current_status, 'value') else str(order.current_status),
                            model_name
                        )
                        order.last_delivery_alert_month = current_month_key
                        db.commit()
                        logger.info(f"[알림 발송] 발주 {order.reference_no} 배송요청일({order.delivery_request_date}) 당월 마지막 주차 지연 방지 알림 발송 완료.")
        except Exception as err:
            logger.error(f"Error checking delivery due alert for {order.reference_no}: {err}")

def check_promotion_expiry_alerts(db: Session, now: datetime):
    """
    6. 프로모션 예약 만료: 프로모션 만료기간 하루 전(D-day 1일) 관리자와 딜러에게 이메일 발송
    """
    config = db.query(models.EmailNotificationConfig).filter_by(stage="PROMOTION_EXPIRY_ALERT").first()
    if not config or not config.is_active:
        return

    reserved_promos = db.query(models.PromotionInventory).filter(
        models.PromotionInventory.status == models.PromotionStatus.RESERVED,
        models.PromotionInventory.reservation_expiry.isnot(None)
    ).all()

    for promo in reserved_promos:
        if promo.expiry_alert_sent:
            continue
        
        delta = promo.reservation_expiry - now
        # 만료 24시간 이내(D-1) 도래 확인
        if 0 < delta.total_seconds() <= 86400:
            order_ref = promo.order.reference_no if promo.order else f"ID {promo.order_id}"
            model_name = promo.order.product_model.model_name if (promo.order and promo.order.product_model) else "-"
            dealer_name = promo.reserved_dealer.name if promo.reserved_dealer else "미지정"
            expiry_str = promo.reservation_expiry.strftime('%Y-%m-%d %H:%M')
            
            to_email = "***MASKED_ADMIN_EMAILS***"
            if promo.reserved_dealer_id:
                dealers = db.query(models.CustomUser).filter(
                    models.CustomUser.dealer_company_id == promo.reserved_dealer_id,
                    models.CustomUser.role == models.UserRole.DEALER
                ).all()
                dealer_emails = [d.email for d in dealers if d.email and "@example.com" not in d.email]
                if dealer_emails:
                    to_email = f"{to_email}; {'; '.join(dealer_emails)}"
                    
            send_promotion_expiry_alert(to_email, order_ref, model_name, dealer_name, expiry_str)
            promo.expiry_alert_sent = True
            db.commit()
            logger.info(f"[알림 발송] 프로모션 {order_ref} 예약 만료 1일 전(D-1) 사전 알림 발송 완료 ({to_email})")

def check_rental_expiry_alerts(db: Session, now: datetime):
    """
    7. 임대(Rental) 만료: 임대 기간 만료 일주일 전(D-7) 연장/반납에 대한 내용으로 관리자 admin에게 이메일 발송
    """
    config = db.query(models.EmailNotificationConfig).filter_by(stage="RENTAL_EXPIRY_ALERT").first()
    if not config or not config.is_active:
        return

    rental_orders = db.query(models.Order).filter(
        models.Order.stock_type == "RENTAL",
        models.Order.rental_expiry_date.isnot(None)
    ).all()

    for order in rental_orders:
        if order.rental_alert_sent:
            continue
            
        delta = order.rental_expiry_date - now
        # 만료 7일 전(D-7) 도래 확인
        if 0 < delta.total_seconds() <= 7 * 86400:
            model_name = order.product_model.model_name if order.product_model else "-"
            dealer_name = order.dealer_company.name if order.dealer_company else "미지정"
            expiry_str = order.rental_expiry_date.strftime('%Y-%m-%d')
            
            to_email = "***MASKED_ADMIN_EMAILS***"
            send_rental_expiry_alert(
                to_email,
                order.reference_no,
                model_name,
                order.serial_number or "-",
                dealer_name,
                expiry_str
            )
            order.rental_alert_sent = True
            db.commit()
            logger.info(f"[알림 발송] 임대 발주 {order.reference_no} 만료 7일 전(D-7) 사전 공지 발송 완료.")

def process_expired_promotion_reservations():
    """
    Periodic job to:
    1. Check for promotion reservations whose expiry date has passed and auto-release to AVAILABLE.
    2. Check delivery due month alert (Last week of month -> Admin).
    3. Check promotion expiry D-1 alert (Admin + Dealer).
    4. Check rental expiry D-7 alert (Admin).
    """
    db: Session = SessionLocal()
    try:
        now = datetime.utcnow()
        # 1. 만료된 프로모션 자동 해제 (Roll-back)
        expired_promotions = db.query(models.PromotionInventory).filter(
            models.PromotionInventory.status == models.PromotionStatus.RESERVED,
            models.PromotionInventory.reservation_expiry.isnot(None),
            models.PromotionInventory.reservation_expiry <= now
        ).all()
        
        if expired_promotions:
            for promo in expired_promotions:
                order_ref = promo.order.reference_no if promo.order else f"ID {promo.order_id}"
                dealer_name = promo.reserved_dealer.name if promo.reserved_dealer else "Unknown"
                logger.info(f"[프로모션 예약 자동 해제] 발주 {order_ref} (예약 딜러: {dealer_name}) 만료일({promo.reservation_expiry}) 도래 -> AVAILABLE 복구")
                promo.status = models.PromotionStatus.AVAILABLE
                promo.reserved_dealer_id = None
                promo.reservation_expiry = None
                promo.expiry_alert_sent = False
            db.commit()
            logger.info(f"Successfully auto-released {len(expired_promotions)} expired promotion reservation(s).")

        # 2. 5번 배송요청일 D-Day 월 마지막 주차 알림
        check_delivery_due_alerts(db, now)

        # 3. 6번 프로모션 예약 만료 1일 전(D-1) 사전 알림
        check_promotion_expiry_alerts(db, now)

        # 4. 7번 임대(Rental) 만료 7일 전(D-7) 사전 공지 알림
        check_rental_expiry_alerts(db, now)

    except Exception as e:
        logger.error(f"Error in process_expired_promotion_reservations: {str(e)}")
    finally:
        db.close()

def run_route_2hour_sync_job():
    """
    [설계 가이드 v4.0] 2시간 주기 경로 및 선박 위치 스마트 Diff 동기화 작업 래퍼
    """
    import asyncio
    try:
        from services.trackcargo_route_scheduler import sync_routes_every_2hours
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(sync_routes_every_2hours())
        loop.close()
    except Exception as e:
        logger.error(f"[2시간 주기 경로 동기화 실행 에러]: {e}")

scheduler = BackgroundScheduler()

def start_scheduler():
    # [설계 가이드 v4.0] 매 2시간 정각(0 */2 * * *) 선박 경로/위치 Diff-Check 동기화
    scheduler.add_job(
        run_route_2hour_sync_job, 
        'cron', 
        hour='*/2', 
        minute=0, 
        id='route_2hour_sync', 
        replace_existing=True
    )
    
    # 하루 3번 (06:00, 14:00, 22:00) Tracking 데이터 및 ETA 알림 동기화
    scheduler.add_job(process_periodic_eta_notifications, 'cron', hour='6,14,22', minute=0, id='eta_notification_job', replace_existing=True)
    
    # 서버 재시작 시 즉시 1회 강제 동기화 실행 (확인용)
    scheduler.add_job(process_periodic_eta_notifications, 'date', run_date=datetime.utcnow(), id='immediate_sync_job', replace_existing=True)
    
    # 프로모션 예약 만료 주기적 확인 (2시간 간격)
    scheduler.add_job(process_expired_promotion_reservations, 'interval', hours=2, id='promo_expiration_job', replace_existing=True)
    # 서버 재시작 시 즉시 1회 만료 예약 점검
    scheduler.add_job(process_expired_promotion_reservations, 'date', run_date=datetime.utcnow(), id='immediate_promo_check_job', replace_existing=True)
    
    scheduler.start()
    logger.info("Scheduler started. (Route Diff-Sync: every 2h on '*/2', ETA Cron: 06:00, 14:00, 22:00 + Promo Check: every 2h)")

def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped.")
```

### 4.4 backend/services/trackcargo_route_scheduler.py 전문
```python
# services/trackcargo_route_scheduler.py
import os
import sys
import asyncio
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional

# 상위 디렉터리 경로 등록
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import httpx
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from services.trackcargo_sync import (
    parse_trackcargo_detail_payload,
    TRACKCARGO_BASE_URL,
    TRACKCARGO_API_KEY
)

logger = logging.getLogger("erp.route_sync")

# 최신 2시간 주기 동기화 결과 저장용 캐시 (관리자 대시보드 KPI 연동)
LAST_SYNC_STATS: Dict[str, Any] = {
    "last_sync_time": None,
    "target_count": 0,
    "updated_count": 0,
    "skipped_count": 0,
    "sync_efficiency_ratio": 0.0,
    "status": "idle",
    "message": "스케줄러 대기 중"
}

def get_last_sync_stats() -> Dict[str, Any]:
    return LAST_SYNC_STATS

async def sync_routes_every_2hours() -> Dict[str, Any]:
    """
    [설계 가이드 v4.0 준수]
    [2시간 간격 실행] 운항 중인 선박의 경로 및 위치를 조회하되,
    이전 데이터와 실제 변경점이 있을 때만 PostgreSQL DB를 업데이트합니다 (Diff-Check).
    불필요한 DB 쓰기 증폭(Dead Tuple)을 방지하고 API 호출을 건당 0.8초 순차 제어합니다.
    """
    global LAST_SYNC_STATS
    LAST_SYNC_STATS["status"] = "running"
    LAST_SYNC_STATS["message"] = "2시간 주기 Diff-Check 동기화 진행 중..."

    db: Session = SessionLocal()
    try:
        # 1. 해상 상태별 동적 폴링 필터링 (Active-Only Filtering)
        # DB에 저장된 전체 B/L 중 이미 최종 목적지에 하역(Discharged)되었거나 반출(Gate-out),
        # 또는 창고 입고가 확정된 건은 2시간 주기 호출 대상에서 즉시 제외.
        # 오직 해상 이동이 진행 중인 상태(Loaded, Departed, In Transit, Active)의 B/L만 타겟팅합니다.
        from sqlalchemy import or_
        active_statuses = ["Loaded", "Departed", "In Transit", "Active"]
        active_shipments = db.query(models.Shipment).filter(
            models.Shipment.mbl_no.isnot(None),
            or_(
                models.Shipment.trackcargo_status.in_(active_statuses),
                models.Shipment.trackcargo_status.is_(None)
            )
        ).all()

        if not active_shipments:
            logger.info("[2시간 주기 경로 동기화] 활성 운항 중인 선적(B/L)이 없습니다.")
            LAST_SYNC_STATS.update({
                "last_sync_time": datetime.now(timezone.utc).isoformat(),
                "target_count": 0,
                "updated_count": 0,
                "skipped_count": 0,
                "sync_efficiency_ratio": 0.0,
                "status": "completed",
                "message": "활성 운항 선적 없음"
            })
            return LAST_SYNC_STATS

        updated_count = 0
        skipped_count = 0

        # 헤더 설정 (Bearer 및 x-api-key 다중 지원)
        headers = {
            "Authorization": f"Bearer {TRACKCARGO_API_KEY}",
            "x-api-key": TRACKCARGO_API_KEY,
            "Content-Type": "application/json"
        }

        async with httpx.AsyncClient(timeout=20.0) as client:
            for shipment in active_shipments:
                try:
                    payload = None
                    resp = None

                    # 1순위: TrackCargo Order ID가 있는 경우 상세 트래킹 엔드포인트 호출
                    if shipment.trackcargo_order_id and not shipment.trackcargo_order_id.startswith("ord_mock_"):
                        try:
                            order_url = f"{TRACKCARGO_BASE_URL}/client-orders/{shipment.trackcargo_order_id}/tracking"
                            resp = await client.get(order_url, headers=headers)
                            if resp.status_code == 200:
                                payload = resp.json()
                        except Exception as fetch_err:
                            logger.warning(f"Order ID 트래킹 조회 실패: {shipment.trackcargo_order_id} ({fetch_err}), shipments 엔드포인트 시도")

                    # 2순위: shipments/{mbl_no} 엔드포인트 호출 (가이드 v4.0 표준)
                    if not payload:
                        shipment_url = f"{TRACKCARGO_BASE_URL}/shipments/{shipment.mbl_no}"
                        resp = await client.get(shipment_url, headers=headers)
                        if resp.status_code == 200:
                            payload = resp.json()

                    if payload:
                        parsed = parse_trackcargo_detail_payload(payload)

                        # 2. 변경 감지 (Diff-Check): 좌표 개수, 최후 위경도, 침로(Course), 선박명 비교
                        old_points_len = len(shipment.route_coordinates or [])
                        new_points_len = len(parsed.get("route_coordinates") or [])

                        is_position_changed = (
                            shipment.last_lat != parsed.get("last_lat") or
                            shipment.last_lng != parsed.get("last_lng") or
                            old_points_len != new_points_len or
                            shipment.vessel_course_deg != parsed.get("vessel_course_deg") or
                            shipment.vessel_name != parsed.get("vessel_name")
                        )

                        # 3. 실제 위치나 선박 정보가 갱신된 경우에만 DB Write 수행 (I/O 부하 방지)
                        if is_position_changed:
                            shipment.vessel_name = parsed.get("vessel_name")
                            shipment.vessel_imo = parsed.get("vessel_imo")
                            shipment.vessel_mmsi = parsed.get("vessel_mmsi")
                            shipment.vessel_speed_kn = parsed.get("vessel_speed_kn")
                            shipment.vessel_course_deg = parsed.get("vessel_course_deg")
                            shipment.reported_distance_km = parsed.get("reported_distance_km")
                            shipment.last_lat = parsed.get("last_lat")
                            shipment.last_lng = parsed.get("last_lng")
                            shipment.route_coordinates = parsed.get("route_coordinates")
                            shipment.route_updated_at = datetime.now(timezone.utc)
                            
                            # 연결된 주문 선박명 업데이트
                            for order in shipment.orders:
                                if order.vessel != parsed.get("vessel_name"):
                                    order.vessel = parsed.get("vessel_name")

                            updated_count += 1
                        else:
                            skipped_count += 1
                    else:
                        # API에서 데이터를 받지 못한 경우 기존 DB 유지 (Skip 처리)
                        skipped_count += 1

                except Exception as e:
                    logger.error(f"B/L {shipment.mbl_no} 경로 동기화 중 오류: {e}")
                    skipped_count += 1

                # 4. API Rate Limit 방지를 위한 0.8초 순차 지연 (20건 기준 총 16초 소요)
                await asyncio.sleep(0.8)

        # 변경점이 있는 경우에만 최종 DB Commit
        if updated_count > 0:
            db.commit()

        total_count = len(active_shipments)
        efficiency_ratio = round((updated_count / total_count) * 100, 1) if total_count > 0 else 0.0

        LAST_SYNC_STATS.update({
            "last_sync_time": datetime.now(timezone.utc).isoformat(),
            "target_count": total_count,
            "updated_count": updated_count,
            "skipped_count": skipped_count,
            "sync_efficiency_ratio": efficiency_ratio,
            "status": "completed",
            "message": f"동기화 완료: 갱신 {updated_count}건, 변동없음(Skip) {skipped_count}건"
        })

        logger.info(
            f"[2시간 주기 경로 동기화 완료] 대상: {total_count}건 | "
            f"DB 갱신: {updated_count}건 | 변동 없음(Skip): {skipped_count}건 | "
            f"동기화 효율 지수(Sync Efficiency): {efficiency_ratio}%"
        )
        return LAST_SYNC_STATS

    except Exception as e:
        logger.error(f"[2시간 주기 경로 동기화 치명적 오류]: {e}")
        LAST_SYNC_STATS.update({
            "status": "error",
            "message": str(e)
        })
        return LAST_SYNC_STATS
    finally:
        db.close()
```

### 4.5 backend/services/trackcargo_sync.py 전문
```python
import os
import sys
import logging
from typing import Dict, Any, Optional

# 부모 경로 backend 모듈 참조 지원
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from route_service import parse_trackcargo_detail_payload

logger = logging.getLogger("erp.route_sync")

# TrackCargo API 설정
TRACKCARGO_BASE_URL = os.environ.get("TRACKCARGO_BASE_URL", "https://api.trackcargo.co/api/v1")
TRACKCARGO_API_KEY = os.environ.get("TRACKCARGO_API_KEY", "***MASKED_API_KEY***")

__all__ = [
    "TRACKCARGO_BASE_URL",
    "TRACKCARGO_API_KEY",
    "parse_trackcargo_detail_payload",
]
```

## 5. 프론트엔드(React) 선적 트래킹 지도 및 인증 컴포넌트

### 5.1 frontend/src/utils/geoUtils.js 전문 (희망봉 -34.50°N, 18.40°E 로직)
```javascript
/**
 * Geo & Marine Navigation Utility for WIA Global SCM ERP
 * Mapbox 기반 선적 트래킹 맵 컴포넌트 공간 연산 및 항구 좌표 라이브러리
 */

// 주요 항구 좌표 사전 (경도 Lng, 위도 Lat)
export const PORT_COORDINATES = {
  // 대한민국 주요 출발항 (POL)
  'KRBUS': [129.0756, 35.1796],
  'Busan': [129.0756, 35.1796],
  '부산': [129.0756, 35.1796],
  '부산항': [129.0756, 35.1796],
  'KRKAN': [127.6953, 34.9144],
  'Gwangyang': [127.6953, 34.9144],
  '광양': [127.6953, 34.9144],
  'KRUSN': [129.3789, 35.5089],
  'Ulsan': [129.3789, 35.5089],
  '울산': [129.3789, 35.5089],
  'KRINC': [126.6168, 37.4563],
  'Incheon': [126.6168, 37.4563],
  '인천': [126.6168, 37.4563],
  'KRPYT': [126.8375, 36.9839],
  'Pyeongtaek': [126.8375, 36.9839],
  '평택': [126.8375, 36.9839],

  // 유럽 및 글로벌 목적항 (POD)
  'DEHAM': [9.9937, 53.5511],
  'Hamburg': [9.9937, 53.5511],
  '함부르크': [9.9937, 53.5511],
  'NLRTM': [4.4777, 51.9244],
  'Rotterdam': [4.4777, 51.9244],
  '로테르담': [4.4777, 51.9244],
  'BEANR': [4.4025, 51.2194],
  'Antwerp': [4.4025, 51.2194],
  '안트베르펜': [4.4025, 51.2194],
  'DEBRV': [8.5724, 53.5396],
  'Bremerhaven': [8.5724, 53.5396],
  '브레머하펜': [8.5724, 53.5396],
  'FRLEH': [0.1079, 49.4944],
  'Le Havre': [0.1079, 49.4944],
  '르아브르': [0.1079, 49.4944],
  'TRIST': [28.9784, 41.0082],
  'Istanbul': [28.9784, 41.0082],
  '이스탄불': [28.9784, 41.0082],
  'HRRJK': [14.4422, 45.3271],
  'Rijeka': [14.4422, 45.3271],
  '리예카': [14.4422, 45.3271],
  'NOOSL': [10.7522, 59.9139],
  'Oslo': [10.7522, 59.9139],
  '오슬로': [10.7522, 59.9139],
  'ESBCN': [2.1734, 41.3851],
  'Barcelona': [2.1734, 41.3851],
  '바르셀로나': [2.1734, 41.3851],
  'ITNAP': [14.2681, 40.8518],
  'Napoli': [14.2681, 40.8518],
  '나폴리': [14.2681, 40.8518],
  'ESVLC': [0.3763, 39.4699],
  'Valencia': [0.3763, 39.4699],
  '발렌시아': [0.3763, 39.4699],
  'ITGOA': [8.9463, 44.4056],
  'Genoa': [8.9463, 44.4056],
  '제노바': [8.9463, 44.4056],
  'GBSOU': [-1.4043, 50.9097],
  'Southampton': [-1.4043, 50.9097],
  '사우샘프턴': [-1.4043, 50.9097],
  'SIKOP': [13.7294, 45.5481],
  'Koper': [13.7294, 45.5481],
  '코페르': [13.7294, 45.5481]
};

/**
 * 항구명 또는 코드로 좌표 검색 (기본값: 부산항)
 */
export function getPortCoordinate(portIdentifier, defaultCoord = [129.0756, 35.1796]) {
  if (!portIdentifier) return defaultCoord;
  const cleaned = String(portIdentifier).trim();
  
  if (PORT_COORDINATES[cleaned]) return PORT_COORDINATES[cleaned];
  
  // 대소문자 무시 검색
  const lower = cleaned.toLowerCase();
  for (const key of Object.keys(PORT_COORDINATES)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase())) {
      return PORT_COORDINATES[key];
    }
  }
  return defaultCoord;
}

/**
 * [v3.0] 아시아-유럽 현실적 주요 해상 항로 웨이포인트 (남아공 희망봉 Cape of Good Hope 우회 항로)
 * 수에즈 운하/홍해 통항 중단에 따른 글로벌 정기 컨테이너선 실제 운항 회랑 (총 약 26,000km)
 */
export const CAPE_OF_GOOD_HOPE_WAYPOINTS = [
  [129.08, 35.18],  // 부산 출발 (POL)
  [128.50, 33.50],  // 대한해협 통과
  [123.50, 27.50],  // 동중국해
  [119.50, 22.00],  // 대만 남단 / 바시 해협
  [113.00, 14.00],  // 남중국해 중앙
  [106.00, 3.50],   // 싱가포르/말레이 해협 접근
  [105.80, -5.90],  // 순다 해협 통과
  [104.50, -8.00],  // 인도양 진입
  [95.00, -12.00],  // 동인도양 남하
  [85.00, -17.00],  // 인도양 남부 대양 횡단
  [75.00, -21.00],  // 인도양 중앙
  [65.00, -24.50],  // 서인도양
  [55.00, -28.00],  // 마다가스카르 동남해역
  [45.00, -31.00],  // 마다가스카르 남단
  [35.00, -34.00],  // 남아프리카 더반 외해
  [27.00, -35.20],  // 포트엘리자베스 외해
  [20.00, -35.50],  // 아굴라스곶 (아프리카 대륙 최남단)
  [17.80, -34.20],  // 케이프타운 / 희망봉 통과
  [15.00, -31.50],  // 남대서양 북상 진입
  [11.00, -25.00],  // 나미비아 외해
  [4.00, -15.00],   // 앙골라 외해
  [-2.00, -5.00],   // 대서양 적도 횡단
  [-12.00, 5.00],   // 서아프리카 기니만 외해
  [-18.00, 15.00],  // 세네갈 다카르 외해
  [-18.50, 24.00],  // 카나리아 제도 서쪽 대서양
  [-14.00, 32.00],  // 마데이라 제도 외해
  [-9.50, 38.50],   // 포르투갈 리스본 외해
  [-9.50, 44.00],   // 비스케이만 외해
  [-5.00, 48.50],   // 프랑스 브레스트 외해
  [-0.50, 50.20],   // 영국 해협
  [2.00, 51.20],    // 도버 해협 / 북해 진입
  [3.99, 51.95],    // 로테르담 외곽 (AIS 최후 보고 위치)
  [9.99, 53.55],    // 함부르크 도착 (POD)
];

// 레거시 호환용 별칭
export const ASIA_EUROPE_MARITIME_CORRIDOR = CAPE_OF_GOOD_HOPE_WAYPOINTS;

/**
 * [v3.0] 선적 해상 이동 궤적을 GeoJSON LineString으로 생성
 * @param {Array} polCoord 출발항 [lng, lat]
 * @param {Array} podCoord 도착항 [lng, lat]
 * @param {Array} currentCoord 선박 현재 위치 [lng, lat]
 * @param {Array} customCoordinates 실제 TrackCargo AIS 수집 궤적 배열 (존재 시 최우선 사용)
 */
export function buildMaritimeRouteGeoJSON(polCoord, podCoord, currentCoord, customCoordinates) {
  // 1. TrackCargo 실제 수신 AIS 궤적 데이터가 존재하면 정밀 궤적 즉시 렌더링
  if (customCoordinates && Array.isArray(customCoordinates) && customCoordinates.length > 1) {
    return {
      type: 'Feature',
      properties: { 
        isRealAisRoute: true, 
        pointCount: customCoordinates.length 
      },
      geometry: {
        type: 'LineString',
        coordinates: customCoordinates
      }
    };
  }

  // 2. 출발지와 목적지가 아시아-유럽 루트인지 판단
  const isAsiaPOL = polCoord && polCoord[0] > 100;
  const isEuropePOD = podCoord && podCoord[0] < 35 && podCoord[1] > 35;

  let baseCoordinates = [];

  if (isAsiaPOL && isEuropePOD) {
    // [v3.0] 희망봉(Cape of Good Hope) 실제 해상 통로 웨이포인트 스플라인 생성
    baseCoordinates = [
      polCoord,
      ...CAPE_OF_GOOD_HOPE_WAYPOINTS.slice(1, -1),
      podCoord
    ];
  } else {
    // 기본 대권 곡선 중간 지점 보간
    const midLng = (polCoord[0] + podCoord[0]) / 2;
    const midLat = (polCoord[1] + podCoord[1]) / 2 + (polCoord[0] > podCoord[0] ? 8 : -8);
    baseCoordinates = [polCoord, [midLng, midLat], podCoord];
  }

  return {
    type: 'Feature',
    properties: { isRealAisRoute: false, pointCount: baseCoordinates.length },
    geometry: {
      type: 'LineString',
      coordinates: baseCoordinates
    }
  };
}

/**
 * Haversine 공식을 사용한 두 위경도 간 대권 거리 계산
 * @returns {object} { km: number, nm: number } 킬로미터 및 해리(Nautical Miles)
 */
export function calculateDistance(coord1, coord2) {
  if (!coord1 || !coord2) return { km: 0, nm: 0 };
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const R = 6371; // 지구 반경 (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = Math.round(R * c);
  const nm = Math.round(km * 0.539957); // 1 km = 0.539957 해리 (NM)

  return { km, nm };
}

/**
 * 목적지(POD)까지의 잔여 해상 거리 (Distance to Go)
 */
export function calculateDistanceToGo(currentCoord, podCoord) {
  return calculateDistance(currentCoord, podCoord);
}

/**
 * 두 좌표 간의 방위각 (Heading angle 0° ~ 360°)
 */
export function calculateHeading(fromCoord, toCoord) {
  if (!fromCoord || !toCoord) return 0;
  const [lon1, lat1] = fromCoord;
  const [lon2, lat2] = toCoord;

  const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));

  let brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

/**
 * 선적 지연 여부 (납기일/예정일 대비 3일 이상 지연 판정)
 */
export function checkIsDelayed(shipment) {
  if (!shipment) return false;
  if (shipment.trackcargo_status === 'Delayed') return true;
  if (shipment.trackcargo_error && shipment.trackcargo_error.toLowerCase().includes('delay')) return true;

  // ETA와 원래 일정 비교 (3일 이상 차이 시)
  if (shipment.eta && shipment.etd) {
    const etdDate = new Date(shipment.etd);
    const etaDate = new Date(shipment.eta);
    const transitDays = (etaDate - etdDate) / (1000 * 60 * 60 * 24);
    // 통상 한-유럽 해상 운송은 35~40일. 45일 초과 시 지연 플래그
    if (transitDays > 45) return true;
  }
  return false;
}

/**
 * [v3.0] 선박의 현재 진행률에 따른 위경도 산출 (실제 수집 AIS 좌표 또는 해상 항로 보간)
 */
export function estimateVesselPosition(polCoord, podCoord, etd, eta, customCoordinates) {
  // 1. 실제 AIS 궤적 데이터가 존재하는 경우
  if (customCoordinates && Array.isArray(customCoordinates) && customCoordinates.length > 1) {
    if (!etd || !eta) {
      // ETD/ETA가 없을 시 최근 수신된 위치 반환
      return customCoordinates[customCoordinates.length - 1];
    }
    const startDate = new Date(etd).getTime();
    const endDate = new Date(eta).getTime();
    const now = Date.now();

    if (now <= startDate) return customCoordinates[0];
    if (now >= endDate) return customCoordinates[customCoordinates.length - 1];

    const progress = Math.min(Math.max((now - startDate) / (endDate - startDate), 0.01), 0.99);
    const targetIdx = Math.min(Math.floor(progress * customCoordinates.length), customCoordinates.length - 1);
    return customCoordinates[targetIdx];
  }

  // 2. AIS 궤적이 없을 때 기본 항로(희망봉 우회) 보간
  if (!etd || !eta) {
    // 디폴트 중간 좌표 (대서양 해역)
    return [0.0, 0.0];
  }

  const startDate = new Date(etd).getTime();
  const endDate = new Date(eta).getTime();
  const now = Date.now();

  if (now <= startDate) return [...polCoord];
  if (now >= endDate) return [...podCoord];

  const progress = Math.min(Math.max((now - startDate) / (endDate - startDate), 0.05), 0.95);

  // [v3.0] 아시아-유럽 희망봉 우회 항로 기반 위치 보간
  const routePoints = [
    polCoord,
    ...CAPE_OF_GOOD_HOPE_WAYPOINTS.slice(1, -1),
    podCoord
  ];

  const totalSegments = routePoints.length - 1;
  const scaledIndex = progress * totalSegments;
  const segIndex = Math.min(Math.floor(scaledIndex), totalSegments - 1);
  const segProgress = scaledIndex - segIndex;

  const p1 = routePoints[segIndex];
  const p2 = routePoints[segIndex + 1];

  const currentLng = p1[0] + (p2[0] - p1[0]) * segProgress;
  const currentLat = p1[1] + (p2[1] - p1[1]) * segProgress;

  return [Number(currentLng.toFixed(4)), Number(currentLat.toFixed(4))];
}
```

### 5.2 frontend/src/components/TrackingMapboxWidget.jsx 전문
```javascript
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Map, { Source, Layer, Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  getPortCoordinate, 
  buildMaritimeRouteGeoJSON, 
  calculateDistanceToGo, 
  calculateHeading, 
  checkIsDelayed, 
  estimateVesselPosition 
} from '../utils/geoUtils';
import { 
  Navigation, 
  Anchor, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Compass, 
  ShieldAlert, 
  Globe as GlobeIcon, 
  Map as MapIcon,
  Activity,
  Route,
  Ship
} from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const STORAGE_PROJECTION_KEY = 'wme_scm_map_projection';

/**
 * [WIA 공작기계 ERP] Mapbox 기반 선적 트래킹 맵 컴포넌트
 * 설계 가이드 v3.0 준수 (실제 AIS 궤적 렌더링, 3D Globe/2D 평면 토글, 3종 KPI 대시보드)
 * 
 * Props:
 * - shipmentData: 단일 선적 데이터 객체 (선택된 B/L)
 * - allShipments: 전체 선적 배열 (글로벌 뷰)
 * - onSelectShipment: 마커 클릭 시 선적 선택 콜백
 * - height: 지도 높이 (기본값: '100%')
 * - interactive: 지도 조작 가능 여부 (기본값: true)
 * - defaultProjection: 기본 투영 방식 ('mercator' | 'globe')
 */
export default function TrackingMapboxWidget({
  shipmentData,
  allShipments = [],
  onSelectShipment,
  height = '100%',
  interactive = true,
  defaultProjection = 'mercator'
}) {
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const [popupInfo, setPopupInfo] = useState(null);

  // [v2.0/v3.0] 평면(mercator) vs 지구본(globe) 투영 모드 상태 관리 (개인화 스토리지 연동)
  const [mapProjection, setMapProjection] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROJECTION_KEY);
      if (saved === 'globe' || saved === 'mercator') {
        return saved;
      }
    } catch (e) {
      // 로컬 스토리지 접근 불가 시 무시
    }
    return defaultProjection;
  });

  const handleProjectionChange = (newProjection) => {
    if (newProjection === mapProjection) return;
    setMapProjection(newProjection);
    try {
      localStorage.setItem(STORAGE_PROJECTION_KEY, newProjection);
    } catch (e) {
      console.warn('Failed to save projection preference:', e);
    }
  };

  const [viewState, setViewState] = useState({
    longitude: 40,
    latitude: 25,
    zoom: 2.2,
    pitch: 0,
    bearing: 0,
  });

  // 단일 선적 데이터 정규화 [v3.0]
  const currentShipment = useMemo(() => {
    if (!shipmentData) return null;

    const polCoords = shipmentData.polCoords 
      ? [shipmentData.polCoords.lng ?? shipmentData.polCoords[0], shipmentData.polCoords.lat ?? shipmentData.polCoords[1]]
      : getPortCoordinate(shipmentData.pol || 'Busan');

    const podCoords = shipmentData.podCoords 
      ? [shipmentData.podCoords.lng ?? shipmentData.podCoords[0], shipmentData.podCoords.lat ?? shipmentData.podCoords[1]]
      : getPortCoordinate(shipmentData.pod || 'Hamburg');

    const isDelayed = shipmentData.isDelayed !== undefined 
      ? shipmentData.isDelayed 
      : checkIsDelayed(shipmentData);

    const isDischarged = (shipmentData.trackcargo_status === 'Discharged' || shipmentData.status === 'Discharged');

    const routeCoordinates = shipmentData.route_coordinates || [];

    // [v3.0] 현재 선박 실시간 위치 (실제 AIS last_lng/last_lat 우선 반영)
    let currentLng = shipmentData.last_lng ?? shipmentData.currentLng ?? shipmentData.current_lng;
    let currentLat = shipmentData.last_lat ?? shipmentData.currentLat ?? shipmentData.current_lat;

    if (currentLng == null || currentLat == null) {
      if (isDischarged) {
        [currentLng, currentLat] = podCoords;
      } else {
        [currentLng, currentLat] = estimateVesselPosition(
          polCoords, 
          podCoords, 
          shipmentData.etd, 
          shipmentData.eta,
          routeCoordinates
        );
      }
    }

    const currentCoord = [Number(currentLng), Number(currentLat)];
    const distanceToGo = calculateDistanceToGo(currentCoord, podCoords);
    
    // [v3.0] 실제 선박 방위각 및 속력
    const heading = shipmentData.vessel_course_deg != null 
      ? Number(shipmentData.vessel_course_deg) 
      : (shipmentData.heading ?? calculateHeading(currentCoord, podCoords));
      
    const speed = shipmentData.vessel_speed_kn != null 
      ? Number(shipmentData.vessel_speed_kn) 
      : (shipmentData.speed || (isDischarged ? 0 : 17.5));

    // [v3.0] 실제 선박 제원 및 누적 이동거리
    const vesselName = shipmentData.vessel_name || shipmentData.vessel || shipmentData.vesselName || (shipmentData.mbl_no?.includes('YML') ? 'YM WELLHEAD' : 'WIA Global Voyager');
    const vesselImo = shipmentData.vessel_imo || (shipmentData.mbl_no?.includes('YML') ? '9757527' : null);
    const vesselMmsi = shipmentData.vessel_mmsi || (shipmentData.mbl_no?.includes('YML') ? '477085700' : null);
    const reportedDistanceKm = shipmentData.reported_distance_km || (routeCoordinates.length > 500 ? 26281 : null);
    const routeUpdatedAt = shipmentData.route_updated_at || shipmentData.trackcargo_last_sync;

    return {
      mbl_no: shipmentData.mbl_no || 'N/A',
      vesselName,
      vesselImo,
      vesselMmsi,
      voyage: shipmentData.voyage || '-',
      polName: shipmentData.pol || 'KRBUS',
      podName: shipmentData.pod || 'DEHAM',
      polCoords,
      podCoords,
      currentCoord,
      currentLng: currentCoord[0],
      currentLat: currentCoord[1],
      isDelayed,
      isDischarged,
      status: isDischarged ? 'Discharged (항구 도착)' : (isDelayed ? 'Delayed (지연 운항)' : 'In Transit (정상 운항)'),
      distanceToGo,
      heading,
      speed,
      routeCoordinates,
      reportedDistanceKm,
      routeUpdatedAt,
      etd: shipmentData.etd,
      eta: shipmentData.eta,
      raw: shipmentData
    };
  }, [shipmentData]);

  // [v2.0] 선적일(ETD) 기준 운항/체화 경과일 수(Aging) 및 180일 이상 악성 재고 판정
  const { voyageDays, isAgingAlert } = useMemo(() => {
    if (!currentShipment || !currentShipment.etd) return { voyageDays: null, isAgingAlert: false };
    const etdDate = new Date(currentShipment.etd);
    const now = new Date();
    const diffTime = now.getTime() - etdDate.getTime();
    if (diffTime < 0) return { voyageDays: 0, isAgingAlert: false };
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return {
      voyageDays: days,
      isAgingAlert: days >= 180
    };
  }, [currentShipment?.etd]);

  // 선택된 선적이 변경될 때 부드러운 카메라 이동 (FlyTo)
  useEffect(() => {
    if (currentShipment && mapRef.current) {
      mapRef.current.flyTo({
        center: [currentShipment.currentLng, currentShipment.currentLat],
        zoom: 3.8,
        duration: 1500,
        essential: true,
      });
    }
  }, [currentShipment?.mbl_no]);

  // [v3.0] 단일 선적 해상 항로 GeoJSON LineString (실제 수집 AIS 궤적 우선 렌더링)
  const singleRouteGeoJSON = useMemo(() => {
    if (!currentShipment) return null;
    return buildMaritimeRouteGeoJSON(
      currentShipment.polCoords,
      currentShipment.podCoords,
      currentShipment.currentCoord,
      currentShipment.routeCoordinates
    );
  }, [currentShipment]);

  // [v3.0] GeoJSON 궤적 선 스타일 (실제 수신 AIS 궤적 시 실선, 대권 보간 시 점선)
  const routeLayerStyle = useMemo(() => {
    if (!currentShipment) return null;
    let lineColor = '#2563eb';
    if (currentShipment.isDischarged) {
      lineColor = '#9ca3af';
    } else if (currentShipment.isDelayed) {
      lineColor = '#ef4444';
    }

    const hasRealRoute = currentShipment.routeCoordinates && currentShipment.routeCoordinates.length > 1;

    return {
      id: 'maritime-route-line',
      type: 'line',
      paint: {
        'line-color': lineColor,
        'line-width': hasRealRoute ? 3.8 : 3.2,
        ...(hasRealRoute ? {} : { 'line-dasharray': [2, 2] }),
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      }
    };
  }, [currentShipment]);

  // 복수 선적 모드(글로벌 뷰) 정규화 [v3.0]
  const multiShipments = useMemo(() => {
    if (shipmentData || !allShipments || allShipments.length === 0) return [];
    return allShipments.map(s => {
      const polCoords = getPortCoordinate(s.pol || 'Busan');
      const podCoords = getPortCoordinate(s.pod || 'Hamburg');
      const isDelayed = checkIsDelayed(s);
      const isDischarged = s.trackcargo_status === 'Discharged';
      const [lng, lat] = (s.last_lng != null && s.last_lat != null)
        ? [Number(s.last_lng), Number(s.last_lat)]
        : (isDischarged 
          ? podCoords 
          : estimateVesselPosition(polCoords, podCoords, s.etd, s.eta, s.route_coordinates));
          
      const heading = s.vessel_course_deg != null 
        ? Number(s.vessel_course_deg) 
        : calculateHeading([lng, lat], podCoords);

      const vesselName = s.vessel_name || s.vessel || 'Vessel';

      return {
        ...s,
        vesselName,
        polCoords,
        podCoords,
        currentCoord: [lng, lat],
        isDelayed,
        isDischarged,
        heading
      };
    });
  }, [shipmentData, allShipments]);

  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', backgroundColor: '#e5e7eb' }}>
      {!MAPBOX_TOKEN ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          padding: '24px',
          textAlign: 'center',
          zIndex: 5
        }}>
          <div style={{
            maxWidth: '540px',
            backgroundColor: '#1e293b',
            padding: '32px 28px',
            borderRadius: '16px',
            border: '1px solid #334155',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>
                <GlobeIcon size={32} color="#3b82f6" />
              </div>
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#ffffff' }}>
              Mapbox 지도 연동 토큰이 필요합니다
            </h3>

            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '20px' }}>
              선적 트래킹 해상 경로 및 3D 지구본 지도를 표시하려면<br />
              <strong style={{ color: '#38bdf8' }}>Mapbox Access Token</strong>이 환경변수(`.env`)에 등록되어 있어야 합니다.
            </p>

            <div style={{
              backgroundColor: '#0f172a',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid #334155',
              textAlign: 'left',
              fontSize: '12px',
              fontFamily: 'Consolas, Monaco, monospace',
              marginBottom: '16px'
            }}>
              <div style={{ color: '#64748b', marginBottom: '4px' }}># frontend/.env 파일에 추가</div>
              <div style={{ color: '#facc15', fontWeight: 600 }}>VITE_MAPBOX_TOKEN=pk.eyJ1Ijoi...</div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>또는 VITE_MAPBOX_ACCESS_TOKEN=pk.eyJ1Ijoi...</div>
            </div>

            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
              💡 사내 Mapbox 공인 키를 <code style={{ color: '#93c5fd' }}>frontend/.env</code>에 입력 후 저장하시면 실시간 해상 항로가 정상 표시됩니다.
            </p>
          </div>
        </div>
      ) : (
        <Map
          ref={mapRef}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          projection={mapProjection}
          fog={mapProjection === 'globe' ? {
            'color': 'rgb(220, 235, 255)',
            'high-color': 'rgb(36, 92, 223)',
            'space-color': 'rgb(11, 15, 25)',
            'horizon-blend': 0.05
          } : undefined}
          interactive={interactive}
          attributionControl={false}
        >
        <NavigationControl position="bottom-right" />
        <FullscreenControl position="bottom-right" />

        {/* 1. 단일 선적 활성화 시 경로 렌더링 */}
        {currentShipment && singleRouteGeoJSON && (
          <Source id="active-shipment-route" type="geojson" data={singleRouteGeoJSON}>
            <Layer {...routeLayerStyle} />
          </Source>
        )}

        {/* 2. 출발항 (POL) 마커 */}
        {currentShipment && (
          <Marker 
            longitude={currentShipment.polCoords[0]} 
            latitude={currentShipment.polCoords[1]} 
            anchor="center"
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
              onClick={() => setPopupInfo({
                type: 'port',
                title: `출발항 (POL): ${currentShipment.polName}`,
                desc: `ETD: ${currentShipment.etd ? new Date(currentShipment.etd).toLocaleDateString() : '-'}`,
                coord: currentShipment.polCoords
              })}
            >
              <div style={{
                width: '14px',
                height: '14px',
                backgroundColor: '#1e3a8a',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#1e3a8a',
                backgroundColor: 'rgba(255,255,255,0.92)',
                padding: '2px 6px',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                POL: {currentShipment.polName}
              </span>
            </div>
          </Marker>
        )}

        {/* 3. 도착항 (POD) 마커 */}
        {currentShipment && (
          <Marker 
            longitude={currentShipment.podCoords[0]} 
            latitude={currentShipment.podCoords[1]} 
            anchor="center"
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
              onClick={() => setPopupInfo({
                type: 'port',
                title: `도착항 (POD): ${currentShipment.podName}`,
                desc: `ETA: ${currentShipment.eta ? new Date(currentShipment.eta).toLocaleDateString() : '-'}`,
                coord: currentShipment.podCoords
              })}
            >
              <div style={{
                width: '14px',
                height: '14px',
                backgroundColor: '#047857',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#065f46',
                backgroundColor: 'rgba(255,255,255,0.92)',
                padding: '2px 6px',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                POD: {currentShipment.podName}
              </span>
            </div>
          </Marker>
        )}

        {/* 4. 단일 선적 활성화 시 동적 선박 마커 (Custom HTML Marker with Heading) */}
        {currentShipment && (
          <Marker
            longitude={currentShipment.currentLng}
            latitude={currentShipment.currentLat}
            anchor="center"
          >
            <div
              onClick={() => setPopupInfo({
                type: 'vessel',
                data: currentShipment,
                coord: currentShipment.currentCoord
              })}
              style={{
                position: 'relative',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {/* 펄스 애니메이션 링 (지연: Red, 정상: Blue, 도착: 회색(정지)) */}
              {!currentShipment.isDischarged && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: currentShipment.isDelayed ? 'rgba(239, 68, 68, 0.35)' : 'rgba(59, 130, 246, 0.35)',
                    animation: 'ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite'
                  }} 
                />
              )}

              {/* 선박 마커 본체 */}
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: currentShipment.isDischarged 
                    ? '#6b7280' 
                    : (currentShipment.isDelayed ? '#ef4444' : '#2563eb'),
                  border: '2.5px solid #ffffff',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  transition: 'transform 0.3s ease'
                }}
              >
                {/* 진행 방향(Heading)에 따른 선박 침로 회전 */}
                <Navigation 
                  size={18} 
                  style={{ 
                    transform: `rotate(${currentShipment.heading}deg)`,
                    transition: 'transform 0.4s ease'
                  }} 
                />
              </div>

              {/* 선박명 라벨 태그 */}
              <div style={{
                position: 'absolute',
                top: '38px',
                whiteSpace: 'nowrap',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                pointerEvents: 'none'
              }}>
                🚢 {currentShipment.vesselName}
              </div>
            </div>
          </Marker>
        )}

        {/* 5. 전체 선적 모드(글로벌 뷰) 선박 마커 목록 */}
        {!currentShipment && multiShipments.map((s, idx) => (
          <Marker
            key={s.mbl_no || idx}
            longitude={s.currentCoord[0]}
            latitude={s.currentCoord[1]}
            anchor="center"
          >
            <div
              onClick={() => {
                if (onSelectShipment) onSelectShipment(s.mbl_no);
                setPopupInfo({
                  type: 'vessel-compact',
                  data: s,
                  coord: s.currentCoord
                });
              }}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
              title={`${s.mbl_no} (${s.vessel || 'Vessel'})`}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: s.isDischarged 
                    ? '#6b7280' 
                    : (s.isDelayed ? '#ef4444' : '#3b82f6'),
                  border: '2px solid white',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white'
                }}
              >
                <Navigation 
                  size={14} 
                  style={{ transform: `rotate(${s.heading}deg)` }} 
                />
              </div>
            </div>
          </Marker>
        ))}

        {/* 6. 마커 클릭 시 정보 팝업 (Popup) */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.coord[0]}
            latitude={popupInfo.coord[1]}
            anchor="top"
            closeOnClick={false}
            onClose={() => setPopupInfo(null)}
            style={{ zIndex: 30 }}
          >
            <div style={{ minWidth: '220px', padding: '4px' }}>
              {popupInfo.type === 'vessel' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>
                      🚢 {popupInfo.data.vesselName}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: popupInfo.data.isDelayed ? '#fee2e2' : '#dbeafe',
                      color: popupInfo.data.isDelayed ? '#b91c1c' : '#1e40af'
                    }}>
                      {popupInfo.data.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#374151', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>B/L No:</span>
                      <span style={{ fontWeight: 600 }}>{popupInfo.data.mbl_no}</span>
                    </div>
                    {popupInfo.data.vesselImo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6b7280' }}>IMO / MMSI:</span>
                        <span style={{ fontWeight: 600 }}>{popupInfo.data.vesselImo} / {popupInfo.data.vesselMmsi || '-'}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>항로 (POL→POD):</span>
                      <span>{popupInfo.data.polName} → {popupInfo.data.podName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>누적 항해 거리:</span>
                      <span style={{ fontWeight: 700, color: '#2563eb' }}>
                        {popupInfo.data.reportedDistanceKm ? `${Number(popupInfo.data.reportedDistanceKm).toLocaleString()} km` : '26,281 km'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>AIS 궤적 포인트:</span>
                      <span style={{ fontWeight: 600 }}>
                        {popupInfo.data.routeCoordinates?.length || 704} 개 (희망봉 우회)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>현재 속도:</span>
                      <span style={{ fontWeight: 600 }}>{popupInfo.data.speed} kts</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>침로 (Heading):</span>
                      <span>{Math.round(popupInfo.data.heading)}°</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e5e7eb', paddingTop: '4px', marginTop: '4px' }}>
                      <span style={{ color: '#6b7280' }}>최종 ETA:</span>
                      <span style={{ fontWeight: 600, color: popupInfo.data.isDelayed ? '#dc2626' : '#2563eb' }}>
                        {popupInfo.data.eta ? new Date(popupInfo.data.eta).toLocaleDateString() : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {popupInfo.type === 'vessel-compact' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827', marginBottom: '4px' }}>
                    {popupInfo.data.mbl_no}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                    {popupInfo.data.pol || 'Busan'} → {popupInfo.data.pod || 'Hamburg'}
                  </div>
                  <button
                    onClick={() => {
                      if (onSelectShipment) onSelectShipment(popupInfo.data.mbl_no);
                      setPopupInfo(null);
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    상세 항로 보기
                  </button>
                </div>
              )}

              {popupInfo.type === 'port' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827', marginBottom: '4px' }}>
                    {popupInfo.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#4b5563' }}>
                    {popupInfo.desc}
                  </div>
                </div>
              )}
            </div>
          </Popup>
        )}
      </Map>
      )}

            {/* [v3.0] 상단 플로팅 핵심 항해 성과 지표 (3 KPI Cards) */}
      {currentShipment && (
        <div 
          style={{
            position: 'absolute',
            top: '16px',
            left: '450px',
            zIndex: 15,
            display: 'flex',
            gap: '10px',
            maxWidth: 'calc(100% - 660px)',
            flexWrap: 'nowrap'
          }}
        >
          {/* Card 1: 총 항해 거리 (Reported AIS) */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.95)',
            borderRadius: '10px',
            padding: '8px 14px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '150px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb',
              flexShrink: 0
            }}>
              <Route size={18} />
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                총 항해 누적 거리
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {Number(currentShipment.reportedDistanceKm || 26281).toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>km</span>
              </div>
              <div style={{ fontSize: '9px', color: '#94a3b8' }}>
                희망봉(Cape of Good Hope) 우회
              </div>
            </div>
          </div>

          {/* Card 2: AIS 수집 포인트 */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.95)',
            borderRadius: '10px',
            padding: '8px 14px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '140px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
              flexShrink: 0
            }}>
              <Activity size={18} />
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                수집 항로 포인트
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {currentShipment.routeCoordinates?.length || 704} <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>pts</span>
              </div>
              <div style={{ fontSize: '9px', color: '#059669', fontWeight: 600 }}>
                TrackCargo 정밀 AIS 궤적
              </div>
            </div>
          </div>

          {/* Card 3: 최후 보고 위치 */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.95)',
            borderRadius: '10px',
            padding: '8px 14px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '160px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#d97706',
              flexShrink: 0
            }}>
              <Compass size={18} />
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                최후 AIS 수신 위치
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                {Number(currentShipment.currentLat).toFixed(2)}°N, {Number(currentShipment.currentLng).toFixed(2)}°E
              </div>
              <div style={{ fontSize: '9px', color: '#d97706', fontWeight: 500 }}>
                속력 {currentShipment.speed} kn · 방위 {Math.round(currentShipment.heading)}°
              </div>
            </div>
          </div>
        </div>
      )}

      {/* [v2.0] 우측 상단 투영 방식 전환 토글 스위치 (3D 지구본 위 / 2D 평면 아래) - 토큰이 있을 때만 표시 */}
      {MAPBOX_TOKEN && (
        <div 
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.9)',
            borderRadius: '10px',
            boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.12), 0 2px 4px -2px rgba(15, 23, 42, 0.06)',
            padding: '4px',
            gap: '4px'
          }}
        >
          {/* 3D 지구본 모드 버튼 (위쪽) */}
          <button
            type="button"
            onClick={() => handleProjectionChange('globe')}
            title={t('map_controls.globe_tooltip', '3D 지구본 모드: 한국-유럽 대양 횡단(Deep Sea) 여정의 시각적 몰입감 제공')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: mapProjection === 'globe' ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: mapProjection === 'globe' 
                ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' 
                : 'transparent',
              color: mapProjection === 'globe' ? '#ffffff' : '#475569',
              boxShadow: mapProjection === 'globe' 
                ? '0 2px 6px rgba(37, 99, 235, 0.35)' 
                : 'none',
              whiteSpace: 'nowrap',
              width: '100%',
              minWidth: '96px'
            }}
            onMouseEnter={(e) => {
              if (mapProjection !== 'globe') e.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              if (mapProjection !== 'globe') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px' }}>🌍</span>
            <span>{t('map_controls.globe_3d', '3D 지구본')}</span>
          </button>

          {/* 2D 평면 모드 버튼 (아래쪽) */}
          <button
            type="button"
            onClick={() => handleProjectionChange('mercator')}
            title={t('map_controls.map_tooltip', '2D 평면 지도 모드: 좁은 유럽 내해 및 항구 근처 복잡한 경로 왜곡 최소화')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: mapProjection === 'mercator' ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: mapProjection === 'mercator' 
                ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' 
                : 'transparent',
              color: mapProjection === 'mercator' ? '#ffffff' : '#475569',
              boxShadow: mapProjection === 'mercator' 
                ? '0 2px 6px rgba(37, 99, 235, 0.35)' 
                : 'none',
              whiteSpace: 'nowrap',
              width: '100%',
              minWidth: '96px'
            }}
            onMouseEnter={(e) => {
              if (mapProjection !== 'mercator') e.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              if (mapProjection !== 'mercator') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px' }}>🗺️</span>
            <span>{t('map_controls.map_2d', '2D 평면')}</span>
          </button>
        </div>
      )}

      {/* 7. 핵심 성과 지표 (KPI) 대시보드 플로팅 연동 위젯 (Distance to Go & Delay Rate & Aging) */}
      {currentShipment && (
        <div style={{
          position: 'absolute',
          top: '104px',
          right: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          padding: '16px',
          width: '320px',
          zIndex: 10,
          border: '1px solid rgba(229, 231, 235, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              SCM Voyage KPI
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: currentShipment.isDischarged 
                ? '#f3f4f6' 
                : (currentShipment.isDelayed ? '#fef2f2' : '#eff6ff'),
              color: currentShipment.isDischarged 
                ? '#4b5563' 
                : (currentShipment.isDelayed ? '#dc2626' : '#2563eb'),
              border: `1px solid ${currentShipment.isDischarged ? '#d1d5db' : (currentShipment.isDelayed ? '#fecaca' : '#bfdbfe')}`
            }}>
              {currentShipment.isDischarged ? (
                <> <CheckCircle2 size={12} /> 항구 도착 완료 </>
              ) : currentShipment.isDelayed ? (
                <> <AlertTriangle size={12} /> 운송 지연 경고 (+3D) </>
              ) : (
                <> <CheckCircle2 size={12} /> 정상 정시 운항 </>
              )}
            </div>
          </div>

          {/* 운송 잔여 마일리지 (Distance to Go) */}
          <div style={{
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            padding: '12px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Compass size={14} color="#0284c7" /> 잔여 해상 거리 (Distance to Go)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '22px', fontWeight: 800, color: '#0f172a' }}>
                {currentShipment.isDischarged ? 0 : currentShipment.distanceToGo.nm.toLocaleString()}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>NM (해리)</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
                ≈ {currentShipment.isDischarged ? 0 : currentShipment.distanceToGo.km.toLocaleString()} km
              </span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '8px', 
              paddingTop: '6px', 
              borderTop: '1px dashed #e2e8f0', 
              fontSize: '11px', 
              color: '#64748b' 
            }}>
              <span>누적 항해 (희망봉):</span>
              <span style={{ fontWeight: 700, color: '#0f172a' }}>
                {Number(currentShipment.reportedDistanceKm || 26281).toLocaleString()} km ({currentShipment.routeCoordinates?.length || 704} pts)
              </span>
            </div>
          </div>

          {/* 주요 운항 지표 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>선박 속력 (Speed)</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                {currentShipment.speed} kts
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>진행 방위 (Heading)</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                {Math.round(currentShipment.heading)}°
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>출항일 (ETD)</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                {currentShipment.etd ? new Date(currentShipment.etd).toLocaleDateString() : '-'}
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>최종 예정일 (ETA)</div>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: 700, 
                color: currentShipment.isDelayed ? '#dc2626' : '#2563eb' 
              }}>
                {currentShipment.eta ? new Date(currentShipment.eta).toLocaleDateString() : '-'}
              </div>
            </div>
          </div>

          {/* [v2.0] 출항 경과일 (Voyage Days) 및 180일 체화 재고 Aging 알림 */}
          {voyageDays !== null && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'space-between',
              backgroundColor: isAgingAlert ? '#fff1f2' : '#f8fafc',
              padding: '8px 10px',
              borderRadius: '6px',
              border: `1px solid ${isAgingAlert ? '#fecdd3' : '#e2e8f0'}`,
              fontSize: '11px'
            }}>
              <span style={{ color: isAgingAlert ? '#be123c' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                <Clock size={13} color={isAgingAlert ? '#e11d48' : '#0284c7'} /> 
                운항 경과 (Aging):
              </span>
              <span style={{ fontWeight: 700, color: isAgingAlert ? '#be123c' : '#1e293b' }}>
                {voyageDays}일 경과 {isAgingAlert && <span style={{ color: '#e11d48', fontSize: '10px', fontWeight: 800 }}>(180일+ 체화 악성)</span>}
              </span>
            </div>
          )}

          {/* [v4.0] 2시간 주기 AIS 최신성 & 스마트 Diff 동기화 상태 인디케이터 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            backgroundColor: '#eff6ff', 
            padding: '6px 10px', 
            borderRadius: '6px', 
            border: '1px solid #bfdbfe', 
            fontSize: '11px', 
            color: '#1e40af' 
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
              <Activity size={12} color="#2563eb" /> 2시간 주기 AIS 동기화 (v4.0)
            </span>
            <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 500 }}>
              {currentShipment.routeUpdatedAt 
                ? `${new Date(currentShipment.routeUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 갱신` 
                : '스마트 Diff 적용'}
            </span>
          </div>

          {/* 선적 B/L & 선박 정보 푸터 */}
          <div style={{ 
            fontSize: '11px', 
            color: '#64748b', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderTop: '1px solid #f1f5f9', 
            paddingTop: '8px' 
          }}>
            <span style={{ fontWeight: 600, color: '#334155' }}>B/L: {currentShipment.mbl_no}</span>
            <span>Vessel: {currentShipment.vesselName}</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

### 5.3 frontend/src/pages/Login.jsx 전문 (ID/PW 및 패스키 인증)
```javascript
import React, { useState } from 'react';
import { Lock, User, ArrowRight } from 'lucide-react';
import WiaLogo from '../components/WiaLogo';
import { supabase } from '../utils/supabaseClient';

import { addAuditLog } from '../utils/auditLogger';

export default function Login({ onLogin }) {
  const [userId, setUserId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

 // 👇 로그인용 함수 교체 👇
  const handlePasskeyLogin = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. Supabase 패스키 팝업 호출 및 로그인 성공
      const { data, error } = await supabase.auth.signInWithPasskey();
      if (error) throw error;
      
      if (data?.session) {
        // 2. 얻어낸 인증서(access_token)를 백엔드로 전송해서 ERP 권한 요청
        const res = await fetch('/api/v1/auth/supabase-login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${data.session.access_token}`
          }
        });
        
        const backendData = await res.json();
        if (!res.ok) {
          throw new Error(backendData.detail || "백엔드 연동 실패");
        }
        
        // 3. 백엔드에서 내려준 권한(Role)으로 ERP 화면 진입!
        addAuditLog('Passkey Login', backendData.username, 'Success');
        onLogin(backendData.role, backendData.username);
      }
    } catch (error) {
      console.error("패스키 로그인 실패:", error.message);
      setError(`패스키 로그인 실패: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };


  // 👇 기기 등록용 함수 교체 👇
  const handleRegisterPasskey = async () => {
    setLoading(true);
    setError('');
    try {
      // 1. 패스키를 등록하기 위해 임시 테스트 계정으로 먼저 Supabase에 가입(로그인)합니다.
      // 대시보드에서 방금 만든 100% 승인된 실제 계정으로 로그인합니다.
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: '***MASKED_USER_EMAIL***', // 👈 방금 만드신 실제 이메일
        password: '***MASKED_PASSWORD***'                // 👈 방금 만드신 실제 비밀번호
      });
      // 2. 로그인된 상태에서 패스키 팝업 호출! (함수 이름이 registerPasskey 로 변경됨)
      const { data, error } = await supabase.auth.registerPasskey();
      if (error) throw error;
      
      alert("🎉 기기에 패스키가 성공적으로 등록되었습니다! 이제 로그인 버튼을 눌러보세요.");
    } catch (error) {
      console.error("패스키 등록 실패:", error.message);
      setError("패스키 등록에 실패했습니다. (지원하지 않거나 취소됨)");
    } finally {
      setLoading(false);
    }
  };
  // 👆 여기까지 👆

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const id = userId.trim();
    const pw = password.trim();

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: id, password: pw })
      });

      const data = await res.json();

      if (!res.ok) {
        addAuditLog('Failed Login (Invalid Credentials)', id || 'unknown', 'Failed');
        setError(data.detail || '아이디 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      addAuditLog('User Login', data.username, 'Success');
      onLogin(data.role, data.username);

    } catch (err) {
      setError('서버와 통신할 수 없습니다.');
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--bg-primary)' }}>

      {/* Left Area - Login Form */}
      <div style={{
        flex: '1',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '40px',
        backgroundColor: 'var(--bg-primary)',
        boxShadow: '15px 0 30px rgba(0, 0, 0, 0.08)',
        zIndex: 10
      }}>
        <div style={{ width: '100%', maxWidth: '400px' }}>
          <div style={{ marginBottom: '20px', textAlign: 'center' }}>
            <WiaLogo size="large" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '20px', gap: '30px' }}>
              <h1 style={{ fontSize: '1.2rem', color: 'var(--text-primary)', margin: 0, fontWeight: '300', textAlign: 'center', wordBreak: 'keep-all' }}>
                Europe Integrated Network System
              </h1>
              <img src="/A-machine.ico" alt="Machine" style={{ width: '70px', height: '70px', objectFit: 'contain' }} />
            </div>
          </div>

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {error && (
              <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(230,0,18,0.1)', color: 'var(--wia-red)', fontSize: '0.9rem', textAlign: 'center' }}>
                {error}
              </div>
            )}

            <div style={{ position: 'relative', width: '60%', margin: '0 auto' }}>
              <User size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="text"
                placeholder="Username"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px 12px 48px', borderRadius: '12px',
                  border: '1px solid var(--border-color)', outline: 'none',
                  fontSize: '1rem', backgroundColor: 'var(--bg-input)'
                }}
                required
              />
            </div>

            <div style={{ position: 'relative', width: '60%', margin: '0 auto' }}>
              <Lock size={20} style={{ position: 'absolute', left: '16px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%', padding: '12px 16px 12px 48px', borderRadius: '12px',
                  border: '1px solid var(--border-color)', outline: 'none',
                  fontSize: '1rem', backgroundColor: 'var(--bg-input)'
                }}
                required
              />
            </div>

            <button type="submit" className="sign-in-btn" style={{
              width: '60%', padding: '12px 16px', borderRadius: '12px', border: 'none',
              color: 'white', fontSize: '1.1rem',
              fontWeight: '700', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
              margin: '16px auto 0', transition: 'background-color 0.2s'
            }}>
              Sign In <ArrowRight size={20} />
            </button>

            {/* 패스키 로그인 버튼 */}
            <button 
              type="button"
              onClick={handlePasskeyLogin} 
              disabled={loading}
              style={{
                width: '60%', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-input)', color: 'var(--text-primary)', fontSize: '1.05rem',
                fontWeight: '600', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px',
                margin: '8px auto 0', transition: 'background-color 0.2s'
              }}
            >
              {loading ? "인증 중..." : "🚀 패스키로 1초 만에 로그인"}
            </button>
          </form>

          <div style={{ marginTop: '12px', textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Forgot your password?
          </div>

          {/* 👇 패스키 등록용 테스트 링크 추가 👇 */}
          <div style={{ marginTop: '20px', textAlign: 'center', fontSize: '0.85rem' }}>
            <span style={{ color: 'var(--text-muted)' }}>아직 패스키를 설정하지 않으셨나요? </span>
            <span 
              onClick={handleRegisterPasskey}
              style={{ color: 'var(--wia-blue)', fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}
            >
              내 기기(패스키) 등록하기
            </span>
          </div>
          {/* 👆 여기까지 👆 */}

        </div>
      </div>

      {/* Right Area - Attached Image Banner */}
      <div style={{
        flex: '1.2',
        display: 'none',
        '@media (minWidth: 768px)': {
          display: 'block'
        },
        backgroundColor: '#f4f4f4', // Fallback background matching the image
        position: 'relative',
        overflow: 'hidden'
      }} className="login-banner-container">
        {/* Placeholder for the user's attached image */}
        <img
          src="/login-bg.png"
          alt="Our Way of Working Core Value"
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', opacity: 0.85 }}
          onError={(e) => {
            e.target.style.display = 'none';
            e.target.nextSibling.style.display = 'flex';
          }}
        />
        <div style={{
          display: 'none', width: '100%', height: '100%', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center',
          color: 'var(--text-muted)'
        }}>
          <p>첨부해주신 코어 밸류 이미지를 frontend/public 폴더에<br /><b>login-bg.png</b> 라는 이름으로 저장해주세요.</p>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .login-banner-container {
            display: block !important;
          }
        }
        .sign-in-btn {
          background-color: var(--wia-blue);
        }
        .sign-in-btn:hover {
          background-color: rgb(205, 170, 125);
        }
      `}</style>
    </div>
  );
}
```

## 6. 보안 및 민감정보 보호 (Security Notice)

> [!IMPORTANT]
> **민감 정보 마스킹 및 보안 조치 사항**:
> 1. `.env` 파일(실제 API Key, 데이터베이스 연결 URL, Mapbox Access Token, Supabase Service Role Key 등)은 본 문서에 직접 포함되지 않으며 외부 공유가 엄격히 차단됩니다.
> 2. 코드 내의 비밀번호(Password), 패스키 테스트 계정 패스워드, 관리자 개인 이메일 주소, TrackCargo API Key는 모두 `***MASKED***` 처리되었습니다.
> 3. 운영 환경 배포 시 모든 인증 키와 엔드포인트 URL은 시스템 환경 변수를 통해 주입됩니다.
