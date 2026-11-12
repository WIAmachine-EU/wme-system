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
        setError(data.detail || '이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      // 1단계 성공: 사전 발급된 WebAuthn 챌린지 및 pre_auth_token 저장 후 2단계 화면으로 전환
      applyStep1AuthData(data);
      addAuditLog('Step1 Email/PW Verified (AAL1)', data.email, 'Success');
    } catch (err) {
      setError('서버와 통신할 수 없습니다.');
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
      setInfoMessage('현재 브라우저 환경에서는 모든 브라우저 호환 [숫자 패스키(PIN)]로 2차 인증을 진행해 주세요.');
      return;
    }

    if (!webauthnChallenge) {
      setError('보안 챌린지 정보가 만료되었습니다. 1단계 로그인을 다시 시도해 주세요.');
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
        throw new Error('패스키 인증 응답을 받지 못했습니다.');
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
        throw new Error(finalData.detail || '2단계 패스키 검증에 실패했습니다.');
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
          '현재 모바일 브라우저(구글앱 인앱 환경 등)에서 기기 생체인증 호출이 제한되어 [숫자 패스키(PIN)] 모드로 전환되었습니다. 숫자 패스키(4~8자리)로 즉시 로그인하실 수 있습니다.'
        );
      } else {
        setError(`2단계 패스키 인증 실패: ${errMsg}`);
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
      setError('2차 숫자 패스키는 4~8자리 숫자로 입력해 주세요.');
      return;
    }

    if (!hasPinPasskey && cleanPin !== passkeyPinConfirm.trim()) {
      setError('입력하신 두 숫자 패스키가 일치하지 않습니다.');
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
        throw new Error(finalData.detail || '2차 숫자 패스키 검증에 실패했습니다.');
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
      setError(`2단계 패스키 인증 실패: ${err.message}`);
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
      setError('비밀번호는 최소 8자 이상이어야 합니다.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('입력하신 두 비밀번호가 일치하지 않습니다.');
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
      if (!res.ok) throw new Error(data.detail || '초기 비밀번호 설정에 실패했습니다.');

      window.history.replaceState({}, document.title, '/login');
      setEmail(data.email);
      setPassword(newPassword);
      setInfoMessage(data.message);
      applyStep1AuthData(data);
      addAuditLog('Invite Accepted & Initial Password Set (AAL1)', data.email, 'Success');
    } catch (err) {
      setError(err.message);
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
      setInfoMessage(data.message);
    } catch (err) {
      setError('요청 처리 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  // [비밀번호 재설정] 이메일 링크 클릭 후 새 비밀번호 저장
  const handleResetPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, new_password: newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || '비밀번호 재설정 실패');

      setInfoMessage(data.message);
      window.history.replaceState({}, document.title, '/login');
      setAuthStep('STEP1_EMAIL_PW');
      setPassword('');
    } catch (err) {
      setError(err.message);
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
                STEP 1 / 2 · 이메일 계정 인증
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
                {loading ? '검증 중...' : <>다음 (2단계 패스키 인증) <ArrowRight size={18} /></>}
              </button>

              <div style={{ marginTop: '12px', textAlign: 'center' }}>
                <span
                  onClick={() => { setError(''); setInfoMessage(''); setAuthStep('FORGOT_PW'); }}
                  style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  비밀번호를 잊으셨나요? (Forgot your password?)
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
                  STEP 2 / 2 · 패스키 생체/기기 2차 인증
                </div>
                <p style={{ fontSize: '0.86rem', color: 'var(--text-primary)', margin: '6px 0 0', lineHeight: 1.45 }}>
                  <strong>{email}</strong> 계정의 1차 비밀번호가 확인되었습니다.
                </p>
              </div>

              {/* 2차 인증 수단 전환 탭: 기기 생체/패스키 vs 모든 브라우저(구글앱·크롬·엣지·PC) 공용 숫자 패스키 */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', width: '92%',
                padding: '4px', borderRadius: '10px', backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)'
              }}>
                <button
                  type="button"
                  onClick={() => { setError(''); setStep2Mode('WEBAUTHN'); }}
                  style={{
                    padding: '8px 6px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    backgroundColor: step2Mode === 'WEBAUTHN' ? 'var(--wia-blue)' : 'transparent',
                    color: step2Mode === 'WEBAUTHN' ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s'
                  }}
                >
                  <Smartphone size={14} /> 생체 / 기기 패스키
                </button>
                <button
                  type="button"
                  onClick={() => { setError(''); setStep2Mode('PIN'); }}
                  style={{
                    padding: '8px 6px', borderRadius: '8px', border: 'none', cursor: 'pointer',
                    fontSize: '0.8rem', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px',
                    backgroundColor: step2Mode === 'PIN' ? 'var(--wia-blue)' : 'transparent',
                    color: step2Mode === 'PIN' ? '#ffffff' : 'var(--text-secondary)',
                    transition: 'all 0.15s'
                  }}
                >
                  <Hash size={14} /> 숫자 패스키 (PIN)
                </button>
              </div>

              {/* 탭 1: 기기 생체/패스키 (Face ID / 지문 / Windows Hello PIN) */}
              {step2Mode === 'WEBAUTHN' && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.45, padding: '0 8px' }}>
                    {hasLocalDevicePasskey
                      ? '현재 기기에 등록된 패스키(Face ID / 지문 / 기기 PIN)로 2차 인증을 완료해 주세요.'
                      : '현재 접속 기기(모바일/PC)의 생체인증(안면인식/지문) 또는 기기 암호로 패스키를 연결 후 로그인합니다.'}
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
                      ? '패스키 검증 중...'
                      : (hasLocalDevicePasskey ? '패스키로 2차 인증 완료하기' : '내 기기 패스키 인증 및 로그인')}
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
                      현재 브라우저/기기에 패스키 새로 연결하기
                    </button>
                  )}

                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center', marginTop: '2px' }}>
                    구글앱 등 인앱 브라우저를 사용 중이신가요? 상단의{' '}
                    <span
                      onClick={() => { setError(''); setStep2Mode('PIN'); }}
                      style={{ color: 'var(--wia-blue)', fontWeight: 700, cursor: 'pointer', textDecoration: 'underline' }}
                    >
                      [숫자 패스키 (PIN)]
                    </span>
                    를 사용하시면 모든 브라우저에서 즉시 호환됩니다.
                  </div>
                </div>
              )}

              {/* 탭 2: 전 브라우저(구글앱·크롬·엣지·사파리·PC) 공용 2차 숫자 패스키(PIN) */}
              {step2Mode === 'PIN' && (
                <form onSubmit={handleStep2PinVerify} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: '100%' }}>
                  <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', margin: 0, textAlign: 'center', lineHeight: 1.45, padding: '0 8px' }}>
                    {hasPinPasskey
                      ? '등록하신 2차 숫자 패스키(4~8자리 숫자)를 입력해 주세요. (구글앱·크롬·엣지·PC 공통 사용)'
                      : '모든 모바일 브라우저(구글앱·크롬·엣지)와 PC에서 공용으로 사용할 2차 숫자 패스키(4~8자리)를 설정해 주세요.'}
                  </p>

                  <input
                    type="password"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={8}
                    placeholder={hasPinPasskey ? '2차 숫자 패스키 입력 (4~8자리)' : '사용할 숫자 패스키 입력 (4~8자리 숫자)'}
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
                      placeholder="숫자 패스키 한 번 더 입력 (확인)"
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
                      ? '검증 중...'
                      : (hasPinPasskey ? '숫자 패스키로 2차 인증 완료' : '숫자 패스키 등록 후 로그인')}
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
                <RotateCcw size={14} /> 1단계(이메일 입력)로 돌아가기
              </button>
            </div>
          )}

          {/* 비밀번호 분실(찾기) 요청 화면 */}
          {authStep === 'FORGOT_PW' && (
            <form onSubmit={handleForgotPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 700 }}>
                비밀번호 재설정 링크 받기
              </div>
              <input
                type="email"
                placeholder="가입된 이메일 주소 입력"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <button type="submit" disabled={loading} className="sign-in-btn" style={{ width: '75%', margin: '0 auto', padding: '12px', borderRadius: '12px', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                {loading ? '발송 중...' : '재설정 링크 이메일 발송'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '8px' }}>
                <span onClick={() => setAuthStep('STEP1_EMAIL_PW')} style={{ fontSize: '0.85rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}>
                  로그인 화면으로 돌아가기
                </span>
              </div>
            </form>
          )}

          {/* 초대 수락: 초기 비밀번호 설정 화면 (?invite_token=...) */}
          {authStep === 'ACCEPT_INVITE' && (
            <form onSubmit={handleAcceptInvite} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 700, color: 'var(--wia-blue)' }}>
                신규 계정 초대 수락 · 초기 비밀번호 설정
              </div>
              {inviteEmail && (
                <div style={{
                  width: '75%', margin: '0 auto', padding: '10px 14px', borderRadius: '10px',
                  backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                  fontSize: '0.88rem', color: 'var(--text-primary)', textAlign: 'center', fontWeight: 600
                }}>
                  초대 계정: {inviteEmail}
                </div>
              )}
              <input
                type="password"
                placeholder="초기 비밀번호 입력 (8자 이상)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <input
                type="password"
                placeholder="초기 비밀번호 확인"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <button type="submit" disabled={loading} className="sign-in-btn" style={{ width: '75%', margin: '4px auto 0', padding: '12px', borderRadius: '12px', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                {loading ? '저장 중...' : '초기 비밀번호 저장 및 패스키 등록 진행'}
              </button>
              <div style={{ textAlign: 'center', marginTop: '6px' }}>
                <span
                  onClick={() => {
                    window.history.replaceState({}, document.title, '/login');
                    setAuthStep('STEP1_EMAIL_PW');
                  }}
                  style={{ fontSize: '0.82rem', color: 'var(--text-muted)', cursor: 'pointer', textDecoration: 'underline' }}
                >
                  일반 로그인 화면으로 이동
                </span>
              </div>
            </form>
          )}

          {/* 이메일 링크 진입 시 새 비밀번호 입력 화면 */}
          {authStep === 'RESET_PW' && (
            <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ textAlign: 'center', fontSize: '0.9rem', fontWeight: 700 }}>
                새 비밀번호 설정
              </div>
              <input
                type="password"
                placeholder="새 비밀번호 (8자 이상)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                style={{ width: '75%', margin: '0 auto', padding: '12px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-input)', outline: 'none' }}
                required
              />
              <button type="submit" disabled={loading} className="sign-in-btn" style={{ width: '75%', margin: '0 auto', padding: '12px', borderRadius: '12px', border: 'none', color: 'white', fontWeight: 700, cursor: 'pointer', transition: 'background-color 0.2s' }}>
                {loading ? '저장 중...' : '비밀번호 변경 확정'}
              </button>
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
          <p>코어 밸류 이미지를 frontend/public 폴더에<br /><b>login-bg.png</b> 라는 이름으로 저장해주세요.</p>
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
