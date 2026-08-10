import { createElement, ReactElement, useRef, useMemo, useEffect, useState } from "react";
import { ModernPieChartContainerProps } from "../typings/ModernPieChartProps";
import { PieChartView } from "./components/PieChartView";
import { PdfExportButton } from "./components/PdfExportButton";
import { transformToSlices } from "./utils/dataTransform";
import { ChartTheme } from "./utils/colorPalette";
import { Chart as ChartJS } from "chart.js";
import { observeThemeChanges } from "./utils/themeDetection";

import "./ui/ModernPieChart.css";

export function ModernPieChart(props: ModernPieChartContainerProps): ReactElement {
    const {
        dataSource,
        labelAttr,
        valueAttr,
        sliceColorAttr,
        chartTitle,
        containerClass,
        chartHeightPx,
        chartTheme,
        startColor,
        endColor,
        donutMode,
        cutoutPercentage,
        showLabels,
        legendPosition,
        labelMaxLength,
        enableReport,
        reportTitle,
        companyName,
        generatedBy,
        footerText,
        exportButtonText,
        includeChart,
        includeStatistics,
        includeTable,
        companyLogo,
        reportTheme,
        primaryColor,
        secondaryColor,
        jsonAttr
    } = props;

    const chartRef = useRef<ChartJS<"pie">>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const slices = useMemo(
    () =>
        transformToSlices(
            dataSource,
            labelAttr,
            valueAttr,
            sliceColorAttr,
            jsonAttr
        ),
    [dataSource, labelAttr, valueAttr, sliceColorAttr, jsonAttr]
);

    const heightPx = Number(chartHeightPx) || 400;
    const cutout = Number(cutoutPercentage) || 60;
    const maxLabelLen = labelMaxLength ? Number(labelMaxLength) : undefined;

    const isLoading = dataSource.status === "loading";
    const [isDark, setIsDark] = useState(false);

    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }
        return observeThemeChanges(el, setIsDark);
    }, []);

    // Force Chart.js to recompute its size once the real container
    // dimensions are known — fixes the "tiny canvas / overlapping legend"
    // issue caused by mounting before layout settles (same root cause
    // as the CustomBarChart chartHeightPx bug).
    useEffect(() => {
        const el = containerRef.current;
        if (!el) {
            return;
        }

        const triggerResize = (): void => {
            requestAnimationFrame(() => {
                chartRef.current?.resize();
            });
        };

        // Initial deferred resize after mount/layout
        triggerResize();

        const observer = new ResizeObserver(() => {
            triggerResize();
        });
        observer.observe(el);

        return () => {
            observer.disconnect();
        };
    }, [slices.length, heightPx]);

    return (
        <div
            ref={containerRef}
            className={`mpc-container ${isDark ? "mpc-dark" : ""} ${containerClass || ""}`}
            style={{ height: `${heightPx}px` }}
        >
            <div className="mpc-header">
                {chartTitle && <h3 className="mpc-title">{chartTitle}</h3>}
                {enableReport && slices.length > 0 && (
                    <PdfExportButton
                        slices={slices}
                        chartRef={chartRef}
                        reportTitle={reportTitle || chartTitle || "Chart Report"}
                        companyName={companyName}
                        generatedBy={generatedBy}
                        footerText={footerText}
                        buttonText={exportButtonText || "Export PDF"}
                        includeChart={includeChart}
                        includeStatistics={includeStatistics}
                        includeTable={includeTable}
                        companyLogo={companyLogo}

                        chartTheme={chartTheme}
                        startColor={startColor}
                        endColor={endColor}
                        isDark={isDark}

                        reportTheme={reportTheme}
                        primaryColor={primaryColor}
                        secondaryColor={secondaryColor}
                    />
                )}
            </div>

            {isLoading ? (
                <div className="mpc-loading">Loading…</div>
            ) : slices.length === 0 ? (
                <div className="mpc-empty">No data available</div>
            ) : (
                <PieChartView
                    slices={slices}
                    donutMode={donutMode}
                    cutoutPercentage={cutout}
                    showLabels={showLabels}
                    legendPosition={legendPosition as "top" | "bottom" | "left" | "right" | "none"}
                    chartTheme={chartTheme as ChartTheme}
                    startColor={startColor}
                    endColor={endColor}
                    labelMaxLength={maxLabelLen}
                    heightPx={heightPx}
                    chartRef={chartRef}
                    isDark={isDark}
                />
            )}
        </div>
    );
}