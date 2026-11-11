---
name: egm-elephant-architect
description: >-
  Activates the Elephant Mode (Long-Term Architect) of the WMEINS Elephant-Goldfish
  Model (EGM). Use this skill when designing new ERP features, modifying database
  schemas, updating maritime tracking logic, or implementing frontend/backend
  changes in WMEINS.
---

# 🐘 WMEINS Elephant Mode (Long-Term Architect & Implementation)

This skill guides architectural design and implementation under the **Elephant-Goldfish Model (EGM)** for the WMEINS global SCM & ERP platform.

## Architectural Principles

1. **Load Long-Term Memory (`WMEINS_CONTEXT.md`)**:
   Before modifying core backend models, TrackCargo schedulers, or frontend tracking/auth components, consult [`WMEINS_CONTEXT.md`](../../../wme-system/WMEINS_CONTEXT.md) and [`.antigravityrules`](../../../wme-system/.antigravityrules).

2. **Enforce Domain Invariants**:
   - **Fixed Tech Stack**:
     - Backend: FastAPI + SQLAlchemy + APScheduler (`wme-system/backend/`)
     - Frontend: Vite + React 18 + Mapbox GL JS (`react-map-gl`) + `react-i18next` (`wme-system/frontend/`)
     - Database: 15-table ORM structure in `models.py` (Single `Order` pipeline using `is_corporate_stock` and `stock_type`).
   - **No Physical Hardware Dependencies**:
     - Never write barcode/QR scanner or RFID reader hardware integration code.
     - Use logical state transitions (`OrderStatus` Enum: `CONFIRMED` -> `IN_PRODUCTION` -> `SHIPPING` -> `ARRIVED` -> `IN_STOCK` -> `DISPATCHED` -> `SOLD`), `ai_cargo_parser.py`, and TrackCargo API milestones.
   - **Maritime Tracking & Map Rendering**:
     - Standard port codes: Busan `'KRPUS'` (`[129.0756, 35.1796]`), Hamburg `'DEHAM'` (`[9.9937, 53.5511]`).
     - Pre-departure cargo (`CONFIRMED`, `IN_PRODUCTION`, or `etd == null`): display `'출항 대기 중'`, fix marker at Busan (`KRPUS`), do not draw sea route polylines.
     - Arrived cargo (`Discharged`, `Arrived`, `Picked Up`, `ARRIVED`, `IN_STOCK`, `DISPATCHED`, `SOLD`, or `eta < now`): snap to POD coordinates, speed `0 kts`, remaining distance `0 NM`, `isDelayed = false`. Never fallback to Cape of Good Hope (`-34.5, 18.4`).
     - Dealer vessel tracking popup (`dealerPopupMode={true}`): strictly use 2D Mercator map (`projection="mercator"`).
   - **Security (RBAC & Serial 2-Step MFA)**:
     - Maintain serial 2-step authentication (1st ID/PW -> 2nd WebAuthn Passkey verification).
     - Filter `Order` and `CargoDetail` strictly by `dealer_company_id` for `DEALER` role requests.

3. **Post-Implementation Self-Audit (`[G-01]` ~ `[G-05]`)**:
   Immediately after completing code changes, inspect `git -C "wme-system" diff` against the 5 Goldfish self-audit gates (`[G-01]` through `[G-05]`) defined in `.antigravityrules`.
