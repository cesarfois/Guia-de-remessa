import axios from 'axios';

/**
 * Workflow Analytics Service
 * 
 * Interacts with the DocuWare Workflow Analytics API to retrieve detailed
 * audit trails and history for workflows, including completed instances.
 * 
 * Base URL: /DocuWare/Workflow/Analytics/api
 */

const analyticsApi = axios.create({
    baseURL: (import.meta.env.BASE_URL || '/') + 'DocuWare/Workflow/Analytics',
    timeout: 30000,
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
});

// Request Interceptor (Auth)
analyticsApi.interceptors.request.use(
    (config) => {
        const authData = sessionStorage.getItem('docuware_auth');
        let targetUrl = null;

        if (authData) {
            try {
                const parsed = JSON.parse(authData);
                if (parsed.token) {
                    config.headers.Authorization = `Bearer ${parsed.token}`;
                }
                if (parsed.url) {
                    targetUrl = parsed.url;
                }
            } catch (error) {
                console.error('[WorkflowAnalytics] Error parsing auth data:', error);
            }
        }

        // Apply Target URL for Proxy
        if (targetUrl) {
            config.headers['x-target-url'] = targetUrl;
        }

        return config;
    },
    (error) => Promise.reject(error)
);

// Memory Cache map to store instances locally in application memory
const memoryCache = new Map();

