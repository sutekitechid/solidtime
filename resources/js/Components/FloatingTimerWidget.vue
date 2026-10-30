<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { router } from '@inertiajs/vue3';
import { storeToRefs } from 'pinia';
import dayjs from 'dayjs';
import {
    ArrowsPointingOutIcon,
    ChevronDownIcon,
    ChevronUpIcon,
} from '@heroicons/vue/20/solid';
import { formatDuration } from '@/packages/ui/src/utils/time';
import { useCurrentTimeEntryStore } from '@/utils/useCurrentTimeEntry';
import { useProjectsQuery } from '@/utils/useProjectsQuery';
import { useDocumentPip } from '@/utils/useDocumentPip';
import { useFloatingWidgetUi } from '@/utils/useFloatingWidgetUi';

const store = useCurrentTimeEntryStore();
const { currentTimeEntry, now, isActive, isOnBreak } = storeToRefs(store);
const { setActiveState } = store;

const { projects } = useProjectsQuery();
const { pipSupported, togglePip, closePip } = useDocumentPip();
const { minimized, pillPosition } = useFloatingWidgetUi();

watch(isActive, (active) => {
    if (!active) {
        minimized.value = false;
        closePip();
    }
});

function currentElapsedText(): string {
    if (now.value && currentTimeEntry.value.start) {
        const diff = now.value.diff(dayjs(currentTimeEntry.value.start), 's');
        return formatDuration(Math.max(diff, 0));
    }
    return formatDuration(0);
}

const elapsed = computed(() => currentElapsedText());

const project = computed(() => {
    if (!currentTimeEntry.value.project_id) {
        return null;
    }
    return (
        projects.value?.find((item) => item.id === currentTimeEntry.value.project_id) ?? null
    );
});

const projectName = computed(() => project.value?.name ?? null);

const projectColor = computed(() => {
    if (isOnBreak.value) {
        return '#f59e0b';
    }
    return project.value?.color || '#3b82f6';
});

const description = computed(() => {
    return currentTimeEntry.value.description?.trim() || 'No description';
});

const titleText = computed(() => {
    if (isOnBreak.value) {
        return 'On break';
    }
    if (projectName.value) {
        return `${projectName.value} › ${description.value}`;
    }
    return description.value;
});

function goToTimePage() {
    router.visit('/time');
}

// Draggable pill: drag by the grip handle, position persisted per device
const pillRef = ref<HTMLElement | null>(null);

function onGripPointerDown(event: PointerEvent) {
    const element = pillRef.value;
    if (!element) {
        return;
    }
    event.preventDefault();
    const rect = element.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;
    const onMove = (moveEvent: PointerEvent) => {
        const left = Math.min(Math.max(moveEvent.clientX - offsetX, 8), window.innerWidth - 120);
        const top = Math.min(
            Math.max(moveEvent.clientY - offsetY, 8),
            window.innerHeight - 48
        );
        pillPosition.value = { left, top };
    };
    const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
}

function resetPillPosition() {
    pillPosition.value = null;
}

// A persisted drag position can end up off-screen (e.g. viewport shrank
// because DevTools was opened). Pull it back into view on mount/resize.
function clampPositionToViewport() {
    if (!pillPosition.value || typeof window === 'undefined') {
        return;
    }
    const left = Math.min(
        Math.max(pillPosition.value.left, 8),
        Math.max(window.innerWidth - 120, 8)
    );
    const top = Math.min(
        Math.max(pillPosition.value.top, 8),
        Math.max(window.innerHeight - 48, 8)
    );
    if (left !== pillPosition.value.left || top !== pillPosition.value.top) {
        pillPosition.value = { left, top };
    }
}

onMounted(() => {
    clampPositionToViewport();
    window.addEventListener('resize', clampPositionToViewport);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', clampPositionToViewport);
    closePip();
});
</script>

<template>
    <Teleport to="body">
        <div
            v-if="isActive"
            ref="pillRef"
            data-testid="floating-timer-widget"
            :class="[pillPosition ? '' : 'bottom-5 right-5']"
            :style="
                pillPosition
                    ? { left: `${pillPosition.left}px`, top: `${pillPosition.top}px` }
                    : undefined
            "
            class="fixed z-50 select-none">
            <!-- Ultra-compact pill -->
            <button
                v-if="minimized"
                data-testid="floating-timer-expand"
                class="flex items-center gap-2 rounded-full border border-default-background-separator bg-background py-2 pl-3 pr-2 shadow-xl hover:shadow-2xl transition-shadow"
                @click="minimized = false">
                <span
                    class="h-2.5 w-2.5 rounded-full"
                    :style="{ backgroundColor: projectColor }" />
                <span
                    data-testid="floating-timer-elapsed"
                    class="font-mono text-sm font-semibold text-text-primary tabular-nums">
                    {{ elapsed }}
                </span>
                <ChevronUpIcon class="h-4 w-4 text-text-tertiary" />
            </button>

            <!-- Main pill: grip + dot + title + elapsed + actions -->
            <div
                v-else
                class="flex max-w-[440px] items-center gap-2.5 rounded-2xl border border-default-background-separator bg-background py-2 pl-2.5 pr-2 shadow-xl">
                <span
                    class="cursor-grab touch-none text-text-tertiary hover:text-text-primary active:cursor-grabbing"
                    title="Drag to move (double-click to reset position)"
                    @pointerdown="onGripPointerDown"
                    @dblclick="resetPillPosition">
                    <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                        <circle cx="2.5" cy="2.5" r="1.5" />
                        <circle cx="7.5" cy="2.5" r="1.5" />
                        <circle cx="2.5" cy="8" r="1.5" />
                        <circle cx="7.5" cy="8" r="1.5" />
                        <circle cx="2.5" cy="13.5" r="1.5" />
                        <circle cx="7.5" cy="13.5" r="1.5" />
                    </svg>
                </span>
                <span
                    class="h-2.5 w-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: projectColor }" />
                <button
                    data-testid="floating-timer-open-time"
                    class="min-w-0 flex-1 truncate text-left text-sm font-medium text-text-primary hover:underline"
                    @click="goToTimePage">
                    {{ titleText }}
                </button>
                <span
                    data-testid="floating-timer-elapsed"
                    class="shrink-0 font-mono text-sm font-semibold text-text-primary tabular-nums">
                    {{ elapsed }}
                </span>
                <button
                    v-if="pipSupported"
                    data-testid="floating-timer-popout"
                    class="shrink-0 rounded-full p-1.5 text-text-tertiary hover:bg-quaternary hover:text-text-primary transition-colors"
                    title="Pop out: always on top (Edge/Chrome)"
                    @click="togglePip">
                    <ArrowsPointingOutIcon class="h-4 w-4" />
                </button>
                <button
                    data-testid="floating-timer-minimize"
                    class="shrink-0 rounded-full p-1.5 text-text-tertiary hover:bg-quaternary hover:text-text-primary transition-colors"
                    title="Minimize widget"
                    @click="minimized = true">
                    <ChevronDownIcon class="h-4 w-4" />
                </button>
                <button
                    data-testid="floating-timer-stop"
                    class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-500 hover:bg-red-600 transition-colors"
                    title="Stop timer"
                    @click="setActiveState(false)">
                    <span class="h-3.5 w-3.5 rounded-[3px] bg-white" />
                </button>
            </div>
        </div>
    </Teleport>
</template>
