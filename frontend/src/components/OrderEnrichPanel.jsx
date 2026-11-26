import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  Search,
  ShieldCheck,
  Database,
  Layers,
  Filter,
} from "lucide-react";
import "./ErpSyncPanel.css";

const ENRICH_HEADER_COLUMNS = [
  { header: "P/O", field: "reference_no" },
  { header: "DEALER Order Date", field: "dealer_order_date" },
  { header: "DEALER Order no", field: "dealer_order_no" },
  { header: "SerialNo", field: "serial_number" },
  { header: "NC", field: "nc" },
  { header: "Shipment Type", field: "incoterms" },
  { header: "ArrivalPort", field: "destination_port" },
  { header: "ETD", field: "etd" },
  { header: "ETA", field: "eta" },
  { header: "selling", field: "sales_price" },
  { header: "Sales month", field: "sales_month" },
  { header: "S/O", field: "so_no" },
];

const FIELD_LABELS = {
  dealer_order_date: "ORDER DATE",
  dealer_order_no: "ORDER NO",
  serial_number: "S/N",
  nc: "NC",
  incoterms: "INCOTERMS",
  destination_port: "PORT",
  etd: "ETD",
  eta: "ETA",
  sales_price: "SELLING",
  sales_month: "MONTH",
  so_no: "S/O",
};

function formatPreviewValue(fieldKey, val) {
  if (val === null || val === undefined || val === "") return "-";
  if (fieldKey === "sales_price") {
    const num = Number(val);
    if (!Number.isNaN(num)) return `€ ${num.toLocaleString()}`;
  }
  return String(val);
}

