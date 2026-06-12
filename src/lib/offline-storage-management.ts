const APP_SHELL_CACHE_NAME = "ipad-slideshow-pwa-app-shell-v1";
const CACHE_SAMPLE_URL_LIMIT = 8;

type StorageEstimateWithDetails = StorageEstimate & {
  usageDetails?: Record<string, number>;
};

export type BrowserStorageEstimateSummary = {
  supported: boolean;
  usageBytes: number | null;
  quotaBytes: number | null;
  usageRatio: number | null;
  persisted: boolean | null;
  usageDetails: Record<string, number>;
};

export type CacheStorageSummary = {
  supported: boolean;
  cacheNames: string[];
  appShellCacheName: string;
  appShellCacheExists: boolean;
  appShellRequestCount: number;
  totalRequestCount: number;
  appShellSampleUrls: string[];
};

export type OfflineStorageManagementSnapshot = {
  checkedAt: string;
  storageEstimate: BrowserStorageEstimateSummary;
  cacheStorage: CacheStorageSummary;
};

export type ClearAppShellCacheResult = {
  clearedAt: string;
  cacheName: string;
  deleted: boolean;
};

export async function readOfflineStorageManagementSnapshot(): Promise<OfflineStorageManagementSnapshot> {
  const [storageEstimate, cacheStorage] = await Promise.all([
    readBrowserStorageEstimateSummary(),
    readCacheStorageSummary(),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    storageEstimate,
    cacheStorage,
  };
}

export async function clearAppShellCache(): Promise<ClearAppShellCacheResult> {
  if (!isCacheStorageSupported()) {
    throw new Error("Cache Storage is not available in this environment.");
  }

  const deleted = await caches.delete(APP_SHELL_CACHE_NAME);

  return {
    clearedAt: new Date().toISOString(),
    cacheName: APP_SHELL_CACHE_NAME,
    deleted,
  };
}

async function readBrowserStorageEstimateSummary(): Promise<BrowserStorageEstimateSummary> {
  const storageManager = navigator.storage;

  if (!storageManager?.estimate) {
    return {
      supported: false,
      usageBytes: null,
      quotaBytes: null,
      usageRatio: null,
      persisted: null,
      usageDetails: {},
    };
  }

  const estimate = (await storageManager.estimate()) as StorageEstimateWithDetails;
  const usageBytes =
    typeof estimate.usage === "number" && Number.isFinite(estimate.usage)
      ? estimate.usage
      : null;
  const quotaBytes =
    typeof estimate.quota === "number" && Number.isFinite(estimate.quota)
      ? estimate.quota
      : null;
  const usageRatio =
    usageBytes === null || quotaBytes === null || quotaBytes <= 0
      ? null
      : usageBytes / quotaBytes;
  const persisted =
    typeof storageManager.persisted === "function"
      ? await storageManager.persisted().catch(() => null)
      : null;

  return {
    supported: true,
    usageBytes,
    quotaBytes,
    usageRatio,
    persisted,
    usageDetails: filterNumericUsageDetails(estimate.usageDetails),
  };
}

async function readCacheStorageSummary(): Promise<CacheStorageSummary> {
  if (!isCacheStorageSupported()) {
    return {
      supported: false,
      cacheNames: [],
      appShellCacheName: APP_SHELL_CACHE_NAME,
      appShellCacheExists: false,
      appShellRequestCount: 0,
      totalRequestCount: 0,
      appShellSampleUrls: [],
    };
  }

  const cacheNames = await caches.keys();
  const cacheRequestCounts = await Promise.all(
    cacheNames.map(async (cacheName) => {
      const cache = await caches.open(cacheName);
      const requests = await cache.keys();

      return {
        cacheName,
        requestCount: requests.length,
        sampleUrls:
          cacheName === APP_SHELL_CACHE_NAME
            ? requests
                .slice(0, CACHE_SAMPLE_URL_LIMIT)
                .map((request) => toDisplayPath(request.url))
            : [],
      };
    }),
  );
  const appShellCache = cacheRequestCounts.find(
    (cache) => cache.cacheName === APP_SHELL_CACHE_NAME,
  );

  return {
    supported: true,
    cacheNames,
    appShellCacheName: APP_SHELL_CACHE_NAME,
    appShellCacheExists: Boolean(appShellCache),
    appShellRequestCount: appShellCache?.requestCount ?? 0,
    totalRequestCount: cacheRequestCounts.reduce(
      (total, cache) => total + cache.requestCount,
      0,
    ),
    appShellSampleUrls: appShellCache?.sampleUrls ?? [],
  };
}

function isCacheStorageSupported() {
  return typeof window !== "undefined" && "caches" in window;
}

function filterNumericUsageDetails(
  usageDetails: Record<string, number> | undefined,
) {
  if (!usageDetails) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(usageDetails).filter(
      ([, value]) => typeof value === "number" && Number.isFinite(value),
    ),
  );
}

function toDisplayPath(url: string) {
  try {
    const parsedUrl = new URL(url);
    return `${parsedUrl.pathname}${parsedUrl.search}`;
  } catch {
    return url;
  }
}
