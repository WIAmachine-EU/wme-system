import React, { useState, useEffect } from 'react';
import { Search, Package, CheckCircle2, Calendar, AlertCircle, X, Edit2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export default function AdminInventory({ isMobileView }) {
  const { t } = useTranslation();
  const [orders, setOrders] = useState([]);
  const [dealers, setDealers] = useState([]);
  const [portCodes, setPortCodes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [stockTypeFilter, setStockTypeFilter] = useState('ALL');
  const [pendingChanges, setPendingChanges] = useState({});

  // 임대 기간 모달 상태
  const [rentalModalOpen, setRentalModalOpen] = useState(false);
  const [rentalOrder, setRentalOrder] = useState(null);
  const [rentalDealerId, setRentalDealerId] = useState('');
  const [rentalStartDate, setRentalStartDate] = useState('');
  const [rentalEndDate, setRentalEndDate] = useState('');
  const [isRentalEditMode, setIsRentalEditMode] = useState(false);
  const [savingRental, setSavingRental] = useState(false);

  const [expandedRows, setExpandedRows] = useState(new Set());

  const formatDateToYYYYMMDD = (dateVal) => {
    if (!dateVal) return '';
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const formatRentalPeriod = (startDate, endDate) => {
    if (!startDate && !endDate) return '미설정';
    const startStr = startDate ? new Date(startDate).toLocaleDateString() : '';
    const endStr = endDate ? new Date(endDate).toLocaleDateString() : '';
    if (startStr && endStr) return `${startStr} ~ ${endStr}`;
    if (endStr) return `~ ${endStr}`;
    return `${startStr} ~`;
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

  const fetchInventory = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/orders?is_corporate_stock=true');
      const data = await res.json();
      if (Array.isArray(data)) {
        setOrders(data);
      }
    } catch (err) {
      console.error("Failed to fetch inventory:", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDealersAndPorts = async () => {
    try {
      const [dealersRes, portsRes] = await Promise.all([
        fetch('/api/dealers'),
        fetch('/api/master-data/port-codes')
      ]);
      const data = await dealersRes.json();
      if (Array.isArray(data)) {
        setDealers(data);
      }
      setPortCodes(await portsRes.json());
    } catch (err) {
      console.error("Failed to fetch dealers or ports:", err);
    }
  };

  useEffect(() => {
    fetchInventory();
    fetchDealersAndPorts();
  }, []);

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

  const handlePendingChange = (orderId, field, value) => {
    setPendingChanges(prev => ({
      ...prev,
      [orderId]: {
        ...prev[orderId],
        [field]: value
      }
    }));
  };

  const handleUpdateStockType = async (orderId, newType) => {
    try {
      const res = await fetch(`/api/orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stock_type: newType })
      });
      if (res.ok) {
        alert(`장비 ID ${orderId}의 용도가 ${newType}으로 변경되었습니다.`);
        return true;
      } else {
        const errorData = await res.json();
        alert(`용도 변경 실패: ${errorData.detail || "알 수 없는 오류"}`);
        return false;
      }
    } catch (err) {
      console.error("Failed to update stock type:", err);
      alert("용도 변경 중 오류가 발생했습니다.");
      return false;
    }
  };

  const handleAssignDealer = async (orderId, dealerId) => {
    if (!dealerId) return;
    try {
      const res = await fetch(`/api/orders/${orderId}/assign-dealer`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dealer_company_id: parseInt(dealerId) })
      });
      if (res.ok) {
        alert("딜러 발주로 변경되었습니다.");
        return true;
      } else {
        const errorData = await res.json();
        alert(`변경 실패: ${errorData.detail || "알 수 없는 오류"}`);
        return false;
      }
    } catch (err) {
      console.error("Failed to assign dealer:", err);
      alert("변경 중 오류가 발생했습니다.");
      return false;
    }
  };

  const handleConfirmChanges = async (orderId) => {
    const changes = pendingChanges[orderId];
    if (!changes) return;

    const order = orders.find(o => o.id === orderId);
    if (!order) return;

    const effectiveStockType = changes.stockType !== undefined ? changes.stockType : (order.stock_type || 'AVAILABLE');
    const effectiveDealerId = changes.dealerId !== undefined ? changes.dealerId : order.dealer_company_id;

    // 만약 상태가 '임대'(RENTAL)인 경우 -> 팝업 모달창을 띄워 일정 입력 진행
    if (effectiveStockType === 'RENTAL') {
      if (!effectiveDealerId) {
        alert("임대를 진행할 딜러를 선택해 주세요.");
        return;
      }
      setRentalOrder(order);
      setRentalDealerId(effectiveDealerId);

      const today = new Date();
      const defaultStart = order.rental_start_date ? formatDateToYYYYMMDD(order.rental_start_date) : formatDateToYYYYMMDD(today);
      let defaultEnd = '';
      if (order.rental_expiry_date) {
        defaultEnd = formatDateToYYYYMMDD(order.rental_expiry_date);
      } else {
        const sixMonthsLater = new Date(today);
        sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
        defaultEnd = formatDateToYYYYMMDD(sixMonthsLater);
      }
      setRentalStartDate(defaultStart);
      setRentalEndDate(defaultEnd);
      setIsRentalEditMode(false);
      setRentalModalOpen(true);
      return;
    }

    if (changes.dealerId || changes.stockType) {
      if (!window.confirm("선택한 내용으로 변경을 확정하시겠습니까?")) return;
    }

    let success = true;
    if (changes.dealerId) {
      success = await handleAssignDealer(orderId, changes.dealerId);
    }
    if (success && changes.stockType) {
      success = await handleUpdateStockType(orderId, changes.stockType);
    }

    if (success) {
      setPendingChanges(prev => {
        const next = { ...prev };
        delete next[orderId];
        return next;
      });
      fetchInventory(); // 목록 새로고침
    }
  };

  // 상세내역에서 [기간수정] 버튼 클릭 시 모달 열기
  const handleOpenRentalModalForEdit = (order) => {
    setRentalOrder(order);
    setRentalDealerId(order.dealer_company_id ? String(order.dealer_company_id) : '');

    const today = new Date();
    const defaultStart = order.rental_start_date ? formatDateToYYYYMMDD(order.rental_start_date) : formatDateToYYYYMMDD(today);
    let defaultEnd = '';
    if (order.rental_expiry_date) {
      defaultEnd = formatDateToYYYYMMDD(order.rental_expiry_date);
    } else {
      const sixMonthsLater = new Date(today);
      sixMonthsLater.setMonth(sixMonthsLater.getMonth() + 6);
      defaultEnd = formatDateToYYYYMMDD(sixMonthsLater);
    }
    setRentalStartDate(defaultStart);
    setRentalEndDate(defaultEnd);
    setIsRentalEditMode(true);
    setRentalModalOpen(true);
  };

  // 빠른 기간 프리셋 버튼
  const handleQuickPeriod = (months) => {
    const start = rentalStartDate ? new Date(rentalStartDate) : new Date();
    const end = new Date(start);
    end.setMonth(end.getMonth() + months);
    if (!rentalStartDate) {
      setRentalStartDate(formatDateToYYYYMMDD(start));
    }
    setRentalEndDate(formatDateToYYYYMMDD(end));
  };

  // 팝업 모달에서 [임대기간 확정] 클릭 시 저장
  const handleSaveRentalPeriod = async () => {
    if (!rentalOrder) return;
    if (!rentalStartDate || !rentalEndDate) {
      alert("임대 시작일과 종료일을 모두 입력(달력 선택)해 주세요.");
      return;
    }
    if (new Date(rentalStartDate) > new Date(rentalEndDate)) {
      alert("임대 종료일은 시작일보다 이후여야 합니다.");
      return;
    }

    setSavingRental(true);
    try {
      const payload = {
        stock_type: 'RENTAL',
        rental_start_date: new Date(rentalStartDate).toISOString(),
        rental_expiry_date: new Date(rentalEndDate).toISOString()
      };
      if (rentalDealerId) {
        payload.dealer_company_id = parseInt(rentalDealerId);
      }

      const res = await fetch(`/api/orders/${rentalOrder.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        alert(isRentalEditMode ? "임대 기간이 수정되었습니다." : "임대 상태 및 임대 기간 설정이 완료되었습니다.");
        setPendingChanges(prev => {
          const next = { ...prev };
          delete next[rentalOrder.id];
          return next;
        });
        setRentalModalOpen(false);
        setRentalOrder(null);
        fetchInventory();
      } else {
        const errorData = await res.json();
        alert(`저장 실패: ${errorData.detail || "알 수 없는 오류"}`);
      }
    } catch (err) {
      console.error("Failed to save rental period:", err);
      alert("임대 기간 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingRental(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    const query = searchQuery.toLowerCase();
    const matchesQuery = (o.reference_no && o.reference_no.toLowerCase().includes(query)) ||
      (o.nc && o.nc.toLowerCase().includes(query)) ||
      (o.product_model && o.product_model.model_name && o.product_model.model_name.toLowerCase().includes(query)) ||
      (o.serial_number && o.serial_number.toLowerCase().includes(query)) ||
      (o.detail_spec && o.detail_spec.toLowerCase().includes(query));

    const sType = o.stock_type || 'AVAILABLE';
    const matchesType = stockTypeFilter === 'ALL' || sType === stockTypeFilter;

    return matchesQuery && matchesType;
  });

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
      case 'price': {
        const numA = Number(a.price) || 0;
        const numB = Number(b.price) || 0;
        return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
      }
      case 'po':
        valA = a.reference_no || '';
        valB = b.reference_no || '';
        break;
      case 'detail_spec':
        valA = a.detail_spec || '';
        valB = b.detail_spec || '';
        break;
      case 'eta': {
        const timeA = a.eta ? new Date(a.eta).getTime() : 0;
        const timeB = b.eta ? new Date(b.eta).getTime() : 0;
        return sortConfig.direction === 'asc' ? timeA - timeB : timeB - timeA;
      }
      case 'port':
        valA = getStandardPort(a.destination_port) || '';
        valB = getStandardPort(b.destination_port) || '';
        break;
      case 'stock_type':
        valA = pendingChanges[a.id]?.stockType || a.stock_type || 'AVAILABLE';
        valB = pendingChanges[b.id]?.stockType || b.stock_type || 'AVAILABLE';
        break;
      case 'dealer':
        valA = a.dealer_company?.name || '';
        valB = b.dealer_company?.name || '';
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('menu2.page_title', '유럽 재고 상태')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {t('menu2.page_desc', 'WIA 유럽법인의 가용 재고(ATP) 현황을 파악 할 수 있습니다.')}
          </p>
        </div>
      </div>

      <div className="glass-card no-hover-bg" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={20} color="var(--status-stock)" />
              <span>{t('menu2.inventory_list_title', '법인 가용재고 목록')}</span>
            </h2>
          </div>

          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder={t('menu2.search_placeholder', '검색')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                  padding: '8px 14px 8px 36px', borderRadius: '10px', fontSize: '0.85rem', width: '240px'
                }}
              />
            </div>
            <select
              value={stockTypeFilter}
              onChange={e => setStockTypeFilter(e.target.value)}
              style={{
                background: 'var(--bg-input)', border: '1px solid var(--border-color)', color: 'var(--text-primary)',
                padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer'
              }}
            >
              <option value="ALL">{t('menu2.filter_all', '전체 상태 조회')}</option>
              <option value="AVAILABLE">{t('menu2.type_available', '판매가능')}</option>
              <option value="DEALER_ORDER">{t('menu2.type_dealer_order', '딜러주문')}</option>
              <option value="RENTAL">{t('menu2.type_rental', '임대')}</option>
              <option value="SHOWROOM">{t('menu2.type_showroom', '전시')}</option>
              <option value="PROMOTION">{t('menu2.type_promotion', '프로모션')}</option>
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
                padding: '8px 14px', borderRadius: '10px', fontSize: '0.85rem', cursor: 'pointer'
              }}
              title="정렬 기준"
            >
              <option value="">기본 정렬</option>
              <option value="model_asc">{t('menu2.header_model', '모델')} ▲ (오름차순)</option>
              <option value="model_desc">{t('menu2.header_model', '모델')} ▼ (내림차순)</option>
              <option value="price_asc">{t('menu2.header_buying', '구매가')} ▲ (낮은순)</option>
              <option value="price_desc">{t('menu2.header_buying', '구매가')} ▼ (높은순)</option>
              <option value="eta_asc">{t('menu2.header_eta', '도착일정')} ▲ (빠른순)</option>
              <option value="eta_desc">{t('menu2.header_eta', '도착일정')} ▼ (늦은순)</option>
              <option value="po_asc">{t('menu2.header_po', '발주번호')} ▲</option>
              <option value="po_desc">{t('menu2.header_po', '발주번호')} ▼</option>
              <option value="nc_asc">{t('menu2.header_nc', 'NC')} ▲</option>
              <option value="nc_desc">{t('menu2.header_nc', 'NC')} ▼</option>
              <option value="port_asc">{t('menu2.header_port', '도착지')} ▲</option>
              <option value="port_desc">{t('menu2.header_port', '도착지')} ▼</option>
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
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('menu2.stat_all', '전체')}:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>{filteredOrders.length}</span>
          </div>
          <div style={{ height: '24px', width: '1px', backgroundColor: 'var(--border-color)' }}></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('menu2.type_available', '판매가능')}:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--status-stock)' }}>
              {filteredOrders.filter(o => (o.stock_type || 'AVAILABLE') === 'AVAILABLE').length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('menu2.type_rental', '임대')}:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--status-production)' }}>
              {filteredOrders.filter(o => (o.stock_type || 'AVAILABLE') === 'RENTAL').length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('menu2.type_showroom', '전시')}:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#4da6ff' }}>
              {filteredOrders.filter(o => (o.stock_type || 'AVAILABLE') === 'SHOWROOM').length}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('menu2.type_promotion', '프로모션')}:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: 'var(--text-primary)' }}>
              {filteredOrders.filter(o => (o.stock_type || 'AVAILABLE') === 'PROMOTION').length}
            </span>
          </div>
        </div>

        {isMobileView ? (
          <div className="mobile-cards-grid">
            {loading ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</div>
            ) : sortedOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>가용 재고 내역이 없습니다.</div>
            ) : (
              sortedOrders.map((order, index) => {
                const sType = pendingChanges[order.id]?.stockType || order.stock_type || 'AVAILABLE';
                const showSchedule = ['SHIPPING', 'ARRIVED', 'IN_STOCK'].includes(order.current_status);

                let typeBgColor = 'var(--bg-secondary)';
                let typeColor = 'var(--text-primary)';
                if (sType === 'AVAILABLE') { typeBgColor = 'hsla(142, 76%, 46%, 0.2)'; typeColor = 'var(--status-stock)'; }
                else if (sType === 'DEALER_ORDER') { typeBgColor = 'hsla(200, 76%, 46%, 0.2)'; typeColor = 'var(--accent-cyan)'; }
                else if (sType === 'RENTAL') { typeBgColor = 'hsla(45, 93%, 58%, 0.2)'; typeColor = 'var(--status-production)'; }
                else if (sType === 'SHOWROOM') { typeBgColor = 'hsla(200, 90%, 60%, 0.2)'; typeColor = 'var(--accent-cyan)'; }
                else if (sType === 'PROMOTION') { typeBgColor = 'hsla(340, 82%, 52%, 0.2)'; typeColor = 'var(--accent-pink)'; }

                return (
                  <div key={order.id} className="mobile-order-card" onClick={() => toggleRow(order.id)} style={{ cursor: 'pointer' }}>
                    <div className="mobile-order-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <div style={{ fontWeight: 700, fontSize: '1.1rem', color: 'var(--text-primary)' }}>
                          {order.product_model ? order.product_model.model_name : 'Unknown Model'}
                        </div>
                        <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-input)', padding: '2px 6px', borderRadius: '4px', border: '1px solid var(--border-color)' }}>
                          {order.nc || 'F0iP'}
                        </div>
                      </div>
                      <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '0.9rem' }}>
                        {order.reference_no}
                      </div>
                    </div>
                    <div className="mobile-order-meta">
                      <span>Buying: <strong style={{ color: 'var(--text-primary)' }}>{order.price ? (!isNaN(order.price) ? Number(order.price).toLocaleString() : order.price) : '-'}</strong></span>
                      <span>ETA: <strong style={{ color: 'var(--text-primary)' }}>{order.eta ? new Date(order.eta).toLocaleDateString() : '-'}</strong></span>
                      <span>PORT: <strong style={{ color: 'var(--text-primary)' }}>{getStandardPort(order.destination_port)}</strong></span>
                    </div>

                    <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.4, padding: '10px', background: 'var(--bg-secondary)', borderRadius: '8px' }}>
                      {order.detail_spec || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}
                    </div>

                    <div style={{ display: 'flex', gap: '12px', flexDirection: 'column', marginTop: '4px' }} onClick={e => e.stopPropagation()}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>S/N: {order.serial_number || '-'}</span>
                        <select
                          value={sType}
                          onChange={(e) => handlePendingChange(order.id, 'stockType', e.target.value)}
                          style={{
                            background: typeBgColor, border: `1px solid ${typeBgColor}`, color: typeColor,
                            padding: '6px 10px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', width: '130px',
                            fontWeight: 600, textAlign: 'center'
                          }}
                        >
                          <option value="AVAILABLE" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_available', '판매가능')}</option>
                          <option value="DEALER_ORDER" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_dealer_order', '딜러주문')}</option>
                          <option value="RENTAL" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_rental', '임대')}</option>
                          <option value="SHOWROOM" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_showroom', '전시')}</option>
                          <option value="PROMOTION" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_promotion', '프로모션')}</option>
                        </select>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>ORDER</span>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
                          <select
                            value={pendingChanges[order.id]?.dealerId !== undefined ? pendingChanges[order.id].dealerId : (order.dealer_company_id || "")}
                            onChange={(e) => handlePendingChange(order.id, 'dealerId', e.target.value)}
                            style={{
                              background: 'var(--bg-secondary)', border: '1px solid var(--accent-cyan)', color: 'var(--text-primary)',
                              padding: '6px 10px', borderRadius: '8px', fontSize: '0.85rem', cursor: 'pointer', maxWidth: '130px', textAlign: 'center'
                            }}
                          >
                            <option value="" disabled>{t('menu2.convert_to_order', '딜러사 선택')}</option>
                            {dealers.map(d => (
                              <option key={d.id} value={d.id}>{d.name}</option>
                            ))}
                          </select>
                          {pendingChanges[order.id] && (Object.keys(pendingChanges[order.id]).length > 0) && (
                            <button
                              onClick={() => handleConfirmChanges(order.id)}
                              className="btn btn-primary"
                              style={{ padding: '6px 12px', fontSize: '0.85rem', whiteSpace: 'nowrap' }}
                            >
                              {t('menu2.btn_confirm', '확정')}
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    {expandedRows.has(order.id) && (
                      <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px dashed var(--border-color)', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_status', '진행상태')}:</strong> <span>{order.current_status ? t(`stepbar.${order.current_status.toLowerCase()}`, order.current_status) : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_sn', 'S/N')}:</strong> <span>{order.serial_number || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_so', 'S/O')}:</strong> <span>{order.so_no || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_remark', 'REMARK')}:</strong> <span>{order.remark || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_etd_eta', 'ETD / ETA')}:</strong> <span>{showSchedule ? `${order.etd ? new Date(order.etd).toLocaleDateString() : '-'} / ${order.eta ? new Date(order.eta).toLocaleDateString() : '-'}` : '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_port', 'PORT')}:</strong> <span>{getStandardPort(order.destination_port)}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_incoterms', 'INCOTERMS')}:</strong> <span>{order.incoterms || '-'}</span></div>
                        <div style={{ display: 'flex' }}><strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_vessel', 'VESSEL')}:</strong> <span>{order.vessel || '-'}</span></div>
                        {order.stock_type === 'RENTAL' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex' }}>
                              <strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_rental_dealer', '임대 딜러')}:</strong>
                              <span>({order.dealer_company ? order.dealer_company.name : '미지정'})</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_rental_period', '임대 기간')}:</strong>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                {formatRentalPeriod(order.rental_start_date, order.rental_expiry_date)}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenRentalModalForEdit(order);
                                }}
                                className="btn btn-outline"
                                style={{
                                  padding: '2px 8px', fontSize: '11px', borderRadius: '4px',
                                  borderColor: 'var(--wia-blue)', color: 'var(--wia-blue)', cursor: 'pointer',
                                  display: 'inline-flex', alignItems: 'center', gap: '4px'
                                }}
                              >
                                <Edit2 size={11} />
                                {t('menu2.btn_edit_rental_period', '기간수정')}
                              </button>
                            </div>
                          </div>
                        )}
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
                    title="기본 순서로 리셋"
                  >
                    {t('menu2.header_no')}
                  </th>
                  {renderSortHeader('model', t('menu2.header_model'), '11%')}
                  {renderSortHeader('nc', t('menu2.header_nc'), '8%')}
                  {renderSortHeader('price', t('menu2.header_buying'), '8%', 'right')}
                  {renderSortHeader('po', t('menu2.header_po'), '10%')}
                  {renderSortHeader('detail_spec', t('menu2.header_detailspec'), '25%', 'left')}
                  {renderSortHeader('eta', t('menu2.header_eta'), '8%')}
                  {renderSortHeader('port', t('menu2.header_port'), '8%')}
                  {renderSortHeader('stock_type', t('menu2.header_status_change'), '8%')}
                  {renderSortHeader('dealer', t('menu2.header_dealer_order'), '10%')}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>데이터를 불러오는 중입니다...</td></tr>
                ) : sortedOrders.length === 0 ? (
                  <tr><td colSpan={10} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>가용 재고 내역이 없습니다.</td></tr>
                ) : (
                  sortedOrders.map((order, index) => {
                    const sType = pendingChanges[order.id]?.stockType || order.stock_type || 'AVAILABLE';
                    const showSchedule = ['SHIPPING', 'ARRIVED', 'IN_STOCK'].includes(order.current_status);

                    // 장기재고 식별 (etd 기준)
                    let isLongTerm = false; // 1년 이상
                    let isBadTerm = false;  // 2년 이상
                    if (order.etd) {
                      const diffTime = Math.abs(new Date() - new Date(order.etd));
                      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                      if (diffDays >= 730) {
                        isBadTerm = true;
                      } else if (diffDays >= 365) {
                        isLongTerm = true;
                      }
                    }

                    // 동적 배경색 설정
                    let typeBgColor = 'var(--bg-secondary)';
                    let typeColor = 'var(--text-primary)';
                    if (sType === 'AVAILABLE') { typeBgColor = 'hsla(142, 76%, 46%, 0.2)'; typeColor = 'var(--status-stock)'; }
                    else if (sType === 'DEALER_ORDER') { typeBgColor = 'hsla(200, 76%, 46%, 0.2)'; typeColor = 'var(--accent-cyan)'; }
                    else if (sType === 'RENTAL') { typeBgColor = 'hsla(45, 93%, 58%, 0.2)'; typeColor = 'var(--status-production)'; }
                    else if (sType === 'SHOWROOM') { typeBgColor = 'hsla(200, 90%, 60%, 0.2)'; typeColor = 'var(--accent-cyan)'; } // 하늘색
                    else if (sType === 'PROMOTION') { typeBgColor = 'hsla(340, 82%, 52%, 0.2)'; typeColor = 'var(--accent-pink)'; }

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
                            <div style={{ fontWeight: 600, fontSize: '12px' }}>{order.product_model ? order.product_model.model_name : 'Unknown Model'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '12px' }}>{order.nc || 'F0iP'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: order.price ? 'right' : 'center', paddingRight: order.price ? '16px' : '0' }}>
                            <div style={{ fontSize: '12px' }}>{order.price ? (!isNaN(order.price) ? Number(order.price).toLocaleString() : order.price) : '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11px' }}>{order.reference_no}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'left' }}>
                            <div style={{ fontSize: '11px' }}>{order.detail_spec || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px' }}>{showSchedule && order.eta ? new Date(order.eta).toLocaleDateString() : '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px' }}>{getStandardPort(order.destination_port)}</div>
                          </td>
                          <td onClick={e => e.stopPropagation()} style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <select
                              value={sType}
                              onChange={(e) => handlePendingChange(order.id, 'stockType', e.target.value)}
                              style={{
                                background: typeBgColor, border: `1px solid ${typeBgColor}`, color: typeColor,
                                padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', width: '85px',
                                fontWeight: 600, textAlign: 'center'
                              }}
                            >
                              <option value="AVAILABLE" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_available', '판매가능')}</option>
                              <option value="DEALER_ORDER" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_dealer_order', '딜러주문')}</option>
                              <option value="RENTAL" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_rental', '임대')}</option>
                              <option value="SHOWROOM" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_showroom', '전시')}</option>
                              <option value="PROMOTION" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_promotion', '프로모션')}</option>
                            </select>
                          </td>
                          <td onClick={e => e.stopPropagation()} style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '5px', paddingTop: '5px', textAlign: 'center' }}>
                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                              <select
                                value={pendingChanges[order.id]?.dealerId !== undefined ? pendingChanges[order.id].dealerId : (order.dealer_company_id || "")}
                                onChange={(e) => handlePendingChange(order.id, 'dealerId', e.target.value)}
                                style={{
                                  background: 'var(--bg-secondary)', border: '1px solid var(--accent-cyan)', color: 'var(--text-primary)',
                                  padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', flex: 1, textAlign: 'center'
                                }}
                              >
                                <option value="" disabled>{t('menu2.convert_to_order', '딜러선택')}</option>
                                {dealers.map(d => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </select>
                              {pendingChanges[order.id] && (Object.keys(pendingChanges[order.id]).length > 0) && (
                                <button
                                  onClick={() => handleConfirmChanges(order.id)}
                                  className="btn btn-primary"
                                  style={{ padding: '4px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                >
                                  {t('menu2.btn_confirm', '확정')}
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                        {expandedRows.has(order.id) && (
                          <tr>
                            <td colSpan={10} style={{ backgroundColor: 'var(--bg-card)', paddingTop: '12px', borderTop: '1px dashed var(--border-color)', paddingBottom: '16px', borderBottom: '1px solid var(--border-color)' }}>
                              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px', paddingLeft: '8px' }}>
                                <div style={{
                                  fontSize: '12px',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.8',
                                  textAlign: 'left',
                                  paddingLeft: '16px',
                                  borderLeft: '3px solid var(--wia-blue)',
                                }}>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_status', '진행상태')}:</span> {order.current_status ? t(`stepbar.${order.current_status.toLowerCase()}`, order.current_status) : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_sn', 'S/N')}:</span> {order.serial_number || '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_so', 'S/O')}:</span> {order.so_no || '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_remark', 'REMARK')}:</span> {order.remark || '-'}</div>
                                </div>

                                <div style={{
                                  fontSize: '12px',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.8',
                                  textAlign: 'left',
                                  paddingLeft: '16px',
                                  borderLeft: '3px solid var(--wia-blue)',
                                }}>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_etd_eta', 'ETD / ETA')}:</span> {showSchedule ? `${order.etd ? new Date(order.etd).toLocaleDateString() : '-'} / ${order.eta ? new Date(order.eta).toLocaleDateString() : '-'}` : '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_port', 'PORT')}:</span> {getStandardPort(order.destination_port)}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_incoterms', 'INCOTERMS')}:</span> {order.incoterms || '-'}</div>
                                  <div><span style={{ fontWeight: 600, color: 'var(--text-primary)', display: 'inline-block', width: '100px' }}>{t('menu2.detail_vessel', 'VESSEL')}:</span> {order.vessel || '-'}</div>
                                </div>
                                
                                <div style={{
                                  fontSize: '12px',
                                  color: 'var(--text-secondary)',
                                  lineHeight: '1.8',
                                  textAlign: 'left',
                                  paddingLeft: '16px',
                                }}>
                                  {order.stock_type === 'RENTAL' && (
                                    <>
                                      <div>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('menu2.detail_rental_dealer', '임대 딜러')}: </span> ({order.dealer_company ? order.dealer_company.name : '미지정'})
                                      </div>
                                      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('menu2.detail_rental_period', '임대 기간')}: </span>
                                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                          {formatRentalPeriod(order.rental_start_date, order.rental_expiry_date)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenRentalModalForEdit(order);
                                          }}
                                          className="btn btn-outline"
                                          style={{
                                            padding: '2px 8px',
                                            fontSize: '11px',
                                            borderRadius: '4px',
                                            borderColor: 'var(--wia-blue)',
                                            color: 'var(--wia-blue)',
                                            cursor: 'pointer',
                                            display: 'inline-flex',
                                            alignItems: 'center',
                                            gap: '4px'
                                          }}
                                        >
                                          <Edit2 size={11} />
                                          {t('menu2.btn_edit_rental_period', '기간수정')}
                                        </button>
                                      </div>
                                    </>
                                  )}
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
      {/* 임대 기간 설정 팝업 모달 */}
      {rentalModalOpen && rentalOrder && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
          }}
          onClick={() => setRentalModalOpen(false)}
        >
          <div
            className="glass-card"
            style={{
              width: '100%', maxWidth: '520px',
              backgroundColor: 'var(--bg-card, #1a202c)',
              border: '1px solid var(--border-color, rgba(255, 255, 255, 0.12))',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
              overflow: 'hidden',
              animation: 'modalFadeIn 0.2s ease-out'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 모달 헤더 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-color)',
              background: 'linear-gradient(to right, rgba(0, 51, 153, 0.15), transparent)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  backgroundColor: 'rgba(234, 179, 8, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--status-production, #eab308)'
                }}>
                  <Calendar size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {isRentalEditMode ? "임대 기간 수정" : "임대 기간 설정"}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {rentalOrder.product_model?.model_name || '장비'} ({rentalOrder.reference_no})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setRentalModalOpen(false)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 모달 바디 */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
              
              {/* 공지 내용 텍스트 박스 */}
              <div style={{
                backgroundColor: 'rgba(59, 130, 246, 0.08)',
                border: '1px solid rgba(59, 130, 246, 0.25)',
                borderRadius: '10px',
                padding: '14px 16px',
                display: 'flex', gap: '12px', alignItems: 'flex-start'
              }}>
                <AlertCircle size={20} color="var(--wia-blue, #2563eb)" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div style={{ fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  <div style={{ fontWeight: 700, marginBottom: '2px', color: 'var(--wia-blue, #2563eb)' }}>
                    [공지] 임대 기간을 입력해 주시기 바랍니다.
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    달력 기능을 사용하여 임대 시작일과 종료일을 지정하신 후, 하단의 <strong>'임대기간 확정'</strong> 버튼을 클릭하여 일정을 저장해 주세요.
                  </div>
                </div>
              </div>

              {/* 장비 & 딜러 정보 카드 */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px',
                fontSize: '0.85rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>모델</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{rentalOrder.product_model?.model_name || '-'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>발주번호</span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>{rentalOrder.reference_no || '-'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>임대 딜러</span>
                  <strong style={{ color: 'var(--status-production, #eab308)' }}>
                    {dealers.find(d => d.id === parseInt(rentalDealerId))?.name || rentalOrder.dealer_company?.name || '딜러 선택'}
                  </strong>
                </div>
              </div>

              {/* 날짜 선택 달력 입력란 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      임대 시작일
                    </label>
                    <input
                      type="date"
                      value={rentalStartDate}
                      onChange={e => setRentalStartDate(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      임대 종료일 (만료일)
                    </label>
                    <input
                      type="date"
                      value={rentalEndDate}
                      onChange={e => setRentalEndDate(e.target.value)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        padding: '10px 12px',
                        borderRadius: '8px',
                        fontSize: '0.9rem',
                        cursor: 'pointer',
                        boxSizing: 'border-box'
                      }}
                    />
                  </div>
                </div>

                {/* 빠른 기간 설정 프리셋 버튼 */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '4px' }}>빠른 기간 선택:</span>
                  {[
                    { label: '+1개월', months: 1 },
                    { label: '+3개월', months: 3 },
                    { label: '+6개월', months: 6 },
                    { label: '+1년', months: 12 },
                    { label: '+2년', months: 24 }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleQuickPeriod(p.months)}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--wia-blue)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border-color)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

            </div>

            {/* 모달 푸터 버튼 */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'flex-end', gap: '10px',
              backgroundColor: 'var(--bg-card)'
            }}>
              <button
                type="button"
                onClick={() => setRentalModalOpen(false)}
                style={{
                  padding: '9px 18px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-color)',
                  background: 'transparent',
                  color: 'var(--text-secondary)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSaveRentalPeriod}
                disabled={savingRental}
                className="btn btn-primary"
                style={{
                  padding: '9px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: savingRental ? 'not-allowed' : 'pointer'
                }}
              >
                <CheckCircle2 size={16} />
                {savingRental ? "저장 중..." : (t('menu2.btn_confirm_rental_period', '임대기간 확정'))}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .sortable-th:hover {
          background-color: var(--bg-secondary) !important;
          color: var(--wia-blue) !important;
        }
        @keyframes modalFadeIn {
          from {
            opacity: 0;
            transform: scale(0.96);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}
