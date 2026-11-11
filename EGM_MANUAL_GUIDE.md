# [ERP 시스템] Google Antigravity 개발 환경에서 코끼리-금붕어 모델(EGM, Elephant-Goldfish Model) 실전 템플릿 및 사용 매뉴얼 가이드

Google Antigravity 개발 환경에서 **WMEINS(현대위아 유럽법인 공작기계 글로벌 SCM & ERP 시스템)**의 설계 일관성과 코드 무결성을 동시에 확보할 수 있도록, ERP 종합 설계 가이드와 코끼리-금붕어 모델(**EGM, Elephant-Goldfish Model**) 실전 템플릿 및 사용 매뉴얼을 제안합니다.

---

## 코끼리-금붕어 모델(EGM) 플러그인의 핵심 기능과 작동 원리

단일 AI 에이전트가 긴 대화 맥락을 유지한 채 코드 작성과 코드 리뷰를 동시에 수행하면, 자신이 방금 작성한 코드의 논리적 오류나 하드코딩된 임시 데이터를 정상적인 로직으로 합리화하는 문제가 발생합니다. EGM 플러그인은 기억력이 뛰어난 **‘코끼리(Elephant)’**와 기억이 매번 초기화되는 **‘금붕어(Goldfish)’**라는 두 가지 상반된 에이전트 페르소나를 결합하여 이 문제를 해결합니다.

| 구분 | 코끼리(Elephant) 에이전트 | 금붕어(Goldfish) 에이전트 | WMEINS 적용 가치 |
| :--- | :--- | :--- | :--- |
| **기억 구조** | 장기 기억 유지 (Full Context) | 무상태 단기 기억 (Stateless) | 맥락 유지와 객관성 동시 확보 |
| **핵심 역할** | 아키텍처 설계 및 코드 구현 | 독립적 코드 리뷰 및 결함 감사 | 자기 합리화(확증 편향) 차단 |
| **입력 데이터** | 전체 설계 문서 및 히스토리 | 변경된 코드(Diff)와 검증 규칙 | 토큰 비용 절감 및 정밀 검증 |
| **방어 대상** | 시스템 구조 파편화 및 중복 개발 | 환각, 보안 누락, 하드코딩 잔존 | 실서버 배포 전 버그 사전 제거 |

### 1. 코끼리 모드 (Elephant - Long-Term Architect)
* 프로젝트의 전체 디렉토리 구조, DB 스키마, 비즈니스 히스토리를 끝까지 기억하며 기능을 설계하고 코드를 작성합니다.
* WMEINS 프로젝트에서 생성된 [`WMEINS_CONTEXT.md`](./WMEINS_CONTEXT.md) 문서가 바로 코끼리 에이전트의 핵심 장기 기억 저장소 역할을 수행합니다.

### 2. 금붕어 모드 (Goldfish - Stateless Fresh Reviewer)
* 이전의 대화 맥락이나 코드 작성 이유를 전혀 모르는 **‘백지상태(Zero-Context)’**로 호출되어, 오직 방금 변경된 코드(`git diff`)와 요구사항 명세서만 놓고 결함을 검사합니다.
* 작업이 끝나는 즉시 기억을 소거하므로, 이전 단계의 타협이나 선입견 없이 보안 취약점과 엣지 케이스(Edge Case)를 날카롭게 지적합니다.

### 3. 핑퐁 게이트 (Ping-Pong Verification Loop)
* 코끼리가 작성한 코드를 금붕어가 검토하여 승인(`PASS`)할 때까지 자동으로 수정을 반복하는 품질 관문(Quality Gate) 기능을 수행합니다.

---

## 1. 초기 요구 사항 분석 (Business Requirements Analysis)

### a) 비즈니스 유형 및 맞춤형 시스템 아키텍처 구상
WMEINS는 한국 본사(부산 `KRPUS`, 광양 `KRKAN` 등)에서 생산된 고단가 공작기계 및 수치제어기(NC)를 해상 운송을 통해 유럽 법인 및 딜러망(함부르크 `DEHAM`, 로테르담 `NLRTM`, 이스탄불 `TRIST` 등)에 공급하는 글로벌 B2B 제조·유통 하이브리드 SCM 환경입니다.

