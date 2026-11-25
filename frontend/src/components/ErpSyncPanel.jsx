import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Sparkles,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Ship,
  Search,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";
import "./ErpSyncPanel.css";

/**
 * ErpSyncPanel.jsx
 * ============================================================================
 * FastAPI `erp_upload_router.py` (/api/erp-sync/preview & /api/erp-sync/apply)
 * 연동용 AI 엑셀 추출 · DB 대조 · 인라인 수정 · 승인 React 컴포넌트
 *
 * 주요 기능:
 * 1. 최신 본사 Sales List (.xlsx) 1개 업로드 -> Render PostgreSQL 현재 DB와 직접 대조(/preview)
 * 2. 체크박스로 반영할 주문 행 개별/일괄 승인 및 제외
 * 3. P/O 중복, S/N 파일내 중복, S/N 타 P/O 점유, S/O 미기입, FK 미등록 등
 *    번호/코드 이상 상태를 시각적 배지로 표시
 * 4. 행별 인라인 수정/보완 패널 + 실시간 클라이언트 재검증으로 충돌 해제 후 즉시 승인 가능
 * 5. 선택된 정상 항목 + 연결 Shipment만 /api/erp-sync/apply 로 단일 트랜잭션 커밋
 * 6. 다국어(EN/KR) 자동 전환 지원 및 WIA CI 디자인 시스템 적용
 */

const EMPTY_TOKENS = new Set([
  "",
  "-",
  "--",
  "//",
  "/",
  "nan",
  "none",
  "nat",
  "null",
  "n/a",
  "tbd",
]);

const PO_REGEX = /^[A-Z0-9][A-Z0-9\-/_]{3,}$/;

function normKey(v) {
  if (v === null || v === undefined) return "";
  return String(v).trim().replace(/\s+/g, " ").toUpperCase();
}

function cleanNullable(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return EMPTY_TOKENS.has(s.toLowerCase()) ? null : s;
}

function cleanSN(v) {
  const s = cleanNullable(v);
  if (!s || s === "0" || s === "0.0" || s.length < 3) return null;
  return s.toUpperCase();
}

function cleanPO(v) {
  const s = cleanNullable(v);
  if (!s) return null;
  const upper = s.toUpperCase();
  if (/^\d+$/.test(upper) || !PO_REGEX.test(upper)) return null;
  return upper;
}

function toDateInputValue(isoOrStr) {
  if (!isoOrStr) return "";
  return String(isoOrStr).slice(0, 10);
}

function fromDateInputValue(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  return `${dateStr}T00:00:00`;
}

