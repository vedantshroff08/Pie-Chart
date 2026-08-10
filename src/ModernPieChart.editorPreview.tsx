import { createElement, ReactElement } from "react";
import { ModernPieChartPreviewProps } from "../typings/ModernPieChartProps";

import "./ui/ModernPieChart.css";

export function preview(props: ModernPieChartPreviewProps): ReactElement {
    const { chartTitle, containerClass, chartHeightPx, donutMode } = props;

    const heightPx = Number(chartHeightPx) || 200;

    return (
        <div className={`mpc-container ${containerClass || ""}`}>
            {chartTitle && <h3 className="mpc-title">{chartTitle}</h3>}
            <div
                style={{
                    height: `${Math.min(heightPx, 200)}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center"
                }}
            >
                <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="55" fill="#4f46e5" opacity="0.15" />
                    <path
                        d="M60 60 L60 5 A55 55 0 0 1 108 87 Z"
                        fill="#4f46e5"
                    />
                    <path
                        d="M60 60 L108 87 A55 55 0 0 1 25 105 Z"
                        fill="#818cf8"
                    />
                    <path
                        d="M60 60 L25 105 A55 55 0 0 1 60 5 Z"
                        fill="#c7d2fe"
                    />
                    {donutMode && <circle cx="60" cy="60" r="30" fill="#ffffff" />}
                </svg>
            </div>
            <div style={{ textAlign: "center", color: "#9ca3af", fontSize: "12px", marginTop: "8px" }}>
                Modern Pie Chart (design mode preview)
            </div>
        </div>
    );
}

export function getPreviewCss(): string {
    return require("./ui/ModernPieChart.css");
}