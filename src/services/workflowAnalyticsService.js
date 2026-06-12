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
    baseURL: '/DocuWare/Workflow/Analytics', // Removed '/api' which is likely incorrect
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

            const response = await analyticsApi.get('/DocuWare/Platform/Workflow/Instances/DocumentHistory', {
                baseURL: '/',
                params: {
                    fileCabinetId: cabinetId,
                    documentId: docId
                }
            });

            console.log('[WorkflowAnalytics] History Response:', response.data);

            // The response typically contains "InstanceHistory": [...]
            const instances = response.data.InstanceHistory || response.data || [];

            if (Array.isArray(instances)) {
                console.log(`[WorkflowAnalytics] Found ${instances.length} instances. Fetching details...`);

                // Fetch details for each instance to get actual steps
                const historyPromises = instances.map(async (inst) => {
                    try {
                        // Find the self link or construct it. The JSON had a 'self' link ending in /History
                        const selfLink = (inst.Links || []).find(l => l.Rel === 'self' || l.rel === 'self');
                        let historyUrl = null;

                        if (selfLink && selfLink.href) {
                            historyUrl = selfLink.href;
                        } else {
                            // Fallback construction if link missing
                            // /DocuWare/Platform/Workflow/Workflows/{WorkflowId}/Instances/{Id}/History
                            historyUrl = `/DocuWare/Platform/Workflow/Workflows/${inst.WorkflowId}/Instances/${inst.Id}/History`;
                        }

                        if (historyUrl) {
                            console.log(`[WorkflowAnalytics] Fetching details: ${historyUrl}`);
                            const detailResp = await analyticsApi.get(historyUrl, { baseURL: '/' });
                            // Attach steps to the instance object, DO NOT flatten yet
                            return {
                                ...inst,
                                HistorySteps: detailResp.data.HistorySteps || detailResp.data || []
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

            return [];

        } catch (error) {
            console.error('[WorkflowAnalytics] Platform History fetch failed:', error);
            throw error;
        }
    },

    /**
     * Persist historical data in memory and localStorage for finished workflows
     */
    persistHistoryCache: (docId, instances) => {
        try {
            memoryCache.set(docId, instances);
            localStorage.setItem(`dw_history_cache_${docId}`, JSON.stringify(instances));
            console.log(`[WorkflowAnalytics] Persisted history cache for DocID: ${docId}`);
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
    getWfdDefinition: async (workflowId) => {
        try {
            const response = await analyticsApi.get(`/api/wfd/${workflowId}`, { baseURL: '/' });
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
            await analyticsApi.post(`/api/wfd/${workflowId}`, definition, { baseURL: '/' });
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
            await analyticsApi.delete(`/api/wfd/${workflowId}`, { baseURL: '/' });
            return true;
        } catch (err) {
            console.error(`[WorkflowAnalytics] Failed to delete WFD from server for ${workflowId}:`, err);
            throw err;
        }
    }
};
