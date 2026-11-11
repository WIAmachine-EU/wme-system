// frontend/src/pages/Login.jsx
import React, { useState, useEffect } from 'react';
import { Lock, Mail, ArrowRight, KeyRound, ShieldCheck, RotateCcw } from 'lucide-react';
import WiaLogo from '../components/WiaLogo';
import { supabase } from '../utils/supabaseClient';
import { addAuditLog } from '../utils/auditLogger';

export default function Login({ onLogin }) {
  // 'STEP1_EMAIL_PW' | 'STEP2_PASSKEY' | 'ACCEPT_INVITE' | 'FORGOT_PW' | 'RESET_PW'
  const [authStep, setAuthStep] = useState('STEP1_EMAIL_PW');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preAuthToken, setPreAuthToken] = useState(null);
  const [hasPasskey, setHasPasskey] = useState(true);

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
      // JWT payload에서 초대받은 이메일 주소를 디코딩하여 화면에 표시
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

      // 1단계 성공: 최종 로그인을 시키지 않고 pre_auth_token 저장 후 2단계 패스키 화면으로 전환
      setPreAuthToken(data.pre_auth_token);
      setHasPasskey(Boolean(data.has_passkey));
      setAuthStep('STEP2_PASSKEY');
      addAuditLog('Step1 Email/PW Verified (AAL1)', data.email, 'Success');
    } catch (err) {
      setError('서버와 통신할 수 없습니다.');
    } finally {
      setLoading(false);
    }
  };

  // [2단계] 패스키 생체/기기 검증 실행 및 최종 AAL2 세션 발급
  const handleStep2PasskeyVerify = async () => {
    setLoading(true);
    setError('');
    try {
      let supaSession = null;

      if (hasPasskey) {
        // 기등록자: 패스키 서명 팝업 호출
        const { data, error: pkError } = await supabase.auth.signInWithPasskey();
        if (pkError) throw pkError;
        supaSession = data?.session;
      } else {
        // 최초 등록자: 1단계에서 확인된 이메일/비밀번호로 Supabase 세션 연결 후 패스키 등록
        const { error: signInErr } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password: password.trim()
        });
        if (signInErr) {
          const { error: signUpErr } = await supabase.auth.signUp({
            email: email.trim().toLowerCase(),
            password: password.trim()
          });
          if (signUpErr) throw signInErr;
        }

        const { error: regErr } = await supabase.auth.registerPasskey();
        if (regErr) throw regErr;

        const { data: sessionData } = await supabase.auth.getSession();
        supaSession = sessionData?.session;
      }

      if (!supaSession?.access_token) {
        throw new Error('패스키 인증 세션을 확인할 수 없습니다.');
      }

      // 백엔드에 1단계 pre_auth_token과 2단계 패스키 토큰을 함께 제출하여 교차 검증
      const res = await fetch('/api/v1/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pre_auth_token: preAuthToken,
          supabase_access_token: supaSession.access_token
        })
      });

      const finalData = await res.json();
      if (!res.ok) {
        throw new Error(finalData.detail || '2단계 패스키 검증에 실패했습니다.');
      }

      // 최종 AAL2 토큰 저장 및 시스템 진입
      localStorage.setItem('wme_access_token', finalData.access_token);
      addAuditLog('Step2 Passkey Verified (AAL2)', finalData.email, 'Success');

      // 표시 이름(username)이 설정되어 있으면 사용하고, 미설정 시 이메일 전달 및 프로필 설정 유도
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

      // URL에서 invite_token 제거 후 즉시 2단계 패스키 등록(STEP2_PASSKEY) 화면으로 전환
      window.history.replaceState({}, document.title, '/login');
      setEmail(data.email);
      setPassword(newPassword);
      setPreAuthToken(data.pre_auth_token);
      setHasPasskey(false); // 최초 패스키 등록 모드로 유도
      setInfoMessage(data.message);
      setAuthStep('STEP2_PASSKEY');
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
            <div style={{ padding: '12px', marginBottom: '12px', borderRadius: '8px', backgroundColor: 'rgba(230,0,18,0.1)', color: 'var(--wia-red)', fontSize: '0.88rem', textAlign: 'center' }}>
              {error}
            </div>
          )}
          {infoMessage && (
            <div style={{ padding: '12px', marginBottom: '12px', borderRadius: '8px', backgroundColor: '#ecfdf5', color: '#047857', fontSize: '0.88rem', textAlign: 'center' }}>
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

          {/* STEP 2: 패스키 2차 필수 검증 화면 */}
          {authStep === 'STEP2_PASSKEY' && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-color)' }}>
              <ShieldCheck size={36} color="var(--wia-blue)" />
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--wia-blue)' }}>
                  STEP 2 / 2 · 패스키 생체/기기 2차 인증
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: '6px 0 0' }}>
                  <strong>{email}</strong> 계정의 1차 비밀번호가 확인되었습니다.<br />
                  {hasPasskey
                    ? '등록된 기기 패스키(지문/Face ID/PIN)로 2차 인증을 완료해 주세요.'
                    : '최초 접속 계정입니다. 보안을 위해 현재 기기의 패스키를 등록해 주세요.'}
                </p>
              </div>

              <button
                type="button"
                onClick={handleStep2PasskeyVerify}
                disabled={loading}
                className="sign-in-btn"
                style={{
                  width: '85%', padding: '12px 16px', borderRadius: '12px', border: 'none',
                  color: 'white', fontSize: '1rem', fontWeight: '700', cursor: 'pointer',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px', transition: 'background-color 0.2s'
                }}
              >
                <KeyRound size={18} />
                {loading ? '패스키 검증 중...' : (hasPasskey ? '패스키로 2차 인증 완료하기' : '내 기기 패스키 등록 후 로그인')}
              </button>

              <button
                type="button"
                onClick={() => { setAuthStep('STEP1_EMAIL_PW'); setPreAuthToken(null); setPassword(''); }}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.82rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
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
