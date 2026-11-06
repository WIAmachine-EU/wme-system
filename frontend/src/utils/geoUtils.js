/**
 * Geo & Marine Navigation Utility for WIA Global SCM ERP
 * Mapbox 기반 선적 트래킹 맵 컴포넌트 공간 연산 및 항구 좌표 라이브러리
 */

// 주요 항구 좌표 사전 (경도 Lng, 위도 Lat)
export const PORT_COORDINATES = {
  // 대한민국 주요 출발항 (POL)
  'KRPUS': [129.0403, 35.1028], // 표준 UN/LOCODE 부산항
  'KRBUS': [129.0403, 35.1028], // 오타/호환용 부산항
  'Busan': [129.0403, 35.1028],
  '부산': [129.0403, 35.1028],
  '부산항': [129.0403, 35.1028],
  'KRKAN': [127.6953, 34.9144],
  'Gwangyang': [127.6953, 34.9144],
  '광양': [127.6953, 34.9144],
  'KRUSN': [129.3789, 35.5089],
  'Ulsan': [129.3789, 35.5089],
  '울산': [129.3789, 35.5089],
  'KRINC': [126.6168, 37.4563],
  'Incheon': [126.6168, 37.4563],
  '인천': [126.6168, 37.4563],
  'KRPYT': [126.8375, 36.9839],
  'Pyeongtaek': [126.8375, 36.9839],
  '평택': [126.8375, 36.9839],

  // 유럽 및 글로벌 목적항 (POD)
  'DEHAM': [9.9841, 53.5413],
  'Hamburg': [9.9841, 53.5413],
  '함부르크': [9.9841, 53.5413],
  'NLRTM': [4.4777, 51.9244],
  'Rotterdam': [4.4777, 51.9244],
  '로테르담': [4.4777, 51.9244],
  'BEANR': [4.4025, 51.2194],
  'Antwerp': [4.4025, 51.2194],
  '안트베르펜': [4.4025, 51.2194],
  'DEBRV': [8.5724, 53.5396],
  'Bremerhaven': [8.5724, 53.5396],
  '브레머하펜': [8.5724, 53.5396],
  'FRLEH': [0.1079, 49.4944],
  'Le Havre': [0.1079, 49.4944],
  '르아브르': [0.1079, 49.4944],
  'TRIST': [28.9784, 41.0082],
  'Istanbul': [28.9784, 41.0082],
  '이스탄불': [28.9784, 41.0082],
  'HRRJK': [14.4422, 45.3271],
  'Rijeka': [14.4422, 45.3271],
  '리예카': [14.4422, 45.3271],
  'NOOSL': [10.7522, 59.9139],
  'Oslo': [10.7522, 59.9139],
  '오슬로': [10.7522, 59.9139],
  'NOSVG': [5.7331, 58.9690],
  'Stavanger': [5.7331, 58.9690],
  '스타방에르': [5.7331, 58.9690],
  'NOBGO': [5.3221, 60.3913],
  'Bergen': [5.3221, 60.3913],
  '베르겐': [5.3221, 60.3913],
  'ESBCN': [2.1734, 41.3851],
  'Barcelona': [2.1734, 41.3851],
  '바르셀로나': [2.1734, 41.3851],
  'ITNAP': [14.2681, 40.8518],
  'Napoli': [14.2681, 40.8518],
  '나폴리': [14.2681, 40.8518],
  'ESVLC': [0.3763, 39.4699],
  'Valencia': [0.3763, 39.4699],
  '발렌시아': [0.3763, 39.4699],
  'ITGOA': [8.9463, 44.4056],
  'Genoa': [8.9463, 44.4056],
  '제노바': [8.9463, 44.4056],
  'GBSOU': [-1.4043, 50.9097],
  'Southampton': [-1.4043, 50.9097],
  '사우샘프턴': [-1.4043, 50.9097],
  'SIKOP': [13.7294, 45.5481],
  'Koper': [13.7294, 45.5481],
  '코페르': [13.7294, 45.5481]
};

/**
 * 항구명 또는 코드로 좌표 검색 (기본값: 부산항)
 */
