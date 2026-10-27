// frontend/src/components/DealerVesselTrackingModal.jsx
import React, { useState, useEffect, useMemo } from 'react';
import { X, Ship, Clock, AlertTriangle, CheckCircle2, MapPin, PackageCheck } from 'lucide-react';
import TrackingMapboxWidget from './TrackingMapboxWidget';

export default function DealerVesselTrackingModal({
  isOpen,
  onClose,
  selectedOrder, // 타임라인에서 클릭한 발주 행
  timelineOrders = [], // 배송 추적 타임라인의 전체 리스트 (개수 1:1 동일 유지)
  shipmentsMap = {} // shipment_id 또는 mbl_no 매핑 데이터
}) {
  const [activeOrder, setActiveOrder] = useState(selectedOrder);

  useEffect(() => {
    if (selectedOrder) setActiveOrder(selectedOrder);
  }, [selectedOrder]);

  const trackingMetrics = useMemo(() => {
    if (!activeOrder) return null;

    const shipment = activeOrder.shipment ||
      (activeOrder.shipment_id && shipmentsMap[activeOrder.shipment_id]) ||
      (activeOrder.reference_no && shipmentsMap[activeOrder.reference_no]) ||
      {};
    const status = activeOrder.current_status || 'CONFIRMED';

    const etdRaw = activeOrder.etd || shipment.etd;
    const etaRaw = activeOrder.eta || shipment.eta;
    const actualRaw = activeOrder.actual_date || shipment.ata;

    const etdDate = etdRaw ? new Date(etdRaw) : null;
    const etaDate = etaRaw ? new Date(etaRaw) : null;
    const actualDate = actualRaw ? new Date(actualRaw) : null;
    const now = new Date();

    const isEtdValid = Boolean(etdDate && !isNaN(etdDate.getTime()));
    const isEtaValid = Boolean(etaDate && !isNaN(etaDate.getTime()));
    const isActualValid = Boolean(actualDate && !isNaN(actualDate.getTime()));

    // 1. 출항 전(주문/생산 중 또는 ETD 미확정) 여부 판정
    const isWaitingDeparture =
      ['CONFIRMED', 'IN_PRODUCTION', '주문', '생산 중', '생산중'].includes(status) ||
      !isEtdValid;

    // 2. 도착 완료 여부 판정
    const isArrived =
      !isWaitingDeparture &&
      (['ARRIVED', 'IN_STOCK', 'DISPATCHED', 'SOLD', '항구도착', '입고'].includes(status) ||
      (isEtaValid && etaDate <= now));

    // 3. 선박 정보 유무 판정
    const rawVessel = shipment.vessel_name || shipment.vessel || activeOrder.vessel;
    const hasVessel = Boolean(rawVessel && rawVessel.trim() !== '' && rawVessel.trim() !== '-' && !rawVessel.includes('확인 중') && !rawVessel.includes('출항 대기'));
    const vesselName = hasVessel ? rawVessel.trim() : '-';

    // 4. 단계별 표시 텍스트 분기
    const polCode = shipment.pol || 'KRPUS';
    const podName = activeOrder.destination_port || shipment.pod || 'Hamburg';

    // 해상운항 소요 텍스트: 선박정보가 없거나 출항 전이면 '생산완료 후 출항'
    let transitDaysText = '생산완료 후 출항';
    if (!isWaitingDeparture && isEtdValid && hasVessel) {
      const endRef = isArrived && isEtaValid ? etaDate : now;
      const diffDays = Math.max(0, Math.round((endRef - etdDate) / (1000 * 60 * 60 * 24)));
      transitDaysText = isArrived ? `${diffDays}일 소요 (도착 완료)` : `${diffDays}일째 해상 운항 중`;
    }

    // 출발일(ETD) 표기: 정보가 없으면 '-'
    const etdFormatted = isEtdValid ? etdDate.toLocaleDateString('ko-KR') : '-';

    // 도착예정일(ETA) 표기: 정보가 없으면 '-'
    const etaFormatted = isEtaValid ? etaDate.toLocaleDateString('ko-KR') : '-';

    // 지연된 일수: 선박 정보가 없거나 출항 전/ETA 미확정 시 '-' 표기
    let delayedDays = 0;
    let delayedDaysFormatted = '-';
    if (!isWaitingDeparture && hasVessel && isEtaValid) {
      if (isActualValid && actualDate > etaDate) {
        delayedDays = Math.max(0, Math.round((actualDate - etaDate) / (1000 * 60 * 60 * 24)));
      } else if (!isArrived && now > etaDate) {
        delayedDays = Math.max(0, Math.round((now - etaDate) / (1000 * 60 * 60 * 24)));
      }
      delayedDaysFormatted = delayedDays > 0 ? `+${delayedDays}일 지연` : '0일 (정상)';
    }

    // 5. 2D 평면 지도에 전달할 데이터 (출항 대기/생산 중일 때는 부산항 KRPUS 좌표 고정)
    const mapShipmentData = {
      mbl_no: shipment.mbl_no || activeOrder.reference_no,
      vessel_name: isWaitingDeparture ? `생산완료 후 출항 (${activeOrder.reference_no})` : (hasVessel ? vesselName : activeOrder.reference_no),
      pol: polCode,
      pod: podName,
      etd: etdRaw,
      eta: etaRaw,
      isWaitingDeparture,
      trackcargo_status: isWaitingDeparture
        ? 'Waiting'
        : (isArrived ? 'Discharged' : (shipment.trackcargo_status || 'In Transit')),
      isDelayed: delayedDays > 0,
      last_lat: isWaitingDeparture ? 35.1796 : (isArrived ? null : shipment.last_lat),
      last_lng: isWaitingDeparture ? 129.0756 : (isArrived ? null : shipment.last_lng),
      vessel_speed_kn: (isWaitingDeparture || isArrived) ? 0 : (shipment.vessel_speed_kn || 0),
      vessel_course_deg: (isWaitingDeparture || isArrived) ? 0 : (shipment.vessel_course_deg || 0),
      route_coordinates: isWaitingDeparture ? [] : (shipment.route_coordinates || [])
    };

    return {
      isWaitingDeparture,
      isArrived,
      hasVessel,
      vesselName,
      polCode,
      podName,
      etdFormatted,
      etaFormatted,
      delayedDays,
      delayedDaysFormatted,
      transitDaysText,
      mapShipmentData
    };
  }, [activeOrder, shipmentsMap]);

  if (!isOpen || !activeOrder || !trackingMetrics) return null;

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(15, 23, 42, 0.65)',
      backdropFilter: 'blur(4px)',
      zIndex: 1000,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: '1240px',
        height: '82vh',
        maxHeight: '820px',
        backgroundColor: '#ffffff',
        borderRadius: '16px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #e2e8f0',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.35)'
      }}>
        {/* 1. 모달 헤더 */}
        <div style={{
          padding: '16px 24px',
          borderBottom: '1px solid #e2e8f0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          backgroundColor: '#f8fafc'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <Ship size={22} color="#2563eb" />
            <h2 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: '#0f172a' }}>
              주문 화물(선박) 추적
            </h2>
          </div>
          <button 
            type="button"
            onClick={onClose} 
            style={{ 
              background: 'none', 
              border: 'none', 
              cursor: 'pointer', 
              color: '#64748b',
              padding: '4px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px'
            }}
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>

        {/* 2. 모달 본문 (좌측: 장비 리스트 / 우측: 상단 요약 바 + 2D 지도) */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* 좌측: 주문 장비 목록 (타임라인 리스트 개수와 1:1 동일, 모델/S/N/P/O만 표시) */}
          <div style={{
            width: '280px',
            borderRight: '1px solid #e2e8f0',
            backgroundColor: '#f8fafc',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: '1px solid #e2e8f0',
              fontSize: '13px',
              fontWeight: 700,
              color: '#334155',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <span>내 주문 장비 목록</span>
              <span style={{ 
                color: '#2563eb', 
                backgroundColor: '#eff6ff', 
                padding: '2px 8px', 
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: 700
              }}>
                {timelineOrders.length}대
              </span>
            </div>
            <div style={{ 
              flex: 1, 
              overflowY: 'auto', 
              padding: '12px', 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '8px' 
            }}>
              {timelineOrders.map((order) => {
                const isSelected = order.id === activeOrder.id || order.reference_no === activeOrder.reference_no;
                const modelName = order.product_model?.model_name || order.model_name || order.model || '-';
                return (
                  <div
                    key={order.id || order.reference_no}
                    onClick={() => setActiveOrder(order)}
                    style={{
                      padding: '12px',
                      borderRadius: '10px',
                      cursor: 'pointer',
                      backgroundColor: isSelected ? '#eff6ff' : '#ffffff',
                      border: isSelected ? '2px solid #2563eb' : '1px solid #e2e8f0',
                      transition: 'all 0.15s ease',
                      boxShadow: isSelected ? '0 2px 6px rgba(37, 99, 235, 0.12)' : 'none'
                    }}
                  >
                    <div style={{ 
                      fontSize: '14px', 
                      fontWeight: 800, 
                      color: isSelected ? '#1d4ed8' : '#0f172a', 
                      marginBottom: '4px' 
                    }}>
                      {modelName}
                    </div>
                    <div style={{ 
                      fontSize: '12px', 
                      color: '#475569', 
                      display: 'flex', 
                      justifyContent: 'space-between' 
                    }}>
                      <span>S/N: <strong>{order.serial_number || '-'}</strong></span>
                      <span>P/O: <strong>{order.reference_no || '-'}</strong></span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 우측: 필수 운항 요약 바 + 2D 평면 지도 */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* 상단 필수 정보 요약 바 (6개 핵심 KPI) */}
            <div style={{
              padding: '14px 20px',
              backgroundColor: '#ffffff',
              borderBottom: '1px solid #e2e8f0',
              display: 'grid',
              gridTemplateColumns: 'repeat(6, minmax(0, 1fr))',
              gap: '12px'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>주문 장비 (Model / S/N)</div>
                <div style={{ fontSize: '13px', fontWeight: 800, color: '#0f172a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {activeOrder.product_model?.model_name || activeOrder.model_name || '-'}
                </div>
                <div style={{ fontSize: '11px', color: '#475569' }}>
                  S/N: {activeOrder.serial_number || '-'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>선박명</div>
                <div style={{ 
                  fontSize: '13px', 
                  fontWeight: 700, 
                  color: trackingMetrics.hasVessel ? '#1d4ed8' : '#64748b',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis'
                }}>
                  {trackingMetrics.hasVessel ? `🚢 ${trackingMetrics.vesselName}` : '-'}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>출발일 (ETD)</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: trackingMetrics.etdFormatted === '-' ? '#64748b' : '#0f172a' }}>
                  {trackingMetrics.etdFormatted}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>도착예정일 (ETA)</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: trackingMetrics.etaFormatted === '-' ? '#64748b' : '#0f172a' }}>
                  {trackingMetrics.etaFormatted}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>지연된 일수</div>
                <div style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: trackingMetrics.delayedDaysFormatted === '-' 
                    ? '#64748b' 
                    : (trackingMetrics.delayedDays > 0 ? '#dc2626' : '#059669')
                }}>
                  {trackingMetrics.delayedDaysFormatted}
                </div>
              </div>

              <div>
                <div style={{ fontSize: '11px', color: '#64748b' }}>해상운항 소요</div>
                <div style={{ fontSize: '11px', color: '#64748b', marginTop: '2px', marginBottom: '2px' }}>
                  ({trackingMetrics.polCode} → {trackingMetrics.podName})
                </div>
                <div style={{ 
                  fontSize: '13px', 
                  fontWeight: 700, 
                  color: trackingMetrics.hasVessel ? '#0f172a' : '#2563eb', 
                  whiteSpace: 'nowrap', 
                  overflow: 'hidden', 
                  textOverflow: 'ellipsis' 
                }}>
                  {trackingMetrics.transitDaysText}
                </div>
              </div>
            </div>

            {/* 2D 평면 지도 영역 (출항 대기/생산 중일 때도 부산 KRPUS 위치로 지도 상시 표시) */}
            <div style={{ flex: 1, position: 'relative' }}>
              {trackingMetrics.isWaitingDeparture && (
                <div style={{
                  position: 'absolute',
                  top: '16px',
                  left: '16px',
                  zIndex: 25,
                  backgroundColor: 'rgba(255, 255, 255, 0.96)',
                  border: '1px solid #bfdbfe',
                  borderRadius: '10px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  boxShadow: '0 4px 12px rgba(15, 23, 42, 0.08)'
                }}>
                  <MapPin size={18} color="#2563eb" />
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#1e40af' }}>
                      생산완료 후 출항 (출항지: Busan, KR)
                    </div>
                    <div style={{ fontSize: '11px', color: '#475569' }}>
                      현재 장비가 생산 중 단계로 부산항(KRPUS) 위치에 표시됩니다.
                    </div>
                  </div>
                </div>
              )}

              <TrackingMapboxWidget
                shipmentData={trackingMetrics.mapShipmentData}
                defaultProjection="mercator"
                dealerPopupMode={true}
                height="100%"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