* **프론트엔드·백엔드 분리형 클라우드 아키텍처:** 프론트엔드는 Vite + React 18 + Mapbox GL JS 기반으로 구축되어 다국어(i18n)와 2D/3D 해상 항로 시각화를 담당하며, 백엔드는 FastAPI + SQLAlchemy + APScheduler 기반으로 38개 RESTful API와 백그라운드 배치를 처리합니다.
* **직발주(A주문) 및 법인 재고(F주문) 통합 구조:** 단일 `Order` 테이블 내에서 `is_corporate_stock` 플래그와 `stock_type`(`AVAILABLE`, `RENTAL`, `SHOWROOM`)을 활용하여 딜러 직발주 물량과 유럽법인 보유 가용 재고를 단일 파이프라인으로 관리합니다.
* **EGM 이원화 에이전트 아키텍처:** Google Antigravity 내에서 전체 도메인 지식을 유지하는 ‘코끼리(설계·구현 에이전트)’와 무상태(Stateless)에서 변경 코드(`git diff`)만 감사하는 ‘금붕어(검토 에이전트)’를 분리하여 확증 편향과 회귀 버그를 차단합니다.

### b) 시스템 주요 목표 및 개발 우선순위 설정
한 대당 단가가 높은 공작기계 특성상, 단순 물량 집계보다 개별 호기(S/N) 단위의 위치 정합성 확보, 체화 재고 리스크 방어, 반복 CS 자동화에 최우선 순위를 둡니다.

1. **1순위 (재고 및 위치 정확도 향상):** 이미 도착 완료된 선박(`HDMUSELE22174500`, 도착일 2026. 10. 6.)이 테스트 시드 데이터로 인해 케이프타운(`-34.50°N, 18.40°E`)에 머물러 있던 현상처럼, 시드 데이터와 실시간 API 데이터 간의 충돌을 원천 제거합니다.
2. **2순위 (업무 자동화 및 운영 비용 절감):** 별도의 유료 AIS API 도입 없이 기존 TrackCargo PRO API의 2시간 주기 스마트 Diff 동기화(`trackcargo_route_scheduler.py`)와 7단계 이메일 알림 엔진(`scheduler.py`)을 통해 수기 안내 업무를 자동화합니다.
3. **3순위 (딜러 셀프서비스 및 보안 고도화):** 딜러 포털의 ‘배송 추적 타임라인’ 내 2D 평면 지도 추적 팝업과 화물 디테일 제원 모달을 제공하고, 로그인 체계를 직렬 2단계 인증(1차 ID/PW + 2차 패스키)으로 강화합니다.

### c) 현재 사용 중인 도구 및 데이터 마이그레이션 점검
기존 오프라인 문서 자산과 클라우드 데이터베이스 간의 마이그레이션 파이프라인은 다음과 같이 구성되어 있으며, 스키마 변경 시 데이터 유실 방지를 위한 사전 검증이 필수적입니다.

* **엑셀 마스터 데이터 마이그레이션:** 프로젝트 내 `document/` 디렉토리에 보관된 `2026_PO_List.xlsx`, `Stock Status.xlsx`, `Promo update 260706.xlsx` 및 5대 마스터 코드(Dealer, Model, NC, Port, Incoterms)를 `backend/import_*.py` 스크립트를 통해 PostgreSQL(`scm_erp.db`)로 이관합니다.
* **비정형 문서 및 카탈로그 디지털화:** 출하 납품서 및 패킹 리스트는 `ai_cargo_parser.py`로 파싱하여 `CargoDetail` 테이블에 적재하며, 기종별 카탈로그 PDF 및 썸네일은 Cloudflare R2(`storage.py`)와 연동하여 서빙합니다.

---

## 2. 시스템 설계 가이드 (System Design Guide)

### a) 재고 관리 필수 모듈 정의
공작기계의 전 생애주기를 추적하기 위해 WMEINS의 핵심 모듈을 4대 영역으로 구조화합니다.

