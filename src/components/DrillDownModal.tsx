import { createElement, ReactElement, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
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
}

export function DrillDownModal(props: DrillDownModalProps): ReactElement | null {
    const { open, title, records, onClose, isDark } = props;

    if (!open) {
        return null;
    }

    const columns = useMemo(() => {
        const keySet = new Set<string>();

        records.forEach(record => {
            Object.keys(record).forEach(key => keySet.add(key));
        });

        return Array.from(keySet);
    }, [records]);
    const [search, setSearch] = useState("");
    const filteredRecords = useMemo(() => {
        if (!search.trim()) {
            return records;
        }

        const keyword = search.toLowerCase();

        return records.filter(record =>
            Object.values(record).some(value =>
                String(value ?? "")
                    .toLowerCase()
                    .includes(keyword)
            )
        );
    }, [records, search]);

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

    return createPortal(
        <div
            className={`mpc-modal-overlay${isDark ? " mpc-modal-dark" : ""}`}
            onClick={onClose}
        >
            <div
                className="mpc-modal"
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
                </div>
                <div className="mpc-modal-toolbar">

                    <button
                        className="mpc-modal-export-btn"
                        onClick={exportToExcel}
                    >
                        📊 Export Excel
                    </button>

                </div>
                <div className="mpc-search-container">
                    <input
                        className="mpc-search-input"
                        type="text"
                        placeholder="🔍 Search records..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                    />
                </div>

                <div className="mpc-modal-table-container">
                    <table className="mpc-modal-table">
                        <thead>
                            <tr>
                                {columns.map(column => (
                                    <th
                                        key={column}
                                        className={getColumnClass(column)}
                                    >
                                        {column}
                                    </th>
                                ))}
                            </tr>
                        </thead>

                        <tbody>
                            {filteredRecords.map((record, index) => (
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
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>,
        document.body
    );
}