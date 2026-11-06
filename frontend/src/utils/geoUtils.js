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
 * 지도 표시용 친화적 항구 명칭 (도시, 국가)
 */
export function getFriendlyPortName(portIdentifier, defaultName = 'PORT') {
  if (!portIdentifier) return defaultName;
  const p = String(portIdentifier).toUpperCase().trim();
  if (p.includes('PUS') || p.includes('BUS') || p.includes('부산')) return 'BUSAN, KOREA';
  if (p.includes('OSL') || p.includes('오슬로')) return 'OSLO, NORWAY';
  if (p.includes('SVG') || p.includes('STAVANGER') || p.includes('스타방에르')) return 'STAVANGER, NORWAY';
  if (p.includes('IST') || p.includes('ISTANBUL') || p.includes('이스탄불')) return 'ISTANBUL, TURKIYE';
  if (p.includes('HAM') || p.includes('HAMBURG') || p.includes('함부르크')) return 'HAMBURG, GERMANY';
  if (p.includes('RTM') || p.includes('ROTTERDAM') || p.includes('로테르담')) return 'ROTTERDAM, NETHERLANDS';
  if (p.includes('ANR') || p.includes('ANTWERP') || p.includes('안트베르펜')) return 'ANTWERP, BELGIUM';
  if (p.includes('BRV') || p.includes('BREMERHAVEN')) return 'BREMERHAVEN, GERMANY';
  if (p.includes('RJK') || p.includes('RIJEKA')) return 'RIJEKA, CROATIA';
  if (p.includes('KOP') || p.includes('KOPER')) return 'KOPER, SLOVENIA';
  return String(portIdentifier);
}

/**
 * [HMM 공식 연계] 목적지별 환적/경유항(Transit/Transshipment Port) 판별
 * 노르웨이(OSLO, STAVANGER 등)는 대형 모선이 독일 함부르크에 기항하여 피더선으로 환적 운항함
 */
export function getTransitPort(podIdentifier) {
  if (!podIdentifier) return null;
  const podStr = String(podIdentifier).toUpperCase().trim();

  // 노르웨이 권역 (오슬로, 스타방에르, 베르겐 등): 독일 함부르크 환적 경유
  if (
    podStr.includes('OSLO') || podStr.includes('NOOSL') ||
    podStr.includes('STAVANGER') || podStr.includes('NOSVG') ||
    podStr.includes('BERGEN') || podStr.includes('NOBGO')
  ) {
    return {
      name: 'HAMBURG, GERMANY',
      shortName: 'HAMBURG',
      code: 'DEHAM',
      coord: [9.9841, 53.5413],
      description: 'HMM 공식 모선 환적/경유 허브 (Transshipment Hub)'
    };
  }

  return null;
}

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
 * [HMM 공식 실제 항로 v6.0] 부산 -> 싱가포르 -> 수에즈 운하 -> 에게해 -> 터키 이스탄불 직통 해상 회랑
 * 사용자 제공 HMM 공식 루트 이미지(media_1794005553279_907a3f3b) 정밀 반영
 */
