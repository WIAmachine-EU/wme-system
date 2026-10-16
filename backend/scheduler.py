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
                                    
                                    recipients = "jypark@hyundai-wia.de; freelogin3975@gmail.com"
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
                        
                        to_email = "jypark@hyundai-wia.de; freelogin3975@gmail.com"
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
                        to_email = "jypark@hyundai-wia.de; freelogin3975@gmail.com"
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
            
            to_email = "jypark@hyundai-wia.de; freelogin3975@gmail.com"
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
            
            to_email = "jypark@hyundai-wia.de; freelogin3975@gmail.com"
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

