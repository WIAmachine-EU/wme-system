/**
 * Geo & Marine Navigation Utility for WIA Global SCM ERP
 * Mapbox 기반 선적 트래킹 맵 컴포넌트 공간 연산 및 항구 좌표 라이브러리
 */

// 주요 항구 좌표 사전 (경도 Lng, 위도 Lat)
export const PORT_COORDINATES = {
  // 대한민국 주요 출발항 (POL)
  'KRBUS': [129.0756, 35.1796],
  'Busan': [129.0756, 35.1796],
  '부산': [129.0756, 35.1796],
  '부산항': [129.0756, 35.1796],
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
  'DEHAM': [9.9937, 53.5511],
  'Hamburg': [9.9937, 53.5511],
  '함부르크': [9.9937, 53.5511],
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
export function getPortCoordinate(portIdentifier, defaultCoord = [129.0756, 35.1796]) {
  if (!portIdentifier) return defaultCoord;
  const cleaned = String(portIdentifier).trim();
  
  if (PORT_COORDINATES[cleaned]) return PORT_COORDINATES[cleaned];
  
  // 대소문자 무시 검색
  const lower = cleaned.toLowerCase();
  for (const key of Object.keys(PORT_COORDINATES)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase())) {
      return PORT_COORDINATES[key];
    }
  }
  return defaultCoord;
}

/**
 * 아시아-유럽 현실적 주요 해상 항로 웨이포인트 (마린 루트)
 */
const ASIA_EUROPE_MARITIME_CORRIDOR = [
  [129.08, 35.18],  // 부산 출발 (POL)
  [128.50, 33.50],  // 대한해협 통과
  [123.50, 27.50],  // 동중국해
  [119.50, 22.00],  // 대만 남단 / 바시 해협
  [112.00, 12.00],  // 남중국해 중앙 항로
  [104.50, 1.30],   // 싱가포르 말라카 해협 입구
  [95.00, 5.50],    // 안다만해 통과
  [80.00, 5.80],    // 스리랑카 남단
  [65.00, 11.50],   // 아라비아해 중앙
  [51.50, 12.00],   // 아덴만 입구
  [43.50, 12.60],   // 바브엘만데브 해협
  [38.00, 20.00],   // 홍해 남부
  [33.00, 27.50],   // 홍해 북부
  [32.30, 31.25],   // 수에즈 운하 북단 (포트사이드)
  [25.00, 34.50],   // 지중해 동부 (크레타섬 남단)
  [15.00, 36.50],   // 지중해 중앙 (몰타섬 인근)
  [-5.50, 36.00],   // 지브롤터 해협 통과
  [-9.50, 39.50],   // 포르투갈 해역 (대서양)
  [-9.50, 44.00],   // 비스케이만 외곽
  [-4.50, 48.50],   // 프랑스 브레스트 외곽
  [-1.00, 50.00],   // 영국 해협
  [2.50, 51.50],    // 도버 해협 북해 진입
  [8.00, 54.00],    // 북해 엘베강 하구
  [9.99, 53.55],    // 함부르크 도착 (POD)
];

/**
 * 두 좌표 간 해상 이동 궤적을 부드러운 곡선 GeoJSON으로 생성
 */
export function buildMaritimeRouteGeoJSON(polCoord, podCoord, currentCoord) {
  // 출발지와 목적지가 아시아-유럽 루트인지 판단
  const isAsiaPOL = polCoord[0] > 100;
  const isEuropePOD = podCoord[0] < 35 && podCoord[1] > 35;

  let baseCoordinates = [];

  if (isAsiaPOL && isEuropePOD) {
    // 실제 해상 통로 기반 웨이포인트 스플라인 생성
    baseCoordinates = [
      polCoord,
      [125.0, 30.0],
      [115.0, 15.0],
      [104.5, 1.3],   // 말라카
      [80.0, 5.8],    // 스리랑카
      [51.5, 12.0],   // 아덴만
      [33.0, 27.5],   // 홍해
      [20.0, 35.0],   // 지중해
      [-5.5, 36.0],   // 지브롤터
      [-9.0, 43.0],   // 대서양
      [2.0, 51.0],    // 도버
      podCoord
    ];
  } else {
    // 기본 대권 곡선 중간 지점 보간
    const midLng = (polCoord[0] + podCoord[0]) / 2;
    const midLat = (polCoord[1] + podCoord[1]) / 2 + (polCoord[0] > podCoord[0] ? 8 : -8);
    baseCoordinates = [polCoord, [midLng, midLat], podCoord];
  }

  // 선박 현재 위치가 있으면 가장 가까운 항로에 맞춤
  return {
    type: 'Feature',
    properties: {},
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
 * 선박의 현재 진행률에 따른 모의 위경도 산출 (실시간 GPS 부재 시 해상 항로 보간)
 */
export function estimateVesselPosition(polCoord, podCoord, etd, eta) {
  if (!etd || !eta) {
    // 디폴트 중간 좌표
    return [
      (polCoord[0] + podCoord[0]) / 2 + 10,
      (polCoord[1] + podCoord[1]) / 2 - 8
    ];
  }

  const startDate = new Date(etd).getTime();
  const endDate = new Date(eta).getTime();
  const now = Date.now();

  if (now <= startDate) return [...polCoord];
  if (now >= endDate) return [...podCoord];

  const progress = Math.min(Math.max((now - startDate) / (endDate - startDate), 0.05), 0.95);

  // 아시아-유럽 항로 주요 포인트 기반 위치 보간
  const routePoints = [
    polCoord,
    [125.0, 30.0],
    [115.0, 15.0],
    [104.5, 1.3],   // 말라카 해협
    [80.0, 5.8],    // 스리랑카
    [51.5, 12.0],   // 아덴만
    [33.0, 27.5],   // 홍해
    [20.0, 35.0],   // 지중해
    [-5.5, 36.0],   // 지브롤터
    [2.0, 51.0],    // 도버
    podCoord
  ];

  const totalSegments = routePoints.length - 1;
  const scaledIndex = progress * totalSegments;
  const segIndex = Math.min(Math.floor(scaledIndex), totalSegments - 1);
  const segProgress = scaledIndex - segIndex;

  const p1 = routePoints[segIndex];
  const p2 = routePoints[segIndex + 1];

  const currentLng = p1[0] + (p2[0] - p1[0]) * segProgress;
  const currentLat = p1[1] + (p2[1] - p1[1]) * segProgress;

  return [Number(currentLng.toFixed(4)), Number(currentLat.toFixed(4))];
}
