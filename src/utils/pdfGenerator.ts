import { PDFDocument, PDFPage, PDFFont, rgb, RGB, StandardFonts } from "pdf-lib";
import { PieSlice } from "./dataTransform";

export type ReportTheme = "corporate" | "emerald" | "purple" | "dark" | "custom";

export interface PdfGeneratorOptions {
    chartImageBase64?: string;
    slices: PieSlice[];
    sliceColors?: string[];
    reportTitle: string;
    companyName?: string;
    generatedBy?: string;
    footerText?: string;
    includeChart: boolean;
    includeStatistics: boolean;
    includeTable: boolean;
    companyLogoBase64?: string;
    reportTheme: ReportTheme;
    primaryColor?: string;
    secondaryColor?: string;
}

// --- Theme -------------------------------------------------------------
// Same shape and same case values as the line chart's report ThemeManager,
// so picking the same reportTheme on both widgets produces the same colors.

interface PdfReportTheme {
    primary: string;
    secondary: string;
    background: string;
    card: string;
    text: string;
}

function getReportTheme(theme: string, primary?: string, secondary?: string): PdfReportTheme {
    switch (theme) {
        case "emerald":
            return { primary: "#059669", secondary: "#10B981", background: "#ECFDF5", card: "#FFFFFF", text: "#064E3B" };
        case "purple":
            return { primary: "#7C3AED", secondary: "#A78BFA", background: "#F5F3FF", card: "#FFFFFF", text: "#312E81" };
        case "dark":
            return { primary: "#111827", secondary: "#374151", background: "#1F2937", card: "#374151", text: "#F9FAFB" };
        case "custom":
            return { primary: primary || "#2563EB", secondary: secondary || "#60A5FA", background: "#F8FAFC", card: "#FFFFFF", text: "#1E293B" };
        case "corporate":
        default:
            return { primary: "#2563EB", secondary: "#60A5FA", background: "#F8FAFC", card: "#FFFFFF", text: "#1E293B" };
    }
}

// --- Layout constants (identical to the line chart's PDF report) -------

const PAGE_WIDTH = 595.28; // A4 portrait, points
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

interface PdfContext {
    doc: PDFDocument;
    pages: PDFPage[];
    page: PDFPage;
    y: number;
    theme: PdfReportTheme;
    fontRegular: PDFFont;
    fontBold: PDFFont;
}

interface PieStatistics {
    count: number;
    total: number;
    average: number;
    largestLabel: string;
    largestValue: number;
    largestPct: number;
    smallestLabel: string;
    smallestValue: number;
}

function computeStatistics(slices: PieSlice[]): PieStatistics {
    const total = slices.reduce((sum, s) => sum + s.value, 0);
    const largest = slices.reduce((a, b) => (!a || b.value > a.value ? b : a), slices[0]);
    const smallest = slices.reduce((a, b) => (!a || b.value < a.value ? b : a), slices[0]);
    return {
        count: slices.length,
        total,
        average: slices.length > 0 ? total / slices.length : 0,
        largestLabel: largest?.label ?? "-",
        largestValue: largest?.value ?? 0,
        largestPct: total > 0 ? ((largest?.value ?? 0) / total) * 100 : 0,
        smallestLabel: smallest?.label ?? "-",
        smallestValue: smallest?.value ?? 0
    };
}

function hexToRgb(hex: string, fallback = "#2563EB"): RGB {
    const clean = (hex || fallback).replace("#", "");
    const full = clean.length === 3 ? clean.split("").map(c => c + c).join("") : clean;
    const bigint = parseInt(full, 16) || 0;
    return rgb(((bigint >> 16) & 255) / 255, ((bigint >> 8) & 255) / 255, (bigint & 255) / 255);
}

// StandardFonts only support WinAnsi (roughly Latin-1). Strip anything else
// (e.g. emoji from labels) rather than letting pdf-lib throw an encoding error.
function safe(text: unknown): string {
    return String(text ?? "").replace(/[^\x00-\xFF]/g, "").trim() || "-";
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
    const words = text.split(/\s+/);
    const lines: string[] = [];
    let current = "";
    for (const word of words) {
        const candidate = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
            lines.push(current);
            current = word;
        } else {
            current = candidate;
        }
    }
    if (current) {
        lines.push(current);
    }
    return lines;
}