export function getPortCoordinate(portIdentifier, defaultCoord = null) {
  if (!portIdentifier) return defaultCoord || [129.0403, 35.1028];
  const cleaned = String(portIdentifier).trim();
  
  if (PORT_COORDINATES[cleaned]) return PORT_COORDINATES[cleaned];
  
  // 대소문자 무시 및 공백/특수문자 제거 정규화 검색
  const cleanStr = cleaned.replace(/[\s\(\)\/_\-\.]/g, '').toLowerCase();
  for (const key of Object.keys(PORT_COORDINATES)) {
    const cleanKey = key.replace(/[\s\(\)\/_\-\.]/g, '').toLowerCase();
    if (cleanKey === cleanStr || cleanStr.includes(cleanKey) || cleanKey.includes(cleanStr)) {
      return PORT_COORDINATES[key];
    }
  }
  
  return defaultCoord || [9.9841, 53.5413]; // 매칭 실패 시 유럽 기본항(함부르크) 안전 반환
}

/**
 * [v3.0/v5.0] 아시아-유럽 희망봉 우회 공통 간선 항로 (부산항 -> 포르투갈 남서단 세인트빈센트 곶)
 */
export const COMMON_CAPE_CORRIDOR = [
  [129.04, 35.10],  // 1. 부산 출발 (POL)
  [128.50, 33.50],  // 2. 대한해협 통과
  [123.50, 27.50],  // 3. 동중국해
  [119.50, 22.00],  // 4. 대만 남단 / 바시 해협
  [113.00, 14.00],  // 5. 남중국해 중앙
  [106.00, 3.50],   // 6. 싱가포르/말레이 해협 접근
  [105.80, -5.90],  // 7. 순다 해협 외해
  [104.50, -8.00],  // 8. 동인도양 진입
  [95.00, -12.00],  // 9. 동인도양 남하
  [85.00, -17.00],  // 10. 인도양 남부 대양 횡단
  [75.00, -21.00],  // 11. 인도양 중앙
  [65.00, -24.50],  // 12. 서인도양
  [55.00, -28.00],  // 13. 마다가스카르 동남해역
  [45.00, -31.00],  // 14. 마다가스카르 남단
  [35.00, -34.00],  // 15. 남아프리카 더반 외해
  [27.00, -35.20],  // 16. 포트엘리자베스 외해
  [20.00, -35.50],  // 17. 아굴라스곶 (아프리카 대륙 최남단)
  [17.80, -34.20],  // 18. 케이프타운 / 희망봉 통과
  [15.00, -31.50],  // 19. 남대서양 북상 진입
  [11.00, -25.00],  // 20. 나미비아 외해
  [4.00, -15.00],   // 21. 앙골라 외해
  [-2.00, -5.00],   // 22. 남대서양 적도 횡단
  [-12.00, 5.00],   // 23. 서아프리카 기니만 외해
  [-18.00, 15.00],  // 24. 세네갈 다카르 외해
  [-18.50, 24.00],  // 25. 카나리아 제도 서쪽 대서양
  [-14.00, 32.00],  // 26. 마데이라 제도 외해
  [-9.50, 36.50],   // 27. 포르투갈 세인트빈센트 곶 외해 (지중해 vs 북서유럽 해상 분기점)
];

// 레거시 호환용
export const CAPE_OF_GOOD_HOPE_WAYPOINTS = [
  ...COMMON_CAPE_CORRIDOR,
  [-9.50, 44.00],   // 비스케이만 외해
  [-5.00, 48.50],   // 프랑스 브레스트 외해
  [-0.50, 50.20],   // 영국 해협
  [2.00, 51.20],    // 도버 해협 / 북해 진입
  [3.99, 51.95],    // 로테르담 외곽
  [9.99, 53.55],    // 함부르크 도착
];
export const ASIA_EUROPE_MARITIME_CORRIDOR = CAPE_OF_GOOD_HOPE_WAYPOINTS;

/**
 * [신규 v5.1] 목적지(POD)별 지능형 해상 항로 좌표 생성
 * 도착항(ISTANBUL, ROTTERDAM, OSLO, STAVANGER, HAMBURG 등)의 지리적 위치에 따라
 * 육지를 가로지르지 않고 실제 해상 회랑을 경유하는 완주 좌표열 생성
 */
