import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
    FaSearch, 
    FaHistory, 
    FaCheckCircle, 
    FaTimesCircle, 
    FaClock, 
    FaUser, 
    FaBan, 
    FaExternalLinkAlt, 
    FaFileAlt,
    FaRegCopy, 
    FaList, 
    FaFileCsv, 
    FaProjectDiagram, 
    FaUpload, 
    FaTrash, 
    FaInfoCircle,
    FaFilter,
    FaCalendarAlt,
    FaExpand,
    FaSyncAlt
} from 'react-icons/fa';
import { workflowAnalyticsService } from '../services/workflowAnalyticsService';
import { docuwareService } from '../services/docuwareService';

// Workflow visual parsing/mapping imports
import { WorkflowDefinitionParser } from '../services/workflow/WorkflowDefinitionParser';
import { WorkflowGraphBuilder } from '../services/workflow/WorkflowGraphBuilder';
import { WorkflowHistoryAnalyzer } from '../services/workflow/WorkflowHistoryAnalyzer';
import { WorkflowTimelineEngine } from '../services/workflow/WorkflowTimelineEngine';
import { TimelineViewer } from '../components/Workflow/TimelineViewer';
import ColumnFilter from '../components/Documents/ColumnFilter';
import { AnaliseModule } from './WorkflowHistoryPage_analiseRenderers';
import { useViewMode } from '../context/ViewModeContext';

const isTaskType = (typeStr) => {
    if (!typeStr) return false;
    const t = typeStr.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, '');
    if (t.includes('start') || t.includes('inicio')) return false;
    if (t.includes('end') || t.includes('fim') || t.includes('concluid') || t.includes('termin')) return false;
    if (t.includes('condition') || t.includes('condicao') || t.includes('decision') || t.includes('condicionar')) return false;
    if (t.includes('assignment') || t.includes('atribuirdados') || t.includes('atribuir')) return false;
    if (t.includes('webservice') || t.includes('web')) return false;
    if (t.includes('email') || t.includes('mail') || t.includes('notification') || t.includes('notificacao')) return false;
    return true;
};

const isWorkflowStartNode = (node) => {
    if (!node) return false;
    const type = (node.type || '').toLowerCase();
    const name = (node.name || '').toLowerCase();
    return type.includes('start') || name.includes('start') || name.includes('inicio') || name.includes('início');
};

