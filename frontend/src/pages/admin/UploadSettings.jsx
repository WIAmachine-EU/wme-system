import React, { useState, useEffect } from 'react';
import { FileSpreadsheet, Upload, Mail, Plus, X, ShoppingCart } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import StockStatusUploadModal from '../../components/StockStatusUploadModal';

const STAGE_ORDER = [
  'ETD_IMMEDIATE',
  'SHIPPING_INTERVAL',
  'HAMBURG_ARRIVAL',
  'HAMBURG_WAREHOUSE_COMPLETE',
  'DELIVERY_DUE_ALERT',
  'PROMOTION_EXPIRY_ALERT',
  'RENTAL_EXPIRY_ALERT'
];

const STAGE_INFO = {
  ETD_IMMEDIATE: {
    name: '1. 출항(ETD) 직후 일정 안내',
    target: '발주 딜러 및 관리자',
    badge: () => '즉시 통지',
    badgeColor: 'hsla(217, 91%, 60%, 0.15)',
    textColor: 'var(--accent-blue)'
  },
  SHIPPING_INTERVAL: {
    name: '2. 해상 운송 중 정기 통지',
    target: '발주 딜러 및 관리자',
    badge: (days) => `매 ${days || 10}일 주기`,
    badgeColor: 'hsla(190, 95%, 49%, 0.15)',
    textColor: 'var(--accent-cyan)'
  },
  HAMBURG_ARRIVAL: {
    name: '3. 유럽 항구 도착',
    target: '발주 딜러 및 관리자',
    badge: () => '즉시 통지 (HHLA 연동)',
    badgeColor: 'hsla(217, 91%, 60%, 0.15)',
    textColor: 'var(--accent-blue)'
  },
  HAMBURG_WAREHOUSE_COMPLETE: {
    name: '4. 함부르크 창고 입고',
    target: '발주 딜러 및 관리자',
    badge: () => '즉시 통지 (입고완료)',
    badgeColor: 'hsla(142, 76%, 46%, 0.15)',
    textColor: 'var(--status-stock)'
  },
  DELIVERY_DUE_ALERT: {
    name: '5. 배송요청일(D-Day) 지연 방지 알림',
    target: '관리자 (Admin)',
    badge: () => '월 마지막 주차 진입 시',
    badgeColor: 'hsla(38, 92%, 50%, 0.15)',
    textColor: 'var(--accent-amber, #f59e0b)'
  },
  PROMOTION_EXPIRY_ALERT: {
    name: '6. 프로모션 예약 만료 사전 알림',
    target: '관리자 및 해당 예약 딜러',
    badge: () => '만료 1일 전 (D-1)',
    badgeColor: 'hsla(0, 84%, 60%, 0.15)',
    textColor: 'var(--status-shipping, #ef4444)'
  },
  RENTAL_EXPIRY_ALERT: {
    name: '7. 임대(Rental) 만료 연장/반납 사전 공지',
    target: '관리자 (Admin)',
    badge: () => '만료 7일 전 (D-7)',
    badgeColor: 'hsla(260, 84%, 65%, 0.15)',
    textColor: 'var(--accent-purple, #a855f7)'
  }
};