export function getStandardMaritimeRoute(polCoord, podCoord, podIdentifier = '') {
  const start = (polCoord && Array.isArray(polCoord) && polCoord.length >= 2) ? polCoord : [129.0403, 35.1028];
  const dest = (podCoord && Array.isArray(podCoord) && podCoord.length >= 2) ? podCoord : [9.9841, 53.5413];
  const podStr = String(podIdentifier || '').toUpperCase();

  // 지중해 / 흑해 권역 판별 (이스탄불, 리예카, 코페르, 바르셀로나, 발렌시아, 제노바 등)
  const isMediterranean = 
    podStr.includes('ISTANBUL') || podStr.includes('TRIST') ||
    podStr.includes('KOPER') || podStr.includes('SIKOP') ||
    podStr.includes('RIJEKA') || podStr.includes('HRRJK') ||
    podStr.includes('BARCELONA') || podStr.includes('ESBCN') ||
    podStr.includes('VALENCIA') || podStr.includes('ESVLC') ||
    podStr.includes('GENOA') || podStr.includes('ITGOA') ||
    podStr.includes('NAPOLI') || podStr.includes('ITNAP') ||
    (dest[0] > -5.0 && dest[0] < 36.0 && dest[1] >= 34.0 && dest[1] <= 46.0);

  if (isMediterranean) {
    // 1. 이스탄불 / 흑해 루트 (지브롤터 해협 -> 서지중해 -> 시칠리아 해협 -> 에게해 -> 다르다넬스 -> 이스탄불)
    if (podStr.includes('ISTANBUL') || podStr.includes('TRIST') || dest[0] > 25.0) {
      return [
        start,
        ...COMMON_CAPE_CORRIDOR.slice(1),
        [-5.60, 35.95],  // 지브롤터 해협
        [-2.00, 36.20],  // 알보란해
        [4.00, 37.50],   // 서지중해
        [11.50, 37.30],  // 시칠리아 해협
        [21.50, 36.20],  // 이오니아해 / 그리스 남단
        [25.00, 37.50],  // 에게해
        [26.10, 39.90],  // 다르다넬스 해협 입구
        [27.80, 40.70],  // 마르마라해 통과
        dest             // 이스탄불항 [28.9784, 41.0082]
      ];
    }

    // 2. 아드리아해 루트 (Koper, Rijeka)
    if (podStr.includes('KOPER') || podStr.includes('RIJEKA') || dest[1] > 44.0) {
      return [
        start,
        ...COMMON_CAPE_CORRIDOR.slice(1),
        [-5.60, 35.95],  // 지브롤터 해협
        [-2.00, 36.20],  // 알보란해
        [4.00, 37.50],   // 서지중해
        [11.50, 37.30],  // 시칠리아 해협
        [18.50, 39.50],  // 오트란토 해협
        [14.50, 43.50],  // 아드리아해 중앙
        dest
      ];
    }

    // 3. 서지중해 (바르셀로나, 발렌시아, 제노바)
    return [
      start,
      ...COMMON_CAPE_CORRIDOR.slice(1),
      [-5.60, 35.95],  // 지브롤터 해협
      [-2.00, 36.20],  // 알보란해
      [2.50, 39.00],   // 발레아레스해
      dest
    ];
  }

  // 북서유럽 / 북유럽 대서양 북상 공통 해상 회랑
  const northAtlanticTrunk = [
    start,
    ...COMMON_CAPE_CORRIDOR.slice(1),
    [-9.50, 41.00],   // 포르투갈 리스본/포르투 서부 외해
    [-6.00, 46.50],   // 비스케이만 외해
    [-4.50, 48.80],   // 프랑스 브레스트 외해 / 영국 해협 서부 입구
    [-1.00, 50.00],   // 영국 해협 중앙
    [1.50, 51.00]     // 도버 해협 통과
  ];

  // 노르웨이 오슬로 (OSLO)
  if (podStr.includes('OSLO') || podStr.includes('NOOSL')) {
    return [
      ...northAtlanticTrunk,
      [3.50, 53.50],   // 북해 남부
      [6.00, 55.50],   // 북해 동부 (덴마크 유틀란트반도 서해안)
      [8.50, 57.80],   // 스카게라크 해협 입구
      [10.00, 58.30],  // 스카게라크 해협 중앙
      [10.50, 59.20],  // 오슬로 피오르드
      dest             // 오슬로항 [10.7522, 59.9139]
    ];
  }

  // 노르웨이 스타방에르 (STAVANGER) / 베르겐 (BERGEN)
  if (podStr.includes('STAVANGER') || podStr.includes('NOSVG') || podStr.includes('BERGEN')) {
    return [
      ...northAtlanticTrunk,
      [3.50, 54.50],   // 북해 중앙
      [4.20, 57.00],   // 북해 북부
      [5.30, 58.85],   // 스타방에르 외해
      dest             // 스타방에르항 [5.7331, 58.9690]
    ];
  }

  // 네덜란드 로테르담 (ROTTERDAM)
  if (podStr.includes('ROTTERDAM') || podStr.includes('NLRTM')) {
    return [
      ...northAtlanticTrunk,
      [3.99, 51.95],   // 마스플락테 접근구역
      dest             // 로테르담항 [4.4777, 51.9244]
    ];
  }

  // 벨기에 안트베르펜 (ANTWERP)
  if (podStr.includes('ANTWERP') || podStr.includes('BEANR')) {
    return [
      ...northAtlanticTrunk,
      [3.50, 51.40],   // 스헬더강 하구
      dest             // 안트베르펜항 [4.4025, 51.2194]
    ];
  }

  // 독일 브레머하펜 (BREMERHAVEN)
  if (podStr.includes('BREMERHAVEN') || podStr.includes('DEBRV')) {
    return [
      ...northAtlanticTrunk,
      [6.50, 54.00],   // 헬골란트만
      [8.50, 53.80],   // 베저강 하구
      dest             // 브레머하펜항 [8.5724, 53.5396]
    ];
  }

  // 독일 함부르크 (HAMBURG / DEHAM - 기본 디폴트)
  return [
    ...northAtlanticTrunk,
    [6.50, 54.00],   // 북해 남동부
    [8.70, 53.90],   // 엘베강 하구
    dest             // 함부르크항 [9.9841, 53.5413]
  ];
}