export const HMM_SUEZ_TO_ISTANBUL_ROUTE = [
  [129.0403, 35.1028], // 1. 부산 출발 (POL: BUSAN, KOREA)
  [128.50, 33.50],     // 2. 대한해협 통과
  [123.50, 27.50],     // 3. 동중국해
  [120.00, 23.00],     // 4. 대만해협 통과
  [117.50, 21.00],     // 5. 홍콩/광둥 남부 외해
  [112.50, 14.50],     // 6. 남중국해 중앙 (베트남 다낭 외해)
  [108.50, 9.50],      // 7. 베트남 남부 외해
  [105.00, 4.00],      // 8. 말레이시아 동해안 접근
  [103.80, 1.25],      // 9. 싱가포르 해협 / 말라카 해협 남동 입구
  [100.50, 3.20],      // 10. 말라카 해협 중앙
  [96.00, 5.80],       // 11. 말라카 해협 북서 출구 (인도네시아 아체 북단 외해)
  [88.00, 5.80],       // 12. 벵골만 남단 / 동인도양 횡단
  [80.50, 5.80],       // 13. 스리랑카 남단 (Dondra Head) 외해 통과
  [73.50, 8.50],       // 14. 인도 남서단 외해 / 몰디브 북부 해역
  [63.00, 12.00],      // 15. 아라비아해 중앙 대양 횡단
  [53.50, 13.00],      // 16. 소코트라섬 북부 외해 / 아덴만 동부 진입
  [48.00, 12.50],      // 17. 아덴만(Gulf of Aden) 중앙
  [43.60, 12.55],      // 18. 바브엘만데브 해협 (Bab el Mandeb)
  [42.20, 14.50],      // 19. 홍해(Red Sea) 남부
  [39.00, 19.50],      // 20. 홍해 중앙 (사우디 제다 외해)
  [35.50, 25.50],      // 21. 홍해 북부
  [33.80, 27.80],      // 22. 수에즈만 입구
  [32.55, 29.95],      // 23. 수에즈 운하 남단 (Suez)
  [32.32, 31.25],      // 24. 수에즈 운하 북단 (Port Said)
  [29.50, 33.50],      // 25. 동지중해
  [26.80, 35.30],      // 26. 그리스 크레타섬 동단 / 카소스 해협 북상
  [25.50, 37.50],      // 27. 에게해 중앙
  [26.10, 39.95],      // 28. 다르다넬스 해협 입구
  [27.00, 40.40],      // 29. 마르마라해 서부
  [28.00, 40.75],      // 30. 마르마라해 동부
  [28.9784, 41.0082]   // 31. 이스탄불항 도착 (POD: ISTANBUL, TURKIYE)
];

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
 * [HMM 공식 실제 항로 v6.0] 목적지(POD)별 지능형 해상 항로 좌표 생성
 * 사용자 제공 HMM 공식 루트 이미지 2장(오슬로, 이스탄불) 정밀 매핑
 */
