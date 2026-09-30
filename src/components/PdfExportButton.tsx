import { createElement, ReactElement, useState, RefObject } from "react";
import { Chart as ChartJS } from "chart.js";
import { PieSlice } from "../utils/dataTransform";
import { generatePieChartPdf, ReportTheme } from "../utils/pdfGenerator";
import { ChartTheme, getPalette, lighten, toRgba } from "../utils/colorPalette";

// The leader-line labels (elbow lines + dots + text) are drawn in a
// separate <svg className="mpc-external-labels-svg"> that's absolutely
// positioned over the Chart.js <canvas> — see PieChartView. chart.toBase64Image()
// only rasterizes the canvas itself, so a plain capture silently drops the
// elbow lines/labels from the exported PDF. This stamps that overlay onto a
// copy of the canvas first so the exported image matches what's on screen.
async function captureCompositeChartImage(chart: ChartJS<"pie">): Promise<string> {
    const canvas = chart.canvas;
    const wrap = canvas.parentElement;
    const svg = wrap?.querySelector<SVGSVGElement>("svg.mpc-external-labels-svg");

    // Labels off, or nothing fit on screen — the plain canvas capture
    // already shows everything there is to show.
    if (!svg || svg.childElementCount === 0) {
        return chart.toBase64Image("image/png", 1);
    }

    const cssWidth = canvas.clientWidth || canvas.width;
    const cssHeight = canvas.clientHeight || canvas.height;
    // Device-pixel size of the canvas (e.g. 2x cssWidth/cssHeight on a
    // retina screen) — the resolution we actually want the overlay
    // rasterized at.
    const pixelWidth = canvas.width;
    const pixelHeight = canvas.height;

    // Clone rather than mutate the live overlay (it's still being
    // repositioned by a ResizeObserver on screen). All the label
    // math (x1/y1/xElbow/labelX/...) was computed in CSS-pixel space, so
    // that stays the SVG's internal coordinate system via viewBox — but
    // the width/height attributes (the OUTPUT raster size the browser
    // rasterizes this standalone image at) are set to the full
    // device-pixel size. Rasterizing small and then drawImage-stretching
    // up is what caused the blurred/doubled text and lines; rasterizing
    // straight at the target resolution keeps them crisp.
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("viewBox", `0 0 ${cssWidth} ${cssHeight}`);
    clone.setAttribute("width", String(pixelWidth));
    clone.setAttribute("height", String(pixelHeight));

    // The overlay's line/dot/text styling (stroke-width, fill colors,
    // font) comes from the page's stylesheet via className, which won't
    // exist once this SVG is serialized and loaded standalone as an
    // <img>. Inline the handful of rules that matter so the rasterized
    // labels look the same as they do live.
    const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
    style.textContent = `
        .mpc-external-label-line { fill: none; stroke-width: 1.75; }
        .mpc-external-label-text { font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
        .mpc-external-label-text-light { fill: #374151; }
        .mpc-external-label-text-dark { fill: #e5e7eb; }
        .mpc-external-label-value { font-weight: 500; opacity: 0.7; }
    `;
    clone.insertBefore(style, clone.firstChild);

    const svgString = new XMLSerializer().serializeToString(clone);
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;

    const svgImage = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("Failed to rasterize label overlay"));
        img.src = svgUrl;
    });

    const composite = document.createElement("canvas");
    composite.width = pixelWidth;
    composite.height = pixelHeight;
    const ctx = composite.getContext("2d");
    if (!ctx) {
        return chart.toBase64Image("image/png", 1);
    }

    // Base layer: the donut exactly as Chart.js rendered it. Overlay: the
    // leader lines/dots/labels — both are already at pixelWidth x
    // pixelHeight, so this is a straight 1:1 stamp with no rescale, which
    // is what keeps the overlay crisp.
    ctx.drawImage(canvas, 0, 0);
    ctx.drawImage(svgImage, 0, 0);

    return composite.toDataURL("image/png", 1);
}

export interface PdfExportButtonProps {
    slices: PieSlice[];
    chartRef: RefObject<ChartJS<"pie">>;
    reportTitle: string;
    companyName?: string;
    generatedBy?: string;
    footerText?: string;
    buttonText: string;
    includeChart: boolean;
    includeStatistics: boolean;
    includeTable: boolean;
    companyLogo?: string;