/**
 * [v3.0/v5.1] 선적 해상 이동 궤적을 GeoJSON LineString으로 생성
 * @param {Array} polCoord 출발항 [lng, lat]
 * @param {Array} podCoord 도착항 [lng, lat]
 * @param {Array} currentCoord 선박 현재 위치 [lng, lat]
 * @param {Array} customCoordinates 실제 TrackCargo AIS 수집 궤적 배열 (존재 시 최우선 사용)
 * @param {string} podIdentifier 도착항 명칭/코드
 */
export function buildMaritimeRouteGeoJSON(polCoord, podCoord, currentCoord, customCoordinates, podIdentifier = '') {
  // 1. TrackCargo 실제 수신 AIS 궤적 데이터가 10개 이상 충분히 존재하면 정밀 궤적 즉시 렌더링
  if (customCoordinates && Array.isArray(customCoordinates) && customCoordinates.length >= 10) {
    return {
      type: 'Feature',
      properties: { 
        isRealAisRoute: true, 
        pointCount: customCoordinates.length 
      },
      geometry: {
        type: 'LineString',
        coordinates: customCoordinates
      }
    };
  }

  // 2. AIS 궤적이 없거나 불완전한 경우 목적지(POD)별 표준 완주 해상 항로 생성
  const baseCoordinates = getStandardMaritimeRoute(polCoord, podCoord, podIdentifier);

  return {
    type: 'Feature',
    properties: { isRealAisRoute: false, pointCount: baseCoordinates.length },
    geometry: {
      type: 'LineString',
      coordinates: baseCoordinates
    }
  };
}

/**
 * Haversine 공식을 사용한 두 위경도 간 대권 거리 계산
 * @returns {object} { km: number, nm: number } 킬로미터 및 해리(Nautical Miles)
 */
export function calculateDistance(coord1, coord2) {
  if (!coord1 || !coord2) return { km: 0, nm: 0 };
  const [lon1, lat1] = coord1;
  const [lon2, lat2] = coord2;

  const R = 6371; // 지구 반경 (km)
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const km = Math.round(R * c);
  const nm = Math.round(km * 0.539957); // 1 km = 0.539957 해리 (NM)

  return { km, nm };
}

/**
 * 목적지(POD)까지의 잔여 해상 거리 (Distance to Go)
 */
export function calculateDistanceToGo(currentCoord, podCoord) {
  return calculateDistance(currentCoord, podCoord);
}

/**
 * 두 좌표 간의 방위각 (Heading angle 0° ~ 360°)
 */
export function calculateHeading(fromCoord, toCoord) {
  if (!fromCoord || !toCoord) return 0;
  const [lon1, lat1] = fromCoord;
  const [lon2, lat2] = toCoord;

  const y = Math.sin((lon2 - lon1) * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180));
  const x =
    Math.cos(lat1 * (Math.PI / 180)) * Math.sin(lat2 * (Math.PI / 180)) -
    Math.sin(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.cos((lon2 - lon1) * (Math.PI / 180));

  let brng = Math.atan2(y, x) * (180 / Math.PI);
  return (brng + 360) % 360;
}

