import os
from typing import Optional
from fastapi import Request, HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from database import SessionLocal
import models

security = HTTPBearer()

# Supabase JWT Secret should be set in Render environment variables
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "your-supabase-jwt-secret")
# Supabase uses HS256 for their JWTs
ALGORITHM = "HS256"

def get_current_user_from_supabase(credentials: HTTPAuthorizationCredentials = Security(security)):
    """
    Supabase가 발급한 JWT를 검증(Verify)하고, DB에서 매핑된 사용자(User)를 반환합니다.
    """
    token = credentials.credentials
    try:
        # 1. JWT 서명 및 유효성 검증 (Secret Key 사용)
        payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=[ALGORITHM], audience="authenticated")
        
        # 2. JWT에서 사용자 식별자(UUID) 추출
        supabase_uid = payload.get("sub")
        if supabase_uid is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials (no sub in token)")
            
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"Could not validate credentials: {str(e)}")
        
    # 3. Render DB에서 supabase_uid 로 사용자 조회
    db: Session = SessionLocal()
    try:
        user = db.query(models.CustomUser).filter(models.CustomUser.supabase_uid == supabase_uid).first()
        if user is None:
            # Phase 2 (마이그레이션) 중이거나, 연동이 안 된 계정인 경우
            raise HTTPException(status_code=401, detail="User not found in Render Database (Not linked)")
        return user
    finally:
        db.close()