export function getStandardMaritimeRoute(polCoord, podCoord, podIdentifier = '') {
  const start = (polCoord && Array.isArray(polCoord) && polCoord.length >= 2) ? polCoord : [129.0403, 35.1028];
  const dest = (podCoord && Array.isArray(podCoord) && podCoord.length >= 2) ? podCoord : [9.9841, 53.5413];
  const podStr = String(podIdentifier || '').toUpperCase();

  // 1. [HMM 공식 루트 1] 터키 이스탄불 (ISTANBUL / TRIST) -> 싱가포르 - 홍해 - 수에즈 운하 통과 직통 회랑
  if (podStr.includes('ISTANBUL') || podStr.includes('TRIST') || dest[0] > 27.5 && dest[1] > 40.0 && dest[1] < 42.0) {
    return [
      start,
      ...HMM_SUEZ_TO_ISTANBUL_ROUTE.slice(1, -1),
      dest
    ];
  }

  // 2. 지중해 / 아드리아해 기타 권역 (리예카, 코페르, 바르셀로나 등) -> 희망봉 우회 후 지브롤터 해협 경유
  const isMediterranean = 
    podStr.includes('KOPER') || podStr.includes('SIKOP') ||
    podStr.includes('RIJEKA') || podStr.includes('HRRJK') ||
    podStr.includes('BARCELONA') || podStr.includes('ESBCN') ||
    podStr.includes('VALENCIA') || podStr.includes('ESVLC') ||
    podStr.includes('GENOA') || podStr.includes('ITGOA') ||
    podStr.includes('NAPOLI') || podStr.includes('ITNAP') ||
    (dest[0] > -5.0 && dest[0] < 36.0 && dest[1] >= 34.0 && dest[1] <= 46.0);

  if (isMediterranean) {
    // 아드리아해 루트 (Koper, Rijeka)
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

    // 서지중해 (바르셀로나, 발렌시아, 제노바)
    return [
      start,
      ...COMMON_CAPE_CORRIDOR.slice(1),
      [-5.60, 35.95],  // 지브롤터 해협
      [-2.00, 36.20],  // 알보란해
      [2.50, 39.00],   // 발레아레스해
      dest
    ];
  }

  // 북서유럽 / 북유럽 대서양 북상 공통 해상 회랑 (희망봉 -> 비스케이만 -> 영국 해협 / 도버 해협)
  const northAtlanticTrunk = [
    start,
    ...COMMON_CAPE_CORRIDOR.slice(1),
    [-9.50, 41.00],   // 포르투갈 리스본/포르투 서부 외해
    [-6.00, 46.50],   // 비스케이만 외해
    [-4.50, 48.80],   // 프랑스 브레스트 외해 / 영국 해협 서부 입구
    [-1.00, 50.00],   // 영국 해협 중앙
    [1.50, 51.00]     // 도버 해협 통과
  ];

  // 3. [HMM 공식 루트 2] 노르웨이 오슬로 (OSLO / NOOSL)
  // 도버 해협 통과 후 독일 함부르크(HAMBURG)에 기항하여 환적한 후, 덴마크 서안/스카게라크 해협을 거쳐 오슬로 진입
  if (podStr.includes('OSLO') || podStr.includes('NOOSL')) {
    return [
      ...northAtlanticTrunk,
      [3.50, 52.50],   // 북해 남동부 (네덜란드 외해)
      [7.50, 53.80],   // 독일 헬골란트만 접근
      [8.50, 53.90],   // 엘베강 하구
      [9.9841, 53.5413], // ★ 독일 함부르크항 (HAMBURG, GERMANY - 중간 기항/환적 허브)
      [8.20, 54.20],   // 함부르크 출항 후 북해 복귀
      [7.20, 56.00],   // 덴마크 유틀란트반도 서안 북상
      [8.30, 57.50],   // 스카게라크 해협 서부 접근
      [9.80, 58.20],   // 스카게라크 해협 중앙 (노르웨이 남단 외해)
      [10.50, 59.10],  // 오슬로 피오르드 진입
      dest             // 오슬로 도착 (POD: OSLO, NORWAY [10.7522, 59.9139])
    ];
  }

  // 4. 노르웨이 스타방에르 (STAVANGER) / 베르겐 (BERGEN)
  // 마찬가지로 함부르크 환적 허브 기항 후 북해 북서진하여 스타방에르/베르겐 도착
  if (podStr.includes('STAVANGER') || podStr.includes('NOSVG') || podStr.includes('BERGEN') || podStr.includes('NOBGO')) {
    return [
      ...northAtlanticTrunk,
      [3.50, 52.50],   // 북해 남동부
      [7.50, 53.80],   // 독일 헬골란트만
      [8.50, 53.90],   // 엘베강 하구
      [9.9841, 53.5413], // ★ 독일 함부르크항 (HAMBURG, GERMANY - 환적 허브)
      [6.50, 55.50],   // 북해 북서진
      [5.20, 58.20],   // 스타방에르 외해
      dest             // 스타방에르 도착 [5.7331, 58.9690]
    ];
  }

  // 5. 네덜란드 로테르담 (ROTTERDAM)
  if (podStr.includes('ROTTERDAM') || podStr.includes('NLRTM')) {
    return [
      ...northAtlanticTrunk,
      [3.99, 51.95],   // 마스플락테 접근구역
      dest             // 로테르담항 [4.4777, 51.9244]
    ];
  }

  // 6. 벨기에 안트베르펜 (ANTWERP)
  if (podStr.includes('ANTWERP') || podStr.includes('BEANR')) {
    return [
      ...northAtlanticTrunk,
      [3.50, 51.40],   // 스헬더강 하구
      dest             // 안트베르펜항 [4.4025, 51.2194]
    ];
  }

  // 7. 독일 브레머하펜 (BREMERHAVEN)
  if (podStr.includes('BREMERHAVEN') || podStr.includes('DEBRV')) {
    return [
      ...northAtlanticTrunk,
      [6.50, 54.00],   // 헬골란트만
      [8.50, 53.80],   // 베저강 하구
      dest             // 브레머하펜항 [8.5724, 53.5396]
    ];
  }

  // 8. 독일 함부르크 (HAMBURG / DEHAM - 북서유럽 메인 기본)
  return [
    ...northAtlanticTrunk,
    [6.50, 54.00],   // 북해 남동부
    [8.70, 53.90],   // 엘베강 하구
    dest             // 함부르크항 [9.9841, 53.5413]
  ];
}

