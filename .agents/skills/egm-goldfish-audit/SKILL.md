---
name: egm-goldfish-audit
description: >-
  Executes the Goldfish Mode (Stateless Fresh Reviewer) code audit and Ping-Pong
  Verification Loop from the WMEINS Elephant-Goldfish Model (EGM). Use this skill
  before committing/pushing code, when the user asks for a Goldfish audit, EGM review,
  or verification against GOLD_REVIEW_CHECKLIST.md.
---

# 🐠 WMEINS Goldfish Mode (Stateless Code Audit & Ping-Pong Gate)

This skill enforces the **Goldfish (Stateless Reviewer)** quality gate of the Elephant-Goldfish Model (EGM) for the WMEINS ERP system.

## Workflow Steps

1. **Read the Audit Checklist**:
   Read [`GOLD_REVIEW_CHECKLIST.md`](../../../wme-system/GOLD_REVIEW_CHECKLIST.md) and [`.antigravityrules`](../../../wme-system/.antigravityrules).

2. **Collect `git diff`**:
   Run `git -C "wme-system" diff` (and `git -C "wme-system" diff --staged` if staged) to capture all uncommitted changes. If all changes are already committed, inspect `git -C "wme-system" show HEAD`.

3. **Stateless Subagent Audit (Zero-Context Verification)**:
   To eliminate confirmation bias from the authoring session, you may either:
   - Launch a stateless `research` subagent via `invoke_subagent` passing ONLY the `git diff` output and the contents of `GOLD_REVIEW_CHECKLIST.md` (with zero conversation history), OR
   - If already invoked in a fresh session (`[+] New Conversation`), audit the `git diff` directly without assuming authorial intent.

4. **Evaluate All Checklist Criteria**:
   - **Section 1 (Maritime Tracking & Map Integrity)**:
     - Arrived cargo snapped to POD (`0 kts`, `0 NM`, `isDelayed = false`), never Cape of Good Hope (`-34.50, 18.40`).
     - Pre-departure (`CONFIRMED`, `IN_PRODUCTION`, or `etd == null`) shows `'출항 대기 중'` at Busan (`KRPUS`, `[129.0756, 35.1796]`) with no polyline.
     - Dealer tracking popup uses 2D Mercator (`projection="mercator"`) only.
     - Dealer popup minimalism (essential fields only).
   - **Section 2 (MFA & Dealer RBAC Isolation)**:
     - Serial 2-step MFA in `Login.jsx` (1st ID/PW -> 2nd WebAuthn Passkey required before `onLogin()`).
     - Strict `dealer_company_id` filtering in dealer views and popups.
   - **Section 3 (Backend Scheduler & Deployment Safety)**:
     - Seed functions (`seed_v3_shipment_data`, etc.) do not overwrite live TrackCargo API data.
     - No hardcoded secrets, API keys, passwords, or personal emails (`[G-01]`).
     - Null safety (`[G-04]`) and scheduler `Diff-Check` + `asyncio.sleep(0.8)` (`[G-05]`).

5. **Output Format (Mandatory)**:
   Present the audit result strictly in the format defined in `GOLD_REVIEW_CHECKLIST.md`:
   1. **최종 판정:** `[✅ PASS - 배포 승인]` or `[❌ FAIL - 수정 필요]`
   2. **항목별 검사 결과 요약표:** Markdown table with columns `체크 항목 | 판정 | 근거 파일 및 라인`
   3. **즉시 적용할 패치 코드:** (Required if any item is `FAIL`)

6. **Ping-Pong Loop**:
   If `[❌ FAIL - 수정 필요]` is returned, apply the patch immediately and re-run the Goldfish audit until `[✅ PASS - 배포 승인]` is achieved.
