import React, { useState, useRef } from 'react';
import { UploadCloud, CheckCircle, AlertTriangle, Download, Loader2 } from 'lucide-react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';

export default function AdminShipmentUpload({ isMobileView }) {
  const [data, setData] = useState([]);
  const [errors, setErrors] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState(null); // 'idle', 'success', 'error'
  const fileInputRef = useRef(null);

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleFileUpload = (file) => {
    setUploadStatus('idle');
    setUploadProgress(0);
    
    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          validateAndSetData(results.data);
        },
        error: (err) => {
          alert('CSV 파일 파싱 중 오류가 발생했습니다.');
        }
      });
    } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const json = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
        validateAndSetData(json);
      };
      reader.readAsArrayBuffer(file);
    } else {
      alert('지원하지 않는 파일 형식입니다. CSV 또는 엑셀 파일을 업로드해주세요.');
    }
  };

  const validateAndSetData = (rawData) => {
    const validatedData = [];
    const validationErrors = [];
    const snSet = new Set();

    rawData.forEach((row, index) => {
      // Handle potential variations in header names
      const mbl = row['MBL (선하증권 번호)'] || row['MBL'] || row['mbl'] || '';
      const port = row['PORT (도착항/POD)'] || row['PORT'] || row['port'] || row['POD'] || '';
      const model = row['MODEL (장비명)'] || row['MODEL'] || row['model'] || '';
      const sn = row['S/N (시리얼 번호)'] || row['S/N'] || row['sn'] || row['serial_number'] || '';
      const po = row['P/O (주문 번호)'] || row['P/O'] || row['po'] || row['reference_no'] || '';

      const rowData = {
        mbl_no: mbl.toString().trim(),
        pol: '', // Often not in the simple template, but can be added
        pod: port.toString().trim(),
        model_name: model.toString().trim(),
        serial_number: sn.toString().trim(),
        reference_no: po.toString().trim(),
        _isValid: true,
        _errorMsg: ''
      };

      if (!rowData.mbl_no) {
        rowData._isValid = false;
        rowData._errorMsg += 'MBL 누락. ';
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
        'MBL (선하증권 번호)': 'HMM123456789',
        'PORT (도착항/POD)': 'Hamburg',
        'MODEL (장비명)': 'KF5600II',
        'S/N (시리얼 번호)': 'K3G112',
        'P/O (주문 번호)': 'PO-2601'
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

      const res = await fetch('http://localhost:8000/api/shipments/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (res.ok) {
        setUploadStatus('success');
        setTimeout(() => {
          setData([]);
          setErrors([]);
          setUploadProgress(0);
          setUploadStatus('idle');
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
    <div style={{ padding: isMobileView ? '16px' : '32px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', margin: 0 }}>
          선적정보 업로드 (API Tracking 연동)
        </h1>
        <button 
          onClick={downloadTemplate}
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Download size={18} />
          <span>템플릿 다운로드</span>
        </button>
      </div>

      <div 
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        style={{
          maxWidth: '500px',
          margin: '0 auto 32px',
          border: '2px dashed var(--border-color)',
          borderRadius: '12px',
          padding: '20px',
          textAlign: 'center',
          backgroundColor: 'var(--bg-secondary)',
          cursor: 'pointer',
          transition: 'all 0.2s ease'
        }}
        onClick={() => fileInputRef.current?.click()}
      >
        <UploadCloud size={48} color="var(--wia-light-gold)" style={{ margin: '0 auto 16px' }} />
        <h3 style={{ fontSize: '1.1rem', marginBottom: '8px', color: 'var(--text-primary)' }}>
          클릭하거나 파일을 이곳에 드롭하세요.
        </h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          지원 형식: .xlsx, .xls, .csv
        </p>
        <input 
          type="file" 
          ref={fileInputRef} 
          style={{ display: 'none' }} 
          accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
          onChange={handleFileSelect}
        />
      </div>

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
