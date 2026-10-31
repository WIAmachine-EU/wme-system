import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, Search } from 'lucide-react';

export default function DealerPromotion({ isMobileView }) {
  const { t } = useTranslation();
  const [promotions, setPromotions] = useState([]);
  const [portCodes, setPortCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

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

  // 예시 포맷: 2026.OCT.30 (관리자포털 WIA 프로모션 / 재고리스트와 동일)
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

  // 관리자포털 WIA 프로모션 / 재고리스트와 동일한 유효 stock_type 산출
  const getEffectiveStockType = (promo) => {
    if (promo?.order?.stock_type) {
      return promo.order.stock_type;
    }
    if (promo?.status === 'RESERVED') return 'RESERVED';
    return 'PROMOTION';
  };

  // 관리자포털 WIA 프로모션과 동일한 '상태' 색상 및 라벨
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

  // 관리자포털과 동일한 P/O 기준 '진행상황' 단계 텍스트
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

  const formatPromotionPrice = (priceVal) => {
    if (!priceVal) return '-';
    return !isNaN(priceVal) ? Number(priceVal).toLocaleString() : priceVal;
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

  const handleEmailRequest = (promo, requestType) => {
    const modelName = promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown';
    const nc = promo.order && promo.order.nc ? promo.order.nc : 'F0iP';
    const email = "jypark@hyundai-wia.de";

    const subject = `[Promotion ${requestType} Request] Model: ${modelName}`;
    const body = `Hello,\n\nI would like to request a ${requestType} for the following promotion machine:\n\n- Model: ${modelName}\n- NC: ${nc}\n\nPlease let me know the next steps.\n\nThank you.`;

    window.location.href = `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // 정렬 (Sorting) 상태 및 핸들러
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  const handleSort = (key) => {
    setSortConfig(prev => {
      if (prev.key === key) {
        return { key, direction: prev.direction === 'asc' ? 'desc' : 'asc' };
      }
      return { key, direction: 'asc' };
    });
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

  const filteredPromotions = promotions.filter(promo => {
    const sType = getEffectiveStockType(promo);
    if (statusFilter !== 'ALL' && sType !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const o = promo.order;
      if (
        (o?.product_model?.model_name && o.product_model.model_name.toLowerCase().includes(q)) ||
        (o?.reference_no && o.reference_no.toLowerCase().includes(q)) ||
        (o?.nc && o.nc.toLowerCase().includes(q)) ||
        (o?.serial_number && o.serial_number.toLowerCase().includes(q)) ||
        (o?.detail_spec && o.detail_spec.toLowerCase().includes(q))
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
      case 'reservation': {
        const expA = getEffectiveStockType(a) === 'RESERVED'
          ? new Date(a.order?.reservation_expiry_date || a.reservation_expiry || 0).getTime()
          : 0;
        const expB = getEffectiveStockType(b) === 'RESERVED'
          ? new Date(b.order?.reservation_expiry_date || b.reservation_expiry || 0).getTime()
          : 0;
        return sortConfig.direction === 'asc' ? expA - expB : expB - expA;
      }
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

  return (
    <div className="page-body">
      <div style={{ marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('dealer_promotion.page_title')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {t('dealer_promotion.page_desc')}
        </p>
      </div>
      <div className="glass-card" style={{ padding: '28px', marginBottom: '32px' }}>
        {isMobileView ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Tag color="var(--status-production)" size={20} />
              <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{t('menu3.list_title', '진행 중인 프로모션')}</h2>
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Tag color="var(--status-production)" size={24} />
              <h2 style={{ fontSize: '1.3rem', margin: 0 }}>{t('menu3.list_title', '진행 중인 프로모션')}</h2>
            </div>

            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
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
                <option value="nc_asc">{t('menu3.header_nc', 'NC')} ▲</option>
                <option value="nc_desc">{t('menu3.header_nc', 'NC')} ▼</option>
                <option value="price_asc">{t('menu3.header_price', 'PRICE')} ▲ (낮은순)</option>
                <option value="price_desc">{t('menu3.header_price', 'PRICE')} ▼ (높은순)</option>
                <option value="po_asc">{t('menu3.header_po', 'P/O')} ▲</option>
                <option value="po_desc">{t('menu3.header_po', 'P/O')} ▼</option>
                <option value="detail_spec_asc">{t('menu3.header_detailspec', '옵션 상세')} ▲</option>
                <option value="detail_spec_desc">{t('menu3.header_detailspec', '옵션 상세')} ▼</option>
                <option value="eta_asc">{t('menu3.header_eta', 'ETA')} ▲ (빠른순)</option>
                <option value="eta_desc">{t('menu3.header_eta', 'ETA')} ▼ (늦은순)</option>
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
          <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('navbar.init_seed_loading')}</div>
        ) : isMobileView ? (
          <div className="mobile-cards-grid">
            {sortedPromotions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dealer_promotion.no_promo')}</div>
            ) : (
              sortedPromotions.map((promo) => {
                const sType = getEffectiveStockType(promo);
                const modelName = promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown';
                const expiryVal = promo.order?.reservation_expiry_date || promo.reservation_expiry;
                const canRequest = sType === 'PROMOTION' || sType === 'AVAILABLE';

                return (
                  <div key={promo.id} className="mobile-order-card">
                    <div className="mobile-order-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                          {modelName}
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
                      <span>PRICE: <strong style={{ color: 'var(--text-primary)' }}>{formatPromotionPrice(promo.promotion_price)}</strong></span>
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

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>{t('menu3.header_stock_status', '상태')}</span>
                      {renderStockTypeBadge(sType, '84px')}
                    </div>

                    {sType === 'RESERVED' && (
                      <div style={{ fontSize: '0.85rem', paddingTop: '10px', marginBottom: '12px', borderTop: '1px dashed var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '6px' }}>
                        <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{t('dealer_promotion.header_reservation', '예약정보')}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {expiryVal ? `${t('menu2.label_expire', '만료')}: ${formatExpiryDateMMM(expiryVal)}` : '-'}
                        </span>
                      </div>
                    )}

                    <div>
                      {canRequest ? (
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <button
                            onClick={() => handleEmailRequest(promo, 'Reserve')}
                            className="btn btn-outline"
                            style={{ padding: '8px', fontSize: '0.85rem', flex: 1, borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', fontWeight: 600, textAlign: 'center', justifyContent: 'center' }}
                          >
                            Reserve
                          </button>
                          <button
                            onClick={() => handleEmailRequest(promo, 'Order')}
                            className="btn btn-primary btn-request"
                            style={{ padding: '8px', fontSize: '0.85rem', flex: 1, fontWeight: 600, textAlign: 'center', justifyContent: 'center', background: 'rgb(10, 28, 143)', borderColor: 'rgb(10, 28, 143)', color: '#fff' }}
                          >
                            Order
                          </button>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                          {t('dealer_promotion.no_apply', '해당없음')}
                        </div>
                      )}
                    </div>
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
                  {renderSortHeader('model', t('menu3.header_model'), '9%', 'center')}
                  {renderSortHeader('nc', t('menu3.header_nc'), '5%', 'center')}
                  {renderSortHeader('price', t('menu3.header_price', 'PRICE(€)'), '7%', 'right')}
                  {renderSortHeader('po', t('menu3.header_po', 'P/O'), '9%', 'center')}
                  {renderSortHeader('detail_spec', t('menu3.header_detailspec'), '17%', 'left')}
                  {renderSortHeader('eta', t('menu3.header_eta'), '8%', 'center')}
                  {renderSortHeader('port', t('menu2.header_port', 'PORT'), '7%', 'center')}
                  {renderSortHeader('progress', t('menu3.header_progress', '진행상황'), '8%', 'center')}
                  {renderSortHeader('reservation', t('dealer_promotion.header_reservation', '예약정보'), '9%', 'center')}
                  {renderSortHeader('stock_type', t('menu3.header_stock_status', '상태'), '7%', 'center')}
                  <th style={{ width: '11%', textAlign: 'center', fontWeight: 'bold', whiteSpace: 'nowrap' }}>
                    {t('dealer_promotion.header_request', 'REQUEST')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedPromotions.length === 0 ? (
                  <tr><td colSpan={12} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dealer_promotion.no_promo')}</td></tr>
                ) : (
                  sortedPromotions.map((promo, index) => {
                    const sType = getEffectiveStockType(promo);
                    const modelName = promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown';
                    const expiryVal = promo.order?.reservation_expiry_date || promo.reservation_expiry;
                    const canRequest = sType === 'PROMOTION' || sType === 'AVAILABLE';

                    return (
                      <tr key={promo.id}>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontWeight: 600, fontSize: '12px', textAlign: 'center' }}>
                            {modelName}
                          </div>
                        </td>
                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '12px', textAlign: 'center' }}>
                            {promo.order && promo.order.nc ? promo.order.nc : 'F0iP'}
                          </div>
                        </td>
                        <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                          <div style={{ fontSize: '12px', fontWeight: 600, textAlign: 'right' }}>
                            {formatPromotionPrice(promo.promotion_price)}
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
                          {sType === 'RESERVED' && expiryVal ? (
                            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap', textAlign: 'center' }}>
                              {t('menu2.label_expire', '만료')}: {formatExpiryDateMMM(expiryVal)}
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
                        <td style={{ fontSize: '11px', textAlign: 'center', verticalAlign: 'middle' }}>
                          {canRequest ? (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center', alignItems: 'center' }}>
                              <button
                                onClick={() => handleEmailRequest(promo, 'Reserve')}
                                className="btn btn-outline"
                                style={{ padding: '5px 0', fontSize: '10.5px', width: '62px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', textAlign: 'center', justifyContent: 'center', borderRadius: '20px', whiteSpace: 'nowrap' }}
                              >
                                Reserve
                              </button>
                              <button
                                onClick={() => handleEmailRequest(promo, 'Order')}
                                className="btn btn-primary btn-request"
                                style={{ padding: '5px 0', fontSize: '10.5px', width: '62px', textAlign: 'center', justifyContent: 'center', borderRadius: '20px', background: 'rgb(10, 28, 143)', borderColor: 'rgb(10, 28, 143)', color: '#fff', whiteSpace: 'nowrap' }}
                              >
                                Order
                              </button>
                            </div>
                          ) : (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('dealer_promotion.no_apply', '해당없음')}</span>
                          )}
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