function newPage(ctx: PdfContext): void {
    const page = ctx.doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    page.drawRectangle({
        x: 0,
        y: 0,
        width: PAGE_WIDTH,
        height: PAGE_HEIGHT,
        color: hexToRgb(ctx.theme.background)
    });
    ctx.pages.push(page);
    ctx.page = page;
    ctx.y = PAGE_HEIGHT - MARGIN;
}

function ensureSpace(ctx: PdfContext, height: number): void {
    if (ctx.y - height < MARGIN + 24) {
        newPage(ctx);
    }
}

function text(
    ctx: PdfContext,
    str: string,
    x: number,
    y: number,
    opts: { font?: PDFFont; size?: number; color?: RGB } = {}
): void {
    ctx.page.drawText(safe(str), {
        x,
        y,
        font: opts.font || ctx.fontRegular,
        size: opts.size || 10,
        color: opts.color || hexToRgb(ctx.theme.text)
    });
}

function cardBackground(ctx: PdfContext, height: number): void {
    ctx.page.drawRectangle({
        x: MARGIN,
        y: ctx.y - height,
        width: CONTENT_WIDTH,
        height,
        color: hexToRgb(ctx.theme.card),
        borderColor: rgb(0.85, 0.87, 0.91),
        borderWidth: 1
    });
}

/** Small filled-pill "badge", e.g. the top-category indicator or section badge. */
function badge(
    ctx: PdfContext,
    label: string,
    x: number,
    y: number,
    color: RGB,
    textColor: RGB = rgb(1, 1, 1)
): number {
    const size = 8;
    const paddingX = 8;
    const width = ctx.fontBold.widthOfTextAtSize(label, size) + paddingX * 2;
    ctx.page.drawRectangle({ x, y, width, height: 16, color });
    text(ctx, label, x + paddingX, y + 4, { font: ctx.fontBold, size, color: textColor });
    return width;
}

// --- Section builders, mirroring the line chart's PDF report layout ----

async function buildHeaderSection(
    ctx: PdfContext,
    reportTitle: string,
    companyName: string | undefined,
    logoBase64: string | undefined
): Promise<void> {
    const height = 70;
    ensureSpace(ctx, height + 20);
    cardBackground(ctx, height);

    let textX = MARGIN + 20;

    const logoImage = await tryEmbedLogo(ctx, logoBase64);
    if (logoImage) {
        const logoBox = 40; // matches the line chart report's logo sizing
        const scale = Math.min(logoBox / logoImage.width, logoBox / logoImage.height);
        const drawWidth = logoImage.width * scale;
        const drawHeight = logoImage.height * scale;
        const logoY = ctx.y - (height - drawHeight) / 2 - drawHeight;
        ctx.page.drawImage(logoImage, {
            x: MARGIN + 20,
            y: logoY,
            width: drawWidth,
            height: drawHeight
        });
        textX = MARGIN + 20 + logoBox + 14;
    }

    text(ctx, reportTitle || "Pie Chart Report", textX, ctx.y - 34, {
        font: ctx.fontBold,
        size: 18,
        color: hexToRgb(ctx.theme.text)
    });
    if (companyName) {
        text(ctx, companyName, textX, ctx.y - 52, {
            size: 10,
            color: rgb(0.45, 0.5, 0.58)
        });
    }
    ctx.y -= height + 20;
}

/**
 * Embeds a base64-encoded company logo (PNG or JPG only — SVG can't be
 * embedded by pdf-lib). Returns null rather than throwing if it's missing
 * or in an unsupported format.
 */
async function tryEmbedLogo(ctx: PdfContext, logoBase64?: string) {
    if (!logoBase64) {
        return null;
    }
    try {
        return logoBase64.includes("png")
            ? await ctx.doc.embedPng(logoBase64)
            : await ctx.doc.embedJpg(logoBase64);
    } catch {
        return null;
    }
}

