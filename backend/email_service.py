import logging
from typing import Optional
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# 환경 변수에서 SMTP 설정을 가져오거나 기본값 사용
# Resend 사용 시 .env 파일에 아래와 같이 설정하세요:
# SMTP_SERVER=smtp.resend.com
# SMTP_PORT=587
# SMTP_USER=resend
# SMTP_PASSWORD=re_... (Resend에서 발급받은 API Key)
# FROM_EMAIL=onboarding@resend.dev (또는 인증된 본인 도메인 이메일)

SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "freelogin3975@gmail.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "shdbwjbikvgborll")
FROM_EMAIL = os.environ.get("FROM_EMAIL", SMTP_USER)

# 기본 관리자 알림 수신 이메일 목록
DEFAULT_ADMIN_EMAILS = "jypark@hyundai-wia.de; freelogin3975@gmail.com"
ADMIN_EMAILS = os.environ.get("ADMIN_NOTIFICATION_EMAILS", DEFAULT_ADMIN_EMAILS)

def send_email_notification(to_email: str, subject: str, content: str):
    """
    SMTP 서버를 통해 실제 이메일을 발송합니다.
    계정 정보가 없으면 기존처럼 콘솔에 로그만 남깁니다.
    """
    if not to_email:
        logger.warning("[이메일 발송 건너뜀] 수신자 이메일(to_email)이 비어 있습니다.")
        return

    # 수신자가 여러 명일 수 있으므로 세미콜론(;) 기준으로 분리
    raw_recipients = [email.strip() for email in to_email.split(';') if email.strip()]
    # 더미/예시용 도메인(example.com) 및 유효하지 않은 주소 필터링 (반송 방지)
    recipients = [e for e in raw_recipients if "@example.com" not in e]

    if not recipients:
        logger.warning(f"[이메일 발송 건너뜀] 더미 도메인 또는 유효하지 않은 수신 주소입니다: {to_email}")
        return

    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("[이메일 발송 모의실행] SMTP_USER 또는 SMTP_PASSWORD가 설정되지 않았습니다.")
        logger.info(f"================ EMAIL NOTIFICATION ================")
        logger.info(f"TO:      {', '.join(recipients)}")
        logger.info(f"SUBJECT: {subject}")
        logger.info(f"CONTENT: {content}")
        logger.info(f"====================================================")
        return

    try:
        msg = MIMEMultipart()
        msg['From'] = FROM_EMAIL
        msg['To'] = ", ".join(recipients)
        msg['Subject'] = subject

        msg.attach(MIMEText(content, 'plain', 'utf-8'))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)

        server.sendmail(SMTP_USER, recipients, msg.as_string())
        server.quit()
        logger.info(f"성공적으로 이메일을 발송했습니다: {', '.join(recipients)}")
    except Exception as e:
        logger.error(f"이메일 발송 실패: {e}")

def send_etd_notification(to_email: str, order_ref: str, etd: str, initial_eta: str):
    subject = f"[SCM 알림] 발주번호 {order_ref} 장비가 출항(ETD) 하였습니다."
    content = f"장비({order_ref})가 선적되어 출항하였습니다.\nETD: {etd}\n초기 예정 ETA: {initial_eta}"
    target_email = to_email if to_email else ADMIN_EMAILS
    send_email_notification(target_email, subject, content)

def send_shipping_interval_notification(to_email: str, order_ref: str, days_since_etd: int, current_eta: str):
    subject = f"[SCM 알림] 발주번호 {order_ref} 해상 운송 중 안내 ({days_since_etd}일 경과)"
    content = f"장비({order_ref})가 해상 운송 중입니다.\n현재 예정 ETA: {current_eta}"
    target_email = to_email if to_email else ADMIN_EMAILS
    send_email_notification(target_email, subject, content)

def send_eta_update_notification(order_ref: str, vessel: Optional[str], new_eta: str, to_email: Optional[str] = None):
    subject = f"[SCM 알림] 발주번호 {order_ref} 유럽 항구 도착 예정일 업데이트 (HHLA 연동)"
    vessel_name = f"선박({vessel})" if vessel and str(vessel).strip() not in ["None", ""] else "운송 선박"
    content = f"장비({order_ref})가 적재된 {vessel_name}의 함부르크 항구(HHLA) 스케줄이 업데이트 되었습니다.\n최신 예정 ETA: {new_eta}"
    target_email = to_email if to_email else ADMIN_EMAILS
    send_email_notification(target_email, subject, content)

def send_port_arrival_notification(to_email: str, order_ref: str):
    subject = f"[SCM 알림] 발주번호 {order_ref} 유럽 항구(함부르크) 도착 통지"
    content = f"장비({order_ref})가 함부르크 항구에 도착 완료하였습니다. 하역 및 통관 절차가 진행될 예정입니다."
    target_email = to_email if to_email else ADMIN_EMAILS
    send_email_notification(target_email, subject, content)

def send_warehouse_arrival_notification(to_email: str, order_ref: str, stock_type: Optional[str]):
    subject = f"[SCM 알림] 발주번호 {order_ref} 현지 창고 입고 및 가용 재고 전환 안내"
    stype_str = stock_type if stock_type else 'AVAILABLE'
    content = f"장비({order_ref})가 유럽 현지 법인 창고에 입고 완료되었습니다.\n현재 상태: {stype_str} (가용 재고 전환)"
    target_email = to_email if to_email else ADMIN_EMAILS
    send_email_notification(target_email, subject, content)