export default function UploadSettings() {
  const [emailConfigs, setEmailConfigs] = useState([]);
  const [productModels, setProductModels] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [ncCodes, setNcCodes] = useState([]);
  const [incotermCodes, setIncotermCodes] = useState([]);
  const [portCodes, setPortCodes] = useState([]);

  // 단건 발주 생성 상태
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newOrderForm, setNewOrderForm] = useState({
    reference_no: '',
    product_model_id: '',
    dealer_company_id: '',
    nc: '',
    incoterms: '',
    destination_port: '',
    dealer_order_date: '',
    delivery_request_date: '',
    detail_spec: ''
  });
  const [creatingOrder, setCreatingOrder] = useState(false);

  // 엑셀 업로드 상태
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  // PDF 업로드 상태
  const [selectedPdfFile, setSelectedPdfFile] = useState(null);
  const [pdfUploadResult, setPdfUploadResult] = useState(null);
  const [pdfUploading, setPdfUploading] = useState(false);

  // 재고 엑셀 업로드 모달 상태
  const [stockModalOpen, setStockModalOpen] = useState(false);

  const loadConfigs = async () => {
    try {
      const [emailRes, modelsRes, dealersRes, ncRes, incotermRes, portRes] = await Promise.all([
        fetch('/api/email-configs'),
        fetch('/api/models'),
        fetch('/api/dealers'),
        fetch('/api/master-data/nc-codes'),
        fetch('/api/master-data/incoterm-codes'),
        fetch('/api/master-data/port-codes')
      ]);
      setEmailConfigs(await emailRes.json());
      setProductModels(await modelsRes.json());
      setDealers(await dealersRes.json());
      setNcCodes(await ncRes.json());
      setIncotermCodes(await incotermRes.json());
      setPortCodes(await portRes.json());
    } catch (e) {
      console.error("Config fetch error:", e);
    }
  };

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleCreateOrder = async (e) => {
    e.preventDefault();
    if (!newOrderForm.reference_no || !newOrderForm.product_model_id || !newOrderForm.dealer_company_id) {
      return alert("필수 항목을 모두 입력해주세요.");
    }

    setCreatingOrder(true);
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reference_no: newOrderForm.reference_no,
          product_model_id: Number(newOrderForm.product_model_id),
          dealer_company_id: Number(newOrderForm.dealer_company_id),
          nc: newOrderForm.nc,
          incoterms: newOrderForm.incoterms,
          destination_port: newOrderForm.destination_port,
          dealer_order_date: newOrderForm.dealer_order_date || null,
          delivery_request_date: newOrderForm.delivery_request_date || null,
          detail_spec: newOrderForm.detail_spec || null
        })
      });

      if (res.ok) {
        alert("신규 발주가 성공적으로 생성되었습니다.");
        setShowCreateModal(false);
        setNewOrderForm({ reference_no: '', product_model_id: '', dealer_company_id: '', nc: '', incoterms: '', destination_port: '', dealer_order_date: '', delivery_request_date: '', detail_spec: '' });
      } else {
        const err = await res.json();
        alert(`생성 실패: ${err.detail || '알 수 없는 오류'}`);
      }
    } catch (err) {
      alert("서버 통신 오류가 발생했습니다.");
    } finally {
      setCreatingOrder(false);
    }
  };

  const handleFileUpload = async (e) => {
    e.preventDefault();
    if (!selectedFile) return alert("업로드할 엑셀 파일(.xlsx)을 선택해주세요.");

    setUploading(true);
    setUploadResult(null);
    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      const res = await fetch('/api/upload/excel', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setUploadResult(data);
    } catch (err) {
      setUploadResult({ status: 'error', message: '서버 통신 중 오류가 발생했습니다.' });
    } finally {
      setUploading(false);
    }
  };

  const handlePdfUpload = async (e) => {
    e.preventDefault();
    if (!selectedPdfFile) return alert("업로드할 입고증 PDF 파일을 선택해주세요.");

    setPdfUploading(true);
    setPdfUploadResult(null);
    const formData = new FormData();
    formData.append('file', selectedPdfFile);

    try {
      const res = await fetch('/api/upload/pdf-cargo', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      setPdfUploadResult(data);
    } catch (err) {
      setPdfUploadResult({ status: 'error', message: '서버 통신 중 오류가 발생했습니다.' });
    } finally {
      setPdfUploading(false);
    }
  };

  const handleToggleEmailRule = async (configId, currentActive) => {
    try {
      await fetch(`/api/email-configs/${configId}?is_active=${!currentActive}`, {
        method: 'PATCH'
      });
      loadConfigs();
    } catch (e) {
      alert("알림 설정 변경 실패");
    }
  };

  const { t } = useTranslation();

  return (
    <div className="page-body">
      <div style={{ marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('management.page_title', 'Upload / Setting')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {t('management.page_desc', 'On this page, you can upload a new order and set an alert for the schedule.')}
        </p>
      </div>

      {/* 신규 단건 발주 생성 */}
      <div className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <ShoppingCart color="var(--accent-blue)" size={24} />
          <h2 style={{ fontSize: '1.3rem' }}> {t('management.create_order_title', 'Upload New A or F Order')}</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
          {t('management.create_order_desc', 'You can create new orders for A or F in real-time.')}
        </p>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary upload-hover-btn"
          style={{ padding: '10px 20px', fontSize: '0.95rem' }}
        >
          <Plus size={18} />
          <span>{t('management.btn_create_order', 'Create New Order')}</span>
        </button>
      </div>

      <div className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <FileSpreadsheet color="var(--accent-cyan)" size={24} />
          <h2 style={{ fontSize: '1.3rem' }}>{t('management.bulk_upload_title', 'Order Upload(Bulk)')}</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
          {t('management.bulk_upload_desc', 'You can upload both dealer orders and WME stock orders.')}
        </p>

        <form onSubmit={handleFileUpload} style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
          <input
            type="file"
            accept=".xlsx, .xls"
            onChange={e => setSelectedFile(e.target.files[0])}
            style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}
          />
          <button type="submit" disabled={uploading || !selectedFile} className="btn btn-primary upload-hover-btn">
            <Upload size={16} />
            <span>{uploading ? 'Data validation and upload...' : t('management.btn_upload', 'Upload Standard EXCEL Template')}</span>
          </button>

          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            * {t('management.standard_headers', 'Standard Headers')}: <code>MODEL, NC, P/O, PRICE, DEALER, DETAIL SPEC, INCOTERMS, PORT</code>
          </div>
        </form>

        {uploadResult && (
          <div style={{
            marginTop: '16px', padding: '16px', borderRadius: '10px',
            background: uploadResult.status === 'success' ? 'hsla(142, 76%, 46%, 0.15)' : 'hsla(24, 95%, 53%, 0.15)',
            border: `1px solid ${uploadResult.status === 'success' ? 'var(--status-stock)' : 'var(--status-shipping)'}`
          }}>
            <div style={{ fontWeight: 700, marginBottom: '6px', color: uploadResult.status === 'success' ? 'var(--status-stock)' : 'var(--status-shipping)' }}>
              {uploadResult.message}
            </div>
            {uploadResult.errors && uploadResult.errors.length > 0 && (
              <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '20px', maxHeight: '120px', overflowY: 'auto' }}>
                {uploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Upload color="var(--accent-green)" size={24} />
          <h2 style={{ fontSize: '1.3rem' }}>입고증 PDF 업로드 (Cargo Details)</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
          입고증(Einlagerungsmeldung) PDF 파일을 업로드하면 AI가 내용을 분석하여 화물 상세 정보(Cargo Details)를 자동으로 데이터베이스에 업데이트합니다.
        </p>

        <form onSubmit={handlePdfUpload} style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap', background: 'var(--bg-secondary)', padding: '20px', borderRadius: '12px', border: '1px dashed var(--border-color)' }}>
          <input
            type="file"
            accept=".pdf"
            onChange={e => setSelectedPdfFile(e.target.files[0])}
            style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}
          />
          <button type="submit" disabled={pdfUploading || !selectedPdfFile} className="btn btn-primary upload-hover-btn">
            <Upload size={16} />
            <span>{pdfUploading ? 'PDF 분석 및 업로드 중...' : '입고증 PDF 업로드'}</span>
          </button>
        </form>

        {pdfUploadResult && (
          <div style={{
            marginTop: '16px', padding: '16px', borderRadius: '10px',
            background: pdfUploadResult.status === 'success' ? 'hsla(142, 76%, 46%, 0.15)' : 'hsla(24, 95%, 53%, 0.15)',
            border: `1px solid ${pdfUploadResult.status === 'success' ? 'var(--status-stock)' : 'var(--status-shipping)'}`
          }}>
            <div style={{ fontWeight: 700, marginBottom: '6px', color: pdfUploadResult.status === 'success' ? 'var(--status-stock)' : 'var(--status-shipping)' }}>
              {pdfUploadResult.message}
            </div>
            {pdfUploadResult.errors && pdfUploadResult.errors.length > 0 && (
              <ul style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', paddingLeft: '20px', maxHeight: '120px', overflowY: 'auto' }}>
                {pdfUploadResult.errors.map((err, i) => <li key={i}>{err}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* 재고 엑셀 업로드 (Stock Status) - 입고증 PDF 업로드 바로 아래 배치 */}
      <div className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <FileSpreadsheet color="var(--accent-blue)" size={24} />
          <h2 style={{ fontSize: '1.3rem' }}>재고 엑셀 업로드 (Stock Status)</h2>
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '16px' }}>
          과거 2023~2025년 도착 장비 및 현재 창고 재고 현황(Stock Status) 엑셀을 업로드하여 창고 페이지에 일괄 등록/갱신합니다.
        </p>

        <div style={{ background: 'var(--bg-secondary)', padding: '16px', borderRadius: '12px', marginBottom: '20px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '8px' }}>
            📋 표준 헤더 (17개 열 자동 인식):
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6, wordBreak: 'break-all' }}>
            <code>MODEL - NC - S/N - P/O - BUYING PRICE - B/L DATE - OPTION - STATUS - SITUATION - LOCATION - ORDER DEALER - PO DATE - RENTAL DEALER - START - END - REMARKS - S/O</code>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--accent-amber, #f59e0b)', marginTop: '6px' }}>
            * 1행 마지막 열의 'NO' 헤더는 수량 참고용이므로 업로드 대상에서 자동 제외됩니다.
          </div>
        </div>

        <button
          onClick={() => setStockModalOpen(true)}
          className="btn btn-primary upload-hover-btn"
          style={{ padding: '10px 22px', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <Upload size={18} />
          <span>[재고 엑셀 업로드] 모달 열기</span>
        </button>
      </div>

      <StockStatusUploadModal
        isOpen={stockModalOpen}
        onClose={() => setStockModalOpen(false)}
      />

      <div className="glass-card" style={{ padding: '28px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Mail color="var(--accent-purple)" size={24} />
          <h2 style={{ fontSize: '1.3rem' }}>{t('management.notification_setup_title', 'Set Up Automated Schedule Notifications and Frequency')}</h2>
        </div>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '20px' }}>
          <p style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)' }}>[기본 배송망 및 자동 일정 알림 설정]</p>
          <ul style={{ paddingLeft: '20px', lineHeight: 1.6, marginBottom: '16px' }}>
            <li>1. <strong>출항(ETD) 직후:</strong> ETD 및 초기 ETA 일정안내 이메일 발송 (발주 딜러 및 관리자)</li>
            <li>2. <strong>해상 운송 중:</strong> 10일 주기로 정기 ETA 정보 통지 (발주 딜러 및 관리자)</li>
            <li>3. <strong>유럽 항구 도착:</strong> 함부르크 항구 도착(HHLA API 연동) 정보 자동 업데이트 및 통지</li>
            <li>4. <strong>창고 입고:</strong> 입고 완료 시 가용재고 상태전환 알림 발송</li>
          </ul>
          <p style={{ fontWeight: 'bold', marginBottom: '8px', color: 'var(--text-primary)' }}>[일정 관리 및 프로모션/임대 자동화 알림 (실제 가동 중)]</p>
          <ul style={{ paddingLeft: '20px', lineHeight: 1.6 }}>
            <li>5. <strong>배송요청일(D-Day):</strong> 배송요청일 해당 월 마지막 주차(월말 7일 이내) 진입 시 관리자(admin)에게 지연 방지 알림 발송</li>
            <li>6. <strong>프로모션 예약 만료:</strong> 프로모션 만료기간 하루 전(D-1) 관리자와 딜러에게 이메일 발송 및 만료 시 판매가능 상태로 자동 취소(Roll-back)</li>
            <li>7. <strong>임대(Rental) 만료:</strong> 임대 기간 만료 1주일 전(D-7) 연장/반납에 대한 내용으로 관리자(admin)에게 사전 공지 이메일 자동 발송</li>
          </ul>
        </div>

        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>통지 단계 (Stage)</th>
                <th style={{ width: '15%' }}>수신 대상</th>
                <th style={{ width: '18%' }}>통지 / 반복 주기</th>
                <th>이메일 내용 요약</th>
                <th style={{ width: '16%', textAlign: 'center' }}>엔진 스위치 (On/Off)</th>
              </tr>
            </thead>
            <tbody>
              {[...emailConfigs]
                .sort((a, b) => {
                  const idxA = STAGE_ORDER.indexOf(a.stage);
                  const idxB = STAGE_ORDER.indexOf(b.stage);
                  return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
                })
                .map(config => {
                  const info = STAGE_INFO[config.stage] || {
                    name: config.stage,
                    target: '담당자',
                    badge: (days) => (days ? `매 ${days}일` : '즉시 통지'),
                    badgeColor: 'hsla(217, 91%, 60%, 0.15)',
                    textColor: 'var(--accent-blue)'
                  };
                  return (
                    <tr key={config.id}>
                      <td>
                        <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                          {info.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                          [{config.stage}]
                        </div>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {info.target}
                      </td>
                      <td>
                        <span style={{
                          background: info.badgeColor,
                          color: info.textColor,
                          padding: '4px 10px',
                          borderRadius: '6px',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          display: 'inline-block'
                        }}>
                          {info.badge(config.interval_days)}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                        {config.email_template}
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleEmailRule(config.id, config.is_active)}
                          style={{
                            background: config.is_active ? 'var(--status-stock)' : 'var(--bg-secondary)',
                            color: config.is_active ? 'hsl(222, 47%, 10%)' : 'var(--text-muted)',
                            padding: '6px 14px',
                            borderRadius: '9999px',
                            fontWeight: 700,
                            fontSize: '0.75rem',
                            border: config.is_active ? 'none' : '1px solid var(--border-color)',
                            cursor: 'pointer',
                            transition: 'all 0.2s ease',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          {config.is_active ? '● 엔진 활성 (Running)' : '○ 비활성화 됨 (Paused)'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 발주 생성 모달 */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '700px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.4rem', margin: 0, color: 'var(--text-primary)' }}>{t('management.modal_title_new_order', '신규 단건 발주 생성')}</h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* 1. MODEL */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_model', '모델')} *</label>
                <select
                  required
                  value={newOrderForm.product_model_id || ''}
                  onChange={e => setNewOrderForm({ ...newOrderForm, product_model_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="">{t('management.modal_select_model', '-- 모델 선택 --')}</option>
                  {productModels.map(m => (
                    <option key={m.id} value={m.id}>{m.model_code || m.model_name}</option>
                  ))}
                </select>
              </div>

              {/* 2. NC */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_nc', 'NC')} *</label>
                <select
                  required
                  value={newOrderForm.nc || ''}
                  onChange={e => setNewOrderForm({ ...newOrderForm, nc: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="">{t('management.modal_select_nc', '-- NC 선택 --')}</option>
                  {ncCodes.map(nc => (
                    <option key={nc.nc_code} value={nc.nc_code}>{nc.nc_code}</option>
                  ))}
                </select>
              </div>

              {/* 3. P/O */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_po', 'P/O')} *</label>
                <input
                  type="text"
                  required
                  placeholder={t('management.modal_label_po', 'P/O')}
                  value={newOrderForm.reference_no}
                  onChange={e => setNewOrderForm({ ...newOrderForm, reference_no: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* 4. DEALER */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_dealer', '딜러')} *</label>
                <select
                  required
                  value={newOrderForm.dealer_company_id || ''}
                  onChange={e => setNewOrderForm({ ...newOrderForm, dealer_company_id: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="">{t('management.modal_select_dealer', '-- 딜러 선택 --')}</option>
                  {dealers.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>

              {/* 5. Dealer Order Date */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_order_date', '주문일자')}</label>
                <input
                  type="date"
                  value={newOrderForm.dealer_order_date}
                  onChange={e => setNewOrderForm({ ...newOrderForm, dealer_order_date: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* 6. Delivery Request Date */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_req_date', '배송요청일')}</label>
                <input
                  type="month"
                  value={newOrderForm.delivery_request_date}
                  onChange={e => setNewOrderForm({ ...newOrderForm, delivery_request_date: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>

              {/* 7. INCOTERMS */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_incoterms', 'Incoterms')} *</label>
                <select
                  required
                  value={newOrderForm.incoterms || ''}
                  onChange={e => setNewOrderForm({ ...newOrderForm, incoterms: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="">{t('management.modal_select_incoterms', '-- Incoterms 선택 --')}</option>
                  {incotermCodes.map(ic => (
                    <option key={ic.incoterm_code} value={ic.incoterm_code}>{ic.incoterm_code}</option>
                  ))}
                </select>
              </div>

              {/* 8. PORT */}
              <div>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_port', '항구')} *</label>
                <select
                  required
                  value={newOrderForm.destination_port || ''}
                  onChange={e => setNewOrderForm({ ...newOrderForm, destination_port: e.target.value })}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                >
                  <option value="">{t('management.modal_select_port', '-- 항구 선택 --')}</option>
                  {portCodes.map(pc => (
                    <option key={pc.port_code} value={pc.port_code}>{pc.port_code}</option>
                  ))}
                </select>
              </div>

              {/* 9. DETAIL SPEC */}
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={{ display: 'block', marginBottom: '8px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('management.modal_label_spec', '장비옵션')}</label>
                <input
                  type="text"
                  value={newOrderForm.detail_spec}
                  onChange={e => setNewOrderForm({ ...newOrderForm, detail_spec: e.target.value })}
                  placeholder={t('management.modal_label_spec', '장비옵션')}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                />
              </div>

              </div>

              <div className="modal-footer" style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-outline">{t('management.modal_btn_cancel', '취소')}</button>
                <button type="submit" disabled={creatingOrder} className="btn btn-primary">
                  {creatingOrder ? t('management.modal_btn_creating', '생성 중...') : t('management.modal_btn_create', '발주 생성')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      <style>{`
        .upload-hover-btn:hover:not(:disabled) {
          background-color: rgb(205, 170, 125) !important;
          border-color: rgb(205, 170, 125) !important;
        }
      `}</style>
    </div>
  );
}