function buildExecutiveSummarySection(ctx: PdfContext, stats: PieStatistics): void {
    const paragraph =
        `This report contains ${stats.count} categories with a combined total of ` +
        `${stats.total.toLocaleString()}. The largest category is ${stats.largestLabel} at ` +
        `${stats.largestValue.toLocaleString()} (${stats.largestPct.toFixed(1)}% of total). ` +
        `The smallest is ${stats.smallestLabel} at ${stats.smallestValue.toLocaleString()}. ` +
        `The average value per category is ${stats.average.toFixed(2)}.`;

    const lines = wrapText(safe(paragraph), ctx.fontRegular, 10, CONTENT_WIDTH - 40);
    const height = 40 + lines.length * 14;
    ensureSpace(ctx, height + 20);
    cardBackground(ctx, height);

    text(ctx, "Executive Summary", MARGIN + 20, ctx.y - 26, {
        font: ctx.fontBold,
        size: 13,
        color: hexToRgb(ctx.theme.primary)
    });
    lines.forEach((line, i) => {
        text(ctx, line, MARGIN + 20, ctx.y - 44 - i * 14, { size: 10 });
    });
    ctx.y -= height + 20;
}

function buildInfoCardsSection(
    ctx: PdfContext,
    companyName: string | undefined,
    generatedBy: string | undefined
): void {
    const height = 64;
    ensureSpace(ctx, height + 20);
    cardBackground(ctx, height);

    const items: Array<[string, string]> = [
        ["Generated On", new Date().toLocaleString()],
        ["Generated By", generatedBy || "-"],
        ["Company", companyName || "-"]
    ];
    const colWidth = (CONTENT_WIDTH - 40) / 3;
    items.forEach(([label, value], i) => {
        const x = MARGIN + 20 + i * colWidth;
        text(ctx, label.toUpperCase(), x, ctx.y - 24, { size: 8, color: rgb(0.45, 0.5, 0.58) });
        text(ctx, value, x, ctx.y - 40, { font: ctx.fontBold, size: 11 });
    });
    ctx.y -= height + 20;
}

async function buildChartSection(
    ctx: PdfContext,
    reportTitle: string,
    stats: PieStatistics,
    chartImageBase64: string | undefined
): Promise<void> {
    // Header row of the chart card (badge, heading, subtitle, meta, top-category badge)
    const headerHeight = 86;
    ensureSpace(ctx, headerHeight + 260);

    const cardTop = ctx.y;
    let innerY = ctx.y - 20;

    badge(ctx, "DISTRIBUTION OVERVIEW", MARGIN + 20, innerY - 8, hexToRgb(ctx.theme.primary));
    innerY -= 26;
    text(ctx, reportTitle || "Pie Chart Report", MARGIN + 20, innerY, {
        font: ctx.fontBold,
        size: 15
    });
    innerY -= 16;
    text(
        ctx,
        "Category breakdown generated from the selected dataset.",
        MARGIN + 20,
        innerY,
        { size: 9, color: rgb(0.45, 0.5, 0.58) }
    );
    innerY -= 14;
    text(
        ctx,
        `${stats.count} categories  |  Total ${stats.total.toLocaleString()}  |  Average ${stats.average.toFixed(2)}`,
        MARGIN + 20,
        innerY,
        { size: 9, color: rgb(0.45, 0.5, 0.58) }
    );

    // Top-category badge, right-aligned to the card (mirrors the line
    // chart's trend badge in the same position and style).
    const badgeLabel = safe(`TOP: ${stats.largestLabel}`).toUpperCase();
    const badgeWidth = ctx.fontBold.widthOfTextAtSize(badgeLabel, 8) + 16;
    badge(ctx, badgeLabel, MARGIN + CONTENT_WIDTH - 20 - badgeWidth, cardTop - 30, hexToRgb(ctx.theme.secondary));

    ctx.y = innerY - 16;

    // Chart image
    if (chartImageBase64) {
        try {
            const base64 = chartImageBase64.split(",")[1] ?? chartImageBase64;
            const imageBytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            const png = await ctx.doc.embedPng(imageBytes);
            const availableWidth = CONTENT_WIDTH - 40;
            const scale = availableWidth / png.width;
            const drawWidth = availableWidth;
            const drawHeight = png.height * scale;
            ctx.y -= drawHeight;
            ctx.page.drawImage(png, { x: MARGIN + 20, y: ctx.y, width: drawWidth, height: drawHeight });
            ctx.y -= 20;
        } catch {
            text(ctx, "(chart image unavailable)", MARGIN + 20, ctx.y, { size: 9, color: rgb(0.6, 0.6, 0.6) });
            ctx.y -= 20;
        }
    }

    // Highlight cards (Largest / Smallest / Total / Categories)
    const highlights: Array<[string, string, string]> = [
        ["Largest Category", stats.largestValue.toLocaleString(), stats.largestLabel],
        ["Smallest Category", stats.smallestValue.toLocaleString(), stats.smallestLabel],
        ["Total Value", stats.total.toLocaleString(), "Sum of All Categories"],
        ["Categories", String(stats.count), "Total Count"]
    ];
    const hHeight = 56;
    ensureSpace(ctx, hHeight + 20);
    const colWidth = (CONTENT_WIDTH - 40 - 3 * 10) / 4;
    highlights.forEach(([title, value, subtitle], i) => {
        const x = MARGIN + 20 + i * (colWidth + 10);
        ctx.page.drawRectangle({
            x,
            y: ctx.y - hHeight,
            width: colWidth,
            height: hHeight,
            color: hexToRgb(ctx.theme.background),
            borderColor: rgb(0.85, 0.87, 0.91),
            borderWidth: 1
        });
        text(ctx, title.toUpperCase(), x + 10, ctx.y - 18, { size: 7, color: rgb(0.45, 0.5, 0.58) });
        text(ctx, value, x + 10, ctx.y - 34, { font: ctx.fontBold, size: 12 });
        text(ctx, subtitle, x + 10, ctx.y - 48, { size: 7, color: rgb(0.45, 0.5, 0.58) });
    });
    ctx.y -= hHeight + 24;
}

