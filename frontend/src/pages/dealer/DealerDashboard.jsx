import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Ship, Calendar, Package, FileSpreadsheet, ArrowRight } from 'lucide-react';

export default function DealerDashboard({ isMobileView, setActiveTab }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchOrders = async () => {
    setLoading(true);
    try {
      const dealersRes = await fetch('/api/dealers');
      const dealers = await dealersRes.json();
      const akMakina = dealers.find(d => d.name === 'AK MAKINA');
      const dealerId = akMakina ? akMakina.id : '';

      const res = await fetch(`/api/orders?dealer_id=${dealerId}`);
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error("Failed to fetch orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOrders();
  }, []);

  const activeCount = orders.filter(o => !['SOLD', 'DISPATCHED'].includes(o.current_status)).length;
  const shippingCount = orders.filter(o => o.current_status === 'SHIPPING').length;
  const readyCount = orders.filter(o => o.current_status === 'IN_STOCK').length;

  const [corpStock, setCorpStock] = useState([]);

  const fetchCorpStock = async () => {
    try {
      const res = await fetch('/api/orders?is_corporate_stock=true');
      const data = await res.json();
      if (Array.isArray(data)) {
        setCorpStock(data.filter(o => String(o.reference_no || '').trim().toUpperCase().startsWith('F')));
      }
    } catch (e) { }
  };

  useEffect(() => {
    fetchCorpStock();
  }, []);

  const availableCount = corpStock.filter(o => (o.stock_type || 'AVAILABLE') === 'AVAILABLE').length;
  const reservedCount = corpStock.filter(o => String(o.stock_type || '').trim().toUpperCase() === 'RESERVED').length;
  const rentalCount = corpStock.filter(o => (o.stock_type || 'AVAILABLE') === 'RENTAL').length;
  const showroomCount = corpStock.filter(o => (o.stock_type || 'AVAILABLE') === 'SHOWROOM').length;
  const promotionCount = corpStock.filter(o => (o.stock_type || 'AVAILABLE') === 'PROMOTION').length;

  // 구매 내역: 최근 주문일/생성일 내림차순 정렬 후 상위 4개 추출
  const sortedPurchases = [...orders].sort((a, b) => {
    const dateA = a.dealer_order_date || a.created_at;
    const dateB = b.dealer_order_date || b.created_at;
    return new Date(dateB) - new Date(dateA);
  });
  const recentOrders = sortedPurchases.slice(0, 4);

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
      case 'CONFIRMED': return '#0A1C8F';
      case 'IN_PRODUCTION': return '#F59E0B';
      case 'SHIPPING':
      case 'SHIPPED': return '#0EA5E9';
      case 'ARRIVED':
      case 'PORT_ARRIVED': return '#6366F1';
      case 'IN_STOCK': return '#10B981';
      case 'DISPATCHED':
      case 'SOLD': return '#16A34A';
      default: return '#6B7280';
    }
  };

  return (
    <div className="page-body">
      <div style={{ marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('dealer_dashboard.title')}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
          {t('dealer_dashboard.subtitle', { dealerName: 'AK MAKINA' })}
        </p>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>{t('common.loading', 'Loading data...')}</div>
      ) : (
        <>
          {/* 상위: 박스 3개 (KPI Grid) */}
          <div className="kpi-grid">
            <div className="glass-card kpi-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kpi-title">{t('dealer_dashboard.active_orders')}</span>
                <Package color="var(--accent-cyan)" size={24} />
              </div>
              <div className="kpi-value">{activeCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>{t('dealer_dashboard.unit')}</span></div>
              <div className="kpi-desc">{t('dealer_dashboard.active_desc')}</div>
            </div>

            <div className="glass-card kpi-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kpi-title">{t('dealer_dashboard.shipping_orders')}</span>
                <Ship color="var(--accent-blue)" size={24} />
              </div>
              <div className="kpi-value">{shippingCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>{t('dealer_dashboard.unit')}</span></div>
              <div className="kpi-desc">{t('dealer_dashboard.shipping_desc')}</div>
            </div>

            <div className="glass-card kpi-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="kpi-title">{t('dealer_dashboard.ready_orders')}</span>
                <Package color="var(--status-stock)" size={24} />
              </div>
              <div className="kpi-value" style={{ color: 'var(--status-stock)' }}>{readyCount} <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--text-muted)' }}>{t('dealer_dashboard.unit')}</span></div>
              <div className="kpi-desc">{t('dealer_dashboard.ready_desc')}</div>
            </div>
          </div>

          {/* 중간: 'WIA 가용재고 목록' 박스 */}
          <div className="glass-card" style={{ padding: isMobileView ? '20px' : '28px', display: 'flex', flexDirection: 'column', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <Package size={20} color="var(--status-stock)" />
                  {t('menu2.inventory_list_title', 'WIA 가용재고 목록')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  {t('menu2.page_desc', 'WIA 유럽법인의 가용 재고(ATP) 현황을 파악 할 수 있습니다.')}
                </p>
              </div>

              {/* Navigation Button */}
              <button
                className="btn btn-outline"
                onClick={() => setActiveTab && setActiveTab('dealer-inventory')}
                style={{ padding: '8px 22px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-cyan)', borderColor: 'var(--accent-cyan)', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                GO stock list <ArrowRight size={14} />
              </button>
            </div>

            {/* Summary Banner */}
            <div style={{
              padding: '14px 20px', backgroundColor: 'var(--bg-card)',
              border: '1px solid var(--border-color)', borderRadius: '12px',
              display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)', fontSize: '0.88rem'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>All:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--text-primary)' }}>{corpStock.length}</span>
              </div>
              <div style={{ height: '16px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Available:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--status-stock)' }}>{availableCount}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Reserved:</span>
                <span style={{ fontWeight: 'bold', color: '#7c3aed' }}>{reservedCount}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Rental:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--status-production)' }}>{rentalCount}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Showroom:</span>
                <span style={{ fontWeight: 'bold', color: '#4da6ff' }}>{showroomCount}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ color: 'var(--text-secondary)' }}>Promotion:</span>
                <span style={{ fontWeight: 'bold', color: 'var(--accent-pink)' }}>{promotionCount}</span>
              </div>
            </div>
          </div>

          {/* 하단: '내 구매 내역' 박스 */}
          <div className="glass-card" style={{ padding: isMobileView ? '20px' : '28px', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px', marginBottom: '20px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--text-primary)' }}>
                  <FileSpreadsheet size={20} color="var(--accent-blue)" />
                  {t('sidebar.dealer_menu.sales_archive', '내 구매 내역')}
                </h3>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', margin: 0 }}>
                  {t('dealer_dashboard.my_ordered_desc', '주문한 구매 내역 리스트입니다.')}
                </p>
              </div>

              {/* GO my ordered 바로가기 버튼 */}
              <button
                className="btn btn-outline"
                onClick={() => setActiveTab && setActiveTab('dealer-sales-archive')}
                style={{ padding: '8px 22px', fontWeight: 600, fontSize: '0.85rem', color: 'var(--accent-blue)', borderColor: 'var(--accent-blue)', borderRadius: '20px', display: 'inline-flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap' }}
              >
                GO my ordered <ArrowRight size={14} />
              </button>
            </div>

            {isMobileView ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {recentOrders.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('dealer_orders.no_orders', 'No order history available.')}</div>
                ) : (
                  recentOrders.map((order, idx) => {
                    const statusColor = getStatusColor(order.current_status);
                    return (
                      <div key={order.id || idx} style={{ background: 'var(--bg-secondary)', padding: '14px 16px', borderRadius: '12px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, color: 'var(--text-primary)', fontSize: '1rem' }}>
                            {order.product_model ? order.product_model.model_name : (order.reference_no || '-')}
                          </span>
                          <span style={{
                            display: 'inline-block', padding: '3px 8px', borderRadius: '4px',
                            fontWeight: 600, fontSize: '0.75rem', whiteSpace: 'nowrap',
                            backgroundColor: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40`
                          }}>
                            {getStatusLabel(order.current_status)}
                          </span>
                        </div>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                          <div><span style={{ color: 'var(--text-muted)' }}>Order Date: </span>{new Date(order.dealer_order_date || order.created_at).toLocaleDateString()}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>P/O: </span>{order.reference_no || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>NC: </span>{order.nc || '-'}</div>
                          <div><span style={{ color: 'var(--text-muted)' }}>S/N: </span>{order.serial_number || '-'}</div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr style={{ height: '46px' }}>
                      <th style={{ width: '6%', textAlign: 'center' }}>No.</th>
                      <th style={{ width: '16%', textAlign: 'center' }}>Order Date</th>
                      <th style={{ width: '22%', textAlign: 'center' }}>Model</th>
                      <th style={{ width: '14%', textAlign: 'center' }}>NC</th>
                      <th style={{ width: '16%', textAlign: 'center' }}>S/N</th>
                      <th style={{ width: '14%', textAlign: 'center' }}>P/O</th>
                      <th style={{ width: '12%', textAlign: 'center' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentOrders.length === 0 ? (
                      <tr><td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-muted)' }}>{t('dealer_orders.no_orders', 'No order history available.')}</td></tr>
                    ) : (
                      recentOrders.map((order, idx) => {
                        const statusColor = getStatusColor(order.current_status);
                        return (
                          <tr key={order.id || idx}>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{idx + 1}</td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>
                              {new Date(order.dealer_order_date || order.created_at).toLocaleDateString()}
                            </td>
                            <td style={{ textAlign: 'center', fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                              {order.product_model ? order.product_model.model_name : '-'}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem' }}>{order.nc || '-'}</td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: 500 }}>
                              {order.serial_number || '-'}
                            </td>
                            <td style={{ textAlign: 'center', fontSize: '0.85rem', fontWeight: 500 }}>
                              {order.reference_no || '-'}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <span style={{
                                display: 'inline-block', minWidth: '95px', textAlign: 'center', padding: '3px 8px', borderRadius: '4px',
                                fontWeight: 600, fontSize: '0.78rem', whiteSpace: 'nowrap',
                                backgroundColor: `${statusColor}20`, color: statusColor, border: `1px solid ${statusColor}40`
                              }}>
                                {getStatusLabel(order.current_status)}
                              </span>
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
        </>
      )}
    </div>
  );
}
