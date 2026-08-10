import { ReactElement, createElement } from "react";
import { ModernPieChartContainerProps } from "typings/ModernPieChartProps";


export function HelloWorldSample({ chartHeightPx}: ModernPieChartContainerProps): ReactElement {
    return <div className="widget-hello-world">Hello {chartHeightPx}</div>;
}
