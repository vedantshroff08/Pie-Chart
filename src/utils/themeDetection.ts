/**
 * Walks up from the given element to find the first ancestor with a
 * non-transparent background color, then evaluates its luminance.
 * Falls back to <body> if nothing else has an explicit background.
 */
export function isParentDark(el: HTMLElement): boolean {
    let node: HTMLElement | null = el.parentElement;

    while (node) {
        const bg = window.getComputedStyle(node).backgroundColor;
        const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/.exec(bg);

        if (match) {
            const alpha = match[4] !== undefined ? parseFloat(match[4]) : 1;
            if (alpha > 0) {
                const r = parseInt(match[1], 10);
                const g = parseInt(match[2], 10);
                const b = parseInt(match[3], 10);
                const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
                return luminance < 0.5;
            }
        }
        node = node.parentElement;
    }

    // Also check common dark-mode conventions on <html> / <body>
    // (class="dark", data-theme="dark") in case background walking found nothing.
    const html = document.documentElement;
    const body = document.body;
    if (
        html.classList.contains("dark") ||
        body.classList.contains("dark") ||
        html.getAttribute("data-theme") === "dark" ||
        body.getAttribute("data-theme") === "dark"
    ) {
        return true;
    }

    return false;
}

/**
 * Watches for theme changes by observing the parent chain, plus
 * <html> and <body> directly (where most theme toggles apply their
 * class/attribute), and invokes the callback with the current state.
 */
export function observeThemeChanges(el: HTMLElement, onChange: (isDark: boolean) => void): () => void {
    onChange(isParentDark(el));

    const observers: MutationObserver[] = [];
    const notify = (): void => onChange(isParentDark(el));

    const watch = (target: Element | null): void => {
        if (!target) {
            return;
        }
        const observer = new MutationObserver(notify);
        observer.observe(target, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });
        observers.push(observer);
    };

    // Watch the widget's own ancestor chain (a few levels)
    let node: HTMLElement | null = el.parentElement;
    let depth = 0;
    while (node && depth < 5) {
        watch(node);
        node = node.parentElement;
        depth++;
    }

    // Watch the two most common theme-toggle targets directly
    watch(document.documentElement);
    watch(document.body);

    return () => observers.forEach(o => o.disconnect());
}