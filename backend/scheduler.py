from datetime import datetime, timezone
import logging
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from database import SessionLocal
import models
from email_service import send_shipping_interval_notification, send_eta_update_notification
from hhla_api import fetch_hhla_eta_sync

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
        from trackcargo_api import fetch_tracking_data_sync
        
        # Sync TrackCargo Shipments
        active_shipments = db.query(models.Shipment).filter(
            models.Shipment.trackcargo_order_id.isnot(None),
            models.Shipment.trackcargo_status != "Completed" # Assuming Completed is a status
        ).all()
        
        for shipment in active_shipments:
            try:
                tracking_data = fetch_tracking_data_sync(shipment.trackcargo_order_id)
                if tracking_data and not tracking_data.get("error"):
                    shipment.trackcargo_status = tracking_data.get("trackcargo_status")
                    shipment.trackcargo_last_sync = datetime.utcnow()
                    
                    if tracking_data.get("vessel"):
                        shipment.vessel = tracking_data.get("vessel")
                    if tracking_data.get("voyage"):
                        shipment.voyage = tracking_data.get("voyage")
                        
                    # Sync to orders
                    new_eta = tracking_data.get("eta")
                    new_etd = tracking_data.get("etd")
                    
                    for order in shipment.orders:
                        changed = False
                        if new_eta and order.eta != new_eta:
                            order.eta = new_eta
                            changed = True
                        if new_etd and order.etd != new_etd:
                            order.etd = new_etd
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

        # Sync HHLA ETA for orders that are SHIPPING (Fallback/legacy for those not in TrackCargo)
        active_orders = db.query(models.Order).filter(
            models.Order.current_status == models.OrderStatus.SHIPPING
        ).all()
        
        now = datetime.utcnow()
        
        # 1. Sync ETA from HHLA
        for order in active_orders:
            if order.vessel:
                # fetch from hhla
                hhla_data = fetch_hhla_eta_sync(order.vessel)
                if hhla_data:
                    new_eta = hhla_data.get("eta")
                    new_actual = hhla_data.get("actual_date")
                    
                    changed = False
                    # check if eta changed
                    if new_eta and (not order.eta or order.eta.date() != new_eta.date() or order.eta.time() != new_eta.time()):
                        logger.info(f"Order {order.reference_no}: ETA updated from {order.eta} to {new_eta} via HHLA API")
                        order.eta = new_eta
                        changed = True
                        
                    # check if actual_date changed
                    if new_actual and (not order.actual_date or order.actual_date.date() != new_actual.date() or order.actual_date.time() != new_actual.time()):
                        logger.info(f"Order {order.reference_no}: Actual Date updated from {order.actual_date} to {new_actual} via HHLA API")
                        order.actual_date = new_actual
                        changed = True
                        
                    if changed:
                        db.commit()
                        if new_eta:
                            send_eta_update_notification(order.reference_no, order.vessel, new_eta.strftime('%Y-%m-%d %H:%M'))
                    
        # 2. Check for interval since ETD from config
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
    # For demonstration/testing, we'll run it every 5 minutes instead of daily
    # In production: scheduler.add_job(process_periodic_eta_notifications, 'cron', hour=0, minute=0)
    scheduler.add_job(process_periodic_eta_notifications, 'interval', minutes=5, id='eta_notification_job', replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started.")

def stop_scheduler():
    scheduler.shutdown()
    logger.info("Scheduler stopped.")
