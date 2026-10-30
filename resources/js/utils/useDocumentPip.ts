import { computed } from 'vue';
import dayjs from 'dayjs';
import { storeToRefs } from 'pinia';
import { formatDuration } from '@/packages/ui/src/utils/time';
import {
    getLastWorkTimeEntry,
    useCurrentTimeEntryStore,
} from '@/utils/useCurrentTimeEntry';
import { useProjectsQuery } from '@/utils/useProjectsQuery';
import { useTimeEntriesInfiniteQuery } from '@/utils/useTimeEntriesInfiniteQuery';
import { getCurrentOrganizationId } from '@/utils/useUser';
import { useOrganizationQuery } from '@/utils/useOrganizationQuery';
import { useBreaksEnabled } from '@/packages/ui/src/utils/useBreaksEnabled';
import { useNotificationsStore } from '@/utils/notification';

/**
 * Document Picture-in-Picture (Chromium: Edge/Chrome 116+).
 * Opens a real OS-level always-on-top mini window, so the timer stays
 * visible when switching tabs or apps. Not available in Safari/Firefox.
 *
 * State is module-scoped so every caller (floating pill, kebab menu, …)
 * controls the same single PiP window.
 */
interface DocumentPictureInPictureApi {
    requestWindow: (options?: { width?: number; height?: number }) => Promise<Window>;
    window?: Window | null;
}

let pipWindow: Window | null = null;
let pipElapsedElement: HTMLElement | null = null;
let pipSubElement: HTMLElement | null = null;
let pipBreakButton: HTMLButtonElement | null = null;
let pipCompactMode = false;
let pipInterval: ReturnType<typeof setInterval> | null = null;

const COFFEE_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>';
const PLAY_SVG =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15l13-7.5-13-7.5Z"/></svg>';

function getPipApi(): DocumentPictureInPictureApi | null {
    if (typeof window === 'undefined' || !('documentPictureInPicture' in window)) {
        return null;
    }
    return window.documentPictureInPicture as unknown as DocumentPictureInPictureApi;
}

function copyStylesInto(source: Document, target: Document) {
    for (const sheet of Array.from(source.styleSheets)) {
        try {
            const cssText = Array.from(sheet.cssRules)
                .map((rule) => rule.cssText)
                .join('');
            if (!cssText) {
                continue;
            }
            const style = target.createElement('style');
            style.textContent = cssText;
            target.head.appendChild(style);
        } catch {
            // Cross-origin stylesheet (e.g. fonts): re-link it instead of reading rules
            const ownerNode = sheet.ownerNode as HTMLLinkElement | null;
            if (ownerNode && ownerNode.tagName === 'LINK' && ownerNode.href) {
                const link = target.createElement('link');
                link.rel = 'stylesheet';
                link.href = ownerNode.href;
                target.head.appendChild(link);
            }
        }
    }
}