| 필수 모듈 | 핵심 테이블 및 엔드포인트 | 주요 비즈니스 로직 및 상태 흐름 |
| :--- | :--- | :--- |
| **입고 및 해상 트래킹 모듈**<br/>(Inbound & Vessel) | `Shipment`, `Order`<br/>`GET /api/shipments`<br/>`GET /api/v1/tracking/{mbl_no}/route-map` | • `CONFIRMED`(주문) → `IN_PRODUCTION`(생산중) → `SHIPPING`(배송) → `ARRIVED`(항구도착) → `IN_STOCK`(입고) 전환<br/>• 출항 전(생산 중) 장비는 출항 대기 중 상태 및 부산항(`KRPUS`) 위치 표시<br/>• TrackCargo 하역(`Discharged`/`Picked Up`) 수신 시 도착항 좌표 고정 및 운항 소요일 확정 |
| **출고 및 딜러 포털 모듈**<br/>(Outbound & Portal) | `Order`, `CargoDetail`<br/>`PATCH /api/orders/{id}/status`<br/>`GET /api/cargo-details/{sn}` | • 관리자 출고 확정 시 `DISPATCHED`(출고) → `SOLD`(판매완료) 전환 및 딜러 포털 픽업상태 '완료' 표기 (이전 단계는 '-')<br/>• 딜러 포털 화물디테일 `[상세보기]` 클릭 시 호기(S/N) 기준 중량·치수·CBM·박스수 팝업 제공<br/>• 타임라인 우측 `[🚢 화물추적]` 클릭 시 2D 평면 지도 항로 및 타임라인 동일 장비 목록 표시 |
| **재고 실사 및 감사 모듈**<br/>(Inventory Audit) | `OrderStatusHistory`<br/>`GET /api/orders/{id}/history`<br/>`POST /api/orders/sync-serial-numbers` | • 모든 상태 전진(`FORWARD`) 및 역방향 롤백(`BACKWARD`) 시 변경자 ID, 변경 사유(`reason`), 당시 ETD/ETA 스냅샷(`snapshot`)을 불변 이력으로 기록하여 실사 정합성 보장 |
| **반품·회수 및 임대 관리 모듈**<br/>(Return & Recovery) | `PromotionInventory`<br/>`PATCH /api/promotions/{id}/cancel` | • 프로모션 예약(`RESERVED`) 장비의 만료일 도래 시 2시간 주기 스케줄러가 자동으로 `AVAILABLE` 상태로 강제 회수(Roll-back)<br/>• 임대(`stock_type="RENTAL"`) 장비 만료 7일 전(D-7) 반납/연장 사전 알림 자동 발송 |

### b) 하드웨어 통합 대안 및 디지털 식별자 아키텍처
본 시스템은 유럽 현지 창고 및 항만 운영 여건에 맞추어 물리적인 바코드/QR 스캐너 및 RFID 리더기 등 하드웨어 장비 도입을 배제하고, 소프트웨어 기반의 ‘디지털 식별자 자동 매핑 및 논리적 상태 제어’로 하드웨어 기능을 대체합니다.

* **AI 문서 파서 및 시리얼 번호(S/N) 디지털 바인딩:** 창고 현장에서 바코드를 스캔하는 대신, 본사 출하 문서(패킹 리스트/인보이스)를 `ai_cargo_parser.py`로 자동 분석하고 `/api/orders/sync-serial-numbers`를 통해 발주 번호(`reference_no`)와 장비 고유 호기(`serial_number`), 포장 박스 번호(`box_no`: 1/2, 2/2)를 DB상에서 1:1 디지털 바인딩합니다.
* **웹 기반 논리적 입출고 확정:** TrackCargo API의 도착 마일스톤 이벤트와 관리자 포털(`AdminDispatch.jsx`)의 웹 승인 액션을 결합하여, 스캐너 하드웨어 유지보수 비용 없이도 실시간 재고 가시성을 달성합니다.
* **향후 모바일 QR 조회 확장성:** 추후 전시장(`SHOWROOM`)이나 창고 실사 시 모바일 기기 연동이 필요할 경우, 별도 리더기 구매 없이 장비 명판에 부착된 `serial_number` 기준 URL(`https://www.wmeins.eu/cargo/{serial_number}`) QR 코드만 스마트폰 카메라로 비추어 제원과 상태를 즉시 열람할 수 있도록 RESTful URL 구조를 유지합니다.

### c) 실시간 대시보드 및 리포팅 핵심 성과 지표 (KPI)
경영진 및 물류 담당자가 공급망 병목과 재무 리스크를 즉각 파악할 수 있도록 4대 핵심 KPI를 대시보드에 배치합니다.

