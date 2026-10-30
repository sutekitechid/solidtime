import { ref, watch } from 'vue';

export type FloatingWidgetPosition = {
    left: number;
    top: number;
};

const MINIMIZED_KEY = 'solidtime/floating-timer-minimized';
const POSITION_KEY = 'solidtime/floating-timer-position';

function readMinimized(): boolean {
    try {
        return JSON.parse(localStorage.getItem(MINIMIZED_KEY) ?? 'false') === true;
    } catch {
        return false;
    }
}

function readPosition(): FloatingWidgetPosition | null {
    try {
        const raw = localStorage.getItem(POSITION_KEY);
        if (!raw || raw === 'null') {
            return null;
        }
        const parsed = JSON.parse(raw) as Partial<FloatingWidgetPosition>;
        if (typeof parsed.left === 'number' && typeof parsed.top === 'number') {
            return { left: parsed.left, top: parsed.top };
        }
        return null;
    } catch {
        return null;
    }
}

// Module-scoped so the kebab menu (Time page) and the floating pill
// (AppLayout) always control the same widget, live in the same tab.
const minimized = ref<boolean>(readMinimized());
const pillPosition = ref<FloatingWidgetPosition | null>(readPosition());

watch(minimized, (value) => {
    try {
        localStorage.setItem(MINIMIZED_KEY, JSON.stringify(value));
    } catch {
        // Storage may be unavailable (private mode); widget still works in-memory
    }
});

watch(pillPosition, (value) => {
    try {
        localStorage.setItem(POSITION_KEY, JSON.stringify(value));
    } catch {
        // Storage may be unavailable (private mode); widget still works in-memory
    }
});

export function useFloatingWidgetUi() {
    function showWidget() {
        minimized.value = false;
        pillPosition.value = null;
    }

    function hideWidget() {
        minimized.value = true;
    }

    return { minimized, pillPosition, showWidget, hideWidget };
}
