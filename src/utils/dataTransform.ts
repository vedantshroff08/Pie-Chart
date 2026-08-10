import { ListValue, ListAttributeValue } from "mendix";
import Big from "big.js";

export interface PieSlice {
    label: string;
    value: number;
    color?: string;
    records: Record<string, unknown>[]
}

/**
 * Converts the Mendix datasource + attributes into a flat array
 * ready for Chart.js consumption.
 */
export function transformToSlices(
    dataSource: ListValue,
    labelAttr: ListAttributeValue<string>,
    valueAttr: ListAttributeValue<Big>,
    colorAttr?: ListAttributeValue<string>,
    jsonAttr?: ListAttributeValue<string>
): PieSlice[] {
    if (dataSource.status !== "available" || !dataSource.items) {
        return [];
    }

    return dataSource.items.map(item => {
        const labelValue = labelAttr.get(item).value ?? "";
        const rawValue = valueAttr.get(item).value;
        const numericValue = rawValue ? Number(rawValue.toString()) : 0;
        const color = colorAttr?.get(item).value ?? undefined;

        let records: Record<string, unknown>[] = [];

        if (jsonAttr) {
            const json = jsonAttr.get(item).value;

            if (json) {
                try {
                    const parsed = JSON.parse(json);

                    // Support both an array and a single object
                    if (Array.isArray(parsed)) {
                        records = parsed;
                    } else if (parsed && typeof parsed === "object") {
                        records = [parsed];
                    }
                } catch (error) {
                    console.error(
                        `Invalid JSON for slice "${labelValue}"`,
                        error
                    );
                }
            }
        }

        return {
            label: String(labelValue),
            value: numericValue,
            color,
            records
        };
    });
}
export function truncateLabel(label: string, maxLength?: number): string {
    if (!maxLength || maxLength <= 0 || label.length <= maxLength) {
        return label;
    }
    return label.slice(0, maxLength - 1) + "…";
}