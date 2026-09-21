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
    payload = {
        "mbl_no": mbl_no
    }
    
    logger.info(f"[TrackCargo API] Requesting create tracking for MBL: {mbl_no}")
    
    # Mocking the actual API call for safety and testability
    if TRACKCARGO_API_KEY == "mock_api_key_for_testing":
        logger.info("[TrackCargo API] Using Mock API for create_sea_tracking")
        return f"ord_mock_{mbl_no}"
        
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
    
    # Mocking the actual API call for safety and testability
    if TRACKCARGO_API_KEY == "mock_api_key_for_testing":
        logger.info("[TrackCargo API] Using Mock API for fetch_tracking_data")
        # Generate some mock dates based on current time
        now = datetime.utcnow()
        # Mocking an arrival in 30 days
        return {
            "trackcargo_status": "Active",
            "vessel": "MOCK VESSEL",
            "voyage": "MOCK_VOY",
            "pol": "KRBUS",
            "pod": "DEHAM",
            "etd": now,
            "eta": datetime.fromtimestamp(now.timestamp() + 30*24*3600),
            "error": None
        }
        
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
                if data.get("estimatedDeparture"):
                    try:
                        etd = datetime.fromisoformat(data.get("estimatedDeparture").replace('Z', '+00:00'))
                    except ValueError:
                        pass
                        
                if data.get("estimatedArrival"):
                    try:
                        eta = datetime.fromisoformat(data.get("estimatedArrival").replace('Z', '+00:00'))
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