function buildKpiCardsSection(ctx: PdfContext, stats: PieStatistics): void {
    const kpis: Array<[string, string, string]> = [
        ["Total Value", stats.total.toFixed(2), "Sum of all categories"],
        ["Average", stats.average.toFixed(2), "Mean value"],
        ["Largest Category", stats.largestValue.toLocaleString(), stats.largestLabel],
        ["Categories", String(stats.count), "Total number of categories"]
    ];

    ensureSpace(ctx, 90);
    text(ctx, "Performance Metrics", MARGIN, ctx.y - 4, {
        font: ctx.fontBold,
        size: 14,
        color: hexToRgb(ctx.theme.primary)
    });
    ctx.y -= 24;

    const cardHeight = 64;
    ensureSpace(ctx, cardHeight + 20);
    const colWidth = (CONTENT_WIDTH - 3 * 10) / 4;
    kpis.forEach(([title, value, subtitle], i) => {
        const x = MARGIN + i * (colWidth + 10);
        ctx.page.drawRectangle({
            x,
            y: ctx.y - cardHeight,
            width: colWidth,
            height: cardHeight,
            color: hexToRgb(ctx.theme.card),
            borderColor: rgb(0.85, 0.87, 0.91),
            borderWidth: 1
        });
        text(ctx, title.toUpperCase(), x + 10, ctx.y - 18, { size: 7, color: rgb(0.45, 0.5, 0.58) });
        text(ctx, value, x + 10, ctx.y - 36, { font: ctx.fontBold, size: 13 });
        text(ctx, subtitle, x + 10, ctx.y - 52, { size: 7, color: rgb(0.45, 0.5, 0.58) });
    });
    ctx.y -= cardHeight + 24;
}

function drawTableHeader(ctx: PdfContext, colX: number[]): void {
    const rowHeight = 22;
    ctx.page.drawRectangle({
        x: MARGIN,
        y: ctx.y - rowHeight,
        width: CONTENT_WIDTH,
        height: rowHeight,
        color: hexToRgb(ctx.theme.primary)
    });
    const headers = ["#", "Label", "Value", "Share", "Color"];
    headers.forEach((h, i) => {
        text(ctx, h, colX[i], ctx.y - 15, { font: ctx.fontBold, size: 9, color: rgb(1, 1, 1) });
    });
    ctx.y -= rowHeight;
}

