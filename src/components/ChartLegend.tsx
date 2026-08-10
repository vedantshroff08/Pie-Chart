import { createElement, ReactElement } from "react";
import { PieSlice, truncateLabel } from "../utils/dataTransform";

export interface ChartLegendProps {
    slices: PieSlice[];
    colors: string[];
    isDark: boolean;
    labelMaxLength?: number;
    position: "top" | "bottom" | "left" | "right";
    onSliceClick?: (slice: PieSlice) => void;
}

export function ChartLegend(props: ChartLegendProps): ReactElement {
    const { slices, colors, isDark, labelMaxLength, position, onSliceClick } = props;
    const isVertical = position === "left" || position === "right";

    return (
        <div
            className={
                "mpc-legend" +
                (isVertical ? " mpc-legend-vertical" : " mpc-legend-horizontal") +
                (isDark ? " mpc-legend-dark" : "")
            }
        >
            {slices.map((slice, i) => {
                const label = slice.label ?? "";
                const truncated = truncateLabel(label, labelMaxLength ?? 16);
                const isTruncated = truncated !== label;
                return (
                    <button
                        key={`${label}-${i}`}
                        type="button"
                        className="mpc-legend-item"
                        title={isTruncated ? label : undefined}
                        onClick={() => onSliceClick?.(slice)}
                    >
                        <span className="mpc-legend-dot" style={{ background: colors[i] }} />
                        <span className="mpc-legend-label">{truncated}</span>
                    </button>
                );
            })}
        </div>
    );
}