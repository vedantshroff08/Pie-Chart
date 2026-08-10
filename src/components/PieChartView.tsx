import { createElement, ReactElement, useRef, useState, useEffect, useCallback, useMemo } from "react";
import { Pie } from "react-chartjs-2";
import { ChartLegend } from "./ChartLegend";
import { DrillDownModal } from "./DrillDownModal";
import {
    Chart as ChartJS,
    ArcElement,
    Tooltip,
    Legend,
    ChartOptions,
    ScriptableContext,
    TooltipModel
} from "chart.js";
import { PieSlice, truncateLabel } from "../utils/dataTransform";
import { getPalette, lighten, darken, ChartTheme } from "../utils/colorPalette";

ChartJS.register(ArcElement, Tooltip, Legend);

export interface PieChartViewProps {
    slices: PieSlice[];
    donutMode: boolean;
    cutoutPercentage: number;
    showLabels: boolean;
    legendPosition: "top" | "bottom" | "left" | "right" | "none";
    chartTheme: ChartTheme;
    startColor?: string;
    endColor?: string;
    labelMaxLength?: number;
    heightPx: number;
    chartRef?: React.RefObject<ChartJS<"pie">>;
    isDark: boolean;
}

interface ExternalLabelPos {
    key: string;
    label: string;
    valueText: string;
    color: string;
    lineColor: string;
    x1: number;
    y1: number;
    xElbow: number;
    yElbow: number;
    x2: number;
    y2: number;
    labelX: number;
    labelY: number;
    align: "left" | "right";
    onArc: boolean;
    arcX: number;
    arcY: number;
}

const MIN_ARC_VALUE_PERCENT = 10;

