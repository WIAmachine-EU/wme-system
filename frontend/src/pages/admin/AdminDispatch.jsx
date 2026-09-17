import React, { useState, useEffect } from 'react';
import { Search, Package, CheckCircle, Clock, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const getAgingStatus = (etd) => {
  if (!etd) return { status: '일반', days: 0, color: 'var(--status-stock)', bg: 'rgba(16, 185, 129, 0.1)' };
  const etdDate = new Date(etd);
  const today = new Date();
  const diffTime = Math.abs(today - etdDate);
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

  if (diffDays <= 180) return { status: '일반', days: diffDays, color: 'var(--status-stock)', bg: 'rgba(16, 185, 129, 0.1)' };
  if (diffDays <= 360) return { status: '장기', days: diffDays, color: '#f59e0b', bg: 'rgba(245, 158, 11, 0.1)' };
  return { status: '악성', days: diffDays, color: 'var(--accent-red)', bg: 'rgba(239, 68, 68, 0.1)' };
};

export default function AdminDispatch({ isMobileView }) {
  const { t } = useTranslation();
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
    vessel: '',
    remark: ''
  });

  const [agingFilter, setAgingFilter] = useState('ALL');
  const [stockTypeFilter, setStockTypeFilter] = useState('ALL');

  const [selectedOrderForHistory, setSelectedOrderForHistory] = useState(null);
  const [orderHistory, setOrderHistory] = useState([]);

  const [expandedRows, setExpandedRows] = useState(new Set());

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

  const handleEditClick = (order) => {
    setEditingOrder(order);
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
      vessel: order.vessel || '',
      remark: order.remark || ''
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
          vessel: editForm.vessel,
          remark: editForm.remark
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
    const matchesSearch = sn.includes(s) || mn.includes(s) || po.includes(s) || nc.includes(s);
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

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>WIA 창고</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            물류 및 담당자가 입고된 장비의 상태를 관리합니다.
          </p>
        </div>
      </div>

      <div className="glass-card no-hover-bg" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={20} color="var(--accent-blue)" />
              <span>입고된 장비 목록</span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="검색"
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
              <option value="ALL">전체 재고 (에이징)</option>
              <option value="LONG_DEAD">장기/악성 재고만 보기</option>
            </select>
            <select
              value={stockTypeFilter}
              onChange={(e) => setStockTypeFilter(e.target.value)}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer'
              }}
            >
              <option value="ALL">전체 타입</option>
              <option value="AVAILABLE">판매가능 (AVAILABLE)</option>
              <option value="RENTAL">임대 (RENTAL)</option>
              <option value="SHOWROOM">전시 (SHOWROOM)</option>
              <option value="PROMOTION">프로모션 (PROMOTION)</option>
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
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>전체:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{filteredOrders.length}</span>
          </div>
          <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>일반 재고:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--status-stock)' }}>
              {filteredOrders.filter(o => getAgingStatus(o.etd).status === '일반').length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>장기 재고:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#f59e0b' }}>
              {filteredOrders.filter(o => getAgingStatus(o.etd).status === '장기').length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>악성 재고:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--accent-red)' }}>
              {filteredOrders.filter(o => getAgingStatus(o.etd).status === '악성').length}
            </span>
          </div>
        </div>

        {isMobileView ? (
          <div className="mobile-cards-grid">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</div>
            ) : filteredOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>조건에 맞는 입고 장비가 없습니다.</div>
            ) : (
              filteredOrders.map((order) => {
                const aging = getAgingStatus(order.etd);
                const displayType = order.stock_type || 'AVAILABLE';

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
                      <span>NC: <strong style={{ color: 'var(--text-primary)' }}>{order.nc || '-'}</strong></span>
                      <span>S/N: <strong style={{ color: 'var(--text-primary)' }}>{order.serial_number || '-'}</strong></span>
                      <span>TYPE: <strong style={{ color: 'var(--text-primary)' }}>{displayType}</strong></span>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '12px', paddingBottom: '8px', borderBottom: '1px dashed var(--border-color)' }}>
                      <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>재고상태(에이징):</span>
                      <span style={{
                        display: 'inline-block', padding: '4px 8px', borderRadius: '12px',
                        fontSize: '0.8rem', fontWeight: 600, color: aging.color, background: aging.bg
                      }}>
                        {aging.status} ({aging.days}일)
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleViewHistory(order)}
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Clock size={14} /> 이력
                      </button>
                      <button
                        onClick={() => handleEditClick(order)}
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        수정
                      </button>
                      <button
                        onClick={() => handleDispatchOrder(order.id)}
                        className="btn btn-primary"
                        style={{ flex: 2, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <CheckCircle size={14} /> 출고 처리
                      </button>
                    </div>

                    {expandedRows.has(order.id) && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>선적일자(ETD):</strong> <span>{order.etd ? new Date(order.etd).toLocaleDateString() : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>입고일자:</strong> <span>{order.current_status_changed_at ? new Date(order.current_status_changed_at).toLocaleDateString() : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>REMARK:</strong> <span>{order.remark || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '100px' }}>DETAIL SPEC:</strong> <span>{order.detail_spec || '-'}</span></div>
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
                  <th style={{ width: '4%', textAlign: 'center', fontWeight: 'bold' }}>No.</th>
                  <th style={{ width: '15%', textAlign: 'center', fontWeight: 'bold' }}>모델</th>
                  <th style={{ width: '10%', textAlign: 'center', fontWeight: 'bold' }}>NC</th>
                  <th style={{ width: '12%', textAlign: 'center', fontWeight: 'bold' }}>P/O</th>
                  <th style={{ width: '12%', textAlign: 'center', fontWeight: 'bold' }}>S/N</th>
                  <th style={{ width: '12%', textAlign: 'center', fontWeight: 'bold' }}>재고상태(에이징)</th>
                  <th style={{ width: '10%', textAlign: 'center', fontWeight: 'bold' }}>재고타입</th>
                  <th style={{ width: '25%', textAlign: 'center', fontWeight: 'bold' }}>진행</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</td></tr>
                ) : filteredOrders.length === 0 ? (
                  <tr><td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>조건에 맞는 입고 장비가 없습니다.</td></tr>
                ) : (
                  filteredOrders.map((order, index) => {
                    const aging = getAgingStatus(order.etd);
                    const displayType = order.stock_type || 'AVAILABLE';

                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          onClick={() => toggleRow(order.id)}
                          style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 600, fontSize: '12px' }}>{order.product_model?.model_name || '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '12px' }}>{order.nc || '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11px' }}>{order.reference_no || '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '12px' }}>{order.serial_number || '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <span style={{
                              display: 'inline-block', padding: '4px 8px', borderRadius: '12px',
                              fontSize: '11px', fontWeight: 600, color: aging.color, background: aging.bg
                            }}>
                              {aging.status} ({aging.days}일)
                            </span>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{displayType}</span>
                          </td>
                          <td onClick={e => e.stopPropagation()} style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'center' }}>
                              <button
                                onClick={() => handleViewHistory(order)}
                                className="btn btn-outline"
                                style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <Clock size={13} /> 이력
                              </button>
                              <button
                                onClick={() => handleEditClick(order)}
                                className="btn btn-outline"
                                style={{ padding: '4px 8px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleDispatchOrder(order.id)}
                                className="btn btn-primary"
                                style={{ padding: '4px 12px', fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                              >
                                <CheckCircle size={13} /> 출고 처리
                              </button>
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has(order.id) && (
                          <tr>
                            <td colSpan={8} style={{ backgroundColor: 'var(--bg-card)', paddingTop: '12px', borderTop: '1px dashed var(--border-color)', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', paddingLeft: '8px' }}>
                                <div style={{
                                  fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.8', textAlign: 'left',
                                  paddingLeft: '16px', borderLeft: '3px solid var(--wia-blue)',
                                }}>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>선적일자(ETD):</span> {order.etd ? new Date(order.etd).toLocaleDateString() : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>입고일자:</span> {order.current_status_changed_at ? new Date(order.current_status_changed_at).toLocaleDateString() : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>REMARK:</span> {order.remark || '-'}</div>
                                </div>
                                <div style={{
                                  fontSize: '12px', color: 'var(--text-secondary)', lineHeight: '1.8', textAlign: 'left',
                                  paddingLeft: '16px', borderLeft: '3px solid var(--wia-blue)',
                                }}>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>DETAIL SPEC:</span> {order.detail_spec || '-'}</div>
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
                <h3 style={{ margin: 0 }}>타임라인 뷰 (진행 이력)</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {selectedOrderForHistory.product_model?.model_name} (S/N: {selectedOrderForHistory.serial_number || '미배정'})
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
                <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>이력 데이터가 없습니다.</div>
              )}
            </div>
            <div className="modal-footer" style={{ borderTop: '1px solid var(--border-color)', padding: '16px 20px', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={closeHistory} className="btn btn-outline">닫기</button>
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
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>P/O 번호</label>
                    <input type="text" value={editForm.reference_no} onChange={e => setEditForm({ ...editForm, reference_no: e.target.value })} placeholder="P/O 번호" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>NC</label>
                    <input type="text" value={editForm.nc} onChange={e => setEditForm({ ...editForm, nc: e.target.value })} placeholder="NC" style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>딜러사</label>
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.incoterms', '인코텀즈')}</label>
                    <input type="text" value={editForm.incoterms} onChange={e => setEditForm({ ...editForm, incoterms: e.target.value })} placeholder={t('menu1.edit_modal.incoterms_placeholder', '인코텀즈 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>{t('menu1.edit_modal.vessel', '선박명')}</label>
                    <input type="text" value={editForm.vessel} onChange={e => setEditForm({ ...editForm, vessel: e.target.value })} placeholder={t('menu1.edit_modal.vessel_placeholder', '선박명 입력')} style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)' }} />
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
