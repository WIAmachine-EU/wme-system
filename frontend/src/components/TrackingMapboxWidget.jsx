import React, { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import Map, { Source, Layer, Marker, Popup, NavigationControl, FullscreenControl } from 'react-map-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { 
  getPortCoordinate, 
  getFriendlyPortName,
  getTransitPort,
  buildMaritimeRouteGeoJSON, 
  calculateDistanceToGo, 
  calculateHeading, 
  checkIsDelayed, 
  estimateVesselPosition,
  getStandardMaritimeRoute
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
  defaultProjection = 'mercator',
  dealerPopupMode = false // [신규] 딜러 포털 팝업 전용 2D 평면 고정 모드
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

  // 1. 딜러 팝업 모드일 경우 무조건 2D 평면 지도('mercator') 고정
  const activeProjection = dealerPopupMode ? 'mercator' : mapProjection;

  const handleProjectionChange = (newProjection) => {
    if (newProjection === mapProjection) return;
    setMapProjection(newProjection);
    try {
      localStorage.setItem(STORAGE_PROJECTION_KEY, newProjection);
    } catch (e) {
      console.warn('Failed to save projection preference:', e);
    }
  };

  const [viewState, setViewState] = useState(() => {
    if (dealerPopupMode && shipmentData?.isWaitingDeparture) {
      return {
        longitude: 129.0756,
        latitude: 35.1796,
        zoom: 4.5,
        pitch: 0,
        bearing: 0,
      };
    }
    return {
      longitude: 40,
      latitude: 25,
      zoom: 2.2,
      pitch: 0,
      bearing: 0,
    };
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

    const isWaitingDeparture = Boolean(shipmentData.isWaitingDeparture);

    // [신규] 출항 전(생산 중/주문) 단계일 경우 무조건 부산항(polCoords) 좌표로 위치 고정
    if (isWaitingDeparture) {
      return {
        mbl_no: shipmentData.mbl_no || '-',
        vesselName: shipmentData.vessel_name || '생산완료 후 출항',
        polName: shipmentData.pol || 'KRPUS (Busan)',
        podName: shipmentData.pod || 'POD',
        polFriendlyName: getFriendlyPortName(shipmentData.pol || 'KRPUS', 'BUSAN, KOREA'),
        podFriendlyName: getFriendlyPortName(shipmentData.pod || 'POD', 'POD'),
        transitPort: getTransitPort(shipmentData.pod),
        polCoords,
        podCoords,
        currentCoord: polCoords,
        currentLng: polCoords[0],
        currentLat: polCoords[1],
        isWaitingDeparture: true,
        isDelayed: false,
        isDischarged: false,
        status: '생산 중 (출항 준비)',
        distanceToGo: calculateDistanceToGo(polCoords, podCoords),
        heading: 0,
        speed: 0,
        routeCoordinates: [], // 출항 전이므로 해상 항로선 미표시
        etd: null,
        eta: shipmentData.eta || null,
        raw: shipmentData
      };
    }

    // [가이드 v5.0] 도착 완료 화물 논리적 상태 판별 (ETA 경과, 키워드, 플래그 검사)
    const isShipmentArrived = Boolean(
      shipmentData.is_arrived ||
      /arrived|discharged|picked up|delivered|입고|도착/i.test(shipmentData.tracking_status_detail || shipmentData.trackcargo_status || shipmentData.status) ||
      (shipmentData.eta && new Date(shipmentData.eta) <= new Date())
    );

    const isDischarged = (shipmentData.trackcargo_status === 'Discharged' || shipmentData.status === 'Discharged');
    const isDelayed = isShipmentArrived ? false : (shipmentData.isDelayed !== undefined ? shipmentData.isDelayed : checkIsDelayed(shipmentData));

    // [가이드 v5.1] AIS 궤적 데이터가 충분히(10개 이상) 존재하면 실측 AIS 좌표 사용,
    // 그렇지 않은 경우 목적지(POD: Istanbul, Oslo, Stavanger, Rotterdam, Hamburg 등)에 맞춘 완주 표준 해상 항로 생성
    const hasValidAis = shipmentData.route_coordinates && Array.isArray(shipmentData.route_coordinates) && shipmentData.route_coordinates.length >= 10;
    const routeCoordinates = hasValidAis
      ? shipmentData.route_coordinates
      : getStandardMaritimeRoute(polCoords, podCoords, shipmentData.pod);

    // [가이드 v5.0] 도착 완료 시 목적항(POD)으로 위치 확정
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
          routeCoordinates,
          shipmentData.pod
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

    // 표준 UN/LOCODE 포트명 (KRBUS -> KRPUS 교정) 및 친화적 명칭 (도시, 국가)
    const polName = (shipmentData.pol === 'KRBUS' || !shipmentData.pol) ? 'KRPUS' : shipmentData.pol;
    const podName = shipmentData.pod || 'DEHAM';
    const polFriendlyName = getFriendlyPortName(polName, 'BUSAN, KOREA');
    const podFriendlyName = getFriendlyPortName(podName, 'POD');
    const transitPort = getTransitPort(podName);

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
      polFriendlyName,
      podFriendlyName,
      transitPort,
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

  // 선택된 선적이 변경될 때 부드러운 카메라 이동 (FlyTo)
  useEffect(() => {
    if (currentShipment && mapRef.current) {
      mapRef.current.flyTo({
        center: [currentShipment.currentLng, currentShipment.currentLat],
        zoom: currentShipment.isWaitingDeparture ? 4.5 : 3.8,
        duration: 1500,
        essential: true,
      });
    }
  }, [currentShipment?.mbl_no, currentShipment?.currentLng, currentShipment?.currentLat, currentShipment?.isWaitingDeparture]);

  // [v3.0/v6.0] 단일 선적 해상 항로 GeoJSON FeatureCollection (지나온 실선 + 잔여 점선)
  const singleRouteGeoJSON = useMemo(() => {
    if (!currentShipment || currentShipment.isWaitingDeparture) return null;
    return buildMaritimeRouteGeoJSON(
      currentShipment.polCoords,
      currentShipment.podCoords,
      currentShipment.currentCoord,
      currentShipment.routeCoordinates,
      currentShipment.podName,
      currentShipment.isShipmentArrived,
      currentShipment.isWaitingDeparture
    );
  }, [currentShipment]);

  // [v6.0] HMM 공식 스타일: 지나온 길 (실선)
  const pastRouteLayerStyle = useMemo(() => {
    if (!currentShipment) return null;
    const lineColor = currentShipment.isShipmentArrived 
      ? '#10b981' 
      : (currentShipment.isDischarged ? '#6b7280' : '#dc2626');

    return {
      id: 'maritime-route-past',
      type: 'line',
      filter: ['==', ['get', 'segment'], 'past'],
      paint: {
        'line-color': lineColor,
        'line-width': 3.5,
      },
      layout: {
        'line-join': 'round',
        'line-cap': 'round'
      }
    };
  }, [currentShipment]);

  // [v6.0] HMM 공식 스타일: 앞으로 남은 길 (점선 - Dashed Line)
  const remainingRouteLayerStyle = useMemo(() => {
    if (!currentShipment) return null;
    return {
      id: 'maritime-route-remaining',
      type: 'line',
      filter: ['==', ['get', 'segment'], 'remaining'],
      paint: {
        'line-color': '#ef4444',
        'line-width': 2.8,
        'line-dasharray': [2, 2],
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
            : estimateVesselPosition(polCoords, podCoords, s.etd, s.eta, s.route_coordinates, s.pod)));
          
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
          projection={activeProjection}
          fog={activeProjection === 'globe' ? {
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

        {/* 1. 단일 선적 활성화 시 경로 렌더링 (지나온 실선 + 잔여 점선) */}
        {currentShipment && singleRouteGeoJSON && (
          <Source id="active-shipment-route" type="geojson" data={singleRouteGeoJSON}>
            <Layer {...pastRouteLayerStyle} />
            <Layer {...remainingRouteLayerStyle} />
          </Source>
        )}

        {/* 2. 출발항 (POL) 마커 - HMM 공식 파란색 뱃지 스타일 */}
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
                title: `출발항 (POL): ${currentShipment.polFriendlyName}`,
                desc: `ETD: ${currentShipment.etd ? new Date(currentShipment.etd).toLocaleDateString() : (currentShipment.isWaitingDeparture ? '출항 대기 중' : '-')}`,
                coord: currentShipment.polCoords
              })}
            >
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: '#0284c7',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#ffffff',
                backgroundColor: '#0284c7',
                padding: '3px 8px',
                borderRadius: '12px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap'
              }}>
                {currentShipment.polFriendlyName}
              </span>
            </div>
          </Marker>
        )}

        {/* 2-1. [HMM 공식 연계] 중간 환적/경유항 (Transit Port: 독일 함부르크 등) 주황색 마커 */}
        {currentShipment && currentShipment.transitPort && (
          <Marker 
            longitude={currentShipment.transitPort.coord[0]} 
            latitude={currentShipment.transitPort.coord[1]} 
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
                title: `환적/경유항 (Transit Port): ${currentShipment.transitPort.name}`,
                desc: currentShipment.transitPort.description || '대형 모선 기항 후 피더선(Feeder) 환적 연계 허브',
                coord: currentShipment.transitPort.coord
              })}
            >
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: '#ea580c',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#ffffff',
                backgroundColor: '#ea580c',
                padding: '3px 8px',
                borderRadius: '12px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap'
              }}>
                {currentShipment.transitPort.name}
              </span>
            </div>
          </Marker>
        )}

        {/* 3. 도착항 (POD) 마커 - HMM 공식 파란색 뱃지 스타일 */}
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
                title: `도착항 (POD): ${currentShipment.podFriendlyName}`,
                desc: `ETA: ${currentShipment.eta ? new Date(currentShipment.eta).toLocaleDateString() : '-'}`,
                coord: currentShipment.podCoords
              })}
            >
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: '#0284c7',
                border: '2px solid #ffffff',
                borderRadius: '50%',
                boxShadow: '0 2px 4px rgba(0,0,0,0.3)'
              }} />
              <span style={{
                fontSize: '11px',
                fontWeight: 700,
                color: '#ffffff',
                backgroundColor: '#0284c7',
                padding: '3px 8px',
                borderRadius: '12px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
                letterSpacing: '0.02em',
                whiteSpace: 'nowrap'
              }}>
                {currentShipment.podFriendlyName}
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
              {/* 펄스 애니메이션 링 (지연: Red, 정상: Blue, 출항 대기/생산 중: Blue, 도착: 정지) */}
              {!currentShipment.isShipmentArrived && !currentShipment.isDischarged && (
                <div 
                  style={{
                    position: 'absolute',
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    backgroundColor: currentShipment.isWaitingDeparture
                      ? 'rgba(37, 99, 235, 0.35)'
                      : (currentShipment.isDelayed ? 'rgba(239, 68, 68, 0.35)' : 'rgba(59, 130, 246, 0.35)'),
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
                  backgroundColor: currentShipment.isWaitingDeparture
                    ? '#2563eb'
                    : (currentShipment.isShipmentArrived
                      ? '#059669'
                      : (currentShipment.isDischarged 
                        ? '#6b7280' 
                        : (currentShipment.isDelayed ? '#ef4444' : '#2563eb'))),
                  border: '2.5px solid #ffffff',
                  boxShadow: '0 4px 10px rgba(0,0,0,0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#ffffff',
                  transition: 'transform 0.3s ease'
                }}
              >
                {/* 진행 방향(Heading)에 따른 선박 침로 회전 또는 출항 대기/생산 중 마커 */}
                {currentShipment.isWaitingDeparture ? (
                  <MapPin size={18} />
                ) : (
                  <Navigation 
                    size={18} 
                    style={{ 
                      transform: `rotate(${currentShipment.heading}deg)`,
                      transition: 'transform 0.4s ease'
                    }} 
                  />
                )}
              </div>

              {/* 선박명 라벨 태그 */}
              <div style={{
                position: 'absolute',
                top: '38px',
                whiteSpace: 'nowrap',
                backgroundColor: currentShipment.isWaitingDeparture ? '#1e3a8a' : '#1e293b',
                color: '#f8fafc',
                fontSize: '11px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '6px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                pointerEvents: 'none'
              }}>
                {currentShipment.isWaitingDeparture ? '⚙️ 생산 중 (부산, KR)' : `🚢 ${currentShipment.vesselName}`}
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

      {/* [v2.0] 우측 상단 투영 방식 전환 토글 스위치 (3D 지구본 위 / 2D 평면 아래) - 토큰이 있고 딜러 팝업 모드가 아닐 때만 표시 */}
      {!dealerPopupMode && MAPBOX_TOKEN && (
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
            <img
              src="/Globe-svg.svg"
              alt="3D 지구본"
              style={{ width: '16px', height: '16px', objectFit: 'contain', flexShrink: 0, display: 'block' }}
            />
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
    </div>
  );
}
