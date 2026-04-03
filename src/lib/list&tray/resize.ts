import { selectedFile } from "$lib/stores/files";
import { showExecutionResults } from "$lib/stores/lists";
import { derived, get, writable } from "svelte/store";

// Config Variables
export const PANEL_HEIGHT_STORAGE_PREFIX = 'list-tray-height';
export const PANEL_MIN_HEIGHT = 120;
export const PANEL_DEFAULT_HEIGHT = 220;
export const PANEL_MAX_VIEWPORT_RATIO = 0.6;

export const RESULTS_PANEL_DEFAULT_WIDTH = 320;
export const RESULTS_PANEL_MIN_WIDTH = 240;
export const RESULTS_PANEL_MIN_LEFT_WIDTH = 260;
export const RESULTS_PANEL_MAX_CONTAINER_RATIO = 0.6;

export const trayHeight = writable(PANEL_DEFAULT_HEIGHT);
export const isResizing = writable(false);
export const isResizeHandleHovered = writable(false);
export const executionResultsWidth = writable(RESULTS_PANEL_DEFAULT_WIDTH);
export const isExecutionResultsResizing = writable(false);
export const isExecutionResizeHandleHovered = writable(false);

export const startClientY = writable(0);
export const startPanelHeight = writable(0);
export const startClientX = writable(0);
export const startExecutionResultsWidth = writable(0);

// Util Stores
const selectedFileId = derived([selectedFile], ([$selectedFile]) => $selectedFile?.id);

// Utils
export function getStorageKey(fileId: string) {
    return `${PANEL_HEIGHT_STORAGE_PREFIX}:${fileId}`;
}

export function getMaxHeight() {
    if (typeof window === 'undefined') {
        return Number.POSITIVE_INFINITY;
    }

    return Math.floor(window.innerHeight * PANEL_MAX_VIEWPORT_RATIO);
}

export function clampHeight(height: number) {
    return Math.min(getMaxHeight(), Math.max(PANEL_MIN_HEIGHT, height));
}

export function saveTrayHeight(fileId: string, height: number) {
    if (typeof window === 'undefined' || !fileId) {
        return;
    }

    localStorage.setItem(getStorageKey(fileId), String(clampHeight(height)));
}

export function loadTrayHeight(fileId: string) {
    if (typeof window === 'undefined' || !fileId) {
        trayHeight.set(clampHeight(PANEL_DEFAULT_HEIGHT));
        return;
    }

    const storedHeight = Number(localStorage.getItem(getStorageKey(fileId)));
    if (Number.isFinite(storedHeight) && storedHeight > 0) {
        trayHeight.set(clampHeight(storedHeight));
        return;
    }

    trayHeight.set(clampHeight(PANEL_DEFAULT_HEIGHT));
}

// Handlers
export function onResizeHandleMouseDown(event: MouseEvent) {
    isResizing.set(true);
    startClientY.set(event.clientY);
    startPanelHeight.set(get(trayHeight));

    window.addEventListener('mousemove', onResizeMouseMove);
    window.addEventListener('mouseup', onResizeMouseUp);

    document.body.classList.add('cursor-ns-resize', 'select-none');
    event.preventDefault();
}

export function onResizeMouseMove(event: MouseEvent) {
    if (!get(isResizing)) {
        return;
    }

    const deltaY = event.clientY - get(startClientY);
    trayHeight.set(clampHeight(get(startPanelHeight) - deltaY));
}

export function onResizeMouseUp() {
    if (!get(isResizing)) {
        return;
    }

    const selectedFileIdentifier = get(selectedFileId);
    if (selectedFileIdentifier) {
        saveTrayHeight(selectedFileIdentifier, get(trayHeight));
    }

    stopResize();
}

export function stopResize() {
    isResizing.set(false);
    window.removeEventListener('mousemove', onResizeMouseMove);
    window.removeEventListener('mouseup', onResizeMouseUp);
    document.body.classList.remove('cursor-ns-resize', 'select-none');
}

export function onWindowResize() {
    const currentTrayHeight = get(trayHeight);
    const clampedHeight = clampHeight(currentTrayHeight);
    if (clampedHeight !== currentTrayHeight) {
        trayHeight.set(clampedHeight);

        const selectedFileIdentifier = get(selectedFileId);
        if (selectedFileIdentifier) {
            saveTrayHeight(selectedFileIdentifier, clampedHeight);
        }
    }

    const currentResultsWidth = get(executionResultsWidth);
    const clampedResultsWidth = clampExecutionResultsWidth(currentResultsWidth);
    if (clampedResultsWidth !== currentResultsWidth) {
        executionResultsWidth.set(clampedResultsWidth);
    }
}

export function getResultsPanelMaxWidth() {
    const contentPanelsElement = document.getElementById('list-tray-content-panels');
    const totalWidth = contentPanelsElement?.clientWidth ?? 0;
    if (totalWidth <= 0) {
        return Number.POSITIVE_INFINITY;
    }

    const maxByRatio = Math.floor(totalWidth * RESULTS_PANEL_MAX_CONTAINER_RATIO);
    const maxByLeftPanel = Math.floor(totalWidth - RESULTS_PANEL_MIN_LEFT_WIDTH);
    return Math.max(RESULTS_PANEL_MIN_WIDTH, Math.min(maxByRatio, maxByLeftPanel));
}

export function clampExecutionResultsWidth(width: number) {
    return Math.min(getResultsPanelMaxWidth(), Math.max(RESULTS_PANEL_MIN_WIDTH, width));
}

export function onExecutionResizeHandleMouseDown(event: MouseEvent) {
    if (!get(showExecutionResults)) {
        return;
    }

    isExecutionResultsResizing.set(true);
    startClientX.set(event.clientX);
    startExecutionResultsWidth.set(get(executionResultsWidth));

    window.addEventListener('mousemove', onExecutionResizeMouseMove);
    window.addEventListener('mouseup', onExecutionResizeMouseUp);
    document.body.classList.add('cursor-ew-resize', 'select-none');
    event.preventDefault();
}

export function onExecutionResizeMouseMove(event: MouseEvent) {
    if (!get(isExecutionResultsResizing)) {
        return;
    }

    const deltaX = event.clientX - get(startClientX);
    executionResultsWidth.set(clampExecutionResultsWidth(get(startExecutionResultsWidth) - deltaX));
}

export function onExecutionResizeMouseUp() {
    stopExecutionResultsResize();
}

export function stopExecutionResultsResize() {
    isExecutionResultsResizing.set(false);
    window.removeEventListener('mousemove', onExecutionResizeMouseMove);
    window.removeEventListener('mouseup', onExecutionResizeMouseUp);
    document.body.classList.remove('cursor-ew-resize', 'select-none');
}