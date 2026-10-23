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
                        pod_code = shipment.pod or "DEHAM"
                        parsed = parse_trackcargo_detail_payload(payload, pod_code=pod_code, mbl_no=shipment.mbl_no)

                        # 2. 변경 감지 (Diff-Check): 좌표 개수, 최후 위경도, 침로(Course), 선박명 및 트래킹 상태 비교
                        old_points_len = len(shipment.route_coordinates or [])
                        new_points_len = len(parsed.get("route_coordinates") or [])

                        is_position_changed = (
                            shipment.last_lat != parsed.get("last_lat") or
                            shipment.last_lng != parsed.get("last_lng") or
                            old_points_len != new_points_len or
                            shipment.vessel_course_deg != parsed.get("vessel_course_deg") or
                            (parsed.get("vessel_name") and shipment.vessel_name != parsed.get("vessel_name")) or
                            shipment.trackcargo_status != parsed.get("tracking_status")
                        )

                        # 3. 실제 위치나 선박 정보가 갱신된 경우에만 DB Write 수행 (I/O 부하 방지)
                        if is_position_changed:
                            if parsed.get("vessel_name"):
                                shipment.vessel_name = parsed.get("vessel_name")
                                shipment.vessel = parsed.get("vessel_name")
                            if parsed.get("vessel_imo"):
                                shipment.vessel_imo = parsed.get("vessel_imo")
                            if parsed.get("vessel_mmsi"):
                                shipment.vessel_mmsi = parsed.get("vessel_mmsi")
                            if parsed.get("vessel_speed_kn") is not None:
                                shipment.vessel_speed_kn = parsed.get("vessel_speed_kn")
                            if parsed.get("vessel_course_deg") is not None:
                                shipment.vessel_course_deg = parsed.get("vessel_course_deg")
                            shipment.reported_distance_km = parsed.get("reported_distance_km")
                            shipment.last_lat = parsed.get("last_lat")
                            shipment.last_lng = parsed.get("last_lng")
                            if parsed.get("route_coordinates"):
                                shipment.route_coordinates = parsed.get("route_coordinates")
                            shipment.trackcargo_status = parsed.get("tracking_status")
                            shipment.route_updated_at = datetime.now(timezone.utc)
                            
                            # 연결된 주문 선박명 및 도착 완료 상태(가이드 v5.0) 자동 동기화
                            for order in shipment.orders:
                                if parsed.get("vessel_name") and order.vessel != parsed.get("vessel_name"):
                                    order.vessel = parsed.get("vessel_name")
                                if parsed.get("is_arrived"):
                                    order.current_status = models.OrderStatus.ARRIVED
                                    if not order.actual_date and shipment.eta:
                                        order.actual_date = shipment.eta

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
