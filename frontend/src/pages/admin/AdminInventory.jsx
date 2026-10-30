import React, { useState, useEffect } from 'react';
import { Search, Package, CheckCircle2, Calendar, AlertCircle, X, Edit2, FileText, Trash2, Clock, ShoppingBag } from 'lucide-react';
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

  // 예약 기간 설정 모달 상태
  const [reserveModalOpen, setReserveModalOpen] = useState(false);
  const [reserveOrder, setReserveOrder] = useState(null);
  const [reserveDealerId, setReserveDealerId] = useState('');
  const [reserveStartDate, setReserveStartDate] = useState('');
  const [reserveEndDate, setReserveEndDate] = useState('');
  const [isReserveEditMode, setIsReserveEditMode] = useState(false);
  const [savingReserve, setSavingReserve] = useState(false);

  // 예약 상세 내역(예약내역 버튼) 모달 상태
  const [reserveDetailModalOpen, setReserveDetailModalOpen] = useState(false);
  const [reserveDetailOrder, setReserveDetailOrder] = useState(null);
  const [cancellingReserve, setCancellingReserve] = useState(false);

  // 예약 장비 판매완료 확정 모달 상태
  const [reserveSaleModalOpen, setReserveSaleModalOpen] = useState(false);
  const [reserveSaleOrder, setReserveSaleOrder] = useState(null);
  const [saleBuyerDealerId, setSaleBuyerDealerId] = useState('');
  const [confirmingSale, setConfirmingSale] = useState(false);

  const [expandedRows, setExpandedRows] = useState(new Set());

  const formatDateToYYYYMMDD = (dateVal) => {
    if (!dateVal) return '';
    const str = String(dateVal);
    const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return '';
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  // 예시 포맷: 2026.OCT.30
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

  const formatRentalPeriod = (startDate, endDate) => {
    if (!startDate && !endDate) return '미설정';
    const startStr = startDate ? new Date(startDate).toLocaleDateString() : '';
    const endStr = endDate ? new Date(endDate).toLocaleDateString() : '';
    if (startStr && endStr) return `${startStr} ~ ${endStr}`;
    if (endStr) return `~ ${endStr}`;
    return `${startStr} ~`;
  };

  const formatReservationPeriod = (startDate, endDate) => {
    if (!startDate && !endDate) return '미설정';
    const startStr = startDate ? formatExpiryDateMMM(startDate) : '';
    const endStr = endDate ? formatExpiryDateMMM(endDate) : '';
    if (startStr && endStr) return `${startStr} ~ ${endStr}`;
    if (endStr) return `~ ${endStr}`;
    return `${startStr} ~`;
  };

  const getRemainingDaysLabel = (expiryVal) => {
    if (!expiryVal) return null;
    const ymd = formatDateToYYYYMMDD(expiryVal);
    if (!ymd) return null;
    const [y, m, d] = ymd.split('-').map(Number);
    const endDay = new Date(y, m - 1, d, 23, 59, 59);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const diffDays = Math.round((new Date(y, m - 1, d, 0, 0, 0) - todayStart) / (1000 * 60 * 60 * 24));
    if (endDay < now) return { text: '만료됨', urgent: true };
    if (diffDays === 0) return { text: '오늘 만료 (D-Day)', urgent: true };
    if (diffDays <= 2) return { text: `D-${diffDays}일 남음`, urgent: true };
    return { text: `D-${diffDays}일 남음`, urgent: false };
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
    const order = orders.find(o => o.id === orderId);
    setPendingChanges(prev => {
      const currentOrderChanges = { ...(prev[orderId] || {}) };
      if (order) {
        const origStockType = order.stock_type || 'AVAILABLE';
        const origDealerId = String(order.dealer_company_id || '');
        if (field === 'stockType' && value === origStockType) {
          delete currentOrderChanges.stockType;
        } else if (field === 'dealerId' && String(value) === origDealerId) {
          delete currentOrderChanges.dealerId;
        } else {
          currentOrderChanges[field] = value;
        }
      } else {
        currentOrderChanges[field] = value;
      }

      const next = { ...prev };
      if (Object.keys(currentOrderChanges).length === 0) {
        delete next[orderId];
      } else {
        next[orderId] = currentOrderChanges;
      }
      return next;
    });
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

    // 1. 상태가 '예약'(RESERVED)인 경우 -> '예약 기간 설정' 팝업 모달 오픈
    if (effectiveStockType === 'RESERVED') {
      const reserveTargetDealerId = changes.dealerId !== undefined
        ? changes.dealerId
        : (order.reserved_dealer_id || order.dealer_company_id);

      if (!reserveTargetDealerId) {
        alert("예약을 진행할 딜러를 선택해 주세요.");
        return;
      }
      setReserveOrder(order);
      setReserveDealerId(String(reserveTargetDealerId));

      const today = new Date();
      const defaultStart = order.reservation_start_date
        ? formatDateToYYYYMMDD(order.reservation_start_date)
        : formatDateToYYYYMMDD(today);
      let defaultEnd = '';
      if (order.reservation_expiry_date && order.stock_type === 'RESERVED') {
        defaultEnd = formatDateToYYYYMMDD(order.reservation_expiry_date);
      } else {
        const oneWeekLater = new Date(today);
        oneWeekLater.setDate(oneWeekLater.getDate() + 7);
        defaultEnd = formatDateToYYYYMMDD(oneWeekLater);
      }
      setReserveStartDate(defaultStart);
      setReserveEndDate(defaultEnd);
      setIsReserveEditMode(false);
      setReserveModalOpen(true);
      return;
    }

    // 2. 상태가 '임대'(RENTAL)인 경우 -> 팝업 모달창을 띄워 일정 입력 진행
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

  // 상세내역에서 임대 [기간수정] 버튼 클릭 시 모달 열기
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

  // 임대 빠른 기간 프리셋 버튼
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

  // ==========================================
  // 예약(Reservation) 관련 핸들러
  // ==========================================

  // 예약 빠른 기간 프리셋 버튼 (+1주 / +2주)
  const handleQuickReserveDays = (days) => {
    const start = reserveStartDate ? new Date(reserveStartDate) : new Date();
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    if (!reserveStartDate) {
      setReserveStartDate(formatDateToYYYYMMDD(start));
    }
    setReserveEndDate(formatDateToYYYYMMDD(end));
  };

  // 예약 상세 내역 팝업에서 [기간수정] 클릭 시
  const handleOpenReserveModalForEdit = (order) => {
    setReserveDetailModalOpen(false);
    setReserveOrder(order);
    setReserveDealerId(
      order.reserved_dealer_id
        ? String(order.reserved_dealer_id)
        : (order.dealer_company_id ? String(order.dealer_company_id) : '')
    );

    const today = new Date();
    const defaultStart = order.reservation_start_date
      ? formatDateToYYYYMMDD(order.reservation_start_date)
      : formatDateToYYYYMMDD(today);
    let defaultEnd = '';
    if (order.reservation_expiry_date) {
      defaultEnd = formatDateToYYYYMMDD(order.reservation_expiry_date);
    } else {
      const oneWeekLater = new Date(today);
      oneWeekLater.setDate(oneWeekLater.getDate() + 7);
      defaultEnd = formatDateToYYYYMMDD(oneWeekLater);
    }
    setReserveStartDate(defaultStart);
    setReserveEndDate(defaultEnd);
    setIsReserveEditMode(true);
    setReserveModalOpen(true);
  };

  // 팝업 모달에서 [예약기간 확정] 클릭 시 저장
  const handleSaveReservePeriod = async () => {
    if (!reserveOrder) return;
    if (!reserveDealerId) {
      alert("예약을 진행할 딜러사를 선택해 주세요.");
      return;
    }
    if (!reserveStartDate || !reserveEndDate) {
      alert("예약 시작일과 종료일(만료일)을 모두 선택해 주세요.");
      return;
    }
    if (new Date(reserveStartDate) > new Date(reserveEndDate)) {
      alert("예약 종료일(만료일)은 시작일보다 이후여야 합니다.");
      return;
    }

    setSavingReserve(true);
    try {
      const res = await fetch(`/api/orders/${reserveOrder.id}/reserve`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reserved_dealer_id: parseInt(reserveDealerId, 10),
          reservation_start_date: new Date(reserveStartDate).toISOString(),
          reservation_expiry_date: new Date(reserveEndDate).toISOString()
        })
      });

      if (res.ok) {
        alert(isReserveEditMode ? "예약 정보 및 기간이 수정되었습니다." : "예약 상태 및 예약 기간 설정이 완료되었습니다.");
        setPendingChanges(prev => {
          const next = { ...prev };
          delete next[reserveOrder.id];
          return next;
        });
        setReserveModalOpen(false);
        setReserveOrder(null);
        fetchInventory();
      } else {
        const errorData = await res.json();
        alert(`예약 저장 실패: ${errorData.detail || "알 수 없는 오류"}`);
      }
    } catch (err) {
      console.error("Failed to save reservation:", err);
      alert("예약 기간 저장 중 오류가 발생했습니다.");
    } finally {
      setSavingReserve(false);
    }
  };

  // [예약내역] 버튼 클릭 -> 상세 내역 팝업 오픈
  const handleOpenReserveDetail = (order) => {
    setReserveDetailOrder(order);
    setReserveDetailModalOpen(true);
  };

  // 상세 내역 팝업 내 [예약취소] 클릭
  const handleCancelReservation = async (order) => {
    if (!order) return;
    if (!window.confirm("정말로 예약을 취소하시겠습니까?\n예약 취소 시 해당 장비는 다시 '판매가능(AVAILABLE)' 상태로 복귀합니다.")) {
      return;
    }

    setCancellingReserve(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/cancel-reservation`, {
        method: 'PATCH'
      });
      if (res.ok) {
        alert("예약이 취소되어 판매가능 상태로 복귀되었습니다.");
        setReserveDetailModalOpen(false);
        setReserveDetailOrder(null);
        setPendingChanges(prev => {
          const next = { ...prev };
          delete next[order.id];
          return next;
        });
        fetchInventory();
      } else {
        const err = await res.json();
        alert(err.detail || "예약 취소 실패");
      }
    } catch (e) {
      console.error("Failed to cancel reservation:", e);
      alert("서버 연결 실패");
    } finally {
      setCancellingReserve(false);
    }
  };

  // [판매완료] 버튼 클릭 -> 구매 딜러 확인 모달 오픈 (예약 딜러 자동 선택)
  const handleOpenReserveSaleModal = (order) => {
    setReserveDetailModalOpen(false);
    setReserveSaleOrder(order);
    const defaultBuyerId = order.reserved_dealer_id || order.dealer_company_id || '';
    setSaleBuyerDealerId(defaultBuyerId ? String(defaultBuyerId) : '');
    setReserveSaleModalOpen(true);
  };

  // 판매완료 모달에서 [판매완료 확정] 클릭 -> 딜러 발주로 귀속 전환
  const handleConfirmReservationSale = async () => {
    if (!reserveSaleOrder) return;
    if (!saleBuyerDealerId) {
      alert("최종 실 구매 딜러사를 선택해 주세요.");
      return;
    }
    const chosenDealer = dealers.find(d => d.id === parseInt(saleBuyerDealerId, 10));
    if (chosenDealer && chosenDealer.name.toUpperCase() === 'WME') {
      alert("실 구매 현지 딜러사를 선택해 주세요. (WME 제외)");
      return;
    }

    setConfirmingSale(true);
    try {
      const res = await fetch(`/api/orders/${reserveSaleOrder.id}/confirm-reservation-sale`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          final_buyer_dealer_id: parseInt(saleBuyerDealerId, 10)
        })
      });
      if (res.ok) {
        alert("판매완료 처리되어 선택하신 딜러사의 확정 발주(주문/배송현황)로 이관되었습니다.");
        setReserveSaleModalOpen(false);
        setReserveSaleOrder(null);
        setPendingChanges(prev => {
          const next = { ...prev };
          delete next[reserveSaleOrder.id];
          return next;
        });
        fetchInventory();
      } else {
        const err = await res.json();
        alert(err.detail || "판매완료 처리 실패");
      }
    } catch (e) {
      console.error("Failed to confirm reservation sale:", e);
      alert("서버 연결 실패");
    } finally {
      setConfirmingSale(false);
    }
  };

  const filteredOrders = orders.filter(o => {
    const query = searchQuery.toLowerCase();
    const matchesQuery = (o.reference_no && o.reference_no.toLowerCase().includes(query)) ||
      (o.nc && o.nc.toLowerCase().includes(query)) ||
      (o.product_model && o.product_model.model_name && o.product_model.model_name.toLowerCase().includes(query)) ||
      (o.serial_number && o.serial_number.toLowerCase().includes(query)) ||
      (o.detail_spec && o.detail_spec.toLowerCase().includes(query)) ||
      (o.reserved_dealer && o.reserved_dealer.name && o.reserved_dealer.name.toLowerCase().includes(query)) ||
      (o.dealer_company && o.dealer_company.name && o.dealer_company.name.toLowerCase().includes(query));

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
        valA = a.stock_type === 'RESERVED' ? (a.reserved_dealer?.name || '') : (a.dealer_company?.name || '');
        valB = b.stock_type === 'RESERVED' ? (b.reserved_dealer?.name || '') : (b.dealer_company?.name || '');
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

  // 상태 드롭다운 공통 옵션: [판매가능 > 예약 > 딜러주문 > 임대 > 전시 > 프로모션]
  const renderStockTypeOptions = () => (
    <>
      <option value="AVAILABLE" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_available', '판매가능')}</option>
      <option value="RESERVED" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_reserved', '예약')}</option>
      <option value="DEALER_ORDER" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_dealer_order', '딜러주문')}</option>
      <option value="RENTAL" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_rental', '임대')}</option>
      <option value="SHOWROOM" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_showroom', '전시')}</option>
      <option value="PROMOTION" style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}>{t('menu2.type_promotion', '프로모션')}</option>
    </>
  );

  const getStockTypeColors = (sType) => {
    if (sType === 'AVAILABLE') return { bg: 'hsla(142, 76%, 46%, 0.2)', color: 'var(--status-stock)' };
    if (sType === 'RESERVED') return { bg: 'hsla(262, 83%, 58%, 0.15)', color: '#7c3aed' };
    if (sType === 'DEALER_ORDER') return { bg: 'hsla(200, 76%, 46%, 0.2)', color: 'var(--accent-cyan)' };
    if (sType === 'RENTAL') return { bg: 'hsla(45, 93%, 58%, 0.2)', color: 'var(--status-production)' };
    if (sType === 'SHOWROOM') return { bg: 'hsla(200, 90%, 60%, 0.2)', color: 'var(--accent-cyan)' };
    if (sType === 'PROMOTION') return { bg: 'hsla(340, 82%, 52%, 0.18)', color: '#e11d48' };
    return { bg: 'var(--bg-secondary)', color: 'var(--text-primary)' };
  };

  return (
    <div className="page-body">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', paddingTop: '4px', paddingLeft: '28px' }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', marginBottom: '4px' }}>{t('menu2.page_title', 'WIA 재고리스트')}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>
            {t('menu2.page_desc', 'WIA 유럽법인의 가용 재고 현황을 파악 할 수 있습니다.')}
          </p>
        </div>
      </div>

      <div className="glass-card no-hover-bg" style={{ padding: '28px', marginBottom: '32px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <h2 style={{ fontSize: '1.3rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Package size={20} color="var(--status-stock)" />
              <span>{t('menu2.inventory_list_title', 'WIA 가용재고 목록')}</span>
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
              <option value="RESERVED">{t('menu2.type_reserved', '예약')}</option>
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
            <span style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>{t('menu2.type_reserved', '예약')}:</span>
            <span style={{ fontSize: '1.1rem', fontWeight: 'bold', color: '#7c3aed' }}>
              {filteredOrders.filter(o => (o.stock_type || 'AVAILABLE') === 'RESERVED').length}
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
              sortedOrders.map((order) => {
                const sType = pendingChanges[order.id]?.stockType || order.stock_type || 'AVAILABLE';
                const showSchedule = ['SHIPPING', 'ARRIVED', 'IN_STOCK'].includes(order.current_status);
                const { bg: typeBgColor, color: typeColor } = getStockTypeColors(sType);
                const isConfirmedReserved = order.stock_type === 'RESERVED' && (!pendingChanges[order.id]?.stockType || pendingChanges[order.id]?.stockType === 'RESERVED');

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
                          {renderStockTypeOptions()}
                        </select>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-muted)' }}>ORDER</span>
                        {isConfirmedReserved ? (
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent-cyan)' }}>
                              {order.reserved_dealer?.name || order.dealer_company?.name || '-'}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                              {t('menu2.label_expire', '만료')}: {formatExpiryDateMMM(order.reservation_expiry_date)}
                            </div>
                            <div style={{ display: 'flex', gap: '6px', marginTop: '2px' }}>
                              <button
                                type="button"
                                onClick={() => handleOpenReserveDetail(order)}
                                className="reserve-pill-btn reserve-detail-btn"
                              >
                                {t('menu2.btn_reservation_detail', '예약내역')}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenReserveSaleModal(order)}
                                className="reserve-pill-btn reserve-sold-btn"
                              >
                                {t('menu2.btn_sold_complete', '판매완료')}
                              </button>
                            </div>
                          </div>
                        ) : (
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
                        )}
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
                        {order.stock_type === 'RESERVED' && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <div style={{ display: 'flex' }}>
                              <strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_reserved_dealer', '예약 딜러')}:</strong>
                              <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{order.reserved_dealer ? order.reserved_dealer.name : '미지정'}</span>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                              <strong style={{ color: 'var(--text-primary)', width: '90px' }}>{t('menu2.detail_reservation_period', '예약 기간')}:</strong>
                              <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                {formatReservationPeriod(order.reservation_start_date, order.reservation_expiry_date)}
                              </span>
                            </div>
                          </div>
                        )}
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
                  {renderSortHeader('nc', t('menu2.header_nc'), '7%')}
                  {renderSortHeader('price', t('menu2.header_buying'), '8%', 'right')}
                  {renderSortHeader('po', t('menu2.header_po'), '10%')}
                  {renderSortHeader('detail_spec', t('menu2.header_detailspec'), '23%', 'left')}
                  {renderSortHeader('eta', t('menu2.header_eta'), '8%')}
                  {renderSortHeader('port', t('menu2.header_port'), '8%')}
                  {renderSortHeader('stock_type', t('menu2.header_status_change'), '8%')}
                  {renderSortHeader('dealer', t('menu2.header_dealer_order'), '13%')}
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
                    const { bg: typeBgColor, color: typeColor } = getStockTypeColors(sType);
                    const isConfirmedReserved = order.stock_type === 'RESERVED' && (!pendingChanges[order.id]?.stockType || pendingChanges[order.id]?.stockType === 'RESERVED');

                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          onClick={() => toggleRow(order.id)}
                          style={{ cursor: 'pointer', transition: 'background-color 0.2s' }}
                          onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'var(--bg-secondary)'}
                          onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                        >
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>{index + 1}</span>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 600, fontSize: '12px' }}>{order.product_model ? order.product_model.model_name : 'Unknown Model'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            <div style={{ fontSize: '12px' }}>{order.nc || 'F0iP'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: order.price ? 'right' : 'center', paddingRight: order.price ? '16px' : '0' }}>
                            <div style={{ fontSize: '12px' }}>{order.price ? (!isNaN(order.price) ? Number(order.price).toLocaleString() : order.price) : '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            <div style={{ fontWeight: 700, color: 'var(--accent-cyan)', fontSize: '11px' }}>{order.reference_no}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'left' }}>
                            <div style={{ fontSize: '11px' }}>{order.detail_spec || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px' }}>{showSchedule && order.eta ? new Date(order.eta).toLocaleDateString() : '-'}</div>
                          </td>
                          <td style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            <div style={{ fontSize: '11px' }}>{getStandardPort(order.destination_port)}</div>
                          </td>
                          <td onClick={e => e.stopPropagation()} style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            <select
                              value={sType}
                              onChange={(e) => handlePendingChange(order.id, 'stockType', e.target.value)}
                              style={{
                                background: typeBgColor, border: `1px solid ${typeBgColor}`, color: typeColor,
                                padding: '4px 8px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', width: '85px',
                                fontWeight: 600, textAlign: 'center'
                              }}
                            >
                              {renderStockTypeOptions()}
                            </select>
                          </td>
                          <td onClick={e => e.stopPropagation()} style={{ borderBottom: expandedRows.has(order.id) ? 'none' : '1px solid var(--border-color)', paddingBottom: '6px', paddingTop: '6px', textAlign: 'center' }}>
                            {isConfirmedReserved ? (
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', lineHeight: 1.3 }}>
                                <div style={{ fontWeight: 700, fontSize: '11.5px', color: 'var(--accent-cyan)', whiteSpace: 'nowrap' }}>
                                  {order.reserved_dealer?.name || order.dealer_company?.name || '-'}
                                </div>
                                <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                  {t('menu2.label_expire', '만료')}: {formatExpiryDateMMM(order.reservation_expiry_date)}
                                </div>
                                <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginTop: '3px' }}>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReserveDetail(order)}
                                    className="reserve-pill-btn reserve-detail-btn"
                                  >
                                    {t('menu2.btn_reservation_detail', '예약내역')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenReserveSaleModal(order)}
                                    className="reserve-pill-btn reserve-sold-btn"
                                  >
                                    {t('menu2.btn_sold_complete', '판매완료')}
                                  </button>
                                </div>
                              </div>
                            ) : (
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
                            )}
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
                                  {order.stock_type === 'RESERVED' && (
                                    <>
                                      <div>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('menu2.detail_reserved_dealer', '예약 딜러')}: </span>
                                        <span style={{ color: 'var(--accent-cyan)', fontWeight: 600 }}>{order.reserved_dealer ? order.reserved_dealer.name : '미지정'}</span>
                                      </div>
                                      <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{t('menu2.detail_reservation_period', '예약 기간')}: </span>
                                        <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                                          {formatReservationPeriod(order.reservation_start_date, order.reservation_expiry_date)}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleOpenReserveDetail(order);
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
                                          <FileText size={11} />
                                          {t('menu2.btn_reservation_detail', '예약내역')}
                                        </button>
                                      </div>
                                    </>
                                  )}
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

      {/* 1. 예약 기간 설정 팝업 모달 (임대 기간 설정 팝업과 동일한 디자인 구성) */}
      {reserveModalOpen && reserveOrder && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
          }}
          onClick={() => setReserveModalOpen(false)}
        >
          <div
            className="glass-card no-hover-bg"
            style={{
              width: '100%', maxWidth: '520px',
              backgroundColor: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color)',
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
              background: 'linear-gradient(to right, rgba(0, 51, 153, 0.12), transparent)'
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
                    {isReserveEditMode
                      ? t('menu2.modal_reserve_edit_title', '예약 기간 수정')
                      : t('menu2.modal_reserve_title', '예약 기간 설정')}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {reserveOrder.product_model?.model_name || '장비'} ({reserveOrder.reference_no})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReserveModalOpen(false)}
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
                    [공지] 예약 기간을 입력해 주시기 바랍니다.
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>
                    달력 기능을 사용하여 예약 시작일과 종료일(만료일)을 지정하신 후, 하단의 <strong>'예약기간 확정'</strong> 버튼을 클릭하여 일정을 저장해 주세요.
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
                fontSize: '0.85rem', alignItems: 'center'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>모델</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{reserveOrder.product_model?.model_name || '-'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>발주번호</span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>{reserveOrder.reference_no || '-'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.75rem', marginBottom: '2px' }}>예약 딜러</span>
                  <select
                    value={reserveDealerId}
                    onChange={e => setReserveDealerId(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'transparent',
                      border: 'none',
                      padding: 0,
                      fontWeight: 700,
                      fontSize: '0.86rem',
                      color: 'var(--status-production, #CDAA7D)',
                      cursor: 'pointer',
                      outline: 'none'
                    }}
                    title="예약 딜러사 변경 가능"
                  >
                    {dealers.map(d => (
                      <option key={d.id} value={d.id} style={{ color: 'var(--text-primary)', background: 'var(--bg-card)' }}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 날짜 선택 달력 입력란 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                      예약 시작일
                    </label>
                    <input
                      type="date"
                      value={reserveStartDate}
                      onChange={e => setReserveStartDate(e.target.value)}
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
                      예약 종료일 (만료일)
                    </label>
                    <input
                      type="date"
                      value={reserveEndDate}
                      onChange={e => setReserveEndDate(e.target.value)}
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

                {/* 빠른 기간 설정 프리셋 버튼 (+1주, +2주) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginRight: '4px' }}>빠른 기간 선택:</span>
                  {[
                    { label: '+1주', days: 7 },
                    { label: '+2주', days: 14 }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => handleQuickReserveDays(p.days)}
                      style={{
                        background: 'var(--bg-secondary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-secondary)',
                        padding: '4px 10px',
                        borderRadius: '6px',
                        fontSize: '0.78rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.15s'
                      }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--wia-blue)'; e.currentTarget.style.color = 'var(--wia-blue)'; }}
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
                onClick={() => setReserveModalOpen(false)}
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
                onClick={handleSaveReservePeriod}
                disabled={savingReserve}
                className="btn btn-primary"
                style={{
                  padding: '9px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: savingReserve ? 'not-allowed' : 'pointer'
                }}
              >
                <CheckCircle2 size={16} />
                {savingReserve ? "저장 중..." : t('menu2.btn_confirm_reservation_period', '예약기간 확정')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 2. 예약 상세 내역(예약내역 버튼) 팝업 모달 (예약취소 및 기간수정 지원) */}
      {reserveDetailModalOpen && reserveDetailOrder && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
          }}
          onClick={() => setReserveDetailModalOpen(false)}
        >
          <div
            className="glass-card no-hover-bg"
            style={{
              width: '100%', maxWidth: '540px',
              backgroundColor: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
              overflow: 'hidden',
              animation: 'modalFadeIn 0.2s ease-out'
            }}
            onClick={e => e.stopPropagation()}
          >
            {/* 헤더 */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-color)',
              background: 'linear-gradient(to right, rgba(124, 58, 237, 0.12), transparent)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  backgroundColor: 'rgba(124, 58, 237, 0.14)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#7c3aed'
                }}>
                  <FileText size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('menu2.modal_reserve_detail_title', '예약 상세 내역')}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {reserveDetailOrder.product_model?.model_name || '장비'} ({reserveDetailOrder.reference_no})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReserveDetailModalOpen(false)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex'
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* 바디 */}
            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 예약 요약 카드 */}
              <div style={{
                background: 'rgba(45, 99, 255, 0.05)',
                border: '1px solid rgba(45, 99, 255, 0.2)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>예약 딜러사</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <strong style={{ fontSize: '1.08rem', color: 'var(--accent-cyan)' }}>
                        {reserveDetailOrder.reserved_dealer?.name || reserveDetailOrder.dealer_company?.name || '-'}
                      </strong>
                      {reserveDetailOrder.reserved_dealer?.country && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', background: 'var(--bg-card)', padding: '2px 8px', borderRadius: '999px', border: '1px solid var(--border-color)' }}>
                          {reserveDetailOrder.reserved_dealer.country}
                        </span>
                      )}
                    </div>
                  </div>
                  {(() => {
                    const rem = getRemainingDaysLabel(reserveDetailOrder.reservation_expiry_date);
                    if (!rem) return null;
                    return (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '5px',
                        padding: '4px 10px', borderRadius: '999px', fontSize: '0.78rem', fontWeight: 700,
                        backgroundColor: rem.urgent ? 'rgba(230, 0, 18, 0.1)' : 'rgba(124, 58, 237, 0.12)',
                        color: rem.urgent ? 'var(--wia-red)' : '#7c3aed'
                      }}>
                        <Clock size={13} />
                        {rem.text}
                      </span>
                    );
                  })()}
                </div>

                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px',
                  paddingTop: '12px', borderTop: '1px dashed rgba(45, 99, 255, 0.2)'
                }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>예약 시작일</span>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                      {formatExpiryDateMMM(reserveDetailOrder.reservation_start_date)}
                    </strong>
                    {reserveDetailOrder.reservation_start_date && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                        ({formatDateToYYYYMMDD(reserveDetailOrder.reservation_start_date)})
                      </span>
                    )}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '2px' }}>예약 만료일</span>
                      <button
                        type="button"
                        onClick={() => handleOpenReserveModalForEdit(reserveDetailOrder)}
                        style={{
                          background: 'transparent', border: 'none', color: 'var(--wia-blue)',
                          fontSize: '0.74rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px', padding: 0
                        }}
                      >
                        <Edit2 size={11} />
                        {t('menu2.btn_edit_reservation_period', '기간수정')}
                      </button>
                    </div>
                    <strong style={{ fontSize: '0.9rem', color: 'var(--wia-red)' }}>
                      {formatExpiryDateMMM(reserveDetailOrder.reservation_expiry_date)}
                    </strong>
                    {reserveDetailOrder.reservation_expiry_date && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: '6px' }}>
                        ({formatDateToYYYYMMDD(reserveDetailOrder.reservation_expiry_date)})
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* 장비 상세 스펙 카드 */}
              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '12px',
                padding: '16px',
                display: 'flex', flexDirection: 'column', gap: '10px',
                fontSize: '0.84rem'
              }}>
                <div style={{ fontWeight: 700, fontSize: '0.86rem', color: 'var(--text-primary)', marginBottom: '2px' }}>
                  예약 장비 상세 정보
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>모델 / NC</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {reserveDetailOrder.product_model?.model_name || '-'} / {reserveDetailOrder.nc || 'F0iP'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>발주번호 (P/O)</span>
                    <strong style={{ color: 'var(--accent-cyan)' }}>{reserveDetailOrder.reference_no || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>시리얼 번호 (S/N)</span>
                    <strong style={{ color: 'var(--text-primary)' }}>{reserveDetailOrder.serial_number || '-'}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>구매가 (€)</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {reserveDetailOrder.price ? (!isNaN(reserveDetailOrder.price) ? Number(reserveDetailOrder.price).toLocaleString() : reserveDetailOrder.price) : '-'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>진행 상태</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {reserveDetailOrder.current_status ? t(`stepbar.${reserveDetailOrder.current_status.toLowerCase()}`, reserveDetailOrder.current_status) : '-'}
                    </strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block' }}>도착지 / ETA</span>
                    <strong style={{ color: 'var(--text-primary)' }}>
                      {getStandardPort(reserveDetailOrder.destination_port)} / {reserveDetailOrder.eta ? new Date(reserveDetailOrder.eta).toLocaleDateString() : '-'}
                    </strong>
                  </div>
                </div>
                <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border-color)' }}>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem', display: 'block', marginBottom: '2px' }}>옵션 상세 (DETAIL SPEC)</span>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.45 }}>
                    {reserveDetailOrder.detail_spec || 'T/F, CC(S-H)+B, 20BAR, B/I, P/C, Q(A)'}
                  </div>
                </div>
              </div>
            </div>

            {/* 푸터: 좌측 [예약취소], 우측 [판매완료] & [닫기] */}
            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px',
              backgroundColor: 'var(--bg-card)', flexWrap: 'wrap'
            }}>
              <button
                type="button"
                onClick={() => handleCancelReservation(reserveDetailOrder)}
                disabled={cancellingReserve}
                style={{
                  padding: '9px 16px',
                  borderRadius: '8px',
                  border: '1px solid var(--wia-red)',
                  background: 'rgba(230, 0, 18, 0.04)',
                  color: 'var(--wia-red)',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: cancellingReserve ? 'not-allowed' : 'pointer',
                  display: 'inline-flex', alignItems: 'center', gap: '6px',
                  transition: 'all 0.15s'
                }}
              >
                <Trash2 size={15} />
                {cancellingReserve ? '취소 처리 중...' : t('menu2.btn_cancel_reservation', '예약취소')}
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => handleOpenReserveSaleModal(reserveDetailOrder)}
                  style={{
                    padding: '9px 16px',
                    borderRadius: '8px',
                    border: '1px solid var(--status-stock)',
                    background: 'hsla(142, 76%, 46%, 0.1)',
                    color: 'var(--status-stock)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'inline-flex', alignItems: 'center', gap: '6px'
                  }}
                >
                  <CheckCircle2 size={15} />
                  {t('menu2.btn_sold_complete', '판매완료')}
                </button>
                <button
                  type="button"
                  onClick={() => setReserveDetailModalOpen(false)}
                  style={{
                    padding: '9px 18px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-color)',
                    background: 'transparent',
                    color: 'var(--text-secondary)',
                    fontSize: '0.85rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  닫기
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. 예약 장비 판매완료 확정(딜러발주 전환) 팝업 모달 */}
      {reserveSaleModalOpen && reserveSaleOrder && (
        <div
          style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            backdropFilter: 'blur(5px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, padding: '20px'
          }}
          onClick={() => setReserveSaleModalOpen(false)}
        >
          <div
            className="glass-card no-hover-bg"
            style={{
              width: '100%', maxWidth: '480px',
              backgroundColor: 'var(--bg-card, #ffffff)',
              border: '1px solid var(--border-color)',
              borderRadius: '16px',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
              overflow: 'hidden',
              animation: 'modalFadeIn 0.2s ease-out'
            }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '18px 24px',
              borderBottom: '1px solid var(--border-color)',
              background: 'linear-gradient(to right, rgba(22, 196, 127, 0.14), transparent)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '10px',
                  backgroundColor: 'rgba(22, 196, 127, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--status-stock)'
                }}>
                  <ShoppingBag size={20} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                    {t('menu2.modal_reserve_sold_title', '예약 장비 판매완료 확정')}
                  </h3>
                  <p style={{ margin: '2px 0 0 0', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                    {reserveSaleOrder.product_model?.model_name || '장비'} ({reserveSaleOrder.reference_no})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReserveSaleModalOpen(false)}
                style={{
                  background: 'transparent', border: 'none', color: 'var(--text-muted)',
                  cursor: 'pointer', padding: '6px', borderRadius: '8px', display: 'flex'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{
                backgroundColor: 'rgba(22, 196, 127, 0.08)',
                border: '1px solid rgba(22, 196, 127, 0.28)',
                borderRadius: '10px',
                padding: '12px 14px',
                fontSize: '0.83rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5
              }}>
                최종 구매 딜러사를 확인하신 후 <strong>'판매완료 확정'</strong>을 누르시면, 해당 장비는 선택된 딜러사의 확정 발주(주문/배송현황 및 창고 출고 흐름)로 즉시 귀속 전환됩니다.
              </div>

              <div style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                borderRadius: '10px',
                padding: '12px 16px',
                display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px',
                fontSize: '0.84rem'
              }}>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>모델</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{reserveSaleOrder.product_model?.model_name || '-'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>발주번호</span>
                  <strong style={{ color: 'var(--accent-cyan)' }}>{reserveSaleOrder.reference_no || '-'}</strong>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)', display: 'block', fontSize: '0.74rem' }}>예약 딜러</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{reserveSaleOrder.reserved_dealer?.name || '-'}</strong>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.84rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '8px' }}>
                  최종 구매 딜러사 확인
                </label>
                <select
                  value={saleBuyerDealerId}
                  onChange={e => setSaleBuyerDealerId(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'var(--bg-input)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  <option value="">-- 실 구매 딜러사 선택 --</option>
                  {dealers.filter(d => d.name.toUpperCase() !== 'WME').map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.country})</option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{
              padding: '16px 24px',
              borderTop: '1px solid var(--border-color)',
              display: 'flex', justifyContent: 'flex-end', gap: '10px',
              backgroundColor: 'var(--bg-card)'
            }}>
              <button
                type="button"
                onClick={() => setReserveSaleModalOpen(false)}
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
                onClick={handleConfirmReservationSale}
                disabled={confirmingSale}
                className="btn btn-primary"
                style={{
                  padding: '9px 20px',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                  backgroundColor: 'var(--status-stock)',
                  borderColor: 'var(--status-stock)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: confirmingSale ? 'not-allowed' : 'pointer'
                }}
              >
                <CheckCircle2 size={16} />
                {confirmingSale ? '처리 중...' : '판매완료 확정'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 4. 임대 기간 설정 팝업 모달 */}
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
            className="glass-card no-hover-bg"
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
        .reserve-pill-btn {
          padding: 2px 9px;
          font-size: 10px;
          font-weight: 600;
          border-radius: 999px;
          cursor: pointer;
          white-space: nowrap;
          transition: all 0.15s ease;
          font-family: var(--font-body);
          line-height: 1.4;
        }
        .reserve-detail-btn {
          background: var(--bg-card);
          border: 1px solid var(--border-color);
          color: var(--text-secondary);
        }
        .reserve-detail-btn:hover {
          border-color: var(--wia-blue);
          color: var(--wia-blue);
          background: rgba(10, 28, 143, 0.05);
        }
        .reserve-sold-btn {
          background: transparent;
          border: 1px solid var(--status-stock);
          color: var(--status-stock);
        }
        .reserve-sold-btn:hover {
          background: var(--status-stock);
          color: #ffffff;
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