export function PieChartView(props: PieChartViewProps): ReactElement {
    const {
        slices,
        donutMode,
        cutoutPercentage,
        showLabels,
        legendPosition,
        chartTheme,
        startColor,
        endColor,
        labelMaxLength,
        heightPx,
        chartRef,
        isDark
    } = props;

    const tooltipRef = useRef<HTMLDivElement>(null);
    const lineRef = useRef<SVGLineElement>(null);
    const dotRef = useRef<SVGCircleElement>(null);
    const wrapRef = useRef<HTMLDivElement>(null);
    const outerRef = useRef<HTMLDivElement>(null);

    const [externalLabels, setExternalLabels] = useState<ExternalLabelPos[]>([]);
    const [selectedSlice, setSelectedSlice] = useState<PieSlice | null>(null);
    const [showModal, setShowModal] =
        useState(false);
    const [containerWidth, setContainerWidth] = useState(0);

    // Tracks the *outer* row's width (chart + side legend together) rather
    // than the canvas wrapper alone. The canvas wrapper is flex:1 and
    // shrinks/grows to whatever the legend doesn't take, and a left/right
    // legend's own width is content-driven (longest label, no fixed
    // width) and depends on effectiveMaxLabelLen below — which itself
    // depends on this measured width. Observing the canvas wrapper created
    // a feedback loop: legend width -> canvas width -> breakpoint flips ->
    // effectiveMaxLabelLen changes -> legend width changes again, causing
    // visible flicker whenever legendPosition is "left" or "right". The
    // outer row is `width: 100%` of its parent (see .mpc-chart-outer in
    // the CSS) so its size is set externally and never moves in response
    // to how the legend or canvas divide up the space inside it.
    useEffect(() => {
        const el = outerRef.current;
        if (!el) {
            return;
        }
        let lastWidth = -1;
        const applyWidth = (width: number): void => {
            // Ignore sub-pixel/no-op changes — some browsers report tiny
            // fluctuating deltas across observer callbacks, which is
            // enough on its own to cause a render loop under some layouts.
            if (Math.abs(width - lastWidth) < 1) {
                return;
            }
            lastWidth = width;
            setContainerWidth(width);
        };
        applyWidth(el.clientWidth);
        const observer = new ResizeObserver(entries => {
            const width = entries[0]?.contentRect.width ?? el.clientWidth;
            applyWidth(width);
        });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    // Breakpoints tuned for the leader-line label layout: below ~360px of
    // usable width there isn't room for elbow lines beside the donut at
    // all, so external labels fall back to legend + tooltip only.
    const responsive = useMemo(() => {
        const w = containerWidth || 400;
        const tiny = w < 360;
        const compact = w < 480;
        return {
            tiny,
            compact,
            sidePadding: tiny ? 16 : compact ? 48 : 130,
            topBottomPadding: compact ? 24 : 40,
            elbowBase: compact ? 16 : 30,
            elbowBoundary: compact ? 10 : 20,
            labelOffset: compact ? 14 : 25,
            textGap: compact ? 8 : 16,
            fontSize: compact ? 10 : 12,
            maxLabelChars: compact ? 9 : 18
        };
    }, [containerWidth]);

    const showExternalLabels = showLabels && !responsive.tiny;
    const effectiveMaxLabelLen = responsive.compact
        ? Math.min(labelMaxLength ?? responsive.maxLabelChars, responsive.maxLabelChars)
        : labelMaxLength;

    const baseColors = slices.map((s, i) =>
        s.color ? s.color : getPalette(chartTheme, slices.length, startColor, endColor)[i]
    );

    // Theme-aware slice border — a hard black stroke reads harshly against
    // a light-purple palette, and doesn't adapt to dark mode. A light
    // border on light theme gives the classic "cut apart" donut look;
    // on dark theme it matches the dark card background instead of
    // fighting it.
    const sliceBorderColor = isDark ? "#18181b" : "#ffffff";
    const sliceBorderWidth = 2;

    const backgroundColor = (
        context: ScriptableContext<"pie"> | ScriptableContext<"doughnut">
    ): string | CanvasGradient => {
        const { ctx, chartArea } = context.chart;
        const color = baseColors[context.dataIndex] ?? baseColors[0];

        if (!chartArea) {
            return color;
        }

        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;
        const radius = Math.max(chartArea.right - chartArea.left, chartArea.bottom - chartArea.top) / 2;

        const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.15, centerX, centerY, radius);
        gradient.addColorStop(0, lighten(color, 0.35));
        gradient.addColorStop(0.55, color);
        gradient.addColorStop(1, darken(color, 0.18));
        return gradient;
    };

    const hoverBackgroundColor = baseColors.map(color => lighten(color, 0.12));

    const data = useMemo(
        () => ({
            labels: slices.map(s => truncateLabel(s.label, effectiveMaxLabelLen)),
            datasets: [
                {
                    data: slices.map(s => s.value),
                    backgroundColor: backgroundColor as any,
                    hoverBackgroundColor,
                    borderColor: sliceBorderColor,
                    borderWidth: sliceBorderWidth,
                    hoverBorderColor: sliceBorderColor,
                    hoverBorderWidth: 3,
                    hoverOffset: 18,
                    borderRadius: 4,
                    spacing: 3
                }
            ]
        }),
        [slices, effectiveMaxLabelLen, hoverBackgroundColor, sliceBorderColor]
    );
    const computeExternalLabels = useCallback(() => {
        const chart = chartRef?.current;
        if (!chart) {
            setExternalLabels([]);
            return;
        }

        const canvas = chart.canvas;

        if (canvas.clientWidth === 0 || canvas.clientHeight === 0) {
            setExternalLabels([]);
            return;
        }

        const meta = chart.getDatasetMeta(0);
        if (!meta || !meta.data.length) {
            return;
        }

        const total = slices.reduce((sum, s) => sum + s.value, 0);
        if (total <= 0) {
            setExternalLabels([]);
            return;
        }

        // Every slice with a nonzero value gets a leader line — no cap, no
        // percent threshold. With many slices this compresses the vertical
        // gap between labels rather than overflowing the container; expect
        // reduced readability at high counts, but nothing gets clipped or
        // dropped.
        const eligible = new Set(
            slices.map((s, i) => (s.value > 0 ? i : -1)).filter(i => i >= 0)
        );

        const positions: ExternalLabelPos[] = [];

        const chartWidth = chart.width;
        const EDGE_MARGIN = 12;

        const ctx = chart.ctx;
        ctx.font = `600 ${responsive.fontSize}px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`;

        meta.data.forEach((arc: any, i: number) => {
            const slice = slices[i];
            if (!slice || !eligible.has(i)) {
                return;
            }
            if (!chart.getDataVisibility(i)) {
                return; // slice is currently hidden via legend toggle — skip its label
            }
            const pct = (slice.value / total) * 100;

            const midAngle = (arc.startAngle + arc.endAngle) / 2;
            const cx = arc.x;
            const cy = arc.y;
            const outerR = arc.outerRadius;
            const cos = Math.cos(midAngle);
            const sin = Math.sin(midAngle);

            const x1 = cx + outerR * cos;
            const y1 = cy + outerR * sin;

            // Slices near the very top or bottom of the donut sit right at the
            // left/right split boundary (cos ≈ 0) — their start points end up
            // almost on top of a slice on the opposite side, so both lines begin
            // at nearly the same spot before diverging in opposite directions.
            // Pushing the elbow further out the closer a slice is to that
            // boundary gives the two diverging lines room to separate instead
            // of visually crossing right next to the donut.
            const boundaryProximity = 1 - Math.min(Math.abs(cos), 1);
            const elbowR = outerR + responsive.elbowBase + boundaryProximity * responsive.elbowBoundary;

            const xElbow = cx + elbowR * cos;
            const yElbow = cy + elbowR * sin;

            const isRightSide = cos >= 0;

            const truncated = truncateLabel(slice.label, effectiveMaxLabelLen);
            const valueText = slice.value.toLocaleString();
            const fullText = `${truncated} (${valueText})`;
            const textWidth = ctx.measureText(fullText).width;

            const rawX2 = xElbow + (isRightSide ? responsive.labelOffset : -responsive.labelOffset);
            const x2 = isRightSide
                ? Math.min(rawX2, chartWidth - EDGE_MARGIN - responsive.textGap - textWidth)
                : Math.max(rawX2, EDGE_MARGIN + responsive.textGap + textWidth);
            const y2 = yElbow;

            const baseColor = baseColors[i] ?? "#6366f1";
            const lineColor = isDark ? lighten(baseColor, 0.25) : darken(baseColor, 0.3);

            positions.push({
                key: `${slice.label}-${i}`,
                label: truncated,
                valueText,
                color: baseColor,
                lineColor,
                x1,
                y1,
                xElbow,
                yElbow,
                x2,
                y2,
                labelX: x2 + (isRightSide ? responsive.textGap : -responsive.textGap),
                labelY: y2,
                align: isRightSide ? "left" : "right",
                onArc: pct >= MIN_ARC_VALUE_PERCENT,
                arcX: cx + outerR * 0.66 * cos,
                arcY: cy + outerR * 0.66 * sin
            });
        });

        const left = positions
            .filter(p => p.align === "right")
            .sort((a, b) => a.labelY - b.labelY);

        const right = positions
            .filter(p => p.align === "left")
            .sort((a, b) => a.labelY - b.labelY);

        // Dynamically fits every label within the chart's actual vertical
        // bounds instead of a fixed minimum gap — with few slices the gap
        // stays comfortable, with many it shrinks so nothing overflows the
        // container top/bottom.
        // Half the label's own line height (plus a couple px of breathing
        // room) so the text glyphs themselves — not just their baseline
        // anchor point — stay inside the chart area. A flat 6px margin here
        // was smaller than the text's descenders/ascenders, which is what
        // let the bottom-most labels visually run into the legend row
        // rendered directly beneath the chart with no gap of its own.
        const textSafety = Math.ceil(responsive.fontSize * 0.75) + 4;
        const chartArea = chart.chartArea;
        const minY = chartArea ? chartArea.top + textSafety : textSafety;
        const maxY = chartArea ? chartArea.bottom - textSafety : heightPx - textSafety;
        const availableHeight = Math.max(1, maxY - minY);
        const idealGap = Math.max(responsive.compact ? 14 : 16, availableHeight / 12);

        const spread = (labels: ExternalLabelPos[]): void => {
            if (labels.length === 0) {
                return;
            }
            const neededHeight = idealGap * (labels.length - 1);
            const gap = labels.length > 1 && neededHeight > availableHeight
                ? availableHeight / (labels.length - 1)
                : idealGap;

            for (let i = 1; i < labels.length; i++) {
                if (labels[i].labelY - labels[i - 1].labelY < gap) {
                    labels[i].labelY = labels[i - 1].labelY + gap;
                    labels[i].y2 = labels[i].labelY;
                    // The elbow must travel with the label. Otherwise every
                    // elbow stays pinned at its original, tightly-clustered
                    // radial position while only the label fans out — which
                    // is what produced the tangled "starburst" of crossing
                    // lines: many leader lines pinching through nearly the
                    // same point before diverging. Moving the elbow keeps
                    // the bend itself doing the vertical spread, so the
                    // elbow-to-label segment stays short and near-horizontal.
                    labels[i].yElbow = labels[i].labelY;
                }
            }

            // Bring the whole stack back inside [minY, maxY] if it drifted
            // past either edge during the pass above.
            //
            // This used to be two independent shifts — pull the bottom-most
            // label up if it passed maxY, then separately push the top-most
            // label down if it passed minY. When the natural vertical span
            // of a side's labels (set by the slices' actual angles, not by
            // idealGap) is taller than the available height — e.g. a short,
            // wide chart with a legend directly underneath eating most of
            // topBottomPadding — those two shifts fight each other: fixing
            // the bottom pushes the top out of bounds, and the follow-up fix
            // for the top then pushes the bottom right back past maxY,
            // overshooting further than the original overflow. That's what
            // put the bottom-most labels' elbows past the visible chart
            // area, into the gap/legend below.
            //
            // A single shift is only safe when the whole stack already fits
            // within availableHeight. When it doesn't fit, compress it
            // proportionally into [minY, maxY] instead — this guarantees
            // both bounds hold at once, at the cost of tighter (but never
            // out-of-bounds) gaps between labels on that side.
            const last = labels[labels.length - 1];
            const first = labels[0];
            const naturalSpan = last.labelY - first.labelY;

            if (naturalSpan > availableHeight) {
                const scale = naturalSpan > 0 ? availableHeight / naturalSpan : 1;
                labels.forEach(l => {
                    const newY = minY + (l.labelY - first.labelY) * scale;
                    l.labelY = newY;
                    l.y2 = newY;
                    l.yElbow = newY;
                });
            } else {
                let shift = 0;
                if (last.labelY + shift > maxY) {
                    shift = maxY - last.labelY;
                }
                if (first.labelY + shift < minY) {
                    shift = minY - first.labelY;
                }
                if (shift !== 0) {
                    labels.forEach(l => {
                        l.labelY += shift;
                        l.y2 = l.labelY;
                        l.yElbow = l.labelY;
                    });
                }
            }
        };

        spread(left);
        spread(right);

        setExternalLabels([...left, ...right]);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slices, baseColors, effectiveMaxLabelLen, isDark, heightPx, responsive]);

    // Clicking a legend dot highlights the matching slice using Chart.js's
    // own hover-state animation (same visual as hovering the slice directly)
    // — clicking again toggles it back off. This is separate from clicking
    // the slice itself, which opens the drill-down modal.
    const handleLegendSliceToggle = useCallback((slice: PieSlice) => {
        const chart = chartRef?.current;
        if (!chart) {
            return;
        }
        const index = slices.findIndex(s => s === slice);
        if (index < 0) {
            return;
        }

        chart.toggleDataVisibility(index);
        chart.update(); // full update — this is what drives the circular collapse/expand animation

        // Recompute external labels once the show/hide animation settles,
        // since the remaining visible slices' angles shift when one is
        // hidden or restored.
        window.setTimeout(() => {
            requestAnimationFrame(computeExternalLabels);
        }, 820);
    }, [chartRef, slices, computeExternalLabels]);

    useEffect(() => {
        if (!showExternalLabels) {
            setExternalLabels([]);
            return;
        }
        const timeout = window.setTimeout(() => {
            requestAnimationFrame(computeExternalLabels);
        }, 850);
        return () => window.clearTimeout(timeout);
    }, [showExternalLabels, computeExternalLabels, heightPx, donutMode, cutoutPercentage]);

    useEffect(() => {
        if (!showExternalLabels) {
            setExternalLabels([]);
            return;
        }

        const chart = chartRef?.current;
        const canvas = chart?.canvas;

        if (!canvas) {
            return;
        }

        const observer = new ResizeObserver(() => {
            const chart = chartRef?.current;

            if (!chart || chart.canvas.clientWidth === 0 || chart.canvas.clientHeight === 0) {
                setExternalLabels([]);
                return;
            }
            chart.resize();

            requestAnimationFrame(computeExternalLabels);
        });

        // Start observing the chart canvas
        observer.observe(canvas);

        if (canvas.parentElement) {
            observer.observe(canvas.parentElement);
        }

        // Cleanup
        return () => {
            observer.disconnect();
        };
    }, [showExternalLabels, computeExternalLabels, chartRef]);

    // in ModernPieChart.tsx, alongside your existing resize-on-layout useEffect
    useEffect(() => {
        const triggerResize = (): void => {
            requestAnimationFrame(() => {
                const chart = chartRef?.current;
                chart?.resize();
            });
        };

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(triggerResize);
        }
    }, []);


    const externalTooltipHandler = (context: { chart: ChartJS; tooltip: TooltipModel<"pie"> }): void => {
        const { chart, tooltip } = context;
        const tooltipEl = tooltipRef.current;
        const lineEl = lineRef.current;
        const dotEl = dotRef.current;
        if (!tooltipEl || !lineEl || !dotEl) {
            return;
        }

        if (tooltip.opacity === 0) {
            tooltipEl.style.opacity = "0";
            lineEl.style.opacity = "0";
            dotEl.style.opacity = "0";
            return;
        }

        const dataPoint = tooltip.dataPoints[0];
        const label = dataPoint.label ?? "";
        const value = dataPoint.parsed as unknown as number;
        const dataset = dataPoint.dataset.data as number[];
        const total = dataset.reduce((a, b) => a + b, 0);
        const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
        const swatchColor = baseColors[dataPoint.dataIndex] ?? "#6366f1";

        if (tooltip.body) {
            tooltipEl.innerHTML = `
                <div class="mpc-tooltip-swatch" style="background:${swatchColor}"></div>
                <div class="mpc-tooltip-text">
                    <div class="mpc-tooltip-label">${label}</div>
                    <div class="mpc-tooltip-value">${value.toLocaleString()} <span class="mpc-tooltip-pct">${pct}%</span></div>
                </div>
            `;
        }

        const pointX = tooltip.caretX;
        const pointY = tooltip.caretY;
        const lineTopY = pointY - 22;

        tooltipEl.style.opacity = "1";
        tooltipEl.style.left = chart.canvas.offsetLeft + pointX + "px";
        tooltipEl.style.top = chart.canvas.offsetTop + lineTopY - 6 + "px";

        dotEl.style.opacity = "1";
        dotEl.setAttribute("cx", String(pointX));
        dotEl.setAttribute("cy", String(pointY));
        dotEl.setAttribute("fill", swatchColor);

        lineEl.style.opacity = "1";
        lineEl.setAttribute("x1", String(pointX));
        lineEl.setAttribute("y1", String(pointY - 6));
        lineEl.setAttribute("x2", String(pointX));
        lineEl.setAttribute("y2", String(lineTopY));
        lineEl.setAttribute("stroke", swatchColor);
    };

    const options: ChartOptions<"pie"> = useMemo(
        () => ({
            responsive: true,
            maintainAspectRatio: false,
            onClick: (_event, elements) => {
                if (!elements.length) {
                    return;
                }
                const index = elements[0].index;
                const slice = slices[index];
                setSelectedSlice(slice);
                setShowModal(true);
            },
            cutout: donutMode ? `${cutoutPercentage}%` : "0%",
            layout: {
                padding: {
                    top: responsive.topBottomPadding,
                    bottom: responsive.topBottomPadding,
                    left: showExternalLabels ? responsive.sidePadding : 12,
                    right: showExternalLabels ? responsive.sidePadding : 12
                }
            },
            animation: {
                animateRotate: true,
                animateScale: true,
                duration: 800,
                easing: "easeOutQuart",
                onComplete: () => {
                    if (showExternalLabels) {
                        computeExternalLabels();
                    }
                }
            },
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false,
                    external: externalTooltipHandler as any
                }
            }
        }),
        [slices, donutMode, cutoutPercentage, showExternalLabels, computeExternalLabels, responsive]
    );
    const showSideLegend = legendPosition === "left" || legendPosition === "right";

    return (
        <div
            ref={outerRef}
            className={
                "mpc-chart-outer" +
                (showSideLegend ? " mpc-chart-outer-row" : "") +
                (responsive.compact ? " mpc-compact" : "")
            }
        >
            {legendPosition === "top" && (
                <ChartLegend
                    slices={slices}
                    colors={baseColors}
                    isDark={isDark}
                    labelMaxLength={effectiveMaxLabelLen}
                    position="top"
                    onSliceClick={handleLegendSliceToggle}
                />
            )}
            {legendPosition === "left" && (
                <ChartLegend
                    slices={slices}
                    colors={baseColors}
                    isDark={isDark}
                    labelMaxLength={effectiveMaxLabelLen}
                    position="left"
                    onSliceClick={handleLegendSliceToggle}
                />
            )}

            <div
                ref={wrapRef}
                style={{ position: "relative", flex: "1 1 0%", minWidth: 0, minHeight: 0 }}
                className="mpc-chart-canvas-wrap"
            >
                <Pie ref={chartRef as any} data={data} options={options} />

                {showExternalLabels && externalLabels.length > 0 && (
                    <svg className="mpc-external-labels-svg">
                        {/* Three separate passes — lines, then dots, then text — instead of
                            grouping each label's line+dot+text together. With several thin
                            slices clustered at similar angles (e.g. near the top of the
                            donut), their start points sit very close together, so one
                            slice's line can pass right by a neighboring slice's dot. Drawing
                            per-group meant whichever group happened to come later in the
                            array could paint its dot over an earlier slice's line, making
                            that line look like it disappeared behind the dot. Rendering all
                            lines first, then all dots, then all text guarantees a single,
                            predictable stacking order regardless of array position. */}
                        {externalLabels.map(pos => (
                            <polyline
                                key={`${pos.key}-line`}
                                className="mpc-external-label-line"
                                points={`${pos.x1},${pos.y1} ${pos.xElbow},${pos.yElbow} ${pos.x2},${pos.y2}`}
                                stroke={pos.lineColor}
                            />
                        ))}
                        {externalLabels.map(pos => (
                            <circle
                                key={`${pos.key}-dot`}
                                className="mpc-external-label-dot"
                                cx={pos.x1}
                                cy={pos.y1}
                                r="3"
                                fill={pos.lineColor}
                            />
                        ))}
                        {externalLabels.map(pos => (
                            <text
                                key={`${pos.key}-text`}
                                className={`mpc-external-label-text mpc-external-label-text-${isDark ? "dark" : "light"}`}
                                style={{ fontSize: `${responsive.fontSize}px` }}
                                x={pos.labelX}
                                y={pos.labelY}
                                textAnchor={pos.align === "left" ? "start" : "end"}
                                dominantBaseline="middle"
                            >
                                {pos.label} <tspan className="mpc-external-label-value">({pos.valueText})</tspan>
                            </text>
                        ))}
                    </svg>
                )}

                <svg className="mpc-tooltip-line-svg">
                    <line ref={lineRef} className="mpc-tooltip-line" x1="0" y1="0" x2="0" y2="0" />
                    <circle ref={dotRef} className="mpc-tooltip-dot" cx="0" cy="0" r="4" />
                </svg>
                <div ref={tooltipRef} className="mpc-tooltip" />
            </div>

            {legendPosition === "right" && (
                <ChartLegend
                    slices={slices}
                    colors={baseColors}
                    isDark={isDark}
                    labelMaxLength={effectiveMaxLabelLen}
                    position="right"
                    onSliceClick={handleLegendSliceToggle}
                />
            )}
            {legendPosition === "bottom" && (
                <ChartLegend
                    slices={slices}
                    colors={baseColors}
                    isDark={isDark}
                    labelMaxLength={effectiveMaxLabelLen}
                    position="bottom"
                    onSliceClick={handleLegendSliceToggle}
                />
            )}

            <DrillDownModal
                open={showModal}
                title={selectedSlice?.label ?? ""}
                records={selectedSlice?.records ?? []}
                onClose={() => setShowModal(false)}
                isDark={isDark}
            />
        </div>
    );
}