export default function ErpSyncPanel({
  apiBaseUrl = "",
  baseUrl = "",
  authHeaders = {},
  onSyncCommitted = null,
}) {
  const { i18n } = useTranslation();
  const isKo = i18n.language?.startsWith("ko");

  const endpointBase = useMemo(() => {
    if (baseUrl) return baseUrl.replace(/\/+$/, "");
    const cleanRoot = (apiBaseUrl || "").replace(/\/+$/, "");
    return `${cleanRoot}/api/erp-sync`;
  }, [apiBaseUrl, baseUrl]);

  // 업로드 상태
  const [excelFile, setExcelFile] = useState(null);
  const [poFilterFile, setPoFilterFile] = useState(null);
  const [poPrefixes, setPoPrefixes] = useState("");
  const [useAi, setUseAi] = useState(false);

  // Preview 데이터 및 편집 상태
  const [previewData, setPreviewData] = useState(null);
  const [editedPayloads, setEditedPayloads] = useState({});
  const [excludedUids, setExcludedUids] = useState({});
  const [selectedUids, setSelectedUids] = useState({});
  const [expandedUid, setExpandedUid] = useState(null);

  // 필터/검색
  const [filterTab, setFilterTab] = useState("ALL");
  const [sectionFilter, setSectionFilter] = useState("ALL");
  const [searchText, setSearchText] = useState("");

  // 실행/결과 상태
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [applying, setApplying] = useState(false);
  const [skipOnConflict, setSkipOnConflict] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [showShipments, setShowShipments] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);
  const [serverConflicts, setServerConflicts] = useState([]);
  const [applyResult, setApplyResult] = useState(null);

  const actionLabel = useMemo(
    () => ({
      CREATE: isKo ? "신규 등록" : "Create",
      UPDATE: isKo ? "기존 수정" : "Update",
      BLOCKED: isKo ? "충돌/차단" : "Blocked",
      EXCLUDED: isKo ? "중복 제외됨" : "Excluded",
    }),
    [isKo]
  );

  const masterOptions = previewData?.master_options || {
    product_models: [],
    dealer_companies: [],
    nc_codes: [],
    port_codes: [],
    order_statuses: [
      "CONFIRMED",
      "IN_PRODUCTION",
      "SHIPPING",
      "ARRIVED",
      "IN_STOCK",
      "DISPATCHED",
      "SOLD",
    ],
    existing_sn_owners: {},
    existing_order_refs: [],
  };

  const modelById = useMemo(() => {
    const map = {};
    for (const m of masterOptions.product_models || []) map[m.id] = m;
    return map;
  }, [masterOptions.product_models]);

  const dealerById = useMemo(() => {
    const map = {};
    for (const d of masterOptions.dealer_companies || []) map[d.id] = d;
    return map;
  }, [masterOptions.dealer_companies]);

  const existingRefSet = useMemo(
    () => new Set((masterOptions.existing_order_refs || []).map(normKey)),
    [masterOptions.existing_order_refs]
  );

  const ncSet = useMemo(
    () => new Set((masterOptions.nc_codes || []).map(normKey)),
    [masterOptions.nc_codes]
  );

  // ---------------------------------------------------------------------------
  // 실시간 클라이언트 재검증 엔진
  // ---------------------------------------------------------------------------
  const evaluatedRows = useMemo(() => {
    const rows = previewData?.preview_rows || [];
    if (!rows.length) return [];

    const poCounts = {};
    const snCounts = {};
    const activeEntries = rows.map((row) => {
      const uid = row.row_uid || `r${row.excel_row}_${row.reference_no}`;
      const isExcluded = Boolean(excludedUids[uid]);
      const base = row.apply_payload || {};
      const payload = editedPayloads[uid] ? { ...base, ...editedPayloads[uid] } : base;
      const refClean = cleanPO(payload.reference_no);
      const snClean = cleanSN(payload.serial_number);
      if (!isExcluded) {
        if (refClean) poCounts[refClean] = (poCounts[refClean] || 0) + 1;
        if (snClean) snCounts[snClean] = (snCounts[snClean] || 0) + 1;
      }
      return { row, uid, isExcluded, payload, refClean, snClean };
    });

    const snOwnerMap = masterOptions.existing_sn_owners || {};

    return activeEntries.map(({ row, uid, isExcluded, payload, refClean, snClean }) => {
      const isEdited = Boolean(editedPayloads[uid]);
      const errors = [];
      const warnings = [];

      if (!isExcluded) {
        if (!refClean) {
          errors.push({
            code: "INVALID_PO",
            field: "reference_no",
            message: isKo
              ? "유효한 P/O 번호(4자 이상 영숫자/하이픈)를 입력해 주세요."
              : "Please enter a valid P/O number (at least 4 alphanumeric/hyphen chars).",
          });
        } else if (poCounts[refClean] > 1) {
          errors.push({
            code: "CONFLICT_DUPLICATE_PO_IN_FILE",
            field: "reference_no",
            message: isKo
              ? `동일 P/O(${refClean})가 활성 목록에 ${poCounts[refClean]}건 존재합니다. P/O를 수정하거나 중복 행 중 하나를 [제외]하세요.`
              : `Duplicate P/O (${refClean}) appears ${poCounts[refClean]} times in active rows. Edit the P/O or exclude one row.`,
          });
        }

        if (snClean && snCounts[snClean] > 1) {
          errors.push({
            code: "CONFLICT_DUPLICATE_SN_IN_FILE",
            field: "serial_number",
            message: isKo
              ? `동일 S/N(${snClean})이 활성 목록에 ${snCounts[snClean]}건 중복됩니다. S/N을 수정/NULL 처리하거나 중복 행을 [제외]하세요.`
              : `Duplicate S/N (${snClean}) appears ${snCounts[snClean]} times. Edit/clear S/N to NULL or exclude the duplicate row.`,
          });
        }

        if (snClean && snOwnerMap[snClean] && normKey(snOwnerMap[snClean]) !== normKey(refClean)) {
          errors.push({
            code: "CONFLICT_SN_OWNED_BY_OTHER_PO",
            field: "serial_number",
            message: isKo
              ? `S/N '${snClean}'은(는) DB의 다른 P/O '${snOwnerMap[snClean]}'에 이미 등록되어 있습니다.`
              : `S/N '${snClean}' is already assigned to another P/O '${snOwnerMap[snClean]}' in DB.`,
          });
        }

        if (!payload.product_model_id) {
          errors.push({
            code: "MISSING_FK_PRODUCT_MODEL",
            field: "product_model_id",
            message: isKo
              ? `기종('${row.model_raw || "공란"}')이 마스터에 미매칭입니다. 아래 드롭다운에서 기종을 선택해 주세요.`
              : `Model '${row.model_raw || "blank"}' is not matched in master data. Select a model in the edit drawer.`,
          });
        }

        if (!payload.dealer_company_id) {
          errors.push({
            code: "MISSING_FK_DEALER_COMPANY",
            field: "dealer_company_id",
            message: isKo
              ? `딜러('${row.dealer_raw || "공란"}')가 마스터에 미매칭입니다. 아래 드롭다운에서 딜러사를 선택해 주세요.`
              : `Dealer '${row.dealer_raw || "blank"}' is not matched in master data. Select a dealer in the edit drawer.`,
          });
        }

        if (!cleanNullable(payload.so_no)) {
          warnings.push({
            code: "MISSING_SO_NO",
            field: "so_no",
            message: isKo ? "S/O 번호 미기입 (보완 권장)" : "S/O No. missing (recommended)",
          });
        }
        if (refClean && !refClean.startsWith("A") && !refClean.startsWith("F")) {
          warnings.push({
            code: "UNUSUAL_PO_PREFIX",
            field: "reference_no",
            message: isKo
              ? "P/O가 A/F로 시작하지 않습니다."
              : "P/O does not start with A or F.",
          });
        }
        const ncClean = cleanNullable(payload.nc);
        if (ncClean && ncSet.size > 0 && !ncSet.has(normKey(ncClean))) {
          warnings.push({
            code: "UNREGISTERED_NC_CODE",
            field: "nc",
            message: isKo
              ? `NC 코드 '${ncClean}' 마스터 미등록`
              : `NC code '${ncClean}' not in master`,
          });
        }
      }

      const intendedAction =
        refClean && existingRefSet.has(normKey(refClean))
          ? "UPDATE"
          : row.intended_action || "CREATE";

      let effectiveAction = intendedAction;
      if (isExcluded) effectiveAction = "EXCLUDED";
      else if (errors.length > 0) effectiveAction = "BLOCKED";

      const wasInitiallyBlocked = row.action === "BLOCKED";
      const isResolved = wasInitiallyBlocked && !isExcluded && errors.length === 0;
      const isDuplicateIssue = errors.some(
        (e) =>
          e.code === "CONFLICT_DUPLICATE_PO_IN_FILE" ||
          e.code === "CONFLICT_DUPLICATE_SN_IN_FILE" ||
          e.code === "CONFLICT_SN_OWNED_BY_OTHER_PO"
      );

      const isCorp = refClean
        ? refClean.startsWith("F")
        : Boolean(payload.is_corporate_stock);
      const normalizedPayload = {
        ...payload,
        action: intendedAction,
        reference_no: refClean || payload.reference_no || "",
        serial_number: snClean,
        so_no: cleanNullable(payload.so_no),
        mbl_no: cleanNullable(payload.mbl_no)?.toUpperCase() || null,
        is_corporate_stock: isCorp,
        stock_type: isCorp
          ? payload.stock_type && payload.stock_type !== "DEALER_ORDER"
            ? payload.stock_type
            : "AVAILABLE"
          : "DEALER_ORDER",
        sales_price: isCorp ? null : cleanNullable(payload.sales_price),
      };

      return {
        uid,
        raw: row,
        payload: normalizedPayload,
        effectiveAction,
        intendedAction,
        isExcluded,
        isEdited,
        isResolved,
        isDuplicateIssue,
        errors,
        warnings,
        canSelect: !isExcluded && errors.length === 0,
      };
    });
  }, [
    previewData,
    editedPayloads,
    excludedUids,
    masterOptions.existing_sn_owners,
    existingRefSet,
    ncSet,
    isKo,
  ]);

  // 요약 집계
  const liveStats = useMemo(() => {
    const s = {
      total: evaluatedRows.length,
      create: 0,
      update: 0,
      blocked: 0,
      duplicates: 0,
      warnings: 0,
      edited: 0,
      excluded: 0,
      selected: 0,
      selectedCreate: 0,
      selectedUpdate: 0,
    };
    for (const r of evaluatedRows) {
      if (r.effectiveAction === "CREATE") s.create += 1;
      else if (r.effectiveAction === "UPDATE") s.update += 1;
      else if (r.effectiveAction === "BLOCKED") s.blocked += 1;
      else if (r.effectiveAction === "EXCLUDED") s.excluded += 1;

      if (r.isDuplicateIssue) s.duplicates += 1;
      if (r.warnings.length > 0 && !r.isExcluded) s.warnings += 1;
      if (r.isEdited) s.edited += 1;

      if (r.canSelect && selectedUids[r.uid]) {
        s.selected += 1;
        if (r.effectiveAction === "CREATE") s.selectedCreate += 1;
        else if (r.effectiveAction === "UPDATE") s.selectedUpdate += 1;
      }
    }
    return s;
  }, [evaluatedRows, selectedUids]);

  // 선택된 주문에 연결된 Shipment 목록 (인라인 수정된 신규 MBL 포함)
  const linkedShipmentsForApply = useMemo(() => {
    const selectedByMbl = new Map();
    for (const r of evaluatedRows) {
      if (r.canSelect && selectedUids[r.uid] && r.payload.mbl_no) {
        const key = normKey(r.payload.mbl_no);
        if (!selectedByMbl.has(key)) selectedByMbl.set(key, r.payload);
      }
    }
    const templateMap = new Map();
    for (const sh of previewData?.apply_request_template?.shipments || []) {
      templateMap.set(normKey(sh.mbl_no), sh);
    }

    const result = [];
    for (const [mblKey, orderPayload] of selectedByMbl.entries()) {
      if (templateMap.has(mblKey)) {
        result.push(templateMap.get(mblKey));
      } else {
        result.push({
          mbl_no: orderPayload.mbl_no,
          carrier: null,
          pol: "KRPUS",
          pod: orderPayload.destination_port || null,
          vessel: orderPayload.vessel || null,
          voyage: null,
          etd: orderPayload.etd || null,
          atd: null,
          eta: orderPayload.eta || null,
        });
      }
    }
    return result;
  }, [evaluatedRows, selectedUids, previewData]);

  // 화면 필터링된 행
  const visibleRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return evaluatedRows.filter((r) => {
      if (sectionFilter !== "ALL" && r.raw.section !== sectionFilter) return false;
      if (filterTab === "BLOCKED" && r.effectiveAction !== "BLOCKED") return false;
      if (filterTab === "DUPLICATES" && !r.isDuplicateIssue) return false;
      if (filterTab === "WARNING" && (r.warnings.length === 0 || r.isExcluded)) return false;
      if (filterTab === "CREATE" && r.effectiveAction !== "CREATE") return false;
      if (filterTab === "UPDATE" && r.effectiveAction !== "UPDATE") return false;
      if (filterTab === "EDITED" && !r.isEdited && !r.isExcluded) return false;

      if (q) {
        const hay = [
          r.payload.reference_no,
          r.payload.so_no,
          r.payload.serial_number,
          r.raw.model_raw,
          r.raw.dealer_raw,
          r.payload.mbl_no,
          r.payload.vessel,
          r.payload.destination_port,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [evaluatedRows, filterTab, sectionFilter, searchText]);

  // ---------------------------------------------------------------------------
  // API 호출 핸들러
  // ---------------------------------------------------------------------------
  const buildPreviewFormData = (downloadExcel = false) => {
    const fd = new FormData();
    fd.append("file", excelFile);
    if (poFilterFile) fd.append("po_filter_file", poFilterFile);
    if (poPrefixes.trim()) fd.append("po_prefixes", poPrefixes.trim());
    fd.append("use_ai", String(useAi));
    fd.append("download_excel", String(downloadExcel));
    return fd;
  };

  const handleRunPreview = async () => {
    if (!excelFile) {
      setErrorBanner(
        isKo
          ? "먼저 본사 Sales List 엑셀 파일(.xlsx)을 선택해 주세요."
          : "Please select an HQ Sales List Excel file (.xlsx) first."
      );
      return;
    }
    setLoadingPreview(true);
    setErrorBanner(null);
    setApplyResult(null);
    setServerConflicts([]);
    try {
      const res = await fetch(`${endpointBase}/preview`, {
        method: "POST",
        headers: { ...authHeaders },
        credentials: "include",
        body: buildPreviewFormData(false),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.detail || `Preview failed (HTTP ${res.status})`);
      }

      const initSelected = {};
      for (const row of data.preview_rows || []) {
        const uid = row.row_uid || `r${row.excel_row}_${row.reference_no}`;
        initSelected[uid] = row.action === "CREATE" || row.action === "UPDATE";
      }
      setPreviewData(data);
      setEditedPayloads({});
      setExcludedUids({});
      setSelectedUids(initSelected);
      setExpandedUid(null);
      setFilterTab("ALL");
    } catch (err) {
      setErrorBanner(
        err.message ||
          (isKo
            ? "DB 대조 미리보기 중 오류가 발생했습니다."
            : "An error occurred during DB comparison preview.")
      );
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownloadPreviewExcel = async () => {
    if (!excelFile) return;
    setDownloadingExcel(true);
    setErrorBanner(null);
    try {
      const res = await fetch(`${endpointBase}/preview`, {
        method: "POST",
        headers: { ...authHeaders },
        credentials: "include",
        body: buildPreviewFormData(true),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.detail || `Download failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ERP_DB_Preview_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorBanner(err.message);
    } finally {
      setDownloadingExcel(false);
    }
  };

  const handleApplyToDb = async () => {
    const approvedOrders = evaluatedRows
      .filter((r) => r.canSelect && selectedUids[r.uid])
      .map((r) => r.payload);

    if (approvedOrders.length === 0) {
      setErrorBanner(
        isKo
          ? "반영할 승인 항목이 선택되지 않았습니다."
          : "No approved rows are selected for DB commit."
      );
      setConfirmOpen(false);
      return;
    }

    setApplying(true);
    setErrorBanner(null);
    setServerConflicts([]);
    try {
      const res = await fetch(`${endpointBase}/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        credentials: "include",
        body: JSON.stringify({
          orders: approvedOrders,
          shipments: linkedShipmentsForApply,
          skip_on_conflict: skipOnConflict,
        }),
      });
      const data = await res.json();
      if (res.status === 409) {
        setServerConflicts(data?.detail?.conflicts || []);
        setErrorBanner(
          data?.detail?.message ||
            (isKo
              ? "실시간 DB 제약조건 충돌이 감지되어 전체 롤백되었습니다."
              : "Real-time DB constraint conflict detected; transaction rolled back.")
        );
        setConfirmOpen(false);
        return;
      }
      if (!res.ok) {
        throw new Error(
          typeof data?.detail === "string"
            ? data.detail
            : `DB apply failed (HTTP ${res.status})`
        );
      }

      setApplyResult(data);
      setConfirmOpen(false);
      if (onSyncCommitted) onSyncCommitted(data);
    } catch (err) {
      setErrorBanner(
        err.message ||
          (isKo ? "DB 반영 중 오류가 발생했습니다." : "An error occurred while committing to DB.")
      );
      setConfirmOpen(false);
    } finally {
      setApplying(false);
    }
  };

  // ---------------------------------------------------------------------------
  // 편집 및 선택 헬퍼
  // ---------------------------------------------------------------------------
  const updateRowField = (uid, field, value) => {
    setEditedPayloads((prev) => {
      const current = prev[uid] || {};
      const next = { ...current, [field]: value };
      if (field === "reference_no") {
        const upper = String(value || "").trim().toUpperCase();
        if (upper.startsWith("F")) {
          next.is_corporate_stock = true;
          next.sales_price = null;
        } else if (upper.startsWith("A")) {
          next.is_corporate_stock = false;
          next.stock_type = "DEALER_ORDER";
        }
      }
      return { ...prev, [uid]: next };
    });
  };

  const resetRowEdits = (uid) => {
    setEditedPayloads((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
    setExcludedUids((prev) => {
      const next = { ...prev };
      delete next[uid];
      return next;
    });
  };

  const toggleExcludeRow = (uid) => {
    setExcludedUids((prev) => {
      const nextVal = !prev[uid];
      if (nextVal) {
        setSelectedUids((sel) => ({ ...sel, [uid]: false }));
      }
      return { ...prev, [uid]: nextVal };
    });
  };

  const toggleSelectRow = (uid, canSelect) => {
    if (!canSelect) return;
    setSelectedUids((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const selectAllVisibleValid = (checked) => {
    setSelectedUids((prev) => {
      const next = { ...prev };
      for (const r of visibleRows) {
        if (r.canSelect) next[r.uid] = checked;
      }
      return next;
    });
  };

  const allVisibleValidSelected = useMemo(() => {
    const validVis = visibleRows.filter((r) => r.canSelect);
    return validVis.length > 0 && validVis.every((r) => selectedUids[r.uid]);
  }, [visibleRows, selectedUids]);

  const kpiCards = [
    {
      id: "ALL",
      label: isKo ? "검수 대상 전체" : "All Review Rows",
      count: liveStats.total,
      tone: "",
    },
    {
      id: "BLOCKED",
      label: isKo ? "충돌/차단" : "Blocked / Conflicts",
      count: liveStats.blocked,
      tone: liveStats.blocked > 0 ? "kpi-rose" : "kpi-muted",
    },
    {
      id: "DUPLICATES",
      label: isKo ? "P/O·S/N 중복" : "P/O · S/N Duplicates",
      count: liveStats.duplicates,
      tone: liveStats.duplicates > 0 ? "kpi-orange" : "kpi-muted",
    },
    {
      id: "WARNING",
      label: isKo ? "경고/미기입" : "Warnings / Missing",
      count: liveStats.warnings,
      tone: "kpi-amber",
    },
    {
      id: "CREATE",
      label: isKo ? "신규 등록" : "New Orders",
      count: liveStats.create,
      tone: "kpi-emerald",
    },
    {
      id: "UPDATE",
      label: isKo ? "기존 수정" : "Updates",
      count: liveStats.update,
      tone: "kpi-blue",
    },
    {
      id: "EDITED",
      label: isKo ? "수정/제외됨" : "Edited / Excluded",
      count: liveStats.edited + liveStats.excluded,
      tone: "kpi-indigo",
    },
  ];

  // ---------------------------------------------------------------------------
  // 렌더링
  // ---------------------------------------------------------------------------
  return (
    <div className="erp-sync-panel">
      {/* 헤더 & 업로드 카드 */}
      <div className="erp-sync-card">
        <div className="erp-sync-header">
          <div className="erp-sync-title-wrap">
            <div className="erp-sync-icon-badge">
              <Sparkles size={22} />
            </div>
            <div>
              <h2 className="erp-sync-title">
                {isKo
                  ? "AI 에이전트 기반 본사 Sales List 동기화 (PostgreSQL 직접 대조)"
                  : "AI HQ Sales List Sync (Direct PostgreSQL Diff & Approval)"}
              </h2>
              <p className="erp-sync-subtitle">
                {isKo
                  ? "최신 본사 엑셀 1개를 업로드하면 Render PostgreSQL 현재 상태와 직접 대조하여 신규·변경·충돌 건을 분리하고, 검수·보완 후 단일 트랜잭션으로 일괄 반영합니다."
                  : "Upload the latest HQ Sales List Excel file to dry-run compare against PostgreSQL, resolve conflicts inline, and commit approved records atomically."}
              </p>
            </div>
          </div>

          {previewData?.parse_meta && (
            <div className="erp-sync-meta-pill">
              <strong>{isKo ? "감지된 시트:" : "Detected Sheet:"}</strong>{" "}
              {previewData.parse_meta.sheet_name} (
              {isKo
                ? `${previewData.parse_meta.header_row}행 헤더 / ${previewData.parse_meta.total_cols}열 / 유효 P/O ${previewData.parse_meta.total_po_rows}건`
                : `Row ${previewData.parse_meta.header_row} Header / ${previewData.parse_meta.total_cols} Cols / ${previewData.parse_meta.total_po_rows} P/Os`}
              )
              {previewData.parse_meta.ai_inferred_fields?.length > 0 && (
                <span className="erp-sync-ai-tag">
                  <Sparkles size={11} />
                  {isKo
                    ? `AI 추론: ${previewData.parse_meta.ai_inferred_fields.join(", ")}`
                    : `AI Mapped: ${previewData.parse_meta.ai_inferred_fields.join(", ")}`}
                </span>
              )}
            </div>
          )}
        </div>

        {/* 파일 및 옵션 입력 */}
        <div className="erp-sync-upload-grid">
          <div className="erp-sync-col-4">
            <label className="erp-sync-field-label">
              {isKo
                ? "1. 최신 본사 Sales List 엑셀 (.xlsx) *"
                : "1. Latest HQ Sales List Excel (.xlsx) *"}
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
              className="erp-sync-file-input"
            />
          </div>

          <div className="erp-sync-col-3">
            <label className="erp-sync-field-label">
              {isKo
                ? "2. (선택) 기준 P/O 목록 파일"
                : "2. (Optional) Target P/O Filter File"}
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={(e) => setPoFilterFile(e.target.files?.[0] || null)}
              className="erp-sync-file-input secondary"
            />
          </div>

          <div className="erp-sync-col-2">
            <label className="erp-sync-field-label">
              {isKo ? "3. (선택) P/O 접두어" : "3. (Optional) P/O Prefixes"}
            </label>
            <input
              type="text"
              value={poPrefixes}
              onChange={(e) => setPoPrefixes(e.target.value)}
              placeholder={isKo ? "예: A26-,F26-" : "e.g. A26-,F26-"}
              className="erp-sync-text-input"
            />
          </div>

          <div className="erp-sync-col-3">
            <label className="erp-sync-check-label">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
              />
              <span>
                {isKo
                  ? "미매칭 신규 헤더 Gemini AI 추론"
                  : "Use Gemini AI for unmapped headers"}
              </span>
            </label>
            <div className="erp-sync-btn-row">
              <button
                type="button"
                onClick={handleRunPreview}
                disabled={loadingPreview || !excelFile}
                className="erp-sync-btn erp-sync-btn-primary"
              >
                <FileSpreadsheet size={15} />
                <span>
                  {loadingPreview
                    ? isKo
                      ? "DB 대조 분석 중..."
                      : "Analyzing vs DB..."
                    : isKo
                    ? "DB 대조 미리보기"
                    : "Preview DB Diff"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPreviewExcel}
                disabled={downloadingExcel || !excelFile}
                className="erp-sync-btn erp-sync-btn-outline"
                title={isKo ? "검수용 엑셀 다운로드" : "Download Review Report (.xlsx)"}
              >
                <Download size={14} />
                <span>{downloadingExcel ? "..." : isKo ? "검수 .xlsx" : "Report"}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 오류 / 서버 409 충돌 배너 */}
      {errorBanner && (
        <div className="erp-sync-banner error">
          <div className="erp-sync-banner-title">
            <AlertTriangle size={15} />
            <span>{isKo ? "오류 / 충돌 알림" : "Error / Conflict Alert"}</span>
          </div>
          <p style={{ margin: "4px 0 0" }}>{errorBanner}</p>
          {serverConflicts.length > 0 && (
            <ul className="erp-sync-conflict-list">
              {serverConflicts.map((c, i) => (
                <li key={i}>
                  <strong>{c.reference_no}</strong> [{c.code}]: {c.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 커밋 성공 배너 */}
      {applyResult && (
        <div className="erp-sync-banner success">
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
            }}
          >
            <div className="erp-sync-banner-title">
              <CheckCircle2 size={16} />
              <span>
                {isKo
                  ? "PostgreSQL 트랜잭션 반영 완료"
                  : "PostgreSQL Atomic Commit Completed"}
              </span>
              <span style={{ fontWeight: 500, opacity: 0.8 }}>
                ({applyResult.committed_at})
              </span>
            </div>
            <div style={{ display: "flex", gap: "14px", fontWeight: 700 }}>
              <span>
                {isKo ? "신규 생성:" : "Created:"} {applyResult.orders_created}
              </span>
              <span>
                {isKo ? "기존 수정:" : "Updated:"} {applyResult.orders_updated}
              </span>
              <span>
                {isKo ? "선적(MBL) Upsert:" : "Shipments:"}{" "}
                {applyResult.shipments_upserted}
              </span>
            </div>
          </div>
          {applyResult.skipped_conflicts?.length > 0 && (
            <p style={{ margin: "6px 0 0", color: "#92400e" }}>
              {isKo
                ? `* skip_on_conflict 옵션으로 제외된 충돌 건: ${applyResult.skipped_conflicts.length}건`
                : `* Skipped due to skip_on_conflict: ${applyResult.skipped_conflicts.length} row(s)`}
            </p>
          )}
        </div>
      )}

      {/* Preview 결과 영역 */}
      {previewData && (
        <>
          {/* 7종 KPI 필터 카드 */}
          <div className="erp-sync-kpi-grid">
            {kpiCards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => setFilterTab(card.id)}
                className={`erp-sync-kpi-card ${card.tone} ${
                  filterTab === card.id ? "active" : ""
                }`}
              >
                <div className="erp-sync-kpi-label">{card.label}</div>
                <div className="erp-sync-kpi-val">
                  {card.count}
                  {isKo ? "건" : ""}
                </div>
              </button>
            ))}
          </div>

          {/* P/O 공란 자동 제외 경보 */}
          {previewData.parse_meta?.skipped_missing_po_rows?.length > 0 && (
            <div className="erp-sync-banner warning">
              <strong>
                {isKo
                  ? `P/O 공란 행 감지 (${previewData.parse_meta.skipped_missing_po_rows.length}건):`
                  : `Blank P/O Rows Skipped (${previewData.parse_meta.skipped_missing_po_rows.length}):`}
              </strong>{" "}
              {previewData.parse_meta.skipped_missing_po_rows
                .map(
                  (x) =>
                    `${isKo ? `${x.excel_row}행` : `Row ${x.excel_row}`}(S/O ${x.so_no}, ${
                      x.model || "-"
                    }, ${x.section})`
                )
                .join(" / ")}{" "}
              —{" "}
              {isKo
                ? "P/O가 비어 있어 자동 제외되었습니다. 본사 오삭제 여부를 확인하세요."
                : "Excluded automatically because P/O is empty. Verify whether HQ deleted it accidentally."}
            </div>
          )}

          {/* 툴바 */}
          <div className="erp-sync-toolbar">
            <div className="erp-sync-toolbar-group">
              <select
                value={sectionFilter}
                onChange={(e) => setSectionFilter(e.target.value)}
                className="erp-sync-select"
                style={{ width: "175px" }}
              >
                <option value="ALL">{isKo ? "전체 섹션" : "All Sections"}</option>
                <option value="SHIPPED">SHIPPED</option>
                <option value="SHIPMENT PLAN">SHIPMENT PLAN</option>
                <option value="BACK LOG">BACK LOG</option>
                <option value="HWME STOCK ORDER">HWME STOCK ORDER</option>
              </select>

              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  color="#94a3b8"
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                  }}
                />
                <input
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder={
                    isKo
                      ? "P/O, S/O, S/N, 기종, 딜러, MBL 검색..."
                      : "Search P/O, S/O, S/N, Model, Dealer, MBL..."
                  }
                  className="erp-sync-text-input"
                  style={{ width: "260px", paddingLeft: "30px" }}
                />
              </div>

              <span style={{ fontSize: "0.78rem", color: "#64748b" }}>
                {isKo ? (
                  <>
                    표시: <strong>{visibleRows.length}</strong>건 (DB 변동 없음{" "}
                    {previewData.summary?.no_change_count || 0}건 생략)
                  </>
                ) : (
                  <>
                    Showing: <strong>{visibleRows.length}</strong> (
                    {previewData.summary?.no_change_count || 0} unchanged hidden)
                  </>
                )}
              </span>
            </div>

            <div className="erp-sync-toolbar-group">
              <button
                type="button"
                onClick={() => selectAllVisibleValid(true)}
                className="erp-sync-btn erp-sync-btn-outline erp-sync-btn-sm"
              >
                {isKo ? "표시 정상 건 전체 선택" : "Select All Valid"}
              </button>
              <button
                type="button"
                onClick={() => selectAllVisibleValid(false)}
                className="erp-sync-btn erp-sync-btn-outline erp-sync-btn-sm"
              >
                {isKo ? "선택 해제" : "Deselect All"}
              </button>
              <button
                type="button"
                onClick={() => setShowShipments((v) => !v)}
                className="erp-sync-btn erp-sync-btn-blue-soft erp-sync-btn-sm"
              >
                <Ship size={14} />
                <span>
                  {isKo
                    ? `연결 선적(MBL) ${linkedShipmentsForApply.length}건 ${
                        showShipments ? "접기" : "보기"
                      }`
                    : `Linked MBLs (${linkedShipmentsForApply.length}) ${
                        showShipments ? "Hide" : "Show"
                      }`}
                </span>
              </button>
            </div>
          </div>

          {/* 연결 Shipment 미리보기 */}
          {showShipments && (
            <div className="erp-sync-shipments-box">
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "#1e3a8a" }}>
                {isKo
                  ? `함께 Upsert될 Master B/L 목록 (${linkedShipmentsForApply.length}건 — 선택된 주문과 자동 연동)`
                  : `Master B/Ls to Upsert (${linkedShipmentsForApply.length} — auto-linked to selected orders)`}
              </div>
              {linkedShipmentsForApply.length === 0 ? (
                <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "#64748b" }}>
                  {isKo
                    ? "선택된 주문에 연결된 신규/변경 Master B/L이 없습니다."
                    : "No new or updated Master B/Ls linked to the currently selected orders."}
                </p>
              ) : (
                <div className="erp-sync-shipments-table-wrap">
                  <table className="erp-sync-table">
                    <thead>
                      <tr>
                        <th>MBL NO</th>
                        <th>{isKo ? "선사" : "Carrier"}</th>
                        <th>POL → POD</th>
                        <th>{isKo ? "선박 / 항차" : "Vessel / Voyage"}</th>
                        <th>ETD / ETA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {linkedShipmentsForApply.map((sh) => (
                        <tr key={sh.mbl_no}>
                          <td className="erp-sync-mono" style={{ fontWeight: 700 }}>
                            {sh.mbl_no}
                          </td>
                          <td>{sh.carrier || "-"}</td>
                          <td>
                            {sh.pol || "KRPUS"} → {sh.pod || "-"}
                          </td>
                          <td>
                            {sh.vessel || "-"} {sh.voyage ? `(${sh.voyage})` : ""}
                          </td>
                          <td className="erp-sync-mono">
                            {toDateInputValue(sh.etd) || "-"} /{" "}
                            {toDateInputValue(sh.eta) || "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 메인 검수·승인 테이블 */}
          <div className="erp-sync-table-card">
            <div className="erp-sync-table-scroll">
              <table className="erp-sync-table">
                <thead>
                  <tr>
                    <th style={{ width: "44px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={allVisibleValidSelected}
                        onChange={(e) => selectAllVisibleValid(e.target.checked)}
                        title={
                          isKo
                            ? "표시된 정상 건 전체 선택/해제"
                            : "Select/deselect all valid visible rows"
                        }
                      />
                    </th>
                    <th>{isKo ? "상태 / 섹션" : "Status / Section"}</th>
                    <th>{isKo ? "P/O (reference_no) & S/O" : "P/O & S/O"}</th>
                    <th>{isKo ? "S/N (호기) 상태" : "S/N Status"}</th>
                    <th>{isKo ? "기종 / 딜러 (FK)" : "Model / Dealer (FK)"}</th>
                    <th>{isKo ? "선적 (MBL / 선박 / ETD)" : "Shipment (MBL / ETD)"}</th>
                    <th>
                      {isKo
                        ? "변경 내역 (DB → Excel) & 이상 경보"
                        : "Diff (DB → Excel) & Alerts"}
                    </th>
                    <th style={{ width: "118px", textAlign: "center" }}>
                      {isKo ? "수정 / 보완" : "Edit / Fix"}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={8}
                        style={{
                          padding: "40px 16px",
                          textAlign: "center",
                          color: "#94a3b8",
                        }}
                      >
                        {isKo
                          ? "조건에 해당하는 검수 항목이 없습니다."
                          : "No review rows match the current filter."}
                      </td>
                    </tr>
                  ) : (
                    visibleRows.map((item) => {
                      const {
                        uid,
                        raw,
                        payload,
                        effectiveAction,
                        errors,
                        warnings,
                        canSelect,
                        isExcluded,
                      } = item;
                      const isChecked = canSelect && Boolean(selectedUids[uid]);
                      const isExpanded = expandedUid === uid;
                      const poError = errors.find((e) => e.field === "reference_no");
                      const snError = errors.find((e) => e.field === "serial_number");
                      const modelError = errors.find(
                        (e) => e.field === "product_model_id"
                      );
                      const dealerError = errors.find(
                        (e) => e.field === "dealer_company_id"
                      );

                      const rowClass = isExcluded
                        ? "row-excluded"
                        : effectiveAction === "BLOCKED"
                        ? "row-blocked"
                        : item.isResolved
                        ? "row-resolved"
                        : isChecked
                        ? ""
                        : "row-unchecked";

                      return (
                        <React.Fragment key={uid}>
                          <tr className={`row-data ${rowClass}`}>
                            {/* 승인 체크박스 */}
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={isChecked}
                                disabled={!canSelect}
                                onChange={() => toggleSelectRow(uid, canSelect)}
                                title={
                                  canSelect
                                    ? isKo
                                      ? "체크 시 /apply 반영 대상에 포함"
                                      : "Include in /apply commit"
                                    : isKo
                                    ? "충돌/오류를 수정하거나 중복 행을 제외해야 선택 가능"
                                    : "Resolve errors or exclude duplicate row first"
                                }
                              />
                              <div
                                style={{
                                  marginTop: "4px",
                                  fontSize: "0.66rem",
                                  color: "#94a3b8",
                                }}
                              >
                                #{raw.excel_row}
                              </div>
                            </td>

                            {/* 상태 및 섹션 */}
                            <td>
                              <span className={`erp-sync-badge ${effectiveAction}`}>
                                {actionLabel[effectiveAction]}
                              </span>
                              {item.isResolved && (
                                <div
                                  style={{
                                    marginTop: "3px",
                                    fontSize: "0.68rem",
                                    fontWeight: 700,
                                    color: "#047857",
                                  }}
                                >
                                  ✓ {isKo ? "충돌 해결됨" : "Resolved"}
                                </div>
                              )}
                              {item.isEdited && !isExcluded && (
                                <div
                                  style={{
                                    marginTop: "2px",
                                    fontSize: "0.68rem",
                                    fontWeight: 600,
                                    color: "#4f46e5",
                                  }}
                                >
                                  ✎ {isKo ? "수동 보완됨" : "Edited"}
                                </div>
                              )}
                              <div
                                style={{
                                  marginTop: "4px",
                                  fontSize: "0.68rem",
                                  color: "#64748b",
                                }}
                              >
                                {raw.section}
                              </div>
                            </td>

                            {/* P/O & S/O */}
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <span
                                  className={`erp-sync-mono ${
                                    poError ? "erp-sync-wavy-err" : ""
                                  }`}
                                  style={{ fontWeight: 800, color: poError ? undefined : "#0f172a" }}
                                >
                                  {payload.reference_no ||
                                    (isKo ? "(P/O 공란)" : "(Blank P/O)")}
                                </span>
                                <span
                                  className={`erp-sync-chip ${
                                    payload.is_corporate_stock ? "corp" : "dealer"
                                  }`}
                                >
                                  {payload.is_corporate_stock
                                    ? isKo
                                      ? "F 법인재고"
                                      : "F Stock"
                                    : isKo
                                    ? "A 딜러주문"
                                    : "A Dealer"}
                                </span>
                              </div>
                              {poError && (
                                <div style={{ marginTop: "4px" }}>
                                  <span className="erp-sync-chip rose">
                                    ⚠ {isKo ? "P/O 충돌" : "P/O Conflict"}
                                  </span>
                                </div>
                              )}
                              <div
                                style={{
                                  marginTop: "5px",
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "5px",
                                  fontSize: "0.74rem",
                                  color: "#475569",
                                }}
                              >
                                <span>S/O:</span>
                                {payload.so_no ? (
                                  <span className="erp-sync-mono">{payload.so_no}</span>
                                ) : (
                                  <span className="erp-sync-chip amber">
                                    {isKo ? "미기입" : "Missing"}
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* S/N 상태 */}
                            <td>
                              {payload.serial_number ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                                  <span
                                    className={`erp-sync-mono ${
                                      snError ? "erp-sync-wavy-err" : ""
                                    }`}
                                    style={{ fontWeight: 700 }}
                                  >
                                    {payload.serial_number}
                                  </span>
                                  {snError ? (
                                    <span className="erp-sync-chip rose">
                                      ⚠{" "}
                                      {snError.code === "CONFLICT_SN_OWNED_BY_OTHER_PO"
                                        ? isKo
                                          ? "타 P/O 점유"
                                          : "Owned by Other P/O"
                                        : isKo
                                        ? "파일내 S/N 중복"
                                        : "Dup S/N in File"}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: "0.68rem", color: "#059669" }}>
                                      ● {isKo ? "정상" : "Valid"}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="erp-sync-chip slate erp-sync-mono">
                                  {isKo ? "NULL (미배정)" : "NULL (Unassigned)"}
                                </span>
                              )}
                            </td>

                            {/* 기종 / 딜러 FK */}
                            <td>
                              <div style={{ fontWeight: 700, color: "#1e293b" }}>
                                {payload.product_model_id &&
                                modelById[payload.product_model_id]
                                  ? modelById[payload.product_model_id].model_code
                                  : raw.model_raw || (isKo ? "(기종 없음)" : "(No Model)")}
                                {modelError && (
                                  <span
                                    className="erp-sync-chip rose"
                                    style={{ marginLeft: "5px" }}
                                  >
                                    {isKo ? "미등록" : "Unmatched"}
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  marginTop: "3px",
                                  fontSize: "0.74rem",
                                  color: "#64748b",
                                }}
                              >
                                {payload.dealer_company_id &&
                                dealerById[payload.dealer_company_id]
                                  ? dealerById[payload.dealer_company_id].name
                                  : raw.dealer_raw ||
                                    (isKo ? "(딜러 없음)" : "(No Dealer)")}
                                {dealerError && (
                                  <span
                                    className="erp-sync-chip rose"
                                    style={{ marginLeft: "5px" }}
                                  >
                                    {isKo ? "미등록" : "Unmatched"}
                                  </span>
                                )}
                              </div>
                              {(payload.nc || payload.price) && (
                                <div
                                  style={{
                                    marginTop: "3px",
                                    fontSize: "0.68rem",
                                    color: "#94a3b8",
                                  }}
                                >
                                  NC: {payload.nc || "-"} /{" "}
                                  {payload.price
                                    ? `€${Number(payload.price).toLocaleString()}`
                                    : "-"}
                                </div>
                              )}
                            </td>

                            {/* 선적 정보 */}
                            <td>
                              <div
                                className="erp-sync-mono"
                                style={{ fontWeight: 700, fontSize: "0.75rem" }}
                              >
                                {payload.mbl_no || (
                                  <span style={{ fontWeight: 400, color: "#94a3b8" }}>
                                    {isKo ? "MBL 미부여" : "No MBL"}
                                  </span>
                                )}
                              </div>
                              <div
                                style={{
                                  marginTop: "3px",
                                  fontSize: "0.73rem",
                                  color: "#475569",
                                }}
                              >
                                {payload.destination_port || "-"} · ETD{" "}
                                {toDateInputValue(payload.etd) || "-"}
                              </div>
                              {payload.vessel && (
                                <div
                                  style={{
                                    marginTop: "2px",
                                    maxWidth: "180px",
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    fontSize: "0.68rem",
                                    color: "#94a3b8",
                                  }}
                                  title={payload.vessel}
                                >
                                  {payload.vessel}
                                </div>
                              )}
                            </td>

                            {/* Diff & 오류/경고 */}
                            <td style={{ maxWidth: "360px" }}>
                              {errors.map((e, idx) => (
                                <div key={idx} className="erp-sync-err-box">
                                  <strong>[{isKo ? "차단" : "BLOCKED"}]</strong>{" "}
                                  {e.message}
                                </div>
                              ))}

                              {Object.keys(raw.diffs || {}).length > 0 && (
                                <div className="erp-sync-diff-wrap">
                                  {Object.entries(raw.diffs).map(([k, v]) => (
                                    <span key={k} className="erp-sync-diff-pill">
                                      <strong>{k}:</strong>
                                      <span className="erp-sync-diff-old">
                                        {v.db ?? "∅"}
                                      </span>
                                      <span>→</span>
                                      <span className="erp-sync-diff-new">
                                        {v.excel ?? "∅"}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              )}

                              {warnings.length > 0 && (
                                <div
                                  className="erp-sync-diff-wrap"
                                  style={{ marginTop: "4px" }}
                                >
                                  {warnings.map((w, idx) => (
                                    <span key={idx} className="erp-sync-chip amber">
                                      △ {w.message}
                                    </span>
                                  ))}
                                </div>
                              )}

                              {(raw.hq_extra?.packing ||
                                raw.hq_extra?.dual_item ||
                                raw.hq_extra?.invoice_ec) && (
                                <div
                                  style={{
                                    marginTop: "4px",
                                    fontSize: "0.68rem",
                                    color: "#94a3b8",
                                  }}
                                >
                                  {isKo ? "참고" : "Extra"}: PACKING=
                                  {raw.hq_extra.packing || "-"} | DUAL=
                                  {raw.hq_extra.dual_item || "-"} | INV=
                                  {raw.hq_extra.invoice_ec || "-"}
                                </div>
                              )}
                            </td>

                            {/* 액션 버튼 */}
                            <td style={{ textAlign: "center" }}>
                              <div
                                style={{
                                  display: "flex",
                                  flexDirection: "column",
                                  gap: "5px",
                                }}
                              >
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedUid(isExpanded ? null : uid)
                                  }
                                  className={`erp-sync-btn erp-sync-btn-sm ${
                                    effectiveAction === "BLOCKED"
                                      ? "erp-sync-btn-danger"
                                      : "erp-sync-btn-outline"
                                  }`}
                                >
                                  {isExpanded
                                    ? isKo
                                      ? "닫기"
                                      : "Close"
                                    : isKo
                                    ? "수정/보완"
                                    : "Edit / Fix"}
                                </button>
                                {(item.isDuplicateIssue || isExcluded) && (
                                  <button
                                    type="button"
                                    onClick={() => toggleExcludeRow(uid)}
                                    className={`erp-sync-btn erp-sync-btn-sm ${
                                      isExcluded
                                        ? "erp-sync-btn-dark"
                                        : "erp-sync-btn-orange-soft"
                                    }`}
                                  >
                                    {isExcluded
                                      ? isKo
                                        ? "제외 해제"
                                        : "Restore"
                                      : isKo
                                      ? "중복 행 제외"
                                      : "Exclude Row"}
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>

                          {/* 인라인 수정/보완 드로어 */}
                          {isExpanded && (
                            <tr>
                              <td colSpan={8} className="erp-sync-drawer-cell">
                                <div className="erp-sync-drawer-head">
                                  <div style={{ fontSize: "0.8rem", fontWeight: 700 }}>
                                    {isKo
                                      ? `행 #${raw.excel_row} 인라인 수정 / 이상치 보완`
                                      : `Row #${raw.excel_row} Inline Edit & Conflict Resolution`}
                                    <span
                                      style={{
                                        marginLeft: "8px",
                                        fontWeight: 400,
                                        color: "#64748b",
                                        fontSize: "0.74rem",
                                      }}
                                    >
                                      {isKo
                                        ? "(값 변경 시 중복·충돌 여부가 실시간 재검증됩니다)"
                                        : "(Changes are re-validated in real time)"}
                                    </span>
                                  </div>
                                  <div style={{ display: "flex", gap: "8px" }}>
                                    <button
                                      type="button"
                                      onClick={() => resetRowEdits(uid)}
                                      className="erp-sync-btn erp-sync-btn-outline erp-sync-btn-sm"
                                    >
                                      <RotateCcw size={12} />
                                      <span>{isKo ? "원본 복원" : "Reset"}</span>
                                    </button>
                                    {canSelect && !selectedUids[uid] && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setSelectedUids((s) => ({ ...s, [uid]: true }));
                                          setExpandedUid(null);
                                        }}
                                        className="erp-sync-btn erp-sync-btn-emerald erp-sync-btn-sm"
                                      >
                                        {isKo ? "승인 체크 후 닫기" : "Approve & Close"}
                                      </button>
                                    )}
                                  </div>
                                </div>

                                <div className="erp-sync-drawer-grid">
                                  {/* P/O */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      P/O (reference_no) *
                                    </label>
                                    <input
                                      type="text"
                                      value={payload.reference_no || ""}
                                      onChange={(e) =>
                                        updateRowField(uid, "reference_no", e.target.value)
                                      }
                                      className={`erp-sync-drawer-input erp-sync-mono ${
                                        poError ? "has-error" : ""
                                      }`}
                                    />
                                  </div>

                                  {/* S/N + NULL 비우기 */}
                                  <div>
                                    <div
                                      style={{
                                        display: "flex",
                                        justifyContent: "space-between",
                                        alignItems: "center",
                                        marginBottom: "6px",
                                      }}
                                    >
                                      <label
                                        className="erp-sync-field-label"
                                        style={{ marginBottom: 0 }}
                                      >
                                        {isKo ? "S/N (호기)" : "S/N"}
                                      </label>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateRowField(uid, "serial_number", null)
                                        }
                                        style={{
                                          background: "none",
                                          border: "none",
                                          padding: 0,
                                          color: "#2563eb",
                                          fontSize: "0.7rem",
                                          fontWeight: 700,
                                          cursor: "pointer",
                                        }}
                                      >
                                        {isKo ? "NULL로 비우기" : "Clear to NULL"}
                                      </button>
                                    </div>
                                    <input
                                      type="text"
                                      value={payload.serial_number || ""}
                                      placeholder={
                                        isKo ? "미배정 시 공란(NULL)" : "Blank = NULL"
                                      }
                                      onChange={(e) =>
                                        updateRowField(uid, "serial_number", e.target.value)
                                      }
                                      className={`erp-sync-drawer-input erp-sync-mono ${
                                        snError ? "has-error" : ""
                                      }`}
                                    />
                                  </div>

                                  {/* S/O */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo ? "S/O 번호" : "S/O No."}
                                    </label>
                                    <input
                                      type="text"
                                      value={payload.so_no || ""}
                                      placeholder={isKo ? "예: 2815166" : "e.g. 2815166"}
                                      onChange={(e) =>
                                        updateRowField(uid, "so_no", e.target.value)
                                      }
                                      className="erp-sync-drawer-input erp-sync-mono"
                                    />
                                  </div>

                                  {/* ProductModel FK */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo ? "기종 마스터 (FK) *" : "Model Master (FK) *"}
                                    </label>
                                    <select
                                      value={payload.product_model_id || ""}
                                      onChange={(e) =>
                                        updateRowField(
                                          uid,
                                          "product_model_id",
                                          e.target.value ? Number(e.target.value) : null
                                        )
                                      }
                                      className={`erp-sync-drawer-select ${
                                        modelError ? "has-error" : ""
                                      }`}
                                    >
                                      <option value="">
                                        {isKo
                                          ? `-- 기종 선택 (원본: ${raw.model_raw || "-"}) --`
                                          : `-- Select Model (Raw: ${raw.model_raw || "-"}) --`}
                                      </option>
                                      {(masterOptions.product_models || []).map((pm) => (
                                        <option key={pm.id} value={pm.id}>
                                          {pm.model_code}
                                          {pm.model_name && pm.model_name !== pm.model_code
                                            ? ` (${pm.model_name})`
                                            : ""}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* DealerCompany FK */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo
                                        ? "딜러사 마스터 (FK) *"
                                        : "Dealer Master (FK) *"}
                                    </label>
                                    <select
                                      value={payload.dealer_company_id || ""}
                                      onChange={(e) =>
                                        updateRowField(
                                          uid,
                                          "dealer_company_id",
                                          e.target.value ? Number(e.target.value) : null
                                        )
                                      }
                                      className={`erp-sync-drawer-select ${
                                        dealerError ? "has-error" : ""
                                      }`}
                                    >
                                      <option value="">
                                        {isKo
                                          ? `-- 딜러 선택 (원본: ${raw.dealer_raw || "-"}) --`
                                          : `-- Select Dealer (Raw: ${raw.dealer_raw || "-"}) --`}
                                      </option>
                                      {(masterOptions.dealer_companies || []).map((dc) => (
                                        <option key={dc.id} value={dc.id}>
                                          {dc.name}
                                          {dc.sap_code ? ` [${dc.sap_code}]` : ""}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* OrderStatus */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo ? "주문 상태" : "Order Status"}
                                    </label>
                                    <select
                                      value={payload.current_status || "CONFIRMED"}
                                      onChange={(e) =>
                                        updateRowField(
                                          uid,
                                          "current_status",
                                          e.target.value
                                        )
                                      }
                                      className="erp-sync-drawer-select"
                                    >
                                      {(masterOptions.order_statuses || []).map((st) => (
                                        <option key={st} value={st}>
                                          {st}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  {/* MBL NO */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      Master B/L (MBL)
                                    </label>
                                    <input
                                      type="text"
                                      value={payload.mbl_no || ""}
                                      onChange={(e) =>
                                        updateRowField(uid, "mbl_no", e.target.value)
                                      }
                                      className="erp-sync-drawer-input erp-sync-mono"
                                    />
                                  </div>

                                  {/* Vessel */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo ? "선박명 (Vessel)" : "Vessel"}
                                    </label>
                                    <input
                                      type="text"
                                      value={payload.vessel || ""}
                                      onChange={(e) =>
                                        updateRowField(uid, "vessel", e.target.value)
                                      }
                                      className="erp-sync-drawer-input"
                                    />
                                  </div>

                                  {/* Destination Port */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo ? "도착항 (Port)" : "Destination Port"}
                                    </label>
                                    <input
                                      type="text"
                                      value={payload.destination_port || ""}
                                      onChange={(e) =>
                                        updateRowField(
                                          uid,
                                          "destination_port",
                                          e.target.value
                                        )
                                      }
                                      className="erp-sync-drawer-input"
                                    />
                                  </div>

                                  {/* ETD */}
                                  <div>
                                    <label className="erp-sync-field-label">ETD</label>
                                    <input
                                      type="date"
                                      value={toDateInputValue(payload.etd)}
                                      onChange={(e) =>
                                        updateRowField(
                                          uid,
                                          "etd",
                                          fromDateInputValue(e.target.value)
                                        )
                                      }
                                      className="erp-sync-drawer-input"
                                    />
                                  </div>

                                  {/* NC */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo ? "NC 코드" : "NC Code"}
                                    </label>
                                    <input
                                      type="text"
                                      value={payload.nc || ""}
                                      onChange={(e) =>
                                        updateRowField(uid, "nc", e.target.value)
                                      }
                                      className="erp-sync-drawer-input erp-sync-mono"
                                    />
                                  </div>

                                  {/* Buying Price */}
                                  <div>
                                    <label className="erp-sync-field-label">
                                      {isKo
                                        ? "구매가 (FINAL / EUR)"
                                        : "Buying Price (EUR)"}
                                    </label>
                                    <input
                                      type="text"
                                      value={payload.price || ""}
                                      onChange={(e) =>
                                        updateRowField(uid, "price", e.target.value)
                                      }
                                      className="erp-sync-drawer-input erp-sync-mono"
                                    />
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
          </div>

          {/* 하단 고정 승인 바 */}
          <div className="erp-sync-sticky-bar">
            <div className="erp-sync-sticky-info">
              <span>
                {isKo ? "승인 선택:" : "Approved:"}{" "}
                <strong style={{ fontSize: "1rem", color: "#34d399" }}>
                  {liveStats.selected}
                  {isKo ? "건" : ""}
                </strong>
                <span style={{ marginLeft: "6px", color: "#cbd5e1" }}>
                  (
                  {isKo
                    ? `신규 ${liveStats.selectedCreate} / 수정 ${liveStats.selectedUpdate} / 선적 ${linkedShipmentsForApply.length}`
                    : `Create ${liveStats.selectedCreate} / Update ${liveStats.selectedUpdate} / MBL ${linkedShipmentsForApply.length}`}
                  )
                </span>
              </span>

              {liveStats.blocked > 0 && (
                <span
                  style={{
                    background: "rgba(244, 63, 94, 0.22)",
                    color: "#fecdd3",
                    padding: "3px 9px",
                    borderRadius: "6px",
                    fontSize: "0.74rem",
                  }}
                >
                  {isKo
                    ? `미해결 차단 ${liveStats.blocked}건은 반영 제외됨`
                    : `${liveStats.blocked} unresolved blocked row(s) excluded`}
                </span>
              )}

              <label
                className="erp-sync-check-label"
                style={{ color: "#cbd5e1", fontSize: "0.76rem" }}
              >
                <input
                  type="checkbox"
                  checked={skipOnConflict}
                  onChange={(e) => setSkipOnConflict(e.target.checked)}
                />
                <span>
                  {isKo
                    ? "실시간 충돌 시 정상 건만 커밋 (skip_on_conflict)"
                    : "Commit valid rows only on conflict (skip_on_conflict)"}
                </span>
              </label>
            </div>

            <button
              type="button"
              disabled={liveStats.selected === 0 || applying}
              onClick={() => setConfirmOpen(true)}
              className="erp-sync-btn erp-sync-btn-emerald"
              style={{ padding: "10px 18px" }}
            >
              <ShieldCheck size={16} />
              <span>
                {applying
                  ? isKo
                    ? "DB 커밋 중..."
                    : "Committing..."
                  : isKo
                  ? `선택 ${liveStats.selected}건 PostgreSQL 일괄 반영 (/apply)`
                  : `Apply ${liveStats.selected} Approved Row(s) to DB`}
              </span>
            </button>
          </div>
        </>
      )}

      {/* 최종 승인 확인 모달 */}
      {confirmOpen && (
        <div className="erp-sync-modal-backdrop">
          <div className="erp-sync-modal">
            <h3>
              {isKo
                ? "PostgreSQL 운영 DB 일괄 반영 확인"
                : "Confirm Atomic PostgreSQL Upsert"}
            </h3>
            <p>
              {isKo ? (
                <>
                  승인하신 <strong>{liveStats.selected}건</strong>의 주문(신규{" "}
                  {liveStats.selectedCreate}건, 수정 {liveStats.selectedUpdate}건)과 연결
                  선적 <strong>{linkedShipmentsForApply.length}건</strong>을 단일
                  트랜잭션으로 Upsert합니다. 유럽 법인 전용 컬럼(창고, 임대, 예약, 비고,
                  TrackCargo AIS 좌표)은 덮어쓰지 않고 100% 보존됩니다.
                </>
              ) : (
                <>
                  Upsert <strong>{liveStats.selected}</strong> approved order(s) (Create:{" "}
                  {liveStats.selectedCreate}, Update: {liveStats.selectedUpdate}) and{" "}
                  <strong>{linkedShipmentsForApply.length}</strong> linked Master B/L(s) in
                  a single atomic transaction. European local fields (warehouse, rental,
                  reservation, remarks, and TrackCargo AIS routes) are strictly preserved.
                </>
              )}
            </p>
            <div className="erp-sync-modal-actions">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={applying}
                className="erp-sync-btn erp-sync-btn-outline"
              >
                {isKo ? "취소" : "Cancel"}
              </button>
              <button
                type="button"
                onClick={handleApplyToDb}
                disabled={applying}
                className="erp-sync-btn erp-sync-btn-primary"
                style={{ flex: "none", padding: "8px 18px" }}
              >
                {applying
                  ? isKo
                    ? "커밋 실행 중..."
                    : "Committing..."
                  : isKo
                  ? "확인 및 DB 반영"
                  : "Confirm & Commit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
