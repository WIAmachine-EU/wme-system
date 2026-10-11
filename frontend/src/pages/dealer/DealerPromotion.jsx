import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Tag, CheckCircle, Clock, CheckCircle2, Search } from 'lucide-react';

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

  const loadData = async () => {
    setLoading(true);
    try {
      const [promoRes, portsRes] = await Promise.all([
        fetch('/api/promotions'),
        fetch('/api/master-data/port-codes')
      ]);
      setPromotions(await promoRes.json());
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

  const filteredPromotions = promotions.filter(promo => {
    if (statusFilter !== 'ALL' && promo.status !== statusFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const o = promo.order;
      if (
        (o?.product_model?.model_name && o.product_model.model_name.toLowerCase().includes(q)) ||
        (o?.reference_no && o.reference_no.toLowerCase().includes(q)) ||
        (o?.nc && o.nc.toLowerCase().includes(q)) ||
        (o?.serial_number && o.serial_number.toLowerCase().includes(q))
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
           <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('navbar.init_seed_loading')}</div>
        ) : isMobileView ? (
          <div className="mobile-cards-grid">
            {sortedPromotions.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dealer_promotion.no_promo')}</div>
            ) : (
              sortedPromotions.map((promo, index) => {
                const modelName = promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown';
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
                      <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>상태</span>
                      {promo.status === 'AVAILABLE' && <span className="status-badge" style={{ background: 'hsla(190, 95%, 49%, 0.2)', color: 'var(--accent-cyan)', width: '80px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_available')}</span>}
                      {promo.status === 'RESERVED' && <span className="status-badge" style={{ background: 'hsla(45, 93%, 58%, 0.2)', color: 'var(--status-production)', width: '80px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_reserved')}</span>}
                      {promo.status === 'SOLD' && <span className="status-badge" style={{ background: 'hsla(142, 76%, 46%, 0.2)', color: 'var(--status-stock)', width: '80px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_sold')}</span>}
                    </div>

                    <div>
                      {promo.status === 'AVAILABLE' && (
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
                      )}
                      {promo.status === 'RESERVED' && (
                        <div style={{ fontSize: '0.85rem', color: 'var(--status-production)', fontWeight: 500, textAlign: 'center', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                          {t('menu3.label_expire')}: {promo.reservation_expiry ? new Date(promo.reservation_expiry).toLocaleDateString() : '-'}
                        </div>
                      )}
                      {promo.status === 'SOLD' && (
                        <div style={{ textAlign: 'center', padding: '8px', background: 'var(--bg-secondary)', borderRadius: '8px', color: 'var(--text-muted)', fontSize: '0.85rem', fontWeight: 600 }}>
                          {t('dealer_promotion.no_apply')}
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
                  <th style={{ width: '14%', textAlign: 'center' }}>{t('dealer_promotion.header_request', 'REQUEST')}</th>
                </tr>
              </thead>
              <tbody>
                {sortedPromotions.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dealer_promotion.no_promo')}</td></tr>
                ) : (
                  sortedPromotions.map((promo, index) => {
                    const modelName = promo.order && promo.order.product_model ? promo.order.product_model.model_name : 'Unknown';
                    return (
                      <tr key={promo.id}>
                        <td style={{ textAlign: 'center' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: '12px' }}>
                            {modelName}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px' }}>
                            {promo.order && promo.order.nc ? promo.order.nc : 'F0iP'}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: '12px', fontWeight: 600 }}>
                            {promo.promotion_price || '-'}
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
                          {promo.status === 'AVAILABLE' && <span className="status-badge" style={{ margin: '0 auto', background: 'hsla(190, 95%, 49%, 0.2)', color: 'var(--accent-cyan)', width: '85px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_available')}</span>}
                          {promo.status === 'RESERVED' && <span className="status-badge" style={{ margin: '0 auto', background: 'hsla(45, 93%, 58%, 0.2)', color: 'var(--status-production)', width: '85px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_reserved')}</span>}
                          {promo.status === 'SOLD' && <span className="status-badge" style={{ margin: '0 auto', background: 'hsla(142, 76%, 46%, 0.2)', color: 'var(--status-stock)', width: '85px', justifyContent: 'center', fontSize: '11px' }}>{t('menu3.status_sold')}</span>}
                        </td>
                        <td style={{ fontSize: '11px', textAlign: 'center' }}>
                          {promo.status === 'AVAILABLE' && (
                            <div style={{ display: 'flex', gap: '4px', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleEmailRequest(promo, 'Reserve')}
                                className="btn btn-outline"
                                style={{ padding: '6px 0', fontSize: '11px', width: '70px', borderColor: 'var(--accent-cyan)', color: 'var(--accent-cyan)', textAlign: 'center', justifyContent: 'center', borderRadius: '20px' }}
                              >
                                Reserve
                              </button>
                              <button
                                onClick={() => handleEmailRequest(promo, 'Order')}
                                className="btn btn-primary btn-request"
                                style={{ padding: '6px 0', fontSize: '11px', width: '70px', textAlign: 'center', justifyContent: 'center', borderRadius: '20px', background: 'rgb(10, 28, 143)', borderColor: 'rgb(10, 28, 143)', color: '#fff' }}
                              >
                                Order
                              </button>
                            </div>
                          )}
                          {promo.status === 'RESERVED' && (
                            <div style={{ fontSize: '11px', color: 'var(--status-production)', fontWeight: 500 }}>
                              {t('menu3.label_expire')}: {promo.reservation_expiry ? new Date(promo.reservation_expiry).toLocaleDateString() : '-'}
                            </div>
                          )}
                          {promo.status === 'SOLD' && (
                            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('dealer_promotion.no_apply')}</span>
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
    </div>
  );
}
