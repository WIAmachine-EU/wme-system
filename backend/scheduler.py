from datetime import datetime, timezone
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from email_service import send_shipping_interval_notification, send_eta_update_notification

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
                        # ETA and ETD are now managed manually by users. 
                        # TrackCargo API data goes to actual_date.
                        if order.actual_date != new_eta:
                            order.actual_date = new_eta
                            changed = True
                        if tracking_data.get("vessel") and order.vessel != tracking_data.get("vessel"):
                            order.vessel = tracking_data.get("vessel")
                            changed = True
                            
                        if changed:
                            logger.info(f"Order {order.reference_no} updated from TrackCargo Shipment {shipment.mbl_no}")
                            if new_eta:
                                send_eta_update_notification(order.reference_no, order.vessel, new_eta.strftime('%Y-%m-%d %H:%M'))
                                
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
        interval = config.interval_days if config and config.interval_days else 10
        
        shipping_orders = [o for o in active_orders if o.current_status == models.OrderStatus.SHIPPING]
        for order in shipping_orders:
            if order.etd:
                delta = now - order.etd
                days = delta.days
                
                if days > 0 and days % interval == 0:
                    current_eta = order.eta.strftime('%Y-%m-%d %H:%M') if order.eta else "미정"
                    logger.info(f"Order {order.reference_no}: Sending {days}-day interval notification.")
                    
                    to_email = "dealer@example.com"
                    if order.dealer_company_id:
                        dealers = db.query(models.CustomUser).filter(
                            models.CustomUser.dealer_company_id == order.dealer_company_id,
                            models.CustomUser.role == models.UserRole.DEALER
                        ).all()
                        if dealers:
                            to_email = "; ".join([d.email for d in dealers])
                            
                    send_shipping_interval_notification(to_email, order.reference_no, days, current_eta)

    except Exception as e:
        logger.error(f"Error in process_periodic_eta_notifications: {str(e)}")
    finally:
        db.close()

scheduler = BackgroundScheduler()

def start_scheduler():
    # 하루 3번 (06:00, 14:00, 22:00) Tracking 데이터 동기화
    scheduler.add_job(process_periodic_eta_notifications, 'cron', hour='6,14,22', minute=0, id='eta_notification_job', replace_existing=True)
    
    # 서버 재시작 시 즉시 1회 강제 동기화 실행 (확인용)
    scheduler.add_job(process_periodic_eta_notifications, 'date', run_date=datetime.utcnow(), id='immediate_sync_job', replace_existing=True)
    
    scheduler.start()
    logger.info("Scheduler started. (Cron: 06:00, 14:00, 22:00 + Immediate Sync)")

def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped.")
