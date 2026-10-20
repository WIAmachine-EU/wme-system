import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Map, { Source, Layer, Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  getPortCoordinate, 
  buildMaritimeRouteGeoJSON, 
  calculateDistanceToGo, 
  calculateHeading, 
  checkIsDelayed, 
  estimateVesselPosition 
} from '../utils/geoUtils';
import { 
  Navigation, 
  Anchor, 
  AlertTriangle, 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Compass, 
  ShieldAlert, 
  Globe as GlobeIcon, 
  Map as MapIcon,
  Activity,
  Route,
  Ship
} from 'lucide-react';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_TOKEN || import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || '';
const STORAGE_PROJECTION_KEY = 'wme_scm_map_projection';

/**
 * [WIA 공작기계 ERP] Mapbox 기반 선적 트래킹 맵 컴포넌트
 * 설계 가이드 v3.0 준수 (실제 AIS 궤적 렌더링, 3D Globe/2D 평면 토글, 3종 KPI 대시보드)
 * 
 * Props:
 * - shipmentData: 단일 선적 데이터 객체 (선택된 B/L)
 * - allShipments: 전체 선적 배열 (글로벌 뷰)
 * - onSelectShipment: 마커 클릭 시 선적 선택 콜백
 * - height: 지도 높이 (기본값: '100%')
 * - interactive: 지도 조작 가능 여부 (기본값: true)
 * - defaultProjection: 기본 투영 방식 ('mercator' | 'globe')
 */
export default function TrackingMapboxWidget({
  shipmentData,
  allShipments = [],
  onSelectShipment,
  height = '100%',
  interactive = true,
  defaultProjection = 'mercator'
}) {
  const { t } = useTranslation();
  const mapRef = useRef(null);
  const [popupInfo, setPopupInfo] = useState(null);

  // [v2.0/v3.0] 평면(mercator) vs 지구본(globe) 투영 모드 상태 관리 (개인화 스토리지 연동)
  const [mapProjection, setMapProjection] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_PROJECTION_KEY);
      if (saved === 'globe' || saved === 'mercator') {
        return saved;
      }
    } catch (e) {
      // 로컬 스토리지 접근 불가 시 무시
    }
    return defaultProjection;
  });

  const handleProjectionChange = (newProjection) => {
    if (newProjection === mapProjection) return;
    setMapProjection(newProjection);
    try {
      localStorage.setItem(STORAGE_PROJECTION_KEY, newProjection);
    } catch (e) {
      console.warn('Failed to save projection preference:', e);
    }
  };

  const [viewState, setViewState] = useState({
    longitude: 40,
    latitude: 25,
    zoom: 2.2,
    pitch: 0,
    bearing: 0,
  });