* **재고 에이징 및 악성 체화율 (Inventory Aging & Dead Stock Rate):** 선적일(`etd`) 기준으로 일반 재고(0~180일), 장기 재고(181~360일), 악성 체화 재고(361일 이상) 비율을 자동 산출하고, 180일 경과 시 대시보드에 즉시 경고 배지를 노출합니다.
* **선적 정시 도착률 및 지연 일수 (On-Time Arrival & Delayed Days):** 최초 예정일(`ETA`) 대비 실제 도착일(`Actual`) 편차를 추적하여 지연 일수를 산출하되, 도착 완료(`Discharged`/`Arrived`)된 화물은 지연 경고를 즉시 해제하고 총 운항 소요일을 확정합니다.
* **사업계획 달성률 (Business Plan Achievement):** `BusinessPlan` 테이블의 월별 계획(`plan_eur`, `plan_qty`) 대비 실제 판매 실적(`act_eur`, `act_qty`) 달성률을 시각화합니다.
* **AIS 데이터 동기화 효율 지수 (Sync Efficiency Ratio):** 2시간 주기 스케줄러가 호출한 전체 활성 B/L 수 대비 실제 좌표 변경이 발생해 DB 쓰기(`UPDATE`)가 수행된 비율을 산출하여 API 및 DB I/O 건전성을 모니터링합니다.

---

## 3. 기술적 조언 (Technical Advice)

### a) 확장성과 보안을 고려한 기술 스택
현재 WMEINS의 클라우드 인프라(Render + Supabase + Cloudflare R2) 위에서 성능과 안정성을 극대화하기 위한 기술 표준입니다.

* **백엔드 및 비동기 스케줄링:** Python FastAPI와 SQLAlchemy를 사용하며, 외부 API 호출 시 `httpx.AsyncClient`와 건당 0.8초 지연(`asyncio.sleep(0.8)`)을 적용해 Rate Limit 차단을 방지합니다.
* **데이터베이스 최적화:** 수백 개의 항로 좌표 배열(`route_coordinates`)은 정규화 테이블 분리 대신 `JSON / JSONB` 컬럼에 저장하고, 이전 좌표와 차이가 있을 때만 덮어쓰는 Diff-Check 로직으로 PostgreSQL의 Dead Tuple 발생을 억제합니다.
* **프론트엔드 및 지도 렌더링:** React 18과 `react-map-gl`(Mapbox GL JS)을 사용하며, 관리자 관제 뷰에서는 3D 지구본(`globe`)과 2D 평면(`mercator`) 토글을 지원하고 딜러 포털 팝업(`dealerPopupMode`)에서는 2D 평면 지도로 고정하여 렌더링 성능을 높입니다.

### b) 사용자 역할별 접근 권한 설정 (RBAC) 및 직렬 2단계 인증(MFA)
`CustomUser` 모델의 3대 역할(`SCM_ADMIN`, `RSM`, `DEALER`)에 따라 API 접근과 데이터 조회 범위를 엄격히 통제합니다.

| 사용자 역할 (UserRole) | 인증 요구 수준 | 데이터 접근 범위 (Row-Level Security) | 주요 허용 기능 |
| :--- | :--- | :--- | :--- |
| **SCM_ADMIN**<br/>(최고 관리자) | 1차 ID/PW + 2차 패스키 필수 | 전사 모든 딜러사 발주, 법인 재고, 전체 B/L 및 사업계획 | 사용자/권한 관리, 선적 업로드, 입출고 상태 확정, 알림 엔진 설정 |
| **RSM**<br/>(지역 영업 관리자) | 1차 ID/PW + 2차 패스키 필수 | 담당 권역(`region`) 또는 본인(`rsm_user_id`)에게 배정된 딜러사 데이터 | 담당 권역 발주 현황 모니터링, 프로모션 예약 지원, 영업 실적 조회 |
| **DEALER**<br/>(파트너 딜러사) | 1차 ID/PW + 2차 패스키 필수 | 본인 소속 딜러사(`dealer_company_id`)에 매핑된 발주(`Order`) 및 화물만 조회 | 내 구매 내역 조회, 화물 디테일 팝업, 배송 추적 타임라인 2D 선박 추적, 프로모션 예약 |

### c) 외부 플랫폼 API 연동 확장성
외부 서비스 장애가 내부 ERP 트랜잭션으로 전파되지 않도록 느슨한 결합(Loose Coupling) 구조를 유지합니다.

* **해상 물류 연동 (TrackCargo PRO API):** `trackcargo_api.py`를 통해 B/L 등록과 항로 수집을 수행하며, 상위 `status`가 `"Active"`로 고정된 경우에도 하위 이벤트(`Discharged`, `Arrived`, `Picked Up`)를 파싱하여 도착 상태를 정확히 판별합니다.
* **인증 및 스토리지 연동 (Supabase Auth & Cloudflare R2):** FIDO2/WebAuthn 생체 인증은 `auth_supabase.py`로 검증하고, 대용량 카탈로그 PDF 및 제품 이미지는 Cloudflare R2 워커(`r2-webhook-worker`)를 통해 메인 서버 대역폭 소모 없이 제공합니다.
* **이메일 알림 연동 (SMTP / Resend):** `email_service.py`를 통해 출항 즉시, 10일 간격 운항 알림, 함부르크 입항, 프로모션 만료(D-1), 임대 만료(D-7) 알림을 자동 발송합니다.