export default function OrderEnrichPanel({
  endpointBase = "/api/erp-sync",
  authHeaders = {},
  onEnrichCommitted = null,
}) {
  const { i18n } = useTranslation();
  const isKo = i18n.language?.startsWith("ko");

  const [excelFile, setExcelFile] = useState(null);
  const [salesMonthYear, setSalesMonthYear] = useState(2026);
  const [previewData, setPreviewData] = useState(null);
  const [selectedUids, setSelectedUids] = useState({});

  const [activeView, setActiveView] = useState("ENRICH"); // ENRICH | DUPLICATES | UNMATCHED
  const [poTypeFilter, setPoTypeFilter] = useState("ALL"); // ALL | A | F | ANOMALY
  const [searchText, setSearchText] = useState("");

  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloadingExcel, setDownloadingExcel] = useState(false);
  const [applying, setApplying] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [errorBanner, setErrorBanner] = useState(null);
  const [applyResult, setApplyResult] = useState(null);

  const enrichRows = previewData?.enrich_rows || [];
  const duplicateRows = previewData?.excluded_duplicate_rows || [];
  const unmatchedRows = previewData?.unmatched_rows || [];
  const summary = previewData?.summary || null;

  const handleRunPreview = async () => {
    if (!excelFile) return;
    setLoadingPreview(true);
    setErrorBanner(null);
    setApplyResult(null);

    try {
      const fd = new FormData();
      fd.append("file", excelFile);
      fd.append("sales_month_year", String(salesMonthYear || 2026));
      fd.append("download_excel", "false");

      const res = await fetch(`${endpointBase}/enrich/preview`, {
        method: "POST",
        headers: { ...authHeaders },
        body: fd,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      setPreviewData(data);
      const initSelected = {};
      for (const r of data.enrich_rows || []) {
        initSelected[r.row_uid] = true;
      }
      setSelectedUids(initSelected);
      setActiveView(
        (data.enrich_rows || []).length > 0
          ? "ENRICH"
          : (data.excluded_duplicate_rows || []).length > 0
          ? "DUPLICATES"
          : "UNMATCHED"
      );
      setPoTypeFilter("ALL");
      setSearchText("");
    } catch (err) {
      setErrorBanner(err.message || String(err));
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleDownloadPreviewExcel = async () => {
    if (!excelFile) return;
    setDownloadingExcel(true);
    setErrorBanner(null);
    try {
      const fd = new FormData();
      fd.append("file", excelFile);
      fd.append("sales_month_year", String(salesMonthYear || 2026));
      fd.append("download_excel", "true");

      const res = await fetch(`${endpointBase}/enrich/preview`, {
        method: "POST",
        headers: { ...authHeaders },
        body: fd,
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ERP_Order_Enrich_Preview_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setErrorBanner(err.message || String(err));
    } finally {
      setDownloadingExcel(false);
    }
  };

  const visibleEnrichRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return enrichRows.filter((row) => {
      if (poTypeFilter === "A" && row.po_type !== "A") return false;
      if (poTypeFilter === "F" && row.po_type !== "F") return false;
      if (poTypeFilter === "ANOMALY" && !(row.anomalies && row.anomalies.length > 0)) return false;

      if (!q) return true;
      const fd = row.fill_display || {};
      const haystack = [
        row.reference_no,
        row.db_dealer,
        row.excel_dealer,
        row.db_model,
        fd.dealer_order_no?.new,
        fd.serial_number?.new,
        fd.so_no?.new,
        fd.sales_month?.new,
        fd.destination_port?.new,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [enrichRows, poTypeFilter, searchText]);

  const visibleUnmatchedRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return unmatchedRows.filter((row) => {
      if (poTypeFilter === "A" && row.po_type !== "A") return false;
      if (poTypeFilter === "F" && row.po_type !== "F") return false;
      if (!q) return true;
      return [row.reference_no, row.dealer_raw, row.model_raw, row.dealer_order_no]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
  }, [unmatchedRows, poTypeFilter, searchText]);

  const selectedRows = useMemo(
    () => enrichRows.filter((r) => selectedUids[r.row_uid]),
    [enrichRows, selectedUids]
  );

  const selectedCellsCount = useMemo(
    () => selectedRows.reduce((acc, r) => acc + (r.fill_count || 0), 0),
    [selectedRows]
  );

  const allVisibleSelected = useMemo(
    () =>
      visibleEnrichRows.length > 0 &&
      visibleEnrichRows.every((r) => Boolean(selectedUids[r.row_uid])),
    [visibleEnrichRows, selectedUids]
  );

  const toggleSelectAllVisible = (checked) => {
    setSelectedUids((prev) => {
      const next = { ...prev };
      for (const r of visibleEnrichRows) {
        next[r.row_uid] = checked;
      }
      return next;
    });
  };

  const toggleSelectRow = (uid) => {
    setSelectedUids((prev) => ({ ...prev, [uid]: !prev[uid] }));
  };

  const handleConfirmApply = async () => {
    if (selectedRows.length === 0) return;
    setApplying(true);
    setErrorBanner(null);

    try {
      const payload = {
        items: selectedRows.map((r) => ({
          reference_no: r.reference_no,
          fill_fields: r.fill_fields,
        })),
        sales_month_year: Number(salesMonthYear) || 2026,
      };

      const res = await fetch(`${endpointBase}/enrich/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.detail || `HTTP ${res.status}`);
      }

      setApplyResult(data);
      setConfirmOpen(false);
      // 반영된 행들은 미리보기 목록에서 깔끔하게 제거하거나 재조회 유도
      const appliedRefs = new Set(selectedRows.map((r) => r.reference_no));
      setPreviewData((prev) => {
        if (!prev) return prev;
        const remaining = (prev.enrich_rows || []).filter((r) => !appliedRefs.has(r.reference_no));
        return {
          ...prev,
          enrich_rows: remaining,
          summary: {
            ...prev.summary,
            enrich_order_count: remaining.length,
            no_change_count: (prev.summary?.no_change_count || 0) + (data.orders_enriched || 0),
            total_fields_to_fill: remaining.reduce((acc, r) => acc + (r.fill_count || 0), 0),
          },
        };
      });
      setSelectedUids({});
      if (typeof onEnrichCommitted === "function") {
        onEnrichCommitted(data);
      }
    } catch (err) {
      setErrorBanner(err.message || String(err));
      setConfirmOpen(false);
    } finally {
      setApplying(false);
    }
  };

  return (
    <>
      {/* 업로드 & 규칙 카드 */}
      <div className="erp-sync-card">
        <div className="erp-sync-header">
          <div className="erp-sync-title-wrap">
            <div className="erp-sync-icon-badge enrich">
              <Database size={22} />
            </div>
            <div>
              <h2 className="erp-sync-title">
                {isKo
                  ? "P/O 기준 주문 정보 일괄 보충 (DB 빈 칸 '-' 채우기 전용)"
                  : "Order Data Bulk Enrichment by P/O (Fill Blanks '-' Only)"}
              </h2>
              <p className="erp-sync-subtitle">
                {isKo
                  ? "딜러 주문 내역 원본 엑셀(.xlsx)을 업로드하면 시스템에 이미 등록된 P/O(A·F 발주 전체)와 대조하여, DB에서 비어 있어 '-'로 표시되는 항목만 기존 데이터 손상 없이 안전하게 보충합니다."
                  : "Upload the original dealer order Excel (.xlsx) to match existing P/Os (both A and F orders) and fill only empty ('-' / NULL) fields without ever overwriting existing ERP data."}
              </p>
            </div>
          </div>

          {previewData?.parse_meta && (
            <div className="erp-sync-meta-pill">
              <strong>{isKo ? "감지된 시트:" : "Detected Sheet:"}</strong>{" "}
              {previewData.parse_meta.sheet_name} (
              {isKo
                ? `${previewData.parse_meta.header_row}행 헤더 / 총 P/O ${previewData.parse_meta.total_po_rows}건`
                : `Row ${previewData.parse_meta.header_row} Header / ${previewData.parse_meta.total_po_rows} P/Os`}
              )
            </div>
          )}
        </div>

        {/* 4가지 확정 규칙 안내 스트립 */}
        <div className="erp-enrich-rules-strip">
          <span className="erp-enrich-rule-pill">
            <ShieldCheck size={13} />
            {isKo ? "기존 값 100% 보존 · 빈 칸('-')만 보충" : "Preserve Existing · Fill Blanks Only"}
          </span>
          <span className="erp-enrich-rule-pill">
            {isKo ? "중복 P/O · 비정상 값(0, x, 음수 등) 자동 제외" : "Auto-Exclude Duplicate P/Os & Invalid Values"}
          </span>
          <span className="erp-enrich-rule-pill">
            {isKo ? "월 미정 Sales month(2026/2027/???) 보충 제외" : "Exclude Undecided Sales Month (Year-only / ???)"}
          </span>
          <span className="erp-enrich-rule-pill highlight">
            {isKo
              ? "기등록 F 발주 포함 (SELLING · ORDER NO · MONTH 보충)"
              : "Includes Existing F Orders (SELLING · ORDER NO · MONTH)"}
          </span>
        </div>

        {/* 파일 및 옵션 입력 */}
        <div className="erp-sync-upload-grid">
          <div className="erp-sync-col-5">
            <label className="erp-sync-field-label">
              {isKo
                ? "1. 딜러 주문 내역 원본 엑셀 (.xlsx, .xls) *"
                : "1. Original Dealer Order List Excel (.xlsx, .xls) *"}
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] || null)}
              className="erp-sync-file-input"
            />
          </div>

          <div className="erp-sync-col-2">
            <label className="erp-sync-field-label">
              {isKo ? "2. 단일 월(1~12) 기준 연도" : "2. Base Year (Month 1–12)"}
            </label>
            <input
              type="number"
              min={2020}
              max={2040}
              value={salesMonthYear}
              onChange={(e) => setSalesMonthYear(Number(e.target.value) || 2026)}
              className="erp-sync-text-input"
            />
          </div>

          <div className="erp-sync-col-5">
            <label className="erp-sync-field-label">
              {isKo ? "3. DB 사전 대조 및 검수 리포트" : "3. Dry-Run DB Comparison & Report"}
            </label>
            <div className="erp-sync-btn-row" style={{ marginTop: 0 }}>
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
                      ? "DB 빈 칸 대조 중..."
                      : "Comparing Blanks vs DB..."
                    : isKo
                    ? "DB 빈 칸 보충 미리보기"
                    : "Preview Blank-Field Enrichment"}
                </span>
              </button>
              <button
                type="button"
                onClick={handleDownloadPreviewExcel}
                disabled={downloadingExcel || !excelFile}
                className="erp-sync-btn erp-sync-btn-outline"
              >
                <Download size={14} />
                <span>{downloadingExcel ? "..." : isKo ? "검수 .xlsx" : "Report .xlsx"}</span>
              </button>
            </div>
          </div>
        </div>

        {/* 보충 대상 12개 헤더 매핑 현황 스트립 */}
        <div className="erp-sync-schema-bar">
          <span className="erp-sync-schema-title">
            {isKo ? "보충 대상 헤더 (12):" : "Target Enrichment Headers (12):"}
          </span>
          {ENRICH_HEADER_COLUMNS.map((col, idx) => {
            const colMap = previewData?.parse_meta?.column_mapping;
            const mapped = colMap ? colMap[col.field] : null;
            let statusCls = "";
            let titleTxt = col.header;
            if (colMap) {
              if (mapped) {
                statusCls = "mapped";
                titleTxt = isKo
                  ? `매핑됨: '${mapped.raw_header}' (${mapped.method})`
                  : `Mapped: '${mapped.raw_header}' (${mapped.method})`;
              } else {
                statusCls = "missing";
                titleTxt = isKo ? "업로드 파일에서 미감지" : "Not found in uploaded file";
              }
            }
            return (
              <span
                key={col.field}
                className={`erp-sync-schema-chip ${statusCls}`}
                title={titleTxt}
              >
                <span className="erp-sync-schema-idx">{idx + 1}</span>
                <span>{col.header}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* 오류 배너 */}
      {errorBanner && (
        <div className="erp-sync-banner error">
          <div className="erp-sync-banner-title">
            <AlertTriangle size={15} />
            <span>{isKo ? "오류 알림" : "Error Alert"}</span>
          </div>
          <p style={{ margin: "4px 0 0" }}>{errorBanner}</p>
        </div>
      )}

      {/* 보충 커밋 성공 배너 */}
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
                  ? "빈 칸 일괄 보충 트랜잭션 반영 완료"
                  : "Blank-Field Enrichment Committed Atomically"}
              </span>
              <span style={{ fontWeight: 500, opacity: 0.8 }}>
                ({applyResult.committed_at})
              </span>
            </div>
            <div style={{ display: "flex", gap: "14px", fontWeight: 700 }}>
              <span>
                {isKo ? "보충된 주문:" : "Orders Enriched:"} {applyResult.orders_enriched}
                {isKo ? "건" : ""}
              </span>
              <span>
                {isKo ? "채워진 빈 칸('-'):" : "Fields Filled:"} {applyResult.fields_filled_total}
                {isKo ? "개" : ""}
              </span>
            </div>
          </div>
          {applyResult.field_fill_counts && Object.keys(applyResult.field_fill_counts).length > 0 && (
            <div className="erp-enrich-result-chips">
              {Object.entries(applyResult.field_fill_counts).map(([k, cnt]) => (
                <span key={k} className="erp-enrich-result-chip">
                  {FIELD_LABELS[k] || k}: <strong>+{cnt}</strong>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Preview 결과 영역 */}
      {previewData && summary && (
        <>
          {/* 6종 KPI 요약 카드 */}
          <div className="erp-sync-kpi-grid enrich-grid">
            <button
              type="button"
              onClick={() => {
                setActiveView("ENRICH");
                setPoTypeFilter("ALL");
              }}
              className={`erp-sync-kpi-card kpi-blue ${
                activeView === "ENRICH" && poTypeFilter === "ALL" ? "active" : ""
              }`}
            >
              <div className="erp-sync-kpi-label">
                {isKo ? "보충 대상 주문 (DB 일치)" : "Orders to Enrich"}
              </div>
              <div className="erp-sync-kpi-val">
                {summary.enrich_order_count}
                {isKo ? "건" : ""}
              </div>
              <div className="erp-enrich-kpi-sub">
                {isKo
                  ? `채울 빈 칸 총 ${summary.total_fields_to_fill}개`
                  : `${summary.total_fields_to_fill} blank cell(s) to fill`}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView("ENRICH");
                setPoTypeFilter("A");
              }}
              className={`erp-sync-kpi-card kpi-emerald ${
                activeView === "ENRICH" && poTypeFilter === "A" ? "active" : ""
              }`}
            >
              <div className="erp-sync-kpi-label">{isKo ? "A 발주 보충" : "A-Order Enrich"}</div>
              <div className="erp-sync-kpi-val">
                {summary.enrich_a_order_count}
                {isKo ? "건" : ""}
              </div>
              <div className="erp-enrich-kpi-sub">
                {isKo ? "딜러 지정 발주" : "Dealer Orders"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView("ENRICH");
                setPoTypeFilter("F");
              }}
              className={`erp-sync-kpi-card kpi-indigo ${
                activeView === "ENRICH" && poTypeFilter === "F" ? "active" : ""
              }`}
            >
              <div className="erp-sync-kpi-label">{isKo ? "F 발주 보충" : "F-Order Enrich"}</div>
              <div className="erp-sync-kpi-val">
                {summary.enrich_f_order_count}
                {isKo ? "건" : ""}
              </div>
              <div className="erp-enrich-kpi-sub">
                {isKo ? "기등록 F 발주(판매가 포함)" : "Existing F (incl. Selling)"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setActiveView("ENRICH");
                setPoTypeFilter("ANOMALY");
              }}
              className={`erp-sync-kpi-card kpi-amber ${
                activeView === "ENRICH" && poTypeFilter === "ANOMALY" ? "active" : ""
              }`}
            >
              <div className="erp-sync-kpi-label">
                {isKo ? "비정상·월미정 제외 셀" : "Excluded Invalid / TBD"}
              </div>
              <div className="erp-sync-kpi-val">
                {summary.excluded_anomaly_values_count}
                {isKo ? "건" : ""}
              </div>
              <div className="erp-enrich-kpi-sub">
                {isKo ? "0, x, 음수, 2027, ??? 제외" : "0, x, negative, year-only, ???"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("DUPLICATES")}
              className={`erp-sync-kpi-card ${
                summary.excluded_duplicate_po_count > 0 ? "kpi-rose" : "kpi-muted"
              } ${activeView === "DUPLICATES" ? "active" : ""}`}
            >
              <div className="erp-sync-kpi-label">
                {isKo ? "중복 P/O 제외" : "Duplicate P/O Excluded"}
              </div>
              <div className="erp-sync-kpi-val">
                {summary.excluded_duplicate_po_count}
                {isKo ? "행" : ""}
              </div>
              <div className="erp-enrich-kpi-sub">
                {isKo ? "규칙 2에 따라 전량 제외" : "Excluded by Rule 2"}
              </div>
            </button>

            <button
              type="button"
              onClick={() => setActiveView("UNMATCHED")}
              className={`erp-sync-kpi-card kpi-muted ${
                activeView === "UNMATCHED" ? "active" : ""
              }`}
            >
              <div className="erp-sync-kpi-label">
                {isKo ? "DB 미등록 (건너뜀)" : "Not in DB (Skipped)"}
              </div>
              <div className="erp-sync-kpi-val">
                {summary.unmatched_po_count}
                {isKo ? "건" : ""}
              </div>
              <div className="erp-enrich-kpi-sub">
                {isKo
                  ? `변동 없음(이미 채워짐) ${summary.no_change_count}건`
                  : `${summary.no_change_count} already complete`}
              </div>
            </button>
          </div>

          {/* 컬럼별 보충 예정 건수 요약 */}
          {summary.field_fill_counts && Object.keys(summary.field_fill_counts).length > 0 && (
            <div className="erp-enrich-field-summary">
              <span className="erp-sync-schema-title">
                <Layers size={13} style={{ verticalAlign: "-2px", marginRight: 4 }} />
                {isKo ? "컬럼별 보충 예정 ('-' → 값):" : "Fields to Fill ('-' → Value):"}
              </span>
              {Object.entries(summary.field_fill_counts).map(([k, cnt]) => (
                <span key={k} className="erp-enrich-field-stat-chip">
                  {FIELD_LABELS[k] || k} <strong>+{cnt}</strong>
                </span>
              ))}
            </div>
          )}

          {/* 툴바 */}
          <div className="erp-sync-toolbar">
            <div className="erp-sync-toolbar-group">
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
                      ? "P/O, ORDER NO, S/N, 딜러, 모델 검색..."
                      : "Search P/O, ORDER NO, S/N, Dealer, Model..."
                  }
                  className="erp-sync-text-input"
                  style={{ width: "260px", paddingLeft: "30px" }}
                />
              </div>

              {activeView === "ENRICH" && (
                <div style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                  <Filter size={13} color="#64748b" />
                  <select
                    value={poTypeFilter}
                    onChange={(e) => setPoTypeFilter(e.target.value)}
                    className="erp-sync-select"
                    style={{ width: "165px" }}
                  >
                    <option value="ALL">{isKo ? "전체 보충 대상" : "All Enrich Rows"}</option>
                    <option value="A">{isKo ? "A 발주만 보기" : "A Orders Only"}</option>
                    <option value="F">{isKo ? "F 발주만 보기" : "F Orders Only"}</option>
                    <option value="ANOMALY">
                      {isKo ? "제외된 비정상 값 포함 행" : "Rows with Excluded Values"}
                    </option>
                  </select>
                </div>
              )}
            </div>

            {activeView === "ENRICH" && (
              <div className="erp-sync-toolbar-group">
                <button
                  type="button"
                  onClick={() => toggleSelectAllVisible(true)}
                  className="erp-sync-btn erp-sync-btn-outline erp-sync-btn-sm"
                >
                  {isKo ? "표시 건 전체 선택" : "Select All Visible"}
                </button>
                <button
                  type="button"
                  onClick={() => toggleSelectAllVisible(false)}
                  className="erp-sync-btn erp-sync-btn-outline erp-sync-btn-sm"
                >
                  {isKo ? "선택 해제" : "Deselect All"}
                </button>
              </div>
            )}
          </div>

          {/* 뷰 1: 보충 대상 테이블 */}
          {activeView === "ENRICH" && (
            <div className="erp-sync-table-wrap">
              <div className="erp-sync-table-scroll">
                <table className="erp-sync-table">
                  <thead>
                    <tr>
                      <th style={{ width: "38px", textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={(e) => toggleSelectAllVisible(e.target.checked)}
                        />
                      </th>
                      <th style={{ width: "58px", textAlign: "center" }}>
                        {isKo ? "행" : "Row"}
                      </th>
                      <th style={{ width: "130px" }}>P/O</th>
                      <th style={{ width: "180px" }}>{isKo ? "DB 딜러 / 모델" : "DB Dealer / Model"}</th>
                      <th style={{ width: "78px", textAlign: "center" }}>
                        {isKo ? "보충 수" : "Fills"}
                      </th>
                      <th>
                        {isKo
                          ? "보충될 항목 (현재 DB '-' → 신규 반영값)"
                          : "Blank Fields to Fill (DB '-' → New Value)"}
                      </th>
                      <th style={{ width: "240px" }}>
                        {isKo ? "규칙 제외 참고 (비정상·월미정)" : "Auto-Excluded Values"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEnrichRows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          style={{ textAlign: "center", padding: "36px", color: "#94a3b8" }}
                        >
                          {isKo
                            ? "표시할 보충 대상 주문이 없습니다. (기존 DB에 이미 모든 정보가 입력되었거나 검색 조건에 일치하는 행이 없습니다.)"
                            : "No orders to enrich matching current filter."}
                        </td>
                      </tr>
                    ) : (
                      visibleEnrichRows.map((row) => {
                        const checked = Boolean(selectedUids[row.row_uid]);
                        return (
                          <tr key={row.row_uid}>
                            <td style={{ textAlign: "center" }}>
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelectRow(row.row_uid)}
                              />
                            </td>
                            <td style={{ textAlign: "center", color: "#64748b", fontSize: "0.74rem" }}>
                              {row.excel_row}
                            </td>
                            <td>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <span
                                  className={`erp-enrich-type-tag ${
                                    row.po_type === "F" ? "type-f" : "type-a"
                                  }`}
                                >
                                  {row.po_type}
                                </span>
                                <strong style={{ color: "#0f172a" }}>{row.reference_no}</strong>
                              </div>
                              <div style={{ fontSize: "0.69rem", color: "#64748b", marginTop: "2px" }}>
                                {row.current_status || "-"}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: "#1e293b", fontSize: "0.79rem" }}>
                                {row.db_dealer}
                              </div>
                              <div style={{ fontSize: "0.73rem", color: "#64748b" }}>
                                {row.db_model}
                              </div>
                            </td>
                            <td style={{ textAlign: "center" }}>
                              <span className="erp-sync-badge badge-update">
                                +{row.fill_count}
                              </span>
                            </td>
                            <td>
                              <div className="erp-sync-diff-list">
                                {Object.entries(row.fill_display || {}).map(([fKey, info]) => (
                                  <span key={fKey} className="erp-sync-diff-pill enrich-pill">
                                    <strong>{info.label}:</strong>{" "}
                                    <span className="erp-sync-diff-old">-</span>
                                    <span>→</span>
                                    <span className="erp-sync-diff-new">
                                      {formatPreviewValue(fKey, info.new)}
                                    </span>
                                  </span>
                                ))}
                              </div>
                              {row.preserved_fields && row.preserved_fields.length > 0 && (
                                <div className="erp-enrich-preserved-note">
                                  {isKo
                                    ? `기존 값 보존(미변경): ${row.preserved_fields.join(", ")}`
                                    : `Preserved existing: ${row.preserved_fields.join(", ")}`}
                                </div>
                              )}
                            </td>
                            <td>
                              {row.anomalies && row.anomalies.length > 0 ? (
                                <div className="erp-enrich-anomaly-list">
                                  {row.anomalies.map((a, idx) => (
                                    <span key={idx} className="erp-enrich-anomaly-chip">
                                      {a.reason}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <span style={{ color: "#cbd5e1", fontSize: "0.75rem" }}>-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 뷰 2: 중복 P/O 제외 목록 */}
          {activeView === "DUPLICATES" && (
            <div className="erp-sync-table-wrap">
              <div className="erp-sync-table-scroll">
                <table className="erp-sync-table">
                  <thead>
                    <tr>
                      <th style={{ width: "70px", textAlign: "center" }}>{isKo ? "엑셀행" : "Row"}</th>
                      <th style={{ width: "140px" }}>P/O</th>
                      <th style={{ width: "160px" }}>{isKo ? "엑셀 딜러" : "Excel Dealer"}</th>
                      <th style={{ width: "160px" }}>{isKo ? "엑셀 모델" : "Excel Model"}</th>
                      <th>{isKo ? "제외 사유" : "Exclusion Reason"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {duplicateRows.length === 0 ? (
                      <tr>
                        <td colSpan={5} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                          {isKo ? "파일 내 중복 P/O가 없습니다." : "No duplicate P/Os detected in file."}
                        </td>
                      </tr>
                    ) : (
                      duplicateRows.map((d, idx) => (
                        <tr key={`${d.reference_no}_${d.excel_row}_${idx}`} className="row-blocked">
                          <td style={{ textAlign: "center" }}>{d.excel_row}</td>
                          <td>
                            <strong style={{ color: "#be123c" }}>{d.reference_no}</strong>
                          </td>
                          <td>{d.dealer_raw || "-"}</td>
                          <td>{d.model_raw || "-"}</td>
                          <td style={{ color: "#9f1239", fontSize: "0.78rem" }}>{d.reason}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 뷰 3: DB 미등록 P/O (건너뜀) 목록 */}
          {activeView === "UNMATCHED" && (
            <div className="erp-sync-table-wrap">
              <div className="erp-sync-table-scroll">
                <table className="erp-sync-table">
                  <thead>
                    <tr>
                      <th style={{ width: "70px", textAlign: "center" }}>{isKo ? "엑셀행" : "Row"}</th>
                      <th style={{ width: "140px" }}>P/O</th>
                      <th style={{ width: "150px" }}>{isKo ? "엑셀 딜러" : "Excel Dealer"}</th>
                      <th style={{ width: "150px" }}>{isKo ? "엑셀 모델" : "Excel Model"}</th>
                      <th style={{ width: "160px" }}>ORDER NO</th>
                      <th style={{ width: "110px" }}>SELLING</th>
                      <th>{isKo ? "처리 안내" : "Note"}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUnmatchedRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} style={{ textAlign: "center", padding: "32px", color: "#94a3b8" }}>
                          {isKo ? "DB 미등록 P/O가 없습니다." : "All P/Os in file matched existing DB records."}
                        </td>
                      </tr>
                    ) : (
                      visibleUnmatchedRows.map((u, idx) => (
                        <tr key={`${u.reference_no}_${u.excel_row}_${idx}`}>
                          <td style={{ textAlign: "center", color: "#64748b" }}>{u.excel_row}</td>
                          <td>
                            <span
                              className={`erp-enrich-type-tag ${
                                u.po_type === "F" ? "type-f" : "type-a"
                              }`}
                              style={{ marginRight: "6px" }}
                            >
                              {u.po_type}
                            </span>
                            <strong>{u.reference_no}</strong>
                          </td>
                          <td>{u.dealer_raw || "-"}</td>
                          <td>{u.model_raw || "-"}</td>
                          <td>{u.dealer_order_no || "-"}</td>
                          <td>{formatPreviewValue("sales_price", u.sales_price)}</td>
                          <td style={{ color: "#64748b", fontSize: "0.76rem" }}>
                            {isKo
                              ? "시스템 미등록 P/O — 신규 생성하지 않음 (추후 발주 등록 후 재업로드 시 자동 보충)"
                              : "Not registered in ERP yet — skipped (will be enriched after order upload)"}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 하단 고정 승인 바 */}
          <div className="erp-sync-sticky-bar">
            <div className="erp-sync-sticky-info">
              <span>
                {isKo ? "선택된 보충 대상 주문:" : "Selected Orders:"}{" "}
                <strong>
                  {selectedRows.length}
                  {isKo ? "건" : ""}
                </strong>
              </span>
              <span>
                {isKo ? "채워질 빈 칸('-'):" : "Blank Fields to Fill:"}{" "}
                <strong style={{ color: "#93c5fd" }}>
                  +{selectedCellsCount}
                  {isKo ? "개" : ""}
                </strong>
              </span>
              <span style={{ opacity: 0.78, fontSize: "0.75rem" }}>
                {isKo
                  ? "* DB에 이미 값이 있는 항목은 절대 덮어쓰지 않습니다."
                  : "* Existing non-empty DB fields are strictly preserved."}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={applying || selectedRows.length === 0}
              className="erp-sync-btn erp-sync-btn-primary"
              style={{ background: "#2563eb" }}
            >
              <ShieldCheck size={16} />
              <span>
                {applying
                  ? isKo
                    ? "보충 반영 중..."
                    : "Applying..."
                  : isKo
                  ? `선택 ${selectedRows.length}건 빈 칸 일괄 보충 반영`
                  : `Apply Enrichment to ${selectedRows.length} Order(s)`}
              </span>
            </button>
          </div>
        </>
      )}

      {/* 최종 승인 확인 모달 */}
      {confirmOpen && (
        <div className="erp-sync-modal-backdrop" onClick={() => !applying && setConfirmOpen(false)}>
          <div className="erp-sync-modal" onClick={(e) => e.stopPropagation()}>
            <h3>
              {isKo
                ? "빈 칸 일괄 보충을 PostgreSQL에 반영하시겠습니까?"
                : "Commit Blank-Field Enrichment to PostgreSQL?"}
            </h3>
            <p>
              {isKo ? (
                <>
                  선택된 기등록 주문 <strong>{selectedRows.length}건</strong>에 대해 현재 DB에서
                  비어 있는(<code>-</code>/NULL) 항목 총 <strong>{selectedCellsCount}개</strong>를
                  단일 트랜잭션으로 일괄 보충합니다.
                  <br />
                  이미 값이 존재하는 기존 DB 데이터는 일절 변경되지 않으며, 시스템 미등록 P/O는
                  신규 생성되지 않습니다.
                </>
              ) : (
                <>
                  Fill <strong>{selectedCellsCount}</strong> empty (<code>-</code>/NULL) field(s)
                  across <strong>{selectedRows.length}</strong> existing order(s) in a single atomic
                  transaction. Existing non-empty values will not be overwritten.
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
                onClick={handleConfirmApply}
                disabled={applying}
                className="erp-sync-btn erp-sync-btn-primary"
              >
                {applying
                  ? isKo
                    ? "트랜잭션 커밋 중..."
                    : "Committing..."
                  : isKo
                  ? "일괄 보충 실행"
                  : "Confirm & Enrich"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
