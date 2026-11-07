import React, { useState, useEffect } from 'react';
import { Search, Download, Edit, Archive, X, Calendar, CheckCircle2, Clock, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AdminSalesArchive({ isMobileView }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);

  // Master data for edit modal
  const [models, setModels] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [ncCodes, setNcCodes] = useState([]);
  const [incotermCodes, setIncotermCodes] = useState([]);
  const [portCodes, setPortCodes] = useState([]);

  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [pickupFilter, setPickupFilter] = useState('ALL'); // 'ALL' | 'PICKED_UP' | 'PENDING_PICKUP'

  const [editingOrder, setEditingOrder] = useState(null);
  const [editForm, setEditForm] = useState({
    product_model_id: '',
    reference_no: '',
    nc: '',
    dealer_company_id: '',
    serial_number: '',
    so_no: '',
    dealer_order_date: '',
    sales_price: '',
    price: '',
    sales_month: '',
    pickup_date: '',
    destination_port: '',
    detail_spec: '',
    incoterms: '',
    vessel: '',
    remark: ''
  });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [ordersRes, modelsRes, dealersRes, ncRes, incotermRes, portRes] = await Promise.all([
        fetch('/api/orders?sales_archive=true'),
        fetch('/api/models'),
        fetch('/api/dealers'),
        fetch('/api/master-data/nc-codes'),
        fetch('/api/master-data/incoterm-codes'),
        fetch('/api/master-data/port-codes')
      ]);
      const data = await ordersRes.json();
      const modelsData = await modelsRes.json();
      if (Array.isArray(data)) setOrders(data);
      if (Array.isArray(modelsData)) setModels(modelsData);
      setDealers(await dealersRes.json());
      setNcCodes(await ncRes.json());
      setIncotermCodes(await incotermRes.json());
      setPortCodes(await portRes.json());
    } catch (err) {
      console.error("Failed to fetch data:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchSoldOrdersOnly = async () => {
    try {
      const res = await fetch('/api/orders?sales_archive=true');
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error("Failed to fetch sold orders:", err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Format Helper Functions
  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, '0');
      const dd = String(d.getDate()).padStart(2, '0');
      return `${yyyy}.${mm}.${dd}`;
    } catch {
      return String(dateStr);
    }
  };

  const formatPrice = (val) => {
    if (!val && val !== 0) return '-';
    const clean = String(val).replace(/[^0-9.-]+/g, '');
    const num = parseFloat(clean);
    if (isNaN(num)) return String(val);
    return `€ ${num.toLocaleString()}`;
  };

  const handleExportCSV = () => {
    if (orders.length === 0) return;

    const headers = [
      '*', '딜러', '모델', 'S/N', 'P/O', 'NC', '주문일자',
      '판매가(€)', '구매가(€)', '매출월', '출고/픽업'
    ];
    const rows = sortedOrders.map((order, idx) => [
      idx + 1,
      `"${(order.dealer_company?.name || '-').replace(/"/g, '""')}"`,
      `"${(order.product_model?.model_name || '-').replace(/"/g, '""')}"`,
      `"${(order.serial_number || '-').replace(/"/g, '""')}"`,
      `"${(order.reference_no || '-').replace(/"/g, '""')}"`,
      `"${(order.nc || '-').replace(/"/g, '""')}"`,
      order.dealer_order_date ? formatDate(order.dealer_order_date) : (order.created_at ? formatDate(order.created_at) : '-'),
      order.sales_price ? `"${formatPrice(order.sales_price)}"` : '-',
      order.price ? `"${formatPrice(order.price)}"` : '-',
      order.sales_month || '-',
      order.pickup_date ? formatDate(order.pickup_date) : '-'
    ]);

    let csvContent = "data:text/csv;charset=utf-8,﻿"
      + headers.join(",") + "\n"
      + rows.map(e => e.join(",")).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `sales_list_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Filtering
  const filteredOrders = orders.filter(o => {
    // 1. Pickup filter (ALL | PICKED_UP | PENDING_PICKUP)
    const isPickedUp = !!o.pickup_date;
    if (pickupFilter === 'PICKED_UP' && !isPickedUp) return false;
    if (pickupFilter === 'PENDING_PICKUP' && isPickedUp) return false;

    // 2. Search query filter
    if (!searchQuery) return true;
    const s = searchQuery.toLowerCase().trim();
    const sn = (o.serial_number || '').toLowerCase();
    const mn = (o.product_model?.model_name || '').toLowerCase();
    const dn = (o.dealer_company?.name || '').toLowerCase();
    const po = (o.reference_no || '').toLowerCase();
    const nc = (o.nc || '').toLowerCase();
    const sm = (o.sales_month || '').toLowerCase();
    return sn.includes(s) || mn.includes(s) || dn.includes(s) || po.includes(s) || nc.includes(s) || sm.includes(s);
  });

  // Sorting
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
      case 'dealer':
        valA = a.dealer_company?.name || '';
        valB = b.dealer_company?.name || '';
        break;
      case 'model':
        valA = a.product_model?.model_name || '';
        valB = b.product_model?.model_name || '';
        break;
      case 'sn':
        valA = a.serial_number || '';
        valB = b.serial_number || '';
        break;
      case 'po':
        valA = a.reference_no || '';
        valB = b.reference_no || '';
        break;
      case 'nc':
        valA = a.nc || '';
        valB = b.nc || '';
        break;
      case 'order_date': {
        const timeA = new Date(a.dealer_order_date || a.created_at || 0).getTime();
        const timeB = new Date(b.dealer_order_date || b.created_at || 0).getTime();
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      }
      case 'sales_price': {
        const numA = parseFloat(String(a.sales_price || '').replace(/[^0-9.-]+/g, '')) || 0;
        const numB = parseFloat(String(b.sales_price || '').replace(/[^0-9.-]+/g, '')) || 0;
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }
      case 'buying_price': {
        const numA = parseFloat(String(a.price || '').replace(/[^0-9.-]+/g, '')) || 0;
        const numB = parseFloat(String(b.price || '').replace(/[^0-9.-]+/g, '')) || 0;
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }
      case 'sales_month':
        valA = a.sales_month || '';
        valB = b.sales_month || '';
        break;
      case 'pickup': {
        const timeA = a.pickup_date ? new Date(a.pickup_date).getTime() : 0;
        const timeB = b.pickup_date ? new Date(b.pickup_date).getTime() : 0;
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      }
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
          transition: 'all 0.15s ease',
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
          gap: '4px'
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

  // Edit Modal Handlers
  const openEditModal = (order) => {
    setEditingOrder(order);
    setEditForm({
      product_model_id: order.product_model_id || '',
      reference_no: order.reference_no || '',
      nc: order.nc || '',
      dealer_company_id: order.dealer_company_id || '',
      serial_number: order.serial_number || '',
      so_no: order.so_no || '',
      dealer_order_date: order.dealer_order_date ? order.dealer_order_date.slice(0, 10) : '',
      sales_price: order.sales_price || '',
      price: order.price || '',
      sales_month: order.sales_month || '',
      pickup_date: order.pickup_date ? order.pickup_date.slice(0, 10) : '',
      destination_port: order.destination_port || '',
      detail_spec: order.detail_spec || '',
      incoterms: order.incoterms || '',
      vessel: order.vessel || '',
      remark: order.remark || ''
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        product_model_id: editForm.product_model_id ? parseInt(editForm.product_model_id, 10) : null,
        reference_no: editForm.reference_no,
        nc: editForm.nc,
        dealer_company_id: editForm.dealer_company_id ? parseInt(editForm.dealer_company_id, 10) : null,
        serial_number: editForm.serial_number,
        so_no: editForm.so_no,
        dealer_order_date: editForm.dealer_order_date ? new Date(editForm.dealer_order_date).toISOString() : null,
        sales_price: editForm.sales_price,
        price: editForm.price,
        sales_month: editForm.sales_month,
        pickup_date: editForm.pickup_date ? new Date(editForm.pickup_date).toISOString() : null,
        destination_port: editForm.destination_port,
        detail_spec: editForm.detail_spec,
        incoterms: editForm.incoterms,
        vessel: editForm.vessel,
        remark: editForm.remark
      };

      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        alert(t('menu1.update_success', '저장되었습니다.'));
        setEditingOrder(null);
        fetchSoldOrdersOnly();
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(errData.detail || t('menu1.update_fail', '저장 실패'));
      }
    } catch (err) {
      console.error(err);
      alert(t('menu1.update_error', '오류 발생'));
    }
  };

  // Helper buttons for Edit Modal
  const setTodayPickup = () => {
    const today = new Date().toISOString().slice(0, 10);
    setEditForm(prev => ({ ...prev, pickup_date: today }));
  };

  const clearPickupDate = () => {
    setEditForm(prev => ({ ...prev, pickup_date: '' }));
  };

  const setCurrentMonth = () => {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    setEditForm(prev => ({ ...prev, sales_month: `${yyyy}.${mm}` }));
  };

  // Stats calculation
  const totalCount = orders.length;
  const pickedUpCount = orders.filter(o => !!o.pickup_date).length;
  const pendingPickupCount = orders.filter(o => !o.pickup_date).length;

  return (
    <div className="page-body">
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('menu4.page_title', '판매 목록')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {t('menu4.page_desc', '매출 확정 장비 및 출고/픽업 현황을 통합 관리합니다.')}
          </p>
        </div>
      </div>

      <div className="glass-card no-hover-bg" style={{ padding: '28px', marginBottom: '32px' }}>
        {/* Top Controls: Title, Search, Filters, Sort, Export */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px', margin: 0 }}>
              <Archive size={20} color="var(--accent-blue)" />
              <span>{t('menu4.list_title', '매출 확정 장비')}</span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder={t('menu4.search_placeholder', '검색 (모델, S/N, P/O, 딜러, 매출월...)')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 14px 8px 36px', borderRadius: '10px', fontSize: '0.85rem', width: '250px', outline: 'none'
                }}
              />
            </div>

            {/* Pickup / Pre-sale Status Filter */}
            <select
              value={pickupFilter}
              onChange={e => setPickupFilter(e.target.value)}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer', outline: 'none'
              }}
            >
              <option value="ALL">{t('menu4.filter_pickup_all', '전체 출고/픽업 상태')}</option>
              <option value="PICKED_UP">{t('menu4.filter_picked_up', '출고/픽업 완료')}</option>
              <option value="PENDING_PICKUP">{t('menu4.filter_pending_pickup', '출고/픽업 대기 (선매출)')}</option>
            </select>

            {/* Sort Dropdown */}
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
              title="정렬 기준"
            >
              <option value="">기본 정렬</option>
              <option value="dealer_asc">{t('menu4.header_dealer', '딜러')} ▲</option>
              <option value="dealer_desc">{t('menu4.header_dealer', '딜러')} ▼</option>
              <option value="model_asc">{t('menu4.header_model', '모델')} ▲ (오름차순)</option>
              <option value="model_desc">{t('menu4.header_model', '모델')} ▼ (내림차순)</option>
              <option value="sn_asc">{t('menu4.header_sn', 'S/N')} ▲</option>
              <option value="sn_desc">{t('menu4.header_sn', 'S/N')} ▼</option>
              <option value="po_asc">{t('menu4.header_po', 'P/O')} ▲</option>
              <option value="po_desc">{t('menu4.header_po', 'P/O')} ▼</option>
              <option value="nc_asc">{t('menu4.header_nc', 'NC')} ▲</option>
              <option value="nc_desc">{t('menu4.header_nc', 'NC')} ▼</option>
              <option value="order_date_asc">{t('menu4.header_order_date', '주문일자')} ▲ (과거순)</option>
              <option value="order_date_desc">{t('menu4.header_order_date', '주문일자')} ▼ (최신순)</option>
              <option value="sales_price_asc">{t('menu4.header_sales_price', '판매가')} ▲ (낮은순)</option>
              <option value="sales_price_desc">{t('menu4.header_sales_price', '판매가')} ▼ (높은순)</option>
              <option value="buying_price_asc">{t('menu4.header_buying_price', '구매가')} ▲ (낮은순)</option>
              <option value="buying_price_desc">{t('menu4.header_buying_price', '구매가')} ▼ (높은순)</option>
              <option value="sales_month_asc">{t('menu4.header_sales_month', '매출월')} ▲</option>
              <option value="sales_month_desc">{t('menu4.header_sales_month', '매출월')} ▼</option>
              <option value="pickup_asc">{t('menu4.header_pickup', '출고/픽업')} ▲</option>
              <option value="pickup_desc">{t('menu4.header_pickup', '출고/픽업')} ▼</option>
            </select>

            {/* CSV Export Button */}
            <button onClick={handleExportCSV} className="btn btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', borderRadius: '10px', fontSize: '0.85rem' }}>
              <Download size={16} /> Excel Export
            </button>
          </div>
        </div>

        {/* Status Stat Bar */}
        <div style={{
          marginBottom: '20px', padding: '14px 22px', backgroundColor: 'var(--bg-card)',
          border: '1px solid var(--border-color)', borderRadius: '12px',
          display: 'flex', alignItems: 'center', gap: '28px', flexWrap: 'wrap',
          boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{t('menu4.stat_total', '전체')}:</span>
            <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{totalCount}대</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{t('menu4.stat_picked_up', '픽업 완료')}:</span>
            <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--status-stock, #10b981)' }}>{pickedUpCount}대</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-secondary)' }}>{t('menu4.stat_pending_pickup', '픽업 대기(선매출)')}:</span>
            <span style={{ fontSize: '1.05rem', fontWeight: 'bold', color: 'var(--accent-amber, #f59e0b)' }}>{pendingPickupCount}대</span>
          </div>
        </div>

        {/* Table Content */}
        {isMobileView ? (
          /* Mobile Card View */
          <div className="mobile-cards-grid">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</div>
            ) : sortedOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>조건에 맞는 판매 장비가 없습니다.</div>
            ) : (
              sortedOrders.map((order, idx) => {
                const isPickedUp = !!order.pickup_date;
                return (
                  <div
                    key={order.id}
                    className="mobile-order-card"
                    onClick={() => openEditModal(order)}
                    style={{ cursor: 'pointer', transition: 'all 0.15s ease' }}
                  >
                    <div className="mobile-order-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>No. {idx + 1}</span>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                          {order.product_model ? order.product_model.model_name : '-'}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '0.95rem' }}>
                        {order.reference_no || '-'}
                      </div>
                    </div>

                    <div className="mobile-order-meta" style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('menu4.header_dealer', '딜러')}:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{order.dealer_company?.name || '-'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('menu4.header_sn', 'S/N')}:</span>
                        <strong style={{ color: 'var(--text-primary)' }}>{order.serial_number || '-'}</strong>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('menu4.header_nc', 'NC')}:</span>
                        <span>{order.nc || '-'}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                        <span style={{ color: 'var(--text-muted)' }}>{t('menu4.header_order_date', '주문일자')}:</span>
                        <span>{order.dealer_order_date ? formatDate(order.dealer_order_date) : (order.created_at ? formatDate(order.created_at) : '-')}</span>
                      </div>
                    </div>

                    {/* Price Row */}
                    <div style={{
                      marginTop: '10px', paddingTop: '10px', borderTop: '1px dashed var(--border-color)',
                      display: 'flex', justifyContent: 'space-between', fontSize: '0.88rem'
                    }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('menu4.header_sales_price', '판매가')}: </span>
                        <strong style={{ color: 'var(--text-primary)' }}>{formatPrice(order.sales_price)}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('menu4.header_buying_price', '구매가')}: </span>
                        <span style={{ color: 'var(--text-secondary)' }}>{formatPrice(order.price)}</span>
                      </div>
                    </div>

                    {/* Sales Month & Pickup Status Row */}
                    <div style={{
                      marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed var(--border-color)',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.85rem'
                    }}>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('menu4.header_sales_month', '매출월')}: </span>
                        <strong style={{ color: 'var(--wia-blue)' }}>{order.sales_month || '-'}</strong>
                      </div>
                      <div>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{t('menu4.header_pickup', '출고/픽업')}: </span>
                        {isPickedUp ? (
                          <strong style={{ color: 'var(--status-stock, #10b981)' }}>{formatDate(order.pickup_date)}</strong>
                        ) : (
                          <span style={{ color: 'var(--accent-amber, #f59e0b)', fontWeight: 600 }}>{t('menu4.stat_pending_pickup', '미출고 (선매출)')}</span>
                        )}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginTop: '12px' }} onClick={e => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => openEditModal(order)}
                        className="btn btn-outline"
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                      >
                        <Edit size={14} /> 정보 수정
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : (
          /* Desktop Table View */
          <div className="data-table-container full-bleed">
            <table className="data-table">
              <thead>
                <tr>
                  {/* Exact Column Order as Requested:
                      * - 딜러 - 모델 - S/N - P/O - NC - 주문일자 - 판매가 - 구매가 - 매출월 - 출고/픽업 */}
                  <th 
                    style={{ width: '3%', textAlign: 'center', fontWeight: 'bold', cursor: 'pointer', userSelect: 'none' }}
                    onClick={() => setSortConfig({ key: null, direction: 'asc' })}
                    title="기본 순서로 리셋"
                  >
                    {t('menu4.header_no', '*')}
                  </th>
                  {renderSortHeader('dealer', t('menu4.header_dealer', '딜러'), '10%', 'center')}
                  {renderSortHeader('model', t('menu4.header_model', '모델'), '11%', 'center')}
                  {renderSortHeader('sn', t('menu4.header_sn', 'S/N'), '10%', 'center')}
                  {renderSortHeader('po', t('menu4.header_po', 'P/O'), '10%', 'center')}
                  {renderSortHeader('nc', t('menu4.header_nc', 'NC'), '6%', 'center')}
                  {renderSortHeader('order_date', t('menu4.header_order_date', '주문일자'), '9%', 'center')}
                  {renderSortHeader('sales_price', t('menu4.header_sales_price', '판매가'), '9%', 'right')}
                  {renderSortHeader('buying_price', t('menu4.header_buying_price', '구매가'), '9%', 'right')}
                  {renderSortHeader('sales_month', t('menu4.header_sales_month', '매출월'), '10%', 'center')}
                  {renderSortHeader('pickup', t('menu4.header_pickup', '출고/픽업'), '13%', 'center')}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</td></tr>
                ) : sortedOrders.length === 0 ? (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>조건에 맞는 판매 장비가 없습니다.</td></tr>
                ) : (
                  sortedOrders.map((order, index) => {
                    const isPickedUp = !!order.pickup_date;
                    return (
                      <tr
                        key={order.id}
                        onClick={() => openEditModal(order)}
                        style={{ cursor: 'pointer', transition: 'background-color 0.15s ease' }}
                        className="sales-table-row"
                        title={t('menu4.tooltip_edit', '클릭하여 장비 및 판매/출고 정보 수정')}
                      >
                        {/* 1. * (번호) */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 4px' }}>
                          <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                        </td>

                        {/* 2. 딜러 */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                          <div style={{ fontWeight: 600, fontSize: '12px' }}>{order.dealer_company ? order.dealer_company.name : '-'}</div>
                        </td>

                        {/* 3. 모델 */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                          <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
                            {order.product_model ? order.product_model.model_name : '-'}
                          </div>
                        </td>

                        {/* 4. S/N */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>{order.serial_number || '-'}</div>
                        </td>

                        {/* 5. P/O */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                          <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11.5px' }}>{order.reference_no || '-'}</div>
                        </td>

                        {/* 6. NC */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 4px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{order.nc || '-'}</div>
                        </td>

                        {/* 7. 주문일자 */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                            {order.dealer_order_date ? formatDate(order.dealer_order_date) : (order.created_at ? formatDate(order.created_at) : '-')}
                          </div>
                        </td>

                        {/* 8. 판매가 */}
                        <td style={{ textAlign: 'right', verticalAlign: 'middle', padding: '8px 10px' }}>
                          <div style={{ fontWeight: 700, fontSize: '12px', color: 'var(--text-primary)' }}>
                            {formatPrice(order.sales_price)}
                          </div>
                        </td>

                        {/* 9. 구매가 */}
                        <td style={{ textAlign: 'right', verticalAlign: 'middle', padding: '8px 10px' }}>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                            {formatPrice(order.price)}
                          </div>
                        </td>

                        {/* 10. 매출월 */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 6px' }}>
                          {order.sales_month ? (
                            <span style={{
                              fontWeight: 700,
                              fontSize: '11.5px',
                              color: 'var(--wia-blue)',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: 'rgba(2, 132, 199, 0.08)'
                            }}>
                              {order.sales_month}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--text-muted)' }}>-</span>
                          )}
                        </td>

                        {/* 11. 출고/픽업 */}
                        <td style={{ textAlign: 'center', verticalAlign: 'middle', padding: '8px 8px' }}>
                          {isPickedUp ? (
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontWeight: 600,
                              fontSize: '11.5px',
                              color: 'var(--status-stock, #10b981)',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              background: 'hsla(142, 76%, 46%, 0.1)'
                            }}>
                              <CheckCircle2 size={12} />
                              {formatDate(order.pickup_date)}
                            </span>
                          ) : (
                            <span
                              style={{
                                color: 'var(--text-muted)',
                                fontWeight: 700,
                                fontSize: '13px',
                                display: 'inline-block',
                                padding: '2px 10px'
                              }}
                              title={t('menu4.tooltip_pre_sale', '선매출 (미출고) - 클릭하여 픽업일자 등록')}
                            >
                              -
                            </span>
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

      {/* Edit Modal */}
      {editingOrder && (
        <div className="modal-overlay" onClick={() => setEditingOrder(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '640px', width: '92%' }}>
            <div className="modal-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '16px' }}>
              <div>
                <h2 style={{ fontSize: '1.25rem', margin: 0, color: 'var(--text-primary)' }}>
                  {t('menu1.edit_modal.title', '장비 및 판매 정보 수정')}
                </h2>
                <div style={{ fontSize: '0.85rem', color: 'var(--accent-cyan)', fontWeight: 600, marginTop: '2px' }}>
                  P/O: {editingOrder.reference_no} {editingOrder.serial_number ? `| S/N: ${editingOrder.serial_number}` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingOrder(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', padding: '4px' }}
              >
                <X size={24} />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '20px 0', maxHeight: '70vh', overflowY: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  
                  {/* Row 1: Dealer & Model */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.header_dealer', '딜러')}
                    </label>
                    <select
                      value={editForm.dealer_company_id}
                      onChange={e => setEditForm({ ...editForm, dealer_company_id: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- 딜러 선택 --</option>
                      {dealers.map(d => (
                        <option key={d.id} value={d.id}>{d.name}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.header_model', '모델명')}
                    </label>
                    <select
                      value={editForm.product_model_id}
                      onChange={e => setEditForm({ ...editForm, product_model_id: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- 모델 선택 --</option>
                      {models.map(m => (
                        <option key={m.id} value={m.id}>{m.model_code || m.model_name}</option>
                      ))}
                    </select>
                  </div>

                  {/* Row 2: S/N & P/O */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.header_sn', 'S/N')}
                    </label>
                    <input
                      type="text"
                      value={editForm.serial_number}
                      onChange={e => setEditForm({ ...editForm, serial_number: e.target.value })}
                      placeholder={t('menu1.edit_modal.sn_placeholder', 'S/N 입력')}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.header_po', 'P/O')}
                    </label>
                    <input
                      type="text"
                      value={editForm.reference_no}
                      onChange={e => setEditForm({ ...editForm, reference_no: e.target.value })}
                      placeholder="P/O 번호"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  {/* Row 3: NC & 주문일자 */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.header_nc', 'NC')}
                    </label>
                    <select
                      value={editForm.nc}
                      onChange={e => setEditForm({ ...editForm, nc: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- NC 선택 --</option>
                      {ncCodes.map(nc => (
                        <option key={nc.nc_code} value={nc.nc_code}>{nc.nc_code}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.header_order_date', '주문일자')}
                    </label>
                    <input
                      type="date"
                      value={editForm.dealer_order_date}
                      onChange={e => setEditForm({ ...editForm, dealer_order_date: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  {/* Row 4: 판매가 & 구매가 */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.label_sales_price', '판매가(€)')}
                    </label>
                    <input
                      type="text"
                      value={editForm.sales_price}
                      onChange={e => setEditForm({ ...editForm, sales_price: e.target.value })}
                      placeholder="판매가 (예: 150000)"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                      {t('menu4.label_buying_price', '구매가(€)')}
                    </label>
                    <input
                      type="text"
                      value={editForm.price}
                      onChange={e => setEditForm({ ...editForm, price: e.target.value })}
                      placeholder="구매가 (예: 65000)"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  {/* Row 5: 매출월 & 출고/픽업 */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {t('menu4.label_sales_month', '매출월 (인보이스 발행월)')}
                      </label>
                      <button
                        type="button"
                        onClick={setCurrentMonth}
                        style={{ background: 'none', border: 'none', color: 'var(--wia-blue)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                      >
                        [{t('menu4.btn_quick_sales_month', '이번 달')}]
                      </button>
                    </div>
                    <input
                      type="text"
                      value={editForm.sales_month}
                      onChange={e => setEditForm({ ...editForm, sales_month: e.target.value })}
                      placeholder="예: 2026.11"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                      <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                        {t('menu4.label_pickup_date', '출고/픽업 일자')}
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={setTodayPickup}
                          style={{ background: 'none', border: 'none', color: 'var(--status-stock, #10b981)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                        >
                          [{t('menu4.btn_quick_pickup_today', '오늘 픽업')}]
                        </button>
                        {editForm.pickup_date && (
                          <button
                            type="button"
                            onClick={clearPickupDate}
                            style={{ background: 'none', border: 'none', color: 'var(--accent-amber, #f59e0b)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                          >
                            [초기화]
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      type="date"
                      value={editForm.pickup_date}
                      onChange={e => setEditForm({ ...editForm, pickup_date: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                      * 미출고(선매출) 상태인 경우 비워두면 '-'로 표기됩니다.
                    </div>
                  </div>

                  {/* Row 6: S/O & Port */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>S/O</label>
                    <input
                      type="text"
                      value={editForm.so_no}
                      onChange={e => setEditForm({ ...editForm, so_no: e.target.value })}
                      placeholder="S/O 번호"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Port</label>
                    <select
                      value={editForm.destination_port}
                      onChange={e => setEditForm({ ...editForm, destination_port: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- 항구 선택 --</option>
                      {portCodes.map(port => (
                        <option key={port.port_code} value={port.port_code}>{port.port_code}</option>
                      ))}
                    </select>
                  </div>

                  {/* Row 7: Detail Spec */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>DETAIL SPEC</label>
                    <input
                      type="text"
                      value={editForm.detail_spec}
                      onChange={e => setEditForm({ ...editForm, detail_spec: e.target.value })}
                      placeholder="상세 스펙"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  {/* Row 8: Incoterms & Vessel */}
                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Incoterms</label>
                    <select
                      value={editForm.incoterms}
                      onChange={e => setEditForm({ ...editForm, incoterms: e.target.value })}
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    >
                      <option value="">-- Incoterms 선택 --</option>
                      {incotermCodes.map(term => (
                        <option key={term.incoterm_code} value={term.incoterm_code}>{term.incoterm_code}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>VESSEL</label>
                    <input
                      type="text"
                      value={editForm.vessel}
                      onChange={e => setEditForm({ ...editForm, vessel: e.target.value })}
                      placeholder="선박명"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none' }}
                    />
                  </div>

                  {/* Row 9: Remark */}
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={{ display: 'block', marginBottom: '6px', fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>REMARK</label>
                    <textarea
                      value={editForm.remark}
                      onChange={e => setEditForm({ ...editForm, remark: e.target.value })}
                      placeholder="비고 작성"
                      style={{ width: '100%', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border-color)', background: 'var(--bg-input)', color: 'var(--text-primary)', outline: 'none', resize: 'vertical', minHeight: '60px' }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <button type="button" onClick={() => setEditingOrder(null)} className="btn btn-outline" style={{ padding: '8px 16px', fontSize: '0.85rem' }}>
                  {t('menu1.edit_modal.cancel', '취소')}
                </button>
                <button type="submit" className="btn btn-primary" style={{ padding: '8px 18px', fontSize: '0.85rem' }}>
                  {t('menu1.edit_modal.save', '저장')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Scoped CSS for hover effects */}
      <style>{`
        .sortable-th:hover {
          background-color: var(--bg-secondary) !important;
          color: var(--wia-blue) !important;
        }
        .sales-table-row:hover {
          background-color: var(--bg-secondary) !important;
        }
      `}</style>
    </div>
  );
}
