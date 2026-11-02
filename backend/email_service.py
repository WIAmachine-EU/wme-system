import logging
from typing import Optional, List
import os
import smtplib
import email.utils
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import httpx

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

# 1. Resend API 설정 (우선 적용)
RESEND_API_KEY = os.environ.get("RESEND_API_KEY")

# 2. SMTP 설정 (폴백 또는 일반 SMTP 사용 시)
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", 587))
SMTP_USER = os.environ.get("SMTP_USER", "freelogin3975@gmail.com")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "shdbwjbikvgborll")

# 발신자 이메일 (Resend 사용 시 기본값: WME SCM System <noreply@wmeins.eu>)
DEFAULT_FROM = "WME SCM System <noreply@wmeins.eu>" if RESEND_API_KEY else SMTP_USER
FROM_EMAIL = os.environ.get("FROM_EMAIL", DEFAULT_FROM)

# 기본 관리자 알림 수신 이메일 목록
DEFAULT_ADMIN_EMAILS = "jypark@hyundai-wia.de; freelogin3975@gmail.com"
ADMIN_EMAILS = os.environ.get("ADMIN_NOTIFICATION_EMAILS", DEFAULT_ADMIN_EMAILS)

def get_admin_emails() -> str:
    """런타임 환경변수 ADMIN_NOTIFICATION_EMAILS를 우선 조회합니다."""
    return os.environ.get("ADMIN_NOTIFICATION_EMAILS") or ADMIN_EMAILS

def send_email_via_resend_api(recipients: List[str], subject: str, content: str) -> bool:
    """
    Resend 공식 HTTP API(https://api.resend.com/emails)를 통해 이메일을 발송합니다.
    """
    api_key = os.environ.get("RESEND_API_KEY") or RESEND_API_KEY
    if not api_key:
        return False

    url = "https://api.resend.com/emails"
    headers = {
        "Authorization": f"Bearer {api_key.strip()}",
        "Content-Type": "application/json"
    }
    from_addr = os.environ.get("FROM_EMAIL") or FROM_EMAIL
    payload = {
        "from": from_addr,
        "to": recipients,
        "subject": subject,
        "text": content
    }

    try:
        with httpx.Client(timeout=10.0) as client:
            resp = client.post(url, headers=headers, json=payload)
            if resp.status_code in (200, 201):
                res_json = resp.json()
                logger.info(f"[Resend API] 이메일 발송 성공 (ID: {res_json.get('id')}): {', '.join(recipients)}")
                return True
            else:
                logger.error(f"[Resend API] 이메일 발송 실패 ({resp.status_code}): {resp.text}")
                return False
    except Exception as e:
        logger.error(f"[Resend API] 호출 중 예외 발생: {e}")
        return False

def send_email_via_smtp(recipients: List[str], subject: str, content: str) -> bool:
    """
    SMTP 서버를 통해 이메일을 발송합니다.
    """
    if not SMTP_USER or not SMTP_PASSWORD:
        logger.warning("[이메일 발송 모의실행] SMTP_USER 또는 SMTP_PASSWORD가 설정되지 않았습니다.")
        logger.info(f"================ EMAIL NOTIFICATION ================")
        logger.info(f"TO:      {', '.join(recipients)}")
        logger.info(f"SUBJECT: {subject}")
        logger.info(f"CONTENT: {content}")
        logger.info(f"====================================================")
        return False

    try:
        from_addr = os.environ.get("FROM_EMAIL") or FROM_EMAIL
        msg = MIMEMultipart()
        msg['From'] = from_addr
        msg['To'] = ", ".join(recipients)
        msg['Subject'] = subject
        msg.attach(MIMEText(content, 'plain', 'utf-8'))

        server = smtplib.SMTP(SMTP_SERVER, SMTP_PORT, timeout=15)
        server.starttls()
        server.login(SMTP_USER, SMTP_PASSWORD)

        # envelope-from: 순수 이메일 주소만 추출하여 전달
        envelope_from = email.utils.parseaddr(from_addr)[1] or SMTP_USER
        server.sendmail(envelope_from, recipients, msg.as_string())
        server.quit()
        logger.info(f"[SMTP] 성공적으로 이메일을 발송했습니다: {', '.join(recipients)}")
        return True
    except Exception as e:
        logger.error(f"[SMTP] 이메일 발송 실패: {e}")
        return False

