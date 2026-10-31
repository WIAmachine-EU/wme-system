import React, { useState, useEffect } from 'react';
import { Tag, Search, Edit2, Check, Upload } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AdminPromotion({ isMobileView }) {
  const { t } = useTranslation();
  const [promotions, setPromotions] = useState([]);
  const [portCodes, setPortCodes] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const [editingPriceId, setEditingPriceId] = useState(null);
  const [editPriceValue, setEditPriceValue] = useState('');

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

  // 예시 포맷: 2026.OCT.30 (WIA 재고리스트와 동일)
  const formatExpiryDateMMM = (dateVal) => {
    if (!dateVal) return '-';
    const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const str = String(dateVal);
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const [, yyyy, mm, dd] = match;
      const mIdx = parseInt(mm, 10) - 1;
      if (mIdx >= 0 && mIdx < 12) {
        return `${yyyy}.${months[mIdx]}.${dd}`;
      }
    }
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '-';
    const yyyy = d.getFullYear();
    const mmm = months[d.getMonth()];
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}.${mmm}.${dd}`;
  };

  // WIA 재고리스트의 '상태' 항목과 동일한 유효 stock_type 산출
  const getEffectiveStockType = (promo) => {
    if (promo?.order?.stock_type) {
      return promo.order.stock_type;
    }
    if (promo?.status === 'RESERVED') return 'RESERVED';
    return 'PROMOTION';
  };

  // WIA 재고리스트(AdminInventory)와 동일한 '상태' 색상 및 라벨
  const getStockTypeMeta = (sType) => {
    switch (sType) {
      case 'AVAILABLE':
        return { bg: 'hsla(142, 76%, 46%, 0.2)', color: 'var(--status-stock)', label: t('menu2.type_available', '판매가능') };
      case 'RESERVED':
        return { bg: 'hsla(262, 83%, 58%, 0.15)', color: '#7c3aed', label: t('menu2.type_reserved', '예약') };
      case 'DEALER_ORDER':
        return { bg: 'hsla(200, 76%, 46%, 0.2)', color: 'var(--accent-cyan)', label: t('menu2.type_dealer_order', '딜러주문') };
      case 'RENTAL':
        return { bg: 'hsla(45, 93%, 58%, 0.2)', color: 'var(--status-production)', label: t('menu2.type_rental', '임대') };
      case 'SHOWROOM':
        return { bg: 'hsla(200, 90%, 60%, 0.2)', color: 'var(--accent-cyan)', label: t('menu2.type_showroom', '전시') };
      case 'PROMOTION':
      default:
        return { bg: 'hsla(340, 82%, 52%, 0.18)', color: '#e11d48', label: t('menu2.type_promotion', '프로모션') };
    }
  };

  // 주문/배송현황(AdminDashboard)의 P/O 기준 '진행상황' 단계 텍스트
  const getOrderProgressLabel = (currentStatus) => {
    if (!currentStatus) return '-';
    const key = String(currentStatus).toUpperCase();
    switch (key) {
      case 'CONFIRMED':
        return t('stepbar.confirmed', '주문');
      case 'IN_PRODUCTION':
        return t('stepbar.in_production', '생산 중');
      case 'SHIPPING':
        return t('stepbar.shipping', '배송');
      case 'ARRIVED':
        return t('stepbar.arrived', '항구도착');
      case 'IN_STOCK':
        return t('stepbar.in_stock', '입고');
      default:
        return t(`stepbar.${key.toLowerCase()}`, currentStatus);
    }
  };

  const renderStockTypeBadge = (sType, badgeWidth = '84px') => {
    const { bg, color, label } = getStockTypeMeta(sType);
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: bg,
          border: `1px solid ${bg}`,
          color,
          padding: '4px 8px',
          borderRadius: '6px',
          fontSize: '10px',
          fontWeight: 600,
          width: badgeWidth,
          textAlign: 'center',
          whiteSpace: 'nowrap'
        }}
      >
        {label}
      </span>
    );
  };

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
      const [promoRes, portsRes] = await Promise.all([
        fetch('/api/promotions'),
        fetch('/api/master-data/port-codes')
      ]);
      const promoData = await promoRes.json();
      const portsData = await portsRes.json();
      setPromotions(Array.isArray(promoData) ? promoData : []);
      setPortCodes(Array.isArray(portsData) ? portsData : []);
    } catch (e) {
      console.error("Promotion data fetch error:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

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
    const sType = getEffectiveStockType(promo);
    if (statusFilter !== 'ALL' && sType !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const o = promo.order;
      const reservedDealerName = o?.reserved_dealer?.name || promo.reserved_dealer?.name || '';
      if (
        (o?.product_model?.model_name && o.product_model.model_name.toLowerCase().includes(q)) ||
        (o?.reference_no && o.reference_no.toLowerCase().includes(q)) ||
        (o?.nc && o.nc.toLowerCase().includes(q)) ||
        (o?.serial_number && o.serial_number.toLowerCase().includes(q)) ||
        (o?.detail_spec && o.detail_spec.toLowerCase().includes(q)) ||
        (reservedDealerName && reservedDealerName.toLowerCase().includes(q))
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
        const numA = Number(String(a.promotion_price || a.order?.price || '').replace(/,/g, '')) || 0;
        const numB = Number(String(b.promotion_price || b.order?.price || '').replace(/,/g, '')) || 0;
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
        valA = getStandardPort(a.order?.destination_port) || '';
        valB = getStandardPort(b.order?.destination_port) || '';
        break;
      case 'progress': {
        const statusMap = { CONFIRMED: 1, IN_PRODUCTION: 2, SHIPPING: 3, ARRIVED: 4, IN_STOCK: 5 };
        const rankA = statusMap[a.order?.current_status] || 0;
        const rankB = statusMap[b.order?.current_status] || 0;
        return sortConfig.direction === 'asc' ? rankA - rankB : rankB - rankA;
      }
      case 'dealer':
        valA = getEffectiveStockType(a) === 'RESERVED' ? (a.order?.reserved_dealer?.name || a.reserved_dealer?.name || '') : '';
        valB = getEffectiveStockType(b) === 'RESERVED' ? (b.order?.reserved_dealer?.name || b.reserved_dealer?.name || '') : '';
        break;
      case 'stock_type':
        valA = getEffectiveStockType(a);
        valB = getEffectiveStockType(b);
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
          display: 'flex',
          width: '100%',
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

  const handleSortDropdownChange = (e) => {
    if (!e.target.value) {
      setSortConfig({ key: null, direction: 'asc' });
      return;
    }
    const lastUnderscore = e.target.value.lastIndexOf('_');
    const key = e.target.value.slice(0, lastUnderscore);
    const direction = e.target.value.slice(lastUnderscore + 1);
    setSortConfig({ key, direction });
  };

  return (
    <div className="page-body">
      <div style={{ marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('menu3.page_title', 'WIA 프로모션')}</h1>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
              <div style={{ position: 'relative', flex: 1, minWidth: '140px' }}>
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
                <option value="PROMOTION">{t('menu2.type_promotion', '프로모션')}</option>
                <option value="RESERVED">{t('menu2.type_reserved', '예약')}</option>
              </select>
              <select
                value={sortConfig.key ? `${sortConfig.key}_${sortConfig.direction}` : ""}
                onChange={handleSortDropdownChange}
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
                <option value="po_asc">{t('menu3.header_po', 'P/O')} ▲</option>
                <option value="po_desc">{t('menu3.header_po', 'P/O')} ▼</option>
                <option value="nc_asc">{t('menu3.header_nc', 'NC')} ▲</option>
                <option value="nc_desc">{t('menu3.header_nc', 'NC')} ▼</option>
                <option value="port_asc">{t('menu2.header_port', 'PORT')} ▲</option>
                <option value="port_desc">{t('menu2.header_port', 'PORT')} ▼</option>
                <option value="progress_asc">{t('menu3.header_progress', '진행상황')} ▲</option>
                <option value="progress_desc">{t('menu3.header_progress', '진행상황')} ▼</option>
                <option value="stock_type_asc">{t('menu3.header_stock_status', '상태')} ▲</option>
                <option value="stock_type_desc">{t('menu3.header_stock_status', '상태')} ▼</option>
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
                <option value="PROMOTION">{t('menu2.type_promotion', '프로모션')}</option>
                <option value="RESERVED">{t('menu2.type_reserved', '예약')}</option>
              </select>
              <select
                value={sortConfig.key ? `${sortConfig.key}_${sortConfig.direction}` : ""}
                onChange={handleSortDropdownChange}
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
                <option value="po_asc">{t('menu3.header_po', 'P/O')} ▲</option>
                <option value="po_desc">{t('menu3.header_po', 'P/O')} ▼</option>
                <option value="nc_asc">{t('menu3.header_nc', 'NC')} ▲</option>
                <option value="nc_desc">{t('menu3.header_nc', 'NC')} ▼</option>
                <option value="port_asc">{t('menu2.header_port', 'PORT')} ▲</option>
                <option value="port_desc">{t('menu2.header_port', 'PORT')} ▼</option>
                <option value="progress_asc">{t('menu3.header_progress', '진행상황')} ▲</option>
                <option value="progress_desc">{t('menu3.header_progress', '진행상황')} ▼</option>
                <option value="stock_type_asc">{t('menu3.header_stock_status', '상태')} ▲</option>
                <option value="stock_type_desc">{t('menu3.header_stock_status', '상태')} ▼</option>
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
              sortedPromotions.map((promo) => {
                const sType = getEffectiveStockType(promo);
                const reservedDealerName = promo.order?.reserved_dealer?.name || promo.reserved_dealer?.name || '-';
                const expiryVal = promo.order?.reservation_expiry_date || promo.reservation_expiry;

                return (
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
                        {(promo.order && promo.order.reference_no) || '-'}
                      </div>
                    </div>

                    <div className="mobile-order-meta">
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        PRICE:
                        {editingPriceId === promo.id ? (
                          <>
                            <input
                              type="text"
                              value={editPriceValue}
                              onChange={(e) => setEditPriceValue(e.target.value)}
                              style={{ width: '70px', padding: '2px 4px', fontSize: '0.8rem', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                            />
                            <button onClick={() => handleSavePrice(promo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-stock)', padding: 0, display: 'inline-flex' }}><Check size={14} /></button>
                          </>
                        ) : (
                          <>
                            <strong style={{ color: 'var(--text-primary)' }}>{promo.promotion_price || '-'}</strong>
                            <button onClick={() => handleEditPrice(promo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'inline-flex' }}><Edit2 size={12} /></button>
                          </>
                        )}
                      </span>
                      <span>ETA: <strong style={{ color: 'var(--text-primary)' }}>{promo.order && promo.order.eta ? new Date(promo.order.eta).toLocaleDateString() : '-'}</strong></span>
                      <span>PORT: <strong style={{ color: 'var(--text-primary)' }}>{getStandardPort(promo.order?.destination_port)}</strong></span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px', marginBottom: '12px' }}>
                      {(promo.order && promo.order.detail_spec) || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('menu3.header_progress', '진행상황')}</span>
                      <span style={{ fontSize: '0.85rem', fontWeight: 'bold', color: 'rgb(255, 87, 51)' }}>{getOrderProgressLabel(promo.order?.current_status)}</span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: sType === 'RESERVED' ? '12px' : '0' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('menu3.header_stock_status', '상태')}</span>
                      {renderStockTypeBadge(sType, '84px')}
                    </div>

                    {sType === 'RESERVED' && (
                      <div style={{ fontSize: '0.85rem', paddingTop: '10px', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('menu3.header_reservation', '예약정보')}</span>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ color: 'var(--accent-cyan)', fontWeight: 700 }}>{reservedDealerName}</div>
                          {expiryVal && (
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {t('menu2.label_expire', '만료')}: {formatExpiryDateMMM(expiryVal)}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
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
                    <div style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'center' }}>
                      {t('menu3.header_no')}
                    </div>
                  </th>
                  {renderSortHeader('model', t('menu3.header_model'), '10%', 'center')}
                  {renderSortHeader('nc', t('menu3.header_nc'), '5%', 'center')}
                  {renderSortHeader('price', t('menu3.header_price', 'PRICE(€)'), '8%', 'right')}
                  {renderSortHeader('po', t('menu3.header_po', 'P/O'), '10%', 'center')}
                  {renderSortHeader('detail_spec', t('menu3.header_detailspec'), '20%', 'left')}
                  {renderSortHeader('eta', t('menu3.header_eta'), '8%', 'center')}
                  {renderSortHeader('port', t('menu2.header_port', 'PORT'), '8%', 'center')}
                  {renderSortHeader('progress', t('menu3.header_progress', '진행상황'), '9%', 'center')}
                  {renderSortHeader('dealer', t('menu3.header_reservation'), '10%', 'center')}
                  {renderSortHeader('stock_type', t('menu3.header_stock_status', '상태'), '9%', 'center')}
                </tr>
              </thead>
              <tbody>
                {sortedPromotions.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>조건에 맞는 데이터가 없습니다.</td></tr>
                ) : (
                  sortedPromotions.map((promo, index) => {
                    const sType = getEffectiveStockType(promo);
                    const reservedDealerName = promo.order?.reserved_dealer?.name || promo.reserved_dealer?.name || '-';
                    const expiryVal = promo.order?.reservation_expiry_date || promo.reservation_expiry;

                    return (
                      <tr key={promo.id}>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 600, fontSize: '12px', textAlign: 'center' }}>
                            {promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '12px', textAlign: 'center' }}>
                            {promo.order && promo.order.nc ? promo.order.nc : 'F0iP'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'flex-end', gap: '6px' }}>
                            {editingPriceId === promo.id ? (
                              <>
                                <input
                                  type="text"
                                  value={editPriceValue}
                                  onChange={(e) => setEditPriceValue(e.target.value)}
                                  style={{ width: '64px', padding: '2px 4px', fontSize: '11px', borderRadius: '4px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', textAlign: 'right' }}
                                />
                                <button onClick={() => handleSavePrice(promo.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--status-stock)', padding: 0, display: 'inline-flex' }}><Check size={14} /></button>
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: '12px', fontWeight: 600 }}>
                                  {promo.promotion_price ? (!isNaN(promo.promotion_price) ? Number(promo.promotion_price).toLocaleString() : promo.promotion_price) : '-'}
                                </span>
                                <button onClick={() => handleEditPrice(promo)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'inline-flex' }}><Edit2 size={12} /></button>
                              </>
                            )}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11px', textAlign: 'center' }}>
                            {(promo.order && promo.order.reference_no) || '-'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'left', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '11px', textAlign: 'left' }}>
                            {(promo.order && promo.order.detail_spec) || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '11px', textAlign: 'center' }}>
                            {promo.order && promo.order.eta ? new Date(promo.order.eta).toLocaleDateString() : '-'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '11px', textAlign: 'center' }}>
                            {getStandardPort(promo.order?.destination_port)}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '11px', fontWeight: 'bold', color: 'rgb(255, 87, 51)', textAlign: 'center' }}>
                            {getOrderProgressLabel(promo.order?.current_status)}
                          </div>
                        </td>
                        <td style={{ fontSize: '11px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {sType === 'RESERVED' ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', lineHeight: 1.3 }}>
                              <div style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--accent-cyan)', whiteSpace: 'nowrap' }}>
                                {reservedDealerName}
                              </div>
                              {expiryVal && (
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {t('menu2.label_expire', '만료')}: {formatExpiryDateMMM(expiryVal)}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>-</div>
                          )}
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                            {renderStockTypeBadge(sType, '84px')}
                          </div>
                        </td>
                      </tr>
                    );
                  })
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