/**
 * 선적 지연 여부 (납기일/예정일 대비 3일 이상 지연 판정)
 */
export function checkIsDelayed(shipment) {
  if (!shipment) return false;

  // [가이드 v5.0] 이미 목적지에 도착 완료되었거나 픽업된 화물은 운송 지연 경고 즉시 해제
  const isShipmentArrived = 
    shipment.is_arrived ||
    /arrived|discharged|picked up|delivered|입고|도착/i.test(shipment.tracking_status_detail || shipment.trackcargo_status || shipment.status) ||
    (shipment.eta && new Date(shipment.eta) <= new Date());

  if (isShipmentArrived) return false;

  if (shipment.trackcargo_status === 'Delayed') return true;
  if (shipment.trackcargo_error && shipment.trackcargo_error.toLowerCase().includes('delay')) return true;

  // ETA와 원래 일정 비교 (3일 이상 차이 시)
  if (shipment.eta && shipment.etd) {
    const etdDate = new Date(shipment.etd);
    const etaDate = new Date(shipment.eta);
    const transitDays = (etaDate - etdDate) / (1000 * 60 * 60 * 24);
    // 통상 한-유럽 해상 운송은 35~40일. 45일 초과 시 지연 플래그
    if (transitDays > 45) return true;
  }
  return false;
}

/**
 * [v3.0/v5.1] 선박의 현재 진행률에 따른 위경도 산출 (실제 수집 AIS 좌표 또는 목적지별 표준 해상 항로 보간)
 */
export function estimateVesselPosition(polCoord, podCoord, etd, eta, customCoordinates, podIdentifier = '') {
  const start = (polCoord && Array.isArray(polCoord) && polCoord.length >= 2) ? polCoord : [129.0403, 35.1028];
  const dest = (podCoord && Array.isArray(podCoord) && podCoord.length >= 2) ? podCoord : [9.9841, 53.5413];

  // 1. 실제 AIS 궤적 데이터가 10개 이상 충분히 존재하는 경우
  if (customCoordinates && Array.isArray(customCoordinates) && customCoordinates.length >= 10) {
    if (!etd || !eta) {
      return customCoordinates[customCoordinates.length - 1];
    }
    const startDate = new Date(etd).getTime();
    const endDate = new Date(eta).getTime();
    const now = Date.now();

    if (now <= startDate) return customCoordinates[0];
    if (now >= endDate) return customCoordinates[customCoordinates.length - 1];

    const progress = Math.min(Math.max((now - startDate) / (endDate - startDate), 0.01), 0.99);
    const targetIdx = Math.min(Math.floor(progress * customCoordinates.length), customCoordinates.length - 1);
    return customCoordinates[targetIdx];
  }

  // 2. AIS 궤적이 없을 때 목적지(POD)별 표준 전체 해상 항로에서 위치 보간
  const routePoints = (customCoordinates && Array.isArray(customCoordinates) && customCoordinates.length > 1)
    ? customCoordinates
    : getStandardMaritimeRoute(start, dest, podIdentifier);

  if (!etd || !eta) {
    // ETD/ETA가 둘 다 없을 시 항로 30% 지점(인도양 해역) 반환
    const midIdx = Math.floor(routePoints.length * 0.3);
    return routePoints[midIdx] || routePoints[0];
  }

  const startDate = new Date(etd).getTime();
  const endDate = new Date(eta).getTime();
  const now = Date.now();

  // 출항 전일 경우: 정확히 출발항 좌표 반환
  if (now <= startDate) return [...start];
  // 도착 예정일 이후일 경우: 정확히 도착항 좌표 반환
  if (now >= endDate) return [...dest];

  const progress = Math.min(Math.max((now - startDate) / (endDate - startDate), 0.02), 0.98);

  const totalSegments = routePoints.length - 1;
  const scaledIndex = progress * totalSegments;
  const segIndex = Math.min(Math.floor(scaledIndex), totalSegments - 1);
  const segProgress = scaledIndex - segIndex;

  const p1 = routePoints[segIndex];
  const p2 = routePoints[segIndex + 1];

  if (!p1 || !p2) return routePoints[segIndex] || start;

  const currentLng = p1[0] + (p2[0] - p1[0]) * segProgress;
  const currentLat = p1[1] + (p2[1] - p1[1]) * segProgress;

  return [Number(currentLng.toFixed(4)), Number(currentLat.toFixed(4))];
}

