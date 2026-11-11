# WMEINS (WIA Machine Europe Integrated Network System) Agent Rules
# Architecture: Elephant-Goldfish Model (EGM) Integrated Guidelines

## 1. [ELEPHANT MODE] 장기 기억 및 아키텍처 설계 원칙
기능을 설계하거나 코드를 수정할 때는 반드시 `WMEINS_CONTEXT.md`의 스키마와 아래 도메인 규칙을 준수한다.

1. **기술 스택 고정:**
   - Backend: Python FastAPI, SQLAlchemy ORM, APScheduler (`backend/`)
   - Frontend: Vite + React 18, Mapbox GL JS (`react-map-gl`), `react-i18next` (`frontend/`)
   - Database: PostgreSQL / SQLite (`models.py`의 15개 테이블 구조 엄수)
2. **물리적 하드웨어 배제 원칙:**
   - 바코드 스캐너, RFID 리더기 등 물리적 하드웨어 연동 코드를 작성하지 않는다.
   - 모든 입출고 및 재고 전환은 `OrderStatus` Enum(`CONFIRMED` -> `IN_PRODUCTION` -> `SHIPPING` -> `ARRIVED` -> `IN_STOCK` -> `DISPATCHED` -> `SOLD`), `ai_cargo_parser.py`, 그리고 TrackCargo API 이벤트를 통한 논리적 상태 전환으로 처리한다.
3. **해상 트래킹 및 지도 렌더링 규칙:**
   - 부산항 표준 코드는 `'KRPUS'` (`[129.0756, 35.1796]`), 함부르크항은 `'DEHAM'` (`[9.9937, 53.5511]`)을 기본 사용한다.
   - 출항 전(`CONFIRMED`, `IN_PRODUCTION` 또는 `etd == null`) 화물은 `'출항 대기 중'`으로 표기하고 지도상 위치를 부산항(`KRPUS`)으로 고정하며 해상 항로선(Polyline)을 그리지 않는다.
   - 도착 완료(`Discharged`, `Arrived`, `Picked Up`, `ARRIVED`, `IN_STOCK`, `DISPATCHED`, `SOLD` 또는 `eta < now`) 화물은 도착항(`POD`) 좌표로 스냅하고, 속력 `0 kts`, 잔여 거리 `0 NM`, 지연 경고(`isDelayed = false`)로 확정한다. 절대 희망봉 중간 좌표(`-34.5, 18.4`)로 폴백하지 않는다.
   - 딜러 포털의 선박 추적 팝업(`dealerPopupMode={true}`)은 무조건 **2D 평면 지도(`projection="mercator"`)**만 사용한다.
4. **인증 및 보안(RBAC) 규칙:**
   - 로그인은 투트랙(OR)이 아닌 **직렬 2단계 인증(1차 ID/PW 통과 후 2차 WebAuthn 패스키 검증 필수)** 파이프라인을 유지한다.
   - `DEALER` 역할 요청 시 반드시 본인 `dealer_company_id`에 속한 `Order`와 `CargoDetail`만 반환하도록 필터링한다.

---

## 2. [GOLDFISH MODE] 무상태(Stateless) 코드 리뷰 및 품질 관문
코드 수정을 마친 직후에는 작성자의 의도를 배제하고 오직 변경된 코드(`git diff`)만 놓고 아래 5개 항목을 자체 감사(Self-Audit)한다.

- [G-01 보안/시크릿] 코드 내에 실제 이메일, 패스워드, API Key, DB 접속 정보나 테스트용 하드코딩 계정이 남아있는가?
- [G-02 더미 데이터 오염] 운영 데이터에 테스트용 시드 좌표(예: 희망봉 `-34.5, 18.4`, `400 pts`)나 `'KRBUS'` 오타가 덮어씌워질 위험이 있는가?
- [G-03 권한 격리(RBAC)] 딜러 포털 화면(타임라인 팝업 등)에서 동일 B/L에 실린 타 딜러사의 장비 목록이 노출되지 않고, 타임라인 리스트 개수와 1:1로 일치하는가?
- [G-04 Null 안전성] 출항 전(`etd: null`, `shipment: null`, `route_coordinates: []`) 상태의 주문을 클릭했을 때 프론트엔드나 백엔드에서 `TypeError`가 발생하지 않는가?
- [G-05 DB 부하 방지] 스케줄러 수정 시 변경 감지(Diff-Check) 및 호출 지연(`asyncio.sleep`) 로직이 유지되어 있는가?

