import { browser } from "$app/environment";
import { get, writable } from "svelte/store";

type ConnectivitySource = "bootstrap" | "navigator-offline" | "probe-success" | "probe-failed";

export type ConnectivityStatus = {
    isOnline: boolean;
    isChecking: boolean;
    checkedAt: number;
    source: ConnectivitySource;
};

const PROBE_TIMEOUT_MS = 4500;
const PROBE_INTERVAL_MS = 30000;

const statusStore = writable<ConnectivityStatus>({
    isOnline: true,
    isChecking: false,
    checkedAt: Date.now(),
    source: "bootstrap",
});

let hasInitialized = false;
let scheduledProbeInterval: number | undefined;
let inFlightProbe: Promise<boolean> | undefined;

const patchStatus = (partial: Partial<ConnectivityStatus>) => {
    statusStore.update((currentStatus) => {
        return {
            ...currentStatus,
            ...partial,
            checkedAt: Date.now(),
        };
    });
};

const runNetworkProbe = async (): Promise<boolean> => {
    if (!browser) {
        return true;
    }

    const probeController = new AbortController();
    const timeoutId = window.setTimeout(() => probeController.abort(), PROBE_TIMEOUT_MS);

    try {
        const isLocalhost = ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);

        if (isLocalhost) {
            // Localhost remains reachable without Wi-Fi/LAN due to loopback.
            // Use a public 204 probe to verify real internet reachability in dev.
            await fetch("https://www.gstatic.com/generate_204", {
                method: "GET",
                mode: "no-cors",
                cache: "no-store",
                signal: probeController.signal,
            });

            return true;
        }

        const probeUrl = new URL("/favicon.ico", window.location.origin);
        probeUrl.searchParams.set("networkProbe", Date.now().toString());

        const probeResponse = await fetch(probeUrl.toString(), {
            method: "HEAD",
            cache: "no-store",
            signal: probeController.signal,
            credentials: "same-origin",
        });

        return probeResponse.ok;
    } catch {
        return false;
    } finally {
        window.clearTimeout(timeoutId);
    }
};

export const refreshConnectivityStatus = async (options: { forceProbe?: boolean } = {}): Promise<boolean> => {
    if (!browser) {
        patchStatus({
            isOnline: true,
            isChecking: false,
            source: "bootstrap",
        });

        return true;
    }

    if (!navigator.onLine) {
        patchStatus({
            isOnline: false,
            isChecking: false,
            source: "navigator-offline",
        });

        return false;
    }

    if (inFlightProbe && !options.forceProbe) {
        return inFlightProbe;
    }

    inFlightProbe = (async () => {
        patchStatus({ isChecking: true });

        const isReachable = await runNetworkProbe();

        patchStatus({
            isOnline: isReachable,
            isChecking: false,
            source: isReachable ? "probe-success" : "probe-failed",
        });

        return isReachable;
    })();

    try {
        return await inFlightProbe;
    } finally {
        inFlightProbe = undefined;
    }
};

export const isConnectivityOnlineSnapshot = (): boolean => {
    if (!browser) {
        return true;
    }

    if (!navigator.onLine) {
        return false;
    }

    return get(statusStore).isOnline;
};

export const connectivityStatus = {
    subscribe: statusStore.subscribe,
};

export const initializeConnectivityWatcher = () => {
    if (!browser || hasInitialized) {
        return;
    }

    hasInitialized = true;

    window.addEventListener("online", () => {
        void refreshConnectivityStatus({ forceProbe: true });
    });

    window.addEventListener("offline", () => {
        patchStatus({
            isOnline: false,
            isChecking: false,
            source: "navigator-offline",
        });
    });

    window.addEventListener("focus", () => {
        void refreshConnectivityStatus({ forceProbe: true });
    });

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            void refreshConnectivityStatus({ forceProbe: true });
        }
    });

    scheduledProbeInterval = window.setInterval(() => {
        void refreshConnectivityStatus({ forceProbe: true });
    }, PROBE_INTERVAL_MS);

    void refreshConnectivityStatus({ forceProbe: true });
};

export const stopConnectivityWatcher = () => {
    if (!scheduledProbeInterval) {
        return;
    }

    window.clearInterval(scheduledProbeInterval);
    scheduledProbeInterval = undefined;
};

if (browser) {
    initializeConnectivityWatcher();
}