export const workflowAnalyticsService = {
    /**
     * Get Workflow History for a Document by DocID
     * @param {string} docId 
     * @param {string} cabinetId
     * @returns {Promise<Array>}
     */
    getHistoryByDocId: async (docId, cabinetId) => {
        try {
            // 1. Check memory cache first
            if (memoryCache.has(docId)) {
                console.log(`[WorkflowAnalytics] Memory Cache hit for DocID: ${docId}`);
                return memoryCache.get(docId);
            }

            // 2. Check localStorage cache
            const cachedData = localStorage.getItem(`dw_history_cache_${docId}`);
            if (cachedData) {
                try {
                    const parsed = JSON.parse(cachedData);
                    console.log(`[WorkflowAnalytics] LocalStorage Cache hit for DocID: ${docId}`);
                    memoryCache.set(docId, parsed);
                    return parsed;
                } catch (e) {
                    console.warn(`[WorkflowAnalytics] Failed to parse cached history for ${docId}:`, e);
                }
            }

            console.log(`[WorkflowAnalytics] Cache miss. Fetching history for DocID: ${docId}, Cabinet: ${cabinetId}`);

            // Use the specific Platform endpoint for Document History
            // /DocuWare/Platform/Workflow/Instances/DocumentHistory?fileCabinetId=...&documentId=...

            // Note: We use baseURL '/' to bypass the 'Analytics' base and go straight to Platform via Proxy
            // The Proxy handles /DocuWare/... forwarding

            if (!cabinetId) {
                console.warn('[WorkflowAnalytics] CabinetID missing, cannot fetch specific history.');
                return [];
            }

            let response;
            try {
                response = await analyticsApi.get(`${import.meta.env.BASE_URL || '/'}DocuWare/Platform/Workflow/Instances/DocumentHistory`, {
                    baseURL: '/',
                    params: {
                        fileCabinetId: cabinetId,
                        documentId: docId
                    }
                });
            } catch (apiErr) {
                if (apiErr.response && apiErr.response.status === 404) {
                    console.log(`[WorkflowAnalytics] No history found (404) for DocID: ${docId}`);
                    memoryCache.set(docId, []);
                    return [];
                }
                console.warn(`[WorkflowAnalytics] API error fetching history for DocID: ${docId}:`, apiErr.message || apiErr);
                memoryCache.set(docId, []);
                return [];
            }

            console.log('[WorkflowAnalytics] History Response:', response.data);

            // The response typically contains "InstanceHistory": [...]
            const instances = response.data.InstanceHistory || response.data || [];

            if (Array.isArray(instances)) {
                console.log(`[WorkflowAnalytics] Found ${instances.length} instances. Fetching details...`);

                // Fetch details for each instance to get actual steps
                const historyPromises = instances.map(async (inst) => {
                    try {
                        const instCacheKey = `dw_inst_steps_${inst.Id}`;
                        const cachedInst = localStorage.getItem(instCacheKey);
                        if (cachedInst) {
                            try {
                                const parsed = JSON.parse(cachedInst);
                                const isExpired = parsed.expiresAt && Date.now() > parsed.expiresAt;
                                if (!isExpired) {
                                    return {
                                        ...inst,
                                        HistorySteps: parsed.steps
                                    };
                                }
                            } catch (e) {
                                // ignore cache parsing error
                            }
                        }

                        // Find the self link or construct it. The JSON had a 'self' link ending in /History
                        const selfLink = (inst.Links || []).find(l => l.Rel === 'self' || l.rel === 'self');
                        let historyUrl = null;

                        if (selfLink && selfLink.href) {
                            historyUrl = selfLink.href;
                            if (historyUrl.startsWith('/DocuWare')) {
                                historyUrl = (import.meta.env.BASE_URL || '/') + historyUrl.substring(1);
                            }
                        } else {
                            historyUrl = `${import.meta.env.BASE_URL || '/'}DocuWare/Platform/Workflow/Workflows/${inst.WorkflowId}/Instances/${inst.Id}/History`;
                        }

                        if (historyUrl) {
                            console.log(`[WorkflowAnalytics] Fetching details: ${historyUrl}`);
                            const detailResp = await analyticsApi.get(historyUrl, { baseURL: '/' });
                            const steps = detailResp.data.HistorySteps || detailResp.data || [];

                            // Determine if this instance has reached a completed state
                            let isInstFinished = false;
                            if (steps.length > 0) {
                                const lastStep = steps[steps.length - 1];
                                const lastStepName = (lastStep.ActivityName || lastStep.Name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                                const lastStepType = (lastStep.ActivityType || '').toLowerCase();
                                
                                const isEnd = lastStepType.includes('end') || 
                                              lastStepType.includes('fim') ||
                                              lastStepName === 'end' || 
                                              lastStepName.startsWith('end ') || 
                                              lastStepName.endsWith(' end') || 
                                              lastStepName.includes(' end ') ||
                                              lastStepName.startsWith('fim') ||
                                              lastStepName.includes(' fim') ||
                                              lastStepName.includes('concluid') || 
                                              lastStepName.includes('termin') || 
                                              lastStepName.includes('conclusao') ||
                                              lastStepName.includes('cancelad') ||
                                              lastStepName.includes('reprovad');
                                if (isEnd) {
                                    isInstFinished = true;
                                }
                            }

                            // 5-minute TTL for active workflows, null (forever) for finished ones
                            const expiresAt = isInstFinished ? null : Date.now() + 5 * 60 * 1000;
                            try {
                                localStorage.setItem(instCacheKey, JSON.stringify({ steps, expiresAt }));
                            } catch (cacheErr) {
                                if (cacheErr.name === 'QuotaExceededError' || cacheErr.code === 22) {
                                    // Clean up oldest items if local storage is full
                                    for (let idx = 0; idx < localStorage.length; idx++) {
                                        const k = localStorage.key(idx);
                                        if (k && k.startsWith('dw_inst_steps_')) {
                                            localStorage.removeItem(k);
                                        }
                                    }
                                    try {
                                        localStorage.setItem(instCacheKey, JSON.stringify({ steps, expiresAt }));
                                    } catch (retryErr) {
                                        console.warn('[WorkflowAnalytics] Failed to cache steps after eviction:', retryErr);
                                    }
                                }
                            }

                            // Attach steps to the instance object, DO NOT flatten yet
                            return {
                                ...inst,
                                HistorySteps: steps
                            };
                        }
                    } catch (detailErr) {
                        console.warn(`[WorkflowAnalytics] Failed to fetch details for instance ${inst.Id}`, detailErr);
                        return { ...inst, HistorySteps: [] };
                    }
                    return { ...inst, HistorySteps: [] };
                });

                const instancesWithSteps = await Promise.all(historyPromises);
                
                // Cache in memory initially
                memoryCache.set(docId, instancesWithSteps);
                return instancesWithSteps;
            }

            memoryCache.set(docId, []);
            return [];

        } catch (error) {
            console.error('[WorkflowAnalytics] Platform History fetch failed:', error);
            return [];
        }
    },

    /**
     * Persist historical data in memory and localStorage for finished workflows
     */
    persistHistoryCache: (docId, instances) => {
        try {
            memoryCache.set(docId, instances);
            const key = `dw_history_cache_${docId}`;
            const payload = JSON.stringify(instances);
            try {
                localStorage.setItem(key, payload);
                console.log(`[WorkflowAnalytics] Persisted history cache for DocID: ${docId}`);
            } catch (err) {
                if (err.name === 'QuotaExceededError' || err.code === 22) {
                    console.warn('[WorkflowAnalytics] LocalStorage full. Evicting old items...');
                    const keys = [];
                    for (let i = 0; i < localStorage.length; i++) {
                        const k = localStorage.key(i);
                        if (k && k.startsWith('dw_history_cache_')) {
                            keys.push(k);
                        }
                    }
                    keys.forEach(k => localStorage.removeItem(k));
                    localStorage.setItem(key, payload);
                    console.log(`[WorkflowAnalytics] Persisted history cache for DocID: ${docId} after eviction.`);
                } else {
                    throw err;
                }
            }
        } catch (err) {
            console.warn(`[WorkflowAnalytics] Failed to persist history cache for ${docId}:`, err);
        }
    },

    /**
     * Clear all cached history definitions
     */
    clearCache: () => {
        memoryCache.clear();
        console.log('[WorkflowAnalytics] Memory Cache cleared.');
        for (let i = localStorage.length - 1; i >= 0; i--) {
            const key = localStorage.key(i);
            if (key && key.startsWith('dw_history_cache_')) {
                localStorage.removeItem(key);
            }
        }
        console.log('[WorkflowAnalytics] LocalStorage Cache cleared.');
    },

    /**
     * Get Workflow WFD definition from backend server
     */
    getWfdDefinition: async (workflowId, workflowName) => {
        try {
            const params = workflowName ? { name: workflowName } : {};
            const response = await analyticsApi.get(`${import.meta.env.BASE_URL || '/'}api/wfd/${workflowId}`, { baseURL: '/', params });
            return response.data;
        } catch (err) {
            console.warn(`[WorkflowAnalytics] WFD not found on server for ${workflowId}:`, err.message);
            return null;
        }
    },

    /**
     * Save WFD definition to backend server
     */
    saveWfdDefinition: async (workflowId, definition) => {
        try {
            await analyticsApi.post(`${import.meta.env.BASE_URL || '/'}api/wfd/${workflowId}`, definition, { baseURL: '/' });
            return true;
        } catch (err) {
            console.error(`[WorkflowAnalytics] Failed to save WFD to server for ${workflowId}:`, err);
            throw err;
        }
    },

    /**
     * Delete WFD definition from backend server
     */
    deleteWfdDefinition: async (workflowId) => {
        try {
            await analyticsApi.delete(`${import.meta.env.BASE_URL || '/'}api/wfd/${workflowId}`, { baseURL: '/' });
            return true;
        } catch (err) {
            console.error(`[WorkflowAnalytics] Failed to delete WFD from server for ${workflowId}:`, err);
            throw err;
        }
    }
};
