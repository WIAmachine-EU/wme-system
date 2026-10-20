import React, { useState } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const STANDARD_HEADERS = [
  'MODEL', 'NC', 'S/N', 'P/O', 'BUYING PRICE', 'B/L DATE', 'OPTION', 
  'STATUS', 'SITUATION', 'LOCATION', 'ORDER DEALER', 'PO DATE', 
  'RENTAL DEALER', 'START', 'END', 'REMARKS', 'S/O'
];

export default function StockStatusUploadModal({ isOpen, onClose, onUploadSuccess }) {
  const { t } = useTranslation();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [isDragging, setIsDragging] = useState(false);

  if (!isOpen) return null;

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setResult(null);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        setSelectedFile(file);
        setResult(null);
      } else {
        alert("엑셀 파일(.xlsx, .xls)만 업로드 가능합니다.");
      }
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return alert("업로드할 엑셀 파일(.xlsx, .xls)을 선택해주세요.");

    setUploading(true);
    setResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/upload/stock-status', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setResult(data);

      if (data.status === 'success' || data.status === 'partial_success') {
        if (onUploadSuccess) {
          onUploadSuccess();
        }
      }
    } catch (err) {
      setResult({
        status: 'error',
        message: '서버와 통신하는 중 오류가 발생했습니다.',
        errors: [err.message]
      });
    } finally {
      setUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
    setResult(null);
    onClose();
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.55)', backdropFilter: 'blur(5px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000
    }}>
      <div className="glass-card" style={{
        width: '95%', maxWidth: '780px', maxHeight: '90vh', overflowY: 'auto',
        padding: '30px', position: 'relative', boxShadow: '0 20px 40px rgba(0,0,0,0.3)',
        borderRadius: '16px'
      }}>
        {/* 헤더 */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: 'hsla(217, 91%, 60%, 0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <FileSpreadsheet color="var(--wia-blue)" size={24} />
            </div>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.3rem', color: 'var(--text-primary)', fontWeight: 700 }}>
                재고 엑셀 업로드 (Stock Status Import)
              </h2>
              <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                2023~2025년 과거 선적 도착 장비 및 현재 창고 재고 현황을 데이터베이스에 일괄 적재·갱신합니다.
              </p>
            </div>
          </div>
          <button onClick={handleClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '6px' }}>
            <X size={22} />
          </button>
        </div>

        {/* 표준 헤더 안내 가이드 */}
        <div style={{
          backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
          borderRadius: '12px', padding: '16px', marginBottom: '22px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
              📌 표준 헤더 양식 (17개 열 자동 파싱 및 매핑)
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--accent-amber, #f59e0b)', fontWeight: 600 }}>
              * 1행 마지막열 'NO'는 카운트용이므로 업로드 시 자동 제외됨
            </span>
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '6px' }}>
            {STANDARD_HEADERS.map((h, idx) => (
              <span key={idx} style={{
                fontSize: '0.72rem', padding: '3px 8px', borderRadius: '6px',
                backgroundColor: 'var(--bg-input)', border: '1px solid var(--border-color)',
                color: (h === 'MODEL' || h === 'P/O' || h === 'S/N') ? 'var(--accent-cyan)' : 'var(--text-secondary)',
                fontWeight: (h === 'MODEL' || h === 'P/O' || h === 'S/N') ? 700 : 500
              }}>
                {h}
              </span>
            ))}
          </div>

          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '10px', lineHeight: 1.5 }}>
            • B/L DATE 기준으로 창고 페이지의 <strong>에이징(Aging, 경과 일수)</strong>이 자동 계산됩니다.<br />
            • SITUATION / STATUS 열에 따라 <strong>일반재고(STOCK), 임대(RENTAL), 전시(SHOWROOM)</strong> 배지가 부여됩니다.<br />
            • 기존에 동일한 P/O 또는 S/N가 등록되어 있을 경우 최신 엑셀 정보로 안전하게 <strong>갱신(Upsert)</strong>됩니다.
          </div>
        </div>

        {/* 파일 업로드 드롭존 */}
        <form onSubmit={handleUpload}>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            style={{
              border: `2px dashed ${isDragging ? 'var(--wia-blue)' : 'var(--border-color)'}`,
              borderRadius: '12px', padding: '32px 20px', textAlign: 'center',
              backgroundColor: isDragging ? 'hsla(217, 91%, 60%, 0.08)' : 'var(--bg-secondary)',
              cursor: 'pointer', transition: 'all 0.2s ease', marginBottom: '20px'
            }}
            onClick={() => document.getElementById('stock-excel-file-input').click()}
          >
            <input
              id="stock-excel-file-input"
              type="file"
              accept=".xlsx, .xls"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '50px', height: '50px', borderRadius: '50%', backgroundColor: 'var(--bg-input)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Upload size={24} color="var(--wia-blue)" />
              </div>
              <div>
                <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {selectedFile ? selectedFile.name : 'Stock Status 엑셀 파일(.xlsx, .xls)을 여기에 드래그하거나 클릭하여 선택하세요'}
                </span>
                {selectedFile && (
                  <div style={{ fontSize: '0.8rem', color: 'var(--accent-blue)', marginTop: '4px' }}>
                    파일 크기: {(selectedFile.size / 1024).toFixed(1)} KB
                  </div>
                )}
              </div>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                Stock Status 10월.xlsx 또는 표준 양식 엑셀 파일 지원
              </span>
            </div>
          </div>

          {/* 결과 피드백 배너 */}
          {result && (
            <div style={{
              marginBottom: '20px', padding: '16px', borderRadius: '10px',
              backgroundColor: (result.status === 'success' || result.status === 'partial_success') ? 'hsla(142, 76%, 46%, 0.12)' : 'hsla(0, 84%, 60%, 0.12)',
              border: `1px solid ${(result.status === 'success' || result.status === 'partial_success') ? 'var(--status-stock)' : 'var(--status-shipping)'}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700, color: (result.status === 'success' || result.status === 'partial_success') ? 'var(--status-stock)' : 'var(--status-shipping)', marginBottom: '6px' }}>
                {(result.status === 'success' || result.status === 'partial_success') ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
                <span>{result.message}</span>
              </div>
              {result.total_rows !== undefined && (
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  • 총 처리 대상: <strong>{result.total_rows}</strong>건 | 신규 등록: <strong>{result.inserted_count}</strong>건 | 기존 갱신: <strong>{result.updated_count}</strong>건
                </div>
              )}
              {result.errors && result.errors.length > 0 && (
                <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)' }}>
                  <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--status-shipping)' }}>확인 및 경고 내역 ({result.errors.length}건):</span>
                  <ul style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', paddingLeft: '20px', margin: '4px 0 0 0', maxHeight: '100px', overflowY: 'auto' }}>
                    {result.errors.map((err, i) => <li key={i}>{err}</li>)}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* 하단 액션 버튼 */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              type="button"
              onClick={handleClose}
              className="btn btn-outline"
              style={{ padding: '9px 18px', fontSize: '0.9rem' }}
            >
              닫기
            </button>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="btn btn-primary"
              style={{ padding: '9px 20px', fontSize: '0.9rem', display: 'flex', alignItems: 'center', gap: '8px' }}
            >
              {uploading ? (
                <>
                  <RefreshCw className="spin" size={16} />
                  <span>데이터베이스 반영 중...</span>
                </>
              ) : (
                <>
                  <Upload size={16} />
                  <span>업로드 및 창고 DB 반영</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