const isWorkflowEndNode = (node) => {
    if (!node) return false;
    const type = (node.type || '').toLowerCase();
    const name = (node.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    if (type.includes('end') || type.includes('fim')) return true;
    
    return name === 'end' || 
           name.startsWith('end ') || 
           name.endsWith(' end') || 
           name.includes(' end ') ||
           name.startsWith('fim') ||
           name.includes(' fim') ||
           name.includes('concluid') || 
           name.includes('termin') || 
           name.includes('conclusao') ||
           name.includes('cancelad') ||
           name.includes('reprovad');
};

const isWorkflowAssignmentNode = (node) => {
    if (!node) return false;
    const name = (node.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const type = (node.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    
    // Check type patterns for assignments (supporting types with/without spaces)
    const isAssignmentByType = 
        type.includes('atribuir') || 
        type.includes('atribuicao') || 
        type.includes('assignment') ||
        type.includes('dataassignment') ||
        type.includes('userassignment') ||
        type.includes('user assignment') ||
        type.includes('data assignment') ||
        type.includes('atrib') ||
        type.includes('assign');

    // Check name patterns for assignments
    const isAssignmentByName = 
        name.includes('atribuir') || 
        name.includes('atribuicao') || 
        name.includes('assignment') ||
        name.includes('requerente') ||
        name.includes('armazem') ||
        name.includes('superior hierarquico') ||
        name.includes('director compras') ||
        name.includes('procurement');

    return isAssignmentByName || isAssignmentByType;
};

const isWorkflowTechnicalNode = (node) => {
    if (!node) return false;
    const name = (node.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const type = (node.type || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return type.includes('condition') || type.includes('condicao') || type.includes('decision') || type.includes('condicionar') ||
           type.includes('webservice') || type.includes('web') ||
           type.includes('email') || type.includes('mail') || type.includes('notification') || type.includes('notificacao') ||
           name.includes('webservice') || name.includes('web service') || name.includes('condicao') || name.includes('decisao') ||
           name.includes('email') || name.includes('mail') || name.includes('aviso') || name.includes('notificacao') || 
           name.includes('notificar') || name.includes('mensagem') || name.includes('alerta') ||
           name.includes('data time') || name.includes('date time') || name.includes('datetime') ||
           name.includes('data hora') || name.includes('data/hora') || name.includes('datahora');
};

// Helper to find shortest path task count from start node to end node using BFS
const getRemainingTaskCount = (nodes, edges, startNodeId) => {
    if (!startNodeId) return 0;
    const startNode = nodes.find(n => n.id === startNodeId);
    if (!startNode) return 0;

    const isStartNodeTask = isTaskType(startNode.type);
    const queue = [[startNodeId, isStartNodeTask ? 1 : 0]];
    const visited = new Set([startNodeId]);
    
    const isEndNode = (n) => {
        if (!n) return false;
        const type = (n.type || '').toLowerCase();
        const name = (n.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
        const hasOutgoing = edges.some(e => e.source === n.id);
        
        if (!hasOutgoing) return true;
        if (type.includes('end') || type.includes('fim')) return true;
        
        return name === 'end' || 
               name.startsWith('end ') || 
               name.endsWith(' end') || 
               name.includes(' end ') ||
               name.startsWith('fim') ||
               name.includes(' fim') ||
               name.includes('concluid') || 
               name.includes('termin') || 
               name.includes('conclusao') ||
               name.includes('cancelad') ||
               name.includes('reprovad');
    };
    
    let minTasks = null;
    
    while (queue.length > 0) {
        const [currentId, taskCount] = queue.shift();
        const currentNode = nodes.find(n => n.id === currentId);
        
        if (isEndNode(currentNode)) {
            if (minTasks === null || taskCount < minTasks) {
                minTasks = taskCount;
            }
            continue;
        }
        
        const outgoingEdges = edges.filter(e => e.source === currentId);
        for (const edge of outgoingEdges) {
            if (!visited.has(edge.target)) {
                visited.add(edge.target);
                
                const targetNode = nodes.find(n => n.id === edge.target);
                const isTask = targetNode && isTaskType(targetNode.type);
                
                queue.push([edge.target, taskCount + (isTask ? 1 : 0)]);
            }
        }
    }
    return minTasks !== null ? minTasks : (isStartNodeTask ? 1 : 0);
};

// Helper to find all task nodes in topological sequence via BFS for the summary pipeline
const getFlowPipelineSteps = (nodes, edges) => {
    if (!nodes || nodes.length === 0) return [];

    const isIgnoredStep = (node) => {
        if (!node) return false;
        const name = (node.name || '').toLowerCase();
        return name.includes('data time') || name.includes('datetime') || name.includes('data e hora') || name.includes('date time');
    };

    // Find start and end nodes
    const startNodes = nodes.filter(n => isWorkflowStartNode(n) && !isIgnoredStep(n));
    const endNodes = nodes.filter(n => isWorkflowEndNode(n) && !isIgnoredStep(n));

    // Filter intermediate nodes (exclude start, end, assignments, technical steps, and ignored date/time steps)
    const intermediateNodes = nodes.filter(node => 
        !isWorkflowStartNode(node) && 
        !isWorkflowEndNode(node) &&
        !isWorkflowAssignmentNode(node) && 
        !isWorkflowTechnicalNode(node) &&
        !isIgnoredStep(node)
    );

    // Sort intermediate nodes by x coordinate (left-to-right flow), then y coordinate (top-to-bottom flow)
    intermediateNodes.sort((a, b) => {
        if (a.x !== b.x) {
            return a.x - b.x;
        }
        return a.y - b.y;
    });

    const orderedTasks = [];
    
    // 1. Add start node(s)
    startNodes.forEach(node => {
        if (!orderedTasks.some(t => t.name === node.name)) {
            orderedTasks.push(node);
        }
    });

    // 2. Add sorted intermediate node(s)
    intermediateNodes.forEach(node => {
        if (!orderedTasks.some(t => t.name === node.name)) {
            orderedTasks.push(node);
        }
    });

    // 3. Add end node(s)
    endNodes.forEach(node => {
        if (!orderedTasks.some(t => t.name === node.name)) {
            orderedTasks.push(node);
        }
    });

    return orderedTasks;
};


// Helpers to extract index columns from dynamic document fields
const getDocFieldValue = (doc, fieldName) => {
    if (!doc || !doc.Fields) return '';
    const field = doc.Fields.find(f => f.FieldName === fieldName);
    if (!field) return '';
    return field.Item || field.Value || '';
};

const getDocumentNumber = (doc) => {
    if (!doc) return '';
    const fieldsToTry = [
        'ID_PAGAMENTO',
        'NO_DOCUMENTO',
        'NO_PEDIDO___REFERENCIA',
        'NO_TICKET',
        'NUMERO_DOCUMENTO',
        'NUMERO',
        'N_DOCUMENTO',
        'REFERENCIA',
        'NO_VGR',
        'NO_ES',
        'NO_ECL',
        'NO_ENCOMENDA',
        'NO_ECF',
        'NO_OCE'
    ];
    for (const f of fieldsToTry) {
        const val = getDocFieldValue(doc, f);
        if (val) return val;
    }
    return '';
};

const getDocumentValor = (doc) => {
    if (!doc) return '';
    return getDocFieldValue(doc, 'CHAMP_10') || getDocFieldValue(doc, 'VALOR_TOTAL') || getDocFieldValue(doc, 'MATRICULA') || '';
};

const getDocumentComments = (doc) => {
    if (!doc) return '';
    const fieldsToTry = [
        'COMENTARIOS',
        'COMENTARIO',
        'OBSERVACOES',
        'OBSERVACAO',
        'COMMENTS',
        'COMMENT',
        'COMENTARIOS_DOCUMENTO',
        'COMENTARIOS_PEDIDO'
    ];
    for (const f of fieldsToTry) {
        const val = getDocFieldValue(doc, f);
        if (val) return val;
    }
    return '';
};

const getDocumentCommentsII = (doc) => {
    if (!doc) return '';
    const fieldsToTry = [
        'COMENTARIOS_II',
        'COMENTARIOSII',
        'COMENTARIO_II',
        'COMENTARIOII',
        'COMENTARIOS_2',
        'COMENTARIOS2',
        'OBSERVACOES_II',
        'OBSERVACOES_2'
    ];
    for (const f of fieldsToTry) {
        const val = getDocFieldValue(doc, f);
        if (val) return val;
    }
    return '';
};


const WorkflowHistoryPage = () => {
    // Basic States
    const latestSearchIdRef = useRef(0);
    const [cabinets, setCabinets] = useState([]);
    const [selectedCabinet, setSelectedCabinet] = useState('56c20dfc-a25b-4ed7-890a-15de4b3853d7');
    const [cabinetFields, setCabinetFields] = useState([]);
    const [cabinetCount, setCabinetCount] = useState(0);
    const [orgId, setOrgId] = useState('');
    
    // Cabinet/Document Type Selection States
    const [typeSuggestions, setTypeSuggestions] = useState([]);
    const [selectedDocType, setSelectedDocType] = useState('Guia de Remessa');

    // View mode navigation states from global context
    const { viewMode, setViewMode, analiseTab, setAnaliseTab } = useViewMode();

    // Gap classifications state persisted in localStorage
    const [gapClassifications, setGapClassifications] = useState(() => {
        try {
            const stored = localStorage.getItem('gr_gap_classifications');
            return stored ? JSON.parse(stored) : {};
        } catch (err) {
            return {};
        }
    });

    const handleSetGapClassification = (key, value) => {
        setGapClassifications(prev => {
            const updated = { ...prev, [key]: value };
            localStorage.setItem('gr_gap_classifications', JSON.stringify(updated));
            return updated;
        });
    };

    const [analiseFilters, setAnaliseFilters] = useState({
        serie: 'all',
        assinada: 'all',
        faturada: 'all',
        cliente: 'all',
        docNum: '',
        faturaNum: '',
        entrega: 'all',
        workflowType: 'all',
        period: 'all'
    });

    const [analiseSortField, setAnaliseSortField] = useState('docNum');
    const [analiseSortDirection, setAnaliseSortDirection] = useState('asc');
    const [analisePage, setAnalisePage] = useState(1);
    const analisePageSize = 25;
    
    // Date filter range state (default to 30 days ago to today)
    const getTodayString = () => new Date().toISOString().split('T')[0];
    const getThirtyDaysAgoString = () => {
        const d = new Date();
        d.setDate(d.getDate() - 30);
        return d.toISOString().split('T')[0];
    };
    const [dateRange, setDateRange] = useState([getThirtyDaysAgoString(), getTodayString()]);

    const [detectedTypeField, setDetectedTypeField] = useState(null);
    const [detectedDateField, setDetectedDateField] = useState(null);
    const [suggestions, setSuggestions] = useState({}); // { [rowIdx]: [values] }
    const [documentProgress, setDocumentProgress] = useState({}); // { [docId]: { percent, remaining, statusText, activeTaskName, isFinished } }
    const [quickFilter, setQuickFilter] = useState('all'); // 'all' | 'completed' | 'active'
    
    // Workflow Cockpit Sort & Filter States
    const [sortField, setSortField] = useState('timeStoppedMs'); // default: most delayed first
    const [sortDirection, setSortDirection] = useState('desc');
    const [filterStep, setFilterStep] = useState('all');
    const [filterResponsible, setFilterResponsible] = useState('all');
    const [columnFilters, setColumnFilters] = useState({});

    const toggleFilterValue = (columnName, value) => {
        setColumnFilters(prev => {
            const current = prev[columnName] || [];
            const newValues = current.includes(value)
                ? current.filter(v => v !== value)
                : [...current, value];

            if (newValues.length === 0) {
                const { [columnName]: _, ...rest } = prev;
                return rest;
            }

            return { ...prev, [columnName]: newValues };
        });
    };

    const clearColumnFilter = (columnName) => {
        setColumnFilters(prev => {
            const { [columnName]: _, ...rest } = prev;
            return rest;
        });
    };

    const getUniqueColumnValues = (columnName) => {
        const values = new Set();
        documents.forEach(doc => {
            let val = '';
            if (columnName === 'docNum') {
                val = getDocumentNumber(doc) || 'Sem Nº';
            } else if (columnName === 'requerente') {
                val = getDocFieldValue(doc, 'REQUERENTE');
            } else if (columnName === 'activeTaskName') {
                val = documentProgress[doc.Id]?.activeTaskName;
            } else if (columnName === 'responsible') {
                val = documentProgress[doc.Id]?.responsible;
            } else if (columnName === 'prioridade') {
                val = getDocFieldValue(doc, 'PRIORIDADE');
            } else if (columnName === 'formaPagamento') {
                val = getDocFieldValue(doc, 'FORMA_DE_PAGAMENTO');
            }
            
            if (val !== undefined && val !== null && val !== '') {
                values.add(String(val).trim());
            }
        });
        return Array.from(values).sort();
    };
    
    // Document Grid / List States
    const [documents, setDocuments] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [selectedDoc, setSelectedDoc] = useState(null);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);
    const [documentFields, setDocumentFields] = useState([]);
    const [fieldsLoading, setFieldsLoading] = useState(false);
    
    // Workflow History States for Selected Document
    const [historyInstances, setHistoryInstances] = useState(null);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(0); // Instances tab
    const [activeSubTab, setActiveSubTab] = useState('timeline'); // Timeline vs Fields vs Diagram tab
    const [wfdUpdateCounter, setWfdUpdateCounter] = useState(0);
    const [wfdDefinitions, setWfdDefinitions] = useState({});
    
    // Options
    const [showAutoActivities, setShowAutoActivities] = useState(false);
    const [showFieldsModal, setShowFieldsModal] = useState(false);
    const [showDiagramModal, setShowDiagramModal] = useState(false);
    const [isDiagramMaximized, setIsDiagramMaximized] = useState(false);
    const [error, setError] = useState(null);
    const [searched, setSearched] = useState(false);

    // Load Cabinets & Org ID on mount, supporting deep-linking from DocuWare tasks
    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                // Parse deep-linking query parameters from DocuWare task link
                const queryParams = new URLSearchParams(window.location.search);
                const urlFc = queryParams.get('fc') || queryParams.get('fileCabinetId') || queryParams.get('cabinetId');
                const urlDid = queryParams.get('did') || queryParams.get('docId') || queryParams.get('documentId');

                const cabList = await docuwareService.getCabinets();
                const sortedCabinets = [...cabList].sort((a, b) =>
                    (a.Name || '').localeCompare(b.Name || '', 'pt-BR', { sensitivity: 'base' })
                );
                setCabinets(sortedCabinets);

                const oid = await docuwareService.getOrganization();
                if (oid) setOrgId(oid);

                // Force cabinet to "34 Armazém - Procurement" UUID
                const targetCab = cabList.find(c => 
                    (c.Name || '').includes('34') || 
                    (c.Name || '').toLowerCase().includes('procurement') ||
                    (c.Name || '').toLowerCase().includes('procure') ||
                    (c.Name || '').toLowerCase().includes('armazem') ||
                    (c.Name || '').toLowerCase().includes('armazém')
                );
                const targetCabinetId = targetCab ? targetCab.Id : '56c20dfc-a25b-4ed7-890a-15de4b3853d7';
                setSelectedCabinet(targetCabinetId);

                if ((urlFc === '34' || urlFc === targetCabinetId) && urlDid) {
                    setSearchLoading(true);
                    setSearched(true);
                    setError(null);

                    try {
                        console.log(`[DeepLink] Auto-loading document ID: ${urlDid} from cabinet ${targetCabinetId}`);
                        const doc = await docuwareService.getDocument(targetCabinetId, urlDid);
                        if (doc) {
                            setDocuments([doc]);
                            setSelectedDoc(doc);
                            setIsDrawerOpen(false); // Keep side drawer closed
                            setActiveSubTab('diagram'); // Target diagram tab
                            setShowDiagramModal(true); // Open full-screen diagram modal immediately!
                        } else {
                            throw new Error("Documento não retornado pelo serviço.");
                        }
                    } catch (docErr) {
                        console.error("[DeepLink] Failed to auto-load document:", docErr);
                        setError(`Falha ao carregar automaticamente o documento: ${docErr.message || docErr}`);
                    } finally {
                        setSearchLoading(false);
                    }
                }
            } catch (err) {
                console.error("Failed to load initial data", err);
                setError("Falha ao carregar dados iniciais. Verifique sua conexão.");
            }
        };
        fetchInitialData();
    }, []);

    // Load cabinet metadata, counts, and configure default filters
    useEffect(() => {
        if (!selectedCabinet) return;
        localStorage.setItem('selectedHistoryCabinetId', selectedCabinet);

        const loadCabinetMetadata = async () => {
            try {
                // Fetch cabinet document count
                const count = await docuwareService.getCabinetCount(selectedCabinet);
                setCabinetCount(count);

                // Fetch cabinet fields
                const fields = await docuwareService.getCabinetFields(selectedCabinet);
                setCabinetFields(fields);

                const textFields = fields.filter(f => f.DWFieldType === 'Text' || f.DWFieldType === 'String' || f.SystemField);
                const dateFields = fields.filter(f => f.DWFieldType === 'Date' || f.DWFieldType === 'DateTime');

                // 1. Detect Document Type field
                const typeKeywords = ['tipo', 'type', 'documento', 'doc_type', 'docclass'];
                const detectedTypeField = textFields.find(f => {
                    const name = (f.DBFieldName || f.FieldName || '').toLowerCase();
                    const disp = (f.DisplayName || '').toLowerCase();
                    return typeKeywords.some(kw => name.includes(kw) || disp.includes(kw));
                }) || textFields[0];
                
                // 2. Detect Storage Date field (prioritize system fields DWSTOREDATETIME and DWSTOREDATE)
                const systemStoreField = fields.find(f => {
                    const name = (f.DBFieldName || f.FieldName || '').toUpperCase();
                    return name === 'DWSTOREDATETIME' || name === 'DWSTOREDATE';
                });
                const detectedDateField = systemStoreField || fields.find(f => {
                    const name = (f.DBFieldName || f.FieldName || '').toLowerCase();
                    const disp = (f.DisplayName || '').toLowerCase();
                    const dateKeywords = ['dwstoredate', 'dwstoredatetime', 'storedate', 'armazenado', 'data', 'date'];
                    return dateKeywords.some(kw => name.includes(kw) || disp.includes(kw));
                }) || dateFields[0];

                setDetectedTypeField(detectedTypeField);
                setDetectedDateField(detectedDateField);
                setSuggestions({}); // Reset suggestions

                // Keep selectedDocType fixed to "Guia de Remessa"
                setSelectedDocType('Guia de Remessa');
                setTypeSuggestions(['Guia de Remessa']);
            } catch (err) {
                console.error("Failed to load cabinet metadata", err);
            }
        };

        loadCabinetMetadata();
    }, [selectedCabinet]);

    // Retrieve autocomplete values for text fields
    const fetchSuggestionsForIndex = async (index, fieldName) => {
        if (!selectedCabinet || !fieldName) return;
        try {
            const values = await docuwareService.getSelectList(selectedCabinet, fieldName);
            const sortedValues = values.sort((a, b) =>
                String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' })
            );
            setSuggestions(prev => ({ ...prev, [index]: sortedValues }));
        } catch (err) {
            console.error('Error fetching select list:', err);
        }
    };

    // Calculate Cockpit KPIs dynamically based on documents and documentProgress
    const kpis = useMemo(() => {
        let completed = 0;
        let active = 0;
        let delayed = 0;
        let rejected = 0;
        let totalPercent = 0;
        let percentCount = 0;
        let completedDurationsSum = 0;
        let completedDurationsCount = 0;
        
        // Group timeStoppedMs by active task name for bottleneck calculation
        const stepTimeSum = {};
        const stepTimeCount = {};

        documents.forEach(doc => {
            const prog = documentProgress[doc.Id];
            if (prog) {
                if (prog.isFinished) {
                    if (prog.isRejected) {
                        rejected++;
                    } else {
                        completed++;
                    }
                    if (prog.completedAt && prog.entryDate) {
                        const duration = new Date(prog.completedAt).getTime() - new Date(prog.entryDate).getTime();
                        if (duration > 0) {
                            completedDurationsSum += duration;
                            completedDurationsCount++;
                        }
                    }
                } else {
                    active++;
                    
                    const isDelayed = prog.timeStoppedMs > 24 * 60 * 60 * 1000;
                    if (isDelayed) {
                        delayed++;
                    }

                    if (prog.activeTaskName) {
                        stepTimeSum[prog.activeTaskName] = (stepTimeSum[prog.activeTaskName] || 0) + (prog.timeStoppedMs || 0);
                        stepTimeCount[prog.activeTaskName] = (stepTimeCount[prog.activeTaskName] || 0) + 1;
                    }
                }

                if (prog.percent !== undefined && !isNaN(prog.percent)) {
                    totalPercent += prog.percent;
                    percentCount++;
                }
            }
        });

        // Calculate average percent
        const avgPercent = percentCount > 0 ? Math.round(totalPercent / percentCount) : 0;

        // Calculate average completion time (only truly completed, not rejected)
        const avgCompletionTimeMs = completedDurationsCount > 0 ? (completedDurationsSum / completedDurationsCount) : 0;
        const avgCompletionTimeText = avgCompletionTimeMs > 0 
            ? WorkflowHistoryAnalyzer.formatDuration(avgCompletionTimeMs) 
            : '-';

        // Calculate biggest bottleneck (highest cumulative time stopped)
        let biggestBottleneck = '-';
        let maxTime = -1;
        Object.keys(stepTimeSum).forEach(stepName => {
            if (stepTimeSum[stepName] > maxTime) {
                maxTime = stepTimeSum[stepName];
                const avgStepTime = stepTimeSum[stepName] / stepTimeCount[stepName];
                biggestBottleneck = `${stepName} (${WorkflowHistoryAnalyzer.formatDuration(avgStepTime)})`;
            }
        });

        return { 
            completed, 
            active, 
            delayed,
            rejected,
            avgPercent, 
            avgCompletionTimeText, 
            biggestBottleneck 
        };
    }, [documents, documentProgress]);

    // Unique active steps for filter dropdown
    const uniqueSteps = useMemo(() => {
        const steps = new Set();
        Object.values(documentProgress).forEach(prog => {
            if (prog && prog.activeTaskName) {
                steps.add(prog.activeTaskName);
            }
        });
        return Array.from(steps).sort();
    }, [documentProgress]);

    // Unique active users/responsibles for filter dropdown
    const uniqueResponsibles = useMemo(() => {
        const users = new Set();
        Object.values(documentProgress).forEach(prog => {
            if (prog && prog.responsible && prog.responsible !== '-') {
                prog.responsible.split(',').forEach(u => users.add(u.trim()));
            }
        });
        return Array.from(users).sort();
    }, [documentProgress]);

    // Filter and sort documents for the operational table
    const filteredAndSortedDocuments = useMemo(() => {
        let result = [...documents];

        // 1. Apply Filters
        result = result.filter(doc => {
            const prog = documentProgress[doc.Id];
            if (!prog) return true; // keep while loading initially

            // Status Filter
            if (quickFilter === 'completed' && (!prog.isFinished || prog.isRejected)) return false;
            if (quickFilter === 'active' && prog.isFinished) return false;
            if (quickFilter === 'delayed') {
                const isDelayed = !prog.isFinished && (prog.timeStoppedMs > 24 * 60 * 60 * 1000);
                if (!isDelayed) return false;
            }
            if (quickFilter === 'rejected' && !prog.isRejected) return false;

            // Step Filter
            if (filterStep !== 'all' && prog.activeTaskName !== filterStep) return false;

            // Responsible Filter
            if (filterResponsible !== 'all' && prog.responsible !== filterResponsible && !(prog.responsible && prog.responsible.includes(filterResponsible))) return false;

            // Column filters
            for (const [colName, selectedValues] of Object.entries(columnFilters)) {
                if (selectedValues && selectedValues.length > 0) {
                    let val = '';
                    if (colName === 'docNum') {
                        val = getDocumentNumber(doc) || 'Sem Nº';
                    } else if (colName === 'requerente') {
                        val = getDocFieldValue(doc, 'REQUERENTE');
                    } else if (colName === 'activeTaskName') {
                        val = prog.activeTaskName;
                    } else if (colName === 'responsible') {
                        val = prog.responsible;
                    } else if (colName === 'prioridade') {
                        val = getDocFieldValue(doc, 'PRIORIDADE');
                    } else if (colName === 'formaPagamento') {
                        val = getDocFieldValue(doc, 'FORMA_DE_PAGAMENTO');
                    }

                    if (!selectedValues.includes(String(val || '').trim())) {
                        return false;
                    }
                }
            }

            return true;
        });

        // 2. Apply Sorting
        result.sort((a, b) => {
            const progA = documentProgress[a.Id];
            const progB = documentProgress[b.Id];

            if (!progA && !progB) return 0;
            if (!progA) return 1;
            if (!progB) return -1;

            let valA, valB;

            if (sortField === 'timeStoppedMs') {
                valA = progA.timeStoppedMs || 0;
                valB = progB.timeStoppedMs || 0;
            } else if (sortField === 'percent') {
                valA = progA.percent || 0;
                valB = progB.percent || 0;
            } else if (sortField === 'entryDate') {
                valA = progA.entryDate ? new Date(progA.entryDate).getTime() : 0;
                valB = progB.entryDate ? new Date(progB.entryDate).getTime() : 0;
            } else if (sortField === 'responsible') {
                valA = progA.responsible || '';
                valB = progB.responsible || '';
            } else if (sortField === 'activeTaskName') {
                valA = progA.activeTaskName || '';
                valB = progB.activeTaskName || '';
            } else if (sortField === 'docNum') {
                const getDocNum = (d) => getDocumentNumber(d);
                valA = getDocNum(a);
                valB = getDocNum(b);
            } else if (sortField === 'requerente') {
                const getReq = (d) => getDocFieldValue(d, 'REQUERENTE') || '';
                valA = getReq(a);
                valB = getReq(b);
            } else if (sortField === 'matricula') {
                const getMat = (d) => getDocumentValor(d);
                valA = getMat(a);
                valB = getMat(b);
            } else if (sortField === 'prioridade') {
                const getPrio = (d) => getDocFieldValue(d, 'PRIORIDADE') || '';
                valA = getPrio(a);
                valB = getPrio(b);
            } else if (sortField === 'formaPagamento') {
                const getForma = (d) => getDocFieldValue(d, 'FORMA_DE_PAGAMENTO') || '';
                valA = getForma(a);
                valB = getForma(b);
            } else if (sortField === 'valor') {
                const getVal = (d) => {
                    const v = getDocFieldValue(d, 'CHAMP_10');
                    return v ? parseFloat(String(v).replace(/[^0-9.-]/g, '')) || v : 0;
                };
                valA = getVal(a);
                valB = getVal(b);
            } else {
                return 0;
            }

            if (typeof valA === 'string' && typeof valB === 'string') {
                return sortDirection === 'asc' 
                     ? valA.localeCompare(valB, 'pt-BR') 
                     : valB.localeCompare(valA, 'pt-BR');
            } else {
                return sortDirection === 'asc' 
                     ? (valA > valB ? 1 : valA < valB ? -1 : 0) 
                     : (valB > valA ? 1 : valB < valA ? -1 : 0);
            }
        });

        return result;
    }, [documents, documentProgress, quickFilter, filterStep, filterResponsible, columnFilters, sortField, sortDirection]);

    const parseGRNumInfo = (docNum) => {
        if (!docNum) return null;
        // Matches e.g. GR.2026G/344 or GR.2026V/985
        const match = docNum.match(/GR\.(\d{4})([a-zA-Z])\/(\d+)/i);
        if (match) {
            return {
                ano: parseInt(match[1]),
                serie: match[2].toUpperCase(),
                numero: parseInt(match[3]),
                completo: docNum
            };
        }
        return null;
    };

    const analyticalRows = useMemo(() => {
        return documents.map(doc => {
            const prog = documentProgress[doc.Id] || {};
            const docNum = getDocumentNumber(doc) || '';
            const parsedNum = parseGRNumInfo(docNum);
            
            // 1. Serie
            const serie = parsedNum ? parsedNum.serie : '';
            
            // 2. Data da GR
            const dataGR = getDocFieldValue(doc, 'DATA') || getDocFieldValue(doc, 'Data') || '';
            
            // 3. Data de Armazenamento
            const dataArmazenamento = getDocFieldValue(doc, 'ARMAZENADO_EM__') || getDocFieldValue(doc, 'Armazenado em:') || '';
            
            // 4. Cliente
            const cliente = getDocFieldValue(doc, 'CLIENTE') || getDocFieldValue(doc, 'Cliente') || '';
            
            // 5. Projecto / Referência
            const projecto = getDocFieldValue(doc, 'PROJECTO') || getDocFieldValue(doc, 'Projecto') || getDocFieldValue(doc, 'NO_PEDIDO___REFERENCIA') || getDocFieldValue(doc, 'Nº Pedido / Referência') || '';
            
            // 6. Assinatura Status
            const estatutoAcesso = getDocFieldValue(doc, 'ESTATUTO_ACESSO') || getDocFieldValue(doc, 'Estatuto Acesso') || '';
            const isAssinada = estatutoAcesso === 'Assinada';
            
            // 7. Tipo de Workflow
            let workflowType = 'Digital resolvida';
            const instName = prog.instances?.[0]?.Name || prog.instances?.[0]?.WorkflowName || '';
            if (instName) {
                if (instName.toLowerCase().includes('resolvida')) workflowType = 'Digital resolvida';
                else if (instName.toLowerCase().includes('nao resolvida')) workflowType = 'Digital não resolvida';
                else if (instName.toLowerCase().includes('manual')) workflowType = 'GR Manual';
            } else {
                // Check SLA fields for occurrence tasks
                const slaValues = [];
                for (let i = 1; i <= 19; i++) {
                    const val = getDocFieldValue(doc, `SLA_${i}`) || getDocFieldValue(doc, `SLA ${i}`);
                    if (val) slaValues.push(String(val).toLowerCase());
                }
                const hasNaoEntregue = slaValues.some(v => v.includes('nao entregue') || v.includes('parcial') || v.includes('regularizar') || v.includes('devolvido'));
                if (hasNaoEntregue) workflowType = 'Digital não resolvida';
                else {
                    const estatuto = String(getDocFieldValue(doc, 'ESTATUTO') || '').toLowerCase();
                    const estatutoEntrega = String(getDocFieldValue(doc, 'ESTATUTO_ENTREGA') || getDocFieldValue(doc, 'Estatuto Entrega') || '').toLowerCase();
                    if (estatutoEntrega.includes('parcial') || estatutoEntrega.includes('nao entregue') || estatuto.includes('devolvido')) {
                        workflowType = 'Digital não resolvida';
                    }
                }
            }
            
            // 8. Situação do Workflow
            const workflowStatus = getDocFieldValue(doc, 'ESTATUTO') || getDocFieldValue(doc, 'Estatuto') || '';
            
            // 9. Tipo de Entrega
            const entregaType = getDocFieldValue(doc, 'ESTATUTO_ENTREGA') || getDocFieldValue(doc, 'Estatuto Entrega') || '';
            
            // 10. Faturação Decision
            const invoiceNum = getDocFieldValue(doc, 'NO_FACTURA_ERP') || getDocFieldValue(doc, 'Nº Factura ERP') || '';
            const estatutoVal = String(getDocFieldValue(doc, 'ESTATUTO') || '').toLowerCase();
            
            let billingDecision = 'Aguardando decisão';
            if (invoiceNum && (estatutoVal === 'facturado' || estatutoVal === 'concluido' || estatutoVal === 'registado')) {
                billingDecision = 'Faturada';
            } else if (estatutoVal === 'facturado' && !invoiceNum) {
                billingDecision = 'Inconsistente';
            } else if (estatutoVal === 'recusado facturaçao' || estatutoVal === 'a imobilizar' || estatutoVal === 'consumivel') {
                billingDecision = 'Não faturada';
            } else if (!isAssinada) {
                billingDecision = 'Não avaliada';
            }
            
            // 11. Contabilização status
            const diarioNum = getDocFieldValue(doc, 'NO_DIARIO_ERP') || getDocFieldValue(doc, 'Nº Diário ERP') || getDocFieldValue(doc, 'NO_DIARIO_CONTABILISTICO') || getDocFieldValue(doc, 'Nº Diário Contabilístico') || '';
            const isContabilizada = diarioNum !== '' || estatutoVal === 'registado';
            
            return {
                id: doc.Id,
                docNum,
                serie,
                dataGR,
                dataArmazenamento,
                cliente,
                projecto,
                isAssinada,
                workflowType,
                workflowStatus,
                entregaType,
                billingDecision,
                invoiceNum,
                diarioNum,
                isContabilizada,
                etapaAtual: prog.activeTaskName || '-',
                responsavel: prog.responsible || '-',
                tempoParado: prog.timeStoppedMs || 0,
                docLink: docuwareService.getDocumentViewUrl(selectedCabinet, doc.Id, orgId),
                doc,
                parsedNum
            };
        });
    }, [documents, documentProgress, selectedCabinet, orgId]);

    // Pipeline visual steps aggregated for the cockpit
    const flowPipelineSteps = useMemo(() => {
        const targetDoc = selectedDoc || documents.find(doc => documentProgress[doc.Id]?.mergedGraph);
        if (!targetDoc || !documentProgress[targetDoc.Id]) return [];
        const prog = documentProgress[targetDoc.Id];

        // Find the instance and workflowId to check for uploaded WFD definition
        const instance = prog.instances?.[0];
        const workflowId = instance?.WorkflowId;
        const wfdDef = workflowId ? wfdDefinitions[workflowId] : null;

        let staticNodes = [];
        let staticEdges = [];

        if (wfdDef) {
            const graph = WorkflowGraphBuilder.build(wfdDef.activities, wfdDef.connections);
            staticNodes = graph.nodes || [];
            staticEdges = graph.edges || [];
        } else if (prog.mergedGraph) {
            staticNodes = prog.mergedGraph.nodes || [];
            staticEdges = prog.mergedGraph.edges || [];
        } else {
            return [];
        }
        
        const orderedTasks = getFlowPipelineSteps(staticNodes, staticEdges);
        
        const stepsWithAggregates = orderedTasks.map(task => {
            const isCompletedStep = isWorkflowEndNode(task);
            let count = 0;
            let avgTimeMs = 0;
            
            if (isCompletedStep) {
                count = documents.filter(doc => {
                    const p = documentProgress[doc.Id];
                    return p && p.isFinished;
                }).length;
            } else {
                const activeDocs = documents.filter(doc => {
                    const p = documentProgress[doc.Id];
                    return p && !p.isFinished && p.activeTaskName === task.name;
                });
                count = activeDocs.length;
                avgTimeMs = count > 0 
                    ? (activeDocs.reduce((acc, doc) => acc + (documentProgress[doc.Id]?.timeStoppedMs || 0), 0) / count) 
                    : 0;
            }
                
            return {
                id: task.id,
                name: task.name,
                count,
                avgTimeText: avgTimeMs > 0 ? WorkflowHistoryAnalyzer.formatDuration(avgTimeMs) : '-',
                isStart: isWorkflowStartNode(task),
                isEnd: isCompletedStep
            };
        });
        
        const hasEndNode = orderedTasks.some(isWorkflowEndNode);
        if (!hasEndNode) {
            const completedDocsCount = documents.filter(doc => {
                const p = documentProgress[doc.Id];
                return p && p.isFinished;
            }).length;
            
            stepsWithAggregates.push({
                id: 'virtual_completed',
                name: 'Concluído',
                count: completedDocsCount,
                avgTimeText: '-',
                isStart: false,
                isEnd: true
            });
        }
        
        return stepsWithAggregates;
    }, [selectedDoc, documentProgress, documents]);

    // Background queue to fetch progress for all documents dynamically using Server-side Batch Fetching
    useEffect(() => {
        if (documents.length === 0) {
            setDocumentProgress({});
            return;
        }

        let active = true;
        
        const fetchProgressForDocs = async () => {
            const docsToFetch = [...documents];
            window._historyCache = window._historyCache || {};

            const calculateProgress = async (doc, instances) => {
                let percent = 0;
                let remaining = 0;
                let statusText = 'Pendente';
                let activeTaskName = '';
                let isFinished = false;
                let isRejected = false;
                let entryDate = null;
                let completedAt = null;
                let responsible = '-';
                let timeStoppedMs = 0;
                let nextStep = '-';
                let merged = null;
                let analyzedHistory = [];

                if (instances && instances.length > 0) {
                    const sorted = [...instances].sort((a, b) => {
                        return (b.Version || 0) - (a.Version || 0);
                    });
                    
                    const instance = sorted[0];
                    const rawHistory = instance.HistorySteps || [];
                    analyzedHistory = WorkflowHistoryAnalyzer.analyze(rawHistory);

                    let parsedDef = wfdDefinitions[instance.WorkflowId];
                    if (!parsedDef) {
                        window._wfdPromises = window._wfdPromises || {};
                        if (!window._wfdPromises[instance.WorkflowId]) {
                            window._wfdPromises[instance.WorkflowId] = (async () => {
                                let def = await workflowAnalyticsService.getWfdDefinition(instance.WorkflowId, instance.WorkflowName || instance.Name);
                                if (!def) {
                                    const savedWfdStr = localStorage.getItem(`wfd_def_${instance.WorkflowId}`);
                                    if (savedWfdStr) {
                                        try {
                                            def = JSON.parse(savedWfdStr);
                                        } catch (err) {
                                            console.error('[WorkflowHistory] Failed to parse stored WFD:', err);
                                        }
                                    }
                                }
                                return def;
                            })();
                        }
                        parsedDef = await window._wfdPromises[instance.WorkflowId];
                    }

                    if (!parsedDef) {
                        parsedDef = generateFallbackGraph(analyzedHistory);
                    }

                    const graph = WorkflowGraphBuilder.build(parsedDef.activities, parsedDef.connections);
                    merged = WorkflowTimelineEngine.merge(graph, analyzedHistory);

                    const nodes = merged.nodes || [];
                    const edges = merged.edges || [];
                    
                    const isEndNode = (n) => {
                         if (!n) return false;
                         const type = (n.type || '').toLowerCase();
                         const name = (n.name || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
                         const hasOutgoing = edges.some(e => e.source === n.id);
                         
                         if (!hasOutgoing) return true;
                         if (type.includes('end') || type.includes('fim')) return true;
                         
                         return name === 'end' || 
                                name.startsWith('end ') || 
                                name.endsWith(' end') || 
                                name.includes(' end ') ||
                                name.startsWith('fim') ||
                                name.includes(' fim') ||
                                name.includes('concluid') || 
                                name.includes('termin') || 
                                name.includes('conclusao') ||
                                name.includes('cancelad') ||
                                name.includes('reprovad');
                     };
                    
                    const endNode = nodes.find(isEndNode);
                    isFinished = endNode && endNode.status === 'completed';

                    // Detect rejection/cancellation
                    if (isFinished) {
                        const rejKw = ['recusad', 'cancelad', 'reprovad', 'rejeit', 'refused', 'reject'];
                        const normalize = (s) => (s || '').toLowerCase()
                            .normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                        isRejected = analyzedHistory.some(step => {
                            const dec = normalize(step.decision || '');
                            return rejKw.some(kw => dec.includes(kw));
                        });
                    }

                    const parseDWDate = (dateStr) => {
                        if (!dateStr) return null;
                        if (typeof dateStr === 'string' && dateStr.startsWith('/Date(')) {
                            const match = dateStr.match(/-?\d+/);
                            if (match) {
                                const ts = parseInt(match[0]);
                                return ts > 0 ? new Date(ts) : null;
                            }
                        }
                        const d = new Date(dateStr);
                        return isNaN(d.getTime()) ? null : d;
                    };

                    entryDate = instance ? (instance.StartedAt ? parseDWDate(instance.StartedAt) : (analyzedHistory[0]?.startedAt || null)) : null;
                    completedAt = isFinished && endNode ? (endNode.executions[0]?.completedAt || endNode.completedAt || null) : null;

                    const activeNode = nodes.find(n => n.status === 'active');
                    if (activeNode) {
                        if (activeNode.activeUsers && activeNode.activeUsers.length > 0) {
                            responsible = activeNode.activeUsers.join(', ');
                        } else if (activeNode.executions && activeNode.executions.length > 0) {
                            responsible = activeNode.executions[activeNode.executions.length - 1].user || 'Sistema';
                        }
                    }

                    if (!isFinished && activeNode) {
                        const activeStep = analyzedHistory.find(step => step.isActive || (!step.decision && step.name === activeNode.name));
                        const activeStart = activeStep ? activeStep.startedAt : (activeNode.executions[0]?.startedAt || null);
                        if (activeStart) {
                            timeStoppedMs = Math.max(0, new Date().getTime() - new Date(activeStart).getTime());
                        }
                    }

                    const getNextStepName = (nodes, edges, activeNode) => {
                        if (!activeNode) return '-';
                        const outgoing = edges.filter(e => e.source === activeNode.id);
                        if (outgoing.length === 0) return 'Fim';
                        const targetNames = outgoing.map(edge => {
                            const targetNode = nodes.find(n => n.id === edge.target);
                            const label = edge.label ? ` (${edge.label})` : '';
                            return targetNode ? `${targetNode.name}${label}` : '';
                        }).filter(Boolean);
                        return targetNames.join(' / ') || 'Fim';
                    };
                    nextStep = getNextStepName(nodes, edges, activeNode);

                    if (isFinished) {
                        percent = 100;
                        remaining = 0;
                        statusText = 'Concluído';
                    } else {
                        if (activeNode) {
                            activeTaskName = activeNode.name;
                            remaining = getRemainingTaskCount(nodes, edges, activeNode.id) || 1;
                            
                            const completed = nodes.filter(n => n.status === 'completed' && isTaskType(n.type)).length;
                            const total = completed + remaining;
                            percent = total > 0 ? Math.round((completed / total) * 100) : 0;
                            
                            if (percent >= 100) percent = 99;
                            statusText = `Em Andamento (${percent}%)`;
                        } else {
                             const startNode = nodes.find(n => {
                                 const type = (n.type || '').toLowerCase();
                                 const name = (n.name || '').toLowerCase();
                                 return type.includes('start') || name.includes('start') || name.includes('inicio') || name.includes('início');
                             });
                            if (startNode) {
                                remaining = getRemainingTaskCount(nodes, edges, startNode.id);
                                percent = 0;
                                statusText = 'Pendente';
                            } else {
                                percent = 0;
                                statusText = 'Em Processamento';
                            }
                        }
                    }
                    
                    // Write/update cache in localStorage
                    try {
                        const cacheKey = `wf_history_${selectedCabinet}_${doc.Id}`;
                        const expiresAt = isFinished ? null : Date.now() + 5 * 60 * 1000;
                        const payload = JSON.stringify({
                            instances,
                            expiresAt,
                            isFinished
                        });
                        try {
                            localStorage.setItem(cacheKey, payload);
                        } catch (err) {
                            if (err.name === 'QuotaExceededError' || err.code === 22) {
                                console.warn('[Cache] LocalStorage full. Evicting old workflow history items...');
                                const keys = [];
                                for (let idx = 0; idx < localStorage.length; idx++) {
                                    const k = localStorage.key(idx);
                                    if (k && k.startsWith('wf_history_')) {
                                        keys.push(k);
                                    }
                                }
                                keys.forEach(k => localStorage.removeItem(k));
                                localStorage.setItem(cacheKey, payload);
                            } else {
                                throw err;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to write to localStorage', e);
                    }

                    // If this document is completed, persist its history details in cache
                    if (isFinished && instances && instances.length > 0) {
                        workflowAnalyticsService.persistHistoryCache(doc.Id, instances);
                    }
                }

                return {
                    percent,
                    remaining,
                    statusText,
                    activeTaskName,
                    isFinished,
                    isRejected,
                    loading: false,
                    entryDate,
                    completedAt,
                    responsible,
                    timeStoppedMs,
                    nextStep,
                    mergedGraph: merged,
                    analyzedHistory,
                    instances
                };
            };

            const missedDocs = [];
            const cachedProgressToSet = {};

            // 1. Process cached histories immediately
            for (const doc of docsToFetch) {
                if (documentProgress[doc.Id]) continue;

                const cacheKey = `wf_history_${selectedCabinet}_${doc.Id}`;
                let instances = null;

                try {
                    const cached = localStorage.getItem(cacheKey);
                    if (cached) {
                        const parsed = JSON.parse(cached);
                        const isExpired = parsed.expiresAt && Date.now() > parsed.expiresAt;
                        if (!isExpired) {
                            instances = parsed.instances;
                        }
                    }
                } catch (e) {
                    console.error('Failed to read from localStorage', e);
                }

                if (!instances) {
                    instances = window._historyCache[cacheKey];
                }

                if (instances) {
                    const progress = await calculateProgress(doc, instances);
                    if (progress) {
                        cachedProgressToSet[doc.Id] = progress;
                    }
                } else {
                    missedDocs.push(doc);
                }
            }

            // Set cached progress in a single render update
            if (active && Object.keys(cachedProgressToSet).length > 0) {
                setDocumentProgress(prev => ({ ...prev, ...cachedProgressToSet }));
            }

            if (missedDocs.length === 0) return;

            // 2. Fetch cache misses using Server-side Batch Fetching
            const missedDocIds = missedDocs.map(d => d.Id);
            try {
                // Fetch in batch sizes of 50 to ensure optimal chunk sizes
                const BATCH_SIZE = 50;
                for (let i = 0; i < missedDocIds.length; i += BATCH_SIZE) {
                    if (!active) break;
                    const chunkIds = missedDocIds.slice(i, i + BATCH_SIZE);
                    const batchResult = await workflowAnalyticsService.getBatchHistory(chunkIds, selectedCabinet);
                    
                    if (!active) break;

                    const batchProgressToSet = {};
                    for (const docId of chunkIds) {
                        const doc = missedDocs.find(d => d.Id === docId);
                        if (!doc) continue;

                        const instances = batchResult[docId] || [];
                        window._historyCache[`wf_history_${selectedCabinet}_${docId}`] = instances;

                        const progress = await calculateProgress(doc, instances);
                        if (progress) {
                            batchProgressToSet[docId] = progress;
                        }
                    }

                    if (active && Object.keys(batchProgressToSet).length > 0) {
                        setDocumentProgress(prev => ({ ...prev, ...batchProgressToSet }));
                    }
                }
            } catch (err) {
                console.error('[BatchHistory] Failed to load batch progress:', err);
            }
        };

        fetchProgressForDocs();

        return () => {
            active = false;
        };
    }, [documents, wfdUpdateCounter]);

    const handleWfdUpload = async (e, workflowId) => {
        const file = e.target.files[0];
        if (!file || !workflowId) return;

        try {
            const parsed = await WorkflowDefinitionParser.parse(file);
            
            // Save to server first
            await workflowAnalyticsService.saveWfdDefinition(workflowId, parsed);

            // Fallback: Save to localStorage
            localStorage.setItem(`wfd_def_${workflowId}`, JSON.stringify(parsed));
            
            // Update local state directly
            setWfdDefinitions(prev => ({
                ...prev,
                [workflowId]: parsed
            }));

            // Clear progress cache and trigger recalculation
            workflowAnalyticsService.clearCache();
            setDocumentProgress({});
            setWfdUpdateCounter(prev => prev + 1);
        } catch (err) {
            console.error('Error uploading WFD:', err);
            setError('Falha ao processar e salvar arquivo de definição de workflow.');
        }
    };

    const handleClearWfd = async (workflowId) => {
        if (!workflowId) return;
        try {
            // Delete from server
            await workflowAnalyticsService.deleteWfdDefinition(workflowId);
        } catch (err) {
            console.error('Error deleting WFD from server:', err);
        }

        // Delete from local
        localStorage.removeItem(`wfd_def_${workflowId}`);
        
        // Delete from local state
        setWfdDefinitions(prev => {
            const copy = { ...prev };
            delete copy[workflowId];
            return copy;
        });

        // Clear progress cache and trigger recalculation
        workflowAnalyticsService.clearCache();
        setDocumentProgress({});
        setWfdUpdateCounter(prev => prev + 1);
    };

    /* Load WFD definitions asynchronously when instances/history changes */
    useEffect(() => {
        const targets = historyInstances || [];
        if (targets.length === 0) return;

        let active = true;
        const loadDefinitions = async () => {
            const defs = { ...wfdDefinitions };
            let updated = false;
            
            for (const inst of targets) {
                const workflowId = inst.WorkflowId;
                if (defs[workflowId]) continue; // already loaded

                // Try server first
                let parsed = await workflowAnalyticsService.getWfdDefinition(workflowId, inst.WorkflowName || inst.Name);
                
                // Fallback to localStorage
                if (!parsed) {
                    const savedWfdStr = localStorage.getItem(`wfd_def_${workflowId}`);
                    if (savedWfdStr) {
                        try {
                            parsed = JSON.parse(savedWfdStr);
                            // Auto-sync: since we have it locally but not on the server, upload it now
                            console.log(`[AutoSync] Syncing WFD definition for ${workflowId} to the server...`);
                            await workflowAnalyticsService.saveWfdDefinition(workflowId, parsed);
                        } catch (err) {
                            console.error('[AutoSync] Failed to sync WFD definition:', err);
                        }
                    }
                }

                if (parsed) {
                    defs[workflowId] = parsed;
                    updated = true;
                }
            }

            if (active && updated) {
                setWfdDefinitions(defs);
            }
        };

        loadDefinitions();
        return () => { active = false; };
    }, [historyInstances, wfdUpdateCounter]);

    const handleAddFilter = () => {
        setFilters(prev => [...prev, { fieldName: '', value: '' }]);
    };

    const handleRemoveFilter = (index) => {
        setFilters(prev => prev.filter((_, idx) => idx !== index));
    };

    const handleFilterFieldChange = async (index, fieldName) => {
        const updated = [...filters];
        updated[index].fieldName = fieldName;
        
        // Match field config to check type
        const fieldConfig = cabinetFields.find(f => (f.DBFieldName || f.FieldName) === fieldName);
        const isDate = fieldName === 'DWSTOREDATE' || fieldName === 'DWSTOREDATETIME' || 
            (fieldConfig && (fieldConfig.DWFieldType === 'Date' || fieldConfig.DWFieldType === 'DateTime'));
        
        updated[index].value = isDate ? ['', ''] : '';
        setFilters(updated);

        // Fetch autocomplete values if text field
        if (fieldName && !isDate) {
            fetchSuggestionsForIndex(index, fieldName);
        }
    };

    // Handle Search for Cabinet Documents
    const handleSearchDocuments = async (e) => {
        if (e) e.preventDefault();
        if (!selectedCabinet) return;

        const searchId = ++latestSearchIdRef.current;

        setSearchLoading(true);
        setSearched(true);
        setError(null);
        setSelectedDoc(null);
        setIsDrawerOpen(false);
        setHistoryInstances(null);
        setDocumentProgress({});
        setQuickFilter('all');

        try {
            const queryFilters = [];

            // 1. Add selected Tipo Documental filter
            if (detectedTypeField && selectedDocType) {
                queryFilters.push({
                    fieldName: detectedTypeField.DBFieldName || detectedTypeField.FieldName,
                    value: selectedDocType
                });
            }

            // 2. Add dynamic Date Range filter
            if (detectedDateField) {
                queryFilters.push({
                    fieldName: detectedDateField.DBFieldName || detectedDateField.FieldName,
                    value: [dateRange[0] || '1900-01-01', dateRange[1] || '2099-12-31']
                });
            }

            console.log(`Searching documents in cabinet ${selectedCabinet} with filters:`, queryFilters);
            const response = await docuwareService.searchDocuments(selectedCabinet, queryFilters, 10000);
            
            if (latestSearchIdRef.current !== searchId) {
                console.log('[Search] Ignoring outdated search results.');
                return;
            }

            const items = response.items || [];
            setDocuments(items);
            setError(null); // Clear any previous errors on success!

            // Auto-select first document if results exist
            if (items.length > 0) {
                handleSelectDocument(items[0], 'timeline', false);
            }
        } catch (err) {
            if (latestSearchIdRef.current !== searchId) {
                console.log('[Search] Ignoring outdated search error.');
                return;
            }
            console.error('Document query failed:', err);
            setError('Não foi possível carregar os documentos. Verifique a conexão e tente novamente.');
            setDocuments([]);
        } finally {
            if (latestSearchIdRef.current === searchId) {
                setSearchLoading(false);
            }
        }
    };

    // Auto-load on mount when cabinet fields and type suggestion default are resolved
    useEffect(() => {
        if (selectedCabinet && detectedTypeField && detectedDateField && selectedDocType) {
            handleSearchDocuments();
        }
    }, [selectedCabinet, detectedTypeField, detectedDateField, selectedDocType]);

    // Triggered when a document row is clicked
    const handleSelectDocument = async (doc, initialSubTab = 'timeline', openDrawer = true) => {
        setSelectedDoc(doc);
        setIsDrawerOpen(openDrawer);
        setHistoryLoading(true);
        setHistoryInstances(null);
        setActiveTab(0);
        setActiveSubTab(initialSubTab);

        try {
            const fields = doc.Fields || [];
            setDocumentFields(fields);
            
            console.log(`Fetching history for DocID: ${doc.Id} (Cabinet: ${selectedCabinet})`);
            const instances = await workflowAnalyticsService.getHistoryByDocId(doc.Id, selectedCabinet);
            
            if (!instances || instances.length === 0) {
                setHistoryInstances([]);
            } else {
                // Sort instances: Alphabetical, then Version descending
                const sorted = [...instances].sort((a, b) => {
                    const nameA = (a.Name || '').toLowerCase();
                    const nameB = (b.Name || '').toLowerCase();
                    if (nameA < nameB) return -1;
                    if (nameA > nameB) return 1;
                    return (b.Version || 0) - (a.Version || 0);
                });
                setHistoryInstances(sorted);
            }
        } catch (err) {
            console.error(`Failed to load history for doc ${doc.Id}:`, err);
            setHistoryInstances([]);
        } finally {
            setHistoryLoading(false);
        }
    };

    // View fields handler fetching document metadata fields
    const handleViewFields = async () => {
        if (!selectedDoc) return;
        setFieldsLoading(true);
        try {
            const freshDoc = await docuwareService.getDocument(selectedCabinet, selectedDoc.Id);
            setDocumentFields(freshDoc.Fields || []);
            setShowFieldsModal(true);
        } catch (err) {
            console.error("Failed to load document fields", err);
            setShowFieldsModal(true); // fallback to currently available fields
        } finally {
            setFieldsLoading(false);
        }
    };

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setSortField(field);
            setSortDirection('desc');
        }
    };

    // Helper to generate chronological fallback graph when no .wfd is uploaded
    const generateFallbackGraph = (analyzedHistory) => {
        const activities = [];
        const connections = [];

        analyzedHistory.forEach((step, idx) => {
            const id = `fallback_${idx}`;
            let color = '#f6b71b';
            let icon = 'action-checkbox';

            if (step.type === 'Start' || step.type === 'StartEvent') {
                color = '#3b49a2';
                icon = 'start-event';
            } else if (step.type === 'End' || step.type === 'EndEvent') {
                color = '#10b981';
                icon = 'end-event';
            } else if (step.type === 'Condition') {
                color = '#40c02e';
                icon = 'conditions';
            }

            activities.push({
                id,
                name: step.name || 'Tarefa',
                type: step.type || 'WorkflowTask',
                description: '',
                x: 0,
                y: 0,
                width: 180,
                height: 80,
                color,
                icon
            });

            if (idx > 0) {
                connections.push({
                    id: `fallback_conn_${idx}`,
                    source: `fallback_${idx - 1}`,
                    target: `fallback_${idx}`,
                    label: analyzedHistory[idx - 1].decision || ''
                });
            }
        });

        return { activities, connections };
    };

    // Memoized dynamic workflow matching/merging
    const mergedGraph = useMemo(() => {
        if (!historyInstances || historyInstances.length === 0 || !historyInstances[activeTab]) {
            return null;
        }

        const instance = historyInstances[activeTab];
        const rawHistory = instance.HistorySteps || [];
        const analyzedHistory = WorkflowHistoryAnalyzer.analyze(rawHistory);

        let parsedDef = wfdDefinitions[instance.WorkflowId] || null;
        let isFallback = false;

        if (!parsedDef) {
            parsedDef = generateFallbackGraph(analyzedHistory);
            isFallback = true;
        }

        const graph = WorkflowGraphBuilder.build(parsedDef.activities, parsedDef.connections);
        const merged = WorkflowTimelineEngine.merge(graph, analyzedHistory);

        return {
            ...merged,
            isFallback
        };
    }, [historyInstances, activeTab, wfdDefinitions]);



    // Get Base URL correctly
    const authData = JSON.parse(sessionStorage.getItem('docuware_auth') || '{}');
    const baseUrl = authData.url || '';

    // Construct Integration URL
    const docLink = orgId && baseUrl && selectedDoc && selectedCabinet
        ? `${baseUrl}/DocuWare/Platform/WebClient/${orgId}/Integration?fc=${selectedCabinet}&did=${selectedDoc.Id}&p=V`
        : '#';

    // Audit trail helper formatting
    const getStatusStyle = (decision, type) => {
        const lowerDec = (decision || '').toLowerCase();
        if (lowerDec.includes('approve') || lowerDec.includes('aprov') || lowerDec === 'confirmed')
            return { color: 'text-success', icon: <FaCheckCircle className="mr-1" /> };
        if (lowerDec.includes('reject') || lowerDec.includes('rejeita'))
            return { color: 'text-error', icon: <FaTimesCircle className="mr-1" /> };
        if (isTaskType(type))
            return { color: 'text-warning', icon: <FaClock className="mr-1" /> };
        return { color: 'text-gray-500', icon: null };
    };

    const formatDate = (dateString, simple = false) => {
        if (!dateString) return '';
        let dateObj;
        if (typeof dateString === 'string' && dateString.startsWith('/Date(')) {
            const timestamp = parseInt(dateString.match(/\d+/)[0]);
            dateObj = new Date(timestamp);
        } else {
            dateObj = new Date(dateString);
        }

        if (isNaN(dateObj.getTime())) return '';
        const year = dateObj.getFullYear();
        if (year > 2100 || year < 1900) return '';

        if (simple) return dateObj.toLocaleDateString('pt-BR');
        return dateObj.toLocaleString('pt-BR');
    };

    const filteredSteps = (steps) => {
        if (!steps) return [];
        return showAutoActivities
            ? steps
            : steps.filter(step => {
                const type = step.ActivityType || step.type;
                return isTaskType(type) ||
                    type === 'StartEvent' ||
                    type === 'Start' ||
                    type === 'EndEvent' ||
                    type === 'End';
            });
    };

    const handleExportCSV = async () => {
        if (!historyInstances || historyInstances.length === 0 || !selectedDoc) return;

        try {
            const fixedHeaders = [
                'Instance GUID',
                'DOCID',
                'Instância',
                'Versão (Instância)',
                'Iniciado Em',
                'Atividade',
                'Tipo Atividade',
                'Decisão/Operação',
                'Usuário',
                'Data Decisão'
            ];

            const dynamicFieldNames = documentFields
                .map(f => f.FieldName)
                .sort();

            const csvHeaders = [...fixedHeaders, ...dynamicFieldNames, 'Link Documento'];
            const rows = [];

            historyInstances.forEach(instance => {
                const steps = filteredSteps(instance.HistorySteps);

                if (steps.length === 0) {
                    const rowData = {
                        'Instance GUID': instance.Id,
                        DOCID: selectedDoc.Id,
                        'Instância': instance.Name,
                        'Versão (Instância)': instance.Version,
                        'Iniciado Em': formatDate(instance.StartDate || instance.StartedAt, true),
                        'Atividade': '(Sem atividades)',
                        'Tipo Atividade': '',
                        'Decisão/Operação': '',
                        'Usuário': '',
                        'Data Decisão': '',
                        'Link Documento': docLink
                    };
                    dynamicFieldNames.forEach(fieldName => {
                        const field = documentFields.find(f => f.FieldName === fieldName);
                        rowData[fieldName] = field ? (field.Item || field.Value || '') : '';
                    });
                    rows.push(rowData);
                } else {
                    steps.forEach(step => {
                        const infoItem = step.Info?.Item || {};
                        let validUser = infoItem.UserName || step.User || step.UserName || '';
                        if (!validUser && infoItem.AssignedUsers && Array.isArray(infoItem.AssignedUsers)) {
                            validUser = infoItem.AssignedUsers.join(', ');
                        }
                        const validDate = infoItem.DecisionDate || step.StepDate || step.TimeStamp || '';
                        const validDecision = infoItem.DecisionName || step.DecisionLabel || '';

                        const rowData = {
                            'Instance GUID': instance.Id,
                            DOCID: selectedDoc.Id,
                            'Instância': instance.Name,
                            'Versão (Instância)': instance.Version,
                            'Iniciado Em': formatDate(instance.StartDate || instance.StartedAt, true),
                            'Atividade': step.ActivityName || step.Name,
                            'Tipo Atividade': step.ActivityType,
                            'Decisão/Operação': validDecision,
                            'Usuário': validUser,
                            'Data Decisão': formatDate(validDate),
                            'Link Documento': docLink
                        };

                        dynamicFieldNames.forEach(fieldName => {
                            const field = documentFields.find(f => f.FieldName === fieldName);
                            let val = field ? (field.Item || field.Value || '') : '';
                            if (typeof val === 'string' && val.includes('/Date(')) {
                                val = formatDate(val, true);
                            } else if (field && field.ItemElementName === 'Date' && field.Item) {
                                val = formatDate(field.Item, true);
                            }
                            rowData[fieldName] = val;
                        });
                        rows.push(rowData);
                    });
                }
            });

            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '';
                const str = String(val);
                if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const headerRow = csvHeaders.map(escapeCsv).join(';');
            const dataRows = rows.map(row => {
                return csvHeaders.map(header => escapeCsv(row[header])).join(';');
            });

            const csvContent = [headerRow, ...dataRows].join('\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Historico_Workflow_${selectedDoc.Id}_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Export failed:', err);
            setError('Falha ao exportar CSV. Tente novamente.');
        }
    };

    const handleExportDocumentsList = () => {
        try {
            const csvHeaders = [
                'Documento',
                'ID DocuWare',
                'Início',
                'Status',
                'Progresso (%)',
                'Requerente',
                'Etapa Atual',
                'Responsável',
                'Tempo Parado',
                'Prioridade',
                'Forma Pagamento',
                'Valor',
                'Comentários'
            ];

            const rows = filteredAndSortedDocuments.map(doc => {
                const prog = documentProgress[doc.Id] || {};
                const docNum = getDocumentNumber(doc) || 'Sem Nº';
                const comments = getDocumentComments(doc) || '';
                const timeStopped = !prog.isFinished && prog.timeStoppedMs > 0
                    ? WorkflowHistoryAnalyzer.formatDuration(prog.timeStoppedMs)
                    : '';

                return {
                    'Documento': docNum,
                    'ID DocuWare': doc.Id,
                    'Início': prog.entryDate ? formatDate(prog.entryDate, true) : '',
                    'Status': prog.isFinished ? 'Concluído' : (prog.percent !== undefined ? 'Ativo' : 'Carregando...'),
                    'Progresso (%)': prog.percent !== undefined ? `${prog.percent}%` : '',
                    'Requerente': getDocFieldValue(doc, 'REQUERENTE') || '',
                    'Etapa Atual': prog.activeTaskName || '',
                    'Responsável': prog.responsible && prog.responsible !== '-' ? prog.responsible : '',
                    'Tempo Parado': timeStopped,
                    'Prioridade': getDocFieldValue(doc, 'PRIORIDADE') || '',
                    'Forma Pagamento': getDocFieldValue(doc, 'FORMA_DE_PAGAMENTO') || '',
                    'Valor': getDocFieldValue(doc, 'CHAMP_10') || '',
                    'Comentários': comments
                };
            });

            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '';
                const str = String(val);
                if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const headerRow = csvHeaders.map(escapeCsv).join(';');
            const dataRows = rows.map(row => {
                return csvHeaders.map(header => escapeCsv(row[header])).join(';');
            });

            const csvContent = [headerRow, ...dataRows].join('\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Lista_Documentos_Workflow_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Exporting documents list failed:', err);
            setError('Falha ao exportar a lista de documentos. Tente novamente.');
        }
    };

    const uniqueClientsList = useMemo(() => {
        const clients = new Set();
        analyticalRows.forEach(r => {
            if (r.cliente) clients.add(r.cliente);
        });
        return Array.from(clients).sort();
    }, [analyticalRows]);

    const uniquePeriodsList = useMemo(() => {
        const periods = new Set();
        analyticalRows.forEach(r => {
            if (r.dataGR) {
                const pts = r.dataGR.split('/');
                if (pts.length === 3) {
                    periods.add(`${pts[2]}-${pts[1]}`);
                }
            }
        });
        return Array.from(periods).sort().reverse();
    }, [analyticalRows]);

    // Handle sort toggle for analytical views
    const handleAnaliseSort = (field) => {
        if (analiseSortField === field) {
            setAnaliseSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
        } else {
            setAnaliseSortField(field);
            setAnaliseSortDirection('asc');
        }
        setAnalisePage(1);
    };

    // CSV Exporter for analytical tables
    const exportAnaliseTableToCsv = (filename, headers, rowsMapping, data) => {
        try {
            const escapeCsv = (val) => {
                if (val === null || val === undefined) return '';
                const str = String(val);
                if (str.includes(';') || str.includes('"') || str.includes('\n')) {
                    return `"${str.replace(/"/g, '""')}"`;
                }
                return str;
            };

            const headerRow = headers.map(escapeCsv).join(';');
            const dataRows = data.map(row => {
                return rowsMapping.map(field => escapeCsv(row[field])).join(';');
            });

            const csvContent = [headerRow, ...dataRows].join('\n');
            const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${filename}_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        } catch (err) {
            console.error('Failed to export analytical CSV:', err);
            setError('Falha ao exportar CSV de análises. Tente novamente.');
        }
    };

    const renderControleGRs = () => {
        // Apply Filters
        let filtered = analyticalRows.filter(row => {
            if (analiseFilters.serie !== 'all' && row.serie !== analiseFilters.serie) return false;
            if (analiseFilters.assinada !== 'all') {
                const expectAssinada = analiseFilters.assinada === 'Assinada';
                if (row.isAssinada !== expectAssinada) return false;
            }
            if (analiseFilters.faturada !== 'all') {
                if (analiseFilters.faturada === 'Faturada' && row.billingDecision !== 'Faturada') return false;
                if (analiseFilters.faturada === 'Não faturada' && row.billingDecision !== 'Não faturada') return false;
                if (analiseFilters.faturada === 'Aguardando' && row.billingDecision !== 'Aguardando decisão') return false;
                if (analiseFilters.faturada === 'Inconsistente' && row.billingDecision !== 'Inconsistente') return false;
            }
            if (analiseFilters.cliente !== 'all' && row.cliente !== analiseFilters.cliente) return false;
            if (analiseFilters.docNum && !row.docNum.toLowerCase().includes(analiseFilters.docNum.toLowerCase())) return false;
            if (analiseFilters.faturaNum && !row.invoiceNum.toLowerCase().includes(analiseFilters.faturaNum.toLowerCase())) return false;
            return true;
        });

        // Apply Sorting
        filtered.sort((a, b) => {
            let valA = a[analiseSortField];
            let valB = b[analiseSortField];
            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                return analiseSortDirection === 'asc' 
                    ? valA.localeCompare(valB, 'pt-BR') 
                    : valB.localeCompare(valA, 'pt-BR');
            } else {
                return analiseSortDirection === 'asc' 
                    ? (valA > valB ? 1 : valA < valB ? -1 : 0) 
                    : (valB > valA ? 1 : valB < valA ? -1 : 0);
            }
        });

        // Calculate KPIs
        const total = filtered.length;
        const assinadas = filtered.filter(r => r.isAssinada).length;
        const aguardandoAssinatura = filtered.filter(r => !r.isAssinada).length;
        const faturadas = filtered.filter(r => r.billingDecision === 'Faturada').length;
        const naoFaturadas = filtered.filter(r => r.billingDecision === 'Não faturada').length;
        const aguardandoDecisao = filtered.filter(r => r.billingDecision === 'Aguardando decisão').length;
        const inconsistências = filtered.filter(r => r.billingDecision === 'Inconsistente').length;

        // Paginate
        const totalPages = Math.ceil(total / analisePageSize) || 1;
        const startIdx = (analisePage - 1) * analisePageSize;
        const paginatedData = filtered.slice(startIdx, startIdx + analisePageSize);

        const handleKpiClick = (filterField, filterValue) => {
            setAnaliseFilters(prev => ({ ...prev, [filterField]: filterValue }));
            setAnalisePage(1);
        };

        return (
            <div className="space-y-6">
                {/* KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-7 gap-4">
                    <div onClick={() => setAnaliseFilters(prev => ({ ...prev, serie: 'all', assinada: 'all', faturada: 'all', cliente: 'all', docNum: '', faturaNum: '' }))} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total de GRs</div>
                        <div className="text-2xl font-black text-slate-800 mt-1 font-mono">{total}</div>
                    </div>
                    <div onClick={() => handleKpiClick('assinada', 'Assinada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Assinadas</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{assinadas}</div>
                    </div>
                    <div onClick={() => handleKpiClick('assinada', 'Não Assinada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Assinatura</div>
                        <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{aguardandoAssinatura}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Faturada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Faturadas</div>
                        <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">{faturadas}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Não faturada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Não Faturadas</div>
                        <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{naoFaturadas}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Aguardando')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Decisão</div>
                        <div className="text-2xl font-black text-slate-600 mt-1 font-mono">{aguardandoDecisao}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Inconsistente')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas Sem Nº</div>
                        <div className="text-2xl font-black text-red-600 mt-1 font-mono">{inconsistências}</div>
                    </div>
                </div>

                {/* Filter Toolbar */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-4 items-center">
                    <input 
                        type="text" 
                        placeholder="Pesquisar GR..." 
                        className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg w-40" 
                        value={analiseFilters.docNum} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, docNum: e.target.value })); setAnalisePage(1); }} 
                    />
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.serie} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, serie: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Série (Todas)</option>
                        <option value="V">Série V</option>
                        <option value="G">Série G</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.assinada} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, assinada: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Assinatura (Todas)</option>
                        <option value="Assinada">Assinada</option>
                        <option value="Não Assinada">Não Assinada</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.faturada} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, faturada: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Faturação (Todas)</option>
                        <option value="Faturada">Faturada</option>
                        <option value="Não faturada">Não faturada</option>
                        <option value="Aguardando">Aguardando decisão</option>
                        <option value="Inconsistente">Faturada Sem Número</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg max-w-xs"
                        value={analiseFilters.cliente} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, cliente: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Cliente (Todos)</option>
                        {uniqueClientsList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input 
                        type="text" 
                        placeholder="Nº Fatura..." 
                        className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg w-32" 
                        value={analiseFilters.faturaNum} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, faturaNum: e.target.value })); setAnalisePage(1); }} 
                    />
                    <button 
                        onClick={() => exportAnaliseTableToCsv('Controle_GRs', ['GR', 'Série', 'Data da GR', 'Cliente', 'Assinada', 'Entrega', 'Tipo de fluxo', 'Situação do workflow', 'Decisão de faturação', 'Nº da fatura'], ['docNum', 'serie', 'dataGR', 'cliente', 'isAssinada', 'entregaType', 'workflowType', 'workflowStatus', 'billingDecision', 'invoiceNum'], filtered)} 
                        className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-2 rounded-lg font-semibold h-9 ml-auto"
                        disabled={filtered.length === 0}
                    >
                        <FaFileCsv /> Exportar CSV
                    </button>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                                <th onClick={() => handleAnaliseSort('docNum')} className="cursor-pointer py-3 hover:text-indigo-600">GR {analiseSortField === 'docNum' ? (analiseSortDirection === 'asc' ? '↑' : '↓') : '↕'}</th>
                                <th onClick={() => handleAnaliseSort('serie')} className="cursor-pointer py-3 hover:text-indigo-600">Série</th>
                                <th onClick={() => handleAnaliseSort('dataGR')} className="cursor-pointer py-3 hover:text-indigo-600">Data da GR</th>
                                <th onClick={() => handleAnaliseSort('cliente')} className="cursor-pointer py-3 hover:text-indigo-600">Cliente</th>
                                <th onClick={() => handleAnaliseSort('isAssinada')} className="cursor-pointer py-3 hover:text-indigo-600">Assinada</th>
                                <th onClick={() => handleAnaliseSort('entregaType')} className="cursor-pointer py-3 hover:text-indigo-600">Entrega</th>
                                <th onClick={() => handleAnaliseSort('workflowType')} className="cursor-pointer py-3 hover:text-indigo-600">Tipo de fluxo</th>
                                <th onClick={() => handleAnaliseSort('workflowStatus')} className="cursor-pointer py-3 hover:text-indigo-600">Situação workflow</th>
                                <th onClick={() => handleAnaliseSort('billingDecision')} className="cursor-pointer py-3 hover:text-indigo-600">Decisão faturação</th>
                                <th onClick={() => handleAnaliseSort('invoiceNum')} className="cursor-pointer py-3 hover:text-indigo-600">Nº Fatura</th>
                                <th className="text-center py-3">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center py-12 text-slate-400 italic">Nenhuma Guia de Remessa encontrada.</td>
                                </tr>
                            ) : paginatedData.map(row => (
                                <tr key={row.id} className="hover:bg-slate-50/50">
                                    <td className="font-bold text-slate-800 text-[10px]">{row.docNum}</td>
                                    <td className="text-xs font-semibold text-slate-500">{row.serie || '-'}</td>
                                    <td className="text-xs text-slate-500 font-mono">{row.dataGR || '-'}</td>
                                    <td className="text-xs text-slate-600 truncate max-w-[150px] font-medium" title={row.cliente}>{row.cliente || '-'}</td>
                                    <td className="text-xs">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.isAssinada ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                            {row.isAssinada ? 'Sim' : 'Não'}
                                        </span>
                                    </td>
                                    <td className="text-xs text-slate-500 font-medium">{row.entregaType || '-'}</td>
                                    <td className="text-[11px] font-semibold text-slate-600">{row.workflowType}</td>
                                    <td className="text-xs text-slate-500 font-medium">{row.workflowStatus || '-'}</td>
                                    <td className="text-xs">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            row.billingDecision === 'Faturada' ? 'bg-indigo-50 text-indigo-700' :
                                            row.billingDecision === 'Não faturada' ? 'bg-rose-50 text-rose-700' :
                                            row.billingDecision === 'Inconsistente' ? 'bg-red-50 text-red-700' :
                                            'bg-slate-50 text-slate-700'
                                        }`}>
                                            {row.billingDecision}
                                        </span>
                                    </td>
                                    <td className="text-[11px] font-semibold text-indigo-600 font-mono">{row.invoiceNum || '—'}</td>
                                    <td className="text-center">
                                        <div className="flex justify-center gap-1.5">
                                            <a href={row.docLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Ver Documento"><FaExternalLinkAlt /></a>
                                            <button onClick={() => handleSelectDocument(row.doc, 'timeline')} className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Histórico"><FaHistory /></button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <span className="text-xs text-slate-500 font-medium">Mostrando {startIdx + 1} a {Math.min(startIdx + analisePageSize, total)} de {total} GRs</span>
                            <div className="btn-group gap-1">
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === 1} onClick={() => setAnalisePage(prev => prev - 1)}>Anterior</button>
                                <span className="btn btn-xs btn-active rounded-lg font-mono">{analisePage} / {totalPages}</span>
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === totalPages} onClick={() => setAnalisePage(prev => prev + 1)}>Próxima</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderArmazemEntregas = () => {
        // Apply Filters
        let filtered = analyticalRows.filter(row => {
            if (analiseFilters.serie !== 'all' && row.serie !== analiseFilters.serie) return false;
            if (analiseFilters.assinada !== 'all') {
                const expectAssinada = analiseFilters.assinada === 'Assinada';
                if (row.isAssinada !== expectAssinada) return false;
            }
            if (analiseFilters.entrega !== 'all' && row.entregaType !== analiseFilters.entrega) return false;
            if (analiseFilters.cliente !== 'all' && row.cliente !== analiseFilters.cliente) return false;
            if (analiseFilters.docNum && !row.docNum.toLowerCase().includes(analiseFilters.docNum.toLowerCase())) return false;
            return true;
        });

        // Apply Sorting
        filtered.sort((a, b) => {
            let valA = a[analiseSortField];
            let valB = b[analiseSortField];
            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                return analiseSortDirection === 'asc' 
                    ? valA.localeCompare(valB, 'pt-BR') 
                    : valB.localeCompare(valA, 'pt-BR');
            } else {
                return analiseSortDirection === 'asc' 
                    ? (valA > valB ? 1 : valA < valB ? -1 : 0) 
                    : (valB > valA ? 1 : valB < valA ? -1 : 0);
            }
        });

        // KPIs calculations
        const total = filtered.length;
        const aguardandoAssinatura = filtered.filter(r => !r.isAssinada).length;
        const assinadas = filtered.filter(r => r.isAssinada).length;
        const entregaTotal = filtered.filter(r => r.entregaType === 'Total').length;
        const entregaParcial = filtered.filter(r => r.entregaType === 'Parcial').length;
        const naoEntregues = filtered.filter(r => r.entregaType === 'Não Entregue').length;
        const devolvidoArmazém = filtered.filter(r => r.workflowStatus === 'Devolvido ao Armazém' || r.workflowStatus.toLowerCase().includes('devolvido')).length;
        const parados24h = filtered.filter(r => r.workflowStatus !== 'Concluido' && r.tempoParado > 24 * 3600 * 1000).length;
        const parados3d = filtered.filter(r => r.workflowStatus !== 'Concluido' && r.tempoParado > 3 * 24 * 3600 * 1000).length;

        // Paginate
        const totalPages = Math.ceil(total / analisePageSize) || 1;
        const startIdx = (analisePage - 1) * analisePageSize;
        const paginatedData = filtered.slice(startIdx, startIdx + analisePageSize);

        const handleKpiClick = (filterField, filterValue) => {
            setAnaliseFilters(prev => ({ ...prev, [filterField]: filterValue }));
            setAnalisePage(1);
        };

        return (
            <div className="space-y-6">
                {/* KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    <div onClick={() => handleKpiClick('assinada', 'Não Assinada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Assinatura</div>
                        <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{aguardandoAssinatura}</div>
                    </div>
                    <div onClick={() => handleKpiClick('assinada', 'Assinada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">GRs Assinadas</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{assinadas}</div>
                    </div>
                    <div onClick={() => handleKpiClick('entrega', 'Total')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entrega Total</div>
                        <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">{entregaTotal}</div>
                    </div>
                    <div onClick={() => handleKpiClick('entrega', 'Parcial')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Entrega Parcial</div>
                        <div className="text-2xl font-black text-amber-500 mt-1 font-mono">{entregaParcial}</div>
                    </div>
                    <div onClick={() => handleKpiClick('entrega', 'Não Entregue')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Não Entregue</div>
                        <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{naoEntregues}</div>
                    </div>
                    <div onClick={() => handleKpiClick('entrega', 'Devolvido ao Armazém')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Devolvidas Armazém</div>
                        <div className="text-2xl font-black text-purple-600 mt-1 font-mono">{devolvidoArmazém}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parados &gt; 24h</div>
                        <div className="text-2xl font-black text-rose-500 mt-1 font-mono">{parados24h}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Parados &gt; 3 Dias</div>
                        <div className="text-2xl font-black text-red-600 mt-1 font-mono">{parados3d}</div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-4 items-center">
                    <input 
                        type="text" 
                        placeholder="Pesquisar GR..." 
                        className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg w-40" 
                        value={analiseFilters.docNum} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, docNum: e.target.value })); setAnalisePage(1); }} 
                    />
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.serie} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, serie: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Série (Todas)</option>
                        <option value="V">Série V</option>
                        <option value="G">Série G</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.assinada} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, assinada: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Assinatura (Todas)</option>
                        <option value="Assinada">Assinada</option>
                        <option value="Não Assinada">Não Assinada</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.entrega} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, entrega: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Entrega (Todas)</option>
                        <option value="Total">Entrega Total</option>
                        <option value="Parcial">Entrega Parcial</option>
                        <option value="Não Entregue">Não Entregue</option>
                        <option value="Devolvido ao Armazém">Devolvida ao Armazém</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg max-w-xs"
                        value={analiseFilters.cliente} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, cliente: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Cliente (Todos)</option>
                        {uniqueClientsList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <button 
                        onClick={() => exportAnaliseTableToCsv('Armazem_Entregas', ['GR', 'Série', 'Cliente', 'Técnico', 'Armazenada em', 'Assinada', 'Tipo de entrega', 'Etapa atual', 'Tempo aguardando'], ['docNum', 'serie', 'cliente', 'tecnico', 'dataArmazenamento', 'isAssinada', 'entregaType', 'etapaAtual', 'tempoParado'], filtered.map(f => ({ ...f, tecnico: getDocFieldValue(f.doc, 'TECNICO') || getDocFieldValue(f.doc, 'Técnico') })))} 
                        className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-2 rounded-lg font-semibold h-9 ml-auto"
                        disabled={filtered.length === 0}
                    >
                        <FaFileCsv /> Exportar CSV
                    </button>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                                <th onClick={() => handleAnaliseSort('docNum')} className="cursor-pointer py-3 hover:text-indigo-600">GR {analiseSortField === 'docNum' ? (analiseSortDirection === 'asc' ? '↑' : '↓') : '↕'}</th>
                                <th onClick={() => handleAnaliseSort('serie')} className="cursor-pointer py-3 hover:text-indigo-600">Série</th>
                                <th onClick={() => handleAnaliseSort('cliente')} className="cursor-pointer py-3 hover:text-indigo-600">Cliente</th>
                                <th className="py-3">Técnico</th>
                                <th onClick={() => handleAnaliseSort('dataArmazenamento')} className="cursor-pointer py-3 hover:text-indigo-600">Armazenada Em</th>
                                <th onClick={() => handleAnaliseSort('isAssinada')} className="cursor-pointer py-3 hover:text-indigo-600">Assinada</th>
                                <th onClick={() => handleAnaliseSort('entregaType')} className="cursor-pointer py-3 hover:text-indigo-600">Tipo de Entrega</th>
                                <th onClick={() => handleAnaliseSort('etapaAtual')} className="cursor-pointer py-3 hover:text-indigo-600">Etapa Atual</th>
                                <th onClick={() => handleAnaliseSort('tempoParado')} className="cursor-pointer py-3 hover:text-indigo-600">Tempo Aguardando</th>
                                <th className="text-center py-3">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="10" className="text-center py-12 text-slate-400 italic">Nenhuma Guia de Remessa operacional encontrada.</td>
                                </tr>
                            ) : paginatedData.map(row => {
                                const tecnico = getDocFieldValue(row.doc, 'TECNICO') || getDocFieldValue(row.doc, 'Técnico') || '';
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/50">
                                        <td className="font-bold text-slate-800 text-[10px]">{row.docNum}</td>
                                        <td className="text-xs font-semibold text-slate-500">{row.serie || '-'}</td>
                                        <td className="text-xs text-slate-600 truncate max-w-[150px] font-medium" title={row.cliente}>{row.cliente || '-'}</td>
                                        <td className="text-xs text-slate-500 font-semibold">{tecnico ? tecnico.split('@')[0] : '—'}</td>
                                        <td className="text-xs text-slate-500 font-mono">{row.dataArmazenamento || '-'}</td>
                                        <td className="text-xs">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.isAssinada ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                                {row.isAssinada ? 'Sim' : 'Não'}
                                            </span>
                                        </td>
                                        <td className="text-xs text-slate-500 font-medium">{row.entregaType || '-'}</td>
                                        <td className="text-xs text-slate-500 font-medium">{row.etapaAtual || '-'}</td>
                                        <td className="text-xs text-slate-500 font-mono font-medium">{row.tempoParado > 0 ? WorkflowHistoryAnalyzer.formatDuration(row.tempoParado) : '—'}</td>
                                        <td className="text-center">
                                            <div className="flex justify-center gap-1.5">
                                                <a href={row.docLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Ver Documento"><FaExternalLinkAlt /></a>
                                                <button onClick={() => handleSelectDocument(row.doc, 'timeline')} className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Histórico"><FaHistory /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <span className="text-xs text-slate-500 font-medium">Mostrando {startIdx + 1} a {Math.min(startIdx + analisePageSize, total)} de {total} GRs</span>
                            <div className="btn-group gap-1">
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === 1} onClick={() => setAnalisePage(prev => prev - 1)}>Anterior</button>
                                <span className="btn btn-xs btn-active rounded-lg font-mono">{analisePage} / {totalPages}</span>
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === totalPages} onClick={() => setAnalisePage(prev => prev + 1)}>Próxima</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderFaturacao = () => {
        // Apply Series G and V filter restriction strictly
        let filtered = analyticalRows.filter(row => {
            if (row.serie !== 'V' && row.serie !== 'G') return false;
            if (analiseFilters.serie !== 'all' && row.serie !== analiseFilters.serie) return false;
            if (analiseFilters.assinada !== 'all') {
                const expectAssinada = analiseFilters.assinada === 'Assinada';
                if (row.isAssinada !== expectAssinada) return false;
            }
            if (analiseFilters.faturada !== 'all') {
                if (analiseFilters.faturada === 'Faturada' && row.billingDecision !== 'Faturada') return false;
                if (analiseFilters.faturada === 'Não faturada' && row.billingDecision !== 'Não faturada') return false;
                if (analiseFilters.faturada === 'Aguardando' && row.billingDecision !== 'Aguardando decisão') return false;
                if (analiseFilters.faturada === 'Inconsistente' && row.billingDecision !== 'Inconsistente') return false;
            }
            if (analiseFilters.cliente !== 'all' && row.cliente !== analiseFilters.cliente) return false;
            if (analiseFilters.docNum && !row.docNum.toLowerCase().includes(analiseFilters.docNum.toLowerCase())) return false;
            if (analiseFilters.faturaNum && !row.invoiceNum.toLowerCase().includes(analiseFilters.faturaNum.toLowerCase())) return false;
            return true;
        });

        // Apply Sorting
        filtered.sort((a, b) => {
            let valA = a[analiseSortField];
            let valB = b[analiseSortField];
            if (valA === undefined) valA = '';
            if (valB === undefined) valB = '';

            if (typeof valA === 'string' && typeof valB === 'string') {
                return analiseSortDirection === 'asc' 
                    ? valA.localeCompare(valB, 'pt-BR') 
                    : valB.localeCompare(valA, 'pt-BR');
            } else {
                return analiseSortDirection === 'asc' 
                    ? (valA > valB ? 1 : valA < valB ? -1 : 0) 
                    : (valB > valA ? 1 : valB < valA ? -1 : 0);
            }
        });

        // Calculate KPIs
        const totalVg = filtered.length;
        const faturadas = filtered.filter(r => r.billingDecision === 'Faturada').length;
        const naoFaturadas = filtered.filter(r => r.billingDecision === 'Não faturada').length;
        const aguardandoDecisao = filtered.filter(r => r.billingDecision === 'Aguardando decisão').length;
        const comFatura = filtered.filter(r => r.invoiceNum).length;
        const semFatura = filtered.filter(r => !r.invoiceNum).length;
        const inconsistências = filtered.filter(r => r.billingDecision === 'Inconsistente').length;
        const faturadasNaoContabilizadas = filtered.filter(r => r.billingDecision === 'Faturada' && !r.isContabilizada).length;

        // Paginate
        const totalPages = Math.ceil(totalVg / analisePageSize) || 1;
        const startIdx = (analisePage - 1) * analisePageSize;
        const paginatedData = filtered.slice(startIdx, startIdx + analisePageSize);

        const handleKpiClick = (filterField, filterValue) => {
            setAnaliseFilters(prev => ({ ...prev, [filterField]: filterValue }));
            setAnalisePage(1);
        };

        return (
            <div className="space-y-6">
                {/* KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-8 gap-4">
                    <div onClick={() => setAnaliseFilters(prev => ({ ...prev, serie: 'all', assinada: 'all', faturada: 'all', cliente: 'all', docNum: '', faturaNum: '' }))} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total V & G</div>
                        <div className="text-2xl font-black text-slate-800 mt-1 font-mono">{totalVg}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Faturada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas</div>
                        <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">{faturadas}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Não faturada')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Não Faturadas</div>
                        <div className="text-2xl font-black text-rose-600 mt-1 font-mono">{naoFaturadas}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Aguardando')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Aguardando Decisão</div>
                        <div className="text-2xl font-black text-slate-600 mt-1 font-mono">{aguardandoDecisao}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Com Nº Fatura</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{comFatura}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Sem Nº Fatura</div>
                        <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{semFatura}</div>
                    </div>
                    <div onClick={() => handleKpiClick('faturada', 'Inconsistente')} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm cursor-pointer hover:shadow-md transition-shadow">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas Sem Nº (Incons.)</div>
                        <div className="text-2xl font-black text-red-600 mt-1 font-mono">{inconsistências}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Faturadas Não Contab.</div>
                        <div className="text-2xl font-black text-purple-600 mt-1 font-mono">{faturadasNaoContabilizadas}</div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-4 items-center">
                    <input 
                        type="text" 
                        placeholder="Pesquisar GR..." 
                        className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg w-40" 
                        value={analiseFilters.docNum} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, docNum: e.target.value })); setAnalisePage(1); }} 
                    />
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.serie} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, serie: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Série (Todas V & G)</option>
                        <option value="V">Série V</option>
                        <option value="G">Série G</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.assinada} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, assinada: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Assinatura (Todas)</option>
                        <option value="Assinada">Assinada</option>
                        <option value="Não Assinada">Não Assinada</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.faturada} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, faturada: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Faturação (Todas)</option>
                        <option value="Faturada">Faturada</option>
                        <option value="Não faturada">Não faturada</option>
                        <option value="Aguardando">Aguardando decisão</option>
                        <option value="Inconsistente">Faturada Sem Número</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg max-w-xs"
                        value={analiseFilters.cliente} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, cliente: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="all">Cliente (Todos)</option>
                        {uniqueClientsList.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <input 
                        type="text" 
                        placeholder="Nº Fatura..." 
                        className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg w-32" 
                        value={analiseFilters.faturaNum} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, faturaNum: e.target.value })); setAnalisePage(1); }} 
                    />
                    <button 
                        onClick={() => exportAnaliseTableToCsv('Faturacao_GRs_V_G', ['GR', 'Série', 'Cliente', 'Nº Pedido/Referência', 'Assinada', 'Entrega', 'Decisão da faturação', 'Nº da fatura', 'Workflow', 'Etapa atual'], ['docNum', 'serie', 'cliente', 'projecto', 'isAssinada', 'entregaType', 'billingDecision', 'invoiceNum', 'workflowType', 'etapaAtual'], filtered)} 
                        className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-2 rounded-lg font-semibold h-9 ml-auto"
                        disabled={filtered.length === 0}
                    >
                        <FaFileCsv /> Exportar CSV
                    </button>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                                <th onClick={() => handleAnaliseSort('docNum')} className="cursor-pointer py-3 hover:text-indigo-600">GR {analiseSortField === 'docNum' ? (analiseSortDirection === 'asc' ? '↑' : '↓') : '↕'}</th>
                                <th onClick={() => handleAnaliseSort('serie')} className="cursor-pointer py-3 hover:text-indigo-600">Série</th>
                                <th onClick={() => handleAnaliseSort('cliente')} className="cursor-pointer py-3 hover:text-indigo-600">Cliente</th>
                                <th onClick={() => handleAnaliseSort('projecto')} className="cursor-pointer py-3 hover:text-indigo-600">Nº Pedido/Referência</th>
                                <th onClick={() => handleAnaliseSort('isAssinada')} className="cursor-pointer py-3 hover:text-indigo-600">Assinada</th>
                                <th onClick={() => handleAnaliseSort('entregaType')} className="cursor-pointer py-3 hover:text-indigo-600">Entrega</th>
                                <th onClick={() => handleAnaliseSort('billingDecision')} className="cursor-pointer py-3 hover:text-indigo-600">Decisão Faturação</th>
                                <th onClick={() => handleAnaliseSort('invoiceNum')} className="cursor-pointer py-3 hover:text-indigo-600">Nº Fatura</th>
                                <th onClick={() => handleAnaliseSort('workflowType')} className="cursor-pointer py-3 hover:text-indigo-600">Workflow</th>
                                <th onClick={() => handleAnaliseSort('etapaAtual')} className="cursor-pointer py-3 hover:text-indigo-600">Etapa Atual</th>
                                <th className="text-center py-3">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center py-12 text-slate-400 italic">Nenhuma Guia de Remessa das séries V ou G encontrada.</td>
                                </tr>
                            ) : paginatedData.map(row => {
                                const utilizadorFat = getDocFieldValue(row.doc, 'UTILIZADOR_FATURACAO') || getDocFieldValue(row.doc, 'Utilizador Faturação') || '';
                                return (
                                    <tr key={row.id} className="hover:bg-slate-50/50">
                                        <td className="font-bold text-slate-800 text-[10px]">{row.docNum}</td>
                                        <td className="text-xs font-semibold text-slate-500">{row.serie || '-'}</td>
                                        <td className="text-xs text-slate-600 truncate max-w-[150px] font-medium" title={row.cliente}>{row.cliente || '-'}</td>
                                        <td className="text-xs text-slate-500 font-semibold">{row.projecto || '-'}</td>
                                        <td className="text-xs">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.isAssinada ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                                                {row.isAssinada ? 'Sim' : 'Não'}
                                            </span>
                                        </td>
                                        <td className="text-xs text-slate-500 font-medium">{row.entregaType || '-'}</td>
                                        <td className="text-xs">
                                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                row.billingDecision === 'Faturada' ? 'bg-indigo-50 text-indigo-700' :
                                                row.billingDecision === 'Não faturada' ? 'bg-rose-50 text-rose-700' :
                                                row.billingDecision === 'Inconsistente' ? 'bg-red-50 text-red-700' :
                                                'bg-slate-50 text-slate-700'
                                            }`}>
                                                {row.billingDecision}
                                            </span>
                                        </td>
                                        <td className="text-[11px] font-semibold text-indigo-600 font-mono">{row.invoiceNum || '—'}</td>
                                        <td className="text-[11px] font-semibold text-slate-600">{row.workflowType}</td>
                                        <td className="text-xs text-slate-500 font-medium" title={utilizadorFat ? `Responsável Faturação: ${utilizadorFat}` : ''}>
                                            <span className="flex flex-col">
                                                <span>{row.etapaAtual || '-'}</span>
                                                {utilizadorFat && <span className="text-[9px] text-slate-400 font-mono truncate max-w-[100px]">{utilizadorFat.split('@')[0]}</span>}
                                            </span>
                                        </td>
                                        <td className="text-center">
                                            <div className="flex justify-center gap-1.5">
                                                <a href={row.docLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Ver Documento"><FaExternalLinkAlt /></a>
                                                <button onClick={() => handleSelectDocument(row.doc, 'timeline')} className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Histórico"><FaHistory /></button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <span className="text-xs text-slate-500 font-medium">Mostrando {startIdx + 1} a {Math.min(startIdx + analisePageSize, totalVg)} de {totalVg} GRs</span>
                            <div className="btn-group gap-1">
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === 1} onClick={() => setAnalisePage(prev => prev - 1)}>Anterior</button>
                                <span className="btn btn-xs btn-active rounded-lg font-mono">{analisePage} / {totalPages}</span>
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === totalPages} onClick={() => setAnalisePage(prev => prev + 1)}>Próxima</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const renderSequenciaGRs = () => {
        // Limit to selected Serie and Period
        const activeSerie = analiseFilters.serie === 'all' || (analiseFilters.serie !== 'V' && analiseFilters.serie !== 'G') ? 'G' : analiseFilters.serie;
        const activePeriod = analiseFilters.period === 'all' ? (uniquePeriodsList[0] || '') : analiseFilters.period;

        // Filter documents matching selected Serie and Month/Year
        const matchingDocs = analyticalRows.filter(row => {
            if (!row.parsedNum || row.parsedNum.serie !== activeSerie) return false;
            if (row.dataGR) {
                const pts = row.dataGR.split('/');
                if (pts.length === 3) {
                    const docPeriod = `${pts[2]}-${pts[1]}`;
                    if (docPeriod !== activePeriod) return false;
                } else {
                    return false;
                }
            } else {
                return false;
            }
            return true;
        });

        // Find min and max numbers
        const numbers = matchingDocs.map(row => row.parsedNum.numero);
        const minNum = numbers.length > 0 ? Math.min(...numbers) : 0;
        const maxNum = numbers.length > 0 ? Math.max(...numbers) : 0;

        // Build sequence rows
        const sequenceRows = [];
        let gapCount = 0;
        let duplicateCount = 0;
        let foundCount = 0;

        if (minNum > 0 && maxNum > 0) {
            for (let i = minNum; i <= maxNum; i++) {
                const matches = matchingDocs.filter(r => r.parsedNum.numero === i);
                const gapKey = `${activeSerie}_${activePeriod}_${i}`;
                const savedClassification = gapClassifications[gapKey] || 'não localizada';

                if (matches.length === 0) {
                    gapCount++;
                    sequenceRows.push({
                        id: `gap_${i}`,
                        serie: activeSerie,
                        ano: activePeriod.split('-')[0],
                        numeroEsperado: i,
                        numeroCompleto: `GR.${activePeriod.split('-')[0]}${activeSerie}/${i}`,
                        encontrada: 'Não',
                        assinada: '—',
                        faturada: '—',
                        invoiceNum: '—',
                        situacao: 'Lacuna',
                        observacao: savedClassification,
                        gapKey
                    });
                } else {
                    foundCount++;
                    if (matches.length > 1) {
                        duplicateCount += (matches.length - 1);
                    }
                    matches.forEach((match, index) => {
                        sequenceRows.push({
                            id: `${match.id}_${index}`,
                            serie: activeSerie,
                            ano: activePeriod.split('-')[0],
                            numeroEsperado: i,
                            numeroCompleto: match.docNum,
                            encontrada: 'Sim',
                            assinada: match.isAssinada ? 'Sim' : 'Não',
                            faturada: match.billingDecision === 'Faturada' ? 'Sim' : 'Não',
                            invoiceNum: match.invoiceNum || '—',
                            situacao: matches.length > 1 ? 'Duplicada' : (match.isAssinada ? 'Assinada' : 'Não assinada'),
                            observacao: matches.length > 1 ? 'Número duplicado no DocuWare' : 'Localizada OK',
                            docLink: match.docLink,
                            doc: match.doc
                        });
                    });
                }
            }
        }

        // Apply search filter to sequence rows if set
        const searchedSequenceRows = sequenceRows.filter(row => {
            if (analiseFilters.docNum && !String(row.numeroEsperado).includes(analiseFilters.docNum) && !row.numeroCompleto.toLowerCase().includes(analiseFilters.docNum.toLowerCase())) return false;
            return true;
        });

        // Paginate
        const total = searchedSequenceRows.length;
        const totalPages = Math.ceil(total / analisePageSize) || 1;
        const startIdx = (analisePage - 1) * analisePageSize;
        const paginatedData = searchedSequenceRows.slice(startIdx, startIdx + analisePageSize);

        return (
            <div className="space-y-6">
                {/* KPIs Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Primeira GR</div>
                        <div className="text-xl font-black text-slate-800 mt-1 font-mono">{minNum > 0 ? `${activeSerie}-${minNum}` : '—'}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Última GR</div>
                        <div className="text-xl font-black text-slate-800 mt-1 font-mono">{maxNum > 0 ? `${activeSerie}-${maxNum}` : '—'}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Esperadas na Sequência</div>
                        <div className="text-2xl font-black text-indigo-600 mt-1 font-mono">{minNum > 0 && maxNum > 0 ? (maxNum - minNum + 1) : 0}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Localizadas</div>
                        <div className="text-2xl font-black text-emerald-600 mt-1 font-mono">{foundCount}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Lacunas na Sequência</div>
                        <div className="text-2xl font-black text-red-600 mt-1 font-mono">{gapCount}</div>
                    </div>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Duplicidades</div>
                        <div className="text-2xl font-black text-amber-600 mt-1 font-mono">{duplicateCount}</div>
                    </div>
                </div>

                {/* Filters */}
                <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex flex-wrap gap-4 items-center">
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={analiseFilters.serie === 'all' || (analiseFilters.serie !== 'V' && analiseFilters.serie !== 'G') ? 'G' : analiseFilters.serie} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, serie: e.target.value })); setAnalisePage(1); }}
                    >
                        <option value="G">Série G</option>
                        <option value="V">Série V</option>
                    </select>
                    <select 
                        className="select select-bordered select-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg"
                        value={activePeriod} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, period: e.target.value })); setAnalisePage(1); }}
                    >
                        {uniquePeriodsList.length === 0 ? (
                            <option value="all">Nenhum período encontrado</option>
                        ) : uniquePeriodsList.map(p => (
                            <option key={p} value={p}>{p.split('-')[1]}/{p.split('-')[0]}</option>
                        ))}
                    </select>
                    <input 
                        type="text" 
                        placeholder="Filtrar número..." 
                        className="input input-bordered input-sm bg-white text-slate-700 text-xs border-slate-300 rounded-lg w-40" 
                        value={analiseFilters.docNum} 
                        onChange={e => { setAnaliseFilters(prev => ({ ...prev, docNum: e.target.value })); setAnalisePage(1); }} 
                    />
                    <button 
                        onClick={() => exportAnaliseTableToCsv(`Sequencia_GRs_${activeSerie}_${activePeriod}`, ['Série', 'Ano/Mês', 'Número Esperado', 'Número completo da GR', 'Encontrado no DocuWare', 'Assinada', 'Faturada', 'Número da fatura', 'Situação', 'Classificação/Observação'], ['serie', 'ano', 'numeroEsperado', 'numeroCompleto', 'encontrada', 'assinada', 'faturada', 'invoiceNum', 'situacao', 'observacao'], sequenceRows)} 
                        className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-2 rounded-lg font-semibold h-9 ml-auto"
                        disabled={sequenceRows.length === 0}
                    >
                        <FaFileCsv /> Exportar CSV
                    </button>
                </div>

                {/* Table */}
                <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                    <table className="table table-compact w-full">
                        <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase font-semibold">
                                <th className="py-3">Série</th>
                                <th className="py-3">Período</th>
                                <th className="py-3">Número esperado</th>
                                <th className="py-3">Número completo</th>
                                <th className="py-3">Encontrado</th>
                                <th className="py-3">Assinada</th>
                                <th className="py-3">Faturada</th>
                                <th className="py-3">Número da fatura</th>
                                <th className="py-3">Situação</th>
                                <th className="py-3">Classificação do Utilizador</th>
                                <th className="text-center py-3">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {paginatedData.length === 0 ? (
                                <tr>
                                    <td colSpan="11" className="text-center py-12 text-slate-400 italic">Preencha os filtros para calcular a sequência.</td>
                                </tr>
                            ) : paginatedData.map(row => (
                                <tr key={row.id} className={`hover:bg-slate-50/50 ${row.situacao === 'Lacuna' ? 'bg-red-50/10 hover:bg-red-50/20' : ''}`}>
                                    <td className="text-xs font-semibold text-slate-500">{row.serie}</td>
                                    <td className="text-xs text-slate-500 font-mono">{activePeriod.split('-')[1]}/{activePeriod.split('-')[0]}</td>
                                    <td className="text-xs font-bold text-slate-700 font-mono">{row.numeroEsperado}</td>
                                    <td className="text-xs font-bold text-slate-800">{row.numeroCompleto}</td>
                                    <td className="text-xs">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${row.encontrada === 'Sim' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'}`}>
                                            {row.encontrada}
                                        </span>
                                    </td>
                                    <td className="text-xs text-slate-500">{row.assinada}</td>
                                    <td className="text-xs text-slate-500">{row.faturada}</td>
                                    <td className="text-[11px] font-semibold text-indigo-600 font-mono">{row.invoiceNum}</td>
                                    <td className="text-xs">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                            row.situacao === 'Lacuna' ? 'bg-red-100 text-red-700' :
                                            row.situacao === 'Duplicada' ? 'bg-amber-100 text-amber-700' :
                                            'bg-emerald-100 text-emerald-700'
                                        }`}>
                                            {row.situacao}
                                        </span>
                                    </td>
                                    <td className="py-2">
                                        {row.situacao === 'Lacuna' ? (
                                            <select 
                                                className="select select-bordered select-xs text-[11px] font-semibold bg-white border-slate-300 text-slate-700 rounded-md"
                                                value={row.observacao}
                                                onChange={e => handleSetGapClassification(row.gapKey, e.target.value)}
                                            >
                                                <option value="não localizada">não localizada</option>
                                                <option value="cancelada no Primavera">cancelada no Primavera</option>
                                                <option value="anulada">anulada</option>
                                                <option value="não emitida">não emitida</option>
                                                <option value="pendente de armazenamento">pendente de armazenamento</option>
                                                <option value="regularizada">regularizada</option>
                                            </select>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">{row.observacao}</span>
                                        )}
                                    </td>
                                    <td className="text-center">
                                        {row.encontrada === 'Sim' ? (
                                            <div className="flex justify-center gap-1.5">
                                                <a href={row.docLink} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Ver Documento"><FaExternalLinkAlt /></a>
                                                <button onClick={() => handleSelectDocument(row.doc, 'timeline')} className="btn btn-ghost btn-xs text-indigo-600 hover:bg-indigo-50" title="Histórico"><FaHistory /></button>
                                            </div>
                                        ) : '—'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                            <span className="text-xs text-slate-500 font-medium">Mostrando {startIdx + 1} a {Math.min(startIdx + analisePageSize, total)} de {total} itens da sequência</span>
                            <div className="btn-group gap-1">
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === 1} onClick={() => setAnalisePage(prev => prev - 1)}>Anterior</button>
                                <span className="btn btn-xs btn-active rounded-lg font-mono">{analisePage} / {totalPages}</span>
                                <button className="btn btn-xs rounded-lg" disabled={analisePage === totalPages} onClick={() => setAnalisePage(prev => prev + 1)}>Próxima</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    const currentInstance = (historyInstances && historyInstances.length > 0) 
        ? historyInstances[activeTab] 
        : null;

    return (
        <div className="p-6 w-full mx-auto space-y-6">
            {error && (
                <div className="alert alert-error shadow-lg animate-fade-in-down">
                    <div>
                        <FaTimesCircle />
                        <span>{error}</span>
                    </div>
                </div>
            )}

            {/* Sub-tabs bar rendered only in Analise mode */}
            {viewMode === 'analise' && (
                <div className="flex justify-start">
                    <div className="bg-slate-200/60 p-1 rounded-full border border-slate-200 flex flex-wrap gap-1 shadow-sm select-none">
                        <button 
                            onClick={() => setAnaliseTab('controle')}
                            className={`px-5 py-2 text-xs font-bold rounded-full transition-all duration-150 flex items-center gap-1.5 ${
                                analiseTab === 'controle' 
                                    ? 'bg-[#4f46e5] text-white shadow-md' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                            }`}
                        >
                            <FaList className="text-[10px]" />
                            <span>Controle de GRs</span>
                        </button>
                        <button 
                            onClick={() => setAnaliseTab('armazem')}
                            className={`px-5 py-2 text-xs font-bold rounded-full transition-all duration-150 flex items-center gap-1.5 ${
                                analiseTab === 'armazem' 
                                    ? 'bg-[#4f46e5] text-white shadow-md' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                            }`}
                        >
                            <FaBoxes className="text-[10px]" />
                            <span>Armazém e Entregas</span>
                        </button>
                        <button 
                            onClick={() => setAnaliseTab('faturacao')}
                            className={`px-5 py-2 text-xs font-bold rounded-full transition-all duration-150 flex items-center gap-1.5 ${
                                analiseTab === 'faturacao' 
                                    ? 'bg-[#4f46e5] text-white shadow-md' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                            }`}
                        >
                            <FaBoxes className="text-[10px]" />
                            <span>Faturação</span>
                        </button>
                        <button 
                            onClick={() => setAnaliseTab('sequencia')}
                            className={`px-5 py-2 text-xs font-bold rounded-full transition-all duration-150 flex items-center gap-1.5 ${
                                analiseTab === 'sequencia' 
                                    ? 'bg-[#4f46e5] text-white shadow-md' 
                                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                            }`}
                        >
                            <FaBoxes className="text-[10px]" />
                            <span>Sequência de GRs</span>
                        </button>
                    </div>
                </div>
            )}

            {/* Filtros Globais de Análise Card */}
            <div className="card bg-white border border-slate-200 border-l-[6px] border-l-[#4f46e5] shadow-[0_8px_30px_rgb(0,0,0,0.02)] rounded-2xl">
                <div className="card-body p-5">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                        <div className="flex items-center gap-2 text-slate-800 font-bold text-sm">
                            <FaFilter className="text-slate-500 text-xs" />
                            <span>Filtros Globais de Análise</span>
                        </div>
                    </div>
                    <form onSubmit={handleSearchDocuments} className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                        {/* Date Range Inputs Row */}
                        <div className="flex flex-wrap items-center gap-6">
                            {/* Data Inicial */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Inicial</span>
                                <input
                                    type="date"
                                    className="input input-bordered input-sm text-xs border-slate-300 bg-white text-slate-700 rounded-lg focus:ring-1 focus:ring-[#4f46e5] focus:border-transparent px-3 py-1.5 w-[160px]"
                                    value={dateRange[0] || ''}
                                    onChange={(e) => setDateRange([e.target.value, dateRange[1] || ''])}
                                />
                            </div>

                            {/* Data Final */}
                            <div className="flex flex-col gap-1.5">
                                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data Final</span>
                                <input
                                    type="date"
                                    className="input input-bordered input-sm text-xs border-slate-300 bg-white text-slate-700 rounded-lg focus:ring-1 focus:ring-[#4f46e5] focus:border-transparent px-3 py-1.5 w-[160px]"
                                    value={dateRange[1] || ''}
                                    onChange={(e) => setDateRange([dateRange[0] || '', e.target.value])}
                                />
                            </div>
                        </div>

                        {/* Right Column: Search Button */}
                        <div className="flex items-center self-end">
                            <button
                                type="submit"
                                className={`btn btn-sm bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 text-xs font-semibold px-4 gap-1.5 shadow-sm rounded-lg h-9 flex items-center justify-center ${searchLoading ? 'loading' : ''}`}
                                disabled={searchLoading}
                            >
                                {!searchLoading && <FaSyncAlt className="text-xs text-slate-400" />}
                                <span>Pesquisar</span>
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            {searched && viewMode === 'operacional' && (
                <div className="space-y-6">
                    {/* Dashboard Superior (6 KPI Cards) */}
                    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        {/* 1. Total Documentos */}
                        <div 
                            onClick={() => setQuickFilter('all')}
                            className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4 cursor-pointer transition-all duration-200 select-none hover:shadow-md hover:border-slate-300 ${
                                quickFilter === 'all' 
                                    ? 'ring-2 ring-indigo-500/20 border-indigo-500 bg-indigo-50/10' 
                                    : 'border-slate-200'
                            }`}
                        >
                            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                                <FaList className="text-xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Total Docs</div>
                                <div className="text-2xl font-black text-slate-800 mt-0.5 font-mono">{documents.length}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">Encontrados no lote</div>
                            </div>
                        </div>

                        {/* 2. Concluídos */}
                        <div 
                            onClick={() => setQuickFilter('completed')}
                            className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4 cursor-pointer transition-all duration-200 select-none hover:shadow-md hover:border-slate-300 ${
                                quickFilter === 'completed' 
                                    ? 'ring-2 ring-emerald-500/20 border-emerald-500 bg-emerald-50/10' 
                                    : 'border-slate-200'
                            }`}
                        >
                            <div className="p-3 bg-emerald-50 text-emerald-600 rounded-lg shrink-0">
                                <FaCheckCircle className="text-xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Concluídos</div>
                                <div className="text-2xl font-black text-emerald-600 mt-0.5 font-mono">{kpis.completed}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">
                                    {documents.length > 0 ? Math.round((kpis.completed / documents.length) * 100) : 0}% do total
                                </div>
                            </div>
                        </div>

                        {/* 3. Em Andamento */}
                        <div 
                            onClick={() => setQuickFilter('active')}
                            className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4 cursor-pointer transition-all duration-200 select-none hover:shadow-md hover:border-slate-300 ${
                                quickFilter === 'active' 
                                    ? 'ring-2 ring-amber-500/20 border-amber-500 bg-amber-50/10' 
                                    : 'border-slate-200'
                            }`}
                        >
                            <div className="p-3 bg-amber-50 text-amber-600 rounded-lg shrink-0">
                                <FaClock className="text-xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Em Andamento</div>
                                <div className="text-2xl font-black text-amber-600 mt-0.5 font-mono">{kpis.active}</div>
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">Ativos na fila</div>
                            </div>
                        </div>

                        {/* 4. Reprovados / Cancelados */}
                        <div
                            onClick={() => setQuickFilter('rejected')}
                            className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4 cursor-pointer transition-all duration-200 select-none hover:shadow-md hover:border-slate-300 ${
                                quickFilter === 'rejected'
                                    ? 'ring-2 ring-red-500/20 border-red-500 bg-red-50/10'
                                    : 'border-slate-200'
                            }`}
                        >
                            <div className="p-3 bg-red-50 text-red-600 rounded-lg shrink-0">
                                <FaTimesCircle className="text-xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Reprov./Cancelados</div>
                                <div className="text-2xl font-black text-red-600 mt-0.5 font-mono">{kpis.rejected}</div>
                                <div className="text-[10px] text-red-400 mt-0.5 font-semibold truncate">
                                    {documents.length > 0 ? Math.round((kpis.rejected / documents.length) * 100) : 0}% do total
                                </div>
                            </div>
                        </div>

                        {/* 5. Atrasados */}
                        <div 
                            onClick={() => setQuickFilter('delayed')}
                            className={`bg-white border rounded-xl p-4 shadow-sm flex items-center gap-4 cursor-pointer transition-all duration-200 select-none hover:shadow-md hover:border-slate-300 ${
                                quickFilter === 'delayed' 
                                    ? 'ring-2 ring-rose-500/20 border-rose-500 bg-rose-50/10' 
                                    : 'border-slate-200'
                            }`}
                        >
                            <div className="p-3 bg-rose-50 text-rose-600 rounded-lg shrink-0">
                                <FaBan className="text-xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">Atrasados</div>
                                <div className="text-2xl font-black text-rose-600 mt-0.5 font-mono">{kpis.delayed}</div>
                                <div className="text-[10px] text-rose-500 mt-0.5 font-semibold truncate">Parados &gt;24h</div>
                            </div>
                        </div>

                        {/* 5. Tempo Médio de Conclusão */}
                        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-4 select-none">
                            <div className="p-3 bg-purple-50 text-purple-600 rounded-lg shrink-0">
                                <FaCalendarAlt className="text-xl" />
                            </div>
                            <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider truncate">T. Médio Ciclo</div>
                                <div className="text-base font-extrabold text-purple-600 mt-1 truncate" title={kpis.avgCompletionTimeText}>
                                    {kpis.avgCompletionTimeText}
                                </div>
                                <div className="text-[10px] text-slate-400 mt-0.5 truncate">Média docs finalizados</div>
                            </div>
                        </div>
                    </div>

                    {/* Main Workspace: Table + Pipeline Side-by-Side */}
                    <div className="flex flex-col lg:flex-row gap-6">
                        {/* Left Column (82% width): Table and Filters */}
                        <div className="w-full lg:w-[82%] flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            {/* Toolbar: Filters */}
                            <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-wrap gap-4 items-center justify-between">
                                
                                {/* Left Side: Export Button */}
                                <div>
                                    <button
                                        type="button"
                                        onClick={handleExportDocumentsList}
                                        className="btn btn-sm bg-emerald-600 hover:bg-emerald-700 text-white border-0 gap-2 font-semibold shadow-sm rounded-lg h-9 disabled:bg-slate-100 disabled:text-slate-400"
                                        disabled={filteredAndSortedDocuments.length === 0}
                                        title="Exportar lista de documentos para CSV"
                                    >
                                        <FaFileCsv className="text-sm" />
                                        <span>Exportar Lista</span>
                                    </button>
                                </div>

                                {/* Right Side: Dropdown Filters */}
                                <div className="flex gap-2">
                                    {/* Step Dropdown */}
                                    <div className="flex items-center gap-1.5">
                                        <FaFilter className="text-[10px] text-slate-400" />
                                        <select
                                            className="select select-sm select-bordered text-xs font-semibold bg-white border-slate-300 text-slate-700"
                                            value={filterStep}
                                            onChange={(e) => setFilterStep(e.target.value)}
                                        >
                                            <option value="all">Todas as Etapas</option>
                                            {uniqueSteps.map(step => (
                                                <option key={step} value={step}>{step}</option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Responsible Dropdown */}
                                    <div className="flex items-center gap-1.5">
                                        <FaUser className="text-[10px] text-slate-400" />
                                        <select
                                            className="select select-sm select-bordered text-xs font-semibold bg-white border-slate-300 text-slate-700"
                                            value={filterResponsible}
                                            onChange={(e) => setFilterResponsible(e.target.value)}
                                        >
                                            <option value="all">Todos os Responsáveis</option>
                                            {uniqueResponsibles.map(user => (
                                                <option key={user} value={user}>{user}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* Table Area */}
                            <div className="flex-1 overflow-x-auto">
                                {searchLoading ? (
                                    <div className="flex flex-col justify-center items-center py-24 gap-2">
                                        <span className="loading loading-spinner loading-lg text-primary"></span>
                                        <span className="text-xs text-slate-500 font-medium animate-pulse">Carregando documentos...</span>
                                    </div>
                                ) : filteredAndSortedDocuments.length === 0 ? (
                                    <div className="text-center py-24 text-slate-400">
                                        <FaBan className="text-4xl opacity-20 mx-auto mb-3" />
                                        <span className="italic text-xs block">Nenhum documento encontrado para os filtros selecionados.</span>
                                    </div>
                                ) : (
                                    <table className="table table-compact w-full border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[9px] uppercase tracking-wider font-semibold">
                                                <th className="py-3 px-2 text-left select-none transition-colors">
                                                     <div className="flex items-center gap-1 justify-between">
                                                         <span className="cursor-pointer hover:text-indigo-600 flex-grow" onClick={() => handleSort('docNum')}>
                                                             Documento {sortField === 'docNum' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                         </span>
                                                         <ColumnFilter
                                                             column={{ name: 'docNum', label: 'Documento' }}
                                                             uniqueValues={getUniqueColumnValues('docNum')}
                                                             selectedValues={columnFilters['docNum'] || []}
                                                             onToggleValue={toggleFilterValue}
                                                             onClear={clearColumnFilter}
                                                         />
                                                     </div>
                                                 </th>
                                                <th className="py-3 px-2 text-left cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => handleSort('entryDate')}>
                                                    Início {sortField === 'entryDate' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                </th>
                                                <th className="py-3 px-2 text-left cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => handleSort('percent')}>
                                                    Progresso {sortField === 'percent' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                </th>
                                                <th className="py-3 px-2 text-left select-none transition-colors">
                                                     <div className="flex items-center gap-1 justify-between">
                                                         <span className="cursor-pointer hover:text-indigo-600 flex-grow" onClick={() => handleSort('requerente')}>
                                                             Requerente {sortField === 'requerente' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                         </span>
                                                         <ColumnFilter
                                                             column={{ name: 'requerente', label: 'Requerente' }}
                                                             uniqueValues={getUniqueColumnValues('requerente')}
                                                             selectedValues={columnFilters['requerente'] || []}
                                                             onToggleValue={toggleFilterValue}
                                                             onClear={clearColumnFilter}
                                                         />
                                                     </div>
                                                 </th>
                                                 <th className="py-3 px-2 text-left select-none transition-colors">
                                                     <div className="flex items-center gap-1 justify-between">
                                                         <span className="cursor-pointer hover:text-indigo-600 flex-grow" onClick={() => handleSort('activeTaskName')}>
                                                             Etapa Atual {sortField === 'activeTaskName' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                         </span>
                                                         <ColumnFilter
                                                             column={{ name: 'activeTaskName', label: 'Etapa Atual' }}
                                                             uniqueValues={getUniqueColumnValues('activeTaskName')}
                                                             selectedValues={columnFilters['activeTaskName'] || []}
                                                             onToggleValue={toggleFilterValue}
                                                             onClear={clearColumnFilter}
                                                         />
                                                     </div>
                                                 </th>
                                                 <th className="py-3 px-2 text-left select-none transition-colors">
                                                     <div className="flex items-center gap-1 justify-between">
                                                         <span className="cursor-pointer hover:text-indigo-600 flex-grow" onClick={() => handleSort('responsible')}>
                                                             Responsável {sortField === 'responsible' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                         </span>
                                                         <ColumnFilter
                                                             column={{ name: 'responsible', label: 'Responsável' }}
                                                             uniqueValues={getUniqueColumnValues('responsible')}
                                                             selectedValues={columnFilters['responsible'] || []}
                                                             onToggleValue={toggleFilterValue}
                                                             onClear={clearColumnFilter}
                                                         />
                                                     </div>
                                                 </th>
                                                 <th className="py-3 px-2 text-left cursor-pointer hover:bg-slate-100 select-none transition-colors" onClick={() => handleSort('timeStoppedMs')}>
                                                     Tempo Parado {sortField === 'timeStoppedMs' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                 </th>
                                                 <th className="py-3 px-2 text-left select-none transition-colors">
                                                     <div className="flex items-center gap-1 justify-between">
                                                         <span className="cursor-pointer hover:text-indigo-600 flex-grow" onClick={() => handleSort('prioridade')}>
                                                             Prioridade {sortField === 'prioridade' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                         </span>
                                                         <ColumnFilter
                                                             column={{ name: 'prioridade', label: 'Prioridade' }}
                                                             uniqueValues={getUniqueColumnValues('prioridade')}
                                                             selectedValues={columnFilters['prioridade'] || []}
                                                             onToggleValue={toggleFilterValue}
                                                             onClear={clearColumnFilter}
                                                         />
                                                     </div>
                                                 </th>
                                                 <th className="py-3 px-2 text-left select-none transition-colors">
                                                     <div className="flex items-center gap-1 justify-between">
                                                         <span className="cursor-pointer hover:text-indigo-600 flex-grow" onClick={() => handleSort('formaPagamento')}>
                                                              Forma Pagamento {sortField === 'formaPagamento' ? (sortDirection === 'asc' ? '↑' : '↓') : '↕'}
                                                         </span>
                                                         <ColumnFilter
                                                             column={{ name: 'formaPagamento', label: 'Forma Pagamento' }}
                                                             uniqueValues={getUniqueColumnValues('formaPagamento')}
                                                             selectedValues={columnFilters['formaPagamento'] || []}
                                                             onToggleValue={toggleFilterValue}
                                                             onClear={clearColumnFilter}
                                                         />
                                                     </div>
                                                 </th>
                                                                                                 <th className="py-3 px-2 text-left">
                                                    Comentários
                                                </th>
                                                <th className="py-3 px-1 text-center w-[38px]" title="Histórico">
                                                    <FaHistory className="mx-auto text-slate-400" />
                                                </th>
                                                <th className="py-3 px-1 text-center w-[38px]" title="Ver Documento">
                                                    <FaFileAlt className="mx-auto text-slate-400" />
                                                </th>
                                                <th className="py-3 px-1 text-center w-[38px]" title="Visualizar Diagrama">
                                                    <FaProjectDiagram className="mx-auto text-slate-400" />
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredAndSortedDocuments.map((doc) => {
                                                const isSelected = selectedDoc && selectedDoc.Id === doc.Id;
                                                const prog = documentProgress[doc.Id];
                                                const isProgLoading = !prog;

                                                const docNum = getDocumentNumber(doc) || 'Sem Nº';
                                                const isDelayed = prog && !prog.isFinished && (prog.timeStoppedMs > 24 * 60 * 60 * 1000);

                                                return (
                                                    <tr 
                                                        key={doc.Id}
                                                        onClick={() => handleSelectDocument(doc)}
                                                        className={`hover:bg-slate-50/80 cursor-pointer transition-colors ${
                                                            isSelected ? 'bg-indigo-50/40 hover:bg-indigo-50/60 font-semibold' : ''
                                                        }`}
                                                    >
                                                        {/* Document Info */}
                                                        <td className="py-3 px-2">
                                                            <div className="font-bold text-slate-800 text-[10px] truncate max-w-[180px]">{docNum}</div>
                                                            <div className="text-[9px] font-mono text-slate-400">ID: {doc.Id}</div>
                                                        </td>

                                                        {/* Entry Date */}
                                                        <td className="py-3 px-2 font-mono text-[11px] text-slate-500">
                                                            {isProgLoading ? (
                                                                <span className="inline-block w-16 h-3 bg-slate-100 animate-pulse rounded"></span>
                                                            ) : prog.entryDate ? (
                                                                formatDate(prog.entryDate, true)
                                                            ) : '-'}
                                                        </td>

                                                        {/* Progress */}
                                                        <td className="py-3 px-2">
                                                            {isProgLoading ? (
                                                                <div className="h-1.5 w-20 bg-slate-100 rounded-full animate-pulse"></div>
                                                            ) : (
                                                                <div className="w-20">
                                                                    <div className="flex justify-between items-center text-[10px] mb-0.5">
                                                                        <span className={`font-semibold ${prog.isFinished ? 'text-emerald-600' : 'text-indigo-600'}`}>
                                                                            {prog.isFinished ? 'Concluído' : 'Ativo'}
                                                                        </span>
                                                                        <span className="font-mono text-slate-500">{prog.percent}%</span>
                                                                    </div>
                                                                    <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                                                        <div 
                                                                            className={`h-full rounded-full transition-all duration-300 ${prog.isFinished ? 'bg-emerald-500' : 'bg-indigo-500'}`}
                                                                            style={{ width: `${prog.percent}%` }}
                                                                        ></div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Requerente */}
                                                        <td className="py-3 px-2">
                                                            <div className="font-medium text-slate-700 text-xs truncate max-w-[100px]" title={getDocFieldValue(doc, 'REQUERENTE') || '-'}>
                                                                {getDocFieldValue(doc, 'REQUERENTE') ? getDocFieldValue(doc, 'REQUERENTE').split('@')[0] : '-'}
                                                            </div>
                                                        </td>

                                                        {/* Active Task */}
                                                        <td className="py-3 px-2">
                                                            {isProgLoading ? (
                                                                <span className="inline-block w-20 h-3 bg-slate-100 animate-pulse rounded"></span>
                                                            ) : (
                                                                <div className="font-medium text-slate-700 text-xs truncate max-w-[95px]" title={prog.activeTaskName || '-'}>
                                                                    {prog.activeTaskName || '-'}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Responsible */}
                                                        <td className="py-3 px-2">
                                                            {isProgLoading ? (
                                                                <span className="inline-block w-16 h-3 bg-slate-100 animate-pulse rounded"></span>
                                                            ) : (
                                                                <div className="text-slate-600 text-xs truncate max-w-[80px]" title={prog.responsible || '-'}>
                                                                    {prog.responsible && prog.responsible !== '-' ? (
                                                                        <span className="flex items-center gap-1">
                                                                            <FaUser className="text-[9px] text-slate-400 shrink-0" />
                                                                            <span className="truncate">{prog.responsible}</span>
                                                                        </span>
                                                                    ) : '-'}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Time Stopped */}
                                                        <td className="py-3 px-2">
                                                            {isProgLoading ? (
                                                                <span className="inline-block w-12 h-3 bg-slate-100 animate-pulse rounded"></span>
                                                            ) : !prog.isFinished && prog.timeStoppedMs > 0 ? (
                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                                    isDelayed 
                                                                        ? 'bg-rose-50 text-rose-600 border border-rose-100 animate-pulse' 
                                                                        : 'bg-slate-100 text-slate-600'
                                                                }`}>
                                                                    <FaClock className="text-[9px]" />
                                                                    {WorkflowHistoryAnalyzer.formatDuration(prog.timeStoppedMs)}
                                                                </span>
                                                            ) : '-'}
                                                        </td>

                                                        {/* Prioridade */}
                                                        <td className="py-3 px-2">
                                                            {isProgLoading ? (
                                                                <span className="inline-block w-12 h-3 bg-slate-100 animate-pulse rounded"></span>
                                                            ) : (
                                                                <div className="text-slate-600 text-xs truncate max-w-[65px]" title={getDocFieldValue(doc, 'PRIORIDADE') || '-'}>
                                                                    {getDocFieldValue(doc, 'PRIORIDADE') || '-'}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* Forma Pagamento */}
                                                        <td className="py-3 px-2">
                                                            {isProgLoading ? (
                                                                <span className="inline-block w-20 h-3 bg-slate-100 animate-pulse rounded"></span>
                                                            ) : (
                                                                <div className="text-slate-600 text-xs truncate max-w-[90px]" title={getDocFieldValue(doc, 'FORMA_DE_PAGAMENTO') || '-'}>
                                                                    {getDocFieldValue(doc, 'FORMA_DE_PAGAMENTO') || '-'}
                                                                </div>
                                                            )}
                                                        </td>

                                                        
                                                        {/* Comments */}
                                                        <td className="py-3 px-2">
                                                            {isProgLoading ? (
                                                                <span className="inline-block w-16 h-3 bg-slate-100 animate-pulse rounded"></span>
                                                            ) : (
                                                                <div className="text-slate-600 text-xs truncate max-w-[85px]" title={getDocumentComments(doc) || '-'}>
                                                                    {getDocumentComments(doc) || '-'}
                                                                </div>
                                                            )}
                                                        </td>

                                                        {/* History */}
                                                        <td className="py-3 px-0.5 text-center w-[38px]">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectDocument(doc, 'timeline');
                                                                }}
                                                                className="btn btn-xs btn-ghost text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 btn-circle"
                                                                title="Visualizar Histórico"
                                                            >
                                                                <FaHistory className="text-sm" />
                                                            </button>
                                                        </td>

                                                        {/* Link */}
                                                        <td className="py-3 px-0.5 text-center w-[38px]" onClick={(e) => e.stopPropagation()}>
                                                            <a
                                                                href={docuwareService.getDocumentViewUrl(selectedCabinet, doc.Id)}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="btn btn-xs btn-ghost text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 btn-circle"
                                                                title="Ver Documento"
                                                            >
                                                                <FaFileAlt className="text-sm" />
                                                            </a>
                                                        </td>

                                                        {/* Diagram */}
                                                        <td className="py-3 px-0.5 text-center w-[38px]">
                                                            <button
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleSelectDocument(doc, 'timeline', false);
                                                                    setShowDiagramModal(true);
                                                                }}
                                                                className="btn btn-xs btn-ghost text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 btn-circle"
                                                                title="Visualizar Diagrama"
                                                            >
                                                                <FaProjectDiagram className="text-sm" />
                                                            </button>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>

                        {/* Right Column (18% width): Pipeline Visual */}
                        <div className="w-full lg:w-[18%] flex flex-col bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
                            <div className="p-4 bg-slate-50 border-b border-slate-200 shrink-0">
                                <span className="font-bold text-xs uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                                    <FaProjectDiagram /> Trilha do Workflow
                                </span>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 custom-scrollbar space-y-4">
                                {flowPipelineSteps.length === 0 ? (
                                    <div className="text-center py-16 text-slate-400 italic text-xs">
                                        Carregando etapas do fluxo...
                                    </div>
                                ) : (
                                    flowPipelineSteps.map((step, idx) => {
                                        const isCompletedStep = step.id === 'virtual_completed' || step.isEnd;
                                        const isStartStep = step.isStart;
                                        const hasActiveDocs = step.count > 0;
                                        const isLast = idx === flowPipelineSteps.length - 1;
                                        const isSelected = isCompletedStep 
                                            ? (quickFilter === 'completed') 
                                            : (isStartStep 
                                                ? (filterStep === 'all' && quickFilter === 'all') 
                                                : (filterStep === step.name));

                                        return (
                                            <div key={step.id} className="flex flex-col items-center">
                                                {/* Step Card */}
                                                <div 
                                                    onClick={() => {
                                                        if (isStartStep) {
                                                            setFilterStep('all');
                                                            setQuickFilter('all');
                                                        } else if (isCompletedStep) {
                                                            setQuickFilter('completed');
                                                            setFilterStep('all');
                                                        } else {
                                                            if (filterStep === step.name) {
                                                                setFilterStep('all');
                                                            } else {
                                                                setFilterStep(step.name);
                                                                setQuickFilter('all');
                                                            }
                                                        }
                                                    }}
                                                    title={
                                                        isStartStep 
                                                            ? "Clique para mostrar todos os documentos" 
                                                            : isCompletedStep 
                                                                ? "Clique para mostrar documentos concluídos" 
                                                                : `Clique para filtrar por ${step.name}`
                                                    }
                                                    className={`w-full p-3 rounded-lg border cursor-pointer hover:shadow-md transition-all duration-150 relative ${
                                                        isSelected
                                                            ? isCompletedStep 
                                                                ? 'bg-emerald-50/60 border-emerald-400 ring-2 ring-emerald-500/20 shadow-md' 
                                                                : isStartStep
                                                                    ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-500/20 shadow-md'
                                                                    : 'bg-indigo-50/30 border-indigo-400 ring-2 ring-indigo-500/20 shadow-md border-l-4 border-l-indigo-600'
                                                            : isCompletedStep 
                                                                ? 'bg-emerald-50/20 border-emerald-200 hover:bg-emerald-50/30 hover:border-emerald-300' 
                                                                : isStartStep
                                                        ? 'bg-blue-50/20 border-blue-200 hover:bg-blue-50/30 hover:border-blue-300'
                                                                    : hasActiveDocs 
                                                                        ? 'bg-indigo-50/10 border-indigo-200 border-l-4 border-l-indigo-500 hover:bg-indigo-50/20 hover:border-indigo-300' 
                                                                        : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                                                    }`}
                                                >
                                                    {/* Step Name Row */}
                                                    <div className="flex items-center gap-2">
                                                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                                                            isCompletedStep 
                                                                ? 'bg-emerald-500 text-white' 
                                                                : isStartStep
                                                                    ? 'bg-blue-500 text-white'
                                                                    : hasActiveDocs 
                                                                        ? 'bg-indigo-600 text-white shadow-sm' 
                                                                        : 'bg-slate-200 text-slate-600'
                                                        }`}>
                                                            {idx + 1}
                                                        </span>
                                                        <span className="font-bold text-slate-800 text-[11px] leading-tight flex-1" title={isStartStep ? "INÍCIO" : step.name}>
                                                            {isStartStep ? "INÍCIO" : step.name}
                                                        </span>
                                                    </div>

                                                    {/* Extra stats: avg wait time & document count */}
                                                    {((!isCompletedStep && hasActiveDocs && step.avgTimeText !== '-') || step.count > 0) && (
                                                        <div className="mt-2 flex items-center justify-between w-full text-[10px] font-bold text-slate-500 gap-1.5">
                                                            {/* Average wait time */}
                                                            <div>
                                                                {!isCompletedStep && hasActiveDocs && step.avgTimeText !== '-' && (
                                                                    <span className="flex items-center gap-1 text-slate-500">
                                                                        <FaClock className="text-[9px] text-slate-400 shrink-0" />
                                                                        <span>Parada: <strong className="text-indigo-600 font-extrabold">{step.avgTimeText}</strong></span>
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {/* Badge count */}
                                                            {step.count > 0 && (
                                                                <span className={`badge badge-xs font-mono font-bold px-1.5 py-0.5 h-auto text-[9px] border leading-none shrink-0 ${
                                                                    isCompletedStep 
                                                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-200' 
                                                                        : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                                                                }`}>
                                                                    {step.count} doc{step.count > 1 ? 's' : ''}
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Down connector arrow */}
                                                {!isLast && (
                                                    <div className="my-1.5 text-slate-300">
                                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-5 h-5">
                                                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                                                        </svg>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Overlay Details Drawer */}
                    {selectedDoc && isDrawerOpen && (
                        <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true">
                            <div className="absolute inset-0 overflow-hidden">
                                {/* Blur Backdrop */}
                                <div 
                                    className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm transition-opacity duration-300"
                                    onClick={() => {
                                        setSelectedDoc(null);
                                        setIsDrawerOpen(false);
                                    }} 
                                />

                                {/* Sliding Panel Container */}
                                <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
                                    <div className="pointer-events-auto w-screen max-w-2xl transform transition-transform duration-300 bg-white shadow-2xl flex flex-col h-full border-l border-slate-200 animate-slide-in">
                                        
                                        {/* Drawer Header */}
                                        <div className="bg-slate-50 p-6 border-b border-slate-200 flex justify-between items-start shrink-0">
                                            <div className="flex flex-col min-w-0 space-y-1.5">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">DOCID</span>
                                                    <span className="bg-indigo-50 border border-indigo-100 text-indigo-700 px-2 py-0.5 rounded font-mono text-xs font-bold shadow-sm">{selectedDoc.Id}</span>
                                                    <button
                                                        type="button"
                                                        className="btn btn-ghost btn-xs btn-circle text-slate-400 hover:text-indigo-600 transition-colors"
                                                        onClick={() => navigator.clipboard.writeText(selectedDoc.Id)}
                                                        title="Copiar ID"
                                                    >
                                                        <FaRegCopy />
                                                    </button>
                                                </div>
                                                <div className="text-xl font-black text-slate-800 tracking-tight">
                                                    Nº Doc: {getDocumentNumber(selectedDoc) || 'Sem Número'}
                                                </div>
                                                {currentInstance && (
                                                    <div className="text-xs font-medium text-slate-500 flex items-center gap-1.5 flex-wrap" title={currentInstance.Name}>
                                                        <span className="text-slate-400 font-semibold">Fluxo:</span>
                                                        <span className="text-indigo-600 font-bold">{currentInstance.Name}</span>
                                                        {currentInstance.Version && (
                                                            <span className="text-[10px] bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full font-medium">
                                                                v{currentInstance.Version}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
 
                                            {/* Header Action Buttons */}
                                            <div className="flex items-center gap-2 mt-1 shrink-0">
                                                <a
                                                    href={docLink}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className={`btn btn-sm btn-outline border-slate-200 hover:bg-slate-50 text-slate-700 gap-1.5 rounded-lg font-semibold shadow-sm h-8 min-h-0 ${docLink === '#' ? 'btn-disabled opacity-50' : ''}`}
                                                >
                                                    <FaExternalLinkAlt className="text-[10px]" /> Ver Doc
                                                </a>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowDiagramModal(true)}
                                                    className="btn btn-sm btn-outline border-slate-200 hover:bg-slate-50 text-slate-700 gap-1.5 rounded-lg font-semibold shadow-sm h-8 min-h-0"
                                                    disabled={historyLoading || !historyInstances}
                                                >
                                                    <FaProjectDiagram className="text-[10px]" /> Diagrama
                                                </button>
                                                <button
                                                     type="button"
                                                     className="btn btn-sm btn-circle btn-ghost text-slate-400 hover:text-slate-600 hover:bg-slate-100 ml-1"
                                                     onClick={() => {
                                                         setSelectedDoc(null);
                                                         setIsDrawerOpen(false);
                                                     }}
                                                >
                                                    ✕
                                                </button>
                                            </div>
                                        </div>

                                        {/* Drawer Tabs Navigation */}
                                        <div className="flex border-b border-slate-200 bg-slate-50/50 px-4 py-2 gap-2 shrink-0">
                                            <button
                                                type="button"
                                                onClick={() => setActiveSubTab('timeline')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                    activeSubTab === 'timeline'
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'text-slate-500 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <FaHistory /> Histórico de Tramitação
                                                </span>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setActiveSubTab('fields')}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                    activeSubTab === 'fields'
                                                        ? 'bg-indigo-600 text-white shadow-sm'
                                                        : 'text-slate-500 hover:bg-slate-100'
                                                }`}
                                            >
                                                <span className="flex items-center gap-1.5">
                                                    <FaList /> Campos
                                                </span>
                                            </button>
                                        </div>

                                        {/* Instances Version Switcher inside Drawer */}
                                        {historyInstances && historyInstances.length > 1 && (
                                            <div className="px-4 py-2 bg-slate-100/50 border-b border-slate-200 flex gap-2 shrink-0 overflow-x-auto">
                                                <span className="text-[10px] font-bold text-slate-400 flex items-center shrink-0">Fluxos Atribuídos:</span>
                                                {historyInstances.map((inst, idx) => (
                                                    <button
                                                        key={inst.Id}
                                                        type="button"
                                                        onClick={() => setActiveTab(idx)}
                                                        className={`px-2.5 py-1 rounded text-[10px] font-bold border transition-all ${
                                                            activeTab === idx
                                                                ? 'bg-white border-indigo-600 text-indigo-600 shadow-sm'
                                                                : 'bg-transparent border-slate-200 text-slate-500 hover:bg-slate-100'
                                                        }`}
                                                    >
                                                        {inst.Name} (v{inst.Version})
                                                    </button>
                                                ))}
                                            </div>
                                        )}

                                        {/* Drawer Body content */}
                                        <div className="flex-1 overflow-y-auto p-6 min-h-0 bg-white">
                                            {historyLoading ? (
                                                <div className="flex flex-col justify-center items-center h-48 gap-2">
                                                    <span className="loading loading-spinner loading-lg text-primary"></span>
                                                    <span className="text-xs text-slate-500 font-medium animate-pulse">Carregando detalhes...</span>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* TAB 1: Chronological Timeline */}
                                                    {activeSubTab === 'timeline' && currentInstance && (
                                                        <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6">
                                                            {(() => {
                                                                const analyzedSteps = WorkflowHistoryAnalyzer.analyze(currentInstance.HistorySteps || []);
                                                                const stepsToRender = filteredSteps(analyzedSteps);
                                                                
                                                                if (stepsToRender.length === 0) {
                                                                    return (
                                                                        <div className="text-center py-8 text-slate-400 italic text-xs">
                                                                            Nenhuma atividade humana ou evento relevante registrado.
                                                                        </div>
                                                                    );
                                                                }

                                                                return stepsToRender.map((step, sIdx) => {
                                                                    const isStart = step.type === 'StartEvent' || step.type === 'Start';
                                                                    const isEnd = step.type === 'EndEvent' || step.type === 'End';
                                                                    const isActive = step.isActive;
                                                                    const hasDecision = !!step.decision;

                                                                    // Get decision badge classes
                                                                    const getDecisionStyle = (dec) => {
                                                                        const d = dec.toLowerCase();
                                                                        if (d.includes('aprov') || d.includes('aceit') || d.includes('ok')) {
                                                                            return 'bg-emerald-50 text-emerald-700 border-emerald-200';
                                                                        }
                                                                        if (d.includes('rejeit') || d.includes('recus') || d.includes('cancel')) {
                                                                            return 'bg-rose-50 text-rose-700 border-rose-200';
                                                                        }
                                                                        return 'bg-slate-50 text-slate-600 border-slate-200';
                                                                    };

                                                                    return (
                                                                        <div key={sIdx} className="relative">
                                                                            {/* Left Timeline Indicator Node */}
                                                                            <span className={`absolute -left-[35px] top-1.5 flex h-6 w-6 items-center justify-center rounded-full ring-8 ring-white ${
                                                                                isStart ? 'bg-blue-500 text-white' :
                                                                                isEnd ? 'bg-emerald-500 text-white' :
                                                                                isActive ? 'bg-amber-500 text-white animate-pulse' :
                                                                                'bg-slate-200 text-slate-500'
                                                                            }`}>
                                                                                {isStart ? '▶' :
                                                                                 isEnd ? '✓' :
                                                                                 isActive ? '⚡' :
                                                                                 '●'}
                                                                            </span>

                                                                            {/* Content Panel */}
                                                                            <div className="bg-slate-50/50 hover:bg-slate-50 p-4 border border-slate-100 rounded-xl transition-colors">
                                                                                {/* Header: Name and Type */}
                                                                                <div className="flex flex-wrap items-center justify-between gap-2">
                                                                                    <span className="font-bold text-slate-800 text-sm">
                                                                                        {step.name}
                                                                                    </span>
                                                                                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                                                                                        isStart ? 'bg-blue-100 text-blue-800' :
                                                                                        isEnd ? 'bg-emerald-100 text-emerald-800' :
                                                                                        isActive ? 'bg-amber-100 text-amber-800' :
                                                                                        'bg-slate-100 text-slate-600'
                                                                                    }`}>
                                                                                        {isStart ? 'Início' :
                                                                                         isEnd ? 'Conclusão' :
                                                                                         isActive ? 'Em Andamento' :
                                                                                         'Tarefa'}
                                                                                    </span>
                                                                                </div>

                                                                                {/* Processor Info */}
                                                                                {step.user && (
                                                                                    <div className="mt-2 flex items-center gap-1.5 text-xs text-slate-600">
                                                                                        <FaUser className="text-[10px] text-slate-400 shrink-0" />
                                                                                        <span>Processador: <strong className="text-slate-700">{step.user}</strong></span>
                                                                                    </div>
                                                                                )}

                                                                                {/* Date details */}
                                                                                <div className="mt-1.5 text-[10px] text-slate-400 font-mono flex flex-wrap gap-x-4 gap-y-1">
                                                                                    {step.startedAt && (
                                                                                        <span>Iniciado em: {formatDate(step.startedAt)}</span>
                                                                                    )}
                                                                                    {step.completedAt && !isActive && (
                                                                                        <span>Concluído em: {formatDate(step.completedAt)}</span>
                                                                                    )}
                                                                                </div>

                                                                                {/* Decision Badge */}
                                                                                {hasDecision && (
                                                                                    <div className="mt-3">
                                                                                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold border ${getDecisionStyle(step.decision)}`}>
                                                                                            Decisão: {step.decision}
                                                                                        </span>
                                                                                    </div>
                                                                                )}

                                                                                {/* Step Duration Badge */}
                                                                                {step.durationText && (
                                                                                    <div className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                                                                        <FaClock className="text-[9px] text-slate-400" />
                                                                                        <span>Duração: <span className="font-bold text-slate-700">{step.durationText}</span></span>
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                });
                                                            })()}
                                                        </div>
                                                    )}

                                                    {/* TAB 2: Metadata Fields */}
                                                    {activeSubTab === 'fields' && (
                                                        <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                                            <table className="table table-compact w-full border-collapse">
                                                                <thead>
                                                                    <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 text-[10px] uppercase tracking-wider font-semibold">
                                                                        <th className="py-2.5 px-4 text-left">Campo</th>
                                                                        <th className="py-2.5 px-4 text-left">Valor</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-slate-100 text-xs">
                                                                    {(() => {
                                                                        const sortedFields = [...documentFields].sort((a, b) => 
                                                                            (a.FieldName || '').localeCompare(b.FieldName || '')
                                                                        );
                                                                        if (sortedFields.length === 0) {
                                                                            return (
                                                                                <tr>
                                                                                    <td colSpan="2" className="text-center py-8 text-slate-400 italic">
                                                                                        Nenhum campo indexado encontrado.
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        }
                                                                        return sortedFields.map((field, idx) => {
                                                                            const val = field.Item || field.Value || '';
                                                                            const isDate = field.ItemElementName === 'Date' || (typeof val === 'string' && val.includes('/Date('));

                                                                            return (
                                                                                <tr key={idx} className="hover:bg-slate-50/50">
                                                                                    <td className="py-2 px-4 font-bold text-slate-600 bg-slate-50/30 w-1/3 truncate" title={field.FieldName}>
                                                                                        {field.FieldName}
                                                                                    </td>
                                                                                    <td className="py-2 px-4 font-mono text-slate-800 break-all">
                                                                                        {isDate ? formatDate(val) : String(val)}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        });
                                                                    })()}
                                                                </tbody>
                                                            </table>
                                                              </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {searched && viewMode === 'analise' && (
                <AnaliseModule
                    analyticalRows={analyticalRows}
                    analiseTab={analiseTab}
                    selectedCabinet={selectedCabinet}
                    orgId={orgId}
                    gapClassifications={gapClassifications}
                    handleSetGapClassification={handleSetGapClassification}
                    handleSelectDocument={handleSelectDocument}
                    getDocFieldValue={getDocFieldValue}
                />
            )}

            {/* Fields Modal */}
            <input type="checkbox" id="fields-modal" className="modal-toggle" checked={showFieldsModal} onChange={() => setShowFieldsModal(!showFieldsModal)} />
            <div className="modal">
                <div className="modal-box w-11/12 max-w-3xl">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                        <FaList /> Campos do Documento {selectedDoc?.Id}
                    </h3>
                    <div className="overflow-x-auto max-h-96">
                        <table className="table table-compact w-full">
                            <thead>
                                <tr>
                                    <th>Campo</th>
                                    <th>Valor</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    const sortedFields = [...documentFields].sort((a, b) => 
                                        (a.FieldName || '').localeCompare(b.FieldName || '')
                                    );
                                    if (sortedFields.length === 0) {
                                        return (
                                            <tr><td colSpan="2" className="text-center py-4 text-slate-400 italic">Nenhum campo encontrado.</td></tr>
                                        );
                                    }
                                    return sortedFields.map((field, idx) => {
                                        const val = field.Item || field.Value || '';
                                        const isDate = field.ItemElementName === 'Date' || (typeof val === 'string' && val.includes('/Date('));

                                        return (
                                            <tr key={idx} className="hover">
                                                <td className="font-semibold text-gray-600">{field.FieldName}</td>
                                                <td className="break-all">
                                                    {isDate ? formatDate(val) : val}
                                                </td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                    <div className="modal-action">
                        <button className="btn" onClick={() => setShowFieldsModal(false)}>Fechar</button>
                    </div>
                </div>
            </div>

            {/* Diagram Modal */}
            <input 
                type="checkbox" 
                id="diagram-modal" 
                className="modal-toggle" 
                checked={showDiagramModal} 
                onChange={() => {
                    if (showDiagramModal) setIsDiagramMaximized(false);
                    setShowDiagramModal(!showDiagramModal);
                }} 
            />
            <div className="modal">
                <div className={`modal-box flex flex-col p-6 bg-slate-50/95 backdrop-blur transition-all duration-300 ${isDiagramMaximized ? 'w-full max-w-full h-full max-h-full rounded-none m-0' : 'w-11/12 max-w-7xl h-[90vh] rounded-2xl'}`}>
                    <div className="flex items-center justify-between mb-4 border-b pb-3 border-slate-200 shrink-0">
                        <div>
                            <h3 className="font-bold text-lg flex items-center gap-2 text-slate-800">
                                <FaProjectDiagram /> Diagrama de Fluxo Ampliado
                            </h3>
                            {currentInstance && (
                                <div className="text-xs font-semibold text-slate-500 mt-1 flex items-center gap-1.5">
                                    <span>Nº Doc: {getDocumentNumber(selectedDoc) || 'Sem Número'}</span>
                                    <span className="text-slate-300">|</span>
                                    <span>Fluxo: <strong className="text-indigo-600 font-extrabold">{currentInstance.Name}</strong></span>
                                    {currentInstance.Version && (
                                        <span className="text-[10px] bg-slate-200/60 text-slate-700 px-1.5 py-0.2 rounded-full border border-slate-300">
                                            v{currentInstance.Version}
                                        </span>
                                    )}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-1">
                            <button 
                                className="btn btn-sm btn-circle btn-ghost text-slate-500" 
                                onClick={() => setIsDiagramMaximized(!isDiagramMaximized)}
                                title={isDiagramMaximized ? "Restaurar tamanho" : "Maximizar"}
                                type="button"
                            >
                                {isDiagramMaximized ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3 3m12 6V4.5M15 9h4.5M15 9l6-6m-6 12v4.5M15 15h4.5M15 15l6 6M9 15v4.5M9 15H4.5M9 15l-6 6" />
                                    </svg>
                                ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className="w-4 h-4">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75v4.5m0-4.5h-4.5m4.5 0L15 9m5.25 11.25v-4.5m0 4.5h-4.5m4.5 0l-6-6" />
                                    </svg>
                                )}
                            </button>
                            <button 
                                className="btn btn-sm btn-circle btn-ghost text-slate-500" 
                                onClick={() => {
                                    setShowDiagramModal(false);
                                    setIsDiagramMaximized(false);
                                }}
                                type="button"
                            >
                                ✕
                            </button>
                        </div>
                    </div>
                    
                    {/* Replicated Graph Definition Info Bar inside Modal */}
                    {!historyLoading && mergedGraph && (
                        <div className="flex items-center justify-between p-3 bg-white border border-slate-200 rounded-xl mb-4 shrink-0 shadow-sm">
                            <div className="flex items-center gap-2">
                                {mergedGraph.isFallback ? (
                                    <>
                                        <FaInfoCircle className="text-amber-500 text-sm" />
                                        <div className="text-xs">
                                            <span className="font-bold text-slate-700">Fluxo Linear Estimado.</span> Envie o arquivo <strong className="font-semibold">.wfd</strong> do workflow para visualizar a estrutura completa original.
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-sm animate-pulse"></span>
                                        <div className="text-xs font-bold text-emerald-800">
                                            Definição de Fluxo Ativa
                                        </div>
                                    </>
                                )}
                            </div>
                            {currentInstance && (
                                <div className="flex gap-2">
                                    {mergedGraph.isFallback ? (
                                        <label className="btn btn-xs btn-outline btn-primary gap-1 py-1 cursor-pointer">
                                            <FaUpload className="text-[9px]" /> Subir WFD
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept=".wfd,.json,.xml"
                                                onChange={(e) => handleWfdUpload(e, currentInstance.WorkflowId)}
                                            />
                                        </label>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => handleClearWfd(currentInstance.WorkflowId)}
                                            className="btn btn-xs btn-ghost text-rose-600 hover:bg-rose-50 gap-1 py-1"
                                            title="Limpar definição WFD importada"
                                        >
                                            <FaTrash className="text-[9px]" /> Limpar
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}
                    
                    {/* Diagram Display area in Modal */}
                    <div className="flex-1 min-h-0 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-inner relative">
                        {historyLoading ? (
                            <div className="flex flex-col justify-center items-center h-full gap-2">
                                <span className="loading loading-spinner loading-lg text-primary"></span>
                                <span className="text-xs text-slate-500 font-medium animate-pulse">Carregando diagrama...</span>
                            </div>
                        ) : showDiagramModal && mergedGraph ? (
                            <TimelineViewer 
                                nodes={mergedGraph.nodes} 
                                edges={mergedGraph.edges} 
                                height="h-full"
                            />
                        ) : (
                            <div className="flex flex-col justify-center items-center h-full text-slate-400 italic text-xs">
                                Nenhum diagrama encontrado. Envie o arquivo WFD correspondente.
                            </div>
                        )}
                    </div>
                    
                    <div className="modal-action shrink-0 mt-4 flex items-center justify-between w-full">
                        <div className="flex gap-2">
                            <button 
                                type="button"
                                className="btn btn-sm btn-outline btn-primary gap-1.5 font-bold"
                                onClick={() => {
                                    const shareUrl = `${window.location.origin}/workflow-diagram?fc=${selectedCabinet}&did=${selectedDoc?.Id}`;
                                    if (!navigator.clipboard) {
                                        // Fallback para HTTP (sem SSL)
                                        const textarea = document.createElement("textarea");
                                        textarea.value = shareUrl;
                                        textarea.style.position = "fixed";
                                        document.body.appendChild(textarea);
                                        textarea.focus();
                                        textarea.select();
                                        try {
                                            const successful = document.execCommand('copy');
                                            if (successful) {
                                                alert("Link do diagrama copiado para a área de transferência!");
                                            } else {
                                                alert("Não foi possível copiar o link.");
                                            }
                                        } catch (err) {
                                            alert("Não foi possível copiar o link.");
                                        }
                                        document.body.removeChild(textarea);
                                    } else {
                                        navigator.clipboard.writeText(shareUrl)
                                            .then(() => alert("Link do diagrama copiado para a área de transferência!"))
                                            .catch(() => alert("Não foi possível copiar o link."));
                                    }
                                }}
                            >
                                <FaRegCopy className="text-xs" /> Copiar link do diagrama
                            </button>
                            {docLink && docLink !== '#' && (
                                <a
                                    href={docLink}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="btn btn-sm btn-outline text-slate-700 hover:bg-slate-50 gap-1.5 font-bold"
                                >
                                    <FaExternalLinkAlt className="text-xs" /> Visualizar documento
                                </a>
                            )}
                        </div>
                        <button 
                            className="btn btn-sm font-semibold" 
                            onClick={() => {
                                setShowDiagramModal(false);
                                setIsDiagramMaximized(false);
                            }}
                            type="button"
                        >
                            Fechar
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default WorkflowHistoryPage;
