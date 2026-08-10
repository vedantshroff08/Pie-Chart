/**
 * This file was generated from ModernPieChart.xml
 * WARNING: All changes made to this file will be overwritten
 * @author Mendix Widgets Framework Team
 */
import { CSSProperties } from "react";
import { ActionValue, ListValue, ListAttributeValue } from "mendix";
import { Big } from "big.js";

export type ChartThemeEnum = "indigo" | "azure" | "emerald" | "violet" | "amber" | "rose" | "slate" | "dark" | "custom";

export type LegendPositionEnum = "top" | "bottom" | "left" | "right" | "none";

export type ReportThemeEnum = "corporate" | "emerald" | "purple" | "dark" | "custom";

export interface ModernPieChartContainerProps {
    name: string;
    class: string;
    style?: CSSProperties;
    tabIndex?: number;
    dataSource: ListValue;
    labelAttr: ListAttributeValue<string>;
    jsonAttr: ListAttributeValue<string>;
    valueAttr: ListAttributeValue<Big>;
    sliceColorAttr?: ListAttributeValue<string>;
    chartTitle: string;
    containerClass: string;
    chartHeightPx: string;
    chartTheme: ChartThemeEnum;
    startColor: string;
    endColor: string;
    donutMode: boolean;
    cutoutPercentage: string;
    showLabels: boolean;
    legendPosition: LegendPositionEnum;
    labelMaxLength: string;
    enableReport: boolean;
    reportTitle: string;
    companyName: string;
    generatedBy: string;
    footerText: string;
    exportButtonText: string;
    includeChart: boolean;
    includeStatistics: boolean;
    includeTable: boolean;
    generateReportAction?: ActionValue;
    companyLogo: string;
    reportTheme: ReportThemeEnum;
    primaryColor: string;
    secondaryColor: string;
}

export interface ModernPieChartPreviewProps {
    /**
     * @deprecated Deprecated since version 9.18.0. Please use class property instead.
     */
    className: string;
    class: string;
    style: string;
    styleObject?: CSSProperties;
    readOnly: boolean;
    renderMode: "design" | "xray" | "structure";
    translate: (text: string) => string;
    dataSource: {} | { caption: string } | { type: string } | null;
    labelAttr: string;
    jsonAttr: string;
    valueAttr: string;
    sliceColorAttr: string;
    chartTitle: string;
    containerClass: string;
    chartHeightPx: string;
    chartTheme: ChartThemeEnum;
    startColor: string;
    endColor: string;
    donutMode: boolean;
    cutoutPercentage: string;
    showLabels: boolean;
    legendPosition: LegendPositionEnum;
    labelMaxLength: string;
    enableReport: boolean;
    reportTitle: string;
    companyName: string;
    generatedBy: string;
    footerText: string;
    exportButtonText: string;
    includeChart: boolean;
    includeStatistics: boolean;
    includeTable: boolean;
    generateReportAction: {} | null;
    companyLogo: string;
    reportTheme: ReportThemeEnum;
    primaryColor: string;
    secondaryColor: string;
}