export function useDocumentPip() {
    const store = useCurrentTimeEntryStore();
    const { currentTimeEntry, now, isOnBreak } = storeToRefs(store);
    const { setActiveState, startBreak, resumeWorkAfterBreak } = store;
    const { projects } = useProjectsQuery();
    const { addNotification } = useNotificationsStore();

    const { organization } = useOrganizationQuery(getCurrentOrganizationId()!);
    const breaksEnabled = useBreaksEnabled(organization);

    const { data: timeEntriesData } = useTimeEntriesInfiniteQuery();
    const timeEntries = computed(
        () => timeEntriesData.value?.pages.flatMap((page) => page.data) || []
    );
    const lastWorkTimeEntry = computed(() => getLastWorkTimeEntry(timeEntries.value));

    async function toggleBreak() {
        if (isOnBreak.value) {
            const timeEntry = lastWorkTimeEntry.value;
            if (!timeEntry) {
                addNotification(
                    'error',
                    'Nothing to resume',
                    'No finished work entry found to resume.'
                );
                return;
            }
            await resumeWorkAfterBreak(timeEntry);
            return;
        }
        await startBreak();
    }

    const pipSupported = computed(() => getPipApi() !== null);

    function currentElapsedText(): string {
        if (now.value && currentTimeEntry.value.start) {
            const diff = now.value.diff(dayjs(currentTimeEntry.value.start), 's');
            return formatDuration(Math.max(diff, 0));
        }
        return formatDuration(0);
    }

    function currentTitleText(): string {
        if (isOnBreak.value) {
            return 'On break';
        }
        const project = currentTimeEntry.value.project_id
            ? (projects.value?.find((item) => item.id === currentTimeEntry.value.project_id) ??
              null)
            : null;
        const description = currentTimeEntry.value.description?.trim() || 'No description';
        return project ? `${project.name} › ${description}` : description;
    }

    function currentDotColor(): string {
        if (isOnBreak.value) {
            return '#f59e0b';
        }
        const project = currentTimeEntry.value.project_id
            ? (projects.value?.find((item) => item.id === currentTimeEntry.value.project_id) ??
              null)
            : null;
        return project?.color || '#3b82f6';
    }

    function refreshPipContent() {
        if (pipElapsedElement) {
            pipElapsedElement.textContent = currentElapsedText();
        }
        if (pipSubElement) {
            pipSubElement.textContent = currentTitleText();
        }
        if (pipBreakButton) {
            pipBreakButton.innerHTML = isOnBreak.value ? PLAY_SVG : COFFEE_SVG;
            pipBreakButton.title = isOnBreak.value ? 'Resume work' : 'Take a break';
            pipBreakButton.style.display =
                pipCompactMode || !breaksEnabled.value ? 'none' : '';
        }
    }

    function teardownPip() {
        if (pipInterval !== null) {
            clearInterval(pipInterval);
            pipInterval = null;
        }
        pipElapsedElement = null;
        pipSubElement = null;
        pipBreakButton = null;
        pipCompactMode = false;
        pipWindow = null;
    }

    function closePip() {
        try {
            pipWindow?.close();
        } catch {
            // Window may already be closed by the user
        }
        teardownPip();
    }

    async function togglePip() {
        const pipApi = getPipApi();
        if (!pipApi) {
            return;
        }
        if (pipWindow && !pipWindow.closed) {
            closePip();
            return;
        }
        try {
            pipWindow = await pipApi.requestWindow({ width: 300, height: 100 });
        } catch (error) {
            // Surface the reason instead of failing silently (e.g. outdated
            // browser, PiP blocked, prompt dismissed)
            console.error('[FloatingTimerWidget] PiP request failed:', error);
            addNotification(
                'error',
                'Could not open always-on-top window',
                error instanceof Error && error.message
                    ? error.message
                    : 'Your browser blocked the request. Edge/Chrome 116+ is required.'
            );
            pipWindow = null;
            return;
        }
        const doc = pipWindow.document;
        doc.title = 'solidtime timer';
        doc.body.style.margin = '0';
        copyStylesInto(document, doc);

        const container = doc.createElement('div');
        container.style.cssText =
            'height:100vh;box-sizing:border-box;position:relative;display:flex;align-items:center;gap:8px;padding:10px 12px;background:var(--color-bg-primary,#0f0f0f);color:var(--color-text-primary,#fafafa);font-family:inherit;';

        let pipCompact = false;
        const compactButton = doc.createElement('button');
        compactButton.textContent = '–';
        compactButton.title = 'Minimize to numbers only';
        compactButton.style.cssText =
            'position:absolute;top:4px;right:6px;width:16px;height:16px;border-radius:9999px;border:1px solid rgba(255,255,255,0.25);background:transparent;color:inherit;font-size:11px;line-height:1;cursor:pointer;opacity:0.7;padding:0;';
        compactButton.addEventListener('click', () => {
            pipCompact = !pipCompact;
            pipCompactMode = pipCompact;
            compactButton.textContent = pipCompact ? '+' : '–';
            compactButton.title = pipCompact ? 'Show full timer' : 'Minimize to numbers only';
            if (pipSubElement) {
                (pipSubElement as HTMLElement).style.display = pipCompact ? 'none' : '';
            }
            if (pipBreakButton) {
                pipBreakButton.style.display = pipCompact ? 'none' : '';
            }
            if (stopButton) {
                stopButton.style.display = pipCompact ? 'none' : '';
            }
            refreshPipContent();
        });
        container.appendChild(compactButton);

        const dot = doc.createElement('div');
        dot.style.cssText = `width:10px;height:10px;flex-shrink:0;border-radius:9999px;background:${currentDotColor()};`;
        container.appendChild(dot);

        pipSubElement = doc.createElement('div');
        (pipSubElement as HTMLElement).style.cssText =
            'flex:1;min-width:0;font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
        container.appendChild(pipSubElement as HTMLElement);

        pipElapsedElement = doc.createElement('div');
        (pipElapsedElement as HTMLElement).style.cssText =
            'flex-shrink:0;font-size:15px;font-weight:600;font-variant-numeric:tabular-nums;';
        container.appendChild(pipElapsedElement as HTMLElement);

        const stopButton = doc.createElement('button');
        stopButton.title = 'Stop timer';
        stopButton.style.cssText =
            'flex-shrink:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:none;border-radius:8px;background:#ef4444;cursor:pointer;padding:0;';
        const stopSquare = doc.createElement('div');
        stopSquare.style.cssText = 'width:13px;height:13px;border-radius:3px;background:#fff;';
        stopButton.appendChild(stopSquare);
        stopButton.addEventListener('click', () => {
            void setActiveState(false);
        });
        container.appendChild(stopButton);

        pipBreakButton = doc.createElement('button');
        pipBreakButton.title = 'Take a break';
        pipBreakButton.style.cssText =
            'flex-shrink:0;width:30px;height:30px;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.25);border-radius:9999px;background:transparent;color:inherit;cursor:pointer;padding:0;';
        pipBreakButton.innerHTML = COFFEE_SVG;
        pipBreakButton.addEventListener('click', () => {
            void toggleBreak();
        });
        container.insertBefore(pipBreakButton, stopButton);

        doc.body.appendChild(container);
        refreshPipContent();
        pipInterval = setInterval(refreshPipContent, 1000);
        pipWindow.addEventListener('pagehide', teardownPip, { once: true });
    }

    return { pipSupported, togglePip, closePip };
}