---

## 4. Google Antigravity 전용 '코끼리-금붕어 모델(EGM)' 실전 템플릿

* **템플릿 1: 프로젝트 루트 규칙 파일** ([`.antigravityrules`](./.antigravityrules) / [`AGENTS.md`](./AGENTS.md))
* **템플릿 2: 금붕어 에이전트 전용 독립 감사 시트** ([`GOLD_REVIEW_CHECKLIST.md`](./GOLD_REVIEW_CHECKLIST.md))

---

## 5. Google Antigravity에서 템플릿을 활용하는 단계별 가이드 (How-To Guide)

Google Antigravity에서 위 템플릿을 사용하여 개발부터 실서버(`https://www.wmeins.eu`) 배포까지 진행하는 **3단계 표준 운영 절차**입니다.

### Step 1: 초기 1회 세팅 (파일 배치)
1. Antigravity 좌측 파일 탐색기에서 프로젝트 루트 폴더(`wme-system/`)에 아래 3개 파일이 위치하도록 저장합니다.
   * [`WMEINS_CONTEXT.md`](./WMEINS_CONTEXT.md) (전체 아키텍처·코드 컨텍스트 문서 - 코끼리의 기억 저장소)
   * [`.antigravityrules`](./.antigravityrules) 및 [`AGENTS.md`](./AGENTS.md) (템플릿 1 복사본 - 상시 자동 로드 규칙)
   * [`GOLD_REVIEW_CHECKLIST.md`](./GOLD_REVIEW_CHECKLIST.md) (템플릿 2 복사본 - 금붕어 감사 시트)

### Step 2: 코끼리(Elephant) 세션으로 기능 설계 및 구현
1. Antigravity 에이전트 패널(`Ctrl + L` 또는 `Cmd + L`)을 열고 `@WMEINS_CONTEXT.md`를 멘션(참조)하여 장기 기억을 주입합니다.
2. 구현할 작업 지시서를 입력합니다.
   * **프롬프트 예시:**
     > "@WMEINS_CONTEXT.md 와 .antigravityrules의 코끼리 모드 원칙에 따라, 딜러 포털 '배송 추적 타임라인' 우측에 [🚢 화물추적] 버튼을 추가하고 2D 평면 지도 팝업을 구현해 줘. 특히 생산 중(출항 전) 장비는 '출항 대기 중' 안내와 함께 부산(KRPUS)에 위치한 것으로 표시해 줘."
3. 에이전트가 관련 파일들을 수정하고 로컬 테스트를 마칠 때까지 작업을 진행합니다.

### Step 3: 금붕어(Goldfish) 세션으로 무상태 감사 후 GitHub 배포
1. 코끼리 세션에서 코딩이 완료되면, 바로 Git Commit/Push를 하지 마시고 Antigravity 에이전트 패널 상단의 **`[+]` (New Conversation / 새 대화 시작)** 버튼을 눌러 이전 대화 기억이 완전히 비워진 새 에이전트 창을 엽니다. (또는 현재 창에서 무상태 서브에이전트 `egm-goldfish-audit` 스킬을 호출합니다.)
2. 새로 열린 창에 아래 한 줄만 입력합니다.
   * **프롬프트 예시:**
     > "@GOLD_REVIEW_CHECKLIST.md 파일의 지시사항에 따라 현재 작업 공간의 git diff를 감사하고 PASS/FAIL 결과를 알려줘."
3. 판정 결과에 따른 조치:
   * **`[❌ FAIL]` 판정 시:** 금붕어 에이전트가 지적한 줄 번호와 패치 코드를 그 자리에서 바로 적용(Apply)한 뒤 다시 한 번 검사합니다.
   * **`[✅ PASS]` 판정 시:** 안심하고 GitHub에 Commit & Push를 수행합니다. 이후 Render 대시보드에서 프론트엔드 변경분이 캐시(`#16 CACHED`)되지 않도록 필요시 **Clear build cache & deploy**를 실행하면 실서버에 무결점 코드가 반영됩니다.

