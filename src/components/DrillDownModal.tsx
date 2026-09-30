import { createElement, CSSProperties, ReactElement, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

// Styling / behaviour options configured from Studio Pro. Every field is
// optional — an empty string means "use the built-in default".
export interface DrillDownStyleOptions {
    theme?: "auto" | "light" | "dark";
    width?: string;
    height?: string;
    borderRadius?: string;
    fontSize?: string;
    backgroundColor?: string;
    textColor?: string;
    borderColor?: string;
    headerBackground?: string;
    headerTextColor?: string;
    tableHeaderBackground?: string;
    tableHeaderTextColor?: string;
    rowStripeColor?: string;
    rowHoverColor?: string;
    accentColor?: string;
    stripedRows?: boolean;
    showSearch?: boolean;
    showExport?: boolean;
    enableColumnFilters?: boolean;
    backdropOpacity?: string;
    // Accent derived from the chart theme. Used when no explicit accentColor
    // is configured, so the Export button follows the chart.
    themeAccent?: string;
    className?: string;
}

export interface DrillDownModalProps {
    open: boolean;
    title: string;
    records: Record<string, unknown>[];
    onClose: () => void;
    // Since this modal is rendered via a portal to document.body, it sits
    // outside .mpc-container in the DOM — CSS ancestor selectors like
    // ".mpc-container.mpc-dark .mpc-modal" can't reach it. isDark is passed
    // down explicitly instead, and toggles a class on the modal's own root.
    isDark?: boolean;
    styleOptions?: DrillDownStyleOptions;
}

const cssSupports = (property: string, value: string): boolean => {
    if (typeof CSS === "undefined" || typeof CSS.supports !== "function") {
        return true;
    }
    return CSS.supports(property, value);
};

const isPlainNumber = (value: string): boolean => /^\d+(\.\d+)?$/.test(value);

// Built-in look. Every Studio Pro option is optional — an empty or invalid
// value simply falls through to these.
const DEFAULT_PALETTE = {
    light: {
        bg: "#ffffff",
        text: "#111827",
        border: "#e5e5e5",
        headerText: "#111827",
        thBg: "#f5f5f5",
        thText: "#111827",
        stripe: "#fafafa",
        hover: "#eaf3ff",
        accent: "#6366f1"
    },
    dark: {
        bg: "#18181b",
        text: "#f4f4f5",
        border: "#3f3f46",
        headerText: "#f4f4f5",
        thBg: "#27272a",
        thText: "#f4f4f5",
        stripe: "#202023",
        hover: "#2c2c31",
        accent: "#6366f1"
    }
};

interface ResolvedStyle {
    vars: CSSProperties;
    bg: string;
    text: string;
    thBg: string;
    thText: string;
}

// Merges the Studio Pro options over the theme defaults and returns
// concrete values for every color. Because the modal is portaled to
// <body>, the values are applied as CSS custom properties on the overlay
// AND directly (inline) on the panel/header cells that must never be
// see-through.
function resolveStyle(o: DrillDownStyleOptions, dark: boolean): ResolvedStyle {
    const base = dark ? DEFAULT_PALETTE.dark : DEFAULT_PALETTE.light;

    const color = (value: string | undefined, fallback: string): string => {
        const v = (value ?? "").trim();
        return v && cssSupports("color", v) ? v : fallback;
    };
    const length = (property: string, value: string | undefined): string | undefined => {
        let v = (value ?? "").trim();
        if (!v) {
            return undefined;
        }
        if (isPlainNumber(v)) {
            v = `${v}px`;
        }
        return cssSupports(property, v) ? v : undefined;
    };

    const bg = color(o.backgroundColor, base.bg);
    const text = color(o.textColor, base.text);
    const border = color(o.borderColor, base.border);
    const headerBg = color(o.headerBackground, bg);
    const headerText = color(o.headerTextColor, base.headerText);
    const thBg = color(o.tableHeaderBackground, base.thBg);
    const thText = color(o.tableHeaderTextColor, base.thText);
    const stripe = color(o.rowStripeColor, base.stripe);
    const hover = color(o.rowHoverColor, base.hover);
    const accent = color(o.accentColor, color(o.themeAccent, base.accent));

    const vars: Record<string, string> = {
        "--mpc-modal-bg": bg,
        "--mpc-modal-text": text,
        "--mpc-modal-border": border,
        "--mpc-modal-header-bg": headerBg,
        "--mpc-modal-header-text": headerText,
        "--mpc-modal-th-bg": thBg,
        "--mpc-modal-th-text": thText,
        "--mpc-modal-stripe": stripe,
        "--mpc-modal-hover": hover,
        "--mpc-modal-accent": accent
    };

    const width = length("width", o.width);
    const height = length("height", o.height);
    const radius = length("border-radius", o.borderRadius);
    const fontSize = length("font-size", o.fontSize);

    if (width) {
        vars["--mpc-modal-width"] = width;
    }
    if (height) {
        vars["--mpc-modal-height"] = height;
    }
    if (radius) {
        vars["--mpc-modal-radius"] = radius;
    }
    if (fontSize) {
        vars["--mpc-modal-font-size"] = fontSize;
    }

    const backdrop = Number((o.backdropOpacity ?? "").trim());
    if ((o.backdropOpacity ?? "").trim() !== "" && Number.isFinite(backdrop) && backdrop >= 0 && backdrop <= 1) {
        vars["--mpc-modal-backdrop"] = String(backdrop);
    }

    return { vars: vars as CSSProperties, bg, text, thBg, thText };
}

export function DrillDownModal(props: DrillDownModalProps): ReactElement | null {
    const { open, title, records, onClose, isDark, styleOptions } = props;
    const options = styleOptions ?? {};
    // "auto" follows the chart's detected theme; light/dark force it.
    const dark = options.theme === "dark" ? true : options.theme === "light" ? false : !!isDark;

    const showSearch = options.showSearch !== false;
    const showExport = options.showExport !== false;
    const columnFiltersEnabled = options.enableColumnFilters !== false;
    const striped = options.stripedRows !== false;

    // NOTE: all hooks must run before the `if (!open) return null` below —
    // returning early between hooks changes the hook order when `open`
    // flips and React throws.
    const [search, setSearch] = useState("");
    const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});

    // Fresh search/filters every time the modal is (re)opened.
    useEffect(() => {
        if (open) {
            setSearch("");
            setColumnFilters({});
        }
    }, [open]);

    const columns = useMemo(() => {
        const keySet = new Set<string>();

        records.forEach(record => {
            Object.keys(record).forEach(key => keySet.add(key));
        });

        return Array.from(keySet);
    }, [records]);

    const activeColumnFilters = useMemo(
        () =>
            Object.entries(columnFilters)
                .filter(([, value]) => value.trim() !== "")
                .map(([column, value]) => [column, value.trim().toLowerCase()] as const),
        [columnFilters]
    );

    const filteredRecords = useMemo(() => {
        const keyword = search.trim().toLowerCase();

        return records.filter(record => {
            // Column-level filters — every active filter must match (AND).
            const matchesColumns = activeColumnFilters.every(([column, value]) =>
                String(record[column] ?? "")
                    .toLowerCase()
                    .includes(value)
            );

            if (!matchesColumns) {
                return false;
            }

            if (!keyword) {
                return true;
            }

            return Object.values(record).some(value =>
                String(value ?? "")
                    .toLowerCase()
                    .includes(keyword)
            );
        });
    }, [records, search, activeColumnFilters]);

    const resolved = useMemo(() => resolveStyle(options, dark), [options, dark]);

    if (!open) {
        return null;
    }

    const hasActiveFilters = activeColumnFilters.length > 0 || search.trim() !== "";

    const clearFilters = (): void => {
        setSearch("");
        setColumnFilters({});
    };

    const exportToExcel = (): void => {
        const worksheet = XLSX.utils.json_to_sheet(filteredRecords);

        const workbook = XLSX.utils.book_new();

        XLSX.utils.book_append_sheet(
            workbook,
            worksheet,
            "DrillDown"
        );

        const excelBuffer = XLSX.write(workbook, {
            bookType: "xlsx",
            type: "array"
        });

        const file = new Blob([excelBuffer], {
            type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        });

        saveAs(
            file,
            `${title.replace(/\s+/g, "_")}.xlsx`
        );
    };

    const getColumnClass = (column: string): string =>
        `mpc-col-${column
            .toLowerCase()
            .replace(/\s+/g, "-")
            .replace(/[^a-z0-9-]/g, "")}`;

    const overlayClass = [
        "mpc-modal-overlay",
        dark ? "mpc-modal-dark" : "",
        striped ? "" : "mpc-modal-no-stripes",
        options.className ?? ""
    ]
        .filter(Boolean)
        .join(" ");

    return createPortal(
        <div
            className={overlayClass}
            style={resolved.vars}
            onClick={onClose}
        >
            <div
                className="mpc-modal"
                style={{ background: resolved.bg, color: resolved.text }}
                onClick={e => e.stopPropagation()}
            >
                <div className="mpc-modal-header">
                    <h3>{title}</h3>

                    <button
                        className="mpc-close-button"
                        onClick={onClose}
                    >
                        ✕
                    </button>
                </div>

                <div className="mpc-modal-info">
                    📄 Showing <strong>{filteredRecords.length}</strong> of{" "}
                    <strong>{records.length}</strong> records
                    {hasActiveFilters && (
                        <button
                            className="mpc-clear-filters-btn"
                            onClick={clearFilters}
                        >
                            Clear filters
                        </button>
                    )}
                </div>

                {(showExport || showSearch) && (
                    <div className="mpc-modal-toolbar">
                        {showSearch && (
                            <input
                                className="mpc-search-input"
                                type="text"
                                placeholder="🔍 Search all columns..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        )}

                        {showExport && (
                            <button
                                className="mpc-modal-export-btn"
                                onClick={exportToExcel}
                            >
                                <span className="mpc-btn-icon">📊</span>
                                Export Excel
                            </button>
                        )}
                    </div>
                )}

                <div className="mpc-modal-table-container">
                    <table className="mpc-modal-table">
                        <thead>
                            <tr>
                                {columns.map(column => (
                                    <th
                                        key={column}
                                        className={getColumnClass(column)}
                                        style={{ background: resolved.thBg, color: resolved.thText }}
                                    >
                                        <div className="mpc-th-inner">
                                            <span className="mpc-th-title">{column}</span>

                                            {columnFiltersEnabled && (
                                                <input
                                                    className="mpc-col-filter"
                                                    type="text"
                                                    placeholder="Filter…"
                                                    value={columnFilters[column] ?? ""}
                                                    onChange={e => {
                                                        const value = e.target.value;

                                                        setColumnFilters(prev => ({
                                                            ...prev,
                                                            [column]: value
                                                        }));
                                                    }}
                                                />
                                            )}
                                        </div>
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {filteredRecords.length === 0 ? (
                                <tr>
                                    <td
                                        className="mpc-modal-empty"
                                        colSpan={Math.max(columns.length, 1)}
                                    >
                                        No records match the current filters
                                    </td>
                                </tr>
                            ) : (
                                filteredRecords.map((record, index) => (
                                    <tr key={index}>
                                        {columns.map(column => (
                                            <td
                                                key={column}
                                                className={getColumnClass(column)}
                                                title={String(record[column] ?? "")}
                                            >
                                                {String(record[column] ?? "")}
                                            </td>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>,
        document.body
    );
}
