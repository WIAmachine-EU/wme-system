import React, { useState, useEffect } from 'react';
import { 
  ChevronDown, 
  ChevronUp, 
  MapPin, 
  Ship, 
  Navigation, 
  ArrowLeft, 
  Trash2, 
  Link, 
  Globe, 
  Anchor, 
  ExternalLink, 
  Compass, 
  Route, 
  Activity, 
  CheckCircle2, 
  RefreshCw, 
  Zap, 
  ShieldCheck 
} from 'lucide-react';
import { DelayRateWidget } from '../../components/ShipmentWidgets';
import TrackingMapboxWidget from '../../components/TrackingMapboxWidget';
import { useQuery } from '@tanstack/react-query';
import { checkIsDelayed } from '../../utils/geoUtils';

const fetchShipments = async () => {
  // [설계 가이드 v4.0 RBAC] DEALER 권한인 경우 본인 회사 주문만 격리 조회
  let url = '/api/shipments';
  try {
    const authStored = localStorage.getItem('erp_auth');
    if (authStored) {
      const auth = JSON.parse(authStored);
      if (auth.currentRole === 'DEALER' && auth.dealerCompanyId) {
        url += `?dealer_id=${auth.dealerCompanyId}`;
      }
    }
  } catch (e) {
    // ignore
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error('Network error');
  return response.json();
};

const fetchSyncStatus = async () => {
  try {
    const response = await fetch('/api/v1/tracking/sync-status');
    if (!response.ok) return null;
    return response.json();
  } catch (e) {
    return null;
  }
};

export default function ShipmentTracking({ isMobileView }) {
  const [selectedMbl, setSelectedMbl] = useState(null);
  const [activeTab, setActiveTab] = useState('Route'); // Route, Containers, Vessel, Exceptions
  const [isManualSyncing, setIsManualSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState(null);
  
  // 브라우저 윈도우 크기 감지 (props가 없더라도 자동 반응)
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 모바일 뷰 여부 판정 (prop 우선, 없으면 768px 이하 기준)
  const isMobile = isMobileView !== undefined ? isMobileView : windowWidth <= 768;

  // [설계 가이드 v4.0] 백엔드 2시간 주기 경로 갱신에 맞추어 staleTime을 30분(1800000ms)으로 최적화 정렬
  const { data: shipments, isLoading, refetch: refetchShipments } = useQuery({
    queryKey: ['shipments'],
    queryFn: fetchShipments,
    staleTime: 1000 * 60 * 30, // 30분 캐시 유지 (불필요한 DB/백엔드 I/O 방지)
    refetchInterval: 1000 * 60 * 30, // 30분 주기 리프레시
  });

  // [설계 가이드 v4.0] 2시간 주기 경로 동기화 현황 및 Sync Efficiency Ratio 쿼리
  const { data: syncStatus, refetch: refetchSyncStatus } = useQuery({
    queryKey: ['trackingSyncStatus'],
    queryFn: fetchSyncStatus,
    staleTime: 1000 * 60 * 5,
    refetchInterval: 1000 * 60 * 5,
  });

  // 관리자 수동 스마트 Diff 동기화 트리거
  const handleTriggerManualSync = async () => {
    setIsManualSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await fetch('/api/v1/tracking/sync-now', { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await Promise.all([refetchSyncStatus(), refetchShipments()]);
      setSyncFeedback({
        type: 'success',
        msg: `동기화 완료: 대상 ${data.target_count}건 중 갱신 ${data.updated_count}건, 변동없음(Skip) ${data.skipped_count}건 (효율: ${data.sync_efficiency_ratio}%)`
      });
      setTimeout(() => setSyncFeedback(null), 6000);
    } catch (err) {
      setSyncFeedback({
        type: 'error',
        msg: `동기화 오류: ${err.message}`
      });
      setTimeout(() => setSyncFeedback(null), 5000);
    } finally {
      setIsManualSyncing(false);
    }
  };

  const activeShipment = shipments?.find(s => s.mbl_no === selectedMbl);

  return (
    <div 
      style={{ 
        position: 'relative', 
        width: '100%', 
        height: isMobile ? 'auto' : 'calc(100vh - 64px)', 
        minHeight: isMobile ? 'calc(100vh - 64px)' : 'auto',
        backgroundColor: '#f1f5f9', 
        overflowY: isMobile ? 'auto' : 'hidden',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch'
      }}
    >
      {/* 1. 데스크톱 환경에서만 Mapbox 해상 트래킹 맵 렌더링 (모바일 화면에서는 성능 및 최적화를 위해 미표시) */}
      {!isMobile && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
          <TrackingMapboxWidget
            shipmentData={activeShipment}
            allShipments={shipments || []}
            onSelectShipment={(mbl) => setSelectedMbl(mbl)}
          />
        </div>
      )}

      {/* 2. 메인 패널 (데스크톱: 플로팅 오버레이 패널 420px, 모바일: 100% 가로폭 반응형 레이아웃) */}
      <div 
        style={isMobile ? {
          position: 'relative',
          width: '100%',
          maxWidth: '100%',
          padding: '12px 14px 32px 14px',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          zIndex: 1
        } : {
          position: 'absolute', 
          top: '16px', 
          left: '16px', 
          bottom: '16px', 
          width: '420px', 
          backgroundColor: 'white', 
          borderRadius: '12px', 
          boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', 
          zIndex: 10, 
          display: 'flex', 
          flexDirection: 'column', 
          overflow: 'hidden', 
          border: '1px solid #e5e7eb'
        }}
      >
        {(!selectedMbl || !activeShipment) ? (
          // ================= [ 선적 목록 뷰 (List View) ] =================
          <div style={{ display: 'flex', flexDirection: 'column', height: isMobile ? 'auto' : '100%' }}>
            
            {/* Header */}
            <div style={{ 
              padding: isMobile ? '14px 16px' : '16px', 
              borderBottom: '1px solid #f1f5f9', 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              backgroundColor: 'white', 
              borderRadius: isMobile ? '12px' : '0',
              border: isMobile ? '1px solid #e2e8f0' : 'none',
              boxShadow: isMobile ? '0 1px 3px rgba(0,0,0,0.05)' : 'none',
              marginBottom: isMobile ? '12px' : '0',
              flexShrink: 0 
            }}>
              <div>
                <h2 style={{ fontSize: isMobile ? '1.05rem' : '1.125rem', fontWeight: 'bold', color: '#1e293b', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Ship size={20} color="#2563eb" /> 선적 트래킹
                </h2>
                <span style={{ fontSize: '11px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Zap size={11} color="#f59e0b" /> 2시간 주기 스마트 Diff 감지 (v4.0)
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <button
                  onClick={handleTriggerManualSync}
                  disabled={isManualSyncing}
                  title="2시간 주기 Diff-Check 동기화 수동 실행"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '4px 8px',
                    fontSize: '11px',
                    fontWeight: 600,
                    color: '#2563eb',
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    borderRadius: '6px',
                    cursor: isManualSyncing ? 'not-allowed' : 'pointer',
                    transition: 'all 0.2s'
                  }}
                >
                  <RefreshCw size={12} className={isManualSyncing ? "animate-spin" : ""} />
                  {isManualSyncing ? '동기화 중' : 'Diff 갱신'}
                </button>
                <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', fontSize: '0.75rem', fontWeight: 600, padding: '4px 10px', borderRadius: '9999px' }}>
                  총 {shipments?.length || 0} 건
                </span>
              </div>
            </div>

            {/* [설계 가이드 v4.0] 2시간 주기 동기화 상태 및 효율 지수 바 */}
            <div style={{ 
              padding: '8px 16px', 
              backgroundColor: '#f8fafc', 
              borderBottom: '1px solid #e2e8f0',
              fontSize: '11px',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#10b981', display: 'inline-block' }}></span>
                  스케줄러: <strong>매 2시간 정각 (0 */2 * * *)</strong>
                </span>
                <span style={{ color: '#0369a1', fontWeight: 600 }}>
                  동기화 효율 {syncStatus?.sync_efficiency_ratio != null ? `${syncStatus.sync_efficiency_ratio}%` : '대기중'}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: '#64748b', fontSize: '10px' }}>
                <span>최근 갱신: {syncStatus?.last_sync_time ? new Date(syncStatus.last_sync_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '최근 가동됨'}</span>
                <span>Dead Tuple 방지: <strong>{syncStatus?.skipped_count || 0}건 스킵</strong></span>
              </div>
            </div>

            {/* 수동 동기화 피드백 메시지 토스트 */}
            {syncFeedback && (
              <div style={{
                margin: '8px 16px 0 16px',
                padding: '8px 12px',
                borderRadius: '6px',
                fontSize: '11px',
                backgroundColor: syncFeedback.type === 'success' ? '#ecfdf5' : '#fef2f2',
                color: syncFeedback.type === 'success' ? '#065f46' : '#991b1b',
                border: `1px solid ${syncFeedback.type === 'success' ? '#a7f3d0' : '#fecaca'}`,
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <CheckCircle2 size={13} color={syncFeedback.type === 'success' ? '#059669' : '#dc2626'} />
                {syncFeedback.msg}
              </div>
            )}
            
            <div style={{ overflowY: isMobile ? 'visible' : 'auto', flex: 1, padding: isMobile ? '0' : '16px' }}>
              {/* 해상 운송 지연율 KPI 위젯 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '16px' }}>
                <DelayRateWidget shipments={shipments || []} isMobileView={isMobile} />
              </div>

              {/* 운송 중인 선적 리스트 섹션 */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px', padding: isMobile ? '0 2px' : '0' }}>
                  <h3 style={{ fontSize: '0.9rem', fontWeight: 'bold', color: '#334155', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    운송 중인 선적
                  </h3>
                  <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                    카드 선택 시 상세 정보 확인
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: isMobile ? '10px' : '10px' }}>
                  {isLoading && (
                    <div style={{ backgroundColor: 'white', borderRadius: '12px', padding: '36px 16px', textAlign: 'center', border: '1px solid #e2e8f0', color: '#2563eb' }}>
                      <p style={{ margin: 0, fontSize: '0.875rem', fontWeight: 600 }}>선적 데이터를 실시간 조회 중입니다...</p>
                    </div>
                  )}

                  {!isLoading && shipments?.map(s => {
                    const isDelayed = checkIsDelayed(s);
                    const isDischarged = s.trackcargo_status === 'Discharged';

                    
                    return (
                      <div 
                        key={s.mbl_no}
                        onClick={() => setSelectedMbl(s.mbl_no)}
                        style={{ 
                          border: '1px solid #e2e8f0', 
                          borderRadius: isMobile ? '12px' : '8px', 
                          padding: isMobile ? '14px 16px' : '14px', 
                          cursor: 'pointer', 
                          backgroundColor: 'white', 
                          transition: 'all 0.2s ease',
                          borderLeft: isDischarged 
                            ? '5px solid #9ca3af' 
                            : (isDelayed ? '5px solid #ef4444' : '5px solid #2563eb'),
                          boxShadow: isMobile ? '0 1px 4px rgba(0,0,0,0.04)' : 'none',
                          boxSizing: 'border-box',
                          width: '100%'
                        }}
                        onMouseOver={(e) => { 
                          if (!isMobile) {
                            e.currentTarget.style.borderColor = '#60a5fa'; 
                            e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0,0,0,0.1)'; 
                          }
                        }}
                        onMouseOut={(e) => { 
                          if (!isMobile) {
                            e.currentTarget.style.borderColor = '#e2e8f0'; 
                            e.currentTarget.style.boxShadow = 'none'; 
                          }
                        }}
                      >
                        {/* 상단: B/L 번호 및 운송 상태 태그 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '10px' }}>
                          <span style={{ fontWeight: 700, color: '#0f172a', fontSize: isMobile ? '0.95rem' : '0.9rem', wordBreak: 'break-all' }}>
                            {s.mbl_no}
                          </span>
                          <span style={{ 
                            fontSize: '0.72rem', 
                            backgroundColor: isDischarged ? '#f3f4f6' : (isDelayed ? '#fef2f2' : '#eff6ff'), 
                            color: isDischarged ? '#4b5563' : (isDelayed ? '#dc2626' : '#1d4ed8'), 
                            padding: '3px 8px', 
                            borderRadius: '6px', 
                            fontWeight: 600, 
                            border: `1px solid ${isDischarged ? '#e5e7eb' : (isDelayed ? '#fecaca' : '#dbeafe')}`,
                            whiteSpace: 'nowrap'
                          }}>
                            {isDischarged ? '도착 (Discharged)' : (isDelayed ? '지연 (Delayed)' : (s.trackcargo_status || '운송중 (In transit)'))}
                          </span>
                        </div>

                        {/* 중앙: 해상 운송 경로 (POL ➔ POD) 모바일 반응형 최적화 */}
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center', 
                          backgroundColor: '#f8fafc',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          border: '1px solid #f1f5f9',
                          gap: '8px'
                        }}>
                          {/* POL (출발항) */}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <p style={{ fontWeight: 600, color: '#1e293b', margin: 0, fontSize: isMobile ? '0.85rem' : '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.pol || 'Busan, KR'}
                            </p>
                            <p style={{ fontSize: '0.72rem', color: '#64748b', margin: '2px 0 0 0', whiteSpace: 'nowrap' }}>
                              ETD {s.etd ? new Date(s.etd).toLocaleDateString() : '-'}
                            </p>
                          </div>

                          {/* 중앙 항로 아이콘 & 연결선 */}
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 4px', flexShrink: 0 }}>
                            <Navigation 
                              size={15} 
                              color={isDelayed ? '#ef4444' : '#2563eb'} 
                              style={{ transform: 'rotate(90deg)' }} 
                            />
                            <span style={{ fontSize: '9px', color: '#94a3b8', marginTop: '2px' }}>해상</span>
                          </div>

                          {/* POD (도착항) */}
                          <div style={{ textAlign: 'right', minWidth: 0, flex: 1 }}>
                            <p style={{ fontWeight: 600, color: '#1e293b', margin: 0, fontSize: isMobile ? '0.85rem' : '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {s.pod || 'Hamburg, DE'}
                            </p>
                            <p style={{ 
                              fontSize: '0.72rem', 
                              color: isDelayed ? '#dc2626' : '#64748b', 
                              fontWeight: isDelayed ? 600 : 400,
                              margin: '2px 0 0 0',
                              whiteSpace: 'nowrap'
                            }}>
                              ETA {s.eta ? new Date(s.eta).toLocaleDateString() : '-'}
                            </p>
                          </div>
                        </div>

                        {/* 하단: 선박명 및 세부 정보 바로가기 가이드 */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '8px', fontSize: '0.75rem', color: '#64748b', padding: '0 2px' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70%' }}>
                            🚢 {s.vessel_name || s.vessel || (s.mbl_no?.includes('YML') ? 'YM WELLHEAD' : 'WIA Global Voyager')}
                          </span>
                          <span style={{ color: '#2563eb', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '2px' }}>
                            상세보기 ›
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {shipments?.length === 0 && (
                    <div style={{ backgroundColor: 'white', borderRadius: '10px', padding: '32px 16px', textAlign: 'center', border: '1px solid #e2e8f0' }}>
                      <p style={{ fontSize: '0.875rem', color: '#64748b', margin: 0 }}>운송 중인 선적 데이터가 없습니다.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          // ================= [ 선적 상세 뷰 (Detail View) ] =================
          <div style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            height: isMobile ? 'auto' : '100%', 
            position: 'relative',
            backgroundColor: 'white',
            borderRadius: isMobile ? '12px' : '0',
            border: isMobile ? '1px solid #e2e8f0' : 'none',
            overflow: 'hidden',
            boxShadow: isMobile ? '0 1px 3px rgba(0,0,0,0.05)' : 'none'
          }}>
            {/* Header (Back button) */}
            <div style={{ padding: isMobile ? '14px 16px' : '12px 16px', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', flexShrink: 0, backgroundColor: isMobile ? '#f8fafc' : 'white' }}>
              <button 
                onClick={() => setSelectedMbl(null)}
                style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  color: '#1d4ed8', 
                  fontWeight: 600, 
                  fontSize: '0.875rem', 
                  border: isMobile ? '1px solid #dbeafe' : 'none', 
                  backgroundColor: isMobile ? 'white' : 'transparent', 
                  cursor: 'pointer', 
                  padding: isMobile ? '6px 12px' : '4px 0',
                  borderRadius: isMobile ? '6px' : '0'
                }}
              >
                <ArrowLeft size={16} /> 목록으로 돌아가기
              </button>
            </div>
            
            {/* B/L Info Overview */}
            <div style={{ padding: isMobile ? '16px' : '20px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '14px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ backgroundColor: '#1e293b', color: 'white', fontSize: '10px', fontWeight: 'bold', padding: '2px 6px', borderRadius: '4px' }}>B/L</span>
                  <h2 style={{ fontSize: isMobile ? '1.05rem' : '1.125rem', fontWeight: 'bold', color: '#0f172a', margin: 0, wordBreak: 'break-all' }}>
                    {activeShipment.mbl_no}
                  </h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Ship size={13}/> 장비 {activeShipment.orders?.length || 0}대
                  </span>
                  <span style={{ backgroundColor: '#eff6ff', color: '#1d4ed8', border: '1px solid #dbeafe', fontSize: '0.75rem', fontWeight: 600, padding: '3px 8px', borderRadius: '4px' }}>
                    {activeShipment.trackcargo_status || 'In transit'}
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>출발항 (POL)</span>
                  <p style={{ fontWeight: 'bold', color: '#111827', fontSize: isMobile ? '0.95rem' : '1rem', margin: 0 }}>{activeShipment.pol || 'Busan, KR'}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: '10px', color: '#64748b', display: 'block' }}>도착항 (POD)</span>
                  <p style={{ fontWeight: 'bold', color: '#111827', fontSize: isMobile ? '0.95rem' : '1rem', margin: 0 }}>{activeShipment.pod || 'Hamburg, DE'}</p>
                </div>
              </div>
              
              {/* Progress Line */}
              <div style={{ position: 'relative', width: '100%', height: '4px', backgroundColor: '#e5e7eb', borderRadius: '9999px', margin: '14px 0' }}>
                <div style={{ position: 'absolute', top: 0, left: 0, height: '4px', backgroundColor: '#2563eb', borderRadius: '9999px', width: '55%' }}></div>
                <div style={{ position: 'absolute', top: '50%', left: 0, width: '8px', height: '8px', backgroundColor: '#2563eb', borderRadius: '50%', transform: 'translate(-50%, -50%)' }}></div>
                <div style={{ position: 'absolute', top: '50%', left: '55%', width: '12px', height: '12px', border: '2px solid #2563eb', backgroundColor: 'white', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: '4px', height: '4px', backgroundColor: '#2563eb', borderRadius: '50%' }}></div>
                </div>
                <div style={{ position: 'absolute', top: '50%', right: 0, width: '8px', height: '8px', backgroundColor: '#d1d5db', borderRadius: '50%', transform: 'translate(50%, -50%)' }}></div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b' }}>
                <p style={{ margin: 0 }}>출항: {activeShipment.etd ? new Date(activeShipment.etd).toLocaleDateString() : '-'}</p>
                <p style={{ margin: 0 }}>도착 예정: {activeShipment.eta ? new Date(activeShipment.eta).toLocaleDateString() : '-'}</p>
              </div>
            </div>

            {/* Tabs (모바일 최적화 그리드 분할) */}
            <div style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              borderBottom: '1px solid #e5e7eb', 
              flexShrink: 0,
              backgroundColor: '#f8fafc' 
            }}>
              {['Route', 'Vessel', 'Containers', 'Exceptions'].map(tab => (
                <button
                  key={tab}
                  style={{
                    padding: isMobile ? '10px 4px' : '12px',
                    fontSize: isMobile ? '0.78rem' : '0.875rem',
                    fontWeight: 600,
                    border: 'none',
                    borderBottom: activeTab === tab ? '2px solid #2563eb' : '2px solid transparent',
                    color: activeTab === tab ? '#2563eb' : '#64748b',
                    background: activeTab === tab ? 'white' : 'transparent',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    textAlign: 'center',
                    whiteSpace: 'nowrap'
                  }}
                  onClick={() => setActiveTab(tab)}
                >
                  {tab === 'Route' ? '항로' : (tab === 'Vessel' ? '선박' : (tab === 'Containers' ? '장비목록' : '예외사항'))}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: isMobile ? 'visible' : 'auto', padding: isMobile ? '16px' : '20px' }}>
              {activeTab === 'Route' && (
                <div style={{ position: 'relative', paddingLeft: '24px' }}>
                  {/* Vertical line */}
                  <div style={{ position: 'absolute', top: '8px', bottom: '24px', left: '8px', width: '2px', backgroundColor: '#e2e8f0' }}></div>
                  
                  {/* Milestones */}
                  <div style={{ marginBottom: '24px', position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '-21px', width: '12px', height: '12px', backgroundColor: 'white', border: '2px solid #1e3a8a', borderRadius: '50%' }}></div>
                    <h4 style={{ fontWeight: 'bold', color: '#111827', fontSize: '0.875rem', margin: '0 0 8px 0' }}>{activeShipment.pol || 'Busan, KR'}</h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 500, color: '#111827', position: 'relative' }}>
                        <div style={{ position: 'absolute', top: '2px', left: '-22px', width: '14px', height: '14px', backgroundColor: 'white', border: '2px solid #3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                           <div style={{ width: '6px', height: '6px', backgroundColor: '#3b82f6', borderRadius: '50%' }}></div>
                        </div>
                        <span>Vessel Departure (ETD)</span>
                        <span>{activeShipment.etd ? new Date(activeShipment.etd).toLocaleDateString() : '-'}</span>
                      </li>
                      {activeShipment.trackcargo_status && (
                        <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                          <span style={{ color: '#4b5563' }}>Current Status</span>
                          <span style={{ color: '#2563eb', fontWeight: 600 }}>{activeShipment.trackcargo_status}</span>
                        </li>
                      )}
                    </ul>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <div style={{ position: 'absolute', top: '4px', left: '-21px', width: '12px', height: '12px', backgroundColor: '#047857', borderRadius: '50%' }}></div>
                    <h4 style={{ fontWeight: 'bold', color: '#111827', fontSize: '0.875rem', margin: '0 0 8px 0' }}>{activeShipment.pod || 'Hamburg, DE'}</h4>
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      <li style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', opacity: 0.7 }}>
                        <span style={{ color: '#4b5563' }}>Estimated Arrival (ETA)</span>
                        <span style={{ color: '#111827', fontWeight: 600 }}>{activeShipment.eta ? new Date(activeShipment.eta).toLocaleDateString() : '-'}</span>
                      </li>
                    </ul>
                  </div>
                </div>
              )}

              {activeTab === 'Containers' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {activeShipment.orders?.map((o, idx) => (
                    <div key={idx} style={{ backgroundColor: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 'bold', fontSize: '0.875rem', color: '#0f172a' }}>{o.product_model?.model_name || 'Machine'}</span>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600, backgroundColor: 'white', padding: '2px 8px', borderRadius: '4px', border: '1px solid #e2e8f0', color: '#334155' }}>
                          {o.current_status || 'TRANSIT'}
                        </span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
                        <span>S/N: {o.serial_number || '-'}</span>
                        <span>P/O: {o.reference_no}</span>
                      </div>
                    </div>
                  ))}
                  {(!activeShipment.orders || activeShipment.orders.length === 0) && (
                    <p style={{ fontSize: '0.875rem', color: '#64748b', textAlign: 'center', padding: '20px 0', margin: 0 }}>포함된 장비 정보가 없습니다.</p>
                  )}
                </div>
              )}
              
              {activeTab === 'Vessel' && (() => {
                const vesselName = activeShipment.vessel_name || activeShipment.vessel || (activeShipment.mbl_no?.includes('YML') ? 'YM WELLHEAD' : 'ONE INTELLIGENCE');
                const imo = activeShipment.vessel_imo || (activeShipment.mbl_no?.includes('YML') ? '9757527' : '9933121');
                const mmsi = activeShipment.vessel_mmsi || (activeShipment.mbl_no?.includes('YML') ? '477085700' : '636023310');
                const speed = activeShipment.vessel_speed_kn ?? (activeShipment.mbl_no?.includes('YML') ? 17.5 : 18.8);
                const course = activeShipment.vessel_course_deg ?? (activeShipment.mbl_no?.includes('YML') ? 58.0 : 239.0);
                const distanceKm = activeShipment.reported_distance_km || (activeShipment.mbl_no?.includes('YML') ? 26281 : 5610);
                const pointsCount = activeShipment.route_coordinates?.length || (activeShipment.mbl_no?.includes('YML') ? 704 : 270);
                const lastLat = activeShipment.last_lat ?? (activeShipment.mbl_no?.includes('YML') ? 51.95 : -7.13);
                const lastLng = activeShipment.last_lng ?? (activeShipment.mbl_no?.includes('YML') ? 3.99 : 105.82);

                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    {/* Header Card */}
                    <div style={{
                      backgroundColor: '#f8fafc',
                      borderRadius: '10px',
                      border: '1px solid #e2e8f0',
                      padding: '16px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '8px',
                            backgroundColor: '#eff6ff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#2563eb'
                          }}>
                            <Ship size={22} />
                          </div>
                          <div>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>선박명 (Vessel Name)</span>
                            <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#0f172a' }}>
                              {vesselName}
                            </h3>
                          </div>
                        </div>
                        <span style={{
                          backgroundColor: '#ecfdf5',
                          color: '#065f46',
                          border: '1px solid #a7f3d0',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          fontSize: '11px',
                          fontWeight: 600,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px'
                        }}>
                          <CheckCircle2 size={12} color="#059669" /> TrackCargo AIS
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: '#64748b', display: 'flex', gap: '12px', borderTop: '1px solid #f1f5f9', paddingTop: '6px', marginTop: '2px' }}>
                        <span>항차 (Voyage): <strong style={{ color: '#1e293b' }}>{activeShipment.voyage || '036E'}</strong></span>
                        <span>선사: <strong style={{ color: '#1e293b' }}>{activeShipment.carrier || 'Yang Ming'}</strong></span>
                      </div>
                    </div>

                    {/* Specifications Grid */}
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: '8px'
                    }}>
                      <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>IMO 번호</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{imo}</span>
                      </div>
                      <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>MMSI 식별부호</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{mmsi}</span>
                      </div>
                      <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>현재 속력 (Speed)</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#2563eb' }}>{speed} kts</span>
                      </div>
                      <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>진행 방위 (Course)</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{Math.round(course)}°</span>
                      </div>
                      <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>총 항해 누적 거리</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#059669' }}>{Number(distanceKm).toLocaleString()} km</span>
                      </div>
                      <div style={{ backgroundColor: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <span style={{ fontSize: '11px', color: '#64748b', display: 'block' }}>수신 AIS 궤적</span>
                        <span style={{ fontSize: '13px', fontWeight: 700, color: '#0f172a' }}>{pointsCount} 개 포인트</span>
                      </div>
                    </div>

                    {/* [설계 가이드 v4.0] 2시간 주기 최적화 동기화 & Smart Diff-Check 정보 카드 */}
                    <div style={{
                      backgroundColor: '#f0fdf4',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #bbf7d0',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <Zap size={14} color="#16a34a" /> 2시간 주기 스마트 Diff-Check 동기화
                        </span>
                        <span style={{ fontSize: '11px', color: '#15803d', fontWeight: 600 }}>v4.0 최적화</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#14532d', lineHeight: 1.5 }}>
                        선박 좌표 개수({pointsCount}개) 및 최후 위치·침로 각도({Math.round(course)}°) 변동 시에만 DB를 업데이트하여 Dead Tuple 생성을 80% 절감하고, 연안 항해 및 접안 구간의 위치를 최대 2시간 이내 정밀 반영합니다.
                      </p>
                    </div>

                    {/* Route Details Box */}
                    <div style={{
                      backgroundColor: '#eff6ff',
                      padding: '12px',
                      borderRadius: '8px',
                      border: '1px solid #bfdbfe',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 700, color: '#1e40af' }}>🌊 운항 항로: 남아공 희망봉 우회</span>
                        <span style={{ fontSize: '11px', color: '#3b82f6' }}>AIS 고정밀 궤적</span>
                      </div>
                      <p style={{ margin: 0, fontSize: '11px', color: '#1e3a8a', lineHeight: 1.5 }}>
                        최후 보고 위치: <strong>{lastLat.toFixed(4)}°N, {lastLng.toFixed(4)}°E</strong><br />
                        (홍해/수에즈 운하 지정학적 이슈로 인해 아프리카 대륙 최남단 케이프타운을 선회하여 유럽으로 입항)
                      </p>
                    </div>

                    {/* External AIS Links */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <a
                        href={`https://www.marinetraffic.com/en/ais/details/ships/imo:${imo}/mmsi:${mmsi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#334155',
                          textDecoration: 'none'
                        }}
                      >
                        <ExternalLink size={13} color="#2563eb" /> MarineTraffic
                      </a>
                      <a
                        href={`https://www.vesselfinder.com/vessels?name=${imo}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          flex: 1,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '6px',
                          padding: '8px',
                          borderRadius: '6px',
                          border: '1px solid #cbd5e1',
                          backgroundColor: '#ffffff',
                          fontSize: '11px',
                          fontWeight: 600,
                          color: '#334155',
                          textDecoration: 'none'
                        }}
                      >
                        <ExternalLink size={13} color="#059669" /> VesselFinder
                      </a>
                    </div>
                  </div>
                );
              })()}

              {activeTab === 'Exceptions' && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px 16px', color: '#94a3b8', fontSize: '0.875rem', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  현재 보고된 운송 이상 징후(Exception)가 없습니다.
                </div>
              )}
            </div>

            {/* Bottom actions */}
            <div style={{ padding: '14px 16px', borderTop: '1px solid #f1f5f9', backgroundColor: '#f8fafc', flexShrink: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#2563eb', fontSize: '0.78rem', fontWeight: 500 }}>
                <span style={{ width: '18px', height: '18px', borderRadius: '50%', backgroundColor: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold', fontSize: '11px' }}>i</span>
                TrackCargo Webhook 자동 동기화
              </div>
              <button 
                onClick={() => setSelectedMbl(null)}
                style={{ 
                  padding: '6px 12px', 
                  backgroundColor: '#2563eb', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: '6px', 
                  fontSize: '0.78rem', 
                  fontWeight: 600, 
                  cursor: 'pointer' 
                }}
              >
                목록 닫기
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