function buildDataTableSection(ctx: PdfContext, slices: PieSlice[], sliceColors: string[], stats: PieStatistics): void {
    ensureSpace(ctx, 60);
    text(ctx, "Category Breakdown", MARGIN, ctx.y - 4, {
        font: ctx.fontBold,
        size: 14,
        color: hexToRgb(ctx.theme.primary)
    });
    ctx.y -= 22;

    const colX = [
        MARGIN + 10,
        MARGIN + 45,
        MARGIN + CONTENT_WIDTH * 0.45,
        MARGIN + CONTENT_WIDTH * 0.65,
        MARGIN + CONTENT_WIDTH * 0.85
    ];

    ensureSpace(ctx, 30);
    drawTableHeader(ctx, colX);

    const rowHeight = 18;

    slices.forEach((slice, index) => {
        if (ctx.y - rowHeight < MARGIN + 24) {
            newPage(ctx);
            drawTableHeader(ctx, colX);
        }

        const pct = stats.total > 0 ? (slice.value / stats.total) * 100 : 0;
        const dotColor = hexToRgb(sliceColors[index] ?? "#6366f1");

        if (index % 2 === 1) {
            ctx.page.drawRectangle({
                x: MARGIN,
                y: ctx.y - rowHeight,
                width: CONTENT_WIDTH,
                height: rowHeight,
                color: hexToRgb(ctx.theme.background)
            });
        }

        text(ctx, String(index + 1), colX[0], ctx.y - 13, { size: 9 });
        text(ctx, String(slice.label), colX[1], ctx.y - 13, { size: 9 });
        text(ctx, slice.value.toLocaleString(), colX[2], ctx.y - 13, { size: 9 });
        text(ctx, `${pct.toFixed(2)}%`, colX[3], ctx.y - 13, { size: 9 });
        ctx.page.drawCircle({ x: colX[4] + 4, y: ctx.y - 10, size: 4, color: dotColor });

        ctx.y -= rowHeight;
    });

    ctx.y -= 16;
}

function stampFootersAndPageNumbers(ctx: PdfContext, footerText: string | undefined): void {
    const total = ctx.pages.length;
    ctx.pages.forEach((page, i) => {
        page.drawText(safe(footerText || "Generated using ModernPieChart"), {
            x: MARGIN,
            y: 20,
            font: ctx.fontRegular,
            size: 8,
            color: rgb(0.5, 0.55, 0.6)
        });
        const pageLabel = `Page ${i + 1} of ${total}`;
        const width = ctx.fontRegular.widthOfTextAtSize(pageLabel, 8);
        page.drawText(pageLabel, {
            x: PAGE_WIDTH - MARGIN - width,
            y: 20,
            font: ctx.fontRegular,
            size: 8,
            color: rgb(0.5, 0.55, 0.6)
        });
    });
}

/**
 * Builds a downloadable PDF that mirrors the line chart widget's report
 * structure and theming exactly: header card (with optional logo),
 * executive summary, info cards, a chart card with highlight tiles, KPI
 * cards, a full (paginated) data table, and a footer with page numbers on
 * every page.
 */
export async function generatePieChartPdf(options: PdfGeneratorOptions): Promise<Uint8Array> {
    const {
        chartImageBase64,
        slices,
        sliceColors,
        reportTitle,
        companyName,
        generatedBy,
        footerText,
        includeChart,
        includeStatistics,
        includeTable,
        companyLogoBase64,
        reportTheme,
        primaryColor,
        secondaryColor
    } = options;

    const theme = getReportTheme(reportTheme, primaryColor, secondaryColor);
    const stats = computeStatistics(slices);
    const colors = sliceColors && sliceColors.length === slices.length
        ? sliceColors
        : slices.map(() => theme.secondary);

    const doc = await PDFDocument.create();
    const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
    const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

    const ctx: PdfContext = {
        doc,
        pages: [],
        page: doc.addPage([PAGE_WIDTH, PAGE_HEIGHT]), // replaced by newPage() below
        y: PAGE_HEIGHT - MARGIN,
        theme,
        fontRegular,
        fontBold
    };
    // Remove the placeholder page created above and start clean via newPage()
    doc.removePage(0);
    newPage(ctx);

    await buildHeaderSection(ctx, reportTitle, companyName, companyLogoBase64);
    if (includeStatistics) {
        buildExecutiveSummarySection(ctx, stats);
    }
    buildInfoCardsSection(ctx, companyName, generatedBy);
    if (includeChart) {
        await buildChartSection(ctx, reportTitle, stats, chartImageBase64);
    }
    if (includeStatistics) {
        buildKpiCardsSection(ctx, stats);
    }
    if (includeTable) {
        buildDataTableSection(ctx, slices, colors, stats);
    }

    stampFootersAndPageNumbers(ctx, footerText);

    return doc.save();
}