    // Button theme (matches chart)
    chartTheme: ChartTheme;
    startColor?: string;
    endColor?: string;
    isDark: boolean;

    // PDF theme
    reportTheme: ReportTheme;
    primaryColor?: string;
    secondaryColor?: string;
}

export function PdfExportButton(props: PdfExportButtonProps): ReactElement {
    const [isGenerating, setIsGenerating] = useState(false);
    const palette = getPalette(
        props.chartTheme as ChartTheme,
        2,
        props.startColor,
        props.endColor
    );
    // In dark mode, lighten the theme color a touch — the same treatment the
    // leader lines get — so the button doesn't look muddy against a dark
    // background, while still tracking the chosen chartTheme/custom colors.
    const base = props.isDark ? lighten(palette[0], 0.12) : palette[0];
    const hoverBase = props.isDark
        ? lighten(palette[1] ?? palette[0], 0.12)
        : palette[1] ?? palette[0];
    const buttonTheme = {
        background: base,
        hover: hoverBase,
        text: "#FFFFFF",
        shadow: toRgba(base, 0.4),
        shadowHover: toRgba(hoverBase, 0.5)
    };

    const handleExport = async (): Promise<void> => {
        setIsGenerating(true);
        try {
            const chartImageBase64 = props.chartRef.current
                ? await captureCompositeChartImage(props.chartRef.current)
                : undefined;

            let companyLogoBase64: string | undefined;
            if (props.companyLogo) {
                companyLogoBase64 = await fetchAsBase64(props.companyLogo);
            }

            // Same formula PieChartView uses for baseColors: a per-slice custom
            // color if set, otherwise the theme palette — so the PDF table's
            // color dots match the donut exactly.
            const slicePalette = getPalette(
                props.chartTheme as ChartTheme,
                props.slices.length,
                props.startColor,
                props.endColor
            );
            const sliceColors = props.slices.map((s, i) => s.color ?? slicePalette[i]);

            const pdfBytes = await generatePieChartPdf({
                chartImageBase64,
                slices: props.slices,
                sliceColors,
                reportTitle: props.reportTitle,
                companyName: props.companyName,
                generatedBy: props.generatedBy,
                footerText: props.footerText,
                includeChart: props.includeChart,
                includeStatistics: props.includeStatistics,
                includeTable: props.includeTable,
                companyLogoBase64,
                reportTheme: props.reportTheme as ReportTheme,
                primaryColor: props.primaryColor,
                secondaryColor: props.secondaryColor
            });

            downloadPdf(pdfBytes, `${props.reportTitle.replace(/\s+/g, "_")}.pdf`);
        } catch (error) {
            // eslint-disable-next-line no-console
            console.error("PDF export failed:", error);
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <button
            type="button"
            className="mpc-export-btn"
            onClick={handleExport}
            disabled={isGenerating}
            style={{
                backgroundColor: buttonTheme.background,
                borderColor: buttonTheme.background,
                color: buttonTheme.text,
                boxShadow: `0 4px 14px ${buttonTheme.shadow}`
            }}
            onMouseEnter={e => {
                e.currentTarget.style.backgroundColor = buttonTheme.hover;
                e.currentTarget.style.borderColor = buttonTheme.hover;
                e.currentTarget.style.boxShadow = `0 6px 20px ${buttonTheme.shadowHover}`;
            }}
            onMouseLeave={e => {
                e.currentTarget.style.backgroundColor = buttonTheme.background;
                e.currentTarget.style.borderColor = buttonTheme.background;
                e.currentTarget.style.boxShadow = `0 4px 14px ${buttonTheme.shadow}`;
            }}
        >
            <span className="mpc-btn-icon-chip">
                {isGenerating ? (
                    <span className="mpc-btn-spinner" />
                ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path
                            d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    </svg>
                )}
            </span>
            <span>{isGenerating ? "Generating…" : props.buttonText}</span>
        </button>
    );
}

async function fetchAsBase64(url: string): Promise<string | undefined> {
    try {
        const response = await fetch(url);
        const blob = await response.blob();
        return await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        return undefined;
    }
}

function downloadPdf(bytes: Uint8Array, filename: string): void {
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
