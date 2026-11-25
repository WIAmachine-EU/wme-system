import React, { useState, useEffect } from 'react';
import { Search, FileSpreadsheet, Download, Box, Package, ChevronRight, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const CubeIcon = ({ size = 14 }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2.2"
    strokeLinecap="butt"
    strokeLinejoin="miter"
    style={{ flexShrink: 0 }}
    aria-hidden="true"
  >
    <path d="M12 2.5L20.23 7.25V16.75L12 21.5L3.77 16.75V7.25Z" />
    <path d="M3.77 7.25L12 12L20.23 7.25" />
    <path d="M12 12V21.5" />
  </svg>
);

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

  const displayData = data && data.length > 0 ? data : [{}, {}];

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
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.loading', 'Loading data...')}</div>
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

const getStatusLabel = (status) => {
  switch (status) {
    case 'CONFIRMED': return 'Order';
    case 'IN_PRODUCTION': return 'In Production';
    case 'SHIPPING':
    case 'SHIPPED': return 'Shipping';
    case 'ARRIVED':
    case 'PORT_ARRIVED': return 'Arrived';
    case 'IN_STOCK': return 'In Warehouse';
    case 'DISPATCHED': return 'Dispatched';
    case 'SOLD': return 'Picked Up';
    default: return status || '-';
  }
};

const getStatusColor = (status) => {
  switch (status) {
    case 'CONFIRMED': return '#3b82f6';
    case 'IN_PRODUCTION': return '#8b5cf6';
    case 'SHIPPING':
    case 'SHIPPED': return '#f59e0b';
    case 'ARRIVED':
    case 'PORT_ARRIVED': return '#ec4899';
    case 'IN_STOCK': return '#10b981';
    case 'DISPATCHED':
    case 'SOLD': return '#6b7280';
    default: return '#9ca3af';
  }
};

export default function DealerSalesArchive({ isMobileView, dealerCompanyId, dealerCompanyName }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [portCodes, setPortCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSN, setSelectedSN] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);

  const fetchSoldOrders = async () => {
    setLoading(true);
    try {
      const ordersUrl = dealerCompanyId
        ? `/api/orders?dealer_id=${encodeURIComponent(dealerCompanyId)}`
        : '/api/orders';
      const [ordersRes, portsRes] = await Promise.all([
        fetch(ordersUrl),
        fetch('/api/master-data/port-codes')
      ]);
      if (portsRes.ok) {
        const portsData = await portsRes.json();
        setPortCodes(Array.isArray(portsData) ? portsData : []);
      }

      if (ordersRes.ok) {
        const data = await ordersRes.json();
        if (Array.isArray(data)) {
          const scopedData = dealerCompanyId
            ? data.filter(o => Number(o.dealer_company_id) === Number(dealerCompanyId))
            : data;
          // Sort by order date descending
          const sortedData = scopedData.sort((a, b) => {
            const dateA = a.dealer_order_date || a.created_at;
            const dateB = b.dealer_order_date || b.created_at;
            return new Date(dateB) - new Date(dateA);
          });
          setOrders(sortedData);
        } else {
          setOrders([]);
        }
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSoldOrders();
  }, [dealerCompanyId]);

  // 도착지 항구 표준화 함수
  const getStandardPort = (rawPort) => {
    if (!rawPort || rawPort === '-') return '-';
    if (!portCodes || portCodes.length === 0) return rawPort;
    const lowerRaw = String(rawPort).toLowerCase().trim();
    const exactMatch = portCodes.find(p => p.port_code.toLowerCase() === lowerRaw);
    if (exactMatch) return exactMatch.port_code;
    const startsMatch = portCodes.find(p => p.port_code.toLowerCase().startsWith(lowerRaw));
    if (startsMatch) return startsMatch.port_code;
    return rawPort;
  };

  // P/O (reference_no) 기준 동일한 PORT 정보 매핑 맵
  const poPortMap = React.useMemo(() => {
    const map = {};
    orders.forEach(o => {
      const po = (o.reference_no || '').trim();
      if (!po) return;
      const rawPort = o.destination_port || o.shipment?.pod;
      if (rawPort && (!map[po] || map[po] === '-')) {
        map[po] = rawPort;
      }
    });
    return map;
  }, [orders]);

  // 주문별 P/O 기준 도착항 반환 함수
  const getOrderPort = (order) => {
    const po = (order.reference_no || '').trim();
    const rawPort = (po && poPortMap[po]) || order.destination_port || order.shipment?.pod || '';
    return getStandardPort(rawPort);
  };

  const handleExportCSV = () => {
    if (sortedOrders.length === 0) return;

    const headers = ['DATE', 'ORDER NO', 'MODEL', 'NC', 'S/N', 'P/O', 'STATUS', 'PORT', 'CARGO', 'PICKUP'];
    const escapeCsv = (val) => `"${String(val ?? '-').replace(/"/g, '""')}"`;
    const rows = sortedOrders.map(order => [
      escapeCsv(order.dealer_order_date || order.created_at ? new Date(order.dealer_order_date || order.created_at).toLocaleDateString() : '-'),
      escapeCsv(order.dealer_order_no || '-'),
      escapeCsv(order.product_model ? order.product_model.model_name : '-'),
      escapeCsv(order.nc || '-'),
      escapeCsv(order.serial_number || '-'),
      escapeCsv(order.reference_no || '-'),
      escapeCsv(getStatusLabel(order.current_status)),
      escapeCsv(getOrderPort(order)),
      escapeCsv(order.serial_number && order.has_cargo_detail ? 'cm / kg' : '-'),
      escapeCsv(order.current_status === 'SOLD' ? 'Picked Up' : '-')
    ]);

    let csvContent = "data:text/csv;charset=utf-8,\uFEFF"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `my_purchases_${new Date().getTime()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredOrders = orders.filter(o => {
    const s = searchQuery.toLowerCase().trim();
    if (!s) return true;
    const orderNo = (o.dealer_order_no || '').toLowerCase();
    const sn = (o.serial_number || '').toLowerCase();
    const mn = (o.product_model?.model_name || '').toLowerCase();
    const po = (o.reference_no || '').toLowerCase();
    const nc = (o.nc || '').toLowerCase();
    const port = getOrderPort(o).toLowerCase();
    return orderNo.includes(s) || sn.includes(s) || mn.includes(s) || po.includes(s) || nc.includes(s) || port.includes(s);
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
      case 'order_date': {
        const timeA = new Date(a.dealer_order_date || a.created_at || 0).getTime();
        const timeB = new Date(b.dealer_order_date || b.created_at || 0).getTime();
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      }
      case 'order_no':
        valA = a.dealer_order_no || '';
        valB = b.dealer_order_no || '';
        break;
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
      case 'status':
        valA = getStatusLabel(a.current_status) || '';
        valB = getStatusLabel(b.current_status) || '';
        break;
      case 'port':
        valA = getOrderPort(a);
        valB = getOrderPort(b);
        break;
      case 'pickup':
        valA = a.current_status === 'SOLD' ? 'Picked Up' : '';
        valB = b.current_status === 'SOLD' ? 'Picked Up' : '';
        break;
      default:
        return 0;
    }
    const cmp = String(valA).localeCompare(String(valB), undefined, { numeric: true, sensitivity: 'base' });
    return sortConfig.direction === 'asc' ? cmp : -cmp;
  });

  const renderSortHeader = (key, label, width = '12%', align = 'center') => {
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

  const openCargoModal = (sn, model) => {
    if (!sn) return;
    setSelectedSN(sn);
    setSelectedModel(model);
    setModalOpen(true);
  };

  return (
    <div className="page-body">
      <CargoDetailModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        serialNumber={selectedSN}
        modelName={selectedModel}
      />

      <div style={{ marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('sidebar.dealer_menu.sales_archive', '메뉴3. 내 구매 내역')}</h1>
      </div>

      <div className="glass-card no-hover-bg" style={{ padding: isMobileView ? '20px' : '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {t('dealer_sales_archive.list_title', 'My Order List')} ({filteredOrders.length})
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', width: isMobileView ? '100%' : 'auto' }}>
            <div style={{ position: 'relative', flex: isMobileView ? 1 : 'none' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="search"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 14px 8px 36px', borderRadius: '10px', fontSize: '0.85rem', width: isMobileView ? '100%' : '240px'
                }}
              />
            </div>
            <select
              value={sortConfig.key ? `${sortConfig.key}_${sortConfig.direction}` : ""}
              onChange={e => {
                if (!e.target.value) {
                  setSortConfig({ key: null, direction: 'asc' });
                } else {
                  const lastUnderscore = e.target.value.lastIndexOf('_');
                  const key = e.target.value.slice(0, lastUnderscore);
                  const direction = e.target.value.slice(lastUnderscore + 1);
                  setSortConfig({ key, direction });
                }
              }}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none'
              }}
              title={t('common.sort_by', '정렬 기준')}
            >
              <option value="">{t('common.sort_default', '기본 정렬')}</option>
              <option value="order_date_asc">DATE ▲ {t('common.sort_oldest', '(과거순)')}</option>
              <option value="order_date_desc">DATE ▼ {t('common.sort_newest', '(최신순)')}</option>
              <option value="order_no_asc">ORDER NO ▲</option>
              <option value="order_no_desc">ORDER NO ▼</option>
              <option value="model_asc">MODEL ▲ {t('common.sort_asc', '(오름차순)')}</option>
              <option value="model_desc">MODEL ▼ {t('common.sort_desc', '(내림차순)')}</option>
              <option value="nc_asc">NC ▲</option>
              <option value="nc_desc">NC ▼</option>
              <option value="sn_asc">S/N ▲</option>
              <option value="sn_desc">S/N ▼</option>
              <option value="po_asc">P/O ▲</option>
              <option value="po_desc">P/O ▼</option>
              <option value="status_asc">STATUS ▲</option>
              <option value="status_desc">STATUS ▼</option>
              <option value="port_asc">PORT ▲</option>
              <option value="port_desc">PORT ▼</option>
              <option value="pickup_asc">PICKUP ▲</option>
              <option value="pickup_desc">PICKUP ▼</option>
            </select>
            <button onClick={handleExportCSV} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem' }}>
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        <div className="data-table-container full-bleed">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('common.loading', 'Loading data...')}</div>
          ) : isMobileView ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {sortedOrders.length > 0 ? (
                sortedOrders.map((order, index) => {
                  const statusColor = getStatusColor(order.current_status);
                  const isPickedUp = order.current_status === 'SOLD';
                  const hasCargo = Boolean(order.serial_number && order.has_cargo_detail);
                  return (
                    <div key={order.id} style={{ 
                      background: 'var(--bg-card, #ffffff)', 
                      border: '1px solid var(--border-color)', 
                      borderRadius: '12px', 
                      padding: '16px',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.05)'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'flex-start' }}>
                        <div>
                          <span style={{ fontSize: '12px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px' }}>No. {index + 1}</span>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1.1rem' }}>
                            {order.product_model ? order.product_model.model_name : '-'}
                          </span>
                        </div>
                        <span style={{
                          display: 'inline-block', padding: '4px 10px', borderRadius: '6px',
                          fontWeight: 600, fontSize: '12px', whiteSpace: 'nowrap',
                          backgroundColor: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40`
                        }}>
                          {getStatusLabel(order.current_status)}
                        </span>
                      </div>
                      
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                        <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>DATE</span>{order.dealer_order_date || order.created_at ? new Date(order.dealer_order_date || order.created_at).toLocaleDateString() : '-'}</div>
                        <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>ORDER NO</span><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{order.dealer_order_no || '-'}</span></div>
                        <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>NC</span>{order.nc || '-'}</div>
                        <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>S/N</span><span style={{ fontWeight: 600 }}>{order.serial_number || '-'}</span></div>
                        <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>P/O</span><span style={{ fontWeight: 500 }}>{order.reference_no || '-'}</span></div>
                        <div><span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>PORT</span><span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{getOrderPort(order)}</span></div>
                        <div>
                          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>PICKUP</span>
                          {isPickedUp ? <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>Picked Up</span> : <span>-</span>}
                        </div>
                      </div>
                      
                      <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        <button
                          onClick={() => hasCargo && openCargoModal(order.serial_number, order.product_model ? order.product_model.model_name : '')}
                          disabled={!hasCargo}
                          style={{
                            background: hasCargo ? 'rgb(10, 28, 143)' : 'transparent',
                            border: `1px solid ${hasCargo ? 'rgb(10, 28, 143)' : 'var(--border-color)'}`,
                            color: hasCargo ? '#ffffff' : 'var(--text-muted)',
                            fontFamily: 'SUITE, sans-serif',
                            fontWeight: hasCargo ? 600 : 400,
                            opacity: hasCargo ? 1 : 0.45,
                            padding: '10px', borderRadius: '8px', fontSize: '14px',
                            cursor: hasCargo ? 'pointer' : 'not-allowed',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                            width: '100%',
                            transition: 'all 0.2s'
                          }}
                        >
                          <CubeIcon size={14} /> {t('dispatch.btn_dimension', 'cm / kg')}
                        </button>
                      </div>
                    </div>
                  )
                })
              ) : (
                <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                  내역이 존재하지 않습니다.
                </div>
              )}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th 
                    style={{ width: '4%', textAlign: 'center', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setSortConfig({ key: null, direction: 'asc' })}
                    title="기본 순서로 리셋"
                  >
                    *
                  </th>
                  {renderSortHeader('order_date', 'DATE', '9%', 'center')}
                  {renderSortHeader('order_no', 'ORDER NO', '10%', 'center')}
                  {renderSortHeader('model', 'MODEL', '11%', 'center')}
                  {renderSortHeader('nc', 'NC', '7%', 'center')}
                  {renderSortHeader('sn', 'S/N', '10%', 'center')}
                  {renderSortHeader('po', 'P/O', '10%', 'center')}
                  {renderSortHeader('status', 'STATUS', '10%', 'center')}
                  {renderSortHeader('port', 'PORT', '10%', 'center')}
                  <th style={{ width: '10%', textAlign: 'center' }}>CARGO</th>
                  {renderSortHeader('pickup', 'PICKUP', '9%', 'center')}
                </tr>
              </thead>
              <tbody>
                {sortedOrders.length > 0 ? (
                  sortedOrders.map((order, index) => {
                    const statusColor = getStatusColor(order.current_status);
                    const isPickedUp = order.current_status === 'SOLD';
                    const hasCargo = Boolean(order.serial_number && order.has_cargo_detail);

                    return (
                      <tr key={order.id}>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          <span style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          {order.dealer_order_date || order.created_at ? new Date(order.dealer_order_date || order.created_at).toLocaleDateString() : '-'}
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontWeight: 500, fontSize: '11px', color: 'var(--text-primary)' }}>
                          {order.dealer_order_no || '-'}
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontWeight: 600, fontSize: '11px' }}>
                          {order.product_model ? order.product_model.model_name : '-'}
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          {order.nc || '-'}
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          {order.serial_number || '-'}
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontWeight: 500, fontSize: '11px' }}>
                          {order.reference_no || '-'}
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          <span style={{
                            display: 'inline-block', width: '95px', textAlign: 'center', padding: '4px 8px', borderRadius: '4px',
                            fontWeight: 600, whiteSpace: 'nowrap', fontSize: '11px',
                            backgroundColor: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40`
                          }}>
                            {getStatusLabel(order.current_status)}
                          </span>
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>
                            {getOrderPort(order)}
                          </span>
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          <button
                            onClick={() => hasCargo && openCargoModal(order.serial_number, order.product_model ? order.product_model.model_name : '')}
                            disabled={!hasCargo}
                            style={{
                              background: hasCargo ? 'rgb(10, 28, 143)' : 'transparent',
                              border: `1px solid ${hasCargo ? 'rgb(10, 28, 143)' : 'var(--border-color)'}`,
                              color: hasCargo ? '#ffffff' : 'var(--text-muted)',
                              fontFamily: 'SUITE, sans-serif',
                              fontWeight: hasCargo ? 600 : 400,
                              opacity: hasCargo ? 1 : 0.45,
                              padding: '4px 8px', borderRadius: '6px', fontSize: '11px',
                              cursor: hasCargo ? 'pointer' : 'not-allowed',
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              transition: 'all 0.2s'
                            }}
                          >
                            <CubeIcon size={13} /> {t('dispatch.btn_dimension', 'cm / kg')}
                          </button>
                        </td>
                        <td style={{ padding: '13px 12px', textAlign: 'center', fontSize: '11px' }}>
                          {isPickedUp ? (
                            <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>Picked Up</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="11" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                      내역이 존재하지 않습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
