import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Download, Loader2, FileSpreadsheet, X, Check, Clipboard, Lock } from 'lucide-react';
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
  const [isPasteModalOpen, setIsPasteModalOpen] = useState(false);
  const [pastedText, setPastedText] = useState('');
  const [drmModalInfo, setDrmModalInfo] = useState(null);
  
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

    // Papa.parse automatically detects TSV (from Excel clipboard) and CSV
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
            // 헤더 없이 데이터 행만 복사한 경우 (0: MBL, 1: POD, 2: MODEL, 3: S/N, 4: PO)
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
            선적정보 업로드 (API Tracking 연동)
          </h1>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
            엑셀 템플릿 양식(.xlsx, .csv) 또는 복사/붙여넣기로 선적 MBL 및 장비 목록을 일괄 등록합니다.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => setIsPasteModalOpen(true)}
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', backgroundColor: '#0284c7', borderColor: '#0284c7', color: 'white' }}
            title="사내 DRM 암호화와 무관하게 엑셀 내용을 복사하여 붙여넣기"
          >
            <Clipboard size={16} />
            <span>엑셀 복사/붙여넣기</span>
          </button>
          <button 
            onClick={downloadTemplate}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            title="엑셀 형식(.xlsx) 템플릿 다운로드"
          >
            <Download size={15} />
            <span>템플릿 (.xlsx)</span>
          </button>
          <button 
            onClick={downloadCsvTemplate}
            className="btn btn-outline"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
            title="사내 DRM 암호화 영향을 받지 않는 CSV 형식 템플릿 다운로드"
          >
            <Download size={15} />
            <span>템플릿 (.csv)</span>
          </button>
        </div>
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

      {/* 엑셀 복사/붙여넣기 모달 (DRM 우회 솔루션) */}
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
                  backgroundColor: 'var(--bg-secondary)',
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
              backgroundColor: 'var(--bg-secondary)'
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

      {/* 사내 보안 DRM/MIP 암호화 감지 안내 모달 */}
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
                backgroundColor: 'var(--bg-secondary)',
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