/**
 * 선박 현재 위치(currentCoord)를 기준으로 전체 항로를 지나온 구간(Past)과 잔여 구간(Remaining)으로 분할
 * HMM 공식 시스템과 동일하게 지나온 경로는 실선, 남은 예정 경로는 점선으로 분리 표현
 */
export function splitRouteAtCurrentPosition(fullRoute, currentCoord, isArrived = false, isWaiting = false) {
  if (!fullRoute || fullRoute.length === 0) {
    return { past: [], remaining: [] };
  }
  if (isArrived) {
    return { past: fullRoute, remaining: [] };
  }
  if (isWaiting) {
    return { past: [], remaining: fullRoute };
  }
  if (!currentCoord || !Array.isArray(currentCoord) || currentCoord.length < 2) {
    return { past: fullRoute, remaining: [] };
  }

  // fullRoute 상에서 currentCoord와 가장 가까운 세그먼트 인덱스 탐색
  let minDist = Infinity;
  let closestIdx = 0;
  for (let i = 0; i < fullRoute.length; i++) {
    const pt = fullRoute[i];
    const dx = pt[0] - currentCoord[0];
    const dy = pt[1] - currentCoord[1];
    const distSq = dx * dx + dy * dy;
    if (distSq < minDist) {
      minDist = distSq;
      closestIdx = i;
    }
  }

  const past = [...fullRoute.slice(0, closestIdx + 1), currentCoord];
  const remaining = [currentCoord, ...fullRoute.slice(closestIdx + 1)];
  return { past, remaining };
}

/**
 * [v3.0/v6.0] 선적 해상 이동 궤적을 GeoJSON FeatureCollection(지나온 실선 + 남은 점선)으로 생성
 * @param {Array} polCoord 출발항 [lng, lat]
 * @param {Array} podCoord 도착항 [lng, lat]
 * @param {Array} currentCoord 선박 현재 위치 [lng, lat]
 * @param {Array} customCoordinates 실제 TrackCargo AIS 수집 궤적 배열
 * @param {string} podIdentifier 도착항 명칭/코드
 * @param {boolean} isArrived 도착 완료 여부
 * @param {boolean} isWaiting 출항 대기 여부
 */
export function buildMaritimeRouteGeoJSON(
  polCoord, 
  podCoord, 
  currentCoord, 
  customCoordinates, 
  podIdentifier = '',
  isArrived = false,
  isWaiting = false
) {
  // 1. 완주 항로 기본 좌표열 추출
  const baseCoordinates = (customCoordinates && Array.isArray(customCoordinates) && customCoordinates.length >= 10)
    ? customCoordinates
    : getStandardMaritimeRoute(polCoord, podCoord, podIdentifier);

  // 2. 현재 선박 위치 기준 실선(지나온 길)과 점선(남은 길) 분할
  const { past, remaining } = splitRouteAtCurrentPosition(baseCoordinates, currentCoord, isArrived, isWaiting);

  const features = [];

  if (past.length > 1) {
    features.push({
      type: 'Feature',
      properties: { 
        segment: 'past',
        isRealAisRoute: Boolean(customCoordinates && customCoordinates.length >= 10)
      },
      geometry: {
        type: 'LineString',
        coordinates: past
      }
    });
  }

  if (remaining.length > 1) {
    features.push({
      type: 'Feature',
      properties: { 
        segment: 'remaining',
        isRealAisRoute: false
      },
      geometry: {
        type: 'LineString',
        coordinates: remaining
      }
    });
  }

  return {
    type: 'FeatureCollection',
    features
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

