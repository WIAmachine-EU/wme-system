import os
import sys
import logging
from typing import Dict, Any, Optional

# 부모 경로 backend 모듈 참조 지원
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from route_service import parse_trackcargo_detail_payload

logger = logging.getLogger("erp.route_sync")

# TrackCargo API 설정
TRACKCARGO_BASE_URL = os.environ.get("TRACKCARGO_BASE_URL", "https://api.trackcargo.co/api/v1")
TRACKCARGO_API_KEY = os.environ.get("TRACKCARGO_API_KEY", "mock_api_key_for_testing")

__all__ = [
    "TRACKCARGO_BASE_URL",
    "TRACKCARGO_API_KEY",
    "parse_trackcargo_detail_payload",
]