def send_email_notification(to_email: str, subject: str, content: str):
    """
    이메일을 발송합니다. RESEND_API_KEY가 있으면 Resend API를 우선 사용하고,
    실패하거나 없을 경우 SMTP를 통해 발송합니다.
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

    # 1. Resend API 시도 (환경 변수에 RESEND_API_KEY가 등록되어 있는 경우)
    if os.environ.get("RESEND_API_KEY") or RESEND_API_KEY:
        if send_email_via_resend_api(recipients, subject, content):
            return
        logger.warning("[Resend API 발송 실패] SMTP 폴백 방식으로 전환하여 재시도합니다.")

    # 2. SMTP 방식 시도
    send_email_via_smtp(recipients, subject, content)

def send_etd_notification(to_email: str, order_ref: str, etd: str, initial_eta: str):
    subject = f"[SCM 알림] 발주번호 {order_ref} 장비가 출항(ETD) 하였습니다."
    content = f"장비({order_ref})가 선적되어 출항하였습니다.\nETD: {etd}\n초기 예정 ETA: {initial_eta}"
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)

def send_shipping_interval_notification(to_email: str, order_ref: str, days_since_etd: int, current_eta: str):
    subject = f"[SCM 알림] 발주번호 {order_ref} 해상 운송 중 안내 ({days_since_etd}일 경과)"
    content = f"장비({order_ref})가 해상 운송 중입니다.\n현재 예정 ETA: {current_eta}"
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)

def send_eta_update_notification(order_ref: str, vessel: Optional[str], new_eta: str, to_email: Optional[str] = None):
    subject = f"[SCM 알림] 발주번호 {order_ref} 유럽 항구 도착 예정일 업데이트 (HHLA 연동)"
    vessel_name = f"선박({vessel})" if vessel and str(vessel).strip() not in ["None", ""] else "운송 선박"
    content = f"장비({order_ref})가 적재된 {vessel_name}의 함부르크 항구(HHLA) 스케줄이 업데이트 되었습니다.\n최신 예정 ETA: {new_eta}"
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)

def send_port_arrival_notification(to_email: str, order_ref: str):
    subject = f"[SCM 알림] 발주번호 {order_ref} 유럽 항구(함부르크) 도착 통지"
    content = f"장비({order_ref})가 함부르크 항구에 도착 완료하였습니다. 하역 및 통관 절차가 진행될 예정입니다."
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)

def send_warehouse_arrival_notification(to_email: str, order_ref: str, stock_type: Optional[str]):
    subject = f"[SCM 알림] 발주번호 {order_ref} 현지 창고 입고 및 가용 재고 전환 안내"
    stype_str = stock_type if stock_type else 'AVAILABLE'
    content = f"장비({order_ref})가 유럽 현지 법인 창고에 입고 완료되었습니다.\n현재 상태: {stype_str} (가용 재고 전환)"
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)

def send_delivery_due_alert(to_email: str, order_ref: str, delivery_req_date: str, current_status: str, model_name: str):
    subject = f"[SCM 알림] 발주 {order_ref} 배송요청일({delivery_req_date}) 당월 마지막 주차 진입 지연 방지 안내"
    content = (
        f"발주번호: {order_ref}\n"
        f"장비 모델: {model_name}\n"
        f"배송요청일: {delivery_req_date}\n"
        f"현재 진행상태: {current_status}\n\n"
        f"해당 발주 건이 배송요청일 해당 월의 마지막 주차에 진입하였습니다.\n"
        f"납기 지연을 사전에 방지하고 차질 없는 현지 인도를 위해 물류, 선적 및 통관 일정을 점검해 주시기 바랍니다."
    )
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)

def send_promotion_expiry_alert(to_email: str, order_ref: str, model_name: str, dealer_name: str, expiry_date_str: str):
    subject = f"[SCM 프로모션 알림] 발주 {order_ref} 프로모션 예약 만료 1일 전(D-1) 안내"
    content = (
        f"프로모션 발주번호: {order_ref}\n"
        f"장비 모델: {model_name}\n"
        f"예약 딜러사: {dealer_name}\n"
        f"예약 만료 일시: {expiry_date_str}\n\n"
        f"해당 프로모션 장비의 예약 만료일이 1일 앞으로 도래하였습니다.\n"
        f"만료 시점까지 정식 구매 확정(Order) 조치가 진행되지 않을 경우,\n"
        f"타 딜러사가 즉시 예약 가능한 '판매가능(AVAILABLE)' 상태로 자동 취소(Roll-back) 처리될 예정입니다."
    )
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)

def send_rental_expiry_alert(to_email: str, order_ref: str, model_name: str, serial_no: str, dealer_name: str, expiry_date_str: str):
    subject = f"[SCM 알림] 발주 {order_ref} 임대(Rental) 만료 7일 전 사전 공지 (연장/반납 안내)"
    content = (
        f"임대 발주번호: {order_ref}\n"
        f"장비 모델: {model_name} (S/N: {serial_no or '-'})\n"
        f"임대 딜러사: {dealer_name}\n"
        f"임대 만료 예정일: {expiry_date_str}\n\n"
        f"해당 장비의 임대(Rental) 계약 만료일이 7일 전(D-7)으로 다가왔습니다.\n"
        f"임대 계약의 연장 여부 또는 기기 반납/회수 절차를 사전에 확인하여 진행해 주시기 바랍니다."
    )
    target_email = to_email if to_email else get_admin_emails()
    send_email_notification(target_email, subject, content)
