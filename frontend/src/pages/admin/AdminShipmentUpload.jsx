import React, { useState, useRef, useEffect, useMemo } from 'react';
import { 
  UploadCloud, 
  CheckCircle, 
  AlertTriangle, 
  Download, 
  Loader2, 
  FileSpreadsheet, 
  X, 
  Check, 
  Clipboard, 
  Lock, 
  Ship, 
  RefreshCw, 
  Calendar, 
  ChevronRight, 
  ChevronDown, 
  Search, 
  Copy, 
  Package, 
  Anchor, 
  ListFilter 
} from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function AdminShipmentUpload({ isMobileView }) {
  // ================= [ 우측: 선적정보 업로드 State ] =================
  const [data, setData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null); // 'idle', 'success', 'error'
  const [isDragging, setIsDragging] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [drmModalInfo, setDrmModalInfo] = useState(null);
  
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // ================= [ 좌측: 선적내역 리스트 State ] =================
  const [historyList, setHistoryList] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);
  const [selectedYear, setSelectedYear] = useState('ALL'); // 'ALL', '2026', '2025', '2024', ...
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedMbl, setExpandedMbl] = useState(null);
  const [copiedMbl, setCopiedMbl] = useState(null);

  // 브라우저 너비 감지
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1200
  );

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const isMobile = isMobileView !== undefined ? isMobileView : windowWidth <= 1024;

  // ================= [ 선적내역 리스트 API 조회 ] =================
  const fetchShipmentHistory = async () => {
    setIsLoadingHistory(true);
    setHistoryError(null);
    try {
      // include_all=true: 도착 완료된 선적(HDMUSELE22174500 등) 포함 전체 업로드 이력 조회
      const res = await fetch('/api/shipments?include_all=true');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setHistoryList(json || []);
    } catch (err) {
      console.error('Failed to fetch shipment history:', err);
      setHistoryError('선적내역을 불러오는 중 오류가 발생했습니다.');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchShipmentHistory();
  }, []);

  // 출항 연도(ETD 기준) 드롭다운 목록 생성 (2026, 2025, 2024 기본 포함 및 실제 데이터 연도 자동 수집)
  const availableYears = useMemo(() => {
    const yearSet = new Set(['2026', '2025', '2024']);
    historyList.forEach(item => {
      if (item.etd) {
        try {
          const y = String(new Date(item.etd).getFullYear());
          if (!isNaN(y) && y.length === 4) yearSet.add(y);
        } catch (e) {}
      }
    });
    return Array.from(yearSet).sort((a, b) => Number(b) - Number(a));
  }, [historyList]);

  // 필터링된 선적내역 (출항 연도 드롭다운 + 검색어)
  const filteredHistory = useMemo(() => {
    return historyList.filter(item => {
      // 1. 출항 연도 필터링
      if (selectedYear !== 'ALL') {
        if (!item.etd) return false;
        const y = String(new Date(item.etd).getFullYear());
        if (y !== selectedYear) return false;
      }
      // 2. 검색어 필터링 (B/L번호 또는 도착항)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchMbl = item.mbl_no?.toLowerCase().includes(q);
        const matchPod = item.pod?.toLowerCase().includes(q);
        const matchVessel = item.vessel?.toLowerCase().includes(q);
        return matchMbl || matchPod || matchVessel;
      }
      return true;
    });
  }, [historyList, selectedYear, searchQuery]);

  // B/L 번호 클립보드 복사
  const handleCopyMbl = (e, mbl) => {
    e.stopPropagation();
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(mbl);
      setCopiedMbl(mbl);
      setTimeout(() => setCopiedMbl(null), 2000);
    }
  };

  // ================= [ 업로드 Drag & Drop 핸들러 ] =================
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      e.dataTransfer.dropEffect = 'copy';
    } catch (err) {}
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const resetCurrentFile = () => {
    setCurrentFile(null);
    setData([]);
    setErrors([]);
    setUploadProgress(0);
    setUploadStatus(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleFileUpload = (file) => {
    setCurrentFile(file);
    setUploadStatus('idle');
    setUploadProgress(0);
    
    const fileName = file.name || '';
    const ext = fileName.slice(fileName.lastIndexOf('.')).toLowerCase();
    
    if (ext === '.csv') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          if (!results.data || results.data.length === 0) {
            alert('CSV 파일에 데이터 행이 존재하지 않습니다.');
            return;
          }
          validateAndSetData(results.data);
        },
        error: (err) => {
          console.error('CSV parse error:', err);
          alert(`CSV 파일 파싱 중 오류가 발생했습니다: ${err.message || err}`);
        }
      });
    } else if (ext === '.xlsx' || ext === '.xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = new Uint8Array(e.target.result);
          const workbook = XLSX.read(buffer, { type: 'array' });
          const firstSheetName = workbook.SheetNames[0];
          if (!firstSheetName) {
            alert('엑셀 파일에 시트(Sheet)가 존재하지 않습니다.');
            return;
          }
          const worksheet = workbook.Sheets[firstSheetName];
          const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
          if (!json || json.length === 0) {
            alert('선택한 엑셀 파일의 첫 번째 시트에 유효한 데이터 행이 없습니다.');
            return;
          }
          validateAndSetData(json);
        } catch (err) {
          console.error('Excel parse error:', err);
          const errMsg = String(err.message || err);
          const isDrm = errMsg.includes('Encrypted') || 
                        errMsg.includes('EncryptionInfo') || 
                        errMsg.includes('DRM') || 
                        errMsg.includes('password') ||
                        errMsg.includes('ECMA-376');
          if (isDrm) {
            setDrmModalInfo({ fileName: file.name, error: errMsg });
          } else {
            alert(`엑셀 파일을 분석하는 중 오류가 발생했습니다: ${errMsg}`);
          }
          resetCurrentFile();
        }
      };
      reader.onerror = () => {
        alert('파일을 읽어오는 중 브라우저 오류가 발생했습니다.');
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert(`지원하지 않는 파일 형식(${ext || '알 수 없음'})입니다. .xlsx, .xls 또는 .csv 파일을 업로드해주세요.`);
      resetCurrentFile();
    }
  };

  // 다양한 헤더 명칭(띄어쓰기, 괄호 유무, 영문/한글) 유연 매핑 도우미
  const extractFieldValue = (row, fieldAliases) => {
    // 1. 직접 일치 검사
    for (const alias of fieldAliases) {
      if (row[alias] !== undefined && row[alias] !== null && String(row[alias]).trim() !== '') {
        return String(row[alias]).trim();
      }
    }
    // 2. 특수문자 및 공백 제거 후 소문자 정규화 비교
    const rowKeys = Object.keys(row);
    for (const key of rowKeys) {
      const cleanKey = key.replace(/[\s\(\)\/_\-\.]/g, '').toLowerCase();
      for (const alias of fieldAliases) {
        const cleanAlias = alias.replace(/[\s\(\)\/_\-\.]/g, '').toLowerCase();
        if (cleanKey === cleanAlias || cleanKey.includes(cleanAlias)) {
          const val = row[key];
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
          }
        }
      }
    }
    return '';
  };

  const validateAndSetData = (rawData) => {
    const validatedData = [];
    const validationErrors = [];
    const snSet = new Set();

    rawData.forEach((row, index) => {
      const mbl = extractFieldValue(row, ['MBL (선하증권 번호)', 'MBL', 'mbl', 'MBL NO', 'MBL No', 'B/L', 'BL', 'BL NO', '선하증권', '선하증권번호']);
      const port = extractFieldValue(row, ['PORT (도착항/POD)', 'PORT', 'port', 'POD', 'pod', '도착항', '목적항', 'DESTINATION']);
      const model = extractFieldValue(row, ['MODEL (장비명)', 'MODEL', 'model', '장비명', '기종', 'Model Name', '모델명']);
      const sn = extractFieldValue(row, ['S/N (시리얼 번호)', 'S/N', 'sn', 'serial_number', '시리얼', '시리얼번호', 'Serial', 'Serial No']);
      const po = extractFieldValue(row, ['P/O (주문 번호)', 'P/O', 'po', 'reference_no', '주문번호', 'PO', 'PO NO', 'P/O NO']);

      const rowData = {
        mbl_no: mbl,
        pol: '',
        pod: port,
        model_name: model,
        serial_number: sn,
        reference_no: po,
        _isValid: true,
        _errorMsg: ''
      };

      if (!rowData.mbl_no) {
        rowData._isValid = false;
        rowData._errorMsg += 'MBL(선하증권 번호) 누락. ';
      }
      if (!rowData.serial_number && !rowData.reference_no) {
        rowData._isValid = false;
        rowData._errorMsg += 'S/N 또는 P/O 필수. ';
      }
      if (rowData.serial_number && snSet.has(rowData.serial_number)) {
        rowData._isValid = false;
        rowData._errorMsg += 'S/N 중복. ';
      }

      if (rowData.serial_number) {
        snSet.add(rowData.serial_number);
      }

      if (!rowData._isValid) {
        validationErrors.push(`Row ${index + 2}: ${rowData._errorMsg}`);
      }

      validatedData.push(rowData);
    });

    setData(validatedData);
    setErrors(validationErrors);
  };

  const downloadTemplate = () => {
    const template = [
      {
        'MBL (선하증권 번호)': 'HDMUSELE22174500',
        'PORT (도착항/POD)': 'Hamburg',
        'MODEL (장비명)': 'KF5600II',
        'S/N (시리얼 번호)': 'K3G112',
        'P/O (주문 번호)': 'PO-2601'
      },
      {
        'MBL (선하증권 번호)': 'HDMUSELE22174500',
        'PORT (도착항/POD)': 'Hamburg',
        'MODEL (장비명)': 'E200C',
        'S/N (시리얼 번호)': 'E2C991',
        'P/O (주문 번호)': 'PO-2602'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Shipment Template");
    XLSX.writeFile(wb, "Shipment_Upload_Template.xlsx");
  };

  const downloadCsvTemplate = () => {
    const csvContent = "\uFEFF" +
      "MBL (선하증권 번호),PORT (도착항/POD),MODEL (장비명),S/N (시리얼 번호),P/O (주문 번호)\n" +
      "HDMUSELE22174500,Hamburg,KF5600II,K3G112,PO-2601\n" +
      "HDMUSELE22174500,Hamburg,E200C,E2C991,PO-2602\n";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'Shipment_Upload_Template.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleApplyPastedText = (text) => {
    if (!text || !text.trim()) return;

    Papa.parse(text.trim(), {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const firstRow = results.data[0];
          const hasKnownHeaders = Object.keys(firstRow).some(k => {
            const clean = k.replace(/[\s\(\)\/_\-\.]/g, '').toLowerCase();
            return ['mbl', 'pod', 'port', 'model', 'sn', 'po', 'serial', '선하증권', '도착항', '장비명', '주문번호'].some(alias => clean.includes(alias));
          });

          if (hasKnownHeaders) {
            validateAndSetData(results.data);
            setCurrentFile({ name: '클립보드 직접 붙여넣기', size: text.length });
            setIsPasteModalOpen(false);
            setPastedText('');
          } else {
            Papa.parse(text.trim(), {
              header: false,
              skipEmptyLines: true,
              complete: (noHeaderResults) => {
                const rows = noHeaderResults.data.map(arr => ({
                  'MBL': arr[0] || '',
                  'PORT': arr[1] || '',
                  'MODEL': arr[2] || '',
                  'S/N': arr[3] || '',
                  'P/O': arr[4] || ''
                }));
                validateAndSetData(rows);
                setCurrentFile({ name: '클립보드 직접 붙여넣기', size: text.length });
                setIsPasteModalOpen(false);
                setPastedText('');
              }
            });
          }
        } else {
          alert('붙여넣은 데이터에서 유효한 행을 찾을 수 없습니다.');
        }
      },
      error: (err) => {
        alert('붙여넣은 데이터를 분석하는 중 오류가 발생했습니다: ' + err.message);
      }
    });
  };

  const handleSubmit = async () => {
    if (data.length === 0) return;
    if (errors.length > 0) {
      const confirmSubmit = window.confirm('오류가 있는 데이터가 포함되어 있습니다. 무시하고 전송하시겠습니까? (오류 데이터는 백엔드에서 처리되지 않을 수 있습니다)');
      if (!confirmSubmit) return;
    }

    setIsUploading(true);
    setUploadStatus('idle');
    const progressInterval = setInterval(() => {
      setUploadProgress(prev => {
        if (prev >= 90) return prev;
        return prev + 10;
      });
    }, 200);

    try {
      const payload = data.map(d => ({
        mbl_no: d.mbl_no,
        pol: d.pol,
        pod: d.pod,
        model_name: d.model_name,
        serial_number: d.serial_number,
        reference_no: d.reference_no
      }));

      const res = await fetch('/api/shipments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (res.ok) {
        setUploadStatus('success');
        // 업로드 성공 후 좌측 선적내역 리스트 즉시 자동 갱신
        fetchShipmentHistory();
        setTimeout(() => {
          resetCurrentFile();
        }, 3000);
      } else {
        const err = await res.json();
        throw new Error(err.detail || '업로드 실패');
      }
    } catch (e) {
      clearInterval(progressInterval);
      setUploadStatus('error');
      alert(`업로드 중 오류 발생: ${e.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div 
      onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onDrop={(e) => { e.preventDefault(); e.stopPropagation(); }}
      style={{ 
        padding: isMobile ? '16px' : '24px 32px', 
        maxWidth: '1680px', 
        margin: '0 auto',
        boxSizing: 'border-box'
      }}
    >
      {/* ================= [ 페이지 상단 안내 바 ] ================= */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px', 
        flexWrap: 'wrap', 
        gap: '12px' 
      }}>
        <div>
          <h1 style={{ 
            fontSize: isMobile ? '1.3rem' : '1.5rem', 
            fontWeight: 700, 
            color: 'var(--text-primary)', 
            margin: 0,
            display: 'flex',
            alignItems: 'center',
            gap: '10px'
          }}>
            <Ship size={24} color="#0284c7" />
            선적 관리 & 업로드
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            기존에 등록된 선적 내역을 조회하고, 신규 선적(MBL) 및 장비 시리얼 정보를 실시간 업로드합니다.
          </p>
        </div>

        {/* 상단 빠른 템플릿 다운로드 버튼 그룹 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setIsPasteModalOpen(true)}
            className="btn btn-primary"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px', 
              cursor: 'pointer', 
              backgroundColor: '#0284c7', 
              borderColor: '#0284c7', 
              color: 'white',
              fontSize: '0.85rem',
              padding: '6px 12px'
            }}
            title="사내 DRM 암호화와 무관하게 엑셀 내용을 복사하여 붙여넣기"
          >
            <Clipboard size={15} />
            <span>엑셀 복사/붙여넣기</span>
          </button>
          <button 
            onClick={downloadTemplate}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', padding: '6px 12px' }}
            title="엑셀 형식(.xlsx) 템플릿 다운로드"
          >
            <Download size={14} />
            <span>템플릿 (.xlsx)</span>
          </button>
          <button 
            onClick={downloadCsvTemplate}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.85rem', padding: '6px 12px' }}
            title="사내 DRM 암호화 영향을 받지 않는 CSV 형식 템플릿 다운로드"
          >
            <Download size={14} />
            <span>템플릿 (.csv)</span>
          </button>
        </div>
      </div>

      {/* ================= [ 메인 레이아웃: 화면 2등분 (좌: 선적내역 리스트, 우: 선적정보 업로드) ] ================= */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr',
        gap: '24px',
        alignItems: 'start'
      }}>

        {/* ----------------- [ 왼쪽: 선적내역 리스트 ] ----------------- */}
        <div style={{
          background: 'var(--bg-primary, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 좌측 패널 헤더 */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7'
              }}>
                <Ship size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  선적내역 리스트
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  과거 및 현재 등록된 전체 B/L 선적 이력
                </span>
              </div>
            </div>

            {/* 필터 컨트롤: 출항 년도 드롭다운 + 새로고침 버튼 + 총 건수 배지 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {/* 출항 년도 드롭다운 메뉴 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <Calendar size={14} color="#64748b" />
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  style={{
                    padding: '5px 8px',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                  title="출항 년도(ETD) 기준 필터링"
                >
                  <option value="ALL">전체 년도</option>
                  {availableYears.map(year => (
                    <option key={year} value={year}>{year}년</option>
                  ))}
                </select>
              </div>

              {/* 새로고침 버튼 */}
              <button
                onClick={fetchShipmentHistory}
                disabled={isLoadingHistory}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 8px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-primary)',
                  color: '#0284c7',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: isLoadingHistory ? 'not-allowed' : 'pointer'
                }}
                title="선적내역 새로고침"
              >
                <RefreshCw size={13} className={isLoadingHistory ? 'animate-spin' : ''} />
                <span>새로고침</span>
              </button>

              {/* 총 건수 뱃지 */}
              <span style={{
                backgroundColor: '#eff6ff',
                color: '#1d4ed8',
                border: '1px solid #dbeafe',
                fontSize: '0.75rem',
                fontWeight: 700,
                padding: '4px 8px',
                borderRadius: '9999px'
              }}>
                총 {filteredHistory.length}건
              </span>
            </div>
          </div>

          {/* 좌측 패널 검색 필터 바 */}
          <div style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <Search size={15} color="#94a3b8" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="B/L 번호, 도착지 항구, 선박명 검색..."
              style={{
                border: 'none',
                outline: 'none',
                width: '100%',
                fontSize: '0.85rem',
                backgroundColor: 'transparent',
                color: 'var(--text-primary)'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#94a3b8' }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          {/* 에러 피드백 */}
          {historyError && (
            <div style={{
              margin: '12px 16px',
              padding: '10px 14px',
              borderRadius: '8px',
              backgroundColor: '#fef2f2',
              color: '#b91c1c',
              border: '1px solid #fecaca',
              fontSize: '0.85rem',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              <AlertTriangle size={16} />
              <span>{historyError}</span>
            </div>
          )}

          {/* 좌측 선적내역 테이블 본체 (5개 컬럼 구성) */}
          <div style={{ overflowX: 'auto', maxHeight: '680px', overflowY: 'auto' }}>
            <table className="wia-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: 'var(--bg-secondary, #f8fafc)' }}>
                <tr style={{ borderBottom: '1px solid var(--border-color)' }}>
                  <th style={{ width: '45px', textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)' }}>번호</th>
                  <th style={{ textAlign: 'left', padding: '10px 10px', color: 'var(--text-secondary)' }}>B/L 번호</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px', color: 'var(--text-secondary)' }}>ETD (출항일)</th>
                  <th style={{ textAlign: 'left', padding: '10px 10px', color: 'var(--text-secondary)' }}>도착지 항구</th>
                  <th style={{ textAlign: 'center', padding: '10px 10px', color: 'var(--text-secondary)' }}>장비개수 (S/N)</th>
                </tr>
              </thead>
              <tbody>
                {isLoadingHistory && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px 16px', color: '#0284c7' }}>
                      <Loader2 size={24} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>선적내역을 불러오는 중입니다...</div>
                    </td>
                  </tr>
                )}

                {!isLoadingHistory && filteredHistory.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '48px 16px', color: 'var(--text-secondary)' }}>
                      <Ship size={32} color="#cbd5e1" style={{ margin: '0 auto 8px' }} />
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>선적내역이 존재하지 않습니다.</div>
                      <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>
                        {selectedYear !== 'ALL' ? `${selectedYear}년도에 출항한 선적이 없습니다.` : '오른쪽에서 신규 선적정보를 업로드해 보세요.'}
                      </div>
                    </td>
                  </tr>
                )}

                {!isLoadingHistory && filteredHistory.map((shipment, index) => {
                  // S/N이 존재하는 장비 개수 계산
                  const validSnOrders = shipment.orders?.filter(
                    o => o.serial_number && String(o.serial_number).trim() !== ''
                  ) || [];
                  const snCount = validSnOrders.length;
                  const totalOrderCount = shipment.orders?.length || 0;
                  
                  // 출항일 포맷 (YYYY-MM-DD)
                  const etdStr = shipment.etd ? String(shipment.etd).slice(0, 10) : '-';
                  
                  const isExpanded = expandedMbl === shipment.mbl_no;

                  return (
                    <React.Fragment key={shipment.mbl_no || index}>
                      <tr 
                        onClick={() => setExpandedMbl(isExpanded ? null : shipment.mbl_no)}
                        style={{
                          borderBottom: '1px solid var(--border-color)',
                          cursor: 'pointer',
                          backgroundColor: isExpanded ? 'rgba(2, 132, 199, 0.04)' : 'transparent',
                          transition: 'background-color 0.15s ease'
                        }}
                        onMouseEnter={(e) => {
                          if (!isExpanded) e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.02)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isExpanded) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        {/* 1. 번호 (순차번호) */}
                        <td style={{ textAlign: 'center', padding: '12px 8px', color: 'var(--text-secondary)', fontWeight: 600 }}>
                          {index + 1}
                        </td>

                        {/* 2. B/L 번호 */}
                        <td style={{ padding: '12px 10px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontWeight: 700, color: '#0369a1', fontFamily: 'monospace', fontSize: '0.9rem' }}>
                              {shipment.mbl_no || '-'}
                            </span>
                            <button
                              onClick={(e) => handleCopyMbl(e, shipment.mbl_no)}
                              title="B/L 번호 복사"
                              style={{
                                background: 'none',
                                border: 'none',
                                padding: '2px',
                                cursor: 'pointer',
                                color: copiedMbl === shipment.mbl_no ? '#16a34a' : '#94a3b8',
                                display: 'flex',
                                alignItems: 'center'
                              }}
                            >
                              {copiedMbl === shipment.mbl_no ? <Check size={13} /> : <Copy size={13} />}
                            </button>
                          </div>
                          {shipment.vessel && (
                            <div style={{ fontSize: '0.72rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: '3px', marginTop: '2px' }}>
                              <Anchor size={10} />
                              <span>{shipment.vessel}</span>
                            </div>
                          )}
                        </td>

                        {/* 3. ETD (출항일) */}
                        <td style={{ textAlign: 'center', padding: '12px 8px', color: 'var(--text-primary)', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'monospace', fontWeight: 500 }}>
                            {etdStr}
                          </span>
                        </td>

                        {/* 4. 도착지 항구 */}
                        <td style={{ padding: '12px 10px', color: 'var(--text-primary)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span style={{ fontWeight: 600 }}>{shipment.pod || '-'}</span>
                          </div>
                          {shipment.carrier && (
                            <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              선사: {shipment.carrier}
                            </span>
                          )}
                        </td>

                        {/* 5. 장비개수 (S/N개수 기준) */}
                        <td style={{ textAlign: 'center', padding: '12px 10px' }}>
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                            backgroundColor: snCount > 0 ? '#ecfdf5' : '#f1f5f9',
                            color: snCount > 0 ? '#059669' : '#475569',
                            border: `1px solid ${snCount > 0 ? '#a7f3d0' : '#e2e8f0'}`,
                            padding: '3px 10px',
                            borderRadius: '9999px',
                            fontWeight: 700,
                            fontSize: '0.8rem'
                          }}>
                            <Package size={12} />
                            {snCount > 0 ? `${snCount}대` : `${totalOrderCount}대`}
                          </span>
                        </td>
                      </tr>

                      {/* 행 클릭 시 상세 장비(S/N 및 모델) 목록 아코디언 확장 뷰 */}
                      {isExpanded && (
                        <tr style={{ backgroundColor: '#f8fafc' }}>
                          <td colSpan={5} style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)' }}>
                            <div style={{
                              backgroundColor: 'white',
                              borderRadius: '8px',
                              border: '1px solid #e2e8f0',
                              padding: '12px 14px'
                            }}>
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center', 
                                marginBottom: '8px',
                                borderBottom: '1px solid #f1f5f9',
                                paddingBottom: '6px'
                              }}>
                                <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#334155' }}>
                                  📦 선적 장비 상세 목록 ({shipment.orders?.length || 0}건 / S/N 부여: {snCount}건)
                                </span>
                                <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                  ETA: {shipment.eta ? String(shipment.eta).slice(0, 10) : '-'} | 상태: {shipment.trackcargo_status || '운송중'}
                                </span>
                              </div>

                              {(!shipment.orders || shipment.orders.length === 0) ? (
                                <div style={{ fontSize: '0.75rem', color: '#94a3b8', textAlign: 'center', padding: '8px' }}>
                                  등록된 장비 주문이 없습니다.
                                </div>
                              ) : (
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px' }}>
                                  {shipment.orders.map((ord, oIdx) => (
                                    <div key={ord.id || oIdx} style={{
                                      padding: '8px 10px',
                                      borderRadius: '6px',
                                      backgroundColor: '#f8fafc',
                                      border: '1px solid #e2e8f0',
                                      fontSize: '0.75rem',
                                      display: 'flex',
                                      flexDirection: 'column',
                                      gap: '2px'
                                    }}>
                                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontWeight: 700, color: '#0f172a' }}>
                                          {ord.product_model?.model_name || '장비'}
                                        </span>
                                        <span style={{
                                          fontSize: '0.68rem',
                                          padding: '1px 5px',
                                          borderRadius: '4px',
                                          backgroundColor: ord.current_status === 'ARRIVED' ? '#dcfce7' : '#e0f2fe',
                                          color: ord.current_status === 'ARRIVED' ? '#15803d' : '#0369a1',
                                          fontWeight: 600
                                        }}>
                                          {ord.current_status}
                                        </span>
                                      </div>
                                      <div style={{ color: '#475569' }}>
                                        S/N: <strong style={{ color: ord.serial_number ? '#0284c7' : '#94a3b8' }}>{ord.serial_number || '미부여'}</strong>
                                      </div>
                                      <div style={{ color: '#64748b', fontSize: '0.7rem' }}>
                                        P/O: {ord.reference_no || '-'}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* ----------------- [ 오른쪽: 선적정보 업로드 (API Tracking 연동) ] ----------------- */}
        <div style={{
          background: 'var(--bg-primary, #ffffff)',
          borderRadius: '16px',
          border: '1px solid var(--border-color)',
          boxShadow: 'var(--shadow-sm, 0 1px 3px rgba(0,0,0,0.05))',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* 우측 패널 헤더 */}
          <div style={{
            padding: '16px 20px',
            borderBottom: '1px solid var(--border-color)',
            backgroundColor: 'var(--bg-secondary, #f8fafc)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'rgba(2, 132, 199, 0.1)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0284c7'
              }}>
                <UploadCloud size={18} />
              </div>
              <div>
                <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  선적정보 업로드 (API Tracking 연동)
                </h2>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  엑셀 파일 드롭 또는 복사/붙여넣기로 TrackCargo 실시간 등록
                </span>
              </div>
            </div>

            {data.length > 0 && (
              <button
                onClick={resetCurrentFile}
                className="btn btn-outline"
                style={{ fontSize: '0.75rem', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
              >
                <X size={12} />
                <span>취소/재선택</span>
              </button>
            )}
          </div>

          <div style={{ padding: '20px' }}>
            {/* 파일 업로드 드롭존 */}
            <div 
              onDragEnter={handleDragEnter}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              style={{
                width: '100%',
                boxSizing: 'border-box',
                border: isDragging ? '2px dashed #0284c7' : '2px dashed var(--border-color)',
                borderRadius: '14px',
                padding: '28px 20px',
                textAlign: 'center',
                backgroundColor: isDragging ? 'rgba(14, 165, 233, 0.1)' : 'var(--bg-secondary, #f8fafc)',
                boxShadow: isDragging ? '0 0 20px rgba(14, 165, 233, 0.25)' : 'none',
                transform: isDragging ? 'scale(1.01)' : 'scale(1)',
                cursor: 'pointer',
                transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                marginBottom: '16px'
              }}
            >
              <div style={{ pointerEvents: 'none' }}>
                <div style={{
                  width: '52px',
                  height: '52px',
                  borderRadius: '50%',
                  backgroundColor: isDragging ? 'rgba(14, 165, 233, 0.2)' : 'var(--bg-primary, #ffffff)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 12px',
                  transition: 'all 0.2s ease',
                  border: '1px solid var(--border-color)'
                }}>
                  <UploadCloud 
                    size={28} 
                    color={isDragging ? '#0284c7' : '#0284c7'} 
                  />
                </div>
                <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '6px', color: isDragging ? '#0284c7' : 'var(--text-primary)' }}>
                  {isDragging ? '여기에 엑셀 파일을 놓으세요 (Drop File)' : '클릭하거나 엑셀 파일을 이곳에 드롭하세요'}
                </h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: '0 0 8px' }}>
                  지원 형식: <strong>.xlsx, .xls, .csv</strong> (헤더 지능형 자동 매핑)
                </p>
                <div style={{ display: 'inline-flex', gap: '6px', fontSize: '0.72rem', color: 'var(--text-muted, #94a3b8)', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <span>필수 헤더: MBL (선하증권)</span>
                  <span>•</span>
                  <span>S/N 또는 P/O</span>
                  <span>•</span>
                  <span>POD (도착항)</span>
                </div>
              </div>

              <input 
                type="file" 
                ref={fileInputRef} 
                style={{ display: 'none' }} 
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel, .xlsx, .xls"
                onChange={handleFileSelect}
              />
            </div>

            {/* 선택된 파일 정보 배너 */}
            {currentFile && (
              <div style={{
                padding: '10px 14px',
                borderRadius: '8px',
                backgroundColor: 'var(--bg-secondary, #f8fafc)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                boxShadow: 'var(--shadow-sm)',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <FileSpreadsheet size={20} color="#0284c7" />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {currentFile.name}
                    </div>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                      {(currentFile.size / 1024).toFixed(1)} KB • {data.length}개 행 감지됨
                    </div>
                  </div>
                </div>
                <button
                  onClick={resetCurrentFile}
                  title="파일 초기화"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    padding: '4px',
                    borderRadius: '4px',
                    display: 'flex',
                    alignItems: 'center'
                  }}
                >
                  <X size={16} />
                </button>
              </div>
            )}

            {/* 데이터 검증 결과 테이블 */}
            {data.length > 0 && (
              <div style={{ background: 'var(--bg-primary)', borderRadius: '10px', padding: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                    데이터 검증 결과 ({data.length}건)
                  </h3>
                  {errors.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#ef4444' }}>
                      <AlertTriangle size={15} />
                      <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>{errors.length}개의 오류 발견</span>
                    </div>
                  )}
                </div>

                <div style={{ overflowX: 'auto', marginBottom: '16px', maxHeight: '280px', overflowY: 'auto' }}>
                  <table className="wia-table" style={{ width: '100%', fontSize: '0.78rem' }}>
                    <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--bg-secondary, #f8fafc)' }}>
                      <tr>
                        <th style={{ width: '35px' }}>No</th>
                        <th>MBL</th>
                        <th>POD</th>
                        <th>장비명</th>
                        <th>S/N</th>
                        <th>P/O</th>
                        <th style={{ width: '40px' }}>검증</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, idx) => (
                        <tr key={idx} style={{ backgroundColor: row._isValid ? 'transparent' : 'rgba(239, 68, 68, 0.05)' }}>
                          <td>{idx + 1}</td>
                          <td style={{ color: !row.mbl_no ? '#ef4444' : 'inherit', fontWeight: 600 }}>{row.mbl_no || '-'}</td>
                          <td>{row.pod}</td>
                          <td>{row.model_name}</td>
                          <td style={{ color: (!row.serial_number && !row.reference_no) ? '#ef4444' : 'inherit' }}>{row.serial_number || '-'}</td>
                          <td style={{ color: (!row.serial_number && !row.reference_no) ? '#ef4444' : 'inherit' }}>{row.reference_no || '-'}</td>
                          <td style={{ textAlign: 'center' }}>
                            {row._isValid ? (
                              <CheckCircle size={15} color="#22c55e" />
                            ) : (
                              <div title={row._errorMsg} style={{ color: '#ef4444', cursor: 'help', display: 'inline-block' }}>
                                <AlertTriangle size={15} />
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 프로그레스 바 및 최종 확정 버튼 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                  {isUploading && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: '180px' }}>
                      <div style={{ height: '6px', background: 'var(--bg-secondary)', borderRadius: '3px', flex: 1, overflow: 'hidden' }}>
                        <div style={{ 
                          height: '100%', 
                          background: '#0284c7', 
                          width: `${uploadProgress}%`,
                          transition: 'width 0.3s ease'
                        }}></div>
                      </div>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{uploadProgress}%</span>
                    </div>
                  )}
                  
                  {uploadStatus === 'success' && (
                    <div style={{ color: '#16a34a', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
                      <CheckCircle size={18} />
                      <span>업로드 성공! TrackCargo 연동 시작 및 리스트 갱신 완료</span>
                    </div>
                  )}

                  <button
                    className="btn btn-primary"
                    onClick={handleSubmit}
                    disabled={isUploading || uploadStatus === 'success'}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      minWidth: '150px', 
                      justifyContent: 'center',
                      backgroundColor: '#0284c7',
                      borderColor: '#0284c7',
                      color: 'white',
                      fontSize: '0.85rem',
                      padding: '8px 16px'
                    }}
                  >
                    {isUploading ? (
                      <>
                        <Loader2 size={16} className="animate-spin" />
                        <span>연동 처리중...</span>
                      </>
                    ) : (
                      <>
                        <UploadCloud size={16} />
                        <span>업로드 최종 확정</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* ================= [ 엑셀 복사/붙여넣기 모달 (DRM 우회 솔루션) ] ================= */}
      {isPasteModalOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.6)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 9999, padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-primary, #ffffff)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '680px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '8px',
                  backgroundColor: 'rgba(2, 132, 199, 0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center'
                }}>
                  <Clipboard size={20} color="#0284c7" />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 600 }}>
                    엑셀 데이터 직접 복사 / 붙여넣기
                  </h3>
                  <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    사내 DRM(MIP) 암호화와 무관하게 엑셀 내용을 즉시 등록할 수 있습니다.
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsPasteModalOpen(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px 24px' }}>
              <div style={{
                backgroundColor: 'rgba(2, 132, 199, 0.05)',
                border: '1px solid rgba(2, 132, 199, 0.2)',
                borderRadius: '8px',
                padding: '12px 16px',
                marginBottom: '16px',
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5
              }}>
                💡 <strong>사용 방법:</strong> 엑셀에서 표 범위를 드래그하여 <strong>복사(Ctrl+C)</strong>한 뒤, 아래 상자에 <strong>붙여넣기(Ctrl+V)</strong>하고 [데이터 적용]을 누르세요.
              </div>

              <textarea
                value={pastedText}
                onChange={(e) => setPastedText(e.target.value)}
                placeholder="엑셀에서 복사(Ctrl+C)한 셀 데이터를 이곳에 붙여넣기(Ctrl+V) 하세요...&#10;&#10;예시:&#10;MBL (선하증권 번호)	PORT (도착항/POD)	MODEL (장비명)	S/N (시리얼 번호)	P/O (주문 번호)&#10;HDMUSELE22174500	Hamburg	KF5600II	K3G112	PO-2601"
                rows={8}
                style={{
                  width: '100%',
                  padding: '12px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: 'var(--bg-secondary, #f8fafc)',
                  color: 'var(--text-primary)',
                  fontFamily: 'monospace',
                  fontSize: '0.85rem',
                  resize: 'vertical',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: 'var(--bg-secondary, #f8fafc)'
            }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    if (text) setPastedText(text);
                  } catch (e) {
                    alert('클립보드 접근 권한이 없거나 지원되지 않습니다. 텍스트 상자를 클릭 후 Ctrl+V를 눌러주세요.');
                  }
                }}
                className="btn btn-outline"
                style={{ fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Clipboard size={14} />
                <span>클립보드에서 가져오기</span>
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => setIsPasteModalOpen(false)}
                  className="btn btn-outline"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyPastedText(pastedText)}
                  disabled={!pastedText.trim()}
                  className="btn btn-primary"
                  style={{ backgroundColor: '#0284c7', borderColor: '#0284c7', color: 'white' }}
                >
                  데이터 파싱 및 적용
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= [ 사내 보안 DRM/MIP 암호화 감지 안내 모달 ] ================= */}
      {drmModalInfo && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.65)', backdropFilter: 'blur(4px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 10000, padding: '20px'
        }}>
          <div style={{
            background: 'var(--bg-primary, #ffffff)',
            borderRadius: '16px',
            width: '100%',
            maxWidth: '620px',
            boxShadow: '0 25px 50px -12px rgba(0,0,0,0.3)',
            border: '1px solid #f87171',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '20px 24px',
              backgroundColor: '#fef2f2',
              borderBottom: '1px solid #fecaca',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <div style={{
                width: '40px', height: '40px', borderRadius: '50%',
                backgroundColor: '#fee2e2', color: '#dc2626',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0
              }}>
                <Lock size={22} />
              </div>
              <div>
                <h3 style={{ margin: 0, color: '#991b1b', fontSize: '1.1rem', fontWeight: 700 }}>
                  사내 보안(Microsoft Information Protection / DRM) 암호화 감지
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#b91c1c' }}>
                  {drmModalInfo.fileName} 파일은 사내 보안 정책으로 암호화되어 있어 웹에서 직접 읽을 수 없습니다.
                </span>
              </div>
            </div>

            <div style={{ padding: '24px', fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.6 }}>
              <p style={{ margin: '0 0 16px 0', color: 'var(--text-secondary)' }}>
                기업용 Office 365(현대위아 사내 PC 등)에서 엑셀 문서를 저장할 때 <strong>Microsoft Information Protection(MIP)</strong> 보안 라벨이 자동 적용되어 웹 브라우저가 파일 내부 데이터를 읽을 수 없도록 암호화됩니다.
              </p>

              <div style={{
                backgroundColor: 'var(--bg-secondary, #f8fafc)',
                borderRadius: '10px',
                padding: '16px',
                border: '1px solid var(--border-color)',
                marginBottom: '20px'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '8px', color: '#0284c7' }}>
                  💡 권장 해결 방법 (3가지 중 선택):
                </div>
                <ol style={{ margin: 0, paddingLeft: '20px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem' }}>
                  <li>
                    <strong>📋 엑셀 내용 직접 복사/붙여넣기 (가장 편리)</strong>: 엑셀에서 표 범위를 복사(Ctrl+C)한 뒤, 시스템에 붙여넣기(Ctrl+V)하면 암호화 영향을 전혀 받지 않습니다.
                  </li>
                  <li>
                    <strong>💾 CSV 형식으로 저장 후 업로드</strong>: 엑셀에서 [파일] → [다른 이름으로 저장] → 파일 형식을 <code>CSV UTF-8 (쉼표로 분리)(*.csv)</code>로 저장하여 업로드하세요.
                  </li>
                  <li>
                    <strong>🔓 엑셀 문서 민감도(보안) 라벨 변경</strong>: 엑셀 상단 [민감도 / Sensitivity] 탭에서 암호화 보안 라벨을 '일반' 또는 '공개'로 변경 후 저장하세요.
                  </li>
                </ol>
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  onClick={() => setDrmModalInfo(null)}
                  className="btn btn-outline"
                >
                  닫기
                </button>
                <button
                  onClick={downloadCsvTemplate}
                  className="btn btn-outline"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Download size={15} />
                  <span>CSV 템플릿 받기</span>
                </button>
                <button
                  onClick={() => {
                    setDrmModalInfo(null);
                    setIsPasteModalOpen(true);
                  }}
                  className="btn btn-primary"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', backgroundColor: '#0284c7', borderColor: '#0284c7', color: 'white' }}
                >
                  <Clipboard size={15} />
                  <span>지금 바로 복사/붙여넣기</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
