import os
import jwt
from fastapi import HTTPException, Security
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from database import SessionLocal
import models

# 공식 라이브러리 사용
from supabase import create_client, Client

security = HTTPBearer()

# Render 환경변수에서 URL과 KEY를 가져옵니다.
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_ANON_KEY = os.getenv("SUPABASE_ANON_KEY")


def verify_supabase_token(token: str) -> dict:
    """
    [2단계 패스키 검증] Supabase WebAuthn/Passkey JWT를 검증하여
    {"sub": supabase_uid, "email": email} 딕셔너리를 반환합니다.
    """
    if not token or not str(token).strip():
        raise HTTPException(status_code=401, detail="패스키 인증 토큰이 비어 있습니다.")

    supa_url = os.getenv("SUPABASE_URL") or SUPABASE_URL
    supa_key = os.getenv("SUPABASE_ANON_KEY") or SUPABASE_ANON_KEY

    if supa_url and supa_key:
        try:
            supabase: Client = create_client(supa_url, supa_key)
            response = supabase.auth.get_user(token)
            if response and response.user:
                return {
                    "sub": str(response.user.id),
                    "email": (response.user.email or "").strip().lower()
                }
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Supabase 패스키 토큰 검증 실패: {str(e)}")

    # 로컬 개발 환경 등 SUPABASE_URL 환경변수 미설정 시 JWT 페이로드 파싱 폴백
    try:
        decoded = jwt.decode(token, options={"verify_signature": False})
        sub = decoded.get("sub")
        email = (decoded.get("email") or "").strip().lower()
        if not sub:
            raise HTTPException(status_code=401, detail="유효하지 않은 패스키 토큰 구조입니다.")
        return {"sub": str(sub), "email": email}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"유효하지 않은 패스키 인증 토큰입니다: {str(e)}")


def get_current_user_from_supabase(credentials: HTTPAuthorizationCredentials = Security(security)):
    token = credentials.credentials
    if not SUPABASE_URL or not SUPABASE_ANON_KEY:
        raise HTTPException(status_code=500, detail="백엔드에 Supabase 환경변수가 설정되지 않았습니다.")
        
    # Supabase 서버와 직접 통신하여 토큰의 진위 여부를 완벽하게 확인합니다.
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    
    try:
        response = supabase.auth.get_user(token)
        if not response or not response.user:
            raise HTTPException(status_code=401, detail="유효하지 않은 토큰입니다.")
            
        supabase_uid = response.user.id
        email = response.user.email
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"토큰 검증 실패: {str(e)}")
        
    db: Session = SessionLocal()
    try:
        user = db.query(models.CustomUser).filter(models.CustomUser.supabase_uid == supabase_uid).first()
        
        # [자동 연동] uid로 못 찾았다면, 이메일로 기존 ERP 사용자를 찾아서 uid를 덮어씌움
        if user is None and email:
            user = db.query(models.CustomUser).filter(models.CustomUser.email == email).first()
            if user:
                user.supabase_uid = supabase_uid
                db.commit()
                db.refresh(user)

        if user is None:
            raise HTTPException(status_code=401, detail="ERP 시스템에 등록되지 않은 이메일(계정)입니다.")
            
        return user
    finally:
        db.close()
