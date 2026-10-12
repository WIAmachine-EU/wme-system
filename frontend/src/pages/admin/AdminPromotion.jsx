import React, { useState, useEffect } from 'react';
import { Tag, CheckCircle, Clock, CheckCircle2, Search, Edit2, Check, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AdminPromotion({ isMobileView }) {
  const { t } = useTranslation();
  const [promotions, setPromotions] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [portCodes, setPortCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  const getStandardPort = (rawPort) => {
    if (!rawPort) return '-';
    if (!portCodes || portCodes.length === 0) return rawPort;
    const lowerRaw = rawPort.toLowerCase().trim();
    const exactMatch = portCodes.find(p => p.port_code.toLowerCase() === lowerRaw);
    if (exactMatch) return exactMatch.port_code;
    const startsMatch = portCodes.find(p => p.port_code.toLowerCase().startsWith(lowerRaw));
    if (startsMatch) return startsMatch.port_code;
    return rawPort;
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [reservingId, setReservingId] = useState(null);
  const [selectedDealerId, setSelectedDealerId] = useState('');
  const [reservedUntilDays, setReservedUntilDays] = useState(7);

  const [sellingId, setSellingId] = useState(null);
  const [finalBuyerDealerId, setFinalBuyerDealerId] = useState('');

  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editPriceValue, setEditPriceValue] = useState('');
  
  const handleEditPrice = (promo) => {
    setEditingPriceId(promo.id);
    setEditPriceValue(promo.promotion_price || '');
  };
  
  const handleSavePrice = async (promoId) => {
    try {
      const res = await fetch(`/api/promotions/${promoId}/price`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ promotion_price: editPriceValue })
      });
      if (res.ok) {
        setEditingPriceId(null);
        loadData();
      } else {
        alert("가격 수정 실패");
      }
    } catch (e) {
      alert("서버 연결 실패");
    }
  };

  const fileInputRef = React.useRef(null);
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      setLoading(true);
      const res = await fetch("/api/promotions/upload", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      if (data.status === "success") {
        alert(data.message);
        loadData();
      } else {
        alert(data.message + "\n" + (data.errors ? data.errors.join("\n") : ""));
        setLoading(false);
      }
    } catch (err) {
      alert("업로드 중 오류 발생");
      setLoading(false);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const loadData = async () => {
    setLoading(true);
    try {
      const [promoRes, dealerRes, portsRes] = await Promise.all([
        fetch('/api/promotions'),
        fetch('/api/dealers'),
        fetch('/api/master-data/port-codes')
      ]);
      setPromotions(await promoRes.json());
      setDealers(await dealerRes.json());
      setPortCodes(await portsRes.json());
    } catch (e) {
      console.error("Promotion data fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleConfirmReserve = async (promoId) => {
    if (!selectedDealerId) return alert("예약할 유럽 현지 딜러사를 선택해주세요.");
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + Number(reservedUntilDays));

    try {
      const res = await fetch(`/api/promotions/${promoId}/reserve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reserved_dealer_id: Number(selectedDealerId),
          reservation_expiry: expiryDate.toISOString()
        })
      });
      if (res.ok) {
        alert("성공적으로 해당 장비가 딜러사 전용 예약(Reserved) 처리되었습니다.");
        setReservingId(null);
        loadData();
      } else {
        const err = await res.json();
        alert(err.detail || "예약 처리 실패");
      }
    } catch (e) {
      alert("서버 연결 실패");
    }
  };

  const handleCancelReservation = async (promoId) => {
    if (!window.confirm("정말로 예약을 취소하시겠습니까? 해당 장비는 다시 판매가능(AVAILABLE) 상태로 돌아갑니다.")) return;
    try {
      const res = await fetch(`/api/promotions/${promoId}/cancel`, {
        method: 'PATCH'
      });
      if (res.ok) {
        alert("예약이 취소되었습니다.");
        loadData();
      } else {
        const err = await res.json();
        alert(err.detail || "예약 취소 실패");
      }
    } catch (e) {
      alert("서버 연결 실패");
    }
  };

  const handleConfirmSold = async (promoId) => {
    if (!finalBuyerDealerId) return alert("최종 실 구매 딜러사를 선택해주세요.");

    try {
      const res = await fetch(`/api/promotions/${promoId}/sold`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ final_buyer_dealer_id: Number(finalBuyerDealerId) })
      });
      if (res.ok) {
        alert("장기 재고 프로모션 판매가 확정되었습니다! (시리얼 추적 마스터 연동)");
        setSellingId(null);
        setFinalBuyerDealerId('');
        loadData();
      } else {
        const err = await res.json();
        alert(err.detail || "판매 처리 실패");
      }
    } catch (e) {
      alert("서버 연결 실패");
    }
  };

  // 정렬 (Sorting) 상태 및 처리
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
  };

  const filteredPromotions = promotions.filter(promo => {
    if (statusFilter !== 'ALL' && promo.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const o = promo.order;
      if (
        (o?.product_model?.model_name && o.product_model.model_name.toLowerCase().includes(q)) ||
        (o?.reference_no && o.reference_no.toLowerCase().includes(q)) ||
        (o?.nc && o.nc.toLowerCase().includes(q)) ||
        (o?.serial_number && o.serial_number.toLowerCase().includes(q)) ||
        (promo.reserved_dealer?.name && promo.reserved_dealer.name.toLowerCase().includes(q)) ||
        (promo.final_buyer_dealer?.name && promo.final_buyer_dealer.name.toLowerCase().includes(q))
      ) return true;
      return false;
    }
    return true;
  });

  const sortedPromotions = [...filteredPromotions].sort((a, b) => {
    if (!sortConfig.key) return 0;
    let valA = '';
    let valB = '';

    switch (sortConfig.key) {
      case 'model':
        valA = a.order?.product_model?.model_name || '';
        valB = b.order?.product_model?.model_name || '';
        break;
      case 'nc':
        valA = a.order?.nc || '';
        valB = b.order?.nc || '';
        break;
      case 'price': {
        const numA = Number(a.promotion_price || a.order?.price) || 0;
        const numB = Number(b.promotion_price || b.order?.price) || 0;
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }
      case 'po':
        valA = a.order?.reference_no || '';
        valB = b.order?.reference_no || '';
        break;
      case 'detail_spec':
        valA = a.order?.detail_spec || '';
        valB = b.order?.detail_spec || '';
        break;
      case 'eta': {
        const timeA = a.order?.eta ? new Date(a.order.eta).getTime() : 0;
        const timeB = b.order?.eta ? new Date(b.order.eta).getTime() : 0;
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      }
      case 'port':
        valA = a.order?.destination_port || '';
        valB = b.order?.destination_port || '';
        break;
      case 'status':
        valA = a.status || '';
        valB = b.status || '';
        break;
      case 'dealer':
        valA = a.final_buyer_dealer?.name || a.reserved_dealer?.name || '';
        valB = b.final_buyer_dealer?.name || b.reserved_dealer?.name || '';
        break;
      default:
        return 0;
    }
    const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
    return sortConfig.direction === 'asc' ? cmp : -cmp;
  });

  const renderSortHeader = (key, label, width = '10%', align = 'center') => {
    const isSorted = sortConfig.key === key;
    return (
      <th
        style={{
          width,
          textAlign: align,
          fontWeight: 'bold',
          cursor: 'pointer',
          userSelect: 'none',
          transition: 'all 0.2s',
          whiteSpace: 'nowrap'
        }}
        onClick={() => handleSort(key)}
        className="sortable-th"
        title={`${label} ${isSorted ? (sortConfig.direction === 'asc' ? '내림차순 정렬' : '오름차순 정렬') : '정렬'}`}
      >
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: align === 'left' ? 'flex-start' : (align === 'right' ? 'flex-end' : 'center'),
          gap: '5px'
        }}>
          <span>{label}</span>
          <span style={{
            fontSize: '11px',
            fontWeight: isSorted ? 'bold' : 'normal',
            color: isSorted ? 'var(--wia-blue)' : 'var(--text-muted)',
            opacity: isSorted ? 1 : 0.35,
            transition: 'all 0.15s ease'
          }}>
            {isSorted ? (sortConfig.direction === 'asc' ? '▲' : '▼') : '⇅'}
          </span>
        </div>
      </th>
    );
  };

  return (
    <div className="page-body">
      <div style={{ marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('menu3.page_title', '프로모션 관리')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {t('menu3.page_desc', '프로모션 이벤트 기종의 예약/판매 상태를 관리합니다.')}
        </p>
      </div>

      <div className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
        {isMobileView ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 style={{ fontSize: '1.2rem', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                <Tag color="var(--status-production)" size={20} />
                <span>{t('menu3.list_title', '진행 중인 프로모션')}</span>
              </h2>
              <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', padding: '6px 10px', background: 'var(--bg-secondary)' }}>
                <Upload size={14} />
                {t('menu3.btn_upload', '프로모션 업로드')}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" style={{ display: 'none' }} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
              <div style={{ position: 'relative', flex: 1 }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="text" 
                  placeholder={t('menu3.search_placeholder', '검색')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                    padding: '8px 14px 8px 36px', borderRadius: '10px', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box', outline: 'none'
                  }}
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 12px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none'
                }}
              >
                <option value="ALL">{t('menu3.filter_all', '전체 상태 조회')}</option>
                <option value="AVAILABLE">{t('menu3.status_available', '판매가능')}</option>
                <option value="RESERVED">{t('menu3.status_reserved', '예약중')}</option>
                <option value="SOLD">{t('menu3.status_sold', '판매완료')}</option>
              </select>
              <select
                value={sortConfig.key ? `${sortConfig.key}_${sortConfig.direction}` : ""}
                onChange={e => {
                  if (!e.target.value) {
                    setSortConfig({ key: null, direction: 'asc' });
                  } else {
                    const [key, direction] = e.target.value.split('_');
                    setSortConfig({ key, direction });
                  }
                }}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 12px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none'
                }}
                title="정렬 기준"
              >
                <option value="">기본 정렬</option>
                <option value="model_asc">{t('menu3.header_model', '모델')} ▲ (오름차순)</option>
                <option value="model_desc">{t('menu3.header_model', '모델')} ▼ (내림차순)</option>
                <option value="price_asc">{t('menu3.header_price', 'PRICE')} ▲ (낮은순)</option>
                <option value="price_desc">{t('menu3.header_price', 'PRICE')} ▼ (높은순)</option>
                <option value="eta_asc">{t('menu3.header_eta', 'ETA')} ▲ (빠른순)</option>
                <option value="eta_desc">{t('menu3.header_eta', 'ETA')} ▼ (늦은순)</option>
                <option value="po_asc">{t('menu3.header_po', '발주번호')} ▲</option>
                <option value="po_desc">{t('menu3.header_po', '발주번호')} ▼</option>
                <option value="nc_asc">{t('menu3.header_nc', 'NC')} ▲</option>
                <option value="nc_desc">{t('menu3.header_nc', 'NC')} ▼</option>
                <option value="port_asc">{t('menu2.header_port', 'PORT')} ▲</option>
                <option value="port_desc">{t('menu2.header_port', 'PORT')} ▼</option>
                <option value="status_asc">{t('menu3.header_promotion_status', '상태')} ▲</option>
                <option value="status_desc">{t('menu3.header_promotion_status', '상태')} ▼</option>
              </select>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
            <div>
              <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Tag color="var(--status-production)" size={24} />
                <span>{t('menu3.list_title', '진행 중인 프로모션')}</span>
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => fileInputRef.current && fileInputRef.current.click()} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', padding: '8px 14px', background: 'var(--bg-secondary)' }}>
                <Upload size={16} />
                {t('menu3.btn_upload', '프로모션 업로드')}
              </button>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept=".xlsx,.xls" style={{ display: 'none' }} />
              
              <div style={{ position: 'relative' }}>
                <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input 
                  type="text" 
                  placeholder={t('menu3.search_placeholder', '검색')}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{
                    background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                    padding: '8px 14px 8px 36px', borderRadius: '10px', fontSize: '0.85rem', width: '240px', outline: 'none'
                  }}
                />
              </div>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none'
                }}
              >
                <option value="ALL">{t('menu3.filter_all', '전체 상태 조회')}</option>
                <option value="AVAILABLE">{t('menu3.status_available', '판매가능')}</option>
                <option value="RESERVED">{t('menu3.status_reserved', '예약중')}</option>
                <option value="SOLD">{t('menu3.status_sold', '판매완료')}</option>
              </select>
              <select
                value={sortConfig.key ? `${sortConfig.key}_${sortConfig.direction}` : ""}
                onChange={e => {
                  if (!e.target.value) {
                    setSortConfig({ key: null, direction: 'asc' });
                  } else {
                    const [key, direction] = e.target.value.split('_');
                    setSortConfig({ key, direction });
                  }
                }}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none'
                }}
                title="정렬 기준"
              >
                <option value="">기본 정렬</option>
                <option value="model_asc">{t('menu3.header_model', '모델')} ▲ (오름차순)</option>
                <option value="model_desc">{t('menu3.header_model', '모델')} ▼ (내림차순)</option>
                <option value="price_asc">{t('menu3.header_price', 'PRICE')} ▲ (낮은순)</option>
                <option value="price_desc">{t('menu3.header_price', 'PRICE')} ▼ (높은순)</option>
                <option value="eta_asc">{t('menu3.header_eta', 'ETA')} ▲ (빠른순)</option>
                <option value="eta_desc">{t('menu3.header_eta', 'ETA')} ▼ (늦은순)</option>
                <option value="po_asc">{t('menu3.header_po', '발주번호')} ▲</option>
                <option value="po_desc">{t('menu3.header_po', '발주번호')} ▼</option>
                <option value="nc_asc">{t('menu3.header_nc', 'NC')} ▲</option>
                <option value="nc_desc">{t('menu3.header_nc', 'NC')} ▼</option>
                <option value="port_asc">{t('menu2.header_port', 'PORT')} ▲</option>
                <option value="port_desc">{t('menu2.header_port', 'PORT')} ▼</option>
                <option value="status_asc">{t('menu3.header_promotion_status', '상태')} ▲</option>
                <option value="status_desc">{t('menu3.header_promotion_status', '상태')} ▼</option>
              </select>
            </div>
          </div>
        )}
        
        {loading ? (
           <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>로딩 중...</div>
        ) : isMobileView ? (
          <div className="mobile-cards-grid">
            {sortedPromotions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>조건에 맞는 데이터가 없습니다.</div>
            ) : (
              sortedPromotions.map((promo, index) => (
              <div key={promo.id} className="mobile-order-card">
                <div className="mobile-order-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                      {promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown Model'}
                    </div>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                      {promo.order && promo.order.nc ? promo.order.nc : 'F0iP'}
                    </div>
                  </div>
                  <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
                    {(promo.order && promo.order.reference_no) || 'F26-88-30'}
                  </div>
                </div>
                <div className="mobile-order-meta">
                  <span>PRICE: <strong style={{ color: 'var(--text-primary)' }}>{promo.promotion_price || '-'}</strong></span>
                  <span>ETA: <strong style={{ color: 'var(--text-primary)' }}>{promo.order && promo.order.eta ? new Date(promo.order.eta).toLocaleDateString() : '-'}</strong></span>
                  <span>PORT: <strong style={{ color: 'var(--text-primary)' }}>{getStandardPort(promo.order?.destination_port)}</strong></span>
                </div>
                
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '12px' }}>
                  {(promo.order && promo.order.detail_spec) || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>STATUS</span>
                  {promo.status === 'AVAILABLE' && <span className="status-badge" style={{ background: 'hsla(190, 95%, 49%, 0.2)', color: 'var(--accent-cyan)', width: '80px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_available', '판매가능')}</span>}
                  {promo.status === 'RESERVED' && <span className="status-badge" style={{ background: 'hsla(45, 93%, 58%, 0.2)', color: 'rgb(115, 60, 13)', width: '80px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_reserved', '예약중')}</span>}
                  {promo.status === 'SOLD' && <span className="status-badge" style={{ background: 'hsla(142, 76%, 46%, 0.2)', color: 'var(--status-stock)', width: '80px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_sold', '판매완료')}</span>}
                </div>

                <div style={{ fontSize: '0.85rem', paddingBottom: '12px', borderBottom: '1px dashed var(--border-color)', marginBottom: '12px' }}>
                  {promo.status === 'RESERVED' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div><strong style={{ color: 'var(--text-secondary)' }}>Reservation:</strong> <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{promo.reserved_dealer ? promo.reserved_dealer.name : 'Unknown'}</span></div>
                      <div><strong style={{ color: 'var(--text-secondary)' }}>{t('menu3.label_expire', '만료')}:</strong> <span>{promo.reservation_expiry ? new Date(promo.reservation_expiry).toLocaleDateString().replace(/\.$/, '') : ''}</span></div>
                    </div>
                  )}
                  {promo.status === 'SOLD' && (
                    <div><strong style={{ color: 'var(--text-secondary)' }}>구매:</strong> <span style={{ color: 'var(--status-stock)', fontWeight: 600 }}>{promo.final_buyer_dealer ? promo.final_buyer_dealer.name : 'Unknown'}</span></div>
                  )}
                  {promo.status === 'AVAILABLE' && <span style={{ color: 'var(--text-muted)' }}> - </span>}
                </div>

                <div>
                  {promo.status === 'AVAILABLE' && (
                    reservingId === promo.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px' }}>
                        <select
                          value={selectedDealerId}
                          onChange={e => setSelectedDealerId(e.target.value)}
                          style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                        >
                          <option value="">{t('menu3.select_dealer', '-- 예약 딜러사 선택 --')}</option>
                          {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('menu3.reservation_period', '예약 기간:')}</span>
                          <select 
                            value={reservedUntilDays} 
                            onChange={e => setReservedUntilDays(Number(e.target.value))}
                            style={{ flex: 1, padding: '6px 10px', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.85rem', fontWeight: 600 }}
                          >
                            <option value={7}>{t('menu3.days_7', '7일 (1주)')}</option>
                            <option value={14}>{t('menu3.days_14', '14일 (2주)')}</option>
                          </select>
                        </div>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button onClick={() => handleConfirmReserve(promo.id)} className="btn btn-primary" style={{ padding: '6px', fontSize: '0.85rem', flex: 1 }}>{t('menu3.btn_confirm', '확정')}</button>
                          <button onClick={() => setReservingId(null)} className="btn btn-outline" style={{ padding: '6px', fontSize: '0.85rem', flex: 1 }}>{t('menu3.btn_cancel_popup', '취소')}</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { setReservingId(promo.id); setSelectedDealerId(''); setReservedUntilDays(7); }} className="btn btn-outline" style={{ padding: '8px', fontSize: '0.85rem', width: '100%', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', fontWeight: 600 }}>
                        {t('menu3.btn_reserve', '예약 진행')}
                      </button>
                    )
                  )}

                  {promo.status === 'RESERVED' && (
                    sellingId === promo.id ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)', padding: '12px', borderRadius: '8px' }}>
                        <select
                          value={finalBuyerDealerId}
                          onChange={e => setFinalBuyerDealerId(e.target.value)}
                          style={{ padding: '8px', borderRadius: '8px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '0.85rem' }}
                        >
                          <option value="">-- 실 구매 딜러사 선택 --</option>
                          {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                          <button onClick={() => handleConfirmSold(promo.id)} className="btn btn-primary" style={{ padding: '6px', fontSize: '0.85rem', flex: 1 }}>판매 확정</button>
                          <button onClick={() => setSellingId(null)} className="btn btn-outline" style={{ padding: '6px', fontSize: '0.85rem', flex: 1 }}>취소</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button onClick={() => { setSellingId(promo.id); setFinalBuyerDealerId(''); }} className="btn btn-outline" style={{ padding: '8px', fontSize: '0.85rem', flex: 1, borderColor: 'var(--status-stock)', color: 'var(--status-stock)', fontWeight: 600 }}>
                          {t('menu3.btn_order', '판매 완료')}
                        </button>
                        <button onClick={() => handleCancelReservation(promo.id)} className="btn btn-outline" style={{ padding: '8px', fontSize: '0.85rem', flex: 1, borderColor: 'var(--text-muted)', color: 'var(--text-muted)', fontWeight: 600 }}>
                          {t('menu3.btn_cancel', '예약 취소')}
                        </button>
                      </div>
                    )
                  )}

                  {promo.status === 'SOLD' && (
                    <div style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                      이관 완료 (판매 확정)
                    </div>
                  )}
                </div>
              </div>
              ))
            )}
          </div>
        ) : (
          <div className="data-table-container full-bleed">
            <table className="data-table promotion-table">
              <thead>
                <tr>
                  <th 
                    style={{ width: '3%', textAlign: 'center', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setSortConfig({ key: null, direction: 'asc' })}
                    title="기본 순서로 리셋"
                  >
                    {t('menu3.header_no')}
                  </th>
                  {renderSortHeader('model', t('menu3.header_model'), '10%')}
                  {renderSortHeader('nc', t('menu3.header_nc'), '5%')}
                  {renderSortHeader('price', t('menu3.header_price', 'PRICE(€)'), '7%', 'right')}
                  {renderSortHeader('po', t('menu3.header_po'), '10%')}
                  {renderSortHeader('detail_spec', t('menu3.header_detailspec'), '21%', 'left')}
                  {renderSortHeader('eta', t('menu3.header_eta'), '8%')}
                  {renderSortHeader('port', t('menu2.header_port', 'PORT'), '8%')}
                  {renderSortHeader('status', t('menu3.header_promotion_status'), '10%')}
                  {renderSortHeader('dealer', t('menu3.header_reservation'), '10%')}
                  <th style={{ width: '8%', textAlign: 'center' }}>{t('menu3.header_settings')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedPromotions.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>조건에 맞는 데이터가 없습니다.</td></tr>
                ) : (
                  sortedPromotions.map((promo, index) => (
                  <tr key={promo.id}>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: '12px' }}>
                        {promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '12px' }}>
                        {promo.order && promo.order.nc ? promo.order.nc : 'F0iP'}
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {editingPriceId === promo.id ? (
                          <>
                            <input
                              type="text"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              style={{ width: '60px', padding: '2px 4px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                            />
                            <button onClick={() => handleSavePrice(promo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-stock)' }}><Check size={14} /></button>
                          </>
                        ) : (
                          <>
                            <span style={{ fontSize: '12px', fontWeight: 600 }}>{promo.promotion_price || '-'}</span>
                            <button onClick={() => handleEditPrice(promo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><Edit2 size={12} /></button>
                          </>
                        )}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11px' }}>
                        {(promo.order && promo.order.reference_no) || 'F26-88-30'}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '11px' }}>
                        {(promo.order && promo.order.detail_spec) || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px' }}>
                        {promo.order && promo.order.eta ? new Date(promo.order.eta).toLocaleDateString() : '-'}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '11px' }}>
                        {getStandardPort(promo.order?.destination_port)}
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {promo.status === 'AVAILABLE' && <span className="status-badge" style={{ background: 'hsla(190, 95%, 49%, 0.2)', color: 'var(--accent-cyan)', width: '85px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_available', '판매가능')}</span>}
                      {promo.status === 'RESERVED' && <span className="status-badge" style={{ background: 'hsla(45, 93%, 58%, 0.2)', color: 'rgb(115, 60, 13)', width: '85px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_reserved', '예약중')}</span>}
                      {promo.status === 'SOLD' && <span className="status-badge" style={{ background: 'hsla(142, 76%, 46%, 0.2)', color: 'var(--status-stock)', width: '85px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_sold', '판매완료')}</span>}
                    </td>
                    <td style={{ fontSize: '11px', textAlign: 'center' }}>
                      {promo.status === 'RESERVED' && (
                        <div>
                          <span style={{ color: 'var(--accent-cyan)' }}>{promo.reserved_dealer ? promo.reserved_dealer.name : 'Unknown'}</span>
                          <div style={{ color: 'var(--text-muted)' }}>{t('menu3.label_expire', '만료')}: {promo.reservation_expiry ? new Date(promo.reservation_expiry).toLocaleDateString().replace(/\.$/, '') : ''}</div>
                        </div>
                      )}
                      {promo.status === 'SOLD' && (
                        <div style={{ color: 'var(--status-stock)', fontWeight: 600 }}>
                          구매: {promo.final_buyer_dealer ? promo.final_buyer_dealer.name : 'Unknown'}
                        </div>
                      )}
                      {promo.status === 'AVAILABLE' && <span style={{ color: 'var(--text-muted)' }}> - </span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {promo.status === 'AVAILABLE' && (
                        reservingId === promo.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px', width: '180px', margin: '0 auto' }}>
                            <select
                              value={selectedDealerId}
                              onChange={e => setSelectedDealerId(e.target.value)}
                              style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '11px' }}
                            >
                              <option value="">{t('menu3.select_dealer', '-- 예약 딜러사 선택 --')}</option>
                              {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <span style={{ fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{t('menu3.reservation_period', '예약 기간:')}</span>
                              <select 
                                value={reservedUntilDays} 
                                onChange={e => setReservedUntilDays(Number(e.target.value))}
                                style={{ flex: 1, padding: '4px 6px', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '11px', fontWeight: 600 }}
                              >
                                <option value={7}>{t('menu3.days_7', '7일 (1주)')}</option>
                                <option value={14}>{t('menu3.days_14', '14일 (2주)')}</option>
                              </select>
                            </div>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => handleConfirmReserve(promo.id)} className="btn btn-primary" style={{ padding: '3px 4px', fontSize: '10px', justifyContent: 'center', flex: 1 }}>{t('menu3.btn_confirm', '확정')}</button>
                              <button onClick={() => setReservingId(null)} className="btn btn-outline" style={{ padding: '3px 4px', fontSize: '10px', justifyContent: 'center', flex: 1 }}>{t('menu3.btn_cancel_popup', '취소')}</button>
                            </div>
                          </div>
                        ) : (
                          <button onClick={() => { setReservingId(promo.id); setSelectedDealerId(''); setReservedUntilDays(7); }} className="btn btn-outline" style={{ padding: '3px 4px', fontSize: '10px', justifyContent: 'center', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', width: '70px' }}>
                            {t('menu3.btn_reserve', '예약')}
                          </button>
                        )
                      )}

                      {promo.status === 'RESERVED' && (
                        sellingId === promo.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', background: 'var(--bg-secondary)', padding: '10px', borderRadius: '8px', width: '180px', margin: '0 auto' }}>
                            <select
                              value={finalBuyerDealerId}
                              onChange={e => setFinalBuyerDealerId(e.target.value)}
                              style={{ padding: '6px', borderRadius: '6px', background: 'var(--bg-input)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', fontSize: '11px' }}
                            >
                              <option value="">-- 실 구매 딜러사 선택 --</option>
                              {dealers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                            </select>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => handleConfirmSold(promo.id)} className="btn btn-primary" style={{ padding: '3px 4px', fontSize: '10px', justifyContent: 'center', flex: 1 }}>판매 확정</button>
                              <button onClick={() => setSellingId(null)} className="btn btn-outline" style={{ padding: '3px 4px', fontSize: '10px', justifyContent: 'center', flex: 1 }}>취소</button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '70px', margin: '0 auto' }}>
                            <button onClick={() => { setSellingId(promo.id); setFinalBuyerDealerId(''); }} className="btn btn-outline" style={{ padding: '3px 4px', fontSize: '10px', justifyContent: 'center', borderColor: 'var(--status-stock)', color: 'var(--status-stock)' }}>
                              {t('menu3.btn_order', '판매완료')}
                            </button>
                            <button onClick={() => handleCancelReservation(promo.id)} className="btn btn-outline" style={{ padding: '3px 4px', fontSize: '10px', justifyContent: 'center', borderColor: 'var(--text-muted)', color: 'var(--text-muted)' }}>
                              {t('menu3.btn_cancel', '예약취소')}
                            </button>
                          </div>
                        )
                      )}

                      {promo.status === 'SOLD' && (
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>이관 완료</span>
                      )}
                    </td>
                  </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <style>{`
        .sortable-th:hover {
          background-color: var(--bg-secondary) !important;
          color: var(--wia-blue) !important;
        }
      `}</style>
    </div>
  );
}
