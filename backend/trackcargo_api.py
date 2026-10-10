import os
import logging
import httpx
from datetime import datetime
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# Load API key from environment variables (Mocking for now as requested)
TRACKCARGO_API_KEY = os.environ.get("TRACKCARGO_API_KEY", "mock_api_key_for_testing")
BASE_URL = "https://api.trackcargo.co/api/v1"

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
    import re
    scac_match = re.match(r'^[A-Za-z]{4}', mbl_no)
    scac_code = scac_match.group(0).upper() if scac_match else ""

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
                return data.get("orderId")
            else:
                logger.error(f"[TrackCargo API] Create tracking failed: {response.status_code} - {response.text}")
                return None
    except Exception as e:
        logger.error(f"[TrackCargo API] Exception in create_sea_tracking: {str(e)}")
        return None

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
                
                # Parse the response data according to the design plan
                # ETD = POL Estimated Departure
                # ETA = Final POD Estimated Arrival
                # This is a simplified extraction
                
                etd = None
                eta = None
                etd_raw = data.get("estimatedDeparture") or data.get("etd") or data.get("polDeparture")
                eta_raw = data.get("estimatedArrival") or data.get("eta") or data.get("finalPortArrival") or data.get("podArrival")
                
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
                
                return {
                    "trackcargo_status": data.get("status", "Active"),
                    "vessel": data.get("vessel", ""),
                    "voyage": data.get("voyage", ""),
                    "pol": data.get("pol", ""),
                    "pod": data.get("pod", ""),
                    "etd": etd,
                    "eta": eta,
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
