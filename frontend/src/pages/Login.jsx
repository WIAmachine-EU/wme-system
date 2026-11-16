// frontend/src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, KeyRound, ShieldCheck, RotateCcw, Smartphone, Hash } from 'lucide-react';
import WiaLogo from '../components/WiaLogo';
import { addAuditLog } from '../utils/auditLogger';

// Base64URL <-> Uint8Array 동기 변환 유틸리티 (비동기 대기 0ms 보장 -> 모바일 iOS WebKit 터치 제스처 보존)
function base64UrlToUint8Array(base64UrlStr) {
  const padding = '='.repeat((4 - (base64UrlStr.length % 4)) % 4);
  const base64 = (base64UrlStr + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function translateError(msg) {
  if (!msg) return '';
  const s = String(msg);
  if (s.includes('이메일 또는 비밀번호가 올바르지 않습니다')) return 'Invalid email address or password.';
  if (s.includes('비활성화된 계정')) return 'Your account has been deactivated. Please contact the administrator.';
  if (s.includes('초대 대기 중')) return 'Account invitation pending. Please set your password using the invitation link sent to your email.';
  if (s.includes('서버와 통신할 수 없습니다')) return 'Unable to connect to the server. Please check your network.';
  if (s.includes('보안 챌린지 정보가 만료')) return 'Security challenge expired. Please restart login from Step 1.';
  if (s.includes('패스키 인증 응답을 받지 못했습니다')) return 'No passkey response received.';
  if (s.includes('2단계 패스키 검증에 실패') || s.includes('2단계 패스키 인증 실패')) return 'Step 2 passkey verification failed.';
  if (s.includes('2차 숫자 패스키는 4~8자리')) return 'PIN passkey must be 4 to 8 digits.';
  if (s.includes('입력하신 두 숫자 패스키가 일치하지 않습니다')) return 'The two PIN passkeys do not match.';
  if (s.includes('입력하신 2차 숫자 패스키(PIN)가 올바르지 않습니다')) return 'Invalid PIN passkey.';
  if (s.includes('2차 숫자 패스키 검증에 실패했습니다')) return 'Invalid PIN passkey.';
  if (s.includes('비밀번호는 최소 8자 이상')) return 'Password must be at least 8 characters long.';
  if (s.includes('입력하신 두 비밀번호가 일치하지 않습니다')) return 'The two passwords do not match.';
  if (s.includes('초기 비밀번호 설정에 실패했습니다')) return 'Failed to set initial password.';
  if (s.includes('요청 처리 중 오류가 발생했습니다')) return 'An error occurred while processing your request.';
  if (s.includes('유효하지 않은 재설정 링크')) return 'Invalid password reset link.';
  if (s.includes('계정을 찾을 수 없습니다')) return 'Account not found.';
  if (s.includes('재설정 링크 유효시간') || s.includes('만료되었습니다')) return 'Password reset link has expired (15-minute limit).';
  if (s.includes('이미 사용되었거나 만료된')) return 'This reset link has already been used or has expired.';
  if (s.includes('비밀번호 재설정 실패')) return 'Password reset failed.';
  if (s.includes('1단계 인증 유효시간') || s.includes('처음부터 다시')) return 'Step 1 verification expired. Please log in again from Step 1.';
  if (s.includes('유효하지 않은 1단계 인증 토큰')) return 'Invalid Step 1 authentication token.';
  if (s.includes('패스키 보안 챌린지가 일치하지 않거나')) return 'Passkey challenge mismatch or expired. Please try again.';
  return s;
}

function translateInfo(msg) {
  if (!msg) return '';
  const s = String(msg);
  if (s.includes('등록된 이메일인 경우 비밀번호 재설정 링크가 발송되었습니다') || s.includes('비밀번호 재설정 링크가 발송되었습니다')) {
    return 'If this email is registered, a password reset link has been sent. (Valid for 15 minutes)';
  }
  if (s.includes('비밀번호가 재설정되었습니다')) {
    return 'Your password has been successfully reset. Please sign in with your email and new password.';
  }
  return s;
}

export default function Login({ onLogin }) {
  // 'STEP1_EMAIL_PW' | 'STEP2_PASSKEY' | 'ACCEPT_INVITE' | 'FORGOT_PW' | 'RESET_PW'
  const [authStep, setAuthStep] = useState('STEP1_EMAIL_PW');

  // 2단계 인증 방식 탭: 'WEBAUTHN' (생체/기기 패스키: Face ID·지문·Windows Hello) | 'PIN' (브라우저 무관 숫자 패스키)
  const [step2Mode, setStep2Mode] = useState('WEBAUTHN');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preAuthToken, setPreAuthToken] = useState(null);
  const [authUserId, setAuthUserId] = useState('');
  const [webauthnChallenge, setWebauthnChallenge] = useState('');
  const [hasPasskey, setHasPasskey] = useState(true);
  const [hasPinPasskey, setHasPinPasskey] = useState(false);
  const [hasLocalDevicePasskey, setHasLocalDevicePasskey] = useState(false);

  // 숫자 패스키(PIN) 입력 상태 (구글앱 인앱 브라우저·크롬·엣지·PC 전 환경 호환)
  const [passkeyPin, setPasskeyPin] = useState('');
  const [passkeyPinConfirm, setPasskeyPinConfirm] = useState('');

  // 초대 링크(초기 비밀번호 설정) 및 비밀번호 찾기 / 재설정 상태
  const [inviteToken, setInviteToken] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // URL 파라미터에서 ?invite_token=... 또는 ?reset_token=... 자동 감지
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const invToken = params.get('invite_token');
    const rstToken = params.get('reset_token');

    if (invToken) {
      setInviteToken(invToken);
      setAuthStep('ACCEPT_INVITE');
      try {
        const base64Url = invToken.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const decoded = JSON.parse(atob(base64));
        if (decoded.email) setInviteEmail(decoded.email);
      } catch (e) {
        // 디코딩 실패 시 무시
      }
    } else if (rstToken) {
      setResetToken(rstToken);
      setAuthStep('RESET_PW');
    }
  }, []);

  // 1단계 응답 데이터로 2단계 패스키 상태 초기화
  const applyStep1AuthData = (data) => {
    const cleanMail = (data.email || email).trim().toLowerCase();
    const localCredId = localStorage.getItem(`wme_passkey_cred_${cleanMail}`);
    const serverCreds = Array.isArray(data.registered_credential_ids) ? data.registered_credential_ids : [];
    const isLocalRegistered = Boolean(localCredId && (serverCreds.length === 0 || serverCreds.includes(localCredId)));

    setPreAuthToken(data.pre_auth_token);
    setAuthUserId(String(data.user_id || '1'));
    setWebauthnChallenge(data.webauthn_challenge || '');
    setHasPasskey(Boolean(data.has_passkey));
    setHasPinPasskey(Boolean(data.has_pin_passkey));
    setHasLocalDevicePasskey(isLocalRegistered);
    setPasskeyPin('');
    setPasskeyPinConfirm('');
    setStep2Mode('WEBAUTHN');
    setAuthStep('STEP2_PASSKEY');
  };

  // [1단계] 이메일 아이디 + 비밀번호 검증 요청
  const handleStep1EmailLogin = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    setLoading(true);

    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password: password.trim()
        })
      });

      const data = await res.json();
      if (!res.ok) {
        addAuditLog('Step1 Login Failed', email || 'unknown', 'Failed');
        setError(translateError(data.detail) || 'Invalid email address or password.');
        return;
      }

      // 1단계 성공: 사전 발급된 WebAuthn 챌린지 및 pre_auth_token 저장 후 2단계 화면으로 전환
      applyStep1AuthData(data);
      addAuditLog('Step1 Email/PW Verified (AAL1)', data.email, 'Success');
    } catch (err) {
      setError('Unable to connect to the server. Please check your network.');
    } finally {
      setLoading(false);
    }
  };

  // [2단계 - 방식 A] 표준 WebAuthn 생체/기기 패스키(Face ID·지문·기기 암호·Windows Hello) 즉시 호출
  // 모바일(iOS WebKit) 터치 제스처 만료를 원천 방지하기 위해 클릭 이벤트 첫 줄에서 비동기 대기(await) 없이 즉시 navigator.credentials 호출
  const handleStep2WebAuthnVerify = async (forceCreate = false) => {
    setError('');
    setInfoMessage('');

    if (
      typeof window === 'undefined' ||
      !window.PublicKeyCredential ||
      !navigator.credentials ||
      typeof navigator.credentials.create !== 'function'
    ) {
      setStep2Mode('PIN');
      setInfoMessage('Device biometric authentication is not supported in this browser. Please use [PIN Passkey] mode to sign in.');
      return;
    }

    if (!webauthnChallenge) {
      setError('Security challenge expired. Please restart login from Step 1.');
      return;
    }

    try {
      const cleanEmail = email.trim().toLowerCase();
      const localCredKey = `wme_passkey_cred_${cleanEmail}`;
      const localCredId = localStorage.getItem(localCredKey);
      const rpId = window.location.hostname;
      const challengeBytes = base64UrlToUint8Array(webauthnChallenge);

      // 현재 브라우저/기기에 이미 등록된 패스키가 있고 신규 등록 요청이 아니면 get(),
      // 모바일 등 새로운 기기/브라우저에서 처음 접속한 경우에는 create()로 현재 기기 패스키를 즉시 등록 및 인증
      const useGetCeremony = !forceCreate && Boolean(localCredId);

      let credentialPromise;
      if (useGetCeremony) {
        const allowList = [
          {
            id: base64UrlToUint8Array(localCredId),
            type: 'public-key',
            transports: ['internal', 'hybrid']
          }
        ];
        // [핵심] 버튼 터치 직후 네트워크 대기(0ms) 없이 동기 콜스택에서 즉시 실행
        credentialPromise = navigator.credentials.get({
          publicKey: {
            challenge: challengeBytes,
            rpId,
            allowCredentials: allowList,
            userVerification: 'preferred',
            timeout: 60000
          }
        });
      } else {
        const userIdBytes = new TextEncoder().encode(`${cleanEmail}:${authUserId || '1'}`);
        // [핵심] 버튼 터치 직후 네트워크 대기(0ms) 없이 동기 콜스택에서 즉시 실행
        credentialPromise = navigator.credentials.create({
          publicKey: {
            challenge: challengeBytes,
            rp: {
              name: 'WMEINS ERP',
              id: rpId
            },
            user: {
              id: userIdBytes,
              name: cleanEmail,
              displayName: cleanEmail.split('@')[0]
            },
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 },   // ES256 (iOS / Android / Windows 표준)
              { type: 'public-key', alg: -257 }  // RS256 (호환용)
            ],
            authenticatorSelection: {
              userVerification: 'preferred',
              residentKey: 'preferred',
              requireResidentKey: false
            },
            timeout: 60000,
            attestation: 'none'
          }
        });
      }

      setLoading(true);
      const credential = await credentialPromise;
      if (!credential) {
        throw new Error('No passkey response received.');
      }

      const credIdB64 = credential.id || bufferToBase64Url(credential.rawId);
      const clientDataB64 = bufferToBase64Url(credential.response.clientDataJSON);

      // 백엔드에 1단계 pre_auth_token과 2단계 WebAuthn 결과를 함께 제출하여 교차 검증
      const res = await fetch('/api/v1/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_auth_token: preAuthToken,
          webauthn_credential: {
            id: credIdB64,
            rawId: bufferToBase64Url(credential.rawId),
            type: credential.type || 'public-key',
            mode: useGetCeremony ? 'get' : 'create',
            clientDataJSON: clientDataB64
          }
        })
      });

      const finalData = await res.json();
      if (!res.ok) {
        throw new Error(translateError(finalData.detail) || 'Step 2 passkey verification failed.');
      }

      // 현재 브라우저/기기에 등록된 패스키 Credential ID를 저장하여 다음 로그인 시 즉시 인식
      localStorage.setItem(localCredKey, credIdB64);
      localStorage.setItem('wme_access_token', finalData.access_token);
      addAuditLog('Step2 Passkey Verified (AAL2)', finalData.email, 'Success');

      onLogin(
        finalData.role,
        finalData.username || finalData.email,
        finalData.needs_profile_setup,
        finalData.email
      );
    } catch (err) {
      const errMsg = String(err?.message || err || '');
      const errName = String(err?.name || '');

      // 구글앱 인앱 브라우저(WKWebView) 등에서 OS 생체인증 권한이 차단(NotAllowedError)된 경우 숫자 패스키 모드로 자동 전환
      if (
        errName === 'NotAllowedError' ||
        errName === 'SecurityError' ||
        errName === 'NotSupportedError' ||
        errMsg.includes('not allowed by the user agent') ||
        errMsg.includes('denied permission')
      ) {
        const cleanEmail = email.trim().toLowerCase();
        // 만약 로컬에 저장된 이전 기기 패스키 ID가 현재 기기와 맞지 않아 발생한 경우 로컬 캐시 정리
        localStorage.removeItem(`wme_passkey_cred_${cleanEmail}`);
        setHasLocalDevicePasskey(false);
        setStep2Mode('PIN');
        setError('');
        setInfoMessage(
          'Device biometric authentication is restricted in this mobile browser (e.g. Google app). Switched to [PIN Passkey] mode. You can sign in immediately using your 4-8 digit PIN.'
        );
      } else {
        setError(translateError(errMsg) || `Step 2 passkey verification failed: ${errMsg}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // [2단계 - 방식 B] 브라우저 종류(구글앱·크롬·엣지·사파리·PC)와 무관하게 작동하는 2차 숫자 패스키(PIN) 검증
  const handleStep2PinVerify = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setInfoMessage('');

    const cleanPin = passkeyPin.trim();
    if (!/^\d{4,8}$/.test(cleanPin)) {
      setError('PIN passkey must be 4 to 8 digits.');
      return;
    }

    if (!hasPinPasskey && cleanPin !== passkeyPinConfirm.trim()) {
      setError('The two PIN passkeys do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_auth_token: preAuthToken,
          passkey_pin: cleanPin
        })
      });

      const finalData = await res.json();
      if (!res.ok) {
        throw new Error(translateError(finalData.detail) || 'Invalid PIN passkey.');
      }

      localStorage.setItem('wme_access_token', finalData.access_token);
      addAuditLog('Step2 Numeric Passkey Verified (AAL2)', finalData.email, 'Success');

      onLogin(
        finalData.role,
        finalData.username || finalData.email,
        finalData.needs_profile_setup,
        finalData.email
      );
    } catch (err) {
      setError(translateError(err.message) || `Step 2 PIN verification failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // [초대 수락] 초대 링크 클릭 후 초기 비밀번호 저장 핸들러 (저장 즉시 2단계 패스키 등록으로 직행)
  const handleAcceptInvite = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/accept-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invite_token: inviteToken,
          new_password: newPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(translateError(data.detail) || 'Failed to set initial password.');

      window.history.replaceState({}, document.title, '/login');
      setEmail(data.email);
      setPassword(newPassword);
      setInfoMessage(translateInfo(data.message));
      applyStep1AuthData(data);
      addAuditLog('Invite Accepted & Initial Password Set (AAL1)', data.email, 'Success');
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  };

  // [비밀번호 분실] 재설정 링크 이메일 요청
  const handleForgotPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfoMessage('');
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() })
      });
      const data = await res.json();
      setInfoMessage(translateInfo(data.message) || 'If this email is registered, a password reset link has been sent. (Valid for 15 minutes)');
    } catch (err) {
      setError('An error occurred while processing your request.');
    } finally {
      setLoading(false);
    }
  };

  // [비밀번호 재설정] 이메일 링크 클릭 후 새 비밀번호 저장
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long.');
      return;
    }
    if (confirmPassword && newPassword !== confirmPassword) {
      setError('The two passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(translateError(data.detail) || 'Failed to reset password.');

      setInfoMessage(translateInfo(data.message) || 'Your password has been successfully reset. Please sign in with your email and new password.');
      window.history.replaceState({}, document.title, '/login');
      setAuthStep('STEP1_EMAIL_PW');
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(translateError(err.message));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: 'var(--bg-primary)' }}>
      {/* Left Area - Serial 2-Step Auth & Password Recovery Form */}
      <div style={{
        flex: '1', display: 'flex', flexDirection: 'column', justifyContent: 'center',
        alignItems: 'center', padding: '40px', backgroundColor: 'var(--bg-primary)',
        boxShadow: '15px 0 30px rgba(0, 0, 0, 0.08)', zIndex: 10
      }}>
        <div style={{ width: '100%', maxWidth: '420px' }}>
          <div style={{ marginBottom: '24px', textAlign: 'center' }}>
            <WiaLogo size="large" />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: '16px', gap: '20px' }}>
              <h1 style={{ fontSize: '1.15rem', color: 'var(--text-primary)', margin: 0, fontWeight: '400', textAlign: 'center', wordBreak: 'keep-all' }}>
                Europe Integrated Network System
              </h1>
              <img src="/A-machine.ico" alt="Machine" style={{ width: '64px', height: '64px', objectFit: 'contain' }} />
            </div>
          </div>

          {error && (
            <div style={{ padding: '12px', marginBottom: '12px', borderRadius: '8px', backgroundColor: 'rgba(230,0,18,0.1)', color: 'var(--wia-red)', fontSize: '0.88rem', textAlign: 'center', lineHeight: 1.45 }}>
              {error}
            </div>
          )}
          {infoMessage && (
            <div style={{ padding: '12px', marginBottom: '12px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#047857', fontSize: '0.86rem', textAlign: 'center', lineHeight: 1.45 }}>
              {infoMessage}
            </div>
          )}

          {/* STEP 1: 이메일 아이디 + 비밀번호 입력 화면 */}
          {authStep === 'STEP1_EMAIL_PW' && (
            <form onSubmit={handleStep1EmailLogin} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', fontSize: '0.82rem', fontWeight: 700, color: 'var(--wia-blue)', marginBottom: '4px' }}>
                STEP 1 / 2 · Email Account Authentication
              </div>

              <div style={{ position: 'relative', width: '75%', margin: '0 auto' }}>
                <Mail size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="email"
                  placeholder="Email Address (ID)"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '0.95rem', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                  required
                />
              </div>

              <div style={{ position: 'relative', width: '75%', margin: '0 auto' }}>
                <Lock size={18} style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  style={{ width: '100%', padding: '12px 16px 12px 42px', borderRadius: '12px', border: '1px solid var(--border-color)', fontSize: '0.95rem', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                  required
                />
              </div>

              <button type="submit" disabled={loading} className="sign-in-btn" style={{
                width: '75%', padding: '12px 16px', borderRadius: '12px', border: 'none', color: 'white',
                fontSize: '1rem', fontWeight: '700', cursor: 'pointer', display: 'flex',
                justifyContent: 'center', alignItems: 'center', gap: '8px', margin: '12px auto 0', transition: 'background-color 0.2s'
              }}>
                {loading ? 'Verifying...' : <>Next (Step 2 Passkey Verification) <ArrowRight size={18} /></>}
              </button>

              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <span
                  onClick={() => { setError(''); setInfoMessage(''); setAuthStep('FORGOT_PW'); }}
                  style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Forgot your password?
                </span>
              </div>
            </form>
          )}

          {/* STEP 2: 패스키 2차 필수 검증 화면 (생체/기기 패스키 + 전 브라우저 호환 숫자 패스키 통합 지원) */}
          {authStep === 'STEP2_PASSKEY' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '18px 16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <ShieldCheck size={36} color="var(--wia-blue)" />
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--wia-blue)' }}>
                  STEP 2 / 2 · Passkey 2nd Factor Authentication
                </div>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-primary)', margin: '6px 0 0', lineHeight: 1.45 }}>
                  Password verified for <strong>{email}</strong>.
                </p>
              </div>

              {/* 2차 인증 수단 전환 탭: 기기 생체/패스키 vs 모든 브라우저(구글앱·크롬·엣지·PC) 공용 숫자 패스키 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', width: '100%',
                boxSizing: 'border-box', padding: '4px', borderRadius: '10px',
                backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
              }}>
                <button
                  type="button"
                  onClick={() => { setError(''); setStep2Mode('WEBAUTHN'); }}
                  style={{
                    padding: '9px 4px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    whiteSpace: 'nowrap',
                    backgroundColor: step2Mode === 'WEBAUTHN' ? 'var(--wia-blue)' : 'transparent',
                    color: step2Mode === 'WEBAUTHN' ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s'
                  }}
                >
                  <Smartphone size={14} style={{ flexShrink: 0 }} />
                  <span>Biometric / Device Passkey</span>
                </button>
                <button
                  type="button"
                  onClick={() => { setError(''); setStep2Mode('PIN'); }}
                  style={{
                    padding: '9px 4px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px',
                    whiteSpace: 'nowrap',
                    backgroundColor: step2Mode === 'PIN' ? 'var(--wia-blue)' : 'transparent',
                    color: step2Mode === 'PIN' ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s'
                  }}
                >
                  <Hash size={14} style={{ flexShrink: 0 }} />
                  <span>PIN Passkey</span>
                </button>
              </div>

              {/* 탭 1: 기기 생체/패스키 (Face ID / 지문 / Windows Hello PIN) */}
              {step2Mode === 'WEBAUTHN' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.45, padding: '0 8px' }}>
                    {hasLocalDevicePasskey
                      ? 'Please complete 2-factor authentication with the passkey registered on this device (Face ID, Fingerprint, or Windows Hello).'
                      : 'Sign in by authenticating with your device biometric (Face ID / Fingerprint) or device passkey.'}
                  </p>

                  <button
                    type="button"
                    onClick={() => handleStep2WebAuthnVerify(false)}
                    disabled={loading}
                    className="sign-in-btn"
                    style={{
                      width: '90%', padding: '12px 16px', borderRadius: '12px', border: 'none',
                      color: 'white', fontSize: '0.96rem', fontWeight: '700', cursor: 'pointer',
                      display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s'
                    }}
                  >
                    <KeyRound size={18} />
                    {loading
                      ? 'Verifying Passkey...'
                      : (hasLocalDevicePasskey ? 'Verify with Device Passkey' : 'Verify Device Passkey & Sign In')}
                  </button>

                  {hasLocalDevicePasskey && (
                    <button
                      type="button"
                      onClick={() => handleStep2WebAuthnVerify(true)}
                      disabled={loading}
                      style={{
                        background: 'none', border: 'none', color: 'var(--wia-blue)',
                        fontSize: '0.8rem', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline'
                      }}
                    >
                      Link a new passkey on this browser/device
                    </button>
                  )}

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2px' }}>
                    Using an in-app browser (e.g. Google app)? Use{' '}
                    <span
                      onClick={() => { setError(''); setStep2Mode('PIN'); }}
                      style={{ color: 'var(--wia-blue)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      [PIN Passkey]
                    </span>
                    {' '}above for instant compatibility across all browsers.
                  </div>
                </div>
              )}

              {/* 탭 2: 전 브라우저(구글앱·크롬·엣지·사파리·PC) 공용 2차 숫자 패스키(PIN) */}
              {step2Mode === 'PIN' && (
                <form onSubmit={handleStep2PinVerify} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.45, padding: '0 8px' }}>
                    {hasPinPasskey
                      ? 'Enter your 4 to 8 digit PIN passkey. (Works across Google app, Chrome, Safari, Edge, and PC)'
                      : 'Set a 4 to 8 digit PIN passkey for universal access across all mobile browsers and PC.'}
                  </p>

                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    placeholder={hasPinPasskey ? 'Enter PIN Passkey (4-8 digits)' : 'Set PIN Passkey (4-8 digits)'}
                    value={passkeyPin}
                    onChange={(e) => setPasskeyPin(e.target.value.replace(/[^0-9]/g, ''))}
                    style={{
                      width: '88%', padding: '12px 16px', borderRadius: '10px',
                      border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)',
                      fontSize: '1.05rem', textAlign: 'center', letterSpacing: '4px', fontWeight: 700, outline: 'none'
                    }}
                    autoFocus
                    required
                  />

                  {!hasPinPasskey && (
                    <input
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={8}
                      placeholder="Re-enter PIN Passkey to confirm"
                      value={passkeyPinConfirm}
                      onChange={(e) => setPasskeyPinConfirm(e.target.value.replace(/[^0-9]/g, ''))}
                      style={{
                        width: '88%', padding: '12px 16px', borderRadius: '10px',
                        border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)',
                        fontSize: '1.05rem', textAlign: 'center', letterSpacing: '4px', fontWeight: 700, outline: 'none'
                      }}
                      required
                    />
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="sign-in-btn"
                    style={{
                      width: '90%', padding: '12px 16px', borderRadius: '12px', border: 'none',
                      color: 'white', fontSize: '0.96rem', fontWeight: '700', cursor: 'pointer',
                      display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s'
                    }}
                  >
                    <KeyRound size={18} />
                    {loading
                      ? 'Verifying...'
                      : (hasPinPasskey ? 'Verify PIN Passkey & Sign In' : 'Register PIN & Sign In')}
                  </button>
                </form>
              )}

              <button
                type="button"
                onClick={() => {
                  setAuthStep('STEP1_EMAIL_PW');
                  setPreAuthToken(null);
                  setPassword('');
                  setPasskeyPin('');
                  setPasskeyPinConfirm('');
                  setError('');
                  setInfoMessage('');
                }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}
              >
                <RotateCcw size={14} /> Back to Step 1 (Email & Password)
              </button>
            </div>
          )}

          {/* 비밀번호 분실(찾기) 요청 화면 */}
          {authStep === 'FORGOT_PW' && (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'var(--wia-blue)' }}>
                Reset Your Password
              </div>
              <input
                type="email"
                placeholder="Enter your registered email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <button type="submit" disabled={loading} className="sign-in-btn" style={{ width: '75%', margin: '0 auto', padding: '12px', borderRadius: '12px', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                {loading ? 'Sending...' : 'Send Password Reset Link'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <span onClick={() => { setError(''); setInfoMessage(''); setAuthStep('STEP1_EMAIL_PW'); }} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                  Back to Sign In
                </span>
              </div>
            </form>
          )}

          {/* 초대 수락: 초기 비밀번호 설정 화면 (?invite_token=...) */}
          {authStep === 'ACCEPT_INVITE' && (
            <form onSubmit={handleAcceptInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'var(--wia-blue)' }}>
                Accept Invitation · Set Initial Password
              </div>
              {inviteEmail && (
                <div style={{
                  width: '75%', margin: '0 auto', padding: '10px 14px', borderRadius: '10px',
                  backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                  fontSize: '0.88rem', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600
                }}>
                  Invited Account: {inviteEmail}
                </div>
              )}
              <input
                type="password"
                placeholder="Initial Password (min. 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <input
                type="password"
                placeholder="Confirm Initial Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <button type="submit" disabled={loading} className="sign-in-btn" style={{ width: '75%', margin: '4px auto 0', padding: '12px', borderRadius: '12px', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                {loading ? 'Saving...' : 'Save Password & Proceed to Passkey Setup'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '6px' }}>
                <span
                  onClick={() => {
                    window.history.replaceState({}, document.title, '/login');
                    setAuthStep('STEP1_EMAIL_PW');
                  }}
                  style={{ fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Back to Sign In
                </span>
              </div>
            </form>
          )}

          {/* 이메일 링크 진입 시 새 비밀번호 입력 화면 */}
          {authStep === 'RESET_PW' && (
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'var(--wia-blue)' }}>
                Set New Password
              </div>
              <input
                type="password"
                placeholder="New Password (min. 8 characters)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <button type="submit" disabled={loading} className="sign-in-btn" style={{ width: '75%', margin: '0 auto', padding: '12px', borderRadius: '12px', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                {loading ? 'Saving...' : 'Confirm Password Change'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '6px' }}>
                <span
                  onClick={() => {
                    window.history.replaceState({}, document.title, '/login');
                    setAuthStep('STEP1_EMAIL_PW');
                  }}
                  style={{ fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  Back to Sign In
                </span>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Right Area - Attached Image Banner */}
      <div style={{
        flex: '1.2',
        display: 'none',
        backgroundColor: '#f4f4f4',
        position: 'relative',
        overflow: 'hidden'
      }} className="login-banner-container">
        <img
          src="/login-bg.png"
          alt="Our Way of Working Core Value"
          style={{ width: '100%', height: '100%', objectFit: 'contain', objectPosition: 'center', opacity: 0.85 }}
          onError={(e) => {
            e.target.style.display = 'none';
            if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
          }}
        />
        <div style={{
          display: 'none', width: '100%', height: '100%', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center', padding: '40px', textAlign: 'center',
          color: 'var(--text-muted)'
        }}>
          <p>Please place the core value image in the <code>frontend/public</code> folder as <b>login-bg.png</b>.</p>
        </div>
      </div>

      <style>{`
        @media (min-width: 768px) {
          .login-banner-container {
            display: block !important;
          }
        }
        .sign-in-btn {
          background-color: var(--wia-blue);
        }
        .sign-in-btn:hover {
          background-color: rgb(205, 170, 125);
        }
      `}</style>
    </div>
  );
}
