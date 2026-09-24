import React, { useState, useEffect } from 'react';
import { Search, FileSpreadsheet, Download, Box, Package, ChevronRight, X, ExternalLink } from 'lucide-react';
import { useTranslation } from 'react-i18next';

function CargoDetailModal({ isOpen, onClose, serialNumber, modelName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  useEffect(() => {
    if (isOpen && serialNumber) {
      setLoading(true);
      fetch(`/api/cargo-details/${serialNumber}`)
        .then(res => {
          if(!res.ok) throw new Error('Not found');
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
        <h2 style={{ fontSize: '1.2rem', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Package size={20} color="var(--accent-color)" /> 화물 디테일 (Cargo Details)
        </h2>
        
        {loading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" style={{ minWidth: '700px', margin: 0 }}>
              <thead>
                <tr>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px' }}>Model</th>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px' }}>S/N</th>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px' }}>ITEM</th>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px', textAlign: 'center' }}>QTY</th>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px', textAlign: 'center' }}>BOX NO</th>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px', textAlign: 'center' }}>DIMENSION (L/W/H) cm</th>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px', textAlign: 'center' }}>N*W(kg)</th>
                  <th style={{ backgroundColor: '#fcd34d', color: '#000', padding: '10px', textAlign: 'center' }}>G*W(kg)</th>
                </tr>
              </thead>
              <tbody>
                {displayData.map((item, idx) => (
                  <tr key={idx} style={{ backgroundColor: '#fff' }}>
                    <td style={{ padding: '10px', fontWeight: 600, border: '1px solid #e5e7eb', color: '#000', textAlign: 'center' }}>
                      {item.serial_number ? (modelName || '-') : '-'}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 600, border: '1px solid #e5e7eb', color: '#000', textAlign: 'center' }}>
                      {item.serial_number ? item.serial_number : '-'}
                    </td>
                    <td style={{ padding: '10px', border: '1px solid #e5e7eb', color: '#374151', textAlign: 'center' }}>
                      {item.item || '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#374151' }}>
                      {item.qty || '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#374151' }}>
                      {item.box_no || '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#374151' }}>
                      {item.dimensions || '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#374151' }}>
                      {item.net_weight || '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center', border: '1px solid #e5e7eb', color: '#374151' }}>
                      {item.gross_weight || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const getStatusLabel = (status) => {
  switch(status) {
    case 'CONFIRMED': return '주문';
    case 'IN_PRODUCTION': return '생산중';
    case 'SHIPPED': return '배송';
    case 'PORT_ARRIVED': return '항구도착';
    case 'IN_STOCK': return '입고';
    case 'SOLD': return '판매완료';
    default: return status;
  }
};

const getStatusColor = (status) => {
  switch(status) {
    case 'CONFIRMED': return '#3b82f6';
    case 'IN_PRODUCTION': return '#8b5cf6';
    case 'SHIPPED': return '#f59e0b';
    case 'PORT_ARRIVED': return '#ec4899';
    case 'IN_STOCK': return '#10b981';
    case 'SOLD': return '#6b7280';
    default: return '#9ca3af';
  }
};

export default function DealerSalesArchive({ isMobileView }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedSN, setSelectedSN] = useState(null);
  const [selectedModel, setSelectedModel] = useState(null);

  const fetchSoldOrders = async () => {
    setLoading(true);
    try {
      const dealersRes = await fetch('/api/dealers');
      const dealers = await dealersRes.json();
      const akMakina = dealers.find(d => d.name === 'AK MAKINA');
      const dealerId = akMakina ? akMakina.id : '';

      // API 호출: SOLD 필터 제거하여 모든 이력(5단계 파이프라인 포함) 조회
      const res = await fetch(`/api/orders?dealer_id=${dealerId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        // Sort by order date descending
        const sortedData = data.sort((a, b) => {
          const dateA = a.dealer_order_date || a.created_at;
          const dateB = b.dealer_order_date || b.created_at;
          return new Date(dateB) - new Date(dateA);
        });
        setOrders(sortedData);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSoldOrders();
  }, []);

  const handleExportCSV = () => {
    if (orders.length === 0) return;

    const headers = ['Order Date', 'Model', 'S/N', 'N/C', 'P/O', 'Status', 'Pick-up'];
    const rows = orders.map(order => [
      new Date(order.dealer_order_date || order.created_at).toLocaleDateString(),
      order.product_model ? order.product_model.model_name : '-',
      order.serial_number || '-',
      order.nc || '-',
      order.reference_no || '-',
      getStatusLabel(order.current_status),
      order.current_status === 'SOLD' ? '완료' : '-'
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
    const s = searchQuery.toLowerCase();
    const sn = o.serial_number ? o.serial_number.toLowerCase() : '';
    const mn = o.product_model ? o.product_model.model_name.toLowerCase() : '';
    const po = o.reference_no ? o.reference_no.toLowerCase() : '';
    return sn.includes(s) || mn.includes(s) || po.includes(s);
  });

  const openCargoModal = (sn, model) => {
    if(!sn) return;
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
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          전체 구매 파이프라인(주문~입고)을 추적하고 픽업을 준비할 수 있습니다.
        </p>
      </div>

      <div className="glass-card no-hover-bg" style={{ padding: isMobileView ? '20px' : '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              {t('dealer_sales_archive.list_title', '전체 구매 내역')} ({filteredOrders.length})
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', width: isMobileView ? '100%' : 'auto' }}>
            <div style={{ position: 'relative', flex: isMobileView ? 1 : 'none' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input 
                type="text" 
                placeholder="Model, S/N, P/O 검색" 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 14px 8px 36px', borderRadius: '10px', fontSize: '0.85rem', width: isMobileView ? '100%' : '240px'
                }}
              />
            </div>
            <button onClick={handleExportCSV} className="btn btn-outline" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', fontSize: '0.85rem' }}>
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        <div className="data-table-container full-bleed">
          {loading ? (
            <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>{t('navbar.init_seed_loading', '데이터를 불러오는 중입니다...')}</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: '10%' }}>주문일자</th>
                  <th style={{ width: '15%' }}>Model</th>
                  <th style={{ width: '12%' }}>S/N</th>
                  <th style={{ width: '12%' }}>N/C</th>
                  <th style={{ width: '12%' }}>P/O</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>상태</th>
                  <th style={{ width: '15%', textAlign: 'center' }}>화물디테일</th>
                  <th style={{ width: '12%', textAlign: 'center' }}>픽업상태</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.length > 0 ? (
                  filteredOrders.map(order => {
                    const statusColor = getStatusColor(order.current_status);
                    const isPickedUp = order.current_status === 'SOLD';
                    
                    return (
                      <tr key={order.id}>
                        <td style={{ padding: '14px 12px' }}>
                          {new Date(order.dealer_order_date || order.created_at).toLocaleDateString()}
                        </td>
                        <td style={{ padding: '14px 12px', fontWeight: 600 }}>
                          {order.product_model ? order.product_model.model_name : '-'}
                        </td>
                        <td style={{ padding: '14px 12px', fontFamily: 'monospace' }}>
                          {order.serial_number || '-'}
                        </td>
                        <td style={{ padding: '14px 12px' }}>
                          {order.nc || '-'}
                        </td>
                        <td style={{ padding: '14px 12px', fontWeight: 500 }}>
                          {order.reference_no || '-'}
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                          <span style={{
                            display: 'inline-block', padding: '4px 8px', borderRadius: '4px',
                            fontSize: '0.75rem', fontWeight: 600,
                            backgroundColor: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40`
                          }}>
                            {getStatusLabel(order.current_status)}
                          </span>
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                          <button 
                            onClick={() => openCargoModal(order.serial_number, order.product_model ? order.product_model.model_name : '')}
                            disabled={!order.serial_number}
                            style={{
                              background: 'transparent', border: '1px solid var(--border-color)', 
                              color: order.serial_number ? 'var(--text-primary)' : 'var(--text-muted)',
                              padding: '4px 10px', borderRadius: '6px', fontSize: '0.8rem',
                              cursor: order.serial_number ? 'pointer' : 'not-allowed',
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              transition: 'all 0.2s'
                            }}
                            className={order.serial_number ? "hover-bg-subtle" : ""}
                          >
                            <ExternalLink size={14} /> 상세보기
                          </button>
                        </td>
                        <td style={{ padding: '14px 12px', textAlign: 'center' }}>
                          {isPickedUp ? (
                            <span style={{ color: 'var(--success-color)', fontWeight: 600 }}>완료</span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr>
                    <td colSpan="8" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
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
