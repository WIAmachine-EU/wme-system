import React, { useState, useEffect } from 'react';
import { Search, Package, CheckCircle, Clock, X, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function CargoDetailModal({ isOpen, onClose, serialNumber, modelName }) {
  const { t } = useTranslation();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && serialNumber) {
      setLoading(true);
      fetch(`/api/cargo-details/${encodeURIComponent(serialNumber)}`)
        .then(res => {
          if (!res.ok) throw new Error('Not found');
          return res.json();
        })
        .then(data => {
          setData(Array.isArray(data) ? data : [data]);
          setLoading(false);
        })
        .catch(err => {
          setData([]);
          setLoading(false);
        });
    }
  }, [isOpen, serialNumber]);

  if (!isOpen) return null;

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999
    }}>
      <div className="glass-card" style={{ width: '90%', maxWidth: '850px', padding: '24px', position: 'relative', boxShadow: '0 10px 25px rgba(0,0,0,0.2)' }}>
        <button onClick={onClose} style={{ position: 'absolute', top: '16px', right: '16px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)' }}>
          <X size={20} />
        </button>
        <h2 style={{ margin: '0 0 20px 0', fontSize: '1.2rem', color: 'var(--text-primary)' }}>
          ◎ Machine Details
        </h2>

        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('dispatch.loading', '데이터를 불러오는 중입니다...')}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', borderBottom: '2px solid var(--border-color)', paddingBottom: '12px' }}>
              <span style={{ marginRight: '28px' }}>• {modelName || '-'}</span>
              <span>• S/N : <span style={{ color: 'var(--accent-cyan)' }}>{serialNumber || '-'}</span></span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {(data && data.length > 0 ? data : [{}]).map((item, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && <hr style={{ border: 'none', borderTop: '1px dashed var(--border-color)', margin: '0' }} />}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '0.95rem', color: 'var(--text-secondary)' }}>
                    <div>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>• Item:</span> {item.item === 'CC' ? 'C/C' : (item.item || '-')}
                    </div>
                    
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>• Box:</span> {item.qty || '-'}
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>• Box No:</span> {item.box_no || '-'}
                      </div>
                    </div>
                    
                    <div>
                      <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>• Dimension (L/W/H cm):</span> <span style={{ fontFamily: 'SUITE', fontWeight: 750, color: 'rgb(255, 87, 51)' }}>{item.dimensions || '-'}</span>
                    </div>
                    
                    <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                      <div>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>• N.W(KG):</span> {item.net_weight || '-'}
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>• G.W(KG):</span> <span style={{ color: 'rgb(255, 87, 51)' }}>{item.gross_weight || '-'}</span>
                      </div>
                    </div>
                  </div>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const calculateAging = (etd) => {
  if (!etd) return { type: 'NORMAL', status: '일반', days: 0, color: 'var(--status-stock)', bg: 'rgba(16, 185, 129, 0.1)' };
  const etdDate = new Date(etd);
  const today = new Date();
  const diffTime = Math.abs(today - etdDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 180) return { type: 'NORMAL', status: '일반', days: diffDays, color: 'var(--status-stock)', bg: 'rgba(16, 185, 129, 0.1)' };
  if (diffDays <= 360) return { type: 'LONG', status: '장기', days: diffDays, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
  return { type: 'CRITICAL', status: '악성', days: diffDays, color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.1)' };
};

export default function AdminDispatch({ isMobileView }) {
  const { t } = useTranslation();

  const getStandardPort = (rawPort) => {
    if (!rawPort) return '';
    const p = rawPort.toLowerCase();
    if (p.includes('hamburg') || p.includes('ham')) return 'Hamburg';
    if (p.includes('rotterdam') || p.includes('rot')) return 'Rotterdam';
    if (p.includes('istanbul') || p.includes('ist')) return 'Istanbul';
    if (p.includes('antwerp') || p.includes('ant')) return 'Antwerp';
    return rawPort;
  };

  const formatRentalPeriod = (startDate, endDate) => {
    if (!startDate && !endDate) return '-';
    const startStr = startDate ? new Date(startDate).toLocaleDateString() : '';
    const endStr = endDate ? new Date(endDate).toLocaleDateString() : '';
    if (startStr && endStr) return `${startStr} ~ ${endStr}`;
    if (endStr) return `~ ${endStr}`;
    return `${startStr} ~`;
  };

  const getAgingStatus = (etd) => {
    const raw = calculateAging(etd);
    let statusText = t('dispatch.aging_normal', '일반');
    if (raw.type === 'LONG') statusText = t('dispatch.aging_long', '장기');
    else if (raw.type === 'CRITICAL') statusText = t('dispatch.aging_critical', '악성');
    return { ...raw, statusText };
  };

  const getStockTypeBadge = (rawType) => {
    const sType = rawType || 'AVAILABLE';
    switch (sType) {
      case 'AVAILABLE':
        return {
          label: t('menu2.type_available', '판매가능'),
          color: 'var(--status-stock)',
          bg: 'hsla(142, 76%, 46%, 0.15)',
          border: 'hsla(142, 76%, 46%, 0.3)'
        };
      case 'RENTAL':
        return {
          label: t('menu2.type_rental', '임대'),
          color: 'var(--status-production)',
          bg: 'hsla(45, 93%, 58%, 0.15)',
          border: 'hsla(45, 93%, 58%, 0.3)'
        };
      case 'SHOWROOM':
        return {
          label: t('menu2.type_showroom', '전시'),
          color: 'var(--accent-cyan)',
          bg: 'hsla(200, 90%, 60%, 0.15)',
          border: 'hsla(200, 90%, 60%, 0.3)'
        };
      case 'PROMOTION':
        return {
          label: t('menu2.type_promotion', '프로모션'),
          color: 'var(--accent-pink)',
          bg: 'hsla(340, 82%, 52%, 0.15)',
          border: 'hsla(340, 82%, 52%, 0.3)'
        };
      case 'DEALER_ORDER':
        return {
          label: t('menu2.type_dealer_order', '딜러주문'),
          color: 'var(--accent-cyan)',
          bg: 'hsla(200, 76%, 46%, 0.15)',
          border: 'hsla(200, 76%, 46%, 0.3)'
        };
      default:
        return {
          label: sType,
          color: 'var(--text-secondary)',
          bg: 'var(--bg-secondary)',
          border: 'var(--border-color)'
        };
    }
  };

  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [models, setModels] = useState([]);
  const [dealers, setDealers] = useState([]);

  const [editingOrder, setEditingOrder] = useState(null);
  const [editForm, setEditForm] = useState({
    product_model_id: '',
    reference_no: '',
    nc: '',
    dealer_company_id: '',
    serial_number: '',
    so_no: '',
    price: '',
    destination_port: '',
    detail_spec: '',
    incoterms: '',
    warehouse: '',
    vessel: '',
    etd: '',
    eta: '',
    remark: '',
    stock_type: 'AVAILABLE'
  });

  const [agingFilter, setAgingFilter] = useState('ALL');
  const [stockTypeFilter, setStockTypeFilter] = useState('ALL');

  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);

  const [expandedRows, setExpandedRows] = useState(new Set());

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSN, setSelectedSN] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);

  const openCargoModal = (sn, model) => {
    if (!sn) return;
    setSelectedSN(sn);
    setSelectedModel(model);
    setModalOpen(true);
  };

  const toggleRow = (orderId) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(orderId)) {
        newSet.delete(orderId);
      } else {
        newSet.add(orderId);
      }
      return newSet;
    });
  };

  const fetchDispatchOrders = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/orders?status_filter=IN_STOCK');
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error("Failed to fetch dispatch orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDispatchOrders();
    fetch('/api/models').then(res => res.json()).then(data => Array.isArray(data) && setModels(data)).catch(console.error);
    fetch('/api/dealers').then(res => res.json()).then(data => Array.isArray(data) && setDealers(data)).catch(console.error);
  }, []);

  const formatDateForInput = (dateVal) => {
    if (!dateVal) return '';
    try {
      const d = new Date(dateVal);
      if (isNaN(d.getTime())) return '';
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch (e) {
      return '';
    }
  };

  const handleEditClick = (order) => {
    setEditingOrder(order);
    const initialWarehouse = order.warehouse || order.vessel || '';
    const initialEtd = formatDateForInput(order.etd || order.shipment?.etd);
    const initialEta = formatDateForInput(order.eta || order.shipment?.eta);
    setEditForm({
      product_model_id: order.product_model_id || '',
      reference_no: order.reference_no || '',
      nc: order.nc || '',
      dealer_company_id: order.dealer_company_id || '',
      serial_number: order.serial_number || '',
      so_no: order.so_no || '',
      price: order.price || '',
      destination_port: order.destination_port || '',
      detail_spec: order.detail_spec || '',
      incoterms: order.incoterms || '',
      warehouse: initialWarehouse,
      vessel: initialWarehouse,
      etd: initialEtd,
      eta: initialEta,
      remark: order.remark || '',
      stock_type: order.stock_type || 'AVAILABLE'
    });
  };

  const handleUpdateSubmit = async (e) => {
    e.preventDefault();
    if (!editingOrder) return;
    try {
      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_model_id: parseInt(editForm.product_model_id) || null,
          reference_no: editForm.reference_no,
          nc: editForm.nc,
          dealer_company_id: parseInt(editForm.dealer_company_id) || null,
          serial_number: editForm.serial_number,
          so_no: editForm.so_no,
          price: editForm.price,
          destination_port: editForm.destination_port,
          detail_spec: editForm.detail_spec,
          incoterms: editForm.incoterms,
          warehouse: editForm.warehouse,
          vessel: editForm.warehouse,
          etd: editForm.etd ? `${editForm.etd}T00:00:00` : null,
          eta: editForm.eta ? `${editForm.eta}T00:00:00` : null,
          remark: editForm.remark,
          stock_type: editForm.stock_type
        })
      });
      if (res.ok) {
        alert("장비 정보가 성공적으로 업데이트되었습니다.");
        setEditingOrder(null);
        fetchDispatchOrders();
      } else {
        const errorData = await res.json();
        alert(`업데이트 실패: ${errorData.detail || "알 수 없는 오류"}`);
      }
    } catch (err) {
      alert("업데이트 중 오류가 발생했습니다.");
    }
  };

  const handleDispatchOrder = async (orderId) => {
    if (!window.confirm("이 장비를 출고 처리하시겠습니까? (출고 처리 시 창고 리스트에서 제외됩니다)")) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_status: 'SOLD',
          direction: 'FORWARD',
          changed_by_id: 1 // Default to 1 for simplicity here
        })
      });
      if (res.ok) {
        fetchDispatchOrders();
      } else {
        alert("출고 처리 중 오류가 발생했습니다.");
      }
    } catch (e) {
      console.error(e);
      alert("출고 처리 중 오류가 발생했습니다.");
    }
  };

  const handleViewHistory = async (order) => {
    setSelectedOrderForHistory(order);
    try {
      const res = await fetch(`/api/orders/${order.id}/history`);
      if (res.ok) {
        setOrderHistory(await res.json());
      } else {
        setOrderHistory([]);
      }
    } catch (e) {
      console.error(e);
      setOrderHistory([]);
    }
  };

  const closeHistory = () => {
    setSelectedOrderForHistory(null);
    setOrderHistory([]);
  };

  const filteredOrders = orders.filter(o => {
    const s = searchQuery.toLowerCase();
    const sn = o.serial_number ? o.serial_number.toLowerCase() : '';
    const mn = o.product_model && o.product_model.model_name ? o.product_model.model_name.toLowerCase() : '';
    const po = o.reference_no ? o.reference_no.toLowerCase() : '';
    const nc = o.nc ? o.nc.toLowerCase() : '';
    const wh = (o.warehouse || o.vessel || '').toLowerCase();
    const matchesSearch = sn.includes(s) || mn.includes(s) || po.includes(s) || nc.includes(s) || wh.includes(s);
    if (!matchesSearch) return false;

    if (agingFilter === 'LONG_DEAD') {
      const aging = getAgingStatus(o.etd);
      if (aging.status === '일반') return false;
    }

    if (stockTypeFilter !== 'ALL') {
      const type = o.stock_type || 'AVAILABLE';
      if (type !== stockTypeFilter) return false;
    }

    return true;
  });

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

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    if (!sortConfig.key) return 0;
    let valA = '';
    let valB = '';

    switch (sortConfig.key) {
      case 'model':
        valA = a.product_model?.model_name || '';
        valB = b.product_model?.model_name || '';
        break;
      case 'nc':
        valA = a.nc || '';
        valB = b.nc || '';
        break;
      case 'sn':
        valA = a.serial_number || '';
        valB = b.serial_number || '';
        break;
      case 'po':
        valA = a.reference_no || '';
        valB = b.reference_no || '';
        break;
      case 'stock_type':
      case 'status':
        valA = a.stock_type || 'AVAILABLE';
        valB = b.stock_type || 'AVAILABLE';
        break;
      case 'warehouse':
      case 'location':
        valA = a.warehouse || a.vessel || '';
        valB = b.warehouse || b.vessel || '';
        break;
      case 'aging': {
        const daysA = getAgingStatus(a.etd).days;
        const daysB = getAgingStatus(b.etd).days;
        return sortConfig.direction === 'asc' ? daysA - daysB : daysB - daysA;
      }
      default:
        return 0;
    }
    const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
    return sortConfig.direction === 'asc' ? cmp : -cmp;
  });

  const renderSortHeader = (key, label, width = '10%', align = 'center') => {
    const isSorted = sortConfig.key === key;
    const justify = align === 'left' ? 'flex-start' : (align === 'right' ? 'flex-end' : 'center');
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
          alignItems: 'center',
          justifyContent: justify,
          width: '100%',
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
      <CargoDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        serialNumber={selectedSN}
        modelName={selectedModel}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('dispatch.page_title', 'WIA 창고')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {t('dispatch.page_desc', '물류 및 입고된 장비의 상태를 관리합니다.')}
          </p>
        </div>
      </div>

      <div className="glass-card no-hover-bg" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={20} color="var(--accent-blue)" />
              <span>{t('dispatch.list_title', '입고된 장비 목록')}</span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder={t('dispatch.search_placeholder', '검색')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 14px 8px 36px', borderRadius: '10px', fontSize: '0.85rem', width: '220px'
                }}
              />
            </div>
            <select
              value={agingFilter}
              onChange={(e) => setAgingFilter(e.target.value)}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer'
              }}
            >
              <option value="ALL">{t('dispatch.filter_aging_all', '전체 재고 (에이징)')}</option>
              <option value="LONG_DEAD">{t('dispatch.filter_aging_long_dead', '장기/악성 재고만 보기')}</option>
            </select>
            <select
              value={stockTypeFilter}
              onChange={(e) => setStockTypeFilter(e.target.value)}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer'
              }}
            >
              <option value="ALL">{t('dispatch.filter_stock_type_all', '전체 상태')}</option>
              <option value="AVAILABLE">{t('menu2.type_available', '판매가능')}</option>
              <option value="RENTAL">{t('menu2.type_rental', '임대')}</option>
              <option value="SHOWROOM">{t('menu2.type_showroom', '전시')}</option>
              <option value="PROMOTION">{t('menu2.type_promotion', '프로모션')}</option>
              <option value="DEALER_ORDER">{t('menu2.type_dealer_order', '딜러주문')}</option>
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
              title={t('dispatch.sort_title', '정렬 기준')}
            >
              <option value="">{t('dispatch.sort_default', '기본 정렬')}</option>
              <option value="model_asc">{t('dispatch.sort_model_asc', '모델 ▲ (오름차순)')}</option>
              <option value="model_desc">{t('dispatch.sort_model_desc', '모델 ▼ (내림차순)')}</option>
              <option value="nc_asc">{t('dispatch.sort_nc_asc', 'NC ▲')}</option>
              <option value="nc_desc">{t('dispatch.sort_nc_desc', 'NC ▼')}</option>
              <option value="sn_asc">{t('dispatch.sort_sn_asc', 'S/N ▲')}</option>
              <option value="sn_desc">{t('dispatch.sort_sn_desc', 'S/N ▼')}</option>
              <option value="po_asc">{t('dispatch.sort_po_asc', 'P/O ▲')}</option>
              <option value="po_desc">{t('dispatch.sort_po_desc', 'P/O ▼')}</option>
              <option value="stock_type_asc">{t('dispatch.sort_status_asc', '상태 ▲')}</option>
              <option value="stock_type_desc">{t('dispatch.sort_status_desc', '상태 ▼')}</option>
              <option value="warehouse_asc">{t('dispatch.sort_location_asc', '위치 ▲ (오름차순)')}</option>
              <option value="warehouse_desc">{t('dispatch.sort_location_desc', '위치 ▼ (내림차순)')}</option>
              <option value="aging_asc">{t('dispatch.sort_aging_asc', '에이징 ▲ (일반순)')}</option>
              <option value="aging_desc">{t('dispatch.sort_aging_desc', '에이징 ▼ (장기순)')}</option>
            </select>
          </div>
        </div>

        {/* 리스트 재고 수량 통계 Header */}
        <div style={{
          marginBottom: '20px', padding: '16px 24px', backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)', borderRadius: '12px',
          display: 'flex', alignItems: 'center', gap: '24px', flexWrap: 'wrap',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.05)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('dispatch.stat_total', '전체:')}</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{filteredOrders.length}</span>
          </div>
          <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('dispatch.stat_normal', '일반 재고:')}</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--status-stock)' }}>
              {filteredOrders.filter(o => getAgingStatus(o.etd).type === 'NORMAL').length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('dispatch.stat_long', '장기 재고:')}</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {filteredOrders.filter(o => getAgingStatus(o.etd).type === 'LONG').length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('dispatch.stat_critical', '악성 재고:')}</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-red)' }}>
              {filteredOrders.filter(o => getAgingStatus(o.etd).type === 'CRITICAL').length}
            </span>
          </div>
        </div>

        {isMobileView ? (
          <div className="mobile-cards-grid">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dispatch.loading', '데이터를 불러오는 중입니다...')}</div>
            ) : sortedOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dispatch.no_data', '조건에 맞는 입고 장비가 없습니다.')}</div>
            ) : (
              sortedOrders.map((order) => {
                const aging = getAgingStatus(order.etd);
                const stockBadge = getStockTypeBadge(order.stock_type);

                return (
                  <div key={order.id} className="mobile-order-card" onClick={() => toggleRow(order.id)} style={{ cursor: 'pointer' }}>
                    <div className="mobile-order-header">
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                        {order.product_model ? order.product_model.model_name : 'Unknown Model'}
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
                        {order.reference_no || '-'}
                      </div>
                    </div>
                    <div className="mobile-order-meta">
                      <span>{t('dispatch.header_nc', 'NC')}: <strong style={{ color: 'var(--text-primary)' }}>{order.nc || '-'}</strong></span>
                      <span>{t('dispatch.header_sn', 'S/N')}: <strong style={{ color: 'var(--text-primary)' }}>{order.serial_number || '-'}</strong></span>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        {t('dispatch.header_status', '상태')}: 
                        <span style={{
                          display: 'inline-block',
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '10px',
                          fontWeight: 600,
                          color: stockBadge.color,
                          background: stockBadge.bg,
                          border: `1px solid ${stockBadge.border}`
                        }}>
                          {stockBadge.label}
                        </span>
                      </span>
                      <span>{t('dispatch.header_location', '위치')}: <strong style={{ color: 'var(--text-primary)' }}>{order.warehouse || order.vessel || '-'}</strong></span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingBottom: '8px', borderBottom: '1px dashed var(--border-color)' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{t('dispatch.header_aging', '에이징')}:</span>
                      <span style={{
                        display: 'inline-block', padding: '4px 8px', borderRadius: '12px',
                        fontSize: '0.8rem', fontWeight: 600, color: aging.color, background: aging.bg
                      }}>
                        {aging.statusText} ({aging.days}{t('dispatch.days_suffix', '일')})
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => openCargoModal(order.serial_number, order.product_model ? order.product_model.model_name : '')}
                        disabled={!order.serial_number}
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', opacity: order.serial_number ? 1 : 0.5 }}
                      >
                        <ExternalLink size={14} /> {t('dispatch.btn_dimension', '화물')}
                      </button>
                      <button
                        onClick={() => handleViewHistory(order)}
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Clock size={14} /> {t('dispatch.btn_history', '이력')}
                      </button>
                      <button
                        onClick={() => handleEditClick(order)}
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        {t('dispatch.btn_edit', '수정')}
                      </button>
                      <button
                        onClick={() => handleDispatchOrder(order.id)}
                        className="btn btn-primary"
                        style={{ flex: 2, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <CheckCircle size={14} /> {t('dispatch.btn_dispatch', '출고 처리')}
                      </button>
                    </div>

                    {expandedRows.has(order.id) && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_etd', 'ETD')}:</strong> <span>{order.etd ? new Date(order.etd).toLocaleDateString() : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_eta', 'ETA')}:</strong> <span>{order.eta ? new Date(order.eta).toLocaleDateString() : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_inbound_date', '입고일자')}:</strong> <span>{order.current_status_changed_at ? new Date(order.current_status_changed_at).toLocaleDateString() : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_port', '항구')}:</strong> <span>{getStandardPort(order.destination_port) || order.warehouse || order.vessel || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_so', 'S/O')}:</strong> <span>{order.so_no || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_option', '옵션')}:</strong> <span>{order.detail_spec || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_buying', '구매가')}:</strong> <span>{order.price ? (!isNaN(order.price) ? `€ ${Number(order.price).toLocaleString()}` : order.price) : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_remark', 'REMARK')}:</strong> <span>{order.remark || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_rental_dealer', '임대 딜러')}:</strong> <span>{order.dealer_company?.name || order.dealer?.name || (order.stock_type === 'RENTAL' ? (order.rental_dealer || '-') : '-')}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>{t('dispatch.detail_rental_period', '임대 기간')}:</strong> <span>{formatRentalPeriod(order.rental_start_date, order.rental_expiry_date)}</span></div>
                      </div>
                    )}
                  </div>
                );

              })
            )}
          </div>
        ) : (
          <div className="data-table-container full-bleed">
            <table className="data-table">
              <thead>
                <tr>
                  <th 
                    style={{ width: '4%', textAlign: 'center', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setSortConfig({ key: null, direction: 'asc' })}
                    title={t('dispatch.sort_reset', '기본 순서로 리셋')}
                  >
                    {t('dispatch.header_no', '*')}
                  </th>
                  {renderSortHeader('model', t('dispatch.header_model', '모델'), '12%', 'center')}
                  {renderSortHeader('nc', t('dispatch.header_nc', 'NC'), '8%', 'center')}
                  {renderSortHeader('sn', t('dispatch.header_sn', 'S/N'), '11%')}
                  {renderSortHeader('po', t('dispatch.header_po', 'P/O'), '10%')}
                  {renderSortHeader('stock_type', t('dispatch.header_status', '상태'), '9%')}
                  {renderSortHeader('warehouse', t('dispatch.header_location', '위치'), '9%')}
                  {renderSortHeader('aging', t('dispatch.header_aging', '에이징'), '11%')}
                  <th style={{ width: '7%', textAlign: 'center', fontWeight: 'bold' }}>{t('dispatch.header_dimension', '화물')}</th>
                  <th style={{ width: '19%', textAlign: 'center', fontWeight: 'bold' }}>{t('dispatch.header_progress', '진행')}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dispatch.loading', '데이터를 불러오는 중입니다...')}</td></tr>
                ) : sortedOrders.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('dispatch.no_data', '조건에 맞는 입고 장비가 없습니다.')}</td></tr>
                ) : (
                  sortedOrders.map((order, index) => {
                    const aging = getAgingStatus(order.etd);
                    const stockBadge = getStockTypeBadge(order.stock_type);

                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          onClick={() => toggleRow(order.id)}
                          style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          {/* 1. * (NO.) */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                          </td>
                          {/* 2. 모델 */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 600, fontSize: '12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                              {order.product_model?.model_name || '-'}
                            </div>
                          </td>
                          {/* 3. NC */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '12px', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                              {order.nc || '-'}
                            </div>
                          </td>
                          {/* 4. S/N */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '12px' }}>{order.serial_number || '-'}</div>
                          </td>
                          {/* 5. P/O */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11px' }}>{order.reference_no || '-'}</div>
                          </td>
                          {/* 6. 상태 */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block',
                              padding: '4px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              color: stockBadge.color,
                              background: stockBadge.bg,
                              border: `1px solid ${stockBadge.border}`
                            }}>
                              {stockBadge.label}
                            </span>
                          </td>
                          {/* 7. 위치 */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '12px', fontWeight: 600 }}>{order.warehouse || order.vessel || '-'}</div>
                          </td>
                          {/* 8. 에이징 */}
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '4px 8px', borderRadius: '12px',
                              fontSize: '11px', fontWeight: 600, color: aging.color, background: aging.bg
                            }}>
                              {aging.statusText} ({aging.days}{t('dispatch.days_suffix', '일')})
                            </span>
                          </td>
                          {/* 9. 화물 */}
                          <td onClick={e => e.stopPropagation()} style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <button
                              onClick={() => openCargoModal(order.serial_number, order.product_model ? order.product_model.model_name : '')}
                              disabled={!order.serial_number}
                              style={{
                                background: 'transparent', border: '1px solid var(--border-color)',
                                color: order.serial_number ? 'var(--text-primary)' : 'var(--text-muted)',
                                fontFamily: 'SUITE, sans-serif',
                                fontWeight: order.serial_number ? 600 : 100,
                                padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                                cursor: order.serial_number ? 'pointer' : 'not-allowed',
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                transition: 'all 0.2s'
                              }}
                              className={order.serial_number ? "hover-bg-subtle" : ""}
                            >
                              <ExternalLink size={13} /> {t('dispatch.btn_dimension', '화물')}
                            </button>
                          </td>
                          {/* 10. 진행 */}
                          <td onClick={e => e.stopPropagation()} style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleViewHistory(order)}
                                className="btn btn-outline"
                                style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Clock size={13} /> {t('dispatch.btn_history', '이력')}
                              </button>
                              <button
                                onClick={() => handleEditClick(order)}
                                className="btn btn-outline"
                                style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                {t('dispatch.btn_edit', '수정')}
                              </button>
                              <button
                                onClick={() => handleDispatchOrder(order.id)}
                                className="btn btn-primary"
                                style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <CheckCircle size={13} /> {t('dispatch.btn_dispatch', '출고 처리')}
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has(order.id) && (
                          <tr>
                            <td colSpan={10} style={{ backgroundColor: 'var(--bg-card)', paddingTop: '14px', borderTop: '1px dashed var(--border-color)', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', paddingLeft: '16px', paddingRight: '16px' }}>
                                {/* [왼쪽] */}
                                <div style={{
                                  fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.9', textAlign: 'left',
                                  paddingLeft: '16px', borderLeft: '3px solid var(--wia-blue)',
                                  display: 'flex', flexDirection: 'column', gap: '4px'
                                }}>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_etd', 'ETD')}:</span> {order.etd ? new Date(order.etd).toLocaleDateString() : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_eta', 'ETA')}:</span> {order.eta ? new Date(order.eta).toLocaleDateString() : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_inbound_date', '입고일자')}:</span> {order.current_status_changed_at ? new Date(order.current_status_changed_at).toLocaleDateString() : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_port', '항구')}:</span> {getStandardPort(order.destination_port) || order.warehouse || order.vessel || '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_so', 'S/O')}:</span> {order.so_no || '-'}</div>
                                </div>
                                {/* [오른쪽] */}
                                <div style={{
                                  fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.9', textAlign: 'left',
                                  paddingLeft: '16px', borderLeft: '3px solid var(--wia-blue)',
                                  display: 'flex', flexDirection: 'column', gap: '4px'
                                }}>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_option', '옵션')}:</span> {order.detail_spec || '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_buying', '구매가')}:</span> {order.price ? (!isNaN(order.price) ? `€ ${Number(order.price).toLocaleString()}` : order.price) : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_remark', 'REMARK')}:</span> {order.remark || '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_rental_dealer', '임대 딜러')}:</span> {order.dealer_company?.name || order.dealer?.name || (order.stock_type === 'RENTAL' ? (order.rental_dealer || '-') : '-')}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '110px' }}>{t('dispatch.detail_rental_period', '임대 기간')}:</span> {formatRentalPeriod(order.rental_start_date, order.rental_expiry_date)}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrderForHistory && (
        <div className="modal-overlay" onClick={closeHistory}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ margin: 0 }}>{t('dispatch.timeline_title', '타임라인 뷰 (진행 이력)')}</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {selectedOrderForHistory.product_model?.model_name} (S/N: {selectedOrderForHistory.serial_number || '-'})
                </p>
              </div>
              <button onClick={closeHistory} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)', padding: '4px' }}>
                <X size={20} />
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto', padding: '20px' }}>
              {orderHistory.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {orderHistory.map((hist, idx) => (
                    <div key={hist.id} style={{ display: 'flex', gap: '12px', borderLeft: '2px solid var(--border-color)', paddingLeft: '16px', position: 'relative' }}>
                      <div style={{
                        position: 'absolute', left: '-7px', top: '0', width: '12px', height: '12px',
                        borderRadius: '50%', background: idx === 0 ? 'var(--accent-blue)' : 'var(--border-color)',
                        border: '2px solid white'
                      }}></div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>
                          {hist.from_status} → <span style={{ color: 'var(--accent-blue)' }}>{hist.to_status}</span>
                        </div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', marginTop: '4px' }}>
                          {new Date(hist.changed_at).toLocaleString()}
                        </div>
                        {hist.reason && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                            사유: {hist.reason}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{t('dispatch.no_history', '이력 데이터가 없습니다.')}</div>
              )}
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '16px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={closeHistory} className="btn btn-outline">{t('dispatch.close', '닫기')}</button>
            </div>
          </div>
        </div>
      )}
      {/* 장비 정보 수정 모달 */}
      {editingOrder && (
        <div className="modal-overlay" onClick={() => setEditingOrder(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px', padding: 0 }}>
            <div className="modal-header" style={{ padding: '20px 24px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0 }}>장비 정보 수정</h3>
              <button onClick={() => setEditingOrder(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-secondary)' }}><X size={20} /></button>
            </div>
            <div className="modal-body" style={{ padding: '24px', maxHeight: '70vh', overflowY: 'auto' }}>
              <form onSubmit={handleUpdateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.model', '모델')}</label>
                    <select
                      value={editForm.product_model_id}
                      onChange={e => setEditForm({ ...editForm, product_model_id: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    >
                      <option value="">모델 선택</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.model_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('dispatch.header_po', 'P/O')}</label>
                    <input type="text" value={editForm.reference_no} onChange={e => setEditForm({ ...editForm, reference_no: e.target.value })} placeholder={t('dispatch.header_po', 'P/O')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('dispatch.header_nc', 'NC')}</label>
                    <input type="text" value={editForm.nc} onChange={e => setEditForm({ ...editForm, nc: e.target.value })} placeholder="NC" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.header_dealer', '딜러사')}</label>
                    <select
                      value={editForm.dealer_company_id}
                      onChange={e => setEditForm({ ...editForm, dealer_company_id: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    >
                      <option value="">딜러 선택</option>
                      {dealers.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.sn', 'S/N')}</label>
                    <input type="text" value={editForm.serial_number} onChange={e => setEditForm({ ...editForm, serial_number: e.target.value })} placeholder={t('menu1.edit_modal.sn_placeholder', 'S/N 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.so', 'S/O')}</label>
                    <input type="text" value={editForm.so_no} onChange={e => setEditForm({ ...editForm, so_no: e.target.value })} placeholder={t('menu1.edit_modal.so_placeholder', 'S/O 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>구매가</label>
                    <input type="text" value={editForm.price} onChange={e => setEditForm({ ...editForm, price: e.target.value })} placeholder="구매가(€)" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.port', '도착항')}</label>
                    <input type="text" value={editForm.destination_port} onChange={e => setEditForm({ ...editForm, destination_port: e.target.value })} placeholder={t('menu1.edit_modal.port_placeholder', '도착항 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.detail_spec', '상세 스펙')}</label>
                  <input type="text" value={editForm.detail_spec} onChange={e => setEditForm({ ...editForm, detail_spec: e.target.value })} placeholder={t('menu1.edit_modal.detail_placeholder', '스펙 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.incoterms', '인코텀즈')}</label>
                    <input type="text" value={editForm.incoterms} onChange={e => setEditForm({ ...editForm, incoterms: e.target.value })} placeholder={t('menu1.edit_modal.incoterms_placeholder', '인코텀즈 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('dispatch.header_location', '위치')}</label>
                    <select
                      value={editForm.warehouse || ''}
                      onChange={e => setEditForm({ ...editForm, warehouse: e.target.value, vessel: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    >
                      <option value="">{t('menu1.edit_modal.warehouse_placeholder', '창고 선택')}</option>
                      <option value="Hamburg">Hamburg (Germany)</option>
                      <option value="Istanbul">Istanbul (Turkey)</option>
                      <option value="Rotterdam">Rotterdam (Netherlands)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('dispatch.header_status', '상태')}</label>
                    <select
                      value={editForm.stock_type || 'AVAILABLE'}
                      onChange={e => setEditForm({ ...editForm, stock_type: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    >
                      <option value="AVAILABLE">{t('menu2.type_available', '판매가능')}</option>
                      <option value="RENTAL">{t('menu2.type_rental', '임대')}</option>
                      <option value="SHOWROOM">{t('menu2.type_showroom', '전시')}</option>
                      <option value="PROMOTION">{t('menu2.type_promotion', '프로모션')}</option>
                      <option value="DEALER_ORDER">{t('menu2.type_dealer_order', '딜러주문')}</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('menu1.edit_modal.etd', 'ETD')}</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>선적정보: <strong style={{ color: editForm.etd ? 'var(--text-primary)' : 'var(--text-muted)' }}>{editForm.etd || '-'}</strong></span>
                    </div>
                    <input
                      type="date"
                      value={editForm.etd}
                      onChange={e => setEditForm({ ...editForm, etd: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    />
                  </div>
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>{t('menu1.edit_modal.eta', 'ETA')}</label>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>선적정보: <strong style={{ color: editForm.eta ? 'var(--text-primary)' : 'var(--text-muted)' }}>{editForm.eta || '-'}</strong></span>
                    </div>
                    <input
                      type="date"
                      value={editForm.eta}
                      onChange={e => setEditForm({ ...editForm, eta: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.remark', '비고')}</label>
                  <textarea value={editForm.remark} onChange={e => setEditForm({ ...editForm, remark: e.target.value })} placeholder={t('menu1.edit_modal.remark_placeholder', '비고 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', resize: 'vertical', minHeight: '80px' }} />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
                  <button type="button" onClick={() => setEditingOrder(null)} className="btn btn-outline" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>{t('menu1.edit_modal.cancel', '취소')}</button>
                  <button type="submit" className="btn btn-primary" style={{ padding: '6px 12px', fontSize: '0.85rem' }}>{t('menu1.edit_modal.save', '저장')}</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