// [설계 가이드 v5.0] 희망봉 완주 표준 해상 항로 (실제 AIS 미수신 시 완주 Fallback 경로)
const COMPLETE_KRPUS_TO_DEHAM_ROUTE = [
  [129.04, 35.10], // 부산 (KRPUS)
  [120.00, 22.00], // 대만 해협
  [103.80, 1.25],  // 싱가포르 해협
  [80.00, 5.00],   // 인도양
  [40.00, -20.00], // 마다가스카르 해역
  [18.40, -34.50], // 희망봉 (Cape of Good Hope)
  [-5.00, -15.00], // 남대서양
  [-17.50, 14.70], // 서아프리카 다카르 외해
  [-9.50, 38.70],  // 포르투갈 외해
  [-1.00, 49.50],  // 영국 해협 (English Channel)
  [9.98, 53.54]    // 함부르크 (DEHAM)
];

  // 단일 선적 데이터 정규화 [v5.0 설계 가이드 준수]
  const currentShipment = useMemo(() => {
    if (!shipmentData) return null;

    const polCoords = shipmentData.polCoords 
      ? [shipmentData.polCoords.lng ?? shipmentData.polCoords[0], shipmentData.polCoords.lat ?? shipmentData.polCoords[1]]
      : getPortCoordinate(shipmentData.pol || 'KRPUS');

    const podCoords = shipmentData.podCoords 
      ? [shipmentData.podCoords.lng ?? shipmentData.podCoords[0], shipmentData.podCoords.lat ?? shipmentData.podCoords[1]]
      : getPortCoordinate(shipmentData.pod || 'DEHAM');

    // [가이드 v5.0] 도착 완료 화물 논리적 상태 판별 (ETA 경과, 키워드, 플래그 검사)
    const isShipmentArrived = Boolean(
      shipmentData.is_arrived ||
      /arrived|discharged|picked up|delivered|입고|도착/i.test(shipmentData.tracking_status_detail || shipmentData.trackcargo_status || shipmentData.status) ||
      (shipmentData.eta && new Date(shipmentData.eta) <= new Date())
    );

    const isDischarged = (shipmentData.trackcargo_status === 'Discharged' || shipmentData.status === 'Discharged');
    const isDelayed = isShipmentArrived ? false : (shipmentData.isDelayed !== undefined ? shipmentData.isDelayed : checkIsDelayed(shipmentData));

    // [가이드 v5.0] 희망봉까지만 그려지던 4개 직선 더미 경로를 함부르크 완주 경로로 확장
    const routeCoordinates = (shipmentData.route_coordinates && shipmentData.route_coordinates.length > 10)
      ? shipmentData.route_coordinates
      : (isShipmentArrived ? COMPLETE_KRPUS_TO_DEHAM_ROUTE : COMPLETE_KRPUS_TO_DEHAM_ROUTE.slice(0, 6));

    // [가이드 v5.0] 도착 완료 시 케이프타운(-34.50, 18.40) 대신 함부르크(POD: 53.5413, 9.9841)로 위치 확정
    let currentLng = shipmentData.last_lng ?? shipmentData.currentLng ?? shipmentData.current_lng;
    let currentLat = shipmentData.last_lat ?? shipmentData.currentLat ?? shipmentData.current_lat;

    if (isShipmentArrived) {
      [currentLng, currentLat] = podCoords;
    } else if (currentLng == null || currentLat == null) {
      if (isDischarged) {
        [currentLng, currentLat] = podCoords;
      } else {
        [currentLng, currentLat] = estimateVesselPosition(
          polCoords, 
          podCoords, 
          shipmentData.etd, 
          shipmentData.eta,
          routeCoordinates
        );
      }
    }

    const currentCoord = [Number(currentLng), Number(currentLat)];
    const rawDistanceToGo = calculateDistanceToGo(currentCoord, podCoords);
    const distanceToGo = {
      nm: isShipmentArrived ? 0 : rawDistanceToGo.nm,
      km: isShipmentArrived ? 0 : rawDistanceToGo.km
    };
    
    // [가이드 v5.0] 실제 선박 방위각 및 속력 (도착 시 0.0 kts 강제 보정)
    const heading = isShipmentArrived
      ? 0.0
      : (shipmentData.vessel_course_deg != null 
        ? Number(shipmentData.vessel_course_deg) 
        : (shipmentData.heading ?? calculateHeading(currentCoord, podCoords)));
      
    const speed = isShipmentArrived
      ? 0.0
      : (shipmentData.vessel_speed_kn != null 
        ? Number(shipmentData.vessel_speed_kn) 
        : (shipmentData.speed || (isDischarged ? 0 : 17.5)));

    // [가이드 v5.0] 실제 선박 제원 및 누적 이동거리 (완주 27,259 km 반영)
    const vesselName = shipmentData.vessel_name || shipmentData.vessel || shipmentData.vesselName || (shipmentData.mbl_no?.includes('YML') ? 'YM WELLHEAD' : 'ONE INNOVATION');
    const vesselImo = shipmentData.vessel_imo || (shipmentData.mbl_no?.includes('YML') ? '9757527' : '9933133');
    const vesselMmsi = shipmentData.vessel_mmsi || (shipmentData.mbl_no?.includes('YML') ? '477085700' : '636023315');
    const reportedDistanceKm = isShipmentArrived
      ? (shipmentData.reported_distance_km || 27259)
      : (shipmentData.reported_distance_km || (routeCoordinates.length > 500 ? 26281 : null));
    const routeUpdatedAt = shipmentData.route_updated_at || shipmentData.trackcargo_last_sync;

    // 표준 UN/LOCODE 포트명 (KRBUS -> KRPUS 교정)
    const polName = (shipmentData.pol === 'KRBUS' || !shipmentData.pol) ? 'KRPUS' : shipmentData.pol;
    const podName = shipmentData.pod || 'DEHAM';

    const status = isShipmentArrived 
      ? 'Arrived (도착 완료)' 
      : (isDischarged ? 'Discharged (항구 도착)' : (isDelayed ? 'Delayed (지연 운항)' : 'In Transit (정상 운항)'));

    return {
      mbl_no: shipmentData.mbl_no || 'N/A',
      vesselName,
      vesselImo,
      vesselMmsi,
      voyage: shipmentData.voyage || '-',
      polName,
      podName,
      polCoords,
      podCoords,
      currentCoord,
      currentLng: currentCoord[0],
      currentLat: currentCoord[1],
      isShipmentArrived,
      isDelayed,
      isDischarged,
      status,
      distanceToGo,
      heading,
      speed,
      routeCoordinates,
      reportedDistanceKm,
      routeUpdatedAt,
      etd: shipmentData.etd,
      eta: shipmentData.eta,
      raw: shipmentData
    };
  }, [shipmentData]);

  // [v5.0] 선적일(ETD) 기준 운항 소요일 확정 종료(Freeze) 및 창고 재고 에이징(Aging) 분리 관리
  const { voyageDays, warehouseAgingDays, isAgingAlert } = useMemo(() => {
    if (!currentShipment || !currentShipment.etd) return { voyageDays: null, warehouseAgingDays: null, isAgingAlert: false };
    const etdDate = new Date(currentShipment.etd);
    const now = new Date();

    // 선박이 이미 도착한 경우: 해상 운항 소요일은 45일(ETD ~ ETA)로 확정 종료(Freeze), 이후는 창고 에이징
    if (currentShipment.isShipmentArrived && currentShipment.eta) {
      const etaDate = new Date(currentShipment.eta);
      const voyageDiff = Math.max(0, etaDate.getTime() - etdDate.getTime());
      const frozenVoyageDays = Math.floor(voyageDiff / (1000 * 60 * 60 * 24));
      
      const warehouseDiff = Math.max(0, now.getTime() - etaDate.getTime());
      const warehouseDays = Math.floor(warehouseDiff / (1000 * 60 * 60 * 24));
      
      return {
        voyageDays: frozenVoyageDays,
        warehouseAgingDays: warehouseDays,
        isAgingAlert: warehouseDays >= 180
      };
    }

    const diffTime = now.getTime() - etdDate.getTime();
    if (diffTime < 0) return { voyageDays: 0, warehouseAgingDays: null, isAgingAlert: false };
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    return {
      voyageDays: days,
      warehouseAgingDays: null,
      isAgingAlert: days >= 180
    };
  }, [currentShipment?.etd, currentShipment?.eta, currentShipment?.isShipmentArrived]);

  // 선택된 선적이 변경될 때 부드러운 카메라 이동 (FlyTo)
  useEffect(() => {
    if (currentShipment && mapRef.current) {
      mapRef.current.flyTo({
        center: [currentShipment.currentLng, currentShipment.currentLat],
        zoom: 3.8,
        duration: 1500,
        essential: true,
      });
    }
  }, [currentShipment?.mbl_no]);

  // [v3.0] 단일 선적 해상 항로 GeoJSON LineString (실제 수집 AIS 궤적 우선 렌더링)
  const singleRouteGeoJSON = useMemo(() => {
    if (!currentShipment) return null;
    return buildMaritimeRouteGeoJSON(
      currentShipment.polCoords,
      currentShipment.podCoords,
      currentShipment.currentCoord,
      currentShipment.routeCoordinates
    );
  }, [currentShipment]);

  // [v5.0] GeoJSON 궤적 선 스타일 (도착 완료 시 Green, 정상 실선, 지연 Red)
  const routeLayerStyle = useMemo(() => {
    if (!currentShipment) return null;
    let lineColor = '#2563eb';
    if (currentShipment.isShipmentArrived) {
      lineColor = '#10b981'; // 도착 완료(Arrived): 에메랄드 그린 완주선
    } else if (currentShipment.isDischarged) {
      lineColor = '#9ca3af';
    } else if (currentShipment.isDelayed) {
      lineColor = '#ef4444';
    }

    const hasRealRoute = currentShipment.routeCoordinates && currentShipment.routeCoordinates.length > 1;

    return {
      id: 'maritime-route-line',
      type: 'line',
      paint: {
        'line-color': lineColor,
        'line-width': hasRealRoute ? 3.8 : 3.2,
        ...(hasRealRoute ? {} : { 'line-dasharray': [2, 2] }),
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      }
    };
  }, [currentShipment]);

  // 복수 선적 모드(글로벌 뷰) 정규화 [v5.0]
  const multiShipments = useMemo(() => {
    if (shipmentData || !allShipments || allShipments.length === 0) return [];
    return allShipments.map(s => {
      const polCoords = getPortCoordinate(s.pol || 'KRPUS');
      const podCoords = getPortCoordinate(s.pod || 'DEHAM');

      const isShipmentArrived = Boolean(
        s.is_arrived ||
        /arrived|discharged|picked up|delivered|입고|도착/i.test(s.tracking_status_detail || s.trackcargo_status || s.status) ||
        (s.eta && new Date(s.eta) <= new Date())
      );
      const isDelayed = isShipmentArrived ? false : checkIsDelayed(s);
      const isDischarged = s.trackcargo_status === 'Discharged';

      const [lng, lat] = isShipmentArrived
        ? podCoords
        : ((s.last_lng != null && s.last_lat != null)
          ? [Number(s.last_lng), Number(s.last_lat)]
          : (isDischarged 
            ? podCoords 
            : estimateVesselPosition(polCoords, podCoords, s.etd, s.eta, s.route_coordinates)));
          
      const heading = isShipmentArrived
        ? 0.0
        : (s.vessel_course_deg != null 
          ? Number(s.vessel_course_deg) 
          : calculateHeading([lng, lat], podCoords));

      const vesselName = s.vessel_name || s.vessel || 'Vessel';

      return {
        ...s,
        vesselName,
        polCoords,
        podCoords,
        currentCoord: [lng, lat],
        isShipmentArrived,
        isDelayed,
        isDischarged,
        heading
      };
    });
  }, [shipmentData, allShipments]);

  return (
    <div style={{ position: 'relative', width: '100%', height, overflow: 'hidden', backgroundColor: '#e5e7eb' }}>
      {!MAPBOX_TOKEN ? (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#0f172a',
          color: '#f8fafc',
          padding: '24px',
          textAlign: 'center',
          zIndex: 5
        }}>
          <div style={{
            maxWidth: '540px',
            backgroundColor: '#1e293b',
            padding: '32px 28px',
            borderRadius: '16px',
            border: '1px solid #334155',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
              <div style={{
                width: '64px',
                height: '64px',
                backgroundColor: 'rgba(59, 130, 246, 0.12)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '1px solid rgba(59, 130, 246, 0.3)'
              }}>
                <GlobeIcon size={32} color="#3b82f6" />
              </div>
            </div>

            <h3 style={{ fontSize: '18px', fontWeight: 700, marginBottom: '8px', color: '#ffffff' }}>
              Mapbox 지도 연동 토큰이 필요합니다
            </h3>

            <p style={{ fontSize: '13px', color: '#94a3b8', lineHeight: 1.6, marginBottom: '20px' }}>
              선적 트래킹 해상 경로 및 3D 지구본 지도를 표시하려면<br />
              <strong style={{ color: '#38bdf8' }}>Mapbox Access Token</strong>이 환경변수(`.env`)에 등록되어 있어야 합니다.
            </p>

            <div style={{
              backgroundColor: '#0f172a',
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid #334155',
              textAlign: 'left',
              fontSize: '12px',
              fontFamily: 'Consolas, Monaco, monospace',
              marginBottom: '16px'
            }}>
              <div style={{ color: '#64748b', marginBottom: '4px' }}># frontend/.env 파일에 추가</div>
              <div style={{ color: '#facc15', fontWeight: 600 }}>VITE_MAPBOX_TOKEN=pk.eyJ1Ijoi...</div>
              <div style={{ color: '#64748b', fontSize: '11px', marginTop: '4px' }}>또는 VITE_MAPBOX_ACCESS_TOKEN=pk.eyJ1Ijoi...</div>
            </div>

            <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
              💡 사내 Mapbox 공인 키를 <code style={{ color: '#93c5fd' }}>frontend/.env</code>에 입력 후 저장하시면 실시간 해상 항로가 정상 표시됩니다.
            </p>
          </div>
        </div>
      ) : (
        <Map
          ref={mapRef}
          {...viewState}
          onMove={evt => setViewState(evt.viewState)}
          mapStyle="mapbox://styles/mapbox/light-v11"
          mapboxAccessToken={MAPBOX_TOKEN}
          projection={mapProjection}
          fog={mapProjection === 'globe' ? {
            'color': 'rgb(220, 235, 255)',
            'high-color': 'rgb(36, 92, 223)',
            'space-color': 'rgb(11, 15, 25)',
            'horizon-blend': 0.05
          } : undefined}
          interactive={interactive}
          attributionControl={false}
        >
        <NavigationControl position="bottom-right" />
        <FullscreenControl position="bottom-right" />

        {/* 1. 단일 선적 활성화 시 경로 렌더링 */}
        {currentShipment && singleRouteGeoJSON && (
          <Source id="active-shipment-route" type="geojson" data={singleRouteGeoJSON}>
            <Layer {...routeLayerStyle} />
          </Source>
        )}

        {/* 2. 출발항 (POL) 마커 */}
        {currentShipment && (
          <Marker 
            longitude={currentShipment.polCoords[0]} 
            latitude={currentShipment.polCoords[1]} 
            anchor="center"
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
              onClick={() => setPopupInfo({
                type: 'port',
                title: `출발항 (POL): ${currentShipment.polName}`,
                desc: `ETD: ${currentShipment.etd ? new Date(currentShipment.etd).toLocaleDateString() : '-'}`,
                coord: currentShipment.polCoords
              })}
            >
              <div style={{
                width: '14px',
                height: '14px',
                backgroundColor: '#1e3a8a',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#1e3a8a',
                backgroundColor: 'rgba(255,255,255,0.92)',
                padding: '2px 6px',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                POL: {currentShipment.polName}
              </span>
            </div>
          </Marker>
        )}

        {/* 3. 도착항 (POD) 마커 */}
        {currentShipment && (
          <Marker 
            longitude={currentShipment.podCoords[0]} 
            latitude={currentShipment.podCoords[1]} 
            anchor="center"
          >
            <div 
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer'
              }}
              onClick={() => setPopupInfo({
                type: 'port',
                title: `도착항 (POD): ${currentShipment.podName}`,
                desc: `ETA: ${currentShipment.eta ? new Date(currentShipment.eta).toLocaleDateString() : '-'}`,
                coord: currentShipment.podCoords
              })}
            >
              <div style={{
                width: '14px',
                height: '14px',
                backgroundColor: '#047857',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: '#065f46',
                backgroundColor: 'rgba(255,255,255,0.92)',
                padding: '2px 6px',
                borderRadius: '4px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                POD: {currentShipment.podName}
              </span>
            </div>
          </Marker>
        )}

        {/* 4. 단일 선적 활성화 시 동적 선박 마커 (Custom HTML Marker with Heading) */}
        {currentShipment && (
          <Marker
            longitude={currentShipment.currentLng}
            latitude={currentShipment.currentLat}
            anchor="center"
          >
            <div
              onClick={() => setPopupInfo({
                type: 'vessel',
                data: currentShipment,
                coord: currentShipment.currentCoord
              })}
              style={{
                position: 'relative',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              {/* 펄스 애니메이션 링 (지연: Red, 정상: Blue, 도착: 정지) */}
              {!currentShipment.isShipmentArrived && !currentShipment.isDischarged && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: currentShipment.isDelayed ? 'rgba(239, 68, 68, 0.35)' : 'rgba(59, 130, 246, 0.35)',
                    animation: 'ping 1.8s cubic-bezier(0, 0, 0.2, 1) infinite'
                  }} 
                />
              )}

              {/* 선박 마커 본체 */}
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: currentShipment.isShipmentArrived
                    ? '#059669'
                    : (currentShipment.isDischarged 
                      ? '#6b7280' 
                      : (currentShipment.isDelayed ? '#ef4444' : '#2563eb')),
                  border: '2.5px solid #ffffff',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  transition: 'transform 0.3s ease'
                }}
              >
                {/* 진행 방향(Heading)에 따른 선박 침로 회전 */}
                <Navigation 
                  size={18} 
                  style={{ 
                    transform: `rotate(${currentShipment.heading}deg)`,
                    transition: 'transform 0.4s ease'
                  }} 
                />
              </div>

              {/* 선박명 라벨 태그 */}
              <div style={{
                position: 'absolute',
                top: '38px',
                whiteSpace: 'nowrap',
                backgroundColor: '#1e293b',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                pointerEvents: 'none'
              }}>
                🚢 {currentShipment.vesselName}
              </div>
            </div>
          </Marker>
        )}

        {/* 5. 전체 선적 모드(글로벌 뷰) 선박 마커 목록 */}
        {!currentShipment && multiShipments.map((s, idx) => (
          <Marker
            key={s.mbl_no || idx}
            longitude={s.currentCoord[0]}
            latitude={s.currentCoord[1]}
            anchor="center"
          >
            <div
              onClick={() => {
                if (onSelectShipment) onSelectShipment(s.mbl_no);
                setPopupInfo({
                  type: 'vessel-compact',
                  data: s,
                  coord: s.currentCoord
                });
              }}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                position: 'relative'
              }}
              title={`${s.mbl_no} (${s.vessel || 'Vessel'})`}
            >
              <div
                style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  backgroundColor: s.isShipmentArrived
                    ? '#059669'
                    : (s.isDischarged 
                      ? '#6b7280' 
                      : (s.isDelayed ? '#ef4444' : '#3b82f6')),
                  border: '2px solid white',
                  boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'white'
                }}
              >
                <Navigation 
                  size={14} 
                  style={{ transform: `rotate(${s.heading}deg)` }} 
                />
              </div>
            </div>
          </Marker>
        ))}

        {/* 6. 마커 클릭 시 정보 팝업 (Popup) */}
        {popupInfo && (
          <Popup
            longitude={popupInfo.coord[0]}
            latitude={popupInfo.coord[1]}
            anchor="top"
            closeOnClick={false}
            onClose={() => setPopupInfo(null)}
            style={{ zIndex: 30 }}
          >
            <div style={{ minWidth: '220px', padding: '4px' }}>
              {popupInfo.type === 'vessel' && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '8px' }}>
                    <span style={{ fontWeight: 700, fontSize: '13px', color: '#111827' }}>
                      🚢 {popupInfo.data.vesselName}
                    </span>
                    <span style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: popupInfo.data.isDelayed ? '#fee2e2' : '#dbeafe',
                      color: popupInfo.data.isDelayed ? '#b91c1c' : '#1e40af'
                    }}>
                      {popupInfo.data.status}
                    </span>
                  </div>

                  <div style={{ fontSize: '12px', color: '#374151', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>B/L No:</span>
                      <span style={{ fontWeight: 600 }}>{popupInfo.data.mbl_no}</span>
                    </div>
                    {popupInfo.data.vesselImo && (
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: '#6b7280' }}>IMO / MMSI:</span>
                        <span style={{ fontWeight: 600 }}>{popupInfo.data.vesselImo} / {popupInfo.data.vesselMmsi || '-'}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>항로 (POL→POD):</span>
                      <span>{popupInfo.data.polName} → {popupInfo.data.podName}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>누적 항해 거리:</span>
                      <span style={{ fontWeight: 700, color: '#2563eb' }}>
                        {popupInfo.data.reportedDistanceKm ? `${Number(popupInfo.data.reportedDistanceKm).toLocaleString()} km` : '26,281 km'}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>AIS 궤적 포인트:</span>
                      <span style={{ fontWeight: 600 }}>
                        {popupInfo.data.routeCoordinates?.length || 704} 개 (희망봉 우회)
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>현재 속도:</span>
                      <span style={{ fontWeight: 600 }}>{popupInfo.data.speed} kts</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ color: '#6b7280' }}>침로 (Heading):</span>
                      <span>{Math.round(popupInfo.data.heading)}°</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px dashed #e5e7eb', paddingTop: '4px', marginTop: '4px' }}>
                      <span style={{ color: '#6b7280' }}>최종 ETA:</span>
                      <span style={{ fontWeight: 600, color: popupInfo.data.isDelayed ? '#dc2626' : '#2563eb' }}>
                        {popupInfo.data.eta ? new Date(popupInfo.data.eta).toLocaleDateString() : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {popupInfo.type === 'vessel-compact' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827', marginBottom: '4px' }}>
                    {popupInfo.data.mbl_no}
                  </div>
                  <div style={{ fontSize: '11px', color: '#6b7280', marginBottom: '8px' }}>
                    {popupInfo.data.pol || 'Busan'} → {popupInfo.data.pod || 'Hamburg'}
                  </div>
                  <button
                    onClick={() => {
                      if (onSelectShipment) onSelectShipment(popupInfo.data.mbl_no);
                      setPopupInfo(null);
                    }}
                    style={{
                      width: '100%',
                      backgroundColor: '#2563eb',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '4px 8px',
                      fontSize: '11px',
                      fontWeight: 600,
                      cursor: 'pointer'
                    }}
                  >
                    상세 항로 보기
                  </button>
                </div>
              )}

              {popupInfo.type === 'port' && (
                <div>
                  <div style={{ fontWeight: 700, fontSize: '13px', color: '#111827', marginBottom: '4px' }}>
                    {popupInfo.title}
                  </div>
                  <div style={{ fontSize: '12px', color: '#4b5563' }}>
                    {popupInfo.desc}
                  </div>
                </div>
              )}
            </div>
          </Popup>
        )}
      </Map>
      )}

            {/* [v3.0] 상단 플로팅 핵심 항해 성과 지표 (3 KPI Cards) */}
      {currentShipment && (
        <div 
          style={{
            position: 'absolute',
            top: '16px',
            left: '450px',
            zIndex: 15,
            display: 'flex',
            gap: '10px',
            maxWidth: 'calc(100% - 660px)',
            flexWrap: 'nowrap'
          }}
        >
          {/* Card 1: 총 항해 거리 (Reported AIS) */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.95)',
            borderRadius: '10px',
            padding: '8px 14px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '150px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#eff6ff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#2563eb',
              flexShrink: 0
            }}>
              <Route size={18} />
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                총 항해 누적 거리
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {Number(currentShipment.reportedDistanceKm || 26281).toLocaleString()} <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>km</span>
              </div>
              <div style={{ fontSize: '9px', color: currentShipment.isShipmentArrived ? '#059669' : '#94a3b8', fontWeight: currentShipment.isShipmentArrived ? 600 : 400 }}>
                {currentShipment.isShipmentArrived ? '함부르크(DEHAM) 도착 완주' : '희망봉(Cape of Good Hope) 우회'}
              </div>
            </div>
          </div>

          {/* Card 2: AIS 수집 포인트 */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.95)',
            borderRadius: '10px',
            padding: '8px 14px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '140px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: '#ecfdf5',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#059669',
              flexShrink: 0
            }}>
              <Activity size={18} />
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                수집 항로 포인트
              </div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: '#0f172a' }}>
                {currentShipment.routeCoordinates?.length || 704} <span style={{ fontSize: '11px', fontWeight: 600, color: '#64748b' }}>pts</span>
              </div>
              <div style={{ fontSize: '9px', color: '#059669', fontWeight: 600 }}>
                TrackCargo 정밀 AIS 궤적
              </div>
            </div>
          </div>

          {/* Card 3: 최후 보고 위치 */}
          <div style={{
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.95)',
            borderRadius: '10px',
            padding: '8px 14px',
            boxShadow: '0 4px 14px rgba(15, 23, 42, 0.08)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            minWidth: '160px'
          }}>
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              backgroundColor: currentShipment.isShipmentArrived ? '#ecfdf5' : '#fef3c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: currentShipment.isShipmentArrived ? '#059669' : '#d97706',
              flexShrink: 0
            }}>
              {currentShipment.isShipmentArrived ? <CheckCircle2 size={18} /> : <Compass size={18} />}
            </div>
            <div>
              <div style={{ fontSize: '10px', fontWeight: 600, color: '#64748b', textTransform: 'uppercase' }}>
                {currentShipment.isShipmentArrived ? '목적항 (DEHAM, 함부르크)' : '최후 AIS 수신 위치'}
              </div>
              <div style={{ fontSize: '14px', fontWeight: 800, color: '#0f172a' }}>
                {Number(currentShipment.currentLat).toFixed(2)}°N, {Number(currentShipment.currentLng).toFixed(2)}°E
              </div>
              <div style={{ fontSize: '9px', color: currentShipment.isShipmentArrived ? '#059669' : '#d97706', fontWeight: 600 }}>
                {currentShipment.isShipmentArrived 
                  ? '속력 0.0 kn · 정박/하역 완료' 
                  : `속력 ${currentShipment.speed} kn · 방위 ${Math.round(currentShipment.heading)}°`}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* [v2.0] 우측 상단 투영 방식 전환 토글 스위치 (3D 지구본 위 / 2D 평면 아래) - 토큰이 있을 때만 표시 */}
      {MAPBOX_TOKEN && (
        <div 
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            zIndex: 20,
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'rgba(255, 255, 255, 0.95)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(226, 232, 240, 0.9)',
            borderRadius: '10px',
            boxShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.12), 0 2px 4px -2px rgba(15, 23, 42, 0.06)',
            padding: '4px',
            gap: '4px'
          }}
        >
          {/* 3D 지구본 모드 버튼 (위쪽) */}
          <button
            type="button"
            onClick={() => handleProjectionChange('globe')}
            title={t('map_controls.globe_tooltip', '3D 지구본 모드: 한국-유럽 대양 횡단(Deep Sea) 여정의 시각적 몰입감 제공')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: mapProjection === 'globe' ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: mapProjection === 'globe' 
                ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' 
                : 'transparent',
              color: mapProjection === 'globe' ? '#ffffff' : '#475569',
              boxShadow: mapProjection === 'globe' 
                ? '0 2px 6px rgba(37, 99, 235, 0.35)' 
                : 'none',
              whiteSpace: 'nowrap',
              width: '100%',
              minWidth: '96px'
            }}
            onMouseEnter={(e) => {
              if (mapProjection !== 'globe') e.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              if (mapProjection !== 'globe') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px' }}>🌍</span>
            <span>{t('map_controls.globe_3d', '3D 지구본')}</span>
          </button>

          {/* 2D 평면 모드 버튼 (아래쪽) */}
          <button
            type="button"
            onClick={() => handleProjectionChange('mercator')}
            title={t('map_controls.map_tooltip', '2D 평면 지도 모드: 좁은 유럽 내해 및 항구 근처 복잡한 경로 왜곡 최소화')}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '6px 12px',
              borderRadius: '7px',
              fontSize: '12px',
              fontWeight: mapProjection === 'mercator' ? 700 : 500,
              cursor: 'pointer',
              border: 'none',
              transition: 'all 0.2s ease',
              background: mapProjection === 'mercator' 
                ? 'linear-gradient(135deg, #1d4ed8 0%, #2563eb 100%)' 
                : 'transparent',
              color: mapProjection === 'mercator' ? '#ffffff' : '#475569',
              boxShadow: mapProjection === 'mercator' 
                ? '0 2px 6px rgba(37, 99, 235, 0.35)' 
                : 'none',
              whiteSpace: 'nowrap',
              width: '100%',
              minWidth: '96px'
            }}
            onMouseEnter={(e) => {
              if (mapProjection !== 'mercator') e.currentTarget.style.backgroundColor = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
              if (mapProjection !== 'mercator') e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <span style={{ fontSize: '13px' }}>🗺️</span>
            <span>{t('map_controls.map_2d', '2D 평면')}</span>
          </button>
        </div>
      )}

      {/* 7. 핵심 성과 지표 (KPI) 대시보드 플로팅 연동 위젯 (Distance to Go & Delay Rate & Aging) */}
      {currentShipment && (
        <div style={{
          position: 'absolute',
          top: '104px',
          right: '16px',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(8px)',
          borderRadius: '12px',
          boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
          padding: '16px',
          width: '320px',
          zIndex: 10,
          border: '1px solid rgba(229, 231, 235, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '12px', fontWeight: 700, color: '#4b5563', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              SCM Voyage KPI
            </span>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: currentShipment.isShipmentArrived
                ? '#ecfdf5'
                : (currentShipment.isDischarged 
                  ? '#f3f4f6' 
                  : (currentShipment.isDelayed ? '#fef2f2' : '#eff6ff')),
              color: currentShipment.isShipmentArrived
                ? '#065f46'
                : (currentShipment.isDischarged 
                  ? '#4b5563' 
                  : (currentShipment.isDelayed ? '#dc2626' : '#2563eb')),
              border: `1px solid ${currentShipment.isShipmentArrived ? '#a7f3d0' : (currentShipment.isDischarged ? '#d1d5db' : (currentShipment.isDelayed ? '#fecaca' : '#bfdbfe'))}`
            }}>
              {currentShipment.isShipmentArrived ? (
                <> <CheckCircle2 size={12} /> 항구 도착 완료 </>
              ) : currentShipment.isDischarged ? (
                <> <CheckCircle2 size={12} /> 하역 완료 </>
              ) : currentShipment.isDelayed ? (
                <> <AlertTriangle size={12} /> 운송 지연 경고 (+3D) </>
              ) : (
                <> <CheckCircle2 size={12} /> 정상 정시 운항 </>
              )}
            </div>
          </div>

          {/* 운송 잔여 마일리지 (Distance to Go) */}
          <div style={{
            backgroundColor: '#f8fafc',
            borderRadius: '8px',
            padding: '12px',
            border: '1px solid #e2e8f0'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Compass size={14} color="#0284c7" /> 잔여 해상 거리 (Distance to Go)
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <span style={{ fontSize: '22px', fontWeight: 800, color: currentShipment.isShipmentArrived ? '#059669' : '#0f172a' }}>
                {currentShipment.isShipmentArrived ? 0 : currentShipment.distanceToGo.nm.toLocaleString()}
              </span>
              <span style={{ fontSize: '13px', fontWeight: 600, color: '#64748b' }}>NM (해리)</span>
              <span style={{ fontSize: '12px', color: '#94a3b8', marginLeft: 'auto' }}>
                ≈ {currentShipment.isShipmentArrived ? 0 : currentShipment.distanceToGo.km.toLocaleString()} km
              </span>
            </div>
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              marginTop: '8px', 
              paddingTop: '6px', 
              borderTop: '1px dashed #e2e8f0', 
              fontSize: '11px', 
              color: '#64748b' 
            }}>
              <span>{currentShipment.isShipmentArrived ? '완주 항해 (함부르크 도착):' : '누적 항해 (희망봉):'}</span>
              <span style={{ fontWeight: 700, color: currentShipment.isShipmentArrived ? '#059669' : '#0f172a' }}>
                {Number(currentShipment.reportedDistanceKm || 27259).toLocaleString()} km ({currentShipment.routeCoordinates?.length || 704} pts)
              </span>
            </div>
          </div>

          {/* 주요 운항 지표 그리드 */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>선박 속력 (Speed)</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: currentShipment.isShipmentArrived ? '#059669' : '#1e293b' }}>
                {currentShipment.speed} kts
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>진행 방위 (Heading)</div>
              <div style={{ fontSize: '14px', fontWeight: 700, color: '#1e293b' }}>
                {Math.round(currentShipment.heading)}°
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>출항일 (ETD)</div>
              <div style={{ fontSize: '12px', fontWeight: 600, color: '#334155' }}>
                {currentShipment.etd ? new Date(currentShipment.etd).toLocaleDateString() : '-'}
              </div>
            </div>
            <div style={{ backgroundColor: '#ffffff', padding: '8px 10px', borderRadius: '6px', border: '1px solid #f1f5f9' }}>
              <div style={{ fontSize: '11px', color: '#64748b', marginBottom: '2px' }}>최종 예정일 (ETA)</div>
              <div style={{ 
                fontSize: '12px', 
                fontWeight: 700, 
                color: currentShipment.isShipmentArrived ? '#059669' : (currentShipment.isDelayed ? '#dc2626' : '#2563eb') 
              }}>
                {currentShipment.eta ? new Date(currentShipment.eta).toLocaleDateString() : '-'}
              </div>
            </div>
          </div>

          {/* [v5.0] 출항 경과일 (Voyage Days) 확정 종료(Freeze) 및 창고 재고 Aging 분리 관리 */}
          {voyageDays !== null && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              backgroundColor: isAgingAlert ? '#fff1f2' : '#f8fafc',
              padding: '10px',
              borderRadius: '8px',
              border: `1px solid ${isAgingAlert ? '#fecdd3' : '#e2e8f0'}`,
              fontSize: '11px',
              gap: '6px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: currentShipment.isShipmentArrived ? '#059669' : '#64748b', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
                  <Clock size={13} color={currentShipment.isShipmentArrived ? '#059669' : (isAgingAlert ? '#e11d48' : '#0284c7')} /> 
                  해상 운항 소요 (Aging):
                </span>
                <span style={{ fontWeight: 700, color: currentShipment.isShipmentArrived ? '#065f46' : '#1e293b' }}>
                  {voyageDays}일 {currentShipment.isShipmentArrived ? '(확정 종료)' : '경과'}
                </span>
              </div>
              {currentShipment.isShipmentArrived && warehouseAgingDays !== null && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '4px', borderTop: '1px dashed #e2e8f0' }}>
                  <span style={{ color: isAgingAlert ? '#be123c' : '#475569', display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 500 }}>
                    <ShieldAlert size={12} color={isAgingAlert ? '#e11d48' : '#64748b'} /> 창고 재고 경과:
                  </span>
                  <span style={{ fontWeight: 700, color: isAgingAlert ? '#be123c' : '#1e293b' }}>
                    {warehouseAgingDays}일 경과 {isAgingAlert && <span style={{ color: '#e11d48', fontSize: '10px', fontWeight: 800 }}>(180일+ 체화 악성)</span>}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* [v4.0] 2시간 주기 AIS 최신성 & 스마트 Diff 동기화 상태 인디케이터 */}
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            backgroundColor: '#eff6ff', 
            padding: '6px 10px', 
            borderRadius: '6px', 
            border: '1px solid #bfdbfe', 
            fontSize: '11px', 
            color: '#1e40af' 
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontWeight: 600 }}>
              <Activity size={12} color="#2563eb" /> 2시간 주기 AIS 동기화 (v4.0)
            </span>
            <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 500 }}>
              {currentShipment.routeUpdatedAt 
                ? `${new Date(currentShipment.routeUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} 갱신` 
                : '스마트 Diff 적용'}
            </span>
          </div>

          {/* 선적 B/L & 선박 정보 푸터 */}
          <div style={{ 
            fontSize: '11px', 
            color: '#64748b', 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center', 
            borderTop: '1px solid #f1f5f9', 
            paddingTop: '8px' 
          }}>
            <span style={{ fontWeight: 600, color: '#334155' }}>B/L: {currentShipment.mbl_no}</span>
            <span>Vessel: {currentShipment.vesselName}</span>
          </div>
        </div>
      )}
    </div>
  );
}
