import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Download, Loader2, FileSpreadsheet, X, Check } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function AdminShipmentUpload({ isMobileView }) {
  const [data, setData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null); // 'idle', 'success', 'error'
  const [isDragging, setIsDragging] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);
  
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);

  // Drag & Drop 이벤트 핸들러
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
    // 동일 파일 재선택 가능하도록 input value 초기화
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
    
    // 파일 확장자 대소문자 무관하게 검사 (.xlsx, .XLSX, .xls, .csv 등)
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
          alert(`엑셀 파일을 분석하는 중 오류가 발생했습니다: ${err.message}`);
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
      // 헤더 변형 유연 매핑
      const mbl = extractFieldValue(row, ['MBL (선하증권 번호)', 'MBL', 'mbl', 'MBL NO', 'MBL No', 'B/L', 'BL', 'BL NO', '선하증권', '선하증권번호']);
      const port = extractFieldValue(row, ['PORT (도착항/POD)', 'PORT', 'port', 'POD', 'pod', '도착항', '목적항', 'DESTINATION']);
      const model = extractFieldValue(row, ['MODEL (장비명)', 'MODEL', 'model', '장비명', '기종', 'Model Name', '모델명']);
      const sn = extractFieldValue(row, ['S/N (시리얼 번호)', 'S/N', 'sn', 'serial_number', '시리얼', '시리얼번호', 'Serial', 'Serial No']);
      const po = extractFieldValue(row, ['P/O (주문 번호)', 'P/O', 'po', 'reference_no', '주문번호', 'PO', 'PO NO', 'P/O NO']);

      const rowData = {
        mbl_no: mbl,
        pol: '', // 기본값
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

  const handleSubmit = async () => {
    if (data.length === 0) return;
    if (errors.length > 0) {
      const confirmSubmit = window.confirm('오류가 있는 데이터가 포함되어 있습니다. 무시하고 전송하시겠습니까? (오류 데이터는 백엔드에서 처리되지 않을 수 있습니다)');
      if (!confirmSubmit) return;
    }

    setIsUploading(true);
    setUploadStatus('idle');
    // Start progress simulation
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
      style={{ padding: isMobileView ? '16px' : '32px', maxWidth: '1200px', margin: '0 auto' }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            선적정보 업로드 (API Tracking 연동)
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            엑셀 템플릿 양식(.xlsx, .csv)으로 선적 MBL 및 장비 P/O, S/N 목록을 일괄 등록하고 화물 트래킹을 자동 시작합니다.
          </p>
        </div>
        <button 
          onClick={downloadTemplate}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}
        >
          <Download size={18} />
          <span>템플릿 다운로드</span>
        </button>
      </div>

      {/* 파일 업로드 드롭존 */}
      <div 
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        style={{
          maxWidth: '620px',
          margin: '0 auto 28px',
          border: isDragging ? '2px dashed #0284c7' : '2px dashed var(--border-color)',
          borderRadius: '16px',
          padding: '36px 24px',
          textAlign: 'center',
          backgroundColor: isDragging ? 'rgba(14, 165, 233, 0.1)' : 'var(--bg-secondary)',
          boxShadow: isDragging ? '0 0 20px rgba(14, 165, 233, 0.25)' : 'none',
          transform: isDragging ? 'scale(1.01)' : 'scale(1)',
          cursor: 'pointer',
          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
          position: 'relative'
        }}
      >
        <div style={{ pointerEvents: 'none' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            backgroundColor: isDragging ? 'rgba(14, 165, 233, 0.2)' : 'var(--bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
            transition: 'all 0.2s ease'
          }}>
            <UploadCloud 
              size={36} 
              color={isDragging ? '#0284c7' : 'var(--wia-light-gold)'} 
            />
          </div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '8px', color: isDragging ? '#0284c7' : 'var(--text-primary)' }}>
            {isDragging ? '여기에 엑셀 파일을 놓으세요 (Drop File)' : '클릭하거나 엑셀 파일을 이곳에 드롭하세요'}
          </h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', margin: '0 0 12px' }}>
            지원 형식: <strong>.xlsx, .xls, .csv</strong> (헤더 자동 매핑)
          </p>
          <div style={{ display: 'inline-flex', gap: '8px', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <span>필수 헤더: MBL (선하증권 번호)</span>
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
          maxWidth: '620px',
          margin: '-12px auto 24px',
          padding: '12px 16px',
          borderRadius: '10px',
          backgroundColor: 'var(--bg-primary)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <FileSpreadsheet size={22} color="#0284c7" />
            <div>
              <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                {currentFile.name}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
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
            <X size={18} />
          </button>
        </div>
      )}

      {data.length > 0 && (
        <div style={{ background: 'var(--bg-primary)', borderRadius: '12px', padding: '24px', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>데이터 검증 결과 ({data.length}건)</h3>
            {errors.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#ef4444' }}>
                <AlertTriangle size={18} />
                <span style={{ fontSize: '0.9rem' }}>{errors.length}개의 오류 발견</span>
              </div>
            )}
          </div>

          <div style={{ overflowX: 'auto', marginBottom: '24px', maxHeight: '400px' }}>
            <table className="wia-table" style={{ width: '100%' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1, backgroundColor: 'var(--bg-primary)' }}>
                <tr>
                  <th style={{ width: '40px' }}>No</th>
                  <th>MBL (선하증권)</th>
                  <th>POD (도착항)</th>
                  <th>장비명</th>
                  <th>S/N (시리얼 번호)</th>
                  <th>P/O (주문 번호)</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row, idx) => (
                  <tr key={idx} style={{ backgroundColor: row._isValid ? 'transparent' : 'rgba(239, 68, 68, 0.05)' }}>
                    <td>{idx + 1}</td>
                    <td style={{ color: !row.mbl_no ? '#ef4444' : 'inherit' }}>{row.mbl_no || '-'}</td>
                    <td>{row.pod}</td>
                    <td>{row.model_name}</td>
                    <td style={{ color: (!row.serial_number && !row.reference_no) ? '#ef4444' : 'inherit' }}>{row.serial_number || '-'}</td>
                    <td style={{ color: (!row.serial_number && !row.reference_no) ? '#ef4444' : 'inherit' }}>{row.reference_no || '-'}</td>
                    <td>
                      {row._isValid ? (
                        <CheckCircle size={18} color="#22c55e" />
                      ) : (
                        <div title={row._errorMsg} style={{ color: '#ef4444', cursor: 'help' }}>
                          <AlertTriangle size={18} />
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', justifyContent: 'flex-end' }}>
            {isUploading && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, maxWidth: '400px' }}>
                <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', flex: 1, overflow: 'hidden' }}>
                  <div style={{ 
                    height: '100%', 
                    background: 'var(--accent-cyan)', 
                    width: `${uploadProgress}%`,
                    transition: 'width 0.3s ease'
                  }}></div>
                </div>
                <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{uploadProgress}%</span>
              </div>
            )}
            
            {uploadStatus === 'success' && (
              <div style={{ color: '#22c55e', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <CheckCircle size={20} />
                <span>업로드 성공! TrackCargo 연동이 시작되었습니다.</span>
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={isUploading || uploadStatus === 'success'}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '160px', justifyContent: 'center' }}
            >
              {isUploading ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>처리중...</span>
                </>
              ) : (
                <>
                  <UploadCloud size={18} />
                  <span>업로드 최종 확정</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
